/**
 * YÖNETİM PANELİ ÖNBELLEĞİ — ağır özet sorguları için 10 dakikalık modül önbelleği.
 *
 * ⚠️ NEDEN AYRI DOSYA: önbellek admin.routes.ts'in içindeydi ve orada kaldığı sürece
 * DÜŞÜRÜLEMİYORDU. Havuz moderasyonu (admin-havuz.routes.ts) bir soruyu karantinaya
 * aldığında /havuz özeti 10 dakika boyunca eski sayıyı göstermeye devam ediyordu:
 * yönetici işlemi yapar, panelde hiçbir şey değişmez, "çalışmadı" sanır. Yazan her
 * ucun düşürebilmesi için önbelleğin yazandan da okuyandan da bağımsız olması gerekti.
 *
 * ⚠️ ANAHTARSIZ ÖNBELLEK YALNIZ SİSTEM GENELİ VERİ İÇİN. Buraya kullanıcıya/sınıfa
 * özel hiçbir gövde konmaz — teacher.routes.ts:34'teki sızıntı gerekçesi aynen geçerli.
 */
const CACHE_MS = 10 * 60_000

type Kutu = { zaman: number; veri: unknown }
const cache = new Map<string, Kutu>()

/** Önbellekli üretici sarmalayıcı — `onbellekli('havuz', uret)()` biçiminde kullanılır. */
export function onbellekli<T>(anahtar: string, uret: () => Promise<T>): () => Promise<T> {
  return async () => {
    const k = cache.get(anahtar)
    if (k && Date.now() - k.zaman < CACHE_MS) return k.veri as T
    const veri = await uret()
    cache.set(anahtar, { zaman: Date.now(), veri })
    return veri
  }
}

/**
 * Önbelleği düşürür. Anahtar verilmezse HEPSİ düşer.
 * Dönüş: düşen anahtar sayısı — ops ucu bunu yanıtta gösterir (görünmez ops yok).
 */
export function onbellegiDus(anahtar?: string): number {
  if (anahtar) return cache.delete(anahtar) ? 1 : 0
  const n = cache.size
  cache.clear()
  return n
}
