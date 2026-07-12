import { Router } from 'express'
import { saveQuestionState, loadQuestionState } from '../lib/canvas.js'

/** GET /:questionId + POST / — canvas (soru çalışma durumu) yükle/kaydet. */
export const questionStateRouter = Router()

questionStateRouter.get('/:questionId', async (req, res, next) => {
  try {
    const state = await loadQuestionState({ userId: req.userId!, questionId: req.params.questionId })
    res.json({ state })
  } catch (err) {
    next(err)
  }
})

questionStateRouter.post('/', async (req, res, next) => {
  try {
    const body = req.body as { questionId?: string; state?: Record<string, unknown> }
    if (!body.questionId) {
      res.status(400).json({ error: 'questionId gerekli' })
      return
    }
    await saveQuestionState({ userId: req.userId!, questionId: body.questionId, state: body.state ?? {} })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})
