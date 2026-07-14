import { openrouter } from '../clients/openrouter.js'
import { supabase } from '../clients/supabase.js'
import { EMBED_MODEL, EMBED_DIM } from './models.js'

export type GroundingChunk = {
  id: number
  content: string
  context: string | null
  kazanim_code: string | null
  similarity: number
}

export type Exemplar = {
  question_text: string
  options: Record<string, string>
  correct_option: string
  solution: string
}

/**
 * Embeddings — text-embedding-3-small @768, OpenRouter üzerinden (OpenAI faturası kullanılmaz).
 * F1 DRIFT-GUARD: `dimensions: EMBED_DIM` verilmezse model 1536 döner → `vector(768)` insert patlar.
 * Dönen her vektörün uzunluğu DB'ye gitmeden SERT doğrulanır (fail-fast).
 */
/** Embedding çağrısı için timeout. Router'daki LLM çağrılarının aksine embeddings doğrudan
 *  SDK'ya gidiyor — ve OpenAI SDK varsayılanı `timeout: 600_000` (10 dk) + `maxRetries: 2`,
 *  yani takılan tek bir istek ~30 DAKİKA asılı kalabilir. embed() sohbetin sıcak yolunda
 *  (recallMemories) ve her üretim turunda çağrılıyor → tek bir yavaş embedding tüm isteği
 *  rehin alır. 20 sn fazlasıyla yeterli; aşarsa çağıran hata alır ve isteği bırakır. */
const EMBED_TIMEOUT_MS = 20_000

export async function embed(texts: string[]): Promise<number[][]> {
  const res = await openrouter.embeddings.create(
    {
      model: EMBED_MODEL,
      input: texts,
      dimensions: EMBED_DIM,
    },
    { timeout: EMBED_TIMEOUT_MS, maxRetries: 1 },
  )
  const vectors = res.data.map((d) => d.embedding)
  for (const v of vectors) {
    if (v.length !== EMBED_DIM) {
      throw new Error(`EMBED_DIM drift: beklenen ${EMBED_DIM}, gelen ${v.length}`)
    }
  }
  return vectors
}

/** Grounding retrieval — ltree ön-ekli + vektör sıralı (match_yks_knowledge RPC).
 *  `qvec` verilirse embed ATLANIR. generateVerifiedSet grounding ve exemplar için BİREBİR
 *  AYNI sorgu dizesini kullanıyor; iki kez embed etmek bedava değil (ağ + token). */
export async function retrieveGrounding(p: {
  subject: string
  paths: string[]
  query: string
  qvec?: number[]
  k?: number
}): Promise<GroundingChunk[]> {
  const qe = p.qvec ?? (await embed([p.query]))[0]
  const { data, error } = await supabase.rpc('match_yks_knowledge', {
    query_embedding: qe,
    filter_subject: p.subject,
    filter_paths: p.paths,
    match_count: p.k ?? 8,
  })
  if (error) throw error
  return (data ?? []) as GroundingChunk[]
}

/** Exemplar retrieval — altın ÖSYM soruları (match_yks_exemplars RPC). */
export async function retrieveExemplars(p: {
  subject: string
  topic: string
  difficulty: string
  query: string
  qvec?: number[]
  k?: number
}): Promise<Exemplar[]> {
  const qe = p.qvec ?? (await embed([p.query]))[0]
  const { data, error } = await supabase.rpc('match_yks_exemplars', {
    query_embedding: qe,
    filter_subject: p.subject,
    filter_topic: p.topic,
    filter_difficulty: p.difficulty,
    match_count: p.k ?? 4,
  })
  if (error) throw error
  return (data ?? []) as Exemplar[]
}
