import { Router } from 'express'
import { z } from 'zod'
import { supabase } from '../clients/supabase.js'
import { kimlikAl } from '../lib/yetki.js'
import { HttpHatasi, gecersizIstek } from '../lib/hata.js'
import { logger } from '../utils/logger.js'

/**
 * ÖĞRETMEN BAŞVURUSU — ÖĞRENCİ TARAFI (self-servis).
 *
 * ⚠️ ARTIK KAYIT AKIŞININ PARÇASI DEĞİL (kullanıcı kararı 2026-07-24): öğretmenler
 * kayıt formunda "Öğretmenim" seçerek ANINDA öğretmen açılır (handle_new_user 0024);
 * yönetici onayı kaldırıldı ve giriş ekranı bu ucu ÇAĞIRMIYOR.
 *
 * Uç KASTEN duruyor: hâlihazırda öğrenci olan bir hesabın sonradan öğretmenliğe
 * geçmek istemesi için tek yol budur (kayıt tekrarlanamaz — e-posta zaten kayıtlı).
 * Bekleyen eski başvurular da yönetici panelinde onaylanabilir durumda kalır.
 *
 * Bu uç YALNIZ `teacher_application_status='bekliyor'` durumunu yazar — ROL'e ASLA
 * dokunmaz. Rolü yönetici çevirir (POST /admin/kullanici/:id/rol), denetim izi +
 * önbellek düşürmesiyle.
 *
 * ⚠️ GÜVENLİK ÇİZGİSİ (0019): rol/is_approved istemciden YAZILAMAZ (kolon-GRANT).
 * teacher_application_status da whitelist DIŞINDA → yalnız service_role yazar. Bu uç
 * rolü istemciden okumaz/türetmez; hedef satır HER ZAMAN req.userId'dir, gövdeden
 * ASLA gelmez (sinif.routes.ts:14 ile aynı sınır).
 *
 * MEKANİZMA KARARI: kayıt-anı meta bayrağı ("başvur" kutusunu raw_user_meta_data'dan
 * okumak) yerine KİMLİKLİ ÇAĞRI seçildi. Gerekçe: (1) test edilebilir; (2) mevcut
 * öğrencileri de kapsar (sonradan başvurabilir); (3) istemci-yazılabilir metadata'ya
 * bağlı değil (dilek≠sözleşme). Meta yolu güvenli olurdu (yalnız "bekliyor" yazardı,
 * rolü değil) ama bu üç nedenden ötürü uç tercih edildi.
 *
 * LLM çağırmaz → standardLimiter yeterli (app.ts'te mount edilir).
 */
export const ogretmenBasvuruRouter = Router()

const BasvuruGovdesi = z.object({
  // Kısa gerekçe/okul notu — yöneticinin triage'ına yardımcı; zorunlu DEĞİL.
  not: z.string().trim().max(500).optional(),
})

/** GET /api/v1/ogretmen-basvuru — kullanıcının KENDİ başvuru durumu. */
ogretmenBasvuruRouter.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('role, teacher_application_status, teacher_application_at')
      .eq('id', req.userId!)
      .maybeSingle()
    if (error) throw new HttpHatasi(500, 'basvuru_okunamadi', 'Başvuru durumu okunamadı.')
    res.json({
      role: (data?.role as string | null) ?? 'student',
      durum: (data?.teacher_application_status as string | null) ?? null,
      tarih: (data?.teacher_application_at as string | null) ?? null,
    })
  } catch (err) {
    next(err)
  }
})

/** POST /api/v1/ogretmen-basvuru — kimlikli kullanıcı YALNIZ kendi hesabı için başvurur. */
ogretmenBasvuruRouter.post('/', async (req, res, next) => {
  try {
    const userId = req.userId!
    const parsed = BasvuruGovdesi.safeParse(req.body ?? {})
    if (!parsed.success) {
      throw gecersizIstek('gecersiz_istek', 'Başvuru notu en fazla 500 karakter olabilir.')
    }

    // Rol profiles'tan (önbellekli) okunur — istemciden ASLA türetilmez (M§9).
    const kimlik = await kimlikAl(userId)
    if (kimlik.role === 'teacher') {
      throw gecersizIstek('zaten_ogretmen', 'Zaten öğretmen hesabınız var; başvuru gerekmez.')
    }
    if (kimlik.role === 'admin') {
      throw gecersizIstek('yonetici_basvuramaz', 'Yönetici hesabı öğretmen başvurusu yapamaz.')
    }

    // Tekrarlı başvuru İDEMPOTENT: zaten bekliyorsa yeni satır/gürültü yok, nazik onay.
    const { data: mevcut, error: okuHata } = await supabase
      .from('profiles')
      .select('teacher_application_status')
      .eq('id', userId)
      .maybeSingle()
    if (okuHata) throw new HttpHatasi(500, 'basvuru_okunamadi', 'Başvuru durumu okunamadı.')

    const oncekiDurum = (mevcut?.teacher_application_status as string | null) ?? null
    if (oncekiDurum === 'bekliyor') {
      res.json({ basvuruAlindi: true, yeni: false, durum: 'bekliyor' })
      return
    }

    // ⚠️ YAMA'DA role/is_approved YOK — başvuru yalnız "bekliyor" durumunu yazar.
    // `.eq('role','student')` yarış koruması: rol arada değiştiyse (admin terfi
    // ettirdiyse) yazma sessizce 0 satır etkiler, başvuru geri açılmaz.
    const { error: yazHata } = await supabase
      .from('profiles')
      .update({
        teacher_application_status: 'bekliyor',
        teacher_application_at: new Date().toISOString(),
        teacher_application_note: parsed.data.not ?? null,
      })
      .eq('id', userId)
      .eq('role', 'student')
    if (yazHata) throw new HttpHatasi(500, 'basvuru_yazilamadi', 'Başvuru kaydedilemedi.')

    logger.info({ userId }, 'öğretmen başvurusu alındı')
    res.json({ basvuruAlindi: true, yeni: true, durum: 'bekliyor' })
  } catch (err) {
    next(err)
  }
})
