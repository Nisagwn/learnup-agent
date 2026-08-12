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
  /**
   * Hesap askıda mı (0025). ROL DEĞİLDİR: askı hiçbir sınıf/öğretmen bağını koparmaz,
   * yalnız erişimi keser — `requireAktifHesap` her /api/v1 isteğinde buna bakar.
   */
  askidaMi: boolean
}

export type OgrenciKimlik = {
  id: string
  name: string | null
  grade: string | null
  studentClass: string | null
  /**
   * BAĞ KOLONLARININ İKİSİ DE taşınır — sahiplik iki kolondan kuruluyorsa (aşağıdaki
   * `sahip` koşuluna bak) bağı KOPARAN kodun da ikisini birden görmesi gerekir. Yoksa
   * çıkarma işlemi yalnız `teacher_id`'yi null'layıp `teacher_ids` üyeliğini bırakır ve
   * yanlış öğretmenin sınıfını boşaltır (teacher.routes.ts DELETE /ogrenci/:id).
   */
  teacherId: string | null
  teacherIds: string[]
}

/**
 * İKİ AYRI TTL — bilinçli olarak farklı.
 *
 * L2 (Redis) 60 sn: DB yükünü asıl bu emer ve ORTAK katmandır — `kimligiUnut` onu
 * sildiğinde bütün node'lar için düşmüş olur.
 *
 * L1 (süreç-içi) 5 sn: yalnız BURST emici. Uzun tutulamaz çünkü SÜREÇ-YERELDİR:
 * nginx artık brain ve brain2 arasında yük paylaştırıyor (deploy/nginx/default.conf) ve
 * `kimligiUnut` yalnız kendi node'unun Map'ini siler. L1 60 sn iken yönetici bir hesabı
 * askıya aldığında diğer node o hesabı 60 SANİYE daha içeri almaya devam ediyordu —
 * askı bir yetki gecikmesi değil, erişimin tümden kesilmesi olması gereken bir işlem.
 * 5 sn, istek başına Redis okumasını hâlâ ~12 kat azaltır ama askı penceresini insan
 * ölçeğinden çıkarır.
 *
 * ⚠️ Acil durumda beklenecek pencere SIFIRDIR: oturum kesimi (oturum:v1:kesim:<userId>,
 * Redis db2) her istekte kısılmadan okunur — yönetici hesabı anında dışarı atabilir.
 */
const KIMLIK_L1_MS = 5_000
const KIMLIK_L2_MS = 60_000
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
  kimlikCache.set(userId, { veri, sonKullanma: Date.now() + KIMLIK_L1_MS })
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
      // ⚠️ ŞEMA KONTROLÜ: 0025 öncesi yazılmış bir kayıtta `askidaMi` YOKTUR ve
      // undefined "askıda değil" gibi okunur. Dağıtım penceresinde askıya alınmış
      // bir hesabın eski önbellekle geçmesi demek olurdu — eksik alan görülünce
      // kayıt bayat sayılır ve DB'den tazelenir.
      if (typeof veri.askidaMi === 'boolean') {
        cacheYaz(userId, veri)
        return veri
      }
    } catch {
      // Bozuk JSON → yok say, DB'den tazele.
    }
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, is_approved, class_code, teacher_id, name, askiya_alindi')
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
    askidaMi: data.askiya_alindi === true,
  }

  cacheYaz(userId, veri)
  await redisTry(async (r) => r.set(`yetki:kimlik:${userId}`, JSON.stringify(veri), 'PX', KIMLIK_L2_MS), null)
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
    teacherId: (data.teacher_id as string | null) ?? null,
    teacherIds: cokluUyelik.map((x) => String(x)),
  }
}

/** Sınıf kodunun öğretmenin kendi kodu olduğunu doğrular — ek sorgu yok. */
export async function assertTeacherOwnsClass(teacherId: string, classCode: string): Promise<void> {
  const kimlik = await kimlikAl(teacherId)
  if (!kimlik.classCode || kimlik.classCode !== classCode) {
    throw yetkisiz('sinif_yetkisiz', 'Bu sınıf üzerinde yetkiniz yok.')
  }
}

/**
 * SINIF MEVCUDU ÖNBELLEĞİ — kimlik önbelleğiyle AYNI iki kademeli yapı (L1 → L2 → DB).
 *
 * ⚠️ ESKİDEN YALNIZ SÜREÇ-İÇİ Map İDİ VE BU, ÇOK NODE'LU KURULUMDA BOZUKTU.
 * `sinifiUnut` aşağıdaki yorumun dediği gibi kayıt/çıkarma sonrası ZORUNLU çağrılır —
 * ama süreç-içi Map'te yalnız İSTEĞİ ALAN node'u temizliyordu. nginx brain ve brain2
 * arasında yük paylaştırdığı için (deploy/nginx/default.conf) gerçek akış şuydu:
 *     öğrenci sınıfa katılır  → istek brain'e düşer  → brain'in Map'i temizlenir
 *     öğretmen listeyi açar   → istek brain2'ye düşer → brain2 ESKİ listeyi döndürür
 * Yani düzeltilmiş sayılan hata (yorumun anlattığı "en sinsi hata") geri geliyordu,
 * üstelik ARALIKLI olarak — bazen doğru, bazen eksik.
 *
 * L2'yi ortak depoya (Redis) almak düşürmeyi bütün node'lar için geçerli kılar; L1
 * yalnızca 5 sn'lik burst emici olarak kalır (kimlik önbelleğiyle aynı gerekçe).
 */
