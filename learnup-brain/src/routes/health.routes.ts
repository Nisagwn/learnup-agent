import { Router } from 'express'
import { pingRedis } from '../clients/redis.js'

export const healthRouter = Router()

// Liveness — dış bağımlılık kontrolü yok, süreç ayakta mı?
healthRouter.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'learnup-brain', ts: new Date().toISOString() })
})

// Readiness — dış bağımlılıkların (Redis) durumu.
// Redis bu fazda opsiyonel: 'disabled' hazır sayılır; yalnız 'error' (yapılandırılmış ama
// erişilemez) 503 döndürür.
healthRouter.get('/ready', async (_req, res) => {
  const redis = await pingRedis()
  const ready = redis !== 'error'
  res.status(ready ? 200 : 503).json({
    status: ready ? 'ok' : 'degraded',
    service: 'learnup-brain',
    deps: { redis },
    ts: new Date().toISOString(),
  })
})
