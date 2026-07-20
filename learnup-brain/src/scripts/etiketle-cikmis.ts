/**
 * etiketle-cikmis.ts — çıkmış ÖSYM sorularına ÜCRETSİZ zorluk etiketi (çok günlük, resume-safe).
 *
 * `bun run etiketle` — her koşu kaldığı yerden sürer; günlük ücretsiz tavana yaklaşınca
 * kendini durdurur, ertesi gün aynı komut devam eder. SIFIR MALİYET GARANTİSİ: model-router
 * KULLANILMAZ, tek bir :free slug'a doğrudan bağlanılır; paralı modele düşme YOLU YOKTUR —
 * tavan/arıza durumunda tek davranış DURMAK ve yarın devam etmektir.
 *
 * NEDEN ultra-550b:free: pilot ölçümü (2026-07-19, 20 soru × 2 tarama) — kararlı zor 5/14
 * (v4-flash'ta SIFIR; flash içgözlemi 81 gerçek ÖSYM'nin hiçbirine zor diyememişti),
 * kararlılık 11/14, zor etiketleri AYT'ye yığılıyor (modele TYT/AYT verilmedi → doğrulayıcı).
 *
 * ETİKET POLİTİKASI (uydurma yok, iki aşamalı):
 *   1. tarama HERKESE: mekanizma taraması + merdiven etiketi → hakemZorluguTuret
 *      (kanıtlı ≥2 mekanizma → zor; içgözlem yalnız kolay/orta diyebilir).
 *   2. tarama YALNIZ (a) zor adaylarına — tek riskli etiket zor'dur, çifte onay olmadan
 *      yazılmaz; iki tarama anlaşmazsa NULL kalır ("bilmiyoruz" dürüst cevaptır) —
 *      ve (b) %10 kontrol örneklemine (kolay/orta tek-tarama politikasının oynaklık ölçümü;
 *      kirli çıkarsa politika DB yazımından ÖNCE tam çift-taramaya yükseltilir).
 *   Bu, 1730×2=3460 çağrıyı ~2300-2500'e indirir (≈1 gün kazanç) ve kararlılık garantisini
 *   yalnız ihtiyacı olan etikete harcar.
 *
 * ⚠️ DB'YE YAZMAZ. Sonuçlar data/etiketler-cikmis.jsonl'a birikir (append-only = çökme/kesinti
 * güvenli). Dağılım incelenip onaylanmadan yks_questions/yks_exemplars'a etiket basılmaz.
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { supabase } from '../clients/supabase.js'
import { fetchAll } from '../lib/pg.js'
import { ZORLUK_MERDIVENI, MEKANIZMALAR } from '../persona/osym.charter.js'
import { hakemZorluguTuret, type Verdict } from '../lib/generation.js'
import { jsonCoz } from '../lib/model-router.js'

const MODEL = 'nvidia/nemotron-3-ultra-550b-a55b:free' // TEK model — zincir yok, paralı yedek yok
const KEY = process.env.OPENROUTER_API_KEY
if (!KEY) { console.error('OPENROUTER_API_KEY yok'); process.exit(1) }

/** Bu koşunun istek bütçesi. Gerçek tavan ~1000/gün (hesapta $10+); verify denetçisi de aynı
 *  havuzdan yediği için pay bırakılır. Gün içinde başka koşu yapıldıysa düşür: ETIKET_GUNLUK=400 */
const GUNLUK = Number(process.env.ETIKET_GUNLUK) || 850
const ES_ZAMANLI = 6 // 20/dk resmî limitin altında kalır (ort. çağrı 20-60sn → ~6-15/dk)
const DAKIKA_LIMIT = 17

const DOSYA = fileURLToPath(new URL('../../data/etiketler-cikmis.jsonl', import.meta.url))

type Mek = { ad: string; kanit: string }
type Satir = {
  id: string; tarama: 1 | 2; subject: string; exam_label: string | null
  etiket: string; turet: string | null; mek: Mek[]; sn: number; t: string
}
type Soru = {
  id: string; subject: string; question_text: string
  options: Record<string, string> | null; exam_label: string | null
}

