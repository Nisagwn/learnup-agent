import React from 'react';
import { Sparkles, BookOpen } from 'lucide-react';
import parseInlineActions from '../utils/parseInlineActions';

// Bot mesaj metnini segmentlere bölüp [QUIZ:..]/[KONU:..] etiketlerini
// tıklanabilir pill'lere çevirir. Düz metin segmentleri olduğu gibi render edilir
// (kapsayıcı bubble'daki whiteSpace:pre-line korunur).
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
        return <span key={i}>{seg.text}</span>;
      })}
    </>
  );
}
