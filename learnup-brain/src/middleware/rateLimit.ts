import rateLimit from 'express-rate-limit'
import type { Request } from 'express'

/** Anahtar = doğrulanmış userId. Limiter'lar requireAuth'tan SONRA mount edilir, yani
 *  userId daima vardır; IP yalnız teorik bir yedek. */
const kullaniciAnahtari = (req: Request): string => req.userId ?? req.ip ?? 'anon'

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
 */
export const standardLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: kullaniciAnahtari,
})

/**
 * LLM ÇAĞIRAN rotalar için DAR limit — burada mesele hız değil, PARA.
 * Tek /tests/generate isteği havuz boşsa onlarca LLM çağrısı zinciri tetikleyebilir
 * (üret → aday başına bağımsız doğrula → onar → yeniden doğrula, 3 tura kadar).
 * 60/dk bu rotalar için makul değil; kullanıcı başına dakikada 10 üretim fazlasıyla yeter.
 */
export const llmLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: kullaniciAnahtari,
  message: { error: 'cok_fazla_uretim', message: 'Dakikada 10 üretim isteği sınırı aşıldı.' },
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
})
