// Çıplak (delimiter'sız) LaTeX desenlerini otomatik olarak $...$ ile sarmalar.
// Veritabanındaki eski sorularda formüller "\frac{d}{dx}", "x^2" gibi yazılmış
// (AI promptu $...$ ister ama seed/eski veriler bazen sarmasız). Bu yardımcı,
// MathMarkdown ve Quiz renderContent'in girdisinde tetiklenir.

// Yakalanan örüntüler:
//   • \cmd{...}{...}  — LaTeX komutları + zincirli argümanlar
//   • \cmd            — argümansız komut (\alpha, \Delta, \sum, …)
//   • x^N  veya  x^{...}  — üst (exponent)
//   • x_N  veya  x_{...}  — alt (subscript)
// (İç içe süslü parantezler regex ile tam desteklenmez; bunlar için yazar
// $...$ kullanmaya devam etmeli.)
const LATEX_TOKEN =
  /\\[a-zA-Z]+(?:\{[^{}]*\})*|[a-zA-Z0-9](?:\^|_)(?:\{[^{}]*\}|[a-zA-Z0-9]+)/g;

/**
 * Metni remark-math'in anlayacağı `$...$` / `$$...$$` biçimine getirir:
 *  1) TeX delimiter'ları `\(...\)` ve `\[...\]` → `$...$` / `$$...$$`
 *     (DB'deki birçok soru bu biçimde; remark-math bunları tanımaz → ham görünür).
 *  2) Zaten `$` içeriyorsa (yazar sarmalamış) olduğu gibi döner.
 *  3) Hiç delimiter yoksa çıplak LaTeX token'larını `$...$` ile sarar (eski seed).
 */
export function autoWrapLatex(text) {
  if (text == null) return '';
  let s = typeof text === 'string' ? text : String(text);
  if (!s) return '';

  const hasDollar = s.includes('$');
  const hasTexDelim = /\\[()[\]]/.test(s); // \( \) \[ \] (\{ \} hariç)

  // 1a) Hatalı ÇİFT sarmalama: AI bazen "$\(...\)$" üretir ($ VE \( birlikte).
  //     `$` zaten geçerli delimiter → fazlalık TeX paren/bracket'larını at.
  //     (\left( \right) gibi komutlar etkilenmez; oradaki ( ) backslash'sızdır.)
  if (hasDollar && hasTexDelim) {
    return s.replace(/\\[()[\]]/g, '');
  }

  // 1b) Saf TeX delimiter → `$` / `$$` dönüşümü
  if (hasTexDelim) {
    s = s
      .replace(/\\\[|\\\]/g, () => '$$')  // \[ \]  → $$  (display)
      .replace(/\\\(|\\\)/g, () => '$');  // \( \)  → $   (inline)
    return s;
  }

  if (hasDollar) return s; // yazar sarmaladıysa dokunma

  // 3) Çıplak token sarma — Regex.test() lastIndex'i kirletir, sıfırla
  LATEX_TOKEN.lastIndex = 0;
  if (!LATEX_TOKEN.test(s)) return s;
  LATEX_TOKEN.lastIndex = 0;
  return s.replace(LATEX_TOKEN, (m) => `$${m}$`);
}
