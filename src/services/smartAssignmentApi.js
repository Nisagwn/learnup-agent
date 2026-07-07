// ============================================================
// Akıllı Ödev — müfredat/zorluk filtreli havuz seçimi + AI fallback
// ============================================================
// SALT OKUMA sayım/seçim; AI yalnız saveAIQuestions ile (verified:false).
// ============================================================
import { db } from '../firebase';
import { collection, query, where, getCountFromServer } from 'firebase/firestore';
import { resolveSubject } from '../utils/subjects';
import { fetchQuestionPool, toSample, saveAIQuestions } from './questionPoolApi';
import { generateQuiz } from './aiService';

const ALL_GRADES = [9, 10, 11, 12];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const expandDifficulty = (d) => (d === 'mixed' ? ['easy', 'medium', 'hard'] : [d || 'medium']);

// topics→{topic}, subTopics→{subTopic} BİRLEŞİM (union, çapraz çarpım değil); ikisi de yoksa [{}]
export function resolveTopicFilters({ topics, subTopics } = {}) {
  const out = [];
  (topics || []).forEach((t) => { const v = String(t || '').trim(); if (v) out.push({ topic: v }); });
  (subTopics || []).forEach((s) => { const v = String(s || '').trim(); if (v) out.push({ subTopic: v }); });
  return out.length ? out : [{}];
}

const gradesOf = (filters) => (filters.grades && filters.grades.length ? filters.grades : ALL_GRADES);

// poolToRow: havuz dökümanı → seçim satırı
function poolToRow(q, combo = {}) {
  return {
    id: q.id,
    text: q.text || q.question || '',
    subject: q.subject || q.category || null,
    grade: q.grade || (combo.g != null ? String(combo.g) : null),
    difficulty: q.difficulty || combo.d || 'medium',
    isAI: false,
    options: Array.isArray(q.options) ? q.options : (q.choices || []),
    answer: q.correctAnswer ?? q.answer ?? null,
    explanation: q.explanation || '',
    verified: true,
    topic: q.topic || combo.tf?.topic || null,
    subTopic: q.sub_topic || combo.tf?.subTopic || null,
  };
}

// "Bu kriterlere N soru uyuyor" — her kombinasyon için getCountFromServer toplamı.
export async function countMatchingQuestions(filters) {
  const category = resolveSubject(filters.subject).category;
  const grades = gradesOf(filters);
  const diffs = expandDifficulty(filters.difficulty);
  const tfs = resolveTopicFilters(filters);
  let total = 0;
  for (const g of grades) {
    for (const diff of diffs) {
      for (const tf of tfs) {
        try {
          const cons = [
            where('category', '==', category),
            where('grade', '==', String(g)),
            where('verified', '==', true),
            where('difficulty', '==', diff),
          ];
          if (tf.topic) cons.push(where('topic', '==', tf.topic));
          if (tf.subTopic) cons.push(where('sub_topic', '==', tf.subTopic));
          const snap = await getCountFromServer(query(collection(db, 'questions'), ...cons));
          total += snap.data().count || 0;
        } catch (e) {
          // composite index hazır değilse bu kombinasyonu 0 say
          console.warn('countMatchingQuestions kombinasyonu atlandı:', e?.message || e);
        }
      }
    }
  }
  return total;
}

// Havuzdan akıllı set seç → { rows, available }
export async function pickSmartSet(filters) {
  const category = resolveSubject(filters.subject).category;
  const grades = gradesOf(filters);
  const diffs = expandDifficulty(filters.difficulty);
  const tfs = resolveTopicFilters(filters);
  const strict = filters.strict !== false;
  const count = Math.max(1, Number(filters.count) || 5);

  const combos = [];
  grades.forEach((g) => diffs.forEach((d) => tfs.forEach((tf) => combos.push({ g, d, tf }))));
  const perCombo = Math.max(2, Math.ceil(count / Math.max(1, combos.length)) + 1);

  const seen = new Set();
  const collected = [];
  for (const c of combos) {
    try {
      const { questions } = await fetchQuestionPool({
        category,
        grade: c.g,
        topic: c.tf.topic || null,
        sub_topic: c.tf.subTopic || null,
        difficulty: c.d,
        verified: true,
        strictTopic: strict,
        excludeIds: [...seen],
        limit: perCombo,
      });
      for (const q of questions) {
        if (q._source === 'local' || !q.id) continue; // ödeve atanamaz
        if (seen.has(q.id)) continue;
        seen.add(q.id);
        collected.push(poolToRow(q, c));
      }
    } catch (e) {
      console.warn('pickSmartSet kombinasyonu atlandı:', e?.message || e);
    }
  }
  return { rows: shuffle(collected).slice(0, count), available: collected.length };
}

// Eksik soruları AI ile üret (ANALYZE_AND_DERIVE + few-shot) → saveAIQuestions → verified:false rows
export async function augmentWithAI(filters, samples, countToAdd) {
  const category = resolveSubject(filters.subject).category;
  const grades = gradesOf(filters);
  const topics = filters.topics || [];
  const subTopics = filters.subTopics || [];
  const topicStr = topics.join(', ') || subTopics[0] || filters.subject;
  const grade = String(grades[0] || 10);
  const diff = filters.difficulty === 'mixed' ? 'medium' : (filters.difficulty || 'medium');
  const n = Math.max(1, Math.min(10, countToAdd));
  const sampleQuestions = (samples || []).slice(0, 5).map(toSample);

  const generated = await generateQuiz(topicStr, n, diff, {
    subject: filters.subject,
    grade,
    mode: 'ANALYZE_AND_DERIVE',
    sampleQuestions,
    quality: true, // öğretmen/havuz yolu → 70b + verifier + top-up (havuza yazılıp tekrar kullanılır)
  });

  const toSaveDocs = generated.map((g) => ({
    question_text: g.question,
    options: g.choices,
    correct_answer: g.choices[g.answer],
    explanation: g.hint || '',
    // Verifier puanını (1-5) havuza taşı; yoksa alanı hiç gönderme (backend null karşılar).
    ...(typeof g.qualityScore === 'number' ? { qualityScore: g.qualityScore } : {}),
  }));
  const savedIds = await saveAIQuestions(toSaveDocs, {
    category,
    subject: filters.subject,
    grade,
    topic: topics[0] || null,
    sub_topic: subTopics[0] || topics[0] || null,
    difficulty: diff,
    mode: 'derive',
  });

  return savedIds.map((id, i) => {
    const g = generated[i];
    return {
      id,
      text: g.question,
      subject: filters.subject,
      grade,
      difficulty: diff,
      isAI: true,
      options: g.choices,
      answer: g.choices[g.answer],
      explanation: g.hint || '',
      verified: false,
      topic: topics[0] || null,
      subTopic: subTopics[0] || null,
    };
  });
}
