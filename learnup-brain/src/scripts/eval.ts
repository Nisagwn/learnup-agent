/**
 * EVAL PIPELINE — "bozdum mu?" sorusunun tek-komutluk cevabı.   KULLANIM: `bun run eval`
 *
 * Rapor değil KAPIDIR: geçti/kaldı çıkışlıdır (ihlalde exit 1). Dört modül:
 *   2a ALTIN-SET  : kusuru bilinen sorular kapı zincirinden geçirilir — her kapı KENDİ
 *                   kusurunu yakalamalı, temizleri geçirmeli. (LLM'siz, DB'siz.)
 *   2b YAPISAL    : havuz ↔ gerçek ÖSYM, aynı metriklerle yan yana; özgünlük eşiğinin
 *                   İSPATI (yüzdelik + yanlış-alarm tablosu) burada basılır. (DB-only.)
 *   2c DRİFT      : koşu metrikleri eval-sonuclari/'a yazılır, öncekiyle fark basılır.
 *                   ⚠️ Eşikler TABAN-ÇİZGİSİNE göredir: ilk koşu baseline yazar, sonrakiler
 *                   KÖTÜLEŞMEYİ yakalar. (Mutlak sıfır-tolerans mevcut havuzdaki bilinen
 *                   kopya çiftini ilk koşuda anında düşürürdü.)
 *   2d HAKEM      : `--hakem` bayrağıyla; KREDİLİDİR. Bayraksız TEK LLM çağrısı yapılmaz;
 *                   bayrakla önce maliyet tahmini basılır, `--evet` olmadan koşmaz.
 *
 * Neden var: bu oturumda aynı ölçümler _tmp dosyalarına yazılıp silindi ve bir regex hatası
 * ("grafiği" vs \b) yanlış tabloya yol açtı. Kalıcı pipeline hatayı bir kez düzeltir.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { supabase } from '../clients/supabase.js'
import { celdiriciKusatmasi, sikUzunlukSizintisi, sayiya, type SikliSoru } from '../utils/shufflers.js'
import { soruLatexBozuk, hamMatematikKacagi } from '../utils/latex.js'
import { gorselBagimli, varOlmayanGorseleGonderme } from '../utils/soru-saglik.js'
import { kokBenzerligi, shingleKumesi, kumeBenzerligi, celdiriciKumesiAyni, ozgunlukEsigi } from '../utils/benzerlik.js'
import { dersAilesi, ZORLUK_MERDIVENI, MEKANIZMALAR } from '../persona/osym.charter.js'
import { ALTIN_SET } from './eval-altin-set.js'

const argv = process.argv.slice(2)
const HAKEM = argv.includes('--hakem')
const EVET = argv.includes('--evet')

let kirmizi = 0
const KIRMIZI = (msg: string): void => {
  kirmizi++
  console.log(`  ✗ ${msg}`)
}
const YESIL = (msg: string): void => console.log(`  ✓ ${msg}`)

// ═════════════════════════════════════════════════════════════════════════
// 2a — ALTIN-SET KAPI REGRESYONU
// ═════════════════════════════════════════════════════════════════════════
console.log('\n══ 2a ALTIN-SET — kapı regresyonu ══')
for (const k of ALTIN_SET) {
  const q: SikliSoru = { siklar: k.soru.siklar, dogru: k.soru.dogru, cozum: k.soru.cozum }
  const latexli = { soru: k.soru.soruMetni, siklar: k.soru.siklar, cozum: k.soru.cozum ?? '' }
  const tespit = new Set<string>()
  if (celdiriciKusatmasi(q) === 'tek-yanda') tespit.add('tek-yanda')
  if (sikUzunlukSizintisi(q) === 'sizinti') tespit.add('uzunluk-sizintisi')
  if (soruLatexBozuk(latexli) !== null) tespit.add('latex')
  else if (soruLatexBozuk(latexli, true) !== null) tespit.add('ham-mat')
  if (varOlmayanGorseleGonderme(k.soru.soruMetni)) tespit.add('gorsel-gonderme')
  if (k.kopyaEsi && kokBenzerligi(k.soru.soruMetni, k.kopyaEsi) >= ozgunlukEsigi('Matematik')) tespit.add('kopya')

  if (k.kusur === null) {
    if (tespit.size === 0) YESIL(`temiz geçti: ${k.ad}`)
    else KIRMIZI(`TEMİZ SORU YANDI (${[...tespit].join(',')}): ${k.ad}`)
  } else {
    if (tespit.has(k.kusur)) YESIL(`yakalandı [${k.kusur}]: ${k.ad}`)
    else KIRMIZI(`KAÇTI [${k.kusur}] (tespit: ${[...tespit].join(',') || 'yok'}): ${k.ad}`)
  }
}

// ═════════════════════════════════════════════════════════════════════════
// 2b — YAPISAL KARŞILAŞTIRMA (DB-only)
// ═════════════════════════════════════════════════════════════════════════
type Row = { question_text: string; options: Record<string, string>; correct_option: string; subject: string }
const cek = async (tablo: string, filtre: (q: any) => any): Promise<Row[]> => {
  const out: Row[] = []
  for (let i = 0; ; i += 1000) {
    const { data, error } = await filtre(
      supabase.from(tablo).select('question_text, options, correct_option, subject').range(i, i + 999),
    )
    if (error) throw new Error(`${tablo}: ${error.message}`)
    if (!data?.length) break
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}

const OSYM = await cek('yks_questions', (q) => q.eq('source_type', 'osym_cikmis').eq('verified', true))
const AI = await cek('yks_ai_questions', (q) => q.eq('verified', true))
console.log(`\n══ 2b YAPISAL — GERÇEK ÖSYM (n=${OSYM.length}) ↔ AI HAVUZU (n=${AI.length}) ══`)

const ROMA_ONCUL = /(^|\n)\s*(I{1,3}|IV|V)\s*[.\)]\s+\S/m
const OLUMSUZ = /\b(değildir|olamaz|söylenemez|yanlıştır|ulaşılamaz|çıkarılamaz|yapılamaz)\b/i
const KOPRU = /\b(buna göre|bu bilgilere göre|yukarıdaki|bu duruma göre|verilenlere göre|bu parçada|aşağıdakilerden hangisi)\b/i
const CIPLAK_KESIR = /(?<!\$[^$]*)\b\d+\/\d+\b/
const kelime = (s: string): number => s.trim().split(/\s+/).filter(Boolean).length
const sayiAdedi = (s: string): number => (s.match(/\d+([.,]\d+)?/g) ?? []).length
const ort = (a: number[]): number => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0)
const yuzdelik = (dizi: number[], p: number): number =>
  dizi.length ? [...dizi].sort((a, b) => a - b)[Math.min(dizi.length - 1, Math.floor((dizi.length - 1) * p))] : 0

type Metrik = {
  n: number; romaOncul: number; olumsuz: number; kopru: number; gorsel: number
  kokKelime: number; sikKelime: number; sayiYogunlugu: number
  sizinti: number; sizintiOlculen: number; kusatmaIhlal: number; kusatmaOlculen: number
}
const olc = (rows: Row[], aiTarafi: boolean): Map<string, Metrik> => {
  const m = new Map<string, Metrik>()
  for (const r of rows) {
    const t = r.question_text ?? ''
    const g = m.get(r.subject) ?? { n: 0, romaOncul: 0, olumsuz: 0, kopru: 0, gorsel: 0, kokKelime: 0, sikKelime: 0, sayiYogunlugu: 0, sizinti: 0, sizintiOlculen: 0, kusatmaIhlal: 0, kusatmaOlculen: 0 }
    g.n++
    if (ROMA_ONCUL.test(t)) g.romaOncul++
    if (OLUMSUZ.test(t)) g.olumsuz++
    if (KOPRU.test(t)) g.kopru++
    // Görsel ölçüsü taraf başına FARKLI (plandaki 2c uyarısı): PDF tarafında kayıp-şekil
    // deseni (gorselBagimli), AI tarafında var-olmayan-görsele-gönderme dar deseni.
    if (aiTarafi ? varOlmayanGorseleGonderme(t) : gorselBagimli(t)) g.gorsel++
    g.kokKelime += kelime(t)
    const sikler = Object.values(r.options ?? {}).filter((x): x is string => typeof x === 'string')
    g.sikKelime += sikler.length ? ort(sikler.map(kelime)) : 0
    g.sayiYogunlugu += sayiAdedi(t)
    const q: SikliSoru = { siklar: r.options as SikliSoru['siklar'], dogru: r.correct_option, cozum: '' }
    const siz = sikUzunlukSizintisi(q)
    if (siz !== null) { g.sizintiOlculen++; if (siz === 'sizinti') g.sizinti++ }
    const kus = celdiriciKusatmasi(q)
    if (kus !== null) { g.kusatmaOlculen++; if (kus === 'tek-yanda') g.kusatmaIhlal++ }
    m.set(r.subject, g)
  }
  return m
}
const topla = (m: Map<string, Metrik>): Metrik => {
  const t: Metrik = { n: 0, romaOncul: 0, olumsuz: 0, kopru: 0, gorsel: 0, kokKelime: 0, sikKelime: 0, sayiYogunlugu: 0, sizinti: 0, sizintiOlculen: 0, kusatmaIhlal: 0, kusatmaOlculen: 0 }
  for (const g of m.values()) for (const k of Object.keys(t) as (keyof Metrik)[]) t[k] += g[k]
  return t
}

const MO = olc(OSYM, false)
const MA = olc(AI, true)
const TO = topla(MO)
const TA = topla(MA)

const y = (pay: number, payda: number): string => (payda ? `${((pay / payda) * 100).toFixed(0)}%` : '—').padStart(6)
const o = (pay: number, payda: number): string => (payda ? (pay / payda).toFixed(1) : '—').padStart(6)
console.log(`\n${'ÖLÇÜT'.padEnd(34)}${'ÖSYM'.padStart(7)}${'AI'.padStart(8)}`)
console.log('─'.repeat(50))
console.log(`${'Roma öncül'.padEnd(34)}${y(TO.romaOncul, TO.n)}${y(TA.romaOncul, TA.n).padStart(8)}`)
console.log(`${'Olumsuz kök'.padEnd(34)}${y(TO.olumsuz, TO.n)}${y(TA.olumsuz, TA.n).padStart(8)}`)
console.log(`${'Köprü ifadesi'.padEnd(34)}${y(TO.kopru, TO.n)}${y(TA.kopru, TA.n).padStart(8)}`)
console.log(`${'Görsel arızası (taraf-özel ölçü)'.padEnd(34)}${y(TO.gorsel, TO.n)}${y(TA.gorsel, TA.n).padStart(8)}`)
console.log(`${'Kök kelime (ort)'.padEnd(34)}${o(TO.kokKelime, TO.n)}${o(TA.kokKelime, TA.n).padStart(8)}`)
console.log(`${'Şık kelime (ort)'.padEnd(34)}${o(TO.sikKelime, TO.n)}${o(TA.sikKelime, TA.n).padStart(8)}`)
console.log(`${'Uzunluk sızıntısı'.padEnd(34)}${y(TO.sizinti, TO.sizintiOlculen)}${y(TA.sizinti, TA.sizintiOlculen).padStart(8)}`)
console.log(`${'Kuşatma ihlali'.padEnd(34)}${y(TO.kusatmaIhlal, TO.kusatmaOlculen)}${y(TA.kusatmaIhlal, TA.kusatmaOlculen).padStart(8)}`)

// ⚠️ SAYISAL ŞIKLI SORULARDA DOĞRU-HARF DAĞILIMI — BU PİPELİNE'IN İLK KOŞUSUNUN BULUŞU.
// Kuşatma kuralı "en az 2 alt + en az 2 üst" der; 4 çeldiricide bu TAM 2-2 demektir ve artan
// sıralamada doğru cevabı DAİMA ORTANCAYA (C) sabitler. ÖLÇÜLDÜ: AI sayısal 6/6 C; gerçek
// ÖSYM 49/48/60/58/49 (düzgün, uçlar dahil) ve ÖSYM'nin %76'sı kurala "aykırı". Yani kural
// ÖSYM gerçeğiyle çelişiyor ve öğrenciye "sayısalda hep C" taktiği veriyor. Politika değişimi
// plan dışı — bu metrik açığı GÖRÜNÜR tutar; düzeltme kararı kullanıcıda.
const harfDagilimi = (rows: Row[]): string => {
  const d: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, E: 0 }
  let n = 0
  for (const r of rows) {
    const v = Object.values(r.options ?? {})
    if (v.length !== 5 || !v.every((x) => typeof x === 'string' && sayiya(x) !== null)) continue
    n++
    d[r.correct_option] = (d[r.correct_option] ?? 0) + 1
  }
  return `n=${n}  ${Object.entries(d).map(([k, v]) => `${k}:${v}`).join(' ')}`
}
console.log(`\nSayısal şıklı sorularda doğru-harf dağılımı (C-yozlaşması nöbeti):`)
console.log(`  ÖSYM ${harfDagilimi(OSYM)}`)
console.log(`  AI   ${harfDagilimi(AI)}   ← kuşatma 2-2 kuralı sayısal cevabı C'ye sabitliyor`)

// Sayı yoğunluğu DERS BAZINDA (plandaki uyarı: karışık ölçüm sözel payıyla şişebilir).
console.log(`\nSayı yoğunluğu (kökteki sayı adedi, ders bazında — sayısal aile işaretli):`)
const dersler = [...new Set([...MO.keys(), ...MA.keys()])].sort()
for (const d of dersler) {
  const a = MO.get(d)
  const b = MA.get(d)
  const aile = dersAilesi(d) === 'sayisal' ? '◆' : ' '
  console.log(`  ${aile} ${d.padEnd(36)} ÖSYM ${a ? (a.sayiYogunlugu / a.n).toFixed(1) : ' — '}   AI ${b ? (b.sayiYogunlugu / b.n).toFixed(1) : ' — '}`)
}

// ── BENZERLİK: en-yakın-komşu (NN) dağılımı + EŞİK İSPAT TABLOSU ─────────
// Kapının birimi NN'dir (aday, havuzdaki EN BENZER soruya göre yargılanır) — çift-oranı değil.
// ⚠️ EŞİK DERS-BAZLIDIR ve bu pipeline'ın İLK KOŞUSU bunu öğretti: 0.30'luk global eşik
// Matematik'te gerçek ÖSYM'nin %34'ünü "kopya" sayacaktı — ÖSYM kalıp tekrar eder ("Dik
// koordinat düzleminde A(#,#)…" açılışı meşru). Hatta kapının ilk gerekçesi olan "koordinat
// ikizleri" (NN 0.311) Matematik p90'ının (0.473) ALTINDA çıktı — göz kararı "kopya" damgası
// korpusça çürütüldü. Eşikler benzerlik.ozgunlukEsigi'nde p99+pay olarak sabit; hedef yalnız
// SAYI-DEĞİŞİK BİREBİR kopya.
const nnHesapla = (rows: Row[]): Map<string, number[]> => {
  const gruplar = new Map<string, Set<string>[]>()
  for (const r of rows) {
    const g = gruplar.get(r.subject) ?? []
    g.push(shingleKumesi(r.question_text))
    gruplar.set(r.subject, g)
  }
  const nn = new Map<string, number[]>()
  for (const [ders, g] of gruplar) {
    const dizi: number[] = []
    for (let i = 0; i < g.length; i++) {
      let en = 0
      for (let j = 0; j < g.length; j++) {
        if (i === j) continue
        const s = kumeBenzerligi(g[i], g[j])
        if (s > en) en = s
      }
      dizi.push(en)
    }
    nn.set(ders, dizi)
  }
  return nn
}
const nnO = nnHesapla(OSYM)
const nnA = nnHesapla(AI)
const duz = (m: Map<string, number[]>): number[] => [...m.values()].flat()
const std = (a: number[]): number => {
  const m = ort(a)
  return Math.sqrt(ort(a.map((x) => (x - m) ** 2)))
}
console.log(`\nÖZGÜNLÜK EŞİĞİ İSPATI — aynı-ders en-yakın-komşu (NN), DERS BAZLI eşik:`)
console.log(`  dağılım (bilgi): ÖSYM ort=${ort(duz(nnO)).toFixed(3)} σ=${std(duz(nnO)).toFixed(3)} · AI ort=${ort(duz(nnA)).toFixed(3)} σ=${std(duz(nnA)).toFixed(3)}`)
console.log(`  ⚠️ Karar std-sapmadan DEĞİL yüzdelik+yanlış-alarm yönteminden (dağılım çarpık; ±kσ yanıltır).`)
console.log(`  ${'DERS'.padEnd(30)}${'n'.padStart(5)}${'p90'.padStart(8)}${'p99'.padStart(8)}${'eşik'.padStart(7)}${'ÖSYM FP'.padStart(9)}${'AI aşan'.padStart(9)}`)
let nnKopyaToplam = 0
for (const ders of [...new Set([...nnO.keys(), ...nnA.keys()])].sort()) {
  const o2 = nnO.get(ders) ?? []
  const a2 = nnA.get(ders) ?? []
  const esik = ozgunlukEsigi(ders)
  const fp = o2.filter((x) => x >= esik).length
  const tp = a2.filter((x) => x >= esik).length
  nnKopyaToplam += tp
  console.log(
    `  ${ders.slice(0, 29).padEnd(30)}${String(o2.length).padStart(5)}${yuzdelik(o2, 0.9).toFixed(3).padStart(8)}${yuzdelik(o2, 0.99).toFixed(3).padStart(8)}${esik.toFixed(2).padStart(7)}${`${fp}(${o2.length ? ((fp / o2.length) * 100).toFixed(0) : 0}%)`.padStart(9)}${String(tp).padStart(9)}`,
  )
}

// ── ÖN-KAPI TABAN ORANLARI (kapı ancak taban temizse açılır) ─────────────
console.log(`\nÖN-KAPI TABAN ORANLARI (gerçek ÖSYM üzerinde — kapının meşruiyet ölçümü):`)
const sayisalOsym = OSYM.filter((r) => dersAilesi(r.subject) === 'sayisal')
const sifirSayi = sayisalOsym.filter((r) => sayiAdedi(r.question_text) === 0).length
console.log(`  sayısal-aile kökünde SIFIR sayı : ${sifirSayi}/${sayisalOsym.length} (${((sifirSayi / sayisalOsym.length) * 100).toFixed(1)}%)`)
const kokKelimeler = OSYM.map((r) => kelime(r.question_text))
console.log(`  kök kelime p1/p99               : ${yuzdelik(kokKelimeler, 0.01)} / ${yuzdelik(kokKelimeler, 0.99)}`)
const ciplakKesir = sayisalOsym.filter((r) => CIPLAK_KESIR.test(r.question_text)).length
console.log(`  çıplak kesir (sayısal kök)      : ${ciplakKesir}/${sayisalOsym.length} (${((ciplakKesir / sayisalOsym.length) * 100).toFixed(1)}%)`)
const hamMat = sayisalOsym.filter((r) => hamMatematikKacagi(r.question_text) !== null).length
console.log(`  ham ^/_ (sayısal kök, bilgi)    : ${hamMat}/${sayisalOsym.length} (${((hamMat / sayisalOsym.length) * 100).toFixed(1)}%)  ← PDF kaynaklı; AI kapısına engel değil`)
// Çeldirici-küme çakışması: aynı-ders çiftlerinde 5/5 birebir metinsel küme.
let kumeCakisan = 0
{
  const grup = new Map<string, Row[]>()
  for (const r of OSYM) grup.set(r.subject, [...(grup.get(r.subject) ?? []), r])
  for (const rows of grup.values())
    for (let i = 0; i < rows.length; i++)
      for (let j = i + 1; j < rows.length; j++)
        if (celdiriciKumesiAyni(rows[i].options ?? {}, rows[j].options ?? {})) kumeCakisan++
}
console.log(`  çeldirici-küme çakışması (çift) : ${kumeCakisan}  ← ~0 beklenir; değilse kapı metinsel alt-tipe daralır`)

// ═════════════════════════════════════════════════════════════════════════
// 2c — DRİFT (taban-çizgisine göre)
// ═════════════════════════════════════════════════════════════════════════
console.log(`\n══ 2c DRİFT ══`)
const SNAP = {
  tarih: new Date().toISOString(),
  ai: {
    n: TA.n,
    sizintiOrani: TA.sizintiOlculen ? TA.sizinti / TA.sizintiOlculen : 0,
    kusatmaIhlalOrani: TA.kusatmaOlculen ? TA.kusatmaIhlal / TA.kusatmaOlculen : 0,
    gorselGonderme: TA.gorsel,
    nnKopya: nnKopyaToplam,
    nnP90: yuzdelik(duz(nnA), 0.9),
  },
  osym: { n: TO.n },
}
const DIR = join(import.meta.dir, '..', '..', 'eval-sonuclari')
mkdirSync(DIR, { recursive: true })
const onceki = readdirSync(DIR).filter((f) => f.endsWith('.json')).sort().at(-1)
if (!onceki) {
  console.log('  ilk koşu — taban çizgisi yazıldı, karşılaştırma yok.')
} else {
  const eski = JSON.parse(readFileSync(join(DIR, onceki), 'utf8')) as typeof SNAP
  const kontrol: Array<[string, number, number]> = [
    ['sızıntı oranı', eski.ai.sizintiOrani, SNAP.ai.sizintiOrani],
    ['kuşatma ihlal oranı', eski.ai.kusatmaIhlalOrani, SNAP.ai.kusatmaIhlalOrani],
    ['görsel gönderme adedi', eski.ai.gorselGonderme, SNAP.ai.gorselGonderme],
    ['NN kopya adedi', eski.ai.nnKopya, SNAP.ai.nnKopya],
  ]
  for (const [ad, once, simdi] of kontrol) {
    if (simdi > once + 1e-9) KIRMIZI(`KÖTÜLEŞME — ${ad}: ${once.toFixed(3)} → ${simdi.toFixed(3)} (baseline: ${onceki})`)
    else YESIL(`${ad}: ${once.toFixed(3)} → ${simdi.toFixed(3)}`)
  }
}
writeFileSync(join(DIR, `${SNAP.tarih.replace(/[:.]/g, '-')}.json`), JSON.stringify(SNAP, null, 2))

// ═════════════════════════════════════════════════════════════════════════
// 2d — HAKEM MODÜLÜ (kredili; bayraksız TEK LLM çağrısı yok)
// ═════════════════════════════════════════════════════════════════════════
console.log(`\n══ 2d HAKEM ══`)
if (!HAKEM) {
  console.log('  kapalı (kredisiz koşu). Açmak için: bun run eval --hakem   (maliyet tahmini basar, --evet ister)')
} else {
  await hakemSinavi()
}

async function hakemSinavi(): Promise<void> {
  // Ölçülen birim maliyet (bu repo, v4-flash, merdiven+soru istemi): ~$0.00022/çağrı.
  const CIFT = 10  // pairwise: 10 çift × 2 yön = 20 çağrı
  const TEKRAR = 8 // mekanizma tekrar-tutarlılığı: 8 soru × 2 = 16 çağrı
  const cagri = CIFT * 2 + TEKRAR * 2
  const tahmin = cagri * 0.00022 * 1.5 // mekanizma çıktısı basit etiketten uzun → 1.5 pay
  console.log(`  plan: ${CIFT} TYT/AYT çifti çift-yönlü + ${TEKRAR} soru mekanizma-tekrarı = ${cagri} çağrı ≈ $${tahmin.toFixed(3)}`)
  if (!EVET) {
    console.log('  onay yok — koşmadı. Koşmak için: bun run eval --hakem --evet')
    return
  }
  const KEY = process.env.OPENROUTER_API_KEY
  if (!KEY) { KIRMIZI('OPENROUTER_API_KEY yok'); return }

  type QRow = { question_text: string; options: Record<string, string>; exam_label: string }
  const { data } = await supabase.from('yks_questions')
    .select('question_text, options, exam_label').eq('source_type', 'osym_cikmis')
    .eq('subject', 'Matematik').eq('verified', true).limit(400)
  const rows = (data ?? []) as QRow[]
  const tyt = rows.filter((r) => r.exam_label === 'TYT').slice(0, CIFT)
  const ayt = rows.filter((r) => r.exam_label === 'AYT').slice(0, CIFT)

  let gT = 0, cT = 0
  const sor = async (user: string): Promise<string> => {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'deepseek/deepseek-v4-flash',
        provider: { ignore: ['deepinfra'], sort: 'price', allow_fallbacks: true },
        max_tokens: 3000, temperature: 0,
        messages: [{ role: 'system', content: ZORLUK_MERDIVENI }, { role: 'user', content: user }],
      }),
    })
    const j = (await res.json()) as any
    gT += j.usage?.prompt_tokens ?? 0
    cT += j.usage?.completion_tokens ?? 0
    return j.choices?.[0]?.message?.content ?? ''
  }
  const metin = (r: QRow): string =>
    `${r.question_text}\n${Object.entries(r.options ?? {}).map(([k, v]) => `${k}) ${v}`).join('\n')}`

  // (1) Çift-yönlü pairwise: cevap SIRAYLA değişiyorsa çöp olan hakemdir (yer gerçeği gerekmez).
  let tutarli = 0, aytSecti = 0
  for (let i = 0; i < Math.min(tyt.length, ayt.length); i++) {
    const soruAB = (a: QRow, b: QRow): string =>
      `İki soru:\n[1]\n${metin(a)}\n\n[2]\n${metin(b)}\n\nHangisi ZORLUK MERDİVENİ'ne göre daha zor? Yalnız {"zor":1} veya {"zor":2} döndür.`
    const c1 = (await sor(soruAB(tyt[i], ayt[i]))).match(/"zor"\s*:\s*([12])/)?.[1]
    const c2 = (await sor(soruAB(ayt[i], tyt[i]))).match(/"zor"\s*:\s*([12])/)?.[1]
    const ilkAyt = c1 === '2'
    const ikinciAyt = c2 === '1'
    if (c1 && c2 && ilkAyt === ikinciAyt) { tutarli++; if (ilkAyt) aytSecti++ }
    process.stdout.write(`\r  pairwise ${i + 1}/${Math.min(tyt.length, ayt.length)}`)
  }
  console.log(`\n  çift-yönlü tutarlılık: ${tutarli}/${Math.min(tyt.length, ayt.length)}  ·  tutarlılarda AYT'yi zor seçme: ${aytSecti}/${tutarli || 1}`)

  // (2) Mekanizma tekrar-tutarlılığı: aynı soruya iki kez sorulur, küme Jaccard'ı.
  const mekIste = (r: QRow): string =>
    `SORU:\n${metin(r)}\n\nŞu mekanizmalardan HANGİLERİ bu soruda var? ${MEKANIZMALAR.join(' | ')}\n` +
    `Her biri için tek cümle kanıt ver. Yalnız JSON: {"mechanisms":[{"ad":"...","kanit":"..."}]}`
  let jacToplam = 0, jacN = 0
  for (let i = 0; i < Math.min(TEKRAR, rows.length); i++) {
    const cek1 = new Set(((await sor(mekIste(rows[i]))).match(/"ad"\s*:\s*"([^"]+)"/g) ?? []).map((x) => x.slice(7, -1)))
    const cek2 = new Set(((await sor(mekIste(rows[i]))).match(/"ad"\s*:\s*"([^"]+)"/g) ?? []).map((x) => x.slice(7, -1)))
    const birlesim = new Set([...cek1, ...cek2])
    const kesisim = [...cek1].filter((x) => cek2.has(x)).length
    jacToplam += birlesim.size ? kesisim / birlesim.size : 1
    jacN++
    process.stdout.write(`\r  mekanizma-tekrar ${i + 1}/${Math.min(TEKRAR, rows.length)}`)
  }
  console.log(`\n  mekanizma tekrar-tutarlılığı (ort. Jaccard): ${(jacToplam / (jacN || 1)).toFixed(2)}`)
  console.log(`  maliyet: $${(gT * 0.098e-6 + cT * 0.196e-6).toFixed(4)}`)
}

// ═════════════════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(50)}`)
if (kirmizi > 0) {
  console.log(`SONUÇ: KIRMIZI — ${kirmizi} ihlal. Yukarıdaki ✗ satırlarına bak.`)
  process.exit(1)
}
console.log('SONUÇ: YEŞİL — altın set geçti, drift temiz.')
