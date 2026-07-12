import type OpenAI from 'openai'
import { openrouter } from '../clients/openrouter.js'
import { redis } from '../clients/redis.js'
import { logger } from '../utils/logger.js'

/**
 * MODEL YÖNLENDİRİCİ (§5.4) — ücretsiz-önce zincir + bütçe + devre kesici + timeout.
 *   route(role) → [birincil :free, alternatif :free, PAID] sırayla dene;
 *   her deneme: kesici → dakika penceresi → günlük sayaç → çağrı (AbortSignal.timeout).
 * Zincir DAİMA paid slug'da biter: öğrenci sohbet ortasında asla hata görmez.
 * Redis yoksa bütçe/kesici in-memory yaklaşık çalışır (doğruluk değil hassasiyet düşer).
 */

export type LlmRole = 'chat' | 'generate' | 'verify' | 'fast'
/** P0 interaktif (Kaptan) · P1 doğrulama/canlı üretim · P2 gece batch. */
export type LlmPriority = 'P0' | 'P1' | 'P2'

/** Ücretsiz slug'lar zamanla değişebilir → env ile ezilebilir (virgülle ayrık zincir). */
const CHAINS: Record<LlmRole, string[]> = {
  chat: chainFromEnv('LLM_CHAIN_CHAT', [
    'deepseek/deepseek-chat-v3-0324:free',
    'meta-llama/llama-3.3-70b-instruct:free',
    'deepseek/deepseek-chat',
  ]),
  generate: chainFromEnv('LLM_CHAIN_GENERATE', [
    'deepseek/deepseek-chat-v3-0324:free',
    'meta-llama/llama-3.3-70b-instruct:free',
    'deepseek/deepseek-chat',
  ]),
  verify: chainFromEnv('LLM_CHAIN_VERIFY', [
    'deepseek/deepseek-r1:free',
    'deepseek/deepseek-r1',
  ]),
  fast: chainFromEnv('LLM_CHAIN_FAST', [
    'meta-llama/llama-3.1-8b-instruct:free',
    'deepseek/deepseek-chat-v3-0324:free',
    'deepseek/deepseek-chat',
  ]),
}

function chainFromEnv(name: string, fallback: string[]): string[] {
  const raw = process.env[name]
  if (!raw) return fallback
  const list = raw.split(',').map((s) => s.trim()).filter(Boolean)
  return list.length ? list : fallback
}

const isFree = (slug: string): boolean => slug.endsWith(':free')
const TIMEOUT_MS: Record<LlmRole, number> = { chat: 45_000, generate: 60_000, verify: 120_000, fast: 30_000 }
/** Dakika penceresi tavanı (hesap-geneli 20/dk'ya 2 tampon). */
const MINUTE_CAP = 18
/** Günlük ücretsiz tavan; öncelik sınıfına göre kesim ($10 sonrası 1000/gün). */
const DAY_CAP: Record<LlmPriority, number> = { P0: 1000, P1: 950, P2: 850 }

// ── In-memory fallback (Redis yoksa) ──
const memCounters = new Map<string, { n: number; exp: number }>()
const memInc = (key: string, ttlSec: number): number => {
  const now = Date.now()
  const cur = memCounters.get(key)
  if (!cur || cur.exp < now) {
    memCounters.set(key, { n: 1, exp: now + ttlSec * 1000 })
    return 1
  }
  cur.n += 1
  return cur.n
}
const memGet = (key: string): number => {
  const cur = memCounters.get(key)
  return cur && cur.exp > Date.now() ? cur.n : 0
}
const memSet = (key: string, ttlSec: number): void => {
  memCounters.set(key, { n: 1, exp: Date.now() + ttlSec * 1000 })
}

async function incr(key: string, ttlSec: number): Promise<number> {
  if (!redis) return memInc(key, ttlSec)
  const n = await redis.incr(key)
  if (n === 1) await redis.expire(key, ttlSec)
  return n
}

const dayKey = (): string => `lb:llm:day:${new Date().toISOString().slice(0, 10)}`
const minuteKey = (): string => `lb:llm:win:${Math.floor(Date.now() / 60_000)}`
const cbKey = (slug: string): string => `lb:llm:cb:${slug}`
const cbCountKey = (slug: string): string => `lb:llm:cbn:${slug}`

