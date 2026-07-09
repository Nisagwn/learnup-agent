// removePlant — bahçeden bir bitkiyi sök: satırı sil + ürünü envantere geri ekle (+1).
// GardenScreen "Bitki ağıla geri eklendi" der → item envantere iade edilir.
import { preflight, json, getAdmin, resolveUserId } from '../_shared/http.ts';

// item_id → envanter kind (marketCatalog.js ile birebir).
function kindForItem(itemId: string): string {
  if (itemId.endsWith('_seed')) return 'seed';
  if (itemId.endsWith('_mature')) return 'tree';
  if (itemId.startsWith('decor_')) return 'decor';
  if (itemId.startsWith('special_')) return 'special';
  return 'seed';
}

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);
  try {
    const admin = getAdmin();
    const userId = await resolveUserId(req, admin);
    if (!userId) return json({ error: 'userId gerekli.' }, 401);

    const { plantId } = await req.json().catch(() => ({}));
    if (!plantId) return json({ error: 'plantId gerekli.' }, 400);

    // Yalnız kendi satırı: item_id'yi al, sonra sil.
    const { data: plant } = await admin.from('garden')
      .select('id, item_id').eq('id', plantId).eq('user_id', userId).maybeSingle();
    if (!plant) return json({ error: 'Bitki bulunamadı.' }, 404);

    const { error: delErr } = await admin.from('garden')
      .delete().eq('id', plantId).eq('user_id', userId);
    if (delErr) return json({ error: delErr.message }, 500);

    // Ürünü envantere iade et (+1).
    const returnedItemId: string | null = plant.item_id || null;
    let newCount: number | undefined;
    if (returnedItemId) {
      const { data: invRow } = await admin.from('inventory')
        .select('count').eq('user_id', userId).eq('item_id', returnedItemId).maybeSingle();
      newCount = (Number(invRow?.count) || 0) + 1;
      const { error: invErr } = await admin.from('inventory').upsert({
        user_id: userId, item_id: returnedItemId, kind: kindForItem(returnedItemId), count: newCount,
      }, { onConflict: 'user_id,item_id' });
      if (invErr) return json({ error: invErr.message }, 500);
    }

    return json({ returnedItemId, newCount });
  } catch (err: any) {
    return json({ error: err?.message || 'Sunucu hatası.' }, 500);
  }
});
