import { randomUUID } from 'node:crypto'
import { hostname } from 'node:os'
import { redis, requireRedis, redisBlocking } from '../clients/redis.js'
import { supabase } from '../clients/supabase.js'
import { logger } from '../utils/logger.js'

/**
 * Ajan görev veriyolu — Redis Streams (hot-path sinyal) + Supabase `agent_tasks` (kalıcı hakikat).
 *  - Pusula/dispatch → `enqueueTask` / `delegateAndAwait` ile görev basar.
 *  - Ritim worker → `readTasks` (XREADGROUP BLOCK) ile tüketir, `publishEvent` ile sonuç yayınlar.
 *
 * Stream komutları `.call()` ile çağrılır: NodeNext + strict altında ioredis'in aşırı-yüklü
 * (overloaded) tip imzalarına takılmadan düşük seviye RESP yanıtını `unknown` alıp güvenle parse ederiz.
 */

export const TASKS_STREAM = 'lb:tasks'
export const CONSUMER_GROUP = 'atolye'
const EVENTS_TTL_SEC = 3600

/** Atölye görev türleri (§2/§5.2). Eski 'topup'/'session' alias olarak korunur. */
export type TaskKind =
  | 'topup' | 'session' | 'roadmap'                       // legacy
  | 'forge_topup' | 'plan' | 'diagnose' | 'affect' | 'compact' | 'nudge' | 'closure_check'
export type TaskStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED'

export type AgentTask = {
  id: string
  userId: string
  kind: TaskKind
  payload: Record<string, unknown>
}

export type AgentEvent = {
  status: TaskStatus | 'PROGRESS'
  data?: unknown
}

export type DeliveredTask = { streamId: string; task: AgentTask }

type RawEntry = [id: string, fields: string[]]
type RawStream = [key: string, entries: RawEntry[]]

const eventsKey = (taskId: string): string => `agent:events:${taskId}`

/** Düz `[field, value, field, value, ...]` dizisinden bir alanın değerini çeker. */
function fieldValue(fields: string[], key: string): string | null {
  for (let i = 0; i + 1 < fields.length; i += 2) {
    if (fields[i] === key) return fields[i + 1] ?? null
  }
  return null
}

/**
 * Redis'siz zarif düşüş (§5.1): görev PG'ye her koşulda yazılır; Redis yoksa
 * in-process (eşzamanlılık 2) kuyruğunda çalıştırılır. Handler'ı worker enjekte
 * eder (API sürecinde bus → ritim döngüsel importu olmasın diye).
 */
type InprocHandler = (task: AgentTask) => Promise<unknown>
let inprocHandler: InprocHandler | null = null
let inprocActive = 0
const inprocQueue: AgentTask[] = []

export function setInprocHandler(h: InprocHandler): void {
  inprocHandler = h
}

function pumpInproc(): void {
  while (inprocActive < 2 && inprocQueue.length > 0 && inprocHandler) {
    const task = inprocQueue.shift()!
    inprocActive++
    void (async () => {
      try {
        await publishEvent(task.id, { status: 'RUNNING' })
        const result = await inprocHandler!(task)
        await publishEvent(task.id, { status: 'COMPLETED', data: result })
      } catch (err) {
        await publishEvent(task.id, {
          status: 'FAILED',
          data: err instanceof Error ? err.message : 'işleme hatası',
        }).catch(() => {})
      } finally {
        inprocActive--
        pumpInproc()
      }
    })()
  }
}

/** Görevi kalıcılaştır (Postgres = hakikat) + hot-path'e bas (Redis Stream | in-process fallback). */
export async function enqueueTask(input: {
  userId: string
  kind: TaskKind
  payload: Record<string, unknown>
}): Promise<AgentTask> {
  const task: AgentTask = {
    id: randomUUID(),
    userId: input.userId,
    kind: input.kind,
    payload: input.payload,
  }

  const { error } = await supabase.from('agent_tasks').insert({
    id: task.id,
    user_id: task.userId,
    kind: task.kind,
    payload: task.payload,
    status: 'PENDING',
  })
  if (error) throw error

  if (redis) {
    await redis.call('XADD', TASKS_STREAM, 'MAXLEN', '~', 10_000, '*', 'task', JSON.stringify(task))
  } else if (inprocHandler) {
    inprocQueue.push(task)
    pumpInproc()
  } else {
    logger.warn({ taskId: task.id }, 'Redis yok + in-process handler yok — görev PG\'de PENDING bekliyor')
  }
  logger.debug({ taskId: task.id, kind: task.kind }, 'görev kuyruğa alındı')
  return task
}

/**
 * CAS-claim (§5.2): at-least-once teslimatta çift işlemeyi önler.
 * PENDING → RUNNING geçişini yalnız BİR consumer kazanır; bayat RUNNING (>2dk,
 * bekçi penceresi) yeniden claim edilebilir. Kazanamayan teslimat ACK'lenip düşürülür.
 */
