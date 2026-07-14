/**
 * ÇIKMIŞ SORULAR → yks_questions (servis havuzu) + yks_exemplars (üretim örneği, VEKTÖRLÜ).
 *
 * İKİ TABLO, İKİ AMAÇ — karıştırılmaz:
 *   yks_questions  → öğrenciye SERVİS edilir. Vektör YOK (kazanım+zorluk filtresiyle çekilir).
 *   yks_exemplars  → soru ÜRETİRKEN few-shot örneği. VEKTÖRLÜ (match_yks_exemplars).
 *   yks_knowledge  → DOKUNULMAZ. Orası müfredat grounding'i; soru oraya girerse ajan bir
 *                    SORUYU müfredat gerçeği sanır ve sınav cevabı açıklamaya sızabilir.
 *
 * KAZANIM ETİKETLEME (otomatik + eşik + rapor):
 *   Soru embed edilir → match_yks_knowledge(ders) ile en yakın kazanım bulunur.
 *   Benzerlik EŞİĞİN ALTINDAYSA ETİKETLENMEZ (kazanim_id = null) ve raporlanır.
 *   ⚠️ Zorlama etiket YOK. Yanlış kazanıma bağlı soru, doğru soruyu yanlış yerde gösterir.
 *
 * ZORLUK: Belgede YOK → difficulty = NULL (uydurulmaz). 0009 migration'ı, NULL zorluklu
 *   satırların exemplar aramasından ELENMEMESİ için RPC'yi gevşetir.
 *
 * ŞEKİLLİ SORULAR: pdftotext şekli çıkaramaz → varsayılan olarak BASILMAZ (karantina).
 *   --sekilli-de-bas ile zorlanabilir (önerilmez: öğrenciye çözülemez soru gider).
 *
 * ÖN KOŞUL: migrations/0009_sorular.sql
 *
 * KULLANIM:
 *   bun src/scripts/ingest-sorular.ts                      # ön izleme + benzerlik dağılımı
 *   bun src/scripts/ingest-sorular.ts --esik 0.45 --commit # yaz
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { supabase } from '../clients/supabase.js'
import { fetchAll, sayimAl } from '../lib/pg.js'
import { embed } from '../lib/rag.js'

const argv = process.argv.slice(2)
const arg = (n: string): string | undefined => {
  const i = argv.indexOf(`--${n}`)
  return i >= 0 ? argv[i + 1] : undefined
}
const FILE = arg('file') ?? 'data/sorular.json'
const ESIK = Number(arg('esik') ?? '0.40')
const COMMIT = argv.includes('--commit')
const SEKILLI_DE = argv.includes('--sekilli-de-bas')

type Soru = {
  subject: string; konu: string; kaynak: string; yil: number; sinav: string; no: number
  question_text: string; options: Record<string, string>; correct_option: string
  sekilli: boolean; pdf: string
}

const tumu = JSON.parse(readFileSync(FILE, 'utf8')) as Soru[]
const sorular = SEKILLI_DE ? tumu : tumu.filter((s) => !s.sekilli)

console.log(`\n=== ÇIKMIŞ SORU INGEST ===`)
console.log(`Dosya            : ${FILE}`)
console.log(`Toplam benzersiz : ${tumu.length}`)
console.log(`Şekilli (atlandı): ${tumu.length - sorular.length}${SEKILLI_DE ? ' (ZORLANDI: basılacak)' : ''}`)
console.log(`İşlenecek        : ${sorular.length}`)
console.log(`Eşik             : ${ESIK}`)
console.log(`Mod              : ${COMMIT ? 'COMMIT (DB\'ye yazılacak)' : 'ÖN İZLEME (yazma yok)'}\n`)

// ── Kazanım kodu → curriculum_nodes.id + başlık ──
// ⚠️ fetchAll ŞART: `.limit(5000)` PostgREST'in 1000 satır tavanını YÜKSELTMEZ. curriculum_nodes
// şu an 907 satır — 1000'i geçtiği an (birkaç ders daha) kodların bir kısmı bu haritadan
// SESSİZCE düşerdi ve iki şey olurdu: (a) globalKod.get(kod) gerçekte VAR OLAN bir kazanımı
// bulamayıp "HİÇBİR derste yok" diye yalan bir hatayla exit 1, (b) mufredatliDersler'den ders
// düşerse o dersin TÜM soruları kazanımsız yazılır ve sebebi "müfredatı yok" diye raporlanır.
const nodes = await fetchAll<{ id: number; subject: string; code: string; title: string }>(() =>
  supabase.from('curriculum_nodes').select('id, subject, code, title'),
)
const kodMap = new Map<string, { id: number; title: string }>()
// ÇAPRAZ-DERS aramaya izin veren global indeks: sınav ders etiketi ≠ müfredat ders sınırı.
// Örn. AYT "Tarih" kitapçığının 2. bölümü İnkılap Tarihi konularını içerir; "Millî Mücadele"nin
// doğru kazanımı İTA.12.1.3'tür ve o kazanım TARİH dersinde DEĞİL, İTA dersindedir.
const globalKod = new Map<string, { id: number; title: string; subject: string }>()
for (const n of nodes) {
  kodMap.set(`${n.subject}|${n.code}`, { id: n.id, title: n.title })
  globalKod.set(n.code, { id: n.id, title: n.title, subject: n.subject })
}
const mufredatliDersler = new Set(nodes.map((n) => n.subject))

// ── Kazanım VEKTÖRLERİNİ bir kez çek, eşleştirmeyi YERELDE yap ──
//    Soru başına match_yks_knowledge RPC'si çağırmak 1730 ağ gidiş-dönüşü demekti (10dk+ timeout).
//    Aynı matematik (kosinüs), tek sorguyla çekilen 820 vektör üzerinde yerelde saniyeler sürüyor.
type Kaz = { subject: string; code: string; v: Float32Array; norm: number }
const kazVek: Kaz[] = []
{
  // ⚠️ EN TEHLİKELİ 1000-TAVAN NOKTASI. Bu liste, her sorunun kazanımını seçen YEREL kosinüs
  // aramasının ADAY KÜMESİ. Tavana takılırsa doğru kazanım adaylıktan sessizce düşer ve soru
  // "hayatta kalan en yakın" kazanıma bağlanır — üstelik benzerlik eşiğin ÜSTÜNDE çıkıp geçer.
  // Hata yok, uyarı yok, kalıcı yanlış etiket. Sayı satırı da hep "1000" yazacağı için kimse
  // fark etmez. fetchAll + tamlık doğrulaması bunu imkânsız kılar.
  const rows = await fetchAll<{ subject: string; kazanim_code: string | null; embedding: unknown }>(() =>
    supabase.from('yks_knowledge').select('subject, kazanim_code, embedding'),
  )
  for (const r of rows) {
    if (!r.kazanim_code) continue
    // pgvector PostgREST üzerinden "[0.1,0.2,…]" string'i olarak gelir
    const arr: number[] = typeof r.embedding === 'string' ? JSON.parse(r.embedding) : (r.embedding as number[])
    const v = Float32Array.from(arr)
    let n = 0
    for (const x of v) n += x * x
    kazVek.push({ subject: r.subject, code: r.kazanim_code, v, norm: Math.sqrt(n) })
  }
  // TAMLIK KAPISI: yüklenen vektör sayısı DB'deki gerçek sayıyla birebir tutmalı.
  const gercek = await sayimAl(
    supabase.from('yks_knowledge').select('*', { count: 'exact', head: true }).not('kazanim_code', 'is', null),
  )
  if (kazVek.length !== gercek) {
    console.error(`⛔ kazanım vektörü EKSİK: ${kazVek.length} yüklendi, DB'de ${gercek} var. Etiketleme yapılmaz.`)
    process.exit(1)
  }
  console.log(`▸ kazanım vektörü yüklendi: ${kazVek.length}/${gercek} (yerel eşleştirme)\n`)
}
const kazByDers = new Map<string, Kaz[]>()
for (const k of kazVek) {
  if (!kazByDers.has(k.subject)) kazByDers.set(k.subject, [])
  kazByDers.get(k.subject)!.push(k)
}

/** Kosinüs benzerliği — match_yks_knowledge ile AYNI ölçüt (1 - cosine distance). */
function enYakinKazanim(ders: string, q: number[]): { code: string; sim: number } | null {
  const aday = kazByDers.get(ders)
  if (!aday?.length) return null
  const qv = Float32Array.from(q)
  let qn = 0
  for (const x of qv) qn += x * x
  qn = Math.sqrt(qn)
  let best: { code: string; sim: number } | null = null
  for (const k of aday) {
    let dot = 0
    for (let i = 0; i < qv.length; i++) dot += qv[i] * k.v[i]
    const sim = dot / (qn * k.norm)
    if (!best || sim > best.sim) best = { code: k.code, sim }
  }
  return best
}