// ── Checkpoint: dosyadaki her satır bitmiş bir tarama; yarım iş asla yazılmaz ──
const gecmis = new Map<string, { t1?: Satir; t2?: Satir }>()
if (existsSync(DOSYA)) {
  for (const ham of readFileSync(DOSYA, 'utf8').split('\n')) {
    if (!ham.trim()) continue
    try {
      const s = JSON.parse(ham) as Satir
      const kayit = gecmis.get(s.id) ?? {}
      if (s.tarama === 1) kayit.t1 = s
      else kayit.t2 = s
      gecmis.set(s.id, kayit)
    } catch { /* yarım satır (çökme anı) — yok say, o tarama yeniden yapılır */ }
  }
}

/** %10 kontrol örneklemi — deterministik (id'den), koşular arasında değişmez. */
const kontrolMu = (id: string): boolean => createHash('md5').update(id).digest()[0] % 10 === 0
const ikinciTaramaGerek = (id: string, t1: Satir): boolean => t1.turet === 'zor' || kontrolMu(id)

const istem = (q: Soru): string => {
  const siklar = Object.entries(q.options ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}) ${v}`)
    .join('\n')
  return (
    `SORU (gerçek bir ÖSYM çıkmış sorusu — görevin ZORLUĞUNU ETİKETLEMEK):\n${q.question_text}\n${siklar}\n\n` +
    `MEKANİZMA TARAMASI: Şu beş yapıdan hangileri bu soruda GERÇEKTEN var?\n` +
    `${MEKANIZMALAR.join(' | ')}\n` +
    `Her bulduğun için TEK CÜMLE SOMUT kanıt yaz: hangi veri örtük, hangi çeldirici hangi eksik\n` +
    `yolun sonucu, hangi şıklar aynı ilişkinin savunulabilir okumaları. Kanıt gösteremediğin\n` +
    `mekanizmayı LİSTELEME; hiçbiri yoksa boş dizi döndür. Ad, listedeki yazımla BİREBİR aynı olsun.\n` +
    `Sonra sorunun YAPISINI (kendi hızını değil) ZORLUK MERDİVENİ'ne vur.\n` +
    `Şu şemada JSON döndür: {"mechanisms":[{"ad":"...","kanit":"..."}],"etiket":"kolay|orta|zor"}`
  )
}

// ── Hız + bütçe kapıları (tüm işçiler paylaşır; tek iş parçacığı → yarış yok) ──
const baslangiclar: number[] = []
const hizBekle = async (): Promise<void> => {
  for (;;) {
    const simdi = Date.now()
    while (baslangiclar.length && simdi - baslangiclar[0] > 60_000) baslangiclar.shift()
    if (baslangiclar.length < DAKIKA_LIMIT) { baslangiclar.push(simdi); return }
    await new Promise((r) => setTimeout(r, 61_000 - (simdi - baslangiclar[0])))
  }
}
let istek = 0
let dur = false // günlük tavan / bütçe → tüm işçiler nazikçe biter, checkpoint zaten diskte

type TaramaSonucu = { etiket: string; turet: string | null; mek: Mek[]; sn: number } | 'durdur' | null

