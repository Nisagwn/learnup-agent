/**
 * ab-uretim.ts — İKİ YAZAR MODELİNİ AYNI HATTA KARŞILAŞTIR (sert maliyet tavanlı).
 *
 * `LLM_CHAIN_GENERATE=<slug> bun src/scripts/ab-uretim.ts --etiket pro --hedef 100 --tavan 0.20`
 *
 * NEDEN AYRI SCRIPT: havuz-doldur çok dersli, hedef-tamamlayıcı ve tavansızdır. Karşılaştırma
 * için gereken üç şey onda yok:
 *   1. TEK YAZAR MODELİ — zincir yedeğe düşerse ölçtüğün model artık o değildir; kol kirlenir.
 *      Bu yüzden zincir ENV'den TEK slug'a sabitlenir (yedeksiz: model düşerse kol durur, ki
 *      "bu model bu işi yapamıyor" da bir ölçüm sonucudur).
 *   2. SERT DOLAR TAVANI — `maliyetTavani` (model-router) çağrı GÖNDERİLMEDEN önce fırlatır.
 *   3. KOL KÜNYESİ — hangi soruyu hangi model yazdı, DB'de sütun yok; burada dosyaya yazılır.
 *
 * Denetçi her iki kolda AYNI kalır (nemotron-ultra:free, $0) — değişken tek olsun diye.
 * Yani ölçülen fark YAZARDAN gelir, hakemden değil.
 *
 * ⚠️ Tavan yalnız PARALI çağrıları sayar; ücretsiz denetçi tavanı yemez (doğru olan bu:
 * karşılaştırmanın maliyeti yazarın maliyetidir).
 */
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { supabase } from '../clients/supabase.js'
import { generateVerifiedSet } from '../lib/generation.js'
import { maliyetTavani, maliyetHarcanan, MaliyetTavaniAsildi } from '../lib/model-router.js'

const argv = process.argv.slice(2)
const arg = (n: string): string | undefined => {
  const i = argv.indexOf(`--${n}`)
  return i >= 0 ? argv[i + 1] : undefined
}
const ETIKET = arg('etiket') ?? 'kol'
const HEDEF = Number(arg('hedef') ?? 100)
const TAVAN = Number(arg('tavan') ?? 0.2)
const DERS = arg('ders') ?? 'Matematik'
const PER_CELL = Number(arg('perCell') ?? 3) // PARCA_TAVANI ile aynı — parçalanma olmasın
const ES_ZAMAN = Number(arg('esZaman') ?? 2)
/** SABİT-ZORLUK MODU (opsiyonel): verilirse tüm hücreler bu zorluğa gider (rotasyon yok) ve
 *  HEDEF'e yalnız ÖLÇÜLEN zorluğu tutan sorular sayılır → "10 gerçek zor" gibi ölçüm/pilot. */
const hedefZorluk = arg('zorluk')
if (hedefZorluk && !['kolay', 'orta', 'zor'].includes(hedefZorluk)) {
  console.error(`⛔ --zorluk geçersiz: "${hedefZorluk}" (kolay|orta|zor bekleniyor)`); process.exit(1)
}
const SYSTEM_USER = '00000000-0000-0000-0000-000000000000'

const ZINCIR = process.env.LLM_CHAIN_GENERATE
if (!ZINCIR) { console.error('⛔ LLM_CHAIN_GENERATE verilmedi — kol hangi modeli ölçecek belirsiz.'); process.exit(1) }
if (ZINCIR.includes(',')) { console.error('⛔ zincirde virgül var — kol TEK modelle koşmalı, yoksa yedeğe düşüp kirlenir.'); process.exit(1) }

maliyetTavani(TAVAN) // ← sert tavan devrede

type Node = { id: number; code: string | null; title: string; subject: string; path: string }
const { data: nodesRaw, error: nErr } = await supabase
  .from('curriculum_nodes').select('id, code, title, subject, path').eq('subject', DERS).order('path')
