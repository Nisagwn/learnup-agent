import { Router } from 'express'
import { llmChat, CHAT_MODEL } from '../lib/questions-ai.js'

/** Basit AI sohbet proxy'si (OpenRouter/DeepSeek). Kaptan'ın SSE `/api/chat`'inden AYRI, non-stream.
 *  (Edge: get-ai-response — orada auth yoktu; burada `requireAuth` altında, LLM proxy'sini korur.) */
export const aiRouter = Router()

// POST /api/ai/respond
aiRouter.post('/respond', async (req, res, next) => {
  try {
    const { history, userMessage } = req.body ?? {}
    if (!userMessage) {
      res.status(400).json({ error: 'userMessage eksik.' })
      return
    }

    const messages: any[] = [{
      role: 'system',
      content: 'Sen LearnUp platformunun asistanısın. Lise müfredatına hakimsin ve öğrencilere Türkçe, destekleyici ve kısa cevaplar verirsin.',
    }]
    if (Array.isArray(history)) {
      history.slice(-4).forEach((item: any) => {
        const role = item.role === 'model' || item.role === 'assistant' ? 'assistant' : 'user'
        const content = (item.parts && item.parts[0] && item.parts[0].text) || item.content || item.text || ''
        if (content) messages.push({ role, content })
      })
    }
    messages.push({ role: 'user', content: userMessage })

    const reply = await llmChat(messages, { model: CHAT_MODEL, temperature: 0.5, max_tokens: 1024 })
    res.json({ reply: reply || 'Cevap üretilemedi.' })
  } catch (err) {
    next(err)
  }
})
