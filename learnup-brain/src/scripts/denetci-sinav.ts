/**
 * denetci-sinav.ts — denetçi adayı modelin DENETÇİLİK sınavı ($0; hakem modeli değiştirmeden önce koş).
 *
 * SORU: nemotron-3-ultra-550b:free, verify zincirinin başına konabilir mi?
 * Pilot yalnız ETİKETLEME becerisini ölçtü (kararlı zor 5/14, flash'ta 0). Denetçilik başka
 * iş: soruyu sıfırdan çöz, işaretli cevabı doğrula, kök çelişkisini/eksik veriyi yakala.
 * Flash'ın bu işteki tarihsel ölçümü: altın sette 3/4 (model-router.ts:94). Bu sınav aynı
 * kusur SINIFLARINI ultra'ya sorar — üretim istemiyle BİREBİR (OSYM_DENETCI_SYSTEM +
 * denetciIstemi + json_object + max_tokens 6000; generation.verifyQuestion'daki çağrının aynısı).
 *
 * Vakalar:
 *   1 saglam-sayisal    → ACCEPT + matchesMarked bekleriz
 *   2 isaret-yanlis     → matchesMarked=false + doğru harfi bulması bekleriz
 *   3 kok-celiskili     → internallyConsistent=false bekleriz (birlikte 6 sa > tek başına 4 sa
 *                         fiziksel çelişki; tarihsel flash-sınıfı arıza: cevabı bulup kökü okumamak)
 *   4 eksik-veri        → çözülemez bekleriz (kutular: eşitlikler metinde YOK; kod kapıları
 *                         bunu yakalamıyor — "şekil/grafik" kelimesi geçmiyor — tek savunma denetçi)
 *   5 saglam-kolay      → ACCEPT + mekanizma UYDURMAMASI bekleriz (türet ≠ zor)
 *   6 kavramsal-zor     → ACCEPT + AYIRT ETME kanıtlı bekleriz (Hayber; türet=zor ise altın)
 *   3 ve 6 kararlılık için 2. kez koşulur. Toplam 8 çağrı.
 */
import { writeFileSync } from 'node:fs'
import { OSYM_DENETCI_SYSTEM, denetciIstemi } from '../persona/osym.charter.js'
import { jsonCoz } from '../lib/model-router.js'
import { hakemZorluguTuret, type Verdict } from '../lib/generation.js'
import { TEMP } from '../lib/models.js'

const MODEL = 'nvidia/nemotron-3-ultra-550b-a55b:free'
const KEY = process.env.OPENROUTER_API_KEY
if (!KEY) { console.error('OPENROUTER_API_KEY yok'); process.exit(1) }

type Harf = 'A' | 'B' | 'C' | 'D' | 'E'
type Vaka = {
  ad: string
  soru: string
  siklar: Record<Harf, string>
  dogru: Harf
  kanit: string
  istenen: 'kolay' | 'orta' | 'zor'
  beklenti: string
  gecti: (v: Verdict) => boolean
}

const KIRTASIYE = {
  soru:
    'Bir kırtasiyede kalemlerin tanesi 7 TL, defterlerin tanesi 12 TL olarak satılmaktadır. ' +
    'Bu kırtasiyeden kalem ve defter olmak üzere toplam 10 ürün alan bir kişi 90 TL ödediğine ' +
    'göre, bu kişi kaç defter almıştır?',
  siklar: { A: '2', B: '3', C: '4', D: '5', E: '6' } as Record<Harf, string>,
  kanit: 'Kazanım: Birinci dereceden bir bilinmeyenli denklemler; gerçek yaşam problemlerini denklem kurarak çözme.',
}

