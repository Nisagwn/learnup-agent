import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Calendar, CheckCircle2, ChevronRight, ClipboardList } from 'lucide-react';
import { auth, db } from '../firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useUserStats } from '../contexts/UserStatsContext';
import { toDate, dueLabel } from '../utils/formatDate';
import { SkeletonCard } from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';

export default function AssignmentsList() {
  const navigate = useNavigate();
  const { userProfile } = useUserStats();
  const [assignments, setAssignments] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const teacherId = userProfile?.teacherId;
  // Sınıfı yoksa yüklenecek bir şey yok; varsa snapshot dönene kadar yükleniyor.
  const loading = !!teacherId && !loaded;

  // Öğretmenin atadığı ödevler
  useEffect(() => {
    if (!teacherId) return;
    const qA = query(collection(db, 'assignments'), where('teacherId', '==', teacherId));
    const unsub = onSnapshot(
      qA,
      (snap) => {
        setAssignments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoadError(false);
        setLoaded(true);
      },
      (err) => { console.warn('Ödevler yüklenemedi:', err); setLoadError(true); setLoaded(true); }
    );
    return () => unsub();
  }, [teacherId, reloadKey]);

  // Öğrencinin kendi gönderimleri (tamamlanan ödevler)
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const qS = query(collection(db, 'assignment_submissions'), where('studentId', '==', uid));
    const unsub = onSnapshot(qS, (snap) => {
      setSubmissions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  const startAssignment = (a) => {
    // Küratörlü ödev (questionIds): TAM o soruları çözen yeni çözücü.
    // questionCount-only (eski basit) ödev: mevcut konu-adaptif Quiz akışı korunur.
    if (Array.isArray(a.questionIds) && a.questionIds.length > 0) {
      navigate(`/student/assignments/${a.id}`);
    } else {
      navigate(`/student/quiz?subject=${encodeURIComponent(a.subject)}&assignmentId=${a.id}`);
    }
  };

  // Yalnız yayında olan ödevler (taslak/kapalı/arşiv öğrenciye sızmasın; eski status'suz docs görünür)
  const sorted = assignments
    .filter((a) => !a.status || a.status === 'active')
    .sort((a, b) => (toDate(b.createdAt) || 0) - (toDate(a.createdAt) || 0));

  return (
    <div className="dashboard student-dashboard animate-fade-in pb-8">
      <div className="dashboard-header mb-6 mt-4">
        <h1 className="page-title flex items-center gap-2"><ClipboardList size={26} /> Ödevlerim</h1>
        <p className="page-subtitle">Öğretmeninin atadığı testleri buradan çözebilirsin.</p>
      </div>

      {loading ? (
        <div className="flex flex-col gap-4" aria-busy="true">
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
        </div>
      ) : loadError ? (
        <div className="ds-card">
          <ErrorState
            title="Ödevler yüklenemedi"
            description="Ödevlerin alınırken bir sorun oluştu. Lütfen tekrar deneyin."
            onRetry={() => { setLoaded(false); setLoadError(false); setReloadKey(k => k + 1); }}
          />
        </div>
      ) : !teacherId ? (
        <div className="ds-card">
          <EmptyState
            icon={BookOpen}
            title="Henüz Bir Sınıfa Katılmadın"
            description="Öğretmeninin verdiği sınıf kodunu girerek ödevlerini görebilirsin."
          />
        </div>
      ) : sorted.length === 0 ? (
        <div className="ds-card">
          <EmptyState
            icon={ClipboardList}
            title="Atanmış Ödev Yok"
            description="Öğretmenin yeni bir ödev atadığında burada görünecek."
          />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {sorted.map(a => {
            const sub = submissions.find(s => s.assignmentId === a.id);
            const due = dueLabel(a.dueDate);
            // Gönderim iki şemada gelebilir: client (score%/correctCount/totalCount)
            // veya submitAssignment CF (autoScore/maxScore). İkisini de göster.
            const subCorrect = sub?.correctCount ?? sub?.autoScore ?? null;
            const subTotal = sub?.totalCount ?? sub?.maxScore ?? null;
            const subPct = sub?.score ?? (subCorrect != null && subTotal ? Math.round((subCorrect / subTotal) * 100) : null);
            return (
              <div key={a.id} className="ds-card flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-white">{a.subject} — {a.topic}</h3>
                  <div className="flex items-center gap-4 mt-1.5 text-xs">
                    <span className="text-slate-400">{(Array.isArray(a.questionIds) && a.questionIds.length) || a.questionCount || 5} soru</span>
                    <span className={`flex items-center gap-1 font-semibold ${due.cls}`}>
                      <Calendar size={13} aria-hidden="true" /> {due.text}
                    </span>
                  </div>
                </div>

                {sub ? (
                  <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 font-semibold">
                    <CheckCircle2 size={18} />
                    Tamamlandı{subPct != null ? ` · %${subPct}` : ''}{subCorrect != null && subTotal != null ? ` (${subCorrect}/${subTotal})` : ''}
                  </div>
                ) : (
                  <button onClick={() => startAssignment(a)} className="ds-btn-primary flex items-center gap-1.5">
                    Teste Başla <ChevronRight size={16} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
