import type { RontgenGovdesi } from '../lib/rontgen.js'

/**
 * ÖĞRETMEN & YÖNETİCİ PANELİ — yanıt sözleşmeleri.
 *
 * ⚠️ DÜRÜSTLÜK KURALI (bu dosyanın var oluş sebebi):
 * "Ölçülmedi" ile "sıfır" AYRI şeylerdir. Bir öğretmen paneli, veri yokluğunu iyi haber
 * gibi gösterdiği an zararlıdır: müdahale edilmesi gereken yerde müdahale ETTİRMEZ.
 * Bu yüzden hesaplanamayan her metrik `null`'dır, 0 değil; her risk etiketinin
 * 'veri-yok' hâli vardır.
 */

// ═══════════════════════════════ ÖĞRETMEN ═══════════════════════════════

/** GET /api/v1/teacher/ozet */
export type OgretmenOzeti = {
  ogretmen: { id: string; name: string | null; classCode: string | null; school: string | null }
  sinif: { ogrenciSayisi: number; aktif7Gun: number; aktif30Gun: number; hicBaslamayan: number }
  hafta: { cozulen: number; dogru: number; basariOrani: number | null; xp: number }
  /** Sınıf geneli ortalama ustalık — ÇÜRÜME UYGULANMIŞ (RPC içinde). Veri yoksa null. */
  ortalamaUstalik: number | null
  acikYanilgi: number
  /**
   * Sınıf toplamı günlük seri (84 gün) — öğrencinin `RontgenYanit.trend`'i ile AYNI ŞEKİL,
   * böylece frontend'de `TrendPaneli` sıfır adaptörle çalışır.
   * Hiç aktivite yoksa BOŞ dizi; panel o zaman kendini gizler.
   */
  trend: Array<{ date: string; solved: number; correct: number; xp: number }>
  olcumZamani: string
}

export type OgrenciSatiri = {
  studentId: string
  name: string | null
  grade: string | null
  studentClass: string | null
  solved: number
  correct: number
  /** solved === 0 ise null — 0 DEĞİL (veri yok ≠ başarısız). */
  basariOrani: number | null
  xp: number
  lastActive: string | null
  /** ÇÜRÜME UYGULANMIŞ; takip edilen düğüm yoksa null. */
  avgMastery: number | null
  trackedNodes: number
  openMisconceptions: number
  /** 'veri-yok': trackedNodes === 0 → risk HESAPLANAMAZ, "düşük risk" DEĞİL. */
  risk: 'yuksek' | 'orta' | 'dusuk' | 'veri-yok'
}

/** GET /api/v1/teacher/sinif */
export type SinifRosterYaniti = {
  classCode: string | null
  gunAraligi: number
  students: OgrenciSatiri[]
  total: number
  limit: number
  offset: number
}

export type IsiHaritasiHucresi = {
  subject: string
  /** ltree ilk 2 seviye, ör. "matematik.g11". */
  unitPath: string
  /** curriculum_nodes'tan çözülür; eşleşmezse null (uydurma başlık YOK). */
  unitTitle: string | null
  /** 0..1 — ÇÜRÜME UYGULANMIŞ, öğrenci-başına İKİ KATMANLI ortalama. */
  avgMastery: number
  studentCount: number
  /** Öğrencinin ünite ortalaması < esik.zayif olanların sayısı. */
  weakStudentCount: number
  nodeCount: number
  attempts: number
}

/** GET /api/v1/teacher/sinif/isi-haritasi */
export type IsiHaritasiYaniti = {
  cells: IsiHaritasiHucresi[]
  subjects: string[]
  ogrenciSayisi: number
  /** İstemci renk skalasını buradan kurar — eşik backend'de TEK kaynakta. */
  esik: { zayif: number }
  olcumZamani: string
}

export type SinifZayifKazanim = {
  kazanimId: number
  code: string | null
  title: string
  subject: string
  path: string
  /** Ortalama (1 − m_eff). */
  avgWrongRate: number
  studentCount: number
  weakStudentCount: number
  attempts: number
  /** Havuzda kaç soru var → "bu kazanımdan ödev kurabilir miyim". 0 ise UI butonu kapatır. */
  havuzdaSoru: { osym: number; ai: number }
}

/** GET /api/v1/teacher/sinif/zayif-kazanimlar */
export type SinifZayifYaniti = {
  kazanimlar: SinifZayifKazanim[]
  esik: { zayifWrongRate: number; minAttempts: number }
  olcumZamani: string
}

