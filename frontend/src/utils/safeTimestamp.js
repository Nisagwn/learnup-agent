// Safe timestamp helpers for Supabase (timestamptz columns are ISO strings).
// Firestore'un serverTimestamp() sentinel'i yerine ISO string üretiriz;
// DB kolonları çoğunlukla default now() taşır, ama bir değer gerekiyorsa bunu kullan.

/** Yazma için: sunucu-zamanı yerine ISO string (Supabase timestamptz uyumlu). */
export function safeServerTimestamp() {
  return new Date().toISOString();
}

/**
 * Okuma için: Firestore Timestamp-benzeri değeri VEYA ISO string VEYA Date'i
 * güvenli şekilde JS Date'e çevirir. Değerler artık ISO string olduğu için
 * eski .toDate()/.toMillis() çağrılarının yerine kullanılabilir.
 */
export function safeTimestamp(value) {
  if (!value) return null;
  // Zaten Date
  if (value instanceof Date) return value;
  // Firestore Timestamp-benzeri (toDate metodu var)
  if (typeof value.toDate === 'function') {
    try { return value.toDate(); } catch { /* fall through */ }
  }
  // Firestore Timestamp-benzeri (seconds alanı var)
  if (typeof value.seconds === 'number') {
    return new Date(value.seconds * 1000);
  }
  // ISO string veya epoch ms
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

export default safeServerTimestamp;
