// ============================================================
// AI Quiz üretim servisi (efemeral sabit-N motor için)
// ============================================================
// generate-questions Supabase Edge Function'ı çağırır. Üretilen sorular
// HAVUZA YAZILMAZ (persist YOK); sayfaya sessionStorage ile taşınır.
// supabase.functions.invoke kullanıcının JWT'sini otomatik ekler; manuel
// idToken/Authorization gerekmez. Gövde: { ..., userId }.
// ============================================================
import { apiInvoke } from './apiClient';
import { currentUid } from './authApi';
import { saveEphemeralQuiz } from '../utils/ephemeralQuiz';

const clampCount = (n) => Math.max(1, Math.min(20, Number(n) || 5));

async function callGenerateEndpoint(payload) {
  const { data, error } = await apiInvoke('generate-questions', {
    body: { userId: currentUid(), ...payload },
  });
  if (error) {
    const detail = error?.context?.error || error?.message;
    throw new Error(detail || 'Soru üretilemedi');
  }
  return data;
}

// CF çıktısını normalize eder:
//   { question_text, options[4], correct_answer, explanation?, qualityScore? }
//   → { question, choices[4], answer(index), hint?, qualityScore? }
// 4 BENZERSIZ option + tam 1 doğru şart; uymayanı ele (null).
function fromTagged(raw) {
  if (!raw) return null;
  const question = String(raw.question_text ?? raw.question ?? '').trim();
  const optsSrc = Array.isArray(raw.options) ? raw.options : (Array.isArray(raw.choices) ? raw.choices : []);
  const choices = optsSrc.map((o) => String(o ?? '').trim());
  const correct = String(raw.correct_answer ?? raw.answer ?? '').trim();
  if (!question || choices.length !== 4) return null;
  if (new Set(choices).size !== 4) return null; // 4 benzersiz
  const answer = choices.findIndex((o) => o === correct);
  if (answer < 0) return null; // doğru, seçenekler arasında olmalı (tam 1 doğru)
  const hint = String(raw.explanation ?? raw.hint ?? '').trim();
  // Backend verifier puanı (1-5). Yoksa null bırak — akış aynen sürer.
  const qualityScore = typeof raw.qualityScore === 'number' ? raw.qualityScore : null;
  return { question, choices, answer, hint: hint || null, qualityScore };
}

/**
 * AI ile N soru üretir (havuza yazmadan). Çıktı: [{ question, choices[4], answer, hint? }].
 * @param {string} topic    Konu/ders
 * @param {number} count    1-20
 * @param {'easy'|'medium'|'hard'} difficulty
 * @param {object} opts     { subject?, grade?, mode?, sampleQuestions?, quality? }
 *   quality:true → backend 70b + verifier + top-up (öğretmen/havuz, düşük hacim, kaliteli).
 *   Gönderilmezse backend fast (8b) kalır → öğrenci/yüksek hacim token tasarrufu.
 */
export async function generateQuiz(topic, count = 5, difficulty = 'medium', opts = {}) {
  const n = clampCount(count);
  const payload = {
    mode: opts.mode || 'STRICT_CURRICULUM',
    subject: opts.subject || topic,
    topic: opts.topic ?? topic,
    grade: opts.grade || '10',
    count: n,
    difficulty,
  };
  if (opts.sampleQuestions) payload.sampleQuestions = opts.sampleQuestions;
  // Yalnızca açıkça istenirse gönder; aksi halde backend varsayılanı (fast) kalsın.
  if (opts.quality) payload.quality = true;

  const data = await callGenerateEndpoint(payload);
  const list = Array.isArray(data?.questions) ? data.questions : [];
  const out = list.map(fromTagged).filter(Boolean).slice(0, n);
  if (out.length === 0) throw new Error('Geçerli soru üretilemedi, lütfen tekrar dene.');
  return out;
}

/**
 * AI quiz üretir, efemeral oturuma yazar ve quiz sayfasına yönlendirir.
 * source: 'duel' | 'ai_free' | 'quiz' (mock) | 'retake' | 'random'
 */
export async function startAiQuiz({ topic, subject, count = 5, difficulty = 'medium', source = 'ai_free', grade = '10', mode }, navigate) {
  const subj = subject ?? topic;
  const questions = await generateQuiz(topic ?? subject, count, difficulty, { subject: subj, mode, grade });
  const sid = saveEphemeralQuiz({ questions, subject: subj, count: questions.length, difficulty, source, grade });
  // Mock sınav zaman damgası — Learn feed'in mock_exam kartı 7 gün gizlensin.
  if (source === 'quiz') {
    try { localStorage.setItem('learnup.lastMockAt', String(Date.now())); } catch { /* yoksay */ }
  }
  navigate(`/student/quiz?mode=ai&sid=${sid}`);
  return sid;
}
