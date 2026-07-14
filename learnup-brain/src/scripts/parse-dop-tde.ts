/**
 * TÜRK DİLİ VE EDEBİYATI (TDE) DÖP — ÖZEL PARSER.
 *
 * NEDEN AYRI SCRIPT: Edebiyat, diğer 9 dersten YAPISAL olarak farklı dizilmiş.
 *
 *   Diğer dersler:  BİY.9.1.1  → kod ZATEN sınıf+tema+çıktı taşır, ders içinde BENZERSİZ.
 *   Edebiyat     :  TDE1.1     → bir BECERİ kodudur; belge boyunca 24 KEZ tekrar eder.
 *                                Tüm belgede yalnız 16 farklı kod var (TDE1.1 … TDE4.4).
 *
 * Bu kodları olduğu gibi kullanmak ölümcül olurdu: DB'deki unique(subject, code) kısıtı
 * aynı koda sahip 24 kazanımı TEK satıra çökertir → müfredatın %90'ı sessizce kaybolur.
 *
 * KİMLİK: Edebiyat'ta bir kazanımı (sınıf, tema, TDE kodu) ÜÇLÜSÜ belirler.
 *   "TDE1.1. 'Sözün İnceliği' temasında ele alınan metinlerde dinlemeyi/izlemeyi yönetebilme"  (9/1)
 *   "TDE1.1. 'Sanatın Dili'  temasında ele alınan metinlerde dinlemeyi/izlemeyi yönetebilme"   (10/1)
 *   → Aynı beceri, FARKLI kazanım.
 *
 * SENTETİK KOD:  TDE.<sınıf>.<tema>.<beceri>.<çıktı>     ör. TDE1.1 @ 9.sınıf 1.tema → TDE.9.1.1.1
 *   Hem yapısal konumu hem MEB'in kendi kodunu korur (son iki bileşen = TDE1.1).
 *   Diğer derslerle aynı okuma kuralı geçerli: kod[1]=sınıf, kod[2]=tema.
 *
 * BELGE KATMANLARI:
 *   1) GENEL BECERİ TABLOSU (belgede BİR kez, ~965-1272):
 *        TDE1.1. Dinlemeyi/İzlemeyi Yönetebilme
 *            a) TDE1.1.1. Seçim yapar.
 *               • Metni dinlemeye başlamadan önce amacını belirler.
 *      → SÜREÇ BİLEŞENLERİ BURADADIR; tema bloklarında tekrar edilmez. Koda göre bağlanır.
 *   2) TEMA BLOKLARI: kazanımın temaya somutlanmış hâli + İÇERİK ÇERÇEVESİ + Anahtar Kavramlar
 *   3) ÖĞRENME-ÖĞRETME UYGULAMALARI: kod başlıklı bloklar; başlık VİRGÜLLÜ olabilir
 *        "TDE4.1, TDE4.2, TDE4.3, TDE4.4"  → tek metin, DÖRT kazanıma birden ait.
 *
 * ⚠️ HİÇBİR VERİ UYDURULMAZ. Belgede yazmayan alan BOŞ bırakılır.
 * 🛡️ DOĞRULAMA: çıkarılan kod kümesi, ham metinden bağımsız taranan kümeyle karşılaştırılır;
 *    tutmazsa JSON ÜRETİLMEZ.
 *
 * KULLANIM:
 *   bun src/scripts/parse-dop-tde.ts --txt data/pdf/<edebiyat>.txt --out data/tde.json
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const argv = process.argv.slice(2)
const arg = (n: string): string | undefined => {
  const i = argv.indexOf(`--${n}`)
  return i >= 0 ? argv[i + 1] : undefined
}
const TXT = arg('txt')
const OUT = arg('out')
if (!TXT || !OUT) {
  console.error('Kullanım: --txt <edebiyat.txt> --out <tde.json>')
  process.exit(1)
}

const SUBJECT = 'Türk Dili ve Edebiyatı'
const PREFIX = 'TDE'

const raw = readFileSync(TXT, 'utf8')
const RE_PAGE_HDR = /^\s*[A-ZÇĞİÖŞÜ\s.]+\s+DERSİ ÖĞRETİM PROGRAMI\s*$/
const lines = raw.split(/\r?\n/).filter((l) => !RE_PAGE_HDR.test(l))

// ── Satır sonu tirelemesini onar (PDF iki yana yaslı dizgi kelimeyi böler) ──
const appendFrag = (acc: string, p: string): string => {
  if (!acc) return p
  if (/[A-Za-zÇĞİÖŞÜçğıöşü]-$/.test(acc)) {
    return /^[a-zçğıöşü]/.test(p) ? acc.slice(0, -1) + p : acc + p
  }
  return acc + ' ' + p
}
const joinLines = (parts: string[]): string => parts.reduce(appendFrag, '').replace(/\s+/g, ' ').trim()

// ═══════════════════════════════════════════════════════════════════════════
// GÖVDE SINIRI — "9/10/11/12. SINIF TEMALARI"
// (HAZIRLIK SINIFI temaları bundan ÖNCE gelir; YKS kapsamı dışı → bilerek atlanır, raporlanır.)
// ═══════════════════════════════════════════════════════════════════════════
const RE_SINIF = /^\s*(9|10|11|12)\.\s*SINIF\b(?!.*DERSİ)(?!.*\d\s*$)/
const RE_TEMA = /^\s*(\d{1,2})\.\s*TEMA:\s*(.+?)\s*$/

const sinifAt: Array<[number, number]> = []
const temaAt: Array<[number, number, string]> = []
lines.forEach((l, i) => {
  const s = RE_SINIF.exec(l)
  if (s) sinifAt.push([i, Number(s[1])])
  const t = RE_TEMA.exec(l)
  if (t) temaAt.push([i, Number(t[1]), t[2].trim()])
})
if (!sinifAt.length) { console.error('⛔ "N. SINIF TEMALARI" başlığı bulunamadı.'); process.exit(1) }

const BODY_START = sinifAt[0][0]
const hazirlikTema = temaAt.filter(([i]) => i < BODY_START).length
const temaBlocks = temaAt.filter(([i]) => i > BODY_START)
const gradeOfLine = (i: number): number => {
  let g = 0
  for (const [li, gr] of sinifAt) { if (li <= i) g = gr; else break }
  return g
}

// ═══════════════════════════════════════════════════════════════════════════
// KATMAN 1 — GENEL BECERİ TABLOSU (gövdeden ÖNCE): TDE kodu → süreç bileşenleri
// ═══════════════════════════════════════════════════════════════════════════
const RE_GEN_SUREC = /^\s*[a-zçğıöşü]\)\s*TDE(\d+)\.(\d+)\.(\d+)\.\s*(.*)$/
const RE_BULLET = /^\s*[•▪]\s*(.*)$/

type GenSurec = { ad: string; detay: string[] }
const genericSurec = new Map<string, GenSurec[]>()   // "TDE1.1" → [{ad, detay[]}]
let gCode = ''
let gCur: GenSurec | null = null

// ⚠️ TABLONUN SONUNU BULMAK ŞART. Tablo bittikten sonra belge devam ediyor
//    ("1.3. TÜRK DİLİ VE EDEBİYATI … TEMA, ÖĞRENME ÇIKTISI SAYISI VE SÜRE TABLOLARI").
//    Sınır konmazsa, sonraki TÜM metin son süreç bileşenine yapışır (ölçüldü: 110.000 karakter).
const RE_BOLUM_BASLIK = /^\s*\d+\.\d+\.\s+[A-ZÇĞİÖŞÜ]/     // "1.3. TÜRK DİLİ…" gibi numaralı bölüm başlığı
const GEN_START = lines.findIndex((l) => RE_GEN_SUREC.test(l))
let GEN_END = BODY_START
for (let i = GEN_START + 1; i < BODY_START; i++) {
  if (RE_BOLUM_BASLIK.test(lines[i])) { GEN_END = i; break }
}
if (GEN_START < 0) { console.error('⛔ Genel beceri tablosu bulunamadı (a) TDEx.y.z satırı yok).'); process.exit(1) }

for (let i = GEN_START; i < GEN_END; i++) {
  const l = lines[i]
  const s = RE_GEN_SUREC.exec(l)
  if (s) {
    gCode = `TDE${s[1]}.${s[2]}`
    if (!genericSurec.has(gCode)) genericSurec.set(gCode, [])
    gCur = { ad: s[4].trim(), detay: [] }
    genericSurec.get(gCode)!.push(gCur)
    continue
  }
  const b = RE_BULLET.exec(l)
  if (b && gCur) { gCur.detay.push(b[1].trim()); continue }
  // madde/süreç metni sonraki satıra sarkmışsa tamamla
  if (gCur && l.trim() && !/^\s*(TDE\d|METİN TAHLİLİ|EDEBİYAT ATÖLYESİ|DİNLEME|OKUMA|KONUŞMA|YAZMA)/.test(l)) {
    if (gCur.detay.length) gCur.detay[gCur.detay.length - 1] = appendFrag(gCur.detay[gCur.detay.length - 1], l.trim())
    else gCur.ad = appendFrag(gCur.ad, l.trim())
  }
}

/** Süreç bileşenlerini okunur tek satırlara çevir: "Seçim yapar. — detay1 detay2" */
const surecOf = (tdeCode: string): string[] =>
  (genericSurec.get(tdeCode) ?? []).map((s) =>
    s.detay.length ? `${s.ad} — ${s.detay.join(' ')}` : s.ad,
  )

