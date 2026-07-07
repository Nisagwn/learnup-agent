// AI soru üretim modları — saf modül (Firebase importu yok).
// Üç mod da AYNI satır-etiketli çıktı sözleşmesini korur ([SORU]/[A]..[D]/[DOGRU]/[ACIKLAMA])
// böylece tek bir parseTaggedQuestions hepsini ayrıştırır.
//
//  • STRICT_CURRICULUM (default, T=0.3): MEB müfredatına sıkı bağlı.
//  • ANALYZE_AND_DERIVE (T=0.5): onaylı örneklerden few-shot ile yeni soru türetir.
//  • CREATIVE_FREE (T=0.85): disiplinlerarası, gerçek-yaşam bağlamlı.

const GEN_MODES = {
  STRICT_CURRICULUM: 'strict',
  ANALYZE_AND_DERIVE: 'derive',
  CREATIVE_FREE: 'creative',
};

const VALID_MODES = new Set(Object.values(GEN_MODES));

// Mod string'ini normalize eder; bilinmeyen → strict.
function resolveMode(mode) {
  const m = String(mode || '').toLowerCase().trim();
  return VALID_MODES.has(m) ? m : GEN_MODES.STRICT_CURRICULUM;
}

const OUTPUT_FORMAT = `Her soruyu AYNEN aşağıdaki formatta ver. Her etiket ayrı bir satırda olsun; numara, başlık veya ek açıklama YAZMA. Sorular arasına bir boş satır koy:

[SORU] soru metni
[A] birinci şık
[B] ikinci şık
[C] üçüncü şık
[D] dördüncü şık
[DOGRU] doğru şıkkın harfi (A, B, C veya D)
[ACIKLAMA] kısa çözüm açıklaması`;

const COMMON_RULES = `Her sorunun 4 şıkkı (A, B, C, D) olmalı; şıklar birbirinden FARKLI olmalı ve sorunun YALNIZCA TEK bir doğru cevabı bulunmalı.
Matematik/fizik formüllerini LaTeX olarak $...$ arasında yaz (örn: $f(x) = 3x^2$, $\\frac{d}{dx}$).
SORU KALIBI ZORUNLU: Soru metnini MUTLAKA bir soru cümlesiyle kur ve "?" ile bitir (örn: "...değeri kaçtır?", "...sonuç nedir?", "...aşağıdakilerden hangisidir?", "...kaç birimdir?"). Emir kipi KULLANMA — "bulunuz", "hesaplayınız", "yazınız", "gösteriniz", "çiziniz" gibi ifadeler YASAK; bunların yerine sonucu/cevabı soran bir soru cümlesi yaz.
ÇEŞİTLİLİK ZORUNLU: Aynı sette soruları FARKLI bakış açılarından kur ve aynı kalıbı/kurguyu tekrarlama. Şu açıları dönüşümlü kullan: kavram/tanım, işlem-uygulama, gerçek-yaşam veya disiplinlerarası bağlam, karşılaştırma, sonuçtan verilene geriye gitme, yaygın hata/yanılgı analizi, grafik/tablo yorumu. Her soru özgün bir senaryoya ve farklı sayısal kurguya sahip olsun; basmakalıp tek tip soru üretme.`;

const SYSTEM = 'Sen LearnUp asistanısın. Lise müfredatına hakimsin ve istenen çıktı formatına harfiyen uyarsın.';

// Onaylı örnek soruları few-shot bloğuna çevirir.
function renderSamplesAsFewShot(samples) {
  if (!Array.isArray(samples) || samples.length === 0) return '';
  const blocks = samples
    .slice(0, 5)
    .map((s) => {
      const opts = Array.isArray(s.options) ? s.options : [];
      const letters = ['A', 'B', 'C', 'D'];
      const correctIdx = opts.findIndex((o) => o === (s.correct_answer ?? s.correctAnswer));
      const correctLetter = letters[correctIdx >= 0 ? correctIdx : 0];
      const lines = [`[SORU] ${s.question_text || s.text || ''}`];
      letters.forEach((L, i) => lines.push(`[${L}] ${opts[i] || ''}`));
      lines.push(`[DOGRU] ${correctLetter}`);
      if (s.explanation) lines.push(`[ACIKLAMA] ${s.explanation}`);
      return lines.join('\n');
    })
    .join('\n\n');
  return blocks;
}

/**
 * buildModePromptConfig — moda göre { system, prompt, temperature, mode } üretir.
 * @param {string} mode  strict | derive | creative
 * @param {Object} opts  { subject, topic, grade, difficulty, count, samples }
 */
function buildModePromptConfig(mode, opts = {}) {
  const resolved = resolveMode(mode);
  const {
    subject = 'Genel',
    topic = subject,
    grade = '10',
    difficulty = 'orta',
    count = 1,
    samples = [],
  } = opts;

  const gradeStr = String(grade || '10');
  const head = `Lise ${gradeStr}. sınıf müfredatına uygun, TÜRKÇE, ${subject} dersi, "${topic}" konusuna ait, ${difficulty} zorlukta ${count} adet çoktan seçmeli soru üret.`;

  if (resolved === GEN_MODES.ANALYZE_AND_DERIVE) {
    const fewShot = renderSamplesAsFewShot(samples);
    // Örnek yoksa strict gövdeye düş ama sıcaklığı koru (üretim hiç başarısız olmasın).
    const analysisIntro = fewShot
      ? `Aşağıda aynı kazanıma ait ONAYLI örnek sorular var. Bunları İNCELE; tarzını, zorluğunu ve kazanımını koru ama KOPYALAMA — yeni, özgün sorular TÜRET.

Örnekler:
${fewShot}

`
      : '';
    return {
      mode: resolved,
      system: SYSTEM,
      temperature: 0.65,
      prompt: `${analysisIntro}${head}
${COMMON_RULES}

${OUTPUT_FORMAT}`,
    };
  }

  if (resolved === GEN_MODES.CREATIVE_FREE) {
    return {
      mode: resolved,
      system: SYSTEM,
      temperature: 0.85,
      prompt: `${head}
Soruları disiplinlerarası ve gerçek yaşamdan/güncel bağlamlardan ilham alarak, yaratıcı bir kurguyla hazırla. Ancak müfredat doğruluğundan ve aşağıdaki kurallardan ASLA taviz verme.
${COMMON_RULES}

${OUTPUT_FORMAT}`,
    };
  }

  // STRICT_CURRICULUM (default)
  return {
    mode: GEN_MODES.STRICT_CURRICULUM,
    system: SYSTEM,
    temperature: 0.55,
    prompt: `${head}
Soruları doğrudan MEB müfredatı kazanımlarına sıkı sıkıya bağlı kalarak hazırla; müfredat doğruluğundan taviz verme ama her soruya farklı bir bakış açısı/kurgu kazandır.
${COMMON_RULES}

${OUTPUT_FORMAT}`,
  };
}

module.exports = {
  GEN_MODES,
  resolveMode,
  renderSamplesAsFewShot,
  buildModePromptConfig,
};
