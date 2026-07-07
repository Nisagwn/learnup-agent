import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RotateCcw, CheckCircle2, AlertCircle, ChevronDown, Target } from 'lucide-react';
import { auth, db } from '../firebase';
import { collection, query, where, onSnapshot, getDoc, getDocs, doc } from 'firebase/firestore';
import { motion as Motion } from 'framer-motion';
import MathMarkdown from '../components/MathMarkdown';
import QuestionPreviewModal from '../components/QuestionPreviewModal';
import normalizeQuestion from '../utils/normalizeQuestion';
import {
  categorizeBox, CATEGORY_META, formatNextReview, isDue, getNextReviewMs,
  groupBySubTopic, pickTopForRetake,
} from '../utils/srs';
import { containerStagger, itemRise } from '../utils/motion';
import { toDate, formatDate } from '../utils/formatDate';
import { SkeletonCard } from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';

const MAX_REVIEW = 20; // tek tekrar oturumunda en fazla soru

// SRS kategori sekmeleri (anahtarlar SRS_CATEGORY ile aynı)
const CATEGORY_TABS = [
  { key: 'all', label: 'Tümü' },
  { key: 'new', label: '🆕 Yeni' },
  { key: 'review', label: '🔁 Tekrar' },
  { key: 'learned', label: '✅ Öğrenildi' },
];

