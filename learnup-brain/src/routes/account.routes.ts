import { Router } from 'express'
import { supabase } from '../clients/supabase.js'
import { tumOturumlariIptalEt } from '../lib/oturum.js'

/** Hesap işlemleri — KVKK hesap silme. (Edge: delete-account) */
export const accountRouter = Router()

// POST /api/account/delete — auth kullanıcısını siler; tüm veri ON DELETE CASCADE ile gider.
accountRouter.post('/delete', async (req, res, next) => {
  try {
    const userId = req.userId!
    const { error } = await supabase.auth.admin.deleteUser(userId)
    // error.message DIŞARI VERİLMEZ (middleware/error.ts kararı): Postgres/PostgREST
    // hataları tablo ve kolon adı taşır → şema keşfine davetiye. Servis service-role ile
    // çalıştığı ve RLS baypas edildiği için bu doğrudan saldırı yüzeyini genişletir.
    if (error) throw error
    // Silinen hesabın oturum defteri de kapanır. Erişimi kesen şey bu DEĞİL (kullanıcı
    // artık yok, JWKS doğrulaması geçse bile profil okuması 403 verir) — ama silinmiş bir
    // hesabın cihazlarının Redis'te TTL boyunca "aktif" durması, defteri yalancı yapardı.
    await tumOturumlariIptalEt(userId)
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})
