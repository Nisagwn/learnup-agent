/**
 * ÖĞRETMEN BAŞVURU UCU — davranış + GÜVENLİK sözleşmesi (GOREV-027). `bun test src`
 *
 * Ağ/DB YOK: supabase istemcisi ve kimlikAl mock'lanır → in-process express roundtrip.
 * Kritik iddia: başvuru YAMA'sı `role`/`is_approved` İÇERMEZ (0019 çizgisi — başvuru
 * yalnız "bekliyor" durumunu yazar, rolü ASLA). Bu bir kod kapısıdır, prompt değil.
 */
import { expect, test, describe, mock, afterAll } from 'bun:test'
import express from 'express'
import type { AddressInfo } from 'node:net'

// Mock'ların kontrol ettiği paylaşılan durum.
let sonUpdate: Record<string, unknown> | null = null
let mevcutDurum: string | null = null
let rol: 'student' | 'teacher' | 'admin' = 'student'

mock.module('../clients/supabase.js', () => ({
  supabase: {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => ({
                  data: { role: rol, teacher_application_status: mevcutDurum, teacher_application_at: null },
                  error: null,
                }),
              }
            },
          }
        },
        update(yama: Record<string, unknown>) {
          sonUpdate = yama
          return { eq: () => ({ eq: async () => ({ error: null }) }) }
        },
      }
    },
  },
}))

// yetki.js komple mock → gerçek modülün redis/pg importları test sürecine HİÇ girmez.
mock.module('../lib/yetki.js', () => ({
  kimlikAl: async () => ({ userId: 'u1', role: rol, isApproved: false, classCode: null, teacherId: null, name: null }),
}))

const { ogretmenBasvuruRouter } = await import('./ogretmen-basvuru.routes.js')

const app = express()
app.use(express.json())
app.use((req, _res, next) => {
  req.userId = 'u1'
  next()
})
app.use('/ogretmen-basvuru', ogretmenBasvuruRouter)
app.use(
  (
    err: { status?: number; code?: string; message?: string },
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    res.status(err.status ?? 500).json({ error: err.code ?? 'hata', message: err.message })
  },
)

const server = app.listen(0)
const port = (server.address() as AddressInfo).port
const base = `http://127.0.0.1:${port}/ogretmen-basvuru`

afterAll(() => {
  server.close()
})

async function post(body: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const r = await fetch(base, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  return { status: r.status, body: (await r.json()) as Record<string, unknown> }
}

describe('POST /ogretmen-basvuru', () => {
  test('öğrenci başvurur → bekliyor yazılır; YAMA role/is_approved İÇERMEZ (0019 çizgisi)', async () => {
    rol = 'student'
    mevcutDurum = null
    sonUpdate = null
    const { status, body } = await post({ not: 'Fizik öğretmeniyim.' })
    expect(status).toBe(200)
    expect(body.durum).toBe('bekliyor')
    expect(body.yeni).toBe(true)
    expect(sonUpdate).not.toBeNull()
    expect(sonUpdate!.teacher_application_status).toBe('bekliyor')
    // GÜVENLİK ÇEKİRDEĞİ: başvuru ROL/ONAY yazamaz — istemci ayrıcalık yükseltemez.
    expect('role' in sonUpdate!).toBe(false)
    expect('is_approved' in sonUpdate!).toBe(false)
  })

  test('tekrarlı başvuru idempotent — yeni=false ve HİÇ yazım yok', async () => {
    rol = 'student'
    mevcutDurum = 'bekliyor'
    sonUpdate = null
    const { status, body } = await post({})
    expect(status).toBe(200)
    expect(body.yeni).toBe(false)
    expect(body.durum).toBe('bekliyor')
    expect(sonUpdate).toBeNull()
  })

  test('öğretmen başvuramaz → 400 zaten_ogretmen, yazım yok', async () => {
    rol = 'teacher'
    mevcutDurum = null
    sonUpdate = null
    const { status, body } = await post({})
    expect(status).toBe(400)
    expect(body.error).toBe('zaten_ogretmen')
    expect(sonUpdate).toBeNull()
  })

  test('yönetici başvuramaz → 400 yonetici_basvuramaz', async () => {
    rol = 'admin'
    mevcutDurum = null
    sonUpdate = null
    const { status, body } = await post({})
    expect(status).toBe(400)
    expect(body.error).toBe('yonetici_basvuramaz')
    expect(sonUpdate).toBeNull()
  })

  test('501 karakter not → 400 gecersiz_istek (zod), yazım yok', async () => {
    rol = 'student'
    mevcutDurum = null
    sonUpdate = null
    const { status, body } = await post({ not: 'x'.repeat(501) })
    expect(status).toBe(400)
    expect(body.error).toBe('gecersiz_istek')
    expect(sonUpdate).toBeNull()
  })
})
