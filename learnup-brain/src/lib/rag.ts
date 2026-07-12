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
export async function embed(texts: string[]): Promise<number[][]> {
  const res = await openrouter.embeddings.create({
    model: EMBED_MODEL,
    input: texts,
    dimensions: EMBED_DIM,
  })
  const vectors = res.data.map((d) => d.embedding)
  for (const v of vectors) {
    if (v.length !== EMBED_DIM) {
      throw new Error(`EMBED_DIM drift: beklenen ${EMBED_DIM}, gelen ${v.length}`)
    }
  }
  return vectors
}

/** Grounding retrieval — ltree ön-ekli + vektör sıralı (match_yks_knowledge RPC). */
export async function retrieveGrounding(p: {
  subject: string
  paths: string[]
  query: string
  k?: number
}): Promise<GroundingChunk[]> {
  const [qe] = await embed([p.query])
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
  k?: number
}): Promise<Exemplar[]> {
  const [qe] = await embed([p.query])
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
