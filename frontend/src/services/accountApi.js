// ============================================================
// Hesap silme (KVKK, yıkıcı). Auth kullanıcısını + verisini silmek
// service_role gerektirir → Supabase Edge Function 'delete-account' çağrılır.
// Çağrıdan ÖNCE authApi.reauthenticate ile yeniden-doğrulama ZORUNLU.
// Not: Edge Function backend aşamasında deploy edilecek.
// ============================================================
import { supabase } from '../supabase';

export async function deleteAccount() {
  const { data, error } = await supabase.functions.invoke('delete-account', { body: {} });
  if (error) throw new Error(error.message || 'Hesap silinemedi.');
  return data ?? {};
}
