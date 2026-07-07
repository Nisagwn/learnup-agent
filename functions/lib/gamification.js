// Oyunlaştırma yardımcıları — saf modül (Firebase importu yok), sunucu tarafında kullanılır.
// Tarih/hafta hesapları, seri (streak) mantığı ve XP sabitleri burada toplanır.

// ─── XP ─────────────────────────────────────────────────────────────────────
const XP = {
  CORRECT: 10,         // doğru cevap temel XP
  FIRST_TRY_BONUS: 5,  // ilk denemede doğru ek XP
  WRONG: 2,            // yanlış cevap (katılım)
  SKIP: 0,             // boş bırakma
};

/** Bir cevabın kazandırdığı XP'yi hesaplar. */
function xpForAnswer({ isCorrect, isSkipped, attemptNumber }) {
  if (isSkipped) return XP.SKIP;
  if (isCorrect) return XP.CORRECT + (Number(attemptNumber) === 1 ? XP.FIRST_TRY_BONUS : 0);
  return XP.WRONG;
}

// ─── TARİH ──────────────────────────────────────────────────────────────────
/** Yerel tarihi 'YYYY-MM-DD' biçiminde döndürür. */
function todayISO(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** İki 'YYYY-MM-DD' tarih arasındaki tam gün farkı (b - a). */
function daysBetween(isoA, isoB) {
  if (!isoA || !isoB) return Infinity;
  const a = new Date(isoA + 'T00:00:00');
  const b = new Date(isoB + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}

/** ISO hafta kimliği: '2026-W21'. Lig dönemlerini adlandırmak için kullanılır. */
function getWeekId(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // Perşembe'ye kaydır (ISO 8601: hafta perşembesi yılı belirler)
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

// ─── SERİ (STREAK) ──────────────────────────────────────────────────────────
const STREAK_MILESTONES = [7, 30, 100];
const MAX_FREEZES = 2;
const FREEZE_EARN_EVERY = 7; // her 7 günde +1 dondurma

/**
 * Bir aktivite gününe göre seriyi tembel olarak günceller.
 * @param {object} streak  - { count, longest, lastActiveDate, freezesAvailable }
 * @param {string} today   - 'YYYY-MM-DD'
 * @returns {{ streak, milestone:number|null, freezeUsed:boolean, freezeEarned:boolean,
 *             continued:boolean }}
 */
function applyStreak(streak, today) {
  const s = {
    count: Number(streak?.count) || 0,
    longest: Number(streak?.longest) || 0,
    lastActiveDate: streak?.lastActiveDate || null,
    freezesAvailable: Number(streak?.freezesAvailable) || 0,
    freezeUsedDates: Array.isArray(streak?.freezeUsedDates) ? streak.freezeUsedDates : [],
  };

  const gap = s.lastActiveDate ? daysBetween(s.lastActiveDate, today) : null;
  let milestone = null;
  let freezeUsed = false;
  let freezeEarned = false;

  if (gap === 0) {
    // Bugün zaten aktifti — sayaç değişmez
    return { streak: s, milestone, freezeUsed, freezeEarned, continued: false };
  }

  const prevCount = s.count;

  if (gap === null || gap === 1) {
    // İlk gün ya da kesintisiz ertesi gün
    s.count = gap === 1 ? s.count + 1 : 1;
  } else {
    // Bir veya daha fazla gün kaçırıldı
    const missed = gap - 1;
    if (missed === 1 && s.freezesAvailable > 0) {
      // Tek günlük boşluğu dondurma kapatır — seri korunur
      s.freezesAvailable -= 1;
      s.freezeUsedDates = [...s.freezeUsedDates, today].slice(-10);
      s.count = s.count + 1;
      freezeUsed = true;
    } else {
      // Seri kırıldı
      s.count = 1;
    }
  }

  s.lastActiveDate = today;
  if (s.count > s.longest) s.longest = s.count;

  // Kilometre taşı (yalnızca yeni ulaşıldığında)
  if (s.count > prevCount && STREAK_MILESTONES.includes(s.count)) {
    milestone = s.count;
  }

  // Dondurma kazanımı: her 7 günlük eşikte +1 (üst sınıra kadar)
  if (s.count > prevCount && s.count % FREEZE_EARN_EVERY === 0 && s.freezesAvailable < MAX_FREEZES) {
    s.freezesAvailable += 1;
    freezeEarned = true;
  }

  return { streak: s, milestone, freezeUsed, freezeEarned, continued: true };
}

module.exports = {
  XP,
  xpForAnswer,
  todayISO,
  daysBetween,
  getWeekId,
  applyStreak,
  STREAK_MILESTONES,
  MAX_FREEZES,
};
