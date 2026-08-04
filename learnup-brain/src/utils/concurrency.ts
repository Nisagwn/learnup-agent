/**
 * SINIRLI EŞZAMANLILIK — aynı anda en fazla N iş.
 *
 * Neden: soru üretiminde adaylar BAĞIMSIZ denetlenir ve `Promise.all(...map(denetle))` HEPSİNİ
 * aynı anda ateşliyordu. Küçük setlerde sorun yok; ama makro deneme (40 soru) veya büyük `count`
 * geldiğinde 40+ eşzamanlı LLM çağrısı sağlayıcının RPM/TPM sınırına toslar → 429 dalgası →
 * router zinciri boşuna ücretsizden paralıya düşer, hatta hepsi patlar.
 *
 * Router'da zaten sağlayıcı-başına dakika tavanı + devre kesici VAR; bu, onların ÜSTÜNDE bir
 * kat: uçuştaki istek SAYISINI baştan sınırlar (zaman-bazlı "saniyede 3" yerine eşzamanlılık
 * tavanı — LLM çağrıları için daha temiz: gecikme değişken, önemli olan aynı anda kaç tanesinin
 * açık olduğu).
 */

/**
 * `items`i `fn`den geçirir; aynı anda en fazla `limit` tanesi çalışır. Sıra KORUNUR
 * (sonuç[i] === fn(items[i])). `fn` fırlatırsa mapLimit reddeder (Promise.all gibi) — çağıran
 * her elemanın kendi hatasını yutmak istiyorsa `fn`i defansif yazmalı.
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const n = items.length
  const results = new Array<R>(n)
  if (n === 0) return results

  const cap = Math.max(1, Math.min(Math.floor(limit) || 1, n))
  let next = 0

  async function worker(): Promise<void> {
    for (;;) {
      const i = next++
      if (i >= n) return
      results[i] = await fn(items[i], i)
    }
  }

  await Promise.all(Array.from({ length: cap }, () => worker()))
  return results
}
