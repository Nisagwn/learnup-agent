import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Pencil } from 'lucide-react';
import confetti from 'canvas-confetti';
import { doc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../../firebase';
import { useUserStats } from '../../contexts/UserStatsContext';
import { useToast } from '../ToastProvider';
import DailyGoalModal from '../badges/DailyGoalModal';

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function Ring({ value, goal, size = 108 }) {
  const stroke = 10;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = goal > 0 ? Math.min(1, value / goal) : 0;
  const reached = goal > 0 && value >= goal;

  return (
    <div className="hero-goal__ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--accent-primary-soft)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke={reached ? 'var(--success)' : 'var(--accent-primary)'}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <div className="hero-goal__ring-center">
        <strong>{value}</strong>
        <span>/ {goal}</span>
      </div>
    </div>
  );
}

// Pano birincil odak kartı: günlük hedef halkası + TEK primary CTA.
// GoalTile'ın konfeti + modal davranışı birebir korunur.
export default function HeroGoalCard() {
  const navigate = useNavigate();
  const { stats, userProfile } = useUserStats();
  const { success } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const celebratedRef = useRef(false);

  const goal = userProfile?.dailyGoal ?? 20;
  const todaySolved = stats?.todaySolved ?? 0;
  const remaining = Math.max(0, goal - todaySolved);
  const reached = goal > 0 && todaySolved >= goal;

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid || !userProfile) return;
    const iso = todayISO();
    if (reached && userProfile.lastGoalReachedDate !== iso && !celebratedRef.current) {
      celebratedRef.current = true;
      confetti({ particleCount: 100, spread: 80 });
      success('Günlük Hedef Tamam! 🎯', `Bugün ${todaySolved} soru çözdün.`);
      updateDoc(doc(db, 'users', uid), { lastGoalReachedDate: iso })
        .catch((err) => console.warn('Hedef tarihi kaydedilemedi:', err));
    }
  }, [reached, todaySolved, userProfile, success]);

  const handleStart = () => {
    const lastId = userProfile?.lastSolvedQuestion?.id;
    if (lastId) navigate(`/student/quiz?resume=true&questionId=${encodeURIComponent(lastId)}`);
    else navigate('/student/lessons');
  };

  return (
    <section className="hero-goal" aria-label="Bugünün hedefi">
      <div className="hero-goal__top">
        <span className="dash-eyebrow">Bugünün Hedefi</span>
        <button
          type="button"
          className="hero-goal__edit"
          onClick={() => setModalOpen(true)}
          aria-label="Günlük hedefi düzenle"
        >
          <Pencil size={14} aria-hidden="true" />
        </button>
      </div>

      <div className="hero-goal__body">
        <Ring value={todaySolved} goal={goal} />
        <div className="hero-goal__meta">
          <strong className="hero-goal__headline">
            {reached ? 'Hedef tamam! 🎉' : `${remaining} soru kaldı`}
          </strong>
          <span className="hero-goal__sub">
            {reached ? 'Bonus için devam edebilirsin' : 'Serini sürdür, ormanını büyüt'}
          </span>
        </div>
      </div>

      <button type="button" className="dash-cta-primary" onClick={handleStart}>
        <Play size={18} aria-hidden="true" fill="currentColor" />
        {todaySolved > 0 ? 'Çözmeye Devam Et' : 'Çözmeye Başla'}
      </button>

      <DailyGoalModal isOpen={modalOpen} onClose={() => setModalOpen(false)} currentGoal={goal} />
    </section>
  );
}
