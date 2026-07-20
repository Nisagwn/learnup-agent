/**
 * LATEX SAĞLIĞI — "bu sorunun matematiği ÖĞRENCİDE RENDER EDİLİR Mİ?"
 *
 * NEDEN VAR: öğrencinin gördüğü matematik KaTeX ile çizilir (frontend: remark-math +
 * rehype-katex). KaTeX yalnız `$...$` / `$$...$$` arasını matematik sayar. Bunun dışında
 * kalan her şey DÜZ METİN olarak basılır — yani model `\frac{1}{2}` yazıp `$` koymazsa
 * öğrenci ekranda birebir `\frac{1}{2}` görür. Soru yanlış değildir, OKUNAMAZ.
 *
 * ⚠️ BU KAPI OLMADAN ARIZA SESSİZDİ. Yazar charter'ı "LaTeX korunur" diyordu ama:
 *   · ORTAK_KURALLAR'da LaTeX'ten hiç söz edilmiyordu,
 *   · charter'ın KENDİ çözüm örneği modele UNICODE öğretiyordu ("v = v₀ + a·t", "2 m/s²"),
 *   · kodda tek bir doğrulama yoktu.
 * Model örneği taklit eder, parantez içindeki dileği değil. Sonuç: havuza karışık biçim
 * yazılıyordu ve hiçbir kapı bunu görmüyordu — denetçi LLM'i `\frac`i zaten OKUYABİLDİĞİ
 * için soruyu kusursuz buluyordu. Bozulma yalnız ÖĞRENCİNİN ekranında ortaya çıkıyordu.
 *
 * ⚠️ SUNUCU VE İSTEMCİ AYNI KÜTÜPHANEYİ KULLANIR — kapının anlamı buradan gelir.
 * Buradaki `katex` ile frontend'in `katex`i aynı paket, aynı ayarlar (strict:false).
 * Yani "burada derlendi" demek "öğrencide çizilir" demektir; tahmin değil, ölçüm.
 *
 * DİKKAT — NORMALİZE YALNIZ KANITLANABİLİR GÜVENLİ İŞİ YAPAR (delimiter çevirisi).
 * Çıplak `\frac{...}` gibi sarmalanmamış LaTeX'i burada TAHMİN EDEREK sarmıyoruz: iç içe
 * süslü parantezde regex `\frac{\sqrt{2}}{2}` üzerinde yalnız `\frac`i yakalar ve ortaya
 * `$\frac$` — yani DAHA BOZUK bir şey — çıkarır. Sarmalama modelden istenir (charter),
 * kod ise sonucu DENETLER (latexBozuk). Bu, projenin değişmezidir: prompt niyeti anlatır,
 * kod zorlar. (Eski satırlar için frontend'deki okuma-anı sarmalayıcısı yerinde duruyor.)
 */
import katex from 'katex'

/** Frontend ile BİREBİR aynı olmalı (MathMarkdown.jsx: KATEX_OPTIONS).
 *  strict:false → Unicode/uyumsuzluklara müsamaha. Kapı, frontend'in ÇİZEBİLDİĞİ hiçbir
 *  şeyi reddetmemeli: frontend'den daha katı bir kapı sağlam soruları boşuna eler. */
const KATEX_AYAR = { strict: false as const, throwOnError: true }

/** Eşleşmiş matematik parçaları: `$$...$$` (blok) ve `$...$` (satır içi).
 *  `$$` ÖNCE denenir — aksi hâlde `$...$` boş bir `$$`i yutar.
 *  Satır içi gövde satır atlamaz (`[^$\n]`): kaçak tek `$` tüm paragrafı matematik sanmasın. */
const MATH_PARCA_KAYNAK = /\$\$[\s\S]*?\$\$|\$[^$\n]*\$/

/** LaTeX komutu: `\frac`, `\alpha`, `\left` … (matematik DIŞINDA kalırsa öğrenci ham görür) */
const LATEX_KOMUT = /\\[a-zA-Z]+/

