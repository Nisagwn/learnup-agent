import { supabase } from '../clients/supabase.js'
import { logger } from '../utils/logger.js'
import { esikleriAyarla, esikKaynagiDB, OZGUNLUK_TABAN } from '../utils/benzerlik.js'

/**
 * ÖZGÜNLÜK EŞİKLERİ — DB tarafı (0025).
 *
 * Eşikler `utils/benzerlik.ts`te sabitti; yeni bir ölçüm geldiğinde değiştirmek deploy
 * gerektiriyordu. Artık `ozgunluk_esikleri` tablosunda ve panelden düzenlenebilir.
 *
 * ⚠️ KOD TABLOSU ÖLMEDİ, FALLBACK OLDU. Tablo boşsa ya da DB'ye ulaşılamıyorsa
 * `esikleriAyarla(null)` çağrılır ve üretim koddaki değerlerle sürer. Eşiksiz üretim
 * = bariyersiz üretim; bir ops arızasının kalite kapısını açması KABUL EDİLEMEZ.
 *
 * ⚠️ 60sn TTL: eşik değişimi seyrek bir iştir, her aday sorusunda DB'ye gitmek anlamsız.
 * Panelden yapılan yazma `zorla=true` ile anında tazeler — yönetici değişimi hemen görür.
 */
const TTL_MS = 60_000

let sonTazeleme = 0
let ucusta: Promise<boolean> | null = null

/**
 * Eşikleri DB'den tazeler ve benzerlik katmanına yazar.
 * Dönüş: eşikler DB'den mi geliyor (false → kod tablosu geçerli).
 */
export async function esikleriTazele(zorla = false): Promise<boolean> {
  if (!zorla && Date.now() - sonTazeleme < TTL_MS) return esikKaynagiDB()
  // Eşzamanlı üretim çağrıları aynı anda tazelemeye kalkarsa tek sorguda buluşsunlar.
  if (ucusta) return ucusta

  ucusta = (async () => {
    try {
      const { data, error } = await supabase.from('ozgunluk_esikleri').select('subject, esik')
      if (error) throw error
      const satirlar = (data ?? []) as Array<{ subject: string; esik: number | string }>
      if (!satirlar.length) {
        // Tablo BOŞ ≠ "eşik yok". 0025 uygulanmamış olabilir; kod tablosu devralır.
        esikleriAyarla(null)
      } else {
        const tablo: Record<string, number> = {}
        for (const s of satirlar) {
          const n = Number(s.esik)
          // Bozuk satır sessizce ATLANIR ama sessizce KABUL EDİLMEZ: geçersiz bir eşik
          // 0'a düşseydi o dersin bariyeri tamamen açılırdı.
          if (Number.isFinite(n) && n > 0 && n < 1) tablo[s.subject] = n
          else logger.warn({ subject: s.subject, esik: s.esik }, 'geçersiz özgünlük eşiği atlandı')
        }
        esikleriAyarla(Object.keys(tablo).length ? tablo : null)
      }
      sonTazeleme = Date.now()
      return esikKaynagiDB()
    } catch (err) {
      logger.error({ err }, 'özgünlük eşikleri okunamadı — KOD tablosuna düşülüyor')
      esikleriAyarla(null)
      // sonTazeleme GÜNCELLENMEZ: arıza geçiciyse bir sonraki çağrı yeniden dener.
      return false
    } finally {
      ucusta = null
    }
  })()

  return ucusta
}

/** Tek dersin eşiğini yazar. Dönüş: önceki değer (DB'de satırı yoksa null). */
export async function esikYaz(
  subject: string,
  esik: number,
  adminId: string,
): Promise<number | null> {
  const { data: mevcut } = await supabase
    .from('ozgunluk_esikleri').select('esik').eq('subject', subject).maybeSingle()
  const onceki = mevcut ? Number((mevcut as { esik: number | string }).esik) : null

  const { error } = await supabase
    .from('ozgunluk_esikleri')
    .upsert({ subject, esik, guncelleyen: adminId, updated_at: new Date().toISOString() })
  if (error) throw error

  // Yazdıktan sonra ZORLA tazele: yönetici değişimi 60 saniye beklemeden görmeli.
  await esikleriTazele(true)
  return onceki
}

/** Kod tablosundaki taban — panel "bu ders taban eşikte" diyebilmek için okur. */
export const tabanEsik = OZGUNLUK_TABAN
