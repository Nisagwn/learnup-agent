// Sıralama (leaderboard) için madalya rengi/ikonu üretir.

/**
 * @param {number} rank - 1 tabanlı sıralama
 * @returns {{ bg: string, border: string, color: string, icon: string|null }}
 */
export function getRankStyle(rank) {
  if (rank === 1) return { bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.4)', color: '#FBBF24', icon: '🥇' };
  if (rank === 2) return { bg: 'rgba(148,163,184,0.12)', border: 'rgba(148,163,184,0.4)', color: '#94A3B8', icon: '🥈' };
  if (rank === 3) return { bg: 'rgba(180,120,60,0.12)', border: 'rgba(180,120,60,0.4)', color: '#CD7C3A', icon: '🥉' };
  return { bg: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.07)', color: '#64748B', icon: null };
}

/** Sıralamaya göre madalya emojisi (ilk 3 dışında verilen fallback). */
export const rankMedal = (rank, fallback = '🎯') =>
  rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : fallback;
