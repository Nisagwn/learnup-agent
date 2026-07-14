/**
 * POSTGREST 1000-SATIR TUZAĞI.
 *
 * PostgREST bir SELECT'i varsayılan olarak 1000 satırda KESER — sessizce, hatasız.
 * `.limit(5000)` bu tavanı YÜKSELTMEZ. Yani `.select(...)` sonucunu "tam küme" sanan her kod,
 * tablo 1000'i geçtiği an SESSİZCE YANLIŞ çalışmaya başlar.
 *
 * Ampirik kanıt (bu repoda, bugün ölçüldü):
 *   yks_questions'ta 1730 çıkmış soru var. osym.routes.ts'in /years ucu hepsini çekip yılları
 *   sayıyordu → PostgREST 1000 döndürdü, 730 satır düştü, filtre UI'ındaki her sayı yanlıştı.
 *   Hata yok, uyarı yok. Sadece eksik cevap. Tuzağın tehlikesi tam olarak bu sessizlik.
 *
 * İki araç:
 *   fetchAll → sayfalayarak GERÇEKTEN hepsini getirir
 *   sayimAl  → satırları hiç çekmeden kesin sayı (data.length ile saymak 1000'de yalan söyler)
 */

const SAYFA = 1000

/** `.range()` çağrılabilen her PostgREST sorgusu (yapısal tip — builder jeneriklerine bulaşmaz). */
type Sayfalanabilir<T> = {
  range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
}

/** `{ count: 'exact', head: true }` ile kurulmuş bir sorgu. */
type Sayilabilir = PromiseLike<{ count: number | null; error: { message: string } | null }>

/**
 * Bir sorgunun TÜM satırlarını sayfalayarak getirir.
 * `qb` her çağrıda YENİ sorgu kurmalı — PostgREST builder'ı tek kullanımlıktır.
 *
 * @example
 *   const hepsi = await fetchAll(() =>
 *     supabase.from('yks_questions').select('exam_year').eq('source_type', 'osym_cikmis'))
 */
export async function fetchAll<T>(qb: () => Sayfalanabilir<T>, tavan = 100_000): Promise<T[]> {
  const out: T[] = []
  for (let bas = 0; bas < tavan; bas += SAYFA) {
    const { data, error } = await qb().range(bas, bas + SAYFA - 1)
    if (error) throw new Error(`fetchAll: ${error.message}`)
    const sayfa = data ?? []
    out.push(...sayfa)
    if (sayfa.length < SAYFA) return out // eksik sayfa = son sayfa
  }
  throw new Error(`fetchAll: ${tavan} satır tavanı aşıldı — sorguyu daralt`)
}

/** Kesin satır sayısı. Çağıran `.select('*', { count: 'exact', head: true })` ile kurar. */
export async function sayimAl(q: Sayilabilir): Promise<number> {
  const { count, error } = await q
  if (error) throw new Error(`sayimAl: ${error.message}`)
  return count ?? 0
}
