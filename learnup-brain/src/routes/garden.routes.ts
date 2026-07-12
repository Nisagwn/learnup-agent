import { Router } from 'express'
import { supabase } from '../clients/supabase.js'
import { getCatalogItem, kindForItem } from '../lib/market-catalog.js'

/** Bahçe — satın al / dik / taşı / sök. (Edge: purchase-garden-item, plant-seed, move-plant, remove-plant) */
export const gardenRouter = Router()

// POST /api/garden/purchase — coin düş + envantere +1 (otoriter fiyat/kilit kontrolü).
gardenRouter.post('/purchase', async (req, res, next) => {
  try {
    const userId = req.userId!
    const { itemId } = req.body ?? {}
    if (!itemId) {
      res.status(400).json({ error: 'itemId gerekli.' })
      return
    }
    const item = getCatalogItem(String(itemId))
    if (!item) {
      res.status(400).json({ error: 'Ürün bulunamadı.' })
      return
    }
    const { data: profile } = await supabase
      .from('profiles')
      .select('gamification, unlocked_badges')
      .eq('id', userId)
      .single()
    const userData: any = profile || {}

    // Rozet kilidi
    if (item.unlockBadge) {
      const owned = Object.keys(userData.unlocked_badges || {})
      if (!owned.includes(item.unlockBadge)) {
        res.status(403).json({ error: 'Bu ürün kilitli.' })
        return
      }
    }

    const g = { ...(userData.gamification || {}) }
    const coins = Number(g.coins) || 0
    if (coins < item.price) {
      res.status(400).json({ error: 'Yetersiz coin.' })
      return
    }
    g.coins = coins - item.price
    const { error: profErr } = await supabase.from('profiles').update({ gamification: g }).eq('id', userId)
    if (profErr) {
      res.status(500).json({ error: profErr.message })
      return
    }

    // Envanter: +1
    const { data: invRow } = await supabase
      .from('inventory')
      .select('count')
      .eq('user_id', userId)
      .eq('item_id', String(itemId))
      .maybeSingle()
    const newCount = (Number(invRow?.count) || 0) + 1
    const { error: invErr } = await supabase.from('inventory').upsert(
      { user_id: userId, item_id: String(itemId), kind: item.kind, count: newCount },
      { onConflict: 'user_id,item_id' },
    )
    if (invErr) {
      res.status(500).json({ error: invErr.message })
      return
    }

    res.json({ coins: g.coins, itemId: String(itemId), newCount })
  } catch (err) {
    next(err)
  }
})

// POST /api/garden/plant — envanterden -1, bahçeye 'seed' evresinde ekle.
gardenRouter.post('/plant', async (req, res, next) => {
  try {
    const userId = req.userId!
    const { itemId, x = null, y = null } = req.body ?? {}
    if (!itemId) {
      res.status(400).json({ error: 'itemId gerekli.' })
      return
    }
    const { data: invRow } = await supabase
      .from('inventory')
      .select('count')
      .eq('user_id', userId)
      .eq('item_id', String(itemId))
      .maybeSingle()
    const count = Number(invRow?.count) || 0
    if (count < 1) {
      res.status(400).json({ error: 'Envanterde bu üründen yok.' })
      return
    }
    const { error: invErr } = await supabase
      .from('inventory')
      .update({ count: count - 1 })
      .eq('user_id', userId)
      .eq('item_id', String(itemId))
    if (invErr) {
      res.status(500).json({ error: invErr.message })
      return
    }

    const row: any = { user_id: userId, item_id: String(itemId), stage: 'seed', status: 'healthy' }
    if (x != null) row.x = Number(x)
    if (y != null) row.y = Number(y)

    const { data: planted, error: gErr } = await supabase.from('garden').insert(row).select('id').single()
    if (gErr) {
      res.status(500).json({ error: gErr.message })
      return
    }
    res.json({ plantId: planted?.id, id: planted?.id })
  } catch (err) {
    next(err)
  }
})

// POST /api/garden/move — bitki konumunu (ve ölçeğini) güncelle; yalnız kendi satırı.
gardenRouter.post('/move', async (req, res, next) => {
  try {
    const userId = req.userId!
    const { plantId, x = null, y = null, scale = null } = req.body ?? {}
    if (!plantId) {
      res.status(400).json({ error: 'plantId gerekli.' })
      return
    }
    const patch: any = {}
    if (x != null) patch.x = Number(x)
    if (y != null) patch.y = Number(y)
    if (typeof scale === 'number') patch.scale = scale
    if (Object.keys(patch).length === 0) {
      res.status(400).json({ error: 'Güncellenecek alan yok.' })
      return
    }
    const { data: updated, error } = await supabase
      .from('garden')
      .update(patch)
      .eq('id', plantId)
      .eq('user_id', userId)
      .select('id')
    if (error) {
      res.status(500).json({ error: error.message })
      return
    }
    if (!updated || updated.length === 0) {
      res.status(404).json({ error: 'Bitki bulunamadı.' })
      return
    }
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

// POST /api/garden/remove — bitkiyi sök: satırı sil + ürünü envantere iade (+1).
gardenRouter.post('/remove', async (req, res, next) => {
  try {
    const userId = req.userId!
    const { plantId } = req.body ?? {}
    if (!plantId) {
      res.status(400).json({ error: 'plantId gerekli.' })
      return
    }
    const { data: plant } = await supabase
      .from('garden')
      .select('id, item_id')
      .eq('id', plantId)
      .eq('user_id', userId)
      .maybeSingle()
    if (!plant) {
      res.status(404).json({ error: 'Bitki bulunamadı.' })
      return
    }
    const { error: delErr } = await supabase.from('garden').delete().eq('id', plantId).eq('user_id', userId)
    if (delErr) {
      res.status(500).json({ error: delErr.message })
      return
    }

    const returnedItemId: string | null = plant.item_id || null
    let newCount: number | undefined
    if (returnedItemId) {
      const { data: invRow } = await supabase
        .from('inventory')
        .select('count')
        .eq('user_id', userId)
        .eq('item_id', returnedItemId)
        .maybeSingle()
      newCount = (Number(invRow?.count) || 0) + 1
      const { error: invErr } = await supabase.from('inventory').upsert(
        { user_id: userId, item_id: returnedItemId, kind: kindForItem(returnedItemId), count: newCount },
        { onConflict: 'user_id,item_id' },
      )
      if (invErr) {
        res.status(500).json({ error: invErr.message })
        return
      }
    }
    res.json({ returnedItemId, newCount })
  } catch (err) {
    next(err)
  }
})
