import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, CheckCircle2, XCircle, BrainCircuit, Lightbulb, Loader2, Award, BookOpen, Star, X } from 'lucide-react';
import { InlineMath, BlockMath } from 'react-katex';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { auth, db } from '../firebase';
import { doc, getDoc, setDoc, deleteDoc, collection, addDoc } from 'firebase/firestore';
import { safeServerTimestamp } from '../utils/safeTimestamp';
import { useToast } from '../components/ToastProvider';
import { useUserStats } from '../contexts/UserStatsContext';
import FloatingAI from '../components/FloatingAI';
import { generateDynamicHint } from '../utils/aiService';
import { generateQuiz } from '../services/aiService';
import { loadEphemeralQuiz, clearEphemeralQuiz } from '../utils/ephemeralQuiz';
import { recordAnswer } from '../utils/gamificationApi';
import { celebrate } from '../utils/celebrate';
import { autoWrapLatex } from '../utils/latex';
import { Skeleton } from '../components/ui/Skeleton';
import SessionSummary from '../components/quiz/SessionSummary';
import { normalizeQuestion } from '../utils/normalizeQuestion';
import { resolveSubject } from '../utils/subjects';
import { createQuestionQueue } from '../utils/questionQueue';
import './Quiz.css';

const IS_DEV = import.meta.env.DEV;
const FIREBASE_PROJECT_ID = "learnup-3cdb7";
const BACKEND_BASE = import.meta.env.VITE_BACKEND_BASE_URL || (IS_DEV ? `http://127.0.0.1:5001/${FIREBASE_PROJECT_ID}/us-central1` : `https://us-central1-${FIREBASE_PROJECT_ID}.cloudfunctions.net`);
const SUBMIT_ANSWER_URL = `${BACKEND_BASE.replace(/\/$/, '')}/submitAnswer`;

// Adaptif zorluk seviyesini (1/2/3) havuz sorgusu için string'e çevirir.
const mapLevelToDifficulty = (level) => {
  const n = Number(level) || 2;
  return n <= 1 ? 'easy' : n >= 3 ? 'hard' : 'medium';
};

