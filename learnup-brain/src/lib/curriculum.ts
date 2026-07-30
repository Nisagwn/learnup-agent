import { supabase } from '../clients/supabase.js'
import { redisTry } from '../clients/redis.js'

const KONU_ESIK = 0.45
const CACHE_TTL_S = 300 // 5 dk — konu↔kazanım eşlemesi nispeten kararlı

export type KazanimNode = {
  id: number
  code: string | null
  title: string
  path: string
  subject: string
  grade: number | null
}

/** Kazanım düğümünü id ile çözer (Mikro test + segment kurma). */
export async function resolveKazanim(id: number): Promise<KazanimNode | null> {
  const { data, error } = await supabase
    .from('curriculum_nodes')
    .select('id, code, title, path, subject, grade')
    .eq('id', id)
    .eq('node_type', 'kazanim')
    .maybeSingle()
  if (error) throw error
  return (data as KazanimNode | null) ?? null
}

/**
 * SERBEST METİN KONU → KAZANIM (hat birleştirmesinin köprüsü).
 *
 * Eski pratik akışı (practice/next) kazanım bilmiyor; istemciden serbest metin
 * `subject` + `topic`/`sub_topic` geliyor ("Matematik" / "Türev"). Denetimli üretim hattı ise
 * kazanım-tabanlı (grounding ltree path'e, exemplar kazanım başlığına dayanıyor). Köprü bu:
 * konu metnini embed edip o DERSİN kazanımları içinde en yakınını buluruz.
 *
 * Eşik ŞART. Eşiksiz eşleme, ilgisiz bir kazanımın grounding'iyle soru üretmek demektir —
 * ki bu, denetimsiz üretimden bile kötüdür (yanlış müfredat dayanağıyla "doğrulanmış" soru).
 * Eşiğin altında null döner ve çağıran ESKİ yola düşer (denetimsiz ama en azından dürüst).
 *
 * Not: soru ETİKETLEME işinde bu yaklaşımı reddetmiştik (ingest-sorular) çünkü orada
 * 2018-2025 eski müfredat konularını 2026 kazanımlarına eşliyorduk ve ders sınırları
 * değişmişti. Burada durum farklı: aynı ders içinde, canlı bir konu adını kendi müfredatının
 * kazanımına bağlıyoruz — ve eşik altı kalırsa hiçbir şey uydurmuyoruz.
 */
function cacheKey(subject: string, topic: string): string {
  return `lb:konu:${subject}:${topic}`
}

export async function resolveKazanimByTopic(
  subject: string,
  topic: string,
): Promise<{ node: KazanimNode; similarity: number } | null> {
  if (!subject || !topic) return null

  const key = cacheKey(subject, topic)
  const cached = await redisTry<string | null>(async (r) => r.get(key), null)
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as { node: KazanimNode; similarity: number }
      if (parsed.similarity >= KONU_ESIK) return parsed
    } catch { /* cache bozuksa devam et */ }
  }

  const { embed } = await import('./rag.js') // döngüsel import'u kır (rag → curriculum yok ama tedbir)
  const [qv] = await embed([`${subject} ${topic}`])

  const { data, error } = await supabase.rpc('match_yks_knowledge', {
    query_embedding: qv,
    filter_subject: subject,
    filter_paths: [],
    match_count: 1,
  })
  if (error) throw error
  const top = (data ?? [])[0] as { kazanim_code: string | null; similarity: number } | undefined
  if (!top?.kazanim_code || top.similarity < KONU_ESIK) return null

  const { data: node } = await supabase
    .from('curriculum_nodes')
    .select('id, code, title, path, subject, grade')
    .eq('subject', subject)
    .eq('code', top.kazanim_code)
    .maybeSingle()
  if (!node) return null

  const result = { node: node as KazanimNode, similarity: top.similarity }
  void redisTry(async (r) => r.set(key, JSON.stringify(result), 'EX', CACHE_TTL_S), undefined)
  return result
}

export type WeakPath = {
  subject: string
  kazanimId: number
  code: string | null
  title: string
  path: string
  wrongRate: number
}

/** Öğrencinin kronik zayıf kazanım alt-ağaçları (Mezo test + Context Injection). */
export async function getWeakPaths(userId: string, limit = 4): Promise<WeakPath[]> {
  const { data, error } = await supabase.rpc('weak_kazanimlar', { p_user_id: userId, p_limit: limit })
  if (error) throw error
  const rows = (data ?? []) as Array<{
    subject: string
    kazanim_id: number
    code: string | null
    title: string
    path: string
    wrong_rate: number
  }>
  return rows.map((r) => ({
    subject: r.subject,
    kazanimId: r.kazanim_id,
    code: r.code,
    title: r.title,
    path: r.path,
    wrongRate: r.wrong_rate,
  }))
}

export type BlueprintRow = { subject: string; questionCount: number }

/** ÖSYM deneme ders dağılımı (Makro test). */
export async function osymBlueprint(examType: 'TYT' | 'AYT'): Promise<BlueprintRow[]> {
  const { data, error } = await supabase
    .from('osym_blueprint')
    .select('subject, question_count')
    .eq('exam_type', examType)
  if (error) throw error
  const rows = (data ?? []) as Array<{ subject: string; question_count: number }>
  return rows.map((r) => ({ subject: r.subject, questionCount: r.question_count }))
}
