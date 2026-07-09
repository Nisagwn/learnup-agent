// saveAIQuestions — AI üretilmiş soruları questions tablosuna yazar (verified:false).
// Client: src/services/questionPoolApi.js → invoke('save-ai-questions', { body: { questions, meta } }) → { savedIds: [...] }
import { preflight, json, getAdmin, resolveUserId } from '../_shared/http.ts';

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);
  try {
    const admin = getAdmin();
    const userId = await resolveUserId(req, admin);
    if (!userId) return json({ error: 'userId gerekli.' }, 401);

    const body = await req.json().catch(() => ({}));
    const questions = Array.isArray(body?.questions) ? body.questions : [];
    const meta: any = body?.meta || {};

    if (questions.length === 0) return json({ savedIds: [] });

    const subject = meta.subject ?? 'Genel';
    const topic = meta.topic ?? null;
    const subTopic = meta.subTopic || topic || null;
    const grade = meta.grade != null ? String(meta.grade) : null;
    const difficulty = meta.difficulty ?? 'medium';
    const mode = meta.mode ?? null;
    const teacherId = meta.teacherId || userId;

    const rows = questions.map((q: any) => ({
      category: subject,
      subject,
      subject_tr: subject,
      topic,
      sub_topic: subTopic,
      question_text: q?.question_text ?? '',
      options: Array.isArray(q?.options) ? q.options : [],
      correct_answer: q?.correct_answer ?? null,
      explanation: q?.explanation ?? '',
      difficulty,
      grade,
      verified: false,
      is_ai_generated: true,
      gen_mode: mode,
      random_seed: Math.floor(Math.random() * 1e6),
      teacher_id: teacherId,
    }));

    const { data, error } = await admin.from('questions').insert(rows).select('id');
    if (error) return json({ error: error.message }, 500);

    const savedIds = (data || []).map((r: any) => r.id);
    return json({ savedIds });
  } catch (err: any) {
    return json({ error: err?.message || 'Sunucu hatası.' }, 500);
  }
});
