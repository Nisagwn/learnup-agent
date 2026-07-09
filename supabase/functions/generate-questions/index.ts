// generateQuestions — Groq ile çoktan seçmeli soru üretir (opsiyonel havuza yazar).
import { preflight, json, getAdmin, resolveUserId, isRateLimited } from '../_shared/http.ts';
import { llmChat, GEN_MODEL, GEN_MODES, buildModePromptConfig, parseTaggedQuestions } from '../_shared/ai.ts';

async function fetchSampleQuestions(admin: any, subject: string, limit: number) {
  const { data } = await admin.from('questions')
    .select('question_text,options,correct_answer,explanation')
    .eq('verified', true).eq('category', subject).limit(limit);
  return data || [];
}

export async function saveAIQuestions(admin: any, questions: any[], meta: any) {
  const rows = questions.map((q) => ({
    teacher_id: meta.teacherId || null,
    category: meta.subject, subject: meta.subject, subject_tr: meta.subject,
    topic: meta.topic, sub_topic: meta.subTopic || meta.topic,
    question_text: q.question_text, options: q.options, correct_answer: q.correct_answer,
    explanation: q.explanation, difficulty: meta.difficulty, grade: String(meta.grade),
    verified: false, is_ai_generated: true, gen_mode: meta.mode,
    random_seed: Math.floor(Math.random() * 1_000_000),
  }));
  const { data } = await admin.from('questions').insert(rows).select('id');
  return data || [];
}

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);
  try {
    const admin = getAdmin();
    const userId = await resolveUserId(req, admin);
    const { subject, topic, grade, count, difficulty, mode, persist } = await req.json();
    if (!subject || !topic) return json({ error: 'subject ve topic gerekli.' }, 400);
    if (isRateLimited(userId || 'anon')) return json({ error: 'Çok hızlı istek.', retryAfterMs: 2000 }, 429);

    const qCount = Math.min(10, Math.max(1, Number(count) || 5));
    const gradeStr = grade ? String(grade) : '10';
    const diffStr = difficulty || 'orta';

    let samples: any[] = [];
    if (String(mode || '').toLowerCase() === GEN_MODES.ANALYZE_AND_DERIVE) {
      samples = await fetchSampleQuestions(admin, subject, 5);
    }
    const cfg = buildModePromptConfig(mode, { subject, topic, grade: gradeStr, difficulty: diffStr, count: qCount, samples });

    const text = await llmChat(
      [{ role: 'system', content: cfg.system }, { role: 'user', content: cfg.prompt }],
      { model: GEN_MODEL, temperature: cfg.temperature, max_tokens: 2048 },
    );
    const questions = parseTaggedQuestions(text);
    if (questions.length === 0) return json({ error: 'Soru üretilemedi. Lütfen tekrar deneyin.' }, 502);

    let questionIds: string[] | undefined;
    if (persist) {
      const saved = await saveAIQuestions(admin, questions, {
        subject, topic, subTopic: topic, grade: gradeStr, difficulty: diffStr, mode: cfg.mode, teacherId: userId,
      });
      questionIds = saved.map((s: any) => s.id);
    }
    return json({ success: true, questions, mode: cfg.mode, questionIds });
  } catch (err: any) {
    return json({ error: err?.message || 'Sunucu hatası.' }, 500);
  }
});
