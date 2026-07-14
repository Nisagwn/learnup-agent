import { createHash } from 'node:crypto'
import { supabase } from '../clients/supabase.js'
import { generateVerifiedSet, type TaggedQuestion } from './generation.js'
import { resolveKazanim, getWeakPaths, osymBlueprint } from './curriculum.js'
import { logger } from '../utils/logger.js'

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
  // ⚠️ ZORLUK FİLTRESİ EKSİKTİ. seg.difficulty buraya kadar taşınıp yalnızca ÜRETİCİYE
  // veriliyordu; havuz sorgusuna hiç uygulanmıyordu. Yani "zor test istiyorum" diyen öğrenciye,
  // havuz doluysa o kazanımın KOLAY soruları dönüyordu. 0004 bunun için yq_serve_ai
  // (kazanim_id, difficulty) indeksini bile oluşturmuş — kod indeksin varlık sebebini kullanmıyordu.
  // Ayrıca .order() yoktu: her öğrenci hep aynı ilk N satırı, hep aynı sırada alıyordu.
  const { data, error } = await supabase
    .from('yks_questions')
    .select('id, question_text, options, correct_option, solution')
    .eq('kazanim_id', seg.kazanimId)
    .eq('verified', true)
    .eq('source_type', 'ai_generated')
    .eq('difficulty', seg.difficulty)
    .order('quality', { ascending: false })   // en iyi doğrulanmış sorular önce
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

  // ⚠️ ÜRETİLEN SORULAR HAVUZA YAZILMIYORDU — tekrar eden maliyetin TAMAMI buydu.
  // Bir kazanımın havuzu boşsa her istek soruları SIFIRDAN üretiyordu: üret → aday başına
  // bağımsız doğrula → onar. Öğrenciye verilip atılıyordu. Havuz asla ısınmıyordu; aynı
  // kazanım için gelen 100. istek de 1. istek kadar pahalıydı.
  // Artık yazılıyor → ikinci istek havuzdan okur, LLM'e hiç gitmez. Gece demirhanesinin
  // yaptığı işin aynısı, sadece talep anında.
  // Not: fazla üretilenler de yazılır (generateVerifiedSet artık kesmiyor) — parası ödenmiş
  // doğrulanmış soruyu çöpe atmanın anlamı yok; havuz zenginleşir.
  const hashById = new Map<string, string>() // content_hash → yks_questions.id
  if (generated.length) {
    const rows = generated.map((q) => ({
      subject: seg.subject,
      kazanim_id: seg.kazanimId,
      question_text: q.soru,
      options: q.siklar,
      correct_option: q.dogru,
      solution: q.cozum,
      difficulty: q.zorluk || seg.difficulty,
      verified: true,
      quality: q.quality,
      source_type: 'ai_generated',
      content_hash: createHash('md5').update(q.soru).digest('hex'),
    }))
    // upsert + ignoreDuplicates: düz insert TEK İFADEDİR, tek çift satır TÜM batch'i düşürür.
    const { error: insErr } = await supabase
      .from('yks_questions')
      .upsert(rows, { onConflict: 'content_hash', ignoreDuplicates: true })
    if (insErr) {
      logger.warn({ err: insErr, kazanimId: seg.kazanimId }, 'havuz yazımı başarısız — soru yine servis edilir')
    } else {
      // ⚠️ SERVİS EDİLEN SORU MUTLAKA id TAŞIMALI. Cevap geldiğinde sunucu doğruluğu
      // questionId ile DB'den doğruluyor (answers.ts). id'siz soru → doğrulanamaz → XP=0.
      // ignoreDuplicates satırları geri döndürmediği için id'leri hash ile ayrıca çekiyoruz.
      const { data: ids } = await supabase
        .from('yks_questions')
        .select('id, content_hash')
        .in('content_hash', rows.map((r) => r.content_hash))
      for (const r of (ids ?? []) as Array<{ id: string; content_hash: string }>) {
        hashById.set(r.content_hash, r.id)
      }
    }
  }

  const tazeler = generated.map((q) => {
    const served = taggedToServed(q)
    const id = hashById.get(createHash('md5').update(q.soru).digest('hex'))
    return id ? { ...served, id } : served
  })

  // Servis tarafı istenen sayıda keser (fazlası havuzda kalır, bir sonraki isteğe hazır).
  return [...pool, ...tazeler].slice(0, seg.count)
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
