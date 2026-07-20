/**
 * Embedding + sıcaklık sabitleri — tek kaynak-hakikat.
 * Embedding boyutu değişecekse YALNIZ burası (ve DB kolonu) değişir → sessiz drift önlenir.
 *
 * ⚠️ SOHBET/ÜRETİM MODELLERİ BURADA DEĞİL. Buradaki `MODELS` sabiti kaldırıldı: kendini
 * "tek kaynak-hakikat" ilan ediyordu ama hiçbir yerden import edilmiyordu ve içeriği çürümüştü
 * (GENERATE: 'deepseek/deepseek-chat' derken üretim çoktan başka modele geçmişti). Rol→model
 * eşlemesinin GERÇEK kaynağı model-router.ts'teki CHAINS'tir (env'deki LLM_CHAIN_* ile ezilir);
 * modeli oradan seç, buraya ikinci bir liste koyma.
 */

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