const tara = async (q: Soru): Promise<TaramaSonucu> => {
  const bas = Date.now()
  let tavan = 4000
  for (let deneme = 1; deneme <= 5; deneme++) {
    if (dur || istek >= GUNLUK) return 'durdur'
    await hizBekle()
    istek++
    try {
      const ctrl = new AbortController()
      // ⚠️ Zamanlayıcı GÖVDEYİ DE kapsamalı: fetch() başlıklar gelince döner, res.json() gövdeyi
      // AYRICA bekler. İlk sürümde clearTimeout fetch'ten hemen sonraydı — sağlayıcı cevabı
      // yarıda askıda bırakınca res.json() süresiz takıldı (ÖLÇÜLDÜ: ilk mini koşu 25 dk asılı
      // kaldı, süreç elle öldürüldü). finally şart: erken continue/throw yollarında sayaç
      // temizlenmezse süreç çıkışta 240sn oyalanır.
      const zaman = setTimeout(() => ctrl.abort(), 240_000)
      let durum = 0
      let j: {
        error?: { message?: string }
        choices?: Array<{ message?: { content?: string }; finish_reason?: string }>
      } = {}
      try {
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
          signal: ctrl.signal,
          body: JSON.stringify({
            model: MODEL,
            max_tokens: tavan,
            temperature: 0, // etiketleme deterministik olsun — kararlılık ölçümünü ısı kirletmesin
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: ZORLUK_MERDIVENI },
              { role: 'user', content: istem(q) },
            ],
          }),
        })
        durum = res.status
        j = (await res.json()) as typeof j
      } finally {
        clearTimeout(zaman)
      }
      if (durum === 429) {
        // Günlük tavan mı, dakikalık mı? Günlükse bugün bitti — yarın aynı komut devam eder.
        if (/day|daily/i.test(j.error?.message ?? '')) { console.log('\nGÜNLÜK ÜCRETSİZ TAVAN DOLDU — durdum. Yarın: bun run etiketle'); return 'durdur' }
        await new Promise((r) => setTimeout(r, 65_000))
        continue
      }
      if (j.error || durum < 200 || durum >= 300) { // 5xx / kapasite (Nvidia 502'leri) → sabırlı bekle
        await new Promise((r) => setTimeout(r, 15_000 * deneme))
        continue
      }
      if (j.choices?.[0]?.finish_reason === 'length') tavan = 8000
      const v = jsonCoz<{ mechanisms?: Mek[]; etiket?: string }>(j.choices?.[0]?.message?.content)
      if (!v || !['kolay', 'orta', 'zor'].includes(String(v.etiket))) {
        await new Promise((r) => setTimeout(r, 5_000))
        continue
      }
      const mek = (v.mechanisms ?? []).filter((m) => m && m.ad && m.kanit)
      const turet = hakemZorluguTuret({ mechanisms: mek, actualDifficulty: v.etiket } as Verdict)
      return { etiket: String(v.etiket), turet, mek, sn: (Date.now() - bas) / 1000 }
    } catch {
      await new Promise((r) => setTimeout(r, 15_000 * deneme))
    }
  }
  return null // 5 deneme öldü → kaydedilmez → SONRAKİ koşu bu soruyu yeniden dener
}

// ── Ana akış ──
const sorular = await fetchAll<Soru>(() =>
  supabase
    .from('yks_questions')
    .select('id, subject, question_text, options, exam_label')
    .eq('source_type', 'osym_cikmis')
    .eq('verified', true),
)
// Deterministik ama ders-karışık sıra: ara raporlardaki dağılım tek derse çarpık olmasın
sorular.sort((a, b) => createHash('md5').update(a.id).digest('hex').localeCompare(createHash('md5').update(b.id).digest('hex')))

// ⚠️ 2. TARAMALAR ÖNCE — kuyruğun BAŞINA. İlk sürümde 2. taramalar sona ekleniyordu ve
// 1695 birinci-taramanın arkasına düşüyordu; günlük bütçe 1. taramalara gidince zor adayları
// hiç çifte-onay göremedi (ÖLÇÜLDÜ: 1. gün 209 zor adayı, kararlı ZORLA 0). Oysa çifte onay
// olmadan zor etiketi kullanılamaz → sinyal gün 3'e kadar sıfır kalırdı. 2. taramaya öncelik
// verince her zor adayı kısa sürede kesinleşir ve gerçek eleme oranı GÜN 1'de ölçülür
// (yaklaşım kırıksa 2 gün harcamadan anlaşılır).
type Gorev = { q: Soru; tarama: 1 | 2 }
const ikinciler: Gorev[] = []
const birinciler: Gorev[] = []
for (const q of sorular) {
  const g = gecmis.get(q.id)
  if (!g?.t1) birinciler.push({ q, tarama: 1 })
  else if (!g.t2 && ikinciTaramaGerek(q.id, g.t1)) ikinciler.push({ q, tarama: 2 })
}
const kuyruk: Gorev[] = [...ikinciler, ...birinciler]

console.log(
  `ETİKETLEME — ${MODEL} · toplam ${sorular.length} soru · bitmiş 1.tarama ${[...gecmis.values()].filter((g) => g.t1).length} · ` +
  `bu koşu kuyruğu ${kuyruk.length} · istek bütçesi ${GUNLUK} · eşzamanlı ${ES_ZAMANLI}`,
)

