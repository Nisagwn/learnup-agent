import type { JWTPayload } from 'jose'
import { redisSession, redisSessionTry } from '../clients/redis.js'
import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'

/**
 * OTURUM KATMANI — durumsuz JWT'nin ÜSTÜNE takılan sunucu tarafı oturum defteri.
 *
 * ⚠️ JWT'YE DOKUNMAZ. Kimliği hâlâ `requireAuth` (Supabase JWKS) kanıtlar. Bu katmanın
 * eklediği tek şey, imzası geçerli bir token'ı SUNUCUNUN reddedebilmesidir. Durumsuz JWT'nin
 * yapısal boşluğu budur: token imzalandıktan sonra süresi dolana kadar geri alınamaz —
 * "çıkış yap" istemcinin token'ı unutmasından ibarettir. Çalınmış bir token için bu hiçbir
 * şey ifade etmez, askıya alınan hesap için de: askı yalnız `profiles` okunduğunda görünür.
 *
 * ⚠️ NEDEN SÜREÇ-İÇİ DEĞİL, REDIS: nginx `brain` ve `brain2` arasında yük paylaştırıyor
 * (deploy/nginx/default.conf). Süreç belleğindeki bir oturum defteri, isteğin hangi node'a
 * düştüğüne göre farklı cevap verirdi — brain'de iptal ettiğin oturum brain2'de yaşamaya
 * devam ederdi. Yapışkan oturum (ip_hash) da gerekmez: durum ortak depoda.
 *
 * KİMLİK = `session_id` (Supabase JWT talebi). Bu, CİHAZ BAŞINA verilen ve token yenileme
 * (refresh) boyunca DEĞİŞMEYEN kimliktir. `jti` ya da token'ın kendisi kullanılsaydı her
 * saatlik yenileme yeni bir "oturum" doğurur, iptal ilk yenilemede delinirdi.
 *
 * ANAHTAR ŞEMASI (v1 — şema değişirse önek v2 olur, eski kayıtlar TTL ile kendiliğinden ölür):
 *   oturum:v1:s:<sid>       HASH   → oturum kaydı (userId, ip, cihaz, ilk/son görülme)
 *   oturum:v1:u:<userId>    ZSET   → kullanıcının aktif sid'leri (skor = son görülme ms)
 *   oturum:v1:iptal:<sid>   STRING → bu sid sonlandırıldı (varlığı yeter)
 *   oturum:v1:kesim:<userId> STRING → epoch ms; `iat` bundan ESKİ olan her token reddedilir
 */

const ONEK = 'oturum:v1'
const TTL_SN = env.SESSION_TTL_GUN * 24 * 60 * 60

/**
 * Kesim damgasının ömrü. `iat` karşılaştırması yalnız ZATEN BASILMIŞ token'ları eler;
 * erişim token'ı (Supabase varsayılanı 1 saat) dolduktan sonra kesimin bir işlevi kalmaz.
 * 24 saat, uzun tutulmuş bir token ömrüne karşı geniş pay bırakır ve depoyu şişirmez.
 */
const KESIM_TTL_SN = 24 * 60 * 60

/**
 * "Son görülme" yazma aralığı. Her istekte HSET+ZADD yazmak, oturum deposunu istek başına
 * yazma yüküne sokardı — okuma zaten her istekte var. Dakikada bir yazmak, cihaz listesindeki
 * "son görülme" için fazlasıyla yeterli hassasiyettir.
 *
 * ⚠️ İPTAL KONTROLÜ KISILMAZ: o her istekte okunur. Kısılsaydı iptal, kısma penceresi kadar
 * (60sn) gecikirdi — "çıkış yaptım ama hâlâ içerideyim" penceresi tam olarak budur.
 */
const DOKUNMA_ARALIGI_MS = 60_000
/** Sınırsız büyüyen Map, uzun ömürlü Bun sürecinde SIZINTIDIR (yetki.ts:49 ile aynı gerekçe). */
const DOKUNMA_TAVAN = 10_000
const sonDokunus = new Map<string, number>()

export type OturumBilgisi = {
  /** `session_id` talebi yoksa null — o token için iptal UYGULANAMAZ, yalnız kesim işler. */
  sid: string | null
  userId: string
  /** Token'ın basılma anı (ms). Kullanıcı geneli kesim damgasıyla karşılaştırılır. */
  iatMs: number
}

export type OturumKaydi = {
  sid: string
  userId: string
  ip: string | null
  cihaz: string | null
  userAgent: string | null
  olusturmaMs: number
  sonGorulmeMs: number
  /** İsteği yapan token'ın kendi oturumu mu — listede "bu cihaz" işareti. */
  buCihaz: boolean
}

