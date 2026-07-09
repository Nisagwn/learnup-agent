import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Flame, Trophy, TrendingUp, Settings, ChevronDown } from 'lucide-react';
import ClassManager from '../components/ClassManager';
import RecommendedTopicsPanel from '../components/RecommendedTopicsPanel';
import QuestsPanel from '../components/quests/QuestsPanel';
import LeagueCard from '../components/league/LeagueCard';
import HeroGoalCard from '../components/dashboard/HeroGoalCard';
import GardenSnapshot from '../components/dashboard/GardenSnapshot';
import StreakHeatmap from '../components/dashboard/StreakHeatmap';
import AgendaPanel from '../components/dashboard/AgendaPanel';
import AnnouncementsAccordion from '../components/dashboard/AnnouncementsAccordion';
import StreakFreezeModal from '../components/badges/StreakFreezeModal';
import { useUserStats } from '../contexts/UserStatsContext';
import { getLevelInfo } from '../utils/levelSystem';
import { SkeletonCard } from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import './StudentDashboard.css';

function getGreeting() {
  const h = new Date().getHours();
  if (h < 6) return 'Erken kalkmışsın';
  if (h < 12) return 'Günaydın';
  if (h < 18) return 'İyi günler';
  if (h < 22) return 'İyi akşamlar';
  return 'Geç saatler';
}

const readCount = (item, key, fallbackKey) => item?.[key] ?? item?.[fallbackKey] ?? 0;

