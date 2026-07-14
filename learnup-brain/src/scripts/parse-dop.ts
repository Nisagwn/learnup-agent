/**
 * MEB "Türkiye Yüzyılı Maarif Modeli" Dersi Öğretim Programı (DÖP) PDF metni → öğrenme çıktısı JSON.
 *
 * BELGE YAPISI (eski "kazanım" modelinden TAMAMEN farklı):
 *   N. SINIF
 *     N. TEMA: <AD>                      → tema (ünite yok)
 *       ÖĞRENME ÇIKTILARI VE SÜREÇ BİLEŞENLERİ
 *         BİY.9.1.1. <öğrenme çıktısı>   → kod = DERS.SINIF.TEMA.ÇIKTI
 *            a) <süreç bileşeni>
 *            b) …
 *       İÇERİK ÇERÇEVESİ  <konu listesi>  → tema düzeyinde
 *       Anahtar Kavramlar <…>             → tema düzeyinde
 *       Öğrenme-Öğretme Uygulamaları
 *         BİY.9.1.1  <uygulama metni — "…değinilmez / verilmez" KAPSAM SINIRLARI burada>
 *
 * BELGE VARYANTLARI (hepsi otomatik tespit edilir):
 *   • 4 parçalı kod  DERS.SINIF.TEMA.ÇIKTI  (BİY.9.1.1)   — sınıf bilgisi kodda
 *   • 3 parçalı kod  DERS.ÜNİTE.ÇIKTI       (MAN.1.1)     — tek programlı seçmeli ders
 *     (belge sınıf BELİRTMİYOR → grade=null; uydurulmaz)
 *   • "N. SINIF" başlığı OLMAYAN belgeler (Sosyoloji/Psikoloji/Mantık): gövde başlangıcı,
 *     ön bölümdeki LEJANT (örnek okuma) sayfası işaretlerinden sonraki ilk ÜNİTE başlığıdır.
 *
 * ⚠️ HİÇBİR VERİ UYDURULMAZ. Yalnız belgede GERÇEKTEN yazan metin çıkarılır.
 * 🛡️ DOĞRULAMA (otomatik, elle sayı girmeye gerek yok):
 *    D1 — belgede geçen HER kod çıkarıldı mı (bölge tanımayan bağımsız ham tarama)
 *    D2 — her temada çıktı numaraları 1..N kesintisiz mi
 *    Biri bile tutmazsa script DURUR (sessiz eksik/fazla çıkarma olamaz).
 *
 * KULLANIM (ders adı + kod öneki BELGEDEN tespit edilir):
 *   bun src/scripts/parse-dop.ts --txt data/pdf/biyoloji.txt --out data/biyoloji.json
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
// --subject / --prefix artık OPSİYONEL: verilmezse belgenin kendisinden tespit edilir (bkz. OTO-TESPİT).
const SUBJECT_ARG = arg('subject')
const PREFIX_ARG = arg('prefix')      // kod öneki, ör. BİY
const EXPECT = arg('expect')          // "9:14,10:19,…" — belgenin kendi tablosundan

if (!TXT || !OUT) {
  console.error('Kullanım: --txt <x.txt> --out <x.json>  [--subject <Ders>] [--prefix <BİY>] [--expect "9:14,…"]')
  process.exit(1)
}

type Cikti = {
  subject: string
  grade: number | null    // 3 parçalı kodda (seçmeli ders) belge sınıf belirtmez → null
  code: string            // BİY.9.1.1 | MAN.1.1
  title: string           // öğrenme çıktısı
  unit: string            // TEMA adı
  temaNo: number
  surec: string[]         // süreç bileşenleri (a, b, c, ç, d…)
  icerik: string          // tema İÇERİK ÇERÇEVESİ
  terms: string           // tema Anahtar Kavramlar
  uygulama: string        // bu koda ait öğrenme-öğretme uygulaması
  kapsamDisi: string[]    // "…değinilmez / verilmez / girilmez" cümleleri
}

const raw = readFileSync(TXT, 'utf8')
// Her sayfada tekrarlayan üstbilgi ("BİYOLOJİ DERSİ ÖĞRETİM PROGRAMI") metne sızıyor → at.
const RE_PAGE_HDR = /^\s*[A-ZÇĞİÖŞÜ\s.]+\s+DERSİ ÖĞRETİM PROGRAMI\s*$/
const lines = raw.split(/\r?\n/).filter((l) => !RE_PAGE_HDR.test(l))

// ─────────────────────────────────────────────────────────────────────────────
// OTO-TESPİT — ders kodu ve ders adı BELGEDEN okunur (elle --prefix/--subject yok).
//
// NEDEN: her ders için bu iki bayrağı elle yazmak, toplu işlemeyi imkânsız kılıyordu.
// Kod öneki zaten belgenin HER kazanımında geçiyor (BİY.9.1.1) → en sık geçen öneki al.
// Ders adı da her sayfa üstbilgisinde yazıyor ("BİYOLOJİ DERSİ ÖĞRETİM PROGRAMI").
// ─────────────────────────────────────────────────────────────────────────────
// Kod biçimi: 4 parça (DERS.SINIF.TEMA.ÇIKTI — BİY.9.1.1) | 3 parça (DERS.ÜNİTE.ÇIKTI — MAN.1.1).
// 3 parçalı desende negatif ileri-bakış ŞART: 4 parçalı kodun ilk üç parçası da eşleşirdi.
const RE_KOD4 = /(?:^|\s)([A-ZÇĞİÖŞÜ]{2,6})\.\s?\d{1,2}\.\s?\d\.\s?\d{1,2}\./g
const RE_KOD3 = /(?:^|\s)([A-ZÇĞİÖŞÜ]{2,6})\.\s?\d{1,2}\.\s?\d{1,2}\.(?!\s?\d)/g

function enSikOnek(re: RegExp): [string, number] | undefined {
  const tally = new Map<string, number>()
  for (const m of raw.matchAll(re)) tally.set(m[1], (tally.get(m[1]) ?? 0) + 1)
  return [...tally.entries()].sort((a, b) => b[1] - a[1])[0]
}

function detectShape(): { prefix: string; seg3: boolean } {
  const b4 = enSikOnek(RE_KOD4)
  if (b4 && b4[1] >= 5) return { prefix: b4[0], seg3: false }
  const b3 = enSikOnek(RE_KOD3)
  if (b3 && b3[1] >= 5) return { prefix: b3[0], seg3: true }
  console.error('⛔ Ders kodu öneki tespit edilemedi (ör. BİY.9.1.1 veya MAN.1.1 deseni yok).')
  console.error('   Belge bir DÖP öğretim programı değil ya da metin çıkarımı bozuk. --prefix ile elle verebilirsin.')
  process.exit(1)
}

/** Türkçe başlık düzeni: BİYOLOJİ → Biyoloji ; T.C. İNKILAP… → T.C. İnkılap… */
function titleTR(s: string): string {
  const small = new Set(['ve', 'ile', 'ya'])
  return s
    .toLocaleLowerCase('tr')          // 'İ'→'i', 'I'→'ı' (tr locale ŞART; varsayılan locale bozar)
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) => {
      if (/^(\w\.)+$/.test(w)) return w.toLocaleUpperCase('tr')     // kısaltma: "t.c." → "T.C."
      if (i > 0 && small.has(w)) return w
      return w[0].toLocaleUpperCase('tr') + w.slice(1)
    })
    .join(' ')
}

