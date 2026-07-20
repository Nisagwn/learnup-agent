/**
 * Müfredat (kazanım) JSON → curriculum_nodes + yks_knowledge (768d vektör) ingestion.
 *
 * ⚠️ HİÇBİR VERİ UYDURULMAZ. Yalnız verilen JSON'da GERÇEKTEN yazan alanlar ingest edilir.
 *    Eksik alan varsa boş bırakılır; asla "tahmin" edilmez.
 *
 * GİRDİ — kazanım nesnelerinden oluşan bir JSON dizisi:
 *   [
 *     {
 *       "subject": "Matematik",          // ZORUNLU  (eş: ders)
 *       "grade": 9,                       // ZORUNLU  (eş: sinif, sınıf)
 *       "code": "9.1.1.1",                // ZORUNLU  (eş: kod) — resmî MEB kazanım kodu
 *       "title": "Önermeyi ... açıklar.", // ZORUNLU  (eş: kazanim, kazanım, metin)
 *       "unit": "Mantık",                 // önerilir (eş: unite, ünite)
 *       "area": "Önermeler",              // ops.     (eş: alt_alan, altAlan, konu)
 *       "aciklama": "Boole ve ...",       // ops. ama RAG KALİTESİNİ ASIL BU BELİRLER
 *       "terms": "önerme, bileşik ...",   // ops.     (eş: terimler)
 *       "symbols": "∧, ∨, ⇒"              // ops.     (eş: semboller)
 *     }, ...
 *   ]
 * Sarmalanmış biçim de kabul edilir: { "kazanimlar": [...] } | { "data": [...] } | { "items": [...] }
 *
 * ltree yolu otomatik türetilir:  <slug>.g<sınıf>.<ünite>.<alt alan>   ör. mat.g9.mantik.onermeler
 *
 * KULLANIM:
 *   # 1) ÖN İZLEME — DB'ye hiçbir şey yazmaz, doğrulama raporu basar
 *   bun src/scripts/ingest-curriculum.ts --file data/matematik.json --slug mat
 *
 *   # 2) YAZ — curriculum_nodes upsert + yks_knowledge embed(768) + insert
 *   bun src/scripts/ingest-curriculum.ts --file data/matematik.json --slug mat --commit
 *
 * ÖN KOŞUL: migrations/0007_curriculum_code_unique.sql çalıştırılmış olmalı
 *           (yoksa tekrar çalıştırma kazanımları çiftler).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { supabase } from '../clients/supabase.js'
import { embed } from '../lib/rag.js'

// ── CLI ──
const argv = process.argv.slice(2)
const arg = (n: string): string | undefined => {
  const i = argv.indexOf(`--${n}`)
  return i >= 0 ? argv[i + 1] : undefined
}
const FILE = arg('file')
const SLUG = arg('slug')                 // ltree kökü, ör. "mat" (verilmezse dersten türetilir)
const COMMIT = argv.includes('--commit')
const REPLACE = argv.includes('--replace') // aynı dersin eski yks_knowledge satırlarını sil
const MD = arg('md')                     // DB'ye gidecek TAM içeriği okunur dosyaya dök (yazma YOK)

if (!FILE) {
  console.error('Kullanım: --file <kazanimlar.json> [--slug mat] [--commit] [--replace]')
  process.exit(1)
}

// ── Türkçe → ASCII ltree etiketi (ltree yalnız [A-Za-z0-9_] kabul eder) ──
const TR: Record<string, string> = {
  ç: 'c', Ç: 'c', ğ: 'g', Ğ: 'g', ı: 'i', I: 'i', İ: 'i',
  ö: 'o', Ö: 'o', ş: 's', Ş: 's', ü: 'u', Ü: 'u',
}
const slugify = (s: string): string =>
  [...String(s)].map((c) => TR[c] ?? c).join('')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48)

/** Alan adı varyantlarını tolere eden okuyucu. */
const pick = (o: Record<string, unknown>, ...keys: string[]): string => {
  for (const k of keys) {
    const v = o[k]
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim()
  }
  return ''
}

type Node = {
  subject: string; grade: number | null; code: string; title: string
  unit: string; area: string; aciklama: string; terms: string; symbols: string
  // DÖP (Maarif Modeli) alanları — varsa grounding'i zenginleştirir
  surec: string[]; icerik: string; uygulama: string; kapsamDisi: string[]
  path: string
}

