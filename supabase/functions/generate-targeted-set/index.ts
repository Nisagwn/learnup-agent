// generateTargetedSet — öğrencinin yanlışlarına (SRS) göre kişiselleştirilmiş set üretir.
import { preflight, json, getAdmin, resolveUserId, isRateLimited } from '../_shared/http.ts';
import { llmChat, GEN_MODEL, GEN_MODES, buildModePromptConfig, parseTaggedQuestions } from '../_shared/ai.ts';
import { saveAIQuestions } from '../generate-questions/index.ts';

// Öğrencinin yanlış kartları (consecutive_correct=0) + snapshot → few-shot örnekleri.
async function fetchStudentWrongSamples(admin: any, studentId: string, subject: string, limit: number) {
  const { data } = await admin.from('srs_cards')
    .select('snapshot,subject')
    .eq('user_id', studentId).eq('subject', subject).eq('consecutive_correct', 0)
    .not('snapshot', 'is', null).limit(limit);
  return (data || [])
    .filter((c: any) => c.snapshot && Array.isArray(c.snapshot.choices) && c.snapshot.choices.length >= 4)
    .map((c: any) => ({
      question_text: c.snapshot.question,
      options: c.snapshot.choices,
      correct_answer: c.snapshot.answer,
      explanation: '',
    }));
}

async function fetchSamplesForDerive(admin: any, subject: string, limit: number) {
  const { data } = await admin.from('questions')
    .select('question_text,options,correct_answer,explanation')
    .eq('verified', true).eq('category', subject).limit(limit);
  return data || [];
}

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);
  try {
    const admin = getAdmin();
    const teacherId = await resolveUserId(req, admin);
    if (!teacherId) return json({ error: 'Öğretmen kimliği gerekli.' }, 401);
    const { studentId, subject, topic = null, grade = null, count } = await req.json();
    if (!studentId || !subject) return json({ error: 'studentId ve subject gerekli.' }, 400);
    if (isRateLimited(teacherId)) return json({ error: 'Çok hızlı istek.', retryAfterMs: 2000 }, 429);

    const qCount = Math.min(10, Math.max(1, Number(count) || 5));
    const gradeStr = grade ? String(grade) : '10';

    let samples = await fetchStudentWrongSamples(admin, studentId, subject, qCount);
    const sourceWrongCount = samples.length;
    let toppedUpCount = 0;
    if (samples.length < qCount) {
      const extra = await fetchSamplesForDerive(admin, subject, qCount - samples.length);
      toppedUpCount = extra.length;
      samples = samples.concat(extra);
    }

    const cfg = buildModePromptConfig(GEN_MODES.ANALYZE_AND_DERIVE, {
      subject, topic: topic || subject, grade: gradeStr, difficulty: 'orta', count: qCount, samples,
    });
    const text = await llmChat(
      [{ role: 'system', content: cfg.system }, { role: 'user', content: cfg.prompt }],
      { model: GEN_MODEL, temperature: cfg.temperature, max_tokens: 2048 },
    );
    const parsed = parseTaggedQuestions(text);
    if (parsed.length === 0) return json({ error: 'Hedefli soru üretilemedi.' }, 502);

    const saved = await saveAIQuestions(admin, parsed, {
      subject, topic: topic || subject, subTopic: topic || subject,
      grade: gradeStr, difficulty: 'orta', mode: GEN_MODES.ANALYZE_AND_DERIVE, teacherId,
    });
    const questionIds = saved.map((s: any) => s.id);

    const { data: ta } = await admin.from('targeted_assignments').insert({
      teacher_id: teacherId, student_id: studentId, subject, topic: topic || null, grade: gradeStr,
      mode: GEN_MODES.ANALYZE_AND_DERIVE, question_ids: questionIds,
      source_wrong_count: sourceWrongCount, topped_up_count: toppedUpCount, status: 'draft',
    }).select('id').single();

    return json({ success: true, assignmentId: ta?.id, questionIds, sourceWrongCount, toppedUpCount });
  } catch (err: any) {
    return json({ error: err?.message || 'Sunucu hatası.' }, 500);
  }
});
