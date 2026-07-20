/**
 * HAVUZ DOLDURMA — her ders için hedef sayıda doğrulanmış AI sorusu üretir (yks_ai_questions).
 *
 * Tasarım:
 *  - DERSLER KARIŞIK ilerler: hücre kuyruğu ders bazında round-robin dizilir; aynı anda hep
 *    farklı derslerin hücreleri işlenir.
 *  - Hücre = (kazanım, zorluk, PER_CELL soru). Kazanımlar ders içinde EŞİT ARALIKLA örneklenir
 *    (path sırasına göre) → sorular tek üniteye yığılmaz. Zorluk hücre sırasına göre döner
 *    (orta → kolay → zor) → havuz hücreleri dengeli dolar.
 *  - KALDIĞI YERDEN DEVAM EDER: hedef, DB'deki mevcut verified sayının ÜSTÜNE tamamlamaktır;
 *    yazım content_hash upsert'ü ile dedup'lıdır (gece demirhanesiyle birebir aynı yol).
 *  - Doğrulama adayları eleyebilir → ders başına hedefin ~2.5 katı hücre ayrılır; ders hedefi
 *    dolunca kalan hücreleri ATLANIR (para israfı yok).
 *
 * KULLANIM:
 *   bun src/scripts/havuz-doldur.ts --hedef 50                # tüm dersler, ders başına 50
 *   bun src/scripts/havuz-doldur.ts --hedef 50 --only mat,fiz # yalnız bu ltree kökleri
 *   bun src/scripts/havuz-doldur.ts --dry                     # plan göster, LLM harcama
 *   [--esZaman 2] aynı anda işlenen hücre  [--perCell 5] hücre başına üretim hedefi
 */
import { createHash } from 'node:crypto'
import { supabase } from '../clients/supabase.js'
import { generateVerifiedSet } from '../lib/generation.js'
import { logger } from '../utils/logger.js'

const argv = process.argv.slice(2)
const arg = (n: string): string | undefined => {
  const i = argv.indexOf(`--${n}`)
  return i >= 0 ? argv[i + 1] : undefined
}
const HEDEF = Number(arg('hedef') ?? 50)
/** Hücre başına üretim hedefi. 5 → 2: ÖLÇÜLDÜ, havuz derin ve DAR çıkıyordu — 75 soru yalnız
 *  12 kazanıma dağılmıştı (medyan 7/kazanım; 5 + tampon 2 = 7). Müfredatta ~1210 kazanım var.
 *  Dengeli havuz = çok kazanımdan az soru. Bir kazanımı derinleştirmek istersen --perCell ver. */
const PER_CELL = Number(arg('perCell') ?? 2)
const ES_ZAMAN = Number(arg('esZaman') ?? 2)
const ONLY = arg('only')?.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
const DRY = argv.includes('--dry')
const SYSTEM_USER = '00000000-0000-0000-0000-000000000000' // sistem üretimi — öğrenci bağlamı nötr

type Node = { id: number; code: string | null; title: string; subject: string; path: string }
type Cell = { node: Node; difficulty: string }

// ── 1) Müfredat + mevcut havuz durumu ──
const { data: nodesRaw, error: nErr } = await supabase
  .from('curriculum_nodes')
  .select('id, code, title, subject, path')
  .order('path')
if (nErr || !nodesRaw?.length) {
  console.error('⛔ curriculum_nodes okunamadı:', nErr?.message)
  process.exit(1)
}
const nodes = nodesRaw as Node[]

const bySubject = new Map<string, Node[]>()
for (const n of nodes) {
  const root = String(n.path).split('.')[0]
  if (ONLY && !ONLY.includes(root)) continue
  if (!bySubject.has(n.subject)) bySubject.set(n.subject, [])
  bySubject.get(n.subject)!.push(n)
}

const { data: existing } = await supabase
  .from('yks_ai_questions')
  .select('subject')
  .eq('verified', true)
const mevcut = new Map<string, number>()
for (const r of existing ?? []) mevcut.set(r.subject as string, (mevcut.get(r.subject as string) ?? 0) + 1)

// ── 2) Hücre planı: ders başına eşit aralıklı kazanım örneklemi, zorluk rotasyonu ──
const DIFFS = ['orta', 'kolay', 'zor'] // orta önce: adaptif servis en çok ortadan çeker
const yazilanSayac = new Map<string, number>() // canlı ders sayacı (mevcut + bu koşuda yazılan)
const planPerSubject = new Map<string, Cell[]>()

for (const [subject, list] of bySubject) {
  const have = mevcut.get(subject) ?? 0
  yazilanSayac.set(subject, have)
  const kalan = Math.max(0, HEDEF - have)
  if (kalan === 0) { planPerSubject.set(subject, []); continue }
  // Doğrulama firesi payıyla hücre sayısı (×2.5 tampon), kazanımlar eşit aralıkla seçilir.
  const cellCount = Math.ceil((kalan / PER_CELL) * 2.5)
  const cells: Cell[] = []
  for (let i = 0; i < cellCount; i++) {
    const tur = Math.floor(i / Math.max(1, Math.min(cellCount, list.length))) // kazanımlar biterse baştan, farklı zorlukla
    const idx = list.length === 1 ? 0 : Math.round(((i % list.length) * (list.length - 1)) / Math.max(1, Math.min(cellCount, list.length) - 1)) % list.length
    cells.push({ node: list[idx], difficulty: DIFFS[(i + tur) % 3] })
  }
  planPerSubject.set(subject, cells)
}

