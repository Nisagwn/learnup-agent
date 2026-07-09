// Sınıf kodu yönetimi — yenileme yalnız classCode alanını yazar.
import { supabase } from '../supabase';
import { updateProfile } from './profileApi';

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
      const { data } = await supabase.from('profiles').select('id').eq('class_code', code);
      if (!data || data.length === 0) return code;
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
  await updateProfile(teacherUid, { classCode: code });
  return code;
}
