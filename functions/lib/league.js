// Haftalık lig — tier sırası ve terfi/küme düşme kuralları (sunucu tarafı).

// Düşükten yükseğe ligler
const TIERS = ['bronze', 'silver', 'gold', 'sapphire', 'diamond'];

const TIER_META = {
  bronze:   { label: 'Bronz Lig',  emoji: '🥉', color: '#CD7C3A' },
  silver:   { label: 'Gümüş Lig',  emoji: '🥈', color: '#94A3B8' },
  gold:     { label: 'Altın Lig',  emoji: '🥇', color: '#FBBF24' },
  sapphire: { label: 'Safir Lig',  emoji: '💎', color: '#38BDF8' },
  diamond:  { label: 'Elmas Lig',  emoji: '👑', color: '#A78BFA' },
};

// Her hafta sonu: ilk PROMOTE_COUNT terfi, son RELEGATE_COUNT küme düşer.
const PROMOTE_COUNT = 7;
const RELEGATE_COUNT = 5;

function tierIndex(tier) {
  const i = TIERS.indexOf(tier);
  return i < 0 ? 0 : i;
}

function promoteTier(tier) {
  return TIERS[Math.min(TIERS.length - 1, tierIndex(tier) + 1)];
}

function relegateTier(tier) {
  return TIERS[Math.max(0, tierIndex(tier) - 1)];
}

/**
 * Bir tier grubunun haftalık sonucunu hesaplar.
 * @param {Array} entries - [{ uid, weeklyXP, ... }] (sıralı olması gerekmez)
 * @returns {Array} [{ uid, oldTier, newTier, outcome:'promote'|'relegate'|'stay' }]
 */
function resolveTierWeek(entries, tier) {
  const sorted = [...entries].sort((a, b) => (b.weeklyXP || 0) - (a.weeklyXP || 0));
  return sorted.map((e, idx) => {
    let outcome = 'stay';
    let newTier = tier;
    if (idx < PROMOTE_COUNT && tier !== 'diamond') {
      outcome = 'promote';
      newTier = promoteTier(tier);
    } else if (idx >= sorted.length - RELEGATE_COUNT && tier !== 'bronze') {
      outcome = 'relegate';
      newTier = relegateTier(tier);
    }
    return { uid: e.uid, oldTier: tier, newTier, outcome, rank: idx + 1 };
  });
}

module.exports = {
  TIERS,
  TIER_META,
  PROMOTE_COUNT,
  RELEGATE_COUNT,
  promoteTier,
  relegateTier,
  resolveTierWeek,
};
