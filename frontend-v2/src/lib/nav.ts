import type { IconName } from '../ui'
import type { Rol } from './rol'

export type NavOgesi = { to: string; label: string; icon: IconName; end?: boolean }

/**
 * NAVİGASYON — role göre KAPSAMLI, eklemeli değil.
 *
 * Öğretmen /harita, /bahce, /rota görmez: bunlar öğretmen hesabında VERİSİ OLMAYAN
 * kişisel bilişsel röntgen ekranları. Üç rolün sekmelerini birleştirmek 16 sekmelik
 * bir nav üretirdi; kapsamlı setler her rolü kendi işine odaklar.
 *
 * ÇIKMIŞ SORULAR ARAYÜZDEN KALDIRILDI (2026-07-22 telif kararı — GOREV-015): ÖSYM çıkmışları
 * kullanıcı yüzünde YAYINLANMAZ. Öğrenci pratiği yalnız adaptif AI: Genel Bakış/Plan/Koç → "Çöz".
 * (Arsiv.tsx dosyası korunur — lisans gelirse raftan iner; sunucu ucu kapatma GOREV-016.)
 */
export const NAV_OGRENCI: NavOgesi[] = [
  { to: '/', label: 'Genel Bakış', icon: 'today', end: true },
  // Konular: ders → konu seçerek çözme (0026). Adaptif akış (Genel Bakış → "Çöz") BİRİNCİL
  // kalır; bu ekran öğrencinin kendi seçtiği konuya gitmesi için ikinci yoldur.
  { to: '/konular', label: 'Konular', icon: 'book' },
  { to: '/harita', label: 'Analizler', icon: 'scan' },
  { to: '/rota', label: 'Çalışma Planı', icon: 'route' },
  { to: '/kaptan', label: 'Koç', icon: 'anchor' },
  { to: '/bahce', label: 'Bahçem', icon: 'sprout' },
  { to: '/ben', label: 'Profil', icon: 'chart' },
]

export const NAV_OGRETMEN: NavOgesi[] = [
  { to: '/sinif', label: 'Sınıf', icon: 'waves', end: true },
  { to: '/sinif/isi', label: 'Isı Haritası', icon: 'scan' },
  { to: '/sinif/odev', label: 'Ödev Atölyesi', icon: 'book' },
  { to: '/sinif/karsilastir', label: 'Karşılaştır', icon: 'gauge' },
  // Profil = 'chart' — öğrenci navıyla aynı ikon, aynı yer (NAV_OGRENCI son sekmesi).
  { to: '/ben', label: 'Profil', icon: 'chart' },
]

/**
 * Yönetim navı — üç grup: KİŞİLER · İÇERİK · SİSTEM.
 *
 * ⚠️ Profil sekmesi YOK: `/ben` öğrencinin kişisel ekranıdır (rozetler, lig,
 * günlük görevler, bahçe ekonomisi). Yöneticide bu verilerin hiçbiri yok; sekme
 * boş bir öğrenci profiline götürüyordu. Yöneticinin kendi hesabı /kule/ayarlar'da.
 *
 * ⚠️ SINIF SEKMELERİ HÂLÂ BURADA DEĞİL — ama artık gerekçe değişti. Eskiden admin
 * /teacher/* uçlarından 403 alıyordu; 0025'ten sonra girebiliyor, fakat KAPSAM
 * SEÇEREK (?ogretmenId). Kapsamsız bir "/sinif" sekmesi yöneticiyi "önce sınıf seç"
 * ekranına düşürürdü. Doğru giriş noktası Sınıflar ekranıdır; sınıf içi gezinme
 * orada başlar ve VekilSerit ile sürer.
 */
export const NAV_YONETIM: NavOgesi[] = [
  { to: '/kule', label: 'Yönetim', icon: 'anchor', end: true },
  { to: '/kule/kullanicilar', label: 'Kullanıcılar', icon: 'waves' },
  { to: '/kule/siniflar', label: 'Sınıflar', icon: 'sprout' },
  { to: '/kule/havuz', label: 'Soru Havuzu', icon: 'seal' },
  { to: '/kule/ozgunluk', label: 'Özgünlük', icon: 'shield' },
  { to: '/kule/denetim', label: 'Denetim', icon: 'book' },
  { to: '/kule/ayarlar', label: 'Ayarlar', icon: 'gauge' },
]

export const NAV_ROL: Record<Rol, NavOgesi[]> = {
  student: NAV_OGRENCI,
  teacher: NAV_OGRETMEN,
  admin: NAV_YONETIM,
}

/**
 * Nav ayracı indeksi — ilgili indeksten ÖNCE ince bir çizgi çizilir.
 *
 * Yönetim navı 0025'te 4→7 sekmeye çıktı ve üç işe ayrıldı: KİŞİLER (Yönetim ·
 * Kullanıcılar · Sınıflar) | İÇERİK (Soru Havuzu · Özgünlük) | SİSTEM (Denetim ·
 * Ayarlar). Tek ayraç çizilebildiği için içerik grubunun başına konur — yedi sekmeyi
 * ayraçsız bırakmak nav'ı okunmaz bir şerit yapardı.
 */
export const NAV_AYRAC: Record<Rol, number> = { student: -1, teacher: -1, admin: 3 }

const BASLIKLAR: Record<string, string> = {
  '/': 'Genel Bakış',
  '/harita': 'Analizler',
  '/rota': 'Çalışma Planı',
  '/kaptan': 'Koç',
  '/bahce': 'Bahçem',
  '/odevler': 'Ödevler',
  '/ben': 'Profil',
  '/coz': 'Çöz',
  // ── Öğretmen ──
  '/sinif': 'Sınıf Panosu',
  '/sinif/isi': 'Kazanım Isı Haritası',
  '/sinif/odev': 'Ödev Atölyesi',
  '/sinif/karsilastir': 'Öğrenci Karşılaştırma',
  // ── Yönetim ──
  '/kule': 'Yönetim — Sistem Sağlığı',
  '/kule/kullanicilar': 'Kullanıcılar',
  '/kule/siniflar': 'Sınıflar',
  '/kule/havuz': 'Soru Havuzu',
  '/kule/ozgunluk': 'Özgünlük Denetimi',
  '/kule/denetim': 'Denetim Defteri',
  '/kule/ayarlar': 'Ayarlar',
}

/** Dinamik segmentli rotaların (/sinif/ogrenci/:id) statik girdisi olamaz → önek eşleşmesi. */
const ONEK: Array<[string, string]> = [['/sinif/ogrenci/', 'Öğrenci Röntgeni']]

export function baslikBul(pathname: string): string | undefined {
  return BASLIKLAR[pathname] ?? ONEK.find(([p]) => pathname.startsWith(p))?.[1]
}
