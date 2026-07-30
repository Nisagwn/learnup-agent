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
 *   bun src/scripts/havuz-doldur.ts --hedef 5 --zorluk zor    # yalnız zor sipariş et
 *   bun src/scripts/havuz-doldur.ts --dry                     # plan göster, LLM harcama
 *   [--esZaman 2] aynı anda işlenen hücre  [--perCell 5] hücre başına üretim hedefi
 */
import { createHash } from 'node:crypto'
import { supabase } from '../clients/supabase.js'
import { generateVerifiedSet } from '../lib/generation.js'
import { maliyetTavani, maliyetHarcanan, MaliyetTavaniAsildi } from '../lib/model-router.js'
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
/**
 * ZORLUK SEÇ — verilirse varsayılan rotasyon (orta→kolay→zor) kapanır ve hücreler YALNIZ verilen
 * kademe(ler) arasında döner. Virgülle çoklu verilebilir: `--zorluk orta,zor`.
 *
 * NEDEN LİSTE: tek kademeye sabitlemek doğru araç değil. ÖLÇÜLDÜ (2026-07-24): "zor" siparişinin
 * çoğu hakemden "orta" damgasıyla dönüyor — pahalı v4-pro'nun 3/3 planlı sorusunda bile 1/3 zor
 * tuttu. Yani zor-only koşu, ürettiğinin çoğunu hedefe saymadan biriktirir ve YAVAŞTIR (zor hücresi
 * soru başına ayrı çağrı yapar: parcaTavani). orta+zor birlikte sipariş etmek aynı işten hem daha
 * çok soru çıkarır hem salvage'ı hedefe sayar.
 *
 * ⚠️ SEÇİLİNCE SAYIM DA O KADEMELERE İNDİRGENİR — yoksa bayrak sessizce hiçbir şey yapmaz:
 * ders hedefi TÜM verified sorulardan sayılırsa, 25 kolay/orta sorusu olan Matematik
 * "--hedef 25 --zorluk zor" siparişinde DOLU görünür ve tek zor soru üretilmez.
 */
const ZORLUK = arg('zorluk')?.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
const gecersiz = ZORLUK?.filter((z) => !['kolay', 'orta', 'zor'].includes(z)) ?? []
if (gecersiz.length) {
  console.error(`⛔ --zorluk yalnız kolay|orta|zor (virgülle çoklu) olabilir (geçersiz: ${gecersiz.join(', ')})`)
  process.exit(1)
}
/** Sipariş edilen kademe kümesi — "hedefe sayılır mı" kararının tek kaynağı. */
const ZORLUK_KUME = ZORLUK?.length ? new Set(ZORLUK) : null
const ZORLUK_ETIKET = ZORLUK?.join(' + ') ?? ''
/** SERT DOLAR TAVANI — maliyetTavani (model-router) paralı çağrıyı GÖNDERMEDEN önce fırlatır ve
 *  yalnız PARALI slug'ları sayar (ücretsiz üretim/denetim tavanı yemez). Verilmezse davranış
 *  değişmez (Infinity) ama aşağıda TAVANSIZ uyarısı basılır — 3k gibi büyük koşuyu tavansız
 *  başlatmak gözden kaçmasın. */
const tavanArg = arg('tavan')
const TAVAN = tavanArg ? Number(tavanArg) : Number.POSITIVE_INFINITY
maliyetTavani(TAVAN) // finite ise sert tavan devrede; Infinity ise yalnız sayacı sıfırlar
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

// ZORLUK sabitliyse mevcut sayım O KADEMEYE indirgenir (yukarıdaki uyarı) — aksi hâlde
// hedef "toplam soru", kademe hiç dolmadan dolu görünür.
/**
 * İKİ AYRI SAYAÇ — tek sayaçla iki soruya cevap verilmez, ÖLÇÜLDÜ.
 *
 *   mevcut       → "bu derste kaç SİPARİŞ EDİLEN kademe sorusu var?"  (hedef kararı; ZORLUK süzgeçli)
 *   kazanimSayim → "bu kazanıma HİÇ dokunuldu mu?"                    (kapsam kararı; süzgeçSİZ)
 *
 * ⚠️ kazanimSayim'e ZORLUK SÜZGECİ UYGULAMA — uygulanınca aynı kazanımlar sonsuza dek yeniden
 * seçilir. ÖLÇÜLDÜ (2026-07-24): soru yazılmış 74 kazanımın 35'inin TÜM soruları "kolay"
 * damgalıydı; sayaç `--zorluk orta,zor` ile kurulduğu için bunlar 0 görünüyor, "en az kapsanan"
 * katmanında kalıyor ve her koşuda BAŞTAN seçiliyorlardı (DKAB.10.4.1, COĞ.10.7.1, FEL.10.9.1,
 * TÜR.12.1 …). Kullanıcı tekrarı çıplak gözle fark etti. Kademe kaçağı (orta→kolay) sistematik
 * olduğu için bu, kendini besleyen bir döngüydü: kolaya düşen kazanım "boş" sayılıp tekrar
 * denenir, yine kolay çıkar, yine boş sayılır.
 */
