// purchaseGardenItem — coin ile market ürünü satın al: coin düş + envantere +1.
// Otoriter fiyat/kilit kontrolü (service-role). Katalog client marketCatalog.js ile birebir.
import { preflight, json, getAdmin, resolveUserId } from '../_shared/http.ts';

// ── Market kataloğu (marketCatalog.js + treeAssets.js ile birebir; sunucu otoritesi) ──
type CatItem = { price: number; kind: string; unlockBadge: string | null };

const SEED_PRICE: Record<string, number> = { common: 20, uncommon: 50, rare: 120, epic: 300, legendary: 800 };

// plantType → { rarity, unlockBadge }
const TREES: Record<string, { rarity: string; unlockBadge: string | null }> = {
  sogut: { rarity: 'common', unlockBadge: null },
  akca_agac: { rarity: 'common', unlockBadge: null },
  mavi_cam: { rarity: 'uncommon', unlockBadge: null },
  egri_agac: { rarity: 'uncommon', unlockBadge: null },
  dev_agac: { rarity: 'rare', unlockBadge: null },
  burgu: { rarity: 'rare', unlockBadge: null },
  isik_agaci: { rarity: 'epic', unlockBadge: 'bloom_80' },
  parilti: { rarity: 'legendary', unlockBadge: 'phoenix' },
};

// Dekor & özel: sabit fiyat.
const DECOR: Record<string, number> = {
  decor_mushroom_red_lg: 150, decor_mushroom_red_md: 90, decor_mushroom_red_sm: 30,
  decor_mushroom_chanterelle_lg: 50, decor_mushroom_chanterelle_md: 35, decor_mushroom_chanterelle_sm: 20,
  decor_mushroom_beige: 25,
  decor_idol_deer: 100, decor_idol_human: 100, decor_idol_wolf: 100, decor_idol_dragon: 180,
  decor_gazebo_v1: 200, decor_gazebo_v2: 320,
};
const SPECIAL: Record<string, number> = { special_ent_male: 500, special_ent_female: 500 };

function getCatalogItem(itemId: string): CatItem | null {
  for (const [plantType, def] of Object.entries(TREES)) {
    const base = SEED_PRICE[def.rarity] ?? 20;
    if (itemId === `${plantType}_seed`) return { price: base, kind: 'seed', unlockBadge: def.unlockBadge };
    if (itemId === `${plantType}_mature`) return { price: base * 5, kind: 'tree', unlockBadge: def.unlockBadge };
  }
  if (itemId in DECOR) return { price: DECOR[itemId], kind: 'decor', unlockBadge: null };
  if (itemId in SPECIAL) return { price: SPECIAL[itemId], kind: 'special', unlockBadge: null };
  return null;
}

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);
  try {
    const admin = getAdmin();
    const userId = await resolveUserId(req, admin);
    if (!userId) return json({ error: 'userId gerekli.' }, 401);

    const { itemId } = await req.json().catch(() => ({}));
    if (!itemId) return json({ error: 'itemId gerekli.' }, 400);

    const item = getCatalogItem(String(itemId));
    if (!item) return json({ error: 'Ürün bulunamadı.' }, 400);

    const { data: profile } = await admin.from('profiles')
      .select('gamification, unlocked_badges').eq('id', userId).single();
    const userData: any = profile || {};

    // Rozet kilidi
    if (item.unlockBadge) {
      const owned = Object.keys(userData.unlocked_badges || {});
      if (!owned.includes(item.unlockBadge)) return json({ error: 'Bu ürün kilitli.' }, 403);
    }

    const g = { ...(userData.gamification || {}) };
    const coins = Number(g.coins) || 0;
    if (coins < item.price) return json({ error: 'Yetersiz coin.' }, 400);

    g.coins = coins - item.price;
    const { error: profErr } = await admin.from('profiles').update({ gamification: g }).eq('id', userId);
    if (profErr) return json({ error: profErr.message }, 500);

    // Envanter: +1
    const { data: invRow } = await admin.from('inventory')
      .select('count').eq('user_id', userId).eq('item_id', String(itemId)).maybeSingle();
    const newCount = (Number(invRow?.count) || 0) + 1;
    const { error: invErr } = await admin.from('inventory').upsert({
      user_id: userId, item_id: String(itemId), kind: item.kind, count: newCount,
    }, { onConflict: 'user_id,item_id' });
    if (invErr) return json({ error: invErr.message }, 500);

    return json({ coins: g.coins, itemId: String(itemId), newCount });
  } catch (err: any) {
    return json({ error: err?.message || 'Sunucu hatası.' }, 500);
  }
});
