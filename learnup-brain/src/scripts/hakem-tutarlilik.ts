/**
 * hakem-tutarlilik.ts — HAKEM AYNI SORUYA HER SEFERİNDE AYNI DAMGAYI VURUYOR MU? ($0)
 *
 * ⚠️ NEDEN BU ÖLÇÜM, DÜZELTMEDEN ÖNCE GELİR.
 * Havuzda ölçülen tablo: 368 doğrulanmış sorunun %67'si "kolay" damgalı, oysa `havuz-doldur`
 * zorluğu orta→kolay→zor EŞİT rotasyonla sipariş ediyor. İki rakip açıklama var ve ikisinin
 * ilacı TAMAMEN farklı:
 *   (a) YAZAR sorunu — model gerçekten orta/zor kuramıyor  → few-shot/tarif düzeltilir,
 *   (b) HAKEM sorunu — damga gürültülü, aynı soru koşudan koşuya farklı kademe alıyor
 *                      → yazarı düzeltmek gürültüye optimize etmek olur, işe YARAMAZ.
 * Elimizdeki ipucu (b)'yi ciddiye almayı gerektiriyor: denetci-sinav.ts'te aynı soru iki
 * koşuda bir kez "AYIRT ETME" bulup bir kez boş dizi döndürmüştü. Ölçmeden düzeltmeye
 * girişmek, bu projede daha önce iki kez pahalıya patlamış bir hata sınıfı.
 *
 * NE ÖLÇER: havuzdan alınan gerçek sorular, ÜRETİM YOLUYLA BİREBİR aynı çağrıyla
 * (generation.verifyQuestion → OSYM_DENETCI_SYSTEM + denetciIstemi + gerçek grounding)
 * `--tekrar` kez denetlenir. Bakılan: türetilen zorluk, içgözlem zorluğu, mekanizma kümesi
 * ve üslup skoru tekrarlar arasında DEĞİŞİYOR MU.
 *
 * NE ÖLÇMEZ: hakemin HAKLI olup olmadığını. Kararlılık doğruluk değildir — kararlı ama
 * sistematik yanlış bir hakem de bu sınavdan tam alır. Bu ölçüm yalnız "yazarı mı hakemi mi
 * düzeltmeliyiz" sorusunu cevaplar.
 *
 * MALİYET: yalnız ücretsiz zincir. `KREDISIZ=1` ile koşulması ÖNERİLİR (paralı yedeğe düşmez).
 * Çağrı sayısı = adet × tekrar (varsayılan 30 × 3 = 90 ≈ günlük ücretsiz kotanın %10'u).
 *
 * KULLANIM:
 *   KREDISIZ=1 bun src/scripts/hakem-tutarlilik.ts                     # 30 soru × 3 tekrar
 *   KREDISIZ=1 bun src/scripts/hakem-tutarlilik.ts --adet 12 --tekrar 2
 *   KREDISIZ=1 bun src/scripts/hakem-tutarlilik.ts --ders Matematik
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { supabase } from '../clients/supabase.js'
import { embed, retrieveGrounding, type GroundingChunk } from '../lib/rag.js'
import { verifyQuestion, hakemZorluguTuret, type TaggedQuestion, type Verdict } from '../lib/generation.js'
import { maliyetTavani, maliyetHarcanan } from '../lib/model-router.js'
import { mapLimit } from '../utils/concurrency.js'

const argv = process.argv.slice(2)
const arg = (n: string): string | undefined => {
  const i = argv.indexOf(`--${n}`)
  return i >= 0 ? argv[i + 1] : undefined
}
const ADET = Number(arg('adet') ?? 30)
const TEKRAR = Number(arg('tekrar') ?? 3)
const DERS = arg('ders') ?? null
/** Aynı anda kaç denetim uçsun — router'ın dakika tavanının altında kal (üretimdeki değerle aynı). */
const ES_ZAMAN = Number(arg('esZaman') ?? 3)

// Paralı çağrı GÖNDERİLMESİN: ölçüm kredi harcamamalı. KREDISIZ=1 zaten zinciri süzer;
// bu satır kip unutulursa ikinci emniyettir (denetim rolü tavandan muaf olduğu için
// KREDISIZ olmadan tek başına yetmez — bu yüzden ikisi birlikte kullanılmalı).
maliyetTavani(0)

type Satir = {
  id: string
  subject: string
  kazanim_id: number | null
  question_text: string
  options: Record<string, string>
  correct_option: string
  solution: string | null
  difficulty: string | null
  quality: number | null
}

const { data: havuz, error } = await supabase
  .from('yks_ai_questions')
  .select('id, subject, kazanim_id, question_text, options, correct_option, solution, difficulty, quality')
  .eq('verified', true)
  .eq('karantina', false)
  .limit(2000)
