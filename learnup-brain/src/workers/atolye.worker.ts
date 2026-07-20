import { env } from '../config/env.js'
import { redis, redisBlocking, redisReady } from '../clients/redis.js'
import { supabase } from '../clients/supabase.js'
import {
  ensureConsumerGroup,
  readTasks,
  ackTask,
  claimTask,
  publishEvent,
  consumerName,
  TASKS_STREAM,
  type DeliveredTask,
  type AgentTask,
} from '../agents/bus.js'
import { handleTask } from '../agents/ritim.js'
import { compactSweep, runNightlyFold } from '../agents/katip.js'
import { runNightlyForge } from '../jobs/topup-planner.js'
import { logger } from '../utils/logger.js'

/**
 * ATÖLYE worker (§5.1) — ayrı process. Ritim worker'ının evrimi:
 *  - `lb:tasks` consumer'ı (XREADGROUP BLOCK) + CAS-claim (çift işleme koruması)
 *  - Gömülü zamanlayıcı: BEKÇİ (5 dk — bayat görev toparlama) + gece demirhanesi (02–06 TSİ)
 *  - Redis leader lock: N worker olsa da tam 1 zamanlayıcı çalışır
 */
const CONSUMER = consumerName()
const SCHEDULER_LOCK = 'lb:lock:scheduler'
let running = true

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/**
 * BEKÇİ (§5.2): bayat RUNNING → PENDING + re-XADD; 3 deneme → FAILED.
 *
 * ⚠️ BAYATLIK PENCERESİ, EN UZUN GÖREVDEN UZUN OLMAK ZORUNDA.
 * Eskiden 2 dk idi. Ama tek bir forge_topup görevi meşru olarak ÇOK daha uzun sürüyor:
 * generateVerifiedSet 3 tura kadar döner ve her tur 1 üretim (timeout 150 sn) + aday başına
 * bağımsız doğrulama (her biri 120 sn'ye kadar) + onarım içerir. Yani gerçek üst sınır
 * dakikalarca. Sonuç: worker A hâlâ üretirken bekçi görevi "takılmış" sanıp PENDING yapıyor
 * ve yeniden kuyruğa atıyordu; worker B aynı görevi baştan işliyordu → AYNI iş iki kez
 * yapılıyor, LLM faturası iki katına çıkıyor, iki batch de aynı havuza yazılmaya çalışıyor.
 * PENDING kuyruk gecikmesi ise ayrı bir şey: orada 2 dk makul (worker ölmüşse hızlı kurtar).
 */
const RUNNING_BAYAT_MS = 15 * 60_000 // en uzun görevden (dakikalar) rahat uzun
const PENDING_BAYAT_MS = 2 * 60_000  // kuyrukta bekleyen: worker düşmüşse hızlı kurtar

async function janitor(): Promise<void> {
  const runningIso = new Date(Date.now() - RUNNING_BAYAT_MS).toISOString()
  const pendingIso = new Date(Date.now() - PENDING_BAYAT_MS).toISOString()

  const { data: stale } = await supabase
    .from('agent_tasks')
    .select('id, user_id, kind, payload, attempts')
    .eq('status', 'RUNNING')
    .lt('locked_at', runningIso)
    .limit(50)

  const { data: orphans } = await supabase
    .from('agent_tasks')
    .select('id, user_id, kind, payload, attempts')
    .eq('status', 'PENDING')
    .lt('created_at', pendingIso)
    .limit(50)

  for (const row of [...(stale ?? []), ...(orphans ?? [])]) {
    if ((row.attempts ?? 0) >= 3) {
      await supabase.from('agent_tasks')
        .update({ status: 'FAILED', error: 'bekçi: 3 deneme aşıldı' }).eq('id', row.id)
      logger.warn({ taskId: row.id, kind: row.kind }, 'bekçi: görev FAILED (3 deneme)')
      continue
    }
    await supabase.from('agent_tasks')
      .update({ status: 'PENDING', locked_by: null, locked_at: null }).eq('id', row.id)
    if (redis) {
      const task: AgentTask = {
        id: row.id, userId: row.user_id, kind: row.kind, payload: row.payload ?? {},
      }
      await redis.call('XADD', TASKS_STREAM, 'MAXLEN', '~', 10_000, '*', 'task', JSON.stringify(task))
      logger.info({ taskId: row.id, kind: row.kind }, 'bekçi: görev yeniden kuyruğa alındı')
    }
  }
}

