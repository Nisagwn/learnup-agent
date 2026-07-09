// AI — OpenRouter üzerinden DeepSeek (OpenAI-uyumlu API) + soru üretim modları + ayrıştırıcı.
// Model: deepseek/deepseek-chat (DeepSeek V3). Secret: OPENROUTER_API_KEY.

export const GEN_MODEL = 'deepseek/deepseek-chat';   // soru üretimi
export const CHAT_MODEL = 'deepseek/deepseek-chat';  // sohbet + dinamik ipucu

export async function llmChat(messages: any[], opts: { model?: string; temperature?: number; max_tokens?: number } = {}) {
  const apiKey = Deno.env.get('OPENROUTER_API_KEY');
  if (!apiKey) throw new Error('OPENROUTER_API_KEY eksik (Supabase secret olarak ekle).');
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      'HTTP-Referer': 'https://learnup.app', // OpenRouter sıralaması için opsiyonel
      'X-Title': 'LearnUp',
    },
    body: JSON.stringify({
      model: opts.model || CHAT_MODEL,
      messages,
      temperature: opts.temperature ?? 0.5,
      max_tokens: opts.max_tokens ?? 1024,
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`OpenRouter ${res.status}: ${t.slice(0, 200)}`);
  }
  const j = await res.json();
  return j.choices?.[0]?.message?.content || '';
}

// ─── Satır-etiketli soru ayrıştırıcı ([SORU]/[A]..[D]/[DOGRU]/[ACIKLAMA]) ──────
export function parseTaggedQuestions(text: string) {
  const tagMap: Record<string, string> = { SORU: 'q', A: 'a', B: 'b', C: 'c', D: 'd', DOGRU: 'correct', ACIKLAMA: 'exp' };
  const blocks: any[] = [];
  let cur: any = null, lastKey: string | null = null;
  for (const line of String(text || '').split(/\r?\n/)) {
    const m = line.match(/^\s*\[\s*(SORU|A|B|C|D|DOGRU|ACIKLAMA)\b[^\]]*\]\s*(.*)$/i);
    if (m) {
      const key = tagMap[m[1].toUpperCase()];
      if (key === 'q') { if (cur && cur.q) blocks.push(cur); cur = { q: '', a: '', b: '', c: '', d: '', correct: '', exp: '' }; }
      if (cur) { cur[key] = m[2].trim(); lastKey = key; }
    } else if (cur && lastKey && line.trim()) cur[lastKey] += ' ' + line.trim();
  }
  if (cur && cur.q) blocks.push(cur);
  const letterIdx: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };
  return blocks.map((c) => {
    const options = [c.a, c.b, c.c, c.d].map((o: string) => (o || '').trim());
    if (!c.q.trim() || options.some((o: string) => !o)) return null;
    if (new Set(options).size !== 4) return null;
    const idx = letterIdx[(c.correct || '').trim().toUpperCase().charAt(0)];
    if (idx == null) return null;
    return { question_text: c.q.trim(), options, correct_answer: options[idx], explanation: (c.exp || '').trim() };
  }).filter(Boolean) as any[];
}

// ─── Üretim modları ────────────────────────────────────────────────────────────
export const GEN_MODES = { STRICT_CURRICULUM: 'strict', ANALYZE_AND_DERIVE: 'derive', CREATIVE_FREE: 'creative' };
const VALID_MODES = new Set(Object.values(GEN_MODES));
export const resolveMode = (mode: string) => {
  const m = String(mode || '').toLowerCase().trim();
  return VALID_MODES.has(m) ? m : GEN_MODES.STRICT_CURRICULUM;
};

const OUTPUT_FORMAT = `Her soruyu AYNEN aşağıdaki formatta ver. Her etiket ayrı bir satırda olsun; numara, başlık veya ek açıklama YAZMA. Sorular arasına bir boş satır koy:

[SORU] soru metni
[A] birinci şık
[B] ikinci şık
[C] üçüncü şık
[D] dördüncü şık
[DOGRU] doğru şıkkın harfi (A, B, C veya D)
[ACIKLAMA] kısa çözüm açıklaması`;

const COMMON_RULES = `Her sorunun 4 şıkkı (A, B, C, D) olmalı; şıklar birbirinden FARKLI olmalı ve sorunun YALNIZCA TEK bir doğru cevabı bulunmalı.
Matematik/fizik formüllerini LaTeX olarak $...$ arasında yaz.
SORU KALIBI ZORUNLU: Soru metnini bir soru cümlesiyle kur ve "?" ile bitir. Emir kipi ("bulunuz", "hesaplayınız") KULLANMA.
ÇEŞİTLİLİK ZORUNLU: Soruları farklı bakış açılarından kur; aynı kalıbı tekrarlama.`;

const SYSTEM = 'Sen LearnUp asistanısın. Lise müfredatına hakimsin ve istenen çıktı formatına harfiyen uyarsın.';

function renderSamplesAsFewShot(samples: any[]): string {
  if (!Array.isArray(samples) || samples.length === 0) return '';
  return samples.slice(0, 5).map((s) => {
    const opts = Array.isArray(s.options) ? s.options : [];
    const letters = ['A', 'B', 'C', 'D'];
    const correctIdx = opts.findIndex((o: string) => o === (s.correct_answer ?? s.correctAnswer));
    const correctLetter = letters[correctIdx >= 0 ? correctIdx : 0];
    const lines = [`[SORU] ${s.question_text || s.text || ''}`];
    letters.forEach((L, i) => lines.push(`[${L}] ${opts[i] || ''}`));
    lines.push(`[DOGRU] ${correctLetter}`);
    if (s.explanation) lines.push(`[ACIKLAMA] ${s.explanation}`);
    return lines.join('\n');
  }).join('\n\n');
}

export function buildModePromptConfig(mode: string, opts: any = {}) {
  const resolved = resolveMode(mode);
  const { subject = 'Genel', topic = subject, grade = '10', difficulty = 'orta', count = 1, samples = [] } = opts;
  const gradeStr = String(grade || '10');
  const head = `Lise ${gradeStr}. sınıf müfredatına uygun, TÜRKÇE, ${subject} dersi, "${topic}" konusuna ait, ${difficulty} zorlukta ${count} adet çoktan seçmeli soru üret.`;
  if (resolved === GEN_MODES.ANALYZE_AND_DERIVE) {
    const fewShot = renderSamplesAsFewShot(samples);
    const intro = fewShot ? `Aşağıda aynı kazanıma ait ONAYLI örnek sorular var. Bunları İNCELE; tarzını koru ama KOPYALAMA — yeni, özgün sorular TÜRET.\n\nÖrnekler:\n${fewShot}\n\n` : '';
    return { mode: resolved, system: SYSTEM, temperature: 0.65, prompt: `${intro}${head}\n${COMMON_RULES}\n\n${OUTPUT_FORMAT}` };
  }
  if (resolved === GEN_MODES.CREATIVE_FREE) {
    return { mode: resolved, system: SYSTEM, temperature: 0.85, prompt: `${head}\nSoruları disiplinlerarası ve gerçek yaşamdan bağlamlarla, yaratıcı bir kurguyla hazırla. Müfredat doğruluğundan taviz verme.\n${COMMON_RULES}\n\n${OUTPUT_FORMAT}` };
  }
  return { mode: GEN_MODES.STRICT_CURRICULUM, system: SYSTEM, temperature: 0.55, prompt: `${head}\nSoruları MEB müfredatı kazanımlarına sıkı bağlı hazırla; her soruya farklı bir kurgu kazandır.\n${COMMON_RULES}\n\n${OUTPUT_FORMAT}` };
}
