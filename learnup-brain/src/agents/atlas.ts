import { redis } from '../clients/redis.js'
import { supabase } from '../clients/supabase.js'
import { logger } from '../utils/logger.js'
import { routedChat, jsonCoz } from '../lib/model-router.js'
import { retrieveGrounding } from '../lib/rag.js'
import { effectiveMastery } from '../lib/mastery.js'
import { upsertBrief } from './katip.js'
import { enqueueTask, type AgentTask } from './bus.js'
import { ATLAS_SYSTEM, TeshisSemasi, type Taksonomi } from '../persona/atlas.charter.js'

/**
 * ATLAS — bilişsel haritacı (§2.2). Deterministik çekirdek lib/mastery.ts'te;
 * burası LLM tarafı: ÇELDİRİCİ ADLİ ANALİZİ (5 adım) + KAPANIŞ DOĞRULAMASI.
 * Tetik eşiği 2 tuzak isabeti (kalite modu — erken teşhis).
 *
 * Kurallar + taksonomi + çıktı şeması → persona/atlas.charter.ts (tek kaynak).
 */

export type Misconception = {
  id: string
  taxonomy: Taksonomi // ← charter'daki TAKSONOMI objesinden türer; prompt da aynı objeden
  selected_option: string
  evidence: string
  confidence: number
  prereq_hypothesis: string | null
  remediation: { review_kazanim: string | null; then_microset: { count: number; difficulty: string } }
  student_facing_hint: string
  status: 'open' | 'resolved' | 'persists'
  opened_at: string
  closed_at?: string
}

/** Cevap sonrası tetik kararı (answers.ts çağırır — izole, hızlı, LLM'siz). */
export async function onAnswer(p: {
  userId: string
  kazanimId: number
  correct: boolean
  selectedOption: string | null
}): Promise<void> {
  try {
    const { data: row } = await supabase
      .from('user_mastery')
      .select('misconceptions')
      .eq('user_id', p.userId)
      .eq('node_id', p.kazanimId)
      .maybeSingle()
    const list = (Array.isArray(row?.misconceptions) ? row!.misconceptions : []) as Misconception[]
    const open = list.find((m) => m.status === 'open')

    if (p.correct && open) {
      // Kapanış adayı: doğru cevap + açık yanılgı → doğrulamayı kuyruğa al (debounce'lu).
      await debouncedEnqueue(`lb:closure:${p.userId}:${p.kazanimId}`, {
        userId: p.userId, kind: 'closure_check', payload: { kazanimId: p.kazanimId },
      })
      return
    }
    if (!p.correct && p.selectedOption && !open) {
      // Tuzak sayacı: aynı (kazanım, şık) 2. isabette teşhis (kalite modu).
      const { count } = await supabase
        .from('user_logs')
        .select('id', { count: 'exact', head: true })
        .eq('student_id', p.userId)
        .eq('kazanim_id', p.kazanimId)
        .eq('selected_option', p.selectedOption)
        .eq('is_correct', false)
      if ((count ?? 0) >= 2) {
        await debouncedEnqueue(`lb:diagnose:${p.userId}:${p.kazanimId}`, {
          userId: p.userId, kind: 'diagnose',
          payload: { kazanimId: p.kazanimId, selectedOption: p.selectedOption },
        })
      }
    }
  } catch (err) {
    logger.warn({ err }, 'atlas.onAnswer atlandı (izole)')
  }
}

async function debouncedEnqueue(
  key: string,
  input: { userId: string; kind: 'diagnose' | 'closure_check'; payload: Record<string, unknown> },
): Promise<void> {
  if (redis) {
    const ok = await redis.set(key, '1', 'EX', 3600, 'NX')
    if (!ok) return // saat başına en fazla 1 aynı-tür görev
  }
  await enqueueTask(input)
}

