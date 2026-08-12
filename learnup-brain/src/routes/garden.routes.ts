import { Router } from 'express'
import { supabase } from '../clients/supabase.js'
import { getCatalogItem, kindForItem, katalogListesi } from '../lib/market-catalog.js'

/** Bahçe — satın al / dik / taşı / sök. (Edge: purchase-garden-item, plant-seed, move-plant, remove-plant) */
export const gardenRouter = Router()

/** GET /api/v1/garden — v2'nin bahçe okuma kapısı: coin + envanter + bitkiler + OTORİTER katalog.
 *  (Eski frontend tabloları RLS ile doğrudan okuyordu; v2 tek uçtan besleniyor.) */
gardenRouter.get('/', async (req, res, next) => {
  try {
    const userId = req.userId!
    const [prof, inv, plants] = await Promise.all([
      supabase.from('profiles').select('gamification, unlocked_badges').eq('id', userId).maybeSingle(),
      supabase.from('inventory').select('item_id, kind, count').eq('user_id', userId).gt('count', 0),
      supabase.from('garden').select('id, item_id, x, y, scale').eq('user_id', userId),
    ])
    const g = (prof.data?.gamification ?? {}) as { coins?: number }
    res.json({
      coins: Number(g.coins ?? 0),
      inventory: inv.data ?? [],
      plants: plants.data ?? [],
      catalog: katalogListesi(),
      // Rozet kilidi göstergesi için: sahip olunan rozet id'leri (yalnız anahtar listesi)
      badges: Object.keys((prof.data?.unlocked_badges as Record<string, unknown>) ?? {}),
    })
  } catch (err) {
    next(err)
  }
})

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
    // Rozet kilidi (fiyat/kind sunucudan — istemci yalnız itemId söyler)
    const { data: profile } = await supabase
      .from('profiles')
      .select('unlocked_badges')
      .eq('id', userId)
      .single()
    if (item.unlockBadge) {
      const owned = Object.keys((profile as any)?.unlocked_badges || {})
      if (!owned.includes(item.unlockBadge)) {
        res.status(403).json({ error: 'Bu ürün kilitli.' })
        return
      }
    }

    // ATOMİK: coin düşme + envanter artışı TEK transaction (migration 0011).
    // Eskiden oku→kontrol→yaz idi: aynı anda gelen iki istek de coins=100 okuyup ikisi de
    // geçiyordu → bir ürünün parasına iki ürün. Üstelik coin ÖNCE düşülüp eşya SONRA
    // ekleniyordu: arada hata olursa para gidiyor eşya gelmiyordu. RPC satırı `for update`
    // ile kilitler; yetersiz bakiyede exception → transaction geri sarılır, kısmi yazım YOK.
    const { data, error } = await supabase.rpc('satin_al', {
      p_user_id: userId,
      p_item_id: String(itemId),
      p_kind: item.kind,
      p_price: item.price,
    })
    if (error) {
      if (error.message.includes('yetersiz_coin')) {
        res.status(400).json({ error: 'Yetersiz coin.' })
        return
      }
      throw error
    }
    const row = (data as Array<{ coins: number; new_count: number }>)?.[0]
    res.json({ coins: row?.coins ?? 0, itemId: String(itemId), newCount: row?.new_count ?? 0 })
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
    // ATOMİK (0011): envanter -1 ve bahçeye ekleme TEK transaction.
    // Eskiden: count oku → 1 azalt → garden'a insert. İki eşzamanlı istek de count=1 okuyup
    // ikisi de 0 yazıyor ve ikisi de bitki ekiyordu → 1 tohumdan 2 bitki. Tersi de mümkündü:
    // insert patlarsa azaltma zaten yazılmış oluyordu → tohum yok olur, bitki de dikilmez.
    const { data, error } = await supabase.rpc('tohum_ek', {
      p_user_id: userId,
      p_item_id: String(itemId),
      p_x: x != null ? Number(x) : null,
      p_y: y != null ? Number(y) : null,
    })
    if (error) {
      if (error.message.includes('tohum_yok')) {
        res.status(400).json({ error: 'Envanterde bu üründen yok.' })
        return
      }
      throw error
    }
    const row = (data as Array<{ plant_id: string; remaining: number }>)?.[0]
    res.json({ plantId: row?.plant_id, id: row?.plant_id, remaining: row?.remaining ?? 0 })
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
    if (error) throw error   // error.message dışarı verilmez (şema keşfi)
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
    // ATOMİK (0011): bitkiyi sil + eşyayı envantere iade, TEK transaction.
    // Eskiden silme ÖNCE, iade SONRA yapılıyordu: iade adımı patlarsa (ya da süreç ölürse)
    // bitki gitmiş, eşya geri gelmemiş oluyordu. Telafi yazımı yoktu. Sahiplik kontrolü de
    // RPC'nin içinde (`where id = ... and user_id = ...`) — başkasının bitkisi silinemez.
    const { data, error } = await supabase.rpc('bitki_kaldir', {
      p_user_id: userId,
      p_plant_id: String(plantId),
    })
    if (error) {
      if (error.message.includes('bitki_yok')) {
        res.status(404).json({ error: 'Bitki bulunamadı.' })
        return
      }
      throw error
    }
    const row = (data as Array<{ item_id: string; new_count: number }>)?.[0]
    res.json({ returnedItemId: row?.item_id ?? null, newCount: row?.new_count })
  } catch (err) {
    next(err)
  }
})
