import React, { useEffect, useState } from 'react';
import { Sparkles, Target, Flame, CheckCircle2, Award } from 'lucide-react';
import Modal from '../ui/Modal';
import { getBadgeById } from '../../utils/badges';
import { celebrate } from '../../utils/celebrate';

// Hedef değere kübik-ease ile sayan küçük sayaç animasyonu.
function useCountUp(target, run, duration = 900) {
  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!run || target <= 0 || reduced) return undefined;
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      setVal(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, run, reduced, duration]);
  if (!run) return 0;
  if (reduced) return target;
  return val;
}

/**
 * Quiz turu bitince gösterilen özet ekranı.
 * @param {object} summary - { answered, correct, xp, streakCount, streakMilestone,
 *                             questsCompleted:[string], newBadges:[string] }
 */
export default function SessionSummary({ isOpen, onClose, summary, onNewRound }) {
  const s = summary || {};
  const xp = useCountUp(s.xp || 0, isOpen);

  useEffect(() => {
    if (isOpen) celebrate('session');
  }, [isOpen]);
  const accuracy = s.answered > 0 ? Math.round((s.correct / s.answered) * 100) : 0;
  const badges = (s.newBadges || []).map(getBadgeById).filter(Boolean);

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm" title="Tur Tamamlandı 🎉" closeOnOverlay={false}>
      <div className="flex flex-col gap-4">
        {s.streakMilestone && (
          <div className="keep-white rounded-xl p-3 text-center font-bold text-white"
            style={{ background: 'linear-gradient(135deg,#F59E0B,#EF4444)' }}>
            🔥 {s.streakMilestone} günlük seri kilometre taşı!
          </div>
        )}

        {/* XP kazanımı */}
        <div className="ds-card ds-card--snug text-center">
          <div className="flex items-center justify-center gap-2 text-slate-400 text-sm mb-1">
            <Sparkles size={16} aria-hidden="true" /> Kazanılan Puan
          </div>
          <div className="text-4xl font-extrabold"
            style={{ fontFamily: "'Outfit',sans-serif", color: 'var(--accent-secondary)' }}>
            +{xp}
          </div>
        </div>

        {/* Üç metrik */}
        <div className="grid grid-cols-3 gap-2">
          <div className="ds-card ds-card--compact text-center">
            <Target size={18} className="mx-auto text-indigo-400" aria-hidden="true" />
            <div className="text-lg font-bold text-white mt-1">{s.answered || 0}</div>
            <div className="text-[11px] text-slate-400">Soru</div>
          </div>
          <div className="ds-card ds-card--compact text-center">
            <CheckCircle2 size={18} className="mx-auto text-emerald-400" aria-hidden="true" />
            <div className="text-lg font-bold text-white mt-1">%{accuracy}</div>
            <div className="text-[11px] text-slate-400">Doğruluk</div>
          </div>
          <div className="ds-card ds-card--compact text-center">
            <Flame size={18} className="mx-auto text-orange-400" aria-hidden="true" />
            <div className="text-lg font-bold text-white mt-1">{s.streakCount || 0}</div>
            <div className="text-[11px] text-slate-400">Gün Seri</div>
          </div>
        </div>

        {/* Tamamlanan görevler */}
        {(s.questsCompleted || []).length > 0 && (
          <div>
            <h3 className="text-sm font-bold text-white mb-2">Tamamlanan Görevler</h3>
            <div className="flex flex-col gap-1.5">
              {s.questsCompleted.map((q, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-emerald-300
                  bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-1.5">
                  <CheckCircle2 size={15} aria-hidden="true" /> {q}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Yeni rozetler */}
        {badges.length > 0 && (
          <div>
            <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-1.5">
              <Award size={15} aria-hidden="true" /> Yeni Rozetler
            </h3>
            <div className="flex flex-wrap gap-2">
              {badges.map((b) => (
                <div key={b.id} className="flex items-center gap-1.5 bg-white/5 border
                  border-white/10 rounded-lg px-2.5 py-1.5 text-sm text-white">
                  <span className="text-lg" aria-hidden="true">{b.emoji}</span> {b.name}
                </div>
              ))}
            </div>
          </div>
        )}

        {onNewRound && (
          <button type="button" onClick={onNewRound} className="ds-btn-primary w-full">
            ✨ Yeni Tur
          </button>
        )}
        <button type="button" onClick={onClose} className={onNewRound ? 'ds-btn-ghost w-full' : 'ds-btn-primary w-full'}>
          Devam Et
        </button>
      </div>
    </Modal>
  );
}