if (nErr || !nodesRaw?.length) { console.error('⛔ curriculum_nodes okunamadı:', nErr?.message); process.exit(1) }
const nodes = nodesRaw as Node[]

// ── Hücre planı: kazanımlar EŞİT ARALIKLI (tek üniteye yığılmasın), zorluk 3'lü rotasyon ──
// Rotasyon kolay/orta/zor'u ~1/3'er dağıtır; kazanım indeksi ile zorluk BAĞIMSIZ ilerler ki
// "hep aynı kazanımlar zor" gibi bir yanlılık oluşmasın.
const DIFFS = ['kolay', 'orta', 'zor'] as const
const hucreSayisi = Math.ceil((HEDEF / PER_CELL) * 2.5) // doğrulama firesi payı
const hucreler: Array<{ node: Node; difficulty: string }> = []
for (let i = 0; i < hucreSayisi; i++) {
  const idx = Math.round((i * (nodes.length - 1)) / Math.max(1, hucreSayisi - 1)) % nodes.length
  // Sabit-zorluk modunda hepsi hedefZorluk; yoksa kolay/orta/zor rotasyonu.
  hucreler.push({ node: nodes[idx], difficulty: hedefZorluk ?? DIFFS[i % 3] })
}

console.log(`=== A/B KOL: ${ETIKET} ===`)
console.log(`yazar zinciri : ${ZINCIR}   (denetçi zincirden bağımsız, ücretsiz)`)
console.log(`ders/hedef    : ${DERS} · ${HEDEF} ${hedefZorluk ? `${hedefZorluk} (SABİT)` : 'soru (kolay/orta/zor rotasyon)'} · hücre ${PER_CELL} · eşzamanlı ${ES_ZAMAN}`)
console.log(`MALİYET TAVANI: $${TAVAN.toFixed(2)}  ← aşılınca paralı çağrı GÖNDERİLMEZ`)
console.log(`kazanım havuzu: ${nodes.length} · planlanan hücre: ${hucreler.length}\n`)

type Kayit = {
  id: string; kazanim_id: number; kazanim: string; difficulty: string; istenenZorluk: string
  quality: number; soru: string; siklar: Record<string, string>; dogru: string
}
const kayitlar: Kayit[] = []
/** HEDEF'e ne sayılır: sabit-zorluk modunda yalnız ÖLÇÜLEN zorluğu tutanlar; yoksa hepsi.
 *  (Salvage ile sipariş-zor'dan inen orta yazılır ama zor hedefine sayılmaz.) */
const sayilan = (): number =>
  hedefZorluk ? kayitlar.filter((k) => k.difficulty === hedefZorluk).length : kayitlar.length
let uretilen = 0
let imlec = 0
let dur = false
let durSebep = ''
const t0 = Date.now()

