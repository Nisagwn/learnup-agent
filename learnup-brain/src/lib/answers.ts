import { supabase } from '../clients/supabase.js'
import { logger } from '../utils/logger.js'
import {
  todayISO, getWeekId, ensureGamification, xpForAnswer, applyStreak, applyAnswerToQuests,
  evaluateBadges, levelFromCorrect, displayName, isStudent, applySrsAnswer,
} from './gamification.js'
import { pushSignal } from './signals.js'
import { updateMastery } from './mastery.js'
import { markActive } from '../agents/katip.js'
import { onAnswer } from '../agents/atlas.js'

/**
 * Birleşik cevap işleme (§B6/§6) — /api/v1/answers'ın motoru.
 * HESAP TypeScript'te (gamification.ts saf fonksiyonları), YAZIM atomik `record_answer`
 * RPC'sinde (user_logs + srs_cards + profiles + league tek transaction). RPC henüz
 * migre edilmemişse legacy doğrudan-yazım yoluna düşer (taş gibi sağlam, kırmaz).
 * Ardından Sinyal penceresi + ATLAS BKT-lite mastery beslenir (her ikisi izole).
 */

export type AnswerBody = {
  questionId?: string | null
  subject?: string
  topic?: string | null
  subTopic?: string | null
  kazanimId?: number | null
  isCorrect?: boolean | null
  isSkipped?: boolean
  attemptNumber?: number
  durationSec?: number
  durationMs?: number | null
  selectedOption?: string | null   // 'A'..'E'
  snapshot?: { question?: string; choices?: unknown[]; answer?: unknown } | null
  attemptId?: string | null
  difficulty?: string | null
  placement?: boolean              // tanışma testi → K=0.3 hızlı yakınsama
}

/**
 * SUNUCU TARAFI CEVAP DOĞRULAMASI.
 *
 * ⚠️ `isCorrect` İSTEMCİDEN GELİYORDU ve doğrudan XP'yi belirliyordu. Yani:
 *     for (;;) POST /api/v1/answers {"isCorrect":true,"attemptNumber":1}
 * her çağrıda 15 XP basıyordu — sınırsız XP, rozet, seri ve league_entries.weekly_xp.
 * Lider tablosu ve garden.routes'un harcadığı coin ekonomisi tamamen sahte olabilirdi.
 * (Ödev akışı — assignments.routes — cevabı ZATEN sunucuda puanlıyor; bu tutarsızlık
 * açıkça bir unutkanlıktı, tasarım tercihi değil.)
 *
 * Soru DB'de bulunabiliyorsa doğruluk SUNUCUDA hesaplanır ve istemcinin iddiası YOK SAYILIR.
 * İki havuz var, ikisi de kontrol edilir:
 *   questions.correct_answer  → şık METNİ  (eski/öğretmen havuzu, options bir dizi)
 *   yks_questions.correct_option → 'A'..'E' (YKS havuzu)
 *
 * Soru bulunamazsa (efemer/anlık üretilmiş) doğruluk DOĞRULANAMAZ → cevap yine kaydedilir
 * ama XP VERİLMEZ. Doğrulanamayan bir iddia ödüllendirilemez; aksi hâlde saldırgan sadece
 * questionId'yi boş bırakarak aynı sömürüyü sürdürürdü.
 */
async function dogrulukKontrol(
  questionId: string | null,
  selectedOption: string | null,
  istemciIddiasi: boolean | null,
): Promise<{ isCorrect: boolean | null; dogrulandi: boolean }> {
  if (!questionId) return { isCorrect: istemciIddiasi, dogrulandi: false }

  // YKS havuzu (şık harfi)
  const { data: yks } = await supabase
    .from('yks_questions').select('correct_option').eq('id', questionId).maybeSingle()
  if (yks?.correct_option) {
    return { isCorrect: selectedOption === yks.correct_option, dogrulandi: true }
  }

  // Eski/öğretmen havuzu (şık metni + options dizisi)
  const { data: q } = await supabase
    .from('questions').select('options, correct_answer').eq('id', questionId).maybeSingle()
  if (q?.correct_answer != null) {
    const opts = Array.isArray(q.options) ? (q.options as unknown[]) : []
    const idx = selectedOption ? selectedOption.charCodeAt(0) - 65 : -1   // 'A'→0
    const secilen = idx >= 0 && idx < opts.length ? String(opts[idx]) : null
    return { isCorrect: secilen !== null && secilen === String(q.correct_answer), dogrulandi: true }
  }

  return { isCorrect: istemciIddiasi, dogrulandi: false }
}

