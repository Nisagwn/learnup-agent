import React, { createContext, useState, useEffect, useCallback } from 'react';
import { auth, db } from '../firebase';
import { doc, collection, query, where, onSnapshot, getDocs } from 'firebase/firestore';
import { ensureDailyState } from '../utils/gamificationApi';
import { getLevelInfo } from '../utils/levelSystem';
import resolveSubject, { CANONICAL_SUBJECTS_TR } from '../utils/subjects';

// Ham ders/kategori değerini (İngilizce kategori, alternatif yazım, AI özel konusu)
// kanonik Türkçe derse çözer. Tanınmayan (alt konu / AI başlığı) → 'Diğer' kovası.
// → "Ders Bazlı İstatistik" yalnız gerçek dersleri gösterir, çakışan satırlar birleşir.
const canonicalSubject = (raw) => {
  const tr = resolveSubject(raw).tr;
  return CANONICAL_SUBJECTS_TR.includes(tr) ? tr : 'Diğer';
};

export const UserStatsContext = createContext();

// Seviye TEK kaynaktan gelir: doğru cevap sayısına göre levelSystem.js eşikleri
// (Pano hero, ProfileDrawer, nav çipi ve backend recordAnswer ile aynı hesap).
const levelFromCorrect = (correctAnswers) => getLevelInfo(correctAnswers).levelData.level;

const getTimestampMs = (value) => {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};

