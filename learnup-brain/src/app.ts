import express, { type Express } from 'express'
import helmet from 'helmet'
import cors from 'cors'
import { pinoHttp } from 'pino-http'
import { env } from './config/env.js'
import { logger } from './utils/logger.js'
import { notFound, errorHandler } from './middleware/error.js'
import { requireAuth } from './middleware/auth.js'
import { standardLimiter, chatLimiter, llmLimiter } from './middleware/rateLimit.js'
import { healthRouter } from './routes/health.routes.js'
import { chatRouter } from './routes/chat.routes.js'
import { testsRouter } from './routes/tests.routes.js'
import { telemetryRouter } from './routes/telemetry.routes.js'
import { questionStateRouter } from './routes/questionState.routes.js'
import { agentsRouter } from './routes/agents.routes.js'
// ── Migrasyon (Edge Functions → route) ──
import { questionsRouter } from './routes/questions.routes.js'
import { practiceRouter } from './routes/practice.routes.js'
import { assignmentsRouter } from './routes/assignments.routes.js'
import { gamificationRouter } from './routes/gamification.routes.js'
import { gardenRouter } from './routes/garden.routes.js'
import { aiRouter } from './routes/ai.routes.js'
import { accountRouter } from './routes/account.routes.js'
// ── v1 (master plan Faz 1) ──
import { answersRouter } from './routes/answers.routes.js'
import { osymRouter } from './routes/osym.routes.js'

/**
 * Express uygulamasını kurar (mount + middleware zinciri).
 *
 * NOT (Hotfix 2 — SSE): `compression()` KULLANILMAZ ve `standardLimiter` `/api/chat`'e
 * mount edilmez; SSE token akışının buffer'lanmaması/kesilmemesi için. `standardLimiter`
 * yalnız mutating rotalara (tests/telemetry/question-state/agents) per-router eklenir.
 */
export function createApp(): Express {
  const app = express()

  app.disable('x-powered-by')
  // Ters vekil (Docker/ingress) arkasındayız: X-Forwarded-For'a güven ki req.ip gerçek istemci
  // olsun. Ayarlanmazsa req.ip HERKES için vekilin IP'sidir. (Rate limit anahtarı artık userId
  // olduğu için kritik değil, ama log'lardaki ve teorik IP yedeğindeki yalanı da bitiriyor.)
  app.set('trust proxy', 1)
  app.use(helmet())
  // CORS: yalnız bilinen frontend origin'i. cors() çıplak çağrıldığında `Access-Control-Allow-
  // Origin: *` gönderiyordu — Bearer token kullandığımız için oturum çalınamıyor, ama API'yi
  // herkese açık tutmanın da bir gerekçesi yok.
  app.use(
    cors({
      origin: [env.APP_URL, 'http://localhost:5173', 'http://localhost:3000'],
      credentials: false,
    }),
  )
  app.use(express.json({ limit: '1mb' }))
  app.use(pinoHttp({ logger }))

  // Sağlık kontrolü — auth/limit yok
  app.use('/health', healthRouter)

  // Eski (v1-öncesi) /api/* yüzeyi cutover boyunca çalışır ama deprecated işaretlenir.
  app.use('/api', (req, res, nextFn) => {
    if (!req.path.startsWith('/v1/')) res.setHeader('Deprecation', 'true')
    nextFn()
  })

  // Aynı router setini hem /api (legacy alias) hem /api/v1 (kanonik) altına bağlar.
  for (const base of ['/api', '/api/v1']) {
    // SSE: compression YOK, standardLimiter YOK → requireAuth → chatLimiter (yalnız başlatma)
    app.use(`${base}/chat`, requireAuth, chatLimiter, chatRouter)
    // LLM ÇAĞIRAN rotalar: dar limit (10/dk/kullanıcı). Tek istek onlarca Sonnet çağrısı
    // tetikleyebiliyor → burada sınır hız değil, FATURA meselesi.
    app.use(`${base}/tests`, requireAuth, llmLimiter, testsRouter)
    app.use(`${base}/agents`, requireAuth, llmLimiter, agentsRouter)
    // Mutating rotalar: requireAuth + standardLimiter
    app.use(`${base}/telemetry`, requireAuth, standardLimiter, telemetryRouter)
    app.use(`${base}/question-state`, requireAuth, standardLimiter, questionStateRouter)
    // Birleşik cevap ucu (record-answer + telemetry'nin halefi)
    app.use(`${base}/answers`, requireAuth, standardLimiter, answersRouter)
    // Çıkmış sorular — /questions'tan ÖNCE mount edilmeli (Express sıralı eşleşir)
    app.use(`${base}/questions/osym`, requireAuth, standardLimiter, osymRouter)
    // Migrasyon rotaları (Edge Functions → Express) — LLM çağıranlar llmLimiter'da
    app.use(`${base}/questions`, requireAuth, llmLimiter, questionsRouter)
    app.use(`${base}/ai`, requireAuth, llmLimiter, aiRouter)
    app.use(`${base}/practice`, requireAuth, standardLimiter, practiceRouter)
    app.use(`${base}/assignments`, requireAuth, standardLimiter, assignmentsRouter)
    app.use(`${base}/gamification`, requireAuth, standardLimiter, gamificationRouter)
    app.use(`${base}/garden`, requireAuth, standardLimiter, gardenRouter)
    app.use(`${base}/account`, requireAuth, standardLimiter, accountRouter)
  }

  app.use(notFound)
  app.use(errorHandler)

  return app
}
