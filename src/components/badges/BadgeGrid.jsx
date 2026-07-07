import React from 'react';
import BadgeCard from './BadgeCard';

// Rozet ızgarası. limit verilirse kazanılanlar öne alınıp ilk N rozet gösterilir.
export default function BadgeGrid({ catalog, earnedIds, limit }) {
  const earned = new Set(earnedIds);
  let list = catalog;
  if (limit) {
    list = [...catalog]
      .sort((a, b) => (earned.has(b.id) ? 1 : 0) - (earned.has(a.id) ? 1 : 0))
      .slice(0, limit);
  }
  return (
    <div className="badge-grid">
      {list.map(b => <BadgeCard key={b.id} badge={b} unlocked={earned.has(b.id)} />)}
    </div>
  );
}
