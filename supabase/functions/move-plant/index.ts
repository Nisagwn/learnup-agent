// movePlant — bahçedeki bir bitkinin konumunu (ve isteğe bağlı ölçeğini) güncelle. Yalnız kendi satırı.
import { preflight, json, getAdmin, resolveUserId } from '../_shared/http.ts';

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);
  try {
    const admin = getAdmin();
    const userId = await resolveUserId(req, admin);
    if (!userId) return json({ error: 'userId gerekli.' }, 401);

    const { plantId, x = null, y = null, scale = null } = await req.json().catch(() => ({}));
    if (!plantId) return json({ error: 'plantId gerekli.' }, 400);

    const patch: any = {};
    if (x != null) patch.x = Number(x);
    if (y != null) patch.y = Number(y);
    if (typeof scale === 'number') patch.scale = scale;
    if (Object.keys(patch).length === 0) return json({ error: 'Güncellenecek alan yok.' }, 400);

    // Yalnız kendi satırı (user_id eşleşmezse hiçbir satır dönmez → 404).
    const { data: updated, error } = await admin.from('garden')
      .update(patch)
      .eq('id', plantId).eq('user_id', userId)
      .select('id');
    if (error) return json({ error: error.message }, 500);
    if (!updated || updated.length === 0) return json({ error: 'Bitki bulunamadı.' }, 404);

    return json({ success: true });
  } catch (err: any) {
    return json({ error: err?.message || 'Sunucu hatası.' }, 500);
  }
});