export async function processAnswer(userId: string, body: AnswerBody) {
  const {
    questionId = null, subject = 'Genel', topic = null, subTopic = null,
    isSkipped = false, attemptNumber = 1, durationSec = 0,
    snapshot = null, attemptId = null, difficulty = null,
  } = body
  const kazanimId = typeof body.kazanimId === 'number' ? body.kazanimId : null
  const selectedOption =
    typeof body.selectedOption === 'string' && /^[A-E]$/.test(body.selectedOption)
      ? body.selectedOption
      : null
  const durationMs =
    typeof body.durationMs === 'number' && body.durationMs > 0
      ? Math.round(body.durationMs)
      : Number(durationSec) > 0
        ? Math.round(Number(durationSec) * 1000)
        : null

  // ── 0) DOĞRULUK SUNUCUDA BELİRLENİR — istemcinin isCorrect iddiası bağlayıcı değil ──
  const { isCorrect, dogrulandi } = await dogrulukKontrol(
    questionId ? String(questionId) : null,
    selectedOption,
    typeof body.isCorrect === 'boolean' ? body.isCorrect : null,
  )

  // ── 1) Gamification hesabı (saf, /record ile birebir) ──
  const today = todayISO()
  const weekId = getWeekId()
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).single()
  const userData: any = profile || {}
  const g = ensureGamification(userData.gamification, today, weekId)

  // Doğrulanamayan cevap XP KAZANDIRMAZ. Aksi hâlde saldırgan questionId'yi boş bırakıp
  // {"isCorrect":true} yollayarak sınırsız XP basmaya devam ederdi.
  const xpGained = dogrulandi
    ? xpForAnswer({ isCorrect: isCorrect === true, isSkipped: !!isSkipped, attemptNumber })
    : 0
  g.xp = (g.xp || 0) + xpGained
  g.totalSolved = (g.totalSolved || 0) + 1
  if (isCorrect === true) g.correctAnswers = (g.correctAnswers || 0) + 1

  const subjKey = String(subject).toLowerCase().trim()
  const sub = g.subjects[subjKey] || { solved: 0, correct: 0 }
  sub.solved += 1
  if (isCorrect === true) sub.correct += 1
  g.subjects[subjKey] = sub

  const streakResult = applyStreak(g.streak, today)
  g.streak = streakResult.streak

  const questResult = applyAnswerToQuests(g.dailyQuests, {
    isCorrect: isCorrect === true, isSkipped: !!isSkipped, attemptNumber, subject,
  })
  g.dailyQuests = questResult.dailyQuests
  g.league.weeklyXP = (g.league.weeklyXP || 0) + xpGained

  const masteryScores: any = {}
  Object.entries(g.subjects).forEach(([k, v]: any) => {
    masteryScores[k] = { score: v.solved > 0 ? Math.round((v.correct / v.solved) * 100) : 0 }
  })
  const level = levelFromCorrect(g.correctAnswers)
  const earnedBadges = evaluateBadges({
    streakDays: g.streak.count, totalSolved: g.totalSolved,
    correctAnswers: g.correctAnswers, level, masteryScores,
  })
  const persistedBadges = Object.keys(userData.unlocked_badges || {})
  const newBadges = earnedBadges.filter((id) => !persistedBadges.includes(id))
  const nowIso = new Date().toISOString()
  const unlocked = { ...(userData.unlocked_badges || {}) }
  newBadges.forEach((id) => { unlocked[id] = nowIso })

  // ── 2) SRS kartı (önceki kart okunur; hesap saf) ──
  let srsRow: Record<string, unknown> | null = null
  if (questionId && isCorrect !== null && isCorrect !== undefined) {
    try {
      const { data: prevCard } = await supabase
        .from('srs_cards').select('*').eq('user_id', userId).eq('question_id', String(questionId)).maybeSingle()
      if (!prevCard || prevCard.last_attempt_id == null || prevCard.last_attempt_id !== attemptId || attemptId == null) {
        const now = Date.now()
        const nextC = applySrsAnswer(prevCard, { isCorrect: isCorrect === true, now })
        srsRow = {
          question_id: String(questionId),
          box: nextC.box,
          consecutive_correct: nextC.consecutiveCorrect,
          total_attempts: nextC.totalAttempts,
          next_review_at: new Date(nextC.nextReviewAtMs).toISOString(),
          last_reviewed_at: new Date(nextC.lastReviewedAtMs).toISOString(),
          subject,
          topic: topic || null,
          sub_topic: subTopic || topic || null,
        }
        if (attemptId != null) srsRow.last_attempt_id = attemptId
        if (snapshot && snapshot.question && Array.isArray(snapshot.choices) && snapshot.choices.length >= 4) {
          srsRow.snapshot = { question: String(snapshot.question), choices: snapshot.choices, answer: snapshot.answer ?? null }
        }
      }
    } catch (srsErr) {
      logger.warn({ err: srsErr }, 'SRS hesaplanamadı (izole)')
    }
  }

  // ── 3) Yazım payload'ları ──
  const logRow = {
    teacher_id: userData.teacher_id || null,
    subject,
    sub_topic: subTopic || topic || 'Genel',
    question_id: questionId ? String(questionId) : null,
    is_correct: isCorrect === true,
    is_skipped: !!isSkipped,
    time_spent: Number(durationSec) || (durationMs ? Math.round(durationMs / 1000) : 0),
    attempt_number: Number(attemptNumber) || 1,
    xp: xpGained,
    difficulty,
    kazanim_id: kazanimId,
    selected_option: selectedOption,
    duration_ms: durationMs,
  }
  const leagueRow = isStudent(userData)
    ? { week_id: weekId, name: displayName(userData), tier: g.league.tier, weekly_xp: g.league.weeklyXP, role: 'student' }
    : null

  // ── 4) Atomik yazım (record_answer RPC) → yoksa legacy fallback ──
  const { error: rpcError } = await supabase.rpc('record_answer', {
    p_user_id: userId,
    p_log: logRow,
    p_srs: srsRow,
    p_gamification: g,
    p_mastery_scores: null,
    p_stats: null,
    p_unlocked_badges: unlocked,
    p_league: leagueRow,
  })
  if (rpcError) {
    // PGRST202 = fonksiyon yok (0004 henüz uygulanmadı) → legacy doğrudan yazım.
    if (rpcError.code === 'PGRST202') {
      logger.warn('record_answer RPC yok — legacy yazım yolu (0004 migration bekleniyor)')
      await legacyWrites(userId, logRow, srsRow, g, unlocked, leagueRow)
    } else {
      throw rpcError
    }
  }

  // ── 5) Sinyal + bilişsel graf (her ikisi izole; cevabı asla düşürmez) ──
  await pushSignal(userId, {
    t: Date.now(),
    questionId: questionId ? String(questionId) : null,
    kazanimId,
    correct: isCorrect === null || isCorrect === undefined ? null : isCorrect === true,
    skipped: !!isSkipped,
    durationMs,
    selectedOption,
  }).catch((err) => logger.warn({ err }, 'sinyal yazılamadı (izole)'))
  await markActive(userId).catch(() => {}) // Kâtip oturum-sonu taraması için

  if (kazanimId !== null && isCorrect !== null && isCorrect !== undefined && !isSkipped) {
    await updateMastery({
      userId, kazanimId,
      correct: isCorrect === true,
      durationMs,
      placement: body.placement === true,
    })
    // ATLAS tetik kararı: tuzak eşiği (teşhis) / kapanış adayı (doğrulama) — izole.
    await onAnswer({ userId, kazanimId, correct: isCorrect === true, selectedOption })
  }

  // ── 6) Yanıt (/api/practice/record ile birebir aynı sözleşme) ──
  return {
    success: true,
    xpGained,
    totalXp: g.xp,
    level,
    streak: {
      count: g.streak.count,
      milestone: streakResult.milestone,
      freezeUsed: streakResult.freezeUsed,
      freezeEarned: streakResult.freezeEarned,
      freezesAvailable: g.streak.freezesAvailable,
    },
    questsCompleted: questResult.completedNow,
    dailyQuests: g.dailyQuests,
    newBadges,
    league: { tier: g.league.tier, weeklyXP: g.league.weeklyXP },
  }
}

