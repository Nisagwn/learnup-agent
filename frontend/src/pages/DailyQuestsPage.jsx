import React, { useState } from 'react';
import { Target, Check, Gift, Sparkles } from 'lucide-react';
import { useUserStats } from '../contexts/UserStatsContext';
import { useToast } from '../components/ToastProvider';
import { claimQuestReward } from '../utils/gamificationApi';
import { celebrate } from '../utils/celebrate';
import { todayISO } from '../utils/formatDate';
import EmptyState from '../components/ui/EmptyState';

// Günlük görevler — ayrı, detaylı sayfa (mobil paritesi).
// Veriyi users/{uid}.gamification.dailyQuests'ten OKUR (UserStatsContext listener'ı);
// ensureDailyState boot'ta zaten çağrılır, burada çağrılmaz. Ödül talebi backend'e gider.
export default function DailyQuestsPage() {
  const { gamification } = useUserStats();
  const { success, error } = useToast();
  const [busyId, setBusyId] = useState(null);

  const daily = gamification?.dailyQuests || {};
  const quests = daily.quests || [];
  const dateLabel = (() => {
    const iso = daily.date || todayISO();
    const [y, m, d] = iso.split('-');
    return `${d}.${m}.${y}`;
  })();

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
    <div className="dashboard student-dashboard animate-fade-in pb-8">
      <div className="dashboard-header mb-6 mt-4">
        <h1 className="page-title flex items-center gap-2">
          <Target size={26} /> Günlük Görevler
        </h1>
        <p className="page-subtitle">Bugünün görevleri · {dateLabel}</p>
      </div>

      {quests.length === 0 ? (
        <div className="ds-card">
          <EmptyState
            icon={Target}
            title="Görevler hazırlanıyor…"
            description="Bugünün görevleri birazdan burada olacak. Soru çözmeye başlayabilirsin."
          />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {quests.map((q) => {
              const done = q.progress >= q.target;
              const pct = Math.min(100, Math.round((q.progress / q.target) * 100));
              return (
                <section key={q.id} className="ds-card flex flex-col gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-2xl" aria-hidden="true">{q.emoji}</span>
                    <span className="text-sm font-semibold text-white flex-1 min-w-0">{q.title}</span>
                    <span className="text-xs font-bold text-amber-300 whitespace-nowrap flex items-center gap-1">
                      <Sparkles size={13} aria-hidden="true" /> +{q.rewardXP} Puan
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2.5 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, background: done ? 'var(--success)' : 'var(--accent-primary)' }}
                      />
                    </div>
                    <span className="text-[11px] text-slate-400 tabular-nums">
                      {Math.min(q.progress, q.target)}/{q.target}
                    </span>
                  </div>

                  {done ? (
                    q.claimed ? (
                      <div className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                        <Check size={14} aria-hidden="true" /> Alındı
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleClaim(q)}
                        disabled={busyId === q.id}
                        className="ds-btn-primary w-full !py-2 !text-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
                      >
                        <Gift size={14} aria-hidden="true" />
                        {busyId === q.id ? 'Alınıyor…' : `Ödülü Al (+${q.rewardXP} Puan)`}
                      </button>
                    )
                  ) : (
                    <div className="text-[11px] text-slate-500">Tamamlamak için devam et</div>
                  )}
                </section>
              );
            })}
          </div>

          <p className="text-xs text-slate-500 mt-5">
            Görevler her gün gece yarısı yenilenir. Ödül puanları haftalık lig sıralamasına da eklenir.
          </p>
        </>
      )}
    </div>
  );
}