// ── Embed (karakter bütçeli batch — soru uzunlukları çok değişken) ──
const metin = (s: Soru): string => (s.konu ? `${s.konu}. ` : '') + s.question_text
const MAX_ITEM = 48
const MAX_CHARS = 100_000

type Etiket = { soru: Soru; vec: number[]; kod: string | null; sim: number; title: string | null }
const etiketli: Etiket[] = []

const batches: Soru[][] = []
{
  let cur: Soru[] = []; let c = 0
  for (const s of sorular) {
    const len = metin(s).length
    if (cur.length && (cur.length >= MAX_ITEM || c + len > MAX_CHARS)) { batches.push(cur); cur = []; c = 0 }
    cur.push(s); c += len
  }
  if (cur.length) batches.push(cur)
}

// Embedding ÖNBELLEĞİ — eşik ayarlarken script defalarca çalışır; her seferinde 1730 soruyu
// yeniden embed etmek gereksiz maliyet. Anahtar = soru metninin hash'i (metin değişirse yenilenir).
const CACHE = arg('cache') ?? 'data/.sorular-vec.json'
const cache: Record<string, number[]> = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {}
const cacheKey = (s: Soru): string => createHash('md5').update(metin(s)).digest('hex')

let done = 0
for (const chunk of batches) {
  const eksik = chunk.filter((s) => !cache[cacheKey(s)])
  if (eksik.length) {
    const yeni = await embed(eksik.map(metin))        // 768d + drift-guard (exemplar vektörü)
    eksik.forEach((s, j) => { cache[cacheKey(s)] = yeni[j] })
  }
  done += chunk.length
  process.stdout.write(`\r  soru embed: ${done}/${sorular.length}`)
}
console.log('')

