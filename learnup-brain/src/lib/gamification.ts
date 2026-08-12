// ─── TİPLER ─────────────────────────────────────────────────────────────────

export interface Streak {
  count: number
  longest: number
  lastActiveDate: string | null
  freezesAvailable: number
  freezeUsedDates: string[]
}

export interface League {
  tier: string
  weekId: string | null
  weeklyXP: number
}

export interface Quest {
  id: string
  templateId: string
  type: string
  emoji: string
  title: string
  subject: string | null
  target: number
  progress: number
  rewardXP: number
  claimed: boolean
}

export interface DailyQuests {
  date: string | null
  quests: Quest[]
}

export interface SubjectStats {
  solved?: number
  correct?: number
  xp?: number
}

export interface Gamification {
  xp: number
  totalSolved: number
  correctAnswers: number
  coins: number
  subjects: Record<string, SubjectStats>
  streak: Streak
  league: League
  dailyQuests: DailyQuests
}

export interface AnswerEvent {
  isCorrect: boolean
  isSkipped: boolean
  attemptNumber: number
  subject: string
}

export interface BadgeSnapshot {
  streakDays?: number
  totalSolved?: number
  level?: number
  masteryScores?: Record<string, { score?: number }>
}

export interface LeagueEntry {
  uid: string
  weekly_xp?: number
  weeklyXP?: number
}

// ─── XP ─────────────────────────────────────────────────────────────────────
export const XP = { CORRECT: 10, FIRST_TRY_BONUS: 5, WRONG: 2, SKIP: 0 }

export function xpForAnswer({ isCorrect, isSkipped, attemptNumber }:
  { isCorrect: boolean; isSkipped: boolean; attemptNumber: number }): number {
  if (isSkipped) return XP.SKIP
  if (isCorrect) return XP.CORRECT + (Number(attemptNumber) === 1 ? XP.FIRST_TRY_BONUS : 0)
  return XP.WRONG
}

// ─── TARİH ──────────────────────────────────────────────────────────────────
/**
 * ÖĞRENCİ GÜNÜ — Europe/Istanbul.
 *
 * ⚠️ Eskiden `date.getFullYear()/getMonth()/getDate()` ile SÜRECİN YEREL saati okunuyordu.
 * docker-compose'da hiçbir servise TZ verilmiyor → konteyner UTC. Sonuç: Türkiye'de
 * 00:00–03:00 arası çözülen her soru BİR ÖNCEKİ güne yazılıyordu. Gece çalışan öğrencinin
 * serisi kopuyor, günlük görevleri geç yenileniyor, istemcinin "bugün tamamlandı" rozeti
 * hiç çıkmıyor ve öğrenci o gün için boşuna seri-dondurma hakkı harcıyordu.
 *
 * Aynı dosyanın komşuları (lib/rontgen.ts:175, teacher.routes.ts:200, atolye.worker.ts:139)
 * gün anahtarını ZATEN 'Europe/Istanbul' ile üretiyordu — yani öğrencinin gördüğü trend
 * grafiği ile serisi farklı gün sınırları kullanıyordu. Kanonik sınır artık tek yerde.
 *
 * Türkiye 2016'dan beri kalıcı UTC+3 (yaz saati YOK) → sabit ofset güvenli.
 */
export const OGRENCI_TZ = 'Europe/Istanbul'
export const OGRENCI_TZ_OFSET = '+03:00'

export function todayISO(date = new Date()): string {
  return date.toLocaleDateString('en-CA', { timeZone: OGRENCI_TZ })   // YYYY-MM-DD
}

