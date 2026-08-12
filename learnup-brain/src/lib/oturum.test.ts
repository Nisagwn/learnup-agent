/** Oturum katmanı — karar mantığı (Redis'siz, saf fonksiyonlar). */
import { expect, test, describe, mock } from 'bun:test'

// ⚠️ app.test.ts ile AYNI GEREKÇE: modül gövdesi import anında gerçek Redis bağlantısı
// açar (clients/redis.ts top-level). Bu dosyanın ölçtüğü şey KARAR MANTIĞI, bağlantı değil.
mock.module('../clients/redis.js', () => ({
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

const {
  sidCikar,
  iptalKarari,
  cihazEtiketi,
  cihazGruplari,
  oturumDurumu,
  oturumlariListele,
  tumOturumlariIptalEt,
} = await import('./oturum.js')

type Kayit = Parameters<typeof cihazGruplari>[0][number]

const UA_CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36'
const UA_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

const kayit = (o: Partial<Kayit> & { sid: string }): Kayit => ({
  userId: 'u1',
  ip: '1.2.3.4',
  cihaz: 'Chrome · Windows',
  userAgent: UA_CHROME,
  olusturmaMs: 1_000,
  sonGorulmeMs: 1_000,
  buCihaz: false,
  ...o,
})

describe('sidCikar — oturum kimliği JWT talebinden okunur', () => {
  test('session_id tercih edilir (refresh boyunca DEĞİŞMEZ; jti her token için yenidir)', () => {
    expect(sidCikar({ session_id: 'a1b2c3d4-e5f6', jti: 'baska-deger' })).toBe('a1b2c3d4-e5f6')
  })

  test('session_id yoksa jti yedeğe düşer', () => {
    expect(sidCikar({ jti: 'jti-degeri-uzun' })).toBe('jti-degeri-uzun')
  })

  test('hiçbiri yoksa null — kayıt tutulmaz, istek yine de geçer (fail-open)', () => {
    expect(sidCikar({ sub: 'kullanici' })).toBeNull()
  })

  test('desene uymayan sid REDDEDİLİR — sid doğrudan Redis anahtarına gömülüyor', () => {
    // Boşluk/iki nokta oyunlarıyla başka bir kullanıcının anahtarına kayma denemesi.
    expect(sidCikar({ session_id: 'kotu sid' })).toBeNull()
    expect(sidCikar({ session_id: 'a'.repeat(200) })).toBeNull()
    expect(sidCikar({ session_id: 'kisa' })).toBeNull()
    expect(sidCikar({ session_id: 42 as unknown as string })).toBeNull()
  })
})

describe('iptalKarari — iki bağımsız iptal yolu', () => {
  const iat = 1_000_000

  test('sid iptalliyse token yaşına BAKILMAZ (refresh ile tazelenen token da düşer)', () => {
    expect(iptalKarari({ iptalli: true, kesimMs: null, iatMs: iat + 999_999 })).toBe(true)
  })

  test('kesimden ESKİ token reddedilir', () => {
    expect(iptalKarari({ iptalli: false, kesimMs: iat + 1, iatMs: iat })).toBe(true)
  })

  test('kesimden SONRA basılan token geçer — "her yerden çık" sonrası yeni giriş çalışmalı', () => {
    expect(iptalKarari({ iptalli: false, kesimMs: iat, iatMs: iat + 1 })).toBe(false)
  })

  test('kesim yoksa geçer', () => {
    expect(iptalKarari({ iptalli: false, kesimMs: null, iatMs: iat })).toBe(false)
  })

  test('iat okunamadıysa (0) kesim UYGULANMAZ — yaşı bilinmeyen token rastgele düşürülmez', () => {
    expect(iptalKarari({ iptalli: false, kesimMs: iat, iatMs: 0 })).toBe(false)
  })
})

describe('depo kapalıyken (SESSION_REDIS_URL yok) davranış', () => {
  test('oturum kapısı GEÇİRİR — fail-open sözleşmesi', async () => {
    expect(await oturumDurumu({ sid: 'gecerli-sid-1', userId: 'u1', iatMs: 1 })).toBe('gecerli')
  })

  test('liste boş, iptal 0 döner — hata FIRLATMAZ (istek yolunu öldürmez)', async () => {
    expect(await oturumlariListele('u1', null)).toEqual([])
    expect(await tumOturumlariIptalEt('u1')).toBe(0)
  })
})

describe('cihazGruplari — Supabase her girişte yeni oturum açar, liste cihaz göstermeli', () => {
  test('aynı UA\'dan üç giriş TEK satır olur; sayı gizlenmez', () => {
    const gruplar = cihazGruplari([
      kayit({ sid: 'yeni', olusturmaMs: 3_000, sonGorulmeMs: 3_500 }),
      kayit({ sid: 'orta', olusturmaMs: 2_000, sonGorulmeMs: 2_100 }),
      kayit({ sid: 'eski', olusturmaMs: 1_000, sonGorulmeMs: 1_050 }),
    ])
    expect(gruplar).toHaveLength(1)
    expect(gruplar[0].sidler).toEqual(['yeni', 'orta', 'eski'])
    // İlk giriş grubun EN ESKİSİ, son görülme EN YENİSİ — satır cihazın ömrünü anlatır.
    expect(gruplar[0].ilkGorulmeMs).toBe(1_000)
    expect(gruplar[0].sonGorulmeMs).toBe(3_500)
  })

  test('farklı UA ayrı satır kalır — telefon ve masaüstü birleşmez', () => {
    const gruplar = cihazGruplari([
      kayit({ sid: 'a', sonGorulmeMs: 5_000 }),
      kayit({ sid: 'b', userAgent: UA_IPHONE, cihaz: 'Safari · iPhone', sonGorulmeMs: 4_000 }),
    ])
    expect(gruplar).toHaveLength(2)
    expect(gruplar[0].sidler).toEqual(['a']) // en son görülen başta
    expect(gruplar[1].cihaz).toBe('Safari · iPhone')
  })

  test('IP anahtara GİRMEZ (ağ değiştiren telefon bölünmesin) ama EN SON adres gösterilir', () => {
    const gruplar = cihazGruplari([
      kayit({ sid: 'yeni', ip: '5.5.5.5', sonGorulmeMs: 9_000 }),
      kayit({ sid: 'eski', ip: '1.2.3.4', sonGorulmeMs: 1_000 }),
    ])
    expect(gruplar).toHaveLength(1)
    expect(gruplar[0].ip).toBe('5.5.5.5')
  })

  test('UA yoksa gruplanmaz — iki bilinmeyeni "aynı cihaz" saymak TAHMİNDİR', () => {
    const gruplar = cihazGruplari([
      kayit({ sid: 'x', userAgent: null, cihaz: null }),
      kayit({ sid: 'y', userAgent: '  ', cihaz: null }),
    ])
    expect(gruplar).toHaveLength(2)
  })

  test('buSid gruptaki CANLI oturumu işaret eder — "eski girişleri kapat" onu dışarıda bırakır', () => {
    const gruplar = cihazGruplari([
      kayit({ sid: 'canli', sonGorulmeMs: 9_000, buCihaz: true }),
      kayit({ sid: 'olu', sonGorulmeMs: 2_000 }),
    ])
    expect(gruplar[0].buCihaz).toBe(true)
    expect(gruplar[0].buSid).toBe('canli')
    expect(gruplar[0].sidler.filter((s) => s !== gruplar[0].buSid)).toEqual(['olu'])
  })

  test('canlı oturum grubun EN YENİSİ olmasa da buSid doğru kalır', () => {
    // zrevrange sırası son görülmeye göredir; canlı token bir süre sessiz kalmış olabilir.
    const gruplar = cihazGruplari([
      kayit({ sid: 'sessiz-ama-olu', sonGorulmeMs: 9_000 }),
      kayit({ sid: 'canli', sonGorulmeMs: 2_000, buCihaz: true }),
    ])
    expect(gruplar[0].buSid).toBe('canli')
  })

  test('olusturmaMs=0 (bilinmiyor) gerçek damgayı EZMEZ', () => {
    const gruplar = cihazGruplari([
      kayit({ sid: 'a', olusturmaMs: 0, sonGorulmeMs: 5_000 }),
      kayit({ sid: 'b', olusturmaMs: 1_000, sonGorulmeMs: 4_000 }),
    ])
    expect(gruplar[0].ilkGorulmeMs).toBe(1_000)
  })

  test('boş liste boş dizi', () => {
    expect(cihazGruplari([])).toEqual([])
  })
})

describe('cihazEtiketi', () => {
  test('tarayıcı · platform', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
    expect(cihazEtiketi(ua)).toBe('Chrome · Windows')
  })

  test('Edge, Chrome UA taşısa da Edge olarak okunur (sıra önemli)', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36 Edg/120.0'
    expect(cihazEtiketi(ua)).toBe('Edge · Windows')
  })

  test('tanınmayan UA → null (uydurma etiket YOK)', () => {
    expect(cihazEtiketi('curl/8.4.0')).toBeNull()
    expect(cihazEtiketi(null)).toBeNull()
  })
})
