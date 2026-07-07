// Günlük görev (quest) kataloğu ve değerlendirme — sunucu tarafı.
// src/utils/quests.js ile AYNI şablonlar tutulmalı (biri gösterim, biri otorite).

// Her şablon: id, type, emoji, başlık üreteci, hedef aralığı, ödül XP.
const QUEST_TEMPLATES = [
  {
    id: 'solve',
    type: 'solve_count',
    emoji: '📝',
    title: (t) => `${t} soru çöz`,
    targets: [5, 10, 15],
    rewardXP: 20,
  },
  {
    id: 'correct',
    type: 'correct_count',
    emoji: '✅',
    title: (t) => `${t} soruyu doğru yanıtla`,
    targets: [3, 5, 8],
    rewardXP: 30,
  },
  {
    id: 'first_try',
    type: 'first_try_correct',
    emoji: '🎯',
    title: (t) => `${t} soruyu hatasız çöz`,
    targets: [2, 3, 5],
    rewardXP: 40,
  },
  {
    id: 'subject',
    type: 'subject_solve',
    emoji: '📚',
    title: (t, subject) => `${subject} dersinde ${t} soru çöz`,
    targets: [4, 6, 8],
    rewardXP: 35,
    needsSubject: true,
  },
  {
    id: 'streak',
    type: 'keep_streak',
    emoji: '🔥',
    title: () => 'Bugün çalışarak serini koru',
    targets: [1],
    rewardXP: 15,
  },
];

const SUBJECTS = ['Matematik', 'Fizik', 'Kimya', 'Biyoloji', 'Edebiyat', 'Coğrafya'];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Belirli bir gün için 3 rastgele görev üretir. */
function generateDailyQuests(dateIso) {
  const pool = [...QUEST_TEMPLATES];
  const chosen = [];
  while (chosen.length < 3 && pool.length > 0) {
    const idx = Math.floor(Math.random() * pool.length);
    chosen.push(pool.splice(idx, 1)[0]);
  }
  const quests = chosen.map((tpl, i) => {
    const target = pick(tpl.targets);
    const subject = tpl.needsSubject ? pick(SUBJECTS) : null;
    return {
      id: `${dateIso}-${tpl.id}-${i}`,
      templateId: tpl.id,
      type: tpl.type,
      emoji: tpl.emoji,
      title: tpl.title(target, subject),
      subject,
      target,
      progress: 0,
      rewardXP: tpl.rewardXP,
      claimed: false,
    };
  });
  return { date: dateIso, quests };
}

/**
 * Bir cevaba göre görev ilerlemelerini günceller (mutasyonsuz kopya döndürür).
 * @param {object} dailyQuests - { date, quests:[] }
 * @param {object} answer - { isCorrect, isSkipped, attemptNumber, subject }
 */
function applyAnswerToQuests(dailyQuests, answer) {
  if (!dailyQuests?.quests) return { dailyQuests, completedNow: [] };
  const { isCorrect, isSkipped, attemptNumber, subject } = answer;
  const solved = !isSkipped; // boş bırakma "çözme" sayılmaz
  const completedNow = [];

  const quests = dailyQuests.quests.map((q) => {
    if (q.progress >= q.target) return q;
    let inc = 0;
    switch (q.type) {
      case 'solve_count': inc = solved ? 1 : 0; break;
      case 'correct_count': inc = isCorrect ? 1 : 0; break;
      case 'first_try_correct': inc = isCorrect && Number(attemptNumber) === 1 ? 1 : 0; break;
      case 'subject_solve':
        inc = solved && subject && q.subject &&
          subject.toLowerCase() === q.subject.toLowerCase() ? 1 : 0;
        break;
      case 'keep_streak': inc = 1; break;
      default: inc = 0;
    }
    if (inc === 0) return q;
    const progress = Math.min(q.target, q.progress + inc);
    if (progress >= q.target && q.progress < q.target) completedNow.push(q.id);
    return { ...q, progress };
  });

  return { dailyQuests: { ...dailyQuests, quests }, completedNow };
}

module.exports = { QUEST_TEMPLATES, generateDailyQuests, applyAnswerToQuests };
