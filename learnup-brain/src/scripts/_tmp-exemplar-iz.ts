/** _tmp-exemplar-iz.ts — retrieveExemplars'ın MAT.9.2.3'te neden 0 döndürdüğünü aşama aşama izle. */
import { supabase } from '../clients/supabase.js'
import { embed } from '../lib/rag.js'
import { gorselBagimli } from '../utils/soru-saglik.js'

const { data: k } = await supabase.from('curriculum_nodes').select('subject,title,code').eq('code', 'MAT.9.2.3').single()
const query = `${k!.subject} ${k!.title} ${k!.code} zor`
console.log('query:', query, '\n')
const qe = (await embed([query]))[0]
console.log('embed uzunluğu:', qe?.length ?? 'BOŞ')

const { data, error } = await supabase.rpc('match_yks_exemplars', {
  query_embedding: qe, filter_subject: k!.subject, filter_topic: null, filter_difficulty: 'zor', match_count: 12,
})
console.log('RPC döndü:', error ? 'HATA ' + error.message : (data?.length ?? 0) + ' satır')
if (data?.length) {
  console.log('  dönen satırların alanları:', Object.keys(data[0]).join(', '))
  console.log('  ilk 3 satır: subject / difficulty / question_text[0:45]')
  for (const r of data.slice(0, 3)) console.log(`    subj=${r.subject} diff=${r.difficulty} · ${(r.question_text ?? '').slice(0, 45)}`)
  const saglam = data.filter((e: { question_text: string }) => !gorselBagimli(e.question_text))
  console.log('  gorselBagimli sonrası saglam:', saglam.length)
  const tutan = saglam.filter((e: { difficulty: string }) => e.difficulty === 'zor')
  console.log('  difficulty==="zor" (tutan):', tutan.length, '· joker:', saglam.length - tutan.length)
}
process.exit(0)