/** GET /api/v1/teacher/ogrenci/:studentId */
export type OgrenciDetayYaniti = {
  student: { id: string; name: string | null; grade: string | null; studentClass: string | null }
  ozet: Omit<OgrenciSatiri, 'studentId' | 'name' | 'grade' | 'studentClass'>
  zayifKazanimlar: Array<{
    kazanimId: number
    code: string | null
    title: string
    subject: string
    path: string
    wrongRate: number
  }>
  sonOdevler: Array<{
    id: string
    tur: 'sinif' | 'hedefli'
    title: string
    score: number | null
    maxScore: number | null
    submittedAt: string | null
  }>
  olcumZamani: string
}

/**
 * GET /api/v1/teacher/ogrenci/:studentId/rontgen
 *
 * Öğrencinin KENDİ gördüğü gövdenin aynısı + kimlik + teşhis dökümü.
 * Aynı şekil olması kasıtlı: frontend'de TrendPaneli/UstalikMatrisi/OncelikRadari
 * sıfır adaptörle çalışsın diye.
 */
export type OgretmenRontgenYaniti = RontgenGovdesi & {
  student: { id: string; name: string | null; grade: string | null }
}

export type OgrenciLogSatiri = {
  createdAt: string
  subject: string | null
  subTopic: string | null
  kazanimId: number | null
  isCorrect: boolean | null
  isSkipped: boolean
  selectedOption: string | null
  durationMs: number | null
  difficulty: string | null
  xp: number
}

/** GET /api/v1/teacher/ogrenci/:studentId/loglar */
export type OgrenciLoglarYaniti = {
  logs: OgrenciLogSatiri[]
  total: number
  limit: number
  offset: number
  gunAraligi: number
}

export type OdevOzeti = {
  id: string
  subject: string | null
  topic: string | null
  soruSayisi: number
  dueDate: string | null
  status: string
  createdAt: string
  gonderim: { toplam: number; ortalamaYuzde: number | null; bekleyen: number }
}

/** GET /api/v1/teacher/odevler */
export type OdevListesiYaniti = {
  assignments: OdevOzeti[]
  hedefli: Array<{
    id: string
    studentId: string
    studentName: string | null
    title: string
    status: string
    score: number | null
    maxScore: number | null
    createdAt: string
  }>
  ogrenciSayisi: number
  total: number
}

/** POST /api/v1/teacher/odev */
export type OdevOlusturIstek = {
  subject?: string
  topic?: string
  kazanimId?: number
  kaynak: 'osym' | 'ai' | 'karisik'
  difficulty?: 'kolay' | 'orta' | 'zor'
  soruSayisi: number
  dueDate?: string | null
}

export type OdevOlusturYanit = {
  id: string
  questionIds: string[]
  istenen: number
  /** Havuz yetmezse bulunan < istenen. LLM ÇAĞRILMAZ, soru UYDURULMAZ — eksik GÖRÜNÜR olur. */
  bulunan: number
  kaynakDagilimi: { osym: number; ai: number }
  uyari: string | null
}

/** POST /api/v1/teacher/hedefli-odev */
export type HedefliOdevIstek = {
  studentId: string
  soruSayisi?: number
  /** Boşsa weak_kazanimlar RPC'sinden OTOMATİK seçilir. */
  kazanimIds?: number[]
  kaynak?: 'osym' | 'ai' | 'karisik'
}

export type HedefliOdevYanit = {
  id: string
  studentId: string
  questionIds: string[]
  kazanimlar: Array<{ kazanimId: number; title: string; wrongRate: number; soruAdedi: number }>
  bulunan: number
  rationale: string
  uyari: string | null
}

/** GET /api/v1/teacher/soru-havuzu */
export type HavuzSorusu = {
  id: string
  kaynak: 'osym' | 'ai'
  subject: string
  topic: string | null
  kazanimId: number | null
  questionText: string
  difficulty: string | null
  quality: number | null
  examLabel: string | null
  examYear: number | null
}

export type HavuzListesiYaniti = {
  sorular: HavuzSorusu[]
  total: number
  limit: number
  offset: number
}

// ═══════════════════════════════ YÖNETİCİ ═══════════════════════════════

