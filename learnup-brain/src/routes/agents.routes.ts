import { Router } from 'express'
import { enqueueTask, type TaskKind } from '../agents/bus.js'
import { runPusula } from '../agents/pusula.js'
import { supabase } from '../clients/supabase.js'

/** Ajan orkestrasyonu — dispatch (async), pusula (senkron), status. */
export const agentsRouter = Router()

// Görev enqueue (async) — Ritim worker tüketir; taskId hemen döner.
agentsRouter.post('/dispatch', async (req, res, next) => {
  try {
    const body = req.body as { kind?: TaskKind; payload?: Record<string, unknown> }
    const kind: TaskKind = body.kind ?? 'topup'
    const task = await enqueueTask({ userId: req.userId!, kind, payload: body.payload ?? {} })
    res.status(202).json({ taskId: task.id, status: 'PENDING' })
  } catch (err) {
    next(err)
  }
})

// Pusula orkestrasyonu (senkron tool-loop; oturumları Ritim'e delege eder).
agentsRouter.post('/pusula', async (req, res, next) => {
  try {
    const result = await runPusula(req.userId!)
    res.json(result)
  } catch (err) {
    next(err)
  }
})

// Görev durumu (Postgres = hakikat).
agentsRouter.get('/status/:taskId', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('agent_tasks')
      .select('id, status, result, error')
      .eq('id', req.params.taskId)
      .eq('user_id', req.userId!)
      .maybeSingle()
    if (error) throw error
    if (!data) {
      res.status(404).json({ error: 'görev bulunamadı' })
      return
    }
    res.json(data)
  } catch (err) {
    next(err)
  }
})