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
  redisTry: async (_fn: unknown, fallback: unknown) => fallback,
  redisReady: async () => false,
  requireRedis: () => {
    throw new Error('test: redis yok')
  },
  pingRedis: async () => 'disabled',
}))
const { createApp } = await import('./app.js')

type Katman = { regexp?: RegExp }

/** Express 4 iç yüzeyi: mount edilmiş her katmanın yol deseni (kaynak sırasıyla). */
function mountDesenleri(app: unknown): string[] {
  const stack = (app as { _router?: { stack?: Katman[] } })._router?.stack ?? []
  return stack.map((k) => String(k.regexp ?? '')).filter((s) => s !== '')
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
})