// ═══════════════════════════════════════════════════════════════════════════
// KATMAN 2+3 — TEMA BLOKLARI
// ═══════════════════════════════════════════════════════════════════════════
type Cikti = {
  subject: string; grade: number; code: string; mebCode: string
  title: string; unit: string; temaNo: number; area: string
  surec: string[]; icerik: string; terms: string; aciklama: string
  uygulama: string; kapsamDisi: string[]
}

const AREALAR = new Set(['Dinleme/İzleme', 'Okuma', 'Konuşma', 'Yazma'])
const RE_CIKTI = /(?:^|\s)TDE(\d+)\.(\d+)\.\s+(.*)$/
// ⚠️ STOP eksikse bir bölüm bir sonrakini YUTAR. Ölçülen: "Anahtar Kavramlar"dan sonra
//    "ÖĞRENME KANITLARI" geliyordu; listede olmadığı için terms 19.500 karaktere şişmişti.
const STOP = /^\s*(İÇERİK ÇERÇEVESİ|Anahtar Kavramlar|ÖĞRENME|KANITLARI|Ölçme|Öğrenme-Öğretme|Uygulamaları|Süreç Çerçevesi|FARKLILAŞTIRMA|ÖĞRETMEN|YANSITMALARI|DERS SAATİ|ALAN\s*$|BECERİLERİ|KAVRAMSAL|EĞİLİMLER|PROGRAMLAR|DİSİPLİNLER|BECERİLER|Sosyal-Duygusal|Değerler|Okuryazarlık|Zenginleştirme|Destekleme|\d+\.\s*TEMA:|(9|10|11|12)\.\s*SINIF)/

