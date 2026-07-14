/**
 * ÜRETİM HATTI DUMANI — grounding + exemplar + generate + bağımsız verify zinciri
 * gerçekten uçtan uca çalışıyor mu?
 *
 * Neyi kanıtlar:
 *   1. retrieveGrounding  → 907 kazanımlık müfredattan doğru kazanım geliyor mu?
 *   2. retrieveExemplars  → 1730 çıkmış sorudan üslup örneği geliyor mu? (0009'un
 *      gevşettiği zorluk filtresi sayesinde; difficulty=NULL satırlar elenmemeli)
 *   3. generateVerifiedSet → üret → BAĞIMSIZ denetçi çöz → ACCEPT/REPAIR/REJECT
 *      kapılarından geçen soru çıkıyor mu?
 *
 * KULLANIM: bun src/scripts/gen-smoke.ts [--kod FİZ.12.1.3] [--zorluk orta] [--adet 2]
 */
import { supabase } from '../clients/supabase.js'
import { retrieveGrounding, retrieveExemplars } from '../lib/rag.js'
import { generateVerifiedSet } from '../lib/generation.js'

const argv = process.argv.slice(2)
const arg = (n: string, d: string): string => {
  const i = argv.indexOf(`--${n}`)
  return i >= 0 ? (argv[i + 1] ?? d) : d
}
const KOD = arg('kod', 'FİZ.12.1.3')
const ZORLUK = arg('zorluk', 'orta')
const ADET = Number(arg('adet', '2'))
const USER = '00000000-0000-0000-0000-000000000000'   // bağlamı boş öğrenci

const { data: k, error } = await supabase
  .from('curriculum_nodes').select('id, subject, code, title, path').eq('code', KOD).single()
if (error || !k) { console.error(`kazanım bulunamadı: ${KOD}`); process.exit(1) }

console.log('=== HEDEF ===')
console.log(`  ${k.code} · ${k.subject}`)
console.log(`  ${k.title}`)
console.log(`  path: ${k.path}  ·  zorluk: ${ZORLUK}  ·  istenen: ${ADET}\n`)

const query = `${k.subject} ${k.title} ${k.code} ${ZORLUK}`

// ── 1) GROUNDING ──
const g = await retrieveGrounding({ subject: k.subject, paths: [k.path], query })
console.log(`=== 1) GROUNDING — ${g.length} parça (müfredat gerçeği) ===`)
for (const c of g.slice(0, 3))
  console.log(`  [${c.similarity.toFixed(3)}] ${c.kazanim_code}  ${c.content.replace(/\s+/g, ' ').slice(0, 75)}…`)
if (!g.length) console.log('  ⛔ BOŞ — üretim müfredata bağlanamaz!')

// ── 2) EXEMPLAR ──
//    topic = KAZANIM BAŞLIĞI (RPC tam eşleşme yapar; ingest exemplar'ları böyle yazdı)
const e = await retrieveExemplars({ subject: k.subject, topic: k.title, difficulty: ZORLUK, query })
console.log(`\n=== 2) EXEMPLAR — ${e.length} çıkmış soru (üslup örneği) ===`)
for (const x of e)
  console.log(`  · ${x.question_text.replace(/\s+/g, ' ').slice(0, 75)}…  (doğru: ${x.correct_option})`)
if (!e.length) console.log('  ⚠ BOŞ — üretim üslup örneği olmadan çalışacak (0009 gevşetmesi tutmadı mı?)')

// ── 3) ÜRET + BAĞIMSIZ DOĞRULA ──
console.log(`\n=== 3) ÜRETİM (üret → bağımsız denetçi çözer → kapılar) ===`)
const t0 = performance.now()
const set = await generateVerifiedSet(
  { userId: USER, subject: k.subject, paths: [k.path], kazanim: k.code, topic: k.title, difficulty: ZORLUK },
  ADET,
)
const sn = ((performance.now() - t0) / 1000).toFixed(1)
console.log(`  ${set.length}/${ADET} soru TÜM kapıları geçti  ·  ${sn} sn\n`)

for (const [i, q] of set.entries()) {
  console.log('─'.repeat(78))
  console.log(`SORU ${i + 1}   (denetçi ÖSYM üslup puanı: ${q.quality}/5)`)
  console.log(q.soru.trim())
  for (const L of ['A', 'B', 'C', 'D', 'E'] as const) console.log(`  ${L}) ${q.siklar[L]}`)
  console.log(`  DOĞRU: ${q.dogru}   KAZANIM: ${q.kazanim}   ZORLUK: ${q.zorluk}`)
  console.log(`  ÇÖZÜM: ${(q.cozum ?? '').replace(/\s+/g, ' ').slice(0, 300)}`)
}
console.log('─'.repeat(78))
if (!set.length) console.log('\n⛔ HİÇBİR soru kapılardan geçemedi — üretim hattı çalışmıyor.')
process.exit(0)
