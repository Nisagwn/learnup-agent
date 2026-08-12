import { Router } from 'express'
import { pingRedis, pingSessionRedis } from '../clients/redis.js'

export const healthRouter = Router()

// Liveness — dış bağımlılık kontrolü yok, süreç ayakta mı?
healthRouter.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'learnup-brain', ts: new Date().toISOString() })
})

// Readiness — dış bağımlılıkların (Redis) durumu.
// Redis bu fazda opsiyonel: 'disabled' hazır sayılır; yalnız 'error' (yapılandırılmış ama
// erişilemez) 503 döndürür.
//
// ⚠️ OTURUM DEPOSU AYRI SATIRDIR ve 503 ÜRETMEZ: oturum katmanı fail-open'dır
// (middleware/oturum.ts) — deposu düştüğünde API çalışmayı sürdürür, yalnız oturum
// iptali uygulanamaz. Bunu 503'e çevirmek, kapının kendi tasarım kararıyla çelişirdi.
// Ama GÖRÜNMEZ de kalmamalı: 'error' burada okunur, çünkü o pencerede çıkış yaptırılan
// cihazlar hâlâ içeride demektir.
healthRouter.get('/ready', async (_req, res) => {
  const [redis, oturum] = await Promise.all([pingRedis(), pingSessionRedis()])
  const ready = redis !== 'error'
  res.status(ready ? 200 : 503).json({
    status: ready ? 'ok' : 'degraded',
    service: 'learnup-brain',
    deps: { redis, oturum },
    ts: new Date().toISOString(),
  })
})
