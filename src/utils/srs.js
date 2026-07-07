// ============================================================
// SRS (Aralıklı Tekrar) — CLIENT yardımcıları
// ============================================================
// OTORİTE: Projede DEPLOYED olan backend (mobil reponun yazdığı
// recordAnswer/submitAnswer). srs_cards dokümanlarındaki `box` ve
// `nextReviewAtMs` alanlarını YALNIZCA backend yazar.
//
// Bu modül SALT OKUMA içindir: box/nextReviewAtMs'i YENİDEN HESAPLAMAZ
// ve Firestore'a YAZMAZ. Buradaki aralık tablosu yalnızca görüntüleme
// ("sonraki tekrar ~X sonra") ve kategori etiketleme amaçlıdır; due
// kararı her zaman kartın KENDİ nextReviewAtMs alanından verilir.
//
// Backend kuralı (buna birebir uyar):
//   box 0 → 0           (yeni / yanlış — hemen)
//   box 1 → 1 SAAT
//   box 2 → 1 GÜN
//   box 3 → 3 GÜN
//   box 4 → 7 GÜN
//   "Öğrenildi" tazeleme (box >= 4) → 30 GÜN
//   MAX box = 4 · doğru → box=min(4,box+1) · yanlış → box=0
// ============================================================

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const MAX_BOX = 4;

// Kutu → sonraki tekrara kalan süre (ms). Yalnızca referans/görüntüleme.
export const BOX_INTERVALS_MS = {
  0: 0,
  1: 1 * HOUR_MS,
  2: 1 * DAY_MS,
  3: 3 * DAY_MS,
  4: 7 * DAY_MS,
};

// box >= MAX_BOX ("öğrenildi") için tazeleme aralığı.
export const LEARNED_REFRESH_MS = 30 * DAY_MS;

// SRS kategorileri (backend box'ına göre).
export const SRS_CATEGORY = {
  NEW: 'new',
  REVIEW: 'review',
  LEARNED: 'learned',
};

export const CATEGORY_META = {
  [SRS_CATEGORY.NEW]: { key: SRS_CATEGORY.NEW, label: 'Yeni', emoji: '🆕' },
  [SRS_CATEGORY.REVIEW]: { key: SRS_CATEGORY.REVIEW, label: 'Tekrar', emoji: '🔁' },
  [SRS_CATEGORY.LEARNED]: { key: SRS_CATEGORY.LEARNED, label: 'Öğrenildi', emoji: '✅' },
};

// box değerini güvenli tamsayıya indir (0..MAX_BOX dışını sınırla).
export function clampBox(box) {
  const n = Number.isFinite(box) ? Math.trunc(box) : 0;
  return Math.max(0, Math.min(MAX_BOX, n));
}

// Backend kuralına göre kategori:
//   box === 0          → Yeni
//   box 1, 2, 3        → Tekrar
//   box >= MAX_BOX (4) → Öğrenildi
export function categorizeBox(box) {
  const b = clampBox(box);
  if (b >= MAX_BOX) return SRS_CATEGORY.LEARNED;
  if (b <= 0) return SRS_CATEGORY.NEW;
  return SRS_CATEGORY.REVIEW;
}

// Kartın nextReviewAtMs değerini ms cinsinden, esnek biçimde oku.
// Backend `nextReviewAtMs` (ms sayı) yazar; eski/alternatif `nextReviewAt`
// (Firestore Timestamp | Date | ISO) biçimleri de tolere edilir.
// Hiç değer yoksa null döner. ASLA yeniden hesaplamaz.
export function getNextReviewMs(card) {
  if (!card) return null;
  const ms = card.nextReviewAtMs;
  if (typeof ms === 'number' && Number.isFinite(ms)) return ms;

  const raw = card.nextReviewAt;
  if (raw == null) return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw?.toMillis === 'function') return raw.toMillis(); // Firestore Timestamp
  if (typeof raw?.seconds === 'number') return raw.seconds * 1000; // ham Timestamp
  if (raw instanceof Date) return raw.getTime();
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? null : parsed;
}

