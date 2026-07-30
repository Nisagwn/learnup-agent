import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { supabase } from '../clients/supabase.js'
import { redisTry } from '../clients/redis.js'
import { env } from '../config/env.js'
import { TASKS_STREAM, type AgentTask } from '../agents/bus.js'
import { kimligiUnut, sinifiUnut } from '../lib/yetki.js'
import { denetimYaz } from '../lib/denetim.js'
import { logger } from '../utils/logger.js'
import { HttpHatasi, bulunamadi, gecersizIstek } from '../lib/hata.js'
import type {
  AdminDenetimYaniti,
  AdminKullaniciDetayi,
  AskiYanit,
  BasvuruReddetYanit,
  DenetimSatiri,
  GorevIptalYanit,
  GorevYenidenYanit,
  HesapOlusturYanit,
  ProfilDuzeltYanit,
  RolDegisYanit,
  SifreSifirlaYanit,
  SinifAtaYanit,
} from '../types/panel.js'

/**
 * YÖNETİM — KULLANICI & OPS MÜDAHALESİ.
 *
 * admin.routes.ts OKUR (havuz, eval, özgünlük, görevler); burası YAZAR. Ayrı
 * dosya kasıtlı: yazan uçların hepsi aynı üç disipline uymak zorunda ve o
 * disiplinlerin tek yerde okunabilir olması gerekiyor.
 *
 *  1) HER MUTASYON DENETLENİR. `yonetim_denetim`e yazılır; yazılamazsa yanıtta
 *     `denetimYazildi: false` döner. "Bu hesabı kim yönetici yaptı?" sorusunun
 *     cevabı olmayan bir yetki, yetki değil açıktır.
 *  2) HER MUTASYON ÖNBELLEK DÜŞÜRÜR. `kimligiUnut`/`sinifiUnut` çağrılmazsa
 *     yetki katmanı 60 saniye boyunca eski gerçeği söyler.
 *  3) KENDİ ROLÜNÜ DEĞİŞTİREMEZSİN. Bu panelin onarılamaz TEK hatası kendini
 *     yetkisizleştirmektir; kurtarmak elle SQL gerektirir.
 *
 * ⚠️ Bu uçlar app.ts'te requireRole('admin') kapısının ARDINA monte edilir
 * (adminRouter.use). Dosya içinde ikinci bir rol kontrolü YOK — çift kapı,
 * biri gevşetildiğinde diğerinin fark edilmemesi demektir.
 */
export const yonetimRouter = Router()

const ROLLER = ['student', 'teacher', 'admin'] as const
type RolAdi = (typeof ROLLER)[number]

const sayiParam = (v: unknown, varsayilan: number, tavan: number): number => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), tavan) : varsayilan
}

/** handle_new_user() ile AYNI biçim (0016:51): 6 haneli büyük harf hex. */
function sinifKoduUret(): string {
  return randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()
}

/** Çakışmayan sınıf kodu. 16^6 ≈ 16.7M; 6 deneme fazlasıyla yeter. */
async function benzersizSinifKodu(): Promise<string> {
  for (let i = 0; i < 6; i++) {
    const kod = sinifKoduUret()
    const { data } = await supabase.from('profiles').select('id').eq('class_code', kod).maybeSingle()
    if (!data) return kod
  }
  throw new HttpHatasi(500, 'kod_uretilemedi', 'Benzersiz sınıf kodu üretilemedi.')
}

/**
 * "Tablo yok" tespiti — üç kanal, çünkü tek kanal yetmiyor.
 *
 * Postgres ham kodu 42P01 verir; PostgREST aynı durumu şema önbelleğinden
 * PGRST205/PGRST202 olarak bildirir. Mesaj kontrolü son emniyet: sürüm
 * yükseltmesinde kod değişirse panel yine "defter yok" der, 500 vermez.
 */
function tabloYok(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false
  if (err.code === '42P01' || err.code === 'PGRST205' || err.code === 'PGRST202') return true
  return /schema cache|does not exist|relation .* does not exist/i.test(err.message ?? '')
}

async function profilOku(id: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, email, role, is_approved, class_code, school, grade, student_class, teacher_id, created_at, teacher_application_status, teacher_application_at, teacher_application_note, askiya_alindi, aski_neden, aski_veren, aski_at')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new HttpHatasi(500, 'profil_okunamadi', 'Kullanıcı okunamadı.')
  if (!data) throw bulunamadi('kullanici_bulunamadi', 'Kullanıcı bulunamadı.')
  return data as Record<string, unknown>
}

/**
 * SON YÖNETİCİ KORUMASI — sistemi yönetilemez bırakan tek hamleyi engeller.
 *
 * Rol düşürme ve askıya alma AYNI sonucu üretebilir: yönetici kalmayan bir sistem
 * ancak elle SQL ile kurtarılır. İki uçta da aynı kontrol gerektiği için tek yerde.
 */
async function sonYoneticiMi(id: string, mevcutRol: string): Promise<boolean> {
  if (mevcutRol !== 'admin') return false
  const { count } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'admin')
    .eq('askiya_alindi', false)
  return (count ?? 0) <= 1
}

