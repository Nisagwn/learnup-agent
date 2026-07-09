// submitTargetedAssignment — hedefli set gönderimi. Backend otoriter puanlama.
// targeted_assignments satırı question_ids setine göre puanlanır ve 'completed'a çevrilir.
// record-answer ÇAĞRILMAZ (çift sayım yok). Skor yalnız burada işlenir.
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
    const targetedAssignmentId = body?.targetedAssignmentId;
    const answers: Array<{ questionId: string; selectedIndex: number }> =
      Array.isArray(body?.answers) ? body.answers : [];
    if (!targetedAssignmentId) return json({ error: 'targetedAssignmentId gerekli.' }, 400);

    // Hedefli seti yükle → question_ids
    const { data: ta, error: tErr } = await admin
      .from('targeted_assignments').select('*').eq('id', targetedAssignmentId).single();
    if (tErr || !ta) return json({ error: 'Hedefli set bulunamadı.' }, 404);

    const questionIds: string[] = Array.isArray(ta.question_ids)
      ? ta.question_ids.map((x: any) => String(x))
      : [];

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

    const maxScore = answers.length || questionIds.length || 0;

    const { error: uErr } = await admin
      .from('targeted_assignments')
      .update({
        answers,
        auto_score: correctCount,
        score: correctCount,
        max_score: maxScore,
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', targetedAssignmentId);
    if (uErr) return json({ error: uErr.message || 'Gönderim kaydedilemedi.' }, 500);

    // targetedAssignmentsApi bekler: { autoScore, maxScore }
    return json({ autoScore: correctCount, maxScore });
  } catch (err: any) {
    return json({ error: err?.message || 'Sunucu hatası.' }, 500);
  }
});