// ── Zamanlayıcı (leader-lock'lu): bekçi 5 dk · gece demirhanesi 02–06 TSİ ──
let lastForgeDay = ''
async function schedulerTick(): Promise<void> {
  if (redis) {
    // Leader lock: SET NX PX 90s — kazanamayan worker bu turu atlar.
    const ok = await redis.set(SCHEDULER_LOCK, CONSUMER, 'PX', 90_000, 'NX')
    const holder = ok ? CONSUMER : await redis.get(SCHEDULER_LOCK)
    if (holder !== CONSUMER) return
    await redis.set(SCHEDULER_LOCK, CONSUMER, 'PX', 90_000) // yenile
  }

  await janitor().catch((err) => logger.error({ err }, 'bekçi hatası'))
  // Kâtip taraması: 10+ dk sessizleşen kullanıcılar için oturum-sonu compact görevi.
  await compactSweep().catch((err) => logger.error({ err }, 'compact taraması hatası'))

  // Gece penceresi (Europe/Istanbul 02:00–06:00, günde bir): demirhane + hafıza katlama.
  const nowTr = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }))
  const hour = nowTr.getHours()
  const day = nowTr.toISOString().slice(0, 10)
  if (hour >= 2 && hour < 6 && lastForgeDay !== day) {
    lastForgeDay = day
    logger.info({ day }, 'gece işleri başlıyor (demirhane + katlama)')
    await runNightlyForge().catch((err) => logger.error({ err }, 'gece demirhanesi hatası'))
    await runNightlyFold().catch((err) => logger.error({ err }, 'gece katlama hatası'))
  }
}

/** Uçuştaki görev sayısı — zarif kapanış bunun sıfırlanmasını bekler. */
let inFlight = 0