/** GET /api/v1/admin/havuz */
export type AdminHavuzYaniti = {
  ai: {
    toplam: number
    verified: number
    verifiedOrani: number
    zorluk: Record<'kolay' | 'orta' | 'zor' | 'etiketsiz', number>
    /** osymStyleScore 0..5. */
    kaliteHistogram: Array<{ quality: number; count: number }>
    ortKalite: number | null
    dersler: Array<{ subject: string; count: number; verified: number }>
    /** kazanim_id IS NULL → konu listesine giremeyen ölü stok. */
    kazanimsiz: number
    sonUretim: string | null
  }
  osym: {
    toplam: number
    verified: number
    dersler: Array<{ subject: string; count: number }>
    yillar: Array<{ year: number; count: number }>
  }
  kapsama: {
    kazanimToplam: number
    aiKapsanan: number
    osymKapsanan: number
    herhangiKapsanan: number
    kapsamaOrani: number
    dersBazli: Array<{ subject: string; kazanim: number; kapsanan: number; oran: number }>
  }
  olcumZamani: string
}

/** eval-sonuclari/*.json anlığı — UYDURMA YOK, dosyada ne varsa o. */
export type EvalAnlik = {
  tarih: string
  ai: {
    n: number
    sizintiOrani: number | null
    kusatmaIhlalOrani: number | null
    gorselGonderme: number | null
    nnKopya: number | null
    nnP90: number | null
  }
  osym: { n: number }
}

/** GET /api/v1/admin/eval */
export type AdminEvalYaniti = {
  /** Hiç koşmadıysa null — SIFIR DEĞİL. */
  sonuncu: EvalAnlik | null
  /** Eskiden yeniye. */
  trend: EvalAnlik[]
  kosumSayisi: number
  sonKosumYasiSaat: number | null
  uyari: string | null
}

/** GET /api/v1/admin/ozgunluk */
export type AdminOzgunlukYaniti = {
  esikler: Array<{ subject: string; esik: number; taban: boolean; havuzAdedi: number }>
  tabanEsik: number
  shingle: number
  snapshot: { tarih: string; nnKopya: number | null; nnP90: number | null } | null
  /** uretim_telemetri'den; tablo henüz boşsa null (ölçülmemiş ≠ sıfır). */
  engel: { son7GunElenen: number; son30GunElenen: number; toplamElenen: number } | null
  /** Kapının DÜRÜST SINIRI — utils/benzerlik.ts'in özeti. Panel bunu birebir basar. */
  not: string
}

export type ElemeKapisi =
  | 'plan'
  | 'latex'
  | 'kusatma'
  | 'uzunluk_sizinti'
  | 'kok_uzunlugu'
  | 'ozgunluk'
  | 'hakem_ret'
  | 'hakem_onarim_ret'
  | 'hata'

export type OnarimTetikleyici = 'latex' | 'kusatma' | 'uzunluk' | 'hakem'

export type UretimHunisi = {
  aday: number
  kabul: number
  /** aday === 0 ise null. */
  kabulOrani: number | null
  eleme: Record<ElemeKapisi, number>
  onarim: Record<OnarimTetikleyici, number>
  /** Model HİÇ aday vermedi — eleme DEĞİL, ARIZA. */
  uretimSifirTur: number
}

/** GET /api/v1/admin/uretim-hatti */
export type AdminUretimHattiYaniti = {
  gunAraligi: number
  toplam: UretimHunisi
  gunluk: Array<{ date: string } & UretimHunisi>
  dersBazli: Array<{ subject: string } & UretimHunisi>
  zorlukBazli: Array<{ difficulty: string } & UretimHunisi>
  /** Telemetri tablosunun İLK satırı. Bundan öncesi ÖLÇÜLMEDİ — "0 eleme" ile karıştırılamaz. */
  veriBasladi: string | null
  olcumZamani: string
}

/** GET /api/v1/admin/gorevler */
export type AdminGorevlerYaniti = {
  durum: Record<'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED', number>
  kindBazli: Array<{
    kind: string
    pending: number
    running: number
    completed: number
    failed: number
  }>
  /** RUNNING + locked_at > 10dk → worker çöktü ya da kilit sızdı. */
  takilanlar: Array<{
    id: string
    kind: string
    lockedBy: string | null
    lockedAt: string | null
    yasDk: number
    attempts: number
  }>
  sonHatalar: Array<{
    id: string
    kind: string
    error: string | null
    attempts: number
    updatedAt: string
  }>
  son24Saat: { olusturulan: number; tamamlanan: number; basarisiz: number }
  saglik: 'iyi' | 'uyari' | 'kritik'
  olcumZamani: string
}

