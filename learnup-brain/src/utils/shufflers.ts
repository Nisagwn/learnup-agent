/**
 * ŞIK DÜZENİ — DETERMİNİST, LLM'DEN BAĞIMSIZ.
 *
 * Neden ayrı dosya: şık karıştırma modelin değil KODUN işidir. LLM'e "cevabı dengeli dağıt"
 * demek güvenilmez — ölçüldü: prompt kuralı varken bile 8 sorunun 6'sında doğru cevap A'da kaldı.
 * Bu lojik yazar ile denetçi ARASINA girer: denetçi öğrencinin göreceği SON hâli çözsün.
 *
 * ÖLÇÜM (neden gerekli):
 *   AI havuzu (n=8):      A:6  B:0  C:2  D:0  E:0   ← model önce doğruyu yazıp çeldirici üretiyor
 *   gerçek ÖSYM (n=1000): A:206 B:191 C:205 D:212 E:186   ← olması gereken denge
 *
 * KURALLAR:
 *   · Şıklar SAYISAL ise → ARTAN sıra. Hem ÖSYM'nin kendi kuralı, hem doğruyu değere göre dağıtır.
 *   · "Yalnız I / I ve II / I, II ve III" kalıbı → DOKUNULMAZ (geleneksel sıra; karıştırmak
 *     ÖSYM'de görülmeyen bir soru üretir).
 *   · Çözüm bir harfe atıf yapıyorsa ("C şıkkında…") → DOKUNULMAZ; yer değiştirirsek çözüm yalan
 *     söyler. Doğru cevabı korumak, dağılımı düzeltmekten önce gelir.
 *   · Diğer metinsel şıklar → Fisher–Yates permütasyon.
 *
 * Saf fonksiyon: girdi mutasyona uğramaz, yeni bir obje döner (Math.random dışında yan etki yok).
 */

export const SIK_HARF = ['A', 'B', 'C', 'D', 'E'] as const
export type SikHarf = (typeof SIK_HARF)[number]
export type Siklar = Record<SikHarf, string>

/** Şık düzenlemesi için gereken minimum şekil — TaggedQuestion bunu KARŞILAR (yapısal uyum). */
export type SikliSoru = {
  siklar: Siklar
  dogru: string
  cozum?: string
}

/** "Yalnız I", "I ve II", "I, II ve III" — ÖSYM'nin geleneksel roma-rakamı kalıbı. */
const KOMBIN = /^(yalnız\s+)?(i{1,3}|iv|v)(\s*(,|ve)\s*(i{1,3}|iv|v))*$/i

/** Çözüm harfe atıf yapıyor mu? ("C şıkkı", "şık B", "(D)") */
const COZUM_HARF_ATIF = /\b(şık|seçenek)\s*[A-E]\b|\b[A-E]\s*(şıkkı|şıkkında|seçeneği)\b|\([A-E]\)/i

/**
 * LATEX SARMALI SOYULUR — yoksa AŞAĞIDAKİ ÜÇ KAPI DA SESSİZCE KAPANIR.
 *
 * ⚠️ Şıklar artık LaTeX geliyor: charter modelden her formülü `$...$` arasında istiyor
 * (persona/osym.charter.MATEMATIK_BICIMI), çünkü öğrencinin ekranını KaTeX çiziyor. Yani
 * sayısal bir şık "12" değil "$12$", "4/3" değil "$\\frac{4}{3}$" olarak geliyor.
 *
 * Bu soyma olmasaydı `sayiya("$12$")` → null olurdu ve arıza ÜÇ KAT, üçü de SESSİZ:
 *   · celdiriciKusatmasi → "şıklar sayısal değil" sanıp `null` döner: kapı HİÇ ÇALIŞMAZ.
 *   · siklariDuzenle     → artan sıra yerine Fisher–Yates'e düşer: ÖSYM'nin sayısal şıkları
 *                          artan dizme kuralı bozulur.
 *   · sikUzunlukSizintisi → sayısal şıkkı METİNSEL sanar; "$5$" ile "$1250$" arasındaki
 *                          uzunluk farkını sızıntı sayıp SAĞLAM soruyu eler (yanlış alarm).
 * Üçü de hata vermez, yalnız yanlış çalışır — tam da bu dosyanın kapatmak için var olduğu
 * kusurlar geri gelirdi. Bu yüzden LaTeX bilgisi `sayiya`nın İÇİNDE: üç kapı da ondan besleniyor.
 */