function collect(from: number, to: number, label: RegExp): string {
  const out: string[] = []
  let on = false
  for (let i = from; i < to; i++) {
    const l = lines[i]
    if (!on) {
      const m = label.exec(l)
      if (m) { on = true; const rest = l.slice(m[0].length).trim(); if (rest) out.push(rest) }
      continue
    }
    if (!l.trim()) continue
    if (/^\s*\d{1,3}\s*$/.test(l)) continue
    if (STOP.test(l)) break
    out.push(l.trim())
  }
  return joinLines(out)
}

const ciktilar: Cikti[] = []
const docCodesPerTema = new Map<string, Set<string>>()   // bağımsız sayım için

for (let t = 0; t < temaBlocks.length; t++) {
  const [start, temaNo, temaAd] = temaBlocks[t]
  const end = t + 1 < temaBlocks.length ? temaBlocks[t + 1][0] : lines.length
  const grade = gradeOfLine(start)

  const icerik = collect(start, end, /^\s*İÇERİK ÇERÇEVESİ\s*/)
  const terms = collect(start, end, /^\s*Anahtar Kavramlar\s*/)

  // ── Çıktı bölgesi: "ÖĞRENME ÇIKTILARI"dan "İÇERİK ÇERÇEVESİ"ne ──
  let cStart = -1, cEnd = end
  for (let i = start; i < end; i++) {
    if (cStart < 0 && /ÖĞRENME ÇIKTILARI|SÜREÇ BİLEŞENLERİ/.test(lines[i])) cStart = i
    if (cStart >= 0 && i > cStart && /^\s*İÇERİK ÇERÇEVESİ/.test(lines[i])) { cEnd = i; break }
  }
  if (cStart < 0) { console.error(`⛔ ${grade}/${temaNo} ${temaAd}: çıktı bölgesi yok.`); process.exit(1) }

  const byMeb = new Map<string, Cikti>()
  const temaKey = `${grade}|${temaNo}`
  docCodesPerTema.set(temaKey, new Set())
  let area = ''
  let cur: Cikti | null = null

  for (let i = cStart; i < cEnd; i++) {
    const l = lines[i]
    // sütun etiketini soyup beceri alanı başlığı mı diye bak
    const bare = l.replace(/ÖĞRENME ÇIKTILARI|VE SÜREÇ BİLEŞENLERİ/g, '').trim()
    if (AREALAR.has(bare)) { area = bare; cur = null; continue }

    const m = RE_CIKTI.exec(l)
    if (m) {
      const mebCode = `TDE${m[1]}.${m[2]}`
      docCodesPerTema.get(temaKey)!.add(mebCode)
      if (!byMeb.has(mebCode)) {
        cur = {
          subject: SUBJECT, grade, temaNo, unit: temaAd, area,
          mebCode,
          code: `${PREFIX}.${grade}.${temaNo}.${m[1]}.${m[2]}`,   // SENTETİK, benzersiz
          title: m[3].trim(),
          surec: surecOf(mebCode),          // genel beceri tablosundan bağlanır
          icerik, terms, aciklama: '', uygulama: '', kapsamDisi: [],
        }
        byMeb.set(mebCode, cur)
      } else cur = byMeb.get(mebCode)!
      continue
    }
    if (!cur) continue
    const txt = l.trim()
    if (!txt || /^\d{1,3}$/.test(txt)) continue
    if (STOP.test(l)) { cur = null; continue }
    cur.title = appendFrag(cur.title, txt)     // başlık sarkması
  }

  // ── Uygulama bölgesi ──
  let uStart = -1, uEnd = end
  for (let i = cEnd; i < end; i++) {
    if (uStart < 0 && /Öğrenme-Öğretme|Uygulamaları/.test(lines[i])) { uStart = i; continue }
    if (uStart >= 0 && /^\s*(FARKLILAŞTIRMA|ÖĞRETMEN)/.test(lines[i])) { uEnd = i; break }
  }

  if (uStart >= 0) {
    let codes: string[] = []
    const buf: string[] = []
    const giris: string[] = []          // ilk kod başlığından ÖNCEKİ metin = tema düzeyi "Süreç Çerçevesi"

    const flushU = (): void => {
      const text = joinLines(buf).replace(/^(Uygulamaları|Öğrenme-Öğretme)\s+/, '').trim()
      if (text) {
        for (const mc of codes) {
          const c = byMeb.get(mc)
          if (!c) continue
          c.uygulama = (c.uygulama ? c.uygulama + ' ' : '') + text
          for (const sent of text.split(/(?<=\.)\s+/)) {
            if (/değinilmez|verilmez|girilmez|yer verilmez|yapılmaz/.test(sent)) c.kapsamDisi.push(sent.trim())
          }
        }
      }
      buf.length = 0
    }

    /** Satır SADECE TDE kodlarından mı oluşuyor? ("TDE4.1, TDE4.2, TDE4.3, TDE4.4" → 4 kod) */
    const baslikKodlari = (line: string): string[] | null => {
      const rest = line.replace(/Öğrenme-Öğretme|Uygulamaları/g, '').trim()
      if (!rest) return null
      const RE_ALL = /TDE(\d+)\.(\d+)/g
      const found = [...rest.matchAll(RE_ALL)].map((m) => `TDE${m[1]}.${m[2]}`)
      if (!found.length) return null
      const kalan = rest.replace(RE_ALL, '').replace(/\b(ve|ile)\b|[\s.,;:()\-–—]|\d{1,3}/g, '')
      return kalan.length === 0 ? found : null
    }

    for (let i = uStart; i < uEnd; i++) {
      const l = lines[i]
      const hdr = baslikKodlari(l)
      if (hdr) { flushU(); codes = hdr; continue }
      const txt = l.trim()
      if (!txt || /^\d{1,3}$/.test(txt)) continue
      if (codes.length) buf.push(txt)
      else giris.push(txt)              // henüz kod başlığı gelmedi → tema düzeyi giriş
    }
    flushU()

    // Tema düzeyi "Süreç Çerçevesi" metnini TÜM kazanımlara bağla (paylaşılan bağlam)
    const girisMetni = joinLines(giris).replace(/^(Uygulamaları|Öğrenme-Öğretme)\s+/, '').trim()
    if (girisMetni) for (const c of byMeb.values()) c.aciklama = girisMetni
  }

  ciktilar.push(...byMeb.values())
}