export async function claimTask(taskId: string, consumer: string): Promise<boolean> {
  const staleBefore = new Date(Date.now() - 2 * 60_000).toISOString()
  const { data, error } = await supabase
    .from('agent_tasks')
    .update({ status: 'RUNNING', locked_by: consumer, locked_at: new Date().toISOString() })
    .eq('id', taskId)
    .or(`status.eq.PENDING,and(status.eq.RUNNING,locked_at.lt.${staleBefore})`)
    .select('id, attempts')
    .maybeSingle()
  if (error) {
    // Kilit kolonları yoksa (0004 öncesi) claim'i kabul say — davranış eskisi gibi.
    logger.warn({ err: error, taskId }, 'claimTask CAS başarısız — legacy kabul')
    return true
  }
  if (!data) return false
  await supabase.from('agent_tasks').update({ attempts: (data.attempts ?? 0) + 1 }).eq('id', taskId)
  return true
}

export const consumerName = (): string => `w-${hostname()}-${process.pid}`

/** Consumer grubunu idempotent kurar (worker açılışında). */
export async function ensureConsumerGroup(): Promise<void> {
  try {
    await requireRedis().call('XGROUP', 'CREATE', TASKS_STREAM, CONSUMER_GROUP, '$', 'MKSTREAM')
    logger.info({ stream: TASKS_STREAM, group: CONSUMER_GROUP }, 'consumer grubu oluşturuldu')
  } catch (err) {
    if (err instanceof Error && err.message.includes('BUSYGROUP')) return // grup zaten var → idempotent
    throw err
  }
}

/** Worker: bloklu tüketim (ayrı socket ŞART → redisBlocking). */
export async function readTasks(consumer: string, count = 10, blockMs = 5000): Promise<DeliveredTask[]> {
  if (!redisBlocking) throw new Error('redisBlocking yok — REDIS_URL gerekli')
  const res = (await redisBlocking.call(
    'XREADGROUP',
    'GROUP',
    CONSUMER_GROUP,
    consumer,
    'COUNT',
    count,
    'BLOCK',
    blockMs,
    'STREAMS',
    TASKS_STREAM,
    '>',
  )) as RawStream[] | null
  if (!res) return []

  const out: DeliveredTask[] = []
  for (const [, entries] of res) {
    for (const [streamId, fields] of entries) {
      const raw = fieldValue(fields, 'task')
      let task: AgentTask | null = null
      if (raw) {
        try {
          task = JSON.parse(raw) as AgentTask
        } catch {
          task = null
        }
      }
      if (task) out.push({ streamId, task })
      else {
        logger.warn({ streamId }, 'çözümlenemeyen görev — ACK ile atlanıyor')
        await ackTask(streamId)
      }
    }
  }
  return out
}

export async function ackTask(streamId: string): Promise<void> {
  await requireRedis().call('XACK', TASKS_STREAM, CONSUMER_GROUP, streamId)
}

/** Ritim: ilerleme/sonuç olayı yayınla (Redis events stream) + terminal durumu Postgres'e yansıt. */
export async function publishEvent(taskId: string, event: AgentEvent): Promise<void> {
  const r = requireRedis()
  const key = eventsKey(taskId)
  await r.call('XADD', key, '*', 'event', JSON.stringify(event))
  await r.call('EXPIRE', key, EVENTS_TTL_SEC)

  if (event.status === 'RUNNING' || event.status === 'COMPLETED' || event.status === 'FAILED') {
    const patch: Record<string, unknown> = { status: event.status }
    if (event.status === 'COMPLETED') patch.result = event.data ?? null
    if (event.status === 'FAILED') {
      patch.error = typeof event.data === 'string' ? event.data : JSON.stringify(event.data ?? null)
    }
    const { error } = await supabase.from('agent_tasks').update(patch).eq('id', taskId)
    if (error) logger.error({ err: error, taskId }, 'agent_tasks güncellenemedi')
  }
}

/**
 * Pusula: görevi delege et ve terminal olayı (COMPLETED/FAILED) bekle.
 * Kendi (duplicate) soketinde bloklu okur → eşzamanlı delege çağrıları birbirini kilitlemez.
 */
export async function delegateAndAwait(
  input: { userId: string; kind: TaskKind; payload: Record<string, unknown> },
  timeoutMs = 60_000,
): Promise<AgentEvent> {
  const task = await enqueueTask(input)
  const key = eventsKey(task.id)
  const sub = requireRedis().duplicate()
  try {
    const deadline = Date.now() + timeoutMs
    let lastId = '0'
    for (;;) {
      const remaining = deadline - Date.now()
      if (remaining <= 0) return { status: 'FAILED', data: `timeout ${timeoutMs}ms` }
      const res = (await sub.call('XREAD', 'BLOCK', Math.min(remaining, 5000), 'STREAMS', key, lastId)) as
        | RawStream[]
        | null
      if (!res) continue
      for (const [, entries] of res) {
        for (const [id, fields] of entries) {
          lastId = id
          const raw = fieldValue(fields, 'event')
          if (!raw) continue
          let ev: AgentEvent | null = null
          try {
            ev = JSON.parse(raw) as AgentEvent
          } catch {
            ev = null
          }
          if (ev && (ev.status === 'COMPLETED' || ev.status === 'FAILED')) return ev
        }
      }
    }
  } finally {
    sub.disconnect()
  }
}