if (error) { console.error('havuz okunamadı:', error.message); process.exit(1) }

let adaylar = ((havuz ?? []) as Satir[]).filter((r) => r.kazanim_id != null)
if (DERS) adaylar = adaylar.filter((r) => r.subject === DERS)
if (!adaylar.length) { console.error('ölçülecek soru yok'); process.exit(1) }

/**
 * ÖRNEKLEM KADEMEYE GÖRE DENGELİ — düz rastgele seçim havuzun kendi çarpıklığını taşır
 * (%67 kolay) ve "orta/zor damgası ne kadar kararlı?" sorusu tam da az olan kademelerde
 * cevapsız kalırdı. Her kademeden eşit pay alınır, biri yetmezse kalan diğerlerine dağılır.
 */
const kademeler = ['kolay', 'orta', 'zor'] as const
const havuzKademe = new Map<string, Satir[]>(kademeler.map((z) => [z, adaylar.filter((r) => r.difficulty === z)]))
const secilen: Satir[] = []
for (let tur = 0; secilen.length < Math.min(ADET, adaylar.length); tur++) {
  let eklendi = false
  for (const z of kademeler) {
    const liste = havuzKademe.get(z)!
    if (tur < liste.length && secilen.length < ADET) { secilen.push(liste[tur]); eklendi = true }
  }
  if (!eklendi) break
}

console.log(
  `\n=== HAKEM TUTARLILIK SINAVI ===\n` +
  `${secilen.length} soru × ${TEKRAR} tekrar = ${secilen.length * TEKRAR} ücretsiz denetim çağrısı` +
  `${DERS ? ` · ders: ${DERS}` : ''}\n` +
  `Kademe dağılımı: ${kademeler.map((z) => `${z} ${secilen.filter((s) => s.difficulty === z).length}`).join(' · ')}\n`,
)

/** Kazanım künyesi — grounding üretim yolundakiyle BİREBİR aynı sorguyla çekilir. */
const { data: nodeRows } = await supabase
  .from('curriculum_nodes')
  .select('id, code, title, subject, path')
  .in('id', [...new Set(secilen.map((s) => Number(s.kazanim_id)))])
const nodeById = new Map(
  ((nodeRows ?? []) as Array<{ id: number; code: string | null; title: string; subject: string; path: string }>)
    .map((n) => [Number(n.id), n]),
)

const taggedYap = (r: Satir, kod: string): TaggedQuestion => ({
  soru: r.question_text,
  siklar: {
    A: r.options.A ?? '', B: r.options.B ?? '', C: r.options.C ?? '',
    D: r.options.D ?? '', E: r.options.E ?? '',
  },
  dogru: r.correct_option,
  cozum: r.solution ?? '',
  kazanim: kod,
  zorluk: r.difficulty ?? '',
})

type Olcum = {
  id: string
  subject: string
  kayitliZorluk: string | null
  turetilen: string[]      // her tekrarda hakemZorluguTuret sonucu
  icgozlem: string[]       // her tekrarda actualDifficulty (ham)
  mekanizmalar: string[][] // her tekrarda kanıtlı mekanizma adları
  skorlar: number[]
  kabul: boolean[]
}

const olcumler: Olcum[] = []
let sira = 0

await mapLimit(secilen, ES_ZAMAN, async (r) => {
  const node = nodeById.get(Number(r.kazanim_id))
  if (!node) return null
  const query = `${node.subject} ${node.title} ${node.code ?? ''} ${r.difficulty ?? 'orta'}`
  let grounding: GroundingChunk[] = []
  try {
    const [qvec] = await embed([query]) // önbellekli — tekrar koşularda $0
    grounding = await retrieveGrounding({ subject: node.subject, paths: [String(node.path)], query, qvec })
  } catch {
    // Grounding alınamazsa ölçüm YİNE yapılır (boş kanıtla): bu koşunun konusu hakemin
    // KARARLILIĞI; kanıtın zenginliği tekrarlar arasında sabit olduğu sürece ölçüm geçerli.
  }
  const q = taggedYap(r, node.code ?? '')
  const o: Olcum = {
    id: r.id, subject: r.subject, kayitliZorluk: r.difficulty,
    turetilen: [], icgozlem: [], mekanizmalar: [], skorlar: [], kabul: [],
  }
  for (let t = 0; t < TEKRAR; t++) {
    let v: Verdict
    try {
      v = await verifyQuestion(q, grounding, 'P2', r.difficulty ?? undefined)
    } catch {
      continue // tek tekrarın düşmesi ölçümü bozmaz; eksik tekrar aşağıda görünür
    }
    o.turetilen.push(String(hakemZorluguTuret(v) ?? '—'))
    o.icgozlem.push(String(v.actualDifficulty ?? '—'))
    o.mekanizmalar.push([...new Set((v.mechanisms ?? []).map((m) => String(m?.ad ?? '').trim()).filter(Boolean))].sort())
    o.skorlar.push(Number(v.osymStyleScore ?? 0))
    o.kabul.push(v.verdict === 'ACCEPT')
  }
  olcumler.push(o)
  console.log(
    `[${++sira}/${secilen.length}] ${r.subject.slice(0, 18).padEnd(19)} kayıtlı=${String(r.difficulty).padEnd(5)}` +
    ` türetilen=${o.turetilen.join(',') || '—'}  skor=${o.skorlar.join(',')}`,
  )
  return null
})

