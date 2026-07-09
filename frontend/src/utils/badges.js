// Rozet kataloğu — SADECE okuma/gösterim (saf modül; React/Firebase importu yok).
// Rozet KAZANIMI backend'de (recordAnswer → users/{uid}.unlockedBadges). Web yeniden
// hesaplama YAPMAZ — burada `check` yoktur; yalnız katalog + normalize yardımcıları.
// Mobil "Rozetler" ekranıyla birebir: 31 rozet, 7 aile.

// ── 7 AİLE (ekran sırası önemli) ──
// gradKey: web temasındaki gradient adı; yoksa tone renginden açık→koyu gradient üretilir.
export const BADGE_FAMILIES = [
  { id: 'seed',     label: 'Tohum',  icon: '🌰', desc: 'Köklerin derinleşmesi',      gradKey: 'success', tone: '#16A34A' },
  { id: 'soil',     label: 'Toprak', icon: '💧', desc: 'Damladan okyanusa',           gradKey: 'ocean',   tone: '#3B82F6' },
  { id: 'branch',   label: 'Dal',    icon: '🌿', desc: 'Kökten taca yükseliş',        gradKey: 'mint',    tone: '#10B981' },
  { id: 'flower',   label: 'Çiçek',  icon: '🌸', desc: 'Konu hakimiyetiyle açılan',   gradKey: 'sunset',  tone: '#FB923C' },
  { id: 'season',   label: 'Mevsim', icon: '🍂', desc: 'Yıl döngüsünün izleri',       gradKey: 'league',  tone: '#F59E0B' },
  { id: 'discover', label: 'Keşif',  icon: '🦋', desc: 'Sürpriz ve özel anlar',       gradKey: 'brand',   tone: '#15803D' },
  { id: 'star',     label: 'Yıldız', icon: '⭐', desc: 'Diğer rozetlerin rozeti',     gradKey: 'grape',   tone: '#FBBF24' },
];

