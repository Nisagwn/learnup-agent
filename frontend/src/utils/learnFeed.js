// ============================================================
// Learn akıllı öneri feed'i — SAF + DETERMİNİSTİK üretici
// ============================================================
// Backend/Firestore çağrısı YAPMAZ. Girdiler UserStatsContext'in
// mevcut verisinden gelir. 8 kart tipi, öncelik (priority) DESC sıralı.
// ============================================================

const HOUR = 3600e3;
const DAY = 24 * HOUR;

const isoDay = (ms) => {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// Web'de havuz boyutu bilinmediğinden katalog sabit (TR ders adları, LessonsPage ile aynı).
export const SUBJECTS_CATALOG = [
  { key: 'Matematik', count: 8 },
  { key: 'Fizik', count: 7 },
  { key: 'Kimya', count: 6 },
  { key: 'Biyoloji', count: 6 },
  { key: 'Edebiyat', count: 5 },
  { key: 'Coğrafya', count: 5 },
  { key: 'Din Kültürü', count: 4 },
  { key: 'Felsefe', count: 4 },
];

/**
 * @param {object} inputs  { masteryScores, lastSolvedBySubject, weakSubTopicBySubject,
 *                           subjectsCatalog, gamification, srsDueCount, lastMockExamAtMs }
 * @param {number} now     ms
 * @param {string[]} dismissedIds  geçerli (expired olmayan) dismiss id'leri
 * @returns {Array<{id,type,priority,...}>}
 */
export function buildLearnFeed(inputs, now = Date.now(), dismissedIds = []) {
  const {
    masteryScores = {},
    lastSolvedBySubject = {},
    weakSubTopicBySubject = {},
    subjectsCatalog = SUBJECTS_CATALOG,
    gamification = null,
    srsDueCount = 0,
    lastMockExamAtMs = 0,
  } = inputs || {};

  const today = isoDay(now);
  const items = [];

  // 1) today_goal (pri 100) — subject_solve görevinde progress<target
  const quests = gamification?.dailyQuests?.quests || [];
  const subjQuest = quests.find(
    (q) => q.type === 'subject_solve' && q.subject && Number(q.target) > 0 && Number(q.progress) < Number(q.target)
  );
  if (subjQuest) {
    items.push({
      id: `today_goal:${subjQuest.subject}`, type: 'today_goal', priority: 100,
      subject: subjQuest.subject, progress: subjQuest.progress, target: subjQuest.target,
    });
  }

  // 2) review_due (pri 95*min(1, due/10))
  if (srsDueCount > 0) {
    items.push({ id: 'review_due', type: 'review_due', priority: 95 * Math.min(1, srsDueCount / 10), count: srsDueCount });
  }

  // 3) continue (pri 90) — en son çözülen ders < 24sa önce
  let latestSubj = null, latestMs = 0;
  for (const [s, ms] of Object.entries(lastSolvedBySubject)) {
    if (ms > latestMs) { latestMs = ms; latestSubj = s; }
  }
  if (latestSubj && (now - latestMs) < DAY) {
    const weak = weakSubTopicBySubject[latestSubj];
    items.push({ id: `continue:${latestSubj}`, type: 'continue', priority: 90, subject: latestSubj, subTopic: weak?.subTopic || null });
  }

  // 4) streak_at_risk (pri 85) — seri var, bugün aktif değil, saat>=18
  const streak = gamification?.streak || {};
  if (Number(streak.count) > 0 && streak.lastActiveDate !== today && new Date(now).getHours() >= 18) {
    items.push({ id: 'streak_at_risk', type: 'streak_at_risk', priority: 85, currentStreak: streak.count });
  }

  // 5) streak_milestone (pri 75) — bugün aktif, (count+1) ∈ {7,30,100}
  if (Number(streak.count) > 0 && streak.lastActiveDate === today && [7, 30, 100].includes(Number(streak.count) + 1)) {
    items.push({ id: 'streak_milestone', type: 'streak_milestone', priority: 75, nextDay: Number(streak.count) + 1 });
  }

  // 6) weak_topic (pri 70) — wrongCount>=3 olan EN YÜKSEK 1 tane
  let bestWeak = null;
  for (const [subj, w] of Object.entries(weakSubTopicBySubject)) {
    if (w && Number(w.wrongCount) >= 3) {
      if (!bestWeak || w.wrongCount > bestWeak.wrongCount) bestWeak = { subject: subj, subTopic: w.subTopic, wrongCount: w.wrongCount };
    }
  }
  if (bestWeak) {
    items.push({ id: `weak_topic:${bestWeak.subject}:${bestWeak.subTopic}`, type: 'weak_topic', priority: 70, ...bestWeak });
  }

  // 7) new_subject (pri 50) — hiç çözülmemiş, en büyük havuzlu ders
  const unsolved = (subjectsCatalog || []).filter((c) => !(Number(masteryScores[c.key]?.solved_count) > 0));
  if (unsolved.length) {
    unsolved.sort((a, b) => (b.count || 0) - (a.count || 0));
    items.push({ id: `new_subject:${unsolved[0].key}`, type: 'new_subject', priority: 50, subject: unsolved[0].key });
  }

  // 8) mock_exam (pri 40) — son mock>7gün & en az 1 ders solved>=10
  if ((now - (lastMockExamAtMs || 0)) > 7 * DAY) {
    const eligible = Object.entries(masteryScores)
      .filter(([, m]) => Number(m.solved_count) >= 10)
      .sort((a, b) => b[1].solved_count - a[1].solved_count);
    if (eligible.length) {
      items.push({ id: `mock_exam:${eligible[0][0]}`, type: 'mock_exam', priority: 40, subject: eligible[0][0] });
    }
  }

  const dismissed = new Set(dismissedIds || []);
  return items.filter((it) => !dismissed.has(it.id)).sort((a, b) => b.priority - a.priority);
}