function detectSubject(): string {
  // Üstbilgi biçimleri:
  //   "BİYOLOJİ DERSİ ÖĞRETİM PROGRAMI"
  //   "DİN KÜLTÜRÜ VE AHLAK BİLGİSİ DERSİ (9-12. SINIFLAR) ÖĞRETİM PROGRAMI"   ← parantezli
  //   "ORTAÖĞRETİM MATEMATİK DERSİ ÖĞRETİM PROGRAMI"                            ← kademe öneki
  const m = /^\s*([A-ZÇĞİÖŞÜ\s.]+?)\s+DERSİ\s*(?:\([^)]*\))?\s*ÖĞRETİM PROGRAMI\s*$/m.exec(raw)
  if (!m) {
    console.error('⛔ Ders adı tespit edilemedi ("… DERSİ … ÖĞRETİM PROGRAMI" üstbilgisi yok). --subject ile elle ver.')
    process.exit(1)
  }
  // Kademe öneki dersin adı değil → at ("ORTAÖĞRETİM MATEMATİK" → "MATEMATİK").
  const ad = m[1].replace(/^\s*(ORTAÖĞRETİM|İLKÖĞRETİM|ORTAOKUL|LİSE)\s+/, '')
  return titleTR(ad)
}

// --prefix elle verilmişse biçim (3/4 parça) o önek için sayılarak bulunur; yoksa oto-tespit.
const seg3For = (p: string): boolean => {
  const c4 = [...raw.matchAll(new RegExp(`(?:^|\\s)${p}\\.\\s?\\d{1,2}\\.\\s?\\d\\.\\s?\\d{1,2}\\.`, 'g'))].length
  if (c4 >= 5) return false
  return [...raw.matchAll(new RegExp(`(?:^|\\s)${p}\\.\\s?\\d{1,2}\\.\\s?\\d{1,2}\\.(?!\\s?\\d)`, 'g'))].length > c4
}
const SHAPE = PREFIX_ARG ? { prefix: PREFIX_ARG, seg3: seg3For(PREFIX_ARG) } : detectShape()
const PREFIX = SHAPE.prefix
const SEG3 = SHAPE.seg3
const SUBJECT = SUBJECT_ARG ?? detectSubject()
console.log(`▸ oto-tespit: ders="${SUBJECT}"  kod öneki="${PREFIX}"  biçim=${SEG3 ? '3 parça (ÜNİTE.ÇIKTI, sınıf yok)' : '4 parça (SINIF.TEMA.ÇIKTI)'}${PREFIX_ARG || SUBJECT_ARG ? '  (kısmen elle verildi)' : ''}`)

