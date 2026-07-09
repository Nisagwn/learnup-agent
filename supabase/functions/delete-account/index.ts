// deleteAccount (KVKK) — auth kullanıcısını siler; tüm veri ON DELETE CASCADE ile gider.
// Çağıran JWT'sinden uid çözülür; başka kimse silinemez.
import { preflight, json, getAdmin, resolveUserId } from '../_shared/http.ts';

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);
  try {
    const admin = getAdmin();
    const userId = await resolveUserId(req, admin);
    if (!userId) return json({ error: 'Oturum bulunamadı.' }, 401);

    // auth.users silinince profiles + tüm user_id referanslı satırlar cascade siler.
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) return json({ error: error.message || 'Hesap silinemedi.' }, 500);
    return json({ success: true });
  } catch (err: any) {
    return json({ error: err?.message || 'Sunucu hatası.' }, 500);
  }
});