const VAKALAR: Vaka[] = [
  {
    ad: 'saglam-sayisal',
    ...KIRTASIYE,
    dogru: 'C', // 7(10-d)+12d=90 → d=4
    istenen: 'orta',
    beklenti: 'ACCEPT + matchesMarked=true + internallyConsistent=true',
    gecti: (v) => v.matchesMarked === true && v.internallyConsistent === true && v.verdict === 'ACCEPT',
  },
  {
    ad: 'isaret-yanlis',
    ...KIRTASIYE,
    dogru: 'E', // 6 = KALEM sayısı (klasik tuzak) — işaret yanlış, doğrusu C
    istenen: 'orta',
    beklenti: 'matchesMarked=false + solvedAnswer=C',
    gecti: (v) => v.matchesMarked === false && (v.solvedAnswer ?? '').trim().toUpperCase().startsWith('C'),
  },
  {
    ad: 'kok-celiskili',
    soru:
      'Bir havuzu birinci musluk tek başına 4 saatte doldurmaktadır. İki musluk birlikte ' +
      'açıldığında aynı havuz 6 saatte dolduğuna göre, ikinci musluk tek başına bu havuzu ' +
      'kaç saatte doldurur?',
    siklar: { A: '8', B: '10', C: '12', D: '14', E: '16' },
    dogru: 'C', // kör hesap 1/6-1/4=-1/12 → |−12|; oysa birlikte süre tek musluktan UZUN olamaz
    kanit: 'Kazanım: İş-havuz problemleri; birlikte çalışma hızlarının toplanması.',
    istenen: 'orta',
    beklenti: 'internallyConsistent=false (çelişkiyi yakala)',
    gecti: (v) => v.internallyConsistent === false,
  },
  {
    ad: 'eksik-veri',
    soru:
      'Kutulara 2, 3, 4, 5, 6, 7, 8, 9 sayıları her kutuya farklı bir sayı gelecek biçimde ' +
      'yerleştirildiğinde tüm eşitlikler sağlanmaktadır. Buna göre A + B kaçtır?',
    siklar: { A: '7', B: '9', C: '11', D: '13', E: '15' },
    dogru: 'C',
    kanit: 'Kazanım: Doğal sayılarda dört işlem ve eşitlik kısıtlarıyla muhakeme.',
    istenen: 'zor',
    beklenti: 'çözülemez desin (eşitlikler metinde yok → eksik veri)',
    gecti: (v) => v.internallyConsistent === false || v.verdict !== 'ACCEPT',
  },
  {
    ad: 'saglam-kolay',
    soru: 'Bir sınıftaki 24 öğrencinin 1/3\'ü gözlük kullanmaktadır. Buna göre bu sınıfta gözlük kullanan kaç öğrenci vardır?',
    siklar: { A: '6', B: '8', C: '9', D: '12', E: '16' },
    dogru: 'B',
    kanit: 'Kazanım: Bir çokluğun belirtilen kesri kadarını hesaplama.',
    istenen: 'kolay',
    beklenti: 'ACCEPT + mekanizma uydurmasın (türet ≠ zor)',
    gecti: (v) => v.matchesMarked === true && v.verdict === 'ACCEPT' && hakemZorluguTuret(v) !== 'zor',
  },
  {
    ad: 'kavramsal-zor',
    soru:
      'Hz. Muhammed döneminde Müslümanlar ile Mekkeli müşrikler arasında birçok siyasi ve ' +
      'askerî gelişme yaşanmıştır. Buna göre aşağıdakilerden hangisi Müslümanlar ile Mekkeli ' +
      'müşrikler arasında gerçekleşen gelişmelerden biri değildir?',
    siklar: { A: 'Bedir Savaşı', B: 'Hudeybiye Antlaşması', C: "Mekke'nin Fethi", D: 'Hendek Savaşı', E: "Hayber'in Fethi" },
    dogru: 'E', // Hayber, müşriklerle değil Yahudilerle
    kanit:
      'Kazanım: Hz. Muhammed dönemi siyasi-askerî gelişmeleri (Bedir, Uhud, Hendek, Hudeybiye, ' +
      "Hayber, Mekke'nin Fethi) taraflarıyla birlikte değerlendirir. Hayber'in Fethi Yahudilere yöneliktir.",
    istenen: 'zor',
    beklenti: 'ACCEPT + AYIRT ETME kanıtlı (türet=zor ise altın)',
    gecti: (v) => v.matchesMarked === true && v.verdict === 'ACCEPT' && (v.mechanisms ?? []).length >= 1,
  },
]

// Kararlılık tekrarları: çelişki yakalama + mekanizma taraması (etiketlemede oynaklık ölçülmüştü)
const SIRA: Array<Vaka & { tur: number }> = [
  ...VAKALAR.map((v) => ({ ...v, tur: 1 })),
  { ...VAKALAR[2], tur: 2 },
  { ...VAKALAR[5], tur: 2 },
]

type Sonuc = {
  ad: string; tur: number; gecti: boolean | null; sureSn: number; deneme: number
  butce: number; finish: string; tokenUret: number; hata?: string
  v?: Verdict; turet?: string | null
}

