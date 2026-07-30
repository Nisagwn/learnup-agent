/**
 * YÖNETİCİ YETKİ GENİŞLETMESİ (0025) — kapı sözleşmeleri. `bun test src`
 *
 * Ağ/DB YOK: `kimlikAl` mock'lanır → saf middleware davranışı ölçülür.
 *
 * Buradaki iddialar PROMPT DEĞİL KOD KAPISIDIR ve üçü de canlıda sessiz yanlış üretme
 * potansiyeli taşıdığı için teste bağlanmıştır:
 *   1) Yönetici kapsam seçmeden sınıf yüzeyine giremez. Girebilseydi kapsam kendi
 *      id'sine düşer ve panel BOŞ SINIF gösterirdi — hata mesajı olmadan.
 *   2) Askıdaki hesap hiçbir uca giremez. Kapı `requireRole`'a gömülseydi askıdaki
 *      ÖĞRENCİ soru çözmeye devam ederdi (rol kapısı öğrenci yollarında yok).
 *   3) Öğretmenin kapsamı DEĞİŞMEDİ: 0025 mevcut davranışı bozmamalı.
 */
import { expect, test, describe, mock, afterAll } from 'bun:test'
import express from 'express'
import type { AddressInfo } from 'node:net'

type Kimlik = {
  userId: string
  role: 'student' | 'teacher' | 'admin'
  isApproved: boolean
  classCode: string | null
  teacherId: string | null
  name: string | null
  askidaMi: boolean
}

/** Test senaryosunun kontrol ettiği kullanıcı tablosu (userId → kimlik). */
const kullanicilar = new Map<string, Kimlik>()

const kimlik = (o: Partial<Kimlik> & { userId: string }): Kimlik => ({
  role: 'student',
  isApproved: true,
  classCode: null,
  teacherId: null,
  name: null,
  askidaMi: false,
  ...o,
})

mock.module('../lib/yetki.js', () => ({
  kimlikAl: async (id: string) => {
    const k = kullanicilar.get(id)
    if (!k) throw Object.assign(new Error('profil yok'), { status: 403, code: 'profil_yok' })
    return k
  },
}))

const { requireRole, requireOgretmenKapsami } = await import('./requireRole.js')
const { requireAktifHesap } = await import('./requireAktifHesap.js')

/* ── Test uygulaması ─────────────────────────────────────────────────────── */

const app = express()
app.use(express.json())
// Kimliği başlıktan taşı (requireAuth yerine) — JWT doğrulaması bu testin konusu değil.
app.use((req, _res, next) => {
  req.userId = String(req.headers['x-test-user'] ?? '')
  next()
})

app.get('/aktif', requireAktifHesap, (_req, res) => { res.json({ ok: true }) })
app.get('/admin-alan', requireAktifHesap, requireRole('admin'), (_req, res) => { res.json({ ok: true }) })
app.get('/sinif', requireAktifHesap, requireOgretmenKapsami, (req, res) => {
  res.json({ kapsam: req.kapsamOgretmenId, vekil: req.adminVekili === true, rol: req.rol })
})

app.use((
  err: { status?: number; code?: string; message?: string },
  _req: express.Request,
  res: express.Response,
  _next: express.NextFunction,
) => {
  res.status(err.status ?? 500).json({ error: err.code ?? 'hata', message: err.message })
})

const server = app.listen(0)
const port = (server.address() as AddressInfo).port
afterAll(() => { server.close() })

async function get(yol: string, user: string): Promise<{ status: number; body: any }> {
  const r = await fetch(`http://127.0.0.1:${port}${yol}`, { headers: { 'x-test-user': user } })
  return { status: r.status, body: await r.json().catch(() => ({})) }
}

/* ── Sabit kullanıcılar ──────────────────────────────────────────────────── */

const OGRETMEN = '11111111-1111-4111-8111-111111111111'
const ADMIN = '22222222-2222-4222-8222-222222222222'
const OGRENCI = '33333333-3333-4333-8333-333333333333'
const ONAYSIZ = '44444444-4444-4444-8444-444444444444'
const ASKIDA = '55555555-5555-4555-8555-555555555555'
const YOK = '99999999-9999-4999-8999-999999999999'

kullanicilar.set(OGRETMEN, kimlik({ userId: OGRETMEN, role: 'teacher', classCode: 'ABC123', name: 'Öğretmen' }))
kullanicilar.set(ADMIN, kimlik({ userId: ADMIN, role: 'admin', name: 'Yönetici' }))
kullanicilar.set(OGRENCI, kimlik({ userId: OGRENCI, role: 'student' }))
kullanicilar.set(ONAYSIZ, kimlik({ userId: ONAYSIZ, role: 'teacher', isApproved: false }))
kullanicilar.set(ASKIDA, kimlik({ userId: ASKIDA, role: 'student', askidaMi: true }))

