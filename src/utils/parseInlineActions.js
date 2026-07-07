// Bot yanıtındaki [QUIZ:konu:adet] ve [KONU:başlık] etiketlerini parse eder.
// Backend getAIResponse bu etiketleri yanıt metnine gömüyor; web client onları
// tıklanabilir aksiyonlara çevirmek için segmentlere böler (mobil ile birebir).

const ACTION_RE = /\[(QUIZ|KONU):([^\]]+)\]/g;

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

/**
 * @param {string} text
 * @returns {Array<
 *   { kind:'text', text:string } |
 *   { kind:'quiz', topic:string, count:number, raw:string } |
 *   { kind:'topic', title:string, raw:string }
 * >}
 */
export default function parseInlineActions(text) {
  const str = typeof text === 'string' ? text : '';
  const segments = [];
  let lastIndex = 0;
  let m;
  ACTION_RE.lastIndex = 0;

  while ((m = ACTION_RE.exec(str)) !== null) {
    const [raw, kind, body] = m;

    // Etiketten önceki düz metin
    if (m.index > lastIndex) {
      segments.push({ kind: 'text', text: str.slice(lastIndex, m.index) });
    }

    if (kind === 'QUIZ') {
      const parts = body.split(':');
      const topic = (parts[0] || '').trim() || 'genel';
      const count = clamp(parseInt(parts[1] ?? '5', 10) || 5, 1, 20);
      segments.push({ kind: 'quiz', topic, count, raw });
    } else {
      // KONU — başlık boşsa segment ekleme (etiket yine de metinden düşürülür)
      const title = body.trim();
      if (title) segments.push({ kind: 'topic', title, raw });
    }

    lastIndex = m.index + raw.length;
  }

  // Son etiketten sonraki düz metin
  if (lastIndex < str.length) {
    segments.push({ kind: 'text', text: str.slice(lastIndex) });
  }

  // Hiç eşleşme yoksa (veya boş metin) tek text segment döndür — mevcut davranış korunur
  if (segments.length === 0) {
    return [{ kind: 'text', text: str }];
  }

  return segments;
}