const { data: existing } = await supabase
  .from('yks_ai_questions')
  .select('subject, kazanim_id, difficulty')
  .eq('verified', true)
const mevcut = new Map<string, number>()
const kazanimSayim = new Map<number, number>()
for (const r of existing ?? []) {
  const row = r as { subject: string; kazanim_id: number | null; difficulty: string | null }
  if (!ZORLUK_KUME || ZORLUK_KUME.has(String(row.difficulty))) {
    mevcut.set(row.subject, (mevcut.get(row.subject) ?? 0) + 1)
  }
  if (row.kazanim_id != null) kazanimSayim.set(row.kazanim_id, (kazanimSayim.get(row.kazanim_id) ?? 0) + 1)
}

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

  /**
   * EN AZ KAPSANAN KAZANIMLAR ÖNCE — plan HAVUZUN DURUMUNU okur, yoksa her koşu aynı yere vurur.
   *
   * ⚠️ ESKİ HÂLİ SESSİZ BİR ARIZAYDI: tarama daima `path` sırasının 0. indeksinden başlıyordu ve
   * havuzda ne olduğuna HİÇ bakmıyordu. Script deterministik olduğu için her yeniden çalıştırma
   * AYNI çapa kazanımları yeniden seçiyordu. ÖLÇÜLDÜ (2026-07-24): 4 ayrı koşu sonunda 171 sorunun
   * 60'ı (%35) yalnız 8 kazanımda toplanmıştı (FİZ.10.4.3 ve MAT.10.6.2 11'er soru) ve 907 müfredat
   * düğümünün yalnız 63'üne (%6.9) dokunulmuştu. content_hash dedup'ı KOPYAYI önlüyordu ama
   * YIĞILMAYI önlemiyor — ikisi farklı sorun. Bu, dosyanın kendi hedefiyle çelişiyordu
   * ("Dengeli havuz = çok kazanımdan az soru", PER_CELL yorumu).
   *
   * Çözüm: en az soruya sahip KADEME (çoğunlukla hiç sorusu olmayanlar) aday havuzu olur; seçim
   * o havuz İÇİNDE eşit aralıkla yapılır. Eşit aralık korunur ki aday havuzu büyükken hücreler
   * tek üniteye yığılmasın — yani iki hedef birden: kapsanmamışa git, ama geniş yayıl.
   */
  const sayi = (n: Node): number => kazanimSayim.get(n.id) ?? 0
  const enAz = Math.min(...list.map(sayi))
  const bosTier = list.filter((n) => sayi(n) === enAz)
  // Aday havuzu hücreleri karşılamıyorsa sayıya göre sıralı TÜM listeye düş (yine az olan önce).
  const kaynak = bosTier.length >= cellCount ? bosTier : [...list].sort((a, b) => sayi(a) - sayi(b))

  const cells: Cell[] = []
  for (let i = 0; i < cellCount; i++) {
    const tur = Math.floor(i / Math.max(1, Math.min(cellCount, kaynak.length))) // kazanımlar biterse baştan, farklı zorlukla
    const idx = kaynak.length === 1 ? 0 : Math.round(((i % kaynak.length) * (kaynak.length - 1)) / Math.max(1, Math.min(cellCount, kaynak.length) - 1)) % kaynak.length
    // Seçili kademeler arasında da ROTASYON var: tek kademeye yığmak havuzu tek-tip yapardı.
    const havuzu = ZORLUK?.length ? ZORLUK : DIFFS
    cells.push({ node: kaynak[idx], difficulty: havuzu[(i + tur) % havuzu.length] })
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
console.log(
  ZORLUK_KUME
    ? `ZORLUK SEÇİLİ: yalnız "${ZORLUK_ETIKET}" sipariş edilir · MEVCUT/KALAN sütunları da yalnız bunları sayar\n` +
      `   ⚠️ Hakem sipariş tutmayan adayı dürüst etiketle yazar. Damgası seçim DIŞINA düşen soru\n` +
      `      (ör. zor sipariş → kolay damga) havuza GİRER ama hedefe SAYILMAZ — satır sonundaki\n` +
      `      "sayılan" alanı bu farkı gösterir.`
    : `Zorluk: hücre sırasına göre rotasyon (orta → kolay → zor)`,
)
console.log(
  Number.isFinite(TAVAN)
    ? `MALİYET TAVANI: $${TAVAN.toFixed(2)}  ← aşılınca paralı çağrı GÖNDERİLMEZ (ücretsiz üretim sürer)`
    : `⚠️  TAVANSIZ (--tavan verilmedi) — paralı çağrılar sınırsız; büyük koşularda --tavan <usd> ver`,
)
console.log('DERS                                MEVCUT  KALAN  HÜCRE  KAZANIM-KAPSAMI')
for (const [subject, cells] of planPerSubject) {
  const have = mevcut.get(subject) ?? 0
  const list = bySubject.get(subject) ?? []
  // Kapsam = bu dersin kaç kazanımında soru VAR. Düşükse plan oraya gitmeli (kaynak seçimi bunu yapar).
  const kapsanan = list.filter((n) => (kazanimSayim.get(n.id) ?? 0) > 0).length
  console.log(
    `${subject.slice(0, 34).padEnd(35)} ${String(have).padStart(6)} ${String(Math.max(0, HEDEF - have)).padStart(6)} ${String(cells.length).padStart(6)}` +
    `  ${String(kapsanan).padStart(4)}/${String(list.length).padEnd(4)} (%${((100 * kapsanan) / Math.max(1, list.length)).toFixed(0)})`,
  )
}
console.log(`Kuyruk: ${queue.length} hücre (ders hedefi dolunca kalanı atlanır)\n`)
if (DRY) { console.log('>>> --dry: LLM çağrısı yapılmadı.'); process.exit(0) }

// ── 3) İşleyici havuzu: ES_ZAMAN hücre aynı anda; ders hedefi dolduysa hücre atlanır ──
let cursor = 0
let genelYazilan = 0 // hedefe SAYILAN (ZORLUK sabitse yalnız o kademe)
let genelYazilanHam = 0 // havuza fiilen giren tüm satırlar (salvage dahil)
let genelUretilen = 0
let atlanan = 0
let durTavan = false // maliyet tavanı aşıldı → kuyruğu durdur (paralı çağrı zaten gönderilmedi)
let ardisikHata = 0 // üst üste düşen hücre — eşiği aşınca fren (sağlayıcı arızası kuyruğu yemesin)
const yenidenKuyruk: Cell[] = [] // 1. turda düşenler → sonda bir kez daha
let ikinciTur = false // 2. turda düşen hücre TEKRAR kuyruğa alınmaz (sonsuz döngü olmasın)
/** Ardışık hata sonrası bekleme. Kesici soğuması 30-300 sn; 60 en kısa iki kademeyi kapsar. */
const FREN_SN = 60
const genelHedef = [...planPerSubject.keys()]
  .reduce((s, k) => s + Math.max(0, HEDEF - (mevcut.get(k) ?? 0)), 0)
const t0 = Date.now()

async function isle(cell: Cell): Promise<void> {
  if (durTavan) return // tavan doldu — yeni hücre işleme
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
    let sayilan = 0 // ZORLUK sabitse yalnız o kademeye damgalananlar; değilse = yazilan
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
        .select('id, difficulty')
      if (insErr) logger.warn({ err: insErr, nodeId: node.id }, 'havuz: upsert hatası')
      yazilan = data?.length ?? 0
      // ZORLUK sabitken hedefe YALNIZ o kademeye damgalanan soru sayılır. Yazılan sayıyı
      // saymak, salvage edilen ("zor sipariş → orta damga") soruları zor sanmak olurdu ve
      // hedef, kademe boşken dolu görünürdü — bayrağın kapatmaya çalıştığı arızanın aynısı.
      sayilan = ZORLUK_KUME
        ? (data ?? []).filter((r) => ZORLUK_KUME.has(String((r as { difficulty?: string }).difficulty))).length
        : yazilan
    }
    yazilanSayac.set(node.subject, (yazilanSayac.get(node.subject) ?? 0) + sayilan)
    genelYazilan += sayilan
    genelYazilanHam += yazilan
    const dk = ((Date.now() - t0) / 60000).toFixed(1)
    console.log(
      `[${dk} dk] ${node.subject.slice(0, 22).padEnd(23)} ${(node.code ?? node.title.slice(0, 14)).padEnd(14)} (${difficulty}) → üretilen ${set.length}, yazılan ${yazilan}${ZORLUK_KUME ? `, sayılan ${sayilan}` : ''} · ders ${yazilanSayac.get(node.subject)}/${HEDEF} · genel ${genelYazilan}/${genelHedef} · $${maliyetHarcanan().toFixed(4)}`,
    )
    ardisikHata = 0 // hücre başarılı — sağlayıcı ayakta, fren gerekmiyor
  } catch (err) {
    if (err instanceof MaliyetTavaniAsildi) { durTavan = true; return } // tavan doldu — kuyruğu durdur
    console.log(`⚠️  ${node.subject} ${node.code ?? ''} (${difficulty}) hücre başarısız: ${err instanceof Error ? err.message.slice(0, 120) : String(err)}`)
    ardisikHata++
    if (!ikinciTur) yenidenKuyruk.push(cell) // 1. turda düşen hücre SONA alınır (bkz. aşağıdaki not)
    // ⚠️ ARDIŞIK HATADA FREN — yoksa tek bir ağ kesintisi TÜM KUYRUĞU saniyeler içinde yakar.
    // ÖLÇÜLDÜ (2026-07-24): geçici bir bağlantı kesintisinde zincirdeki her slug'ın kesicisi
    // açıldı ve sonraki hücreler ANINDA "model zinciri boş" diye düştü — 28 hücre 1 dakikada
    // tükendi, sıfır soru üretildi. Ağ 60 sn sonra sağlamdı ama kuyruk çoktan boşalmıştı.
    // Kesiciler zaten 30-300 sn soğuyor; onlara soğuma vakti tanımadan hücre çekmek, kuyruğu
    // sağlayıcıya değil BOŞLUĞA harcamaktır.
    if (ardisikHata >= 3) {
      console.log(`⏸️  ${ardisikHata} ardışık hata — kesiciler soğusun diye ${FREN_SN} sn bekleniyor`)
      await new Promise((r) => setTimeout(r, FREN_SN * 1000))
      ardisikHata = 0
    }
  }
}

