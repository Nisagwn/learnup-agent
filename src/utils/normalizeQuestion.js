// Farklı soru şemalarını (seed / AI / öğretmen / lokal JSON) tek biçime indirger.
// {text|question_text|question}, {options|choices}, {correctAnswer|correct_answer|answer}.
// Quiz UI yalnızca { text, options[], correctAnswer } sözleşmesine güvenir.
export function normalizeQuestion(raw) {
  if (!raw) return null;
  const options = Array.isArray(raw.options)
    ? raw.options
    : Array.isArray(raw.choices)
      ? raw.choices
      : Object.values(raw.options || {});
  let correctAnswer = raw.correctAnswer ?? raw.correct_answer ?? null;
  // Eski şema: correct_answer bir harf ('A'..'D') ve options bir map ise metne çevir
  if (
    correctAnswer != null &&
    typeof correctAnswer === 'string' &&
    correctAnswer.length === 1 &&
    raw.options &&
    !Array.isArray(raw.options) &&
    raw.options[correctAnswer] != null
  ) {
    correctAnswer = raw.options[correctAnswer];
  }
  // Lokal JSON / seed şeması: answer sayısal index
  if (correctAnswer == null && typeof raw.answer === 'number' && options[raw.answer] != null) {
    correctAnswer = options[raw.answer];
  }
  return {
    ...raw,
    text: raw.text || raw.question_text || raw.question || '',
    options,
    correctAnswer,
  };
}

export default normalizeQuestion;
