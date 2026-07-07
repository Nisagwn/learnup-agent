import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Crosshair, CheckCircle2, ChevronRight, Target, Trophy } from 'lucide-react';
import { auth } from '../firebase';
import { subscribeMyTargetedAssignments } from '../services/targetedAssignmentsApi';
import { formatDate } from '../utils/formatDate';
import { SkeletonCard } from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';

export default function TargetedAssignments() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const unsub = subscribeMyTargetedAssignments(
      (list) => { setItems(list); setLoaded(true); },
      () => setLoaded(true)
    );
    return () => unsub?.();
  }, []);

  // Öğretmen onaylayıp yayınlamadan (status 'draft') öğrenciye GÖSTERME.
  const visible = useMemo(() => items.filter((t) => t.status !== 'draft'), [items]);

  // Aktif olanlar üstte, sonra tarihe göre
  const sorted = useMemo(() => {
    const active = visible.filter((t) => t.status !== 'completed');
    const done = visible.filter((t) => t.status === 'completed');
    return [...active, ...done];
  }, [visible]);

  const activeCount = useMemo(() => visible.filter((t) => t.status !== 'completed').length, [visible]);
  const loading = !loaded;

  return (
    <div className="dashboard student-dashboard animate-fade-in pb-8">
      <div className="dashboard-header mb-6 mt-4 flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="page-title flex items-center gap-2"><Crosshair size={26} /> Hedefli Setler</h1>
          <p className="page-subtitle">Öğretmeninin zayıf konularına özel hazırladığı mini setler.</p>
        </div>
        {activeCount > 0 && (
          <span className="text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5"
            style={{ background: 'var(--accent-primary-soft)', color: 'var(--accent-primary-hover)', border: '1px solid var(--border-accent)' }}>
            <Target size={13} /> {activeCount} aktif set
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col gap-4" aria-busy="true">
          <SkeletonCard lines={2} /><SkeletonCard lines={2} />
        </div>
      ) : sorted.length === 0 ? (
        <div className="ds-card">
          <EmptyState
            icon={Crosshair}
            title="Henüz hedefli set yok"
            description="Öğretmenin sana özel bir set gönderdiğinde burada görünecek."
          />
        </div>
      ) : (
        <div className="flex flex-col gap-3.5">
          {sorted.map((t) => {
            const done = t.status === 'completed';
            const total = t.questionIds?.length || t.maxScore || 0;
            const score = t.score;
            const pct = done && score != null && total ? Math.round((score / total) * 100) : null;
            return (
              <div
                key={t.id}
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/student/targeted/${t.id}`)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/student/targeted/${t.id}`); } }}
                className="ds-card is-interactive hover-pop flex items-center gap-4"
              >
                {/* İkon rozeti */}
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                  style={done
                    ? { background: 'var(--accent-primary-soft)', color: 'var(--accent-primary-hover)' }
                    : { background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))', color: '#fff' }}>
                  {done ? <Trophy size={22} /> : <Target size={22} />}
                </div>

                {/* Orta içerik */}
                <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>{t.subject}</span>
                    {done ? (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1"
                        style={{ background: 'var(--accent-primary-soft)', color: 'var(--accent-primary-hover)' }}>
                        <CheckCircle2 size={11} /> Tamamlandı
                      </span>
                    ) : (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(245,158,11,0.14)', color: '#b45309' }}>
                        Aktif
                      </span>
                    )}
                  </div>

                  {t.focusSubTopics?.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {t.focusSubTopics.slice(0, 3).map((st, i) => (
                        <span key={i} className="text-[11px] px-1.5 py-0.5 rounded"
                          style={{ background: 'rgba(15,23,42,0.05)', color: 'var(--text-secondary)' }}>{st}</span>
                      ))}
                    </div>
                  )}

                  {t.rationale && (
                    <p className="text-xs italic line-clamp-1" style={{ color: 'var(--text-muted)' }}>“{t.rationale}”</p>
                  )}

                  <div className="text-xs flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
                    <span>{total} soru</span>
                    <span>·</span>
                    <span>{formatDate(t.createdAtMs ? new Date(t.createdAtMs) : null)}</span>
                  </div>
                </div>

                {/* Sağ: skor / aksiyon */}
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  {done && pct != null ? (
                    <>
                      <div className="text-lg font-extrabold leading-none" style={{ color: 'var(--accent-primary)' }}>%{pct}</div>
                      <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{score}/{total}</div>
                    </>
                  ) : (
                    <span className="text-xs font-bold flex items-center gap-0.5" style={{ color: 'var(--accent-primary-hover)' }}>
                      Çöz <ChevronRight size={15} />
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
