import { redis } from '../clients/redis.js'
import { supabase } from '../clients/supabase.js'
import { logger } from '../utils/logger.js'
import { KATIP_OZET_SYSTEM, KATIP_KATLAMA_SYSTEM } from '../persona/katip.charter.js'
import { routedText, jsonCoz } from '../lib/model-router.js'
import { embed } from '../lib/rag.js'
import { invalidateDesk } from '../lib/desk.js'
import { lastSeenAt } from '../lib/signals.js'
import { enqueueTask, type AgentTask } from './bus.js'

/**
 * KÂTİP — hafıza yazıcısı (§2.5). Sıkıştırma + hatırlama altyapısı:
 *  - Oturum-sonu `compact`: istatistik (deterministik) + sohbet (FAST LLM) → ≤5 madde
 *    → session_summaries (+768d embedding = Kaptan'ın anı endeksi) → katip brief.
 *  - Gece katlama: son 7 günün özetleri → student_memory.semantic (kalıcı gerçekler).
 * Her brief ≤300 token hedefi; masa toplamı ≤1200.
 */

const ACTIVE_SET = 'lb:active:compact'
const IDLE_MIN_MS = 10 * 60_000  // oturum-sonu eşiği
const IDLE_MAX_MS = 60 * 60_000  // bu kadar eskiyse pencere kaçmış — yine de özetle

/** Cevap/sohbet aktivitesi olan kullanıcıyı tarama kümesine ekle (answers + chat çağırır). */
export async function markActive(userId: string): Promise<void> {
  if (!redis) return
  await redis.sadd(ACTIVE_SET, userId)
  await redis.expire(ACTIVE_SET, 2 * 86_400)
}

/** Zamanlayıcı taraması: 10-60 dk sessiz kalan aktif kullanıcılar için compact görevi bas. */
export async function compactSweep(): Promise<void> {
  if (!redis) return
  const users = await redis.smembers(ACTIVE_SET)
  const now = Date.now()
  for (const userId of users) {
    const seen = await lastSeenAt(userId)
    const idle = seen ? now - seen : Infinity
    if (idle < IDLE_MIN_MS) continue // hâlâ oturumda

    /**
     * ⚠️ SREM'İN DÖNÜŞÜ SAHİPLİK KANITIDIR — göz ardı edilemez.
     *
     * Bu tarama artık BİRDEN ÇOK worker'da koşabiliyor (docker-compose: worker + worker2)
     * ve turlar üst üste binebiliyor. SMEMBERS → SREM → enqueue sırasında dönüş değeri
     * atılırsa iki tarama aynı kullanıcıyı listede görür, ikisi de enqueue eder: bir oturum
     * için İKİ compact + İKİ affect görevi, yani iki kat LLM özeti.
     *
     * SREM atomiktir ve yalnız üyeyi GERÇEKTEN kaldırana 1 döner. Kaybeden tur sessizce
     * geçer. Ek kilit gerekmez — kümenin kendisi kilittir.
     */
    const alindi = await redis.srem(ACTIVE_SET, userId)
    if (alindi !== 1) continue // başka bir tarama bu kullanıcıyı üstlendi

    if (idle > IDLE_MAX_MS * 24) continue // çok bayat — özetlenecek taze şey yok
    await enqueueTask({ userId, kind: 'compact', payload: {} }).catch((err) =>
      logger.warn({ err, userId }, 'compact görevi kuyruğa alınamadı'),
    )
    // Oturum bitti → Nabız değerlendirmesi (heuristik sakin ise LLM harcamaz)
    await enqueueTask({ userId, kind: 'affect', payload: { source: 'session_end' } }).catch(() => {})
  }
}

