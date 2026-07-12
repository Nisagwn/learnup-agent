import { Router } from 'express'
import { processAnswer } from '../lib/answers.js'

/**
 * POST /api/v1/answers — BİRLEŞİK cevap ucu (§B6).
 * record-answer + telemetry çift-yazımının yerini alır: tek istek → atomik yazım
 * (record_answer RPC) + sinyal penceresi + BKT-lite mastery. Yanıt sözleşmesi
 * /api/practice/record ile birebir (frontend cutover'ı düşürmeden geçsin diye).
 */
export const answersRouter = Router()

answersRouter.post('/', async (req, res, next) => {
  try {
    res.json(await processAnswer(req.userId!, req.body ?? {}))
  } catch (err) {
    next(err)
  }
})
