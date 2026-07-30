/** SONDA: zor siparişinde yazar [TASARIM] planını yazıyor mu? (çıktı sözleşmesi düzeltmesinin sınavı) */
import { supabase } from '../clients/supabase.js'
import { generateQuestions } from '../lib/generation.js'
import { embed, retrieveGrounding, retrieveExemplars } from '../lib/rag.js'
import { MEKANIZMALAR } from '../persona/osym.charter.js'

const KOD = process.argv[2] ?? 'FİZ.10.4.3'
const { data: node } = await supabase
  .from('curriculum_nodes').select('id, code, title, subject, path').eq('code', KOD).maybeSingle()
if (!node) { console.error('kazanım bulunamadı:', KOD); process.exit(1) }

const query = `${node.subject} ${node.title} ${node.code} zor`
const [qvec] = await embed([query])
const [grounding, exemplars] = await Promise.all([
  retrieveGrounding({ subject: node.subject, paths: [String(node.path)], query, qvec }),
  retrieveExemplars({ subject: node.subject, topic: node.title, difficulty: 'zor', query, qvec }),
])

const t0 = Date.now()
const adaylar = await generateQuestions({
  userId: '00000000-0000-0000-0000-000000000000',
  subject: node.subject, kazanim: node.code ?? '', topic: node.title,
  difficulty: 'zor', count: 1, grounding, exemplars, priority: 'P2',
})
console.log(`\n=== ${KOD} · ${((Date.now() - t0) / 1000).toFixed(0)} sn · aday ${adaylar.length} ===`)
for (const q of adaylar) {
  const plan = (q.tasarim ?? '').toLocaleUpperCase('tr')
  const bulunan = MEKANIZMALAR.filter((m) => plan.includes(m))
  console.log(`[TASARIM] ${q.tasarim ?? '(YOK)'}`)
  console.log(`  → tanınan mekanizma: ${bulunan.length} ${bulunan.length ? `(${bulunan.join(' + ')})` : ''}`)
  console.log(`  → yazarın [ZORLUK] iddiası: ${q.zorluk || '(boş)'}`)
  console.log(`  → kök: ${q.soru.slice(0, 140)}…`)
}
process.exit(0)
