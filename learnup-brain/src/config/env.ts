import 'dotenv/config'
import { z } from 'zod'

/**
 * Ortam değişkenleri — fail-fast doğrulama.
 * Eksik/geçersiz env varsa process, anlaşılır bir hata listesiyle başlangıçta durur.
 * Uygulamanın her yerinden `import { env } from './config/env.js'` ile tip-güvenli erişilir.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),

  // ── Supabase (veri + hafıza deposu) ──
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1), // RLS baypas — yalnız sunucu
  SUPABASE_JWT_SECRET: z.string().min(1), // lokal JWT doğrulama (HS256)

  // ── LLM: chat/completions → OpenRouter (DeepSeek) ──
  OPENROUTER_API_KEY: z.string().min(1),

  // ── Embeddings: text-embedding-3-small @768 → DOĞRUDAN OpenAI (F2) ──
  OPENAI_API_KEY: z.string().min(1),

  // ── Redis (hot-path; ajan orkestrasyonu — bu fazda opsiyonel) ──
  REDIS_URL: z.string().url().optional(),

  // Attribution / istemci URL'i (OpenRouter HTTP-Referer)
  APP_URL: z.string().url().default('https://learnup.app'),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n')
  console.error(`\n[env] Ortam değişkeni doğrulaması başarısız:\n${issues}\n`)
  console.error('İpucu: `.env.example` dosyasını `.env` olarak kopyalayıp doldurun.\n')
  process.exit(1)
}

export const env = parsed.data
export type Env = typeof env