const kKayit = (sid: string): string => `${ONEK}:s:${sid}`
const kDizin = (userId: string): string => `${ONEK}:u:${userId}`
const kIptal = (sid: string): string => `${ONEK}:iptal:${sid}`
const kKesim = (userId: string): string => `${ONEK}:kesim:${userId}`

/** Oturum katmanı yapılandırıldı mı (SESSION_REDIS_URL verildi mi). */
export const oturumKatmaniAcik = (): boolean => redisSession !== null

/**
 * JWT payload'ından oturum kimliğini çıkarır.
 *
 * ⚠️ DESEN KONTROLÜ GÜVENLİKTİR, biçimcilik değil: sid doğrudan Redis anahtarına gömülüyor.
 * Süslenmemiş bir değer `oturum:v1:iptal:<sid>` anahtarını başka bir kullanıcının anahtarına
 * kaydırabilirdi. Desene uymayan sid YOK sayılır (fail-open: istek geçer, defter tutulmaz) —
 * uydurulmuş bir sid ile başkasının kaydını ezmektense oturum kaydından vazgeçmek yeğdir.
 */
export function sidCikar(payload: JWTPayload): string | null {
  const ham = (payload as { session_id?: unknown }).session_id ?? payload.jti
  if (typeof ham !== 'string') return null
  const temiz = ham.trim()
  return /^[A-Za-z0-9._:-]{8,128}$/.test(temiz) ? temiz : null
}

/**
 * İPTAL KARARI — saf fonksiyon (deponun cevabı → evet/hayır).
 *
 * İki bağımsız iptal yolu vardır ve ikisi de gereklidir:
 *  · `iptalli`  — sid'e özel. Refresh'i AŞAR (sid yenilemede değişmez) → tek cihazı kalıcı keser.
 *  · `kesimMs`  — kullanıcı geneli, `iat` karşılaştırmalı. sid'i OLMAYAN token'ları da kapsar;
 *                 tek yazımla o ana kadar basılmış bütün token'ları düşürür.
 * Yalnız kesim yeterli DEĞİLDİR: kullanıcı refresh ederse yeni `iat` kesimi aşar. Yalnız
 * iptal de yeterli değildir: deftere hiç yazılmamış (sid'siz) token'ı yakalayamaz.
 */
export function iptalKarari(a: { iptalli: boolean; kesimMs: number | null; iatMs: number }): boolean {
  if (a.iptalli) return true
  // `iat` yoksa (0) kesim uygulanamaz — token'ın yaşını bilmeden reddetmek, geçerli
  // oturumları rastgele düşürmek olurdu.
  if (a.kesimMs === null || a.iatMs <= 0) return false
  return a.iatMs < a.kesimMs
}

/**
 * OTURUM KAPISININ OKUMASI — istek yolundaki tek Redis gidiş-dönüşü.
 *
 * İki anahtar tek pipeline'da okunur; sonuç `iptalKarari`ye verilir. Depo yoksa/düşükse
 * 'gecerli' döner (fail-open — bkz. clients/redis.ts `redisSessionTry`).
 */
export async function oturumDurumu(bilgi: OturumBilgisi): Promise<'gecerli' | 'iptal'> {
  const sonuc = await redisSessionTry(async (r) => {
    const p = r.pipeline()
    if (bilgi.sid) p.exists(kIptal(bilgi.sid))
    p.get(kKesim(bilgi.userId))
    return (await p.exec()) ?? []
  }, [] as Array<[Error | null, unknown]>)

  if (sonuc.length === 0) return 'gecerli'

  // Pipeline sırası: [iptal?] , kesim — sid yoksa ilk giriş hiç gönderilmez.
  const iptalGirdi = bilgi.sid ? sonuc[0] : null
  const kesimGirdi = bilgi.sid ? sonuc[1] : sonuc[0]

  // Girdi bazında hata → o kontrolü uygulama (fail-open), diğerini uygulamaya devam et.
  const iptalli = iptalGirdi && !iptalGirdi[0] ? Number(iptalGirdi[1]) === 1 : false
  const kesimHam = kesimGirdi && !kesimGirdi[0] ? kesimGirdi[1] : null
  const kesimMs = typeof kesimHam === 'string' && Number.isFinite(Number(kesimHam)) ? Number(kesimHam) : null

  return iptalKarari({ iptalli, kesimMs, iatMs: bilgi.iatMs }) ? 'iptal' : 'gecerli'
}