let bitti = 0
let aktif = 0
const isci = async (): Promise<void> => {
  for (;;) {
    if (dur) return
    const gorev = kuyruk.shift()
    if (!gorev) {
      if (aktif === 0) return // kuyruk boş VE kimse çalışmıyor → gerçekten bitti
      await new Promise((r) => setTimeout(r, 2_000)) // biri hâlâ 2. tarama püskürtebilir
      continue
    }
    aktif++
    const sonuc = await tara(gorev.q)
    aktif--
    if (sonuc === 'durdur') { dur = true; return }
    if (!sonuc) { console.log(`  ÖLDÜ (5 deneme): ${gorev.q.subject} ${gorev.q.id.slice(0, 8)} — sonraki koşuda denenir`); continue }
    const satir: Satir = {
      id: gorev.q.id, tarama: gorev.tarama, subject: gorev.q.subject, exam_label: gorev.q.exam_label,
      etiket: sonuc.etiket, turet: sonuc.turet, mek: sonuc.mek, sn: Math.round(sonuc.sn), t: new Date().toISOString(),
    }
    appendFileSync(DOSYA, JSON.stringify(satir) + '\n')
    const kayit = gecmis.get(satir.id) ?? {}
    if (gorev.tarama === 1) {
      kayit.t1 = satir
      if (ikinciTaramaGerek(satir.id, satir)) kuyruk.unshift({ q: gorev.q, tarama: 2 }) // ÖNE al: aynı koşuda hemen çifte onay
    } else kayit.t2 = satir
    gecmis.set(satir.id, kayit)
    bitti++
    if (bitti % 25 === 0) console.log(`  ${bitti} tarama bitti · istek ${istek}/${GUNLUK} · kuyruk ${kuyruk.length}`)
  }
}
const basZaman = Date.now()
await Promise.all(Array.from({ length: ES_ZAMANLI }, isci))

// ── Koşu raporu — dosyadaki TÜM birikimden (yalnız bu koşudan değil) ──
const hepsi = [...gecmis.entries()]
const t1ler = hepsi.filter(([, g]) => g.t1)
const dagilim = { kolay: 0, orta: 0, zor: 0 }
for (const [, g] of t1ler) dagilim[(g.t1!.turet ?? 'orta') as keyof typeof dagilim] = (dagilim[(g.t1!.turet ?? 'orta') as keyof typeof dagilim] ?? 0) + 1
const zorAday = t1ler.filter(([, g]) => g.t1!.turet === 'zor')
const zorKararli = zorAday.filter(([, g]) => g.t2?.turet === 'zor')
const zorOynak = zorAday.filter(([, g]) => g.t2 && g.t2.turet !== 'zor')
const kontrol = t1ler.filter(([id, g]) => kontrolMu(id) && g.t1!.turet !== 'zor' && g.t2)
const kontrolUyum = kontrol.filter(([, g]) => g.t1!.turet === g.t2!.turet)
const zorEtiket = new Map<string, number>()
for (const [, g] of zorKararli) zorEtiket.set(g.t1!.exam_label ?? '?', (zorEtiket.get(g.t1!.exam_label ?? '?') ?? 0) + 1)

console.log(`\n── KOŞU RAPORU (${Math.round((Date.now() - basZaman) / 60_000)} dk, ${istek} istek, $0) ──`)
console.log(`1. tarama: ${t1ler.length}/${sorular.length} · türetilmiş dağılım: kolay ${dagilim.kolay} / orta ${dagilim.orta} / zor(aday) ${dagilim.zor}`)
console.log(`zor adayı ${zorAday.length} → kararlı ${zorKararli.length} · oynak(NULL kalacak) ${zorOynak.length} · 2.tarama bekleyen ${zorAday.length - zorKararli.length - zorOynak.length}`)
console.log(`kararlı zor'un sınav dağılımı: ${[...zorEtiket.entries()].map(([k, n]) => `${k}=${n}`).join(' ') || '-'}`)
console.log(`kontrol örneklemi (kolay/orta kararlılık): ${kontrolUyum.length}/${kontrol.length} uyumlu${kontrol.length ? ` (%${Math.round((100 * kontrolUyum.length) / kontrol.length)})` : ''}`)
const kalan1 = sorular.length - t1ler.length
const kalan2 = zorAday.length - zorKararli.length - zorOynak.length + Math.round(kalan1 * 0.36) // pilot zor-aday oranı ~%36
console.log(kalan1 + kalan2 > 0
  ? `KALAN: ~${kalan1} birinci + ~${kalan2} ikinci tarama → yarın: bun run etiketle`
  : `TAMAM — dağılımı incele; DB yazımı AYRI onayla (bu script DB'ye dokunmaz).`)
