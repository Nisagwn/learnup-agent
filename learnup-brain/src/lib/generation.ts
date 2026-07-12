import { supabase } from '../clients/supabase.js'
import { redis } from '../clients/redis.js'
import { TEMP } from './models.js'
import { routedChat, type LlmPriority } from './model-router.js'
import { retrieveGrounding, retrieveExemplars, type GroundingChunk, type Exemplar } from './rag.js'

// ─────────────────────────────────────────────────────────────────────────
// Dinamik Context Injection — modelin "sıfır beyinle" başlamasını engeller.
// Supabase (user_activities RPC'leri) + Redis (gün-içi durum) → kompakt bağlam bloğu.
// ─────────────────────────────────────────────────────────────────────────
export async function buildStudentContext(userId: string): Promise<string> {
  const [weakRes, trapsRes, ctxRaw] = await Promise.all([
    supabase.rpc('weak_kazanimlar', { p_user_id: userId, p_limit: 4 }),
    supabase.rpc('distractor_traps', { p_user_id: userId, p_limit: 5 }),
    redis ? redis.get(`user:${userId}:context`) : Promise.resolve(null),
  ])

  const weak = (weakRes.data ?? []) as Array<{ subject: string; title: string; wrong_rate: number }>
  const traps = (trapsRes.data ?? []) as Array<{
    kazanim_id: number
    selected_option: string
    miss_count: number
  }>
  const daily = ctxRaw ? (JSON.parse(ctxRaw) as { energy?: string; prefer?: string }) : {}

  const weakLines = weak
    .map((w) => `- ${w.subject}/${w.title}: hata %${Math.round(w.wrong_rate * 100)}`)
    .join('\n')
  const trapLines = traps
    .map((t) => `- kazanım#${t.kazanim_id} en sık YANLIŞ şık: ${t.selected_option} (${t.miss_count}×)`)
    .join('\n')

  // KOMPAKT tut: cache_control yok, uzun bağlam maliyeti artırır.
  return [
    '### ÖĞRENCİ BAĞLAMI (kişiselleştirme — soruyu buna göre hedefle)',
    weakLines ? `Zayıf kazanımlar:\n${weakLines}` : 'Zayıf kazanım verisi yok.',
    trapLines ? `Sık düşülen çeldiriciler:\n${trapLines}` : '',
    daily.energy ? `Günlük durum: enerji=${daily.energy}, tercih=${daily.prefer ?? '-'}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

// ─────────────────────────────────────────────────────────────────────────
// System Instructions (ÖSYM felsefesi + çeldirici taksonomisi) + tagged parse
// ─────────────────────────────────────────────────────────────────────────
const OSYM_SYSTEM = `Sen ÖSYM (TYT-AYT) üslubunda soru yazan uzman bir ölçme-değerlendirme editörüsün.
KURALLAR:
- SADECE verilen "BİLGİ BAĞLAMI" ve belirtilen kazanımla sınırlı kal; müfredat/kazanım dışına ASLA çıkma.
- ÖSYM formatı: 5 şık (A-E), TEK doğru cevap.
- Her çeldirici SPESİFİK bir yanılgıyı hedefler: işlem hatası | kavram yanılgısı | birim/işaret | eksik-adım | yakın-değer tuzağı. Rastgele yanlış ÜRETME.
- "STİL ÖRNEKLERİ"nin dilini/kurgusunu/zorluğunu taklit et; KOPYALAMA — sıfırdan özgün üret.
- "ÖĞRENCİ BAĞLAMI" varsa: öğrencinin zayıf kazanımını ve sık düştüğü çeldirici tipini hedefle.
- Ezber/tanım değil; muhakeme/uygulama sorusu.
ÇIKTI SÖZLEŞMESİ (LaTeX korunur, her soru tam bu etiketlerle):
[SORU] ...
[A] ...
[B] ...
[C] ...
[D] ...
[E] ...
[DOGRU] <A-E>
[COZUM] ...
[KAZANIM] <kod>
[ZORLUK] <kolay|orta|zor>`

export type TaggedQuestion = {
  soru: string
  siklar: Record<'A' | 'B' | 'C' | 'D' | 'E', string>
  dogru: string
  cozum: string
  kazanim: string
  zorluk: string
}

export function parseTagged(text: string): TaggedQuestion[] {
  const out: TaggedQuestion[] = []
  let cur: TaggedQuestion | null = null
  let lastField: 'soru' | 'cozum' | null = null
  let lastSik: 'A' | 'B' | 'C' | 'D' | 'E' | null = null

  const isComplete = (q: TaggedQuestion): boolean =>
    !!q.soru && (['A', 'B', 'C', 'D', 'E'] as const).every((l) => !!q.siklar[l]) && 'ABCDE'.includes(q.dogru)
  const commit = (): void => {
    if (cur && isComplete(cur)) out.push(cur)
  }

  for (const raw of text.split(/\r?\n/)) {
    const m = raw.match(/^\s*\[(SORU|[A-E]|DOGRU|COZUM|KAZANIM|ZORLUK)\]\s*(.*)$/)
    if (m) {
      const tag = m[1] as 'SORU' | 'A' | 'B' | 'C' | 'D' | 'E' | 'DOGRU' | 'COZUM' | 'KAZANIM' | 'ZORLUK'
      const val = (m[2] ?? '').trim()
      lastField = null
      lastSik = null
      if (tag === 'SORU') {
        commit()
        cur = {
          soru: val,
          siklar: { A: '', B: '', C: '', D: '', E: '' },
          dogru: '',
          cozum: '',
          kazanim: '',
          zorluk: '',
        }
        lastField = 'soru'
      } else if (!cur) {
        continue
      } else if (tag === 'A' || tag === 'B' || tag === 'C' || tag === 'D' || tag === 'E') {
        cur.siklar[tag] = val
        lastSik = tag
      } else if (tag === 'DOGRU') {
        cur.dogru = val.charAt(0).toUpperCase()
      } else if (tag === 'COZUM') {
        cur.cozum = val
        lastField = 'cozum'
      } else if (tag === 'KAZANIM') {
        cur.kazanim = val
      } else {
        cur.zorluk = val
      }
    } else if (cur && raw.trim()) {
      // Çok satırlı içerik: son etiketin devamı.
      if (lastSik) cur.siklar[lastSik] += ' ' + raw.trim()
      else if (lastField) cur[lastField] += ' ' + raw.trim()
    }
  }
  commit()
  return out
}

// ─────────────────────────────────────────────────────────────────────────
// Üretim (deepseek-chat) + Bağımsız doğrulama (deepseek-r1 reasoner, JSON mode)
// ─────────────────────────────────────────────────────────────────────────
export type GenSpec = {
  userId: string
  subject: string
  paths: string[] // ltree ön-ekleri (retrieval filtresi)
  kazanim: string // kazanım kodu (prompt için)
  topic: string
  difficulty: string
}

export type Verdict = {
  solvedAnswer: string
  matchesMarked: boolean
  singleCorrect: boolean
  curriculumBound: boolean
  osymStyleScore: number
  verdict: 'ACCEPT' | 'REPAIR' | 'REJECT'
  critique: string
}

export async function generateQuestions(a: {
  userId: string
  subject: string
  kazanim: string
  topic: string
  difficulty: string
  count: number
  grounding: GroundingChunk[]
  exemplars: Exemplar[]
  priority?: LlmPriority
}): Promise<TaggedQuestion[]> {
  const studentCtx = await buildStudentContext(a.userId) // ← Context Injection
  const grounding = a.grounding
    .map((g, i) => `[BAĞLAM ${i + 1}] ${g.context ?? ''}\n${g.content}`)
    .join('\n\n')
  const style = a.exemplars
    .map(
      (e, i) =>
        `[ÖRNEK ${i + 1}] ${e.question_text}\nŞıklar: ${JSON.stringify(e.options)}\nDoğru: ${e.correct_option}\nÇözüm: ${e.solution}`,
    )
    .join('\n\n')

  const res = await routedChat('generate', {
    temperature: TEMP.CREATIVE,
    max_tokens: 8000,
    messages: [
      { role: 'system', content: OSYM_SYSTEM }, // stabil → prefix (DeepSeek auto-cache adayı)
      {
        role: 'user',
        content:
          `${studentCtx}\n\n### STİL ÖRNEKLERİ (${a.subject}/${a.topic}/${a.difficulty})\n${style}\n\n` +
          `### BİLGİ BAĞLAMI (kazanım ${a.kazanim})\n${grounding}\n\n` +
          `### GÖREV\nBu kazanım/bağlamla SINIRLI, ${a.difficulty} zorlukta ${a.count} özgün ÖSYM sorusu üret. Çıktı sözleşmesine birebir uy.`,
      },
    ],
  }, { priority: a.priority ?? 'P1' })
  return parseTagged(res.choices[0]?.message.content ?? '')
}

