import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lightbulb, ChevronRight } from 'lucide-react';
import { useUserStats } from '../contexts/UserStatsContext';
import { resolveSubject, CANONICAL_SUBJECTS_TR } from '../utils/subjects';
import EmptyState from './ui/EmptyState';

// Ustalık yüzdesine göre zayıflık etiketi
const weaknessLabel = (score) => {
  if (score < 40) return { text: 'Zayıf', cls: 'text-red-400' };
  if (score < 70) return { text: 'Geliştirilebilir', cls: 'text-amber-400' };
  return { text: 'İyi', cls: 'text-emerald-400' };
};

// masteryScores'tan en çok gelişim gereken 3 dersi önerir.
export default function RecommendedTopicsPanel() {
  const navigate = useNavigate();
  const { masteryScores } = useUserStats();

  const weakest = useMemo(() => {
    // Kanonik derslere indirge: İngilizce anahtarları (History/Philosophy) TR'ye çevir,
    // "Genel"/bilinmeyenleri ELE, aynı dersin EN+TR kopyalarını birleştir (ağırlıklı ortalama).
    const byTr = {};
    Object.entries(masteryScores || {}).forEach(([key, m]) => {
      const { tr } = resolveSubject(key);
      if (!CANONICAL_SUBJECTS_TR.includes(tr)) return; // Genel / gerçek ders olmayanları atla
      const solved = m.solved_count || 0;
      if (!byTr[tr]) byTr[tr] = { subject: tr, solved: 0, scoreSum: 0 };
      byTr[tr].solved += solved;
      byTr[tr].scoreSum += (m.score || 0) * solved;
    });
    return Object.values(byTr)
      .map(s => ({ subject: s.subject, solved: s.solved, score: s.solved ? Math.round(s.scoreSum / s.solved) : 0 }))
      .filter(s => s.solved >= 3) // anlamlı veri eşiği
      .sort((a, b) => a.score - b.score)
      .slice(0, 3);
  }, [masteryScores]);

  return (
    <section className="ds-card">
      <h3 className="flex items-center gap-2 font-bold text-white mb-3">
        <Lightbulb size={18} className="text-amber-400" /> Çalışman Önerilen Konular
      </h3>
      {weakest.length === 0 ? (
        <EmptyState
          className="!py-6"
          icon={Lightbulb}
          title="Henüz öneri yok"
          description="Birkaç soru çözdükçe en çok gelişmen gereken dersleri burada öneririz."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {weakest.map(s => {
            const w = weaknessLabel(s.score);
            return (
              <button
                key={s.subject}
                type="button"
                onClick={() => navigate(`/student/quiz?subject=${encodeURIComponent(s.subject)}`)}
                className="w-full text-left p-3 bg-white/5 border border-white/5 rounded-xl hover:border-indigo-500/30 transition-colors group"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-semibold text-slate-100">{s.subject}</span>
                  <span className={`text-xs font-bold ${w.cls}`}>{w.text} · %{s.score}</span>
                </div>
                <div className="neon-progress">
                  <div className="neon-bar" style={{ width: `${Math.max(6, s.score)}%` }} />
                </div>
                <div className="flex items-center gap-1 mt-2 text-xs text-indigo-300 font-semibold group-hover:text-indigo-200">
                  Bu Konuda Çöz <ChevronRight size={13} />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