const formatLocalISO = (date) => {
  if (!date) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// Learn feed girdilerini MEVCUT user_logs listener'ından türetir (yeni okuma YOK).
//  - lastSolvedBySubject: ders → en son çözüm zamanı (ms)
//  - weakSubTopicBySubject: ders → en çok yanlış yapılan alt-konu {subTopic, wrongCount}
//  - srsDueCount: en son cevabı yanlış olan benzersiz soru sayısı (SRS "due" proxy'si)
function deriveFeedInputs(answers) {
  const lastSolvedBySubject = {};
  const wrongBySubjSub = {};
  const latestByQ = {};
  (answers || []).forEach((a) => {
    const subj = a.subject || a.category || 'Genel';
    const ms = getTimestampMs(a.timestamp);
    if (ms > (lastSolvedBySubject[subj] || 0)) lastSolvedBySubject[subj] = ms;
    const isCorrect = a.isCorrect === true;
    const isSkipped = a.isSkipped === true || a.skipped === true;
    if (!isCorrect && !isSkipped) {
      const st = a.sub_topic || a.subTopic || a.topic || 'Genel';
      wrongBySubjSub[subj] = wrongBySubjSub[subj] || {};
      wrongBySubjSub[subj][st] = (wrongBySubjSub[subj][st] || 0) + 1;
    }
    if (a.questionId) {
      const prev = latestByQ[a.questionId];
      if (!prev || ms > prev.ms) latestByQ[a.questionId] = { ms, isWrong: !isCorrect && !isSkipped };
    }
  });
  const weakSubTopicBySubject = {};
  Object.entries(wrongBySubjSub).forEach(([subj, m]) => {
    let best = null;
    Object.entries(m).forEach(([st, c]) => { if (!best || c > best.wrongCount) best = { subTopic: st, wrongCount: c }; });
    if (best) weakSubTopicBySubject[subj] = best;
  });
  const srsDueCount = Object.values(latestByQ).filter((x) => x.isWrong).length;
  return { lastSolvedBySubject, weakSubTopicBySubject, srsDueCount };
}

export function UserStatsProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [stats, setStats] = useState({
    totalSolved: 0, correctAnswers: 0, wrongAnswers: 0,
    skippedAnswers: 0, net: 0, successRate: 0,
    level: 1, totalXP: 0, streakDays: 0, todaySolved: 0,
  });
  const [masteryScores, setMasteryScores] = useState({});
  const [weeklyData, setWeeklyData] = useState([]);
  const [monthlyData, setMonthlyData] = useState([]);
  // GitHub stili heatmap için — son 90 günün günlük aktivite sayıları
  const [dailyActivity, setDailyActivity] = useState([]);
  // Learn feed girdileri (user_logs'tan türetilir; ekstra okuma yok)
  const [feedDerived, setFeedDerived] = useState({ lastSolvedBySubject: {}, weakSubTopicBySubject: {}, srsDueCount: 0 });
  const [classRanking, setClassRanking] = useState({
    rank: null,
    total: null,
    list: [],
    loading: true,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const unsubscribeRefs = React.useRef({});

  const calculateStreak = useCallback((userAnswers) => {
    if (!userAnswers || userAnswers.length === 0) return 0;
    const daySet = new Set();
    userAnswers.forEach((answer) => {
      const ts = answer.timestamp;
      let date = ts?.toDate?.() ?? (ts instanceof Date ? ts : new Date());
      daySet.add(formatLocalISO(date));
    });
    let streak = 0;
    for (let i = 0; i < 365; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      if (daySet.has(formatLocalISO(d))) streak++;
      else break;
    }
    return streak;
  }, []);

  const calculateWeeklyAndMonthly = useCallback((userAnswers) => {
    const now = new Date();
    const last7 = [];
    const dayMap = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const iso = formatLocalISO(d);
      last7.push(d);
      dayMap[iso] = { correct: 0, wrong: 0, skipped: 0 };
    }
    const dayNames = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
    userAnswers.forEach((answer) => {
      const ts = answer.timestamp;
      const date = ts?.toDate?.() ?? (ts instanceof Date ? ts : new Date());
      const iso = formatLocalISO(date);
      if (dayMap[iso]) {
        if (answer.isCorrect === true) dayMap[iso].correct++;
        else if (answer.isSkipped === true || answer.skipped === true) dayMap[iso].skipped++;
        else dayMap[iso].wrong++;
      }
    });
    const weeklyArray = last7.map((d) => {
      const iso = formatLocalISO(d);
      const b = dayMap[iso] || { correct: 0, wrong: 0, skipped: 0 };
      return { name: dayNames[d.getDay()], date: iso, Doğru: b.correct, Yanlış: b.wrong, Boş: b.skipped };
    });

    const MONTHS_TR = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
    const monthlyMap = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthlyMap[`${d.getFullYear()}-${d.getMonth()}`] = { correct: 0, total: 0 };
    }
    userAnswers.forEach((answer) => {
      const ts = answer.timestamp;
      const date = ts?.toDate?.() ?? (ts instanceof Date ? ts : new Date());
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      if (monthlyMap[key]) {
        monthlyMap[key].total++;
        if (answer.isCorrect === true) monthlyMap[key].correct++;
      }
    });
    const monthlyArray = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const b = monthlyMap[key] || { correct: 0, total: 0 };
      monthlyArray.push({
        name: MONTHS_TR[d.getMonth()],
        value: b.total ? Math.round((b.correct / b.total) * 100) : 0,
        correct: b.correct, total: b.total,
      });
    }
    return { weeklyArray, monthlyArray };
  }, []);

  // Son N günü (varsayılan 90) günlük cevap sayısıyla doldurur — heatmap için.
  const calculateDailyActivity = useCallback((userAnswers, days = 90) => {
    const now = new Date();
    const dayMap = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      d.setHours(0, 0, 0, 0);
      dayMap[formatLocalISO(d)] = { count: 0, correct: 0 };
    }
    (userAnswers || []).forEach((answer) => {
      const ts = answer.timestamp;
      const date = ts?.toDate?.() ?? (ts instanceof Date ? ts : new Date());
      const iso = formatLocalISO(date);
      if (dayMap[iso]) {
        dayMap[iso].count++;
        if (answer.isCorrect === true) dayMap[iso].correct++;
      }
    });
    return Object.entries(dayMap).map(([date, v]) => ({ date, count: v.count, correct: v.correct }));
  }, []);

  const calculateStatsFromAnswers = useCallback((userAnswers) => {
    if (!userAnswers || userAnswers.length === 0) {
      return {
        totalSolved: 0, correctAnswers: 0, wrongAnswers: 0, skippedAnswers: 0,
        net: 0, successRate: 0, level: 1, totalXP: 0, streakDays: 0, masteryScores: {},
      };
    }
    let correctCount = 0, wrongCount = 0, skippedCount = 0, totalXP = 0;
    const subjectMap = {};
    userAnswers.forEach((answer) => {
      const isCorrect = answer.isCorrect === true;
      const isSkipped = answer.isSkipped === true || answer.skipped === true;
      if (isCorrect) correctCount++;
      else if (isSkipped) skippedCount++;
      else wrongCount++;
      totalXP += answer.xp || (isCorrect ? 10 : 2);
      const subject = canonicalSubject(answer.subject || answer.category || 'Genel');
      if (!subjectMap[subject]) subjectMap[subject] = { solved_count: 0, score: 0, xp_gained: 0 };
      subjectMap[subject].solved_count++;
      if (isCorrect) subjectMap[subject].score++;
      subjectMap[subject].xp_gained += answer.xp || (isCorrect ? 10 : 2);
    });
    const totalSolved = userAnswers.length;
    const net = correctCount - wrongCount * 0.25;
    const successRate = totalSolved > 0 ? Math.round((correctCount / totalSolved) * 100) : 0;
    const level = levelFromCorrect(correctCount);
    const streak = calculateStreak(userAnswers);
    const todayIso = formatLocalISO(new Date());
    const todaySolved = userAnswers.reduce((acc, answer) => {
      const ts = answer.timestamp;
      const date = ts?.toDate?.() ?? (ts instanceof Date ? ts : new Date(ts));
      return formatLocalISO(date) === todayIso ? acc + 1 : acc;
    }, 0);
    return {
      totalSolved, correctAnswers: correctCount, wrongAnswers: wrongCount,
      skippedAnswers: skippedCount, net: Math.round(net * 10) / 10,
      successRate, level, totalXP, streakDays: streak, todaySolved, subjectMap,
    };
  }, [calculateStreak]);

  // ── Sınıf sıralaması: aynı teacherId'ye sahip tüm öğrencilerin net skoruna göre ──
  const loadClassRanking = useCallback(async (uid, teacherId) => {
    if (!teacherId) {
      setClassRanking({ rank: null, total: null, list: [], loading: false });
      return;
    }
    try {
      // Aynı sınıftaki tüm öğrencileri bul
      const studentsSnap = await getDocs(
        query(collection(db, 'users'), where('teacherId', '==', teacherId), where('role', '==', 'student'))
      );

      const students = [];
      studentsSnap.forEach(d => students.push({ uid: d.id, ...d.data() }));

      if (students.length === 0) {
        setClassRanking({ rank: null, total: 0, list: [], loading: false });
        return;
      }

      // Her öğrencinin loglarını çek ve net hesapla
      const rankData = await Promise.all(
        students.map(async (student) => {
          const logsSnap = await getDocs(
            query(collection(db, 'user_logs'), where('studentId', '==', student.uid))
          );
          let correct = 0, wrong = 0, total = 0;
          logsSnap.forEach(d => {
            const a = d.data();
            total++;
            if (a.isCorrect === true) correct++;
            else if (a.isSkipped !== true && a.skipped !== true) wrong++;
          });
          const net = Math.round((correct - wrong * 0.25) * 10) / 10;
          const name = student.name || student.fullName || student.email?.split('@')[0] || 'Öğrenci';
          return { uid: student.uid, name, correct, total, net };
        })
      );

      // Net'e göre sırala (eşitse doğru sayısına bak)
      rankData.sort((a, b) => b.net !== a.net ? b.net - a.net : b.correct - a.correct);

      const rank = rankData.findIndex(s => s.uid === uid) + 1;
      setClassRanking({ rank, total: rankData.length, list: rankData, loading: false });
    } catch (err) {
      console.warn('Sınıf sıralaması yüklenemedi:', err);
      setClassRanking({ rank: null, total: null, list: [], loading: false });
    }
  }, []);

  const setupListeners = useCallback((uid) => {
    if (!uid) return;
    Object.values(unsubscribeRefs.current).forEach(unsub => {
      if (typeof unsub === 'function') { try { unsub(); } catch { /* listener zaten kapanmis olabilir */ } }
    });
    unsubscribeRefs.current = {};

    const userDocRef = doc(db, 'users', uid);
    const unsubUser = onSnapshot(userDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setUserProfile(data);
        // teacherId gelince sıralamayı yükle
        if (data.teacherId) loadClassRanking(uid, data.teacherId);
        else setClassRanking({ rank: null, total: null, list: [], loading: false });
      }
    }, (err) => { console.warn('User doc listener error:', err); setError(err.message); });
    unsubscribeRefs.current.user = unsubUser;

    const answersQuery = query(collection(db, 'user_logs'), where('studentId', '==', uid));
    const unsubAnswers = onSnapshot(answersQuery, (snap) => {
      const answers = [];
      snap.forEach(d => answers.push(d.data()));
      answers.sort((a, b) => getTimestampMs(b.timestamp) - getTimestampMs(a.timestamp));

      const calculated = calculateStatsFromAnswers(answers);
      const { weeklyArray, monthlyArray } = calculateWeeklyAndMonthly(answers);
      const dailyArr = calculateDailyActivity(answers, 90);

      setStats({
        totalSolved: calculated.totalSolved,
        correctAnswers: calculated.correctAnswers,
        wrongAnswers: calculated.wrongAnswers,
        skippedAnswers: calculated.skippedAnswers,
        net: calculated.net,
        successRate: calculated.successRate,
        level: calculated.level,
        totalXP: calculated.totalXP,
        streakDays: calculated.streakDays,
        todaySolved: calculated.todaySolved || 0,
      });

      const mastery = {};
      if (calculated.subjectMap) {
        Object.entries(calculated.subjectMap).forEach(([subject, data]) => {
          mastery[subject] = {
            solved_count: data.solved_count,
            score: data.solved_count > 0 ? Math.round((data.score / data.solved_count) * 100) : 0,
            xp_gained: data.xp_gained,
          };
        });
      }
      setMasteryScores(mastery);
      setWeeklyData(weeklyArray);
      setMonthlyData(monthlyArray);
      setDailyActivity(dailyArr);
      setFeedDerived(deriveFeedInputs(answers));
      setLoading(false);
    }, (err) => {
      console.warn('Answers listener error:', err);
      setError(err.message);
      setLoading(false);
    });
    unsubscribeRefs.current.answers = unsubAnswers;
  }, [calculateStatsFromAnswers, calculateWeeklyAndMonthly, calculateDailyActivity, loadClassRanking]);

  useEffect(() => {
    const unsubAuth = auth.onAuthStateChanged((user) => {
      if (user) {
        setCurrentUser(user);
        setupListeners(user.uid);
        // Günlük görev + lig kaydını sunucuda hazırla (sessizce; emülatör kapalıysa atlanır)
        ensureDailyState().catch(() => {});
      } else {
        setCurrentUser(null);
        setUserProfile(null);
        setStats({ totalSolved:0, correctAnswers:0, wrongAnswers:0, skippedAnswers:0, net:0, successRate:0, level:1, totalXP:0, streakDays:0, todaySolved:0 });
        setMasteryScores({});
        setClassRanking({ rank: null, total: null, list: [], loading: false });
      }
    });
    return () => {
      unsubAuth();
      Object.values(unsubscribeRefs.current).forEach(unsub => {
        if (typeof unsub === 'function') { try { unsub(); } catch { /* listener zaten kapanmis olabilir */ } }
      });
      unsubscribeRefs.current = {};
    };
  }, [setupListeners]);

  // Kalıcı oyunlaştırma durumu (recordAnswer'ın yazdığı users/{uid}.gamification).
  const gamification = userProfile?.gamification || null;

  // Seri ve XP: hem kalıcı (gamification — Cloud Functions yazar) hem türetilmiş
  // (user_logs'tan hesaplanan) kaynaklar var. İkisinin maksimumu alınır:
  //  • Functions kapalıyken kalıcı değer bayatlar → türetilmiş kazanır
  //  • Functions açıkken streak freeze devreye girerse kalıcı > türetilmiş → kalıcı kazanır
  // Böylece hangi durum olursa olsun gösterilen değer hep mantıklı kalır.
  const mergedStats = {
    ...stats,
    streakDays: Math.max(
      gamification?.streak?.count || 0,
      stats.streakDays || 0
    ),
    totalXP: Math.max(
      gamification?.xp || 0,
      stats.totalXP || 0
    ),
  };

  const value = {
    currentUser, userProfile, stats: mergedStats, gamification, masteryScores,
    weeklyData, monthlyData, dailyActivity, classRanking, loading, error,
    // Learn feed girdileri (deterministik; ekstra Firestore okuması yok)
    learnInputs: feedDerived,
  };

  return <UserStatsContext.Provider value={value}>{children}</UserStatsContext.Provider>;
}

export function useUserStats() {
  const context = React.useContext(UserStatsContext);
  if (!context) throw new Error('useUserStats must be used within UserStatsProvider');
  return context;
}
