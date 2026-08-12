import { Router } from 'express'
import { supabase } from '../clients/supabase.js'
import { logger } from '../utils/logger.js'
import { bulunamadi, gecersizIstek } from '../lib/hata.js'
import {
  cihazGruplari,
  oturumIptalEt,
  oturumKatmaniAcik,
  oturumlariIptalEt,
  oturumlariListele,
  tumOturumlariIptalEt,
  type CihazGrubu,
  type OturumKaydi,
} from '../lib/oturum.js'

/**
 * OTURUM UÇLARI — kullanıcının kendi cihazları.
 *
 * ⚠️ HEDEF SATIR HER ZAMAN `req.userId`: hiçbir uç gövdeden/sorgudan kullanıcı kimliği
 * almaz. Başkasının oturumunu kapatmak yalnız yönetici ucundan olur ve denetim izi bırakır
 * (admin-yonetim.routes.ts). Bu ayrım korunmazsa uç, tek istekle herkesi atan bir silaha döner.
 */
export const oturumRouter = Router()

/** Yol parametresi doğrudan Redis anahtarına gömülür — desen `lib/oturum.ts` ile aynı. */
const SID_DESENI = /^[A-Za-z0-9._:-]{8,128}$/

type OturumSatiri = {
  sid: string
  cihaz: string | null
  ip: string | null
  userAgent: string | null
  ilkGiris: string | null
  sonGorulme: string | null
  buCihaz: boolean
}

/**
 * CİHAZ SATIRI — listenin birimi artık oturum değil CİHAZ.
 *
 * `sid` grubun EN YENİ oturumudur (tekil işlemler için); `sidler` grubun tamamını taşır ki
 * "çıkar" düğmesi o cihazın bütün girişlerini kapatabilsin. `oturumSayisi > 1` olması bir
 * arıza değildir: Supabase her girişte yeni oturum açar (bkz. lib/oturum.ts cihazGruplari).
 */
type CihazSatiri = OturumSatiri & { sidler: string[]; oturumSayisi: number; buSid: string | null }

const satira = (k: OturumKaydi): OturumSatiri => ({
  sid: k.sid,
  cihaz: k.cihaz,
  ip: k.ip,
  userAgent: k.userAgent,
  ilkGiris: k.olusturmaMs ? new Date(k.olusturmaMs).toISOString() : null,
  sonGorulme: k.sonGorulmeMs ? new Date(k.sonGorulmeMs).toISOString() : null,
  buCihaz: k.buCihaz,
})

const cihazSatirina = (g: CihazGrubu): CihazSatiri => ({
  sid: g.sidler[0],
  sidler: g.sidler,
  oturumSayisi: g.sidler.length,
  buSid: g.buSid,
  cihaz: g.cihaz,
  ip: g.ip,
  userAgent: g.userAgent,
  ilkGiris: g.ilkGorulmeMs ? new Date(g.ilkGorulmeMs).toISOString() : null,
  sonGorulme: g.sonGorulmeMs ? new Date(g.sonGorulmeMs).toISOString() : null,
  buCihaz: g.buCihaz,
})

/**
 * Bu isteğin token'ı. Supabase'e "bu oturumu kapat" demek için ŞART: GoTrue çıkışı
 * kullanıcının kendi token'ıyla yapılır, service_role ile değil.
 */
const tokenAl = (auth: string | undefined): string | null =>
  auth?.startsWith('Bearer ') ? auth.slice(7) : null

/**
 * Supabase tarafındaki refresh token'ı da öldürür.
 *
 * ⚠️ NEDEN GEREKLİ: Redis defteri LearnUp API'sine erişimi keser, ama Supabase'deki refresh
 * token'a dokunmaz. O yaşarken istemci yeni erişim token'ı basmaya devam eder — bizim API'de
 * işe yaramaz, fakat Supabase'e doğrudan giden her şey (Storage, Realtime, RLS'li tablolar)
 * için hâlâ geçerli bir kimliktir. Çıkış "her yerde" olmalı; yarısı çıkış değildir.
 *
 * Sessizce yutulur: Supabase çıkışı başarısız olsa da bizim iptalimiz yazılmıştır ve asıl
 * kapı odur. Hatanın kaybolmaması için log'a yazılır.
 */
