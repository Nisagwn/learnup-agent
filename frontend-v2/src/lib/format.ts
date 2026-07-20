// Ekranlarda tekrarlayan küçük biçimleyiciler.

export function selam(): string {
  const h = new Date().getHours()
  if (h < 6) return 'İyi geceler'
  if (h < 12) return 'Günaydın'
  if (h < 18) return 'Merhaba'
  return 'İyi akşamlar'
}

export function vardiya(): string {
  const h = new Date().getHours()
  return h < 6 || h >= 19 ? 'Gece vardiyası' : h < 12 ? 'Sabah vardiyası' : 'Gündüz vardiyası'
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