async function isle(cell: { node: Node; difficulty: string }): Promise<void> {
  if (dur || sayilan() >= HEDEF) return
  const { node, difficulty } = cell
  try {
    const set = await generateVerifiedSet(
      {
        userId: SYSTEM_USER, subject: node.subject, paths: [String(node.path)],
        kazanim: node.code ?? '', topic: node.title, difficulty,
      },
      PER_CELL,
      'P2',
    )
    uretilen += set.length
    let yazilan = 0
    if (set.length) {
      const rows = set.map((q) => ({
        subject: node.subject, kazanim_id: node.id, question_text: q.soru, options: q.siklar,
        correct_option: q.dogru, solution: q.cozum, difficulty: q.zorluk || difficulty,
        verified: true, quality: q.quality,
        content_hash: createHash('md5').update(q.soru).digest('hex'),
      }))
      const { data, error } = await supabase.from('yks_ai_questions')
        .upsert(rows, { onConflict: 'content_hash', ignoreDuplicates: true }).select('id, question_text')
      if (error) console.log(`  ⚠️ upsert: ${error.message}`)
      yazilan = data?.length ?? 0
      // KÜNYE: DB'de "hangi model yazdı" sütunu yok → kol dosyasında tutuluyor
      for (const r of (data ?? []) as Array<{ id: string; question_text: string }>) {
        const q = set.find((s) => s.soru === r.question_text)
        kayitlar.push({
          id: r.id, kazanim_id: node.id, kazanim: node.code ?? node.title, difficulty: q?.zorluk || difficulty,
          istenenZorluk: difficulty, quality: q?.quality ?? 0, soru: r.question_text,
          siklar: q?.siklar ?? {}, dogru: q?.dogru ?? '',
        })
      }
    }
    const dk = ((Date.now() - t0) / 60000).toFixed(1)
    console.log(
      `[${dk} dk] ${(node.code ?? node.title.slice(0, 14)).padEnd(14)} (${difficulty.padEnd(5)}) → ` +
      `üretilen ${set.length}, yazılan ${yazilan} · sayılan ${sayilan()}/${HEDEF}${hedefZorluk ? ` · toplam yazılan ${kayitlar.length}` : ''} · $${maliyetHarcanan().toFixed(4)}`,
    )
  } catch (err) {
    if (err instanceof MaliyetTavaniAsildi) {
      dur = true
      durSebep = `MALİYET TAVANI ($${TAVAN.toFixed(2)})`
      return
    }
    console.log(`  ⚠️ hücre başarısız (${node.code} ${difficulty}): ${err instanceof Error ? err.message.slice(0, 140) : String(err)}`)
  }
}

async function calisan(): Promise<void> {
  for (;;) {
    if (dur || sayilan() >= HEDEF) return
    const i = imlec++
    if (i >= hucreler.length) return
    await isle(hucreler[i])
  }
}
await Promise.all(Array.from({ length: Math.max(1, ES_ZAMAN) }, () => calisan()))

if (!dur && sayilan() >= HEDEF) durSebep = 'HEDEF DOLDU'
else if (!dur && !durSebep) durSebep = 'HÜCRE KUYRUĞU BİTTİ'

const sure = ((Date.now() - t0) / 60000).toFixed(1)
const harcanan = maliyetHarcanan()
const zorlukDagilim: Record<string, number> = {}
for (const k of kayitlar) zorlukDagilim[k.difficulty] = (zorlukDagilim[k.difficulty] ?? 0) + 1
const kazanimSayisi = new Set(kayitlar.map((k) => k.kazanim_id)).size
const ortKalite = kayitlar.length ? kayitlar.reduce((s, k) => s + k.quality, 0) / kayitlar.length : 0

console.log(`\n=== KOL BİTTİ: ${ETIKET} (${sure} dk) — ${durSebep} ===`)
console.log(`yazar          : ${ZINCIR}`)
console.log(`üretilen aday  : ${uretilen} · kapılardan geçip yazılan: ${kayitlar.length}`)
console.log(`MALİYET        : $${harcanan.toFixed(4)}${kayitlar.length ? ` · yazılan başına $${(harcanan / kayitlar.length).toFixed(4)}` : ''}${hedefZorluk && sayilan() ? ` · ${hedefZorluk} başına $${(harcanan / sayilan()).toFixed(4)}` : ''}`)
console.log(`zorluk dağılımı: ${Object.entries(zorlukDagilim).map(([k, n]) => `${k}=${n}`).join(' ') || '-'}`)
console.log(`farklı kazanım : ${kazanimSayisi}`)
console.log(`ort. kalite    : ${ortKalite.toFixed(2)}`)

const dosya = fileURLToPath(new URL(`../../data/ab-${ETIKET}.json`, import.meta.url))
writeFileSync(dosya, JSON.stringify({
  etiket: ETIKET, model: ZINCIR, ders: DERS, hedef: HEDEF, hedefZorluk: hedefZorluk ?? null, tavan: TAVAN,
  durSebep, sureDk: Number(sure), maliyet: harcanan, uretilenAday: uretilen,
  yazilan: kayitlar.length, sayilan: sayilan(), zorlukDagilim, kazanimSayisi, ortKalite, kayitlar,
}, null, 2))
console.log(`\nkünye dosyası  : ${dosya}`)
process.exit(0)
