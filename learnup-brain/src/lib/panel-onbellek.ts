import { redisTry } from '../clients/redis.js'

/**
 * YÖNETİM PANELİ ÖNBELLEĞİ — ağır özet sorguları için 10 dakikalık ORTAK önbellek.
 *
 * ⚠️ NEDEN AYRI DOSYA: önbellek admin.routes.ts'in içindeydi ve orada kaldığı sürece
 * DÜŞÜRÜLEMİYORDU. Havuz moderasyonu (admin-havuz.routes.ts) bir soruyu karantinaya
 * aldığında /havuz özeti 10 dakika boyunca eski sayıyı göstermeye devam ediyordu:
 * yönetici işlemi yapar, panelde hiçbir şey değişmez, "çalışmadı" sanır. Yazan her
 * ucun düşürebilmesi için önbelleğin yazandan da okuyandan da bağımsız olması gerekti.
 *
 * ⚠️ NEDEN REDIS, SÜREÇ-İÇİ Map DEĞİL: yukarıdaki hata bir kez çözüldü ama çözüm TEK
 * NODE varsayıyordu. nginx artık brain ve brain2 arasında yük paylaştırıyor
 * (deploy/nginx/default.conf) ve süreç-içi bir Map'te `onbellegiDus()` YALNIZ İSTEĞİ
 * ALAN NODE'u temizler. Yönetici soruyu karantinaya alır (istek brain'e düşer), paneli
 * yeniler (istek brain2'ye düşer) → aynı hata geri gelir, üstelik ARALIKLI olarak:
 * bazen doğru, bazen eski. Teşhisi en zor arıza sınıfı budur.
 *
 * Önbelleği ortak depoya almak sorunu kaynağında bitirir — düşürme her node için geçerli
 * olur ve node sayısı arttıkça davranış değişmez.
 *
 * ⚠️ ANAHTARSIZ ÖNBELLEK YALNIZ SİSTEM GENELİ VERİ İÇİN. Buraya kullanıcıya/sınıfa
 * özel hiçbir gövde konmaz — teacher.routes.ts:34'teki sızıntı gerekçesi aynen geçerli.
 * Ortak depoya geçmek bu kuralı GEVŞETMEZ, sertleştirir: artık gövde node'lar arasında
 * da paylaşılıyor.
 *
 * ⚠️ Redis yoksa/erişilemezse önbellek SESSİZCE devre dışı kalır (redisTry): her istek
 * sorguyu yeniden çalıştırır. Yönetim paneli yavaşlar, çalışmayı sürdürür — "Redis'in
 * yokluğu ÖZELLİK KAYBI'dır, HATA değil" (clients/redis.ts).
 */
const ONEK = 'lb:panel:'
const CACHE_SN = 10 * 60

/** Önbellekli üretici sarmalayıcı — `onbellekli('havuz', uret)()` biçiminde kullanılır. */
export function onbellekli<T>(anahtar: string, uret: () => Promise<T>): () => Promise<T> {
  return async () => {
    const ham = await redisTry((r) => r.get(ONEK + anahtar), null)
    if (ham !== null) {
      try {
        return JSON.parse(ham) as T
      } catch {
        // Bozuk kayıt (şema değişmiş / yarım yazım) → yok say, yeniden üret.
      }
    }
    const veri = await uret()
    await redisTry((r) => r.set(ONEK + anahtar, JSON.stringify(veri), 'EX', CACHE_SN), null)
    return veri
  }
}

/**
 * Önbelleği düşürür. Anahtar verilmezse HEPSİ düşer.
 * Dönüş: düşen anahtar sayısı — ops ucu bunu yanıtta gösterir (görünmez ops yok).
 *
 * ⚠️ SCAN kullanılır, KEYS DEĞİL. KEYS tüm anahtar uzayını tek seferde tarar ve Redis
 * tek iş parçacıklıdır: büyük bir veritabanında o süre boyunca HER İSTEK bloklanır
 * (oturum kapısı ve rate limit dahil). SCAN imleçli ilerler, blok üretmez.
 */
export async function onbellegiDus(anahtar?: string): Promise<number> {
  if (anahtar) return redisTry((r) => r.del(ONEK + anahtar), 0)

  return redisTry(async (r) => {
    let silinen = 0
    let imlec = '0'
    do {
      const [sonraki, anahtarlar] = await r.scan(imlec, 'MATCH', `${ONEK}*`, 'COUNT', 100)
      imlec = sonraki
      if (anahtarlar.length) silinen += await r.del(...anahtarlar)
    } while (imlec !== '0')
    return silinen
  }, 0)
}
