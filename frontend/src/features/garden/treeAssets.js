// ============================================================
// PNG registry — dosya adları mobil ile BİREBİR.
// PNG'ler: public/assets/garden/trees/*.png  (kullanıcı ekleyecek)
// PNG yoksa pickItemImage null döner → bileşen emoji fallback gösterir.
// ============================================================

const BASE = '/assets/garden/trees/';
const img = (file) => `${BASE}${file}.png`;

const DAY = 86400; // saniye

// plantType → { name, emoji, rarity, growthSeconds, unlockBadge?, images{stage→dosya} }
export const TREE_DEFINITIONS = {
  sogut: {
    name: 'Söğüt', emoji: '🌿', rarity: 'common', growthSeconds: 8 * DAY,
    images: { sprout: 'Willow1', young: 'Willow2', mature: 'Willow3' },
  },
  akca_agac: {
    name: 'Akça Ağaç', emoji: '🌳', rarity: 'common', growthSeconds: 7 * DAY,
    images: { young: 'White_tree1', mature: 'White_tree2' },
  },
  mavi_cam: {
    name: 'Mavi Çam', emoji: '🌲', rarity: 'uncommon', growthSeconds: 9 * DAY,
    images: { sprout: 'Blue-green_balls_tree1', young: 'Blue-green_balls_tree2', mature: 'Blue-green_balls_tree3' },
  },
  egri_agac: {
    name: 'Eğri Ağaç', emoji: '🪵', rarity: 'uncommon', growthSeconds: 9 * DAY,
    images: { sprout: 'Curved_tree1', young: 'Curved_tree2', mature: 'Curved_tree3' },
  },
  dev_agac: {
    name: 'Dev Ağaç', emoji: '🌳', rarity: 'rare', growthSeconds: 11 * DAY,
    images: { young: 'Mega_tree1', mature: 'Mega_tree2' },
  },
  burgu: {
    name: 'Burgu Ağacı', emoji: '🌀', rarity: 'rare', growthSeconds: 10 * DAY,
    images: { sprout: 'Swirling_tree1', young: 'Swirling_tree2', mature: 'Swirling_tree3' },
  },
  isik_agaci: {
    name: 'Işık Ağacı', emoji: '✨', rarity: 'epic', growthSeconds: 12 * DAY, unlockBadge: 'bloom_80',
    images: { sprout: 'Light_balls_tree1', young: 'Light_balls_tree2', mature: 'Light_balls_tree3' },
  },
  parilti: {
    name: 'Parıltı Ağacı', emoji: '🌟', rarity: 'legendary', growthSeconds: 14 * DAY, unlockBadge: 'phoenix',
    images: { seed: 'Luminous_tree1', sprout: 'Luminous_tree2', young: 'Luminous_tree3', mature: 'Luminous_tree4' },
  },
};

// Dekor & özel itemId → tek PNG dosyası (evre yok, tam boy).
export const DECOR_IMAGES = {
  decor_mushroom_red_lg: 'White-red_mushroom1',
  decor_mushroom_red_md: 'White-red_mushroom2',
  decor_mushroom_red_sm: 'White-red_mushroom3',
  decor_mushroom_chanterelle_lg: 'Chanterelles1',
  decor_mushroom_chanterelle_md: 'Chanterelles2',
  decor_mushroom_chanterelle_sm: 'Chanterelles3',
  decor_mushroom_beige: 'Beige_green_mushroom3',
  decor_idol_deer: 'Tree_idol_deer',
  decor_idol_human: 'Tree_idol_human',
  decor_idol_wolf: 'Tree_idol_wolf',
  decor_idol_dragon: 'Tree_idol_dragon',
  decor_gazebo_v1: 'Living_gazebo1',
  decor_gazebo_v2: 'Living_gazebo2',
  special_ent_male: 'Ent_man',
  special_ent_female: 'Ent_woman',
};

const ORDER = ['seed', 'sprout', 'young', 'mature'];

// İstenen evre yoksa: önce ileri (mature'a doğru), sonra geri ara. Hiçbiri yoksa null.
export function pickTreeImage(plantType, stage) {
  const def = TREE_DEFINITIONS[plantType];
  if (!def || !def.images) return null;
  const imgs = def.images;
  if (imgs[stage]) return img(imgs[stage]);
  const idx = Math.max(0, ORDER.indexOf(stage));
  for (let i = idx + 1; i < ORDER.length; i++) if (imgs[ORDER[i]]) return img(imgs[ORDER[i]]);
  for (let i = idx - 1; i >= 0; i--) if (imgs[ORDER[i]]) return img(imgs[ORDER[i]]);
  return null;
}

// item = { plantType?, id? }. plantType varsa ağaç; yoksa dekor/özel; ikisi de yoksa null.
export function pickItemImage(item, stage = 'mature') {
  if (!item) return null;
  if (item.plantType) return pickTreeImage(item.plantType, stage);
  if (item.id && DECOR_IMAGES[item.id]) return img(DECOR_IMAGES[item.id]);
  return null;
}