// ── Belge iskeleti: SINIF ve TEMA/ÜNİTE satırlarının yerleri ──
//
// ⚠️ HER DERS AYNI ŞABLONDA DİZİLMEMİŞ — üç gerçek fark var:
//   1) Blok adı derse göre değişiyor:  Biyoloji/Matematik "1. TEMA:"  ·  Fizik/Tarih "1. ÜNİTE:"
//   2) Sınıf başlığı ek kelime alabiliyor:  "9. SINIF"  ·  "9. SINIF TEMALARI"  ·  "9. SINIF TARİH DERSİ"
//   3) İÇİNDEKİLER tablosundaki satırlar da bu kalıplara uyuyor ("9. SINIF ÜNİTELERİ      14")
//      → sonunda SAYFA NUMARASI olan satırları eleyerek ayırıyoruz (negatif ileri-bakış).
//   4) Gövdeden ÖNCE özet tablolar var: "9. SINIF TARİH DERSİ", "11. SINIF MATEMATİK DERSİ".
//      Bunları gövde başlangıcı sanmak temaları YANLIŞ SINIFA yazar → "DERSİ" içerenleri ele.
//      Gerçek gövde başlığı: "9. SINIF" · "9. SINIF TEMALARI" · "9. SINIF ÜNİTELERİ" (DERSİ geçmez).
const NOT_TOC = String.raw`(?!.*\d\s*$)`      // satır sonu rakamla bitiyorsa = içindekiler satırı
const NOT_OZET = String.raw`(?!.*DERSİ)`      // "… DERSİ" geçiyorsa = özet tablo başlığı
const RE_SINIF = new RegExp(String.raw`^\s*(9|10|11|12)\.\s*SINIF\b${NOT_OZET}${NOT_TOC}`)
const RE_TEMA = new RegExp(String.raw`^\s*(\d{1,2})\.\s*(?:TEMA|ÜNİTE|BÖLÜM)\s*:\s*(.+?)\s*$`)
// MEB bir temayı sayfaya sığdırmak için PARÇALARA bölebiliyor:
//   "3. TEMA: NİCELİKLER VE DEĞİŞİMLER (1)" / "(2)" / "(3)"  — kazanım numaraları parçalar boyunca DEVAM eder.
// Parça eki ltree yoluna sızmamalı (aynı tema 3 ayrı yol olmasın) → başlıktan temizlenir.
const stripPart = (ad: string): string => ad.replace(/\s*\(\d+\)\s*$/, '').trim()
// Kodun SAYI gövdesi — iki biçim, AYNI yakalama düzeni (m[1]=sınıf, m[2]=tema, m[3]=çıktı):
// 3 parçalı biçimde m[1] boş grup olarak yakalanır → sınıf yok (null), indeksler kaymaz.
const NUMS = SEG3
  ? String.raw`()(\d{1,2})\.\s?(\d{1,2})`
  : String.raw`(\d{1,2})\.\s?(\d)\.\s?(\d{1,2})`
/** m[1] boşsa 3 parçalı kod üret (MAN.1.1), doluysa 4 parçalı (BİY.9.1.1). */
const mkCode = (g: string, t: string, c: string): string =>
  g ? `${PREFIX}.${g}.${t}.${c}` : `${PREFIX}.${t}.${c}`
