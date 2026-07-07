// Sınıf kodu yönetimi — yenileme yalnız classCode alanını yazar.
import { db } from '../firebase';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';

// Karışması zor karakterler (I, O, 0, 1 yok)
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const randomCode = (len = 6) => {
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
};

// Benzersiz kod üret (8 deneme; her birinde başka kullanıcıda var mı bak). Bulamazsa son üretilen.
export async function generateUniqueClassCode() {
  let last = randomCode();
  for (let i = 0; i < 8; i++) {
    const code = randomCode();
    last = code;
    try {
      const snap = await getDocs(query(collection(db, 'users'), where('classCode', '==', code)));
      if (snap.empty) return code;
    } catch (e) {
      console.warn('classCode benzersizlik sorgusu başarısız, fallback:', e);
      return code;
    }
  }
  return last;
}

// Öğretmenin sınıf kodunu yeniler. Eski kod geçersizleşir; öğrenciler bağlı kalır (teacherId değişmez).
export async function regenerateClassCode(teacherUid) {
  if (!teacherUid) throw new Error('Öğretmen kimliği yok');
  const code = await generateUniqueClassCode();
  await updateDoc(doc(db, 'users', teacherUid), { classCode: code });
  return code;
}
