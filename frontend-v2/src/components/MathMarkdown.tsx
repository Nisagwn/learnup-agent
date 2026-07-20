import type { ReactNode } from 'react'
import ReactMarkdown, { type Options } from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { autoWrapLatex } from '../lib/latex.js'

/**
 * SORU METNİ RENDER'I — matematik KaTeX ile çizilir.
 *
 * ⚠️ BU BİLEŞEN YOKKEN EKRAN HAM BASIYORDU. katex + remark-math + rehype-katex bu projeye
 * kurulmuştu ama HİÇBİR YERDEN import edilmiyordu (lib/latex.js de öyle); Coz.tsx soruyu
 * `{soru.question_text}` diye düz basıyordu. Havuzdaki soruların matematiği `$...$` ile geliyor
 * (brain: persona/osym.charter MATEMATİK BİÇİMİ) → öğrenci ekranda birebir "$\frac{1}{2}$"
 * görürdü. Sorunun kendisi doğru, ekranı okunamaz.
 *
 * ⚠️ KaTeX AYARLARI BRAIN İLE AYNI OLMALI (learnup-brain/src/utils/latex.ts → KATEX_AYAR).
 * Orada aynı kütüphane, aynı `strict:false` ile soruların çizilip çizilmediği ÖLÇÜLÜP havuza
 * öyle yazılıyor. İki taraf ayrışırsa kapının anlamı kalmaz: sunucu "çizilir" der, burada çizilmez.
 */

// react-markdown blok eleman üretir (<p>, <pre>). Satır içi kullanımda (şık metni gibi)
// bunlar <span>'in içine girerse geçersiz HTML olur ve tarayıcı DOM'u yeniden kurar → nötrle.
const SATIR_ICI = {
  p: ({ children }: { children?: ReactNode }) => <>{children}</>,
  pre: ({ children }: { children?: ReactNode }) => <>{children}</>,
}

// throwOnError:false → geçersiz LaTeX'te ÇÖKME yerine kaynağı göster (tek bir bozuk formül
// tüm çöz ekranını beyaz ekrana çevirmesin). strict:false → Unicode'a müsamaha: çıkmış ÖSYM
// soruları π, ≤, ² taşıyor ve onlar LaTeX'e çevrilmedi.
// Tipler react-markdown'ın KENDİSİNDEN alınır: `unified` yalnız transitif bağımlılık,
// oradan import etmek paket ağacı değişince sessizce kırılır.
const KATEX_AYAR = { throwOnError: false, strict: false }
const remarkPlugins: Options['remarkPlugins'] = [remarkMath]
const rehypePlugins: Options['rehypePlugins'] = [[rehypeKatex, KATEX_AYAR]]

export function MathMarkdown({
  children,
  inline = false,
  className = '',
}: {
  children?: string | null
  /** true → satır içi (şık metni, kısa ifade). false → blok (soru kökü, çözüm). */
  inline?: boolean
  className?: string
}) {
  const Sarmal = inline ? 'span' : 'div'
  return (
    <Sarmal className={`math${inline ? ' math--inline' : ''}${className ? ' ' + className : ''}`}>
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={inline ? SATIR_ICI : undefined}>
        {autoWrapLatex(children)}
      </ReactMarkdown>
    </Sarmal>
  )
}