// Round-robin kuyruk: her dersten sırayla 1 hücre → "karışık derslerden ilerlesin"
const queue: Cell[] = []
{
  let added = true
  let round = 0
  while (added) {
    added = false
    for (const cells of planPerSubject.values()) {
      if (round < cells.length) { queue.push(cells[round]); added = true }
    }
    round++
  }
}

console.log(`\n=== HAVUZ DOLDURMA PLANI ===`)
console.log(`Hedef: ders başına ${HEDEF} doğrulanmış soru · hücre ${PER_CELL} soru · eşzamanlı ${ES_ZAMAN} hücre`)
console.log('DERS                                MEVCUT  KALAN  AYRILAN-HÜCRE')
for (const [subject, cells] of planPerSubject) {
  const have = mevcut.get(subject) ?? 0
  console.log(`${subject.slice(0, 34).padEnd(35)} ${String(have).padStart(6)} ${String(Math.max(0, HEDEF - have)).padStart(6)} ${String(cells.length).padStart(8)}`)
}
console.log(`Kuyruk: ${queue.length} hücre (ders hedefi dolunca kalanı atlanır)\n`)
if (DRY) { console.log('>>> --dry: LLM çağrısı yapılmadı.'); process.exit(0) }

// ── 3) İşleyici havuzu: ES_ZAMAN hücre aynı anda; ders hedefi dolduysa hücre atlanır ──
let cursor = 0
let genelYazilan = 0
let genelUretilen = 0
let atlanan = 0
const genelHedef = [...planPerSubject.keys()]
  .reduce((s, k) => s + Math.max(0, HEDEF - (mevcut.get(k) ?? 0)), 0)
const t0 = Date.now()

async function isle(cell: Cell): Promise<void> {
  const { node, difficulty } = cell
  const simdi = yazilanSayac.get(node.subject) ?? 0
  if (simdi >= HEDEF) { atlanan++; return } // ders doldu — para harcama

  try {
    const set = await generateVerifiedSet(
      {
        userId: SYSTEM_USER,
        subject: node.subject,
        paths: [String(node.path)],
        kazanim: node.code ?? '',
        topic: node.title,
        difficulty,
      },
      PER_CELL,
      'P2',
    )
    genelUretilen += set.length
    let yazilan = 0
    if (set.length) {
      const rows = set.map((q) => ({
        subject: node.subject,
        kazanim_id: node.id,
        question_text: q.soru,
        options: q.siklar,
        correct_option: q.dogru,
        solution: q.cozum,
        difficulty: q.zorluk || difficulty,
        verified: true,
        quality: q.quality,
        content_hash: createHash('md5').update(q.soru).digest('hex'),
      }))
      const { data, error: insErr } = await supabase
        .from('yks_ai_questions')
        .upsert(rows, { onConflict: 'content_hash', ignoreDuplicates: true })
        .select('id')
      if (insErr) logger.warn({ err: insErr, nodeId: node.id }, 'havuz: upsert hatası')
      yazilan = data?.length ?? 0
    }
    yazilanSayac.set(node.subject, (yazilanSayac.get(node.subject) ?? 0) + yazilan)
    genelYazilan += yazilan
    const dk = ((Date.now() - t0) / 60000).toFixed(1)
    console.log(
      `[${dk} dk] ${node.subject.slice(0, 22).padEnd(23)} ${(node.code ?? node.title.slice(0, 14)).padEnd(14)} (${difficulty}) → üretilen ${set.length}, yazılan ${yazilan} · ders ${yazilanSayac.get(node.subject)}/${HEDEF} · genel ${genelYazilan}/${genelHedef}`,
    )
  } catch (err) {
    console.log(`⚠️  ${node.subject} ${node.code ?? ''} (${difficulty}) hücre başarısız: ${err instanceof Error ? err.message.slice(0, 120) : String(err)}`)
  }
}

async function calisan(): Promise<void> {
  for (;;) {
    const i = cursor++
    if (i >= queue.length) return
    await isle(queue[i])
  }
}
await Promise.all(Array.from({ length: Math.max(1, ES_ZAMAN) }, () => calisan()))

// ── 4) Özet ──
console.log(`\n=== BİTTİ (${((Date.now() - t0) / 60000).toFixed(1)} dk) ===`)
console.log(`Üretilen aday: ${genelUretilen} · Yazılan (doğrulanmış+dedup): ${genelYazilan} · Atlanan hücre (ders doldu): ${atlanan}`)
const { data: son } = await supabase.from('yks_ai_questions').select('subject').eq('verified', true)
const sonSay = new Map<string, number>()
for (const r of son ?? []) sonSay.set(r.subject as string, (sonSay.get(r.subject as string) ?? 0) + 1)
console.log('\nDERS                                HAVUZ')
for (const [s, n] of [...sonSay.entries()].sort()) console.log(`${s.slice(0, 34).padEnd(35)} ${String(n).padStart(5)}`)
const eksik = [...planPerSubject.keys()].filter((s) => (sonSay.get(s) ?? 0) < HEDEF)
if (eksik.length) {
  console.log(`\n⚠️  Hedefin altında kalan ${eksik.length} ders var — script'i aynı komutla tekrar çalıştırmak kaldığı yerden tamamlar.`)
}
process.exit(0)