export async function verifyQuestion(
  q: TaggedQuestion,
  grounding: GroundingChunk[],
  priority: LlmPriority = 'P1',
): Promise<Verdict> {
  const render =
    `[SORU] ${q.soru}\n` +
    (['A', 'B', 'C', 'D', 'E'] as const).map((l) => `[${l}] ${q.siklar[l]}`).join('\n') +
    `\n[İŞARETLİ] ${q.dogru}`
  const evidence = grounding.map((g) => g.content).join('\n---\n')

  const res = await routedChat('verify', {
    temperature: TEMP.STRICT,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'Sen titiz, BAĞIMSIZ bir sınav denetçisisin. Soruyu sıfırdan kendin çöz; üreticinin işaretine güvenme. Yalnız geçerli JSON döndür.',
      },
      {
        role: 'user',
        content:
          `SORU:\n${render}\n\nMÜFREDAT KANITI:\n${evidence}\n\n` +
          `Şu şemada JSON döndür: {"solvedAnswer":"A-E","matchesMarked":true|false,"singleCorrect":true|false,"curriculumBound":true|false,"osymStyleScore":1..5,"verdict":"ACCEPT|REPAIR|REJECT","critique":"..."}`,
      },
    ],
  }, { priority })
  return JSON.parse(res.choices[0]?.message.content ?? '{}') as Verdict
}