// ═══════════════════════════════════════════════════════════════════════════
// KAZANIM ETİKETLEME — SORU METNİYLE DEĞİL, BELGENİN KENDİ KONU BAŞLIĞIYLA.
//
// NEDEN: soru metnini kazanıma eşlemek GÜRÜLTÜLÜ. Ölçüldü — yüksek benzerlikte bile yanlış:
//   Tarih sim=0.537: "İlk Çağ Uygarlıkları" sorusu → "ORTA Çağ devletlerinin yönetim yapıları" ✗
//   TDE  sim=0.504: konu "Sözcükte Anlam"       → "Dünden Bugüne temasında çözümleyebilme"    ✗
// Uzun soru gövdesi (parçalar, şıklar, örnekler) vektörü dağıtıyor.
//
// Oysa belge "KONULARA GÖRE DÜZENLENMİŞ" ve her sorunun yayıncı tarafından verilmiş temiz bir
// konu başlığı var ("Dünya Gücü Osmanlı (1453-1595)"). Bunlar zaten müfredat dilinde ve KISA.
// 13 derste toplam 380 BENZERSİZ konu var → hem daha iyi sinyal hem ELLE DENETLENEBİLİR bir tablo.
// Aynı konunun tüm soruları AYNI kazanıma gider (soru başına rastgele sapma olmaz).
// ═══════════════════════════════════════════════════════════════════════════
const konular = [...new Set(sorular.map((s) => `${s.subject}|${s.konu}`))]
  .map((k) => { const [ders, konu] = k.split('|'); return { ders, konu } })
  .filter((k) => k.konu && mufredatliDersler.has(k.ders))

const konuVec: Record<string, number[]> = {}
{
  const eksik = konular.filter((k) => !cache[`konu:${createHash('md5').update(k.konu).digest('hex')}`])
  for (let i = 0; i < eksik.length; i += 48) {
    const grup = eksik.slice(i, i + 48)
    const v = await embed(grup.map((k) => k.konu))
    grup.forEach((k, j) => { cache[`konu:${createHash('md5').update(k.konu).digest('hex')}`] = v[j] })
  }
  for (const k of konular) konuVec[`${k.ders}|${k.konu}`] = cache[`konu:${createHash('md5').update(k.konu).digest('hex')}`]
  console.log(`  konu embed: ${konular.length} benzersiz konu`)
}

