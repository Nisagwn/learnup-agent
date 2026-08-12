import type { Request, Response, NextFunction } from 'express'
import { oturumDokun, oturumDurumu } from '../lib/oturum.js'
import { logger } from '../utils/logger.js'

/**
 * OTURUM KAPISI — `requireAuth`'tan HEMEN SONRA, askı kapısından ÖNCE.
 *
 * İmzası geçerli ama SONLANDIRILMIŞ bir token'ı burada durdururuz. Durumsuz JWT'de
 * "çıkış yap" sunucu için bir olay değildir — istemci token'ı unutur, token yaşamaya devam
 * eder. Çalınmış token, kaybolan telefon, atılan öğretmen: hepsinin cevabı bu kapıdır.
 *
 * ⚠️ NEDEN ASKI KAPISINDAN ÖNCE: iptal kontrolü tek bir Redis okumasıdır; askı kapısı
 * (`requireAktifHesap` → `kimlikAl`) soğuk önbellekte DB'ye gider. Sonlandırılmış oturumun
 * profil sorgusu ödetmesi için bir sebep yok.
 *
 * ⚠️ FAIL-OPEN — bilinçli. Oturum deposu yapılandırılmamışsa ya da erişilemiyorsa istek
 * salt-JWT ile GEÇER (bkz. clients/redis.ts `redisSessionTry`). Alternatifi, Redis
 * arızasında bütün API'yi 401'e düşürmekti: hız katmanının arızasını hakikat katmanının
 * arızasına çevirmek. Aynı karar rateLimit.ts'te `passOnStoreError` olarak zaten verilmiş.
 * Kaybedilen şey iptal penceresidir; kimlik doğrulaması yerinde durur.
 */
export async function oturumKapisi(req: Request, res: Response, next: NextFunction): Promise<void> {
  const bilgi = req.oturum
  // Zincir doğru kurulduysa buraya `oturum`suz gelinmez; savunma amaçlı.
  if (!bilgi) {
    next()
    return
  }

  try {
    if ((await oturumDurumu(bilgi)) === 'iptal') {
      // Sonlandırılmış token'la ısrar bir sinyaldir; sunucuda görünür kalsın.
      logger.warn({ userId: bilgi.userId, sid: bilgi.sid, path: req.path }, 'sonlandırılmış oturum istek denedi')
      res.status(401).json({
        error: 'oturum_sonlandirildi',
        message: 'Bu oturum sonlandırıldı. Lütfen tekrar giriş yap.',
      })
      return
    }
  } catch (err) {
    // `oturumDurumu` kendi içinde yutar; buraya düşmek beklenmez. Düşerse de kapı
    // erişimi kesmez — fail-open sözleşmesi burada da geçerli.
    logger.debug({ err }, 'oturum kapısı atlandı')
  }

  oturumDokun({
    sid: bilgi.sid,
    userId: bilgi.userId,
    // `trust proxy` ayarlı (app.ts) → req.ip nginx'in değil, gerçek istemcinin adresi.
    ip: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
  })
  next()
}
