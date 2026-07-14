/**
 * AJAN DÖNGÜSÜ DUMANI — veriyolu gerçekten dönüyor mu?
 *
 * Neyi kanıtlar: enqueueTask → Redis Stream → worker XREADGROUP → CAS-claim →
 * handleTask → agent_tasks PENDING→RUNNING→COMPLETED → sonuç kalıcı.
 *
 * ÖN KOŞUL: worker AYRI process'te çalışıyor olmalı → bun src/workers/atolye.worker.ts
 *
 * KULLANIM:
 *   bun src/scripts/agent-smoke.ts --kind forge_topup --kod FİZ.12.1.5 --adet 2
 *   bun src/scripts/agent-smoke.ts --kind plan
 */
import { supabase } from '../clients/supabase.js'
import { enqueueTask, type TaskKind } from '../agents/bus.js'

const argv = process.argv.slice(2)
const arg = (n: string, d = ''): string => {
  const i = argv.indexOf(`--${n}`)
  return i >= 0 ? (argv[i + 1] ?? d) : d
}
const KIND = (arg('kind', 'forge_topup') || 'forge_topup') as TaskKind
const KOD = arg('kod', 'FİZ.12.1.5')
const ADET = Number(arg('adet', '2'))
const USER = arg('user', '00000000-0000-0000-0000-000000000000')

let payload: Record<string, unknown> = {}
let kazanimId: number | null = null

if (KIND === 'forge_topup' || KIND === 'topup') {
  const { data: k } = await supabase
    .from('curriculum_nodes').select('id, code, title').eq('code', KOD).single()
  if (!k) { console.error(`kazanım yok: ${KOD}`); process.exit(1) }
  kazanimId = k.id
  payload = { kazanimId: k.id, difficulty: 'orta', count: ADET }
  console.log(`Hedef: ${k.code} — ${k.title.slice(0, 55)}`)
}

const havuz = async (): Promise<number> => {
  if (!kazanimId) return 0
  const { count } = await supabase.from('yks_questions')
    .select('*', { count: 'exact', head: true })
    .eq('kazanim_id', kazanimId).eq('source_type', 'ai_generated').eq('verified', true)
  return count ?? 0
}

const havuzOnce = await havuz()
console.log(`Havuz (önce): ${havuzOnce}\n`)

const task = await enqueueTask({ userId: USER, kind: KIND, payload })
console.log(`▸ görev kuyruğa alındı: ${task.id}  (kind=${KIND})`)

// Durumu izle — Postgres = hakikat
const t0 = performance.now()
let son = ''
for (let i = 0; i < 240; i++) {          // 240 × 2sn = 8 dk tavan
  const { data } = await supabase
    .from('agent_tasks').select('status, result, error, attempts, locked_by').eq('id', task.id).single()
  const st = data?.status ?? '?'
  if (st !== son) {
    console.log(`  [${((performance.now() - t0) / 1000).toFixed(1)}sn] ${st}${data?.locked_by ? ` · ${data.locked_by}` : ''}`)
    son = st
  }
  if (st === 'COMPLETED' || st === 'FAILED') {
    console.log(`\nsonuç : ${JSON.stringify(data?.result ?? null)}`)
    if (data?.error) console.log(`hata  : ${data.error}`)
    console.log(`deneme: ${data?.attempts ?? 0}`)
    const sonra = await havuz()
    if (kazanimId) console.log(`havuz : ${havuzOnce} → ${sonra}  ${sonra > havuzOnce ? '✓ soru yazıldı' : '✗ havuz büyümedi'}`)
    process.exit(st === 'COMPLETED' ? 0 : 1)
  }
  await new Promise((r) => setTimeout(r, 2000))
}
console.error('\n⛔ ZAMAN AŞIMI — görev 8 dk içinde bitmedi. Worker çalışıyor mu?')
process.exit(1)
