import { supabase } from '../clients/supabase.js'
import { generateVerifiedSet, type TaggedQuestion } from './generation.js'
import { resolveKazanim, getWeakPaths, osymBlueprint } from './curriculum.js'

/** Mode-agnostik atom: tek kazanım/segment. */
export type Segment = {
  subject: string
  grade: number
  kazanimId: number
  kazanimCode: string
  path: string
  topic: string
  difficulty: string
  count: number
}

/** İstemciye servis edilen soru (havuzdan gelen `id` taşır; taze üretilen taşımaz). */
export type ServedQuestion = {
  id?: string
  soru: string
  siklar: Record<'A' | 'B' | 'C' | 'D' | 'E', string>
  dogru: string
  cozum: string | null
}

function poolRowToServed(row: {
  id: string
  question_text: string
  options: Record<'A' | 'B' | 'C' | 'D' | 'E', string>
  correct_option: string
  solution: string | null
}): ServedQuestion {
  return {
    id: row.id,
    soru: row.question_text,
    siklar: row.options,
    dogru: row.correct_option,
    cozum: row.solution,
  }
}

function taggedToServed(q: TaggedQuestion): ServedQuestion {
  return { soru: q.soru, siklar: q.siklar, dogru: q.dogru, cozum: q.cozum }
}

/**
 * Havuzdan (yks_questions) o kazanımın `verified` sorularını çek; eksiği generateVerifiedSet ile üret.
 * Her Segment tek kazanıma karşılık gelir → kazanim_id ile filtre (ltree alt-ağaç gerekmez).
 */
export async function assembleSegment(seg: Segment, userId: string): Promise<ServedQuestion[]> {
  // Kaynak ayrımı yasası (ürün kuralı #6): adaptif montaj YALNIZ AI-üretimi okur;
  // çıkmış sorular (osym_cikmis) ayrı serviste yaşar (/api/v1/questions/osym).
  const { data, error } = await supabase
    .from('yks_questions')
    .select('id, question_text, options, correct_option, solution')
    .eq('kazanim_id', seg.kazanimId)
    .eq('verified', true)
    .eq('source_type', 'ai_generated')
    .limit(seg.count)
  if (error) throw error

  const pool = ((data ?? []) as Parameters<typeof poolRowToServed>[0][]).map(poolRowToServed)
  if (pool.length >= seg.count) return pool.slice(0, seg.count)

  const need = seg.count - pool.length
  const generated = await generateVerifiedSet(
    {
      userId,
      subject: seg.subject,
      paths: [seg.path],
      kazanim: seg.kazanimCode,
      topic: seg.topic,
      difficulty: seg.difficulty,
    },
    need,
  )
  return [...pool, ...generated.map(taggedToServed)]
}

/** Mikro — öğrencinin seçtiği tek kazanım, nokta atışı. */
export async function buildMicroTest(p: {
  userId: string
  kazanimId: number
  difficulty: string
  count: number
}): Promise<ServedQuestion[]> {
  const k = await resolveKazanim(p.kazanimId)
  if (!k) throw new Error(`kazanım bulunamadı: ${p.kazanimId}`)
  const seg: Segment = {
    subject: k.subject,
    grade: k.grade ?? 0,
    kazanimId: k.id,
    kazanimCode: k.code ?? '',
    path: k.path,
    topic: k.title,
    difficulty: p.difficulty,
    count: p.count,
  }
  return assembleSegment(seg, p.userId)
}

/** Mezo — ajanın belirlediği N zayıf kazanım, sarmal (interleave). */
export async function buildMesoTest(p: { userId: string; totalCount: number }): Promise<ServedQuestion[]> {
  const weak = await getWeakPaths(p.userId, 4)
  if (weak.length === 0) return []
  const per = Math.max(1, Math.floor(p.totalCount / weak.length))

  const groups = await Promise.all(
    weak.map(async (w) => {
      const k = await resolveKazanim(w.kazanimId)
      const seg: Segment = {
        subject: w.subject,
        grade: k?.grade ?? 0,
        kazanimId: w.kazanimId,
        kazanimCode: w.code ?? '',
        path: w.path,
        topic: k?.title ?? w.title,
        difficulty: 'orta',
        count: per,
      }
      return assembleSegment(seg, p.userId)
    }),
  )
  return interleave(groups).slice(0, p.totalCount)
}

/** Makro — ÖSYM blueprint ders dağılımı; çoğunlukla havuzdan servis (top-up arka-plan job'ı). */
export async function buildMacroTest(p: {
  userId: string
  examType: 'TYT' | 'AYT'
}): Promise<{ questions: ServedQuestion[]; timeLimitSec: number }> {
  const blueprint = await osymBlueprint(p.examType)
  const groups = await Promise.all(
    blueprint.map((b) => assembleBySubjectFromPool(b.subject, b.questionCount)),
  )
  const timeLimitSec = p.examType === 'TYT' ? 165 * 60 : 180 * 60
  return { questions: groups.flat(), timeLimitSec }
}

/** Makro için: bir dersin havuzundaki verified sorulardan çek (kazanım-agnostik). */
async function assembleBySubjectFromPool(subject: string, count: number): Promise<ServedQuestion[]> {
  const { data, error } = await supabase
    .from('yks_questions')
    .select('id, question_text, options, correct_option, solution')
    .eq('subject', subject)
    .eq('verified', true)
    .eq('source_type', 'ai_generated')   // kaynak ayrımı yasası (#6)
    .limit(count)
  if (error) throw error
  return ((data ?? []) as Parameters<typeof poolRowToServed>[0][]).map(poolRowToServed)
}

function interleave<T>(groups: T[][]): T[] {
  const out: T[] = []
  const max = groups.reduce((m, g) => Math.max(m, g.length), 0)
  for (let i = 0; i < max; i++) {
    for (const g of groups) {
      const item = g[i]
      if (item !== undefined) out.push(item)
    }
  }
  return out
}
