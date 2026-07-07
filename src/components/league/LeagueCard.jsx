import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useUserStats } from '../../contexts/UserStatsContext';
import { getTierMeta } from '../../utils/league';

// Öğrenci panosu: lig özeti — tier rozeti + haftalık XP, Lig sayfasına bağlar.
export default function LeagueCard() {
  const { gamification } = useUserStats();
  const league = gamification?.league;
  if (!league) return null;

  const meta = getTierMeta(league.tier);

  return (
    <Link to="/student/league" className="ds-card block">
      <div className="flex items-center gap-3">
        <div
          className="flex items-center justify-center w-14 h-14 rounded-2xl text-3xl flex-shrink-0"
          style={{ background: `${meta.color}22`, border: `1px solid ${meta.color}55` }}
          aria-hidden="true"
        >
          {meta.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-white">{meta.label}</div>
          <div className="text-xs text-slate-400">Bu hafta {league.weeklyXP || 0} Puan</div>
        </div>
        <ChevronRight size={18} className="text-slate-500" aria-hidden="true" />
      </div>
    </Link>
  );
}