// ── Yükle + normalize ──
const parsed: unknown = JSON.parse(readFileSync(FILE, 'utf8'))
const rawList: unknown[] = Array.isArray(parsed)
  ? parsed
  : (['kazanimlar', 'kazanımlar', 'data', 'items', 'nodes'] as const)
      .map((k) => (parsed as Record<string, unknown>)?.[k])
      .find(Array.isArray) as unknown[] ?? []

if (rawList.length === 0) {
  console.error('JSON boş ya da beklenen biçimde değil (dizi veya {kazanimlar:[...]}).')
  process.exit(1)
}

const problems: string[] = []
const nodes: Node[] = []

rawList.forEach((r, i) => {
  const o = r as Record<string, unknown>
  const subject = pick(o, 'subject', 'ders')
  const gradeRaw = pick(o, 'grade', 'sinif', 'sınıf')
  const code = pick(o, 'code', 'kod')
  const title = pick(o, 'title', 'kazanim', 'kazanım', 'metin', 'text')
  const unit = pick(o, 'unit', 'unite', 'ünite')
  const area = pick(o, 'area', 'alt_alan', 'altAlan', 'konu', 'topic')
  const aciklama = pick(o, 'aciklama', 'açıklama', 'description', 'explanation')
  const terms = pick(o, 'terms', 'terimler')
  const symbols = pick(o, 'symbols', 'semboller')

  // ZORUNLU alan doğrulaması — eksikse UYDURMA YOK, hata raporla.
  const miss: string[] = []
  if (!subject) miss.push('subject/ders')
  if (!code) miss.push('code/kod')
  if (!title) miss.push('title/kazanim')
  if (miss.length) { problems.push(`#${i}: eksik alan → ${miss.join(', ')}`); return }

  // DÖP alanları (varsa)
  const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [])
  const surec = arr(o.surec ?? o['süreç'])
  const icerik = pick(o, 'icerik', 'içerik', 'icerik_cercevesi')
  const uygulama = pick(o, 'uygulama', 'uygulamalar')
  const kapsamDisi = arr(o.kapsamDisi ?? o['kapsam_disi'] ?? o['kapsamDışı'])

  const grade = gradeRaw ? Number(String(gradeRaw).replace(/\D/g, '')) || null : null
  // ltree kökü. Öncelik sırası:
  //   1) --slug (elle)
  //   2) MEB'in KENDİ kod öneki:  "BİY.9.1.1" → "biy"   ← kanonik ve KARARLI
  //   3) ders adından türet (son çare; kodsuz veri için)
  // (2) şart: ders adından türetmek "biyoloji" verir ve DB'deki mevcut "biy.*" yollarını
  // sessizce ikizler/bozardı. MEB kısaltması dersin resmî kimliğidir — tahmin değil.
  const codeRoot = slugify(code.split('.')[0] ?? '')
  const root = SLUG || codeRoot || slugify(subject).slice(0, 8)
  const path = [root, grade ? `g${grade}` : null, slugify(unit || 'genel'), area ? slugify(area) : null]
    .filter(Boolean).join('.')

  nodes.push({ subject, grade, code, title, unit, area, aciklama, terms, symbols, surec, icerik, uygulama, kapsamDisi, path })
})

// Tekrar kontrolü — anahtar (subject, code). Kazanım kodu ders İÇİNDE benzersizdir:
// "9.1.1.1" hem Matematik'te hem Fizik'te vardır → yalnız code ile bakmak yanlış olur.
const seen = new Map<string, number>()
for (const n of nodes) {
  const key = `${n.subject}|${n.code}`
  seen.set(key, (seen.get(key) ?? 0) + 1)
}
const dupes = [...seen.entries()].filter(([, c]) => c > 1)