/** Öğrenci gününün başlangıcı, MUTLAK an olarak (Postgres timestamptz karşılaştırması için). */
export function gunBaslangiciISO(gunIso: string): string {
  return `${gunIso}T00:00:00.000${OGRENCI_TZ_OFSET}`
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

interface StreakResult {
  streak: Streak
  milestone: number | null
  freezeUsed: boolean
  freezeEarned: boolean
  continued: boolean
}

export function applyStreak(streak: Partial<Streak> | null, today: string): StreakResult {
  const s: Streak = {
    count: Number(streak?.count) || 0,
    longest: Number(streak?.longest) || 0,
    lastActiveDate: streak?.lastActiveDate ?? null,
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

export interface SrsCard {
  box: number
  consecutive_correct?: number
  consecutiveCorrect?: number
  total_attempts?: number
  totalAttempts?: number
}

export interface SrsResult {
  box: number
  consecutiveCorrect: number
  totalAttempts: number
  nextReviewAtMs: number
  lastReviewedAtMs: number
}

export function applySrsAnswer(prevCard: Partial<SrsCard> | null, { isCorrect, now }: { isCorrect: boolean; now: number }): SrsResult {
  const prev = prevCard || {}
  const prevBox = Number.isInteger(prev.box) ? (prev.box as number) : 0
  const prevConsec = Number(prev.consecutive_correct ?? prev.consecutiveCorrect) || 0
  const totalAttempts = (Number(prev.total_attempts ?? prev.totalAttempts) || 0) + 1
  let box: number, consecutiveCorrect: number
  if (isCorrect) { box = Math.min(MAX_BOX, prevBox + 1); consecutiveCorrect = prevConsec + 1 }
  else { box = 0; consecutiveCorrect = 0 }
  const nextReviewAtMs = now + SRS_INTERVALS_DAYS[box] * DAY_MS
  return { box, consecutiveCorrect, totalAttempts, nextReviewAtMs, lastReviewedAtMs: now }
}

// ─── GÜNLÜK GÖREVLER ──────────────────────────────────────────────────────────
interface QuestTemplate {
  id: string
  type: string
  emoji: string
  title: (t: number, s?: string | null) => string
  targets: number[]
  rewardXP: number
  needsSubject?: boolean
}

const QUEST_TEMPLATES: QuestTemplate[] = [
  { id: 'solve', type: 'solve_count', emoji: '📝', title: (t, _s) => `${t} soru çöz`, targets: [5, 10, 15], rewardXP: 20 },
  { id: 'correct', type: 'correct_count', emoji: '✅', title: (t, _s) => `${t} soruyu doğru yanıtla`, targets: [3, 5, 8], rewardXP: 30 },
  { id: 'first_try', type: 'first_try_correct', emoji: '🎯', title: (t, _s) => `${t} soruyu hatasız çöz`, targets: [2, 3, 5], rewardXP: 40 },
  { id: 'subject', type: 'subject_solve', emoji: '📚', title: (t, s) => `${s} dersinde ${t} soru çöz`, targets: [4, 6, 8], rewardXP: 35, needsSubject: true },
  { id: 'streak', type: 'keep_streak', emoji: '🔥', title: () => 'Bugün çalışarak serini koru', targets: [1], rewardXP: 15 },
]
const QUEST_SUBJECTS = ['Matematik', 'Fizik', 'Kimya', 'Biyoloji', 'Edebiyat', 'Coğrafya']
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]

export function generateDailyQuests(dateIso: string): DailyQuests {
  const pool = [...QUEST_TEMPLATES]
  const chosen: QuestTemplate[] = []
  while (chosen.length < 3 && pool.length > 0) chosen.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0])
  const quests: Quest[] = chosen.map((tpl, i) => {
    const target = pick(tpl.targets)
    const subject = tpl.needsSubject ? pick(QUEST_SUBJECTS) : null
    return { id: `${dateIso}-${tpl.id}-${i}`, templateId: tpl.id, type: tpl.type, emoji: tpl.emoji,
      title: tpl.title(target, subject), subject, target, progress: 0, rewardXP: tpl.rewardXP, claimed: false }
  })
  return { date: dateIso, quests }
}

