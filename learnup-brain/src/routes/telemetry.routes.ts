import { Router } from 'express'
import { supabase } from '../clients/supabase.js'
import { redis } from '../clients/redis.js'

/** POST /api/telemetry — soru çözüm olayı + (varsa) gün-içi çalışma belleği. */
export const telemetryRouter = Router()

telemetryRouter.post('/', async (req, res, next) => {
  try {
    const userId = req.userId!
    const body = req.body as {
      questionId?: string
      kazanimId?: number
      correct?: boolean
      selectedOption?: string
      durationMs?: number
      context?: Record<string, unknown>
    }

    const { error } = await supabase.from('user_activities').insert({
      user_id: userId,
      question_id: body.questionId ?? null,
      kazanim_id: typeof body.kazanimId === 'number' ? body.kazanimId : null,
      correct: typeof body.correct === 'boolean' ? body.correct : null,
      selected_option: body.selectedOption ?? null,
      duration_ms: typeof body.durationMs === 'number' ? body.durationMs : null,
    })
    if (error) throw error

    // Gün-içi çalışma belleği (hot-path) — buildStudentContext bunu okur.
    if (body.context && redis) {
      await redis.set(`user:${userId}:context`, JSON.stringify(body.context), 'EX', 86_400)
    }

    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})