/** `diagnose` işleyicisi — 5 adımlı premium teşhis boru hattı. */
export async function runDiagnose(task: AgentTask): Promise<unknown> {
  const kazanimId = Number(task.payload.kazanimId)
  const selectedOption = String(task.payload.selectedOption ?? '')
  const userId = task.userId

  // 1) KANIT PAKETİ (deterministik)
  const { data: node } = await supabase
    .from('curriculum_nodes')
    .select('id, code, title, subject, path, prereq_paths')
    .eq('id', kazanimId).single()
  if (!node) return { error: 'kazanım yok' }

  const { data: wrongs } = await supabase
    .from('user_logs')
    .select('question_id, selected_option, duration_ms, created_at')
    .eq('student_id', userId).eq('kazanim_id', kazanimId).eq('is_correct', false)
    .order('created_at', { ascending: false }).limit(5)

  // cevaplanabilir_sorular VIEW'i (0013): yanlış cevaplanan soru AI de olabilir çıkmış da —
  // teşhis ikisini de okuyabilmeli. Tek tablo sorgulasak öğrencinin çıkmış-soru hatası
  // ATLAS'ın gözünden kaçardı.
  const qIds = [...new Set((wrongs ?? []).map((w) => w.question_id).filter(Boolean))] as string[]
  const { data: qs } = qIds.length
    ? await supabase.from('cevaplanabilir_sorular')
        .select('id, question_text, options, correct_option, solution').in('id', qIds)
    : { data: [] as any[] }

  // Önkoşul ustalıkları (prereq_paths → node → user_mastery)
  let prereqInfo = ''
  if (Array.isArray(node.prereq_paths) && node.prereq_paths.length) {
    const { data: prereqNodes } = await supabase
      .from('curriculum_nodes').select('id, title, path').in('path', node.prereq_paths as string[])
    for (const pn of prereqNodes ?? []) {
      const { data: um } = await supabase
        .from('user_mastery').select('mastery, stability, updated_at')
        .eq('user_id', userId).eq('node_id', pn.id).maybeSingle()
      const mEff = um ? effectiveMastery(um.mastery, um.stability ?? 0, um.updated_at) : null
      prereqInfo += `- ${pn.title} (${pn.path}): m_eff=${mEff === null ? 'veri yok' : mEff.toFixed(2)}\n`
    }
  }
  const grounding = await retrieveGrounding({
    subject: node.subject, paths: [String(node.path)], query: node.title, k: 4,
  }).catch(() => [])

  // 2-3) r1 BAĞIMSIZ TEŞHİS → taksonomiye bağlı JSON
  const evidence =
    `KAZANIM: ${node.title} (${node.code ?? node.path})\nSIK SEÇİLEN YANLIŞ ŞIK: ${selectedOption}\n\n` +
    `YANLIŞ CEVAPLANAN SORULAR:\n${(qs ?? []).map((q: any, i: number) =>
      `[${i + 1}] ${q.question_text}\nŞıklar: ${JSON.stringify(q.options)}\nDoğru: ${q.correct_option}\nÇözüm: ${q.solution ?? '-'}`,
    ).join('\n\n') || '(soru metni bulunamadı — şık deseninden çıkarım yap)'}\n\n` +
    (prereqInfo ? `ÖNKOŞUL USTALIKLARI:\n${prereqInfo}\n` : '') +
    (grounding.length ? `MÜFREDAT KANITI:\n${grounding.map((g) => g.content).join('\n---\n')}` : '')

  const res = await routedChat('verify', {
    temperature: 0.2,
    // ⚠️ max_tokens DÜŞÜNMEYİ DE KAPSAR. `verify` zincirinin başı düşünen bir model
    // (deepseek-v4-pro) ve o token'lar çıktı bütçesinden yenir.
    // ÖLÇÜLDÜ: 2000 ile uzun (grounding'li) teşhis prompt'unda model bütçeyi düşünmeye harcayıp
    // geriye 82 KARAKTER bıraktı → finish_reason="length" → JSON yarım → teşhis hiç yazılmadı.
    // Kısa prompt'la çalışıyordu; o yüzden hata ancak GERÇEK veriyle ortaya çıktı.
    max_tokens: 6000,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: ATLAS_SYSTEM }, // → persona/atlas.charter.ts
      { role: 'user', content: evidence },
    ],
  }, { priority: 'P1' })

  // ⚠️ Eskiden `JSON.parse(content ?? '{}')` idi. `??` BOŞ STRING'İ yakalamaz ve yarım JSON'u
  // da kurtarmaz → ölçüldü: "JSON Parse error: Unexpected EOF", görev FAILED, öğrencinin
  // yanılgısı hiç teşhis edilmedi. jsonCoz fırlatmaz; teşhis üretilemezse zarifçe biter.
  const ham = res.choices[0]?.message?.content ?? ''
  const aday = jsonCoz<unknown>(ham)

  // ⚠️ SINIR DOĞRULAMASI. Eskiden `verdict.taxonomy as Misconception['taxonomy']` vardı — KÖR CAST.
  // `??` yalnız undefined'ı yakalar; model taksonomide OLMAYAN bir değer dönerse ("dikkatsizlik")
  // cast onu sessizce geçirir ve user_mastery.misconceptions'a YAZILIRDI. Taksonomiye bakan her
  // downstream mantık (brief, remediation, ileride switch) o satırda sessizce şaşırırdı.
  // Artık şema kapıdan geçmeyeni reddeder → görev DÜRÜSTÇE FAILED olur (worker onu FAILED yazar).
  const cozum = TeshisSemasi.safeParse(aday)
  if (!cozum.success) {
    logger.warn(
      {
        kazanimId,
        finish: res.choices[0]?.finish_reason,
        model: res.model,
        uzunluk: ham.length,
        ilk200: ham.slice(0, 200),
        ihlal: cozum.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).slice(0, 5),
      },
      'ATLAS: teşhis şemaya uymadı — reddedildi',
    )
    return { error: 'teşhis şemaya uymadı' }
  }
  const verdict = cozum.data

  // 4) YAZ + YANKILA
  const mis: Misconception = {
    id: verdict.misconception_id,
    taxonomy: verdict.taxonomy, // ← şema doğruladı; cast yok
    selected_option: selectedOption,
    evidence: verdict.evidence,
    confidence: verdict.confidence,
    prereq_hypothesis: verdict.prereq_hypothesis,
    remediation: verdict.remediation,
    student_facing_hint: verdict.student_facing_hint,
    status: 'open',
    opened_at: new Date().toISOString(),
  }
  const { data: row } = await supabase
    .from('user_mastery').select('misconceptions')
    .eq('user_id', userId).eq('node_id', kazanimId).maybeSingle()
  const list = (Array.isArray(row?.misconceptions) ? row!.misconceptions : []) as Misconception[]
  await supabase.from('user_mastery').upsert(
    { user_id: userId, node_id: kazanimId, misconceptions: [...list.filter((m) => m.id !== mis.id), mis] },
    { onConflict: 'user_id,node_id' },
  )
  await upsertBrief(
    userId, 'atlas',
    `Açık yanılgı: ${node.title} → ${mis.id} (${mis.taxonomy}, güven ${Math.round(mis.confidence * 100)}%). ` +
    `İpucu açısı: ${mis.student_facing_hint} ` +
    (mis.prereq_hypothesis ? `Önce önkoşul tekrarı öner: ${mis.remediation.review_kazanim ?? mis.prereq_hypothesis}.` : ''),
  )
  await enqueueTask({ userId, kind: 'plan', payload: { reason: `atlas: ${mis.id} remediation` } })
  logger.info({ userId, kazanimId, misconception: mis.id }, 'Atlas teşhis tamam')
  return { misconception: mis.id, taxonomy: mis.taxonomy, confidence: mis.confidence }
}

