// ============================================================
// Ödevler (assignments) servisi — küratörlü (questionIds) yol
// ============================================================
// Akıllı Ödev küratörlü set (questionIds = pool id) üretir. Bu yolda öğrenci
// TAM o soruları çözer ve submitAssignment ile gönderir.
// submitAssignment DEPLOYED — sadece çağrılır. Skor backend autoScore ile işlenir
// (recordAnswer ÇAĞRILMAZ → çift sayım yok). Sorular HAVUZDA; id'den yüklenir.
// questionCount-only (eski basit) ödevler bu servisi KULLANMAZ; eski adaptif
// Quiz akışında kalır.
// ============================================================
import { auth, db } from '../firebase';
import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';

const IS_DEV = import.meta.env.DEV;
const FIREBASE_PROJECT_ID = 'learnup-3cdb7';
const BACKEND_BASE =
  import.meta.env.VITE_BACKEND_BASE_URL ||
  (IS_DEV
    ? `http://127.0.0.1:5001/${FIREBASE_PROJECT_ID}/us-central1`
    : `https://us-central1-${FIREBASE_PROJECT_ID}.cloudfunctions.net`);

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

// Tek ödev dökümanı (küratörlü solver için)
export async function getAssignment(id) {
  const snap = await getDoc(doc(db, 'assignments', id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// Öğrencinin bu ödeve gönderimi (varsa). studentId tek-alan sorgu (composite index
// gerektirmez), assignmentId client-side süzülür → CF'in doc-id şemasından bağımsız.
export function subscribeMySubmission(assignmentId, cb, onError) {
  const uid = auth.currentUser?.uid;
  if (!uid || !assignmentId) { cb(null); return () => {}; }
  const qS = query(collection(db, 'assignment_submissions'), where('studentId', '==', uid));
  return onSnapshot(
    qS,
    (snap) => {
      const mine = snap.docs.map((d) => ({ id: d.id, ...d.data() })).find((s) => s.assignmentId === assignmentId);
      cb(mine || null);
    },
    (err) => { console.warn('assignment_submissions yüklenemedi:', err); onError?.(err); cb(null); }
  );
}

// { assignmentId, answers: [{questionId, selectedIndex}] } → { autoScore, maxScore, correctCount }
// Boş bırakılan sorular için selectedIndex = -1 gönderilir. Backend tek gönderim uygular.
export async function submitAssignment({ assignmentId, answers }) {
  const data = await postJson('submitAssignment', { assignmentId, answers });
  return {
    autoScore: data.autoScore ?? data.score ?? null,
    maxScore: data.maxScore ?? (answers?.length ?? null),
    correctCount: data.correctCount ?? null,
  };
}
