// Firebase Auth hata kodlarını kullanıcıya gösterilecek TR metne çevirir.
// Eşleşme yoksa null döner → çağıran taraf e.message'a düşer.
export function mapAuthError(code) {
  switch (code) {
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
      return 'Mevcut şifre yanlış.';
    case 'auth/weak-password':
      return 'Şifre çok zayıf (en az 6 karakter).';
    case 'auth/requires-recent-login':
      return 'Güvenlik için tekrar giriş yapman gerekiyor.';
    case 'auth/too-many-requests':
      return 'Çok fazla deneme yapıldı. Lütfen biraz sonra tekrar dene.';
    case 'auth/network-request-failed':
      return 'Ağ hatası. Bağlantını kontrol et.';
    case 'auth/user-mismatch':
      return 'Bu kimlik bilgisi mevcut hesapla eşleşmiyor.';
    default:
      return null;
  }
}
