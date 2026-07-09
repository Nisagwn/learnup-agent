import React, { useEffect, useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import confetti from 'canvas-confetti';
import { currentUid } from '../../services/authApi';
import { updateProfile } from '../../services/profileApi';
import { useUserStats } from '../../contexts/UserStatsContext';
import { useToast } from '../ToastProvider';
import DailyGoalModal from '../badges/DailyGoalModal';

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function Ring({ todaySolved, goal, size = 88 }) {
  const stroke = 9;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = goal > 0 ? Math.min(1, todaySolved / goal) : 0;
  const reached = goal > 0 && todaySolved >= goal;
  const color = reached ? 'var(--success)' : '#34D399';

  return (
    <div className="goal-tile__ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} aria-hidden="true">
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(16,185,129,0.12)" strokeWidth={stroke} />
        <circle
          cx={size/2} cy={size/2} r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct)}
          transform={`rotate(-90 ${size/2} ${size/2})`}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <div className="goal-tile__ring-center">
        <strong>{todaySolved}</strong>
        <span>/ {goal}</span>
      </div>
    </div>
  );
}

export default function GoalTile() {
  const { stats, userProfile } = useUserStats();
  const { success } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const celebratedRef = useRef(false);

  const goal = userProfile?.dailyGoal ?? 20;
  const todaySolved = stats?.todaySolved ?? 0;
  const remaining = Math.max(0, goal - todaySolved);
  const reached = goal > 0 && todaySolved >= goal;

  useEffect(() => {
    const uid = currentUid();
    if (!uid || !userProfile) return;
    const iso = todayISO();
    if (reached && userProfile.lastGoalReachedDate !== iso && !celebratedRef.current) {
      celebratedRef.current = true;
      confetti({ particleCount: 100, spread: 80 });
      success('Günlük Hedef Tamam! 🎯', `Bugün ${todaySolved} soru çözdün.`);
      updateProfile(uid, { lastGoalReachedDate: iso })
        .catch((err) => console.warn('Hedef tarihi kaydedilemedi:', err));
    }
  }, [reached, todaySolved, userProfile, success]);

  return (
    <article className="focus-tile focus-tile--goal">
      <header className="focus-tile__head">
        <span className="focus-tile__kicker">Bugünkü Hedef</span>
        <button
          type="button"
          className="focus-tile__edit"
          onClick={() => setModalOpen(true)}
          aria-label="Günlük hedefi düzenle"
        >
          <Pencil size={13} aria-hidden="true" />
        </button>
      </header>

      <div className="focus-tile__body focus-tile__body--with-ring">
        <Ring todaySolved={todaySolved} goal={goal} />
        <div className="focus-tile__meta">
          <strong className="focus-tile__big">
            {reached ? 'Tamam! 🎉' : `${remaining}`}
          </strong>
          <span className="focus-tile__sub">
            {reached ? 'Bonus için devam' : 'soru kaldı'}
          </span>
        </div>
      </div>

      <DailyGoalModal isOpen={modalOpen} onClose={() => setModalOpen(false)} currentGoal={goal} />
    </article>
  );
}
