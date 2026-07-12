import { Router } from 'express'
import { supabase } from '../clients/supabase.js'
import { todayISO, getWeekId, ensureGamification, displayName, isStudent } from '../lib/gamification.js'

/** Oyunlaştırma — günlük durum / görev ödülü / seri dondurması.
 *  (Edge: ensure-daily-state, claim-quest-reward, use-streak-freeze) */
export const gamificationRouter = Router()

const MAX_FREEZES = 2

// POST /api/gamification/daily — açılışta: bugünün görevleri + haftanın lig kaydı.
gamificationRouter.post('/daily', async (req, res, next) => {
  try {
    const userId = req.userId!
    const today = todayISO()
    const weekId = getWeekId()
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).single()
    const userData: any = profile || {}
    const g = ensureGamification(userData.gamification, today, weekId)

    await supabase.from('profiles').update({ gamification: g }).eq('id', userId)
    if (isStudent(userData)) {
      await supabase.from('league_entries').upsert(
        {
          week_id: weekId,
          uid: userId,
          name: displayName(userData),
          tier: g.league.tier,
          weekly_xp: g.league.weeklyXP,
          role: 'student',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'week_id,uid' },
      )
    }
    res.json({ success: true, gamification: g, weekId })
  } catch (err) {
    next(err)
  }
})

// POST /api/gamification/quests/claim — tamamlanmış günlük görevin XP ödülünü verir.
gamificationRouter.post('/quests/claim', async (req, res, next) => {
  try {
    const userId = req.userId!
    const { questId } = req.body ?? {}
    if (!questId) {
      res.status(400).json({ error: 'questId gerekli.' })
      return
    }
    const today = todayISO()
    const weekId = getWeekId()
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).single()
    const userData: any = profile || {}
    const g = ensureGamification(userData.gamification, today, weekId)

    const quest = g.dailyQuests.quests.find((q: any) => q.id === questId)
    if (!quest) {
      res.status(404).json({ error: 'Görev bulunamadı.' })
      return
    }
    if (quest.claimed) {
      res.status(400).json({ error: 'Ödül zaten alındı.' })
      return
    }
    if (quest.progress < quest.target) {
      res.status(400).json({ error: 'Görev tamamlanmadı.' })
      return
    }

    quest.claimed = true
    g.xp = (g.xp || 0) + quest.rewardXP
    g.league.weeklyXP = (g.league.weeklyXP || 0) + quest.rewardXP

    await supabase.from('profiles').update({ gamification: g }).eq('id', userId)
    if (isStudent(userData)) {
      await supabase.from('league_entries').upsert(
        {
          week_id: weekId,
          uid: userId,
          name: displayName(userData),
          tier: g.league.tier,
          weekly_xp: g.league.weeklyXP,
          role: 'student',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'week_id,uid' },
      )
    }
    res.json({
      success: true,
      rewardXP: quest.rewardXP,
      totalXp: g.xp,
      league: { tier: g.league.tier, weeklyXP: g.league.weeklyXP },
    })
  } catch (err) {
    next(err)
  }
})

// POST /api/gamification/streak/freeze — seri dondurması ver (varsayılan) / harca (consume=true).
gamificationRouter.post('/streak/freeze', async (req, res, next) => {
  try {
    const userId = req.userId!
    const body = req.body ?? {}
    const consume = body?.consume === true || body?.action === 'consume'

    const today = todayISO()
    const weekId = getWeekId()
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).single()
    const userData: any = profile || {}
    const g = ensureGamification(userData.gamification, today, weekId)

    const s = g.streak
    s.freezesAvailable = Number(s.freezesAvailable) || 0
    if (!Array.isArray(s.freezeUsedDates)) s.freezeUsedDates = []

    let changed = false
    if (consume) {
      // Bugün için bir dondurma harca (idempotent).
      if (s.freezesAvailable > 0 && !s.freezeUsedDates.includes(today)) {
        s.freezesAvailable -= 1
        s.freezeUsedDates.push(today)
        changed = true
      }
    } else {
      // Elle bir dondurma ver (üst sınıra kadar).
      if (s.freezesAvailable < MAX_FREEZES) {
        s.freezesAvailable += 1
        changed = true
      }
    }

    if (changed) {
      g.streak = s
      await supabase.from('profiles').update({ gamification: g }).eq('id', userId)
    }
    res.json({ success: true, streak: g.streak })
  } catch (err) {
    next(err)
  }
})