/** 5) KAPANIŞ DOĞRULAMASI — remediation sonrası 3/3 temiz mi? */
export async function runClosureCheck(task: AgentTask): Promise<unknown> {
  const kazanimId = Number(task.payload.kazanimId)
  const userId = task.userId

  const { data: row } = await supabase
    .from('user_mastery').select('misconceptions')
    .eq('user_id', userId).eq('node_id', kazanimId).maybeSingle()
  const list = (Array.isArray(row?.misconceptions) ? row!.misconceptions : []) as Misconception[]
  const open = list.find((m) => m.status === 'open')
  if (!open) return { skipped: 'açık yanılgı yok' }

  const { data: recent } = await supabase
    .from('user_logs')
    .select('is_correct, created_at')
    .eq('student_id', userId).eq('kazanim_id', kazanimId)
    .gt('created_at', open.opened_at)
    .order('created_at', { ascending: false }).limit(3)
  if ((recent ?? []).length < 3) return { pending: 'henüz 3 cevap yok' }

  const clean = (recent ?? []).every((r) => r.is_correct)
  open.status = clean ? 'resolved' : 'persists'
  open.closed_at = clean ? new Date().toISOString() : undefined
  await supabase.from('user_mastery').upsert(
    { user_id: userId, node_id: kazanimId, misconceptions: list },
    { onConflict: 'user_id,node_id' },
  )
  if (clean) {
    // Tarihçe saklanır — Kaptan "geçen hafta kırdığın tuzak" diyebilir.
    await upsertBrief(userId, 'atlas', `Yanılgı KAPANDI: ${open.id} — 3/3 temiz. Övgü fırsatı (kısa, somut).`)
    await enqueueTask({ userId, kind: 'nudge', payload: { kind: 'closure_praise', misconception: open.id } })
  } else {
    // Bir kademe derine in: önkoşulun önkoşulu — yeniden planla.
    await enqueueTask({ userId, kind: 'plan', payload: { reason: `atlas: ${open.id} persists — derin remediation` } })
  }
  return { status: open.status }
}
