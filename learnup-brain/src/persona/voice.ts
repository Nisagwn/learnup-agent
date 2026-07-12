import { routedText } from '../lib/model-router.js'
import { composeDesk } from '../lib/desk.js'
import { PERSONA_CHARTER } from './kaptan.charter.js'

/**
 * speakAsKaptan (§3) — chat DIŞINDA öğrenci-yüzlü metnin TEK üreticisi.
 * Uzmanlar asla kendi cümlesini kurmaz; yapısal intent verir, Kaptan konuşur.
 */
export async function speakAsKaptan(
  userId: string,
  intent: string,
  payload: Record<string, unknown> = {},
): Promise<string> {
  const desk = await composeDesk(userId)
  const text = await routedText('chat', {
    temperature: 0.6,
    max_tokens: 200,
    messages: [
      {
        role: 'system',
        content: `${PERSONA_CHARTER}\n\n### KOÇ MASASI\n${desk}\n\nGÖREV: Aşağıdaki amaç için öğrenciye TEK kısa bildirim mesajı yaz (1-3 cümle, bildirim formatı — selamlama uzatma).`,
      },
      { role: 'user', content: `Amaç: ${intent}\nVeri: ${JSON.stringify(payload)}` },
    ],
  }, { priority: 'P1' })
  return text.trim()
}
