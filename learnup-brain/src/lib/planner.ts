import { redis } from '../clients/redis.js'
import { supabase } from '../clients/supabase.js'
import { logger } from '../utils/logger.js'
import { effectiveMastery } from './mastery.js'

/**
 * PUSULA'nın deterministik optimizer'ı (§2.3) — 8-turlu LLM tool-loop'un halefi.
 *   skor(kazanım) = blueprint_ağırlığı × (1 − m_eff) × aciliyet × srs_vade_katsayısı
 * Greedy blok seçimi + serpiştirme (zayıf + SRS + komşu) + Nabız yük tavanı.
 * SIFIR LLM — anlatım (pusula_brief) tek çağrıyla agents/pusula.ts'te yapılır.
 */

export type PlanBlock = {
  kazanim_id: number
  title: string
  subject: string
  kind: 'yeni' | 'tekrar' | 'srs' | 'remediation'
  count: number
  difficulty: 'kolay' | 'orta' | 'zor'
}
export type PlanDay = { day: string; blocks: PlanBlock[]; tactic_notes: string[] }
export type Plan = { days: PlanDay[]; generated_at: string; inputs: Record<string, unknown> }

type ScoredNode = {
  nodeId: number
  title: string
  subject: string
  mEff: number
  score: number
  remediation: boolean
}

export async function buildPlan(userId: string): Promise<Plan> {
  // ── Girdiler ──
  const [{ data: mastery }, { data: blueprint }, { data: mem }, srsDue, loadCap] = await Promise.all([
    supabase
      .from('user_mastery')
      .select('node_id, mastery, stability, attempts, misconceptions, updated_at, curriculum_nodes(id, title, subject, path)')
      .eq('user_id', userId)
      .gte('attempts', 1)
      .limit(300),
    supabase.from('osym_blueprint').select('exam_type, subject, question_count'),
    supabase.from('student_memory').select('semantic').eq('user_id', userId).maybeSingle(),
    countSrsDue(userId),
    readLoadCap(userId),
  ])

  // Blueprint ağırlığı (TYT+AYT toplamı, ders bazında normalize)
  const bpBySubject = new Map<string, number>()
  let bpTotal = 0
  for (const b of blueprint ?? []) {
    bpBySubject.set(b.subject, (bpBySubject.get(b.subject) ?? 0) + b.question_count)
    bpTotal += b.question_count
  }
  const weightOf = (subject: string): number =>
    bpTotal > 0 ? ((bpBySubject.get(subject) ?? bpTotal / Math.max(1, bpBySubject.size)) / bpTotal) : 1

  // Aciliyet: sınav tarihine kalan gün (semantic'ten; yoksa 200 varsay)
  const semantic = (mem?.semantic ?? {}) as Record<string, unknown>
  const examDays = parseExamDays(semantic) ?? 200
  const urgency = Math.min(2, Math.max(0.5, 1 + (180 - examDays) / 180))

  // ── Skorlama ──
  const scored: ScoredNode[] = []
  for (const row of (mastery ?? []) as any[]) {
    const node = row.curriculum_nodes
    if (!node) continue
    const mEff = effectiveMastery(row.mastery, row.stability ?? 0, row.updated_at)
    const misconceptions = Array.isArray(row.misconceptions) ? row.misconceptions : []
    const hasOpenMisconception = misconceptions.some((m: any) => m?.status === 'open')
    const srsBoost = srsDue.subjects.has(String(node.subject).toLowerCase()) ? 1.2 : 1
    scored.push({
      nodeId: node.id,
      title: node.title,
      subject: node.subject,
      mEff,
      score: weightOf(node.subject) * (1 - mEff) * urgency * srsBoost * (hasOpenMisconception ? 1.5 : 1),
      remediation: hasOpenMisconception,
    })
  }
  scored.sort((a, b) => b.score - a.score)

  // ── Blok inşası: 7 gün, günde 2-4 blok (Nabız yük tavanı), serpiştirme ──
  const blocksPerDay = loadCap === 'micro' ? 2 : 4
  const days: PlanDay[] = []
  const queue = [...scored]
  const today = new Date()

  for (let d = 0; d < 7; d++) {
    const date = new Date(+today + d * 86_400_000).toISOString().slice(0, 10)
    const blocks: PlanBlock[] = []

    // 1) SRS hasadı her gün önce (vadesi gelen varsa)
    if (srsDue.count > 0 && d < srsDue.count / 5 + 1) {
      blocks.push({
        kazanim_id: 0, title: 'SRS tekrar destesi', subject: 'tekrar',
        kind: 'srs', count: Math.min(10, srsDue.count), difficulty: 'orta',
      })
    }
    // 2) Zayıf kazanımlar — remediation öncelikli; arzu edilen zorluk (%70-80 başarı)
    while (blocks.length < blocksPerDay && queue.length > 0) {
      const n = queue.shift()!
      blocks.push({
        kazanim_id: n.nodeId,
        title: n.title,
        subject: n.subject,
        kind: n.remediation ? 'remediation' : n.mEff < 0.4 ? 'yeni' : 'tekrar',
        count: loadCap === 'micro' ? 4 : 6,
        difficulty: n.mEff < 0.3 ? 'kolay' : n.mEff < 0.6 ? 'orta' : 'zor',
      })
    }
    const notes: string[] = []
    if (loadCap === 'micro') notes.push('Bugün hafif gün: kısa bloklar, yeni konu yok.')
    if (examDays < 60) notes.push('Sınav yaklaşıyor: süre tut — soru başına 90 saniye kuralı.')
    days.push({ day: date, blocks, tactic_notes: notes })
    if (queue.length === 0) break
  }

  const plan: Plan = {
    days,
    generated_at: new Date().toISOString(),
    inputs: { examDays, urgency, loadCap, srsDue: srsDue.count, scoredNodes: scored.length },
  }

  const { error } = await supabase.from('roadmaps').upsert(
    { user_id: userId, steps: plan as unknown as Record<string, unknown>, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  )
  if (error) throw error
  return plan
}

async function countSrsDue(userId: string): Promise<{ count: number; subjects: Set<string> }> {
  const { data } = await supabase
    .from('srs_cards')
    .select('subject')
    .eq('user_id', userId)
    .lte('next_review_at', new Date().toISOString())
    .limit(100)
  const subjects = new Set((data ?? []).map((r) => String(r.subject ?? '').toLowerCase()).filter(Boolean))
  return { count: (data ?? []).length, subjects }
}

async function readLoadCap(userId: string): Promise<'micro' | 'normal'> {
  if (!redis) return 'normal'
  try {
    const raw = await redis.get(`lb:affect:${userId}`)
    if (!raw) return 'normal'
    const affect = JSON.parse(raw) as { load_cap?: string }
    return affect.load_cap === 'micro' ? 'micro' : 'normal'
  } catch {
    return 'normal'
  }
}

function parseExamDays(semantic: Record<string, unknown>): number | null {
  for (const key of ['sinav_tarihi', 'exam_date', 'sinava_kalan_gun']) {
    const v = semantic[key]
    if (typeof v === 'number' && v > 0) return Math.round(v)
    if (typeof v === 'string') {
      const d = new Date(v)
      if (!Number.isNaN(+d)) {
        const days = Math.round((+d - Date.now()) / 86_400_000)
        if (days > 0) return days
      }
    }
  }
  logger.debug('sınav tarihi semantikte yok — 200 gün varsayıldı')
  return null
}
