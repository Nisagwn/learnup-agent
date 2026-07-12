import { createClient } from '@supabase/supabase-js'
import { env } from '../config/env.js'

/**
 * Supabase — SERVICE-ROLE istemcisi.
 * RLS'i BAYPAS eder → yalnız sunucuda kullanılır, asla istemciye sızmaz.
 * Yetkilendirme (kullanıcı kapsamı) uygulama katmanında `requireAuth` + `userId` ile yapılır.
 * Stateless backend olduğundan oturum kalıcılığı/yenilemesi kapalı.
 */
export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
})
