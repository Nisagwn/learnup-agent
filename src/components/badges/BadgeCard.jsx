import React from 'react';
import { Lock } from 'lucide-react';
import './badges.css';

// Tek bir rozet karosu — kilitli ise gri tonlama + kilit ikonu.
export default function BadgeCard({ badge, unlocked }) {
  return (
    <div
      className={`badge-card ${unlocked ? 'badge-card--unlocked' : 'badge-card--locked'}`}
      style={unlocked ? { borderColor: `${badge.color}55` } : undefined}
      title={badge.desc}
    >
      <div
        className="badge-card__emoji"
        style={unlocked ? { background: `${badge.color}22`, color: '#fff' } : undefined}
      >
        {unlocked ? <span aria-hidden="true">{badge.emoji}</span> : <Lock size={20} aria-hidden="true" />}
      </div>
      <div className="badge-card__name">{badge.name}</div>
      <div className="badge-card__desc">{badge.desc}</div>
    </div>
  );
}
