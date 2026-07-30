import rateLimit from 'express-rate-limit'
import type { Request } from 'express'
import { RedisStore } from 'rate-limit-redis'
import { redisLimiter } from '../clients/redis.js'

/** Anahtar = doğrulanmış userId. Limiter'lar requireAuth'tan SONRA mount edilir, yani
 *  userId daima vardır; IP yalnız teorik bir yedek. */
const kullaniciAnahtari = (req: Request): string => req.userId ?? req.ip ?? 'anon'

/**
 * ⚠️ HOT-PATH client'ı BURADA KULLANMA. Store, kurulduğu anda (bu modülün gövdesi çalışırken,
 * yani soket henüz açılmadan) `SCRIPT LOAD` gönderir. `enableOfflineQueue:false` olan hot-path
 * client bunu anında reddeder, rate-limit-redis reddedişi yakalamaz → unhandled rejection →
 * süreç açılışta ölür. Redis erişilebilirken bile ölüyordu; bu yüzden ayrı bir 'limiter'
 * profili var (offline queue açık + commandTimeout ile sınırlı). Bkz. clients/redis.ts.
 */
function buildStore(prefix: string): RedisStore | undefined {
  if (!redisLimiter) return undefined
  return new RedisStore({
    // @ts-expect-error ioredis v5 Redis, rate-limit-redis'in beklediği tiple tam eşleşmiyor;
    // çalışma zamanında uyumludur (send_command mevcut).
    sendCommand: (...args: string[]) => redisLimiter!.call(...args),
    prefix: `lb:rl:${prefix}:`,
  })
}

/**
 * Redis store hata verirse (kapalı, commandTimeout doldu) isteği 500'e düşürme — limitsiz geçir.
 *
 * Neden fail-OPEN: mimarinin kuralı "Redis = hot-path, yokluğu ÖZELLİK KAYBI'dır, HATA değil".
 * Redis düştüğünde tüm API'yi kapatmak, hız katmanının arızasını hakikat katmanının arızasına
 * çevirir. Kaybedilen şey dağıtık sayımdır; fatura tavanı LLM zincirlerindeki bütçe kapısında
 * ayrıca durur (bkz. model-router). Store hataları pino ile görünür kalır.
 */
const storeHatasindaGec = { passOnStoreError: true } as const

/**
 * Normal/mutating rotalar (tests, telemetry, question-state, agents…) için standart limit.
 * `/api/chat` (SSE) bu limiter'a mount EDİLMEZ — bkz. chatLimiter.
 *
 * ⚠️ ESKİDEN keyGenerator YOKTU → express-rate-limit varsayılan olarak req.ip'yi kullanır.
 * Sonuç iki yönlü bozuktu:
 *   · Saldırı yönü: LLM çağıran her rota (/tests, /questions, /ai, /agents…) IP başına
 *     sınırlanıyordu. Proxy havuzu olan TEK bir hesap, pratikte SINIRSIZ ücretli LLM çağrısı
 *     yapabiliyordu — doğrudan fatura.
 *   · Ters yön: uygulama ters vekil arkasında (Docker/ingress) ve `trust proxy` hiç
 *     ayarlanmamış. O hâlde req.ip TÜM kullanıcılar için vekilin IP'si olur → herkes tek bir
 *     60/dk kovasına düşer → tek kullanıcı bütün öğrencileri kilitleyebilir.
 * Anahtar artık doğrulanmış JWT'nin userId'si: adil, sahtelenemez, vekilden bağımsız.
 *
 * Store: Redis varsa dağıtık (multi-instance güvenli), yoksa in-memory fallback.
 */
export const standardLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: kullaniciAnahtari,
  store: buildStore('std'),
  ...storeHatasindaGec,
})

/**
 * LLM ÇAĞIRAN rotalar için DAR limit — burada mesele hız değil, PARA.
 * Tek /tests/generate isteği havuz boşsa onlarca LLM çağrısı zinciri tetikleyebilir
 * (üret → aday başına bağımsız doğrula → onar → yeniden doğrula, 3 tura kadar).
 * 60/dk bu rotalar için makul değil; kullanıcı başına dakikada 10 üretim fazlasıyla yeter.
 *
 * Store: Redis varsa dağıtık; fatura limitinin instance başına çarpılması engellenir.
 */
export const llmLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: kullaniciAnahtari,
  message: { error: 'cok_fazla_uretim', message: 'Dakikada 10 üretim isteği sınırı aşıldı.' },
  store: buildStore('llm'),
  ...storeHatasindaGec,
})

/**
 * Chat SSE için: YALNIZ istek başlatmayı sınırlar (akış süresini DEĞİL — SSE tek istektir).
 */
export const chatLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: kullaniciAnahtari,
  store: buildStore('chat'),
  ...storeHatasindaGec,
})