// ── Rapor ────────────────────────────────────────────────────────────────────
const tamOlcum = olcumler.filter((o) => o.turetilen.length >= 2)
const kararli = tamOlcum.filter((o) => new Set(o.turetilen).size === 1)
const kayitlaAyni = tamOlcum.filter((o) => o.turetilen.every((z) => z === o.kayitliZorluk))
/** Mekanizma kümelerinin tekrarlar arası ortalama Jaccard'ı — 1.0 = her koşuda aynı küme. */
const jaccard = (a: string[], b: string[]): number => {
  const A = new Set(a), B = new Set(b)
  if (!A.size && !B.size) return 1
  let kesisim = 0
  for (const x of A) if (B.has(x)) kesisim++
  return kesisim / (A.size + B.size - kesisim)
}
const mekJaccard = tamOlcum.map((o) => {
  const ciftler: number[] = []
  for (let i = 0; i < o.mekanizmalar.length; i++)
    for (let j = i + 1; j < o.mekanizmalar.length; j++) ciftler.push(jaccard(o.mekanizmalar[i], o.mekanizmalar[j]))
  return ciftler.length ? ciftler.reduce((s, x) => s + x, 0) / ciftler.length : 1
})
const ort = (xs: number[]): number => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0)
const skorYayilim = tamOlcum.map((o) => Math.max(...o.skorlar) - Math.min(...o.skorlar))

const yuzde = (pay: number, payda: number): string => `%${payda ? Math.round((100 * pay) / payda) : 0}`

console.log(`\n=== SONUÇ (${tamOlcum.length} tam ölçülen soru) ===`)
console.log(`Türetilen zorluk KARARLI (tüm tekrarlar aynı): ${kararli.length}/${tamOlcum.length} (${yuzde(kararli.length, tamOlcum.length)})`)
console.log(`Türetilen zorluk KAYITLI damgayla aynı       : ${kayitlaAyni.length}/${tamOlcum.length} (${yuzde(kayitlaAyni.length, tamOlcum.length)})`)
console.log(`Mekanizma kümesi ortalama Jaccard            : ${ort(mekJaccard).toFixed(3)}  (1.000 = tam kararlı)`)
console.log(`Üslup skoru tekrarlar arası ortalama yayılım : ${ort(skorYayilim).toFixed(2)} puan`)
console.log(`Kabul kararı kararsız olan soru             : ${tamOlcum.filter((o) => new Set(o.kabul).size > 1).length}`)
console.log(`Harcanan: $${maliyetHarcanan().toFixed(4)}  ← 0.0000 olmalı (kredisiz ölçüm)`)

const kararsizlar = tamOlcum.filter((o) => new Set(o.turetilen).size > 1)
if (kararsizlar.length) {
  console.log(`\nKARARSIZ SORULAR (aynı soru, farklı damga) — ilk 10:`)
  for (const o of kararsizlar.slice(0, 10)) {
    console.log(`  ${o.subject.slice(0, 16).padEnd(17)} kayıtlı=${String(o.kayitliZorluk).padEnd(5)} → ${o.turetilen.join(' / ')}`)
  }
}

console.log(
  `\nYORUM: kararlılık düşükse (< ~%80) darboğaz HAKEMDE'dir — yazarın few-shot'ını\n` +
  `hakem damgasına göre beslemek gürültüyü ezberletir. Yüksekse darboğaz YAZARDA'dır ve\n` +
  `kademe tarifleri/few-shot üzerinde çalışmak doğru adımdır.`,
)

const rapor = fileURLToPath(new URL('../../data/hakem-tutarlilik.json', import.meta.url))
writeFileSync(rapor, JSON.stringify({ tarih: new Date().toISOString(), TEKRAR, DERS, olcumler }, null, 2))
console.log(`\nHam ölçüm: data/hakem-tutarlilik.json`)
process.exit(0)
