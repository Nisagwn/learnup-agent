// ============================================================
// Hedefli setler (targeted_assignments) servisi
// ============================================================
// Sorular HAVUZDA (questionIds = pool id). Çözme, ödev akışına benzer (id'den yükle).
// generateTargetedSet + submitTargetedAssignment DEPLOYED — sadece çağrılır.
// Targeted skoru YALNIZ submitTargetedAssignment ile işlenir (recordAnswer çağrılmaz).
// ============================================================
import { auth, db } from '../firebase';
import { collection, query, where, onSnapshot, doc, getDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { normalizeDoc } from './questionPoolApi';

const IS_DEV = import.meta.env.DEV;
const FIREBASE_PROJECT_ID = 'learnup-3cdb7';
const BACKEND_BASE =
  import.meta.env.VITE_BACKEND_BASE_URL ||
  (IS_DEV
    ? `http://127.0.0.1:5001/${FIREBASE_PROJECT_ID}/us-central1`
    : `https://us-central1-${FIREBASE_PROJECT_ID}.cloudfunctions.net`);

const ms = (ts) => {
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.toDate === 'function') return ts.toDate().getTime();
  if (ts instanceof Date) return ts.getTime();
  const p = new Date(ts).getTime();
  return Number.isNaN(p) ? 0 : p;
};

function normalizeTA(id, d = {}) {
  return {
    id,
    teacherId: d.teacherId || null,
    studentId: d.studentId || null,
    subject: d.subject || 'Genel',
    focusSubTopics: Array.isArray(d.focusSubTopics) ? d.focusSubTopics : (d.topic ? [d.topic] : []),
    questionIds: Array.isArray(d.questionIds) ? d.questionIds : [],
    rationale: d.rationale || '',
    source: d.source || 'ai',
    difficulty: d.difficulty || 'medium',
    status: d.status || 'assigned',
    autoScore: d.autoScore ?? null,
    score: d.score ?? d.autoScore ?? null,
    maxScore: d.maxScore ?? (Array.isArray(d.questionIds) ? d.questionIds.length : null),
    createdAtMs: ms(d.createdAt),
    completedAtMs: ms(d.completedAt),
    answers: Array.isArray(d.answers) ? d.answers : [],
  };
}

async function postJson(path, body) {
  const user = auth.currentUser;
  const headers = { 'Content-Type': 'application/json' };
  try {
    const token = await user?.getIdToken?.();
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch { /* token yoksa userId gövdede */ }
  const res = await fetch(`${BACKEND_BASE.replace(/\/$/, '')}/${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ userId: user?.uid, ...body }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || data.message || `İstek başarısız (${res.status})`);
  }
  return res.json();
}

// ── Dinleyiciler ──

// Öğrencinin kendi hedefli setleri (createdAt DESC, client sort)
export function subscribeMyTargetedAssignments(cb, onError) {
  const uid = auth.currentUser?.uid;
  if (!uid) { cb([]); return () => {}; }
  return subscribeStudentTargetedAssignments(uid, cb, onError);
}

// Belirli bir öğrencinin hedefli setleri (öğretmen detay sayfası için)
export function subscribeStudentTargetedAssignments(studentId, cb, onError) {
  if (!studentId) { cb([]); return () => {}; }
  const qT = query(collection(db, 'targeted_assignments'), where('studentId', '==', studentId));
  return onSnapshot(
    qT,
    (snap) => {
      const list = snap.docs.map((d) => normalizeTA(d.id, d.data()));
      list.sort((a, b) => b.createdAtMs - a.createdAtMs);
      cb(list);
    },
    (err) => { console.warn('targeted_assignments yüklenemedi:', err); onError?.(err); }
  );
}

export async function getTargetedAssignment(id) {
  const snap = await getDoc(doc(db, 'targeted_assignments', id));
  return snap.exists() ? normalizeTA(snap.id, snap.data()) : null;
}

export function deleteTargetedAssignment(id) {
  return deleteDoc(doc(db, 'targeted_assignments', id));
}

// ── Mutasyonlar (deployed CF) ──

// input = { studentId, subject, focusSubTopics[], count, difficulty, source:'ai'|'pool', rationale? }
// Backend dokümanı `status:'draft'` ile oluşturur (öğrenciye GÖRÜNMEZ). Öğretmen önizleyip
// onayladıktan sonra publishTargetedAssignment ile 'assigned'a çevrilir → öğrenciye gider.
export async function createTargetedAssignment(input) {
  const data = await postJson('generateTargetedSet', input);
  return { id: data.assignmentId || data.id || null, questionIds: data.questionIds || [] };
}

// Taslaktaki soruları önizleme için getir (questions/{id}). Onay durumu da döner.
export async function fetchTargetedQuestions(questionIds = []) {
  const ids = Array.isArray(questionIds) ? questionIds.filter(Boolean) : [];
  if (ids.length === 0) return [];
  const snaps = await Promise.all(ids.map((id) => getDoc(doc(db, 'questions', id)).catch(() => null)));
  return snaps
    .filter((s) => s && s.exists())
    .map((s) => {
      const raw = s.data();
      return {
        ...normalizeDoc({ id: s.id, ...raw }),
        verified: raw.verified !== false,
        isAI: !!(raw.is_ai_generated || raw.isAI),
      };
    });
}

// Taslağı öğrenciye yayınla (draft → assigned). Öğretmenin görünür alanlarını da yazar.
export async function publishTargetedAssignment(id, patch = {}) {
  if (!id) return;
  await updateDoc(doc(db, 'targeted_assignments', id), { status: 'assigned', ...patch });
}

// { targetedAssignmentId, answers: [{questionId, selectedIndex}] } → { autoScore, maxScore }
export async function submitTargetedAssignment({ targetedAssignmentId, answers }) {
  const data = await postJson('submitTargetedAssignment', { targetedAssignmentId, answers });
  return { autoScore: data.autoScore ?? null, maxScore: data.maxScore ?? (answers?.length ?? null) };
}
