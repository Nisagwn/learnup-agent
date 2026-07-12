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
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1), // GİZLİ service-role (sb_secret_…) — RLS baypas, yalnız sunucu
  // Asimetrik JWT doğrulama (JWKS). Verilmezse SUPABASE_URL'den türetilir (ek değişken gerekmez).
  SUPABASE_JWKS_URL: z.string().url().optional(),

  // ── LLM + Embeddings: chat/completions VE embeddings → OpenRouter ──
  // (DeepSeek sohbet/üretim + text-embedding-3-small @768; ayrı OpenAI anahtarı gerekmez.)
  OPENROUTER_API_KEY: z.string().min(1),

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

const data = parsed.data
export const env = {
  ...data,
  // JWKS URL açıkça verilmediyse Supabase konvansiyonundan türet.
  SUPABASE_JWKS_URL: data.SUPABASE_JWKS_URL ?? `${data.SUPABASE_URL}/auth/v1/.well-known/jwks.json`,
}
export type Env = typeof env
