import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { autoWrapLatex } from '../utils/latex';
import './MathMarkdown.css';

// react-markdown blok eleman üretir; satır içi kullanımda blok öğeleri ( <p>, <pre> )
// nötrle → <span> içinde geçersiz "block in inline / <pre> in <p>" sarmalaması olmasın.
// Kod bloğunun iç <code>'u satır-içi kalır (geçerli).
const inlineComponents = {
  p: ({ children }) => <>{children}</>,
  pre: ({ children }) => <>{children}</>,
};

// KaTeX hata toleransı: geçersiz LaTeX'te ÇÖKME yerine kaynağı göster (kırmızı kutu yerine).
// strict:false → Unicode/uyumsuzluklara müsamaha; throwOnError:false → graceful.
const KATEX_OPTIONS = { throwOnError: false, strict: false, errorColor: 'var(--text-secondary)' };
const rehypePlugins = [[rehypeKatex, KATEX_OPTIONS]];

/**
 * Metindeki LaTeX formüllerini KaTeX ile render eder.
 * Yazar $...$ ile sarmalamamışsa autoWrapLatex çıplak desenleri otomatik sarar
 * (örn. eski seed verilerinde "\frac{d}{dx}", "x^2" gibi).
 * inline=true: satır içi kullanım (A/B/C/D şık metinleri vb.).
 */
export default function MathMarkdown({ children, inline = false, className = '' }) {
  const Wrapper = inline ? 'span' : 'div';
  const content = autoWrapLatex(children);
  return (
    <Wrapper className={`math-content${inline ? ' math-content--inline' : ''} ${className}`.trim()}>
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={rehypePlugins}
        components={inline ? inlineComponents : undefined}
      >
        {content}
      </ReactMarkdown>
    </Wrapper>
  );
}
