import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { ClipboardList, ChevronLeft, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { supabase } from '../supabase';
import { normalizeQuestion } from '../utils/normalizeQuestion';
import { getAssignment, subscribeMySubmission, submitAssignment } from '../services/assignmentsApi';
import { useToast } from '../components/ToastProvider';
import MathMarkdown from '../components/MathMarkdown';
import { SkeletonCard } from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';

const LETTERS = ['A', 'B', 'C', 'D', 'E'];

// Küratörlü (questionIds) ödev çözücü. Faz 8 hedefli-set deseniyle BİREBİR aynı:
// id'den yükle → sırayla çöz → submitAssignment (recordAnswer YOK). questionCount-only
// ödevler bu sayfaya gelmez (AssignmentsList eski adaptif Quiz'e yönlendirir).
export default function AssignmentSolve() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { success, error } = useToast();

  const [assignment, setAssignment] = useState(null);
  const [questions, setQuestions] = useState([]);   // normalize edilmiş, sırayla
  const [answers, setAnswers] = useState({});        // questionId -> selectedIndex
  const [loaded, setLoaded] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [adaptiveOnly, setAdaptiveOnly] = useState(false); // questionIds yoksa eski yola
  const [submission, setSubmission] = useState(null); // mevcut gönderim (varsa)
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);         // { autoScore, maxScore, correctCount }

  // Ödev + soruları yükle
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const a = await getAssignment(id);
        if (cancelled) return;
        if (!a) { setNotFound(true); setLoaded(true); return; }
        const qIds = Array.isArray(a.questionIds) ? a.questionIds : [];
        if (qIds.length === 0) { setAdaptiveOnly(true); setLoaded(true); return; }
        setAssignment(a);
        const loadedQs = [];
        for (const qid of qIds) {
          try {
            const { data: qRow } = await supabase.from('questions').select('*').eq('id', qid).single();
            if (qRow) loadedQs.push(normalizeQuestion(qRow));
          } catch (e) {
            console.warn('Ödev sorusu yüklenemedi:', qid, e);
          }
        }
        if (cancelled) return;
        setQuestions(loadedQs);
        setLoaded(true);
      } catch (e) {
        console.warn('Ödev yüklenemedi:', e);
        if (!cancelled) { setNotFound(true); setLoaded(true); }
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  // Mevcut gönderim (zaten çözülmüşse read-only göster)
  useEffect(() => subscribeMySubmission(id, setSubmission), [id]);

  // Gönderilmiş cevaplar (CF answers array varsa) → read-only seçim göstergesi
  const submittedByQid = useMemo(() => {
    const m = {};
    (submission?.answers || []).forEach((x) => { if (x && x.questionId != null) m[x.questionId] = x.selectedIndex; });
    return m;
  }, [submission]);

  const alreadySubmitted = !!submission && !result;
  const readOnly = alreadySubmitted || !!result;
  const allAnswered = questions.length > 0 && questions.every((q) => answers[q.id] != null);

  const handleSubmit = async () => {
    if (!allAnswered || submitting || readOnly) return;
    setSubmitting(true);
    try {
      // Boş bırakılan için -1 (tümünü cevaplama zorunlu olsa da sözleşme gereği güvenli)
      const payload = questions.map((q) => ({ questionId: q.id, selectedIndex: answers[q.id] ?? -1 }));
      const res = await submitAssignment({ assignmentId: id, answers: payload });
      setResult(res);
      success('Ödev gönderildi ✅', res.autoScore != null ? `Skorun: ${res.autoScore}/${res.maxScore}` : 'Ödev tamamlandı.');
    } catch (e) {
      error('Gönderilemedi', e.message || 'Lütfen tekrar dene.');
    } finally {
      setSubmitting(false);
    }
  };

  const correctIndexOf = (q) => (q.options || []).indexOf(q.correctAnswer);

  if (adaptiveOnly) return <Navigate to={`/student/quiz?subject=${encodeURIComponent(assignment?.subject || '')}&assignmentId=${id}`} replace />;

  // Skor banner değerleri (CF/sonuç ya da mevcut gönderim)
  const scoreNum = result?.autoScore ?? result?.correctCount ?? submission?.autoScore ?? submission?.correctCount ?? submission?.score ?? null;
  const scoreMax = result?.maxScore ?? submission?.maxScore ?? submission?.totalCount ?? questions.length;

  return (
    <div className="dashboard student-dashboard animate-fade-in pb-8">
      <div className="dashboard-header mb-5 mt-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="page-title flex items-center gap-2"><ClipboardList size={26} /> {assignment?.title || 'Ödev'}</h1>
          {assignment && (
            <p className="page-subtitle">{assignment.subject}{assignment.topic ? ` · ${assignment.topic}` : ''}</p>
          )}
        </div>
        <button onClick={() => navigate('/student/assignments')} className="ds-btn-ghost !text-xs flex items-center gap-1.5">
          <ChevronLeft size={14} /> Ödevlere dön
        </button>
      </div>

      {!loaded ? (
        <div className="flex flex-col gap-4" aria-busy="true"><SkeletonCard lines={3} /><SkeletonCard lines={3} /></div>
      ) : notFound ? (
        <div className="ds-card"><EmptyState icon={ClipboardList} title="Ödev bulunamadı" description="Bu ödev artık mevcut değil." /></div>
      ) : questions.length === 0 ? (
        <div className="ds-card"><EmptyState icon={ClipboardList} title="Soru yok" description="Bu ödevde yüklenebilir soru bulunamadı." /></div>
      ) : (
        <>
          {assignment.description && (
            <div className="ds-card ds-card--compact mb-4 text-sm text-slate-300">{assignment.description}</div>
          )}

          {alreadySubmitted && (
            <div className="ds-card ds-card--compact mb-4 text-sm text-emerald-300 flex items-center gap-2">
              <CheckCircle2 size={16} /> Bu ödevi zaten gönderdin. Aşağıda cevap özetin görünüyor.
            </div>
          )}

          {(readOnly) && scoreNum != null && (
            <div className="ds-card mb-4 text-center">
              <div className="text-sm text-slate-400">Skor</div>
              <div className="text-3xl font-extrabold" style={{ color: 'var(--accent-secondary)' }}>
                {scoreNum}/{scoreMax}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-4">
            {questions.map((q, qi) => {
              const correctIdx = correctIndexOf(q);
              const chosen = readOnly
                ? (alreadySubmitted ? submittedByQid[q.id] : answers[q.id])
                : answers[q.id];
              const showCorrect = readOnly && correctIdx >= 0;
              return (
                <div key={q.id} className="ds-card flex flex-col gap-3">
                  <div className="text-sm text-slate-100 font-medium">
                    <span className="text-slate-400 mr-1">{qi + 1}.</span>
                    <MathMarkdown>{q.text || ''}</MathMarkdown>
                  </div>
                  <div className="flex flex-col gap-2">
                    {(q.options || []).map((opt, idx) => {
                      const isChosen = chosen === idx;
                      let cls = 'border-white/8 bg-white/5 text-slate-300';
                      if (readOnly) {
                        if (showCorrect && idx === correctIdx) cls = 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300 font-semibold';
                        else if (isChosen) cls = 'border-red-500/40 bg-red-500/10 text-red-300 font-semibold';
                      } else if (isChosen) {
                        cls = 'border-indigo-400/60 bg-indigo-500/15 text-indigo-200 font-semibold';
                      }
                      return (
                        <button
                          key={idx}
                          type="button"
                          disabled={readOnly}
                          onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: idx }))}
                          className={`flex gap-2 items-start p-2.5 rounded-lg border text-sm text-left transition ${cls}`}
                        >
                          <span className="font-mono font-bold flex-shrink-0">{LETTERS[idx] || idx + 1}</span>
                          <span className="flex-1"><MathMarkdown inline>{String(opt)}</MathMarkdown></span>
                          {showCorrect && idx === correctIdx && <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0" />}
                          {readOnly && isChosen && idx !== correctIdx && <XCircle size={16} className="text-red-400 flex-shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {!readOnly && (
            <div className="mt-5 flex items-center gap-3">
              <button onClick={handleSubmit} disabled={!allAnswered || submitting} className="ds-btn-primary flex items-center gap-1.5 disabled:opacity-50">
                {submitting ? <><Loader2 size={15} className="animate-spin" /> Gönderiliyor…</> : 'Gönder'}
              </button>
              {!allAnswered && <span className="text-xs text-slate-500">Tüm soruları cevapla.</span>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
