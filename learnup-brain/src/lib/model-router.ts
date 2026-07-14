import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
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

/** BİRİNCİL sağlayıcı: Anthropic (resmi SDK — OpenAI-shim değil). ANTHROPIC_API_KEY yoksa atlanır.
 *  Embeddings Anthropic'te YOK → vektörler OpenRouter'da kalır (rag.ts, değişmedi). */
const anthropic: Anthropic | null = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null

type Provider = 'openrouter' | 'groq' | 'anthropic'
const parseEntry = (entry: string): { provider: Provider; model: string } => {
  if (entry.startsWith('groq:')) return { provider: 'groq', model: entry.slice(5) }
  if (entry.startsWith('anthropic:')) return { provider: 'anthropic', model: entry.slice(10) }
  return { provider: 'openrouter', model: entry }
}
const clientOf = (p: Provider): OpenAI | null => (p === 'groq' ? groq : p === 'anthropic' ? null : openrouter)

/** Anthropic Messages API adaptörü — OpenAI-biçimli params'ı çevirir, yanıtı OpenAI şekline sarar.
 *  Not: tools/stream desteklemez (o çağrılar zincirde sonraki sağlayıcıya akar).
 *  Sıcaklık geçilmez (Sonnet 5 default-dışı sampling'i 400'ler); JSON istekleri system'e yönerge ekler. */
