import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Crosshair, ChevronLeft, CheckCircle2, XCircle, Loader2, Target, Trophy, ListChecks } from 'lucide-react';
import { supabase } from '../supabase';
import { normalizeQuestion } from '../utils/normalizeQuestion';
import { getTargetedAssignment, submitTargetedAssignment } from '../services/targetedAssignmentsApi';
import { useToast } from '../components/ToastProvider';
import MathMarkdown from '../components/MathMarkdown';
import { SkeletonCard } from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import './TargetedSolve.css';

const LETTERS = ['A', 'B', 'C', 'D', 'E'];

export default function TargetedSolve() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { success, error } = useToast();

  const [assignment, setAssignment] = useState(null);
  const [questions, setQuestions] = useState([]); // normalize edilmiş, sırayla
  const [answers, setAnswers] = useState({});     // questionId -> selectedIndex
  const [loaded, setLoaded] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);     // { autoScore, maxScore }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const a = await getTargetedAssignment(id);
        if (cancelled) return;
        if (!a) { setNotFound(true); setLoaded(true); return; }
        setAssignment(a);
        // questionIds → questions koleksiyonundan yükle (ödev/review ile aynı yol)
        const loadedQs = [];
        for (const qid of a.questionIds) {
          try {
            const { data: qrow } = await supabase.from('questions').select('*').eq('id', qid).single();
            if (qrow) loadedQs.push(normalizeQuestion(qrow));
          } catch (e) {
            console.warn('Hedefli soru yüklenemedi:', qid, e);
          }
        }
        if (cancelled) return;
        setQuestions(loadedQs);
        setLoaded(true);
      } catch (e) {
        console.warn('Hedefli set yüklenemedi:', e);
        if (!cancelled) { setNotFound(true); setLoaded(true); }
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const completed = assignment?.status === 'completed';
  const readOnly = completed || !!result;

  // Tamamlanmışsa: gönderilen cevaplar (read-only)
  const submittedByQid = useMemo(() => {
    const m = {};
    (assignment?.answers || []).forEach((x) => { if (x && x.questionId != null) m[x.questionId] = x.selectedIndex; });
    return m;
  }, [assignment]);

  const correctIndexOf = (q) => (q.options || []).indexOf(q.correctAnswer);
  const chosenFor = (q) => (readOnly ? (completed ? submittedByQid[q.id] : answers[q.id]) : answers[q.id]);

  const answeredCount = useMemo(
    () => questions.filter((q) => answers[q.id] != null).length,
    [questions, answers]
  );
  const allAnswered = questions.length > 0 && answeredCount === questions.length;
  const progressPct = questions.length ? Math.round((answeredCount / questions.length) * 100) : 0;

  // Read-only modda doğru sayısı
  const correctCount = useMemo(() => {
    if (!readOnly) return 0;
    return questions.filter((q) => chosenFor(q) === correctIndexOf(q)).length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, questions, answers, submittedByQid]);

  const scoreNum = (result?.autoScore ?? assignment?.score) ?? correctCount;
  const scoreMax = (result?.maxScore ?? assignment?.maxScore) ?? questions.length;

  const handleSubmit = async () => {
    if (!allAnswered || submitting) return;
    setSubmitting(true);
    try {
      const payload = questions.map((q) => ({ questionId: q.id, selectedIndex: answers[q.id] }));
      const res = await submitTargetedAssignment({ targetedAssignmentId: id, answers: payload });
      setResult(res);
      success('Gönderildi 🎯', res.autoScore != null ? `Skorun: ${res.autoScore}/${res.maxScore}` : 'Set tamamlandı.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      error('Gönderilemedi', e.message || 'Lütfen tekrar dene.');
    } finally {
      setSubmitting(false);
    }
  };

  const scrollToFirstUnanswered = () => {
    const first = questions.find((q) => answers[q.id] == null);
    if (first) document.getElementById(`ts-q-${first.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <div className="dashboard student-dashboard animate-fade-in pb-28">
      <div className="dashboard-header mb-4 mt-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="page-title flex items-center gap-2"><Crosshair size={26} /> Hedefli Set</h1>
          {assignment && (
            <p className="page-subtitle">{assignment.subject}{assignment.focusSubTopics?.length ? ` · ${assignment.focusSubTopics.join(', ')}` : ''}</p>
          )}
        </div>
        <button onClick={() => navigate('/student/targeted')} className="ds-btn-ghost !text-xs flex items-center gap-1.5">
          <ChevronLeft size={14} /> Setlere dön
        </button>
      </div>

      {!loaded ? (
        <div className="flex flex-col gap-4" aria-busy="true"><SkeletonCard lines={3} /><SkeletonCard lines={3} /></div>
      ) : notFound ? (
        <div className="ds-card"><EmptyState icon={Crosshair} title="Set bulunamadı" description="Bu hedefli set artık mevcut değil." /></div>
      ) : questions.length === 0 ? (
        <div className="ds-card"><EmptyState icon={Crosshair} title="Soru yok" description="Bu sette yüklenebilir soru bulunamadı." /></div>
      ) : (
        <>
          {/* Odak konuları + gerekçe */}
          {(assignment.focusSubTopics?.length > 0 || assignment.rationale) && (
            <div className="ds-card ds-card--snug mb-4 flex flex-col gap-2.5"
              style={{ borderColor: 'var(--border-accent)', background: 'var(--accent-primary-soft)' }}>
              <div className="flex items-center gap-2 text-sm font-bold" style={{ color: 'var(--accent-primary-hover)' }}>
                <Target size={16} /> Bu set neye odaklı?
              </div>
              {assignment.focusSubTopics?.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {assignment.focusSubTopics.map((st, i) => (
                    <span key={i} className="text-[11px] font-semibold px-2 py-1 rounded-lg"
                      style={{ background: 'var(--bg-elevated)', color: 'var(--accent-primary-hover)', border: '1px solid var(--border-accent)' }}>
                      {st}
                    </span>
                  ))}
                </div>
              )}
              {assignment.rationale && (
                <p className="text-sm italic" style={{ color: 'var(--text-secondary)' }}>“{assignment.rationale}”</p>
              )}
            </div>
          )}

          {/* Sonuç kahramanı (read-only) */}
          {readOnly && (
            <div className="ds-card mb-4 flex items-center justify-between gap-4 flex-wrap"
              style={{ background: 'linear-gradient(135deg, var(--accent-primary-soft), transparent)' }}>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))' }}>
                  <Trophy size={24} color="#fff" />
                </div>
                <div>
                  <div className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Bu seti tamamladın</div>
                  <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                    {correctCount}/{questions.length} doğru
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Skor</div>
                <div className="text-3xl font-extrabold" style={{ color: 'var(--accent-primary)' }}>{scoreNum}<span className="text-lg" style={{ color: 'var(--text-muted)' }}>/{scoreMax}</span></div>
              </div>
            </div>
          )}

          {/* İlerleme (çözme modu) */}
          {!readOnly && (
            <div className="ds-card ds-card--compact mb-4 flex items-center gap-3">
              <ListChecks size={18} style={{ color: 'var(--accent-primary)' }} className="flex-shrink-0" />
              <div className="flex-1">
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span style={{ color: 'var(--text-secondary)' }}>İlerleme</span>
                  <span style={{ color: 'var(--accent-primary-hover)' }}>{answeredCount} / {questions.length}</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--accent-primary-soft)' }}>
                  <div className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${progressPct}%`, background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-secondary))' }} />
                </div>
              </div>
            </div>
          )}

          {/* Sorular */}
          <div className="flex flex-col gap-4">
            {questions.map((q, qi) => {
              const correctIdx = correctIndexOf(q);
              const chosen = chosenFor(q);
              const answered = chosen != null;
              return (
                <div key={q.id} id={`ts-q-${q.id}`} className="ds-card flex flex-col gap-3">
                  <div className="flex items-start gap-2.5">
                    <span className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-sm font-extrabold"
                      style={answered || readOnly
                        ? { background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))', color: '#fff' }
                        : { background: 'var(--accent-primary-soft)', color: 'var(--accent-primary-hover)' }}>
                      {qi + 1}
                    </span>
                    <div className="text-[0.95rem] font-medium flex-1 pt-0.5" style={{ color: 'var(--text-primary)' }}>
                      <MathMarkdown>{q.text || ''}</MathMarkdown>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 pl-9">
                    {(q.options || []).map((opt, idx) => {
                      const isChosen = chosen === idx;
                      const isCorrect = idx === correctIdx;
                      let style = { borderColor: 'var(--border-color)', background: 'var(--bg-elevated)', color: 'var(--text-primary)' };
                      let badgeStyle = { background: 'var(--accent-primary-soft)', color: 'var(--accent-primary-hover)' };
                      if (readOnly) {
                        if (isCorrect) { style = { borderColor: 'var(--accent-primary)', background: 'var(--accent-primary-soft)', color: 'var(--text-primary)' }; badgeStyle = { background: 'var(--accent-primary)', color: '#fff' }; }
                        else if (isChosen) { style = { borderColor: '#fca5a5', background: 'rgba(239,68,68,0.08)', color: 'var(--text-primary)' }; badgeStyle = { background: '#ef4444', color: '#fff' }; }
                      } else if (isChosen) {
                        style = { borderColor: 'var(--accent-primary)', background: 'var(--accent-primary-soft)', color: 'var(--text-primary)' };
                        badgeStyle = { background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))', color: '#fff' };
                      }
                      return (
                        <button
                          key={idx}
                          type="button"
                          disabled={readOnly}
                          onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: idx }))}
                          className="ts-opt flex gap-2.5 items-center p-2.5 rounded-xl border text-sm text-left transition"
                          style={style}
                        >
                          <span className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-extrabold flex-shrink-0" style={badgeStyle}>
                            {LETTERS[idx] || idx + 1}
                          </span>
                          <span className="flex-1"><MathMarkdown inline>{String(opt)}</MathMarkdown></span>
                          {readOnly && isCorrect && <CheckCircle2 size={18} className="flex-shrink-0" style={{ color: 'var(--accent-primary)' }} />}
                          {readOnly && isChosen && !isCorrect && <XCircle size={18} className="flex-shrink-0" style={{ color: '#ef4444' }} />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Sticky gönderim çubuğu (çözme modu) */}
      {loaded && !notFound && questions.length > 0 && !readOnly && (
        <div className="ts-submitbar">
          <div className="ts-submitbar-inner">
            <button
              type="button"
              onClick={allAnswered ? handleSubmit : scrollToFirstUnanswered}
              disabled={submitting}
              className="ds-btn-primary flex items-center gap-1.5 disabled:opacity-60"
            >
              {submitting ? <><Loader2 size={15} className="animate-spin" /> Gönderiliyor…</>
                : allAnswered ? <><CheckCircle2 size={16} /> Gönder</>
                : `${questions.length - answeredCount} soru kaldı`}
            </button>
            <div className="ts-submitbar-progress" aria-hidden="true">
              <div className="ts-submitbar-fill" style={{ width: `${progressPct}%` }} />
            </div>
            <span className="text-xs font-semibold flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>{answeredCount}/{questions.length}</span>
          </div>
        </div>
      )}
    </div>
  );
}
