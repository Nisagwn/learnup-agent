// Profil veri erişimi (profiles tablosu). DB satırını uygulamanın beklediği
// camelCase alias'lı şekle çevirir (okuma), yazarken camel→snake eşler.
import { supabase } from '../supabase';

export function mapProfileRow(r) {
  if (!r) return r;
  return {
    ...r,
    uid: r.id,
    teacherId: r.teacher_id ?? null,
    classCode: r.class_code ?? null,
    studentClass: r.student_class ?? null,
    dailyGoal: r.daily_goal ?? null,
    notificationsEnabled: r.notifications_enabled ?? true,
    teacherNotifPrefs: r.teacher_notif_prefs ?? {},
    totalChatMessages: r.total_chat_messages ?? r.stats?.totalChatMessages ?? 0,
    createdAt: r.created_at ?? null,
  };
}

// Uygulamanın kullandığı camelCase anahtarları → gerçek snake_case kolonlar.
const COLUMN_MAP = {
  teacherId: 'teacher_id',
  classCode: 'class_code',
  studentClass: 'student_class',
  dailyGoal: 'daily_goal',
  notificationsEnabled: 'notifications_enabled',
  teacherNotifPrefs: 'teacher_notif_prefs',
  totalChatMessages: 'total_chat_messages',
};

export async function getProfile(uid) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', uid).single();
  if (error) return null;
  return mapProfileRow(data);
}

export async function updateProfile(uid, patch) {
  const mapped = {};
  for (const [k, v] of Object.entries(patch)) mapped[COLUMN_MAP[k] || k] = v;
  const { error } = await supabase.from('profiles').update(mapped).eq('id', uid);
  if (error) throw error;
}