async function calisan(): Promise<void> {
  for (;;) {
    if (durTavan) return // maliyet tavanı aşıldı — yeni hücre alma
    const i = cursor++
    if (i >= queue.length) return
    await isle(queue[i])
  }
}
await Promise.all(Array.from({ length: Math.max(1, ES_ZAMAN) }, () => calisan()))

/**
 * İKİNCİ TUR — 1. turda düşen hücreler bir kez daha denenir.
 *
 * Hücre düşmesi çoğu kez hücrenin DEĞİL, o anki sağlayıcı durumunun sorunudur (429, geçici
 * bağlantı kesintisi, açık kesici). Kuyruğun sonunda koşullar değişmiş olur; aynı hücre bu kez
 * geçer. Tur SONA alınır ki hücre kendi hatasını beklerken kuyruğun kalanını bekletmesin.
 * Yalnız BİR kez: ısrarla düşen hücre gerçekten sorunludur, sonsuz denemek kotayı yakar.
 */
if (yenidenKuyruk.length && !durTavan) {
  console.log(`\n── İKİNCİ TUR: 1. turda düşen ${yenidenKuyruk.length} hücre yeniden deneniyor ──`)
  ikinciTur = true
  cursor = 0
  queue.length = 0
  queue.push(...yenidenKuyruk)
  await Promise.all(Array.from({ length: Math.max(1, ES_ZAMAN) }, () => calisan()))
}