// ⚠️ Kod satırın BAŞINDA olmayabilir: her temanın İLK çıktısı etiketle aynı satırdadır
//    ("VE SÜREÇ BİLEŞENLERİ BİY.9.1.1. …"). Bu yüzden kod satırın HERHANGİ bir yerinde aranır.
//    Karışmayı önlemek için bu regex YALNIZ çıktı bölgesinde kullanılır (uygulama bölgesinde değil).
const RE_CODE = new RegExp(`(?:^|\\s)${PREFIX}\\.\\s?${NUMS}\\.\\s*(.*)$`)
// Uygulama başlığı: satır SONUNDA çıplak kod. Etiketle aynı satırda olabilir
// ("Öğrenme-Öğretme BİY.9.1.1") → başta metin olmasına izin ver.
// Not: kodun ARDINDAN sayfa/sütun numarası kırıntısı gelebiliyor (DKAB: "Uygulamaları DKAB.9.1.1   01")
// → satır sonundaki küçük sayıya izin ver, yoksa o kazanımın uygulaması sessizce kaybolur.
const RE_CODE_BARE = new RegExp(`(?:^|\\s)${PREFIX}\\.\\s?${NUMS}\\.?(?:\\s+\\d{1,3})?\\s*$`)
const RE_SUREC = /^\s*([a-zçğıöşü])\)\s+(.*)$/
// DÖP öğrenme çıktısı DAİMA yeterlik ekiyle biter: "…sorgulayabilme", "…çıkarım yapabilme".
// Başlığın kapandığını buradan anlıyoruz (harfsiz süreç bileşenini ayırt etmek için — bkz. aşağıda).
const TITLE_DONE = /(abilme|ebilme)\s*[.:]?\s*$/

const sinifAt: Array<[number, number]> = [] // [line, grade]
const temaAt: Array<[number, number, string]> = [] // [line, temaNo, ad]
lines.forEach((l, i) => {
  const s = RE_SINIF.exec(l)
  if (s) sinifAt.push([i, Number(s[1])])
  const t = RE_TEMA.exec(l)
  if (t) temaAt.push([i, Number(t[1]), stripPart(t[2])])
})

if (temaAt.length === 0) {
  console.error('⛔ TEMA/ÜNİTE başlıkları bulunamadı — belge yapısı beklenenden farklı.')
  process.exit(1)
}

// Şablon/açıklama sayfaları GERÇEK içerikten önce gelir → gövde başlangıcından öncesini at.
//   • SINIF başlıklı belgeler: ilk SINIF başlığı (kanıtlı mevcut yol).
//   • SINIF'sız belgeler (Sosyoloji/Psikoloji/Mantık): ön bölümdeki LEJANT (örnek okuma)
//     sayfası GERÇEK kod içerir ama dizgisi kenar notlarıyla bozuktur ("Dersin kodu",
//     "Ünite numarası" işaretleri). Gövde = bu işaretlerin SONUNCUSUNDAN sonraki ilk
//     ÜNİTE başlığı. (İçindekiler satırları da doğal olarak elenmiş olur.)
let BODY_START: number
if (sinifAt.length > 0) {
  BODY_START = sinifAt[0][0]
} else {
  let lastLegend = -1
  lines.forEach((l, i) => { if (/Dersin kodu|Ünite numarası|çıktı numarası/i.test(l)) lastLegend = i })
  BODY_START = (temaAt.find(([i]) => i > lastLegend) ?? temaAt[0])[0]
  console.log(`▸ SINIF başlığı yok — gövde, lejant sonrası ilk ÜNİTE başlığından başlatıldı (satır ${BODY_START})`)
}
const temaBlocks = temaAt.filter(([i]) => i >= BODY_START)

const gradeOfLine = (i: number): number => {
  let g = 0
  for (const [li, gr] of sinifAt) { if (li <= i) g = gr; else break }
  return g
}

/** Etiketten sonraki metni, bir sonraki büyük etikete kadar topla. */
const STOP = /^\s*(İÇERİK ÇERÇEVESİ|Anahtar Kavramlar|ÖĞRENME|ÖĞRENME-ÖĞRETME|YAŞANTILARI|KANITLARI|FARKLILAŞTIRMA|Zenginleştirme|Destekleme|Temel Kabuller|Ön Değerlendirme|Köprü Kurma|Öğrenme-Öğretme|Uygulamaları|ÖĞRETMEN|YANSITMALARI|DERS SAATİ|ALAN|KAVRAMSAL|EĞİLİMLER|PROGRAMLAR|DİSİPLİNLER|BECERİLER|Sosyal-Duygusal|Değerler|Okuryazarlık|\d+\.\s*(TEMA|ÜNİTE|BÖLÜM)\s*:|(9|10|11|12)\.\s*SINIF)/

