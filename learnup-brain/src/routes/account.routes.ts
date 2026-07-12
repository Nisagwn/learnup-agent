import { Router } from 'express'
import { supabase } from '../clients/supabase.js'

/** Hesap işlemleri — KVKK hesap silme. (Edge: delete-account) */
export const accountRouter = Router()

// POST /api/account/delete — auth kullanıcısını siler; tüm veri ON DELETE CASCADE ile gider.
accountRouter.post('/delete', async (req, res, next) => {
  try {
    const userId = req.userId!
    const { error } = await supabase.auth.admin.deleteUser(userId)
    if (error) {
      res.status(500).json({ error: error.message || 'Hesap silinemedi.' })
      return
    }
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})
