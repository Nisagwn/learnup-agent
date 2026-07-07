// Tarih yardımcıları — Firestore Timestamp veya ham Date/string'i normalize eder.

/** Firestore Timestamp, Date veya string'i Date nesnesine çevirir (yoksa null). */
export const toDate = (d) => (d?.toDate ? d.toDate() : (d ? new Date(d) : null));

/** Bir tarihi tr-TR kısa biçiminde döndürür (yoksa boş string). */
export const formatDate = (d) => toDate(d)?.toLocaleDateString('tr-TR') || '';

/** Yerel bugün tarihini 'YYYY-MM-DD' biçiminde döndürür (backend todayISO ile aynı). */
export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Bir ödev/son teslim tarihi için kullanıcıya gösterilecek etiket + renk sınıfı üretir.
 * @returns {{ text: string, cls: string }}
 */
export const dueLabel = (due) => {
  const date = toDate(due);
  if (!date) return { text: 'Süre belirtilmedi', cls: 'text-slate-400' };
  const diff = Math.ceil((date - new Date()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return { text: 'Süresi doldu', cls: 'text-red-400' };
  if (diff === 0) return { text: 'Son gün bugün', cls: 'text-amber-400' };
  return { text: `${diff} gün kaldı`, cls: 'text-emerald-400' };
};
