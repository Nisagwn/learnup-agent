import { routedText } from '../lib/model-router.js'
import { buildPlan, type Plan } from '../lib/planner.js'
import { PUSULA_BRIEF_SYSTEM } from '../persona/pusula.charter.js'
import { upsertBrief } from './katip.js'
import { logger } from '../utils/logger.js'
import type { AgentTask } from './bus.js'

/**
 * PUSULA — stratejist (§2.3). ESKİ 8-turlu LLM tool-loop ÖLDÜ:
 * plan artık deterministik optimizer'da (lib/planner.ts) kurulur — tekrarlanabilir,
 * ücretsiz-bütçe dostu. TEK LLM çağrısı planı Kaptan'ın masasına anlatıya çevirir.
 */

export type PusulaResult = { summary: string; turns: number }

export async function runPusula(userId: string): Promise<PusulaResult> {
  const plan = await buildPlan(userId)

  const brief = await annotatePlan(plan).catch((err) => {
    logger.warn({ err }, 'plan anlatımı üretilemedi — deterministik özet kullanılıyor')
    return deterministicBrief(plan)
  })

  await upsertBrief(userId, 'pusula', brief)
  logger.info({ userId, days: plan.days.length }, 'Pusula planı kuruldu (optimizer)')
  return { summary: brief, turns: 1 }
}

/** Atölye `plan` görev işleyicisi. */
export async function runPlanTask(task: AgentTask): Promise<unknown> {
  const result = await runPusula(task.userId)
  return { summary: result.summary }
}

/** Tek anlatım çağrısı: yapısal plan → Kaptan'ın metabolize edeceği kompakt brief (≤300 token). */
async function annotatePlan(plan: Plan): Promise<string> {
  const today = plan.days[0]
  const compact = {
    bugun: today?.blocks.map((b) => `${b.kind}:${b.title}(${b.count}s/${b.difficulty})`) ?? [],
    notlar: today?.tactic_notes ?? [],
    hafta: plan.days.length,
    girdiler: plan.inputs,
  }
  const text = await routedText('fast', {
    temperature: 0.4,
    max_tokens: 300,
    messages: [
      { role: 'system', content: PUSULA_BRIEF_SYSTEM }, // → persona/pusula.charter.ts
      { role: 'user', content: JSON.stringify(compact) },
    ],
  }, { priority: 'P1' })
  return text.trim() || deterministicBrief(plan)
}

function deterministicBrief(plan: Plan): string {
  const today = plan.days[0]
  if (!today || today.blocks.length === 0) return 'Bugün için planlanmış blok yok — önce tanışma testi gerekli.'
  const lines = today.blocks.map(
    (b, i) => `${i + 1}. ${b.kind === 'srs' ? 'SRS destesi' : b.title} — ${b.count} soru (${b.difficulty})`,
  )
  return `Bugünün rotası:\n${lines.join('\n')}${today.tactic_notes.length ? `\nNot: ${today.tactic_notes.join(' ')}` : ''}`
}