export type AdminKullaniciSatiri = {
  id: string
  name: string | null
  email: string | null
  role: 'student' | 'teacher' | 'admin'
  isApproved: boolean
  classCode: string | null
  school: string | null
  /** Yalnız role==='teacher'; diğerlerinde null. */
  ogrenciSayisi: number | null
  createdAt: string
}

/** GET /api/v1/admin/kullanicilar */
export type AdminKullanicilarYaniti = {
  users: AdminKullaniciSatiri[]
  total: number
  limit: number
  offset: number
  bekleyenOnay: number
}

/** POST /api/v1/admin/ogretmen/:id/onay */
export type OgretmenOnayYanit = {
  id: string
  isApproved: boolean
  guncellendi: string
  denetimYazildi: boolean
}

// ─────────────────────── YÖNETİM: KULLANICI & DENETİM ───────────────────────
//
// ⚠️ Bu bölümün uçları GERİ ALINAMAZ sonuçlar üretir (rol değişimi RBAC'ı yeniden
// çizer, sınıf ataması iki öğretmenin analitiğini değiştirir). Bu yüzden her
// mutasyon yanıtı `denetimYazildi` taşır: iz tutulamadıysa yönetici bunu EKRANDA
// görür. Sessizce izsiz kalan bir yetki, yetki değil açıktır.

/** GET /api/v1/admin/kullanici/:id */
export type AdminKullaniciDetayi = {
  kullanici: AdminKullaniciSatiri & { grade: string | null; studentClass: string | null }
  /** Yalnız öğrencide: bağlı olduğu öğretmen. Sınıfsızsa null. */
  ogretmen: { id: string; name: string | null; classCode: string | null; school: string | null } | null
  /** Yalnız öğretmende: mevcut özeti. */
  sinif: { ogrenciSayisi: number; ogrenciler: Array<{ id: string; name: string | null }> } | null
  /** Hiç cevap kaydı YOKSA null — sıfır değil. "Hiç başlamamış" ile "0 doğru" ayrı şeyler. */
  etkinlik: {
    toplamCevap: number
    son7Gun: number
    sonGorulme: string | null
    takipEdilenKazanim: number
  } | null
  /** Bu kullanıcı üzerinde yapılmış yönetim işlemleri (en yeni önce). */
  denetim: DenetimSatiri[]
  olcumZamani: string
}

export type DenetimSatiri = {
  id: number
  adminId: string
  adminAdi: string | null
  eylem: 'ogretmen_onay' | 'rol_degis' | 'sinif_ata' | 'gorev_yeniden'
  hedefId: string | null
  hedefTur: 'kullanici' | 'gorev' | null
  hedefAdi: string | null
  detay: Record<string, unknown>
  createdAt: string
}

/** GET /api/v1/admin/denetim */
export type AdminDenetimYaniti = {
  kayitlar: DenetimSatiri[]
  total: number
  limit: number
  offset: number
  /** 0020 uygulanmadıysa true — panel "defter yok" der, "hiç işlem yok" DEMEZ. */
  defterYok: boolean
}

/** POST /api/v1/admin/kullanici/:id/rol — body: { rol } */
export type RolDegisYanit = {
  id: string
  oncekiRol: 'student' | 'teacher' | 'admin'
  yeniRol: 'student' | 'teacher' | 'admin'
  /** teacher → başka role geçişte sınıfı boşaltılan öğrenci sayısı. */
  serbestBirakilanOgrenci: number
  /** → teacher geçişinde üretilen/korunan sınıf kodu. */
  classCode: string | null
  denetimYazildi: boolean
}

/** POST /api/v1/admin/kullanici/:id/sinif — body: { teacherId: string | null } */
export type SinifAtaYanit = {
  studentId: string
  oncekiOgretmenId: string | null
  yeniOgretmenId: string | null
  denetimYazildi: boolean
}

/** POST /api/v1/admin/gorev/:id/yeniden */
export type GorevYenidenYanit = {
  id: string
  oncekiDurum: string
  yeniDurum: 'PENDING'
  /**
   * Redis akışına itilebildi mi? false ise görev PENDING'de bekler ve bekçi
   * (atolye.worker.ts janitor, 5 dk periyot) toplar — kaybolmaz, GECİKİR.
   * Bunu gizleyip "yeniden kuyruğa alındı" demek, yöneticiyi 5 dk boyunca
   * "çalışmadı" sanmaya iterdi.
   */
  akisaItildi: boolean
  denetimYazildi: boolean
}
