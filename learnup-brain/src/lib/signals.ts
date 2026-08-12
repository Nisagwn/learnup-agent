import { redis } from '../clients/redis.js'

/**
 * SİNYAL katmanı (algı) — THE-LEARNUP-MASTER-PLAN §1/§2.
 * Cevap-başına saf özellik çıkarımı + Redis rolling pencere. SIFIR LLM.
 * Ajanlar (Nabız, Atlas) bu pencereyi okur; burada karar VERİLMEZ.
 */

export type AnswerSignal = {
  t: number                    // epoch ms
  questionId: string | null
  kazanimId: number | null
  correct: boolean | null      // null = cevaplanmadı (ör. atlandı)
  skipped: boolean
  durationMs: number | null
  selectedOption: string | null // 'A'..'E'
}

const WINDOW = 20
const keyOf = (userId: string): string => `lb:signals:${userId}`
const LAST_SEEN_KEY = (userId: string): string => `lb:lastseen:${userId}`

/** Cevap sinyalini rolling-20 pencereye yaz (Redis yoksa sessiz no-op — PG hakikati taşır). */
export async function pushSignal(userId: string, sig: AnswerSignal): Promise<void> {
  if (!redis) return
  const key = keyOf(userId)
  await redis
    .multi()
    .lpush(key, JSON.stringify(sig))
    .ltrim(key, 0, WINDOW - 1)
    .expire(key, 86_400)
    .set(LAST_SEEN_KEY(userId), String(sig.t), 'EX', 86_400)
    .exec()
}

/** Pencereyi oku (en yeni → en eski). */
export async function readSignals(userId: string): Promise<AnswerSignal[]> {
  if (!redis) return []
  const raw = await redis.lrange(keyOf(userId), 0, WINDOW - 1)
  const out: AnswerSignal[] = []
  for (const item of raw) {
    try {
      out.push(JSON.parse(item) as AnswerSignal)
    } catch {
      /* bozuk kayıt atlanır */
    }
  }
  return out
}

/** Kullanıcının son cevap zamanı (Kâtip'in oturum-sonu debounce'u okur). */
export async function lastSeenAt(userId: string): Promise<number | null> {
  if (!redis) return null
  const v = await redis.get(LAST_SEEN_KEY(userId))
  return v ? Number(v) : null
}

/** Nabız'ın heuristik girdisi — pencereden türetilen oturum özellikleri (saf). */
export type SessionFeatures = {
  n: number
  errorRun: number          // pencere başından ardışık yanlış sayısı
  wrongRatio: number        // yanlış / cevaplanan
  latencyZ: number | null   // son cevabın süre z-skoru (pencere baz alınır)
  meanMs: number | null
  lateNight: boolean        // 23:00–05:00 arası aktivite
  rageQuitCandidate: boolean // son cevap yanlış + <30sn önce
}

export function computeSessionFeatures(signals: AnswerSignal[], now = Date.now()): SessionFeatures {
  const answered = signals.filter((s) => s.correct !== null && !s.skipped)
  const n = answered.length

  let errorRun = 0
  for (const s of answered) {
    if (s.correct === false) errorRun++
    else break
  }

  const wrong = answered.filter((s) => s.correct === false).length
  const durations = answered.map((s) => s.durationMs).filter((d): d is number => typeof d === 'number' && d > 0)
  const meanMs = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null

  let latencyZ: number | null = null
  if (meanMs !== null && durations.length >= 5) {
    const variance = durations.reduce((a, b) => a + (b - meanMs) ** 2, 0) / durations.length
    const sd = Math.sqrt(variance)
    const last = durations[0]
    if (sd > 0 && last !== undefined) latencyZ = (last - meanMs) / sd
  }

  const lastSig = signals[0]
  // ⚠️ SAAT ÖĞRENCİNİN SAATİ (Europe/Istanbul), sürecinki DEĞİL.
  // `getHours()` konteynerin yerel saatini okuyor, docker-compose'da TZ verilmediği için
  // de UTC dönüyordu. Yani `hour >= 23 || hour < 5` kuralı fiilen 02:00–08:00 TSİ aralığını
  // kapsıyordu: Nabız'ın "gece geç saat + yüksek hata" kuralı gerçek gece saatlerinde
  // (23:00–02:00) HİÇ ateşlenmiyor, sabah 05:00–08:00'de gereksiz ateşleniyordu.
  const hour = Number(
    new Date(lastSig?.t ?? now).toLocaleString('en-GB', {
      timeZone: 'Europe/Istanbul', hour: '2-digit', hour12: false,
    }),
  )

  return {
    n,
    errorRun,
    wrongRatio: n > 0 ? wrong / n : 0,
    latencyZ,
    meanMs,
    lateNight: hour >= 23 || hour < 5,
    rageQuitCandidate: lastSig?.correct === false && now - (lastSig?.t ?? 0) < 30_000,
  }
}
