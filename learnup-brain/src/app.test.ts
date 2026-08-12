/** Rota yüzeyi sözleşmesi (GOREV-016) — çıkmış uçlar kapalı, sıralama kuralı korunur. */
import { expect, test, describe, mock } from 'bun:test'

// ⚠️ Redis'i sürece HİÇ sokma: REDIS_URL varken rate-limit-redis, store kurulurken kapalı
// Redis'e bağlanmayı dener ve "unhandled error between tests" üretir (bun test → exit 1).
// Env'den silmek İŞE YARAMAZ — config/env.ts'in `dotenv/config`'i değişkeni .env'den geri
// yükler. Ölçülen şey ROTA YÜZEYİ, Redis değil → istemci modülü mock'lanır (redis=null →
// buildStore undefined → in-memory limiter; üründeki "Redis kapalı" dereceli modun aynısı).
mock.module('./clients/redis.js', () => ({
  redis: null,
  redisBlocking: null,
  redisLimiter: null,
  redisSession: null,
  redisTry: async (_fn: unknown, fallback: unknown) => fallback,
  redisSessionTry: async (_fn: unknown, fallback: unknown) => fallback,
  redisReady: async () => false,
  requireRedis: () => {
    throw new Error('test: redis yok')
  },
  pingRedis: async () => 'disabled',
  pingSessionRedis: async () => 'disabled',
}))
const { createApp } = await import('./app.js')

type Katman = { regexp?: RegExp; name?: string }

/**
 * Express 4 iç yüzeyi: mount edilmiş her katmanın yol deseni (kaynak sırasıyla).
 *
 * ⚠️ `app.use(yol, mw1, mw2, router)` katman başına BİR giriş yazar — yani aynı yol
 * handler sayısı kadar tekrar eder. Yol varlığını sayıyla ölçme, `some/findIndex` kullan.
 */
function mountDesenleri(app: unknown): string[] {
  return katmanlar(app)
    .map((k) => String(k.regexp ?? ''))
    .filter((s) => s !== '')
}

function katmanlar(app: unknown): Katman[] {
  return (app as { _router?: { stack?: Katman[] } })._router?.stack ?? []
}

describe('app rota yüzeyi — telif kararı (2026-07-22)', () => {
  const desenler = mountDesenleri(createApp())

  test("/questions/osym HİÇBİR katmanda yok → istek notFound'a düşer (404, kaynak yok gibi)", () => {
    // 404'ün kanıtı: yol hiçbir router'a eşleşmiyorsa zincirin sonu middleware/error.ts
    // notFound'dur. Ayrı bir "osym → 404 handler" YOKTUR — kalması yeniden açılma riskiydi.
    expect(desenler.some((d) => d.includes('osym'))).toBe(false)
  })

  test("rota sırası korunur: /questions/ai, /questions'tan ÖNCE (V§3.5.8)", () => {
    const aiIdx = desenler.findIndex((d) => d.includes('questions\\/ai'))
    const govdeIdx = desenler.findIndex((d) => d.includes('questions\\/?') && !d.includes('questions\\/ai'))
    expect(aiIdx).toBeGreaterThanOrEqual(0)
    expect(govdeIdx).toBeGreaterThan(aiIdx)
  })

  test('oturum uçları hem /api hem /api/v1 altında mount edilir', () => {
    const yollar = new Set(desenler.filter((d) => d.includes('oturum')))
    expect(yollar.size).toBe(2) // /api/oturum + /api/v1/oturum
  })
})

describe('kimlik zinciri — oturum kapısı (GOREV: Redis oturum yönetimi)', () => {
  /**
   * Zincirin SIRASI sözleşmedir: requireAuth → oturumKapisi → requireAktifHesap.
   * Kapı listeden düşerse iptal edilen oturumlar yaşamaya devam eder; askı kapısının
   * ARDINA kayarsa sonlandırılmış bir oturum önce profil sorgusu ödetir. Test tam olarak
   * bu sıranın kazara bozulmamasını ölçer (app.ts `kimlikli` sabiti).
   */
  const zincir = katmanlar(createApp())
    .filter((k) => String(k.regexp ?? '').includes('chat'))
    .map((k) => k.name ?? '')

  test('kapı zincirde ve sırası doğru', () => {
    const auth = zincir.indexOf('requireAuth')
    const oturum = zincir.indexOf('oturumKapisi')
    const aski = zincir.indexOf('requireAktifHesap')
    expect(auth).toBeGreaterThanOrEqual(0)
    expect(oturum).toBeGreaterThan(auth)
    expect(aski).toBeGreaterThan(oturum)
  })
})
