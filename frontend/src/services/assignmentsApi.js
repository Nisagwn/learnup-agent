// ============================================================
// Ödevler (assignments) servisi — küratörlü (questionIds) yol
// ============================================================
// Akıllı Ödev küratörlü set (questionIds = pool id) üretir. Bu yolda öğrenci
// TAM o soruları çözer ve submitAssignment ile gönderir.
// submitAssignment DEPLOYED (Supabase Edge Function) — sadece çağrılır. Skor
// backend autoScore ile işlenir (recordAnswer ÇAĞRILMAZ → çift sayım yok).
// Sorular HAVUZDA; id'den yüklenir.
// questionCount-only (eski basit) ödevler bu servisi KULLANMAZ; eski adaptif
// Quiz akışında kalır.
// ============================================================
import { supabase } from '../supabase';
import { currentUid } from './authApi';

// assignment_submissions satırını uygulamanın beklediği camelCase alias'lı şekle çevirir.
function mapSubmission(r) {
  if (!r) return r;
  return {
    ...r,
    assignmentId: r.assignment_id,
    studentId: r.student_id,
    teacherId: r.teacher_id,
    autoScore: r.auto_score ?? null,
    maxScore: r.max_score ?? null,
    correctCount: r.correct_count ?? null,
    createdAt: r.created_at ?? null,
  };
}

// assignments satırını camelCase alias'lı şekle çevirir.
function mapAssignment(r) {
  if (!r) return r;
  return {
    ...r,
    teacherId: r.teacher_id,
    questionCount: r.question_count,
    questionIds: r.question_ids ?? [],
    dueDate: r.due_date ?? null,
    createdAt: r.created_at ?? null,
  };
}

// Tek ödev dökümanı (küratörlü solver için)
export async function getAssignment(id) {
  const { data } = await supabase.from('assignments').select('*').eq('id', id).single();
  return data ? mapAssignment(data) : null;
}

// Öğrencinin bu ödeve gönderimi (varsa). student_id tek-alan sorgu, assignmentId
// client-side süzülür → gönderim şemasından bağımsız. Realtime kanal + ilk select.
export function subscribeMySubmission(assignmentId, cb, onError) {
  const uid = currentUid();
  if (!uid || !assignmentId) { cb(null); return () => {}; }

  const load = async () => {
    try {
      const { data, error } = await supabase
        .from('assignment_submissions')
        .select('*')
        .eq('student_id', uid);
      if (error) throw error;
      const mine = (data || []).map(mapSubmission).find((s) => s.assignmentId === assignmentId);
      cb(mine || null);
    } catch (err) {
      console.warn('assignment_submissions yüklenemedi:', err);
      onError?.(err);
      cb(null);
    }
  };

  load();
  const ch = supabase
    .channel(`my-submission-${uid}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'assignment_submissions', filter: `student_id=eq.${uid}` },
      () => load()
    )
    .subscribe();

  return () => supabase.removeChannel(ch);
}

// { assignmentId, answers: [{questionId, selectedIndex}] } → { autoScore, maxScore, correctCount }
// Boş bırakılan sorular için selectedIndex = -1 gönderilir. Backend tek gönderim uygular.
export async function submitAssignment({ assignmentId, answers }) {
  const { data, error } = await supabase.functions.invoke('submit-assignment', {
    body: { assignmentId, answers },
  });
  if (error) throw new Error(error.message || 'İstek başarısız');
  return {
    autoScore: data?.autoScore ?? data?.score ?? null,
    maxScore: data?.maxScore ?? (answers?.length ?? null),
    correctCount: data?.correctCount ?? null,
  };
}
