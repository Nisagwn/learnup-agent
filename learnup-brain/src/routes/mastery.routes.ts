import { Router } from 'express'
import { masteryNodes, rontgenGovdesi } from '../lib/rontgen.js'

/**
 * GET /api/v1/mastery          — öğrencinin bilişsel haritası (Isı Haritası'nın kaynağı).
 * GET /api/v1/mastery/rontgen  — Analiz ekranının TEK istekte tam veri seti:
 *                                nodes + müfredat kapsaması + 84 günlük trend +
 *                                zorluk kırılımı + tuzak analizi.
 *
 * NEDEN BU UÇLAR VAR (istemci user_mastery'yi kendi okuyamaz mı?):
 * Okuyabilir — RLS izin verir (0005_agents.sql:148) — ama HAM `mastery` TASARIM GEREĞİ BAYATTIR.
 * Çürüme okuma anında hesaplanır (`effectiveMastery`, lib/mastery.ts:34). Formülü frontend'e
 * kopyalamak BKT mantığını iki yerde yaşatır ve sabitler (7·(1+stability)) ayrıştığı an
 * öğrenciye yanlış harita gösterir. Çürüme-farkındalıklı `weak_kazanimlar` RPC'si de zaten
 * `authenticated`'tan geri alınmış (0005:99) → doğru veri kasten backend'de.
 * `distractor_traps` RPC'si de aynı kapıdan geçer (yalnız service_role çalıştırabilir).
 *
 * Hesap gövdesi lib/rontgen.ts'te — öğretmenin öğrenci röntgeni (GET /teacher/ogrenci/:id/rontgen)
 * AYNI kodu çağırır. Buradaki iki uç `teshisGoster` bayrağını VERMEZ: öğrenciye teşhis
 * taksonomisi değil, yalnız açık yanılgı SAYISI gider (persona/ortak.ts TESHIS_DILI_YOK).
 *
 * Salt-okunur ve LLM ÇAĞIRMAZ (standardLimiter yeterli, llmLimiter değil).
 */
export const masteryRouter = Router()

masteryRouter.get('/', async (req, res, next) => {
  try {
    const nodes = await masteryNodes(req.userId!, new Date())
    res.json({ nodes, total: nodes.length })
  } catch (err) {
    next(err)
  }
})

masteryRouter.get('/rontgen', async (req, res, next) => {
  try {
    res.json(await rontgenGovdesi(req.userId!))
  } catch (err) {
    next(err)
  }
})
