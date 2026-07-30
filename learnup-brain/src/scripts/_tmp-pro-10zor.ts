/**
 * PRO PİLOTU — v4-pro yazar, 10 ZOR soru hedefi, 5 derse dağıtılmış (ders başına 2).
 *
 * NEDEN DAĞITIK: 10 soruyu tek kazanımdan istemek özgünlük kapısına takılır (aynı senaryonun
 * sayı-değişik tekrarı elenir) ve ölçüm modelin değil kapının ölçümü olur. Beş farklı ders =
 * üç ders ailesi (sayısal/kavramsal/metin) → düşünme yükü de temsilî olur.
 *
 * DENETÇİ BİLEREK PARALI (v4-flash): ücretsiz OpenRouter payı bugün tükendi ve denetçi
 * konuşamayınca kod soruyu REJECT sayıyor — o hâlde ölçüm modelin kalitesini değil kotayı
 * ölçerdi (bugün deepseek testinde tam bu oldu). Yazar≠denetçi kuralı korunur: pro ≠ flash.
 */
import { createHash } from 'node:crypto'
import { supabase } from '../clients/supabase.js'
import { generateVerifiedSet } from '../lib/generation.js'
import { maliyetTavani, maliyetHarcanan } from '../lib/model-router.js'
import { MEKANIZMALAR } from '../persona/osym.charter.js'

const TAVAN = Number(process.argv[2] ?? 0.75)
const DERS_BASINA = 2
const DERSLER = ['Fizik', 'Matematik', 'Biyoloji', 'Tarih', 'Türkçe'] // sayısal ×3, kavramsal, metin
maliyetTavani(TAVAN)

// Her dersten HİÇ SORUSU OLMAYAN bir kazanım seç — özgünlük kapısı ölçümü kirletmesin.
const { data: mevcutSorular } = await supabase
  .from('yks_ai_questions').select('kazanim_id').eq('verified', true)
const dolu = new Set((mevcutSorular ?? []).map((r) => (r as { kazanim_id: number | null }).kazanim_id))

type Node = { id: number; code: string | null; title: string; subject: string; path: string }
const secilen: Node[] = []
for (const ders of DERSLER) {
  const { data } = await supabase
    .from('curriculum_nodes').select('id, code, title, subject, path').eq('subject', ders).order('path')
  const aday = ((data ?? []) as Node[]).find((n) => !dolu.has(n.id) && n.code)
  if (aday) secilen.push(aday)
}

console.log(`\n=== PRO PİLOTU · hedef ${DERS_BASINA * secilen.length} ZOR soru · tavan $${TAVAN} ===`)
console.log(`Yazar: deepseek-v4-pro (paralı) · Denetçi: v4-flash (paralı, yazardan farklı)`)
console.log(`Kazanımlar: ${secilen.map((n) => n.code).join(', ')}\n`)

const t0 = Date.now()
let toplamKabul = 0
let toplamZor = 0
const satirlar: string[] = []

for (const node of secilen) {
  const oncekiUsd = maliyetHarcanan()
  const tk = Date.now()
  let set: Awaited<ReturnType<typeof generateVerifiedSet>> = []
  try {
    set = await generateVerifiedSet(
      {
        userId: '00000000-0000-0000-0000-000000000000',
        subject: node.subject,
        paths: [String(node.path)],
        kazanim: node.code ?? '',
        topic: node.title,
        difficulty: 'zor',
      },
      DERS_BASINA,
      'P2',
    )
  } catch (err) {
    console.log(`⛔ ${node.subject} ${node.code}: ${err instanceof Error ? err.message.slice(0, 90) : String(err)}`)
    break // maliyet tavanı ya da kalıcı arıza — kalanı deneme
  }
  const hucreUsd = maliyetHarcanan() - oncekiUsd
  const zor = set.filter((q) => q.zorluk === 'zor').length
  toplamKabul += set.length
  toplamZor += zor
  console.log(
    `${node.subject.padEnd(11)} ${(node.code ?? '').padEnd(13)} → kabul ${set.length}/${DERS_BASINA} · zor damgası ${zor} · $${hucreUsd.toFixed(4)} · ${((Date.now() - tk) / 1000).toFixed(0)} sn`,
  )
  for (const q of set) {
    const plan = (q.tasarim ?? '').toLocaleUpperCase('tr')
    satirlar.push(`   [${q.zorluk}] kalite ${q.quality}/5 · mekanizma ${MEKANIZMALAR.filter((m) => plan.includes(m)).length} · ${q.soru.replace(/\s+/g, ' ').slice(0, 90)}…`)
  }
  if (set.length) {
    const rows = set.map((q) => ({
      subject: node.subject, kazanim_id: node.id, question_text: q.soru, options: q.siklar,
      correct_option: q.dogru, solution: q.cozum, difficulty: q.zorluk || 'zor',
      verified: true, quality: q.quality, content_hash: createHash('md5').update(q.soru).digest('hex'),
    }))
    await supabase.from('yks_ai_questions').upsert(rows, { onConflict: 'content_hash', ignoreDuplicates: true })
  }
}

const usd = maliyetHarcanan()
console.log(`\n=== SONUÇ (${((Date.now() - t0) / 60000).toFixed(1)} dk) ===`)
for (const s of satirlar) console.log(s)
console.log(`\nKabul edilen soru : ${toplamKabul}/${DERS_BASINA * secilen.length}`)
console.log(`ZOR damgası alan  : ${toplamZor}`)
console.log(`TOPLAM HARCANAN   : $${usd.toFixed(4)}`)
console.log(`Kabul başına      : ${toplamKabul ? `$${(usd / toplamKabul).toFixed(4)}` : '—'}`)
console.log(`ZOR başına        : ${toplamZor ? `$${(usd / toplamZor).toFixed(4)}` : '— (zor damgası çıkmadı, fatura yine ödendi)'}`)
process.exit(0)