/**
 * KAPSAM SINIRI CÜMLELERİNİ pedagoji metninden KURTAR.
 *
 * `uygulama` ("Öğrenme-öğretme uygulaması") ÖĞRETMENE ders anlatma talimatıdır: "öğrenciler
 * gruplara ayrılabilir", "drama etkinliği yapmalarını (OB9) ister", "poster hazırlayabilir".
 * Soru üretimi için değersizdir — ama İÇİNE resmî KAPSAM SINIRLARI gömülmüştür ve onlar altındır:
 *   "Ray sisteminde çembersel hareketle ilgili matematiksel işlemlerden kaçınılır."
 *   "Bu süreçte mikrofilament ve arafilament kavramlarına girilmez."
 * Bunlar modele NEYİ SORMAYACAĞINI söyler → müfredat dışına taşan soruyu doğmadan engeller.
 *
 * ÖLÇÜLDÜ: `kapsamDisi` ALANI yalnız 42 kayıtta dolu, ama sınır cümlesi 68 kayıtta `uygulama`
 * metninin içinde gizli (Fizik: 3'e karşı 26). Yani pedagojiyi TOPTAN atmak, 23 Fizik kazanımının
 * resmî sınırını da çöpe atardı. Süzüp kurtarıyoruz: gürültü gidiyor, sınır kalıyor.
 */
const SINIR_DESENI =
  /kaçınıl|verilmez|değinilmez|girilmez|sınırlı kalın|yer verilmez|yapılmaz|beklenmez|dahil edilmez|inilmez/i
const sinirCumleleri = (uygulama: string): string[] =>
  uygulama
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 15 && SINIR_DESENI.test(s))

/**
 * yks_knowledge grounding metni — RAG'in dayandığı gövde.
 * Resmî belgede ne varsa o girer; eksik alan atlanır (asla uydurulmaz).
 *
 * ⚠️ `Öğrenme-öğretme uygulaması` BİLEREK GİRMİYOR — geri ekleme. Chunk'ların %42'siydi ve
 * tamamı öğretmene ders anlatma talimatıydı; RAG'in işi modele fizik ÖĞRETMEK değil (model
 * zaten biliyor) SINIR ÇİZMEK. Sınırı çizen kısımlar `İçerik çerçevesi` + `Anahtar kavramlar`
 * + `KAPSAM DIŞI` — onlar duruyor. Pedagoji yalnız token yiyor ve dikkati dağıtıyordu
 * (8 parçalık prompt: ~6.900 → ~4.000 token). İçindeki sınır cümleleri sinirCumleleri() ile
 * kurtarılıp KAPSAM DIŞI'na taşınır → bilgi kaybı YOK.
 */
const buildContent = (n: Node): string => {
  const p = [`${n.code} ${n.title}`]
  if (n.surec.length) p.push('Süreç bileşenleri:\n' + n.surec.map((s) => `- ${s}`).join('\n'))
  if (n.icerik) p.push(`İçerik çerçevesi: ${n.icerik}`)
  if (n.terms) p.push(`Anahtar kavramlar: ${n.terms}`)
  if (n.symbols) p.push(`Sembol ve gösterimler: ${n.symbols}`)
  // Resmî alan + pedagoji metninden kurtarılanlar, tek listede (aynı cümle iki kez girmesin).
  const sinirlar = [...new Set([...n.kapsamDisi, ...sinirCumleleri(n.uygulama)])]
  if (sinirlar.length) {
    p.push('KAPSAM DIŞI (resmî program bunlara yer vermez — soru üretiminde AŞILMAZ):\n' +
      sinirlar.map((s) => `- ${s}`).join('\n'))
  }
  if (n.aciklama) p.push(`Açıklama: ${n.aciklama}`)
  return p.join('\n')
}
const buildContext = (n: Node): string =>
  [`Ders: ${n.subject}`, n.grade ? `Sınıf: ${n.grade}` : '', n.unit ? `Ünite: ${n.unit}` : '',
   n.area ? `Alt öğrenme alanı: ${n.area}` : ''].filter(Boolean).join(' | ')

// ── ÖN İZLEME RAPORU ──
const bySubject = new Map<string, number>()
for (const n of nodes) bySubject.set(n.subject, (bySubject.get(n.subject) ?? 0) + 1)
const cov = (f: (n: Node) => boolean): string => {
  const c = nodes.filter(f).length
  return `${c}/${nodes.length}`
}

