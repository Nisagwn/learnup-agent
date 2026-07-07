// ============================================================
// Hesap — silme (KVKK). deleteAccount DEPLOYED — sadece çağrılır.
// ============================================================
// Backend token'daki uid'i siler (Firestore verisi + alt koleksiyonlar + Auth).
// ÖNEMLİ: bu çağrıdan ÖNCE reauthenticateWithCredential ile yeniden-doğrulama
// yapılmış olmalı (yıkıcı işlem). Şifre işlemleri saf Firebase Auth (CF yok).
// ============================================================
import { auth } from '../firebase';

const IS_DEV = import.meta.env.DEV;
const FIREBASE_PROJECT_ID = 'learnup-3cdb7';
const BACKEND_BASE =
  import.meta.env.VITE_BACKEND_BASE_URL ||
  (IS_DEV
    ? `http://127.0.0.1:5001/${FIREBASE_PROJECT_ID}/us-central1`
    : `https://us-central1-${FIREBASE_PROJECT_ID}.cloudfunctions.net`);

// Hesabı kalıcı sil. Çağrıdan önce re-auth ZORUNLU.
export async function deleteAccount() {
  const user = auth.currentUser;
  if (!user) throw new Error('Oturum bulunamadı.');
  const token = await user.getIdToken();
  const res = await fetch(`${BACKEND_BASE.replace(/\/$/, '')}/deleteAccount`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || data.message || `Hesap silinemedi (${res.status})`);
  }
  return res.json().catch(() => ({}));
}