async function repairQuestion(
  q: TaggedQuestion,
  critique: string,
  grounding: GroundingChunk[],
  priority: LlmPriority = 'P1',
): Promise<TaggedQuestion> {
  const render =
    `[SORU] ${q.soru}\n` +
    (['A', 'B', 'C', 'D', 'E'] as const).map((l) => `[${l}] ${q.siklar[l]}`).join('\n') +
    `\n[DOGRU] ${q.dogru}`
  const res = await routedChat('generate', {
    temperature: TEMP.DERIVE,
    max_tokens: 4000,
    messages: [
      { role: 'system', content: OSYM_SYSTEM },
      {
        role: 'user',
        content: `Aşağıdaki soruyu denetçi eleştirisine göre DÜZELT (çıktı sözleşmesine uy):\n\nSORU:\n${render}\n\nELEŞTİRİ:\n${critique}\n\nMÜFREDAT:\n${grounding.map((g) => g.content).join('\n')}`,
      },
    ],
  }, { priority })
  return parseTagged(res.choices[0]?.message.content ?? '')[0] ?? q
}

const isAccepted = (v: Verdict): boolean =>
  v.verdict === 'ACCEPT' &&
  v.matchesMarked &&
  v.singleCorrect &&
  v.curriculumBound &&
  v.osymStyleScore >= 4

/**
 * GENERATE → bağımsız VERIFY → REPAIR (≤1) → TOP-UP (≤3 tur) do-loop.
 * Yalnız tüm kapıları geçen sorular döner (havuza `verified:true` olarak yazılır).
 */
export async function generateVerifiedSet(
  spec: GenSpec,
  targetCount: number,
  priority: LlmPriority = 'P1', // canlı top-up P1 · gece demirhanesi P2
): Promise<Array<TaggedQuestion & { quality: number }>> {
  const accepted: Array<TaggedQuestion & { quality: number }> = []

  for (let round = 0; accepted.length < targetCount && round < 3; round++) {
    const need = targetCount - accepted.length
    const query = `${spec.subject} ${spec.topic} ${spec.kazanim} ${spec.difficulty}`
    const grounding = await retrieveGrounding({ subject: spec.subject, paths: spec.paths, query })
    const exemplars = await retrieveExemplars({
      subject: spec.subject,
      topic: spec.topic,
      difficulty: spec.difficulty,
      query,
    })
    const candidates = await generateQuestions({ ...spec, count: need + 2, grounding, exemplars, priority })

    for (const q of candidates) {
      if (accepted.length >= targetCount) break
      const v = await verifyQuestion(q, grounding, priority)
      if (isAccepted(v)) {
        accepted.push({ ...q, quality: v.osymStyleScore })
        continue
      }
      if (v.verdict === 'REPAIR') {
        const repaired = await repairQuestion(q, v.critique, grounding, priority)
        const v2 = await verifyQuestion(repaired, grounding, priority)
        if (isAccepted(v2)) accepted.push({ ...repaired, quality: v2.osymStyleScore })
      }
    }
  }

  return accepted.slice(0, targetCount)
}