/**
 * Oturumu deftere yazar / tazeler. ATEŞLE-VE-UNUT: isteği bekletmez, hatası isteği düşürmez.
 *
 * Kayıt tutmak bir GÖZLEMDİR; yazılamaması kullanıcının işini engellememeli (lib/mastery.ts:103
 * kalıbı). Erişim kararını veren okuma yolu (`oturumDurumu`) bundan bağımsızdır.
 */
export function oturumDokun(girdi: {
  sid: string | null
  userId: string
  ip: string | null
  userAgent: string | null
}): void {
  if (!girdi.sid || !redisSession) return

  const simdi = Date.now()
  const sonraki = sonDokunus.get(girdi.sid)
  if (sonraki !== undefined && sonraki > simdi) return
  if (sonDokunus.size >= DOKUNMA_TAVAN) {
    // Map ekleme sırasını korur → ilk anahtar en eskisidir (FIFO tahliye).
    const enEski = sonDokunus.keys().next().value
    if (enEski !== undefined) sonDokunus.delete(enEski)
  }
  sonDokunus.set(girdi.sid, simdi + DOKUNMA_ARALIGI_MS)

  const sid = girdi.sid
  const ua = girdi.userAgent ? girdi.userAgent.slice(0, 400) : ''
  void redisSessionTry(async (r) => {
    await r
      .pipeline()
      // `hsetnx`: ilk görülme yalnız BİR KEZ yazılır — sonraki dokunuşlar onu ezmez.
      .hsetnx(kKayit(sid), 'olusturmaMs', String(simdi))
      .hset(kKayit(sid), {
        userId: girdi.userId,
        ip: girdi.ip ?? '',
        userAgent: ua,
        cihaz: cihazEtiketi(ua) ?? '',
        sonGorulmeMs: String(simdi),
      })
      .expire(kKayit(sid), TTL_SN)
      .zadd(kDizin(girdi.userId), simdi, sid)
      .expire(kDizin(girdi.userId), TTL_SN)
      .exec()
    return null
  }, null)
}

/**
 * Kullanıcının aktif oturumları — en son görülen başta.
 *
 * ⚠️ DİZİN TEK BAŞINA HAKİKAT DEĞİLDİR: kayıt TTL ile düşer ama ZSET üyesi kalır (Redis'te
 * "üyesi silinen anahtar" diye bir olay yok). Bu yüzden her listeleme, karşılığı olmayan
 * üyeleri ayıklar — yoksa liste, aylar önce ölmüş cihazları "aktif" diye gösterirdi.
 */
export async function oturumlariListele(userId: string, buSid: string | null): Promise<OturumKaydi[]> {
  if (!redisSession) return []
  return redisSessionTry(async (r) => {
    const sidler = await r.zrevrange(kDizin(userId), 0, 99)
    if (sidler.length === 0) return []

    const p = r.pipeline()
    for (const sid of sidler) {
      p.hgetall(kKayit(sid))
      p.exists(kIptal(sid))
    }
    const cevap = (await p.exec()) ?? []

    const kayitlar: OturumKaydi[] = []
    const olu: string[] = []
    sidler.forEach((sid, i) => {
      const alanGirdi = cevap[i * 2]
      const iptalGirdi = cevap[i * 2 + 1]
      const alan = (alanGirdi && !alanGirdi[0] ? alanGirdi[1] : null) as Record<string, string> | null
      const iptalli = iptalGirdi && !iptalGirdi[0] ? Number(iptalGirdi[1]) === 1 : false

      if (!alan || Object.keys(alan).length === 0 || iptalli) {
        olu.push(sid)
        return
      }
      kayitlar.push({
        sid,
        userId: alan.userId ?? userId,
        ip: alan.ip || null,
        cihaz: alan.cihaz || null,
        userAgent: alan.userAgent || null,
        olusturmaMs: Number(alan.olusturmaMs) || 0,
        sonGorulmeMs: Number(alan.sonGorulmeMs) || 0,
        buCihaz: buSid !== null && sid === buSid,
      })
    })

    if (olu.length > 0) await r.zrem(kDizin(userId), ...olu)
    return kayitlar
  }, [])
}