// ── ELLE DÜZELTME DOSYASI (varsa) — otomatik öneriyi EZER, eşiğe TABİ DEĞİLDİR ──
//    Otomatik eşleme fen derslerinde iyi, SOSYAL derslerde kötü çalışıyor. Sebep: çıkmış sorular
//    2018-2025 ESKİ müfredata ait, kazanımlarımız 2026 Maarif Modeli'nden. Fen konuları durağan
//    (momentum, protein sentezi); Tarih müfredatı ise yeniden yapılandırılmış ve ders sınırları
//    değişmiş (Millî Mücadele artık "Tarih"te değil, "T.C. İnkılap Tarihi"nde).
//    → Eşik bunu çözmez. Doğru çözüm: 380 satırlık eşlemeyi ELLE düzeltilebilir yapmak.
//    Biçim:  { "Tarih|Millî Mücadele": "İTA.12.1.1", "Tarih|Tarih ve Zaman": null }
//            null = "bu konunun kazanım karşılığı YOK" (bilinçli etiketsiz)
const DUZELTME = 'data/konu-kazanim.json'
const elleHam: Record<string, string | null> = existsSync(DUZELTME)
  ? JSON.parse(readFileSync(DUZELTME, 'utf8'))
  : {}
const elle: Record<string, string | null> = {}
for (const [k, v] of Object.entries(elleHam)) if (!k.startsWith('_')) elle[k] = v   // "_aciklama" vb. meta alanlar
if (Object.keys(elle).length) console.log(`  elle eşleme: ${Object.keys(elle).length} konu (${DUZELTME})`)

// KAPSAM KONTROLÜ — elle dosyada OLMAYAN konular otomatik eşlemeye düşer. Bunları görünür kıl.
{
  const dosyadakiler = new Set(Object.keys(elle))
  const eksik = konular.filter((k) => !dosyadakiler.has(`${k.ders}|${k.konu}`))
  if (eksik.length) {
    console.log(`\n  ⚠ ELLE EŞLEMEDE OLMAYAN ${eksik.length} KONU (otomatik eşlemeye düşecek):`)
    for (const k of eksik.slice(0, 20)) {
      const n = sorular.filter((s) => s.subject === k.ders && s.konu === k.konu).length
      console.log(`      ${k.ders} | ${k.konu}  (${n} soru)`)
    }
    if (eksik.length > 20) console.log(`      … +${eksik.length - 20}`)
    console.log('')
  }
}

// konu → kazanım (bir kez hesapla, tüm sorular miras alsın)
type KonuEsleme = { ders: string; konu: string; kod: string; sim: number; title: string; soruSay: number; elle: boolean }
const konuMap = new Map<string, KonuEsleme>()
for (const k of konular) {
  const anahtar = `${k.ders}|${k.konu}`
  const soruSay = sorular.filter((s) => s.subject === k.ders && s.konu === k.konu).length

  if (anahtar in elle) {                                    // ELLE VERİLDİ → eşiğe bakma
    const kod = elle[anahtar]
    if (!kod) continue                                      // null → bilinçli etiketsiz
    // Kod BAŞKA bir dersin kazanımı olabilir (bilinçli çapraz-ders eşlemesi) → global ara.
    const bilgi = globalKod.get(kod)
    if (!bilgi) { console.error(`⛔ ${DUZELTME}: "${anahtar}" → "${kod}" kazanımı HİÇBİR derste yok.`); process.exit(1) }
    konuMap.set(anahtar, { ders: k.ders, konu: k.konu, kod, sim: 1, title: bilgi.title, soruSay, elle: true })
    continue
  }

  const top = enYakinKazanim(k.ders, konuVec[anahtar])
  if (!top) continue
  konuMap.set(anahtar, {
    ders: k.ders, konu: k.konu, kod: top.code, sim: top.sim,
    title: kodMap.get(`${k.ders}|${top.code}`)?.title ?? '?', soruSay, elle: false,
  })
}

for (const s of sorular) {
  const e = konuMap.get(`${s.subject}|${s.konu}`)
  const gecti = !!e && (e.elle || e.sim >= ESIK)
  etiketli.push({
    soru: s,
    vec: cache[cacheKey(s)],
    kod: gecti ? e!.kod : null,
    sim: e?.sim ?? 0,
    title: gecti ? e!.title : null,
  })
}

// ── Denetim için TAM eşleme tablosunu dışa ver (elle düzeltmenin başlangıç noktası) ──
{
  const cikti: Record<string, unknown> = {}
  for (const [anahtar, e] of [...konuMap.entries()].sort()) {
    cikti[anahtar] = { kod: e.kod, sim: Number(e.sim.toFixed(3)), kazanim: e.title, soru: e.soruSay, kaynak: e.elle ? 'ELLE' : 'oto' }
  }
  writeFileSync('data/konu-kazanim-oto.json', JSON.stringify(cikti, null, 2), 'utf8')
}

