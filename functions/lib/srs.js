// Aralıklı tekrar (SRS / Leitner) yardımcıları — saf modül (Firebase importu yok).
// Kart kutuları (box) 0..5; box 0 = "hemen tekrar". Doğru cevap kutuyu yükseltir,
// yanlış cevap sıfırlar. nextReviewAt, kutu aralığına göre hesaplanır.

const SRS_INTERVALS_DAYS = [0, 1, 3, 7, 16, 35]; // index == box
const MAX_BOX = SRS_INTERVALS_DAYS.length - 1; // 5
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * applySrsAnswer — önceki kart durumuna bir cevabı uygular.
 * @param {Object|null} prevCard  { box, consecutiveCorrect, totalAttempts }
 * @param {Object} ctx  { isCorrect:boolean, now:number(ms) }
 * @returns {Object} { box, consecutiveCorrect, totalAttempts, nextReviewAtMs, lastReviewedAtMs }
 */
function applySrsAnswer(prevCard, { isCorrect, now }) {
  const prev = prevCard || {};
  const prevBox = Number.isInteger(prev.box) ? prev.box : 0;
  const prevConsec = Number(prev.consecutiveCorrect) || 0;
  const totalAttempts = (Number(prev.totalAttempts) || 0) + 1;

  let box;
  let consecutiveCorrect;
  if (isCorrect) {
    box = Math.min(MAX_BOX, prevBox + 1);
    consecutiveCorrect = prevConsec + 1;
  } else {
    box = 0;
    consecutiveCorrect = 0;
  }

  const nextReviewAtMs = now + SRS_INTERVALS_DAYS[box] * DAY_MS;
  return { box, consecutiveCorrect, totalAttempts, nextReviewAtMs, lastReviewedAtMs: now };
}

module.exports = { SRS_INTERVALS_DAYS, MAX_BOX, applySrsAnswer };
