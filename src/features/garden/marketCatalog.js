// ============================================================
// Market kataloğu — tohum/olgun ağaçlar + dekor + özel. Fiyatlar mobil ile birebir.
// ============================================================
import { TREE_DEFINITIONS } from './treeAssets';

const SEED_PRICE = { common: 20, uncommon: 50, rare: 120, epic: 300, legendary: 800 };

// kind: 'seed' | 'tree' | 'decor' | 'special'
// form: 'seed' | 'mature'   eternal: büyümez (form 'mature')
const items = {};
const add = (it) => { items[it.id] = it; };

// ── Ağaçlar: her tür için tohum + olgun ──
Object.entries(TREE_DEFINITIONS).forEach(([plantType, def]) => {
  const seedPrice = SEED_PRICE[def.rarity] ?? 20;
  add({
    id: `${plantType}_seed`, kind: 'seed', form: 'seed', plantType,
    name: `${def.name} Tohumu`, emoji: def.emoji, rarity: def.rarity,
    price: seedPrice, unlockBadge: def.unlockBadge || null,
    growthSeconds: def.growthSeconds, eternal: false,
  });
  add({
    id: `${plantType}_mature`, kind: 'tree', form: 'mature', plantType,
    name: `Olgun ${def.name}`, emoji: def.emoji, rarity: def.rarity,
    price: seedPrice * 5, unlockBadge: def.unlockBadge || null,
    growthSeconds: def.growthSeconds, eternal: true,
  });
});

// ── Dekor (sabit fiyat, eternal) ──
const DECOR = [
  ['decor_mushroom_red_lg', 'Sinek Mantarı (Büyük)', '🍄', 150, 'epic'],
  ['decor_mushroom_red_md', 'Sinek Mantarı (Orta)', '🍄', 90, 'rare'],
  ['decor_mushroom_red_sm', 'Sinek Mantarı (Küçük)', '🍄', 30, 'common'],
  ['decor_mushroom_chanterelle_lg', 'Horoz Mantarı (Büyük)', '🟡', 50, 'uncommon'],
  ['decor_mushroom_chanterelle_md', 'Horoz Mantarı (Orta)', '🟡', 35, 'common'],
  ['decor_mushroom_chanterelle_sm', 'Horoz Mantarı (Küçük)', '🟡', 20, 'common'],
  ['decor_mushroom_beige', 'Yeşilimsi Mantar', '🟢', 25, 'common'],
  ['decor_idol_deer', 'Geyik Totem', '🦌', 100, 'rare'],
  ['decor_idol_human', 'İnsan Totem', '🗿', 100, 'rare'],
  ['decor_idol_wolf', 'Kurt Totem', '🐺', 100, 'rare'],
  ['decor_idol_dragon', 'Ejder Totem', '🐉', 180, 'epic'],
  ['decor_gazebo_v1', 'Yaşayan Gazebo I', '⛺', 200, 'rare'],
  ['decor_gazebo_v2', 'Yaşayan Gazebo II', '⛺', 320, 'epic'],
];
DECOR.forEach(([id, name, emoji, price, rarity]) => add({
  id, kind: 'decor', form: 'mature', name, emoji, rarity, price, unlockBadge: null, eternal: true,
}));

// ── Özel (Orman Cini) ──
[
  ['special_ent_male', 'Erkek Orman Cini', '🌳', 500, 'legendary'],
  ['special_ent_female', 'Dişi Orman Cini', '🌳', 500, 'legendary'],
].forEach(([id, name, emoji, price, rarity]) => add({
  id, kind: 'special', form: 'mature', name, emoji, rarity, price, unlockBadge: null, eternal: true,
}));

export const CATALOG = items;
export const CATALOG_LIST = Object.values(items);

export function getItem(itemId) {
  return items[itemId] || null;
}

// Satın alınabilir mi: yeterli coin VE (rozet kilidi yoksa ya da kullanıcıda varsa).
export function canPurchase(item, coins, unlockedBadgeIds = []) {
  if (!item) return false;
  if ((coins || 0) < item.price) return false;
  if (item.unlockBadge && !unlockedBadgeIds.includes(item.unlockBadge)) return false;
  return true;
}

const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

// Market için rarity gruplu liste: [{ rarity, items[] }]
export function groupedByRarity() {
  const groups = RARITY_ORDER.map((rarity) => ({
    rarity,
    items: CATALOG_LIST.filter((it) => it.rarity === rarity),
  })).filter((g) => g.items.length > 0);
  return groups;
}
