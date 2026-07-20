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
}

export interface AdminKullanicilarYaniti {
  users: AdminKullaniciSatiri[]
  total: number
  limit: number
  offset: number
  bekleyenOnay: number
}

// ─────────────────────── YÖNETİM: KULLANICI & DENETİM ───────────────────────
//
// ⚠️ Buradaki mutasyonlar GERİ ALINAMAZ sonuçlar üretir: rol değişimi RBAC'ı
// yeniden çizer, sınıf ataması iki öğretmenin analitiğini değiştirir. Bu yüzden
// her yanıt `denetimYazildi` taşır — iz tutulamadıysa UI bunu GÖSTERMEK zorunda.

export type YonetimEylemi = 'ogretmen_onay' | 'rol_degis' | 'sinif_ata' | 'gorev_yeniden'

export interface DenetimSatiri {
  id: number
  adminId: string
  adminAdi: string | null
  eylem: YonetimEylemi
  hedefId: string | null
  hedefTur: 'kullanici' | 'gorev' | null
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
}

export interface AdminKullaniciDetayi {
  kullanici: AdminKullaniciSatiri & { grade: string | null; studentClass: string | null }
  ogretmen: { id: string; name: string | null; classCode: string | null; school: string | null } | null
  sinif: { ogrenciSayisi: number; ogrenciler: Array<{ id: string; name: string | null }> } | null
  /** Hiç cevap kaydı YOKSA null — sıfır değil. */
  etkinlik: { toplamCevap: number; son7Gun: number; sonGorulme: string | null; takipEdilenKazanim: number } | null
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