/** Metni matematik / düz-metin parçalarına ayırır (sırayı korur). */
function parcala(s: string): Array<{ math: boolean; body: string }> {
  // Regex HER ÇAĞRIDA yeniden kurulur: modül düzeyinde /g'li bir regex'i exec ile
  // paylaşmak lastIndex'i taşır ve ikinci çağrıyı sessizce bozar.
  const re = new RegExp(MATH_PARCA_KAYNAK.source, 'g')
  const out: Array<{ math: boolean; body: string }> = []
  let son = 0
  for (let m = re.exec(s); m; m = re.exec(s)) {
    if (m.index > son) out.push({ math: false, body: s.slice(son, m.index) })
    out.push({ math: true, body: m[0] })
    son = m.index + m[0].length
  }
  if (son < s.length) out.push({ math: false, body: s.slice(son) })
  return out
}

/** `$…$` / `$$…$$` sarmalını soyup içindeki TeX'i verir. */
const govde = (parca: string): { tex: string; blok: boolean } =>
  parca.startsWith('$$')
    ? { tex: parca.slice(2, -2), blok: true }
    : { tex: parca.slice(1, -1), blok: false }

/**
 * Metni KaTeX'in tanıdığı tek biçime getirir: `$...$` (satır içi) ve `$$...$$` (blok).
 *
 * Yalnız DELIMITER çevirisi yapar — matematiğin kendisine dokunmaz:
 *  1) Çift sarmalama `$\(x\)$` → `$x$`   (model bazen ikisini birden üretir; `\(` matematik
 *     modunun İÇİNDE geçersizdir → KaTeX çizemez, öğrenci kırmızı/ham görür)
 *  2) TeX delimiter `\[...\]` → `$$...$$`, `\(...\)` → `$...$`
 *     (remark-math bunları TANIMAZ → sarmalayıcılar öğrencinin ekranında ham çıkar)
 */
export function latexDuzelt(text: string): string {
  if (!text) return ''
  return (
    text
      // 1) Çift sarmalama — dıştaki `$` zaten geçerli delimiter, içteki TeX parantezi fazlalık.
      .replace(/\$\$\s*\\\[([\s\S]*?)\\\]\s*\$\$/g, (_m, b: string) => `$$${b}$$`)
      .replace(/\$\s*\\\(([\s\S]*?)\\\)\s*\$/g, (_m, b: string) => `$${b}$`)
      // 2) Saf TeX delimiter → `$` biçimi. Blok ÖNCE: `\[`, `\(` ile karışmasın.
      .replace(/\\\[([\s\S]+?)\\\]/g, (_m, b: string) => `$$${b}$$`)
      .replace(/\\\(([\s\S]+?)\\\)/g, (_m, b: string) => `$${b}$`)
  )
}

/**
 * Metin öğrencide bozuk görünür mü? Bozuksa NEDEN — yoksa null.
 * Dönen cümle doğrudan onarım eleştirisine gider (yazar ne düzelteceğini bilsin).
 *
 * Üç arıza tipi (üçü de öğrencinin ekranında görünür, denetçi LLM'i üçünü de göremez):
 *   a) `$...$` içi KaTeX'te DERLENMİYOR      → frontend ham kaynağı basar
 *   b) Matematik DIŞINDA kalmış LaTeX komutu → öğrenci birebir `\frac{1}{2}` görür
 *   c) Eşleşmemiş `$`                        → sarmal açık kalmış; `$` ekranda görünür
 */
export function latexBozuk(text: string): string | null {
  if (!text) return null
  for (const parca of parcala(text)) {
    if (parca.math) {
      const { tex, blok } = govde(parca.body)
      if (!tex.trim()) return `boş matematik sarmalı ("${parca.body}") — içi doldurulmalı ya da silinmeli`
      try {
        katex.renderToString(tex, { ...KATEX_AYAR, displayMode: blok })
      } catch (err) {
        // (a) KaTeX'in kendi cümlesi en iyi eleştiridir: hangi komutun/parantezin hatalı
        // olduğunu tam söyler. Yazar bunu görüp düzeltebilir.
        const neden = err instanceof Error ? err.message : String(err)
        return `geçersiz LaTeX — "${parca.body}" KaTeX ile çizilemiyor (${neden})`
      }
    } else {
      // (b) Matematik dışında LaTeX komutu: sarmalanmamış formül.
      const komut = parca.body.match(LATEX_KOMUT)
      if (komut) {
        return `"${komut[0]}" komutu $...$ dışında kalmış — sarmalanmamış LaTeX öğrencinin ekranında ` +
          `birebir "${komut[0]}" olarak görünür. Her formülü $...$ (satır içi) ya da $$...$$ (blok) arasına al`
      }
      // (c) Eşleşmiş her `$` çifti yukarıda math parçası olarak tüketildi → kalan `$` öksüzdür.
      if (parca.body.includes('$')) {
        return 'eşleşmemiş "$" var — her açılan $ kapatılmalı (formül sarmalı yarım kalmış)'
      }
    }
  }
  return null
}