// ═══════════════════════════════════════════════════════════════════════════
// 🛡️ DOĞRULAMA
// ═══════════════════════════════════════════════════════════════════════════
console.log(`\n=== ${SUBJECT} — TDE PARSE RAPORU ===`)
console.log(`Kaynak            : ${TXT}`)
console.log(`Genel beceri kodu : ${genericSurec.size} (süreç bileşenleri buradan bağlandı)`)
console.log(`Tema sayısı       : ${temaBlocks.length}   (HAZIRLIK sınıfı ${hazirlikTema} teması BİLEREK atlandı — YKS kapsamı dışı)`)
console.log(`Toplam kazanım    : ${ciktilar.length}\n`)

console.log('SINIF  TEMA                        KAZANIM  SÜREÇ  UYGULAMA')
console.log('-'.repeat(64))
const grup = new Map<string, Cikti[]>()
for (const c of ciktilar) {
  const k = `${c.grade}|${c.temaNo}|${c.unit}`
  if (!grup.has(k)) grup.set(k, [])
  grup.get(k)!.push(c)
}
for (const [k, arr] of grup) {
  const [g, , ad] = k.split('|')
  const su = arr.reduce((n, c) => n + c.surec.length, 0)
  const uy = arr.filter((c) => c.uygulama).length
  console.log(`${g.padEnd(6)} ${ad.slice(0, 26).padEnd(27)} ${String(arr.length).padStart(7)} ${String(su).padStart(6)} ${String(uy).padStart(9)}`)
}

