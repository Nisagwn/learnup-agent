// submitAssignment — küratörlü ödev gönderimi. Backend otoriter puanlama.
// Öğrenci question_ids setinin TAMAMINI çözer; burada tek gönderim değerlendirilir.
// record-answer ÇAĞRILMAZ (çift sayım yok). Skor auto_score olarak yazılır.
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
    const assignmentId = body?.assignmentId;
    const answers: Array<{ questionId: string; selectedIndex: number }> =
      Array.isArray(body?.answers) ? body.answers : [];
    if (!assignmentId) return json({ error: 'assignmentId gerekli.' }, 400);

    // Ödevi yükle → question_ids + teacher_id
    const { data: assignment, error: aErr } = await admin
      .from('assignments').select('*').eq('id', assignmentId).single();
    if (aErr || !assignment) return json({ error: 'Ödev bulunamadı.' }, 404);

    const questionIds: string[] = Array.isArray(assignment.question_ids)
      ? assignment.question_ids.map((x: any) => String(x))
      : [];

    // Soruları havuzdan yükle (id → doküman)
    const { data: qRows } = questionIds.length
      ? await admin.from('questions').select('id, options, correct_answer').in('id', questionIds)
      : { data: [] as any[] };
    const byId = new Map((qRows || []).map((r: any) => [String(r.id), r]));

    // Puanla: seçilen metin = options[selectedIndex]; correct_answer ile eşleşirse doğru.
    let correctCount = 0;
    for (const ans of answers) {
      const q = byId.get(String(ans?.questionId));
      if (!q) continue;
      const opts = Array.isArray(q.options) ? q.options : [];
      const idx = Number(ans?.selectedIndex);
      if (!Number.isInteger(idx) || idx < 0 || idx >= opts.length) continue; // boş/geçersiz
      if (String(opts[idx]) === String(q.correct_answer)) correctCount += 1;
    }

    // maxScore: gönderilen cevap sayısı, yoksa ödevin soru sayısı.
    const maxScore = answers.length || questionIds.length || 0;

    const { data: inserted, error: iErr } = await admin
      .from('assignment_submissions')
      .insert({
        assignment_id: assignmentId,
        student_id: userId,
        teacher_id: assignment.teacher_id || null,
        status: 'submitted',
        answers,
        auto_score: correctCount,
        score: correctCount,
        max_score: maxScore,
        correct_count: correctCount,
      })
      .select('*')
      .single();
    if (iErr) return json({ error: iErr.message || 'Gönderim kaydedilemedi.' }, 500);

    // assignmentsApi bekler: { autoScore, maxScore, correctCount }
    return json({
      success: true,
      autoScore: correctCount,
      score: correctCount,
      maxScore,
      correctCount,
      submissionId: inserted?.id ?? null,
    });
  } catch (err: any) {
    return json({ error: err?.message || 'Sunucu hatası.' }, 500);
  }
});
