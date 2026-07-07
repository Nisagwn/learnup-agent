// src/utils/levelSystem.js
// Her iki sayfada (Statistics + SettingsPage) aynı yerden import edilir

export const LEVELS = [
  {
    level: 1,
    name: 'Meraklı',
    emoji: '🌱',
    min: 0,
    max: 4,
    color: '#639922',
    barColor: '#97C459',
    glow: 'rgba(99, 153, 34, 0.35)',
    desc: 'Yolculuğun henüz başında, öğrenmeye aç bir zihin!',
  },
  {
    level: 2,
    name: 'Kaşif',
    emoji: '🧭',
    min: 5,
    max: 14,
    color: '#185FA5',
    barColor: '#378ADD',
    glow: 'rgba(24, 95, 165, 0.35)',
    desc: 'Soruların peşinden giden, keşfetmeyi seven bir akıl!',
  },
  {
    level: 3,
    name: 'Savaşçı',
    emoji: '⚔️',
    min: 15,
    max: 29,
    color: '#BA7517',
    barColor: '#EF9F27',
    glow: 'rgba(186, 117, 23, 0.35)',
    desc: 'Zorluklarla mücadele eden, pes etmeyen bir savaşçı!',
  },
  {
    level: 4,
    name: 'Bilge',
    emoji: '📚',
    min: 30,
    max: 59,
    color: '#534AB7',
    barColor: '#7F77DD',
    glow: 'rgba(83, 74, 183, 0.35)',
    desc: 'Derin bilgiyle donanmış, anlayan ve anlatan bir bilge!',
  },
  {
    level: 5,
    name: 'Uzman',
    emoji: '🎯',
    min: 60,
    max: 99,
    color: '#0F6E56',
    barColor: '#1D9E75',
    glow: 'rgba(15, 110, 86, 0.35)',
    desc: 'Konulara hakim, doğruyu bulan keskin bir uzman!',
  },
  {
    level: 6,
    name: 'Şampiyon',
    emoji: '🏆',
    min: 100,
    max: 149,
    color: '#993556',
    barColor: '#D4537E',
    glow: 'rgba(153, 53, 86, 0.35)',
    desc: 'Rekabette öne çıkan, başarıyı alışkanlık haline getiren!',
  },
  {
    level: 7,
    name: 'Efsane',
    emoji: '👑',
    min: 150,
    max: 199,
    color: '#3C3489',
    barColor: '#534AB7',
    glow: 'rgba(60, 52, 137, 0.35)',
    desc: 'Adından söz ettiren, efsaneleşen bir öğrenci!',
  },
  {
    level: 8,
    name: 'İlluminati',
    emoji: '✨',
    min: 200,
    max: Infinity,
    color: '#2C2C2A',
    barColor: '#888780',
    glow: 'rgba(44, 44, 42, 0.35)',
    desc: 'Bilginin sınırlarını zorlayan, ötesine geçen!',
  },
];

/**
 * Doğru cevap sayısına göre seviye bilgisini döndürür.
 * @param {number} correctAnswers
 * @returns {{ levelData: object, index: number, progress: number, toNext: number }}
 */
export function getLevelInfo(correctAnswers) {
  const correct = Math.max(0, correctAnswers || 0);
  const index = LEVELS.findIndex(l => correct >= l.min && correct <= l.max);
  const safeIndex = index === -1 ? LEVELS.length - 1 : index;
  const levelData = LEVELS[safeIndex];
  const nextLevel = LEVELS[safeIndex + 1];

  const progress = nextLevel
    ? Math.round(((correct - levelData.min) / (nextLevel.min - levelData.min)) * 100)
    : 100;

  const toNext = nextLevel ? nextLevel.min - correct : 0;

  return { levelData, index: safeIndex, progress, toNext };
}
