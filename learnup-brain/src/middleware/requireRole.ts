import type { Request, Response, NextFunction } from 'express'
import { kimlikAl, type Rol } from '../lib/yetki.js'
import { bulunamadi, gecersizIstek, yetkisiz } from '../lib/hata.js'
import { logger } from '../utils/logger.js'

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
      /**
       * SINIF KAPSAMI (0025) — /teacher/* uçlarının TEK çıpası.
       *
       * Öğretmende kendi id'si, yöneticide ?ogretmenId ile seçilen öğretmen.
       * teacher.routes.ts içinde `req.userId` KULLANILMAZ; kullanılırsa yönetici
       * kendi id'siyle boş sınıf görür ve hata mesajı çıkmaz (sessiz yanlış).
       */
      kapsamOgretmenId?: string
      /** Yönetici bir öğretmenin sınıfında ONUN ADINA mı çalışıyor? (denetim izi şart) */
      adminVekili?: boolean
    }
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * ROL KAPISI — `requireAuth`'tan SONRA mount edilir.
 *
 * Rol `profiles`'tan (önbellekli) okunur, JWT'den DEĞİL — gerekçe lib/yetki.ts başında.
 * Öğretmen için `is_approved` de ŞARTTIR: onayı iptal edilen öğretmen bir sonraki
 * istekte (en geç 60sn) dışarıda kalır.
 *
 * ⚠️ ÖĞRETMEN UÇLARI BU KAPIYI KULLANMAZ — `requireOgretmenKapsami` kullanır (aşağıda).
 * Gerekçe orada: yönetici artık sınıf yüzeyine girebiliyor ama kapsamı AÇIKÇA seçmek
 * zorunda; seçmeden girerse hata alır, boş sınıf DEĞİL.
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

/**
 * SINIF KAPSAMI KAPISI — /teacher/* uçlarının tek girişi (0025).
 *
 * Üç hâl:
 *   · role='teacher'  → kapsam kendi id'si. Onaysız öğretmen yine dışarıda (0016 çizgisi).
 *   · role='admin' + ?ogretmenId → kapsam O ÖĞRETMEN. `adminVekili=true` işaretlenir;
 *     yazan uçlar bu bayrağı görünce denetim defterine "onun adına" yazmak ZORUNDA.
 *   · role='admin', parametre yok → 400. Yönetici hangi sınıfa baktığını SÖYLEMEK zorunda.
 *
 * ⚠️ PARAMETRESİZ YÖNETİCİ NEDEN HATA ALIYOR: kapsamı sessizce yöneticinin kendi
 * id'sine düşürseydik her sorgu boş küme dönerdi — panel "sınıf boş" derdi. Bu, eski
 * requireRole('teacher') yorumunun uyardığı tam olarak o sessiz yanlıştır. Kapsam
 * belirsizse istek reddedilir.
 *
 * ⚠️ SAHİPLİK BU KAPIDA ÇÖZÜLMEZ. Öğrenci parametresi alan uçlar hâlâ
 * `assertTeacherOwnsStudent(kapsam, studentId)` çağırmak zorunda: kapsam "hangi
 * öğretmenin gözüyle" sorusunu yanıtlar, "bu öğrenci onun mu" sorusunu değil.
 */
export async function requireOgretmenKapsami(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.userId) throw yetkisiz('yetkisiz', 'Kimlik doğrulanmadı.')

    const kimlik = await kimlikAl(req.userId)

    if (kimlik.role === 'teacher') {
      if (!kimlik.isApproved) {
        throw yetkisiz('ogretmen_onaysiz', 'Öğretmen hesabınız henüz onaylanmadı.')
      }
      req.rol = 'teacher'
      req.onayli = true
      req.classCode = kimlik.classCode
      req.kapsamOgretmenId = req.userId
      req.adminVekili = false
      next()
      return
    }

    if (kimlik.role !== 'admin') {
      throw yetkisiz('rol_yetersiz', 'Bu alana erişim yetkiniz yok.')
    }

    // ── Yönetici: kapsamı AÇIKÇA seçmeli ──
    const ham = req.query.ogretmenId ?? req.headers['x-ogretmen-id']
    const ogretmenId = typeof ham === 'string' ? ham.trim() : ''
    if (!ogretmenId) {
      throw gecersizIstek(
        'ogretmen_secilmedi',
        'Hangi öğretmenin sınıfına baktığını belirtmelisin (ogretmenId).',
      )
    }
    // Biçim kontrolü ÖNCE: uuid olmayan bir değer `kimlikAl`'da 500'e dönüşürdü.
    if (!UUID.test(ogretmenId)) {
      throw gecersizIstek('gecersiz_ogretmen', '`ogretmenId` bir uuid olmalı.')
    }

    const hedef = await kimlikAl(ogretmenId).catch(() => null)
    if (!hedef || hedef.role !== 'teacher') {
      // 404 — admin-yonetim.routes.ts'teki sınıf atama ucuyla AYNI kod ve aynı biçim:
      // yönetici için "yok" ile "öğretmen değil" pratikte tek arıza, iki farklı mesaj
      // vermek paneli gereksiz karmaşıklaştırır.
      logger.warn({ adminId: req.userId, ogretmenId }, 'yönetici öğretmen olmayan kapsam istedi')
      throw bulunamadi('ogretmen_bulunamadi', 'Öğretmen bulunamadı.')
    }

    req.rol = 'admin'
    req.onayli = hedef.isApproved
    req.classCode = hedef.classCode
    req.kapsamOgretmenId = ogretmenId
    req.adminVekili = true
    next()
  } catch (err) {
    next(err)
  }
}