export default function WrongAnswers() {
  const navigate = useNavigate();
  const [logs, setLogs] = useState([]);
  // questionId -> { question, choices, answer } (SRS snapshot; soru havuzdan silinse bile korunur)
  const [snapshots, setSnapshots] = useState({});
  // questionId -> { box, nextReviewAtMs } (SRS durumu; YALNIZ backend yazar, biz okuruz)
  const [srsMeta, setSrsMeta] = useState({});
  // Tam SRS kartları (id=questionId + subject/sub_topic/box/nextReviewAtMs/lastReviewed/snapshot)
  const [srsCards, setSrsCards] = useState([]);
  const [expandedGroups, setExpandedGroups] = useState(() => new Set());
  const [srsOpen, setSrsOpen] = useState(false); // Akıllı tekrar paneli (sade için varsayılan kapalı)
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Önizleme modalı + lazy soru detayları
  const [activeId, setActiveId] = useState(null);
  const [questionDetails, setQuestionDetails] = useState({}); // questionId -> normalize edilmiş soru
  const [detailLoadingId, setDetailLoadingId] = useState(null);
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const loading = !loaded;

  // Öğrencinin tüm cevap kayıtları (tek alanlı sorgu — composite index gerekmez)
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const qL = query(collection(db, 'user_logs'), where('studentId', '==', uid));
    const unsub = onSnapshot(
      qL,
      (snap) => {
        setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoadError(false);
        setLoaded(true);
      },
      (err) => { console.warn('Yanlışlar yüklenemedi:', err); setLoadError(true); setLoaded(true); }
    );
    return () => unsub();
  }, [reloadKey]);

  // SRS kartlarındaki soru anlık görüntüleri (metin + şıklar + doğru cevap).
  // user_logs bu alanları tutmaz; soru metni burada saklanır (havuzdan silinse bile korunur).
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(collection(db, 'users', uid, 'srs_cards'));
        if (cancelled) return;
        const map = {};
        const meta = {};
        const cards = [];
        snap.forEach(d => {
          const data = d.data();
          if (data?.snapshot?.question) map[d.id] = data.snapshot;
          // box / nextReviewAtMs backend otoritesidir — sadece okunur, hesaplanmaz.
          meta[d.id] = { box: data?.box, nextReviewAtMs: data?.nextReviewAtMs, nextReviewAt: data?.nextReviewAt };
          cards.push({
            id: d.id, // doc id = questionId (mevcut review akışı bunu bekler)
            subject: data?.subject || 'Genel',
            sub_topic: data?.sub_topic ?? data?.subject ?? 'Genel',
            box: data?.box,
            nextReviewAtMs: data?.nextReviewAtMs,
            nextReviewAt: data?.nextReviewAt,
            lastReviewedAt: data?.lastReviewedAt,
            lastReviewedAtMs: data?.lastReviewedAtMs,
            snapshot: data?.snapshot || null,
          });
        });
        setSnapshots(map);
        setSrsMeta(meta);
        setSrsCards(cards);
      } catch (err) {
        console.warn('Soru anlık görüntüleri yüklenemedi:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [reloadKey]);

  // Atlanmamış yanlış cevaplar (tekilleştirilmemiş) — soru başına yanlış sayısı için.
  const allWrong = useMemo(
    () => logs.filter(l => l.isCorrect === false && !l.skipped && l.questionId),
    [logs]
  );

  // Soru başına kaç kez yanlış yapıldı
  const wrongCountById = useMemo(() => {
    const m = {};
    for (const l of allWrong) m[l.questionId] = (m[l.questionId] || 0) + 1;
    return m;
  }, [allWrong]);

  // Yanlış cevaplar: tarihe göre yeni→eski, soruya göre tekil (en güncel kayıt tutulur)
  const wrongList = useMemo(() => {
    const wrong = [...allWrong].sort(
      (a, b) => (toDate(b.timestamp)?.getTime() || 0) - (toDate(a.timestamp)?.getTime() || 0)
    );
    const seen = new Set();
    const out = [];
    for (const l of wrong) {
      if (seen.has(l.questionId)) continue;
      seen.add(l.questionId);
      out.push(l);
    }
    return out;
  }, [allWrong]);

  // Ders listesi (filtre için)
  const subjects = useMemo(() => {
    const s = new Set();
    wrongList.forEach(l => s.add(l.subject || 'Genel'));
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'tr'));
  }, [wrongList]);

  // Ders kapsamı (kategori sekmelerinden ÖNCE)
  const subjectScoped = useMemo(
    () => (subjectFilter === 'all' ? wrongList : wrongList.filter(l => (l.subject || 'Genel') === subjectFilter)),
    [wrongList, subjectFilter]
  );

  // Kategori sayıları (mevcut ders kapsamına göre) — box yalnız okunur
  const categoryCounts = useMemo(() => {
    const c = { all: subjectScoped.length, new: 0, review: 0, learned: 0 };
    for (const l of subjectScoped) {
      const m = srsMeta[l.questionId];
      if (!m || m.box == null) continue;
      c[categorizeBox(m.box)]++;
    }
    return c;
  }, [subjectScoped, srsMeta]);

  // Kategori filtresi + "vakti gelenleri önce göster" sıralaması.
  // Sıra: due kartlar önce → en yakın nextReviewAtMs → en yeni yanlış.
  // nextReviewAtMs/box kartın kendi (backend) değerinden okunur, hesaplanmaz.
  const filteredList = useMemo(() => {
    let list = subjectScoped;
    if (categoryFilter !== 'all') {
      list = list.filter(l => {
        const m = srsMeta[l.questionId];
        return m && m.box != null && categorizeBox(m.box) === categoryFilter;
      });
    }
    return [...list].sort((a, b) => {
      const ca = srsMeta[a.questionId];
      const cb = srsMeta[b.questionId];
      const dueA = isDue(ca);
      const dueB = isDue(cb);
      if (dueA !== dueB) return dueA ? -1 : 1;
      const ta = getNextReviewMs(ca);
      const tb = getNextReviewMs(cb);
      const va = ta == null ? 0 : ta;
      const vb = tb == null ? 0 : tb;
      if (va !== vb) return va - vb;
      return (toDate(b.timestamp)?.getTime() || 0) - (toDate(a.timestamp)?.getTime() || 0);
    });
  }, [subjectScoped, categoryFilter, srsMeta]);

  // Önizlemeyi aç + soru detayını (questions/{id}) lazy çek ve cache'le
  const openPreview = async (questionId) => {
    if (!questionId) return;
    setActiveId(questionId);
    if (questionDetails[questionId] !== undefined) return; // önbellekte
    setDetailLoadingId(questionId);
    try {
      const snap = await getDoc(doc(db, 'questions', questionId));
      setQuestionDetails(prev => ({
        ...prev,
        [questionId]: snap.exists() ? normalizeQuestion(snap.data()) : null,
      }));
    } catch (err) {
      console.warn('Soru detayı yüklenemedi:', err);
      setQuestionDetails(prev => ({ ...prev, [questionId]: null }));
    } finally {
      setDetailLoadingId(null);
    }
  };

  const startReview = () => {
    const ids = filteredList.slice(0, MAX_REVIEW).map(l => l.questionId);
    if (ids.length === 0) return;
    navigate(`/student/quiz?mode=review&ids=${ids.join(',')}`);
  };

  // ── SRS alt-konu gruplama + "en kritik N çöz" ──
  // Gruplar tüm srs kartlarından; çöz aksiyonu MEVCUT review akışını kullanır (ids = questionId).
  const srsGroups = useMemo(() => groupBySubTopic(srsCards), [srsCards]);
  const criticalCards = useMemo(() => pickTopForRetake(srsCards, Date.now(), 10), [srsCards]);

  const solveCards = (cards) => {
    const ids = (cards || []).map(c => c.id).filter(Boolean);
    if (ids.length === 0) return;
    navigate(`/student/quiz?mode=review&ids=${ids.join(',')}`);
  };
  const toggleGroup = (key) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const activeLog = activeId ? wrongList.find(l => l.questionId === activeId) : null;

  return (
    <div className="dashboard student-dashboard animate-fade-in pb-8">
      <div className="dashboard-header mb-6 mt-4 flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2"><RotateCcw size={26} /> Yanlışlarım</h1>
          <p className="page-subtitle">Yanlış çözdüğün soruları önizle, çözümünü gör ve yeniden çöz.</p>
        </div>
        {filteredList.length > 0 && (
          <button onClick={startReview} className="ds-btn-primary flex items-center gap-1.5">
            <RotateCcw size={16} /> Yanlışlarımı Tekrar Çöz
          </button>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" aria-busy="true">
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
        </div>
      ) : loadError ? (
        <div className="ds-card">
          <ErrorState
            title="Yanlışlar yüklenemedi"
            description="Cevap geçmişin alınırken bir sorun oluştu. Lütfen tekrar deneyin."
            onRetry={() => { setLoaded(false); setLoadError(false); setReloadKey(k => k + 1); }}
          />
        </div>
      ) : wrongList.length === 0 ? (
        <div className="ds-card">
          <EmptyState
            icon={CheckCircle2}
            title="Yanlışın Yok! 🎉"
            description="Henüz yanlış çözdüğün bir soru yok. Çözmeye devam ettikçe gelişimini buradan takip edebilirsin."
          />
        </div>
      ) : (
        <>
          {/* Özet şeridi — sade, 3 net istatistik */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="ds-card ds-card--compact flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <AlertCircle size={15} style={{ color: '#DC6B5A' }} aria-hidden="true" /> Toplam hata
              </div>
              <div className="text-2xl font-extrabold text-white leading-none">{wrongList.length}</div>
            </div>
            <div className="ds-card ds-card--compact flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <RotateCcw size={15} className="text-lime-600" aria-hidden="true" /> Tekrar bekleyen
              </div>
              <div className="text-2xl font-extrabold text-white leading-none">{categoryCounts.review}</div>
            </div>
            <div className="ds-card ds-card--compact flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <CheckCircle2 size={15} className="text-emerald-500" aria-hidden="true" /> Öğrenildi
              </div>
              <div className="text-2xl font-extrabold text-white leading-none">{categoryCounts.learned}</div>
            </div>
          </div>

          {/* Akıllı tekrar — tek katlanabilir panel (sade) */}
          {srsGroups.length > 0 && (
            <div className="ds-card p-0 overflow-hidden mb-6">
              <div className="flex items-center gap-3 px-5 py-4">
                <button
                  type="button"
                  onClick={() => setSrsOpen(o => !o)}
                  className="flex items-center gap-3 flex-1 min-w-0 text-left"
                  aria-expanded={srsOpen}
                >
                  <div className="w-10 h-10 rounded-xl bg-lime-500/15 text-lime-600 flex items-center justify-center flex-shrink-0">
                    <Target size={20} aria-hidden="true" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-white">Konu Bazlı Akıllı Tekrar</div>
                    <div className="text-xs text-slate-400 truncate">{srsGroups.length} konu · en kritik sorulardan başla</div>
                  </div>
                  <ChevronDown size={18} className={`text-slate-400 transition-transform flex-shrink-0 ${srsOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                </button>
                {criticalCards.length > 0 && (
                  <button
                    type="button"
                    onClick={() => solveCards(criticalCards)}
                    className="ds-btn-primary flex items-center gap-1.5 !py-2 !text-xs flex-shrink-0"
                  >
                    <RotateCcw size={14} aria-hidden="true" /> En kritik {criticalCards.length}
                  </button>
                )}
              </div>

              {srsOpen && (
                <div className="px-5 pb-5 pt-1 flex flex-col gap-2 border-t border-white/5">
                  {srsGroups.map(g => {
                    const open = expandedGroups.has(g.subTopic);
                    const solvable = pickTopForRetake(g.cards, Date.now(), 10);
                    return (
                      <div key={g.subTopic} className="rounded-xl border border-white/5 bg-white/5 overflow-hidden">
                        <button
                          type="button"
                          onClick={() => toggleGroup(g.subTopic)}
                          className="w-full flex items-center gap-2 px-4 py-3 text-left"
                          aria-expanded={open}
                        >
                          <ChevronDown size={16} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
                          <span className="text-sm font-semibold text-slate-100 flex-1 min-w-0 truncate">{g.subTopic}</span>
                          <span className="px-2 py-0.5 bg-[#4D7C0F]/12 text-[#3F6212] rounded-md text-[11px] font-semibold">{g.subject}</span>
                          <span className="text-xs text-slate-400 whitespace-nowrap">{g.cards.length} kart</span>
                        </button>
                        {open && (
                          <div className="px-4 pb-4 flex flex-col gap-2.5 border-t border-white/5 pt-3">
                            {g.cards.map(c => {
                              const cat = c.box != null ? CATEGORY_META[categorizeBox(c.box)] : null;
                              return (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => openPreview(c.id)}
                                  className="text-left text-sm text-slate-300 hover:text-white flex items-start gap-2"
                                >
                                  {cat && <span className="flex-shrink-0" aria-hidden="true">{cat.emoji}</span>}
                                  <span className="line-clamp-2 flex-1">
                                    {c.snapshot?.question
                                      ? <MathMarkdown inline>{c.snapshot.question}</MathMarkdown>
                                      : 'Soru metni kayıtlı değil'}
                                  </span>
                                </button>
                              );
                            })}
                            {solvable.length > 0 && (
                              <button
                                type="button"
                                onClick={() => solveCards(solvable)}
                                className="ds-btn-ghost self-start !py-1.5 !text-xs flex items-center gap-1.5 mt-1"
                              >
                                <RotateCcw size={13} aria-hidden="true" /> Bu konuyu çöz ({solvable.length})
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Filtre çubuğu — kategori + ders tek satırda, sade */}
          <div className="ds-card ds-card--compact flex flex-col gap-3 sm:flex-row sm:items-center mb-5">
            <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
              {CATEGORY_TABS.map(t => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setCategoryFilter(t.key)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition ${
                    categoryFilter === t.key
                      ? 'bg-lime-500/20 text-lime-700 ring-1 ring-lime-600/50'
                      : 'bg-white/5 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {t.label} <span className="opacity-70">{categoryCounts[t.key] ?? 0}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <select
                id="subjectFilter"
                aria-label="Ders filtresi"
                className="form-control !py-1.5 text-sm"
                style={{ maxWidth: 200 }}
                value={subjectFilter}
                onChange={(e) => setSubjectFilter(e.target.value)}
              >
                <option value="all">Tüm dersler</option>
                {subjects.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <span className="text-xs text-slate-500 whitespace-nowrap">{filteredList.length} soru</span>
            </div>
          </div>

          {/* Kart ızgarası — sade, okunur */}
          {filteredList.length === 0 ? (
            <div className="ds-card">
              <EmptyState
                icon={CheckCircle2}
                title="Bu seçimde yanlışın yok"
                description="Seçtiğin ders/kategori için yanlış çözdüğün bir soru bulunmuyor."
              />
            </div>
          ) : (
            <Motion.div
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
              variants={containerStagger}
              initial="hidden"
              animate="show"
            >
              {filteredList.map(l => {
                const snapText = snapshots[l.questionId]?.question;
                const count = wrongCountById[l.questionId] || 1;
                const meta = srsMeta[l.questionId];
                const hasBox = meta && meta.box != null;
                const cat = hasBox ? CATEGORY_META[categorizeBox(meta.box)] : null;
                const reviewLabel = hasBox ? formatNextReview(meta) : null;
                return (
                  <Motion.div
                    key={l.id}
                    variants={itemRise}
                    role="button"
                    tabIndex={0}
                    onClick={() => openPreview(l.questionId)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPreview(l.questionId); } }}
                    className="ds-card is-interactive hover-pop flex flex-col gap-3"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-0.5 bg-[#4D7C0F]/12 text-[#3F6212] rounded-md text-xs font-semibold">{l.subject || 'Genel'}</span>
                      {cat && (
                        <span className="px-2.5 py-0.5 bg-white/5 text-slate-300 rounded-md text-xs font-semibold">{cat.emoji} {cat.label}</span>
                      )}
                      {count > 1 && (
                        <span className="px-2.5 py-0.5 rounded-md text-xs font-bold" style={{ background: 'rgba(220,107,90,0.15)', color: '#DC6B5A' }}>{count}× yanlış</span>
                      )}
                    </div>

                    <div className="text-[0.95rem] leading-relaxed text-slate-100 font-medium line-clamp-3 flex-1">
                      {snapText ? (
                        <MathMarkdown>{snapText}</MathMarkdown>
                      ) : (
                        <span className="text-slate-400">Önizlemek için tıkla →</span>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/5">
                      <span className="text-xs text-slate-500 truncate">{reviewLabel || formatDate(l.timestamp)}</span>
                      <span className="text-xs font-semibold text-lime-700 whitespace-nowrap">Çözümü gör →</span>
                    </div>
                  </Motion.div>
                );
              })}
            </Motion.div>
          )}
        </>
      )}

      <QuestionPreviewModal
        isOpen={!!activeId}
        onClose={() => setActiveId(null)}
        log={activeLog}
        detail={activeId ? questionDetails[activeId] : null}
        snapshot={activeId ? snapshots[activeId] : null}
        loadingDetail={detailLoadingId === activeId}
        wrongCount={activeId ? (wrongCountById[activeId] || 1) : 0}
        onRetryQuestion={() => { if (activeId) navigate(`/student/quiz?mode=review&ids=${activeId}`); }}
      />
    </div>
  );
}
