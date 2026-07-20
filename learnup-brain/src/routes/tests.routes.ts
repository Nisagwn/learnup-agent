import { Router } from 'express'
import { buildMicroTest, buildMesoTest, buildMacroTest } from '../lib/test-modes.js'

/** POST /api/tests/generate — Mikro / Mezo / Makro test derleme. */
export const testsRouter = Router()

/** İstemciden gelen sayıyı SINIRLA — bu sayı doğrudan LLM çağrı sayısına dönüşüyor.
 *  Havuz yetmezse generateVerifiedSet devreye girer: her tur 1 üretim + aday başına 1
 *  bağımsız doğrulama + olası onarım çağrısı (max_tokens 8000). Sınırsız `count`,
 *  TEK HTTP isteğiyle ciddi bir fatura demek. `/questions/generate` zaten sınırlıyor
 *  (Math.min(10,…)); burada eksikti. */
const sinirla = (v: unknown, varsayilan: number, tavan: number): number => {
  const n = Number(v)
  if (!Number.isFinite(n)) return varsayilan
  return Math.min(tavan, Math.max(1, Math.floor(n)))
}

const ZORLUKLAR = new Set(['kolay', 'orta', 'zor'])

testsRouter.post('/generate', async (req, res, next) => {
  try {
    const body = req.body as {
      mode?: string
      kazanimId?: number
      difficulty?: string
      count?: number
      totalCount?: number
      examType?: 'TYT' | 'AYT'
    }
    const userId = req.userId!
    const mode = body.mode ?? 'micro'

    if (mode === 'micro') {
      if (typeof body.kazanimId !== 'number') {
        res.status(400).json({ error: 'micro için kazanimId gerekli' })
        return
      }
      const questions = await buildMicroTest({
        userId,
        kazanimId: body.kazanimId,
        // Zorluk hem LLM prompt'una hem DB filtresine gidiyor → serbest metin kabul etme.
        difficulty: ZORLUKLAR.has(String(body.difficulty)) ? String(body.difficulty) : 'orta',
        count: sinirla(body.count, 5, 20),
      })
      res.json({ mode, questions })
      return
    }

    if (mode === 'meso') {
      const questions = await buildMesoTest({
        userId,
        totalCount: sinirla(body.totalCount, 12, 40),
      })
      res.json({ mode, questions })
      return
    }

    if (mode === 'macro') {
      const result = await buildMacroTest({ userId, examType: body.examType === 'AYT' ? 'AYT' : 'TYT' })
      res.json({ mode, ...result })
      return
    }

    res.status(400).json({ error: `bilinmeyen mode: ${mode}` })
  } catch (err) {
    next(err)
  }
})
