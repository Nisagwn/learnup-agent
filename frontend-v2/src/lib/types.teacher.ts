import type { RontgenYanit, TrendGunu } from './types'

/**
 * ÖĞRETMEN PANELİ — API sözleşmeleri (learnup-brain/src/types/panel.ts'in aynası).
 *
 * ⚠️ "Ölçülmedi" ile "sıfır" AYRI: hesaplanamayan her metrik `null`, 0 değil.
 * UI bunu boş/eksik olarak çizmek zorunda — 0 çizmek, veri yokluğunu iyi haber gibi
 * gösterir ve müdahale edilmesi gereken yerde müdahale ettirmez.
 */

export type OgrenciRisk = 'yuksek' | 'orta' | 'dusuk' | 'veri-yok'

export interface OgrenciSatiri {
  studentId: string
  name: string | null
  grade: string | null
  studentClass: string | null
  solved: number
  correct: number
  /** solved === 0 ise null — 0 DEĞİL. */
  basariOrani: number | null
  xp: number
  lastActive: string | null
  /** Çürüme uygulanmış; takip edilen düğüm yoksa null. */
  avgMastery: number | null
  trackedNodes: number
  openMisconceptions: number
  /** 'veri-yok' → risk HESAPLANAMAZ, "düşük" DEĞİL. */
  risk: OgrenciRisk
}

export interface SinifRosterYaniti {
  classCode: string | null
  gunAraligi: number
  students: OgrenciSatiri[]
  total: number
  limit: number
  offset: number
}

export interface OgretmenOzeti {
  ogretmen: { id: string; name: string | null; classCode: string | null; school: string | null }
  sinif: { ogrenciSayisi: number; aktif7Gun: number; aktif30Gun: number; hicBaslamayan: number }
  hafta: { cozulen: number; dogru: number; basariOrani: number | null; xp: number }
  ortalamaUstalik: number | null
  acikYanilgi: number
  /** Öğrencinin `RontgenYanit.trend`'i ile AYNI ŞEKİL → TrendPaneli sıfır adaptörle çalışır. */
  trend: TrendGunu[]
  olcumZamani: string
}

export interface IsiHaritasiHucresi {
  subject: string
  unitPath: string
  /** Eşleşmezse null — uydurma başlık YOK. */
  unitTitle: string | null
  avgMastery: number
  studentCount: number
  weakStudentCount: number
  nodeCount: number
  attempts: number
}

export interface IsiHaritasiYaniti {
  cells: IsiHaritasiHucresi[]
  subjects: string[]
  /** SINIF MEVCUDU — haritada ölçümü olan öğrenci sayısı DEĞİL (panel.ts aynası). */
  ogrenciSayisi: number
  /** Haritanın kapsadığı öğrenci sayısı (en kalabalık hücre). */
  olculenOgrenci: number
  /** Renk skalasının eşiği backend'den gelir — TEK kaynak. */
  esik: { zayif: number }
  olcumZamani: string
}

/**
 * GET /teacher/sinif/isi-haritasi/ogrenciler — bir hücrenin (ders × ünite) zayıf öğrenci
 * KIRILIMI (drill-down; RPC 0023). Backend `IsiOgrenciKirilimiYaniti`'nın aynası.
 *
 * ⚠️ TUTARLILIK DEĞİŞMEZİ: `ogrenciler.length`, o hücrenin `weakStudentCount` değerine
 * EŞİTTİR (aynı roster + aynı eşik). UI bu iki sayının eşit görünmesini bozmaz.
 * Öğrenciler EN ZAYIF BAŞTA gelir — sunucu sıraladı, istemci YENİDEN SIRALAMAZ.
 */
export interface IsiOgrenciKirilimiSatiri {
  studentId: string
  /** roster kaynağıyla (profiles.name) AYNI; yoksa null — uydurma isim YOK. */
  ad: string | null
  /** ogrenci_ort — çürüme uygulanmış ünite ortalaması, 0..1 (4 ondalık). */
  mastery: number
  attempts: number
  nodeCount: number
}

export interface IsiOgrenciKirilimiYaniti {
  subject: string
  unitPath: string
  /** curriculum_nodes'tan çözülür; eşleşmezse null (uydurma başlık YOK). */
  unitTitle: string | null
  /** İstemci renk/eşik yorumunu buradan kurar — ısı haritasıyla TEK kaynak. */
  esik: { zayif: number }
  ogrenciler: IsiOgrenciKirilimiSatiri[]
  olcumZamani: string
}

export interface SinifZayifKazanim {
  kazanimId: number
  code: string | null
  title: string
  subject: string
  path: string
  avgWrongRate: number
  studentCount: number
  weakStudentCount: number
  attempts: number
  /** 0/0 ise UI "set gönder" butonunu KAPATIR — havuzda soru yokken ödev kurulamaz. */
  /** Ödeve DERLENEBİLİR stok — yalnız AI havuzu (telif kararı; bkz. panel.ts aynası). */
  havuzdaSoru: { ai: number }
}

export interface SinifZayifYaniti {
  kazanimlar: SinifZayifKazanim[]
  esik: { zayifWrongRate: number; minAttempts: number }
  olcumZamani: string
}

export interface OgrenciDetayYaniti {
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

/* ═══ GET /teacher/ogrenci/:id/loglar — ham cevap akışı (sayfalı) ═══
   ⚠️ Yanıtta "doğru şık" alanı YOK — UI doğru şıkkı GÖSTEREMEZ (uydurma yasak);
   yalnız seçilen şık + kelimeli sonuç (doğru/yanlış/boş) çizilir. */

export interface OgrenciLogSatiri {
  createdAt: string
  subject: string | null
  subTopic: string | null
  kazanimId: number | null
  /** null = değerlendirilmemiş (ör. boş geçilen soruda backend null bırakır). */
  isCorrect: boolean | null
  isSkipped: boolean
  selectedOption: string | null
  durationMs: number | null
  difficulty: string | null
  xp: number
}

export interface OgrenciLoglarYaniti {
  logs: OgrenciLogSatiri[]
  total: number
  limit: number
  offset: number
  gunAraligi: number
}

export interface YanilgiAyrinti {
  kazanimId: number
  title: string
  subject: string
  taxonomy: string | null
  selectedOption: string | null
  evidence: string | null
  confidence: number | null
  prereqHypothesis: string | null
  remediation: unknown
  openedAt: string | null
}

/**
 * Öğrencinin KENDİ röntgen gövdesi + kimlik + teşhis dökümü.
 *
 * `RontgenYanit`'ı genişletmesi KASITLI: TrendPaneli / TakvimIsi / UstalikMatrisi /
 * OncelikRadari / TuzakPaneli / HizPaneli sıfır adaptörle çalışsın diye.
 */
export type OgretmenRontgenYaniti = RontgenYanit & {
  student: { id: string; name: string | null; grade: string | null }
  /** Öğretmene açılır (teshisGoster). Öğrenci ucunda bu alan HİÇ BULUNMAZ. */
  misconceptions?: YanilgiAyrinti[]
}
