import { redis } from '../clients/redis.js'
import { supabase } from '../clients/supabase.js'
import { logger } from '../utils/logger.js'
import { embed } from './rag.js'
import { buildStudentContext } from './generation.js'

/**
 * KOÇ MASASI + Kaptan'ın 4 halkalı sohbet bağlamı (§3, §4.3).
 * Uzmanlar brief yazar (student_memory.briefs) → masa Redis'te sıcak tutulur →
 * Kaptan tek system prompt'la okur. Halka 4 = episodik anı çağırma (pgvector).
 */

const DESK_KEY = (uid: string): string => `lb:desk:${uid}`
const CHATWIN_KEY = (uid: string): string => `lb:chatwin:${uid}`
const DESK_TTL = 48 * 3600
const WINDOW_TURNS = 12 // 12 tur = 24 mesaj

export type ChatTurn = { role: 'user' | 'assistant'; content: string }

/** Masayı oku — Redis miss'te PG'den derle + cache'le. Boş masada legacy bağlama düşer. */
export async function composeDesk(userId: string): Promise<string> {
  if (redis) {
    const hot = await redis.get(DESK_KEY(userId))
    if (hot) return hot
  }
  const { data } = await supabase
    .from('student_memory')
    .select('semantic, briefs')
    .eq('user_id', userId)
    .maybeSingle()

  const briefs = (data?.briefs ?? {}) as Record<string, string>
  const semantic = (data?.semantic ?? {}) as Record<string, unknown>
  const parts: string[] = []

  const sem = Object.entries(semantic)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `- ${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
  if (sem.length) parts.push(`### ÖĞRENCİ GERÇEKLERİ (kalıcı)\n${sem.join('\n')}`)
  for (const [agent, brief] of Object.entries(briefs)) {
    if (brief) parts.push(`### ${agent.toUpperCase()} BRİEF\n${brief}`)
  }

  // Masa boşsa (yeni öğrenci / Kâtip henüz yazmadı) → canlı legacy bağlam (RPC'ler).
  const desk = parts.length
    ? parts.join('\n\n')
    : await buildStudentContext(userId).catch(() => 'Öğrenci bağlamı henüz oluşmadı (ONBOARDING).')

  if (redis) await redis.set(DESK_KEY(userId), desk, 'EX', DESK_TTL)
  return desk
}

/** Brief yazımından sonra masayı tazele (uzmanlar çağırır). */
export async function invalidateDesk(userId: string): Promise<void> {
  if (redis) await redis.del(DESK_KEY(userId))
}

/** Sohbet penceresi: son 12 tur ham (Redis) — restart'ta chat_messages'tan yeniden kurulabilir. */
export async function pushChatTurn(userId: string, turn: ChatTurn): Promise<void> {
  if (!redis) return
  const key = CHATWIN_KEY(userId)
  await redis
    .multi()
    .lpush(key, JSON.stringify(turn))
    .ltrim(key, 0, WINDOW_TURNS * 2 - 1)
    .expire(key, 86_400)
    .exec()
}

export async function readChatWindow(userId: string): Promise<ChatTurn[]> {
  if (!redis) return []
  const raw = await redis.lrange(CHATWIN_KEY(userId), 0, WINDOW_TURNS * 2 - 1)
  const out: ChatTurn[] = []
  for (const item of raw) {
    try {
      out.push(JSON.parse(item) as ChatTurn)
    } catch { /* bozuk kayıt atlanır */ }
  }
  return out.reverse() // kronolojik sıra (eski → yeni)
}

/** Halka 4 — episodik anı çağırma: mesajı embed'le, geçmiş oturum özetlerinde ara. */
export async function recallMemories(userId: string, query: string, k = 3): Promise<string> {
  try {
    const [qe] = await embed([query.slice(0, 500)])
    const { data, error } = await supabase.rpc('match_session_memories', {
      p_user_id: userId,
      query_embedding: qe,
      match_count: k,
    })
    if (error) throw error
    const rows = (data ?? []) as Array<{ summary: string; created_at: string; similarity: number }>
    const relevant = rows.filter((r) => r.similarity > 0.35)
    if (!relevant.length) return ''
    return relevant
      .map((r) => `- [${new Date(r.created_at).toLocaleDateString('tr-TR')}] ${r.summary}`)
      .join('\n')
  } catch (err) {
    logger.debug({ err }, 'recall atlandı (0005 uygulanmamış olabilir)')
    return ''
  }
}

/**
 * Kaptan'ın 4 halkalı bağlamı:
 *  [1] masa (stabil prefix — charter'ın hemen ardına)   [2] semantik masada gömülü
 *  [3] pencere (son 12 tur)                             [4] recall (ilgili geçmiş anılar)
 */
export async function composeChatContext(userId: string, userMsg: string): Promise<{
  desk: string
  recall: string
  window: ChatTurn[]
}> {
  const [desk, recall, window] = await Promise.all([
    composeDesk(userId),
    recallMemories(userId, userMsg),
    readChatWindow(userId),
  ])
  return { desk, recall, window }
}
