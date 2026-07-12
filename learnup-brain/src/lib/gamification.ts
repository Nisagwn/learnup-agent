// Oyunlaştırma + SRS + görev + rozet + lig — saf mantık.
// (Edge `_shared/logic.ts` birebir portu; Deno bağımlılığı yok, framework-bağımsız.)

// ─── XP ─────────────────────────────────────────────────────────────────────
export const XP = { CORRECT: 10, FIRST_TRY_BONUS: 5, WRONG: 2, SKIP: 0 }

export function xpForAnswer({ isCorrect, isSkipped, attemptNumber }:
  { isCorrect: boolean; isSkipped: boolean; attemptNumber: number }): number {
  if (isSkipped) return XP.SKIP
  if (isCorrect) return XP.CORRECT + (Number(attemptNumber) === 1 ? XP.FIRST_TRY_BONUS : 0)
  return XP.WRONG
}

// ─── TARİH ──────────────────────────────────────────────────────────────────
export function todayISO(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function daysBetween(isoA: string | null, isoB: string): number {
  if (!isoA || !isoB) return Infinity
  const a = new Date(isoA + 'T00:00:00')
  const b = new Date(isoB + 'T00:00:00')
  return Math.round((+b - +a) / 86400000)
}

export function getWeekId(date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil(((+d - +yearStart) / 86400000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

// ─── SERİ ───────────────────────────────────────────────────────────────────
const STREAK_MILESTONES = [7, 30, 100]
const MAX_FREEZES = 2
const FREEZE_EARN_EVERY = 7

export function applyStreak(streak: any, today: string) {
  const s = {
    count: Number(streak?.count) || 0,
    longest: Number(streak?.longest) || 0,
    lastActiveDate: streak?.lastActiveDate || null,
    freezesAvailable: Number(streak?.freezesAvailable) || 0,
    freezeUsedDates: Array.isArray(streak?.freezeUsedDates) ? streak.freezeUsedDates : [],
  }
  const gap = s.lastActiveDate ? daysBetween(s.lastActiveDate, today) : null
  let milestone: number | null = null, freezeUsed = false, freezeEarned = false
  if (gap === 0) return { streak: s, milestone, freezeUsed, freezeEarned, continued: false }
  const prevCount = s.count
  if (gap === null || gap === 1) {
    s.count = gap === 1 ? s.count + 1 : 1
  } else {
    const missed = gap - 1
    if (missed === 1 && s.freezesAvailable > 0) {
      s.freezesAvailable -= 1
      s.freezeUsedDates = [...s.freezeUsedDates, today].slice(-10)
      s.count = s.count + 1
      freezeUsed = true
    } else s.count = 1
  }
  s.lastActiveDate = today
  if (s.count > s.longest) s.longest = s.count
  if (s.count > prevCount && STREAK_MILESTONES.includes(s.count)) milestone = s.count
  if (s.count > prevCount && s.count % FREEZE_EARN_EVERY === 0 && s.freezesAvailable < MAX_FREEZES) {
    s.freezesAvailable += 1; freezeEarned = true
  }
  return { streak: s, milestone, freezeUsed, freezeEarned, continued: true }
}

// ─── SRS (Leitner) ──────────────────────────────────────────────────────────
export const SRS_INTERVALS_DAYS = [0, 1, 3, 7, 16, 35]
const MAX_BOX = SRS_INTERVALS_DAYS.length - 1
const DAY_MS = 86400000

export function applySrsAnswer(prevCard: any, { isCorrect, now }: { isCorrect: boolean; now: number }) {
  const prev = prevCard || {}
  const prevBox = Number.isInteger(prev.box) ? prev.box : 0
  const prevConsec = Number(prev.consecutive_correct ?? prev.consecutiveCorrect) || 0
  const totalAttempts = (Number(prev.total_attempts ?? prev.totalAttempts) || 0) + 1
  let box: number, consecutiveCorrect: number
  if (isCorrect) { box = Math.min(MAX_BOX, prevBox + 1); consecutiveCorrect = prevConsec + 1 }
  else { box = 0; consecutiveCorrect = 0 }
  const nextReviewAtMs = now + SRS_INTERVALS_DAYS[box] * DAY_MS
  return { box, consecutiveCorrect, totalAttempts, nextReviewAtMs, lastReviewedAtMs: now }
}

// ─── GÜNLÜK GÖREVLER ──────────────────────────────────────────────────────────
const QUEST_TEMPLATES = [
  { id: 'solve', type: 'solve_count', emoji: '📝', title: (t: number) => `${t} soru çöz`, targets: [5, 10, 15], rewardXP: 20 },
  { id: 'correct', type: 'correct_count', emoji: '✅', title: (t: number) => `${t} soruyu doğru yanıtla`, targets: [3, 5, 8], rewardXP: 30 },
  { id: 'first_try', type: 'first_try_correct', emoji: '🎯', title: (t: number) => `${t} soruyu hatasız çöz`, targets: [2, 3, 5], rewardXP: 40 },
  { id: 'subject', type: 'subject_solve', emoji: '📚', title: (t: number, s: string) => `${s} dersinde ${t} soru çöz`, targets: [4, 6, 8], rewardXP: 35, needsSubject: true },
  { id: 'streak', type: 'keep_streak', emoji: '🔥', title: () => 'Bugün çalışarak serini koru', targets: [1], rewardXP: 15 },
]
const QUEST_SUBJECTS = ['Matematik', 'Fizik', 'Kimya', 'Biyoloji', 'Edebiyat', 'Coğrafya']
const pick = (arr: any[]) => arr[Math.floor(Math.random() * arr.length)]

export function generateDailyQuests(dateIso: string) {
  const pool = [...QUEST_TEMPLATES]
  const chosen: any[] = []
  while (chosen.length < 3 && pool.length > 0) chosen.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0])
  const quests = chosen.map((tpl, i) => {
    const target = pick(tpl.targets)
    const subject = tpl.needsSubject ? pick(QUEST_SUBJECTS) : null
    return { id: `${dateIso}-${tpl.id}-${i}`, templateId: tpl.id, type: tpl.type, emoji: tpl.emoji,
      title: tpl.title(target, subject), subject, target, progress: 0, rewardXP: tpl.rewardXP, claimed: false }
  })
  return { date: dateIso, quests }
}

export function applyAnswerToQuests(dailyQuests: any, answer: any) {
  if (!dailyQuests?.quests) return { dailyQuests, completedNow: [] }
  const { isCorrect, isSkipped, attemptNumber, subject } = answer
  const solved = !isSkipped
  const completedNow: string[] = []
  const quests = dailyQuests.quests.map((q: any) => {
    if (q.progress >= q.target) return q
    let inc = 0
    switch (q.type) {
      case 'solve_count': inc = solved ? 1 : 0; break
      case 'correct_count': inc = isCorrect ? 1 : 0; break
      case 'first_try_correct': inc = isCorrect && Number(attemptNumber) === 1 ? 1 : 0; break
      case 'subject_solve': inc = solved && subject && q.subject && subject.toLowerCase() === q.subject.toLowerCase() ? 1 : 0; break
      case 'keep_streak': inc = 1; break
      default: inc = 0
    }
    if (inc === 0) return q
    const progress = Math.min(q.target, q.progress + inc)
    if (progress >= q.target && q.progress < q.target) completedNow.push(q.id)
    return { ...q, progress }
  })
  return { dailyQuests: { ...dailyQuests, quests }, completedNow }
}

// ─── ROZETLER ─────────────────────────────────────────────────────────────────
const BADGE_CATALOG = [
  { id: 'streak_3', check: (s: any) => (s.streakDays || 0) >= 3 },
  { id: 'streak_7', check: (s: any) => (s.streakDays || 0) >= 7 },
  { id: 'streak_30', check: (s: any) => (s.streakDays || 0) >= 30 },
  { id: 'streak_100', check: (s: any) => (s.streakDays || 0) >= 100 },
  { id: 'solved_25', check: (s: any) => (s.totalSolved || 0) >= 25 },
  { id: 'solved_100', check: (s: any) => (s.totalSolved || 0) >= 100 },
  { id: 'solved_500', check: (s: any) => (s.totalSolved || 0) >= 500 },
  { id: 'level_3', check: (s: any) => (s.level || 1) >= 3 },
  { id: 'level_5', check: (s: any) => (s.level || 1) >= 5 },
  { id: 'level_8', check: (s: any) => (s.level || 1) >= 8 },
  { id: 'mastery_80', check: (s: any) => Object.values(s.masteryScores || {}).some((m: any) => (m?.score || 0) >= 80) },
  { id: 'mastery_100', check: (s: any) => Object.values(s.masteryScores || {}).some((m: any) => (m?.score || 0) >= 100) },
]
export function evaluateBadges(snapshot: any): string[] {
  return BADGE_CATALOG.filter((b) => { try { return !!b.check(snapshot); } catch { return false; } }).map((b) => b.id)
}

// ─── LİG ──────────────────────────────────────────────────────────────────────
export const TIERS = ['bronze', 'silver', 'gold', 'sapphire', 'diamond']
const PROMOTE_COUNT = 7, RELEGATE_COUNT = 5
const tierIndex = (t: string) => { const i = TIERS.indexOf(t); return i < 0 ? 0 : i }
export const promoteTier = (t: string) => TIERS[Math.min(TIERS.length - 1, tierIndex(t) + 1)]
export const relegateTier = (t: string) => TIERS[Math.max(0, tierIndex(t) - 1)]
export function resolveTierWeek(entries: any[], tier: string) {
  const sorted = [...entries].sort((a, b) => (b.weekly_xp ?? b.weeklyXP ?? 0) - (a.weekly_xp ?? a.weeklyXP ?? 0))
  return sorted.map((e, idx) => {
    let outcome = 'stay', newTier = tier
    if (idx < PROMOTE_COUNT && tier !== 'diamond') { outcome = 'promote'; newTier = promoteTier(tier) }
    else if (idx >= sorted.length - RELEGATE_COUNT && tier !== 'bronze') { outcome = 'relegate'; newTier = relegateTier(tier) }
    return { uid: e.uid, oldTier: tier, newTier, outcome, rank: idx + 1 }
  })
}

// ─── SEVİYE + GAMIFICATION DURUMU ─────────────────────────────────────────────
const LEVEL_THRESHOLDS = [0, 5, 15, 30, 60, 100, 150, 200]
export function levelFromCorrect(correct: number): number {
  let lvl = 1
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) if ((correct || 0) >= LEVEL_THRESHOLDS[i]) lvl = i + 1
  return lvl
}

export function freshGamification() {
  return {
    xp: 0, totalSolved: 0, correctAnswers: 0, coins: 0, subjects: {},
    streak: { count: 0, longest: 0, lastActiveDate: null, freezesAvailable: 0, freezeUsedDates: [] },
    league: { tier: 'bronze', weekId: null, weeklyXP: 0 },
    dailyQuests: { date: null, quests: [] },
  }
}

export function ensureGamification(raw: any, today: string, weekId: string) {
  const base = freshGamification()
  const g: any = { ...base, ...(raw || {}) }
  g.streak = { ...base.streak, ...(raw && raw.streak) }
  g.league = { ...base.league, ...(raw && raw.league) }
  g.subjects = (raw && raw.subjects) || {}
  if (!g.dailyQuests || g.dailyQuests.date !== today) g.dailyQuests = generateDailyQuests(today)
  if (g.league.weekId !== weekId) g.league = { tier: g.league.tier || 'bronze', weekId, weeklyXP: 0 }
  return g
}

export function displayName(userData: any): string {
  return (userData && (userData.name || userData.full_name)) ||
    (userData && userData.email ? userData.email.split('@')[0] : null) || 'Öğrenci'
}

export function isStudent(userData: any): boolean {
  return (userData && userData.role ? userData.role : 'student') === 'student'
}
