import { Router } from 'express'
import { streamKaptan } from '../agents/kaptan.js'

/** POST /api/chat — Kaptan sohbet akışı (SSE). requireAuth + chatLimiter app.ts'te zincirlenir. */
export const chatRouter = Router()

chatRouter.post('/', async (req, res) => {
  const body = req.body as { sessionId?: string; message?: string }
  const message = typeof body.message === 'string' ? body.message : ''
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
  if (!message) {
    res.status(400).json({ error: 'message gerekli' })
    return
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // proxy buffer'lamasın (SSE)
  })
  const send = (type: string, data: unknown): void => {
    res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  try {
    for await (const ev of streamKaptan(req.userId!, sessionId, message)) {
      send(ev.type, ev.data)
    }
    send('done', 'ok')
  } catch (err) {
    send('error', err instanceof Error ? err.message : 'stream hatası')
  } finally {
    res.end()
  }
})