/**
 * HAM MATEMATİK KAÇAĞI — ters-bölüsüz matematik: `x^2`, `a_1` gibi.
 *
 * latexBozuk bunu GÖREMEZ: `^` bir LaTeX komutu değildir (LATEX_KOMUT `\\komut` arar), `$`
 * sarmalı da yoktur — yani üç arıza tipinin hiçbirine düşmez ama öğrenci ekranda ham `x^2`
 * görür (KaTeX yalnız `$...$` içini çizer). Model bazen üs/indisi sarmadan kusuyor.
 *
 * NEDEN AYRI FONKSİYON (latexBozuk'a eklenmedi): bu kontrol DERS-KOŞULLUDUR. `^` Türkçe
 * düzyazıda geçmez → sayısal derste kesin sinyal; ama sözel derste soru metni matematik hiç
 * içermez ve kontrolün anlamı yoktur. latexBozuk her derste koşar; bu yalnız sayısal ailede
 * çağrılır (generation.ts karar verir). Çıplak kesir (`1/2`) BİLEREK YOK: "2019/2020 eğitim
 * yılı" tipi meşru kullanım var — eval taban oranını ölçmeden o kural açılmaz.
 */
const HAM_MAT = /[a-zA-ZğüşıöçĞÜŞİÖÇ0-9)\]]\s*[\^_]\s*[{a-zA-Z0-9(]/

export function hamMatematikKacagi(text: string): string | null {
  if (!text) return null
  for (const parca of parcala(text)) {
    if (parca.math) continue // $...$ içi KaTeX'in işi — latexBozuk denetliyor
    const m = parca.body.match(HAM_MAT)
    if (m) {
      return `"${m[0].trim()}" — üs/indis matematik sarmalı DIŞINDA; öğrenci ekranda ham ` +
        `karakter görür. Formülü $...$ arasına al (ör. $x^2$)`
    }
  }
  return null
}

/** Soru şeklinin LaTeX taşıyan tüm alanları — kök, beş şık, çözüm. Hepsi öğrenciye gider. */
export type LatexliSoru = {
  soru: string
  siklar: Record<'A' | 'B' | 'C' | 'D' | 'E', string>
  cozum: string
}

const HARFLER = ['A', 'B', 'C', 'D', 'E'] as const

/** Sorunun ÖĞRENCİYE GİDEN her alanını tek biçime getirir (saf: yeni nesne döner). */
export function matematigiDuzelt<T extends LatexliSoru>(q: T): T {
  const siklar = { ...q.siklar }
  for (const L of HARFLER) siklar[L] = latexDuzelt(siklar[L])
  return { ...q, soru: latexDuzelt(q.soru), siklar, cozum: latexDuzelt(q.cozum) }
}

/**
 * Sorunun HERHANGİ bir alanı öğrencide bozuk görünüyor mu? Bozuksa onarım eleştirisi, yoksa null.
 * ⚠️ ŞIKLAR VE ÇÖZÜM DE TARANIR — kök temiz olabilir ama formül çoğu zaman şıkta/çözümdedir.
 * `hamMatKontrolu` yalnız SAYISAL ailede true geçilir (bkz. hamMatematikKacagi yorumu).
 */
export function soruLatexBozuk(q: LatexliSoru, hamMatKontrolu = false): string | null {
  const alanlar: Array<[string, string]> = [
    ['soru kökünde', q.soru],
    ...HARFLER.map((L): [string, string] => [`${L} şıkkında`, q.siklar[L] ?? '']),
    ['çözümde', q.cozum],
  ]
  for (const [nere, metin] of alanlar) {
    const neden = latexBozuk(metin) ?? (hamMatKontrolu ? hamMatematikKacagi(metin) : null)
    if (neden) return `${nere} ${neden}`
  }
  return null
}
