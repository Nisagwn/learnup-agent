import type OpenAI from 'openai'
import { TEMP } from '../lib/models.js'
import { routedStream } from '../lib/model-router.js'
import { composeChatContext, pushChatTurn } from '../lib/desk.js'
import { PERSONA_CHARTER, ONBOARDING_ADDENDUM } from '../persona/kaptan.charter.js'
import { supabase } from '../clients/supabase.js'
import { markActive } from './katip.js'
import { chatGate } from './nabiz.js'
import { KAPTAN_TOOLS, runKaptanTool } from './tools.js'
import { logger } from '../utils/logger.js'

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam

/** SSE olayı — chat route bunu `event: <type>` / `data: <json>` olarak akıtır. */
export type ChatEvent =
  | { type: 'token'; data: string }
  | { type: 'tool'; data: string }
  | { type: 'error'; data: string }

type AccToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } }
type DeltaToolCall = { index: number; id?: string; function?: { name?: string; arguments?: string } }

/** Stream'lenen tool_call delta'larını index'e göre birleştirir. */
function accumulate(acc: AccToolCall[], deltas: DeltaToolCall[]): void {
  for (const d of deltas) {
    acc[d.index] ??= { id: '', type: 'function', function: { name: '', arguments: '' } }
    const slot = acc[d.index]
    if (d.id) slot.id = d.id
    if (d.function?.name) slot.function.name += d.function.name
    if (d.function?.arguments) slot.function.arguments += d.function.arguments
  }
}

/**
 * Kaptan sohbet akışı — 4 halkalı hafıza (§4.3) + stream + tool-loop.
 *   [1] charter + Koç Masası (stabil prefix)  [2] semantik (masada gömülü)
 *   [3] son 12 tur pencere                    [4] episodik recall (anı endeksi)
 * Tur sonunda mesajlar chat_messages'a persist edilir (kopan istemcide kayıp yok).
 */
export async function* streamKaptan(
  userId: string,
  sessionId: string,
  userMsg: string,
): AsyncGenerator<ChatEvent> {
  const ctx = await composeChatContext(userId, userMsg)
  const isOnboarding = ctx.desk.includes('ONBOARDING')
  const system = [
    PERSONA_CHARTER,
    isOnboarding ? ONBOARDING_ADDENDUM : '',
    `\n### KOÇ MASASI\n${ctx.desk}`,
    ctx.recall ? `\n### GEÇMİŞ ANILAR (ilgili oturumlar)\n${ctx.recall}` : '',
  ].filter(Boolean).join('\n')

  const messages: ChatMessage[] = [
    { role: 'system', content: system },
    ...ctx.window.map((t): ChatMessage => ({ role: t.role, content: t.content })),
    { role: 'user', content: userMsg },
  ]
  let finalText = ''

  for (let turn = 0; turn < 6; turn++) {
    // P0 interaktif: ücretsiz zincir → bütçe dolarsa paid'e düşer, öğrenci hata görmez.
    const { stream } = await routedStream('chat', {
      temperature: TEMP.DERIVE,
      tools: KAPTAN_TOOLS,
      messages,
    }, { priority: 'P0' })

    const toolAcc: AccToolCall[] = []
    let text = ''
    for await (const chunk of stream) {
      const choice = chunk.choices[0]
      if (!choice) continue
      const delta = choice.delta
      if (delta.content) {
        text += delta.content
        yield { type: 'token', data: delta.content }
      }
      if (delta.tool_calls) accumulate(toolAcc, delta.tool_calls)
    }

    const toolCalls = toolAcc.filter((t) => t.function.name)
    messages.push(
      toolCalls.length
        ? { role: 'assistant', content: text || null, tool_calls: toolCalls }
        : { role: 'assistant', content: text },
    )
    if (text) finalText = text

    if (!toolCalls.length) {
      await persistTurn(userId, sessionId, userMsg, finalText)
      return // düz yanıt tamamlandı
    }

    for (const call of toolCalls) {
      let parsed: Record<string, unknown> = {}
      try {
        parsed = call.function.arguments
          ? (JSON.parse(call.function.arguments) as Record<string, unknown>)
          : {}
      } catch {
        parsed = {}
      }
      yield { type: 'tool', data: call.function.name }
      let out: unknown
      try {
        out = await runKaptanTool(call.function.name, parsed, userId)
      } catch (err) {
        out = { error: err instanceof Error ? err.message : 'araç hatası' }
        logger.error({ err, tool: call.function.name }, 'Kaptan aracı hata verdi')
      }
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(out) })
    }
  }
  // Tur limiti doldu — eldeki son metni yine de persist et.
  await persistTurn(userId, sessionId, userMsg, finalText)
}

/** Turu kalıcılaştır: chat_messages (PG hakikat) + Redis penceresi + Kâtip aktif kümesi. */
async function persistTurn(
  userId: string,
  sessionId: string,
  userMsg: string,
  assistantText: string,
): Promise<void> {
  try {
    const rows = [{ user_id: userId, session_id: sessionId, role: 'user', content: userMsg }]
    if (assistantText) {
      rows.push({ user_id: userId, session_id: sessionId, role: 'assistant', content: assistantText })
    }
    await supabase.from('chat_messages').insert(rows)
    await pushChatTurn(userId, { role: 'user', content: userMsg })
    if (assistantText) await pushChatTurn(userId, { role: 'assistant', content: assistantText })
    await markActive(userId)
    await chatGate(userId, userMsg) // Nabız duygu kapısı (async — gecikme eklemez)
  } catch (err) {
    logger.warn({ err }, 'sohbet turu persist edilemedi (izole)')
  }
}
