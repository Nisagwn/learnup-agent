// ============================================================
// Öğretmen Aksiyon Merkezi (Inbox) — 4 ayrı real-time sayaç
// ============================================================
// SALT OKUMA. Her tetikte tam state emit eder. Bir sorgu başarısız olursa
// ilgili sayaç 0'a düşer (panel bozulmaz).
// ============================================================
import { supabase } from '../supabase';
import { subscribePendingAIQuestions } from './questionPoolApi';

const DAY = 24 * 3600e3;

// timestamptz artık ISO string; eski Firestore Timestamp yardımcısı da korunur.
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
  const loadSubmissions = async () => {
    try {
      const { count, error } = await supabase
        .from('assignment_submissions')
        .select('*', { count: 'exact', head: true })
        .eq('teacher_id', teacherUid)
        .eq('status', 'submitted');
      if (error) throw error;
      state.pendingSubmissions = count || 0; emit();
    } catch { state.pendingSubmissions = 0; emit(); }
  };
  loadSubmissions();
  const chSubs = supabase
    .channel(`inbox-submissions-${teacherUid}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'assignment_submissions', filter: `teacher_id=eq.${teacherUid}` }, () => loadSubmissions())
    .subscribe();
  unsubs.push(() => supabase.removeChannel(chSubs));

  // Onay bekleyen AI soruları — TEK KAYNAK (Soru Havuzu ile aynı sorgu).
  // is_ai_generated==true && verified==false; "herhangi öğretmen onaylayabilir".
  unsubs.push(subscribePendingAIQuestions(
    (docs) => { state.pendingAIQuestions = docs.length; emit(); },
    () => { state.pendingAIQuestions = 0; emit(); }
  ));

  // Son 7 günde tamamlanan hedefli setler (completed_at client-side filtre)
  const loadTargeted = async () => {
    try {
      const { data, error } = await supabase
        .from('targeted_assignments')
        .select('completed_at')
        .eq('teacher_id', teacherUid)
        .eq('status', 'completed');
      if (error) throw error;
      const cutoff = Date.now() - 7 * DAY;
      let c = 0;
      (data || []).forEach((d) => { if (ms(d.completed_at) >= cutoff) c++; });
      state.completedTargetedSets = c; emit();
    } catch { state.completedTargetedSets = 0; emit(); }
  };
  loadTargeted();
  const chTargeted = supabase
    .channel(`inbox-targeted-${teacherUid}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'targeted_assignments', filter: `teacher_id=eq.${teacherUid}` }, () => loadTargeted())
    .subscribe();
  unsubs.push(() => supabase.removeChannel(chTargeted));

  // Yaklaşan teslimler (due_date now..now+24sa) — client-side filtre
  const loadDeadlines = async () => {
    try {
      const { data, error } = await supabase
        .from('assignments')
        .select('due_date')
        .eq('teacher_id', teacherUid);
      if (error) throw error;
      const now = Date.now();
      const soon = now + DAY;
      let c = 0;
      (data || []).forEach((d) => { const t = ms(d.due_date); if (t >= now && t <= soon) c++; });
      state.upcomingDeadlines = c; emit();
    } catch { state.upcomingDeadlines = 0; emit(); }
  };
  loadDeadlines();
  const chDeadlines = supabase
    .channel(`inbox-deadlines-${teacherUid}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'assignments', filter: `teacher_id=eq.${teacherUid}` }, () => loadDeadlines())
    .subscribe();
  unsubs.push(() => supabase.removeChannel(chDeadlines));

  emit();
  return unsubs;
}