const sor = async (vaka: Vaka): Promise<Sonuc> => {
  const render =
    `[SORU] ${vaka.soru}\n` +
    (['A', 'B', 'C', 'D', 'E'] as const).map((l) => `[${l}] ${vaka.siklar[l]}`).join('\n') +
    `\n[İŞARETLİ] ${vaka.dogru}`
  const bas = Date.now()
  let butce = 6000 // üretimle aynı başlangıç; finish=length olursa 12000'e çıkar (bulgu olarak raporlanır)
  let sonHata = ''
  let finish = ''
  let tokenUret = 0
  for (let deneme = 1; deneme <= 5; deneme++) {
    try {
      const ctrl = new AbortController()
      const zaman = setTimeout(() => ctrl.abort(), 300_000)
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
        signal: ctrl.signal,
        body: JSON.stringify({
          model: MODEL,
          max_tokens: butce,
          temperature: TEMP.STRICT,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: OSYM_DENETCI_SYSTEM },
            { role: 'user', content: denetciIstemi(render, vaka.kanit, vaka.istenen) },
          ],
        }),
      })
      clearTimeout(zaman)
      const j = (await res.json()) as {
        error?: { message?: string; code?: number }
        choices?: Array<{ message?: { content?: string }; finish_reason?: string }>
        usage?: { completion_tokens?: number }
      }
      if (j.error || !res.ok) {
        sonHata = `HTTP ${res.status} ${j.error?.message ?? ''}`.trim()
        await new Promise((r) => setTimeout(r, 20_000))
        continue
      }
      finish = j.choices?.[0]?.finish_reason ?? '?'
      tokenUret += j.usage?.completion_tokens ?? 0
      const icerik = j.choices?.[0]?.message?.content ?? ''
      const v = jsonCoz<Verdict>(icerik)
      if (!v) {
        sonHata = `JSON çözülemedi (finish=${finish}, ${icerik.length} krk)`
        if (finish === 'length') butce = 12_000
        await new Promise((r) => setTimeout(r, 5_000))
        continue
      }
      return {
        ad: vaka.ad, tur: 0, gecti: vaka.gecti(v), sureSn: (Date.now() - bas) / 1000,
        deneme, butce, finish, tokenUret, v, turet: hakemZorluguTuret(v),
      }
    } catch (e) {
      sonHata = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
      await new Promise((r) => setTimeout(r, 20_000))
    }
  }
  return { ad: vaka.ad, tur: 0, gecti: null, sureSn: (Date.now() - bas) / 1000, deneme: 5, butce, finish, tokenUret, hata: sonHata }
}

console.log(`DENETÇİ SINAVI — ${MODEL} (${SIRA.length} çağrı, $0)\n`)
const sonuclar: Sonuc[] = []
for (const vaka of SIRA) {
  process.stdout.write(`  ${vaka.ad}${vaka.tur === 2 ? ' (tekrar)' : ''} ... `)
  const s = await sor(vaka)
  s.tur = vaka.tur
  sonuclar.push(s)
  const m = (s.v?.mechanisms ?? []).map((x) => x.ad).join('+') || '-'
  console.log(
    s.gecti === null
      ? `ÖLDÜ (${s.hata})`
      : `${s.gecti ? 'GEÇTİ' : 'KALDI'}  ${s.sureSn.toFixed(0)}sn deneme=${s.deneme} ` +
        `cevap=${s.v?.solvedAnswer ?? '?'} eşleşme=${s.v?.matchesMarked} tutarlı=${s.v?.internallyConsistent} ` +
        `hüküm=${s.v?.verdict} içgözlem=${s.v?.actualDifficulty} türet=${s.turet} mek=[${m}]`,
  )
}

const gecen = sonuclar.filter((s) => s.gecti === true).length
const olen = sonuclar.filter((s) => s.gecti === null).length
console.log(`\nSONUÇ: ${gecen}/${sonuclar.length} geçti · ${olen} altyapı ölümü`)
console.log(`(flash'ın tarihsel altın-set ölçümü: 3/4 — kaçırdığı tek kusur artık kod kapısında)`)
for (const s of sonuclar) {
  if (s.gecti === false && s.v) console.log(`  KALAN ${s.ad} critique: ${(s.v.critique ?? '').slice(0, 200)}`)
}

const dosya = 'C:/Users/Hp/AppData/Local/Temp/claude/c--Users-Hp-learnup-agent/94749160-41b5-4981-a4dd-a43057eb1c03/scratchpad/denetci-sinav-ultra.json'
writeFileSync(dosya, JSON.stringify({ model: MODEL, sonuclar }, null, 2))
console.log(`\nham çıktı: ${dosya}`)