const hatalar: string[] = []

// D1 — BAĞIMSIZ SAYIM: her temanın çıktı bölgesinde geçen her TDE kodu çıkarıldı mı?
for (const [tk, kodlar] of docCodesPerTema) {
  const [g, tn] = tk.split('|')
  const cikan = new Set(ciktilar.filter((c) => `${c.grade}|${c.temaNo}` === tk).map((c) => c.mebCode))
  for (const kod of kodlar) if (!cikan.has(kod)) hatalar.push(`D1 EKSİK: ${g}. sınıf / ${tn}. tema → ${kod} belgede var, çıkarılmadı`)
}
// D2 — sentetik kodlar BENZERSİZ mi? (unique(subject,code) çakışması = veri kaybı)
const say = new Map<string, number>()
for (const c of ciktilar) say.set(c.code, (say.get(c.code) ?? 0) + 1)
for (const [c, n] of say) if (n > 1) hatalar.push(`D2 TEKRAR EDEN SENTETİK KOD: ${c} ×${n}`)
// D3 — her kazanımın süreç bileşeni bağlandı mı? (genel tablodan)
for (const c of ciktilar) if (!c.surec.length) hatalar.push(`D3 SÜREÇ BAĞLANMADI: ${c.code} (${c.mebCode}) — genel beceri tablosunda yok`)
// D4 — başlık var mı?
for (const c of ciktilar) if (c.title.trim().length < 10) hatalar.push(`D4 BAŞLIK YOK: ${c.code} → "${c.title}"`)

