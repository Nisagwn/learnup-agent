import { supabase } from '../clients/supabase.js'
import { logger } from '../utils/logger.js'

/**
 * ATLAS'ın deterministik çekirdeği — BKT-lite ustalık güncellemesi (§2.2).
 * Her cevapta sync çalışır, SIFIR LLM. Topoloji curriculum_nodes'ta; bu modül
 * öğrenci-başına overlay'i (user_mastery) günceller.
 *
 *   expected = m·(1−slip) + (1−m)·guess     guess=0.2 (5 şık), slip=0.1
 *   m'       = m + K·(outcome − expected)   K=0.15 · yerleştirmede 0.3
 *   m_eff    = m·exp(−days/(7·(1+stability)))  ← okuma anında tembel çürüme
 */

export const GUESS = 0.2
export const SLIP = 0.1
export const K_DEFAULT = 0.15
export const K_PLACEMENT = 0.3
const SLOW_CREDIT_FACTOR = 0.5 // doğru ama 2× yavaş → yarım kredi
const STABILITY_GAIN = 0.1     // başarılı tekrar başına çürüme direnci
const STABILITY_MAX = 5

export type MasteryRow = {
  user_id: string
  node_id: number
  mastery: number
  stability: number
  attempts: number
  correct: number
  avg_latency_ms: number | null
  updated_at: string
}

/** Okuma anında çürüme-farkındalıklı etkin ustalık. */
export function effectiveMastery(mastery: number, stability: number, updatedAt: string | Date, now = new Date()): number {
  const days = Math.max(0, (+now - +new Date(updatedAt)) / 86_400_000)
  return mastery * Math.exp(-days / (7 * (1 + stability)))
}

/** Tek BKT-lite adımı (saf — test edilebilir). outcome ∈ [0,1]. */
export function bktStep(m: number, outcome: number, k: number): number {
  const expected = m * (1 - SLIP) + (1 - m) * GUESS
  const next = m + k * (outcome - expected)
  return Math.min(0.99, Math.max(0.01, next))
}

/**
 * Cevabı bilişsel grafa işle (user_mastery upsert).
 * İzole tasarım: hata durumunda loglar ve sessizce döner — cevap yazımını asla düşürmez.
 */
export async function updateMastery(p: {
  userId: string
  kazanimId: number
  correct: boolean
  durationMs?: number | null
  placement?: boolean
}): Promise<void> {
  try {
    const { data: row } = await supabase
      .from('user_mastery')
      .select('mastery, stability, attempts, correct, avg_latency_ms')
      .eq('user_id', p.userId)
      .eq('node_id', p.kazanimId)
      .maybeSingle()

    const prev = {
      mastery: row?.mastery ?? 0.25,
      stability: row?.stability ?? 0,
      attempts: row?.attempts ?? 0,
      correct: row?.correct ?? 0,
      avgLatency: row?.avg_latency_ms ?? null,
    }

    // Doğru-ama-yavaş yarım kredi: mevcut ortalamanın 2 katından uzun süren doğru cevap.
    let outcome: number = p.correct ? 1 : 0
    if (p.correct && p.durationMs && prev.avgLatency && p.durationMs > 2 * prev.avgLatency) {
      outcome = SLOW_CREDIT_FACTOR
    }

    const k = p.placement ? K_PLACEMENT : K_DEFAULT
    const nextMastery = bktStep(prev.mastery, outcome, k)
    const nextStability = p.correct
      ? Math.min(STABILITY_MAX, prev.stability + STABILITY_GAIN)
      : prev.stability
    // Gecikme EMA (α=0.3) — yarım-kredi eşiğinin bazı
    const nextAvgLatency = p.durationMs
      ? Math.round(prev.avgLatency ? 0.7 * prev.avgLatency + 0.3 * p.durationMs : p.durationMs)
      : prev.avgLatency

    const { error } = await supabase.from('user_mastery').upsert(
      {
        user_id: p.userId,
        node_id: p.kazanimId,
        mastery: nextMastery,
        stability: nextStability,
        attempts: prev.attempts + 1,
        correct: prev.correct + (p.correct ? 1 : 0),
        avg_latency_ms: nextAvgLatency,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,node_id' },
    )
    if (error) throw error
  } catch (err) {
    logger.warn({ err, userId: p.userId, kazanimId: p.kazanimId }, 'user_mastery güncellenemedi (izole)')
  }
}