// ═══════════════════════════════════════════════════════════════════════════
// RAPOR — benzerlik dağılımı (eşiği VERİYE bakarak seçmek için)
// ═══════════════════════════════════════════════════════════════════════════
const olculebilir = etiketli.filter((e) => mufredatliDersler.has(e.soru.subject))
const sims = olculebilir.map((e) => e.sim).sort((a, b) => a - b)
const yuzde = (p: number): number => sims[Math.floor((sims.length - 1) * p)] ?? 0

console.log('\n--- BENZERLİK DAĞILIMI (soru ↔ en yakın kazanım) ---')
console.log(`  min ${sims[0]?.toFixed(3)}  ·  p10 ${yuzde(0.1).toFixed(3)}  ·  medyan ${yuzde(0.5).toFixed(3)}  ·  p90 ${yuzde(0.9).toFixed(3)}  ·  max ${sims[sims.length - 1]?.toFixed(3)}`)
for (const e of [0.30, 0.35, 0.40, 0.45, 0.50, 0.55]) {
  const n = sims.filter((s) => s >= e).length
  console.log(`  eşik ${e.toFixed(2)} → ${String(n).padStart(4)} etiketlenir  (${(100 * n / sims.length).toFixed(0)}%),  ${sims.length - n} etiketsiz kalır`)
}

const etiketliSay = etiketli.filter((e) => e.kod).length
const etiketsiz = etiketli.filter((e) => !e.kod)
console.log(`\n--- SEÇİLEN EŞİK ${ESIK} İLE ---`)
console.log(`  kazanıma bağlandı : ${etiketliSay}`)
console.log(`  etiketsiz         : ${etiketsiz.length}`)
const etiketsizDers = new Map<string, number>()
for (const e of etiketsiz) etiketsizDers.set(e.soru.subject, (etiketsizDers.get(e.soru.subject) ?? 0) + 1)
for (const [d, n] of [...etiketsizDers.entries()].sort((a, b) => b[1] - a[1])) {
  const neden = mufredatliDersler.has(d) ? 'eşik altı' : 'DB\'de müfredatı yok'
  console.log(`      ${d.padEnd(32)} ${String(n).padStart(4)}   (${neden})`)
}

writeFileSync(CACHE, JSON.stringify(cache), 'utf8')

// ── KONU → KAZANIM TABLOSU — insan gözüyle denetlenebilir (380 satır, ders bazında) ──
const TABLO = arg('tablo')                    // --tablo <ders> → o dersin tam eşleme tablosu
console.log('\n--- KONU → KAZANIM EŞLEŞMELERİ ---')
const sirali = [...konuMap.values()].sort((a, b) => a.ders.localeCompare(b.ders) || b.sim - a.sim)
const gosterilecek = TABLO ? sirali.filter((k) => k.ders.toLocaleLowerCase('tr').includes(TABLO.toLocaleLowerCase('tr'))) : []

if (gosterilecek.length) {
  console.log(`\n  ${gosterilecek[0].ders} — ${gosterilecek.length} konu\n`)
  console.log('  SIM    SORU  KONU                                          → KAZANIM')
  console.log('  ' + '-'.repeat(108))
  for (const k of gosterilecek) {
    const im = k.sim >= ESIK ? ' ' : '✗'
    console.log(`  ${im}${k.sim.toFixed(3)} ${String(k.soruSay).padStart(5)}  ${k.konu.slice(0, 44).padEnd(44)} → ${k.kod} ${k.title.slice(0, 46)}`)
  }
} else {
  // Ders başına özet + eşik altı kalanlar
  const dersler = [...new Set(sirali.map((k) => k.ders))]
  console.log('\n  DERS                              KONU  EŞİK-ÜSTÜ  EŞİK-ALTI   ort.sim')
  console.log('  ' + '-'.repeat(70))
  for (const d of dersler) {
    const ks = sirali.filter((k) => k.ders === d)
    const ust = ks.filter((k) => k.sim >= ESIK).length
    const ort = ks.reduce((s, k) => s + k.sim, 0) / ks.length
    console.log(`  ${d.padEnd(32)} ${String(ks.length).padStart(5)} ${String(ust).padStart(10)} ${String(ks.length - ust).padStart(10)}   ${ort.toFixed(3)}`)
  }
  console.log('\n  → Bir dersin TAM tablosunu görmek için:  --tablo tarih')
}

