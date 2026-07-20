import { supabase } from '../clients/supabase.js'
import { redisTry } from '../clients/redis.js'
import { logger } from '../utils/logger.js'
import { fetchAll } from './pg.js'
import { HttpHatasi, bulunamadi, yetkisiz } from './hata.js'

/**
 * YETKİ KATMANI — rol kimliği + sahiplik denetimi.
 *
 * ⚠️ NEDEN ROL JWT'DEN OKUNMUYOR:
 *  1) handle_new_user() rolü raw_user_meta_data'dan alıyordu; o alan İSTEMCİ YAZILABİLİR
 *     (0016 bunu sertleştirdi, ama JWT'ye rol koymak aynı güven zincirini geri getirirdi).
 *  2) profiles.is_approved iptal edildiğinde etki SANİYELER içinde geçmeli. JWT'ye yazılsa
 *     token yenilenene kadar (~1sa) onayı iptal edilmiş öğretmen bütün sınıfı görmeye
 *     devam ederdi — gerçek bir veri sızıntısı penceresi.
 *
 * Bedeli: istek başına bir `profiles` okuması. 60sn'lik iki kademeli önbellekle
 * kullanıcı başına ~dakikada bir sorguya iner.
 *
 * ⚠️ Servis service_role anahtarı kullanıyor → RLS TAMAMEN BYPASS. Bu dosyadaki
 * denetimler tek savunma hattıdır; route'lar kendi kapsamlarını kendileri kurmak zorunda.
 */

export type Rol = 'student' | 'teacher' | 'admin'

export type Kimlik = {
  userId: string
  role: Rol
  isApproved: boolean
  classCode: string | null
  teacherId: string | null
  name: string | null
}

export type OgrenciKimlik = {
  id: string
  name: string | null
  grade: string | null
  studentClass: string | null
}

const KIMLIK_TTL_MS = 60_000
/** Sınırsız büyüyen Map, uzun ömürlü Bun sürecinde SIZINTIDIR. FIFO tahliye. */
const KIMLIK_TAVAN = 5_000

type Girdi = { veri: Kimlik; sonKullanma: number }
const kimlikCache = new Map<string, Girdi>()

function cacheYaz(userId: string, veri: Kimlik): void {
  if (kimlikCache.size >= KIMLIK_TAVAN) {
    // Map ekleme sırasını korur → ilk anahtar en eskisidir.
    const enEski = kimlikCache.keys().next().value
    if (enEski !== undefined) kimlikCache.delete(enEski)
  }
  kimlikCache.set(userId, { veri, sonKullanma: Date.now() + KIMLIK_TTL_MS })
}

function rolNormalize(ham: unknown): Rol {
  return ham === 'admin' || ham === 'teacher' ? ham : 'student'
}

/**
 * Kullanıcının rol kimliğini getirir (L1 süreç-içi → L2 Redis → DB).
 *
 * Redis yoksa/düşükse DB'ye düşer — ASLA "izin ver"e düşmez. `redisTry` sözleşmesi
 * (clients/redis.ts:63): Redis'in yokluğu ÖZELLİK KAYBI'dır, HATA değil.
 */