const latexSoy = (s: string): string => {
  const sarmalsiz = s.trim().match(/^\$\$?([\s\S]*?)\$\$?$/)
  const t = (sarmalsiz ? sarmalsiz[1] : s).trim()
  // \frac{4}{3} · \dfrac · \tfrac → "4/3" (aşağıdaki kesir kuralı devralsın).
  // İç içe süslü parantez ([^{}]) BİLEREK desteklenmiyor: "\frac{\sqrt2}{2}" sayı değildir,
  // null dönmeli — kapılar da o soruda "sayısal değil" deyip kenara çekilmeli.
  return t.replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, (_m, pay: string, payda: string) =>
    `${pay}/${payda}`,
  )
}

/**
 * TİRE/KESİR/RAKAM NORMALİZASYONU — sayısal kapıların SESSİZ atlatılmasını kapatır.
 *
 * ⚠️ NEDEN (GOREV-021 teşhisi; kanıt 5d6c6db3 / 2a568933): şıklar `–2` (U+2013 en-dash) gibi
 * ASCII-DIŞI bir tire taşıyınca `sayiya()` → null döner ve `celdiriciKusatmasi` + artan-sıra +
 * `sikUzunlukSizintisi` kapılarının ÜÇÜ de "şık sayısal değil" deyip SESSİZCE kenara çekilir.
 * Sonuç: gizli `tek-yanda` ihlali hiç ölçülmeden VERIFIED soru öğrenciye gider (havuzda 2 vaka
 * doğrulandı). Bu fonksiyon tire ailesini ASCII '-'e, kesir-bölü işaretlerini '/'e indirger,
 * yumuşak tireyi siler ve (ihtiyaten — havuzda görülmedi ama yazım yolu bir daha sızdırmasın)
 * fullwidth/Arabic-Indic rakamları ASCII'ye çeker. Karakter kümesi GOREV-021 önerisinin AYNISI.
 *
 * İki yerde çağrılır: (1) `sayiya()` girişi — tek nokta üç kapı + `siklariDuzenle` +
 * `benzerlik.sikKanonik`'i besler; (2) üretim yazım yolu (generation.ts / questions-ai.ts) —
 * depolanan metin de temiz kalsın (KaTeX/ekran tutarlılığı + gelecekteki okumalar sayiya'ya
 * bağımlı olmasın).
 */
// ⚠️ Bu karakterler görsel olarak ASCII '-'e (U+2212 minus, U+2010 hyphen) ya da birbirine
// benzer, U+00AD ise GÖRÜNMEZDİR — kaynakta ayırt edilemez. Karşılık gelen kod noktaları
// yanlarına yorumla yazıldı (küme GOREV-021 önerisinin aynısı). Değiştirirken yorumu koru.
// tire ailesi: U+2010 U+2011 U+2012 U+2013 U+2014 U+2015 U+2212 U+FE63 U+FF0D → '-'
const TIRE_AILESI = /[‐‑‒–—―−﹣－]/g
const KESIR_BOLU = /[⁄∕]/g // U+2044 fraction slash + U+2215 division slash → '/'
export function sayisalNormalize(s: string): string {
  return s
    .replace(TIRE_AILESI, '-')
    .replace(/­/g, '') // yumuşak tire (soft hyphen) — GÖRÜNMEZ, sayiya'yı sessizce bozar
    .replace(KESIR_BOLU, '/')
    .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xff10 + 0x30)) // fullwidth 0-9
    .replace(/[٠-٩]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0x0660 + 0x30)) // Arabic-Indic 0-9
}

/** "4/3" → 1.333 · "1,5" → 1.5 · "-2" → -2 · "$12$" → 12 · "$\\frac{4}{3}$" → 1.333 · "–2" → -2 · aksi hâlde null */
export function sayiya(s: string): number | null {
  const t = sayisalNormalize(latexSoy(s)).replace(/\s/g, '')
  const kesir = t.match(/^([-+]?\d+)\/(\d+)$/)
  if (kesir) return Number(kesir[1]) / Number(kesir[2])
  const n = Number(t.replace(',', '.'))
  return Number.isFinite(n) && t.length > 0 ? n : null
}