// ── 4) Özet ──
console.log(`\n=== BİTTİ (${((Date.now() - t0) / 60000).toFixed(1)} dk) ===`)
console.log(
  `Üretilen aday: ${genelUretilen} · Havuza yazılan (doğrulanmış+dedup): ${genelYazilanHam}` +
    ` · Atlanan hücre (ders doldu): ${atlanan}`,
)
if (ZORLUK_KUME) {
  console.log(`   ("${ZORLUK_ETIKET}" damgalısı: ${genelYazilan} · kalanı hakem seçim dışı kademeye yazdı)`)
}
console.log(`Harcanan: $${maliyetHarcanan().toFixed(4)}${durTavan ? `  ⛔ MALİYET TAVANI ($${TAVAN.toFixed(2)}) AŞILDI — koşu erken durdu` : ''}`)
const sonSorgu = supabase.from('yks_ai_questions').select('subject').eq('verified', true)
const { data: son } = await (ZORLUK?.length ? sonSorgu.in('difficulty', ZORLUK) : sonSorgu)
const sonSay = new Map<string, number>()
for (const r of son ?? []) sonSay.set(r.subject as string, (sonSay.get(r.subject as string) ?? 0) + 1)
console.log(`\nDERS                                HAVUZ${ZORLUK_KUME ? ` (yalnız ${ZORLUK_ETIKET})` : ''}`)
for (const [s, n] of [...sonSay.entries()].sort()) console.log(`${s.slice(0, 34).padEnd(35)} ${String(n).padStart(5)}`)
const eksik = [...planPerSubject.keys()].filter((s) => (sonSay.get(s) ?? 0) < HEDEF)
if (eksik.length) {
  console.log(`\n⚠️  Hedefin altında kalan ${eksik.length} ders var — script'i aynı komutla tekrar çalıştırmak kaldığı yerden tamamlar.`)
}
process.exit(0)
