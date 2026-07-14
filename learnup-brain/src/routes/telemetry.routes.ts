import { Router } from 'express'
import { redisTry } from '../clients/redis.js'

/**
 * POST /api/telemetry — GÜN-İÇİ ÇALIŞMA BELLEĞİ (hot-path).
 *
 * ⚠️ ESKİDEN BOZUKTU: rota `user_activities` tablosuna insert ediyordu, ama o tablo
 * migration 0006'da DÜŞÜRÜLDÜ (`drop table if exists public.user_activities`). Yani her
 * çağrı `throw error` ile 500 dönüyordu — canlı DB'ye sorup doğrulandı:
 *     "Could not find the table 'public.user_activities' in the schema cache"
 * Sessiz olmayan ama kimsenin bakmadığı bir arıza: 500'den sonraki satıra hiç ulaşılmadığı
 * için gün-içi bağlam (`user:<id>:context`) HİÇ yazılmıyordu → buildStudentContext'in
 * `daily.energy` bloğu kalıcı olarak ölüydü → kişiselleştirme sessizce çalışmıyordu.
 *
 * Cevap olaylarının OTORİTER yolu artık POST /api/v1/answers'tır (record_answer RPC'si;
 * user_logs + mastery + gamification'ı tek transaction'da yazar). Burada tekrar yazmak
 * çift sayım olurdu — weak_kazanimlar ve distractor_traps bozulurdu.
 */
export const telemetryRouter = Router()

const CEVAP_ALANLARI = ['questionId', 'kazanimId', 'correct', 'selectedOption', 'durationMs'] as const

telemetryRouter.post('/', async (req, res, next) => {
  try {
    const userId = req.userId!
    const body = (req.body ?? {}) as Record<string, unknown> & { context?: Record<string, unknown> }

    // Cevap olayı buraya GÖNDERİLMEMELİ. Sessizce yutmak veri kaybı, yazmak çift sayım olur.
    const yanlisAlan = CEVAP_ALANLARI.filter((k) => body[k] !== undefined)
    if (yanlisAlan.length) {
      res.status(400).json({
        error: 'cevap_olayi_burada_degil',
        message: `Cevap olayları POST /api/v1/answers'a gider (atomik: user_logs + mastery + gamification). Bu uçta geçersiz alanlar: ${yanlisAlan.join(', ')}`,
      })
      return
    }

    if (!body.context || typeof body.context !== 'object') {
      res.status(400).json({ error: 'context gerekli' })
      return
    }

    // Redis = hot-path. Erişilemezse gün-içi bağlam düşer ama istek ÖLMEZ (Postgres hakikat).
    const yazildi = await redisTry(
      (r) => r.set(`user:${userId}:context`, JSON.stringify(body.context), 'EX', 86_400),
      null,
    )

    res.json({ ok: true, cached: yazildi === 'OK' })
  } catch (err) {
    next(err)
  }
})