async function processDelivered(delivered: DeliveredTask[]): Promise<void> {
  for (const { streamId, task } of delivered) {
    inFlight++
    try {
      // CAS-claim: at-least-once teslimatta yalnız bir consumer işler.
      const claimed = await claimTask(task.id, CONSUMER)
      if (!claimed) {
        logger.debug({ taskId: task.id }, 'claim kaybedildi — teslimat düşürüldü')
        continue
      }
      await publishEvent(task.id, { status: 'RUNNING' })
      const result = await handleTask(task)

      // ⚠️ DÜRÜST MUHASEBE: handleTask fırlatmadan `{error: …}` döndürebiliyor (ör. ATLAS
      // teşhis üretemeyince). Eskiden bu da COMPLETED yazılıyordu — yani İŞİ YAPMAMIŞ bir görev
      // "tamamlandı" diyordu. Panoda her şey yeşil görünürken ajan hiçbir şey üretmemiş oluyordu.
      const hata = (result as { error?: unknown } | null)?.error
      if (hata) {
        await publishEvent(task.id, { status: 'FAILED', data: String(hata) })
        logger.warn({ taskId: task.id, kind: task.kind, hata }, 'görev iş üretemedi → FAILED')
      } else {
        await publishEvent(task.id, { status: 'COMPLETED', data: result })
        logger.info({ taskId: task.id, kind: task.kind }, 'görev tamamlandı')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'işleme hatası'
      logger.error({ err, taskId: task.id }, 'görev işlenemedi')
      // publishEvent Redis'e yazar; o da patlarsa görevi kaybetme — sadece logla.
      await publishEvent(task.id, { status: 'FAILED', data: message }).catch(() => {})
    } finally {
      await ackTask(streamId).catch((err: unknown) =>
        logger.warn({ err, streamId }, 'ACK başarısız — kayıt pending listesinde kalır'),
      )
      inFlight--
    }
  }
}

async function main(): Promise<void> {
  if (!env.REDIS_URL || !redis) {
    logger.error('REDIS_URL tanımlı değil — Atölye worker başlatılamaz.')
    process.exit(1)
  }

  // ⚠️ BAĞLANTININ HAZIR OLMASINI BEKLE. Hot-path client enableOfflineQueue:false ile çalışıyor
  // (istek yolu Redis yüzünden ASILI KALMASIN diye). Bunun bedeli: soket hazır değilken komut
  // beklemez, REDDEDİLİR. Worker açılışta hemen XGROUP CREATE çağırıyordu ve bağlantı henüz
  // kurulmadığı için ilk saniyede ölüyordu. İstek yolu "reddeder", worker "bekler".
  if (!(await redisReady())) {
    logger.error('Redis 10 sn içinde hazır olmadı — Atölye worker başlatılamıyor.')
    process.exit(1)
  }

  await ensureConsumerGroup()
  logger.info({ consumer: CONSUMER }, 'Atölye worker başladı — görev bekleniyor')

  // Zamanlayıcı: 60 sn'lik tick (bekçi kendi 5 dk ritmini tick sayacıyla tutar)
  let tick = 0
  const timer = setInterval(() => {
    tick++
    if (tick % 5 === 0 || tick === 1) void schedulerTick()
  }, 60_000)
  timer.unref()
  void schedulerTick() // açılışta bir kez (bayat görev varsa hemen toparla)

  while (running) {
    const delivered = await readTasks(CONSUMER, 10, 5000).catch(async (err: unknown) => {
      logger.error({ err }, 'readTasks hata — 1s bekleme')
      await sleep(1000)
      return [] as DeliveredTask[]
    })
    await processDelivered(delivered)
  }
}

/**
 * ZARİF KAPANIŞ.
 *
 * ⚠️ Eskiden: `running = false; setTimeout(() => process.exit(0), 100)` — SIGTERM'den
 * 100 MİLİSANİYE sonra süreç öldürülüyordu. Ama o an worker büyük ihtimalle handleTask'ın
 * İÇİNDEDİR ve bir forge_topup görevi meşru olarak DAKİKALARCA sürer (ölçüldü: 100 sn).
 * Sonuç: her deploy'da yarım kalan üretim çöpe gidiyor, stream kaydı XACK'lenmiyor,
 * görev RUNNING'de asılı kalıp bekçinin toparlamasını bekliyordu → iş İKİ KEZ ödeniyordu.
 * → Artık uçuştaki görevin bitmesi beklenir (tavanla); yeni görev alınmaz.
 */
const KAPANIS_TAVANI_MS = 3 * 60_000

async function shutdown(sig: string): Promise<void> {
  logger.info({ sig, inFlight }, 'Atölye worker kapanıyor — uçuştaki görev bekleniyor')
  running = false // yeni görev ALINMAZ (readTasks döngüsü sonlanır)

  const bitis = Date.now() + KAPANIS_TAVANI_MS
  while (inFlight > 0 && Date.now() < bitis) await sleep(500)
  if (inFlight > 0) {
    logger.warn({ inFlight }, 'kapanış tavanı doldu — görev yarım kaldı (bekçi toparlayacak)')
  }
  await Promise.allSettled([redis?.quit(), redisBlocking?.quit()])
  process.exit(0)
}
process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))

// Yakalanmamış reddediş → Bun/Node varsayılanı SÜRECİ ÖLDÜRÜR. Worker'ın tek bir Redis
// tökezlemesi yüzünden crash-loop'a girmesi, görevleri sürekli yeniden işletmek demektir.
process.on('unhandledRejection', (err) => {
  logger.error({ err }, 'yakalanmamış reddediş — worker ayakta kalıyor')
})

main().catch((err: unknown) => {
  logger.error({ err }, 'Atölye worker ölümcül hata')
  process.exit(1)
})
