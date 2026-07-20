import { Router } from 'express'
import { streamKaptan } from '../agents/kaptan.js'
import { supabase } from '../clients/supabase.js'

/** POST /api/chat — Kaptan sohbet akışı (SSE). requireAuth + chatLimiter app.ts'te zincirlenir.
 *  GET  /api/chat/history — son oturumun mesajları (sohbet sürekliliği: öğrenci sayfaya
 *  dönünce konuşma kaldığı yerden yüklenir; "yeni sohbet" istemcide temiz sessionId açar).
 *  chatLimiter (20/dk) sayfa başına tek GET için fazlasıyla bol. */
export const chatRouter = Router()

chatRouter.get('/history', async (req, res, next) => {
  try {
    const userId = req.userId!
    // Son oturumu bul (kullanıcı-kapsamlı; session_id istemci üretimi UUID'dir)
    const { data: son, error: sonErr } = await supabase
      .from('chat_messages')
      .select('session_id')
      .eq('user_id', userId)
      .not('session_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (sonErr) throw sonErr
    if (!son?.session_id) {
      res.json({ sessionId: null, messages: [] })
      return
    }
    // Oturumun mesajları — yalnız user/assistant (tool ara-adımları sohbet balonu değildir)
    const { data: mesajlar, error } = await supabase
      .from('chat_messages')
      .select('role, content, created_at')
      .eq('user_id', userId)
      .eq('session_id', son.session_id)
      .in('role', ['user', 'assistant'])
      .order('created_at', { ascending: true })
      .limit(80)
    if (error) throw error
    res.json({ sessionId: son.session_id, messages: mesajlar ?? [] })
  } catch (err) {
    next(err)
  }
})

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
