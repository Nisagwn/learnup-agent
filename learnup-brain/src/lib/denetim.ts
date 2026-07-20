import { supabase } from '../clients/supabase.js'
import { logger } from '../utils/logger.js'

/**
 * YÖNETİM DENETİM DEFTERİ — migrations/0020_yonetim_denetim.sql
 *
 * ⚠️ NEDEN ATEŞLE-VE-UNUT DEĞİL: telemetri bir gözlemdir, kaybı zarar vermez
 * (lib/mastery.ts:103 kalıbı). Denetim izi öyle DEĞİLDİR — "bu hesabı kim yönetici
 * yaptı?" sorusunun tek cevabı burasıdır. Bu yüzden `await` edilir.
 *
 * ⚠️ AMA EYLEMİ DÜŞÜRMEZ: rol değişimi zaten yazıldıktan sonra defter yazılamazsa,
 * geri almak sistemi daha tutarsız hâle getirir (rol değişti, öğrenciler serbest
 * bırakıldı, önbellekler düştü). Bunun yerine `false` döner ve çağıran bunu
 * YANITTA GÖSTERİR — yönetici izin tutulmadığını EKRANDA görür.
 */

export type DenetimEylemi = 'ogretmen_onay' | 'rol_degis' | 'sinif_ata' | 'gorev_yeniden'

export type DenetimKaydi = {
  adminId: string
  eylem: DenetimEylemi
  hedefId?: string | null
  hedefTur?: 'kullanici' | 'gorev' | null
  detay?: Record<string, unknown>
}

export async function denetimYaz(kayit: DenetimKaydi): Promise<boolean> {
  const { error } = await supabase.from('yonetim_denetim').insert({
    admin_id: kayit.adminId,
    eylem: kayit.eylem,
    hedef_id: kayit.hedefId ?? null,
    hedef_tur: kayit.hedefTur ?? null,
    detay: kayit.detay ?? {},
  })

  if (error) {
    // `error` seviyesi kasıtlı: bu bir uyarı değil, denetim zincirinin kopmasıdır.
    // Tablo yoksa (0020 uygulanmadıysa) da buraya düşer — mesaj o hâlde de doğru.
    logger.error({ err: error, ...kayit }, 'YÖNETİM DENETİMİ YAZILAMADI — eylem izsiz kaldı')
    return false
  }
  return true
}