// ── 31 ROZET (id | family | name | desc | emoji | color) ──
export const BADGE_CATALOG = [
  // Tohum (streak)
  { id: 'seed_3',      family: 'seed',   name: 'Tohum',         desc: '3 gün üst üste çalış',    emoji: '🌰',  color: '#65A30D' },
  { id: 'sprout_7',    family: 'seed',   name: 'Filiz',         desc: '7 gün üst üste çalış',    emoji: '🌱',  color: '#16A34A' },
  { id: 'sapling_30',  family: 'seed',   name: 'Fidan',         desc: '30 gün üst üste çalış',   emoji: '🌲',  color: '#15803D' },
  { id: 'tree_60',     family: 'seed',   name: 'Genç Ağaç',     desc: '60 gün üst üste çalış',   emoji: '🌳',  color: '#166534' },
  { id: 'ancient_100', family: 'seed',   name: 'Asırlık Çınar', desc: '100 gün üst üste çalış',  emoji: '🌲',  color: '#14532D' },
  // Toprak (çözüm hacmi)
  { id: 'drop_25',     family: 'soil',   name: 'Çiy Damlası',   desc: '25 soru çöz',             emoji: '💧',  color: '#22D3EE' },
  { id: 'rain_100',    family: 'soil',   name: 'Yağmur',        desc: '100 soru çöz',            emoji: '🌧️', color: '#0EA5E9' },
  { id: 'river_500',   family: 'soil',   name: 'Nehir',         desc: '500 soru çöz',            emoji: '🌊',  color: '#2563EB' },
  { id: 'ocean_1000',  family: 'soil',   name: 'Okyanus',       desc: '1000 soru çöz',           emoji: '🌊',  color: '#1D4ED8' },
  // Dal (seviye)
  { id: 'root_lv2',    family: 'branch', name: 'Köksalış',      desc: '2. seviyeye ulaş',                 emoji: '🌿',  color: '#34D399' },
  { id: 'shoot_lv3',   family: 'branch', name: 'Sürgün',        desc: '3. seviyeye ulaş (Savaşçı)',       emoji: '🌱',  color: '#10B981' },
  { id: 'branch_lv5',  family: 'branch', name: 'Dal Atış',      desc: '5. seviyeye ulaş (Uzman)',         emoji: '🌳',  color: '#059669' },
  { id: 'crown_lv7',   family: 'branch', name: 'Taç',           desc: '7. seviyeye ulaş (Efsane)',        emoji: '👑',  color: '#047857' },
  { id: 'glow_lv8',    family: 'branch', name: 'Işıltı',        desc: '8. seviyeye ulaş (İlluminati)',    emoji: '✨',  color: '#065F46' },
  // Çiçek (ustalık)
  { id: 'bloom_80',     family: 'flower', name: 'İlk Çiçek',    desc: 'Bir konuda %80+ ustalık',          emoji: '🌸',  color: '#FB923C' },
  { id: 'spring_3',     family: 'flower', name: 'Bahar',        desc: '3 konuda %80+ ustalık',            emoji: '🌷',  color: '#EC4899' },
  { id: 'garden_5',     family: 'flower', name: 'Bahçe',        desc: '5 konuda %80+ ustalık',            emoji: '🌺',  color: '#DB2777' },
  { id: 'paradise_100', family: 'flower', name: 'Cennet',       desc: '3 konuda %100 ustalık',            emoji: '🪷',  color: '#BE185D' },
  // Mevsim (uygulama yaşı)
  { id: 'spring_30d',  family: 'season', name: 'İlkbahar',      desc: '30 gün boyunca öğrencimiz oldun',  emoji: '🌷',  color: '#FBBF24' },
  { id: 'summer_90d',  family: 'season', name: 'Yaz',           desc: '90 gün boyunca öğrencimiz oldun',  emoji: '☀️', color: '#F59E0B' },
  { id: 'autumn_180d', family: 'season', name: 'Sonbahar',      desc: '180 gün boyunca öğrencimiz oldun', emoji: '🍂',  color: '#D97706' },
  { id: 'winter_365d', family: 'season', name: 'Kış',           desc: '1 yıl boyunca öğrencimiz oldun',   emoji: '❄️', color: '#B45309' },
  // Keşif (placeholder — backend otomatik vermiyorsa hep kilitli görünür)
  { id: 'early_bird',  family: 'discover', name: 'Erken Kuş',   desc: 'Sabah 06–08 arası quiz çöz',                       emoji: '🐦',  color: '#FB923C' },
  { id: 'night_owl',   family: 'discover', name: 'Gece Kuşu',   desc: 'Gece 23–01 arası quiz çöz',                        emoji: '🦉',  color: '#15803D' },
  { id: 'phoenix',     family: 'discover', name: 'Anka',        desc: 'Streak bozulduktan sonra 30 gün geri kazan',       emoji: '🔥',  color: '#DC2626' },
  { id: 'butterfly',   family: 'discover', name: 'Kelebek',     desc: '5 farklı dersten quiz çöz',                        emoji: '🦋',  color: '#15803D' },
  { id: 'bee',         family: 'discover', name: 'Arı',         desc: 'Bir günde 50+ doğru cevap',                        emoji: '🐝',  color: '#FBBF24' },
  // Yıldız (meta — rozet yüzdesi)
  { id: 'sky_50pct',     family: 'star', name: 'Gökyüzü',       desc: "Rozetlerin %50'sini topla",        emoji: '🌌',  color: '#84CC16' },
  { id: 'galaxy_75pct',  family: 'star', name: 'Galaksi',       desc: "Rozetlerin %75'ini topla",         emoji: '🌠',  color: '#15803D' },
  { id: 'cosmos_100pct', family: 'star', name: 'Kozmos',        desc: 'Tüm rozetleri topla',              emoji: '✨',  color: '#15803D' },
  { id: 'legend_first',  family: 'star', name: 'Efsane',        desc: "Lv 8 (İlluminati)'ye ulaş",        emoji: '👑',  color: '#FBBF24' },
];

// ── Eski ID → yeni ID (geriye uyum; eski kazanımlar kaybolmasın) ──
export const legacyBadgeIdMap = {
  streak_3: 'seed_3', streak_7: 'sprout_7', streak_30: 'sapling_30', streak_100: 'ancient_100',
  solved_25: 'drop_25', solved_100: 'rain_100', solved_500: 'river_500',
  level_3: 'shoot_lv3', level_5: 'branch_lv5', level_8: 'glow_lv8',
  mastery_80: 'bloom_80', mastery_100: 'paradise_100',
};

/**
 * Ham unlockedBadges map'ini eski ID'leri yeniye çevirerek normalize eder.
 * Yalnız truthy değerleri korur (timestamp varsa onu tutar). Render ÖNCESİ uygula.
 */
export function normalizeUnlockedMap(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [key, val] of Object.entries(raw)) {
    if (!val) continue;                       // yalnız kazanılmış (truthy)
    const id = legacyBadgeIdMap[key] || key;  // eski → yeni
    if (out[id] == null) out[id] = val;       // mevcut değeri (ör. timestamp) koru
  }
  return out;
}

export function getBadgeById(id) {
  return BADGE_CATALOG.find((b) => b.id === id) || null;
}

export function getFamilyById(id) {
  return BADGE_FAMILIES.find((f) => f.id === id) || null;
}

export const TOTAL_BADGES = BADGE_CATALOG.length; // 31
