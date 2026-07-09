// Öğrenci çoklu-sınıf üyeliği — MOBİL ŞEMASI (platformlar arası tek doğruluk kaynağı).
// NOT (Supabase migrasyonu): profiles tablosunda yalnız TEK `teacher_id` kolonu var;
// mobil şemadaki teacherIds[]/teacherNames{} kolonları YOK. Bu yüzden çoklu-sınıf üyeliği
// tek aktif sınıfa (teacher_id) indirgenir. Eksik kolonlar rapor edildi (bkz. missingColumns).
// Okuma yardımcıları (getStudentClasses/readMembership) yine de dizi varsa çalışır.
import { supabase } from '../supabase';
import { currentUid } from './authApi';
import { getProfile, updateProfile } from './profileApi';

const tName = (d) => d?.name || d?.fullName || d?.email?.split('@')[0] || 'Öğretmen';

// teacherIds/teacherNames'ten (yoksa legacy teacherId/teacherName'den) sınıf listesi.
export function getStudentClasses(studentData) {
  const d = studentData || {};
  const ids = Array.isArray(d.teacherIds) ? d.teacherIds : (d.teacherId ? [d.teacherId] : []);
  const names = (d.teacherNames && typeof d.teacherNames === 'object')
    ? d.teacherNames
    : (d.teacherId && d.teacherName ? { [d.teacherId]: d.teacherName } : {});
  return ids.filter(Boolean).map((id) => ({ teacherId: id, teacherName: names[id] || 'Öğretmen' }));
}

// Öğretmen bilgisini (etiket için) profiles/{teacherId}'den oku: { name, branch }.
export async function getTeacherInfo(teacherId) {
  if (!teacherId) return { name: 'Öğretmen', branch: '' };
  try {
    const { data } = await supabase.from('profiles').select('name, email, branch').eq('id', teacherId).single();
    const d = data || {};
    return { name: tName(d), branch: String(d.branch || '').trim() };
  } catch {
    return { name: 'Öğretmen', branch: '' };
  }
}

// Bir sınıfın (teacherId) sıralamasını hesapla — AKTİF SINIFI DEĞİŞTİRMEZ, izole/salt okuma.
// net formülü UserStatsContext.loadClassRanking ile BİREBİR aynıdır.
// Dön: { rank, total, list:[{ uid, name, correct, total, net }] } | rank=null (sınıf boş/okunamaz).
export async function computeClassRanking(uid, teacherId) {
  if (!teacherId) return { rank: null, total: null, list: [] };
  try {
    // profiles: teacher_id == teacherId && role == student
    // NOT: teacherIds array-contains sorgusu (çoklu-sınıf) için kolon yok; atlandı.
    const { data: studentsRows } = await supabase
      .from('profiles')
      .select('*')
      .eq('teacher_id', teacherId)
      .eq('role', 'student');

    const byId = new Map();
    (studentsRows || []).forEach((d) => byId.set(d.id, { uid: d.id, ...d }));
    const students = [...byId.values()];

    if (students.length === 0) return { rank: null, total: 0, list: [] };

    const rankData = await Promise.all(students.map(async (student) => {
      const { data: logs } = await supabase
        .from('user_logs')
        .select('is_correct, is_skipped')
        .eq('student_id', student.uid);
      let correct = 0, wrong = 0, total = 0;
      (logs || []).forEach((a) => {
        total++;
        if (a.is_correct === true) correct++;
        else if (a.is_skipped !== true) wrong++;
      });
      const net = Math.round((correct - wrong * 0.25) * 10) / 10;
      const name = student.name || student.fullName || student.email?.split('@')[0] || 'Öğrenci';
      return { uid: student.uid, name, correct, total, net };
    }));

    rankData.sort((a, b) => (b.net !== a.net ? b.net - a.net : b.correct - a.correct));
    const rank = rankData.findIndex((s) => s.uid === uid) + 1;
    return { rank: rank || null, total: rankData.length, list: rankData };
  } catch (err) {
    console.warn('Sınıf sıralaması hesaplanamadı:', err);
    return { rank: null, total: null, list: [] };
  }
}

// Öğrencinin mevcut id/name kümesini (legacy uyumlu) çöz.
function readMembership(me) {
  const ids = Array.isArray(me.teacherIds) ? [...me.teacherIds] : (me.teacherId ? [me.teacherId] : []);
  const names = (me.teacherNames && typeof me.teacherNames === 'object')
    ? { ...me.teacherNames }
    : (me.teacherId && me.teacherName ? { [me.teacherId]: me.teacherName } : {});
  return { ids: ids.filter(Boolean), names };
}

// Sınıfa katıl (kod ile). NOT: profiles tek `teacher_id` tuttuğu için katılım aktif sınıfı
// (teacher_id) seçili öğretmene ayarlar. Öğretmen satırı (students) YAZILMAZ (mobil parite).
export async function joinClass(code) {
  const uid = currentUid();
  if (!uid) throw new Error('Oturum açık değil.');
  const norm = String(code || '').trim().toUpperCase();
  if (norm.length < 4) throw new Error('Geçerli bir sınıf kodu gir.');

  const { data: matches } = await supabase.from('profiles').select('*').eq('class_code', norm).limit(1);
  if (!matches || matches.length === 0) throw new Error('Bu koda sahip bir sınıf bulunamadı.');
  const teacherData = matches[0];
  if (teacherData.role !== 'teacher') throw new Error('Bu kod bir öğretmene ait değil.');
  const teacherId = teacherData.id;
  if (teacherId === uid) throw new Error('Kendi kodunu kullanamazsın.');

  const me = (await getProfile(uid)) || {};
  const { ids, names } = readMembership(me);

  if (ids.includes(teacherId)) throw new Error('Bu sınıfa zaten katıldın.');
  const name = tName(teacherData);
  ids.push(teacherId);
  names[teacherId] = name;

  // Aktif/primary sınıf = ids[0]. Yalnız teacher_id kolonu kalıcı yazılabilir.
  const primary = ids[0];
  await updateProfile(uid, { teacherId: primary });
  return { teacherId, teacherName: name };
}

// Aktif sınıfı değiştir: seçileni aktif sınıf (teacher_id) yap.
export async function setActiveClass(teacherId) {
  const uid = currentUid();
  if (!uid) throw new Error('Oturum açık değil.');
  const me = (await getProfile(uid)) || {};
  const { ids } = readMembership(me);
  if (ids.length && !ids.includes(teacherId)) return;
  await updateProfile(uid, { teacherId });
}

// Sınıftan ayrıl: aktif sınıfsa teacher_id boşaltılır (tek kolon; kalan sınıf bilgisi tutulamaz).
export async function leaveClass(teacherId) {
  const uid = currentUid();
  if (!uid) throw new Error('Oturum açık değil.');
  const me = (await getProfile(uid)) || {};
  const { ids } = readMembership(me);
  const newIds = ids.filter((id) => id !== teacherId);
  const primary = newIds[0] || null;
  await updateProfile(uid, { teacherId: primary });
  return { active: primary };
}