export default function Quiz() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const subject = searchParams.get('subject') || 'Genel';
  const assignmentId = searchParams.get('assignmentId');
  const reviewMode = searchParams.get('mode') === 'review';
  const reviewIds = (searchParams.get('ids') || '').split(',').map(s => s.trim()).filter(Boolean);
  // Efemeral (AI sabit-N) mod: sorular havuzda değil, sessionStorage'da (sid ile) taşınır.
  const ephemeralMode = searchParams.get('mode') === 'ai';
  const sid = searchParams.get('sid');
  const { error, success } = useToast();
  const { userProfile, stats } = useUserStats();
  const [userData, setUserData] = useState(null);
  const [learningStats, setLearningStats] = useState({
    currentLevel: 2,
    correctStreak: 0,
  });

  const [loading, setLoading] = useState(true);
  const [isChangingQuestion, setIsChangingQuestion] = useState(false);
  
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [questionSource, setQuestionSource] = useState(null); // 'db' | 'ai' | null
  const [questionCount, setQuestionCount] = useState(1);
  const [solvedQuestionIds, setSolvedQuestionIds] = useState([]);
  const [assignment, setAssignment] = useState(null);
  // Favori (bookmark) durumu
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [bookmarkBusy, setBookmarkBusy] = useState(false);

  const [selectedOption, setSelectedOption] = useState(null);
  const [isAnswering, setIsAnswering] = useState(false);
  const [timeLeft, setTimeLeft] = useState(60);
  const [questionStartTime, setQuestionStartTime] = useState(Date.now());
  const [showSuccess, setShowSuccess] = useState(false);
  const [wrongAnswered, setWrongAnswered] = useState(false);

  // Hint states
  const [showHint, setShowHint] = useState(false);
  const [hintText, setHintText] = useState('');
  const [hintLoading, setHintLoading] = useState(false);

  // AI context & wrong count
  const [quizContext, setQuizContext] = useState(null);
  const [wrongCount, setWrongCount] = useState(0);
  const [autoOpenAI, setAutoOpenAI] = useState(false);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  // DB cooldown/backoff: prevent rapid repeated fetches when DB is empty or transient errors occur
  const [dbCooldownUntil, setDbCooldownUntil] = useState(0);

  // FIX: Refs that mirror volatile state so useCallback can read latest values
  // without needing them in its dependency array (which would cause infinite re-creation).
  const solvedQuestionIdsRef = useRef([]);
  const fetchFailureCountRef = useRef(0);
  const userProfileRef = useRef(null);
  const dbCooldownUntilRef = useRef(0);
  // FIX: questionCount/currentQuestion/selectedOption de ref'e yansitiliyor;
  // aksi halde fetchAdaptiveQuestion bunlari eski (stale) degerleriyle okuyordu.
  const questionCountRef = useRef(1);
  const currentQuestionRef = useRef(null);
  const selectedOptionRef = useRef(null);
  // İstemci soru kuyruğu (3-tier havuz + lokal yedek). Review/ödev dışı modlarda kurulur.
  const queueRef = useRef(null);
  // Adaptif zorluk hint'i için learningStats'ı ref'e yansıt (stale-closure'dan kaçın).
  const learningStatsRef = useRef({ currentLevel: 2 });
  // Ödev modu: hedef soru sayisi assignmentRef'te, ilerleme assignmentStateRef'te tutulur
  const assignmentRef = useRef(null);
  const assignmentStateRef = useRef({ answered: 0, correct: 0, finalized: false });
  // Tekrar modu: çözülecek soru id listesi + ilerleme
  const reviewIdsRef = useRef([]);
  const reviewIndexRef = useRef(0);
  const reviewStateRef = useRef({ answered: 0, correct: 0, total: 0, finalized: false });
  // Efemeral set: { questions, index, source, subject, count, difficulty, grade, _finalized }
  const ephemeralRef = useRef(null);
  const [, setFetchFailureCount] = useState(0);
  // Mastery UI state
  const [topicMasteryValue, setTopicMasteryValue] = useState(null);
  const [topicMasteryLevelName, setTopicMasteryLevelName] = useState(null);
  const [showLevelUpBanner, setShowLevelUpBanner] = useState(false);
  // "+XP" süzülme çipi (saf sunum) — doğru cevapta tetiklenir, kısa süre sonra temizlenir
  const [xpFloat, setXpFloat] = useState(null);

  // Oturum (tur) istatistikleri — recordAnswer delta'larından birikir, SessionSummary'de gösterilir
  const sessionRef = useRef({ answered: 0, correct: 0, xp: 0, streakCount: 0, streakMilestone: null, questsCompleted: [], newBadges: [] });
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryData, setSummaryData] = useState(null);

  // FIX: Keep refs in sync with state on every render (no re-render cost)
  useEffect(() => { solvedQuestionIdsRef.current = solvedQuestionIds; }, [solvedQuestionIds]);
  useEffect(() => { userProfileRef.current = userProfile; }, [userProfile]);
  useEffect(() => { dbCooldownUntilRef.current = dbCooldownUntil; }, [dbCooldownUntil]);
  useEffect(() => { questionCountRef.current = questionCount; }, [questionCount]);
  useEffect(() => { currentQuestionRef.current = currentQuestion; }, [currentQuestion]);
  useEffect(() => { selectedOptionRef.current = selectedOption; }, [selectedOption]);
  useEffect(() => { learningStatsRef.current = learningStats; }, [learningStats]);
  useEffect(() => {
    setUserData(userProfile || null);
  }, [userProfile]);
  useEffect(() => {
    setLearningStats((prev) => ({
      ...prev,
      currentLevel: stats?.level || prev.currentLevel || 2,
    }));
  }, [stats?.level]);

  const fetchAdaptiveQuestion = useCallback(async (isCorrect = null, givenAnswer = null, duration = null) => {
    // Read volatile values from refs — no stale closures, no dependency array issues
    const _solvedIds = solvedQuestionIdsRef.current;
    const _failCount = fetchFailureCountRef.current;
    const _userProfile = userProfileRef.current;
    const _cooldownUntil = dbCooldownUntilRef.current;
    const _questionCount = questionCountRef.current;
    const _currentQuestion = currentQuestionRef.current;
    const _selectedOption = selectedOptionRef.current;
    // If a cooldown is active, skip attempting to fetch to avoid spamming the DB or backend
    if (_cooldownUntil && Date.now() < _cooldownUntil) {
      console.warn('Skipping fetchAdaptiveQuestion due to cooldown until', new Date(_cooldownUntil).toISOString());
      return;
    }

    setIsChangingQuestion(true);
    if (isCorrect === null) setLoading(true);
    
    try {
      const user = auth.currentUser;
      if (!user) {
        navigate('/login');
        return;
      }

      const dbCategory = resolveSubject(subject).category;

      // İstemci kuyruğu: 3-tier Firestore havuzu + lokal JSON yedek. AI çağrısı yapmadan
      // önce hazır soru servis etmeye çalışır (maliyet/gecikme tasarrufu).
      try {
        if (!queueRef.current) {
          const gradeStr = (_userProfile && _userProfile.grade) ? String(_userProfile.grade) : '10';
          queueRef.current = createQuestionQueue({
            category: dbCategory,
            grade: gradeStr,
            difficulty: mapLevelToDifficulty(_questionCount === 1 ? 2 : learningStatsRef.current.currentLevel),
          });
          queueRef.current.seedSolved(_solvedIds);
        }
        // Adaptif bağlamı güncelle (zorluk + son sorunun konusu sonraki havuz çağrısına yansır)
        queueRef.current.updateContext({
          difficulty: mapLevelToDifficulty(learningStatsRef.current.currentLevel),
          topic: _currentQuestion?.topic || null,
          sub_topic: _currentQuestion?.sub_topic || null,
        });

        const picked = await queueRef.current.next();
        if (picked) {
          setCurrentQuestion(picked); // kuyruk normalize edilmiş döndürür
          setQuestionSource('db'); // lokal & db sorular UI'da "Hazır soru" olarak gösterilir
          queueRef.current.markSolved(picked.id);
          if (!_solvedIds.includes(picked.id)) setSolvedQuestionIds(prev => [...prev, picked.id]);
          // havuz içerik servis etti → backoff sayaçlarını sıfırla
          fetchFailureCountRef.current = 0;
          setFetchFailureCount(0);
          setDbCooldownUntil(0);
          return;
        }
      } catch (dbErr) {
        console.warn('Soru kuyruğu/havuz okuması başarısız:', dbErr);
      }

      // If we are on first 10 questions and couldn't find anything in DB, do NOT call the AI backend!
      if (_questionCount <= 10) {
        setCurrentQuestion(null);
        setQuestionSource(null);
        error('Soru Bulunamadı', 'İlk 10 soru havuzdan yükleniyor fakat uygun soru bulunamadı.');
        return;
      }
      // Include the user's ID token in Authorization header so the backend can verify identity
      let idToken = null;
      try {
        idToken = await user.getIdToken();
      } catch (e) {
        console.warn('Failed to get ID token for submitAnswer:', e);
      }
      const headers = { 'Content-Type': 'application/json' };
      if (idToken) headers['Authorization'] = `Bearer ${idToken}`;

      const res = await fetch(SUBMIT_ANSWER_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          userId: user.uid,
          subject: dbCategory,
          topic: _currentQuestion?.topic || dbCategory,
          sub_topic: _currentQuestion?.sub_topic || null,
          isCorrect: isCorrect,
          givenAnswer: givenAnswer || _selectedOption || null,
          duration: duration || null,
          questionId: _currentQuestion?.id || null,
          solvedQuestionIds: _solvedIds,
          questionText: _currentQuestion?.text || null
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Sunucu hatası");
      }

      // If the functions proxy returned a graceful fallback (quota or model error),
      // surface that message to the user and apply a small cooldown so the UI doesn't spam retries.
      if (data && data.fallback) {
        console.warn('Backend returned fallback:', data);
        error('API Kotası', data.message || 'Üzgünüm, API kotası aşıldığı için soru üretilemedi. Lütfen birkaç dakika sonra tekrar deneyin.');
        setCurrentQuestion(null);
        setQuestionSource('ai');

        // lightweight backoff on fallback
        const nextFailCount = _failCount + 1;
        const cooldownSec = Math.min(120, 8 * nextFailCount);
        fetchFailureCountRef.current = nextFailCount;
        setFetchFailureCount(nextFailCount);
        setDbCooldownUntil(Date.now() + cooldownSec * 1000);
        // update mastery UI if available
        if (data.mastery) {
          setTopicMasteryValue(data.mastery.value ?? null);
          setTopicMasteryLevelName(data.mastery.levelName ?? null);
          if (data.mastery.levelUp) {
            confetti({ particleCount: 120, spread: 90 });
            setShowLevelUpBanner(true);
            setTimeout(() => setShowLevelUpBanner(false), 3500);
          }
        }
      } else if (data.nextQuestion) {
        // Success: reset any backoff counters
        setCurrentQuestion(normalizeQuestion(data.nextQuestion));
        setQuestionSource((data.nextQuestion?.isAI || data.nextQuestion?.is_ai_generated) ? 'ai' : 'db');
        if (data.nextQuestion?.id && queueRef.current) queueRef.current.markSolved(data.nextQuestion.id);
        if (!_solvedIds.includes(data.nextQuestion.id)) {
           setSolvedQuestionIds(prev => [...prev, data.nextQuestion.id]);
        }
        if (data.stats) {
          setLearningStats(data.stats);
        }
        if (data.pedagogicalHint) {
          setHintText(data.pedagogicalHint);
          setShowHint(true);
        }
        fetchFailureCountRef.current = 0;
        setFetchFailureCount(0);
        setDbCooldownUntil(0);

        // update mastery UI if available
        if (data.mastery) {
          setTopicMasteryValue(data.mastery.value ?? null);
          setTopicMasteryLevelName(data.mastery.levelName ?? null);
          if (data.mastery.levelUp) {
            confetti({ particleCount: 120, spread: 90 });
            setShowLevelUpBanner(true);
            setTimeout(() => setShowLevelUpBanner(false), 3500);
          }
        }

      } else {
        // No question returned from DB and no AI fallback: treat as DB-empty transient and apply cooldown
        setCurrentQuestion(null);
        setQuestionSource(null);
        const nextFailCount = _failCount + 1;
        const cooldownSec = Math.min(120, 8 * nextFailCount);
        fetchFailureCountRef.current = nextFailCount;
        setFetchFailureCount(nextFailCount);
        setDbCooldownUntil(Date.now() + cooldownSec * 1000);
        error('Soru Bulunamadı', `Hazır sorular veritabanında bulunamadı. Yeniden deneme ${cooldownSec} saniye sonra yapılacak.`);
      }
      
    } catch (err) {
      console.error("Adaptive fetch error:", err);
      // Exponential backoff on network/server errors
      const nextFailCount = _failCount + 1;
      const cooldownSec = Math.min(120, Math.pow(2, nextFailCount) * 5);
      fetchFailureCountRef.current = nextFailCount;
      setFetchFailureCount(nextFailCount);
      setDbCooldownUntil(Date.now() + cooldownSec * 1000);
      error("Soru Hatası", `Yeni soru yüklenemedi: ${err.message}. Yeniden deneme ${cooldownSec}s sonra.`);
    } finally {
      setLoading(false);
      setIsChangingQuestion(false);
    }
  // Yalnizca sabit degerler dep dizisinde; degisken state ref'lerden okunuyor.
  }, [subject, navigate, error]);

  // Tekrar modu: yanlış yapılan soruları id listesinden sırayla getirir.
  // Eksik (silinmiş/AI) id'leri atlar; liste bitince oturumu sonlandırır.
  const fetchReviewQuestion = useCallback(async () => {
    setIsChangingQuestion(true);
    try {
      const ids = reviewIdsRef.current || [];
      let idx = reviewIndexRef.current;
      while (idx < ids.length) {
        const id = ids[idx];
        idx += 1;
        try {
          const snap = await getDoc(doc(db, 'questions', id));
          if (snap.exists()) {
            reviewIndexRef.current = idx;
            setCurrentQuestion(normalizeQuestion({ id: snap.id, ...snap.data() }));
            setQuestionSource('db');
            return;
          }
        } catch (e) {
          console.warn('Tekrar sorusu yüklenemedi:', e);
        }
      }
      // Liste bitti → tekrar oturumunu sonlandır
      reviewIndexRef.current = idx;
      const st = reviewStateRef.current;
      if (!st.finalized) {
        st.finalized = true;
        success('Tekrar Bitti! 🎉', `${st.correct}/${st.answered} soruyu doğru çözdün.`);
        navigate('/student/wrong-answers', { replace: true }); // geri tuşu tekrar oturumunu yeniden açmasın
      } else {
        setCurrentQuestion(null);
      }
    } finally {
      setLoading(false);
      setIsChangingQuestion(false);
    }
  }, [navigate, success]);

  // ── Efemeral (AI sabit-N) mod ──
  // generateQuiz çıktısını ({question,choices,answer,hint}) quiz soru şekline çevirir.
  // Stabil sentetik id: ai_{sessionTs}_{i} (SRS kartı bu id'ye yazılır).
  const buildEphemeralQuestions = (rawList, difficulty) => {
    const ts = Date.now();
    return (rawList || []).map((r, i) => {
      const choices = Array.isArray(r.choices) ? r.choices : [];
      return {
        id: `ai_${ts}_${i}`,
        text: r.question,
        options: choices,
        correctAnswer: choices[r.answer] ?? null,
        explanation: r.hint || '',
        topic: null,
        sub_topic: null,
        difficulty: difficulty || 'medium',
      };
    });
  };

  // Sağlanan N soruyu SIRAYLA gösterir; index sonda → tur biter (summary).
  const fetchEphemeralQuestion = async () => {
    const e = ephemeralRef.current;
    if (!e) return;
    if (e.index >= e.questions.length) {
      if (!e._finalized) {
        e._finalized = true;
        clearEphemeralQuiz(sid); // biten oturumu storage'dan sil → geri tuşu quiz'i yeniden açmasın
        endSession();
      }
      return;
    }
    const q = e.questions[e.index];
    e.index += 1;
    setCurrentQuestion(q);
    setQuestionSource('ai');
    setLoading(false);
  };

  const startEphemeralRound = (rawList, meta = {}) => {
    const qs = buildEphemeralQuestions(rawList, meta.difficulty);
    ephemeralRef.current = {
      questions: qs,
      index: 0,
      source: meta.source || 'ai_free',
      subject: meta.subject || subject,
      count: qs.length,
      difficulty: meta.difficulty || 'medium',
      grade: meta.grade || userProfileRef.current?.grade || '10',
      _finalized: false,
    };
    sessionRef.current = { answered: 0, correct: 0, xp: 0, streakCount: 0, streakMilestone: null, questsCompleted: [], newBadges: [] };
    setQuestionCount(1);
    fetchEphemeralQuestion();
  };

  // Mod'a göre bir sonraki soruyu getirir (efemeral: sıralı set, tekrar: id listesi, diğer: adaptif).
  const advanceQuestion = (isCorrect, givenAnswer, duration) => {
    if (ephemeralMode) return fetchEphemeralQuestion();
    if (reviewMode) return fetchReviewQuestion();
    return fetchAdaptiveQuestion(isCorrect, givenAnswer, duration);
  };

  // Tekrar modunda her çözülen sorunun sonucunu sayar.
  const recordReviewResult = (wasCorrect) => {
    if (!reviewMode) return;
    const st = reviewStateRef.current;
    st.answered += 1;
    if (wasCorrect) st.correct += 1;
  };

  useEffect(() => {
    const initData = async () => {
      const user = auth.currentUser;
      if (user && user.uid) {
        try {
          const userRef = doc(db, 'users', user.uid);
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) setUserData(userSnap.data());
        } catch (err) {
          console.error('Failed loading user data in Quiz.initData for uid:', user?.uid, err);
        }
      } else if (user && !user.uid) {
        console.warn('Auth currentUser present but no uid in Quiz.initData', user);
      }
      // Ödev modunda ise ilgili ödev dökümanını yükle (hedef soru sayisi icin)
      if (assignmentId) {
        try {
          const aSnap = await getDoc(doc(db, 'assignments', assignmentId));
          if (aSnap.exists()) {
            const aData = { id: aSnap.id, ...aSnap.data() };
            assignmentRef.current = aData;
            setAssignment(aData);
          }
        } catch (err) {
          console.warn('Ödev bilgisi yüklenemedi:', err);
        }
      }
      if (ephemeralMode) {
        const sess = loadEphemeralQuiz(sid);
        if (sess && Array.isArray(sess.questions) && sess.questions.length) {
          startEphemeralRound(sess.questions, sess);
        } else {
          setLoading(false);
          setCurrentQuestion(null);
          error('Yapay Zekâ Testi bulunamadı', 'Bu oturum süresi dolmuş olabilir. Lütfen tekrar başlat.');
        }
      } else if (reviewMode) {
        reviewIdsRef.current = reviewIds;
        reviewStateRef.current = { answered: 0, correct: 0, total: reviewIds.length, finalized: false };
        await fetchReviewQuestion();
      } else {
        await fetchAdaptiveQuestion(null);
      }
    };
    initData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!currentQuestion || !userData) return;
    setQuizContext({
      subject,
      grade: userData?.grade || '10',
      questionNo: questionCount,
      totalQuestions: 10,
      questionText: currentQuestion.text,
      options: currentQuestion.options || [],
      wrongCount,
    });
    setShowHint(false);
    setHintText('');
  }, [currentQuestion, userData, subject, wrongCount, questionCount]);

  useEffect(() => {
    setQuestionStartTime(Date.now()); // Yeni soru geldiğinde zamanlayıcıyı sıfırla
  }, [currentQuestion]);

  // Doğru cevapta "+XP" süzülme çipini tetikle (tek hak → her doğru tam puan).
  useEffect(() => {
    if (!showSuccess) return;
    setXpFloat(15);
    const t = setTimeout(() => setXpFloat(null), 1100);
    return () => clearTimeout(t);
  }, [showSuccess]);

  // Soru değişince favori durumunu Firestore'dan senkronize et
  useEffect(() => {
    let cancelled = false;
    setIsBookmarked(false);
    const qid = currentQuestion?.id;
    const uid = auth.currentUser?.uid;
    if (!qid || !uid) return;
    getDoc(doc(db, 'bookmarks', `${uid}_${qid}`))
      .then(snap => { if (!cancelled) setIsBookmarked(snap.exists()); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [currentQuestion?.id]);

  useEffect(() => {
    if (loading || isChangingQuestion || isAnswering || !currentQuestion || aiPanelOpen || wrongAnswered) return;

    if (timeLeft <= 0) {
      handleOptionClick(null);
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft(prev => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, isAnswering, loading, isChangingQuestion, currentQuestion, aiPanelOpen, wrongAnswered]);

  // --- ÖDEV MODU ---
  // Hedef soru sayisina ulasinca assignment_submissions'a tek dökümanlik sonuç yazar.
  const finalizeAssignment = async (st) => {
    const uid = auth.currentUser?.uid;
    const a = assignmentRef.current;
    if (!uid || !a) return;
    try {
      await setDoc(doc(db, 'assignment_submissions', `${a.id}_${uid}`), {
        assignmentId: a.id,
        studentId: uid,
        teacherId: a.teacherId || null,
        subject: a.subject || subject,
        correctCount: st.correct,
        totalCount: st.answered,
        score: st.answered > 0 ? Math.round((st.correct / st.answered) * 100) : 0,
        completedAt: safeServerTimestamp(),
      }, { merge: true });
    } catch (err) {
      console.error('Ödev sonucu kaydedilemedi:', err);
    }
  };

  // Her cözülen soru sonrasi cagrilir; hedefe ulasilinca ödevi tamamlar.
  const recordAssignmentResult = (wasCorrect) => {
    if (!assignmentId) return;
    const st = assignmentStateRef.current;
    if (st.finalized) return;
    st.answered += 1;
    if (wasCorrect) st.correct += 1;
    const target = assignmentRef.current?.questionCount || 5;
    if (st.answered >= target) {
      st.finalized = true; // senkron: bekleyen fetch'ler bunu görüp atlar
      finalizeAssignment(st).then(() => {
        // Son cevabın recordAnswer'ı tamamlansın diye kısa gecikme, sonra özet ekranı
        setTimeout(() => endSession(), 700);
      });
    }
  };

  // Mevcut soruyu favorilere ekler/çıkarır (doc id: `${uid}_${questionId}`)
  const handleToggleBookmark = async () => {
    const uid = auth.currentUser?.uid;
    const q = currentQuestion;
    if (!uid || !q?.id || bookmarkBusy) return;
    setBookmarkBusy(true);
    const ref = doc(db, 'bookmarks', `${uid}_${q.id}`);
    try {
      if (isBookmarked) {
        await deleteDoc(ref);
        setIsBookmarked(false);
        success('Favorilerden Çıkarıldı', 'Soru favori listenden kaldırıldı.');
      } else {
        await setDoc(ref, {
          studentId: uid,
          questionId: q.id,
          subject: subject || 'Genel',
          questionText: q.text || '',
          // Mobil paritesi: choices/answer DA yazılır (web eski options/correctAnswer korunur)
          options: Array.isArray(q.options) ? q.options : [],
          choices: Array.isArray(q.options) ? q.options : [],
          correctAnswer: q.correctAnswer ?? null,
          answer: q.correctAnswer ?? null,
          explanation: q.explanation ?? null,
          topic: q.topic ?? null,
          difficulty: q.difficulty ?? null,
          source: questionSource || 'db',
          // Organizasyon alanları (Faz 5 bookmark klasörleri ile uyumlu)
          folderId: null,
          tags: [],
          note: '',
          reviewCount: 0,
          createdAt: safeServerTimestamp(),
        });
        setIsBookmarked(true);
        success('Favorilere Eklendi ⭐', 'Soru favori listene eklendi.');
      }
    } catch (err) {
      console.error('Favori işlemi başarısız:', err);
      error('Hata', 'İşlem tamamlanamadı, lütfen tekrar dene.');
    } finally {
      setBookmarkBusy(false);
    }
  };

  // İpucuyu tamamen kapat — öğrenci kapatınca ipucu kaybolur (tekrar istenirse yeniden üretilir).
  const closeHint = () => {
    setShowHint(false);
    setHintText('');
  };

  const handleHintRequest = async () => {
    if (hintLoading) return;
    if (showHint) { closeHint(); return; }

    setHintLoading(true);
    setShowHint(true);
    try {
      const ctx = {
        subject,
        grade: userData?.grade || '10',
        questionText: currentQuestion.text,
        options: currentQuestion.options || [],
      };
      const aiHint = await generateDynamicHint(ctx);
      setHintText(aiHint);
    } catch (_err) {
      setHintText('İpucu üretilemedi. Lütfen daha sonra tekrar dene.');
    } finally {
      setHintLoading(false);
    }
  };

  // Cevabı sunucuya kaydeder (recordAnswer) ve oturum istatistiklerini biriktirir.
  // Her soru için terminal sonuçta bir kez çağrılır (doğru / yanlış / boş).
  // recordAnswer başarısız olursa (Cloud Functions deploy yoksa, CORS, vb.)
  // istemci user_logs'a yazarak istatistik/seri/XP'nin bozulmamasını garanti eder.
  const sendRecord = async ({ isCorrect = false, isSkipped = false, attemptNumber = 1, durationSec = 0 }) => {
    const q = currentQuestionRef.current;
    const sess = sessionRef.current;
    sess.answered += 1;
    if (isCorrect) sess.correct += 1;

    // Yerel XP tahmini — recordAnswer çalışmazsa fallback'te kullanılır (sunucu da
    // aynı formülü kullanır: doğru 15 (tek hak); yanlış 2; boş 0).
    const localXp = isSkipped ? 0 : isCorrect ? (10 + (Number(attemptNumber) === 1 ? 5 : 0)) : 2;

    // Efemeral yolda ek alanlar (mobil paritesi). Pool/adaptif/review yolu DEĞİŞMEZ.
    const eph = ephemeralRef.current;
    const opts = Array.isArray(q?.options) ? q.options : [];
    const extra = (ephemeralMode && eph) ? {
      source: eph.source || 'ai_free',
      selectedIndex: selectedOptionRef.current != null ? opts.indexOf(selectedOptionRef.current) : -1,
      correctIndex: opts.indexOf(q?.correctAnswer),
      timeSpentMs: Math.round((Number(durationSec) || 0) * 1000),
      difficulty: q?.difficulty || eph.difficulty || 'medium',
      grade: eph.grade || userProfileRef.current?.grade || '10',
      questionText: q?.text || '',
      choices: opts,
    } : {};

    try {
      const delta = await recordAnswer({
        questionId: q?.id || null,
        subject,
        topic: q?.topic || null,
        subTopic: q?.sub_topic || null,
        isCorrect,
        isSkipped,
        attemptNumber,
        durationSec,
        // SRS kartı için soru anlık görüntüsü — soru havuzdan silinse bile metin korunur
        snapshot: q ? { question: q.text || '', choices: Array.isArray(q.options) ? q.options : [], answer: q.correctAnswer ?? null } : null,
        // Aynı terminal cevabın iki kez işlenmesini engeller (idempotency)
        attemptId: q?.id ? `${q.id}:${questionStartTime}:${attemptNumber}` : null,
        ...extra,
      });
      // Yanlış cevapta görsel konfeti patlatma (kırmızı ekranın üstüne kutlama kafa
      // karıştırıyor) — kazanılan ödülün toast'ı + sesi yine gösterilir.
      const confettiOpt = { confetti: !!isCorrect };
      sess.xp += delta.xpGained || 0;
      if (delta.streak) {
        sess.streakCount = delta.streak.count ?? sess.streakCount;
        if (delta.streak.milestone) {
          sess.streakMilestone = delta.streak.milestone;
          celebrate('milestone', confettiOpt);
        }
        if (delta.streak.freezeEarned) success('Dondurma Kazandın ❄️', 'Bir seri dondurma kazandın.');
      }
      if (delta.questsCompleted?.length && delta.dailyQuests?.quests) {
        delta.questsCompleted.forEach((id) => {
          const quest = delta.dailyQuests.quests.find((x) => x.id === id);
          if (quest && !sess.questsCompleted.includes(quest.title)) {
            sess.questsCompleted.push(quest.title);
            celebrate('quest', confettiOpt);
            success('Görev Tamamlandı 🎯', quest.title);
          }
        });
      }
      if (delta.newBadges?.length) {
        delta.newBadges.forEach((b) => {
          if (!sess.newBadges.includes(b)) sess.newBadges.push(b);
        });
        celebrate('badge', confettiOpt);
      }
    } catch (err) {
      // Fallback: Functions çalışmıyor → istemci user_logs'a yazsın ki
      // UserStatsContext loglardan istatistik + seri + bugün-çözülen'i türetebilsin.
      console.warn('recordAnswer başarısız, istemci fallback ile user_logs yazılıyor:', err.message);
      sess.xp += localXp;
      try {
        const uid = auth.currentUser?.uid;
        if (uid) {
          await addDoc(collection(db, 'user_logs'), {
            studentId: uid,
            teacherId: userData?.teacherId || null,
            subject,
            sub_topic: q?.sub_topic || q?.topic || 'Genel',
            questionId: q?.id || null,
            isCorrect: !!isCorrect,
            isSkipped: !!isSkipped,
            skipped: !!isSkipped,
            timeSpent: Number(durationSec) || 0,
            duration: Number(durationSec) || 0,
            attemptNumber: Number(attemptNumber) || 1,
            xp: localXp,
            timestamp: safeServerTimestamp(),
          });
        }
      } catch (logErr) {
        console.error('user_logs fallback yazımı da başarısız:', logErr);
      }
    }
  };

  // Turu bitirir: özet ekranını açar. Seri için bağlamdaki birleşik değeri kullanır
  // (recordAnswer başarısız olsa bile her yerle tutarlı kalır).
  const endSession = () => {
    setSummaryData({
      ...sessionRef.current,
      streakCount: stats?.streakDays || sessionRef.current.streakCount || 0,
    });
    setSummaryOpen(true);
  };

  const closeSummary = () => {
    setSummaryOpen(false);
    if (ephemeralMode) clearEphemeralQuiz(sid);
    // replace: biten quiz URL'i history'den düşsün → geri tuşu tekrar quiz'e atmasın
    navigate(assignmentId ? '/student/assignments' : '/student', { replace: true });
  };

  // Efemeral "Yeni Tur": aynı ayarlarla yeni N soru üret ve yeni tur başlat (yerinde).
  const handleNewRound = async () => {
    const e = ephemeralRef.current;
    if (!e) { closeSummary(); return; }
    setSummaryOpen(false);
    setLoading(true);
    try {
      const qs = await generateQuiz(e.subject, e.count || 5, e.difficulty || 'medium', { subject: e.subject, grade: e.grade });
      startEphemeralRound(qs, { source: e.source, subject: e.subject, difficulty: e.difficulty, grade: e.grade });
      resetQuestionState();
    } catch (err) {
      console.error('Yeni tur üretilemedi:', err);
      error('Yeni tur başlatılamadı', err.message || 'Soru üretilemedi.');
      setLoading(false);
      setSummaryOpen(true);
    }
  };

  const handleOptionClick = async (option) => {
    if (isAnswering || !userData || isChangingQuestion) return;

    const isCorrect = option !== null && option === currentQuestion.correctAnswer;

    setSelectedOption(option);

    // Harcanan süreyi hesapla (saniye)
    const timeSpentSec = Math.round((Date.now() - questionStartTime) / 1000);

    if (isCorrect) {
      setIsAnswering(true);
      setShowSuccess(true);
      setWrongAnswered(false);
      setWrongCount(prev => Math.max(prev - 1, 0));
      celebrate('correct');

      sendRecord({ isCorrect: true, attemptNumber: 1, durationSec: timeSpentSec });

      recordAssignmentResult(true);
      recordReviewResult(true);

      setTimeout(() => {
        if (assignmentStateRef.current.finalized) return; // ödev bitti, sonraki soruyu yükleme
        advanceQuestion(true, option, timeSpentSec).then(() => {
          setQuestionCount(prev => prev + 1);
          resetQuestionState();
        });
      }, 2000);

    } else {
      // ── TEK CEVAP HAKKI: ilk (ve tek) yanlış → terminal. Doğru cevap gösterilir,
      //    çözüm açılır, AI Koç devreye girer. Kullanıcı "Sonraki Soru" ile ilerler. ──
      setIsAnswering(true);
      setWrongAnswered(true);
      setWrongCount(prev => prev + 1);
      setAutoOpenAI(true);
      celebrate('wrong');

      sendRecord({ isCorrect: false, attemptNumber: 1, durationSec: timeSpentSec });

      recordAssignmentResult(false);
      recordReviewResult(false);
    }
  };

  const handleSkipQuestion = async () => {
    if (isAnswering || !userData || isChangingQuestion) return;

    setIsAnswering(true);
    setSelectedOption(null);

    const timeSpentSec = Math.round((Date.now() - questionStartTime) / 1000);

    sendRecord({ isSkipped: true, attemptNumber: 1, durationSec: timeSpentSec });

    recordAssignmentResult(false);
    recordReviewResult(false);
    if (assignmentStateRef.current.finalized) return; // ödev bitti

    advanceQuestion(false, null, timeSpentSec).then(() => {
      setQuestionCount(prev => prev + 1);
      resetQuestionState();
    });
  };

  const resetQuestionState = () => {
    setSelectedOption(null);
    setIsAnswering(false);
    setTimeLeft(60);
    setQuestionStartTime(Date.now());
    setShowSuccess(false);
    setAutoOpenAI(false);
    setWrongAnswered(false);
    setShowHint(false);
    setHintText('');
  };

  const goToNext = () => {
    if (assignmentStateRef.current.finalized) return; // ödev bitti
    if (wrongAnswered) {
      const timeSpentSec = Math.round((Date.now() - questionStartTime) / 1000);
      advanceQuestion(false, selectedOption, timeSpentSec).then(() => {
        setQuestionCount(prev => prev + 1);
        resetQuestionState();
      });
    } else {
      // Normal durumda zaten otomatik geçiyor.
    }
  };

  const renderContent = (text) => {
    if (!text) return null;
    // Yazar $...$ kullanmadıysa çıplak LaTeX desenlerini otomatik sar — eski
    // seed verilerindeki "\frac{d}{dx}", "x^2" gibi formüller de render olsun.
    const normalized = autoWrapLatex(String(text));
    const regex = /(\$.*?\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\])/g;
    const parts = normalized.split(regex);
    
    return parts.map((part, index) => {
      if (!part) return null;

      let mathContent = part.trim();
      let isMath = false;
      let isBlock = false;

      if (mathContent.startsWith('$') && mathContent.endsWith('$')) {
        mathContent = mathContent.slice(1, -1).trim();
        isMath = true;
      } else if (mathContent.startsWith('\\(') && mathContent.endsWith('\\)')) {
        mathContent = mathContent.slice(2, -2).trim();
        isMath = true;
      } else if (mathContent.startsWith('\\[') && mathContent.endsWith('\\]')) {
        mathContent = mathContent.slice(2, -2).trim();
        isMath = true;
        isBlock = true;
      }

      if (isMath) {
        if (mathContent.startsWith('\\(') && mathContent.endsWith('\\)')) {
          mathContent = mathContent.slice(2, -2).trim();
        } else if (mathContent.startsWith('\\[') && mathContent.endsWith('\\]')) {
          mathContent = mathContent.slice(2, -2).trim();
        }
        
        mathContent = mathContent.replace(/\\quad/g, ' ').replace(/\\;/g, ' ');

        return isBlock ? (
          <BlockMath key={index} math={mathContent} />
        ) : (
          <InlineMath key={index} math={mathContent} />
        );
      }

      return <span key={index} className="whitespace-pre-wrap">{part}</span>;
    });
  };

  // ── Sahne arka planı (orb'lar) — tüm durumlarda ortak (kararlı JSX, remount yok) ──
  const quizOrbs = (
    <div className="quiz-orbs" aria-hidden="true">
      <span className="quiz-orb quiz-orb-1" />
      <span className="quiz-orb quiz-orb-2" />
      <span className="quiz-orb quiz-orb-3" />
    </div>
  );

  if (loading) {
    return (
      <div className="quiz-stage">
        {quizOrbs}
        <div className="quiz-topbar" aria-busy="true">
          <Skeleton width={104} height={36} radius="999px" />
          <Skeleton width={180} height={32} radius="999px" />
          <Skeleton width={60} height={60} radius="50%" />
        </div>
        <div className="quiz-main">
          <div className="quiz-card">
            <div style={{ marginBottom: '1.25rem' }}><Skeleton width="70%" height={28} /></div>
            <div className="quiz-options">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} height={76} radius="18px" />)}
            </div>
            <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'center', gap: 8, color: 'var(--accent-primary)', fontSize: '0.85rem' }}>
              <Loader2 size={18} className="animate-spin" aria-hidden="true" />
              <span>Yapay zeka soru hazırlıyor...</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!currentQuestion) {
    return (
      <div className="quiz-stage">
        {quizOrbs}
        <div className="quiz-main">
          <div className="quiz-empty" role="alert">
            <BrainCircuit size={48} className="quiz-empty-icon" aria-hidden="true" style={{ margin: '0 auto 1rem' }} />
            <h2>Soru Bulunamadı</h2>
            <p>Görünüşe göre havuzda sana uygun soru kalmadı ve yapay zeka şu an üretim yapamıyor.</p>
            <div className="quiz-empty-actions">
              <button onClick={() => fetchAdaptiveQuestion(null)} className="ds-btn-primary">Tekrar Dene</button>
              <button onClick={() => navigate('/student')} className="ds-btn-ghost">Panoya Dön</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const letters = ['A', 'B', 'C', 'D', 'E'];

  const formatTime = (seconds) => {
    return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;
  };

  // Timer ring geometrisi + durum
  const TIMER_R = 26;
  const TIMER_C = 2 * Math.PI * TIMER_R;
  const timerPct = Math.max(0, Math.min(1, timeLeft / 60));
  const timerState = timeLeft > 30 ? 'safe' : timeLeft > 10 ? 'warn' : 'danger';

  const levelLabels = { 1: "Temel", 2: "Orta", 3: "İleri" };
  const difficultyLabels = { easy: 'Kolay', medium: 'Orta', hard: 'Zor' };

  // İlerleme bağlamı (ödev / tekrar / normal)
  const progressTotal = assignment ? (assignment.questionCount || 5)
    : reviewMode ? (reviewStateRef.current.total || reviewIds.length || 1)
    : ephemeralMode ? (ephemeralRef.current?.count || 0)
    : null;
  const progressPct = progressTotal
    ? Math.min(100, Math.round((questionCount / progressTotal) * 100))
    : (topicMasteryValue != null ? topicMasteryValue : Math.min(100, (questionCount % 10) * 10));
  const progressLabel = assignment ? `📋 Ödev ${questionCount}/${progressTotal}`
    : reviewMode ? `🔁 Tekrar ${questionCount}/${progressTotal}`
    : ephemeralMode ? `✨ Yapay Zekâ ${questionCount}/${progressTotal}`
    : topicMasteryValue != null ? `${topicMasteryLevelName || 'Ustalık'} %${topicMasteryValue}`
    : `Soru #${questionCount}`;

  // Uzun sorularda kartı yatay olarak genişlet (metni daha az satıra indirip kaydırma ihtiyacını azaltır).
  const _qLen = (currentQuestion?.text?.length || 0);
  const _optLen = Array.isArray(currentQuestion?.options)
    ? currentQuestion.options.reduce((s, o) => s + String(o ?? '').length, 0)
    : 0;
  const cardWideClass =
    _qLen > 320 || _optLen > 420 ? 'quiz-card--xwide'
    : _qLen > 150 || _optLen > 220 ? 'quiz-card--wide'
    : '';

  return (
    <div className="quiz-stage">
      {quizOrbs}

      {/* ── Üst bar (HUD) ── */}
      <div className="quiz-topbar">
        <button
          type="button"
          onClick={() => (sessionRef.current.answered > 0 ? endSession() : navigate('/student'))}
          className="quiz-back"
        >
          <ChevronLeft size={18} aria-hidden="true" />
          <span>{sessionRef.current.answered > 0 ? 'Turu Bitir' : 'Panoya Dön'}</span>
        </button>

        <div className="quiz-hud">
          <span className="quiz-level-badge">
            <Award size={13} aria-hidden="true" /> Sv {learningStats.currentLevel || 2} · {levelLabels[learningStats.currentLevel] || 'Orta'}
          </span>
          <span className="quiz-hud-pill quiz-hud-xp" title="Bu turdaki puan">
            <Star size={13} aria-hidden="true" /> {sessionRef.current.xp || 0} Puan
          </span>
          {learningStats.correctStreak > 0 && (
            <span className="quiz-hud-pill quiz-hud-combo" title="Ardışık doğru">
              🔥 {learningStats.correctStreak}
            </span>
          )}
        </div>

        {/* Timer ring */}
        <div
          className={`quiz-timer quiz-timer--${timerState}`}
          role="timer"
          aria-label={`Kalan süre: ${timeLeft} saniye`}
        >
          <svg width="60" height="60" viewBox="0 0 60 60">
            <circle className="quiz-timer-track" cx="30" cy="30" r={TIMER_R} fill="none" strokeWidth="4" />
            <circle
              className="quiz-timer-arc"
              cx="30" cy="30" r={TIMER_R} fill="none" strokeWidth="4"
              strokeDasharray={TIMER_C}
              strokeDashoffset={TIMER_C * (1 - timerPct)}
            />
          </svg>
          <span className="quiz-timer-num">{formatTime(timeLeft)}</span>
        </div>
      </div>

      {/* ── İlerleme + combo ── */}
      <div className="quiz-progresswrap">
        <div className="quiz-progress-track">
          <div className="quiz-progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
        <span className="quiz-progress-label">{progressLabel}</span>
        {learningStats.correctStreak >= 2 && (
          <span className="quiz-combo" key={learningStats.correctStreak}>🔥 {learningStats.correctStreak} ard arda</span>
        )}
      </div>

      {/* ── Ortalanmış soru kartı ── */}
      <div className="quiz-main">
        <AnimatePresence mode="wait">
          <Motion.div
            key={currentQuestion.id}
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -24, scale: 0.98 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className={`quiz-card ${cardWideClass}`}
          >
            {/* Favori (bookmark) */}
            <button
              type="button"
              onClick={handleToggleBookmark}
              disabled={bookmarkBusy}
              aria-pressed={isBookmarked}
              aria-label={isBookmarked ? 'Favorilerden çıkar' : 'Favorilere ekle'}
              className={`quiz-bookmark ${isBookmarked ? 'is-on' : ''}`}
            >
              <Star size={17} fill={isBookmarked ? 'currentColor' : 'none'} />
            </button>

            {/* Soru değişim overlay */}
            {isChangingQuestion && (
              <div className="quiz-card-overlay" role="status" aria-live="polite">
                <Loader2 size={34} className="animate-spin" aria-hidden="true" />
                <span>Sıradaki soru hazırlanıyor...</span>
              </div>
            )}

            {/* Doğru cevap kutlaması */}
            {showSuccess && (
              <div className="quiz-success" role="status" aria-live="polite">
                <span aria-hidden="true">🎉</span> Harika! Doğru cevap.
              </div>
            )}

            {/* "+XP" süzülme çipi */}
            {xpFloat != null && (
              <span className="quiz-xp-float" aria-hidden="true">+{xpFloat} Puan</span>
            )}

            {showLevelUpBanner && (
              <div className="quiz-levelup">
                <span aria-hidden="true">🚀</span> Seviye Atladın!{topicMasteryLevelName ? ` ${topicMasteryLevelName}` : ''}
              </div>
            )}

            {/* Rozet satırı */}
            <div className="quiz-chips">
              {questionSource && (
                <span className={`quiz-chip ${questionSource === 'ai' ? 'quiz-chip--ai' : 'quiz-chip--db'}`}>
                  {questionSource === 'ai' ? '✨ Yapay Zekâ üretimi' : '📚 Hazır soru'}
                </span>
              )}
              {currentQuestion.difficulty && (
                <span className="quiz-chip">{difficultyLabels[currentQuestion.difficulty] || currentQuestion.difficulty}</span>
              )}
              {(currentQuestion.topic || currentQuestion.sub_topic) && (
                <span className="quiz-chip">{currentQuestion.sub_topic || currentQuestion.topic}</span>
              )}
            </div>

            {/* Soru metni — ortalı */}
            <h2 className="quiz-question">
              {renderContent(currentQuestion.text)}
            </h2>

            {/* ── İpucu / Boş geç ── */}
            <div className="quiz-actions-top">
              <button onClick={handleHintRequest} disabled={isAnswering} className="quiz-pill quiz-pill--hint">
                {hintLoading
                  ? <Loader2 size={15} className="animate-spin" aria-hidden="true" />
                  : <Lightbulb size={15} aria-hidden="true" />}
                {hintLoading ? 'AI ipucu üretiyor...' : showHint ? 'İpucunu gizle' : "AI'dan ipucu al"}
              </button>
              <button onClick={handleSkipQuestion} disabled={isAnswering || isChangingQuestion} className="quiz-pill">
                Boş bırak ve geç
              </button>
            </div>

            {/* İpucu kutusu */}
            <AnimatePresence>
              {showHint && (
                <Motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.28, ease: 'easeInOut' }}
                  style={{ overflow: 'hidden' }}
                >
                  <div className="quiz-reveal-box quiz-reveal-box--hint">
                    <div className="quiz-reveal-row">
                      <Lightbulb size={16} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
                      <span className="quiz-reveal-title" style={{ flex: 1 }}>İpucu</span>
                      {!hintLoading && (
                        <button
                          type="button"
                          onClick={closeHint}
                          className="quiz-reveal-close"
                          aria-label="İpucunu kapat"
                          title="İpucunu kapat"
                        >
                          <X size={15} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                    <p className="quiz-reveal-text" style={{ marginTop: '0.4rem' }}>
                      {hintLoading
                        ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Loader2 size={13} className="animate-spin" /> AI ipucu hazırlıyor...</span>
                        : hintText || '...'}
                    </p>
                  </div>
                </Motion.div>
              )}
            </AnimatePresence>

            {/* ── Şıklar — 2 sütun ortalı grid ── */}
            <div className="quiz-options">
              {currentQuestion.options && currentQuestion.options.map((opt, idx) => {
                const letter = letters[idx] || '';
                let stateClass = '';
                let icon = null;
                const isLocked = isAnswering || isChangingQuestion;

                if (isLocked) {
                  if (opt === currentQuestion.correctAnswer) {
                    stateClass = 'quiz-opt--correct';
                    icon = <CheckCircle2 size={20} className="quiz-opt-icon" style={{ color: 'var(--success)' }} aria-hidden="true" />;
                  } else if (opt === selectedOption && !showSuccess) {
                    stateClass = 'quiz-opt--wrong';
                    icon = <XCircle size={20} className="quiz-opt-icon" style={{ color: 'var(--danger)' }} aria-hidden="true" />;
                  } else {
                    stateClass = 'quiz-opt--dim';
                  }
                }

                let statusLabel = '';
                if (isLocked) {
                  if (opt === currentQuestion.correctAnswer) statusLabel = ' — doğru cevap';
                  else if (opt === selectedOption && !showSuccess) statusLabel = ' — seçtiğin yanlış cevap';
                }

                return (
                  <Motion.button
                    key={idx}
                    disabled={isLocked}
                    onClick={() => handleOptionClick(opt)}
                    aria-label={`${letter} şıkkı: ${opt}${statusLabel}`}
                    aria-pressed={opt === selectedOption}
                    whileTap={!isLocked ? { scale: 0.97 } : {}}
                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                    className={`quiz-opt ${stateClass}`}
                  >
                    <span className="quiz-opt-letter">{letter}</span>
                    <span className="quiz-opt-text">{renderContent(opt)}</span>
                    {icon}
                  </Motion.button>
                );
              })}
            </div>

            {/* ── Çözüm Açıklaması ── */}
            <AnimatePresence>
              {(showSuccess || wrongAnswered) && currentQuestion.explanation && (
                <Motion.div
                  initial={{ opacity: 0, height: 0, marginTop: 0 }}
                  animate={{ opacity: 1, height: 'auto', marginTop: '1rem' }}
                  exit={{ opacity: 0, height: 0, marginTop: 0 }}
                  transition={{ duration: 0.28, ease: 'easeInOut' }}
                  style={{ overflow: 'hidden' }}
                >
                  <div className="quiz-reveal-box quiz-reveal-box--exp">
                    <div className="quiz-reveal-row">
                      <BookOpen size={16} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
                      <div className="quiz-reveal-text">
                        <div className="quiz-reveal-title">Çözüm</div>
                        {renderContent(currentQuestion.explanation)}
                      </div>
                    </div>
                  </div>
                </Motion.div>
              )}
            </AnimatePresence>

            {/* ── Alt çubuk ── */}
            <div className="quiz-footer">
              <span className="quiz-count">
                {assignment
                  ? `📋 ${questionCount}/${assignment.questionCount || 5}`
                  : reviewMode
                    ? `🔁 ${questionCount}/${reviewStateRef.current.total || reviewIds.length}`
                    : ephemeralMode
                      ? `✨ ${questionCount}/${ephemeralRef.current?.count || 0}`
                      : `#${questionCount}`}
              </span>

              <div className="quiz-footer-right">
                {wrongAnswered && (
                  <span className="quiz-nudge quiz-nudge--coach animate-pulse">💬 Yapay Zekâ Koç seni bekliyor!</span>
                )}
                <button
                  onClick={goToNext}
                  disabled={isChangingQuestion || (!wrongAnswered && !showSuccess)}
                  className={`quiz-next ${wrongAnswered ? 'quiz-next--coach' : ''}`}
                >
                  Sonraki Soru
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              </div>
            </div>

          </Motion.div>
        </AnimatePresence>
      </div>

      {/* ── FloatingAI — Quiz Koçu ── */}
      <FloatingAI
        quizContext={quizContext}
        autoOpen={autoOpenAI}
        onAutoOpenHandled={() => setAutoOpenAI(false)}
        onPanelToggle={setAiPanelOpen}
      />

      {/* ── Oturum-Sonu Özet ── */}
      <SessionSummary
        isOpen={summaryOpen}
        onClose={closeSummary}
        summary={summaryData}
        onNewRound={ephemeralMode ? handleNewRound : undefined}
      />
    </div>
  );
}
