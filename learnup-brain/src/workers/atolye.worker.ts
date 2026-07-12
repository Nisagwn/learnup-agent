import { env } from '../config/env.js'
import { redis } from '../clients/redis.js'
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

// ── BEKÇİ: tek basit iş (§5.2). Bayat RUNNING → PENDING + re-XADD; 3 deneme → FAILED. ──
async function janitor(): Promise<void> {
  const staleIso = new Date(Date.now() - 2 * 60_000).toISOString()

  const { data: stale } = await supabase
    .from('agent_tasks')
    .select('id, user_id, kind, payload, attempts')
    .eq('status', 'RUNNING')
    .lt('locked_at', staleIso)
    .limit(50)

  const { data: orphans } = await supabase
    .from('agent_tasks')
    .select('id, user_id, kind, payload, attempts')
    .eq('status', 'PENDING')
    .lt('created_at', staleIso)
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

async function processDelivered(delivered: DeliveredTask[]): Promise<void> {
  for (const { streamId, task } of delivered) {
    try {
      // CAS-claim: at-least-once teslimatta yalnız bir consumer işler.
      const claimed = await claimTask(task.id, CONSUMER)
      if (!claimed) {
        logger.debug({ taskId: task.id }, 'claim kaybedildi — teslimat düşürüldü')
        continue
      }
      await publishEvent(task.id, { status: 'RUNNING' })
      const result = await handleTask(task)
      await publishEvent(task.id, { status: 'COMPLETED', data: result })
      logger.info({ taskId: task.id, kind: task.kind }, 'görev tamamlandı')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'işleme hatası'
      logger.error({ err, taskId: task.id }, 'görev işlenemedi')
      await publishEvent(task.id, { status: 'FAILED', data: message })
    } finally {
      await ackTask(streamId)
    }
  }
}

async function main(): Promise<void> {
  if (!env.REDIS_URL || !redis) {
    logger.error('REDIS_URL tanımlı değil — Atölye worker başlatılamaz.')
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

function shutdown(sig: string): void {
  logger.info({ sig }, 'Atölye worker kapanıyor')
  running = false
  setTimeout(() => process.exit(0), 100)
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

main().catch((err: unknown) => {
  logger.error({ err }, 'Atölye worker ölümcül hata')
  process.exit(1)
})
