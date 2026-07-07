// ============================================================
// Öğretmen profili — lifetime etki sayaçları + sınırlı profil yazımı
// ============================================================
// SALT-OKUMA sayım (getCountFromServer) + yalnız bio/school/branch/name/
// teacherNotifPrefs yazımı. Backend çağrısı/deploy YOK. firestore.rules
// öğretmenin yalnız kendi dokümanını yazmasına izin verir.
// ============================================================
import { db } from '../firebase';
import { collection, query, where, getCountFromServer, doc, updateDoc } from 'firebase/firestore';

// <> temizle + kırp + sınırla
const clean = (s, max) => String(s ?? '').replace(/[<>]/g, '').trim().slice(0, max);

async function countWhereTeacher(coll, uid) {
  try {
    const snap = await getCountFromServer(query(collection(db, coll), where('teacherId', '==', uid)));
    return snap.data().count || 0;
  } catch (e) {
    console.warn(`${coll} sayımı atlandı:`, e?.message || e);
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

// Bio (max 200) + okul (max 80) — <> temizlenir
export function updateTeacherBio(uid, { bio, school }) {
  if (!uid) return Promise.reject(new Error('Kullanıcı yok'));
  const patch = {};
  if (bio !== undefined) patch.bio = clean(bio, 200);
  if (school !== undefined) patch.school = clean(school, 80);
  return updateDoc(doc(db, 'users', uid), patch);
}

// Branş (max 40) — <> temizlenir
export function updateTeacherBranch(uid, branch) {
  if (!uid) return Promise.reject(new Error('Kullanıcı yok'));
  return updateDoc(doc(db, 'users', uid), { branch: clean(branch, 40) });
}

// Ad (max 60) — <> temizlenir
export function updateTeacherName(uid, name) {
  if (!uid) return Promise.reject(new Error('Kullanıcı yok'));
  return updateDoc(doc(db, 'users', uid), { name: clean(name, 60) });
}

// Bildirim tercihleri (yalnız Firestore map yazımı; gerçek push teslimi Faz 14)
export function updateTeacherNotifPref(uid, key, value) {
  if (!uid) return Promise.reject(new Error('Kullanıcı yok'));
  return updateDoc(doc(db, 'users', uid), { [`teacherNotifPrefs.${key}`]: !!value });
}
