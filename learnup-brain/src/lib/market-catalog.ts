// Bahçe market kataloğu — sunucu otoritesi (client marketCatalog.js + treeAssets.js ile birebir).
// (Edge `purchase-garden-item` + `remove-plant` içindeki katalog/yardımcılar buraya toplandı.)

export type CatItem = { price: number; kind: string; unlockBadge: string | null }

const SEED_PRICE: Record<string, number> = { common: 20, uncommon: 50, rare: 120, epic: 300, legendary: 800 }

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
}

// Dekor & özel: sabit fiyat.
const DECOR: Record<string, number> = {
  decor_mushroom_red_lg: 150, decor_mushroom_red_md: 90, decor_mushroom_red_sm: 30,
  decor_mushroom_chanterelle_lg: 50, decor_mushroom_chanterelle_md: 35, decor_mushroom_chanterelle_sm: 20,
  decor_mushroom_beige: 25,
  decor_idol_deer: 100, decor_idol_human: 100, decor_idol_wolf: 100, decor_idol_dragon: 180,
  decor_gazebo_v1: 200, decor_gazebo_v2: 320,
}
const SPECIAL: Record<string, number> = { special_ent_male: 500, special_ent_female: 500 }

/** itemId → katalog kaydı (fiyat, envanter türü, rozet kilidi). Yoksa null. */
export function getCatalogItem(itemId: string): CatItem | null {
  for (const [plantType, def] of Object.entries(TREES)) {
    const base = SEED_PRICE[def.rarity] ?? 20
    if (itemId === `${plantType}_seed`) return { price: base, kind: 'seed', unlockBadge: def.unlockBadge }
    if (itemId === `${plantType}_mature`) return { price: base * 5, kind: 'tree', unlockBadge: def.unlockBadge }
  }
  if (itemId in DECOR) return { price: DECOR[itemId], kind: 'decor', unlockBadge: null }
  if (itemId in SPECIAL) return { price: SPECIAL[itemId], kind: 'special', unlockBadge: null }
  return null
}

/** item_id → envanter kind (remove-plant iadesi için). */
export function kindForItem(itemId: string): string {
  if (itemId.endsWith('_seed')) return 'seed'
  if (itemId.endsWith('_mature')) return 'tree'
  if (itemId.startsWith('decor_')) return 'decor'
  if (itemId.startsWith('special_')) return 'special'
  return 'seed'
}