/** `compact` görev işleyicisi — Atölye çağırır. */
export async function runCompact(task: AgentTask): Promise<unknown> {
  const userId = task.userId

  // Son özetten bu yana olan pencere
  const { data: lastSum } = await supabase
    .from('session_summaries')
    .select('created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const sinceIso = lastSum?.created_at ?? new Date(Date.now() - 86_400_000).toISOString()

  // 1) Deterministik oturum istatistikleri (user_logs)
  const { data: logs } = await supabase
    .from('user_logs')
    .select('subject, is_correct, is_skipped, time_spent, kazanim_id, selected_option')
    .eq('student_id', userId)
    .gte('created_at', sinceIso)
    .limit(300)
  const answered = (logs ?? []).filter((l) => !l.is_skipped)
  const correct = answered.filter((l) => l.is_correct).length
  const stats = {
    solved: answered.length,
    correct,
    accuracy: answered.length ? Math.round((correct / answered.length) * 100) : null,
    subjects: [...new Set(answered.map((l) => l.subject).filter(Boolean))],
  }

  // 2) Sohbet dökümü (varsa) → FAST LLM özeti; yoksa deterministik cümle
  const { data: msgs } = await supabase
    .from('chat_messages')
    .select('role, content')
    .eq('user_id', userId)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: true })
    .limit(60)

  if (!answered.length && !(msgs ?? []).length) return { skipped: 'özetlenecek aktivite yok' }

  let summary: string
  if ((msgs ?? []).length) {
    const transcript = (msgs ?? [])
      .map((m) => `${m.role === 'user' ? 'Öğrenci' : 'Kaptan'}: ${String(m.content).slice(0, 400)}`)
      .join('\n')
    summary = await routedText('fast', {
      temperature: 0.3,
      max_tokens: 350,
      messages: [
        { role: 'system', content: KATIP_OZET_SYSTEM }, // → persona/katip.charter.ts
        {
          role: 'user',
          content: `İSTATİSTİK: ${JSON.stringify(stats)}\n\nSOHBET:\n${transcript}`,
        },
      ],
    }, { priority: 'P1' })
  } else {
    summary = `- ${stats.solved} soru çözdü (${stats.accuracy ?? 0}% doğruluk) — ${stats.subjects.join(', ') || 'genel'}.`
  }

  // 3) Anı endeksi: özeti embed'le (izole — başarısızlık özeti düşürmez)
  let vector: number[] | null = null
  try {
    const [v] = await embed([summary.slice(0, 1500)])
    vector = v ?? null
  } catch (err) {
    logger.warn({ err }, 'özet embedding atlandı')
  }

  const { error: insErr } = await supabase.from('session_summaries').insert({
    user_id: userId,
    session_id: (task.payload?.sessionId as string) ?? null,
    summary,
    stats,
    embedding: vector,
  })
  if (insErr) throw insErr

  // 4) katip brief'i + masa tazeleme
  const brief = `Son oturum: ${stats.solved} soru, %${stats.accuracy ?? 0} doğruluk. ${summary.split('\n')[0] ?? ''}`
  await upsertBrief(userId, 'katip', brief.slice(0, 600))
  return { ok: true, solved: stats.solved }
}

/** Gece katlama: son 7 günün özetlerini kalıcı gerçeklere damıt (aktif kullanıcılar). */
export async function runNightlyFold(): Promise<void> {
  const since = new Date(Date.now() - 86_400_000).toISOString()
  const { data: recent } = await supabase
    .from('session_summaries')
    .select('user_id')
    .gte('created_at', since)
    .limit(200)
  const users = [...new Set((recent ?? []).map((r) => r.user_id as string))]

  for (const userId of users) {
    try {
      const weekIso = new Date(Date.now() - 7 * 86_400_000).toISOString()
      const { data: sums } = await supabase
        .from('session_summaries')
        .select('summary, created_at')
        .eq('user_id', userId)
        .gte('created_at', weekIso)
        .order('created_at', { ascending: true })
        .limit(30)
      const { data: mem } = await supabase
        .from('student_memory')
        .select('semantic')
        .eq('user_id', userId)
        .maybeSingle()

      const merged = await routedText('fast', {
        temperature: 0.2,
        max_tokens: 500,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: KATIP_KATLAMA_SYSTEM }, // → persona/katip.charter.ts
          {
            role: 'user',
            content: `MEVCUT: ${JSON.stringify(mem?.semantic ?? {})}\n\nHAFTALIK ÖZETLER:\n${(sums ?? [])
              .map((s) => `[${s.created_at.slice(0, 10)}] ${s.summary}`)
              .join('\n')}`,
          },
        ],
      }, { priority: 'P2' })

      // jsonCoz: Atlas/Nabız ile aynı savunma — boş/çitli/kısmi çıktıda FIRLATMAZ, null döner.
      // Katlama YIKICI: kalıcı hafızayı EZER. Bozuk ya da BOŞ bir yanıt öğrencinin semantik
      // gerçeklerini sessizce silmesin — şüphede MEVCUT korunur (charter: "emin değilsen tut").
      const semantic = jsonCoz<Record<string, unknown>>(merged)
      if (!semantic || Array.isArray(semantic) || !Object.keys(semantic).length) {
        logger.warn({ userId }, 'gece katlama: model geçerli semantic üretmedi — hafıza korundu')
        continue
      }
      await supabase.from('student_memory').upsert(
        { user_id: userId, semantic, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      )
      await invalidateDesk(userId)
    } catch (err) {
      logger.warn({ err, userId }, 'gece katlama başarısız — sıradaki kullanıcı')
    }
  }
}

/**
 * Ortak brief yazıcı — tüm uzmanlar bunu kullanır (tek ses: brief'ler yapısaldır).
 *
 * ⚠️ ESKİDEN KAYIP GÜNCELLEME VARDI: briefs okunur, bellekte birleştirilir, TÜM obje geri
 * yazılırdı. Dört uzman da (ATLAS, NABIZ, PUSULA, KÂTİP) bunu çağırıyor ve worker
 * eşzamanlılık 2 ile çalışıyor. İkisi aynı anda bitirirse ikisi de {} okur ve biri
 * ötekinin brief'ini EZER — Kaptan'ın masasına eksik uzman gider, üstelik sessizce.
 * Çok-ajanlı mimarinin kalbinde bir veri kaybıydı.
 * → Birleştirme artık DB'de (0012, brief_yaz): `||` satır kilidi altında, taze değer üzerinde.
 */
export async function upsertBrief(userId: string, agent: string, brief: string): Promise<void> {
  const { error } = await supabase.rpc('brief_yaz', {
    p_user_id: userId,
    p_agent: agent,
    p_brief: brief,
  })
  if (error) throw error
  await invalidateDesk(userId)
}
