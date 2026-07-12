// ============================================================
// Hesap silme (KVKK, yıkıcı). Auth kullanıcısını + verisini silmek
// service_role gerektirir → Supabase Edge Function 'delete-account' çağrılır.
// Çağrıdan ÖNCE authApi.reauthenticate ile yeniden-doğrulama ZORUNLU.
// Not: Edge Function backend aşamasında deploy edilecek.
// ============================================================
import { apiInvoke } from './apiClient';

export async function deleteAccount() {
  const { data, error } = await apiInvoke('delete-account', { body: {} });
  if (error) throw new Error(error.message || 'Hesap silinemedi.');
  return data ?? {};
}