/**
 * OTURUMLARI CİHAZA GÖRE TOPLAR — saf fonksiyon (deponun cevabı → arayüzün satırları).
 *
 * ⚠️ NEDEN GEREKTİ: Supabase her `signIn` çağrısında YENİ bir `session_id` basar ve eskisini
 * kapatmaz. Aynı tarayıcıdan üç kez giriş yapan öğrenci "Cihazlarım"da üç ayrı satır görüyordu
 * (ÖLÇÜLDÜ: aynı UA, aynı IP, 80 sn arayla iki sid). Kayıtlar YANLIŞ değildi — eski oturumun
 * refresh token'ı Supabase'de gerçekten yaşıyor — ama liste, "kaç yerde açığım?" sorusuna
 * cihaz değil GİRİŞ sayısıyla cevap veriyordu ve tanıma işini imkânsızlaştırıyordu.
 *
 * ⚠️ ANAHTAR TAM USER-AGENT, IP DEĞİL. IP'yi anahtara katmak aynı arızayı öteki yönden
 * üretirdi: wifi'dan mobil veriye geçen telefon iki satıra bölünürdü. Bedeli açık — aynı
 * kullanıcının birebir aynı UA'yı taşıyan İKİ ayrı makinesi (iki Windows 11 + aynı Chrome
 * sürümü) tek satırda birleşir. Bu yüzden en son görülen IP satırda GÖSTERİLİR: birleşme
 * kullanıcıdan gizlenmiş olmaz.
 *
 * ⚠️ UA'sı OLMAYAN kayıt gruplanmaz (anahtar sid'in kendisi olur): iki bilinmeyeni "aynı
 * cihaz" saymak tahmindir ve bu listenin tek işi tanıma/tanımama kararıdır.
 */
export type CihazGrubu = {
  /** Grup kimliği — arayüz anahtarı. UA yoksa `sid:<sid>`. */
  anahtar: string
  /** Gruptaki oturumlar, en son görülen başta (girdi sırası korunur). */
  sidler: string[]
  cihaz: string | null
  /** EN SON görülen adres — cihaz ağ değiştirmiş olabilir. */
  ip: string | null
  userAgent: string | null
  /** Grubun EN ESKİ ilk görülmesi. */
  ilkGorulmeMs: number
  /** Grubun EN YENİ son görülmesi. */
  sonGorulmeMs: number
  /** Gruptaki oturumlardan biri isteği yapan token mı. */
  buCihaz: boolean
  /**
   * Gruptaki HANGİ sid isteği yapan token — arayüz "eski girişleri kapat" derken bunu
   * listeden çıkarır. `buCihaz` tek başına yetmez: grup birden çok sid taşıyor ve hangisinin
   * canlı olduğu bilinmeden temizlik, kullanıcıyı kendi ekranından atardı.
   */
  buSid: string | null
}

export function cihazGruplari(kayitlar: OturumKaydi[]): CihazGrubu[] {
  const harita = new Map<string, CihazGrubu>()

  for (const k of kayitlar) {
    const ua = (k.userAgent ?? '').trim()
    const anahtar = ua || `sid:${k.sid}`
    const grup = harita.get(anahtar)

    if (!grup) {
      harita.set(anahtar, {
        anahtar,
        sidler: [k.sid],
        cihaz: k.cihaz,
        ip: k.ip,
        userAgent: k.userAgent,
        ilkGorulmeMs: k.olusturmaMs,
        sonGorulmeMs: k.sonGorulmeMs,
        buCihaz: k.buCihaz,
        buSid: k.buCihaz ? k.sid : null,
      })
      continue
    }

    grup.sidler.push(k.sid)
    if (k.buCihaz) {
      grup.buCihaz = true
      grup.buSid = k.sid
    }
    // 0 = "bilinmiyor" (kayıt TTL'den önce yazılmamış) → gerçek bir damgayı EZMESİN.
    if (k.olusturmaMs > 0 && (grup.ilkGorulmeMs === 0 || k.olusturmaMs < grup.ilkGorulmeMs)) {
      grup.ilkGorulmeMs = k.olusturmaMs
    }
    if (k.sonGorulmeMs > grup.sonGorulmeMs) {
      grup.sonGorulmeMs = k.sonGorulmeMs
      grup.ip = k.ip
      grup.cihaz = k.cihaz
    }
  }

  return [...harita.values()].sort((a, b) => b.sonGorulmeMs - a.sonGorulmeMs)
}

/**
 * TEK OTURUMU SONLANDIRIR.
 *
 * ⚠️ SAHİPLİK KAPIDA DEĞİL BURADA: sid bir yol parametresinden gelir ve yalnız kayıt
 * okunduğunda kime ait olduğu bilinir. `userId` eşleşmezse `false` döner — çağıran bunu
 * 404'e çevirir (lib/hata.ts: yabancı id yoklamak numaralandırma kehanetine dönüşmesin).
 */
export async function oturumIptalEt(userId: string, sid: string): Promise<boolean> {
  return (await oturumlariIptalEt(userId, [sid])) === 1
}

