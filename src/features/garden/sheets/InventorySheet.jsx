import React, { useMemo, useState } from 'react';
import BottomSheet, { ItemThumb } from './BottomSheet';
import { getItem } from '../marketCatalog';
import { RARITY_TONE } from '../gardenLogic';

const FILTERS = [
  { key: 'all', label: 'Tümü' },
  { key: 'seed', label: 'Tohum' },
  { key: 'tree', label: 'Ağaç' },
  { key: 'decor', label: 'Dekor' },
  { key: 'special', label: 'Özel' },
];
const trunc = (s) => (s && s.length > 12 ? `${s.slice(0, 12)}…` : s || '');

// "Ağıl" — envanterdeki itemlar. Item'a basılı tut → bahçeye sürükle (onItemPointerDown).
export default function InventorySheet({ open, onClose, inventory, onItemPointerDown, dim = false }) {
  const [filter, setFilter] = useState('all');

  const resolved = useMemo(() => (inventory || [])
    .map((inv) => ({ inv, item: getItem(inv.itemId) }))
    .filter((r) => r.item), [inventory]);

  const filtered = filter === 'all' ? resolved : resolved.filter((r) => r.item.kind === filter);
  const shown = filtered.slice(0, 16);
  const extra = filtered.length - shown.length;

  return (
    <BottomSheet open={open} onClose={onClose} dim={dim} title="Ağıl 🎒" subtitle="Item'a basılı tut → bahçeye sürükle ve bırak" maxHeight="58vh">
      <div className="gp-inv-filters">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" className={`gp-chip${filter === f.key ? ' gp-chip--on' : ''}`} onClick={() => setFilter(f.key)}>
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="gp-empty-note">Bu kategoride item yok. Markete uğra 🛍</div>
      ) : (
        <div className="gp-inv-grid">
          {shown.map(({ inv, item }) => {
            const tone = RARITY_TONE[item.rarity] || RARITY_TONE.common;
            return (
              <div
                key={inv.itemId}
                className="gp-inv-item"
                style={{ borderColor: tone.fg, background: tone.soft }}
                onPointerDown={(e) => onItemPointerDown?.(item, e)}
                role="button"
                tabIndex={0}
                aria-label={`${item.name}, ${inv.count} adet`}
                title={item.name}
              >
                <span className="gp-inv-count">×{inv.count}</span>
                <ItemThumb item={item} size={42} />
                <span className="gp-inv-name" style={{ color: tone.fg }}>{trunc(item.name)}</span>
              </div>
            );
          })}
          {extra > 0 && <div className="gp-inv-more">+{extra} daha</div>}
        </div>
      )}
    </BottomSheet>
  );
}