// ── Satır sonu TİRELEMESİNİ onar ──────────────────────────────────────────────
// PDF iki yana yaslı dizgi kelimeleri satır sonunda böler:  "…entalpi de-" / "ğişimi…"
// Satırları düz ' ' ile birleştirirsem "de- ğişimi" olur → embedding'e çöp gider.
// Ayrım: sonraki parça KÜÇÜK harfle başlıyorsa kelime bölünmesidir (tireyi at, bitiştir);
//        BÜYÜK harfle başlıyorsa gerçek bileşik tiredir ("İtikadi-Siyasi") → tireyi KORU.
const appendFrag = (acc: string, p: string): string => {
  if (!acc) return p
  if (/[A-Za-zÇĞİÖŞÜçğıöşü]-$/.test(acc)) {
    return /^[a-zçğıöşü]/.test(p) ? acc.slice(0, -1) + p : acc + p
  }
  return acc + ' ' + p
}
const joinLines = (parts: string[]): string => parts.reduce(appendFrag, '')

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
    if (/^\s*\d{1,3}\s*$/.test(l)) continue          // sayfa no
    if (STOP.test(l)) break
    out.push(l.trim())
  }
  return joinLines(out).replace(/\s+/g, ' ').trim()
}

const ciktilar: Cikti[] = []
const typoFixes: string[] = []   // kaynak belgedeki dizgi hatalarının onarım kaydı (şeffaflık)

