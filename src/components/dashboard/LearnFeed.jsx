import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion as Motion } from 'framer-motion';
import {
  Sparkles, Target, RotateCcw, Play, Flame, Award, Lightbulb, FileText, X, Loader2,
} from 'lucide-react';
import { useUserStats } from '../../contexts/UserStatsContext';
import { buildLearnFeed, SUBJECTS_CATALOG } from '../../utils/learnFeed';
import useFeedDismiss from '../../hooks/useFeedDismiss';
import { startAiQuiz } from '../../services/aiService';
import { useToast } from '../ToastProvider';
import StreakFreezeModal from '../badges/StreakFreezeModal';
import { containerStagger, itemRise } from '../../utils/motion';

// Kart tipine göre ikon + başlık + açıklama + aksiyon etiketi.
function metaFor(item) {
  switch (item.type) {
    case 'today_goal':
      return { icon: Target, title: 'Günlük hedefini tamamla', desc: `${item.subject} · ${item.progress}/${item.target} soru`, action: 'Devam et' };
    case 'review_due':
      return { icon: RotateCcw, title: 'Tekrar zamanı', desc: `${item.count} soru tekrarını bekliyor`, action: 'Tekrara git' };
    case 'continue':
      return { icon: Play, title: 'Kaldığın yerden devam', desc: item.subTopic ? `${item.subject} · ${item.subTopic}` : item.subject, action: 'Devam et' };
    case 'streak_at_risk':
      return { icon: Flame, title: 'Serin risk altında 🔥', desc: `${item.currentStreak} günlük serini koru`, action: 'Seriyi koru' };
    case 'streak_milestone':
      return { icon: Award, title: 'Kilometre taşına yakınsın', desc: `Bugün çalış, ${item.nextDay} güne ulaş!`, action: 'Çalış' };
    case 'weak_topic':
      return { icon: Lightbulb, title: 'Zayıf konunu güçlendir', desc: `${item.subject} · ${item.subTopic} (${item.wrongCount} yanlış)`, action: 'Pratik yap' };
    case 'new_subject':
      return { icon: Sparkles, title: 'Yeni bir derse başla', desc: `${item.subject} seni bekliyor`, action: 'Başla' };
    case 'mock_exam':
      return { icon: FileText, title: 'Deneme zamanı 📝', desc: `${item.subject} · 10 zor soru`, action: 'Mock başlat' };
    default:
      return { icon: Sparkles, title: 'Öneri', desc: '', action: 'Aç' };
  }
}

export default function LearnFeed() {
  const navigate = useNavigate();
  const { error: toastError } = useToast();
  const { masteryScores, gamification, learnInputs } = useUserStats();
  const { activeIds, dismiss } = useFeedDismiss();
  const [busyId, setBusyId] = useState(null);
  const [freezeOpen, setFreezeOpen] = useState(false);

  const lastMockExamAtMs = Number((typeof localStorage !== 'undefined' && localStorage.getItem('learnup.lastMockAt')) || 0);

  const feed = useMemo(() => buildLearnFeed({
    masteryScores,
    gamification,
    subjectsCatalog: SUBJECTS_CATALOG,
    lastMockExamAtMs,
    ...(learnInputs || {}),
  }, Date.now(), activeIds), [masteryScores, gamification, learnInputs, activeIds, lastMockExamAtMs]);

  const startEphemeral = async (id, opts) => {
    if (busyId) return;
    setBusyId(id);
    try {
      await startAiQuiz(opts, navigate);
    } catch (e) {
      toastError('Başlatılamadı', e.message || 'Soru üretilemedi.');
    } finally {
      setBusyId(null);
    }
  };

  const onAction = (item) => {
    switch (item.type) {
      case 'today_goal':
      case 'continue':
      case 'new_subject':
        navigate(`/student/quiz?subject=${encodeURIComponent(item.subject)}`);
        break;
      case 'review_due':
        navigate('/student/wrong-answers');
        break;
      case 'streak_at_risk':
        setFreezeOpen(true);
        break;
      case 'streak_milestone':
        navigate('/student/lessons');
        break;
      case 'weak_topic':
        startEphemeral(item.id, { topic: item.subTopic, subject: item.subject, count: 5, difficulty: 'medium', source: 'ai_free' });
        break;
      case 'mock_exam':
        startEphemeral(item.id, { topic: item.subject, subject: item.subject, count: 10, difficulty: 'hard', source: 'quiz' });
        break;
      default:
        break;
    }
  };

  if (!feed.length) return null;

  return (
    <section className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={18} className="text-lime-600" aria-hidden="true" />
        <h2 className="text-lg font-extrabold text-white">Önerilenler</h2>
      </div>

      <Motion.div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        variants={containerStagger}
        initial="hidden"
        animate="show"
      >
        {feed.map((item) => {
          const m = metaFor(item);
          const Icon = m.icon;
          const busy = busyId === item.id;
          return (
            <Motion.div key={item.id} variants={itemRise} className="ds-card relative flex flex-col gap-3">
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                aria-label="Öneriyi gizle"
                className="absolute top-2.5 right-2.5 text-slate-400 hover:text-slate-200"
              >
                <X size={15} />
              </button>

              <div className="flex items-center gap-2.5 pr-6">
                <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'var(--accent-primary-soft)', color: 'var(--accent-primary)' }}>
                  <Icon size={18} aria-hidden="true" />
                </span>
                <span className="font-semibold text-slate-100 text-sm">{m.title}</span>
              </div>

              <p className="text-xs text-slate-400 flex-1">{m.desc}</p>

              <button
                type="button"
                onClick={() => onAction(item)}
                disabled={busy}
                className="ds-btn-primary !py-1.5 !text-xs flex items-center justify-center gap-1.5 disabled:opacity-60"
              >
                {busy ? <><Loader2 size={13} className="animate-spin" /> Hazırlanıyor…</> : m.action}
              </button>
            </Motion.div>
          );
        })}
      </Motion.div>

      <StreakFreezeModal isOpen={freezeOpen} onClose={() => setFreezeOpen(false)} />
    </section>
  );
}
