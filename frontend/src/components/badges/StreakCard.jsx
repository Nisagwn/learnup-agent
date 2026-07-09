import React, { useState } from 'react';
import { Flame, Snowflake } from 'lucide-react';
import { useUserStats } from '../../contexts/UserStatsContext';
import StreakFreezeModal from './StreakFreezeModal';

const MILESTONES = [7, 30, 100];

// Öğrenci panosu: seri, dondurma jetonları ve sonraki kilometre taşı.
// Seri sayısı bağlamdaki birleşik değerden gelir (kalıcı varsa o, yoksa loglardan türetilen)
// — böylece aktivite kartıyla aynı değeri gösterir.
export default function StreakCard() {
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
    <section className="ds-card">
      <div className="flex items-center gap-4">
        <div
          className="flex items-center justify-center w-16 h-16 rounded-2xl flex-shrink-0"
          style={{ background: 'linear-gradient(135deg,rgba(245,158,11,0.22),rgba(239,68,68,0.16))' }}
        >
          <Flame size={32} className="text-orange-400" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-2xl font-extrabold text-white" style={{ fontFamily: "'Outfit',sans-serif" }}>
            {count} <span className="text-sm font-semibold text-slate-400">günlük seri</span>
          </div>
          <div className="text-xs text-slate-400 mt-0.5">
            {count === 0
              ? 'Bugün çalışarak serini başlat!'
              : next
                ? `Sonraki kilometre taşı: ${next} gün`
                : 'En yüksek kademedesin! 🏆'}
          </div>
        </div>
        {freezes > 0 && (
          <div
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-sky-500/10 border border-sky-500/20"
            title={`${freezes} seri dondurma — bir gün kaçırırsan serini korur`}
          >
            <Snowflake size={14} className="text-sky-300" aria-hidden="true" />
            <span className="text-sm font-bold text-sky-300">×{freezes}</span>
          </div>
        )}
      </div>

      {next && (
        <div className="mt-3 w-full h-2 bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${progress}%`, background: 'linear-gradient(90deg,#F59E0B,#EF4444)' }}
          />
        </div>
      )}

      {longest > 0 && (
        <p className="text-[11px] text-slate-500 mt-2">En uzun serin: {longest} gün</p>
      )}

      <button
        type="button"
        onClick={() => setFreezeOpen(true)}
        className="ds-btn-ghost w-full mt-3 !py-1.5 !text-xs flex items-center justify-center gap-1.5"
      >
        <Snowflake size={14} aria-hidden="true" /> Seriyi Dondur ({freezes} hak)
      </button>

      <StreakFreezeModal isOpen={freezeOpen} onClose={() => setFreezeOpen(false)} />
    </section>
  );
}
