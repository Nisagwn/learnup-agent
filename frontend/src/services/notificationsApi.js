// ============================================================
// In-app bildirimler — notifications tablosu (SALT OKUMA + read_at yazımı)
// ============================================================
// Bildirim ÜRETİMİ backend'in işi (Edge Function tetikleyiciler/scheduled görevler
// satırları zaten yazıyor). Burada YALNIZ okuruz ve read_at işaretleriz.
// Backend değiştirme/deploy YOK.
//
// Satır şeması (public.notifications):
//   { id, user_id, type, title, body, icon(lucide adı), tone('accent'|'success'|'warning'|'danger'),
//     deep_link(string|null), data(jsonb), read_at(timestamptz|null), created_at(timestamptz) }
// ============================================================
import { supabase } from '../supabase';

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
    deepLink: d.deep_link ?? d.deepLink ?? null,
    data: d.data || {},
    readAtMs: toMs(d.read_at ?? d.readAt),
    createdAtMs: toMs(d.created_at ?? d.createdAt),
  };
}

// Son 50 bildirim (created_at desc). Realtime kanal + ilk yüklemede tek seferlik select.
export function subscribeNotifications(uid, cb, onError) {
  if (!uid) { cb([]); return () => {}; }
  const load = async () => {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) { console.warn('notifications yüklenemedi:', error); onError?.(error); cb([]); return; }
    cb((data || []).map((r) => normalize(r.id, r)));
  };
  load();
  const ch = supabase
    .channel(`notifications:${uid}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` }, () => { load(); })
    .subscribe();
  return () => supabase.removeChannel(ch);
}

// Okunmamış sayacı (hafif rozet sorgusu): read_at IS NULL
export function subscribeUnreadCount(uid, cb, onError) {
  if (!uid) { cb(0); return () => {}; }
  const load = async () => {
    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', uid)
      .is('read_at', null);
    if (error) { console.warn('okunmamış sayımı yüklenemedi:', error); onError?.(error); cb(0); return; }
    cb(count || 0);
  };
  load();
  const ch = supabase
    .channel(`notifications-unread:${uid}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` }, () => { load(); })
    .subscribe();
  return () => supabase.removeChannel(ch);
}

export async function markRead(uid, id) {
  if (!uid || !id) return;
  await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
}

// Görünür okunmamışları tek update'te okundu işaretle
export async function markAllRead(uid, items) {
  if (!uid || !Array.isArray(items)) return;
  const unread = items.filter((n) => !n.readAtMs);
  if (!unread.length) return;
  const now = new Date().toISOString();
  const ids = unread.map((n) => n.id);
  await supabase.from('notifications').update({ read_at: now }).in('id', ids);
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