/**
 * ÇELDİRİCİ KUŞATMASI — KOD KAPISI, LLM'E SORULMAZ.
 *
 * Kural (charter): sayısal şıklarda çeldiricilerin en az İKİSİ doğru değerin ALTINDA, en az
 * İKİSİ ÜSTÜNDE olmalı. Sebebi yukarıdaki artan-sıra kuralı: hepsi tek yandaysa doğru cevap
 * artan sıralamada DAİMA A'ya veya E'ye düşer ve öğrenci soruyu ÇÖZMEDEN tahmin eder.
 *
 * NEDEN KODDA: bu kural saf aritmetik — "kaç tanesi küçük, kaç tanesi büyük". ÖLÇÜLDÜ (altın set,
 * kusuru önceden bilinen 4 soru): deepseek-r1 bunu yakalıyor ama denetim başına $0.00513;
 * v4-flash ve v3.2 (43× / 15× ucuz) tam da BU kusuru kaçırıyor — diğer üçünü (yanlış işaretli
 * cevap, çelişkili kök) doğru buluyorlar. Yani pahalı hakemin tek üstünlüğü, aritmetikle
 * kesin çözülebilen bir kontroldü. Kod hem ucuz hem KESİN: olasılıksal hakem bazen kaçırır,
 * bu fonksiyon asla.
 *
 * `null` = kural UYGULANMAZ (şıklar sayısal değil → metinsel şıkta "alt/üst" anlamsız).
 */
export function celdiriciKusatmasi(q: SikliSoru): 'kusatilmis' | 'tek-yanda' | null {
  const dogruIdx = SIK_HARF.indexOf(q.dogru as SikHarf)
  if (dogruIdx < 0) return null
  const sayilar = SIK_HARF.map((l) => sayiya(q.siklar[l] ?? ''))
  if (sayilar.some((n) => n === null)) return null // metinsel şık → kural dışı
  const dogruDeger = sayilar[dogruIdx] as number
  let alt = 0
  let ust = 0
  sayilar.forEach((n, i) => {
    if (i === dogruIdx) return
    if ((n as number) < dogruDeger) alt++
    else if ((n as number) > dogruDeger) ust++
  })
  return alt >= 2 && ust >= 2 ? 'kusatilmis' : 'tek-yanda'
}

/**
 * ŞIK UZUNLUĞU SIZINTISI — KOD KAPISI, LLM'E SORULMAZ.
 *
 * Kusur: model doğru şıkkı tam ve nitelikli yazıyor, çeldiricileri kısa geçiyor. Sonuç, konuyu
 * bilmeyen öğrencinin "en uzun şıkkı işaretle" diyerek net yapması — soru konuyu değil yazarın
 * alışkanlığını ölçer hâle gelir.
 *
 * ÖLÇÜLDÜ (metinsel şıklı sorular; sayısal ve roma-kombinasyon şıklar hariç — orada uzunluk
 * yapısaldır, sızıntı değil):
 *   gerçek ÖSYM (n=1103): doğru cevap %24 en uzun şık   ← rastgele beklenti %20 → SIZINTI YOK
 *   AI havuzu   (n=67)  : doğru cevap %52 en uzun şık   ← 2.2× sapma
 *
 * NEDEN "EN UZUN OLMASIN" DEĞİL: ÖSYM'de de doğru şık %24 en uzundur; tesadüfen en uzun olmak
 * kusur değildir. Kusur SİSTEMATİK taşmadır.
 *
 * NEDEN İKİ KOŞUL (oran VE mutlak): tek başına oran KISA şıklarda yanlış alarm verir — beşi de
 * ~12 karakterlik olgu şıkkıysa ("Bedir Savaşı", "Hendek Savaşı") tek bir uzun özel ad
 * ("Hudeybiye Antlaşması") oranı %67'ye fırlatır; bu sızıntı değil, adın kendisi uzundur.
 * Mutlak taban bunu eler. Eşikler gerçek ÖSYM'nin kendi dağılımından türetildi (uydurulmadı):
 *      kapı            ÖSYM red   AI red   ayrım
 *   oran>%15            11%        32%      3.1×   ← yanlış alarm iki katı
 *   oran>%15 VE +10ch    5%        31%      6.4×   ← SEÇİLEN: yakalama aynı, yanlış alarm yarı
 *   oran>%15 VE +15ch    2%        22%     10.3×   ← ayrım daha iyi ama yakalama düşüyor
 * Yani kapı sağlam ÖSYM sorusunu 20'de 1 yakar, bizim alışkanlığımızı 3'te 1 yakalar.
 *
 * `null` = kural UYGULANMAZ (şıklar sayısal ya da roma kombinasyonu → uzunluk anlam taşımaz).
 */