async function supabaseCikis(token: string | null, kapsam: 'local' | 'global'): Promise<boolean> {
  if (!token) return false
  try {
    const { error } = await supabase.auth.admin.signOut(token, kapsam)
    if (error) {
      logger.warn({ err: error, kapsam }, 'supabase çıkışı başarısız — yerel iptal yine de yazıldı')
      return false
    }
    return true
  } catch (err) {
    logger.warn({ err, kapsam }, 'supabase çıkışı başarısız — yerel iptal yine de yazıldı')
    return false
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /oturum — bu isteğin oturumu + katmanın açık olup olmadığı.
//
// `katmanAcik:false` İSTEMCİ İÇİN ANLAMLI BİR CEVAPTIR, hata değil: SESSION_REDIS_URL
// verilmemişse cihaz listesi boş döner ve arayüz "oturum yönetimi kapalı" der. Boş listeyi
// "hiç cihaz yok" diye çizmek, kullanıcıya olmayan bir güvenlik hissi satardı.
// ─────────────────────────────────────────────────────────────────────────────
oturumRouter.get('/', async (req, res, next) => {
  try {
    const userId = req.userId!
    const sid = req.oturum?.sid ?? null
    const hepsi = await oturumlariListele(userId, sid)
    res.json({
      katmanAcik: oturumKatmaniAcik(),
      // sid'i olmayan token (session_id talebi yok) → kayıt tutulamaz; bu bilgi
      // gizlenmemeli, "neden listede yokum?" sorusunun cevabı budur.
      oturumKimligiVar: sid !== null,
      aktif: hepsi.find((k) => k.buCihaz) ? satira(hepsi.find((k) => k.buCihaz)!) : null,
      toplam: hepsi.length,
      // İkisi AYRI sayıdır ve ikisi de doğrudur: `toplam` açık oturum, `cihazSayisi` o
      // oturumların dağıldığı cihaz adedi. Aynı tarayıcıdan üç giriş → toplam 3, cihaz 1.
      cihazSayisi: cihazGruplari(hepsi).length,
    })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /oturum/liste — kullanıcının açık CİHAZLARI (en son görülen başta).
//
// ⚠️ SATIR = CİHAZ, OTURUM DEĞİL. Supabase her girişte yeni `session_id` basıp eskisini
// kapatmadığı için ham liste aynı tarayıcıyı her giriş için tekrar gösteriyordu. Gruplama
// kuralı ve bedelleri lib/oturum.ts `cihazGruplari` başlığında.
//
// `oturumSayisi` GİZLENMEZ: satırın kaç açık girişi topladığı kullanıcının görmesi gereken
// bir bilgidir — "çıkar" düğmesinin neyi kapatacağını da o sayı anlatır.
// ─────────────────────────────────────────────────────────────────────────────
oturumRouter.get('/liste', async (req, res, next) => {
  try {
    const userId = req.userId!
    const kayitlar = await oturumlariListele(userId, req.oturum?.sid ?? null)
    res.json({
      katmanAcik: oturumKatmaniAcik(),
      oturumlar: cihazGruplari(kayitlar).map(cihazSatirina),
    })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /oturum/cikis — YALNIZ bu cihaz.
//
// Diğer cihazlar dokunulmadan kalır: telefonundan çıkan öğrenci masaüstündeki sınavından
// atılmamalı. "Her yerden çık" ayrı ve bilinçli bir eylemdir (aşağıda).
// ─────────────────────────────────────────────────────────────────────────────
oturumRouter.post('/cikis', async (req, res, next) => {
  try {
    const userId = req.userId!
    const sid = req.oturum?.sid ?? null
    const yerel = sid ? await oturumIptalEt(userId, sid) : false
    const supabaseTarafi = await supabaseCikis(tokenAl(req.headers.authorization), 'local')
    res.json({ kapatildi: yerel, supabaseCikisi: supabaseTarafi })
  } catch (err) {
    next(err)
  }
})

// POST /oturum/cikis-hepsi — bu cihaz dahil TÜM cihazlar.
oturumRouter.post('/cikis-hepsi', async (req, res, next) => {
  try {
    const userId = req.userId!
    const adet = await tumOturumlariIptalEt(userId)
    const supabaseTarafi = await supabaseCikis(tokenAl(req.headers.authorization), 'global')
    res.json({ kapatilan: adet, supabaseCikisi: supabaseTarafi })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /oturum/cihaz-cikis — bir CİHAZIN tüm oturumlarını kapat.
//
// ⚠️ NEDEN TEK UÇ, N KEZ DELETE DEĞİL: liste artık cihaz başına gruplandığı için bir
// satır 5-10 sid taşıyabiliyor. İstemcinin döngüde DELETE atması hem hız sınırını
// (standardLimiter 60/dk) tek tıkla yiyebilir hem de yarısı başarılı bir "kapatma"
// bırakabilirdi — kullanıcı satırın kapandığını görür, oturumlardan biri yaşamaya devam eder.
//
// ⚠️ SİD LİSTESİ İSTEMCİDEN GELİR AMA SAHİPLİK SUNUCUDA DOĞRULANIR (lib/oturum.ts
// `oturumlariIptalEt`): yabancı sid sessizce atlanır, sayıya girmez.
// ─────────────────────────────────────────────────────────────────────────────
const SID_TAVANI = 50

oturumRouter.post('/cihaz-cikis', async (req, res, next) => {
  try {
    const userId = req.userId!
    const ham = (req.body as { sidler?: unknown } | undefined)?.sidler
    if (!Array.isArray(ham) || ham.length === 0) {
      throw gecersizIstek('sid_listesi_gerekli', 'Kapatılacak oturum belirtilmedi.')
    }
    if (ham.length > SID_TAVANI) {
      throw gecersizIstek('sid_listesi_uzun', 'Tek istekte en fazla 50 oturum kapatılabilir.')
    }
    const sidler = [...new Set(ham.map((s) => String(s)))]
    if (!sidler.every((s) => SID_DESENI.test(s))) {
      throw gecersizIstek('gecersiz_oturum', 'Oturum kimliği geçersiz.')
    }

    const kapatilan = await oturumlariIptalEt(userId, sidler)
    if (kapatilan === 0) throw bulunamadi('oturum_bulunamadi', 'Oturum bulunamadı.')

    // Kendi oturumu da listedeyse Supabase tarafındaki refresh token'ı da öldür — yalnız
    // o oturum için elimizde token var (gerekçe: DELETE /:sid başlığı).
    const kendisi = req.oturum?.sid != null && sidler.includes(req.oturum.sid)
    const supabaseTarafi = kendisi ? await supabaseCikis(tokenAl(req.headers.authorization), 'local') : false
    res.json({ kapatilan, buCihaz: kendisi, supabaseCikisi: supabaseTarafi })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /oturum/:sid — belirli bir cihazı kapat ("telefonumu kaybettim").
//
// Sahiplik `oturumIptalEt` içinde doğrulanır; başkasının sid'i 404 döner — 403 olsaydı
// yanıt, verilen sid'in GERÇEK bir oturuma ait olduğunu doğrulardı (lib/hata.ts).
//
// ⚠️ Supabase refresh token'ı burada ÖLDÜRÜLEMEZ: GoTrue çıkışı hedef oturumun kendi
// token'ını ister, elimizde yalnız isteği yapan cihazınki var. Kapatılan cihaz bu API'ye
// giremez; Supabase'e doğrudan erişimi erişim token'ı dolunca (~1sa) düşer.
// ─────────────────────────────────────────────────────────────────────────────
oturumRouter.delete('/:sid', async (req, res, next) => {
  try {
    const userId = req.userId!
    const sid = String(req.params.sid)
    if (!SID_DESENI.test(sid)) throw gecersizIstek('gecersiz_oturum', 'Oturum kimliği geçersiz.')

    const kapatildi = await oturumIptalEt(userId, sid)
    if (!kapatildi) throw bulunamadi('oturum_bulunamadi', 'Oturum bulunamadı.')

    const kendisi = req.oturum?.sid === sid
    const supabaseTarafi = kendisi ? await supabaseCikis(tokenAl(req.headers.authorization), 'local') : false
    res.json({ kapatildi: true, buCihaz: kendisi, supabaseCikisi: supabaseTarafi })
  } catch (err) {
    next(err)
  }
})
