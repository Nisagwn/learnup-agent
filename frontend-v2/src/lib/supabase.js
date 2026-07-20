import { createClient } from '@supabase/supabase-js'

// Kimlik sağlayıcı = Supabase Auth. Oturum localStorage'da tutulur, token otomatik yenilenir.
// Eski frontend/ ile AYNI proje → aynı kullanıcılar iki arayüzde de geçerli.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
)