/**
 * BİRDEN ÇOK OTURUMU SONLANDIRIR — "bu cihazın eski girişlerini temizle".
 *
 * Sahiplik kuralı `oturumIptalEt` ile AYNI OLMAK ZORUNDA, bu yüzden tek gövde: kayıt varsa
 * userId eşleşmeli; kayıt TTL ile düşmüşse (sahip null) sid'in dizinde olması yeterli —
 * token hâlâ yaşıyor olabilir, ama sahipsiz bir sid körlemesine iptal edilmez.
 *
 * Dönen sayı GERÇEKTEN kapatılan oturum adedidir: yabancı ya da hiç var olmayan sid sayılmaz.
 */
export async function oturumlariIptalEt(userId: string, sidler: string[]): Promise<number> {
  if (!redisSession || sidler.length === 0) return 0
  return redisSessionTry(async (r) => {
    const okuma = r.pipeline()
    for (const sid of sidler) {
      okuma.hget(kKayit(sid), 'userId')
      okuma.zscore(kDizin(userId), sid)
    }
    const cevap = (await okuma.exec()) ?? []

    const hedef: string[] = []
    sidler.forEach((sid, i) => {
      const sahipGirdi = cevap[i * 2]
      const skorGirdi = cevap[i * 2 + 1]
      const sahip = sahipGirdi && !sahipGirdi[0] ? (sahipGirdi[1] as string | null) : null
      const skor = skorGirdi && !skorGirdi[0] ? (skorGirdi[1] as string | null) : null

      if (sahip !== null) {
        if (sahip === userId) hedef.push(sid)
        else logger.warn({ userId, sid }, 'başkasının oturumunu kapatma denemesi')
        return
      }
      if (skor !== null) hedef.push(sid)
    })
    if (hedef.length === 0) return 0

    const yazma = r.pipeline()
    for (const sid of hedef) {
      yazma.set(kIptal(sid), '1', 'EX', TTL_SN)
      yazma.del(kKayit(sid))
      yazma.zrem(kDizin(userId), sid)
    }
    await yazma.exec()
    return hedef.length
  }, 0)
}

/**
 * KULLANICININ TÜM OTURUMLARINI SONLANDIRIR. Dönen sayı = deftere yazılı olan oturum adedi.
 *
 * Hem tek tek iptal (bilinen sid'ler — refresh'i aşar) hem de kesim damgası (deftere hiç
 * yazılmamış, sid'siz ya da TTL ile düşmüş token'lar) yazılır. Gerekçe `iptalKarari`de.
 *
 * ⚠️ SINIRI AÇIKÇA SÖYLE: bu, LearnUp API'sine erişimi keser — Supabase'deki refresh
 * token'ı SİLMEZ. Kullanıcı kendi çıkışını yaparken elimizde onun token'ı olur ve
 * `supabase.auth.admin.signOut` ile refresh de öldürülür (routes/oturum.routes.ts).
 * Yönetici bir BAŞKASINI attığında o token elimizde yoktur; kesen şey bu defterdir.
 */
export async function tumOturumlariIptalEt(userId: string): Promise<number> {
  if (!redisSession) return 0
  return redisSessionTry(async (r) => {
    const sidler = await r.zrange(kDizin(userId), 0, -1)
    const p = r.pipeline()
    for (const sid of sidler) {
      p.set(kIptal(sid), '1', 'EX', TTL_SN)
      p.del(kKayit(sid))
    }
    p.del(kDizin(userId))
    p.set(kKesim(userId), String(Date.now()), 'EX', KESIM_TTL_SN)
    await p.exec()
    return sidler.length
  }, 0)
}

/**
 * Cihaz etiketi — user-agent'tan okunabilir bir ad üretir ("Chrome · Windows").
 *
 * Kasıtlı olarak KABA: amaç istatistik değil, kullanıcının kendi cihaz listesinde
 * "bu benim telefonum" diyebilmesi. Tanınmayan UA'da ham metin listede zaten duruyor.
 */
export function cihazEtiketi(ua: string | null): string | null {
  if (!ua) return null
  const tarayici =
    /Edg\//.test(ua) ? 'Edge'
    : /OPR\/|Opera/.test(ua) ? 'Opera'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari'
    : null
  const platform =
    /iPhone/.test(ua) ? 'iPhone'
    : /iPad/.test(ua) ? 'iPad'
    : /Android/.test(ua) ? 'Android'
    : /Windows/.test(ua) ? 'Windows'
    : /Mac OS X|Macintosh/.test(ua) ? 'macOS'
    : /Linux/.test(ua) ? 'Linux'
    : null

  if (!tarayici && !platform) return null
  return [tarayici, platform].filter(Boolean).join(' · ')
}
