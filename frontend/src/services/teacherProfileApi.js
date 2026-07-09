// ============================================================
// Öğretmen profili — lifetime etki sayaçları + sınırlı profil yazımı (Supabase).
// RLS: öğretmen yalnız kendi profiles satırını + kendi questions/assignments/
// announcements satırlarını yazar/sayar.
// ============================================================
import { supabase } from '../supabase';

// <> temizle + kırp + sınırla
const clean = (s, max) => String(s ?? '').replace(/[<>]/g, '').trim().slice(0, max);

async function countWhereTeacher(table, uid) {
  try {
    const { count } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true })
      .eq('teacher_id', uid);
    return count || 0;
  } catch (e) {
    console.warn(`${table} sayımı atlandı:`, e?.message || e);
    return 0;
  }
}

// Öğretim etkisi (lifetime): oluşturulan soru / ödev / duyuru
export async function fetchTeacherLifetimeStats(uid) {
  if (!uid) return { questionsCreated: 0, assignmentsCreated: 0, announcementsCreated: 0 };
  const [questionsCreated, assignmentsCreated, announcementsCreated] = await Promise.all([
    countWhereTeacher('questions', uid),
    countWhereTeacher('assignments', uid),
    countWhereTeacher('announcements', uid),
  ]);
  return { questionsCreated, assignmentsCreated, announcementsCreated };
}

async function patchProfile(uid, patch) {
  const { error } = await supabase.from('profiles').update(patch).eq('id', uid);
  if (error) throw error;
}

// Bio (max 200) + okul (max 80) — <> temizlenir
export function updateTeacherBio(uid, { bio, school }) {
  if (!uid) return Promise.reject(new Error('Kullanıcı yok'));
  const patch = {};
  if (bio !== undefined) patch.bio = clean(bio, 200);
  if (school !== undefined) patch.school = clean(school, 80);
  return patchProfile(uid, patch);
}

// Branş (max 40)
export function updateTeacherBranch(uid, branch) {
  if (!uid) return Promise.reject(new Error('Kullanıcı yok'));
  return patchProfile(uid, { branch: clean(branch, 40) });
}

// Ad (max 60)
export function updateTeacherName(uid, name) {
  if (!uid) return Promise.reject(new Error('Kullanıcı yok'));
  return patchProfile(uid, { name: clean(name, 60) });
}

// Bildirim tercihi — jsonb map anahtarını oku-birleştir-yaz
export async function updateTeacherNotifPref(uid, key, value) {
  if (!uid) throw new Error('Kullanıcı yok');
  const { data } = await supabase.from('profiles').select('teacher_notif_prefs').eq('id', uid).single();
  const prefs = { ...(data?.teacher_notif_prefs || {}), [key]: !!value };
  return patchProfile(uid, { teacher_notif_prefs: prefs });
}
