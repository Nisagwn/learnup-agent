import rateLimit from 'express-rate-limit'
import type { Request } from 'express'

/**
 * Normal/mutating rotalar (tests, telemetry, question-state, agents) için standart limit.
 * `/api/chat` (SSE) bu limiter'a mount EDİLMEZ — bkz. chatLimiter.
 */
export const standardLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
})

/**
 * Chat SSE için: YALNIZ istek başlatmayı sınırlar (akış süresini DEĞİL — SSE tek istektir).
 * `requireAuth`'tan SONRA mount edilir → anahtar = userId (yoksa IP).
 */
export const chatLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.userId ?? req.ip ?? 'anon',
})
