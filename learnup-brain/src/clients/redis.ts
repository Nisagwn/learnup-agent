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
 * Client'ların DAYANIKLILIK İHTİYACI ZITTIR — aynı ayarı vermek biri için hatalıdır.
 *
 * 'worker' (XREAD BLOCK): `maxRetriesPerRequest: null` + çevrimdışı kuyruk.
 *   Worker'ın işi zaten beklemek; Redis dönene kadar komut kuyrukta durmalı, düşmemeli.
 *
 * 'hot' (istek yolu: buildStudentContext, telemetri): HIZLI PATLAMALI.
 *   Ölçüldü — `maxRetriesPerRequest: null` + çevrimdışı kuyruk ile Redis kapalıyken
 *   `redis.get()` HİÇ ÇÖZÜLMÜYOR: promise sonsuza kadar asılı kalıyor, soru üretimi ve
 *   sohbet tamamen donuyor. Oysa mimarinin kuralı "Postgres = hakikat · Redis = hot-path":
 *   Redis'in yokluğu YAVAŞLATMALI, KİLİTLEMEMELİ.
 *   → enableOfflineQueue:false ile komut anında REDDEDİLİR; çağıran .catch() ile
 *     Redis'siz devam eder (bkz. buildStudentContext).
 *
 * 'limiter' (rate-limit-redis store): İKİSİ DE DEĞİL — açılışta beklemeli, sonra patlamalı.
 *   ⚠️ Neden ayrı bir profil şart: rate-limit-redis store'u kurulur kurulmaz `SCRIPT LOAD`
 *   gönderir; bu, modül gövdesinde (rateLimit.ts'teki top-level `rateLimit({...})`) yani
 *   soket daha AÇILMADAN olur. 'hot' profiliyle komut anında reddedilir, reddedişi
 *   rate-limit-redis yakalamaz → unhandled rejection → süreç exit(1). Ölçüldü: Redis
 *   ERİŞİLEBİLİRKEN bile `bun src/server.ts` her denemede açılışta öldü (Docker'da
 *   patlamıyordu çünkü ilk istek soket hazır olduktan sonra geliyor — yani hata gizliydi,
 *   yok değildi).
 *   → enableOfflineQueue:true  : açılıştaki SCRIPT LOAD kuyrukta bekler, çökme yok.
 *   → commandTimeout           : ama kuyruk SONSUZ BEKLEME olmamalı. Redis gerçekten
 *     kapalıysa komut 1sn'de reddedilir; rateLimit.ts'teki passOnStoreError bunu
 *     "limitsiz geç"e çevirir. Timeout OLMADAN offline queue, Redis düştüğünde her isteği
 *     süresiz asardı — 'hot' profilinde kaçınılan tam o tuzak.
 */
type Profil = 'hot' | 'worker' | 'limiter'

const PROFILLER: Record<Profil, { maxRetriesPerRequest: number | null; enableOfflineQueue: boolean; commandTimeout?: number }> = {
  hot: { maxRetriesPerRequest: 1, enableOfflineQueue: false },
  worker: { maxRetriesPerRequest: null, enableOfflineQueue: true },
  limiter: { maxRetriesPerRequest: 2, enableOfflineQueue: true, commandTimeout: 1000 },
}

function createConnection(url: string, label: string, profil: Profil): Redis {
  const client = new Redis(url, {
    ...PROFILLER[profil],
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

export const redis: Redis | null = env.REDIS_URL ? createConnection(env.REDIS_URL, 'redis', 'hot') : null
export const redisBlocking: Redis | null = env.REDIS_URL
  ? createConnection(env.REDIS_URL, 'redisBlocking', 'worker')
  : null
/** Yalnız rate-limit-redis store'u için — bkz. 'limiter' profili. Başka yerde KULLANMA. */
export const redisLimiter: Redis | null = env.REDIS_URL
  ? createConnection(env.REDIS_URL, 'redisLimiter', 'limiter')
  : null

/**
 * OTURUM DEPOSU — AYRI Redis DB'si (SESSION_REDIS_URL, örn. …/2).
 *
 * ⚠️ Neden yukarıdakilerden ayrı bir BAĞLANTI ve ayrı bir DB: yukarıdaki üçü db 1'de
 * ATILABİLİR veri taşır (cache, sayaç, kuyruk) — operasyonda tereddütsüz `FLUSHDB` edilir.
 * Oturum kaydı atılabilir değildir: iptal kaydını silmek, çıkış yaptırdığın cihazı geri
 * içeri almaktır. Ayrıca aynı istemciyi paylaşmak, oturum okumasını cache trafiğinin
 * gecikme kuyruğuna sokardı.
 *
 * Profil 'hot': oturum kapısı istek yolundadır → Redis kapalıyken komut ASILMAMALI, anında
 * reddedilmeli. Reddi `redisSessionTry` yutar → fail-open (bkz. middleware/oturum.ts).
 */
export const redisSession: Redis | null = env.SESSION_REDIS_URL
  ? createConnection(env.SESSION_REDIS_URL, 'redisSession', 'hot')
  : null

/**
 * HOT-PATH REDIS — arıza HİÇBİR ZAMAN isteği öldürmez.
 *
 * İstek yolundaki her Redis dokunuşu bundan geçmeli. `enableOfflineQueue:false` sayesinde
 * Redis kapalıyken komut anında REDDEDİLİYOR; yakalanmazsa bu reddediş çağıranın ta tepesine
 * kadar kaçar ve isteği 500'e düşürür. Yani "hızlı reddet" ayarı, yakalanmadığında
 * "Redis düştü → sohbet tamamen öldü"ye dönüşür — düzeltmek istediğimizin tam tersi.
 *
 * Kural: Redis = hot-path (hız), Postgres = hakikat. Redis'in yokluğu ÖZELLİK KAYBI'dır
 * (gün-içi bağlam yok, masa cache'i soğuk), HATA değil.
 *
 * Worker'lar bunu KULLANMAZ: onlar için Redis zorunlu (Streams) ve arıza görünür olmalı.
 */
export async function redisTry<T>(fn: (r: Redis) => Promise<T>, fallback: T): Promise<T> {
  return denemeliCalistir(redis, 'redis', fn, fallback)
}

/**
 * OTURUM DEPOSU için aynı sözleşme — arıza isteği öldürmez, oturum katmanını devre dışı bırakır.
 *
 * ⚠️ Bu FAIL-OPEN'dır ve bilinçlidir: SESSION_REDIS_URL tanımsız ya da depo erişilemezken
 * oturum iptali uygulanamaz, istek salt-JWT ile geçer. Fail-closed alternatifi (Redis yoksa
 * 401) bir hız katmanı arızasını tüm API'nin kapanmasına çevirirdi — rateLimit'in
 * `passOnStoreError` kararıyla aynı çizgi. Bedeli yorumda değil, KODDA görünür kalsın diye
 * ayrı bir fonksiyon: `redisTry` ile karıştırılamaz.
 */
export async function redisSessionTry<T>(fn: (r: Redis) => Promise<T>, fallback: T): Promise<T> {
  return denemeliCalistir(redisSession, 'redisSession', fn, fallback)
}

async function denemeliCalistir<T>(
  client: Redis | null,
  label: string,
  fn: (r: Redis) => Promise<T>,
  fallback: T,
): Promise<T> {
  if (!client) return fallback
  try {
    return await fn(client)
  } catch (err) {
    logger.debug({ err, label }, 'redis hot-path atlandı — Redis\'siz devam')
    return fallback
  }
}

/**
 * Bağlantı HAZIR olana kadar bekler (worker açılışı için).
 *
 * ⚠️ Neden gerekli: hot-path client `enableOfflineQueue:false` → komut, soket hazır DEĞİLKEN
 * anında REDDEDİLİR ("Stream isn't writeable"). İstek yolu için doğru davranış; ama worker
 * açılışta hemen XGROUP CREATE çağırıyor ve o an bağlantı henüz kurulmamış oluyor →
 * worker daha ilk saniyede ölüyordu. (Ölçüldü: gerçekten öldü.)
 * İstek yolu "beklemez, reddeder"; worker "bekler, sonra başlar". Farklı sözleşmeler.
 */
export async function redisReady(timeoutMs = 10_000): Promise<boolean> {
  if (!redis) return false
  if (redis.status === 'ready') return true
  return new Promise<boolean>((resolve) => {
    const t = setTimeout(() => {
      redis?.off('ready', ok)
      resolve(false)
    }, timeoutMs)
    const ok = (): void => {
      clearTimeout(t)
      resolve(true)
    }
    redis?.once('ready', ok)
  })
}

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
  return pingEt(redis)
}

/** Oturum deposunun (ayrı DB) erişilebilirliği — /health/ready ayrı satırda gösterir. */
export async function pingSessionRedis(): Promise<'ok' | 'disabled' | 'error'> {
  return pingEt(redisSession)
}

async function pingEt(client: Redis | null): Promise<'ok' | 'disabled' | 'error'> {
  if (!client) return 'disabled'
  try {
    return (await client.ping()) === 'PONG' ? 'ok' : 'error'
  } catch {
    return 'error'
  }
}
