// plantSeed — envanterden bir ürün düş, bahçeye 'seed' evresinde yeni bitki ekle.
import { preflight, json, getAdmin, resolveUserId } from '../_shared/http.ts';

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);
  try {
    const admin = getAdmin();
    const userId = await resolveUserId(req, admin);
    if (!userId) return json({ error: 'userId gerekli.' }, 401);

    const { itemId, x = null, y = null } = await req.json().catch(() => ({}));
    if (!itemId) return json({ error: 'itemId gerekli.' }, 400);

    // Envanterde var mı?
    const { data: invRow } = await admin.from('inventory')
      .select('count').eq('user_id', userId).eq('item_id', String(itemId)).maybeSingle();
    const count = Number(invRow?.count) || 0;
    if (count < 1) return json({ error: 'Envanterde bu üründen yok.' }, 400);

    // Envanter -1
    const { error: invErr } = await admin.from('inventory')
      .update({ count: count - 1 })
      .eq('user_id', userId).eq('item_id', String(itemId));
    if (invErr) return json({ error: invErr.message }, 500);

    // Bahçeye ekle (stage 'seed')
    const row: any = {
      user_id: userId,
      item_id: String(itemId),
      stage: 'seed',
      status: 'healthy',
    };
    if (x != null) row.x = Number(x);
    if (y != null) row.y = Number(y);

    const { data: planted, error: gErr } = await admin.from('garden')
      .insert(row).select('id').single();
    if (gErr) return json({ error: gErr.message }, 500);

    return json({ plantId: planted.id, id: planted.id });
  } catch (err: any) {
    return json({ error: err?.message || 'Sunucu hatası.' }, 500);
  }
});
