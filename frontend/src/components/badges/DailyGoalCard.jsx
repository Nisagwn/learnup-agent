import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import confetti from 'canvas-confetti';
import { currentUid } from '../../services/authApi';
import { updateProfile } from '../../services/profileApi';
import { useUserStats } from '../../contexts/UserStatsContext';
import { useToast } from '../ToastProvider';
import useBadges from '../../hooks/useBadges';
import DailyGoalRing from './DailyGoalRing';
import DailyGoalModal from './DailyGoalModal';
import BadgeGrid from './BadgeGrid';

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Öğrenci panosu yan paneli: günlük hedef halkası + rozet şeridi.
// Hedefe ulaşıldığında günde bir kez konfeti patlatır.
export default function DailyGoalCard() {
  const { stats, userProfile } = useUserStats();
  const { success } = useToast();
  const { catalog, earnedIds } = useBadges();
  const [modalOpen, setModalOpen] = useState(false);
  const celebratedRef = useRef(false);

  const goal = userProfile?.dailyGoal ?? 20;
  const todaySolved = stats?.todaySolved ?? 0;

  useEffect(() => {
    const uid = currentUid();
    if (!uid || !userProfile) return;
    const iso = todayISO();
    if (goal > 0 && todaySolved >= goal && userProfile.lastGoalReachedDate !== iso && !celebratedRef.current) {
      celebratedRef.current = true;
      confetti({ particleCount: 120, spread: 90 });
      success('Günlük Hedef Tamam! 🎯', `Bugün ${todaySolved} soru çözdün.`);
      updateProfile(uid, { lastGoalReachedDate: iso }).catch(err => console.warn('Hedef tarihi kaydedilemedi:', err));
    }
  }, [todaySolved, goal, userProfile, success]);

  return (
    <section className="ds-card">
      <div className="flex items-center gap-4">
        <DailyGoalRing todaySolved={todaySolved} goal={goal} onEdit={() => setModalOpen(true)} size={104} />
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-white">Günlük Hedef</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {todaySolved >= goal ? 'Bugünkü hedefini tamamladın! 🎉' : `${goal - todaySolved} soru kaldı`}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-300">Rozetlerim</span>
          <Link to="/student/badges" className="text-xs text-lime-700 hover:text-lime-700 font-semibold">Tümünü Gör</Link>
        </div>
        <BadgeGrid catalog={catalog} earnedIds={earnedIds} limit={4} />
      </div>

      <DailyGoalModal isOpen={modalOpen} onClose={() => setModalOpen(false)} currentGoal={goal} />
    </section>
  );
}