async function anthropicChat(
  model: string,
  params: ChatParams,
  signal: AbortSignal,
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const sysParts: string[] = []
  const msgs: Anthropic.MessageParam[] = []
  for (const m of params.messages) {
    const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '')
    if (m.role === 'system') sysParts.push(text)
    else if (m.role === 'user' || m.role === 'assistant') msgs.push({ role: m.role, content: text })
  }
  if ((params.response_format as { type?: string } | undefined)?.type === 'json_object') {
    sysParts.push('Yanıtını YALNIZ geçerli bir JSON objesi olarak ver; başka hiçbir metin yazma.')
  }
  if (msgs.length === 0 || msgs[0].role !== 'user') msgs.unshift({ role: 'user', content: 'Devam et.' })

  const res = await anthropic!.messages.create(
    {
      model,
      max_tokens: params.max_tokens ?? 2048,
      system: sysParts.length ? sysParts.join('\n\n') : undefined,
      messages: msgs,
    },
    { signal },
  )
  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
  return {
    id: res.id,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: res.model,
    choices: [{
      index: 0,
      message: { role: 'assistant', content: text, refusal: null },
      finish_reason: res.stop_reason === 'max_tokens' ? 'length' : 'stop',
      logprobs: null,
    }],
    usage: {
      prompt_tokens: res.usage.input_tokens,
      completion_tokens: res.usage.output_tokens,
      total_tokens: res.usage.input_tokens + res.usage.output_tokens,
    },
  }
}

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
    'anthropic:claude-haiku-4-5',            // $1/$5 MTok — chat/ipucu (~$0.003/mesaj)
    'groq:llama-3.3-70b-versatile',
    'openai/gpt-oss-120b:free',
    'meta-llama/llama-3.3-70b-instruct:free',
  ]),
  generate: chainFromEnv('LLM_CHAIN_GENERATE', [
    'anthropic:claude-sonnet-5',             // $3/$15 (intro $2/$10) — ÖSYM üretimi
    'groq:openai/gpt-oss-120b',
    'openai/gpt-oss-120b:free',
    'nvidia/nemotron-3-super-120b-a12b:free',
  ]),
  verify: chainFromEnv('LLM_CHAIN_VERIFY', [
    'anthropic:claude-sonnet-5',             // adaptif düşünme yerleşik — bağımsız denetçi
    'groq:deepseek-r1-distill-llama-70b',
    'openai/gpt-oss-120b:free',
    'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
  ]),
  fast: chainFromEnv('LLM_CHAIN_FAST', [
    'anthropic:claude-haiku-4-5',
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
/** Rol başına timeout. `generate` 60sn'ydi ve YETMİYORDU: tek çağrıda 4 tam ÖSYM sorusu
 *  + çözümleri (max_tokens 8000) yazılıyor; Sonnet bunu 60sn'de bitiremeyip abort ediliyordu.
 *  Üretim interaktif değil (P1 canlı top-up / P2 gece batch) → bekleyebilir. `chat` P0 kalır. */
const TIMEOUT_MS: Record<LlmRole, number> = { chat: 45_000, generate: 150_000, verify: 120_000, fast: 30_000 }
/** Sağlayıcı-başına dakika tavanı. */
const MINUTE_CAP: Record<Provider, number> = { openrouter: 18, groq: 25, anthropic: 999 }
/** Sağlayıcı-başına günlük ücretsiz tavan (env ile ezilebilir).
 *  OpenRouter kredisiz hesapta 50/gün → güvenli 45; $10 sonrası OPENROUTER_FREE_DAILY=950 yap. */
const DAY_CAP_BASE: Record<Provider, number> = {
  openrouter: Number(process.env.OPENROUTER_FREE_DAILY) || 45,
  groq: Number(process.env.GROQ_FREE_DAILY) || 900,
  anthropic: 999_999, // paid — bütçe kapısına girmez (isFree=false)
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

const dayKey = (p: Provider): string => `lb:llm:day:${p}:${new Date().toISOString().slice(0, 10)}`
const minuteKey = (p: Provider): string => `lb:llm:win:${p}:${Math.floor(Date.now() / 60_000)}`
const cbKey = (slug: string): string => `lb:llm:cb:${slug}`
const cbCountKey = (slug: string): string => `lb:llm:cbn:${slug}`

/**
 * ⚠️ BU KAPILARIN HİÇBİRİ REDIS YÜZÜNDEN İSTEĞİ ÖLDÜREMEZ.
 *
 * Redis hot-path client'ı artık `enableOfflineQueue:false` (bkz. clients/redis.ts) — yani
 * Redis kapalıyken komut BEKLEMEZ, anında REDDEDER. Bu doğru davranış, ama bedeli şu:
 * bu kapılar routedChat'in try bloğunun DIŞINDA çağrılıyor; yakalanmazlarsa reddediş
 * dışarı kaçar ve HİÇBİR SAĞLAYICI DENENMEZ. Redis düşünce sohbet, üretim, doğrulama —
 * hepsi anında ölür. Bu tam olarak "Redis = hot-path, yokluğu yavaşlatır kilitlemez"
 * kuralının ihlali olurdu.
 * → Her Redis dokunuşu yakalanır ve in-memory sayaca düşer. Bütçe hassasiyeti azalır
 *   (process-başına yaklaşık sayım), ama servis AYAKTA kalır. Doğru takas budur.
 */
async function incr(key: string, ttlSec: number): Promise<number> {
  if (!redis) return memInc(key, ttlSec)
  try {
    const n = await redis.incr(key)
    if (n === 1) await redis.expire(key, ttlSec)
    return n
  } catch {
    return memInc(key, ttlSec) // Redis düştü → yaklaşık say, isteği ÖLDÜRME
  }
}

/** Ücretsiz slug için sağlayıcı-başına bütçe kapıları (aşımda false → zincirde ilerle). */
async function freeBudgetOk(provider: Provider, priority: LlmPriority): Promise<boolean> {
  const minute = await incr(minuteKey(provider), 120)
  if (minute > MINUTE_CAP[provider]) return false
  const day = await incr(dayKey(provider), 172_800)
  return day <= Math.floor(DAY_CAP_BASE[provider] * PRIORITY_FACTOR[priority])
}

async function breakerOpen(slug: string): Promise<boolean> {
  if (!redis) return memGet(cbKey(slug)) > 0
  try {
    return (await redis.exists(cbKey(slug))) === 1
  } catch {
    return memGet(cbKey(slug)) > 0 // Redis yok → kesiciyi in-memory'den oku (fail-open)
  }
}

/** 429/5xx/ağ/timeout'ta kesiciyi aç — üstel soğuma 30s→5dk. */
async function tripBreaker(slug: string): Promise<void> {
  const n = await incr(cbCountKey(slug), 3600)
  const cooldown = Math.min(300, 30 * 2 ** Math.max(0, n - 1))
  memSet(cbKey(slug), cooldown) // her hâlükârda in-memory (Redis düşerse tek dayanak bu)
  if (redis) await redis.set(cbKey(slug), '1', 'EX', cooldown).catch(() => {})
  logger.warn({ slug, cooldown }, 'model kesicisi açıldı')
}

async function resetBreaker(slug: string): Promise<void> {
  memCounters.delete(cbKey(slug))
  memCounters.delete(cbCountKey(slug))
  if (redis) await redis.del(cbCountKey(slug)).catch(() => {})
}

/**
 * SDK hatasının GERÇEK sınıf adı.
 *
 * ⚠️ OpenAI ve Anthropic SDK'ları (ikisi de Stainless üretimi) hata sınıflarında
 * `this.name` ATAMIYOR. `class APIConnectionError extends APIError` yazmak err.name'i
 * DEĞİŞTİRMEZ — 'Error' kalır. Ampirik doğrulandı:
 *     new OpenAI.APIConnectionError({message:'boom'})  →  name: "Error", status: undefined
 * Sonuç: isRetryable'ın `name === 'APIConnectionError'` kontrolü HİÇ EŞLEŞMEDİ. Ağ kopması,
 * DNS/TLS hatası, socket hang-up → retryable değil, skippable değil → throw → ZİNCİR ÇÖKÜYOR.
 * Fallback zinciri, tam da var olma sebebi olan durumda (sağlayıcının ağı bozuk) ölüydü.
 * Gerçek ad yalnız constructor.name'de yaşıyor.
 */
const errName = (err: unknown): string => {
  const e = err as { name?: string; constructor?: { name?: string } }
  return e?.name && e.name !== 'Error' ? e.name : (e?.constructor?.name ?? 'Error')
}

/** Geçici arıza (429/5xx/ağ/timeout) → kesiciyi aç + zincirde ilerle.
 *  APIUserAbortError BİLEREK yok: o, öğrencinin akışı iptal etmesidir; yeniden denemek
 *  iptal edilmiş isteği tekrar çağırmak olur. Bizim timeout'umuz withTimeout() içinde
 *  açıkça TimeoutError'a çevriliyor. */
const RETRY_NAMES = new Set([
  'AbortError',
  'TimeoutError',
  'APIConnectionError',
  'APIConnectionTimeoutError',
  'InternalServerError',
  'RateLimitError',
])
const isRetryable = (err: unknown): boolean => {
  const status = (err as { status?: number })?.status
  if (status === 429 || (typeof status === 'number' && status >= 500)) return true
  return RETRY_NAMES.has(errName(err))
}

/**
 * TIMEOUT'U KENDİ ABORT'UMUZLA KUR — sonra onu açıkça TimeoutError'a çevir.
 *
 * NEDEN böyle: `AbortSignal.timeout()` kullanınca Anthropic SDK'sı `APIUserAbortError`
 * fırlatıyor; adı ne 'AbortError' ne 'TimeoutError' → isRetryable FALSE dönüyordu →
 * routedChat `throw err` yapıp ZİNCİRİ ÇÖKERTİYORDU. Yani birincil sağlayıcı zaman
 * aşımına uğradığı anda Groq/OpenRouter'a hiç geçilmiyordu — fallback'in tam olarak
 * gerektiği durumda devre dışıydı. (Ölçüldü: gen-smoke, Sonnet 60sn'yi aştı → script öldü.)
 *
 * "APIUserAbortError'ı da retryable say" demek YANLIŞ olurdu: o hata öğrenci akışı
 * iptal ettiğinde de fırlar; onu yeniden denemek iptal edilen isteği tekrar çağırmak olur.
 * Ayrımı ancak abort'a KİMİN sebep olduğunu bilerek yapabiliriz → kendi controller'ımız.
 */
async function withTimeout<T>(ms: number, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), ms)
  try {
    return await fn(ac.signal)
  } catch (err) {
    if (ac.signal.aborted) {
      const e = new Error(`model zaman aşımı (${ms} ms)`)
      e.name = 'TimeoutError' // → isRetryable → kesici açılır, zincirde ilerlenir
      throw e
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
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
    // Anthropic: resmi SDK adaptörü (tools'lu istekler zincirde sonrakine akar)
    if (provider === 'anthropic' && (!anthropic || params.tools?.length)) continue
    const client = clientOf(provider)
    if (provider !== 'anthropic' && !client) continue // GROQ_API_KEY yoksa groq atlanır
    if (await breakerOpen(slug)) continue
    if (isFree(slug) && !(await freeBudgetOk(provider, priority))) continue // bütçe → sıradaki
    try {
      const res = await withTimeout(TIMEOUT_MS[role], (signal) =>
        provider === 'anthropic'
          ? anthropicChat(model, params, signal)
          : client!.chat.completions.create({ ...params, model }, { signal }),
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
    if (provider === 'anthropic') continue // stream adaptörü yok — sonraki sağlayıcı akıtır
    const client = clientOf(provider)
    if (!client) continue
    if (await breakerOpen(slug)) continue
    if (isFree(slug) && !(await freeBudgetOk(provider, priority))) continue
    try {
      // withTimeout: (1) timeout'u TimeoutError'a çevirir → zincir çökmez, sonraki sağlayıcıya
      // geçer (routedChat'teki düzeltmenin aynısı; burada eksikti — P0 sohbet yolu bu).
      // (2) Zamanlayıcı create() dönünce finally'de TEMİZLENİR. Eski AbortSignal.timeout(45sn)
      // akışa bağlı kalıyordu: 45sn'den uzun süren bir cevap ORTASINDAN kesiliyordu. Artık
      // timeout yalnız BAŞLATMAYA (ilk bayta kadar) uygulanır — akışın süresi sınırsız.
      const stream = await withTimeout(TIMEOUT_MS[role], (signal) =>
        client.chat.completions.create({ ...params, model, stream: true }, { signal }),
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