if (!COMMIT) {
  console.log('\n>>> ÖN İZLEME — DB\'ye HİÇBİR ŞEY yazılmadı.')
  console.log('    Dağılıma bakıp eşiği seç, sonra:  --esik <n> --commit')
  process.exit(0)
}

// ═══════════════════════════════════════════════════════════════════════════
// COMMIT
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n=== COMMIT ===')
const hash = (t: string): string => createHash('md5').update(t).digest('hex')

// 1) yks_questions — servis havuzu (VEKTÖRSÜZ)
//
// ⚠️ KÜNYE ZORUNLU — source_type ATLANAMAZ.
//    0004 bir "kaynak ayrımı yasası" kurdu: source_type default'u 'ai_generated'.
//    Bu alanı yazmazsak 1730 GERÇEK ÖSYM sorusu DB'de "AI üretimi" diye durur ve:
//      · assembleSegment (test-modes.ts) onları adaptif teste sokar → öğrenciye
//        "senin için üretildi" diye 2019 çıkmış sorusu gider (ürün kuralı #6 ihlali),
//      · havuz hep dolu göründüğü için gerçek üretim hiç tetiklenmez,
//      · frontend "ÖSYM ÇIKMIŞ SORU" rozetini basamaz,
//      · osym.routes.ts (çıkmış sorular servisi) bu satırları HİÇ göremez.
//    0004'teki değişmezlik trigger'ı source_type'ı sonradan DÜZELTMEYE de izin vermez
//    (AI→çıkmış sahteciliğini önlemek için) → yanlış basılırsa tek çare SİL-YENİDEN BAS.
//    yq_osym_meta_chk: osym_cikmis ise exam_year + exam_label ZORUNLU.
const qRows = etiketli.map((e) => ({
  subject: e.soru.subject,
  kazanim_id: e.kod ? (globalKod.get(e.kod)?.id ?? null) : null,   // çapraz-ders eşlemesi olabilir
  question_text: e.soru.question_text,
  options: e.soru.options,
  correct_option: e.soru.correct_option,
  solution: null,                       // belgede yok → uydurulmaz
  difficulty: null,                     // belgede yok → uydurulmaz
  verified: true,                       // gerçek ÖSYM sorusu (insan yazımı, resmî)
  source_type: 'osym_cikmis',           // ← KÜNYE: AI değil, çıkmış soru
  exam_year: e.soru.yil,                // 2019
  exam_label: e.soru.sinav,             // 'TYT' | 'AYT'  (ders zaten subject sütununda)
  content_hash: hash(e.soru.question_text),
  topic: e.soru.konu,
}))
for (let i = 0; i < qRows.length; i += 200) {
  const { error } = await supabase.from('yks_questions').upsert(qRows.slice(i, i + 200), { onConflict: 'content_hash' })
  if (error) { console.error('yks_questions upsert hata: ' + error.message); process.exit(1) }
  process.stdout.write(`\r  yks_questions: ${Math.min(i + 200, qRows.length)}/${qRows.length}`)
}
console.log('')

// 2) yks_exemplars — üretim örneği (VEKTÖRLÜ)
//    topic = KAZANIM BAŞLIĞI (RPC tam eşleşme arıyor; ajanlar spec.topic olarak kazanım
//    başlığı gönderiyor — bkz. generation.ts:271). Etiketsizde belgenin konu başlığı kalır.
const eRows = etiketli.map((e) => ({
  subject: e.soru.subject,
  topic: e.title ?? e.soru.konu,
  difficulty: null,
  question_text: e.soru.question_text,
  options: e.soru.options,
  correct_option: e.soru.correct_option,
  solution: null,
  embedding: e.vec,
  content_hash: hash(e.soru.question_text),
  source: e.soru.kaynak,
}))
for (let i = 0; i < eRows.length; i += 100) {
  const { error } = await supabase.from('yks_exemplars').upsert(eRows.slice(i, i + 100), { onConflict: 'content_hash' })
  if (error) { console.error('yks_exemplars upsert hata: ' + error.message); process.exit(1) }
  process.stdout.write(`\r  yks_exemplars: ${Math.min(i + 100, eRows.length)}/${eRows.length}  (768d)`)
}
console.log('')

console.log(`\n✓ TAMAM — ${qRows.length} soru (servis) · ${eRows.length} exemplar (768d vektör)`)
console.log(`  kazanıma bağlı: ${etiketliSay}  ·  etiketsiz: ${etiketsiz.length}`)
process.exit(0)