export async function kimlikAl(userId: string): Promise<Kimlik> {
  const simdi = Date.now()

  const l1 = kimlikCache.get(userId)
  if (l1 && l1.sonKullanma > simdi) return l1.veri

  const l2 = await redisTry(async (r) => r.get(`yetki:kimlik:${userId}`), null)
  if (l2) {
    try {
      const veri = JSON.parse(l2) as Kimlik
      cacheYaz(userId, veri)
      return veri
    } catch {
      // Bozuk JSON → yok say, DB'den tazele.
    }
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, is_approved, class_code, teacher_id, name')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw new HttpHatasi(500, 'profil_okunamadi', 'Kullanıcı profili okunamadı.')
  if (!data) {
    // Doğrulanmış bir JWT `sub`'ının profili yoksa bu bir ANOMALİDİR, "öğrenci" değil.
    logger.warn({ userId }, 'doğrulanmış kullanıcının profili yok')
    throw yetkisiz('profil_yok', 'Kullanıcı profili bulunamadı.')
  }

  const veri: Kimlik = {
    userId,
    role: rolNormalize(data.role),
    isApproved: data.is_approved === true,
    classCode: data.class_code ?? null,
    teacherId: data.teacher_id ?? null,
    name: data.name ?? null,
  }

  cacheYaz(userId, veri)
  await redisTry(async (r) => r.set(`yetki:kimlik:${userId}`, JSON.stringify(veri), 'PX', KIMLIK_TTL_MS), null)
  return veri
}

/**
 * Önbelleği anında düşürür. Admin onay ucundan çağrılır — onay TTL beklemez.
 * (Sahiplik önbelleği de düşer: onay değişimi sınıf görünürlüğünü etkileyebilir.)
 */
export async function kimligiUnut(userId: string): Promise<void> {
  kimlikCache.delete(userId)
  await redisTry(async (r) => r.del(`yetki:kimlik:${userId}`), 0)
}

// ─────────────────────────────────────────────────────────────────────────────
// SAHİPLİK
//
// Bunlar middleware DEĞİL: studentId route parametresinden gelir ve denetimin
// KULLANIM NOKTASINDA görünür kalması gerekir — assignments.routes.ts:7-10'un
// IDOR uyarısının istediği tam olarak bu.
// ─────────────────────────────────────────────────────────────────────────────

const SAHIPLIK_POZITIF_MS = 60_000
/** Negatif TTL KISA: uzun negatif, sınıfa yeni eklenen öğrenciyi "bozuk" gösterir. */
const SAHIPLIK_NEGATIF_MS = 10_000

/**
 * Öğretmenin bu öğrenciye erişebildiğini doğrular; doğrulanırsa öğrenci satırını döner
 * (çağıran aynı satırı tekrar çekmesin).
 *
 * Geçer: role='student' VE (teacher_id eşleşir VEYA teacher_ids içerir).
 * Geçmezse — kayıt olmasa da, başkasının öğrencisi olsa da — **404**. Gerekçe hata.ts'te.
 */
export async function assertTeacherOwnsStudent(teacherId: string, studentId: string): Promise<OgrenciKimlik> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, grade, student_class, role, teacher_id, teacher_ids')
    .eq('id', studentId)
    .maybeSingle()

  if (error) throw new HttpHatasi(500, 'ogrenci_okunamadi', 'Öğrenci bilgisi okunamadı.')

  const yok = bulunamadi('ogrenci_bulunamadi', 'Öğrenci bulunamadı.')
  if (!data) throw yok

  const cokluUyelik = Array.isArray(data.teacher_ids) ? (data.teacher_ids as unknown[]) : []
  const sahip =
    data.role === 'student' && (data.teacher_id === teacherId || cokluUyelik.includes(teacherId))

  if (!sahip) {
    // İstemciye 404 döner ama sunucuda AYRIMI görürüz: yabancı uuid yoklayan öğretmen sinyaldir.
    logger.warn({ teacherId, studentId, role: data.role }, 'öğretmen sahibi olmadığı öğrenciyi istedi')
    throw yok
  }

  return {
    id: data.id,
    name: data.name ?? null,
    grade: data.grade ?? null,
    studentClass: data.student_class ?? null,
  }
}

/** Sınıf kodunun öğretmenin kendi kodu olduğunu doğrular — ek sorgu yok. */
export async function assertTeacherOwnsClass(teacherId: string, classCode: string): Promise<void> {
  const kimlik = await kimlikAl(teacherId)
  if (!kimlik.classCode || kimlik.classCode !== classCode) {
    throw yetkisiz('sinif_yetkisiz', 'Bu sınıf üzerinde yetkiniz yok.')
  }
}

const rosterCache = new Map<string, { ids: string[]; sonKullanma: number }>()

/**
 * Öğretmenin sınıf mevcudunun id listesi.
 *
 * ⚠️ `fetchAll` ŞART: PostgREST 1000 satırda SESSİZCE keser (lib/pg.ts). Kalabalık bir
 * okulda 1200 kişilik mevcut sessizce 1000'e düşer ve her sınıf ortalaması bozulur.
 */
export async function sinifOgrencileri(teacherId: string): Promise<string[]> {
  const simdi = Date.now()
  const onbellek = rosterCache.get(teacherId)
  if (onbellek && onbellek.sonKullanma > simdi) return onbellek.ids

  const satirlar = await fetchAll<{ id: string }>(() =>
    supabase
      .from('profiles')
      .select('id')
      .eq('role', 'student')
      .or(`teacher_id.eq.${teacherId},teacher_ids.cs.["${teacherId}"]`),
  )

  const ids = satirlar.map((s) => s.id)
  rosterCache.set(teacherId, {
    ids,
    sonKullanma: simdi + (ids.length ? SAHIPLIK_POZITIF_MS : SAHIPLIK_NEGATIF_MS),
  })
  return ids
}

/**
 * Sınıf mevcudu önbelleğini düşürür — kayıt/çıkarma sonrası ZORUNLU.
 *
 * Bunsuz, sınıfa yeni katılan öğrenci 60 saniye boyunca listede görünmez ve öğretmen
 * "katılım çalışmıyor" sanır. Kayıt akışının en sinsi hatası budur: yazma başarılı,
 * geri bildirim yanlış.
 */
export function sinifiUnut(teacherId: string): void {
  rosterCache.delete(teacherId)
}