// D5 — ALAN SAĞLIĞI (bölüm sızıntısı yakalayıcı).
//   D1-D4 yalnız KOD bütünlüğüne bakar; bir bölümün diğerini YUTMASINI göremez.
//   Gerçekten oldu: eksik STOP yüzünden "Anahtar Kavramlar" tüm uygulama bölümünü yuttu (19.500 krk),
//   sınırsız genel tablo da son süreç bileşenine 110.000 karakter yapıştırdı.
//   Bu tavanlar "normal"in çok üstünde; aşılıyorsa sebep içerik değil, SIZINTIDIR.
const TAVAN: Array<[string, (c: Cikti) => number, number]> = [
  ['title', (c) => c.title.length, 400],
  ['terms', (c) => c.terms.length, 3000],
  ['icerik', (c) => c.icerik.length, 8000],
  ['uygulama', (c) => c.uygulama.length, 15000],
  ['surec', (c) => c.surec.join(' ').length, 15000],
]
for (const c of ciktilar) {
  for (const [ad, olc, tavan] of TAVAN) {
    const n = olc(c)
    if (n > tavan) hatalar.push(`D5 ALAN ŞİŞMESİ (bölüm sızıntısı?): ${c.code} · ${ad} = ${n} krk (tavan ${tavan})`)
  }
}

console.log('\n--- 🛡️ DOĞRULAMA ---')
console.log(`  D1 bağımsız sayım : ${hatalar.filter((h) => h.startsWith('D1')).length === 0 ? 'belgedeki her kod çıkarıldı ✓' : '✗'}`)
console.log(`  D2 benzersizlik   : ${hatalar.filter((h) => h.startsWith('D2')).length === 0 ? `${ciktilar.length} sentetik kod, çakışma yok ✓` : '✗'}`)
console.log(`  D3 süreç bağlama  : ${hatalar.filter((h) => h.startsWith('D3')).length === 0 ? 'tüm kazanımlar genel tabloya bağlandı ✓' : '✗'}`)
console.log(`  D4 başlık         : ${hatalar.filter((h) => h.startsWith('D4')).length === 0 ? 'hepsi dolu ✓' : '✗'}`)
{
  const boy = (f: (c: Cikti) => number): string => {
    const a = ciktilar.map(f)
    return `ort=${Math.round(a.reduce((s, x) => s + x, 0) / (a.length || 1))} max=${Math.max(...a, 0)}`
  }
  const d5 = hatalar.filter((h) => h.startsWith('D5')).length
  console.log(`  D5 alan sağlığı   : ${d5 === 0 ? 'sızıntı yok ✓' : `${d5} ŞİŞMİŞ ALAN ✗`}`)
  console.log(`       terms  ${boy((c) => c.terms.length)}   ·   surec ${boy((c) => c.surec.join(' ').length)}`)
  console.log(`       icerik ${boy((c) => c.icerik.length)}   ·   uygulama ${boy((c) => c.uygulama.length)}`)
}

const uygsuz = ciktilar.filter((c) => !c.uygulama)
if (uygsuz.length) console.log(`\n  ⚠ uygulaması olmayan: ${uygsuz.length} (kaynakta kod başlığı yok — boş bırakıldı, uydurulmadı)`)

if (hatalar.length) {
  console.error(`\n⛔ DURDURULDU — ${hatalar.length} hata. JSON ÜRETİLMEDİ.`)
  hatalar.slice(0, 15).forEach((h) => console.error('  • ' + h))
  if (hatalar.length > 15) console.error(`  … +${hatalar.length - 15}`)
  process.exit(1)
}

console.log('\n--- ÖRNEK ---')
const s0 = ciktilar[0]
if (s0) {
  console.log(`[${s0.code}]  (MEB kodu: ${s0.mebCode})  ${s0.grade}. sınıf · ${s0.unit} · ${s0.area}`)
  console.log(`  başlık   : ${s0.title}`)
  console.log(`  süreç(${s0.surec.length}) : ${(s0.surec[0] ?? '—').slice(0, 100)}`)
  console.log(`  içerik   : ${s0.icerik.slice(0, 100)}…`)
  console.log(`  uygulama : ${(s0.uygulama || '—').slice(0, 100)}…`)
}

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify(ciktilar, null, 2), 'utf8')
console.log(`\n✓ JSON yazıldı → ${OUT}  (${ciktilar.length} kazanım)`)
