// ============================================================
// Öğretmen öğrenci analitiği — SALT OKUMA
//  - fetchStudentsAtRisk: eşikli (minAnswered) risk listesi
//  - fetchStudentAnalytics: öğrenci detayında "Son Yanlışlar" (srs_cards)
// ============================================================
import { db } from '../firebase';
import { collection, query, where, getDocs, orderBy, limit as fbLimit } from 'firebase/firestore';
import { resolveSubject } from '../utils/subjects';

const DAY = 24 * 3600e3;

const ms = (ts) => {
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.toDate === 'function') return ts.toDate().getTime();
  if (ts instanceof Date) return ts.getTime();
  const p = new Date(ts).getTime();
  return Number.isNaN(p) ? 0 : p;
};

// Son 30 günde en az `minAnswered` cevaplamış öğrenciler arasından en riskliler.
// successRate ASC, eşitse wrongCount DESC; ilk `limit`.
export async function fetchStudentsAtRisk(teacherUid, limit = 3, minAnswered = 10) {
  if (!teacherUid) return [];
  const stuSnap = await getDocs(
    query(collection(db, 'users'), where('teacherId', '==', teacherUid), where('role', '==', 'student'))
  );
  const approved = stuSnap.docs
    .map((d) => ({ id: d.id, name: d.data().name || d.data().email || 'Öğrenci', email: d.data().email || null, isApproved: d.data().isApproved }))
    .filter((s) => s.isApproved === true);
  if (approved.length === 0) return [];

  const ids = approved.map((s) => s.id);
  const cutoff = Date.now() - 30 * DAY;
  const counts = {};
  ids.forEach((id) => { counts[id] = { total: 0, correct: 0, wrong: 0 }; });

  // user_logs 'in' 30'arlı chunk (index-free) → 30 gün client-side filtre
  for (let i = 0; i < ids.length; i += 30) {
    const chunk = ids.slice(i, i + 30);
    try {
      const snap = await getDocs(query(collection(db, 'user_logs'), where('studentId', 'in', chunk)));
      snap.forEach((d) => {
        const a = d.data();
        if (ms(a.timestamp) < cutoff) return;
        const c = counts[a.studentId];
        if (!c) return;
        const isSkipped = a.isSkipped === true || a.skipped === true;
        if (isSkipped) return;
        c.total += 1;
        if (a.isCorrect === true) c.correct += 1; else c.wrong += 1;
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

  let docs = [];
  try {
    const snap = await getDocs(
      query(collection(db, 'users', studentId, 'srs_cards'), orderBy('lastReviewedAt', 'desc'), fbLimit(50))
    );
    docs = snap.docs;
  } catch {
    // orderBy/index hazır değilse: tümünü çek, client-side sırala
    try {
      const snap = await getDocs(collection(db, 'users', studentId, 'srs_cards'));
      docs = snap.docs;
    } catch {
      docs = [];
    }
  }

  out.recentMistakes = docs
    .map((d) => ({ id: d.id, ...d.data() }))
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
