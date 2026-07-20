import { Router } from 'express'
import { supabase } from '../clients/supabase.js'
import { todayISO, getWeekId, ensureGamification, displayName, isStudent } from '../lib/gamification.js'

/** Oyunlaştırma — günlük durum / görev ödülü / seri dondurması.
 *  (Edge: ensure-daily-state, claim-quest-reward, use-streak-freeze) */
export const gamificationRouter = Router()

const MAX_FREEZES = 2

/** GET /api/v1/gamification/league — bu haftanın lig tablosu (kullanıcının tier'ı).
 *  İsimler lider tablosu İÇİN yazılıyor (displayName, league_entries.name) — sızıntı değil ürün. */
gamificationRouter.get('/league', async (req, res, next) => {
  try {
    const userId = req.userId!
    const weekId = getWeekId()
    const { data: benim } = await supabase
      .from('league_entries')
      .select('tier, weekly_xp')
      .eq('week_id', weekId)
      .eq('uid', userId)
      .maybeSingle()
    const tier = (benim?.tier as string) ?? 'bronze'
    const { data: tablo, error } = await supabase
      .from('league_entries')
      .select('uid, name, weekly_xp')
      .eq('week_id', weekId)
      .eq('tier', tier)
      .eq('role', 'student')
      .order('weekly_xp', { ascending: false })
      .limit(50)
    if (error) throw error
    const liste = tablo ?? []
    const benimIdx = liste.findIndex((r) => r.uid === userId)
    res.json({
      weekId,
      tier,
      top: liste.slice(0, 10).map((r, i) => ({
        rank: i + 1,
        name: r.name as string,
        weeklyXP: Number(r.weekly_xp ?? 0),
        ben: r.uid === userId,
      })),
      benimSira: benimIdx >= 0 ? benimIdx + 1 : null, // ilk 50'de değilse null → UI "50+"
      benimXP: Number(benim?.weekly_xp ?? 0),
      katilimci: liste.length,
    })
  } catch (err) {
    next(err)
  }
})

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

    // ATOMİK (0011): "oku → claimed mi? → xp += ödül → yaz" bir YARIŞ KOŞULUYDU.
    // Çift tık (ya da iki sekme) → iki istek de claimed:false okur, ikisi de geçer, ikisi de
    // ödül yazar → 2× XP. Şişen weeklyXP league_entries'e de gittiği için lider tablosu bozulur.
    // RPC profil satırını `for update` ile kilitler, ödülü İSTEMCİDEN değil profilin kendi
    // quest kaydından okur ve zaten alınmışsa hiçbir şey yazmaz (idempotent).
    const { data: rpcData, error: rpcErr } = await supabase.rpc('gorev_odulu_al', {
      p_user_id: userId,
      p_quest_id: String(questId),
    })
    if (rpcErr) {
      if (rpcErr.message.includes('gorev_yok')) {
        res.status(404).json({ error: 'Görev bulunamadı.' })
        return
      }
      if (rpcErr.message.includes('gorev_tamamlanmadi')) {
        res.status(400).json({ error: 'Görev tamamlanmadı.' })
        return
      }
      throw rpcErr
    }
    const sonuc = (rpcData as Array<{
      xp: number; weekly_xp: number; reward_xp: number; already_claimed: boolean
    }>)?.[0]
    if (sonuc?.already_claimed) {
      res.status(400).json({ error: 'Ödül zaten alındı.' })
      return
    }
    g.xp = sonuc?.xp ?? g.xp
    g.league.weeklyXP = sonuc?.weekly_xp ?? g.league.weeklyXP
    const quest = { rewardXP: sonuc?.reward_xp ?? 0 }

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
      // ⚠️ BURASI BEDAVA DONDURMA DAĞITIYORDU. Kural (gamification.ts, FREEZE_EARN_EVERY):
      // dondurma 7 GÜNLÜK SERİ ile HAK EDİLİR. Ama bu dal hiçbir koşul aramadan sayacı
      // artırıyordu → öğrenci uca istek atıp kendine 2 dondurma verip serisini sonsuza kadar
      // yaşatabiliyordu (hiç çalışmadan). Dondurma kazanımı, seri ilerlemesinin bir yan
      // ürünüdür (applyStreak); istemcinin talep edebileceği bir şey DEĞİL.
      res.status(403).json({
        error: 'dondurma_hak_edilir',
        message: 'Dondurma hakkı 7 günlük seri ile otomatik kazanılır; elle verilemez.',
      })
      return
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
