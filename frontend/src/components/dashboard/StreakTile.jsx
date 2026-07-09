import React, { useState } from 'react';
import { Flame, Snowflake } from 'lucide-react';
import { useUserStats } from '../../contexts/UserStatsContext';
import StreakFreezeModal from '../badges/StreakFreezeModal';

const MILESTONES = [7, 30, 100, 365];

export default function StreakTile() {
  const { gamification, stats } = useUserStats();
  const [freezeOpen, setFreezeOpen] = useState(false);
  const streak = gamification?.streak || {};
  const count = stats?.streakDays || 0;
  const freezes = streak.freezesAvailable || 0;
  const longest = Math.max(streak.longest || 0, count);
  const next = MILESTONES.find((m) => m > count) || null;
  const prev = [...MILESTONES].reverse().find((m) => m <= count) || 0;
  const progress = next ? Math.round(((count - prev) / (next - prev)) * 100) : 100;

  return (
    <article className="focus-tile focus-tile--streak">
      <header className="focus-tile__head">
        <span className="focus-tile__kicker">Seri</span>
        {freezes > 0 && (
          <span className="focus-tile__freeze" title={`${freezes} seri korumam var`}>
            <Snowflake size={12} aria-hidden="true" />
            ×{freezes}
          </span>
        )}
      </header>

      <div className="focus-tile__body">
        <div className="streak-tile__icon" aria-hidden="true">
          <Flame size={28} />
        </div>
        <div className="focus-tile__meta">
          <strong className="focus-tile__big">{count}</strong>
          <span className="focus-tile__sub">{count === 0 ? 'gün — başla' : 'günlük seri'}</span>
        </div>
      </div>

      {next ? (
        <div className="streak-tile__progress">
          <div className="streak-tile__progress-track">
            <div className="streak-tile__progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <span className="streak-tile__progress-label">
            Sonraki: <strong>{next} gün</strong>
          </span>
        </div>
      ) : (
        <p className="streak-tile__hint">En yüksek kademedesin 🏆</p>
      )}

      {longest > 0 && (
        <p className="streak-tile__longest">En uzun: <strong>{longest}</strong> gün</p>
      )}

      <button
        type="button"
        onClick={() => setFreezeOpen(true)}
        className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold"
        style={{ color: 'var(--accent-primary)' }}
      >
        <Snowflake size={12} aria-hidden="true" /> Seriyi Dondur
      </button>

      <StreakFreezeModal isOpen={freezeOpen} onClose={() => setFreezeOpen(false)} />
    </article>
  );
}
