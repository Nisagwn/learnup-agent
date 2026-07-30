// Ekranlarda tekrarlayan küçük biçimleyiciler.

export function selam(): string {
  const h = new Date().getHours()
  if (h < 6) return 'İyi geceler'
  if (h < 12) return 'Günaydın'
  if (h < 18) return 'Merhaba'
  return 'İyi akşamlar'
}

/** 2340 → "2.340" (tr binlik). */
export function sayi(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '0'
  return Math.round(n).toLocaleString('tr-TR')
}

// Backend ders adı → ui.tsx SUBJECTS kısa anahtarı (renk/etiket için).
const DERS_ANAHTAR: Record<string, string> = {
  matematik: 'mat', mat: 'mat',
  geometri: 'geo', geo: 'geo',
  fizik: 'fiz', fiz: 'fiz',
  kimya: 'kim', kim: 'kim',
  biyoloji: 'bio', bio: 'bio',
  türkçe: 'trk', turkce: 'trk', trk: 'trk',
  edebiyat: 'trk',
  tarih: 'tar', tar: 'tar',
}

export function dersAnahtar(ad: string | null | undefined): string {
  if (!ad) return 'mat'
  const k = ad.toString().trim().toLowerCase()
  return DERS_ANAHTAR[k] ?? ad
}

export const ZORLUK_SAYI: Record<string, number> = { kolay: 2, orta: 3, zor: 5 }

/** difficulty (string|number) → 1..5 nokta seviyesi. */
export function zorlukSeviye(d: string | number | null | undefined): number {
  if (typeof d === 'number') return Math.max(1, Math.min(5, d))
  if (typeof d === 'string' && ZORLUK_SAYI[d]) return ZORLUK_SAYI[d]
  return 3
}

const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
export function tarihKisa(d = new Date()): string {
  return `${d.getDate()} ${AYLAR[d.getMonth()]}`
}

/** '2026-07-19' → '19 Tem'. Tarih-dışı etiketler (ör. ders adı) olduğu gibi döner.
    (GOREV-034: components/rontgen.tsx'ten AYNEN taşındı — DurtmeZili'nin bu yardımcı için
    recharts'lı rontgen modülünü eager çekmesi 383 kB vendor-charts'ı ilk boyaya sokuyordu.) */
const AY_KISA = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']
export const gunEtiketi = (iso: string): string => {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso
  const d = new Date(iso.slice(0, 10) + 'T12:00:00')
  return `${d.getDate()} ${AY_KISA[d.getMonth()]}`
}
