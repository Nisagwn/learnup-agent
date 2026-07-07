// ============================================================
// Öğretmen Aksiyon Merkezi (Inbox) — 4 ayrı real-time sayaç
// ============================================================
// SALT OKUMA. Her tetikte tam state emit eder. Composite index hazır
// değilse ilgili listener hata callback'inde 0'a düşer (panel bozulmaz).
// ============================================================
import { db } from '../firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { subscribePendingAIQuestions } from './questionPoolApi';

const DAY = 24 * 3600e3;

const ms = (ts) => {
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.toDate === 'function') return ts.toDate().getTime();
  if (ts instanceof Date) return ts.getTime();
  const p = new Date(ts).getTime();
  return Number.isNaN(p) ? 0 : p;
};

// onChange({ pendingSubmissions, pendingAIQuestions, completedTargetedSets, upcomingDeadlines })
// Dönen unsubscribe[]'i panel useEffect temizler.
export function subscribeTeacherInbox(teacherUid, onChange) {
  const state = { pendingSubmissions: 0, pendingAIQuestions: 0, completedTargetedSets: 0, upcomingDeadlines: 0 };
  const emit = () => onChange({ ...state });
  if (!teacherUid) { emit(); return []; }

  const unsubs = [];

  // Bekleyen gönderimler (status=='submitted')
  unsubs.push(onSnapshot(
    query(collection(db, 'assignment_submissions'), where('teacherId', '==', teacherUid), where('status', '==', 'submitted')),
    (s) => { state.pendingSubmissions = s.size; emit(); },
    () => { state.pendingSubmissions = 0; emit(); }
  ));

  // Onay bekleyen AI soruları — TEK KAYNAK (Soru Havuzu ile aynı sorgu).
  // is_ai_generated==true && verified==false; "herhangi öğretmen onaylayabilir".
  unsubs.push(subscribePendingAIQuestions(
    (docs) => { state.pendingAIQuestions = docs.length; emit(); },
    () => { state.pendingAIQuestions = 0; emit(); }
  ));

  // Son 7 günde tamamlanan hedefli setler (completedAt client-side filtre → index gerekmez)
  unsubs.push(onSnapshot(
    query(collection(db, 'targeted_assignments'), where('teacherId', '==', teacherUid), where('status', '==', 'completed')),
    (s) => {
      const cutoff = Date.now() - 7 * DAY;
      let c = 0;
      s.forEach((d) => { if (ms(d.data().completedAt) >= cutoff) c++; });
      state.completedTargetedSets = c; emit();
    },
    () => { state.completedTargetedSets = 0; emit(); }
  ));

  // Yaklaşan teslimler (dueDate now..now+24sa) — client-side filtre
  unsubs.push(onSnapshot(
    query(collection(db, 'assignments'), where('teacherId', '==', teacherUid)),
    (s) => {
      const now = Date.now();
      const soon = now + DAY;
      let c = 0;
      s.forEach((d) => { const t = ms(d.data().dueDate); if (t >= now && t <= soon) c++; });
      state.upcomingDeadlines = c; emit();
    },
    () => { state.upcomingDeadlines = 0; emit(); }
  ));

  emit();
  return unsubs;
}
