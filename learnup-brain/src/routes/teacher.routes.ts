import { Router, type Request } from 'express'
import { z } from 'zod'
import { supabase } from '../clients/supabase.js'
import { fetchAll } from '../lib/pg.js'
import { rontgenGovdesi } from '../lib/rontgen.js'
import { denetimYaz, type DenetimEylemi } from '../lib/denetim.js'
import { assertTeacherOwnsStudent, kimlikAl, kimligiUnut, sinifiUnut } from '../lib/yetki.js'
import { HttpHatasi, bulunamadi, gecersizIstek } from '../lib/hata.js'
import { validateQuery } from '../middleware/validate.js'
import { havuzdanSec, sorulariMaterialize, uyariMetni, type HavuzKaynak } from '../lib/odev-derle.js'
import type {
  HavuzListesiYaniti,
  HavuzSorusu,
  IsiHaritasiYaniti,
  OdevListesiYaniti,
  OgrenciDetayYaniti,
  OgrenciLoglarYaniti,
  HedefliOdevYanit,
  OdevOlusturYanit,
  OgrenciSatiri,
  OgretmenOzeti,
  OgretmenRontgenYaniti,
  SinifRosterYaniti,
  SinifZayifKazanim,
  SinifZayifYaniti,
} from '../types/panel.js'

/**
 * ÖĞRETMEN PANELİ.
 *
 * ⚠️ YETKİ SINIRI: servis SERVICE-ROLE anahtarı kullanır → RLS BAYPAS. Postgres kimseyi
 * korumuyor. Sınıf kapsamı `req.kapsamOgretmenId`'den gelir; öğrenci parametresi alan
 * her uç `assertTeacherOwnsStudent`'tan GEÇMEK ZORUNDA.
 *
 * ⚠️ VERİ SORGULARINDA `req.userId` KULLANILMAZ (0025). Kapsam artık "isteği yapan kişi"
 * değil, "hangi öğretmenin gözüyle bakılıyor": öğretmende kendisi, YÖNETİCİDE ?ogretmenId
 * ile seçilen öğretmen (middleware/requireRole.ts → requireOgretmenKapsami). Bir sorguda
 * `req.userId`e dönmek, yöneticiye SESSİZCE BOŞ SINIF göstermek demektir — hata çıkmaz,
 * panel "sınıf boş" der. Değişmez tek satırla denetlenir:
 *     grep -n "req\.userId" src/routes/teacher.routes.ts
 * → YALNIZ `vekilIzi` içindeki tek satır çıkmalı (yorumlar hariç). Orada kasten kullanılır:
 *   denetim kaydı eylemi YAPAN yöneticiyi yazar, adına yazılan öğretmeni değil. İkisini
 *   karıştırmak defteri "öğretmen kendi yaptı" diye okutur ve izin tüm anlamını yok eder.
 *
 * ⚠️ YANIT ÖNBELLEĞİ YOK. Buradaki her gövde TEK BİR SINIFIN kişisel verisidir; anahtarsız
 * bir modül önbelleği öğretmenler arası veri sızıntısıdır — 0014'ün kapatmak için yazıldığı
 * hatanın aynısı. Önbellek yalnız lib/yetki.ts'te ve kullanıcı id'siyle anahtarlı.
 *
 * LLM ÇAĞIRMAZ → standardLimiter yeterli.
 */
export const teacherRouter = Router()

/**
 * Sınıf kapsamı — bu dosyanın TEK kimlik kaynağı.
 *
 * `requireOgretmenKapsami` her isteği kapsamla işaretlemeden geçirmez; `!` bu yüzden
 * güvenli. Yine de gövde savunmalı: middleware zinciri yanlış kurulursa istek sessizce
 * kapsamsız çalışmasın, gürültüyle patlasın.
 */
function kapsam(req: Request): string {
  const id = req.kapsamOgretmenId
  if (!id) throw new HttpHatasi(500, 'kapsam_yok', 'Sınıf kapsamı belirlenemedi.')
  return id
}

/** Yönetici bu isteği bir öğretmenin ADINA mı yapıyor? (denetim izi bu bayrağa bakar) */
const vekilMi = (req: Request): boolean => req.adminVekili === true

/**
 * VEKİL İZİ — yönetici bir öğretmenin adına YAZDIĞINDA denetim defterine işler.
 *
 * ⚠️ Öğretmenin kendi yazması İZLENMEZ ve bu kasıtlı: öğretmenin kendi sınıfına ödev
 * atması olağan iş akışıdır, defteri doldurup yönetim eylemlerini görünmez kılardı.
 * İzlenmesi gereken, YETKİ SINIRININ AŞILDIĞI an: başkasının sınıfında yapılan yazma.
 *
 * Dönüş: vekil değilse `null` (yazılacak bir şey yok), vekilse `denetimYaz` sonucu.
 * Yanıtlar bunu `denetimYazildi` alanıyla taşır — izsiz kalmış bir yetki kullanımını
 * sessizce başarı göstermek, 0020'nin önlemek için var olduğu şeydir.
 */
async function vekilIzi(
  req: Request,
  eylem: Extract<DenetimEylemi, 'ogretmen_adina_odev' | 'ogretmen_adina_ogrenci'>,
  detay: Record<string, unknown>,
): Promise<boolean | null> {
  if (!vekilMi(req)) return null
  return denetimYaz({
    adminId: req.userId!,
    eylem,
    hedefId: kapsam(req),
    hedefTur: 'ogretmen',
    detay,
  })
}

const ISI_ZAYIF_ESIK = 0.4
const ZAYIF_WRONG_RATE = 0.6
const ZAYIF_MIN_ATTEMPTS = 3

type SinifOzetiSatiri = {
  student_id: string
  name: string | null
  grade: string | null
  student_class: string | null
  solved: number
  correct: number
  xp: number
  last_active: string | null
  avg_mastery: number | null
  tracked_nodes: number
  open_misconceptions: number
}

/**
 * Risk etiketi. `veri-yok` GERÇEK bir hâldir: takip edilen düğüm yoksa risk
 * HESAPLANAMAZ. Onu "düşük" saymak, hiç çalışmamış öğrenciyi iyi durumda göstermek olur —
 * paneli tam da işe yarayacağı yerde yalancı yapan hata budur.
 */
function riskBul(s: SinifOzetiSatiri): OgrenciSatiri['risk'] {
  if (s.tracked_nodes === 0) return 'veri-yok'
  const m = s.avg_mastery ?? 0
  if (m < 0.35 || s.open_misconceptions >= 3) return 'yuksek'
  if (m < 0.55 || s.open_misconceptions > 0) return 'orta'
  return 'dusuk'
}

