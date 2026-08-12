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

/**
 * KANONİK EYLEM LİSTESİ. DB'de CHECK yok (0020 kasıtlı bıraktı: yeni yetki eklemek
 * migration beklemesin) — sözleşmeyi bu union tutar, 0025 yorumu onun aynasıdır.
 */
export type DenetimEylemi =
  // ── 0020 ──
  | 'ogretmen_onay' | 'rol_degis' | 'sinif_ata' | 'gorev_yeniden'
  // ── 0025: hesap yaşam döngüsü ──
  | 'hesap_olustur' | 'profil_duzelt' | 'sifre_sifirla'
  | 'hesap_askiya' | 'hesap_geri_al' | 'basvuru_reddet'
  // ── 0025: havuz moderasyonu ──
  | 'soru_dogrulama' | 'soru_karantina' | 'soru_etiket' | 'uretim_tetik'
  // ── 0025: ops ──
  | 'esik_degis' | 'eval_tetik' | 'onbellek_dus' | 'gorev_iptal'
  // ── Oturum yönetimi: yöneticinin bir kullanıcıyı tüm cihazlarından atması ──
  | 'oturum_kapat'
  // ── 0025: vekil kapsam (yönetici, öğretmenin sınıfında ONUN ADINA) ──
  | 'ogretmen_adina_odev' | 'ogretmen_adina_ogrenci'

/**
 * `ogretmen` = eylem o öğretmenin sınıfında onun adına yapıldı (vekil kapsam).
 * `sistem`   = hedefi olmayan ops eylemi (önbellek, eval, eşik).
 */
export type DenetimHedefTuru = 'kullanici' | 'gorev' | 'ogretmen' | 'soru' | 'sistem'

export type DenetimKaydi = {
  adminId: string
  eylem: DenetimEylemi
  hedefId?: string | null
  hedefTur?: DenetimHedefTuru | null
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