console.log(`\n=== ÖN İZLEME — ${FILE} ===`)
console.log(`Okunan kayıt : ${rawList.length}`)
console.log(`Geçerli      : ${nodes.length}`)
console.log(`Reddedilen   : ${problems.length}`)
console.log(`Dersler      : ${[...bySubject.entries()].map(([s, c]) => `${s} (${c})`).join(', ')}`)
console.log('\n--- GROUNDING KAPSAMI (dolu olan kayıt sayısı) ---')
console.log(`  ünite/tema        : ${cov((n) => !!n.unit)}`)
console.log(`  süreç bileşenleri : ${cov((n) => n.surec.length > 0)}`)
console.log(`  içerik çerçevesi  : ${cov((n) => !!n.icerik)}`)
console.log(`  anahtar kavramlar : ${cov((n) => !!n.terms)}`)
// `uygulama` artık content'e GİRMİYOR (bkz. buildContent) — yalnız içindeki sınır cümleleri
// kurtarılıyor. Rapor bunu ayrı ayrı gösterir; yoksa "3/106" deyip 26 sınırı gizlerdi.
console.log(`  uygulama (ATILIYOR): ${cov((n) => !!n.uygulama)}   ← pedagoji; content'e girmez`)
console.log(`  KAPSAM DIŞI — resmî alan   : ${cov((n) => n.kapsamDisi.length > 0)}`)
console.log(`  KAPSAM DIŞI — pedagojiden kurtarılan: ${cov((n) => sinirCumleleri(n.uygulama).length > 0)}`)
console.log(`  KAPSAM DIŞI — TOPLAM: ${cov((n) => n.kapsamDisi.length + sinirCumleleri(n.uygulama).length > 0)}   ← soru üretiminde kapsamı korur`)
console.log(`  açıklama (eski tip): ${cov((n) => !!n.aciklama)}`)

if (dupes.length) {
  console.log(`\n⚠️  TEKRAR EDEN KOD (${dupes.length}) — unique index bunları reddeder:`)
  dupes.slice(0, 10).forEach(([c, n]) => console.log(`   ${c} × ${n}`))
}
if (problems.length) {
  console.log(`\n⚠️  REDDEDİLEN KAYITLAR (ilk 10):`)
  problems.slice(0, 10).forEach((p) => console.log('   ' + p))
}

console.log('\n--- ÖRNEK (ilk 2, DB\'ye gidecek TAM hâli) ---')
for (const n of nodes.slice(0, 2)) {
  console.log(`\n[${n.code}]  path=${n.path}  grade=${n.grade ?? '-'}`)
  console.log(`  title  : ${n.title}`)
  console.log(`  context: ${buildContext(n)}`)
  console.log(`  content (embed edilecek):\n    ${buildContent(n).replace(/\n/g, '\n    ')}`)
}

// ── --md: DB'ye gidecek TAM içeriği okunur dosyaya dök ──
// ⚠️ Aynı buildContent()/buildContext() fonksiyonlarını kullanır → gördüğün = basılacak olan.
if (MD) {
  const L: string[] = []
  L.push(`# DB'ye yazılacak içerik — ${[...bySubject.keys()].join(', ')}`)
  L.push('')
  L.push(`Kaynak: \`${FILE}\` · Kayıt: **${nodes.length}**`)
  L.push('')
  L.push('> Bu dosya, ingestion\'ın DB\'ye yazdığı **aynı fonksiyonlarla** üretildi.')
  L.push('> Aşağıdaki `content` metinleri **birebir** `yks_knowledge.content` olarak yazılır ve embed edilir (768d).')
  L.push('')
  L.push('---')
  L.push('')
  L.push('## 1) `curriculum_nodes` — müfredat omurgası')
  L.push('')
  L.push('| code | grade | tema (unit) | path (ltree) | title |')
  L.push('|---|---|---|---|---|')
  for (const n of nodes) {
    const esc = (s: string): string => s.replace(/\|/g, '\\|')
    L.push(`| \`${n.code}\` | ${n.grade ?? '-'} | ${esc(n.unit)} | \`${n.path}\` | ${esc(n.title)} |`)
  }
  L.push('')
  L.push('---')
  L.push('')
  L.push('## 2) `yks_knowledge` — RAG grounding (her biri 768d vektörlenir)')
  L.push('')
  for (const n of nodes) {
    L.push(`### ${n.code} — ${n.title}`)
    L.push('')
    L.push(`**context** (RPC filtresi): \`${buildContext(n)}\``)
    L.push(`**path**: \`${n.path}\` · **kazanim_code**: \`${n.code}\``)
    L.push('')
    L.push('**content** (embed edilen tam metin):')
    L.push('')
    L.push('```text')
    L.push(buildContent(n))
    L.push('```')
    L.push('')
  }
  mkdirSync(dirname(MD), { recursive: true })
  writeFileSync(MD, L.join('\n'), 'utf8')
  console.log(`\n📄 DB'ye gidecek TAM içerik yazıldı → ${MD}`)
}

