// recordAnswer — her cevaptan sonra: user_logs + SRS + XP/seri/görev/lig/rozet.
// Otoriter gamification yazımı (service-role). Firestore→Supabase port.
import { preflight, json, getAdmin, resolveUserId } from '../_shared/http.ts';
import {
  xpForAnswer, todayISO, getWeekId, applyStreak, applyAnswerToQuests,
  evaluateBadges, levelFromCorrect, ensureGamification, displayName, isStudent, applySrsAnswer,
} from '../_shared/logic.ts';

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);
  try {
    const admin = getAdmin();
    const userId = await resolveUserId(req, admin);
    if (!userId) return json({ error: 'userId gerekli.' }, 401);

    const body = await req.json().catch(() => ({}));
    const {
      questionId = null, subject = 'Genel', topic = null, subTopic = null,
      isCorrect = null, isSkipped = false, attemptNumber = 1, durationSec = 0,
      snapshot = null, attemptId = null, difficulty = null,
    } = body;

    const today = todayISO();
    const weekId = getWeekId();
    const { data: profile } = await admin.from('profiles').select('*').eq('id', userId).single();
    const userData: any = profile || {};
    const g = ensureGamification(userData.gamification, today, weekId);

    const xpGained = xpForAnswer({ isCorrect: isCorrect === true, isSkipped: !!isSkipped, attemptNumber });
    g.xp = (g.xp || 0) + xpGained;
    g.totalSolved = (g.totalSolved || 0) + 1;
    if (isCorrect === true) g.correctAnswers = (g.correctAnswers || 0) + 1;

    const subjKey = String(subject).toLowerCase().trim();
    const sub = g.subjects[subjKey] || { solved: 0, correct: 0 };
    sub.solved += 1;
    if (isCorrect === true) sub.correct += 1;
    g.subjects[subjKey] = sub;

    const streakResult = applyStreak(g.streak, today);
    g.streak = streakResult.streak;

    const questResult = applyAnswerToQuests(g.dailyQuests, {
      isCorrect: isCorrect === true, isSkipped: !!isSkipped, attemptNumber, subject,
    });
    g.dailyQuests = questResult.dailyQuests;
    g.league.weeklyXP = (g.league.weeklyXP || 0) + xpGained;

    const masteryScores: any = {};
    Object.entries(g.subjects).forEach(([k, v]: any) => {
      masteryScores[k] = { score: v.solved > 0 ? Math.round((v.correct / v.solved) * 100) : 0 };
    });
    const level = levelFromCorrect(g.correctAnswers);
    const earnedBadges = evaluateBadges({
      streakDays: g.streak.count, totalSolved: g.totalSolved,
      correctAnswers: g.correctAnswers, level, masteryScores,
    });
    const persistedBadges = Object.keys(userData.unlocked_badges || {});
    const newBadges = earnedBadges.filter((id) => !persistedBadges.includes(id));

    // Cevap logu (UserStatsContext + TeacherDashboard bunu tüketir)
    await admin.from('user_logs').insert({
      student_id: userId,
      teacher_id: userData.teacher_id || null,
      subject,
      sub_topic: subTopic || topic || 'Genel',
      question_id: questionId ? String(questionId) : null,
      is_correct: isCorrect === true,
      is_skipped: !!isSkipped,
      time_spent: Number(durationSec) || 0,
      attempt_number: Number(attemptNumber) || 1,
      xp: xpGained,
      difficulty,
    });

    // SRS — izole (hata gamification'ı 500'lemez)
    if (questionId && isCorrect !== null && isCorrect !== undefined) {
      try {
        const { data: prevCard } = await admin.from('srs_cards')
          .select('*').eq('user_id', userId).eq('question_id', String(questionId)).maybeSingle();
        if (!prevCard || prevCard.last_attempt_id == null || prevCard.last_attempt_id !== attemptId || attemptId == null) {
          const now = Date.now();
          const next = applySrsAnswer(prevCard, { isCorrect: isCorrect === true, now });
          const card: any = {
            user_id: userId,
            question_id: String(questionId),
            box: next.box,
            consecutive_correct: next.consecutiveCorrect,
            total_attempts: next.totalAttempts,
            next_review_at: new Date(next.nextReviewAtMs).toISOString(),
            last_reviewed_at: new Date(next.lastReviewedAtMs).toISOString(),
            subject,
            topic: topic || null,
            sub_topic: subTopic || topic || null,
          };
          if (attemptId != null) card.last_attempt_id = attemptId;
          if (snapshot && snapshot.question && Array.isArray(snapshot.choices) && snapshot.choices.length >= 4) {
            card.snapshot = { question: String(snapshot.question), choices: snapshot.choices, answer: snapshot.answer ?? null };
          }
          await admin.from('srs_cards').upsert(card, { onConflict: 'user_id,question_id' });
        }
      } catch (srsErr) {
        console.warn('SRS güncellenemedi:', srsErr);
      }
    }

    // Profil: gamification + yeni rozetler
    const unlocked = { ...(userData.unlocked_badges || {}) };
    const nowIso = new Date().toISOString();
    newBadges.forEach((id) => { unlocked[id] = nowIso; });
    await admin.from('profiles').update({ gamification: g, unlocked_badges: unlocked }).eq('id', userId);

    // Lig kaydı — yalnız öğrenciler
    if (isStudent(userData)) {
      await admin.from('league_entries').upsert({
        week_id: weekId, uid: userId, name: displayName(userData),
        tier: g.league.tier, weekly_xp: g.league.weeklyXP, role: 'student', updated_at: nowIso,
      }, { onConflict: 'week_id,uid' });
    }

    return json({
      success: true, xpGained, totalXp: g.xp, level,
      streak: {
        count: g.streak.count, milestone: streakResult.milestone,
        freezeUsed: streakResult.freezeUsed, freezeEarned: streakResult.freezeEarned,
        freezesAvailable: g.streak.freezesAvailable,
      },
      questsCompleted: questResult.completedNow,
      dailyQuests: g.dailyQuests,
      newBadges,
      league: { tier: g.league.tier, weeklyXP: g.league.weeklyXP },
    });
  } catch (err: any) {
    return json({ error: err?.message || 'Sunucu hatası.' }, 500);
  }
});
