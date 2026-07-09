import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useUserStats } from '../../contexts/UserStatsContext';
import { getLevelInfo } from '../../utils/levelSystem';

function getGreeting() {
  const h = new Date().getHours();
  if (h < 6)  return { text: 'Erken kalkmışsın', emoji: '🌙' };
  if (h < 12) return { text: 'Günaydın',         emoji: '☀️' };
  if (h < 18) return { text: 'İyi günler',       emoji: '🌤️' };
  if (h < 22) return { text: 'İyi akşamlar',     emoji: '🌆' };
  return            { text: 'Geç saatler',       emoji: '✨' };
}

export default function HeroStrip() {
  const navigate = useNavigate();
  const { stats, userProfile } = useUserStats();
  const greeting = useMemo(() => getGreeting(), []);
  const { levelData, index } = getLevelInfo(stats.correctAnswers);
  const firstName = (userProfile?.name || userProfile?.fullName || 'Kâşif').split(' ')[0];

  const handleResume = () => {
    const lastId = userProfile?.lastSolvedQuestion?.id;
    if (lastId) navigate(`/student/quiz?resume=true&questionId=${encodeURIComponent(lastId)}`);
    else navigate('/student/lessons');
  };

  return (
    <section className="hero-strip" aria-label="Karşılama">
      <div className="hero-strip__left">
        <span className="hero-strip__greeting">
          <span className="hero-strip__greeting-emoji" aria-hidden="true">{greeting.emoji}</span>
          {greeting.text},
        </span>
        <h1 className="hero-strip__name">{firstName} 👋</h1>
      </div>

      <div className="hero-strip__right">
        <div className="hero-strip__level" title={`Seviye ${index + 1}`}>
          <span className="hero-strip__level-emoji" aria-hidden="true">{levelData?.emoji || '🚀'}</span>
          <div className="hero-strip__level-text">
            <span>Seviye {index + 1}</span>
            <strong>{levelData?.name || 'Meraklı'}</strong>
          </div>
        </div>

        <button type="button" className="hero-strip__cta hero-strip__cta--primary" onClick={handleResume}>
          Devam Et
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
