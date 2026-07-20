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

/** GET /api/v1/agents/roadmap — Pusula'nın yazdığı haftalık plan (roadmaps.steps).
 *  Üretim MEVCUT POST /agents/pusula ile; bu uç yalnız okur. */
agentsRouter.get('/roadmap', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('roadmaps')
      .select('steps, updated_at')
      .eq('user_id', req.userId!)
      .maybeSingle()
    if (error) throw error
    res.json({ steps: data?.steps ?? null, updatedAt: data?.updated_at ?? null })
  } catch (err) {
    next(err)
  }
})

/** GET /api/v1/agents/nudges — Koç'un bekleyen dürtmeleri (zil rozeti).
 *  POST /api/v1/agents/nudges/seen — görüldü işareti (PENDING→SENT, kendi satırları). */
agentsRouter.get('/nudges', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('nudges')
      .select('id, kind, message, created_at')
      .eq('user_id', req.userId!)
      .eq('status', 'PENDING')
      .order('created_at', { ascending: false })
      .limit(10)
    if (error) throw error
    res.json({ nudges: data ?? [] })
  } catch (err) {
    next(err)
  }
})

agentsRouter.post('/nudges/seen', async (req, res, next) => {
  try {
    const ids = Array.isArray((req.body as { ids?: unknown[] })?.ids)
      ? (req.body as { ids: unknown[] }).ids.map(Number).filter(Number.isFinite)
      : []
    if (!ids.length) {
      res.status(400).json({ error: 'ids gerekli' })
      return
    }
    const { error } = await supabase
      .from('nudges')
      .update({ status: 'SENT' })
      .in('id', ids)
      .eq('user_id', req.userId!) // sahiplik: başkasının dürtmesi işaretlenemez
      .eq('status', 'PENDING')
    if (error) throw error
    res.json({ ok: true })
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