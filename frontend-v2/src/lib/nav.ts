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
 * AI ve ÖSYM AYRI: "Çıkmış Sorular" yalnız çıkmışları listeler; adaptif AI pratiği
 * Genel Bakış/Plan/Koç üzerinden "Çöz" akışına gider. İkisi asla aynı listede karışmaz.
 */
export const NAV_OGRENCI: NavOgesi[] = [
  { to: '/', label: 'Genel Bakış', icon: 'today', end: true },
  { to: '/harita', label: 'Analiz', icon: 'scan' },
  { to: '/rota', label: 'Çalışma Planı', icon: 'route' },
  { to: '/kaptan', label: 'Koç', icon: 'anchor' },
  { to: '/arsiv', label: 'Çıkmış Sorular', icon: 'seal' },
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
 * Yönetim navı — YALNIZ Kule sekmeleri.
 *
 * ⚠️ Profil sekmesi YOK: `/ben` öğrencinin kişisel ekranıdır (rozetler, lig,
 * günlük görevler, bahçe ekonomisi). Yöneticide bu verilerin hiçbiri yok;
 * sekme, boş bir öğrenci profiline götürüyordu.
 *
 * ⚠️ Sınıf sekmeleri de YOK: admin `/teacher/*` uçlarından 403 alır (yüzeyler
 * kasten ayrı). Tıklanınca "yetkin yok" gösteren sekme koymak, çalışmayan bir
 * özelliği menüde tutmaktır.
 */
export const NAV_YONETIM: NavOgesi[] = [
  { to: '/kule', label: 'Kule', icon: 'anchor', end: true },
  { to: '/kule/kullanicilar', label: 'Kullanıcılar', icon: 'waves' },
  { to: '/kule/havuz', label: 'Soru Havuzu', icon: 'seal' },
  { to: '/kule/ozgunluk', label: 'Özgünlük', icon: 'shield' },
]

export const NAV_ROL: Record<Rol, NavOgesi[]> = {
  student: NAV_OGRENCI,
  teacher: NAV_OGRETMEN,
  admin: NAV_YONETIM,
}

/**
 * Nav ayracı indeksi. Yönetim navı tek gruba indiği için artık hiçbir rolde
 * ayraç çizilmiyor (-1). Sabit korunuyor: gruplar geri gelirse tek yerden açılır.
 */
export const NAV_AYRAC: Record<Rol, number> = { student: -1, teacher: -1, admin: -1 }

const BASLIKLAR: Record<string, string> = {
  '/': 'Genel Bakış',
  '/harita': 'Analiz — Bilişsel Röntgen',
  '/rota': 'Çalışma Planı',
  '/kaptan': 'Koç',
  '/arsiv': 'Çıkmış Sorular',
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
  '/kule': 'Kule — Sistem Sağlığı',
  '/kule/kullanicilar': 'Kullanıcılar',
  '/kule/havuz': 'Soru Havuzu',
  '/kule/ozgunluk': 'Özgünlük Bariyeri',
}

/** Dinamik segmentli rotaların (/sinif/ogrenci/:id) statik girdisi olamaz → önek eşleşmesi. */
const ONEK: Array<[string, string]> = [['/sinif/ogrenci/', 'Öğrenci Röntgeni']]

export function baslikBul(pathname: string): string | undefined {
  return BASLIKLAR[pathname] ?? ONEK.find(([p]) => pathname.startsWith(p))?.[1]
}
