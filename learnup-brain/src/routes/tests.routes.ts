import { Router } from 'express'
import { buildMicroTest, buildMesoTest, buildMacroTest } from '../lib/test-modes.js'

/** POST /api/tests/generate — Mikro / Mezo / Makro test derleme. */
export const testsRouter = Router()

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
        difficulty: body.difficulty ?? 'orta',
        count: typeof body.count === 'number' ? body.count : 5,
      })
      res.json({ mode, questions })
      return
    }

    if (mode === 'meso') {
      const questions = await buildMesoTest({
        userId,
        totalCount: typeof body.totalCount === 'number' ? body.totalCount : 12,
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
