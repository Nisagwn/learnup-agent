import { Redis } from 'ioredis'
import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'

/**
 * Redis (hot-path) — ajan olay veriyolu (Streams) + çalışma belleği.
 *
 * İKİ bağlantı gerekir:
 *  - `redis`         → komut + XADD (non-blocking)
 *  - `redisBlocking` → BLOCK'lu XREAD/XREADGROUP (ayrı socket ŞART — bloklu okuma diğer komutları kilitler)
 *
 * REDIS_URL tanımlı değilse ikisi de `null` olur: API + RAG + Kaptan tek process'te çalışmaya devam eder,
 * yalnız ajan orkestrasyonu (Pusula ↔ Ritim) devre dışı kalır.
 */
function createConnection(url: string, label: string): Redis {
  const client = new Redis(url, {
    // Bloklu (XREAD BLOCK) komutlar ve dayanıklı worker'lar için önerilir.
    maxRetriesPerRequest: null,
  })
  client.on('error', (err: Error) => logger.error({ err, label }, 'redis bağlantı hatası'))
  client.on('connect', () => logger.debug({ label }, 'redis bağlandı'))
  return client
}

export const redis: Redis | null = env.REDIS_URL ? createConnection(env.REDIS_URL, 'redis') : null
export const redisBlocking: Redis | null = env.REDIS_URL
  ? createConnection(env.REDIS_URL, 'redisBlocking')
  : null

/** Ajan orkestrasyonu gibi Redis zorunlu olan yerlerde çağrılır. */
export function requireRedis(): Redis {
  if (!redis) {
    throw new Error('REDIS_URL tanımlı değil — ajan orkestrasyonu (Streams) için Redis gereklidir.')
  }
  return redis
}

/**
 * Redis erişilebilirlik kontrolü (health/readiness ve başlangıç doğrulaması için).
 *  - `disabled` → REDIS_URL tanımsız (bu fazda normal)
 *  - `ok`       → PING → PONG
 *  - `error`    → yapılandırılmış ama erişilemiyor
 */
export async function pingRedis(): Promise<'ok' | 'disabled' | 'error'> {
  if (!redis) return 'disabled'
  try {
    return (await redis.ping()) === 'PONG' ? 'ok' : 'error'
  } catch {
    return 'error'
  }
}
