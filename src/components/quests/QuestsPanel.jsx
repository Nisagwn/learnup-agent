import React, { useState } from 'react';
import { Target, Check, Gift } from 'lucide-react';
import { useUserStats } from '../../contexts/UserStatsContext';
import { useToast } from '../ToastProvider';
import { claimQuestReward } from '../../utils/gamificationApi';
import { celebrate } from '../../utils/celebrate';

// Öğrenci panosu / Rozetler sayfası: günlük 3 görev + ödül talep akışı.
export default function QuestsPanel() {
  const { gamification } = useUserStats();
  const { success, error } = useToast();
  const [busyId, setBusyId] = useState(null);
  const quests = gamification?.dailyQuests?.quests || [];

  const handleClaim = async (q) => {
    setBusyId(q.id);
    try {
      const res = await claimQuestReward(q.id);
      celebrate('quest');
      success('Ödül Alındı! 🎁', `+${res.rewardXP} Puan kazandın.`);
    } catch (err) {
      error('Hata', err.message || 'Ödül alınamadı.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="ds-card">
      <h3 className="font-bold text-white mb-3 flex items-center gap-2">
        <Target size={18} className="text-lime-600" aria-hidden="true" /> Günlük Görevler
      </h3>

      {quests.length === 0 ? (
        <p className="text-sm text-slate-400">Bugünün görevleri hazırlanıyor…</p>
      ) : (
        <div className="flex flex-col gap-3">
          {quests.map((q) => {
            const done = q.progress >= q.target;
            const pct = Math.min(100, Math.round((q.progress / q.target) * 100));
            return (
              <div key={q.id} className="bg-white/5 border border-white/5 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-lg" aria-hidden="true">{q.emoji}</span>
                  <span className="text-sm font-semibold text-white flex-1 min-w-0">{q.title}</span>
                  <span className="text-xs font-bold text-amber-300 whitespace-nowrap">+{q.rewardXP} Puan</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, background: done ? 'var(--success)' : 'var(--accent-primary)' }}
                    />
                  </div>
                  <span className="text-[11px] text-slate-400 tabular-nums">
                    {Math.min(q.progress, q.target)}/{q.target}
                  </span>
                </div>
                {done && (
                  q.claimed ? (
                    <div className="mt-2 text-xs text-emerald-400 font-semibold flex items-center gap-1">
                      <Check size={13} aria-hidden="true" /> Ödül alındı
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleClaim(q)}
                      disabled={busyId === q.id}
                      className="ds-btn-primary w-full mt-2 !py-1.5 !text-xs disabled:opacity-50"
                    >
                      <Gift size={14} aria-hidden="true" /> {busyId === q.id ? 'Alınıyor…' : 'Ödülü Al'}
                    </button>
                  )
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
