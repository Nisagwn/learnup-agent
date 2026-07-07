// Rozet kataloğu — sunucu tarafı otorite kopyası.
// src/utils/badges.js ile AYNI tutulmalı (biri gösterim, biri doğrulama).
// snapshot: { streakDays, totalSolved, correctAnswers, level, masteryScores }

const BADGE_CATALOG = [
  // Seri
  { id: 'streak_3',   group: 'streak', name: 'Isınma Turu',       emoji: '🔥', check: s => (s.streakDays || 0) >= 3 },
  { id: 'streak_7',   group: 'streak', name: 'Haftalık İstikrar', emoji: '🔥', check: s => (s.streakDays || 0) >= 7 },
  { id: 'streak_30',  group: 'streak', name: 'Vazgeçmeyen',       emoji: '⚡', check: s => (s.streakDays || 0) >= 30 },
  { id: 'streak_100', group: 'streak', name: 'Alev Ustası',       emoji: '☄️', check: s => (s.streakDays || 0) >= 100 },
  // Çözüm hacmi
  { id: 'solved_25',  group: 'volume', name: 'İlk Adımlar',      emoji: '✏️', check: s => (s.totalSolved || 0) >= 25 },
  { id: 'solved_100', group: 'volume', name: 'Çalışkan',         emoji: '📘', check: s => (s.totalSolved || 0) >= 100 },
  { id: 'solved_500', group: 'volume', name: 'Maraton Koşucusu', emoji: '🏃', check: s => (s.totalSolved || 0) >= 500 },
  // Seviye
  { id: 'level_3', group: 'level', name: 'Savaşçı', emoji: '⚔️', check: s => (s.level || 1) >= 3 },
  { id: 'level_5', group: 'level', name: 'Uzman',   emoji: '🎯', check: s => (s.level || 1) >= 5 },
  { id: 'level_8', group: 'level', name: 'Efsane',  emoji: '✨', check: s => (s.level || 1) >= 8 },
  // Ustalık
  { id: 'mastery_80',  group: 'mastery', name: 'Konu Hakimi', emoji: '🧠', check: s => Object.values(s.masteryScores || {}).some(m => (m?.score || 0) >= 80) },
  { id: 'mastery_100', group: 'mastery', name: 'Kusursuz',    emoji: '👑', check: s => Object.values(s.masteryScores || {}).some(m => (m?.score || 0) >= 100) },
];

/** snapshot'a göre kazanılmış rozet id'lerini döndürür. */
function evaluateBadges(snapshot) {
  return BADGE_CATALOG
    .filter(b => { try { return !!b.check(snapshot); } catch { return false; } })
    .map(b => b.id);
}

function getBadgeById(id) {
  return BADGE_CATALOG.find(b => b.id === id) || null;
}

module.exports = { BADGE_CATALOG, evaluateBadges, getBadgeById };