for (let t = 0; t < temaBlocks.length; t++) {
  const [start, temaNo, temaAd] = temaBlocks[t]
  const end = t + 1 < temaBlocks.length ? temaBlocks[t + 1][0] : lines.length
  const grade = gradeOfLine(start)

  // Tema düzeyinde ortak bağlam
  const icerik = collect(start, end, /^\s*İÇERİK ÇERÇEVESİ\s*/)
  const terms = collect(start, end, /^\s*Anahtar Kavramlar\s*/)

  // ── 1) Öğrenme çıktıları + süreç bileşenleri ──
  // BÖLGE: "ÖĞRENME ÇIKTILARI / VE SÜREÇ BİLEŞENLERİ" etiketinden "İÇERİK ÇERÇEVESİ"ne kadar.
  // Bu sınırlama şart: uygulama bölgesinde de çıplak kodlar var (BİY.9.1.1 başlığı) — onlar çıktı DEĞİL.
  let ciktiStart = -1, ciktiEnd = end
  for (let i = start; i < end; i++) {
    if (ciktiStart < 0 && /ÖĞRENME ÇIKTILARI|SÜREÇ BİLEŞENLERİ/.test(lines[i])) ciktiStart = i
    if (ciktiStart >= 0 && i > ciktiStart && /^\s*İÇERİK ÇERÇEVESİ/.test(lines[i])) { ciktiEnd = i; break }
  }
  if (ciktiStart < 0) {
    console.error(`⛔ ${temaAd} (${grade}. sınıf): "ÖĞRENME ÇIKTILARI" bölgesi bulunamadı.`)
    process.exit(1)
  }

  const byCode = new Map<string, Cikti>()
  let cur: Cikti | null = null
  let lastSurec = -1

  for (let i = ciktiStart; i < ciktiEnd; i++) {
    const l = lines[i]
    const m = RE_CODE.exec(l)
    if (m) {                                      // kod bulundu (başlık aynı satırda veya sonraki satırda)
      const code = mkCode(m[1], m[2], m[3])
      if (!byCode.has(code)) {
        cur = {
          subject: SUBJECT, grade: m[1] ? Number(m[1]) : null, code,
          title: (m[4] ?? '').trim(), unit: temaAd, temaNo,
          surec: [], icerik, terms, uygulama: '', kapsamDisi: [],
        }
        byCode.set(code, cur)
      } else {
        cur = byCode.get(code)!
      }
      lastSurec = -1
      continue
    }
    if (!cur) continue

    const s = RE_SUREC.exec(l)
    if (s) { cur.surec.push(s[2].trim()); lastSurec = cur.surec.length - 1; continue }

    // Satır devamı: başlık veya son süreç bileşeni sarkmışsa ekle
    const txt = l.trim()
    if (!txt || /^\d{1,3}$/.test(txt)) continue          // boş satır / sayfa no → atla (blok bitmez)
    if (STOP.test(l)) { cur = null; lastSurec = -1; continue }
    if (lastSurec >= 0) {
      cur.surec[lastSurec] = appendFrag(cur.surec[lastSurec], txt)
    } else if (TITLE_DONE.test(cur.title)) {
      // ⚠️ HARFSİZ SÜREÇ BİLEŞENİ — MEB, kazanımın TEK süreç bileşeni varsa "a)" harfi koymuyor:
      //     COĞ.9.4.2. …çıkarımda bulunabilme
      //         Dünya ve Türkiye'de nüfus yoğunluğunun…      ← harfsiz, ama süreç bileşeni
      // Başlık zaten "-abilme/-ebilme" ile KAPANMIŞSA, gelen satır başlığın devamı olamaz → süreçtir.
      // (Bu kural belgeye dayanır: DÖP öğrenme çıktıları daima yeterlik ekiyle biter.)
      if (cur.surec.length === 0) { cur.surec.push(txt); lastSurec = 0 }
      else cur.surec[cur.surec.length - 1] = appendFrag(cur.surec[cur.surec.length - 1], txt)
    } else {
      cur.title = appendFrag(cur.title, txt)              // başlık henüz kapanmadı → devamı
    }
  }

  // ── 2) Öğrenme-Öğretme Uygulamaları (kod başlıklı bloklar; KAPSAM SINIRLARI burada) ──
  //    Bölgeyi bul: "Uygulamaları" etiketinden FARKLILAŞTIRMA'ya kadar.
  // Etiket ("Öğrenme-Öğretme Uygulamaları") sütun düzeninde satırlara farklı bölünüyor:
  //   "Öğrenme-Öğretme BİY.9.1.1"  |  "Uygulamaları BİY.9.2.1"  |  "Öğrenme-Öğretme" + "Uygulamaları …"
  // Bu yüzden: çıktı bölgesinden SONRA gelen ilk karışık-kutulu etiket = bölge başlangıcı.
  // (Büyük harfli "ÖĞRENME-ÖĞRETME YAŞANTILARI" başlığı bu regex'e takılmaz — küçük harf şart.)
  let uygStart = -1, uygEnd = end
  for (let i = ciktiEnd; i < end; i++) {
    if (uygStart < 0 && /Öğrenme-Öğretme|Uygulamaları/.test(lines[i])) { uygStart = i; continue }
    if (uygStart >= 0 && /^\s*FARKLILAŞTIRMA/.test(lines[i])) { uygEnd = i; break }
  }

  if (uygStart >= 0) {
    // ⚠️ BİRLEŞİK BAŞLIK — MEB tek uygulama metnini BİRDEN ÇOK kazanıma yazabiliyor:
    //     "Uygulamaları MAT.10.4.3 ve MAT.10.4.4"
    // "kod satır sonunda" kuralı bunun yalnız SON kodunu görür → MAT.10.4.3'ün uygulaması KAYBOLURDU.
    // Çözüm: başlık satırındaki TÜM kodları topla, metni hepsine yaz.
    let codes: string[] = []
    const buf: string[] = []
    const flushU = (): void => {
      const text = joinLines(buf).replace(/\s+/g, ' ')
        .replace(/^(Uygulamaları|Öğrenme-Öğretme)\s+/, '')     // sütun etiketi sızıntısını at
        .trim()
      if (text) {
        for (const code of codes) {
          const c = byCode.get(code)
          if (!c) continue
          c.uygulama = (c.uygulama ? c.uygulama + ' ' : '') + text
          // Kapsam sınırı cümlelerini ayıkla (soru üretimi kapsamını belirler)
          for (const sent of text.split(/(?<=\.)\s+/)) {
            if (/değinilmez|verilmez|girilmez|yer verilmez|yapılmaz/.test(sent)) c.kapsamDisi.push(sent.trim())
          }
        }
      }
      buf.length = 0
    }

    /**
     * Satır bir UYGULAMA BAŞLIĞI mı? Öyleyse içindeki tüm kodları döndür.
     * Başlık = (sütun etiketi kırıntıları) + kodlar + bağlaç/noktalama/sayfa-no DIŞINDA hiçbir şey.
     * Anlamlı metin varsa bu gövde satırıdır, başlık değil → null.
     */
    const uygBaslikKodlari = (line: string): string[] | null => {
      const rest = line.replace(/Öğrenme-Öğretme|Uygulamaları/g, '').trim()
      if (!rest) return null
      const RE_ALL = new RegExp(`${PREFIX}\\.\\s?${NUMS}`, 'g')
      const codes = [...rest.matchAll(RE_ALL)].map((m) => mkCode(m[1], m[2], m[3]))
      if (!codes.length) return null
      const kalan = rest.replace(RE_ALL, '').replace(/\b(ve|ile)\b|[\s.,;:()\-–—]|\d{1,3}/g, '')
      return kalan.length === 0 ? codes : null      // kod dışı metin varsa başlık DEĞİL
    }
    // Kaynak belgede eksik-haneli uygulama başlığı olabilir (MEB dizgi hatası),
    // ör. "BİY.11.10" → doğrusu "BİY.11.1.10" (3 parçalıda "MAN.10" → "MAN.<tema>.10").
    // Yalnız çıktı listesinde KARŞILIĞI BULUNAN kodlar onarılır; onarım LOGLANIR (denetlenebilir).
    const RE_TYPO = SEG3
      ? new RegExp(`(?:^|\\s)${PREFIX}\\.\\s?(\\d{1,2})\\s*$`)
      : new RegExp(`(?:^|\\s)${PREFIX}\\.\\s?(\\d{1,2})\\.\\s?(\\d{1,2})\\s*$`)

    for (let i = uygStart; i < uygEnd; i++) {
      const l = lines[i]
      const hdr = uygBaslikKodlari(l)
      if (hdr) { flushU(); codes = hdr; continue }

      const ty = RE_TYPO.exec(l)
      if (ty) {
        // Eksik haneyi mevcut temanın no'su ile tamamla (4p: tema düşmüş · 3p: tema düşmüş).
        const guess = SEG3 ? `${PREFIX}.${temaNo}.${ty[1]}` : `${PREFIX}.${ty[1]}.${temaNo}.${ty[2]}`
        if (byCode.has(guess)) {
          flushU()
          codes = [guess]
          typoFixes.push(`${l.trim()}  →  ${guess}`)
          continue
        }
      }

      if (!codes.length) continue
      const txt = l.trim()
      if (!txt || /^\d{1,3}$/.test(txt)) continue
      buf.push(txt)
    }
    flushU()
  }

  ciktilar.push(...byCode.values())
}

