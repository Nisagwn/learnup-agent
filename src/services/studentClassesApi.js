// Öğrenci çoklu-sınıf üyeliği — MOBİL ŞEMASI (platformlar arası tek doğruluk kaynağı).
// users/{uid}:
//   teacherIds:   string[]                  // katıldığı tüm öğretmen id'leri
//   teacherNames: { [teacherId]: string }   // id → öğretmen adı
//   teacherId:    string|null               // AKTİF/primary sınıf = teacherIds[0]
//   teacherName:  string|null               // aktif sınıf öğretmen adı
// NOT: `classes` ve teacher.students YAZILMAZ; öğrenci dokümanında classCode SAKLANMAZ (mobil parite).
import { db, auth } from '../firebase';
import { collection, query, where, getDocs, limit, doc, getDoc, updateDoc } from 'firebase/firestore';

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

// Öğretmen bilgisini (etiket için) users/{teacherId}'den oku: { name, branch }.
export async function getTeacherInfo(teacherId) {
  if (!teacherId) return { name: 'Öğretmen', branch: '' };
  try {
    const s = await getDoc(doc(db, 'users', teacherId));
    const d = s.exists() ? s.data() : {};
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
    // QA: teacherId == teacherId (legacy/primary)
    const qa = getDocs(query(
      collection(db, 'users'),
      where('teacherId', '==', teacherId),
      where('role', '==', 'student'),
    ));
    // QB: teacherIds array-contains teacherId (çoklu-sınıf) — composite index ister;
    // index yoksa sessizce atla, QA ile devam.
    const qb = getDocs(query(
      collection(db, 'users'),
      where('teacherIds', 'array-contains', teacherId),
      where('role', '==', 'student'),
    )).catch((e) => { console.warn('Sıralama QB (teacherIds) atlandı:', e?.message || e); return null; });

    const [snapA, snapB] = await Promise.all([qa, qb]);

    // uid'e göre birleştir (dedupe)
    const byId = new Map();
    snapA.forEach((d) => byId.set(d.id, { uid: d.id, ...d.data() }));
    if (snapB) snapB.forEach((d) => { if (!byId.has(d.id)) byId.set(d.id, { uid: d.id, ...d.data() }); });
    const students = [...byId.values()];

    if (students.length === 0) return { rank: null, total: 0, list: [] };

    const rankData = await Promise.all(students.map(async (student) => {
      const logsSnap = await getDocs(
        query(collection(db, 'user_logs'), where('studentId', '==', student.uid)),
      );
      let correct = 0, wrong = 0, total = 0;
      logsSnap.forEach((d) => {
        const a = d.data();
        total++;
        if (a.isCorrect === true) correct++;
        else if (a.isSkipped !== true && a.skipped !== true) wrong++;
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

// Sınıfa katıl (kod ile). Yeni sınıf listeye EKLENİR; primary = teacherIds[0] korunur
// (ilk katılımda otomatik aktif olur). "Aktif yap" ayrı yapılır.
export async function joinClass(code) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Oturum açık değil.');
  const norm = String(code || '').trim().toUpperCase();
  if (norm.length < 4) throw new Error('Geçerli bir sınıf kodu gir.');

  const snap = await getDocs(query(collection(db, 'users'), where('classCode', '==', norm), limit(1)));
  if (snap.empty) throw new Error('Bu koda sahip bir sınıf bulunamadı.');
  const teacherDoc = snap.docs[0];
  const teacherData = teacherDoc.data();
  if (teacherData.role !== 'teacher') throw new Error('Bu kod bir öğretmene ait değil.');
  const teacherId = teacherDoc.id;
  if (teacherId === uid) throw new Error('Kendi kodunu kullanamazsın.');

  const meRef = doc(db, 'users', uid);
  const meSnap = await getDoc(meRef);
  const { ids, names } = readMembership(meSnap.exists() ? meSnap.data() : {});

  if (ids.includes(teacherId)) throw new Error('Bu sınıfa zaten katıldın.');
  const name = tName(teacherData);
  ids.push(teacherId);
  names[teacherId] = name;

  const primary = ids[0];
  await updateDoc(meRef, {
    teacherIds: ids,
    teacherNames: names,
    teacherId: primary,
    teacherName: names[primary] || 'Öğretmen',
  });
  return { teacherId, teacherName: name };
}

// Aktif sınıfı değiştir: seçileni teacherIds DİZİSİNİN BAŞINA al (mobil primary = [0]).
export async function setActiveClass(teacherId) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Oturum açık değil.');
  const meRef = doc(db, 'users', uid);
  const meSnap = await getDoc(meRef);
  const me = meSnap.exists() ? meSnap.data() : {};
  const { ids, names } = readMembership(me);
  if (!ids.includes(teacherId)) return;
  const reordered = [teacherId, ...ids.filter((id) => id !== teacherId)];
  await updateDoc(meRef, {
    teacherIds: reordered,
    teacherId,
    teacherName: names[teacherId] || me.teacherName || 'Öğretmen',
  });
}

// Sınıftan ayrıl: id/name'den çıkar; kalan ilk = yeni primary; hiç kalmazsa hepsi boş/null.
export async function leaveClass(teacherId) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Oturum açık değil.');
  const meRef = doc(db, 'users', uid);
  const meSnap = await getDoc(meRef);
  const { ids, names } = readMembership(meSnap.exists() ? meSnap.data() : {});
  const newIds = ids.filter((id) => id !== teacherId);
  delete names[teacherId];
  const primary = newIds[0] || null;
  await updateDoc(meRef, {
    teacherIds: newIds,
    teacherNames: names,
    teacherId: primary,
    teacherName: primary ? (names[primary] || 'Öğretmen') : null,
  });
  return { active: primary };
}
