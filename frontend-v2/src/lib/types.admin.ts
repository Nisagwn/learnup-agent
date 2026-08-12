/**
 * YÖNETİCİ PANELİ — API sözleşmeleri (learnup-brain/src/types/panel.ts aynası).
 *
 * ⚠️ `null` = ÖLÇÜLMEDİ, sıfır değil. UI her null'ı "ölçüm yok" diye çizmek zorunda;
 * denetlenmemiş bir hattı temiz göstermek bu panelin önlemek için var olduğu şeydir.
 */

export interface AdminHavuzYaniti {
  ai: {
    toplam: number
    verified: number
    verifiedOrani: number
    zorluk: Record<'kolay' | 'orta' | 'zor' | 'etiketsiz', number>
    kaliteHistogram: Array<{ quality: number; count: number }>
    /** Hiç kalite etiketi yoksa null. */
    ortKalite: number | null
    dersler: Array<{ subject: string; count: number; verified: number }>
    /** kazanim_id NULL → konu listesine giremeyen ölü stok. */
    kazanimsiz: number
    /** Yöneticinin karantinaya aldığı soru sayısı (0025) — `verified` sayımının DIŞINDA. */
    karantinada: number
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

export interface EvalAnlik {
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

export interface AdminEvalYaniti {
  /** Eval hiç koşmadıysa null — SIFIR DEĞİL. */
  sonuncu: EvalAnlik | null
  trend: EvalAnlik[]
  kosumSayisi: number
  sonKosumYasiSaat: number | null
  uyari: string | null
}

export interface AdminOzgunlukYaniti {
  esikler: Array<{ subject: string; esik: number; taban: boolean; havuzAdedi: number }>
  tabanEsik: number
  /**
   * Eşikler DB'den mi okundu (0025)? false ise `ozgunluk_esikleri` tablosu boş/erişilemez
   * ve üretim KOD tablosuyla sürüyor — panel bunu SÖYLEMEK zorunda, yoksa yönetici
   * yürürlükte olmayan bir eşiği düzenlediğini sanır.
   */
  kaynakDB: boolean
  shingle: number
  snapshot: { tarih: string; nnKopya: number | null; nnP90: number | null } | null
  /** Üretim telemetrisi yokken null = "kaç aday elendi ÖLÇÜLMEDİ". */
  engel: { son7GunElenen: number; son30GunElenen: number; toplamElenen: number } | null
  not: string
}

export interface AdminGorevlerYaniti {
  durum: Record<'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED', number>
  kindBazli: Array<{ kind: string; pending: number; running: number; completed: number; failed: number }>
  takilanlar: Array<{
    id: string; kind: string; lockedBy: string | null
    lockedAt: string | null; yasDk: number; attempts: number
  }>
  sonHatalar: Array<{ id: string; kind: string; error: string | null; attempts: number; updatedAt: string }>
  son24Saat: { olusturulan: number; tamamlanan: number; basarisiz: number }
  saglik: 'iyi' | 'uyari' | 'kritik'
  olcumZamani: string
}

export interface AdminKullaniciSatiri {
  id: string
  name: string | null
  email: string | null
  role: 'student' | 'teacher' | 'admin'
  isApproved: boolean
  classCode: string | null
  school: string | null
  /** Yalnız öğretmende dolu. */
  ogrenciSayisi: number | null
  createdAt: string
  /**
   * Öğretmen başvuru durumu (0021). 'bekliyor' → başvuru rozeti bunu okur.
   * ROL DEĞİLDİR: başvuru yalnız niyet; rolü yönetici onayı öğretmene çevirir.
   */
  basvuruDurumu: 'bekliyor' | 'onaylandi' | 'reddedildi' | null
  /**
   * Hesap askıda mı (0025). ONAY DEĞİLDİR, ROL DEĞİLDİR: askı erişimi keser ama
   * hiçbir sınıf/öğretmen bağını koparmaz. Rozeti ayrı çizilir.
   */
  askidaMi: boolean
}

export interface AdminKullanicilarYaniti {
  users: AdminKullaniciSatiri[]
  total: number
  limit: number
  offset: number
  bekleyenOnay: number
  /** role='student' + başvuru='bekliyor' → yöneticinin işlem kuyruğu. */
  bekleyenBasvuru: number
  /** Askıya alınmış hesap sayısı (0025) — filtresiz toplam. */
  askidaSayisi: number
}

// ─────────────────────── YÖNETİM: KULLANICI & DENETİM ───────────────────────
//
// ⚠️ Buradaki mutasyonlar GERİ ALINAMAZ sonuçlar üretir: rol değişimi RBAC'ı
// yeniden çizer, sınıf ataması iki öğretmenin analitiğini değiştirir. Bu yüzden
// her yanıt `denetimYazildi` taşır — iz tutulamadıysa UI bunu GÖSTERMEK zorunda.

/** Kanonik liste learnup-brain/src/lib/denetim.ts'te — burası onun aynası. */
export type YonetimEylemi =
  | 'ogretmen_onay' | 'rol_degis' | 'sinif_ata' | 'gorev_yeniden'
  | 'hesap_olustur' | 'profil_duzelt' | 'sifre_sifirla'
  | 'hesap_askiya' | 'hesap_geri_al' | 'basvuru_reddet'
  | 'soru_dogrulama' | 'soru_karantina' | 'soru_etiket' | 'uretim_tetik'
  | 'esik_degis' | 'eval_tetik' | 'onbellek_dus' | 'gorev_iptal'
  | 'ogretmen_adina_odev' | 'ogretmen_adina_ogrenci'

export type DenetimHedefTuru = 'kullanici' | 'gorev' | 'ogretmen' | 'soru' | 'sistem'

/** Denetim akışında okunabilir Türkçe etiket — kod adını kullanıcıya basmayalım. */
export const EYLEM_ADI: Record<YonetimEylemi, string> = {
  ogretmen_onay: 'öğretmen onayı',
  rol_degis: 'rol değişimi',
  sinif_ata: 'sınıf ataması',
  gorev_yeniden: 'görev yeniden kuyruklandı',
  hesap_olustur: 'hesap açıldı',
  profil_duzelt: 'künye düzeltildi',
  sifre_sifirla: 'şifre sıfırlama gönderildi',
  hesap_askiya: 'hesap askıya alındı',
  hesap_geri_al: 'askı kaldırıldı',
  basvuru_reddet: 'başvuru reddedildi',
  soru_dogrulama: 'soru doğrulaması değişti',
  soru_karantina: 'soru karantinası değişti',
  soru_etiket: 'soru etiketi düzeltildi',
  uretim_tetik: 'üretim tetiklendi',
  esik_degis: 'özgünlük eşiği değişti',
  eval_tetik: 'eval ölçümü tetiklendi',
  onbellek_dus: 'önbellek düşürüldü',
  gorev_iptal: 'görev iptal edildi',
  ogretmen_adina_odev: 'öğretmen adına ödev',
  ogretmen_adina_ogrenci: 'öğretmen adına öğrenci işlemi',
}

export interface DenetimSatiri {
  id: number
  adminId: string
  adminAdi: string | null
  eylem: YonetimEylemi
  hedefId: string | null
  hedefTur: DenetimHedefTuru | null
  hedefAdi: string | null
  detay: Record<string, unknown>
  createdAt: string
}

export interface AdminDenetimYaniti {
  kayitlar: DenetimSatiri[]
  total: number
  limit: number
  offset: number
  /** 0020 uygulanmadıysa true — "defter yok" ile "hiç işlem yok" AYRI şeyler. */
  defterYok: boolean
  /** Filtre menüsünü besleyen yönetici listesi. */
  yoneticiler: Array<{ id: string; ad: string | null }>
}

export interface AdminKullaniciDetayi {
  kullanici: AdminKullaniciSatiri & { grade: string | null; studentClass: string | null }
  ogretmen: { id: string; name: string | null; classCode: string | null; school: string | null } | null
  sinif: { ogrenciSayisi: number; ogrenciler: Array<{ id: string; name: string | null }> } | null
  /** Hiç cevap kaydı YOKSA null — sıfır değil. */
  etkinlik: { toplamCevap: number; son7Gun: number; sonGorulme: string | null; takipEdilenKazanim: number } | null
  /** Öğretmen başvurusu (0021) — bağlamı yöneticiye açar. Başvuru yoksa null. */
  basvuru: {
    durum: 'bekliyor' | 'onaylandi' | 'reddedildi'
    tarih: string | null
    not: string | null
  } | null
  /** Askı bağlamı (0025) — hesap askıda değilse null. */
  aski: {
    neden: string | null
    verenId: string | null
    verenAdi: string | null
    tarih: string | null
  } | null
  denetim: DenetimSatiri[]
  olcumZamani: string
}

export interface RolDegisYanit {
  id: string
  oncekiRol: 'student' | 'teacher' | 'admin'
  yeniRol: 'student' | 'teacher' | 'admin'
  serbestBirakilanOgrenci: number
  classCode: string | null
  denetimYazildi: boolean
}

export interface SinifAtaYanit {
  studentId: string
  oncekiOgretmenId: string | null
  yeniOgretmenId: string | null
  denetimYazildi: boolean
}

export interface GorevYenidenYanit {
  id: string
  oncekiDurum: string
  yeniDurum: 'PENDING'
  /** false → görev PENDING'de bekler, bekçi 5 dk içinde toplar. Kaybolmaz, GECİKİR. */
  akisaItildi: boolean
  denetimYazildi: boolean
}

export interface OgretmenOnayYanit {
  id: string
  isApproved: boolean
  guncellendi: string
  denetimYazildi: boolean
}

// ──────────────────── YÖNETİM: HESAP YAŞAM DÖNGÜSÜ (0025) ────────────────────
//
// ⚠️ KALICI SİLME YOK (kullanıcı kararı 2026-07-24): yönetici hesabı ASKIYA ALIR.
// Yanlış askı bir özür, yanlış silme onarılamaz bir kayıptır.

export interface HesapOlusturYanit {
  id: string | null
  email: string
  role: 'student' | 'teacher'
  /** SMTP kurulu değilse false + `hata` dolu — UI "hesap açıldı" DEMEZ. */
  davetGonderildi: boolean
  hata: string | null
  denetimYazildi: boolean
}

export interface ProfilDuzeltYanit {
  id: string
  degisenler: Record<string, { onceki: unknown; yeni: unknown }>
  denetimYazildi: boolean
}

export interface SifreSifirlaYanit {
  id: string
  email: string
  gonderildi: boolean
  hata: string | null
  denetimYazildi: boolean
}

export interface AskiYanit {
  id: string
  askidaMi: boolean
  neden: string | null
  /** Askıyla birlikte kapatılan açık oturum sayısı (askı kaldırılırken 0). */
  kapatilanOturum: number
  denetimYazildi: boolean
}

/* ═══ Oturum yönetimi (yönetici görünümü) ═══ */

export interface AdminOturumSatiri {
  sid: string
  cihaz: string | null
  ip: string | null
  ilkGiris: string | null
  sonGorulme: string | null
  /** Bu cihazın kaç açık girişi var — satırlar cihaza göre gruplanır (bkz. types.ts CihazSatiri). */
  oturumSayisi: number
}

/** GET /admin/kullanici/:id/oturumlar — `katmanAcik:false` ≠ boş liste (bkz. types.ts). */
export interface AdminOturumlarYaniti {
  id: string
  katmanAcik: boolean
  oturumlar: AdminOturumSatiri[]
}

/** POST /admin/kullanici/:id/oturum-kapat */
export interface AdminOturumKapatYanit {
  id: string
  kapatilan: number
  denetimYazildi: boolean
}

export interface BasvuruReddetYanit {
  id: string
  durum: 'reddedildi'
  not: string | null
  denetimYazildi: boolean
}

// ──────────────────────── YÖNETİM: HAVUZ MODERASYONU (0025) ────────────────────────

export interface AdminSoruSatiri {
  id: string
  subject: string
  kazanimId: number | null
  kazanimBaslik: string | null
  topic: string | null
  onizleme: string
  difficulty: string | null
  quality: number | null
  verified: boolean
  karantina: boolean
  karantinaNeden: string | null
  createdAt: string
  /** Ampirik kanıt: kaç kez çözüldü (atlananlar hariç). */
  cozulme: number
  /** Doğru oranı 0-1. Örneklem < 5 ise null — az veriden oran üretmek yanıltır. */
  dogruOrani: number | null
  /** Triyaj risk skoru (yüksek = önce bakılmalı). */
  risk: number
}

export interface AdminSorularYaniti {
  sorular: AdminSoruSatiri[]
  total: number
  limit: number
  offset: number
  karantinaToplam: number
  sirala: 'risk' | 'yeni'
}

/* ═══ GET /admin/havuz/kapsama — ders × konu üretim açığı (0026/0028) ═══ */
export interface KapsamaKonu {
  konuId: number
  ad: string
  sinav: string
  toplam: number
  kolay: number
  orta: number
  zor: number
  talep: number
}
export interface KapsamaDersi {
  subject: string
  toplam: number
  konuSayisi: number
  bosKonu: number
  konular: KapsamaKonu[]
}
export interface KapsamaYaniti {
  dersler: KapsamaDersi[]
  toplamSoru: number
  toplamKonu: number
  bosKonu: number
  eslenmemisSoru: number
}

export interface AdminSoruDetayi {
  soru: AdminSoruSatiri & {
    questionText: string
    options: Record<string, string>
    correctOption: string
    solution: string | null
    contentHash: string | null
  }
  /** ⚠️ `null` = KURAL UYGULANMAZ, "temiz" DEĞİL (metinsel şıkta kuşatma ölçülemez). */
  saglik: {
    sikUzunluk: 'sizinti' | 'temiz' | null
    celdirici: 'kusatilmis' | 'tek-yanda' | null
    gorseleGonderme: boolean
    gorselBagimli: boolean
  }
  ozgunluk: {
    esik: number
    /** Karşılaştırılacak soru yoksa null — 0 DEĞİL. */
    enYakin: number | null
    enYakinId: string | null
    esikAsildi: boolean
  }
  denetim: DenetimSatiri[]
}

export interface SoruMudahaleYanit {
  id: string
  verified: boolean
  karantina: boolean
  difficulty: string | null
  kazanimId: number | null
  denetimYazildi: boolean
}

export interface UretimTetikYanit {
  taskId: string
  kazanimId: number
  kazanimBaslik: string
  difficulty: string | null
  adet: number
  denetimYazildi: boolean
}

// ─────────────────────────── YÖNETİM: OPS (0025) ───────────────────────────

export interface EsikDegisYanit {
  subject: string
  onceki: number | null
  yeni: number
  denetimYazildi: boolean
}

export interface EvalTetikYanit {
  taskId: string
  denetimYazildi: boolean
}

export interface OnbellekDusYanit {
  panel: number
  kimlik: number
  sinif: number
  redis: number
  denetimYazildi: boolean
}

export interface GorevIptalYanit {
  id: string
  oncekiDurum: string
  yeniDurum: 'FAILED'
  denetimYazildi: boolean
}
