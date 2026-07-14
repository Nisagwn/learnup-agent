/**
 * RAG DUMAN TESTİ — müfredat vektörleri gerçekten işe yarıyor mu?
 *
 * Her ders için gerçek bir öğrenci sorusu embed edilir, match_yks_knowledge ile aranır ve
 * dönen 1. sonucun O DERSE ait olup olmadığı denetlenir. Ayrıca ltree yol filtresi sınanır.
 *
 *   bun src/scripts/rag-smoke.ts
 */
import { supabase } from '../clients/supabase.js'
import { embed } from '../lib/rag.js'

// ── DB durumu ──
const { count: nodeCount } = await supabase.from('curriculum_nodes').select('*', { count: 'exact', head: true })
const { count: kbCount } = await supabase.from('yks_knowledge').select('*', { count: 'exact', head: true })

console.log('=== DB DURUMU ===')
console.log(`  curriculum_nodes : ${nodeCount}`)
console.log(`  yks_knowledge    : ${kbCount}`)

const { data: rows } = await supabase.from('curriculum_nodes').select('subject').limit(5000)
const say = new Map<string, number>()
for (const r of rows ?? []) say.set(r.subject as string, (say.get(r.subject as string) ?? 0) + 1)
console.log('\n  DERS BAŞINA:')
for (const [s, n] of [...say.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`    ${s.padEnd(38)} ${String(n).padStart(4)}`)
}

// ── Her dersten gerçek bir öğrenci sorusu ──
const SORULAR: Array<[string, string, string]> = [
  ['Fizik', 'FİZ', 'Newton’ın hareket yasaları ve sürtünme kuvveti nasıl çalışır?'],
  ['Kimya', 'KİM', 'Tepkimelerin entalpi değişimi bağ enerjileriyle nasıl hesaplanır?'],
  ['Matematik', 'MAT', 'İki nicel değişken arasındaki ilişkiyi nasıl modellerim?'],
  ['Biyoloji', 'BİY', 'DNA replikasyonu nasıl gerçekleşir?'],
  ['Coğrafya', 'COĞ', 'Nüfusun dağılışını etkileyen faktörler nelerdir?'],
  ['Tarih', 'TAR', 'Osmanlı Devleti’nin kuruluş süreci nasıl gelişti?'],
  ['Felsefe', 'FEL', 'Çevre etiği ve insan merkezci yaklaşım nedir?'],
  ['Din Kültürü ve Ahlak Bilgisi', 'DKAB', 'İslam düşüncesinde yorum farklılıklarının sebepleri nelerdir?'],
  ['T.C. İnkılap Tarihi ve Atatürkçülük', 'İTA', 'Atatürk Dönemi’nde eğitim alanında yapılan inkılaplar nelerdir?'],
  ['Türk Dili ve Edebiyatı', 'TDE', 'Bir şiirde imge ve sembolü nasıl çözümlerim?'],
]

console.log('\n\n=== RAG TESTİ (ders filtresiyle) ===')
let dogru = 0
for (const [subject, prefix, soru] of SORULAR) {
  const [qv] = await embed([soru])          // embed() TOPLU çalışır: string[] alır, number[][] döner
  const { data, error } = await supabase.rpc('match_yks_knowledge', {
    query_embedding: qv,
    filter_subject: subject,
    filter_paths: [],
    match_count: 3,
  })
  if (error) { console.log(`  ✗ [${subject}] RPC hatası — ${error.message}`); continue }
  const top = (data as Array<{ content: string; similarity: number }> | null)?.[0]
  const kod = String(top?.content ?? '').split(/\s/)[0]
  const ok = kod.startsWith(prefix)
  if (ok) dogru++
  console.log(`\n  ${ok ? '✓' : '✗'} ${soru}`)
  console.log(`      → ${kod}   benzerlik=${Number(top?.similarity ?? 0).toFixed(3)}`)
  console.log(`        ${String(top?.content ?? '').split('\n')[0].slice(0, 90)}`)
}

console.log(`\n${'─'.repeat(70)}`)
console.log(`SONUÇ: ${dogru}/${SORULAR.length} sorguda 1. sıradaki çıktı DOĞRU dersten geldi`)
if (dogru < SORULAR.length) process.exit(1)
