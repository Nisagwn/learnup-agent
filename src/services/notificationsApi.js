// ============================================================
// In-app bildirimler — users/{uid}/notifications (SALT OKUMA + readAt yazımı)
// ============================================================
// Bildirim ÜRETİMİ backend'in işi (deployed tetikleyiciler/scheduled fonksiyonlar
// dokümanları zaten yazıyor). Burada YALNIZ okuruz ve readAt işaretleriz.
// Backend değiştirme/deploy YOK.
//
// Doküman şeması:
//   { type, title, body, icon(lucide adı), tone('accent'|'success'|'warning'|'danger'),
//     deepLink(string|null), data(map), readAt(Timestamp|null), createdAt(Timestamp) }
// ============================================================
import { db } from '../firebase';
import {
  collection, query, orderBy, limit, where, onSnapshot, doc, updateDoc, writeBatch, Timestamp,
} from 'firebase/firestore';

const VALID_TONES = ['accent', 'success', 'warning', 'danger'];

const toMs = (ts) => {
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.seconds === 'number') return ts.seconds * 1000;
  if (typeof ts.toDate === 'function') return ts.toDate().getTime();
  if (ts instanceof Date) return ts.getTime();
  const p = new Date(ts).getTime();
  return Number.isNaN(p) ? 0 : p;
};

function normalize(id, d = {}) {
  return {
    id,
    type: d.type || 'info',
    title: d.title || '',
    body: d.body || '',
    icon: d.icon || 'Bell',
    tone: VALID_TONES.includes(d.tone) ? d.tone : 'accent',
    deepLink: d.deepLink || null,
    data: d.data || {},
    readAtMs: toMs(d.readAt),
    createdAtMs: toMs(d.createdAt),
  };
}

// Son 50 bildirim (createdAt desc)
export function subscribeNotifications(uid, cb, onError) {
  if (!uid) { cb([]); return () => {}; }
  const qN = query(
    collection(db, 'users', uid, 'notifications'),
    orderBy('createdAt', 'desc'),
    limit(50),
  );
  return onSnapshot(
    qN,
    (snap) => cb(snap.docs.map((d) => normalize(d.id, d.data()))),
    (err) => { console.warn('notifications yüklenemedi:', err); onError?.(err); cb([]); },
  );
}

// Okunmamış sayacı (hafif rozet sorgusu): readAt == null
export function subscribeUnreadCount(uid, cb, onError) {
  if (!uid) { cb(0); return () => {}; }
  const qU = query(
    collection(db, 'users', uid, 'notifications'),
    where('readAt', '==', null),
    limit(50),
  );
  return onSnapshot(
    qU,
    (snap) => cb(snap.size),
    (err) => { console.warn('okunmamış sayımı yüklenemedi:', err); onError?.(err); cb(0); },
  );
}

export function markRead(uid, id) {
  if (!uid || !id) return Promise.resolve();
  return updateDoc(doc(db, 'users', uid, 'notifications', id), { readAt: Timestamp.now() });
}

// Görünür okunmamışları tek batch'te okundu işaretle
export async function markAllRead(uid, items) {
  if (!uid || !Array.isArray(items)) return;
  const unread = items.filter((n) => !n.readAtMs);
  if (!unread.length) return;
  const now = Timestamp.now();
  const batch = writeBatch(db);
  unread.forEach((n) => batch.update(doc(db, 'users', uid, 'notifications', n.id), { readAt: now }));
  await batch.commit();
}

// Type-bazlı web rota eşlemesi (mobil deepLink string'i web rotasıyla bire bir olmayabilir).
// Bilinmeyen type → null (yönlendirme yok).
export function resolveNotificationRoute(n, { isStudent = true } = {}) {
  const home = isStudent ? '/student' : '/teacher';
  const t = n?.type || '';
  const data = n?.data || {};

  if (t === 'assignment' || t === 'assignment_due' || t === 'assignment_feedback') {
    return data.id || data.assignmentId ? `/student/assignments/${data.id || data.assignmentId}` : '/student/assignments';
  }
  if (t === 'announcement') return home;
  if (t === 'league_rollover' || t === 'league_tier_change') return '/student/league';
  if (t === 'badge_earned') return '/student/badges';
  if (t === 'level_up' || t.startsWith('streak_') || t === 'daily_quest_reminder') return home;
  if (t === 'srs_due' || t === 'srs_mastery') return '/student/wrong-answers';
  if (t === 'submission_received') return '/teacher/tests';
  if (t === 'test' || t === 'info') return home;
  return null;
}
