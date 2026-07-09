// ============================================================
// Öğretmen öğrenci analitiği — SALT OKUMA
//  - fetchStudentsAtRisk: eşikli (minAnswered) risk listesi
//  - fetchStudentAnalytics: öğrenci detayında "Son Yanlışlar" (srs_cards)
// ============================================================
import { supabase } from '../supabase';
import { resolveSubject } from '../utils/subjects';

const DAY = 24 * 3600e3;

// timestamptz artık ISO string/Date; toMillis/toDate yok. Güvenli ms çevirici.
const ms = (ts) => {
  if (!ts) return 0;
  if (ts instanceof Date) return ts.getTime();
  const p = new Date(ts).getTime();
  return Number.isNaN(p) ? 0 : p;
};

// Son 30 günde en az `minAnswered` cevaplamış öğrenciler arasından en riskliler.
// successRate ASC, eşitse wrongCount DESC; ilk `limit`.
export async function fetchStudentsAtRisk(teacherUid, limit = 3, minAnswered = 10) {
  if (!teacherUid) return [];
  const { data: stuRows } = await supabase
    .from('profiles')
    .select('*')
    .eq('teacher_id', teacherUid)
    .eq('role', 'student');

  const approved = (stuRows || [])
    .map((d) => ({ id: d.id, name: d.name || d.email || 'Öğrenci', email: d.email || null, isApproved: d.is_approved }))
    .filter((s) => s.isApproved === true);
  if (approved.length === 0) return [];

  const ids = approved.map((s) => s.id);
  const cutoff = Date.now() - 30 * DAY;
  const counts = {};
  ids.forEach((id) => { counts[id] = { total: 0, correct: 0, wrong: 0 }; });

  // user_logs 'in' 30'arlı chunk → 30 gün client-side filtre (created_at)
  for (let i = 0; i < ids.length; i += 30) {
    const chunk = ids.slice(i, i + 30);
    try {
      const { data: logs } = await supabase
        .from('user_logs')
        .select('student_id, is_correct, is_skipped, created_at')
        .in('student_id', chunk);
      (logs || []).forEach((a) => {
        if (ms(a.created_at) < cutoff) return;
        const c = counts[a.student_id];
        if (!c) return;
        if (a.is_skipped === true) return;
        c.total += 1;
        if (a.is_correct === true) c.correct += 1; else c.wrong += 1;
      });
    } catch (e) {
      console.warn('at-risk chunk sorgusu başarısız:', e);
    }
  }

  const rows = approved.map((s) => {
    const c = counts[s.id];
    const denom = c.correct + c.wrong;
    return {
      studentId: s.id, name: s.name, email: s.email,
      successRate: denom > 0 ? Math.round((c.correct / denom) * 100) : 0,
      totalAnswered: c.total, wrongCount: c.wrong,
    };
  }).filter((r) => r.totalAnswered >= minAnswered);

  rows.sort((a, b) => (a.successRate !== b.successRate ? a.successRate - b.successRate : b.wrongCount - a.wrongCount));
  return rows.slice(0, limit);
}

// Öğrenci detayı: son yanlışlar (srs_cards snapshot'larından, gerçek hatalar).
export async function fetchStudentAnalytics(studentId) {
  const out = { recentMistakes: [] };
  if (!studentId) return out;

  let rows = [];
  try {
    const { data, error } = await supabase
      .from('srs_cards')
      .select('*')
      .eq('user_id', studentId)
      .order('last_reviewed_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    rows = data || [];
  } catch {
    // order başarısızsa: tümünü çek, client-side sırala
    try {
      const { data } = await supabase.from('srs_cards').select('*').eq('user_id', studentId);
      rows = data || [];
    } catch {
      rows = [];
    }
  }

  out.recentMistakes = rows
    .map((r) => ({ id: r.question_id, ...r, consecutiveCorrect: r.consecutive_correct, lastReviewedAt: r.last_reviewed_at }))
    .filter((c) => c?.snapshot?.question && c.consecutiveCorrect === 0)
    .map((c) => ({
      id: c.id,
      question: String(c.snapshot.question).slice(0, 240),
      subject: (resolveSubject(c.subject || 'Genel')?.tr) || c.subject || 'Genel',
      subTopic: c.sub_topic || null,
      tsMs: ms(c.lastReviewedAt),
    }))
    .sort((a, b) => b.tsMs - a.tsMs)
    .slice(0, 10);

  return out;
}
