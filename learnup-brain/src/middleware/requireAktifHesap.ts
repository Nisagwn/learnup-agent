import type { Request, Response, NextFunction } from 'express'
import { kimlikAl } from '../lib/yetki.js'
import { yetkisiz } from '../lib/hata.js'
import { logger } from '../utils/logger.js'

/**
 * ASKI KAPISI — `requireAuth`'tan HEMEN SONRA, rol kapılarından ÖNCE.
 *
 * Askıya alınmış hesap (profiles.askiya_alindi, 0025) hiçbir /api/v1 ucuna giremez.
 *
 * ⚠️ NEDEN ROL KAPISINDA DEĞİL, AYRI MIDDLEWARE: `requireRole` yalnız iki yüzeyde
 * (öğretmen/yönetici) mount edilmiş. Askıyı oraya koymak, askıdaki bir öğrencinin
 * soru çözmeye, ödev göndermeye ve sohbet etmeye devam etmesi demekti — yani askının
 * hiçbir şey ifade etmemesi. Kapı, kimliğin doğrulandığı HER yola takılır.
 *
 * ⚠️ ROL MUAFİYETİ YOK. Askıdaki bir yönetici de dışarıda kalır; "son yönetici askıya
 * alınamaz" koruması UÇTA'dır (admin-yonetim.routes.ts), burada değil. Kapıda istisna
 * tanımak, kapının anlamını kapının kendisinden okunamaz hâle getirir.
 *
 * Maliyet SIFIRA YAKIN: `kimlikAl` zaten önbellekli (L1 süreç içi → L2 Redis → DB) ve
 * rol kapıları da aynı çağrıyı yapıyor — ikinci istek aynı isteğin içinde L1'den döner.
 */
export async function requireAktifHesap(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    // requireAuth zinciri doğru kurulduysa buraya userId'siz gelinmez; savunma amaçlı.
    if (!req.userId) throw yetkisiz('yetkisiz', 'Kimlik doğrulanmadı.')

    const kimlik = await kimlikAl(req.userId)
    if (kimlik.askidaMi) {
      // Askıdaki hesabın ısrarla denemesi bir sinyaldir; sunucuda görünür kalsın.
      logger.warn({ userId: req.userId, path: req.path }, 'askıdaki hesap istek denedi')
      throw yetkisiz(
        'hesap_askida',
        'Hesabın askıya alındı. Sebebini öğrenmek için okul yöneticinle görüş.',
      )
    }
    next()
  } catch (err) {
    next(err)
  }
}
