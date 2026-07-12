// ============================================================
// Hedefli setler (targeted_assignments) servisi
// ============================================================
// Sorular HAVUZDA (questionIds = pool id). Çözme, ödev akışına benzer (id'den yükle).
// generate-targeted-set + submit-targeted-assignment Edge Function — sadece çağrılır.
// Targeted skoru YALNIZ submit-targeted-assignment ile işlenir (record-answer çağrılmaz).
// ============================================================
import { supabase } from '../supabase';
import { apiInvoke } from './apiClient';
import { currentUid } from './authApi';
import { normalizeDoc } from './questionPoolApi';

// timestamptz artık ISO string / Date → ms. (Firestore Timestamp.toMillis/.toDate yok.)
const ms = (ts) => {
  if (!ts) return 0;
  if (ts instanceof Date) return ts.getTime();
  const p = new Date(ts).getTime();
  return Number.isNaN(p) ? 0 : p;
};

// Supabase satırı (snake_case) → uygulama modeli (camelCase alias'lar).
function normalizeTA(r = {}) {
  return {
    id: r.id,
    teacherId: r.teacher_id || null,
    studentId: r.student_id || null,
    subject: r.subject || 'Genel',
    // focus_sub_topics kolonu yok → tek `topic` kolonundan türetilir.
    focusSubTopics: Array.isArray(r.focus_sub_topics)
      ? r.focus_sub_topics
      : (r.topic ? [r.topic] : []),
    questionIds: Array.isArray(r.question_ids) ? r.question_ids : [],
    rationale: r.rationale || '',
    source: r.source || 'ai',
    difficulty: r.difficulty || 'medium',
    status: r.status || 'assigned',
    autoScore: r.auto_score ?? null,
    score: r.score ?? r.auto_score ?? null,
    maxScore: r.max_score ?? (Array.isArray(r.question_ids) ? r.question_ids.length : null),
    createdAtMs: ms(r.created_at),
    completedAtMs: ms(r.completed_at),
    answers: Array.isArray(r.answers) ? r.answers : [],
  };
}

// ── Dinleyiciler ──

// Öğrencinin kendi hedefli setleri (createdAt DESC, client sort)
export function subscribeMyTargetedAssignments(cb, onError) {
  const uid = currentUid();
  if (!uid) { cb([]); return () => {}; }
  return subscribeStudentTargetedAssignments(uid, cb, onError);
}

// Belirli bir öğrencinin hedefli setleri (öğretmen detay sayfası için)
export function subscribeStudentTargetedAssignments(studentId, cb, onError) {
  if (!studentId) { cb([]); return () => {}; }
  let cancelled = false;

  const load = async () => {
    const { data, error } = await supabase
      .from('targeted_assignments')
      .select('*')
      .eq('student_id', studentId);
    if (cancelled) return;
    if (error) { console.warn('targeted_assignments yüklenemedi:', error); onError?.(error); return; }
    const list = (data || []).map(normalizeTA);
    list.sort((a, b) => b.createdAtMs - a.createdAtMs);
    cb(list);
  };

  // İlk veri
  load();

  // Realtime değişiklikler → her olayda yeniden yükle (sıralama/normalize tutarlı kalsın)
  const ch = supabase
    .channel(`targeted_assignments:${studentId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'targeted_assignments', filter: `student_id=eq.${studentId}` },
      () => { load(); }
    )
    .subscribe();

  return () => { cancelled = true; supabase.removeChannel(ch); };
}

export async function getTargetedAssignment(id) {
  const { data } = await supabase
    .from('targeted_assignments')
    .select('*')
    .eq('id', id)
    .single();
  return data ? normalizeTA(data) : null;
}

export function deleteTargetedAssignment(id) {
  return supabase.from('targeted_assignments').delete().eq('id', id);
}

// ── Mutasyonlar (Edge Function) ──

// input = { studentId, subject, focusSubTopics[], count, difficulty, source:'ai'|'pool', rationale? }
// Edge Function dokümanı `status:'draft'` ile oluşturur (öğrenciye GÖRÜNMEZ). Öğretmen önizleyip
// onayladıktan sonra publishTargetedAssignment ile 'assigned'a çevrilir → öğrenciye gider.
export async function createTargetedAssignment(input) {
  const { data, error } = await apiInvoke('generate-targeted-set', { body: input });
  if (error) throw error;
  return { id: data?.assignmentId || data?.id || null, questionIds: data?.questionIds || [] };
}

// Taslaktaki soruları önizleme için getir (questions/{id}). Onay durumu da döner.
export async function fetchTargetedQuestions(questionIds = []) {
  const ids = Array.isArray(questionIds) ? questionIds.filter(Boolean) : [];
  if (ids.length === 0) return [];
  const { data } = await supabase.from('questions').select('*').in('id', ids);
  const byId = new Map((data || []).map((r) => [r.id, r]));
  // Girdi sırasını koru
  return ids
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((raw) => ({
      ...normalizeDoc({ id: raw.id, ...raw }),
      verified: raw.verified !== false,
      isAI: !!(raw.is_ai_generated || raw.isAI),
    }));
}

// Taslağı öğrenciye yayınla (draft → assigned). Öğretmenin görünür alanlarını da yazar.
export async function publishTargetedAssignment(id, patch = {}) {
  if (!id) return;
  const update = { status: 'assigned' };
  if (patch.rationale !== undefined) update.rationale = patch.rationale;
  // focus_sub_topics kolonu şemada yok → en yakın `topic` kolonuna ilk odak konusu yazılır.
  if (Array.isArray(patch.focusSubTopics)) update.topic = patch.focusSubTopics[0] ?? null;
  await supabase.from('targeted_assignments').update(update).eq('id', id);
}

// { targetedAssignmentId, answers: [{questionId, selectedIndex}] } → { autoScore, maxScore }
export async function submitTargetedAssignment({ targetedAssignmentId, answers }) {
  const { data, error } = await apiInvoke('submit-targeted-assignment', {
    body: { targetedAssignmentId, answers },
  });
  if (error) throw error;
  return { autoScore: data?.autoScore ?? null, maxScore: data?.maxScore ?? (answers?.length ?? null) };
}