function satiraCevir(s: SinifOzetiSatiri): OgrenciSatiri {
  return {
    studentId: s.student_id,
    name: s.name,
    grade: s.grade,
    studentClass: s.student_class,
    solved: s.solved,
    correct: s.correct,
    // solved === 0 → null. "%0 başarı" ile "hiç denememiş" farklı şeylerdir.
    basariOrani: s.solved > 0 ? Number((s.correct / s.solved).toFixed(4)) : null,
    xp: Number(s.xp),
    lastActive: s.last_active,
    avgMastery: s.avg_mastery === null ? null : Number(s.avg_mastery.toFixed(4)),
    trackedNodes: s.tracked_nodes,
    openMisconceptions: s.open_misconceptions,
    risk: riskBul(s),
  }
}

async function sinifOzetiCek(teacherId: string, days: number): Promise<SinifOzetiSatiri[]> {
  const { data, error } = await supabase.rpc('sinif_ozeti', {
    p_teacher_id: teacherId,
    p_days: days,
  })
  if (error) throw new HttpHatasi(500, 'sinif_okunamadi', 'Sınıf verisi okunamadı.')
  return (data ?? []) as SinifOzetiSatiri[]
}

const sayiParam = (v: unknown, varsayilan: number, tavan: number): number => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), tavan) : varsayilan
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /teacher/ozet — panonun KPI şeridi
// ─────────────────────────────────────────────────────────────────────────────
teacherRouter.get('/ozet', async (req, res, next) => {
  try {
    const teacherId = kapsam(req)
    const simdi = Date.now()
    const [kimlik, satirlar, profil] = await Promise.all([
      kimlikAl(teacherId),
      sinifOzetiCek(teacherId, 30),
      supabase.from('profiles').select('school').eq('id', teacherId).maybeSingle(),
    ])

    const yediGun = simdi - 7 * 86_400_000
    const otuzGun = simdi - 30 * 86_400_000
    const aktif = (s: SinifOzetiSatiri, esik: number): boolean =>
      s.last_active !== null && +new Date(s.last_active) >= esik

    // Haftalık toplam + 84 günlük sınıf trendi TEK sorgudan çıkar (sinif_ozeti 30 gün verir).
    const ids = satirlar.map((s) => s.student_id)
    let cozulen = 0
    let dogru = 0
    let xp = 0
    const gunler = new Map<string, { solved: number; correct: number; xp: number }>()
    if (ids.length) {
      const loglar = await fetchAll<{
        created_at: string
        is_correct: boolean | null
        is_skipped: boolean | null
        xp: number | null
      }>(() =>
        supabase
          .from('user_logs')
          .select('created_at, is_correct, is_skipped, xp')
          .in('student_id', ids)
          .gte('created_at', new Date(simdi - 84 * 86_400_000).toISOString()),
      )
      for (const l of loglar) {
        const sayilir = !l.is_skipped && l.is_correct !== null
        // Gün anahtarı Europe/Istanbul — sınıfın "bugün"ü UTC gece yarısında bölünmesin
        // (lib/rontgen.ts'teki gunAnahtari ile aynı kural).
        const anahtar = new Date(l.created_at).toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' })
        const g = gunler.get(anahtar) ?? { solved: 0, correct: 0, xp: 0 }
        if (sayilir) {
          g.solved += 1
          if (l.is_correct) g.correct += 1
        }
        g.xp += l.xp ?? 0
        gunler.set(anahtar, g)

        if (+new Date(l.created_at) >= yediGun) {
          if (sayilir) {
            cozulen += 1
            if (l.is_correct) dogru += 1
          }
          xp += l.xp ?? 0
        }
      }
    }

    const takipli = satirlar.filter((s) => s.avg_mastery !== null)
    const yanit: OgretmenOzeti = {
      ogretmen: {
        id: teacherId,
        name: kimlik.name,
        classCode: kimlik.classCode,
        school: (profil.data?.school as string | null) ?? null,
      },
      sinif: {
        ogrenciSayisi: satirlar.length,
        aktif7Gun: satirlar.filter((s) => aktif(s, yediGun)).length,
        aktif30Gun: satirlar.filter((s) => aktif(s, otuzGun)).length,
        hicBaslamayan: satirlar.filter((s) => s.tracked_nodes === 0).length,
      },
      hafta: {
        cozulen,
        dogru,
        basariOrani: cozulen > 0 ? Number((dogru / cozulen).toFixed(4)) : null,
        xp,
      },
      // Takip edilen düğümü olan öğrenci yoksa ortalama YOK — 0 değil.
      ortalamaUstalik: takipli.length
        ? Number((takipli.reduce((t, s) => t + (s.avg_mastery ?? 0), 0) / takipli.length).toFixed(4))
        : null,
      acikYanilgi: satirlar.reduce((t, s) => t + s.open_misconceptions, 0),
      trend: [...gunler.entries()]
        .map(([date, g]) => ({ date, ...g }))
        .sort((a, b) => (a.date < b.date ? -1 : 1)),
      olcumZamani: new Date(simdi).toISOString(),
    }
    res.json(yanit)
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /teacher/sinif — mevcut listesi
// ─────────────────────────────────────────────────────────────────────────────
teacherRouter.get('/sinif', async (req, res, next) => {
  try {
    const teacherId = kapsam(req)
    const days = sayiParam(req.query.days, 30, 365)
    const limit = sayiParam(req.query.limit, 200, 500)
    const offset = Math.max(0, Number(req.query.offset) || 0)
    const sort = String(req.query.sort ?? 'risk')

    const kimlik = await kimlikAl(teacherId)
    const tumu = (await sinifOzetiCek(teacherId, days)).map(satiraCevir)

    // RPC zaten "en zayıf başta" sıralı; diğer sıralar burada.
    const RISK_SIRA: Record<OgrenciSatiri['risk'], number> = {
      yuksek: 0,
      orta: 1,
      'veri-yok': 2,
      dusuk: 3,
    }
    const sirali = [...tumu]
    if (sort === 'isim') {
      sirali.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'tr'))
    } else if (sort === 'aktiflik') {
      sirali.sort((a, b) => (b.lastActive ?? '').localeCompare(a.lastActive ?? ''))
    } else if (sort === 'risk') {
      sirali.sort((a, b) => RISK_SIRA[a.risk] - RISK_SIRA[b.risk] || (a.avgMastery ?? 1) - (b.avgMastery ?? 1))
    }

    const yanit: SinifRosterYaniti = {
      classCode: kimlik.classCode,
      gunAraligi: days,
      students: sirali.slice(offset, offset + limit),
      total: sirali.length,
      limit,
      offset,
    }
    res.json(yanit)
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /teacher/sinif/isi-haritasi
// ─────────────────────────────────────────────────────────────────────────────
type IsiSatiri = {
  subject: string
  unit_path: string
  avg_mastery: number
  student_count: number
  weak_student_count: number
  node_count: number
  attempts: number
}

teacherRouter.get('/sinif/isi-haritasi', async (req, res, next) => {
  try {
    const teacherId = kapsam(req)
    const subject = req.query.subject ? String(req.query.subject) : null
    const minAttempts = sayiParam(req.query.minAttempts, 1, 100)

    const { data, error } = await supabase.rpc('sinif_isi_haritasi', {
      p_teacher_id: teacherId,
      p_subject: subject,
      p_min_attempts: minAttempts,
      p_zayif_esik: ISI_ZAYIF_ESIK,
    })
    if (error) throw new HttpHatasi(500, 'isi_haritasi_okunamadi', 'Isı haritası hesaplanamadı.')
    const satirlar = (data ?? []) as IsiSatiri[]

    // Ünite başlıkları: TEK sorgu, hücre başına DEĞİL.
    const yollar = [...new Set(satirlar.map((s) => s.unit_path))]
    const basliklar = new Map<string, string>()
    if (yollar.length) {
      const { data: nodes } = await supabase
        .from('curriculum_nodes')
        .select('path, title')
        .in('path', yollar)
      for (const n of nodes ?? []) basliklar.set(String(n.path), String(n.title))
    }

    const yanit: IsiHaritasiYaniti = {
      cells: satirlar.map((s) => ({
        subject: s.subject,
        unitPath: s.unit_path,
        // Eşleşmezse null — uydurma başlık YOK.
        unitTitle: basliklar.get(s.unit_path) ?? null,
        avgMastery: Number(s.avg_mastery.toFixed(4)),
        studentCount: s.student_count,
        weakStudentCount: s.weak_student_count,
        nodeCount: s.node_count,
        attempts: Number(s.attempts),
      })),
      subjects: [...new Set(satirlar.map((s) => s.subject))].sort((a, b) => a.localeCompare(b, 'tr')),
      ogrenciSayisi: satirlar.length ? Math.max(...satirlar.map((s) => s.student_count)) : 0,
      esik: { zayif: ISI_ZAYIF_ESIK },
      olcumZamani: new Date().toISOString(),
    }
    res.json(yanit)
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /teacher/sinif/isi-haritasi/ogrenciler — bir hücrenin (ders × ünite) zayıf
// öğrenci KIRILIMI. Isı haritası hücresi weak_student_count'u SAYIYA çöktürür; bu uç
// o sayıyı öğrenci satırlarına açar (drill-down; RPC 0023).
//
// ⚠️ TUTARLILIK DEĞİŞMEZİ: RPC, ısı haritası ucuyla AYNI roster (sinif_mevcudu), AYNI
// p_min_attempts (aynı sayiParam default/cap) ve AYNI ISI_ZAYIF_ESIK ile çağrılır →
// dönen `ogrenciler.length` o hücrenin `weakStudentCount` değerine EŞİTTİR.
// ─────────────────────────────────────────────────────────────────────────────
const IsiOgrenciKirilimiQuery = z.object({
  subject: z.string().min(1),
  unitPath: z.string().min(1),
})

type IsiOgrenciSatiri = {
  user_id: string
  ogrenci_ort: number
  attempts: number
  node_count: number
}

/** GET /api/v1/teacher/sinif/isi-haritasi/ogrenciler */
type IsiOgrenciKirilimiYaniti = {
  subject: string
  unitPath: string
  /** curriculum_nodes'tan çözülür; eşleşmezse null (uydurma başlık YOK). */
  unitTitle: string | null
  /** İstemci renk/eşik yorumunu buradan kurar — ısı haritasıyla TEK kaynak. */
  esik: { zayif: number }
  ogrenciler: Array<{
    studentId: string
    /** roster kaynağıyla (profiles.name) AYNI; yoksa null. */
    ad: string | null
    /** ogrenci_ort — çürüme uygulanmış ünite ortalaması, 4 ondalık. */
    mastery: number
    attempts: number
    nodeCount: number
  }>
  olcumZamani: string
}

teacherRouter.get(
  '/sinif/isi-haritasi/ogrenciler',
  validateQuery(IsiOgrenciKirilimiQuery),
  async (req, res, next) => {
    try {
      const teacherId = kapsam(req)
      const { subject, unitPath } = ((req as unknown) as {
        validatedQuery: z.infer<typeof IsiOgrenciKirilimiQuery>
      }).validatedQuery
      // Isı haritası ucuyla AYNI okuma (sayiParam default 1, tavan 100) — değişmez şart.
      const minAttempts = sayiParam(req.query.minAttempts, 1, 100)

      const { data, error } = await supabase.rpc('sinif_unite_zayif_ogrenciler', {
        p_teacher_id: teacherId,
        p_subject: subject,
        p_unit_path: unitPath,
        p_min_attempts: minAttempts,
        p_zayif_esik: ISI_ZAYIF_ESIK,
      })
      if (error) throw new HttpHatasi(500, 'isi_kirilim_okunamadi', 'Ünite öğrenci kırılımı hesaplanamadı.')
      const satirlar = (data ?? []) as IsiOgrenciSatiri[]

      // Ünite başlığı + öğrenci adları: öğrenci başına DEĞİL, iki toplu sorgu.
      const ids = satirlar.map((s) => s.user_id)
      const [baslikSonuc, adSonuc] = await Promise.all([
        supabase.from('curriculum_nodes').select('title').eq('path', unitPath).limit(1),
        ids.length
          ? supabase.from('profiles').select('id, name').in('id', ids)
          : Promise.resolve({ data: [] as Array<{ id: string; name: string | null }> }),
      ])
      const unitTitle = ((baslikSonuc.data ?? [])[0]?.title as string | null) ?? null
      const adlar = new Map<string, string | null>()
      for (const p of (adSonuc.data ?? []) as Array<{ id: string; name: string | null }>) {
        adlar.set(String(p.id), (p.name as string | null) ?? null)
      }

      const yanit: IsiOgrenciKirilimiYaniti = {
        subject,
        unitPath,
        unitTitle,
        esik: { zayif: ISI_ZAYIF_ESIK },
        // RPC "en zayıf başta" döndürür — sıra KORUNUR (yeniden sıralama yok).
        ogrenciler: satirlar.map((s) => ({
          studentId: s.user_id,
          ad: adlar.get(s.user_id) ?? null,
          mastery: Number(s.ogrenci_ort.toFixed(4)),
          attempts: Number(s.attempts),
          nodeCount: s.node_count,
        })),
        olcumZamani: new Date().toISOString(),
      }
      res.json(yanit)
    } catch (err) {
      next(err)
    }
  },
)

// ─────────────────────────────────────────────────────────────────────────────
// GET /teacher/sinif/zayif-kazanimlar — triyaj kuyruğu
// ─────────────────────────────────────────────────────────────────────────────
type ZayifSatiri = {
  kazanim_id: number
  code: string | null
  title: string
  subject: string
  path: string
  avg_wrong_rate: number
  student_count: number
  weak_student_count: number
  attempts: number
}

teacherRouter.get('/sinif/zayif-kazanimlar', async (req, res, next) => {
  try {
    const teacherId = kapsam(req)
    const limit = sayiParam(req.query.limit, 20, 100)
    const subject = req.query.subject ? String(req.query.subject) : null

    const { data, error } = await supabase.rpc('sinif_zayif_kazanimlar', {
      p_teacher_id: teacherId,
      p_limit: limit,
      p_subject: subject,
      p_min_attempts: ZAYIF_MIN_ATTEMPTS,
      p_zayif_esik: ZAYIF_WRONG_RATE,
    })
    if (error) throw new HttpHatasi(500, 'zayif_okunamadi', 'Zayıf kazanımlar hesaplanamadı.')
    const satirlar = (data ?? []) as ZayifSatiri[]

    // Havuz stoğu: kazanım başına DEĞİL, iki toplu sorgu + Map.
    const ids = satirlar.map((s) => s.kazanim_id)
    const osymSayim = new Map<number, number>()
    const aiSayim = new Map<number, number>()
    if (ids.length) {
      const [osym, ai] = await Promise.all([
        fetchAll<{ kazanim_id: number }>(() =>
          supabase.from('yks_questions').select('kazanim_id').in('kazanim_id', ids).eq('verified', true),
        ),
        fetchAll<{ kazanim_id: number }>(() =>
          supabase.from('yks_ai_questions').select('kazanim_id').in('kazanim_id', ids)
            .eq('verified', true).eq('karantina', false), // 0025
        ),
      ])
      for (const r of osym) osymSayim.set(r.kazanim_id, (osymSayim.get(r.kazanim_id) ?? 0) + 1)
      for (const r of ai) aiSayim.set(r.kazanim_id, (aiSayim.get(r.kazanim_id) ?? 0) + 1)
    }

    const kazanimlar: SinifZayifKazanim[] = satirlar.map((s) => ({
      kazanimId: s.kazanim_id,
      code: s.code,
      title: s.title,
      subject: s.subject,
      path: s.path,
      avgWrongRate: Number(s.avg_wrong_rate.toFixed(4)),
      studentCount: s.student_count,
      weakStudentCount: s.weak_student_count,
      attempts: Number(s.attempts),
      havuzdaSoru: {
        osym: osymSayim.get(s.kazanim_id) ?? 0,
        ai: aiSayim.get(s.kazanim_id) ?? 0,
      },
    }))

    const yanit: SinifZayifYaniti = {
      kazanimlar,
      esik: { zayifWrongRate: ZAYIF_WRONG_RATE, minAttempts: ZAYIF_MIN_ATTEMPTS },
      olcumZamani: new Date().toISOString(),
    }
    res.json(yanit)
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /teacher/ogrenci/:studentId — özet + zayıf kazanımlar + son ödevler
// ─────────────────────────────────────────────────────────────────────────────
teacherRouter.get('/ogrenci/:studentId', async (req, res, next) => {
  try {
    const teacherId = kapsam(req)
    const studentId = String(req.params.studentId)
    const days = sayiParam(req.query.days, 30, 365)

    const ogrenci = await assertTeacherOwnsStudent(teacherId, studentId)

    const [satirlar, zayif, sinifOdev, hedefliOdev] = await Promise.all([
      sinifOzetiCek(teacherId, days),
      supabase.rpc('weak_kazanimlar', { p_user_id: studentId, p_limit: 8 }),
      supabase
        .from('assignment_submissions')
        .select('id, assignment_id, score, max_score, created_at, assignments(subject, topic)')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('targeted_assignments')
        .select('id, subject, topic, score, max_score, completed_at, created_at')
        .eq('student_id', studentId)
        .eq('teacher_id', teacherId)
        .order('created_at', { ascending: false })
        .limit(5),
    ])

    const kendi = satirlar.find((s) => s.student_id === studentId)
    if (!kendi) throw new HttpHatasi(500, 'ozet_yok', 'Öğrenci özeti hesaplanamadı.')
    const { studentId: _a, name: _b, grade: _c, studentClass: _d, ...ozet } = satiraCevir(kendi)

    const sonOdevler: OgrenciDetayYaniti['sonOdevler'] = [
      ...((sinifOdev.data ?? []) as Array<Record<string, unknown>>).map((r) => {
        const a = r.assignments as { subject?: string; topic?: string } | null
        return {
          id: String(r.id),
          tur: 'sinif' as const,
          title: [a?.subject, a?.topic].filter(Boolean).join(' · ') || 'Sınıf ödevi',
          score: r.score === null || r.score === undefined ? null : Number(r.score),
          maxScore: r.max_score === null || r.max_score === undefined ? null : Number(r.max_score),
          submittedAt: (r.created_at as string) ?? null,
        }
      }),
      ...((hedefliOdev.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
        id: String(r.id),
        tur: 'hedefli' as const,
        title: [r.subject, r.topic].filter(Boolean).join(' · ') || 'Hedefli set',
        score: r.score === null || r.score === undefined ? null : Number(r.score),
        maxScore: r.max_score === null || r.max_score === undefined ? null : Number(r.max_score),
        submittedAt: (r.completed_at as string) ?? null,
      })),
    ]
      .sort((a, b) => (b.submittedAt ?? '').localeCompare(a.submittedAt ?? ''))
      .slice(0, 8)

    const yanit: OgrenciDetayYaniti = {
      student: {
        id: ogrenci.id,
        name: ogrenci.name,
        grade: ogrenci.grade,
        studentClass: ogrenci.studentClass,
      },
      ozet,
      zayifKazanimlar: ((zayif.data ?? []) as Array<Record<string, unknown>>).map((w) => ({
        kazanimId: Number(w.kazanim_id),
        code: (w.code as string | null) ?? null,
        title: String(w.title),
        subject: String(w.subject),
        path: String(w.path),
        wrongRate: Number(Number(w.wrong_rate).toFixed(4)),
      })),
      sonOdevler,
      olcumZamani: new Date().toISOString(),
    }
    res.json(yanit)
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /teacher/ogrenci/:studentId/rontgen
//
// Öğrencinin KENDİ gördüğü gövdenin aynısı — frontend'de rontgen.tsx panelleri
// sıfır adaptörle çalışsın diye. Fark: teshisGoster açık (öğretmen koçtur).
// ─────────────────────────────────────────────────────────────────────────────
teacherRouter.get('/ogrenci/:studentId/rontgen', async (req, res, next) => {
  try {
    const ogrenci = await assertTeacherOwnsStudent(kapsam(req), String(req.params.studentId))
    const govde = await rontgenGovdesi(ogrenci.id, { teshisGoster: true })
    const yanit: OgretmenRontgenYaniti = {
      ...govde,
      student: { id: ogrenci.id, name: ogrenci.name, grade: ogrenci.grade },
    }
    res.json(yanit)
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /teacher/ogrenci/:studentId/loglar — ham cevap akışı
// ─────────────────────────────────────────────────────────────────────────────
teacherRouter.get('/ogrenci/:studentId/loglar', async (req, res, next) => {
  try {
    const ogrenci = await assertTeacherOwnsStudent(kapsam(req), String(req.params.studentId))
    const days = sayiParam(req.query.days, 30, 365)
    const limit = sayiParam(req.query.limit, 200, 500)
    const offset = Math.max(0, Number(req.query.offset) || 0)
    const esik = new Date(Date.now() - days * 86_400_000).toISOString()

    const { data, error, count } = await supabase
      .from('user_logs')
      .select(
        'created_at, subject, sub_topic, kazanim_id, is_correct, is_skipped, selected_option, duration_ms, difficulty, xp',
        { count: 'exact' },
      )
      .eq('student_id', ogrenci.id)
      .gte('created_at', esik)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) throw new HttpHatasi(500, 'loglar_okunamadi', 'Cevap kayıtları okunamadı.')

    const yanit: OgrenciLoglarYaniti = {
      logs: ((data ?? []) as Array<Record<string, unknown>>).map((l) => ({
        createdAt: String(l.created_at),
        subject: (l.subject as string | null) ?? null,
        subTopic: (l.sub_topic as string | null) ?? null,
        kazanimId: l.kazanim_id === null || l.kazanim_id === undefined ? null : Number(l.kazanim_id),
        isCorrect: (l.is_correct as boolean | null) ?? null,
        isSkipped: l.is_skipped === true,
        selectedOption: (l.selected_option as string | null) ?? null,
        durationMs: l.duration_ms === null || l.duration_ms === undefined ? null : Number(l.duration_ms),
        difficulty: (l.difficulty as string | null) ?? null,
        xp: Number(l.xp ?? 0),
      })),
      total: count ?? 0,
      limit,
      offset,
      gunAraligi: days,
    }
    res.json(yanit)
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /teacher/odevler
// ─────────────────────────────────────────────────────────────────────────────
teacherRouter.get('/odevler', async (req, res, next) => {
  try {
    const teacherId = kapsam(req)
    const limit = sayiParam(req.query.limit, 50, 200)
    const offset = Math.max(0, Number(req.query.offset) || 0)

    const [odevSonuc, hedefliSonuc, mevcut] = await Promise.all([
      supabase
        .from('assignments')
        .select('id, subject, topic, question_ids, due_date, status, created_at', { count: 'exact' })
        .eq('teacher_id', teacherId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1),
      supabase
        .from('targeted_assignments')
        .select('id, student_id, subject, topic, status, score, max_score, created_at')
        .eq('teacher_id', teacherId)
        .order('created_at', { ascending: false })
        .limit(30),
      sinifOzetiCek(teacherId, 30),
    ])

    if (odevSonuc.error) throw new HttpHatasi(500, 'odev_okunamadi', 'Ödevler okunamadı.')
    const odevler = (odevSonuc.data ?? []) as Array<Record<string, unknown>>

    // Gönderim istatistikleri: ödev başına DEĞİL, tek .in() + bellekte grupla.
    const odevIds = odevler.map((o) => String(o.id))
    const gonderimMap = new Map<string, { toplam: number; yuzdeToplam: number; puanli: number }>()
    if (odevIds.length) {
      const gonderimler = await fetchAll<{
        assignment_id: string
        score: number | null
        max_score: number | null
      }>(() =>
        supabase
          .from('assignment_submissions')
          .select('assignment_id, score, max_score')
          .in('assignment_id', odevIds),
      )
      for (const g of gonderimler) {
        const k = String(g.assignment_id)
        const cur = gonderimMap.get(k) ?? { toplam: 0, yuzdeToplam: 0, puanli: 0 }
        cur.toplam += 1
        if (g.score !== null && g.max_score) {
          cur.yuzdeToplam += g.score / g.max_score
          cur.puanli += 1
        }
        gonderimMap.set(k, cur)
      }
    }

    const ogrenciSayisi = mevcut.length
    const isimler = new Map(mevcut.map((m) => [m.student_id, m.name]))

    const yanit: OdevListesiYaniti = {
      assignments: odevler.map((o) => {
        const g = gonderimMap.get(String(o.id)) ?? { toplam: 0, yuzdeToplam: 0, puanli: 0 }
        return {
          id: String(o.id),
          subject: (o.subject as string | null) ?? null,
          topic: (o.topic as string | null) ?? null,
          soruSayisi: Array.isArray(o.question_ids) ? o.question_ids.length : 0,
          dueDate: (o.due_date as string | null) ?? null,
          status: String(o.status ?? 'active'),
          createdAt: String(o.created_at),
          gonderim: {
            toplam: g.toplam,
            // Puanlanmış gönderim yoksa ortalama YOK — 0 değil.
            ortalamaYuzde: g.puanli > 0 ? Number((g.yuzdeToplam / g.puanli).toFixed(4)) : null,
            bekleyen: Math.max(0, ogrenciSayisi - g.toplam),
          },
        }
      }),
      hedefli: ((hedefliSonuc.data ?? []) as Array<Record<string, unknown>>).map((h) => ({
        id: String(h.id),
        studentId: String(h.student_id),
        studentName: isimler.get(String(h.student_id)) ?? null,
        title: [h.subject, h.topic].filter(Boolean).join(' · ') || 'Hedefli set',
        status: String(h.status ?? 'pending'),
        score: h.score === null || h.score === undefined ? null : Number(h.score),
        maxScore: h.max_score === null || h.max_score === undefined ? null : Number(h.max_score),
        createdAt: String(h.created_at),
      })),
      ogrenciSayisi,
      total: odevSonuc.count ?? odevler.length,
    }
    res.json(yanit)
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /teacher/odev — sınıf ödevi (havuzdan derlenir)
//
// ⚠️ LLM ÇAĞIRMAZ. Havuz yetmezse `bulunan < istenen` döner ve uyarı verir —
// soru UYDURMAZ. generateVerifiedSet'e bağlamak, öğretmenin tıklamasının arkasına
// 97-199sn'lik senkron LLM zinciri koymak olurdu; doğru şekli worker'ın aldığı bir
// agent_tasks satırıdır (ayrı özellik).
// ─────────────────────────────────────────────────────────────────────────────
teacherRouter.post('/odev', async (req, res, next) => {
  try {
    const teacherId = kapsam(req)
    const b = (req.body ?? {}) as Record<string, unknown>
    const istenen = Number(b.soruSayisi)
    if (!Number.isFinite(istenen) || istenen < 1 || istenen > 40) {
      throw gecersizIstek('gecersiz_adet', 'Soru sayısı 1 ile 40 arasında olmalı.')
    }
    const kaynak = (['osym', 'ai', 'karisik'] as const).includes(b.kaynak as never)
      ? (b.kaynak as HavuzKaynak)
      : 'karisik'
    const kazanimId = b.kazanimId != null ? Number(b.kazanimId) : null
    const subject = b.subject ? String(b.subject) : null

    if (!subject && !kazanimId) {
      throw gecersizIstek('kapsam_yok', 'En az bir ders ya da kazanım seçilmeli.')
    }

    // Elle seçim varsa filtre yok sayılır — öğretmen ne seçtiyse o gider.
    const secilenIds = Array.isArray(b.questionIds)
      ? (b.questionIds as unknown[]).map(String).slice(0, 40)
      : null

    const secilen = await havuzdanSec({
      kaynak,
      subject,
      topic: b.topic ? String(b.topic) : null,
      kazanimIds: kazanimId ? [kazanimId] : null,
      difficulty: b.difficulty ? String(b.difficulty) : null,
      adet: secilenIds?.length ? secilenIds.length : istenen,
      secilenIds,
    })

    const kimlik = await kimlikAl(teacherId)
    const { data: prof } = await supabase.from('profiles').select('grade').eq('id', teacherId).maybeSingle()
    const derleme = await sorulariMaterialize(secilen, teacherId, (prof?.grade as string | null) ?? null)

    if (!derleme.questionIds.length) {
      // Boş ödev YARATILMAZ: öğrenciye sıfır soruluk ödev göndermek, çalışmayan
      // bir özelliği "başarılı" göstermektir.
      throw new HttpHatasi(
        409,
        'havuz_bos',
        uyariMetni(istenen, 0, derleme.atlanan) ?? 'Bu kriterlere uyan soru bulunamadı.',
      )
    }

    const baslik = [subject, b.topic ? String(b.topic) : null].filter(Boolean).join(' · ') || 'Ödev'
    const { data: odev, error } = await supabase
      .from('assignments')
      .insert({
        teacher_id: teacherId,
        subject,
        topic: b.topic ? String(b.topic) : null,
        title: baslik,
        question_count: derleme.questionIds.length,
        question_ids: derleme.questionIds,
        due_date: b.dueDate ? String(b.dueDate) : null,
        status: 'active',
        max_score: derleme.questionIds.length,
      })
      .select('id')
      .single()
    if (error) throw new HttpHatasi(500, 'odev_olusturulamadi', 'Ödev oluşturulamadı.')

    const denetimYazildi = await vekilIzi(req, 'ogretmen_adina_odev', {
      tur: 'sinif_odevi',
      odevId: String(odev.id),
      baslik,
      soruAdedi: derleme.questionIds.length,
      subject,
      kaynak,
    })

    const yanit: OdevOlusturYanit = {
      id: String(odev.id),
      questionIds: derleme.questionIds,
      istenen,
      bulunan: derleme.questionIds.length,
      kaynakDagilimi: derleme.kaynakDagilimi,
      uyari: uyariMetni(istenen, derleme.questionIds.length, derleme.atlanan),
      denetimYazildi,
    }
    void kimlik
    res.status(201).json(yanit)
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /teacher/hedefli-odev — tek öğrenciye, zayıf kazanımlarından derlenmiş set
// ─────────────────────────────────────────────────────────────────────────────
teacherRouter.post('/hedefli-odev', async (req, res, next) => {
  try {
    const teacherId = kapsam(req)
    const b = (req.body ?? {}) as Record<string, unknown>
    const studentId = String(b.studentId ?? '')
    const ogrenci = await assertTeacherOwnsStudent(teacherId, studentId)

    const istenen = Math.min(40, Math.max(1, Number(b.soruSayisi) || 10))
    const kaynak = (['osym', 'ai', 'karisik'] as const).includes(b.kaynak as never)
      ? (b.kaynak as HavuzKaynak)
      : 'karisik'

    // Kazanım verilmediyse motorun işaretlediklerini kullan — panelin bütün fikri bu.
    let kazanimlar: Array<{ kazanimId: number; title: string; wrongRate: number }> = []
    const verilen = Array.isArray(b.kazanimIds) ? (b.kazanimIds as unknown[]).map(Number).filter(Number.isFinite) : []
    if (verilen.length) {
      const { data } = await supabase.from('curriculum_nodes').select('id, title').in('id', verilen)
      kazanimlar = (data ?? []).map((n) => ({
        kazanimId: Number(n.id),
        title: String(n.title),
        wrongRate: 0,
      }))
    } else {
      const { data, error } = await supabase.rpc('weak_kazanimlar', { p_user_id: studentId, p_limit: 5 })
      if (error) throw new HttpHatasi(500, 'zayif_okunamadi', 'Zayıf kazanımlar okunamadı.')
      kazanimlar = ((data ?? []) as Array<Record<string, unknown>>).map((w) => ({
        kazanimId: Number(w.kazanim_id),
        title: String(w.title),
        wrongRate: Number(Number(w.wrong_rate).toFixed(4)),
      }))
    }

    if (!kazanimlar.length) {
      throw new HttpHatasi(
        409,
        'zayif_kazanim_yok',
        'Bu öğrenci için henüz zayıf kazanım tespit edilmedi (en az 3 denemeli kazanım gerekir).',
      )
    }

    const secilen = await havuzdanSec({
      kaynak,
      kazanimIds: kazanimlar.map((k) => k.kazanimId),
      adet: istenen,
      // Daha önce bu öğrenciye gitmiş sorular elenir: "yeni set" gerçekten yeni olsun.
      studentId,
    })
    const derleme = await sorulariMaterialize(secilen, teacherId, ogrenci.grade)

    if (!derleme.questionIds.length) {
      throw new HttpHatasi(
        409,
        'havuz_bos',
        uyariMetni(istenen, 0, derleme.atlanan) ??
          'Bu kazanımlar için havuzda doğrulanmış soru yok.',
      )
    }

    // Hangi kazanımdan kaç soru düştü — öğretmen sete neyin girdiğini görmeli.
    const adetler = new Map<number, number>()
    for (const s of secilen) {
      if (s.kazanim_id == null) continue
      adetler.set(s.kazanim_id, (adetler.get(s.kazanim_id) ?? 0) + 1)
    }

    // Katkı VEREN kazanım sayısını ayrı say: "5 zayıf kazanımdan derlendi" demek,
    // 2'si havuzda boş olduğu hâlde katkı vermiş gibi göstermek olurdu.
    const katkiVeren = kazanimlar.filter((k) => (adetler.get(k.kazanimId) ?? 0) > 0).length
    const bosKalan = kazanimlar.length - katkiVeren
    const rationale =
      `${ogrenci.name ?? 'Öğrenci'} için ${katkiVeren} kazanımdan ${derleme.questionIds.length} soru ` +
      `derlendi (ÖSYM ${derleme.kaynakDagilimi.osym}, AI ${derleme.kaynakDagilimi.ai}).` +
      (bosKalan > 0
        ? ` ${bosKalan} zayıf kazanım havuzda soru olmadığı için sete giremedi.`
        : '')

    const { data: ta, error } = await supabase
      .from('targeted_assignments')
      .insert({
        teacher_id: teacherId,
        student_id: studentId,
        subject: secilen[0]?.subject ?? null,
        grade: ogrenci.grade,
        question_ids: derleme.questionIds,
        status: 'pending',
        rationale,
        source: 'teacher_panel',
        max_score: derleme.questionIds.length,
      })
      .select('id')
      .single()
    if (error) throw new HttpHatasi(500, 'set_olusturulamadi', 'Hedefli set oluşturulamadı.')

    const denetimYazildi = await vekilIzi(req, 'ogretmen_adina_odev', {
      tur: 'hedefli_set',
      setId: String(ta.id),
      studentId,
      ogrenciAdi: ogrenci.name ?? null,
      soruAdedi: derleme.questionIds.length,
      kazanimSayisi: katkiVeren,
    })

    const yanit: HedefliOdevYanit = {
      id: String(ta.id),
      studentId,
      questionIds: derleme.questionIds,
      kazanimlar: kazanimlar.map((k) => ({ ...k, soruAdedi: adetler.get(k.kazanimId) ?? 0 })),
      bulunan: derleme.questionIds.length,
      rationale,
      uyari: uyariMetni(istenen, derleme.questionIds.length, derleme.atlanan),
      denetimYazildi,
    }
    res.status(201).json(yanit)
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /teacher/ogrenci — e-posta ile sınıfa ekle
//
// Kod paylaşımının yanında ikinci yol: öğretmen doğrudan ekler. Kayıt akışının
// tamamı bu iki uçtan ibaret — bunlar olmadan sınıf modeli yazılmıyordu.
// ─────────────────────────────────────────────────────────────────────────────
teacherRouter.post('/ogrenci', async (req, res, next) => {
  try {
    const teacherId = kapsam(req)
    const email = String((req.body as { email?: unknown })?.email ?? '').trim().toLowerCase()
    if (!email || !email.includes('@')) {
      throw gecersizIstek('gecersiz_eposta', 'Geçerli bir e-posta adresi gerekli.')
    }

    const { data: aday, error } = await supabase
      .from('profiles')
      .select('id, name, email, role, teacher_id')
      .ilike('email', email)
      .maybeSingle()
    if (error) throw new HttpHatasi(500, 'ogrenci_aranamadi', 'Öğrenci aranamadı.')
    if (!aday || aday.role !== 'student') {
      // Kayıt yok ile "öğrenci değil" AYNI mesaj: öğretmen, hangi e-postaların
      // sistemde kayıtlı olduğunu yoklayamasın.
      throw bulunamadi('ogrenci_bulunamadi', 'Bu e-postaya ait bir öğrenci hesabı bulunamadı.')
    }
    if (aday.teacher_id === teacherId) {
      res.json({ eklendi: false, neden: 'zaten_sinifinda', student: { id: aday.id, name: aday.name ?? null } })
      return
    }

    // ⚠️ SESSİZ DEVRALMA YOK. Önceden burası `teacher_id`'yi koşulsuz üzerine
    // yazıyordu: öğretmen A, e-postasını bilerek öğretmen B'nin öğrencisini
    // alabiliyordu. Ne B haberdar oluyordu ne de öğrenciye soruluyordu — B'nin
    // sınıf ortalaması ve ısı haritası sebepsiz değişiyordu.
    //
    // Devir MEŞRU olabilir (dönem değişimi), ama kararı verecek olan devralan
    // öğretmen DEĞİLDİR. İki dürüst yol var, ikisi de yanıtta yazıyor:
    //   1) öğrenci kendi kararıyla → POST /api/v1/sinif/katil (kod paylaşılır)
    //   2) yönetici kararıyla      → POST /api/v1/admin/kullanici/:id/sinif
    if (aday.teacher_id) {
      throw new HttpHatasi(
        409,
        'baska_sinifta',
        'Bu öğrenci başka bir sınıfa kayıtlı. Sınıf kodunu paylaşıp öğrencinin kendisinin ' +
          'katılmasını isteyebilir ya da yöneticinden taşımasını talep edebilirsin.',
      )
    }

    const { data: yazilan, error: yazHata } = await supabase
      .from('profiles')
      .update({ teacher_id: teacherId })
      .eq('id', aday.id)
      .eq('role', 'student')
      .is('teacher_id', null) // yarış koruması: kontrolden sonra başka sınıfa girdiyse yazma
      .select('id')
    if (yazHata) throw new HttpHatasi(500, 'ekleme_yazilamadi', 'Öğrenci eklenemedi.')
    // 0 satır = koşul tutmadı. Hatasız ama YAZMAMIŞ bir update'i "eklendi" diye
    // raporlamak, kayıt akışının en sinsi yalanı olurdu.
    if (!yazilan?.length) {
      throw new HttpHatasi(409, 'baska_sinifta', 'Bu öğrenci az önce başka bir sınıfa kaydoldu.')
    }

    await kimligiUnut(aday.id)
    sinifiUnut(teacherId)

    const denetimYazildi = await vekilIzi(req, 'ogretmen_adina_ogrenci', {
      islem: 'ekle',
      studentId: String(aday.id),
      ogrenciAdi: aday.name ?? null,
      email: aday.email ?? null,
    })

    res.json({
      eklendi: true,
      student: { id: aday.id, name: aday.name ?? null, email: aday.email ?? null },
      denetimYazildi,
    })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /teacher/ogrenci/:studentId — sınıftan çıkar
//
// Öğrencinin VERİSİNE dokunmaz: yalnız bağı koparır. Ustalık, loglar, ödev
// geçmişi öğrencinin kendisinde kalır (silme yetkisi öğretmende değildir).
// ─────────────────────────────────────────────────────────────────────────────
teacherRouter.delete('/ogrenci/:studentId', async (req, res, next) => {
  try {
    const teacherId = kapsam(req)
    const ogrenci = await assertTeacherOwnsStudent(teacherId, String(req.params.studentId))

    const { error } = await supabase
      .from('profiles')
      .update({ teacher_id: null })
      .eq('id', ogrenci.id)
      .eq('role', 'student')
    if (error) throw new HttpHatasi(500, 'cikarma_yazilamadi', 'Öğrenci sınıftan çıkarılamadı.')

    await kimligiUnut(ogrenci.id)
    sinifiUnut(teacherId)

    const denetimYazildi = await vekilIzi(req, 'ogretmen_adina_ogrenci', {
      islem: 'cikar',
      studentId: ogrenci.id,
      ogrenciAdi: ogrenci.name ?? null,
    })

    res.json({ cikarildi: true, student: { id: ogrenci.id, name: ogrenci.name }, denetimYazildi })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /teacher/soru-havuzu — ödev kurarken havuzu gezmek için
// ─────────────────────────────────────────────────────────────────────────────
teacherRouter.get('/soru-havuzu', async (req, res, next) => {
  try {
    const kaynak = String(req.query.kaynak ?? 'karisik')
    // TELİF KARARI (2026-07-22): çıkmış ÖSYM havuzu öğretmen yüzeyinden kaldırıldı. Açık
    // 'osym' isteği açık hatayla döner (sessiz daralma "filtre bozuk" sanılır); 'karisik'
    // ve diğer her mod yalnız AI havuzunu listeler. Sayfalama tek tabloya indi.
    if (kaynak === 'osym') {
      throw gecersizIstek(
        'cikmis_kaynak_kapali',
        'Çıkmış ÖSYM soruları telif kararı gereği havuz listesinde sunulmuyor. Kaynak olarak AI havuzunu seçin.',
      )
    }
    const subject = req.query.subject ? String(req.query.subject) : null
    const kazanimId = req.query.kazanimId ? Number(req.query.kazanimId) : null
    const difficulty = req.query.difficulty ? String(req.query.difficulty) : null
    const ara = req.query.q ? String(req.query.q).trim() : null
    const limit = sayiParam(req.query.limit, 20, 100)
    const offset = Math.max(0, Number(req.query.offset) || 0)

    const total = await havuzSayimi({ subject, kazanimId, difficulty, ara })

    const sorular: HavuzSorusu[] = []
    if (offset < total) {
      let q = supabase
        .from('yks_ai_questions')
        .select('id, subject, topic, kazanim_id, question_text, difficulty, quality')
        .eq('verified', true)
        .eq('karantina', false) // 0025: öğretmen karantinadaki soruyu göremez/seçemez
      if (subject) q = q.eq('subject', subject)
      if (kazanimId) q = q.eq('kazanim_id', kazanimId)
      if (difficulty) q = q.eq('difficulty', difficulty)
      if (ara) q = q.ilike('question_text', `%${ara}%`)
      const { data } = await q
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })   // deterministik: tie-break olmadan sayfalar kayar
        .range(offset, offset + limit - 1)
      for (const r of (data ?? []) as Array<Record<string, unknown>>) {
        sorular.push(havuzSatiri(r, 'ai'))
      }
    }

    const yanit: HavuzListesiYaniti = { sorular, total, limit, offset }
    res.json(yanit)
  } catch (err) {
    next(err)
  }
})

function havuzSatiri(r: Record<string, unknown>, kaynak: 'osym' | 'ai'): HavuzSorusu {
  return {
    id: String(r.id),
    kaynak,
    subject: String(r.subject),
    topic: (r.topic as string | null) ?? null,
    kazanimId: r.kazanim_id === null || r.kazanim_id === undefined ? null : Number(r.kazanim_id),
    questionText: String(r.question_text),
    difficulty: (r.difficulty as string | null) ?? null,
    quality: r.quality === null || r.quality === undefined ? null : Number(r.quality),
    examLabel: (r.exam_label as string | null) ?? null,
    examYear: r.exam_year === null || r.exam_year === undefined ? null : Number(r.exam_year),
  }
}

/** AI havuzu sayımı — çıkmış tablo (yks_questions) telif kararıyla havuz yüzeyinden çıktı. */
async function havuzSayimi(
  f: { subject: string | null; kazanimId: number | null; difficulty?: string | null; ara: string | null },
): Promise<number> {
  // ⚠️ SAYIM FİLTRESİ LİSTE FİLTRESİYLE AYNI OLMAK ZORUNDA (karantina dahil):
  // ayrışırlarsa sayfalama yalan söyler — "42 soru" der, 39 gösterir.
  let q = supabase.from('yks_ai_questions').select('id', { count: 'exact', head: true })
    .eq('verified', true).eq('karantina', false)
  if (f.subject) q = q.eq('subject', f.subject)
  if (f.kazanimId) q = q.eq('kazanim_id', f.kazanimId)
  if (f.difficulty) q = q.eq('difficulty', f.difficulty)
  if (f.ara) q = q.ilike('question_text', `%${f.ara}%`)
  const { count } = await q
  return count ?? 0
}