export default function StudentDashboard() {
  const navigate = useNavigate();
  const {
    masteryScores, loading, stats, gamification, classRanking, weeklyData, userProfile,
  } = useUserStats();
  const [searchQuery, setSearchQuery] = useState(
    new URLSearchParams(window.location.search).get('search') || ''
  );
  const [freezeOpen, setFreezeOpen] = useState(false);
  const [showMore, setShowMore] = useState(false);

  useEffect(() => {
    const handleSearch = (event) => setSearchQuery(event.detail || '');
    window.addEventListener('searchChange', handleSearch);
    return () => window.removeEventListener('searchChange', handleSearch);
  }, []);

  const activeSubjects = useMemo(() => {
    const q = searchQuery.toLocaleLowerCase('tr-TR');
    return Object.keys(masteryScores)
      .filter((s) => s !== 'Diğer' && s.toLocaleLowerCase('tr-TR').includes(q))
      .map((s) => ({
        name: s,
        total: masteryScores[s].solved_count || 0,
        percent: masteryScores[s].score || 0,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 3);
  }, [masteryScores, searchQuery]);

  const weekTotal = useMemo(
    () => (weeklyData || []).reduce(
      (acc, d) => acc + readCount(d, 'Doğru', 'DoÄŸru') + readCount(d, 'Yanlış', 'YanlÄ±ÅŸ'),
      0,
    ),
    [weeklyData],
  );

  const handleStartQuiz = (subject) => {
    navigate(`/student/quiz?subject=${encodeURIComponent(subject)}`);
  };

  if (loading) {
    return (
      <div className="dashboard student-dashboard student-dashboard--mag animate-fade-in pb-8" aria-busy="true">
        <div className="mag-stack">
          <SkeletonCard lines={2} />
          <div className="dash-hero">
            <SkeletonCard lines={4} />
            <SkeletonCard lines={4} />
          </div>
          <SkeletonCard lines={4} />
        </div>
      </div>
    );
  }

  const greeting = getGreeting();
  const firstName = (userProfile?.name || userProfile?.fullName || 'Kâşif').split(' ')[0];
  const { levelData, index } = getLevelInfo(stats?.correctAnswers || 0);
  const streakDays = stats?.streakDays || 0;
  const coins = gamification?.coins ?? 0;
  const hasClass = !!userProfile?.teacherId;
  const rank = classRanking?.rank;
  const rankTotal = classRanking?.total;

  return (
    <div className="dashboard student-dashboard student-dashboard--mag animate-fade-in pb-8">

      {/* ── TIER 0 · STATUS BAR ── */}
      <header className="dash-status">
        <div className="dash-status__hello">
          <span className="dash-status__greet">{greeting},</span>
          <h1 className="dash-status__name">{firstName} 👋</h1>
        </div>
        <div className="dash-status__stats">
          <span className="dash-chip" title={`Seviye ${index + 1} — ${levelData?.name || ''}`}>
            <span aria-hidden="true">{levelData?.emoji || '🚀'}</span> Lv{index + 1}
          </span>
          <span className="dash-chip dash-chip--streak" title="Günlük seri">
            <Flame size={14} aria-hidden="true" /> {streakDays}
          </span>
          <span className="dash-chip dash-chip--coin" title="Altın">
            🪙 {Number(coins).toLocaleString('tr-TR')}
          </span>
          <button
            type="button"
            className="dash-chip dash-chip--icon"
            onClick={() => navigate('/settings')}
            aria-label="Ayarlar"
          >
            <Settings size={16} aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* ── TIER 1 · HERO (primary odak + gamified kanca) ── */}
      <section className="dash-hero">
        <HeroGoalCard />
        <GardenSnapshot />
      </section>

      {/* ── TIER 2 · BUGÜN (glanceable metrikler, aksiyon yok) ── */}
      <section className="dash-stats" aria-label="Bugünün özeti">
        <button type="button" className="dash-stat" onClick={() => setFreezeOpen(true)}>
          <span className="dash-stat__icon dash-stat__icon--streak" aria-hidden="true"><Flame size={20} /></span>
          <span className="dash-stat__txt">
            <strong className="dash-stat__num">{streakDays}<em>gün</em></strong>
            <span className="dash-stat__label">Günlük seri</span>
          </span>
        </button>
        <button
          type="button"
          className="dash-stat"
          onClick={() => navigate(hasClass ? '/student/league' : '/student')}
        >
          <span className="dash-stat__icon dash-stat__icon--rank" aria-hidden="true"><Trophy size={20} /></span>
          <span className="dash-stat__txt">
            <strong className="dash-stat__num">{hasClass && rank ? `#${rank}` : '—'}</strong>
            <span className="dash-stat__label">{hasClass && rankTotal ? `/ ${rankTotal} sınıfta` : 'Sınıfa katıl'}</span>
          </span>
        </button>
        <button type="button" className="dash-stat" onClick={() => navigate('/student/statistics')}>
          <span className="dash-stat__icon dash-stat__icon--week" aria-hidden="true"><TrendingUp size={20} /></span>
          <span className="dash-stat__txt">
            <strong className="dash-stat__num">{weekTotal}</strong>
            <span className="dash-stat__label">Bu hafta soru</span>
          </span>
        </button>
      </section>

      {/* ── TIER 3 · ÇALIŞMA ALANI ── */}
      <div className="dash-work">
        <div className="dash-main">
          <section className="ds-card-light dash-panel">
            <div className="dash-panel__head">
              <div>
                <span className="dash-eyebrow">Günlük Görevler</span>
                <h2 className="dash-panel__title">Bugün tamamlayabileceklerin</h2>
              </div>
            </div>
            <div className="quests-strip__inner">
              <QuestsPanel />
            </div>
          </section>

          <section className="ds-card-light dash-panel">
            <div className="dash-panel__head">
              <div>
                <span className="dash-eyebrow">Öğrenmeye Devam</span>
                <h2 className="dash-panel__title">Derslerine kaldığın yerden</h2>
              </div>
              {searchQuery && <span className="search-chip">Arama: {searchQuery}</span>}
            </div>
            <div className="dash-subjects">
              {activeSubjects.length === 0 ? (
                <div className="empty-subjects-light">
                  <EmptyState
                    icon={BookOpen}
                    title="Ders verisi yok"
                    description="Bir derse başla — ilk verilerle birlikte burası dolacak."
                  />
                </div>
              ) : (
                activeSubjects.map((subject) => (
                  <button
                    key={subject.name}
                    type="button"
                    onClick={() => handleStartQuiz(subject.name)}
                    className="dash-subject hover-pop"
                  >
                    <span className="dash-subject__name">{subject.name}</span>
                    <small>{subject.total} etkileşim · %{subject.percent} doğru</small>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width: `${Math.max(8, subject.percent)}%` }} />
                    </div>
                  </button>
                ))
              )}
            </div>
          </section>

          <RecommendedTopicsPanel />
        </div>

        <aside className="dash-side">
          <LeagueCard />
          <AgendaPanel />
        </aside>
      </div>

      {/* ── TIER 4 · DAHA FAZLA (düşük öncelik, gizli) ── */}
      <div className="dash-more">
        <button
          type="button"
          className="dash-more__toggle"
          onClick={() => setShowMore((v) => !v)}
          aria-expanded={showMore}
        >
          {showMore ? 'Daha az göster' : 'Daha fazla göster'}
          <ChevronDown size={16} className={showMore ? 'is-open' : ''} aria-hidden="true" />
        </button>
        {showMore && (
          <div className="dash-more__body">
            <StreakHeatmap />
            <AnnouncementsAccordion />
            <section className="ds-card-light join-class-wrap">
              <ClassManager />
            </section>
          </div>
        )}
      </div>

      <StreakFreezeModal isOpen={freezeOpen} onClose={() => setFreezeOpen(false)} />
    </div>
  );
}
