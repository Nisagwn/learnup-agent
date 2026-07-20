import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { supabase } from '../clients/supabase.js'
import { redisTry } from '../clients/redis.js'
import { TASKS_STREAM, type AgentTask } from '../agents/bus.js'
import { kimligiUnut, sinifiUnut } from '../lib/yetki.js'
import { denetimYaz } from '../lib/denetim.js'
import { logger } from '../utils/logger.js'
import { HttpHatasi, bulunamadi, gecersizIstek } from '../lib/hata.js'
import type {
  AdminDenetimYaniti,
  AdminKullaniciDetayi,
  DenetimSatiri,
  GorevYenidenYanit,
  RolDegisYanit,
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
    .select('id, name, email, role, is_approved, class_code, school, grade, student_class, teacher_id, created_at')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new HttpHatasi(500, 'profil_okunamadi', 'Kullanıcı okunamadı.')
  if (!data) throw bulunamadi('kullanici_bulunamadi', 'Kullanıcı bulunamadı.')
  return data as Record<string, unknown>
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

    const [ogretmenSat, mevcut, logSayim, log7, sonLog, kazanimSayim, denetimHam] = await Promise.all([
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
    if (oncekiRol === 'admin') {
      const { count } = await supabase
        .from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin')
      if ((count ?? 0) <= 1) {
        throw gecersizIstek('son_yonetici', 'Sistemdeki son yöneticinin rolü düşürülemez.')
      }
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

    if (yeniRol === 'teacher') {
      // Yönetici ELLE terfi ettiriyor → onay zaten verilmiş sayılır. İkinci bir
      // tıklama beklemek yeni öğretmeni sebepsiz 403'te bırakırdı.
      yama.is_approved = true
      if (!classCode) classCode = await benzersizSinifKodu()
      yama.class_code = classCode
    } else {
      // Öğretmenlikten çıkanın kodu ölür: kimse eski koda katılmaya çalışmasın.
      yama.class_code = null
      yama.is_approved = false
      classCode = null
    }

    const { error } = await supabase.from('profiles').update(yama).eq('id', id)
    if (error) throw new HttpHatasi(500, 'rol_yazilamadi', 'Rol güncellenemedi.')
    await kimligiUnut(id)
    // Eski öğretmeninin mevcudu değişti — onun listesi de tazelenmeli.
    if (eskiOgretmenId && yama.teacher_id === null) sinifiUnut(eskiOgretmenId)

    const denetimYazildi = await denetimYaz({
      adminId, eylem: 'rol_degis', hedefId: id, hedefTur: 'kullanici',
      detay: { oncekiRol, yeniRol, serbestBirakilanOgrenci: serbest, classCode, email: p.email ?? null },
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
// GET /admin/denetim — yönetim eylem defteri. ÖNBELLEK YOK: denetim bayatlamaz.
// ─────────────────────────────────────────────────────────────────────────────
yonetimRouter.get('/denetim', async (req, res, next) => {
  try {
    const limit = sayiParam(req.query.limit, 50, 200)
    const offset = Math.max(0, Number(req.query.offset) || 0)
    const eylem = req.query.eylem ? String(req.query.eylem) : null

    let q = supabase
      .from('yonetim_denetim')
      .select('id, admin_id, eylem, hedef_id, hedef_tur, detay, created_at', { count: 'exact' })
    if (eylem) q = q.eq('eylem', eylem)

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
        const bos: AdminDenetimYaniti = { kayitlar: [], total: 0, limit, offset, defterYok: true }
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
    }
    res.json(yanit)
  } catch (err) {
    next(err)
  }
})