export function applyAnswerToQuests(dailyQuests: DailyQuests | null, answer: AnswerEvent): { dailyQuests: DailyQuests | null; completedNow: string[] } {
  if (!dailyQuests?.quests) return { dailyQuests, completedNow: [] }
  const { isCorrect, isSkipped, attemptNumber, subject } = answer
  const solved = !isSkipped
  const completedNow: string[] = []
  const quests = dailyQuests.quests.map((q) => {
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
  { id: 'streak_3', check: (s: BadgeSnapshot) => (s.streakDays || 0) >= 3 },
  { id: 'streak_7', check: (s: BadgeSnapshot) => (s.streakDays || 0) >= 7 },
  { id: 'streak_30', check: (s: BadgeSnapshot) => (s.streakDays || 0) >= 30 },
  { id: 'streak_100', check: (s: BadgeSnapshot) => (s.streakDays || 0) >= 100 },
  { id: 'solved_25', check: (s: BadgeSnapshot) => (s.totalSolved || 0) >= 25 },
  { id: 'solved_100', check: (s: BadgeSnapshot) => (s.totalSolved || 0) >= 100 },
  { id: 'solved_500', check: (s: BadgeSnapshot) => (s.totalSolved || 0) >= 500 },
  { id: 'level_3', check: (s: BadgeSnapshot) => (s.level || 1) >= 3 },
  { id: 'level_5', check: (s: BadgeSnapshot) => (s.level || 1) >= 5 },
  { id: 'level_8', check: (s: BadgeSnapshot) => (s.level || 1) >= 8 },
  { id: 'mastery_80', check: (s: BadgeSnapshot) => Object.values(s.masteryScores || {}).some((m) => (m?.score || 0) >= 80) },
  { id: 'mastery_100', check: (s: BadgeSnapshot) => Object.values(s.masteryScores || {}).some((m) => (m?.score || 0) >= 100) },
]
export function evaluateBadges(snapshot: BadgeSnapshot): string[] {
  return BADGE_CATALOG.filter((b) => { try { return !!b.check(snapshot); } catch { return false } }).map((b) => b.id)
}

// ─── LİG ──────────────────────────────────────────────────────────────────────
export const TIERS = ['bronze', 'silver', 'gold', 'sapphire', 'diamond']
const PROMOTE_COUNT = 7, RELEGATE_COUNT = 5
const tierIndex = (t: string) => { const i = TIERS.indexOf(t); return i < 0 ? 0 : i }
export const promoteTier = (t: string) => TIERS[Math.min(TIERS.length - 1, tierIndex(t) + 1)]
export const relegateTier = (t: string) => TIERS[Math.max(0, tierIndex(t) - 1)]
export function resolveTierWeek(entries: LeagueEntry[], tier: string) {
  const sorted = [...entries].sort((a, b) => (b.weekly_xp ?? b.weeklyXP ?? 0) - (a.weekly_xp ?? a.weeklyXP ?? 0))
  /**
   * ⚠️ KÜÇÜK LİGDE KİMSE DÜŞMÜYORDU. `idx < PROMOTE_COUNT` dalı `idx >= n - RELEGATE_COUNT`
   * dalından ÖNCE geliyor; 12'den az üyeli bir ligde (7 + 5) iki aralık ÇAKIŞIYOR ve alt
   * sıradaki oyuncular da `idx < 7` koşulunu sağlayıp TERFİ ediyordu — düşme hiç gerçekleşmiyor,
   * herkes yukarı akıyordu. Lig dolmadan terfi/düşme bantları oransal daraltılır: bantlar
   * asla kesişemez, sıralamanın ortası "kal" olarak korunur.
   */
  const n = sorted.length
  const terfi = Math.min(PROMOTE_COUNT, Math.floor(n / 2))
  const dusme = Math.min(RELEGATE_COUNT, n - terfi)
  return sorted.map((e, idx) => {
    let outcome = 'stay', newTier = tier
    if (idx < terfi && tier !== 'diamond') { outcome = 'promote'; newTier = promoteTier(tier) }
    else if (idx >= n - dusme && tier !== 'bronze') { outcome = 'relegate'; newTier = relegateTier(tier) }
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

export function freshGamification(): Gamification {
  return {
    xp: 0, totalSolved: 0, correctAnswers: 0, coins: 0, subjects: {},
    streak: { count: 0, longest: 0, lastActiveDate: null, freezesAvailable: 0, freezeUsedDates: [] },
    league: { tier: 'bronze', weekId: null, weeklyXP: 0 },
    dailyQuests: { date: null, quests: [] },
  }
}

export function ensureGamification(raw: unknown, today: string, weekId: string): Gamification {
  const base = freshGamification()
  const g = { ...base, ...(raw as Record<string, unknown> || {}) } as Gamification
  const rawObj = (raw as Record<string, unknown>) || {}
  g.streak = { ...base.streak, ...(rawObj.streak as Partial<Streak> || {}) }
  g.league = { ...base.league, ...(rawObj.league as Partial<League> || {}) }
  g.subjects = (rawObj.subjects as Record<string, SubjectStats>) || {}
  if (!g.dailyQuests || g.dailyQuests.date !== today) g.dailyQuests = generateDailyQuests(today)
  if (g.league.weekId !== weekId) g.league = { tier: g.league.tier || 'bronze', weekId, weeklyXP: 0 }
  return g
}

export function displayName(userData: { name?: string; full_name?: string; email?: string } | null): string {
  return (userData && (userData.name || userData.full_name)) ||
    (userData && userData.email ? userData.email.split('@')[0] : null) || 'Öğrenci'
}

export function isStudent(userData: { role?: string } | null): boolean {
  return (userData && userData.role ? userData.role : 'student') === 'student'
}