/**
 * Denetim ekranının "yönetici" filtresini besleyen liste.
 *
 * Defterdeki DISTINCT admin_id yerine profiles'tan role='admin' okunur: PostgREST'te
 * distinct yok ve defteri baştan sona çekmek büyüdükçe ağırlaşır. Bedeli, hiç eylemi
 * olmayan yöneticinin de menüde görünmesi — zararsız.
 */
async function yoneticiListesi(): Promise<Array<{ id: string; ad: string | null }>> {
  const { data } = await supabase.from('profiles').select('id, name').eq('role', 'admin').order('name')
  return ((data ?? []) as Array<{ id: string; name: string | null }>).map((y) => ({ id: y.id, ad: y.name }))
}

/** Denetim satırlarını ad'larla zenginleştirir — N+1 YOK, tek toplu okuma. */
async function denetimZenginlestir(ham: Array<Record<string, unknown>>): Promise<DenetimSatiri[]> {
  const idler = [...new Set(ham.flatMap((r) => [r.admin_id, r.hedef_id]).filter(Boolean).map(String))]
  const adlar = new Map<string, string | null>()
  if (idler.length) {
    const { data } = await supabase.from('profiles').select('id, name').in('id', idler)
    for (const p of (data ?? []) as Array<{ id: string; name: string | null }>) adlar.set(p.id, p.name)
  }
  return ham.map((r) => ({
    id: Number(r.id),
    adminId: String(r.admin_id),
    adminAdi: adlar.get(String(r.admin_id)) ?? null,
    eylem: r.eylem as DenetimSatiri['eylem'],
    hedefId: (r.hedef_id as string | null) ?? null,
    hedefTur: (r.hedef_tur as DenetimSatiri['hedefTur']) ?? null,
    hedefAdi: r.hedef_id ? (adlar.get(String(r.hedef_id)) ?? null) : null,
    detay: (r.detay as Record<string, unknown>) ?? {},
    createdAt: String(r.created_at),
  }))
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /admin/kullanici/:id — tek kullanıcının tam künyesi
//
// Yöneticinin sınıf verisine tek meşru penceresi. /teacher/* uçları ona kasten
// kapalı (sınıfı req.userId'den türetiyorlar, admin orada sessizce boş sınıf
// görürdü). "Öğretmen sınıfım boş diyor" şikâyeti buradan teşhis edilir.
// ─────────────────────────────────────────────────────────────────────────────
yonetimRouter.get('/kullanici/:id', async (req, res, next) => {
  try {
    const id = String(req.params.id)
    const p = await profilOku(id)
    const rol = (p.role as RolAdi) ?? 'student'
    const hafta = new Date(Date.now() - 7 * 86_400_000).toISOString()

    const [ogretmenSat, mevcut, logSayim, log7, sonLog, kazanimSayim, denetimHam, askiVeren] = await Promise.all([
      p.teacher_id
        ? supabase.from('profiles').select('id, name, class_code, school').eq('id', String(p.teacher_id)).maybeSingle()
        : Promise.resolve({ data: null }),
      rol === 'teacher'
        ? supabase.from('profiles').select('id, name').eq('role', 'student').eq('teacher_id', id).order('name')
        : Promise.resolve({ data: null }),
      supabase.from('user_logs').select('id', { count: 'exact', head: true }).eq('student_id', id),
      supabase.from('user_logs').select('id', { count: 'exact', head: true }).eq('student_id', id).gte('created_at', hafta),
      supabase.from('user_logs').select('created_at').eq('student_id', id)
        .order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('user_mastery').select('kazanim_id', { count: 'exact', head: true }).eq('user_id', id),
      supabase.from('yonetim_denetim').select('id, admin_id, eylem, hedef_id, hedef_tur, detay, created_at')
        .eq('hedef_id', id).order('created_at', { ascending: false }).limit(20),
      // Askıyı KİM verdi: "hesabım neden kapalı" sorusunun muhatabı belli olsun.
      p.aski_veren
        ? supabase.from('profiles').select('id, name').eq('id', String(p.aski_veren)).maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    const toplamCevap = logSayim.count ?? 0
    const takip = kazanimSayim.count ?? 0
    const ogr = ogretmenSat.data as { id: string; name: string | null; class_code: string | null; school: string | null } | null
    const mev = (mevcut.data ?? null) as Array<{ id: string; name: string | null }> | null

    const yanit: AdminKullaniciDetayi = {
      kullanici: {
        id,
        name: (p.name as string | null) ?? null,
        email: (p.email as string | null) ?? null,
        role: rol,
        isApproved: p.is_approved === true,
        classCode: (p.class_code as string | null) ?? null,
        school: (p.school as string | null) ?? null,
        ogrenciSayisi: rol === 'teacher' ? (mev?.length ?? 0) : null,
        createdAt: String(p.created_at),
        grade: (p.grade as string | null) ?? null,
        studentClass: (p.student_class as string | null) ?? null,
        basvuruDurumu: (p.teacher_application_status as AdminKullaniciDetayi['kullanici']['basvuruDurumu']) ?? null,
        askidaMi: p.askiya_alindi === true,
      },
      ogretmen: ogr ? { id: ogr.id, name: ogr.name, classCode: ogr.class_code, school: ogr.school } : null,
      sinif: mev ? { ogrenciSayisi: mev.length, ogrenciler: mev.slice(0, 200) } : null,
      // ⚠️ Hiç kaydı yoksa null — 0 DEĞİL. "Hiç başlamamış" ile "0 doğru yapmış"
      // aynı şey değildir; sıfır basmak yöneticiyi yanlış teşhise iter.
      etkinlik: toplamCevap === 0 && takip === 0 ? null : {
        toplamCevap,
        son7Gun: log7.count ?? 0,
        sonGorulme: (sonLog.data?.created_at as string | undefined) ?? null,
        takipEdilenKazanim: takip,
      },
      // Öğretmen başvurusu (0021) — durum varsa bağlamı (tarih + not) açar.
      basvuru: p.teacher_application_status
        ? {
            durum: p.teacher_application_status as 'bekliyor' | 'onaylandi' | 'reddedildi',
            tarih: (p.teacher_application_at as string | null) ?? null,
            not: (p.teacher_application_note as string | null) ?? null,
          }
        : null,
      aski: p.askiya_alindi === true
        ? {
            neden: (p.aski_neden as string | null) ?? null,
            verenId: (p.aski_veren as string | null) ?? null,
            verenAdi: ((askiVeren.data as { name: string | null } | null)?.name) ?? null,
            tarih: (p.aski_at as string | null) ?? null,
          }
        : null,
      // 0020 yoksa burası sessizce boş kalır ve bu KABUL EDİLEBİLİR: defterin
      // yokluğunu haykıran yer /admin/denetim paneli. Detay kartında ikinci bir
      // uyarı, aynı bilgiyi iki kez söyleyen gürültü olurdu.
      denetim: await denetimZenginlestir((denetimHam.data ?? []) as Array<Record<string, unknown>>),
      olcumZamani: new Date().toISOString(),
    }
    res.json(yanit)
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /admin/kullanici/:id/rol — body: { rol: 'student'|'teacher'|'admin' }
// ─────────────────────────────────────────────────────────────────────────────
yonetimRouter.post('/kullanici/:id/rol', async (req, res, next) => {
  try {
    const adminId = req.userId!
    const id = String(req.params.id)
    const istenen = (req.body as { rol?: unknown })?.rol

    if (typeof istenen !== 'string' || !ROLLER.includes(istenen as RolAdi)) {
      throw gecersizIstek('gecersiz_rol', '`rol` alanı student, teacher ya da admin olmalı.')
    }
    const yeniRol = istenen as RolAdi

    // ⚠️ KİLİTLENME KORUMASI — bu dosyanın 3. disiplini.
    if (id === adminId) {
      throw gecersizIstek('kendi_rolun', 'Kendi rolünü değiştiremezsin. Bunu başka bir yönetici yapmalı.')
    }

    const p = await profilOku(id)
    const oncekiRol = (p.role as RolAdi) ?? 'student'
    if (oncekiRol === yeniRol) throw gecersizIstek('zaten_o_rol', `Kullanıcı zaten ${yeniRol} rolünde.`)

    // Savunma katmanı: pratikte erişilemez (tek yönetici varsa o yönetici SENSİN
    // ve yukarıdaki kendi_rolun kapısına takılırsın). Kural yine de açık yazılı:
    // son yöneticinin düşmesi sistemi elle SQL'siz yönetilemez bırakır.
    //
    // ⚠️ 0025'ten beri "son yönetici" sayımı ASKIDA OLMAYANLARI sayar: askıdaki bir
    // yönetici hiçbir uca giremediği için yedek değildir.
    if (await sonYoneticiMi(id, oncekiRol)) {
      throw gecersizIstek('son_yonetici', 'Sistemdeki son yöneticinin rolü düşürülemez.')
    }

    // ── Öğretmenlikten çıkış: sınıfı BOŞALT ──
    // Bunu yapmazsak öğrenciler artık öğretmen olmayan bir id'ye bağlı kalır:
    // hiçbir panelde görünmezler, kimse onlara ödev atayamaz — sessizce kaybolurlar.
    let serbest = 0
    if (oncekiRol === 'teacher') {
      const { data: bosaltilan, error: bosHata } = await supabase
        .from('profiles').update({ teacher_id: null })
        .eq('teacher_id', id).eq('role', 'student').select('id')
      if (bosHata) throw new HttpHatasi(500, 'sinif_bosaltilamadi', 'Öğretmenin sınıfı boşaltılamadı.')
      const ids = ((bosaltilan ?? []) as Array<{ id: string }>).map((r) => r.id)
      serbest = ids.length
      await Promise.all(ids.map((sid) => kimligiUnut(sid)))
      sinifiUnut(id)
    }

    const yama: Record<string, unknown> = { role: yeniRol }
    let classCode = (p.class_code as string | null) ?? null

    // Öğrencilikten çıkanın KENDİ sınıf üyeliği de kopar: öğretmenin/yöneticinin
    // bir sınıfta "öğrenci" olarak durması anlamsız — GET /sinif onu kayıtlı
    // gösterir, sinif_mevcudu ise saymaz (role='student' filtresi). İki kaynak
    // aynı soruya farklı cevap verirdi.
    const eskiOgretmenId = (p.teacher_id as string | null) ?? null
    if (yeniRol !== 'student' && eskiOgretmenId) yama.teacher_id = null

    // Bekleyen öğretmen başvurusu (0021): teacher'a terfi onu KAPATIR ('onaylandi'),
    // başka role geçiş dangling başvuru bırakmamak için TEMİZLER (null). Bu, yönetici
    // onayının "başvuru durumunu kapatması" gereğidir (kart kriteri).
    const oncekiBasvuru = (p.teacher_application_status as string | null) ?? null
    if (yeniRol === 'teacher') {
      // Yönetici ELLE terfi ettiriyor → onay zaten verilmiş sayılır. İkinci bir
      // tıklama beklemek yeni öğretmeni sebepsiz 403'te bırakırdı.
      yama.is_approved = true
      if (!classCode) classCode = await benzersizSinifKodu()
      yama.class_code = classCode
      yama.teacher_application_status = 'onaylandi'
    } else {
      // Öğretmenlikten çıkanın kodu ölür: kimse eski koda katılmaya çalışmasın.
      yama.class_code = null
      yama.is_approved = false
      classCode = null
      yama.teacher_application_status = null
    }

    const { error } = await supabase.from('profiles').update(yama).eq('id', id)
    if (error) throw new HttpHatasi(500, 'rol_yazilamadi', 'Rol güncellenemedi.')
    await kimligiUnut(id)
    // Eski öğretmeninin mevcudu değişti — onun listesi de tazelenmeli.
    if (eskiOgretmenId && yama.teacher_id === null) sinifiUnut(eskiOgretmenId)

    const denetimYazildi = await denetimYaz({
      adminId, eylem: 'rol_degis', hedefId: id, hedefTur: 'kullanici',
      detay: {
        oncekiRol, yeniRol, serbestBirakilanOgrenci: serbest, classCode, email: p.email ?? null,
        // Bekleyen bir başvuru bu terfiyle kapandıysa iz kalsın ("kim başvurmuştu, kim onayladı").
        basvuruKapatildi: oncekiBasvuru === 'bekliyor' && yeniRol === 'teacher',
      },
    })

    const yanit: RolDegisYanit = {
      id, oncekiRol, yeniRol, serbestBirakilanOgrenci: serbest, classCode, denetimYazildi,
    }
    res.json(yanit)
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /admin/kullanici/:id/sinif — body: { teacherId: string | null }
//
// Öğretmenin YAPAMADIĞI iş. teacher.routes.ts POST /ogrenci artık başka sınıftaki
// öğrenciyi reddediyor: devir meşru olabilir ama kararı DEVRALAN öğretmen veremez.
// Yönetici verir ve kararın izi kalır.
// ─────────────────────────────────────────────────────────────────────────────
yonetimRouter.post('/kullanici/:id/sinif', async (req, res, next) => {
  try {
    const adminId = req.userId!
    const studentId = String(req.params.id)
    const ham = (req.body as { teacherId?: unknown })?.teacherId
    if (ham !== null && typeof ham !== 'string') {
      throw gecersizIstek('gecersiz_ogretmen', '`teacherId` bir uuid ya da null olmalı.')
    }
    const yeniOgretmenId = ham as string | null

    const p = await profilOku(studentId)
    if (p.role !== 'student') {
      throw gecersizIstek('ogrenci_degil', 'Yalnızca öğrenci hesapları bir sınıfa atanabilir.')
    }
    const oncekiOgretmenId = (p.teacher_id as string | null) ?? null
    if (oncekiOgretmenId === yeniOgretmenId) {
      throw gecersizIstek('degisiklik_yok', 'Öğrenci zaten bu durumda.')
    }

    if (yeniOgretmenId) {
      const { data: ogr } = await supabase
        .from('profiles').select('id, role, is_approved').eq('id', yeniOgretmenId).maybeSingle()
      if (!ogr || ogr.role !== 'teacher') throw bulunamadi('ogretmen_bulunamadi', 'Hedef öğretmen bulunamadı.')
      // Onaysız öğretmene atama, öğrenciyi HİÇBİR panelde görünmeyen bir sınıfa
      // koyar: o öğretmen /teacher/* uçlarından 403 alıyor.
      if (ogr.is_approved !== true) {
        throw gecersizIstek('ogretmen_onaysiz', 'Önce öğretmeni onaylaman gerekiyor.')
      }
    }

    const { error } = await supabase
      .from('profiles').update({ teacher_id: yeniOgretmenId }).eq('id', studentId).eq('role', 'student')
    if (error) throw new HttpHatasi(500, 'atama_yazilamadi', 'Sınıf ataması kaydedilemedi.')

    await kimligiUnut(studentId)
    if (oncekiOgretmenId) sinifiUnut(oncekiOgretmenId)
    if (yeniOgretmenId) sinifiUnut(yeniOgretmenId)

    const denetimYazildi = await denetimYaz({
      adminId, eylem: 'sinif_ata', hedefId: studentId, hedefTur: 'kullanici',
      detay: { oncekiOgretmenId, yeniOgretmenId, ogrenciAdi: p.name ?? null },
    })

    const yanit: SinifAtaYanit = { studentId, oncekiOgretmenId, yeniOgretmenId, denetimYazildi }
    res.json(yanit)
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /admin/kullanici — DAVETLE HESAP AÇMA
//
// ⚠️ ŞİFRE BELİRLENMEZ, DAVET GÖNDERİLİR. Yöneticinin şifre yazdığı bir akış, o
// şifrenin bir yerde (sohbet, not, e-posta) düz metin dolaşması demektir. Davet
// bağlantısıyla şifreyi kullanıcının kendisi kurar; yönetici hiçbir an bilmez.
//
// ⚠️ ROL: yalnız student|teacher. 'admin' BU UÇTAN AÇILMAZ — yönetici terfisi rol
// ucundan geçer (orada kendi-rolün ve son-yönetici korumaları var, burada yok).
// ─────────────────────────────────────────────────────────────────────────────
const EPOSTA = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

yonetimRouter.post('/kullanici', async (req, res, next) => {
  try {
    const adminId = req.userId!
    const b = (req.body ?? {}) as Record<string, unknown>
    const email = String(b.email ?? '').trim().toLowerCase()
    const ad = String(b.name ?? '').trim()
    const istenenRol = b.rol === 'teacher' ? 'teacher' : b.rol === 'student' ? 'student' : null

    if (!EPOSTA.test(email)) throw gecersizIstek('gecersiz_eposta', 'Geçerli bir e-posta adresi gerekli.')
    if (!ad) throw gecersizIstek('ad_gerekli', 'Hesap için bir ad gerekli.')
    if (!istenenRol) {
      throw gecersizIstek('gecersiz_rol', '`rol` alanı student ya da teacher olmalı (admin bu uçtan açılmaz).')
    }

    // Aynı e-posta zaten varsa davet göndermek "yeni hesap açtım" yanılsaması üretir.
    const { data: mevcut } = await supabase.from('profiles').select('id').ilike('email', email).maybeSingle()
    if (mevcut) throw gecersizIstek('eposta_kayitli', 'Bu e-posta zaten kayıtlı.')

    // handle_new_user() metadata'dan profil satırını kurar. Rol İDDİASI oradan GEÇMEZ
    // (0021/0024: kayıt kapısı rol beyaz listesini kendi uygular) — bu yüzden davetten
    // sonra rol/onay alanlarını service_role ile BİZ yazarız.
    const { data: olusan, error: davetHata } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: {
        name: ad,
        ...(b.grade ? { grade: String(b.grade) } : {}),
        ...(b.studentClass ? { student_class: String(b.studentClass) } : {}),
      },
    })

    if (davetHata || !olusan?.user) {
      // ⚠️ "HESAP AÇILDI" DEMİYORUZ. Supabase projesinde SMTP kurulu değilse davet
      // sessizce düşer; başarı göstermek yöneticiyi olmayan bir hesabı beklemeye iter.
      logger.error({ err: davetHata, email }, 'davet gönderilemedi')
      const yanit: HesapOlusturYanit = {
        id: null,
        email,
        role: istenenRol,
        davetGonderildi: false,
        hata: davetHata?.message ?? 'Davet gönderilemedi.',
        denetimYazildi: false,
      }
      res.status(502).json(yanit)
      return
    }

    const yeniId = olusan.user.id

    // Öğretmen daveti: sınıf kodu + onay hemen verilir. Yönetici zaten ELLE açıyor;
    // ikinci bir onay tıklaması yeni öğretmeni sebepsiz 403'te bırakırdı (rol ucuyla aynı gerekçe).
    const yama: Record<string, unknown> = { role: istenenRol, name: ad }
    let classCode: string | null = null
    if (istenenRol === 'teacher') {
      classCode = await benzersizSinifKodu()
      yama.class_code = classCode
      yama.is_approved = true
      yama.teacher_application_status = 'onaylandi'
    }
    if (b.school) yama.school = String(b.school)

    const { error: yazHata } = await supabase.from('profiles').update(yama).eq('id', yeniId)
    if (yazHata) throw new HttpHatasi(500, 'profil_yazilamadi', 'Hesap açıldı ama rolü yazılamadı.')
    await kimligiUnut(yeniId)

    const denetimYazildi = await denetimYaz({
      adminId, eylem: 'hesap_olustur', hedefId: yeniId, hedefTur: 'kullanici',
      detay: { email, ad, rol: istenenRol, classCode },
    })

    const yanit: HesapOlusturYanit = {
      id: yeniId, email, role: istenenRol, davetGonderildi: true, hata: null, denetimYazildi,
    }
    res.status(201).json(yanit)
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /admin/kullanici/:id — künye düzeltme
//
// ⚠️ YETKİ ALANLARI BU UÇTAN YAZILAMAZ: role, is_approved, teacher_id, class_code,
// askiya_alindi. Her birinin kendi ucu ve kendi korumaları var; hepsini tek "profil
// güncelle" ucuna toplamak, o korumaları atlanabilir kılardı.
// ─────────────────────────────────────────────────────────────────────────────
const DUZELTILEBILIR = ['name', 'school', 'grade', 'student_class'] as const

yonetimRouter.patch('/kullanici/:id', async (req, res, next) => {
  try {
    const adminId = req.userId!
    const id = String(req.params.id)
    const b = (req.body ?? {}) as Record<string, unknown>
    const p = await profilOku(id)

    const yama: Record<string, unknown> = {}
    const degisenler: ProfilDuzeltYanit['degisenler'] = {}
    for (const alan of DUZELTILEBILIR) {
      if (!(alan in b)) continue
      const ham = b[alan]
      // null = alanı temizle; boş string de null'a çevrilir (iki farklı "boş" tutmayalım).
      const yeni = ham === null || String(ham).trim() === '' ? null : String(ham).trim().slice(0, 200)
      const onceki = (p[alan] as string | null) ?? null
      if (onceki === yeni) continue
      yama[alan] = yeni
      degisenler[alan] = { onceki, yeni }
    }

    // Hiçbir şey değişmediyse 400: "kaydedildi" demek, olmayan bir işi olmuş göstermek.
    if (!Object.keys(yama).length) {
      throw gecersizIstek('degisiklik_yok', 'Düzeltilecek bir alan yok.')
    }

    const { error } = await supabase.from('profiles').update(yama).eq('id', id)
    if (error) throw new HttpHatasi(500, 'profil_yazilamadi', 'Künye güncellenemedi.')
    // Ad `Kimlik`te taşınıyor → önbellek düşmezse panel eski adı göstermeye devam eder.
    await kimligiUnut(id)

    const denetimYazildi = await denetimYaz({
      adminId, eylem: 'profil_duzelt', hedefId: id, hedefTur: 'kullanici',
      detay: { degisenler, email: p.email ?? null },
    })

    const yanit: ProfilDuzeltYanit = { id, degisenler, denetimYazildi }
    res.json(yanit)
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /admin/kullanici/:id/sifre-sifirla — kurtarma bağlantısı GÖNDER
//
// ⚠️ NEDEN `resetPasswordForEmail`, `admin.generateLink` DEĞİL: generateLink kurtarma
// URL'ini ÜRETİR ve çağırana döndürür, e-posta göndermez. O URL'i yöneticinin eline
// vermek hesabı devralmaya yeter — şifre sıfırlama yetkisi HESABA GİRME yetkisi
// değildir. resetPasswordForEmail bağlantıyı yalnız kullanıcının kutusuna gönderir.
// ─────────────────────────────────────────────────────────────────────────────
yonetimRouter.post('/kullanici/:id/sifre-sifirla', async (req, res, next) => {
  try {
    const adminId = req.userId!
    const id = String(req.params.id)
    const p = await profilOku(id)
    const email = (p.email as string | null) ?? null
    if (!email) throw gecersizIstek('eposta_yok', 'Bu hesabın e-posta adresi yok.')

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${env.APP_URL}/giris`,
    })

    if (error) {
      logger.error({ err: error, id }, 'şifre sıfırlama gönderilemedi')
      const yanit: SifreSifirlaYanit = {
        id, email, gonderildi: false, hata: error.message, denetimYazildi: false,
      }
      res.status(502).json(yanit)
      return
    }

    const denetimYazildi = await denetimYaz({
      adminId, eylem: 'sifre_sifirla', hedefId: id, hedefTur: 'kullanici', detay: { email },
    })

    const yanit: SifreSifirlaYanit = { id, email, gonderildi: true, hata: null, denetimYazildi }
    res.json(yanit)
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /admin/kullanici/:id/aski — body: { askida: boolean, neden?: string }
//
// Hesabı durdurmanın TEK meşru yolu (0025). Kalıcı silme bilinçli olarak YOK:
// yanlış askı bir özür, yanlış silme onarılamaz bir kayıptır.
//
// ⚠️ ASKI ROL DEĞİLDİR: sınıf bağı, ustalık, ödev geçmişi olduğu gibi kalır.
// Askı kalkınca kullanıcı bıraktığı yerden devam eder.
// ─────────────────────────────────────────────────────────────────────────────
yonetimRouter.post('/kullanici/:id/aski', async (req, res, next) => {
  try {
    const adminId = req.userId!
    const id = String(req.params.id)
    const b = (req.body ?? {}) as { askida?: unknown; neden?: unknown }
    if (typeof b.askida !== 'boolean') {
      throw gecersizIstek('gecersiz_aski', '`askida` alanı true/false olmalı.')
    }
    const askida = b.askida
    const neden = typeof b.neden === 'string' && b.neden.trim() ? b.neden.trim().slice(0, 500) : null

    // ⚠️ KİLİTLENME KORUMASI — rol ucundakinin ikizi. Kendi hesabını askıya alan
    // yönetici kendini dışarı kilitler ve kurtuluş elle SQL'dir.
    if (id === adminId) {
      throw gecersizIstek('kendi_hesabin', 'Kendi hesabını askıya alamazsın. Bunu başka bir yönetici yapmalı.')
    }

    const p = await profilOku(id)
    if ((p.askiya_alindi === true) === askida) {
      throw gecersizIstek('degisiklik_yok', askida ? 'Hesap zaten askıda.' : 'Hesap zaten aktif.')
    }
    if (askida && (await sonYoneticiMi(id, String(p.role)))) {
      throw gecersizIstek('son_yonetici', 'Sistemdeki son yönetici askıya alınamaz.')
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        askiya_alindi: askida,
        aski_neden: askida ? neden : null,
        aski_veren: askida ? adminId : null,
        aski_at: askida ? new Date().toISOString() : null,
      })
      .eq('id', id)
    if (error) throw new HttpHatasi(500, 'aski_yazilamadi', 'Askı durumu güncellenemedi.')

    // ⚠️ ZORUNLU: önbellek düşmezse askı 60 saniye boyunca HİÇBİR ŞEY YAPMAZ —
    // requireAktifHesap eski kimliği okur ve kullanıcı çalışmaya devam eder.
    await kimligiUnut(id)

    const denetimYazildi = await denetimYaz({
      adminId,
      eylem: askida ? 'hesap_askiya' : 'hesap_geri_al',
      hedefId: id,
      hedefTur: 'kullanici',
      detay: { neden, rol: p.role ?? null, email: p.email ?? null },
    })

    const yanit: AskiYanit = { id, askidaMi: askida, neden: askida ? neden : null, denetimYazildi }
    res.json(yanit)
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /admin/basvuru/:id/reddet — öğretmen başvurusunu reddet
//
// Onayın karşılığı. Onay rol ucundan geçer (terfi başvuruyu 'onaylandi' yapar);
// red hiçbir role dokunmaz, yalnız kuyruğu kapatır. Reddi ayrı uç yapmanın sebebi
// bu: rol değiştirmeden başvuruyu sonlandırmanın başka yolu yoktu, bekleyen
// başvurular kuyrukta sonsuza kadar duruyordu.
// ─────────────────────────────────────────────────────────────────────────────
yonetimRouter.post('/basvuru/:id/reddet', async (req, res, next) => {
  try {
    const adminId = req.userId!
    const id = String(req.params.id)
    const ham = (req.body as { not?: unknown })?.not
    const not = typeof ham === 'string' && ham.trim() ? ham.trim().slice(0, 500) : null

    const p = await profilOku(id)
    if (p.teacher_application_status !== 'bekliyor') {
      throw gecersizIstek('basvuru_bekliyor_degil', 'Bu hesabın bekleyen bir öğretmen başvurusu yok.')
    }

    const { error } = await supabase
      .from('profiles')
      .update({ teacher_application_status: 'reddedildi', teacher_application_note: not })
      .eq('id', id)
      .eq('teacher_application_status', 'bekliyor') // yarış koruması: arada onaylandıysa yazma
    if (error) throw new HttpHatasi(500, 'red_yazilamadi', 'Başvuru reddi kaydedilemedi.')

    const denetimYazildi = await denetimYaz({
      adminId, eylem: 'basvuru_reddet', hedefId: id, hedefTur: 'kullanici',
      detay: { not, email: p.email ?? null },
    })

    const yanit: BasvuruReddetYanit = { id, durum: 'reddedildi', not, denetimYazildi }
    res.json(yanit)
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /admin/gorev/:id/yeniden — takılan/başarısız görevi kuyruğa geri koy
// ─────────────────────────────────────────────────────────────────────────────
yonetimRouter.post('/gorev/:id/yeniden', async (req, res, next) => {
  try {
    const adminId = req.userId!
    const id = String(req.params.id)

    const { data: gorev, error: okuHata } = await supabase
      .from('agent_tasks').select('id, user_id, kind, payload, status, attempts').eq('id', id).maybeSingle()
    if (okuHata) throw new HttpHatasi(500, 'gorev_okunamadi', 'Görev okunamadı.')
    if (!gorev) throw bulunamadi('gorev_bulunamadi', 'Görev bulunamadı.')
    if (gorev.status !== 'FAILED' && gorev.status !== 'RUNNING') {
      throw gecersizIstek('yeniden_gerekmiyor', `Görev ${gorev.status} durumunda; yeniden kuyruklanacak bir şey yok.`)
    }

    // ⚠️ attempts SIFIRLANMAK ZORUNDA. Bekçi (atolye.worker.ts:66) attempts >= 3
    // olan her PENDING görevi anında FAILED'a çeviriyor — sıfırlamasaydık bu uç
    // görünürde çalışır, görev 5 dakika içinde sessizce geri düşerdi.
    const { error } = await supabase
      .from('agent_tasks')
      .update({ status: 'PENDING', error: null, locked_by: null, locked_at: null, attempts: 0 })
      .eq('id', id)
    if (error) throw new HttpHatasi(500, 'gorev_yazilamadi', 'Görev durumu güncellenemedi.')

    // Akışa it. Redis yoksa görev KAYBOLMAZ — bekçi 5 dk içinde toplar; yanıt bunu söyler.
    const task: AgentTask = { id: gorev.id, userId: gorev.user_id, kind: gorev.kind, payload: gorev.payload ?? {} }
    const akisaItildi = await redisTry(async (r) => {
      await r.call('XADD', TASKS_STREAM, 'MAXLEN', '~', 10_000, '*', 'task', JSON.stringify(task))
      return true
    }, false)

    const denetimYazildi = await denetimYaz({
      adminId, eylem: 'gorev_yeniden', hedefId: id, hedefTur: 'gorev',
      detay: { oncekiDurum: gorev.status, kind: gorev.kind, oncekiAttempts: gorev.attempts ?? 0, akisaItildi },
    })

    const yanit: GorevYenidenYanit = {
      id, oncekiDurum: String(gorev.status), yeniDurum: 'PENDING', akisaItildi, denetimYazildi,
    }
    res.json(yanit)
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /admin/gorev/:id/iptal — takılan görevi durdur (yeniden kuyruklamanın TERSİ)
//
// Sonsuz döngüye girmiş ya da artık anlamsız kalmış bir görev, RUNNING'de kilitli
// kaldığı sürece panelin sağlık göstergesini "kritik" tutar ve bekçi onu 5 dakikada
// bir yeniden denemeye açar. Kapatabilmek gerekiyor.
// ─────────────────────────────────────────────────────────────────────────────
yonetimRouter.post('/gorev/:id/iptal', async (req, res, next) => {
  try {
    const adminId = req.userId!
    const id = String(req.params.id)

    const { data: gorev, error: okuHata } = await supabase
      .from('agent_tasks').select('id, kind, status, attempts').eq('id', id).maybeSingle()
    if (okuHata) throw new HttpHatasi(500, 'gorev_okunamadi', 'Görev okunamadı.')
    if (!gorev) throw bulunamadi('gorev_bulunamadi', 'Görev bulunamadı.')
    if (gorev.status !== 'PENDING' && gorev.status !== 'RUNNING') {
      throw gecersizIstek('iptal_gerekmiyor', `Görev ${gorev.status} durumunda; iptal edilecek bir şey yok.`)
    }

    // ⚠️ attempts TAVANA ÇEKİLİR. Yalnız FAILED yazsaydık bekçi görevi tekrar
    // toplayabilirdi; attempts >= 3 olan görev bir daha kuyruğa girmez (worker kuralı).
    const { error } = await supabase
      .from('agent_tasks')
      .update({ status: 'FAILED', error: 'yönetici tarafından iptal edildi', locked_by: null, locked_at: null, attempts: 3 })
      .eq('id', id)
    if (error) throw new HttpHatasi(500, 'gorev_yazilamadi', 'Görev durumu güncellenemedi.')

    const denetimYazildi = await denetimYaz({
      adminId, eylem: 'gorev_iptal', hedefId: id, hedefTur: 'gorev',
      detay: { oncekiDurum: gorev.status, kind: gorev.kind, oncekiAttempts: gorev.attempts ?? 0 },
    })

    const yanit: GorevIptalYanit = {
      id, oncekiDurum: String(gorev.status), yeniDurum: 'FAILED', denetimYazildi,
    }
    res.json(yanit)
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /admin/denetim — yönetim eylem defteri. ÖNBELLEK YOK: denetim bayatlamaz.
//
// Filtreler: eylem · adminId · hedefId · baslangic/bitis (ISO tarih) · limit/offset.
// ─────────────────────────────────────────────────────────────────────────────
yonetimRouter.get('/denetim', async (req, res, next) => {
  try {
    const limit = sayiParam(req.query.limit, 50, 200)
    const offset = Math.max(0, Number(req.query.offset) || 0)
    const eylem = req.query.eylem ? String(req.query.eylem) : null
    const filtreAdmin = req.query.adminId ? String(req.query.adminId) : null
    const hedefId = req.query.hedefId ? String(req.query.hedefId) : null
    const baslangic = req.query.baslangic ? String(req.query.baslangic) : null
    const bitis = req.query.bitis ? String(req.query.bitis) : null

    let q = supabase
      .from('yonetim_denetim')
      .select('id, admin_id, eylem, hedef_id, hedef_tur, detay, created_at', { count: 'exact' })
    if (eylem) q = q.eq('eylem', eylem)
    if (filtreAdmin) q = q.eq('admin_id', filtreAdmin)
    if (hedefId) q = q.eq('hedef_id', hedefId)
    if (baslangic) q = q.gte('created_at', baslangic)
    // Bitiş GÜN SONUNU kapsar: kullanıcı "31 Temmuz"u seçtiğinde o günün kayıtları
    // dışarıda kalırsa filtre yalan söyler (lt yerine lte + gün sonu).
    if (bitis) q = q.lte('created_at', bitis.length === 10 ? `${bitis}T23:59:59.999Z` : bitis)

    const { data, count, error } = await q
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      // "Tablo yok" (0020 uygulanmadı) ≠ "hiç işlem yok". Boş liste döndürmek,
      // denetlenmeyen bir sistemi temiz göstermek olurdu.
      //
      // ⚠️ 42P01 TEK BAŞINA YETMİYOR: PostgREST tabloyu şema önbelleğinde
      // bulamayınca ham Postgres kodunu değil PGRST205 döndürüyor. Yalnız 42P01'e
      // bakan ilk sürüm bu yüzden 500 veriyordu — canlıda ölçüldü.
      if (tabloYok(error)) {
        const bos: AdminDenetimYaniti = {
          kayitlar: [], total: 0, limit, offset, defterYok: true, yoneticiler: [],
        }
        res.json(bos)
        return
      }
      logger.error({ err: error }, 'denetim defteri okunamadı')
      throw new HttpHatasi(500, 'denetim_okunamadi', 'Denetim defteri okunamadı.')
    }

    const yanit: AdminDenetimYaniti = {
      kayitlar: await denetimZenginlestir((data ?? []) as Array<Record<string, unknown>>),
      total: count ?? 0,
      limit,
      offset,
      defterYok: false,
      yoneticiler: await yoneticiListesi(),
    }
    res.json(yanit)
  } catch (err) {
    next(err)
  }
})
