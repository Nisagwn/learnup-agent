import type { Request, Response, NextFunction } from 'express'
import { kimlikAl, type Rol } from '../lib/yetki.js'
import { yetkisiz } from '../lib/hata.js'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** requireRole başarılıysa doğrulanan rol. */
      rol?: Rol
      /** Öğretmen onay durumu (yalnız role='teacher' için anlamlı). */
      onayli?: boolean
      /** Öğretmenin sınıf kodu — sınıf-kapsamlı sorguların çıpası. */
      classCode?: string | null
    }
  }
}

/**
 * ROL KAPISI — `requireAuth`'tan SONRA mount edilir.
 *
 * Rol `profiles`'tan (önbellekli) okunur, JWT'den DEĞİL — gerekçe lib/yetki.ts başında.
 * Öğretmen için `is_approved` de ŞARTTIR: onayı iptal edilen öğretmen bir sonraki
 * istekte (en geç 60sn) dışarıda kalır.
 *
 * ⚠️ ADMİN, ÖĞRETMEN UÇLARINDAN GEÇMEZ. Öğretmen uçları sınıfı `req.userId`'den
 * türetiyor; admin oraya girseydi hata yerine SESSİZCE BOŞ SINIF dönerdi — sessiz
 * yanlış, gürültülü hatadan kötüdür. İki yüzey kesin ayrı kalır.
 */
export function requireRole(...roller: Rol[]) {
  return async function rolKapisi(req: Request, _res: Response, next: NextFunction): Promise<void> {
    try {
      // requireAuth zinciri doğru kurulduysa buraya userId'siz gelinmez; savunma amaçlı.
      if (!req.userId) throw yetkisiz('yetkisiz', 'Kimlik doğrulanmadı.')

      const kimlik = await kimlikAl(req.userId)

      if (!roller.includes(kimlik.role)) {
        throw yetkisiz('rol_yetersiz', 'Bu alana erişim yetkiniz yok.')
      }
      if (kimlik.role === 'teacher' && !kimlik.isApproved) {
        throw yetkisiz('ogretmen_onaysiz', 'Öğretmen hesabınız henüz onaylanmadı.')
      }

      req.rol = kimlik.role
      req.onayli = kimlik.isApproved
      req.classCode = kimlik.classCode
      next()
    } catch (err) {
      next(err)
    }
  }
}
