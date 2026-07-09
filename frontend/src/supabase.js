// Supabase client — Firebase'in yerini alır (auth + veritabanı + realtime + storage).
// Ortam değişkenleri .env dosyasından okunur (VITE_ önekli olmalı ki Vite tarayıcıya sunsun).
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY eksik. .env dosyanı doldur.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,     // oturumu localStorage'da tut (Firebase'deki gibi kalıcı)
    autoRefreshToken: true,   // access token'ı otomatik yenile
    detectSessionInUrl: true, // e-posta doğrulama / OAuth dönüşlerini yakala
  },
});

export default supabase;
