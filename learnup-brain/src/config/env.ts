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

  /**
   * ── OTURUM YÖNETİMİ (Redis, AYRI DB) ──
   *
   * ⚠️ NEDEN REDIS_URL'DEN AYRI: REDIS_URL (db 1) cache + rate-limit + kuyruk taşır; bunlar
   * ATILABİLİR veridir ve operasyonda `FLUSHDB` ile temizlenirler. Oturum kaydı atılabilir
   * DEĞİLDİR: silinmesi "iptal edilmiş oturumun geri dirilmesi" demektir — çıkış yaptırdığın
   * cihaz yeniden içeri girer. Ayrı DB (…/2) bu iki ömrü birbirine karıştırmaz.
   *
   * Verilmezse oturum katmanı KAPALI olur: kimlik doğrulama eskisi gibi salt-JWT yürür,
   * yalnız oturum kaydı/iptali devre dışı kalır (fail-open — bkz. middleware/oturum.ts).
   */
  SESSION_REDIS_URL: z.string().url().optional(),
  /**
   * Oturum kaydının hareketsizlik ömrü (gün). Her istekte tazelenir; bu süre boyunca hiç
   * istek gelmezse kayıt kendiliğinden düşer. Supabase refresh token ömründen KISA olması
   * sorun değil: kullanıcı tekrar isteyince kayıt yeniden yazılır (aynı session_id ile).
   */
  SESSION_TTL_GUN: z.coerce.number().int().positive().max(365).default(30),

  /**
   * GECE DEMİRHANESİ — VARSAYILAN KAPALI. Bilinçli olarak "opt-in".
   *
   * ⚠️ NEDEN KAPALI: demirhane P2 önceliğiyle çalışıyor ama P2 yalnız ÜCRETSİZ sağlayıcıların
   * (OpenRouter/Groq) günlük kotasını interaktif kullanıcıya saklar. isFree() yalnız ':free'
   * son ekine bakar → generate/verify zincirlerinin başındaki PARALI DeepSeek slug'ları
   * (v4-pro üretim, v4-flash doğrulama) bütçe kapısına HİÇ girmez: gece işi doğrudan paralı
   * modele gider ve önünde tavan yoktur. Worker 7/24 ayaktayken (Docker) bu, her gece haberin
   * olmadan gerçek para harcaması demektir.
   *
   * DeepSeek'e geçişle bu riskin BÜYÜKLÜĞÜ düştü ama YAPISI değişmedi: tavansız paralı hat
   * hâlâ tavansız. Ucuz olması "sınırsız" demek değil — kapı bilinçli olarak kapalı kalıyor.
   * Kabul edilen soru başına ~$0.002 (üretim + denetim; sağlayıcı sabitlemesi + ucuz hakem
   * sonrası fiyat oranından türetildi). Kötü bir gece yüzlerce çağrı demek; ucuzluk tavan
   * yerine geçmez, tavan koymadan açmak hâlâ habersiz harcamadır.
   *
   * Kod silinmedi; yalnız kapı kapalı. Açmak için: NIGHTLY_FORGE=on
   * Açmadan önce paralı hatta sert bir gece tavanı eklenmeli (bkz. topup-planner.ts).
   */
  NIGHTLY_FORGE: z.enum(['on', 'off']).default('off'),

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
