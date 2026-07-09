import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, ChevronRight, Users } from 'lucide-react';
import { useUserStats } from '../../contexts/UserStatsContext';

export default function ClassRankTile() {
  const navigate = useNavigate();
  const { classRanking, userProfile } = useUserStats();
  const hasClass = !!userProfile?.teacherId;
  const className = userProfile?.teacherName || null; // aktif sınıf etiketi (çoklu sınıf)
  const { rank, total, loading } = classRanking || {};

  const percentile = rank && total ? Math.round((rank / total) * 100) : null;

  let medal = '🥉';
  if (rank === 1) medal = '🥇';
  else if (rank === 2) medal = '🥈';
  else if (rank > 3) medal = '🏅';

  return (
    <article className="focus-tile focus-tile--rank">
      <header className="focus-tile__head">
        <span className="focus-tile__kicker">Sınıf Sıralaması</span>
        {hasClass && className && (
          <span className="focus-tile__class" title={className}>{className}</span>
        )}
      </header>

      {!hasClass ? (
        <div className="focus-tile__body focus-tile__body--empty">
          <div className="rank-tile__icon" aria-hidden="true">
            <Users size={28} />
          </div>
          <div className="focus-tile__meta">
            <strong className="focus-tile__big focus-tile__big--small">Sınıfa katıl</strong>
            <span className="focus-tile__sub">Kod gir, sıralamaya dahil ol</span>
          </div>
        </div>
      ) : loading || rank == null ? (
        <div className="focus-tile__body focus-tile__body--empty">
          <div className="rank-tile__icon" aria-hidden="true">
            <Trophy size={28} />
          </div>
          <div className="focus-tile__meta">
            <strong className="focus-tile__big focus-tile__big--small">—</strong>
            <span className="focus-tile__sub">Sıralama hesaplanıyor</span>
          </div>
        </div>
      ) : (
        <>
          <div className="focus-tile__body">
            <div className="rank-tile__medal" aria-hidden="true">{medal}</div>
            <div className="focus-tile__meta">
              <strong className="focus-tile__big">#{rank}</strong>
              <span className="focus-tile__sub">/ {total} öğrenci</span>
            </div>
          </div>

          {percentile != null && (
            <p className="rank-tile__hint">
              {percentile <= 10 ? '🔥 Üst %' + percentile + ' — liderliği kovala'
                : percentile <= 50 ? 'Üst %' + percentile
                : 'Sıralamada yükselme zamanı'}
            </p>
          )}
        </>
      )}

      <button
        type="button"
        className="focus-tile__cta"
        onClick={() => navigate(hasClass ? '/student/league' : '/student')}
      >
        {hasClass ? 'Sıralamayı gör' : 'Kod gir'}
        <ChevronRight size={14} aria-hidden="true" />
      </button>
    </article>
  );
}
