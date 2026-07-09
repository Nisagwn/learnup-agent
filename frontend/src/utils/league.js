// Lig tier meta verisi — frontend gösterimi (functions/lib/league.js ile uyumlu).

export const TIERS = ['bronze', 'silver', 'gold', 'sapphire', 'diamond'];

export const TIER_META = {
  bronze:   { label: 'Bronz Lig', emoji: '🥉', color: '#CD7C3A' },
  silver:   { label: 'Gümüş Lig', emoji: '🥈', color: '#94A3B8' },
  gold:     { label: 'Altın Lig', emoji: '🥇', color: '#FBBF24' },
  sapphire: { label: 'Safir Lig', emoji: '💎', color: '#38BDF8' },
  diamond:  { label: 'Elmas Lig', emoji: '👑', color: '#A78BFA' },
};

// Her hafta ilk 7 terfi, son 5 küme düşer (functions/lib/league.js ile aynı).
export const PROMOTE_COUNT = 7;
export const RELEGATE_COUNT = 5;

export const getTierMeta = (tier) => TIER_META[tier] || TIER_META.bronze;
