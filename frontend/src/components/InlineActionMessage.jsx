import React from 'react';
import { Sparkles, BookOpen } from 'lucide-react';
import parseInlineActions from '../utils/parseInlineActions';
import MathMarkdown from './MathMarkdown';

// Bot mesaj metnini segmentlere bölüp [QUIZ:..]/[KONU:..] etiketlerini
// tıklanabilir pill'lere çevirir.
//
// ⚠️ DÜZ METİN SEGMENTLERİ ARTIK KaTeX'TEN GEÇİYOR. Eskiden `<span>{seg.text}</span>` idi:
// Kaptan bir soruyu açıklarken formül yazıyor ("$\frac{1}{2}$") ve öğrenci sohbette birebir
// dolar işaretlerini okuyordu — aynı formül Çöz ekranında düzgün çiziliyorken. Ekranlar
// arasındaki bu tutarsızlığın sebebi teknikti, ürün kararı değil.
export default function InlineActionMessage({ text, onQuiz, onTopic, disabled = false }) {
  const segments = parseInlineActions(text);

  return (
    <>
      {segments.map((seg, i) => {
        if (seg.kind === 'quiz') {
          return (
            <button
              key={i}
              type="button"
              disabled={disabled}
              onClick={() => onQuiz?.(seg.topic, seg.count)}
              className="inline-action inline-action--quiz"
            >
              <Sparkles size={13} aria-hidden="true" /> {seg.topic} · {seg.count} soru
            </button>
          );
        }
        if (seg.kind === 'topic') {
          return (
            <button
              key={i}
              type="button"
              disabled={disabled}
              onClick={() => onTopic?.(seg.title)}
              className="inline-action inline-action--topic"
            >
              <BookOpen size={13} aria-hidden="true" /> {seg.title}
            </button>
          );
        }
        // inline: bu segmentler pill'lerle AYNI satırın parçası — blok eleman akışı bozar.
        return <MathMarkdown key={i} inline>{seg.text}</MathMarkdown>;
      })}
    </>
  );
}
