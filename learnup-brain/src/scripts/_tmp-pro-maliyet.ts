/**
 * PRO MALİYET ÖLÇÜMÜ — v4-pro yazar olarak 2 zor soru; tam hat (üretim + kod kapıları + denetim
 * + onarım). Ölçüt token fiyatı DEĞİL, KABUL BAŞINA maliyettir: reddedilen aday da fatura öder.
 *
 * Zincir EZİLMEZ → varsayılan 'generate' (v4-pro) ve varsayılan 'verify' (ultra-550b:free önce).
 * Bu, deponun zor için kanonik yapılandırmasıdır; denetçi zaten yazardan farklı model.
 * Geçen adaylar havuza YAZILIR — parası ödenmiş doğrulanmış soru çöpe gitmesin.
 */
import { createHash } from 'node:crypto'
import { supabase } from '../clients/supabase.js'
import { generateVerifiedSet } from '../lib/generation.js'
import { maliyetTavani, maliyetHarcanan } from '../lib/model-router.js'
import { MEKANIZMALAR } from '../persona/osym.charter.js'

const KOD = process.argv[2] ?? 'FİZ.10.4.3'
const ZORLUK = process.argv[3] ?? 'zor'
const TAVAN = Number(process.argv[4] ?? 0.5)
maliyetTavani(TAVAN)

const { data: node } = await supabase
  .from('curriculum_nodes').select('id, code, title, subject, path').eq('code', KOD).maybeSingle()
if (!node) { console.error('kazanım bulunamadı:', KOD); process.exit(1) }

console.log(`\n=== PRO ÖLÇÜMÜ · ${node.subject} / ${KOD} · hedef 2 zor soru · tavan $${TAVAN} ===`)
const t0 = Date.now()
const set = await generateVerifiedSet(
  {
    userId: '00000000-0000-0000-0000-000000000000',
    subject: node.subject,
    paths: [String(node.path)],
    kazanim: node.code ?? '',
    topic: node.title,
    difficulty: ZORLUK,
  },
  2,
  'P2',
)
const sure = (Date.now() - t0) / 1000
const usd = maliyetHarcanan()

console.log(`\n=== SONUÇ (${sure.toFixed(0)} sn) ===`)
console.log(`Kapıları geçen soru: ${set.length}`)
for (const q of set) {
  const plan = (q.tasarim ?? '').toLocaleUpperCase('tr')
  const mek = MEKANIZMALAR.filter((m) => plan.includes(m))
  console.log(`  · hakem damgası: ${q.zorluk} · kalite ${q.quality}/5 · [TASARIM] ${q.tasarim ?? '(YOK)'} (${mek.length} mekanizma)`)
  console.log(`    kök: ${q.soru.replace(/\s+/g, ' ').slice(0, 120)}…`)
}
console.log(`\nTOPLAM HARCANAN: $${usd.toFixed(4)}`)
console.log(`KABUL BAŞINA:    ${set.length ? `$${(usd / set.length).toFixed(4)}` : '— (kabul yok, fatura yine ödendi)'}`)
const zorSayi = set.filter((q) => q.zorluk === ZORLUK).length
console.log(`"${ZORLUK}" damgası alan: ${zorSayi}/${set.length}${zorSayi ? ` → tutan soru başına $${(usd / zorSayi).toFixed(4)}` : ''}`)

if (set.length) {
  const rows = set.map((q) => ({
    subject: node.subject,
    kazanim_id: node.id,
    question_text: q.soru,
    options: q.siklar,
    correct_option: q.dogru,
    solution: q.cozum,
    difficulty: q.zorluk || ZORLUK,
    verified: true,
    quality: q.quality,
    content_hash: createHash('md5').update(q.soru).digest('hex'),
  }))
  const { data, error } = await supabase
    .from('yks_ai_questions')
    .upsert(rows, { onConflict: 'content_hash', ignoreDuplicates: true })
    .select('id')
  console.log(error ? `⚠️ havuza yazılamadı: ${error.message}` : `Havuza yazıldı: ${data?.length ?? 0} soru`)
}
process.exit(0)
