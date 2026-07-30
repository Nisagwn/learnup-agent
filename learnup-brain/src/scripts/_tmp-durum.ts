import { supabase } from '../clients/supabase.js'

const { data, error } = await supabase.from('yks_ai_questions').select('subject, difficulty, verified')
if (error) { console.error(error.message); process.exit(1) }
const rows = (data ?? []) as Array<{ subject: string; difficulty: string | null; verified: boolean }>
const v = rows.filter((r) => r.verified)
const say = new Map<string, { kolay: number; orta: number; zor: number; bos: number }>()
for (const r of v) {
  if (!say.has(r.subject)) say.set(r.subject, { kolay: 0, orta: 0, zor: 0, bos: 0 })
  const c = say.get(r.subject)!
  const d = (r.difficulty ?? '').toLowerCase()
  if (d === 'kolay') c.kolay++
  else if (d === 'orta') c.orta++
  else if (d === 'zor') c.zor++
  else c.bos++
}
console.log('TOPLAM satır:', rows.length, '· verified:', v.length)
console.log('DERS'.padEnd(36) + 'KOLAY  ORTA   ZOR   BOŞ   TOP')
const t = { kolay: 0, orta: 0, zor: 0, bos: 0 }
for (const [s, c] of [...say.entries()].sort()) {
  t.kolay += c.kolay; t.orta += c.orta; t.zor += c.zor; t.bos += c.bos
  console.log(
    s.slice(0, 35).padEnd(36) +
    String(c.kolay).padStart(5) + String(c.orta).padStart(6) + String(c.zor).padStart(6) +
    String(c.bos).padStart(6) + String(c.kolay + c.orta + c.zor + c.bos).padStart(6),
  )
}
console.log(
  'TOPLAM'.padEnd(36) + String(t.kolay).padStart(5) + String(t.orta).padStart(6) +
  String(t.zor).padStart(6) + String(t.bos).padStart(6),
)
process.exit(0)
