// Kanonik ders eşlemesi — sorular Firestore'da `category` (İngilizce) ile saklanır.
// Quiz.jsx ve QuestionPool.jsx'teki inline map'lerin (getSubjectMapping / SUBJECT_EN)
// tek otoriter kaynağı. Yeni bir kanonik ders eklemek için yalnızca burayı düzenle.
export const SUBJECT_TR_TO_EN = {
  'Matematik': 'Mathematics',
  'Fizik': 'Physics',
  'Kimya': 'Chemistry',
  'Biyoloji': 'Biology',
  'Edebiyat': 'Turkish Language and Literature',
  'Tarih': 'History',
  'Coğrafya': 'Geography',
  'Din Kültürü': 'Religion and Ethics',
  'Felsefe': 'Philosophy',
  'İngilizce': 'English',
};

export const SUBJECT_EN_TO_TR = Object.fromEntries(
  Object.entries(SUBJECT_TR_TO_EN).map(([tr, en]) => [en, tr])
);

// Kanonik 10 ders (TR), UI seçicilerinde kullanılır.
export const CANONICAL_SUBJECTS_TR = Object.keys(SUBJECT_TR_TO_EN);

// Eş anlamlı / alternatif yazımlar → kanonik TR
const ALIASES = {
  'turkce': 'Edebiyat',
  'türkçe': 'Edebiyat',
  'edebiyat': 'Edebiyat',
  'literature': 'Edebiyat',
  'din': 'Din Kültürü',
  'din kulturu': 'Din Kültürü',
  'religion': 'Din Kültürü',
  'cografya': 'Coğrafya',
  'geography': 'Coğrafya',
  'ingilizce': 'İngilizce',
  'english': 'İngilizce',
  'maths': 'Matematik',
  'math': 'Matematik',
};

const norm = (s) =>
  String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

// TR ya da EN (veya alternatif yazım) girdiyi kanonik biçime çözer.
// → { tr, en, category }  (category, Firestore sorgularında kullanılan değerdir = en)
export function resolveSubject(input) {
  const raw = String(input || '').trim();
  const key = norm(raw);

  // Doğrudan TR eşleşmesi (case-insensitive)
  const trHit = CANONICAL_SUBJECTS_TR.find((t) => norm(t) === key);
  if (trHit) {
    const en = SUBJECT_TR_TO_EN[trHit];
    return { tr: trHit, en, category: en };
  }

  // Doğrudan EN eşleşmesi
  const enHit = Object.values(SUBJECT_TR_TO_EN).find((e) => norm(e) === key);
  if (enHit) {
    return { tr: SUBJECT_EN_TO_TR[enHit], en: enHit, category: enHit };
  }

  // Alternatif yazım
  if (ALIASES[key]) {
    const tr = ALIASES[key];
    const en = SUBJECT_TR_TO_EN[tr];
    return { tr, en, category: en };
  }

  // Bilinmeyen (örn. AI özel konuları) — olduğu gibi geç
  return { tr: raw, en: raw, category: raw };
}

export default resolveSubject;