/* ═══════════════════════════════════════════════════════════════════════════ */

describe('askı kapısı (requireAktifHesap)', () => {
  test('aktif hesap geçer', async () => {
    const r = await get('/aktif', OGRENCI)
    expect(r.status).toBe(200)
  })

  test('askıdaki hesap 403 hesap_askida alır', async () => {
    const r = await get('/aktif', ASKIDA)
    expect(r.status).toBe(403)
    expect(r.body.error).toBe('hesap_askida')
  })

  /**
   * ⚠️ ROL MUAFİYETİ YOK. Askıdaki bir yönetici de dışarıda kalır; "son yönetici
   * askıya alınamaz" koruması UÇTA'dır, kapıda değil. Kapıda istisna tanımak,
   * kapının anlamını kapının kendisinden okunamaz hâle getirirdi.
   */
  test('askıdaki YÖNETİCİ de dışarıda kalır', async () => {
    kullanicilar.set(ADMIN, kimlik({ userId: ADMIN, role: 'admin', askidaMi: true }))
    const r = await get('/admin-alan', ADMIN)
    expect(r.status).toBe(403)
    expect(r.body.error).toBe('hesap_askida')
    kullanicilar.set(ADMIN, kimlik({ userId: ADMIN, role: 'admin', name: 'Yönetici' }))
  })

  test('profili olmayan doğrulanmış kullanıcı reddedilir', async () => {
    const r = await get('/aktif', YOK)
    expect(r.status).toBe(403)
  })
})

describe('sınıf kapsamı (requireOgretmenKapsami)', () => {
  test('öğretmenin kapsamı KENDİSİ — 0025 mevcut davranışı bozmadı', async () => {
    const r = await get('/sinif', OGRETMEN)
    expect(r.status).toBe(200)
    expect(r.body.kapsam).toBe(OGRETMEN)
    expect(r.body.vekil).toBe(false)
  })

  test('onaysız öğretmen giremez', async () => {
    const r = await get('/sinif', ONAYSIZ)
    expect(r.status).toBe(403)
    expect(r.body.error).toBe('ogretmen_onaysiz')
  })

  test('öğrenci giremez', async () => {
    const r = await get('/sinif', OGRENCI)
    expect(r.status).toBe(403)
    expect(r.body.error).toBe('rol_yetersiz')
  })

  /**
   * ⚠️ BU TESTİN SEBEBİ: kapsamı sessizce yöneticinin kendi id'sine düşürmek, her
   * sorgunun BOŞ küme dönmesi demekti — panel "sınıf boş" derdi ve hata görünmezdi.
   * Kapsam belirsizse istek REDDEDİLİR.
   */
  test('yönetici kapsam SEÇMEDEN giremez (sessiz boş sınıf yok)', async () => {
    const r = await get('/sinif', ADMIN)
    expect(r.status).toBe(400)
    expect(r.body.error).toBe('ogretmen_secilmedi')
  })

  test('yönetici seçtiği öğretmenin kapsamıyla girer ve VEKİL işaretlenir', async () => {
    const r = await get(`/sinif?ogretmenId=${OGRETMEN}`, ADMIN)
    expect(r.status).toBe(200)
    expect(r.body.kapsam).toBe(OGRETMEN)
    expect(r.body.vekil).toBe(true)
    expect(r.body.rol).toBe('admin')
  })

  test('uuid olmayan kapsam 400 (kimlikAl 500 üretmez)', async () => {
    const r = await get('/sinif?ogretmenId=abc', ADMIN)
    expect(r.status).toBe(400)
    expect(r.body.error).toBe('gecersiz_ogretmen')
  })

  test('öğretmen olmayan bir hedef 404', async () => {
    const r = await get(`/sinif?ogretmenId=${OGRENCI}`, ADMIN)
    expect(r.status).toBe(404)
    expect(r.body.error).toBe('ogretmen_bulunamadi')
  })

  test('var olmayan hedef 404', async () => {
    const r = await get(`/sinif?ogretmenId=${YOK}`, ADMIN)
    expect(r.status).toBe(404)
  })

  /**
   * Öğretmen `ogretmenId` göndererek BAŞKA bir sınıfa geçemez: kapsam onun için
   * her koşulda kendi id'sidir. Bu, IDOR'un en doğrudan biçimi olurdu.
   */
  test('öğretmen ogretmenId göndererek başkasının sınıfına geçemez', async () => {
    const r = await get(`/sinif?ogretmenId=${ADMIN}`, OGRETMEN)
    expect(r.status).toBe(200)
    expect(r.body.kapsam).toBe(OGRETMEN)
    expect(r.body.vekil).toBe(false)
  })
})