// Kart tekrar vakti geldi mi? Karar KARTIN KENDİ nextReviewAtMs'ine göre.
// Değer yoksa (yeni kart) due kabul edilir.
export function isDue(card, now = Date.now()) {
  const t = getNextReviewMs(card);
  if (t == null) return true;
  return t <= now;
}

// Tekrara kalan süre (ms). Negatif/null ise 0 (geçmiş = şimdi).
export function msUntilReview(card, now = Date.now()) {
  const t = getNextReviewMs(card);
  if (t == null) return 0;
  return Math.max(0, t - now);
}

// "~2 saat", "~3 gün", "~45 dakika" gibi Türkçe göreli süre.
export function formatRelativeMs(ms) {
  if (!ms || ms <= 0) return 'şimdi';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `~${Math.max(1, mins)} dakika`;
  const hours = Math.round(ms / HOUR_MS);
  if (hours < 24) return `~${hours} saat`;
  const days = Math.round(ms / DAY_MS);
  return `~${days} gün`;
}

// Kart için kullanıcıya gösterilecek tekrar etiketi.
// Due ise "Şimdi tekrar", değilse "Sonraki tekrar ~X sonra".
export function formatNextReview(card, now = Date.now()) {
  if (isDue(card, now)) return 'Şimdi tekrar';
  return `Sonraki tekrar ${formatRelativeMs(msUntilReview(card, now))} sonra`;
}

// Kartın lastReviewedAt değerini ms cinsinden, esnek biçimde oku (sıralama için).
// Backend `lastReviewedAtMs` (ms) veya `lastReviewedAt` (Timestamp/Date/ISO). Yoksa null.
export function getLastReviewedMs(card) {
  if (!card) return null;
  const ms = card.lastReviewedAtMs;
  if (typeof ms === 'number' && Number.isFinite(ms)) return ms;
  const raw = card.lastReviewedAt;
  if (raw == null) return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw?.toMillis === 'function') return raw.toMillis();
  if (typeof raw?.seconds === 'number') return raw.seconds * 1000;
  if (raw instanceof Date) return raw.getTime();
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? null : parsed;
}

// Kart kategorisi (box bazlı; kart nesnesi alır). categorizeBox sarmalı.
export function categorizeCard(card) {
  return categorizeBox(card?.box);
}

// Kartları alt-konuya göre grupla. key = sub_topic || subject || 'Genel'.
// Çıktı [{ subTopic, subject, cards }] — kart sayısı çok olan grup önce (DESC).
export function groupBySubTopic(cards) {
  const map = new Map();
  for (const c of cards || []) {
    const key = c?.sub_topic || c?.subject || 'Genel';
    if (!map.has(key)) map.set(key, { subTopic: key, subject: c?.subject || 'Genel', cards: [] });
    map.get(key).cards.push(c);
  }
  return [...map.values()].sort((a, b) => b.cards.length - a.cards.length);
}

// Tekrar için "en kritik" kartları seç (snapshot'lı + 'learned' hariç).
// Sıra: catScore ASC (review=0, new=1) → nextReviewAtMs ASC → lastReviewedAtMs ASC.
export function pickTopForRetake(cards, _nowMs = Date.now(), limit = 10) {
  const scored = [];
  for (const c of cards || []) {
    const snap = c?.snapshot;
    const hasSnap = snap?.question && Array.isArray(snap.choices) && snap.choices.length > 0;
    if (!hasSnap) continue;
    const cat = categorizeBox(c.box);
    if (cat === SRS_CATEGORY.LEARNED) continue; // öğrenilenleri ele
    const catScore = cat === SRS_CATEGORY.REVIEW ? 0 : 1; // new = 1
    scored.push({
      card: c,
      catScore,
      next: getNextReviewMs(c) ?? 0,
      last: getLastReviewedMs(c) ?? 0,
    });
  }
  scored.sort((a, b) => {
    if (a.catScore !== b.catScore) return a.catScore - b.catScore;
    if (a.next !== b.next) return a.next - b.next;
    return a.last - b.last;
  });
  return scored.slice(0, limit).map((s) => s.card);
}
