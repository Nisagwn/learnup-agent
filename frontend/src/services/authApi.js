// Auth yardımcıları — Firebase Auth'un yerini alır (Supabase Auth).
// Senkron `auth.currentUser?.uid` kullanımları için modül-seviyesinde cache tutulur.
import { supabase } from '../supabase';

let _cachedUser = null;

// Uygulama açılışında oturumu hidrat et + değişiklikleri cache'le.
supabase.auth.getSession().then(({ data }) => { _cachedUser = data.session?.user ?? null; });
supabase.auth.onAuthStateChange((_event, session) => { _cachedUser = session?.user ?? null; });

/** Senkron: mevcut kullanıcı (cache'den). Firebase'deki auth.currentUser karşılığı. */
export function currentUser() { return _cachedUser; }

/** Senkron: mevcut kullanıcının uid'i. Firebase'deki auth.currentUser?.uid karşılığı. */
export function currentUid() { return _cachedUser?.id ?? null; }

/** Sunucu-doğrulamalı mevcut kullanıcı (async). */
export async function getCurrentUser() {
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

/** Kayıt — profil satırı auth.users trigger'ı (handle_new_user) ile otomatik oluşur. */
export async function signUp({ email, password, name, role, grade, studentClass }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        name: (name || '').trim() || 'İsimsiz Kullanıcı',
        role: role || 'student',
        grade: grade ?? null,
        student_class: (studentClass || '').trim() || null,
      },
    },
  });
  if (error) throw error;
  return data.user;
}

/** Giriş. */
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

/** Çıkış. */
export async function signOutUser() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/** Yeniden-doğrulama: mevcut şifreyi kontrol eder (yıkıcı işlemler öncesi zorunlu). */
export async function reauthenticate(currentPassword) {
  const user = _cachedUser ?? (await getCurrentUser());
  if (!user?.email) throw new Error('Oturum bulunamadı.');
  const { error } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPassword });
  if (error) throw new Error('Mevcut şifre hatalı.');
  return user;
}

/** Şifre değiştir: önce mevcut şifreyle yeniden-doğrula, sonra güncelle. */
export async function changePassword(currentPassword, newPassword) {
  await reauthenticate(currentPassword);
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

/** onAuthStateChanged karşılığı — INITIAL_SESSION + değişimlerde çağrılır. Unsubscribe döner. */
export function onAuthChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null);
  });
  return () => data.subscription.unsubscribe();
}

// Firebase auth error kodlarını kullanıcı mesajına çeviren mevcut UI'ları
// bozmamak için Supabase hatalarını benzer mesajlara eşleyen yardımcı.
export function authErrorMessage(err) {
  const msg = (err?.message || '').toLowerCase();
  if (msg.includes('already registered') || msg.includes('already been registered')) return 'Bu e-posta zaten kullanımda.';
  if (msg.includes('invalid login credentials')) return 'E-posta veya şifre hatalı.';
  if (msg.includes('password should be at least')) return 'Şifre en az 6 karakter olmalı.';
  if (msg.includes('email not confirmed')) return 'E-postanı doğrulaman gerekiyor.';
  return 'Bir hata oluştu, tekrar dene.';
}
