/**
 * Market kataloğu İSTEMCİ AYNASI — yalnız AD/GÖRSEL eşlemesi.
 * FİYAT/KİLİT OTORİTESİ SUNUCUDADIR: GET /garden `catalog` alanı gerçek fiyatları
 * verir; satın alma `satin_al` RPC'sinde tekrar doğrulanır. Buradaki hiçbir sayı
 * para birimi değildir.
 */

export type BitkiTuru =
  | 'sogut' | 'akca_agac' | 'mavi_cam' | 'egri_agac'
  | 'dev_agac' | 'burgu' | 'isik_agaci' | 'parilti'

export const AGAC_ADLARI: Record<BitkiTuru, string> = {
  sogut: 'Söğüt',
  akca_agac: 'Akçaağaç',
  mavi_cam: 'Mavi Çam',
  egri_agac: 'Eğri Ağaç',
  dev_agac: 'Dev Ağaç',
  burgu: 'Burgu Ağacı',
  isik_agaci: 'Işık Ağacı',
  parilti: 'Parıltı',
}

export const NADIRLIK: Record<string, { ad: string; renk: string }> = {
  common: { ad: 'yaygın', renk: '#94A3B8' },
  uncommon: { ad: 'az bulunur', renk: '#34D399' },
  rare: { ad: 'nadir', renk: '#38BDF8' },
  epic: { ad: 'destansı', renk: '#A78BFA' },
  legendary: { ad: 'efsanevi', renk: '#FBBF24' },
}

const DEKOR_ADLARI: Record<string, string> = {
  decor_mushroom_red_lg: 'Kırmızı Mantar (büyük)',
  decor_mushroom_red_md: 'Kırmızı Mantar',
  decor_mushroom_red_sm: 'Kırmızı Mantar (küçük)',
  decor_mushroom_chanterelle_lg: 'Sarı Mantar (büyük)',
  decor_mushroom_chanterelle_md: 'Sarı Mantar',
  decor_mushroom_chanterelle_sm: 'Sarı Mantar (küçük)',
  decor_mushroom_beige: 'Bej Mantar',
  decor_idol_deer: 'Geyik Totemi',
  decor_idol_human: 'İnsan Totemi',
  decor_idol_wolf: 'Kurt Totemi',
  decor_idol_dragon: 'Ejder Totemi',
  decor_gazebo_v1: 'Kameriye',
  decor_gazebo_v2: 'Büyük Kameriye',
  special_ent_male: 'Ent (erkek)',
  special_ent_female: 'Ent (dişi)',
}

/** item_id → görünen ad. `X_seed` → "X Tohumu", `X_mature` → "X (yetişkin)". */
export function itemAdi(itemId: string): string {
  if (itemId.endsWith('_seed')) {
    const tur = itemId.slice(0, -5) as BitkiTuru
    return `${AGAC_ADLARI[tur] ?? tur} Tohumu`
  }
  if (itemId.endsWith('_mature')) {
    const tur = itemId.slice(0, -7) as BitkiTuru
    return `${AGAC_ADLARI[tur] ?? tur} (yetişkin)`
  }
  return DEKOR_ADLARI[itemId] ?? itemId
}

/** item_id → 3D sahnedeki bitki türü ve evre. Dekorlar kendi türleriyle döner. */
export function itemModeli(itemId: string): { tur: string; evre: 'fide' | 'olgun' } {
  if (itemId.endsWith('_seed')) return { tur: itemId.slice(0, -5), evre: 'fide' }
  if (itemId.endsWith('_mature')) return { tur: itemId.slice(0, -7), evre: 'olgun' }
  return { tur: itemId, evre: 'olgun' }
}

export const TUM_AGACLAR = Object.keys(AGAC_ADLARI) as BitkiTuru[]
