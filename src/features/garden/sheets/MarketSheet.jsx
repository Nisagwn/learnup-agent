import React, { useState } from 'react';
import { Lock } from 'lucide-react';
import BottomSheet, { ItemThumb } from './BottomSheet';
import { groupedByRarity, canPurchase } from '../marketCatalog';
import { RARITY_TONE } from '../gardenLogic';

// Market — rarity gruplu katalog. coins/rozet kontrolü; tıkla → onBuy(item).
export default function MarketSheet({ open, onClose, coins, unlockedBadgeIds = [], onBuy }) {
  const [busyId, setBusyId] = useState(null);
  const groups = groupedByRarity();

  const buy = async (item) => {
    if (busyId) return;
    setBusyId(item.id);
    try { await onBuy?.(item); } finally { setBusyId(null); }
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Market 🛍"
      subtitle="Tohum, olgun ağaç veya dekor satın al"
      maxHeight="58vh"
      headerRight={<span className="gp-panel-coin">🪙 {Number(coins || 0).toLocaleString('tr-TR')}</span>}
    >
      {groups.map((g) => {
        const tone = RARITY_TONE[g.rarity] || RARITY_TONE.common;
        return (
          <div key={g.rarity} className="gp-mk-group">
            <div className="gp-mk-grouptitle" style={{ color: tone.fg }}>{tone.label}</div>
            <div className="gp-mk-grid">
              {g.items.map((item) => {
                const locked = item.unlockBadge && !unlockedBadgeIds.includes(item.unlockBadge);
                const affordable = (coins || 0) >= item.price;
                const ok = canPurchase(item, coins, unlockedBadgeIds);
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`gp-mk-item${ok ? '' : ' gp-mk-item--off'}`}
                    style={{ borderColor: tone.fg }}
                    disabled={!ok || busyId === item.id}
                    onClick={() => buy(item)}
                    title={locked ? 'Rozet kilidi' : (!affordable ? 'Yetersiz altın' : item.name)}
                  >
                    <ItemThumb item={item} size={44} />
                    <span className="gp-mk-name">{item.name}</span>
                    <span className="gp-mk-price">
                      {locked ? <><Lock size={11} /> Kilitli</> : <>🪙 {item.price}</>}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </BottomSheet>
  );
}
