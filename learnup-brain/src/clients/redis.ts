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
/**
 * İki client'ın DAYANIKLILIK İHTİYACI ZITTIR — aynı ayarı vermek biri için hatalıdır.
 *
 * hotPath=false (worker, XREAD BLOCK): `maxRetriesPerRequest: null` + çevrimdışı kuyruk.
 *   Worker'ın işi zaten beklemek; Redis dönene kadar komut kuyrukta durmalı, düşmemeli.
 *
 * hotPath=true (istek yolu: buildStudentContext, telemetri): HIZLI PATLAMALI.
 *   Ölçüldü — `maxRetriesPerRequest: null` + çevrimdışı kuyruk ile Redis kapalıyken
 *   `redis.get()` HİÇ ÇÖZÜLMÜYOR: promise sonsuza kadar asılı kalıyor, soru üretimi ve
 *   sohbet tamamen donuyor. Oysa mimarinin kuralı "Postgres = hakikat · Redis = hot-path":
 *   Redis'in yokluğu YAVAŞLATMALI, KİLİTLEMEMELİ.
 *   → enableOfflineQueue:false ile komut anında REDDEDİLİR; çağıran .catch() ile
 *     Redis'siz devam eder (bkz. buildStudentContext).
 */
function createConnection(url: string, label: string, hotPath: boolean): Redis {
  const client = new Redis(url, {
    maxRetriesPerRequest: hotPath ? 1 : null,
    enableOfflineQueue: !hotPath,
    connectTimeout: 2000,
    // Kademeli geri çekilme: kapalı Redis saniyede onlarca hata log'u basmasın.
    retryStrategy: (times: number) => Math.min(times * 500, 10_000),
  })
  let sustu = false
  client.on('error', (err: Error) => {
    if (sustu) return
    sustu = true // ilk hatayı bildir, gerisini bastır (yeniden bağlanınca sıfırlanır)
    logger.error({ err, label }, 'redis bağlantı hatası — hot-path Redis olmadan sürer')
  })
  client.on('connect', () => {
    sustu = false
    logger.debug({ label }, 'redis bağlandı')
  })
  return client
}

export const redis: Redis | null = env.REDIS_URL ? createConnection(env.REDIS_URL, 'redis', true) : null
export const redisBlocking: Redis | null = env.REDIS_URL
  ? createConnection(env.REDIS_URL, 'redisBlocking', false)
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
