import React from 'react';
import { Sun, CheckCircle2, Target } from 'lucide-react';
import { useUserStats } from '../../contexts/UserStatsContext';

// Günün özeti: bugün çözülen soru, bugünkü doğruluk %, kalan günlük hedef.
// Tamamı UserStatsContext'ten (ekstra okuma yok).
export default function TodayBriefCard() {
  const { stats, weeklyData, userProfile } = useUserStats();

  const today = (weeklyData && weeklyData.length) ? weeklyData[weeklyData.length - 1] : {};
  const todayAnswered = (today['Doğru'] || 0) + (today['Yanlış'] || 0) + (today['Boş'] || 0);
  const accuracy = todayAnswered > 0 ? Math.round(((today['Doğru'] || 0) / todayAnswered) * 100) : 0;
  const solvedToday = stats?.todaySolved || 0;
  const goal = Number(userProfile?.dailyGoal) || 20;
  const remaining = Math.max(0, goal - solvedToday);

  return (
    <section className="ds-card mb-5">
      <div className="flex items-center gap-2 mb-3">
        <Sun size={18} className="text-amber-400" aria-hidden="true" />
        <h3 className="font-bold text-white">Bugünün Özeti</h3>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="ds-card ds-card--compact text-center">
          <Target size={18} className="mx-auto text-lime-600" aria-hidden="true" />
          <div className="text-lg font-bold text-white mt-1">{solvedToday}</div>
          <div className="text-[11px] text-slate-400">Çözülen</div>
        </div>
        <div className="ds-card ds-card--compact text-center">
          <CheckCircle2 size={18} className="mx-auto text-emerald-400" aria-hidden="true" />
          <div className="text-lg font-bold text-white mt-1">%{accuracy}</div>
          <div className="text-[11px] text-slate-400">Doğruluk</div>
        </div>
        <div className="ds-card ds-card--compact text-center">
          <Sun size={18} className="mx-auto text-amber-400" aria-hidden="true" />
          <div className="text-lg font-bold text-white mt-1">{remaining}</div>
          <div className="text-[11px] text-slate-400">Kalan hedef</div>
        </div>
      </div>
      {remaining === 0 && solvedToday > 0 && (
        <p className="text-xs text-emerald-300 mt-3 text-center">Günlük hedefini tamamladın! 🎉</p>
      )}
    </section>
  );
}
