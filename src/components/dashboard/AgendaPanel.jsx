import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarClock, ChevronRight, CheckCircle2 } from 'lucide-react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useUserStats } from '../../contexts/UserStatsContext';
import { toDate } from '../../utils/formatDate';
import EmptyState from '../ui/EmptyState';

function daysUntil(dateLike) {
  const d = toDate(dateLike);
  if (!d) return null;
  const now = new Date();
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((a - b) / 86400000);
}

function badgeFor(days) {
  if (days === null) return { label: '—', tone: 'later' };
  if (days < 0) return { label: `${Math.abs(days)} gün gecikti`, tone: 'urgent' };
  if (days === 0) return { label: 'Bugün', tone: 'urgent' };
  if (days === 1) return { label: 'Yarın', tone: 'soon' };
  if (days <= 3) return { label: `${days} gün`, tone: 'soon' };
  if (days <= 7) return { label: `${days} gün`, tone: 'mid' };
  return { label: `${days} gün`, tone: 'later' };
}

export default function AgendaPanel() {
  const navigate = useNavigate();
  const { userProfile, currentUser } = useUserStats();
  const teacherId = userProfile?.teacherId;
  const uid = currentUser?.uid;
  const [assignments, setAssignments] = useState([]);
  const [subs, setSubs] = useState([]);
  const [loadedFor, setLoadedFor] = useState(null);
  const ready = teacherId ? loadedFor === teacherId : true;

  useEffect(() => {
    if (!teacherId) return undefined;
    const q = query(collection(db, 'assignments'), where('teacherId', '==', teacherId));
    const unsub = onSnapshot(
      q,
      (snap) => { setAssignments(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); setLoadedFor(teacherId); },
      () => setLoadedFor(teacherId),
    );
    return () => unsub();
  }, [teacherId]);

  useEffect(() => {
    if (!uid) return undefined;
    const q = query(collection(db, 'assignment_submissions'), where('studentId', '==', uid));
    const unsub = onSnapshot(q, (snap) => setSubs(snap.docs.map((d) => d.data())));
    return () => unsub();
  }, [uid]);

  const upcoming = useMemo(() => {
    const submittedIds = new Set(subs.map((s) => s.assignmentId));
    return assignments
      // taslak/kapalı/arşiv ödevler "Yaklaşan" listesine sızmasın (eski status'suz docs görünür)
      .filter((a) => (!a.status || a.status === 'active') && !submittedIds.has(a.id))
      .map((a) => ({ ...a, _days: daysUntil(a.dueDate) }))
      .sort((a, b) => {
        const x = a._days ?? 9999;
        const y = b._days ?? 9999;
        return x - y;
      })
      .slice(0, 4);
  }, [assignments, subs]);

  const start = (a) => navigate(`/student/quiz?subject=${encodeURIComponent(a.subject)}&assignmentId=${a.id}`);

  return (
    <section className="agenda-panel ds-card-light" aria-label="Yaklaşan ödevler">
      <header className="agenda-panel__header">
        <div className="agenda-panel__title">
          <CalendarClock size={18} aria-hidden="true" />
          <div>
            <h3>Ajanda</h3>
            <span>Yaklaşan ödevlerin</span>
          </div>
        </div>
        <button type="button" className="agenda-link" onClick={() => navigate('/student/assignments')}>
          Tümü <ChevronRight size={14} />
        </button>
      </header>

      {!ready ? (
        <div className="agenda-skeleton" aria-busy="true">
          <div className="agenda-row agenda-row--skeleton" />
          <div className="agenda-row agenda-row--skeleton" />
        </div>
      ) : !teacherId ? (
        <EmptyState
          icon={CalendarClock}
          title="Sınıfa katıl"
          description="Öğretmen kodunla sınıfına katıldığında ödev ajandan burada olacak."
        />
      ) : upcoming.length === 0 ? (
        <div className="agenda-empty">
          <CheckCircle2 size={32} aria-hidden="true" />
          <strong>Bu hafta planlı ödevin yok 🎉</strong>
          <span>Tekrara odaklan veya hızlı pratik yap.</span>
        </div>
      ) : (
        <ul className="agenda-list">
          {upcoming.map((a) => {
            const b = badgeFor(a._days);
            return (
              <li key={a.id} className="agenda-row">
                <span className={`agenda-day-badge agenda-day-badge--${b.tone}`}>{b.label}</span>
                <div className="agenda-info">
                  <strong>{a.subject} · {a.topic}</strong>
                  <span>{a.questionCount || 5} soru</span>
                </div>
                <button type="button" className="agenda-cta" onClick={() => start(a)}>
                  Çöz <ChevronRight size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
