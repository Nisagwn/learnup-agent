// Oyunlaştırma Cloud Functions istemci sarmalı.
// recordAnswer / ensureDailyState / claimQuestReward HTTP fonksiyonlarını çağırır.
import { auth } from '../firebase';

const FIREBASE_PROJECT_ID = 'learnup-3cdb7';
const BACKEND_BASE =
  import.meta.env.VITE_BACKEND_BASE_URL ||
  (import.meta.env.DEV
    ? `http://127.0.0.1:5001/${FIREBASE_PROJECT_ID}/us-central1`
    : `https://us-central1-${FIREBASE_PROJECT_ID}.cloudfunctions.net`);

async function postJson(path, body) {
  const url = `${BACKEND_BASE.replace(/\/$/, '')}/${path}`;
  const headers = { 'Content-Type': 'application/json' };
  try {
    const token = await auth.currentUser?.getIdToken?.();
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    /* token alınamadı — userId gövdeye düşer */
  }
  const payload = { userId: auth.currentUser?.uid, ...body };
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `İstek başarısız (${res.status})`);
  }
  return res.json();
}

/** Bir cevabı kaydeder; XP/seri/görev/lig/rozet delta'sını döndürür. */
export const recordAnswer = (answer) => postJson('recordAnswer', answer);

/** Açılışta günlük görev + lig kaydını hazırlar; güncel gamification durumunu döndürür. */
export const ensureDailyState = () => postJson('ensureDailyState', {});

/** Tamamlanmış bir günlük görevin ödülünü talep eder. */
export const claimQuestReward = (questId) => postJson('claimQuestReward', { questId });

/**
 * Bugün için bir seri dondurması (freeze) harcar; güncel streak durumunu döndürür.
 * Backend fonksiyon yolu 'useStreakFreeze'; client adı `use*` React-hooks lint'ini
 * tetiklemesin diye `requestStreakFreeze`.
 */
export const requestStreakFreeze = () => postJson('useStreakFreeze', {});