const SIZINTI_ORANI = 0.15
const SIZINTI_MUTLAK = 10

export function sikUzunlukSizintisi(q: SikliSoru): 'sizinti' | 'temiz' | null {
  const dogruIdx = SIK_HARF.indexOf(q.dogru as SikHarf)
  if (dogruIdx < 0) return null
  const vals = SIK_HARF.map((l) => q.siklar[l]?.trim() ?? '')
  if (vals.some((v) => !v)) return null
  if (vals.every((v) => sayiya(v) !== null)) return null // sayısal → uzunluk anlamsız
  if (vals.every((v) => KOMBIN.test(v))) return null     // roma → uzunluk yapısal
  const dogruUz = vals[dogruIdx].length
  const digerUz = vals.filter((_, i) => i !== dogruIdx).map((v) => v.length)
  const ortDiger = digerUz.reduce((s, x) => s + x, 0) / digerUz.length
  if (ortDiger < 3) return null // anlamlı ölçüm için fazla kısa
  const enUzun = dogruUz > Math.max(...digerUz)
  const oran = (dogruUz - ortDiger) / ortDiger
  const mutlak = dogruUz - ortDiger
  return enUzun && oran > SIZINTI_ORANI && mutlak > SIZINTI_MUTLAK ? 'sizinti' : 'temiz'
}

/** Fisher–Yates. `sort(() => Math.random() - 0.5)` DEĞİL: o taraflıdır — ölçüldü, dağılım
 *  45/48/34/48/25 (E belirgin eksik). Taraflı karıştırma, çözdüğümüz problemin küçüğünü geri getirir. */
function fisherYates<T>(dizi: T[]): T[] {
  const out = [...dizi]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Şıkları ÖSYM konvansiyonuna göre yeniden dizer ve `dogru` harfini buna göre günceller.
 * Girdi değişmez; yeni bir soru objesi döner. Düzenleme uygulanamıyorsa (eksik şık,
 * harfe bağlı çözüm, roma kalıbı) soru olduğu gibi geri döner.
 */
export function siklariDuzenle<T extends SikliSoru>(q: T): T {
  const vals = SIK_HARF.map((l) => q.siklar[l])
  if (vals.some((v) => !v?.trim())) return q
  if (COZUM_HARF_ATIF.test(q.cozum ?? '')) return q      // çözüm harfe bağlı → dokunma
  if (vals.every((v) => KOMBIN.test(v.trim()))) return q // geleneksel roma sırası → dokunma

  const sayilar = vals.map(sayiya)
  let sira = [0, 1, 2, 3, 4]
  if (sayilar.every((n) => n !== null)) {
    sira.sort((a, b) => (sayilar[a] as number) - (sayilar[b] as number)) // ÖSYM: artan sıra
  } else {
    sira = fisherYates(sira)
  }

  const eskiDogru = SIK_HARF.indexOf(q.dogru as SikHarf)
  if (eskiDogru < 0) return q
  const yeniDogru = sira.indexOf(eskiDogru)

  const siklar = { A: '', B: '', C: '', D: '', E: '' } as Siklar
  sira.forEach((eski, yeni) => {
    siklar[SIK_HARF[yeni]] = vals[eski]
  })

  return { ...q, siklar, dogru: SIK_HARF[yeniDogru] }
}
