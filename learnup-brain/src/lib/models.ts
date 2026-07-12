/**
 * Model + boyut sabitleri — tek kaynak-hakikat.
 * Model veya embedding boyutu değişecekse YALNIZ burası (ve DB kolonu) değişir → sessiz drift önlenir.
 */

/** OpenRouter model slug'ları. */
export const MODELS = {
  /** Soru üretimi. F3: slug'ı canlı OpenRouter kataloğuyla doğrula. */
  GENERATE: 'deepseek/deepseek-chat',
  /** Bağımsız doğrulama (reasoner — muhakeme kritik). */
  VERIFY: 'deepseek/deepseek-r1',
  /** Hızlı/ucuz: contextual önek, sınıflama, bellek brief. */
  FAST: 'deepseek/deepseek-chat',
} as const

/** Embeddings — text-embedding-3-small, OpenRouter üzerinden (OpenAI faturası kullanılmaz). */
export const EMBED_MODEL = 'openai/text-embedding-3-small' as const

/** Vektör boyutu. F1: embeddings çağrısına `dimensions: EMBED_DIM` verilmezse 1536 döner. */
export const EMBED_DIM = 768 as const

/** Sıcaklık katmanları (OpenAI-uyumlu API `temperature` destekler). */
export const TEMP = {
  STRICT: 0.2, // doğrulama, deterministik
  DERIVE: 0.5, // türetme
  CREATIVE: 0.8, // özgün üretim
} as const

export type ModelKey = keyof typeof MODELS