/** Ücretsiz slug için bütçe kapıları: dakika + gün (aşımda false → zincirde ilerle). */
async function freeBudgetOk(priority: LlmPriority): Promise<boolean> {
  const minute = await incr(minuteKey(), 120)
  if (minute > MINUTE_CAP) return false
  const day = await incr(dayKey(), 172_800)
  return day <= DAY_CAP[priority]
}

async function breakerOpen(slug: string): Promise<boolean> {
  if (!redis) return memGet(cbKey(slug)) > 0
  return (await redis.exists(cbKey(slug))) === 1
}

/** 429/5xx/timeout'ta kesiciyi aç — üstel soğuma 30s→5dk. */
async function tripBreaker(slug: string): Promise<void> {
  const n = await incr(cbCountKey(slug), 3600)
  const cooldown = Math.min(300, 30 * 2 ** Math.max(0, n - 1))
  if (!redis) memSet(cbKey(slug), cooldown)
  else await redis.set(cbKey(slug), '1', 'EX', cooldown)
  logger.warn({ slug, cooldown }, 'model kesicisi açıldı')
}

async function resetBreaker(slug: string): Promise<void> {
  if (!redis) {
    memCounters.delete(cbCountKey(slug))
    return
  }
  await redis.del(cbCountKey(slug))
}

const isRetryable = (err: unknown): boolean => {
  const status = (err as { status?: number })?.status
  if (status === 429 || (typeof status === 'number' && status >= 500)) return true
  const name = (err as { name?: string })?.name
  return name === 'AbortError' || name === 'TimeoutError' || name === 'APIConnectionError'
}

type ChatParams = Omit<OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming, 'model'>
type StreamParams = Omit<OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming, 'model' | 'stream'>

/** Zincirden uygun slug'ları sırayla dener; hepsi düşerse son hatayı fırlatır. */
export async function routedChat(
  role: LlmRole,
  params: ChatParams,
  opts: { priority?: LlmPriority } = {},
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const priority = opts.priority ?? 'P1'
  let lastErr: unknown = new Error(`model zinciri boş: ${role}`)
  for (const slug of CHAINS[role]) {
    if (await breakerOpen(slug)) continue
    if (isFree(slug) && !(await freeBudgetOk(priority))) continue // bütçe → sıradaki (paid'e düşer)
    try {
      const res = await openrouter.chat.completions.create(
        { ...params, model: slug },
        { signal: AbortSignal.timeout(TIMEOUT_MS[role]) },
      )
      void resetBreaker(slug)
      return res
    } catch (err) {
      lastErr = err
      if (isRetryable(err)) {
        await tripBreaker(slug)
        continue
      }
      throw err // model/parametre hatası — zincirle çözülmez
    }
  }
  throw lastErr
}

/**
 * Stream varyantı (Kaptan SSE). Fallback yalnız BAŞLATMA hatasında işler;
 * akış ortası kopmalar çağıranın sorumluluğudur (mesaj yine persist edilir).
 */
export async function routedStream(
  role: LlmRole,
  params: StreamParams,
  opts: { priority?: LlmPriority } = {},
): Promise<{ stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>; model: string }> {
  const priority = opts.priority ?? 'P0'
  let lastErr: unknown = new Error(`model zinciri boş: ${role}`)
  for (const slug of CHAINS[role]) {
    if (await breakerOpen(slug)) continue
    if (isFree(slug) && !(await freeBudgetOk(priority))) continue
    try {
      const stream = await openrouter.chat.completions.create(
        { ...params, model: slug, stream: true },
        { signal: AbortSignal.timeout(TIMEOUT_MS[role]) },
      )
      void resetBreaker(slug)
      return { stream, model: slug }
    } catch (err) {
      lastErr = err
      if (isRetryable(err)) {
        await tripBreaker(slug)
        continue
      }
      throw err
    }
  }
  throw lastErr
}

/** Kısayol: tek metin yanıtı (questions-ai.llmChat halefi). */
export async function routedText(
  role: LlmRole,
  params: ChatParams,
  opts: { priority?: LlmPriority } = {},
): Promise<string> {
  const res = await routedChat(role, params, opts)
  return res.choices[0]?.message?.content ?? ''
}