// ── DOĞRULAMA: belgenin kendi tema tablosuyla karşılaştır ──
const byGrade = new Map<number | null, number>()
for (const c of ciktilar) byGrade.set(c.grade, (byGrade.get(c.grade) ?? 0) + 1)

console.log(`\n=== ${SUBJECT} — DÖP PARSE RAPORU ===`)
console.log(`Kaynak: ${TXT}`)
console.log(`Tema sayısı: ${temaBlocks.length}`)
console.log(`Toplam öğrenme çıktısı: ${ciktilar.length}\n`)

console.log('SINIF  TEMA                       ÇIKTI  SÜREÇ  UYGULAMA  KAPSAM-DIŞI')
console.log('-'.repeat(76))
const temaKey = (c: Cikti): string => `${c.grade}|${c.temaNo}|${c.unit}`
const temaMap = new Map<string, Cikti[]>()
for (const c of ciktilar) {
  const k = temaKey(c)
  if (!temaMap.has(k)) temaMap.set(k, [])
  temaMap.get(k)!.push(c)
}
for (const [k, arr] of temaMap) {
  const [g, , ad] = k.split('|')
  const surec = arr.reduce((s, c) => s + c.surec.length, 0)
  const uyg = arr.filter((c) => c.uygulama).length
  const kd = arr.reduce((s, c) => s + c.kapsamDisi.length, 0)
  console.log(
    `${(g === 'null' ? '—' : g).padEnd(6)} ${ad.slice(0, 25).padEnd(26)} ${String(arr.length).padStart(5)} ${String(surec).padStart(6)} ${String(uyg).padStart(9)} ${String(kd).padStart(12)}`,
  )
}

const uygulamasiz = ciktilar.filter((c) => !c.uygulama)
if (typoFixes.length) {
  console.log(`\n--- ⚠️ KAYNAK BELGEDEKİ DİZGİ HATALARI (onarıldı, kayda geçti) ---`)
  typoFixes.forEach((f) => console.log('  ' + f))
}
if (uygulamasiz.length) {
  console.log(`\n--- ⚠️ UYGULAMASI BULUNAMAYAN ÇIKTI (${uygulamasiz.length}) ---`)
  uygulamasiz.forEach((c) => console.log(`  ${c.code} — ${c.title.slice(0, 60)}`))
}

// ═════════════════════════════════════════════════════════════════════════════
// 🛡️ OTOMATİK DOĞRULAMA — elle sayı girmeye GEREK YOK. Belgenin kendisi kanıttır.
//
// Bu iki kontrol, daha önce yakaladığımız hata sınıfını (her temanın İLK çıktısının
// sessizce düşmesi) elle beklenen-sayı yazmadan yakalar. Biri bile tutmazsa JSON YAZILMAZ.
// ═════════════════════════════════════════════════════════════════════════════