if (!COMMIT) {
  console.log('\n>>> ÖN İZLEME modu — DB\'ye HİÇBİR ŞEY yazılmadı. Yazmak için: --commit')
  process.exit(0)
}
if (dupes.length || problems.length) {
  console.error('\n⛔ Tekrar eden kod / reddedilen kayıt var — düzeltmeden --commit yapılmaz.')
  process.exit(1)
}

// ── COMMIT ──
console.log('\n=== COMMIT ===')
const subjects = [...bySubject.keys()]

if (REPLACE) {
  for (const s of subjects) {
    const { error } = await supabase.from('yks_knowledge').delete().eq('subject', s)
    if (error) { console.error('yks_knowledge temizlenemedi: ' + error.message); process.exit(1) }
    console.log(`  yks_knowledge temizlendi: ${s}`)
  }
}

// 1) curriculum_nodes — code üzerinde upsert (idempotent; id'ler korunur)
const { data: saved, error: nErr } = await supabase
  .from('curriculum_nodes')
  .upsert(
    nodes.map((n) => ({
      subject: n.subject, code: n.code, title: n.title,
      path: n.path, grade: n.grade, node_type: 'kazanim',
    })),
    { onConflict: 'subject,code' },   // kazanım kodu ders İÇİNDE benzersiz
  )
  .select('id, code')
if (nErr) {
  console.error('curriculum_nodes yazılamadı: ' + nErr.message)
  if (nErr.message.includes('no unique') || nErr.code === '42P10') {
    console.error('→ ÖN KOŞUL: migrations/0007_curriculum_code_unique.sql çalıştırılmalı')
    console.error('   (unique index: curriculum_nodes (subject, code))')
  }
  process.exit(1)
}
console.log(`curriculum_nodes: ${saved?.length ?? 0} kazanım upsert edildi`)

// 2) yks_knowledge — 768d embedding'li grounding parçaları (batch)
//
// ⚠️ UPSERT, insert DEĞİL. curriculum_nodes idempotent olduğu için bu scripti tekrar çalıştırmak
//    normal iş akışı; INSERT olsaydı her koşuda grounding satırları ÇİFTLENİRDİ (bir kez oldu:
//    576 kazanıma karşılık 724 satır). Çift satır RAG'de aynı kazanımı iki kez döndürür →
//    match_count dolar, ajanın gördüğü bağlam çeşitliliği düşer.
//    ÖN KOŞUL: migrations/0008_yks_knowledge_unique.sql  (unique index: subject, kazanim_code)
//
// BATCH'İ KARAKTER BÜTÇESİNE GÖRE BÖL, sabit sayıya göre DEĞİL.
// Sabit 64 ile Edebiyat'ta istek ~193k token'a çıkıp API'yi patlattı (ders başına içerik
// uzunluğu 6 kata kadar değişiyor). Bütçe ile büyük içerikli dersler otomatik küçük batch alır.
const MAX_ITEM = 64          // istek başına en fazla kayıt
const MAX_CHARS = 120_000    // istek başına en fazla karakter (~34k token — güvenli marj)
const batches: Node[][] = []
{
  let cur: Node[] = []
  let curChars = 0
  for (const n of nodes) {
    const len = buildContent(n).length
    if (cur.length && (cur.length >= MAX_ITEM || curChars + len > MAX_CHARS)) {
      batches.push(cur); cur = []; curChars = 0
    }
    cur.push(n); curChars += len
  }
  if (cur.length) batches.push(cur)
}

let done = 0
for (const chunk of batches) {
  const contents = chunk.map(buildContent)
  const vectors = await embed(contents)         // rag.ts → 768d + drift-guard (fail-fast)
  const { error } = await supabase.from('yks_knowledge').upsert(
    chunk.map((n, j) => ({
      subject: n.subject, path: n.path, kazanim_code: n.code,
      context: buildContext(n), content: contents[j], embedding: vectors[j],
    })),
    { onConflict: 'subject,kazanim_code' },
  )
  if (error) { console.error('yks_knowledge upsert hata: ' + error.message); process.exit(1) }
  done += chunk.length
  console.log(`  yks_knowledge: ${done}/${nodes.length}  (768d)`)
}

console.log(`\n✓ TAMAM — ${saved?.length ?? 0} kazanım düğümü, ${done} grounding vektörü.`)
process.exit(0)
