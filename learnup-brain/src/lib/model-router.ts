import OpenAI from 'openai'
import { openrouter } from '../clients/openrouter.js'
import { redis } from '../clients/redis.js'
import { logger } from '../utils/logger.js'

/** OPSİYONEL ikinci ücretsiz sohbet/üretim sağlayıcısı: Groq (~1000 istek/gün,
 *  DeepSeek R1 distill dahil). Zincir girdisi 'groq:<model>' öneklidir;
 *  GROQ_API_KEY .env'de yoksa bu girdiler sessizce atlanır — OpenRouter omurga kalır.
 *  NOT: Embeddings (vektörler) HER ZAMAN OpenRouter'dadır (rag.ts) — Groq embedding sunmaz. */
const groq: OpenAI | null = process.env.GROQ_API_KEY
  ? new OpenAI({ baseURL: 'https://api.groq.com/openai/v1', apiKey: process.env.GROQ_API_KEY })
  : null

type Provider = 'openrouter' | 'groq'
const parseEntry = (entry: string): { provider: Provider; model: string } =>
  entry.startsWith('groq:')
    ? { provider: 'groq', model: entry.slice(5) }
    : { provider: 'openrouter', model: entry }
const clientOf = (p: Provider): OpenAI | null => (p === 'groq' ? groq : openrouter)

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

/** Ücretsiz slug'lar zamanla değişebilir → env ile ezilebilir (virgülle ayrık zincir).
 *  2026-07-12 canlı katalog doğrulaması: DeepSeek :free varyantları KALKTI (404);
 *  gpt-oss-120b:free + nemotron:free + qwen3-next:free geçerli ve test edildi. */
const CHAINS: Record<LlmRole, string[]> = {
  chat: chainFromEnv('LLM_CHAIN_CHAT', [
    'groq:llama-3.3-70b-versatile',
    'groq:openai/gpt-oss-120b',
    'openai/gpt-oss-120b:free',
    'qwen/qwen3-next-80b-a3b-instruct:free',
    'meta-llama/llama-3.3-70b-instruct:free',
  ]),
  generate: chainFromEnv('LLM_CHAIN_GENERATE', [
    'groq:openai/gpt-oss-120b',
    'groq:llama-3.3-70b-versatile',
    'openai/gpt-oss-120b:free',
    'nvidia/nemotron-3-super-120b-a12b:free',
  ]),
  verify: chainFromEnv('LLM_CHAIN_VERIFY', [
    'groq:deepseek-r1-distill-llama-70b',   // DeepSeek R1 (distill) — Groq'ta ÜCRETSİZ
    'groq:openai/gpt-oss-120b',
    'openai/gpt-oss-120b:free',
    'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
  ]),
  fast: chainFromEnv('LLM_CHAIN_FAST', [
    'groq:llama-3.1-8b-instant',
    'nvidia/nemotron-nano-9b-v2:free',
    'meta-llama/llama-3.2-3b-instruct:free',
  ]),
}

function chainFromEnv(name: string, fallback: string[]): string[] {
  const raw = process.env[name]
  if (!raw) return fallback
  const list = raw.split(',').map((s) => s.trim()).filter(Boolean)
  return list.length ? list : fallback
}

const isFree = (entry: string): boolean => entry.endsWith(':free') || entry.startsWith('groq:')
const TIMEOUT_MS: Record<LlmRole, number> = { chat: 45_000, generate: 60_000, verify: 120_000, fast: 30_000 }
/** Sağlayıcı-başına dakika tavanı. */
const MINUTE_CAP: Record<Provider, number> = { openrouter: 18, groq: 25 }
/** Sağlayıcı-başına günlük ücretsiz tavan (env ile ezilebilir).
 *  OpenRouter kredisiz hesapta 50/gün → güvenli 45; $10 sonrası OPENROUTER_FREE_DAILY=950 yap. */
const DAY_CAP_BASE: Record<Provider, number> = {
  openrouter: Number(process.env.OPENROUTER_FREE_DAILY) || 45,
  groq: Number(process.env.GROQ_FREE_DAILY) || 900,
}
/** Öncelik payı: P0 tam tavan, P1 %95, P2 %85 (interaktifin payı asla yenmez). */
const PRIORITY_FACTOR: Record<LlmPriority, number> = { P0: 1, P1: 0.95, P2: 0.85 }

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

const dayKey = (p: Provider): string => `lb:llm:day:${p}:${new Date().toISOString().slice(0, 10)}`
const minuteKey = (p: Provider): string => `lb:llm:win:${p}:${Math.floor(Date.now() / 60_000)}`
const cbKey = (slug: string): string => `lb:llm:cb:${slug}`
const cbCountKey = (slug: string): string => `lb:llm:cbn:${slug}`

/** Ücretsiz slug için sağlayıcı-başına bütçe kapıları (aşımda false → zincirde ilerle). */
async function freeBudgetOk(provider: Provider, priority: LlmPriority): Promise<boolean> {
  const minute = await incr(minuteKey(provider), 120)
  if (minute > MINUTE_CAP[provider]) return false
  const day = await incr(dayKey(provider), 172_800)
  return day <= Math.floor(DAY_CAP_BASE[provider] * PRIORITY_FACTOR[priority])
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

/** Geçici arıza (429/5xx/timeout) → kesiciyi aç + zincirde ilerle. */
const isRetryable = (err: unknown): boolean => {
  const status = (err as { status?: number })?.status
  if (status === 429 || (typeof status === 'number' && status >= 500)) return true
  const name = (err as { name?: string })?.name
  return name === 'AbortError' || name === 'TimeoutError' || name === 'APIConnectionError'
}

/** Kalıcı slug arızası (model kalktı/kredi yok: 400/402/404) → kesicisiz atla, zincirde ilerle.
 *  Yalnız 401 (auth) anında fırlatılır — zincirle çözülemez. */
const isSkippable = (err: unknown): boolean => {
  const status = (err as { status?: number })?.status
  return status === 400 || status === 402 || status === 404
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
    const { provider, model } = parseEntry(slug)
    const client = clientOf(provider)
    if (!client) continue // GROQ_API_KEY yoksa groq girdileri atlanır
    if (await breakerOpen(slug)) continue
    if (isFree(slug) && !(await freeBudgetOk(provider, priority))) continue // bütçe → sıradaki
    try {
      const res = await client.chat.completions.create(
        { ...params, model },
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
      if (isSkippable(err)) {
        logger.warn({ slug, status: (err as { status?: number })?.status }, 'slug kalıcı arızalı — zincirde ilerleniyor')
        continue
      }
      throw err // 401 vb. — zincirle çözülmez
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
    const { provider, model } = parseEntry(slug)
    const client = clientOf(provider)
    if (!client) continue
    if (await breakerOpen(slug)) continue
    if (isFree(slug) && !(await freeBudgetOk(provider, priority))) continue
    try {
      const stream = await client.chat.completions.create(
        { ...params, model, stream: true },
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
      if (isSkippable(err)) {
        logger.warn({ slug, status: (err as { status?: number })?.status }, 'slug kalıcı arızalı — zincirde ilerleniyor')
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
