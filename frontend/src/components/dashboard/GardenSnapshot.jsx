import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Flame, ChevronRight } from 'lucide-react';
import { useUserStats } from '../../contexts/UserStatsContext';

// Kompakt "senin dünyan" widget'ı — USP (orman) + ödül döngüsü (altın/seri) pano üstünde görünür.
// Yeni API/route yok: mevcut useUserStats'tan okur, var olan /student/garden'a gider.
export default function GardenSnapshot() {
  const navigate = useNavigate();
  const { gamification, stats } = useUserStats();
  const coins = gamification?.coins ?? 0;
  const streak = stats?.streakDays ?? 0;

  return (
    <button type="button" className="garden-snap" onClick={() => navigate('/student/garden')} aria-label="Ormanına git">
      <div className="garden-snap__scene" aria-hidden="true" />
      <div className="garden-snap__body">
        <span className="mag-kicker">Senin Dünyan</span>
        <h3 className="garden-snap__title">🌳 Ormanın seni bekliyor</h3>
        <div className="garden-snap__stats">
          <span className="garden-snap__stat garden-snap__stat--coin">🪙 {Number(coins).toLocaleString('tr-TR')}</span>
          <span className="garden-snap__stat garden-snap__stat--streak"><Flame size={13} /> {streak} gün</span>
        </div>
      </div>
      <span className="garden-snap__cta">Ormana Git <ChevronRight size={16} /></span>
    </button>
  );
}