/** 0004 uygulanana dek eski (atomik olmayan) yazım — davranış /record ile birebir. */
async function legacyWrites(
  userId: string,
  logRow: Record<string, unknown>,
  srsRow: Record<string, unknown> | null,
  g: unknown,
  unlocked: Record<string, string>,
  leagueRow: Record<string, unknown> | null,
): Promise<void> {
  // Yeni kolonlar (kazanim_id/selected_option/duration_ms) migration öncesi DB'de olmayabilir → çıkar.
  const { kazanim_id: _k, selected_option: _s, duration_ms: _d, ...legacyLog } = logRow
  await supabase.from('user_logs').insert({ student_id: userId, ...legacyLog })
  if (srsRow) {
    await supabase.from('srs_cards')
      .upsert({ user_id: userId, ...srsRow }, { onConflict: 'user_id,question_id' })
      .then(({ error }) => { if (error) logger.warn({ err: error }, 'SRS legacy yazım hatası') })
  }
  await supabase.from('profiles').update({ gamification: g, unlocked_badges: unlocked }).eq('id', userId)
  if (leagueRow) {
    await supabase.from('league_entries').upsert(
      { uid: userId, ...leagueRow, updated_at: new Date().toISOString() },
      { onConflict: 'week_id,uid' },
    )
  }
}
