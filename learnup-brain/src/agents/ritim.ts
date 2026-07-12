import { generateVerifiedSet, type GenSpec } from '../lib/generation.js'
import { supabase } from '../clients/supabase.js'
import { logger } from '../utils/logger.js'
import { runCompact } from './katip.js'
import { runPlanTask } from './pusula.js'
import { runDiagnose, runClosureCheck } from './atlas.js'
import { runAffect, runNudge } from './nabiz.js'
import type { AgentTask } from './bus.js'

/**
 * Ritim işçi mantığı — bir görevi işler ve serileştirilebilir bir sonuç döndürür.
 * (Worker döngüsü `handleTask`'ı çağırır; RUNNING/COMPLETED/FAILED olaylarını worker yayınlar.)
 */
export async function handleTask(task: AgentTask): Promise<unknown> {
  switch (task.kind) {
    case 'topup':        // legacy alias
    case 'session':      // legacy alias
    case 'forge_topup':
      return handleTopup(task)
    case 'roadmap':
    case 'plan':
      return runPlanTask(task)
    case 'diagnose':
      return runDiagnose(task)
    case 'closure_check':
      return runClosureCheck(task)
    case 'affect':
      return runAffect(task)
    case 'nudge':
      return runNudge(task)
    case 'compact':
      return runCompact(task)
    default:
      return { error: `bilinmeyen görev türü: ${String(task.kind)}` }
  }
}

type TopupPayload = {
  subject?: string
  paths?: string[]
  kazanim?: string
  topic?: string
  difficulty?: string
  kazanimId?: number
  count?: number
}

/** Bir kazanımın havuzunu doğrulanmış sorularla doldurur (generate → verify do-loop). */
async function handleTopup(task: AgentTask): Promise<unknown> {
  const p = task.payload as TopupPayload
  const spec: GenSpec = {
    userId: task.userId,
    subject: p.subject ?? '',
    paths: Array.isArray(p.paths) ? p.paths : [],
    kazanim: p.kazanim ?? '',
    topic: p.topic ?? '',
    difficulty: p.difficulty ?? 'orta',
  }
  const target = typeof p.count === 'number' ? p.count : 5
  const set = await generateVerifiedSet(spec, target)

  if (set.length && typeof p.kazanimId === 'number') {
    const kazanimId = p.kazanimId
    const rows = set.map((q) => ({
      subject: spec.subject,
      kazanim_id: kazanimId,
      question_text: q.soru,
      options: q.siklar,
      correct_option: q.dogru,
      solution: q.cozum,
      difficulty: q.zorluk || spec.difficulty,
      verified: true,
      quality: q.quality,
      source_type: 'ai_generated', // kaynak ayrımı yasası (#6): demirhane YALNIZ AI yazar
    }))
    const { error } = await supabase.from('yks_questions').insert(rows)
    if (error) logger.error({ err: error, kazanimId }, 'yks_questions insert hata')
  }

  return { generated: set.length, kazanimId: p.kazanimId ?? null }
}