const SINIF_L1_MS = 5_000
/**
 * Kimlik önbelleğindeki tavanın AYNISI burada da gerekli.
 *
 * ⚠️ `rosterCache` aynı ömürde ama HİÇBİR tavanı yoktu: her `sinifOgrencileri(teacherId)`
 * çağrısı yeni bir öğretmen anahtarı ekliyor ve girdi hiç silinmiyordu (`sonKullanma`
 * yalnız OKUMA anında kontrol ediliyor, süresi dolan kayıt Map'te kalıyor). Değer de küçük
 * değil — 1000+ öğrenci id'si taşıyan diziler. `KIMLIK_TAVAN` yorumunun "sınırsız büyüyen
 * Map, uzun ömürlü Bun sürecinde SIZINTIDIR" gerekçesi buraya birebir uyuyordu.
 * Tavan daha düşük: anahtar sayısı öğretmen sayısıyla sınırlı ama satır başına yük büyük.
 */
const SINIF_TAVAN = 1_000
const sinifKey = (teacherId: string): string => `yetki:sinif:${teacherId}`
const rosterCache = new Map<string, { ids: string[]; sonKullanma: number }>()

function rosterYaz(teacherId: string, ids: string[], sonKullanma: number): void {
  if (rosterCache.size >= SINIF_TAVAN && !rosterCache.has(teacherId)) {
    const enEski = rosterCache.keys().next().value   // Map ekleme sırasını korur
    if (enEski !== undefined) rosterCache.delete(enEski)
  }
  rosterCache.set(teacherId, { ids, sonKullanma })
}

/**
 * Öğretmenin sınıf mevcudunun id listesi.
 *
 * ⚠️ `fetchAll` ŞART: PostgREST 1000 satırda SESSİZCE keser (lib/pg.ts). Kalabalık bir
 * okulda 1200 kişilik mevcut sessizce 1000'e düşer ve her sınıf ortalaması bozulur.
 */
export async function sinifOgrencileri(teacherId: string): Promise<string[]> {
  const simdi = Date.now()
  const l1 = rosterCache.get(teacherId)
  if (l1 && l1.sonKullanma > simdi) return l1.ids

  const l2 = await redisTry(async (r) => r.get(sinifKey(teacherId)), null)
  if (l2) {
    try {
      const ids = JSON.parse(l2) as string[]
      if (Array.isArray(ids)) {
        rosterYaz(teacherId, ids, simdi + SINIF_L1_MS)
        return ids
      }
    } catch {
      // Bozuk JSON → yok say, DB'den tazele.
    }
  }

  const satirlar = await fetchAll<{ id: string }>(() =>
    supabase
      .from('profiles')
      .select('id')
      .eq('role', 'student')
      .or(`teacher_id.eq.${teacherId},teacher_ids.cs.["${teacherId}"]`),
  )

  const ids = satirlar.map((s) => s.id)
  rosterYaz(teacherId, ids, simdi + SINIF_L1_MS)
  // Negatif sonuç KISA yaşar: uzun negatif, sınıfa yeni eklenen öğrenciyi "bozuk" gösterir.
  const l2Ms = ids.length ? SAHIPLIK_POZITIF_MS : SAHIPLIK_NEGATIF_MS
  await redisTry(async (r) => r.set(sinifKey(teacherId), JSON.stringify(ids), 'PX', l2Ms), null)
  return ids
}

/**
 * Sınıf mevcudu önbelleğini düşürür — kayıt/çıkarma sonrası ZORUNLU.
 *
 * Bunsuz, sınıfa yeni katılan öğrenci 60 saniye boyunca listede görünmez ve öğretmen
 * "katılım çalışmıyor" sanır. Kayıt akışının en sinsi hatası budur: yazma başarılı,
 * geri bildirim yanlış.
 *
 * ⚠️ ARTIK ASENKRON — `await` ŞART. L2 (Redis) ortak katmandır ve asıl düşmesi gereken
 * odur; onu beklemeden yanıt dönmek, düşürmeyi yine yarım bırakır. Yerel L1 ise en fazla
 * 5 sn daha yaşar (SINIF_L1_MS) — o pencere kabul edilmiş sınırdır.
 */
export async function sinifiUnut(teacherId: string): Promise<void> {
  rosterCache.delete(teacherId)
  await redisTry(async (r) => r.del(sinifKey(teacherId)), 0)
}

/**
 * SÜREÇ-İÇİ yetki önbelleklerini tümden düşürür (0025 ops ucu).
 *
 * ⚠️ REDIS'İ TEMİZLEMEZ. L2 tek bir sürecin değil, bütün örneklerin ortak katmanıdır;
 * onu silmek çağıranın işidir (admin.routes.ts, `yetki:kimlik:*`). Burada iki şeyi
 * birden yapmak, "hangi katman düştü" sorusunu yanıtsız bırakırdı — dönüş değeri
 * katman katman sayı verir, yönetici sonucu EKRANDA görür.
 */
export function yetkiOnbelleginiDus(): { kimlik: number; sinif: number } {
  const kimlik = kimlikCache.size
  const sinif = rosterCache.size
  kimlikCache.clear()
  rosterCache.clear()
  return { kimlik, sinif }
}