// ── D1: BAĞIMSIZ SAYIM — belgede geçen HER kod çıkarıldı mı? ──
// Neden bağımsız: kodlar belgede İKİ kez geçer — bir kez "ÖĞRENME ÇIKTILARI" sütununda,
// bir kez de "Öğrenme-Öğretme Uygulamaları" sütununda. Parser çıktıları YALNIZ ilk bölgeden
// toplar; bu tarama ise bölge tanımaz, ham metni baştan sona tarar. Parser bir çıktıyı
// düşürürse, kod hâlâ uygulama sütununda görünür → fark açığa çıkar.
const RE_ANY_CODE = new RegExp(`(?:^|\\s)${PREFIX}\\.\\s?${NUMS}(?=[.\\s]|$)`, 'g')
const docCodes = new Set<string>()
for (let i = BODY_START; i < lines.length; i++) {
  for (const m of lines[i].matchAll(RE_ANY_CODE)) docCodes.add(mkCode(m[1], m[2], m[3]))
}
const gotCodes = new Set(ciktilar.map((c) => c.code))
const missing = [...docCodes].filter((c) => !gotCodes.has(c)).sort()
const extra = [...gotCodes].filter((c) => !docCodes.has(c)).sort()

// ── D2: SÜREKLİLİK — her temada çıktı numaraları 1..N kesintisiz mi? ──
// MEB numaralandırması daima 1'den başlar ve boşluksuz ilerler. Boşluk = düşen çıktı.
const gaps: string[] = []
for (const [k, arr] of temaMap) {
  const [g, tn] = k.split('|')
  const nums = arr.map((c) => Number(c.code.split('.').pop())).sort((a, b) => a - b)
  const beklenen = Array.from({ length: nums.length }, (_, i) => i + 1)
  if (nums.join(',') !== beklenen.join(',')) {
    gaps.push(`  ${g}. sınıf / ${tn}. tema → bulunan [${nums.join(',')}] ≠ beklenen [1..${nums.length}]`)
  }
}

console.log('\n--- 🛡️ OTOMATİK DOĞRULAMA ---')
console.log(`  D1 bağımsız sayım : belgede ${docCodes.size} kod · çıkarılan ${gotCodes.size}  ${missing.length === 0 && extra.length === 0 ? '✓' : '✗'}`)
console.log(`  D2 süreklilik     : ${gaps.length === 0 ? 'tüm temalarda 1..N kesintisiz ✓' : `${gaps.length} temada BOŞLUK ✗`}`)

if (missing.length || extra.length || gaps.length) {
  console.error('\n⛔ DURDURULDU — parser çıktısı belgeyle uyuşmuyor. JSON ÜRETİLMEDİ.')
  if (missing.length) console.error(`\n  Belgede VAR, çıkarılmadı (${missing.length}):\n    ${missing.join('  ')}`)
  if (extra.length) console.error(`\n  Çıkarıldı, belgede YOK (${extra.length}):\n    ${extra.join('  ')}`)
  if (gaps.length) console.error(`\n  Numara boşlukları:\n${gaps.join('\n')}`)
  process.exit(1)
}

if (EXPECT) {
  console.log('\n--- 🛡️ EK DOĞRULAMA (elle verilen beklenen sayılar) ---')
  let ok = true
  for (const part of EXPECT.split(',')) {
    const [g, n] = part.split(':').map((x) => Number(x.trim()))
    const got = byGrade.get(g) ?? 0
    const pass = got === n
    if (!pass) ok = false
    console.log(`  ${g}. sınıf: beklenen ${n}, bulunan ${got}  ${pass ? '✓' : '✗ UYUŞMUYOR'}`)
  }
  if (!ok) {
    console.error('\n⛔ DURDURULDU — çıkarılan çıktı sayısı belgenin tablosuyla uyuşmuyor.')
    console.error('   Sessizce eksik/yanlış veri yazmamak için JSON ÜRETİLMEDİ.')
    process.exit(1)
  }
  console.log('  → Tüm sınıflar TUTTU ✓')
}

console.log('\n--- ÖRNEK (ilk çıktı, TAM içerik) ---')
const s0 = ciktilar[0]
if (s0) {
  console.log(`[${s0.code}]  sınıf ${s0.grade ?? '—'} · tema: ${s0.unit}`)
  console.log(`  çıktı     : ${s0.title}`)
  console.log(`  süreç (${s0.surec.length}) : ${s0.surec.slice(0, 2).join(' | ')}${s0.surec.length > 2 ? ' …' : ''}`)
  console.log(`  içerik    : ${s0.icerik.slice(0, 110)}…`)
  console.log(`  kavramlar : ${s0.terms.slice(0, 90)}…`)
  console.log(`  uygulama  : ${s0.uygulama.slice(0, 110)}…`)
  console.log(`  kapsam-dışı: ${s0.kapsamDisi.length} cümle`)
}

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify(ciktilar, null, 2), 'utf8')
console.log(`\n✓ JSON yazıldı → ${OUT}  (${ciktilar.length} öğrenme çıktısı)`)
