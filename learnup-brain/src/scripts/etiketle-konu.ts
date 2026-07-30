/**
 * etiketle-konu.ts — KAZANIM → KLASİK KONU eşlemesi (ücretsiz, resume-safe).
 *
 *   bun run etiketle-konu                → KURU KOŞU: eşlemeyi hesaplar, DB'ye YAZMAZ, rapor basar
 *   bun run etiketle-konu -- --rapordan  → SON kuru koşunun raporunu DB'ye yazar (LLM ÇAĞIRMAZ)
 *   bun run etiketle-konu -- --yaz       → hesaplar VE yazar (tek turda)
 *   bun run etiketle-konu -- --ders "Fizik"     → yalnız o dersi işler
 *   bun run etiketle-konu -- --yaz --yeniden    → mevcut 'llm' satırları da yeniden hesaplanır
 *
 * ⚠️ ONAY AKIŞI İÇİN `--rapordan` VAR. Kuru koşu 907 kazanım için ~46 LLM çağrısı ve 25-45
 * dakika sürüyor. "Önce göster, onaylayınca yaz" akışında `--yaz` ile ikinci tam tur atmak
 * aynı işi iki kez yaptırır (iki kat süre, iki kat kota). `--rapordan` onaylanan raporu
 * OKUYUP yazar; model hiç çağrılmaz.
 *
 * ⚠️ NEDEN VAR: curriculum_nodes'un 907 satırının tamamı kazanım; "Türev" diye bir düğüm YOK
 * (0026 gerekçesi). Öğrenciye klasik konu adıyla soru sunmak için kazanımların hangi ÖSYM
 * konusuna düştüğü bilinmeli. Bu script o eşlemeyi kurar.
 *
 * ⚠️ SIFIR MALİYET GARANTİSİ — etiketle-cikmis.ts ile aynı disiplin: model-router KULLANILMAZ,
 * tek bir ':free' slug'a doğrudan bağlanılır. Paralı modele düşme YOLU YOKTUR; tavan/arıza
 * durumunda tek davranış DURMAK'tır. (Router kullanılsaydı zincirin başındaki paralı DeepSeek
 * devreye girer ve 907 kazanımlık toplu iş habersiz fatura üretirdi.)
 *
 * ⚠️ UYDURMA KONU YOK. Model yalnız o dersin KONTROLLÜ sözlüğünden (konular tablosu) seçebilir.
 * Sözlükte olmayan bir ad dönerse eşleme SESSİZCE DÜŞÜRÜLÜR — kazanım eşleşmemiş kalır ve
 * raporda görünür. "Yaklaşık doğru" bir konu adı yazmak, sözlüğü kontrollü tutmanın amacını
 * (0026) bozardı: üç ay sonra "Türev", "Türev-İntegral", "Türev Uygulamaları" yan yana olurdu.
 *
 * ⚠️ YÖNETİCİ DÜZELTMESİ KORUNUR. kaynak='yonetici' satırlara --yeniden ile bile DOKUNULMAZ.
 * Aksi hâlde yöneticinin her elle düzeltmesi bir sonraki koşuda geri alınır ve düzeltme
 * ekranı sahte bir kontrol hissi verirdi.
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { supabase } from '../clients/supabase.js'
import { fetchAll } from '../lib/pg.js'
import { jsonCoz } from '../lib/model-router.js'

/**
 * MODEL ZİNCİRİ — hepsi ÜCRETSİZ. İlki tıkalıysa sıradakine geçilir.
 *
 * ⚠️ NEDEN ZİNCİR (ölçüldü 2026-07-27): tek modelle koşarken Nvidia ücretsiz uç noktası
 *     "ResourceExhausted: Worker local total request limit reached (33/32)"
 * döndürdü. Bu hata HTTP 200 gövdesinde `error` alanı olarak geliyor — yani durum kodu
 * bakan bir kontrol onu başarı sanar. Script 5 kez deneyip pes ediyor ve partiyi SESSİZCE
 * düşürüyordu: koşu "bitti" diyor, rapor boş. Kapasite dakikalar içinde açılıp kapanıyor
 * (aynı model 3 dakika sonra 1.9sn'de yanıtladı), yani beklemek değil BAŞKA UCA GEÇMEK doğru.
 *
 * Ölçülen çalışan ücretsiz uçlar: ultra-550b (1.9sn), super-120b (1.9sn), gemma-4-26b (1.3sn).
 * Bu iş bir SINIFLANDIRMA işi (kapalı listeden seçim) — 550B şart değil, küçük model de yeter.
 *
 * ⚠️ SIFIR MALİYET KAPISI: ':free' ile bitmeyen slug REDDEDİLİR. Paralı modele düşmek
 * 907 kazanımlık toplu işte habersiz fatura demek. Bilinçli istisna: KONU_PARALI_ONAY=1.
 */
const VARSAYILAN_ZINCIR = [
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'google/gemma-4-26b-a4b-it:free',
]
const PARALI_ONAY = process.env.KONU_PARALI_ONAY === '1'
const MODELLER = (process.env.KONU_MODEL?.split(',').map((s) => s.trim()).filter(Boolean) ?? VARSAYILAN_ZINCIR)
  .filter((m) => {
    if (m.endsWith(':free') || PARALI_ONAY) return true
    console.error(`⚠️  '${m}' ücretsiz değil — atlandı. Bilerek istiyorsan: KONU_PARALI_ONAY=1`)
    return false
  })
if (!MODELLER.length) {
  console.error('Kullanılabilir model yok.')
  process.exit(1)
}
const KEY = process.env.OPENROUTER_API_KEY
if (!KEY) {
  console.error('OPENROUTER_API_KEY yok')
  process.exit(1)
}

const RAPORDAN = process.argv.includes('--rapordan')
const YAZ = process.argv.includes('--yaz') || RAPORDAN
const YENIDEN = process.argv.includes('--yeniden')
/**
 * KURU KOŞUYU RAPORDAN SÜRDÜR.
 *
 * ⚠️ Neden ayrı bayrak gerekti: normal devam mekanizması kazanim_konu'daki SATIRLARA bakar —
 * ama kuru koşu DB'ye yazmaz. Yani 907 kazanımlık 25-45 dakikalık kuru koşu yarıda kesilirse
 * (terminal kapandı, timeout, ağ) hiçbir ilerleme korunmaz ve baştan başlanır. Rapor dosyası
 * append-only olduğu için tek dayanıklı ilerleme kaydı odur.
 */
const SURDUR = process.argv.includes('--surdur')
/** Tek ders hedefleme: sözlük düzeltmesi sonrası yalnız etkilenen dersi yeniden koşmak için. */
const DERS_ARG = process.argv[process.argv.indexOf('--ders') + 1]
const DERS = process.argv.includes('--ders') && DERS_ARG && !DERS_ARG.startsWith('--') ? DERS_ARG : null
/** Tek çağrıda kaç kazanım. 20'de istem ~2-3k token; 907 kazanım ≈ 46 çağrı (ücretsiz kotanın
 *  %5'i). Daha büyük öbek modelin listeyi yarıda kesmesi riskini artırıyor (ölçülmedi, temkin). */
const OBEK = Number(process.env.KONU_OBEK) || 20
const DAKIKA_LIMIT = Number(process.env.KONU_DAKIKA) || 17 // resmî ücretsiz limit 20/dk

const RAPOR = fileURLToPath(new URL('../../data/eslesme-konu.jsonl', import.meta.url))

type Kazanim = { id: number; title: string; subject: string; path: string }
type Konu = { id: number; ad: string; sinav: string; subject: string; unite: string | null }

// ── Hız kapısı: dakikalık ücretsiz limitin altında kal ────────────────────────
let pencere: number[] = []
const hizBekle = async (): Promise<void> => {
  for (;;) {
    const simdi = Date.now()
    pencere = pencere.filter((t) => simdi - t < 60_000)
    if (pencere.length < DAKIKA_LIMIT) {
      pencere.push(simdi)
      return
    }
    await new Promise((r) => setTimeout(r, 60_000 - (simdi - pencere[0]) + 500))
  }
}

/**
 * ⚠️ SINAV ETİKETİ ADIN İÇİNE KARIŞTIRILMAZ — ÖLÇÜLDÜ.
 * İlk sürüm sözlüğü `- Milli Mücadele  [AYT]` diye basıp "adı HARFİ HARFİNE yaz" diyordu.
 * Model köşeli parantezi adın PARÇASI sandı ve `"Milli Mücadele [AYT]"` döndürdü → sözlükte
 * böyle bir ad yok → 16/16 kazanımın TAMAMI düştü (ilk koşuda 16/16 eşleşmişti; istem
 * değişince davranış değişti, yani şans eseri çalışıyordu).
 * Çözüm iki katmanlı: (1) etiket ayrı ALAN olarak isteniyor, ad tek başına;
 * (2) yine de yapıştırırsa çözücü ayıklıyor (konuCozucuKur).
 */
const istem = (ders: string, konular: Konu[], grup: Kazanim[]): string => {
  // ⚠️ ÜNİTE BAĞLAM İÇİN GÖSTERİLİR, SEÇİLEBİLİR DEĞİL — ÖLÇÜLDÜ (0032 sonrası).
  // Sözlük 313'ten 813'e inceldiğinde "Sözcükte Yapı" bir ÜNİTE, "Kök/Ek/Gövde" ise
  // konu oldu. Yalnız konu adları listelendiğinde model tanıdık orta seviyeye uzanıp
  // "Sözcükte Yapı" döndürdü ve satır düştü (son 45 satırın 12'si). Hiyerarşiyi
  // göstermek modele hangi adın YAPRAK olduğunu belli ediyor.
  const sozluk = konular
    .map((k) => `${k.sinav}\t${k.unite ?? '—'}\t${k.ad}`)
    .join('\n')
  const liste = grup.map((k) => `${k.id}: ${k.title.replace(/\s+/g, ' ').trim()}`).join('\n')
  return `DERS: ${ders}

Aşağıda bu dersin konu listesi var. Her satır: SINAV<sekme>ÜNİTE<sekme>KONU
ÜNİTE yalnızca bağlam içindir — SEÇİLECEK OLAN son sütundaki KONU'dur.

KONU LİSTESİ:
${sozluk}

Aşağıda MEB müfredatından kazanım cümleleri var (id: metin).
Her kazanımı YUKARIDAKİ LİSTEDEN tam olarak BİR konuya eşle.

KURALLAR:
- "konu" alanına SON SÜTUNDAKİ konu adını yaz. ÜNİTE ADI YAZMA.
  Örnek satır: TYT<sekme>Sözcükte Yapı<sekme>Kök
  DOĞRU:  {"konu":"Kök"}
  YANLIŞ: {"konu":"Sözcükte Yapı"}   ← bu bir ünite, konu değil
- Kazanım bir ünitenin geneline uyuyorsa, o ünitenin EN UYGUN alt konusunu seç.
- KAZANIM TEMA/BECERİ CÜMLESİYSE YİNE DE EŞLE. Yeni müfredat bazı dersleri (özellikle
  Edebiyat) konu değil TEMA ve BECERİ ekseninde yazıyor: "… temasında ele alınan
  metinlerde okumayı yönetebilme", "… hazırladığı konuşmasında türe özgü içerik
  oluşturabilme". Bunlarda kazanımın GEÇTİĞİ TÜRE ya da ÖLÇTÜĞÜ BECERİYE en yakın
  konuyu seç ve guven'i düşük ver (0.3-0.5):
    "destan metinlerinde anlam oluşturabilme"        → "Destan"
    "metinlerde okumayı yönetebilme"                 → "Paragrafta Yapı"
    "yazdığı metinde dil bilgisi kurallarını uygulama" → "Dil Bilgisi" ailesinden uygun konu
- "konu" alanına YALNIZ konu adını yaz. Sınav bilgisini ADA EKLEME.
  DOĞRU:  {"konu":"Milli Mücadele","sinav":"AYT"}
  YANLIŞ: {"konu":"Milli Mücadele [AYT]"}
- Konu adı listedeki yazımla birebir aynı olmalı. Liste dışı ad ASLA yazma.
- "sinav" alanına o konunun listedeki sınavını yaz (TYT veya AYT). Aynı ad iki sınavda
  da varsa kazanımın seviyesine uygun olanı seç.
- Emin değilsen o kazanımı ATLA (listeye ekleme). Yanlış eşleme, eksik eşlemeden kötüdür.
- guven: 0.0-1.0 arası, eşlemeye ne kadar emin olduğun.

KAZANIMLAR:
${liste}

Yanıtı SADECE şu JSON ile ver:
{"eslesme":[{"id":<kazanim id>,"konu":"<yalnız ad>","sinav":"TYT|AYT","guven":<0-1>}]}`
}

type Eslesme = { id: number; konu: string; sinav?: string; guven?: number }

/** Kapasite/kota hatası mı — yani BAŞKA MODELE geçmek beklemekten iyi mi? */
const kapasiteHatasi = (mesaj: string): boolean =>
  /resourceexhausted|rate.?limit|capacity|overload|temporarily|unavailable|503|502/i.test(mesaj)

const cagir = async (ders: string, konular: Konu[], grup: Kazanim[]): Promise<Eslesme[] | 'durdur'> => {
  // Her denemede zincirde bir sıra ilerle: 1. deneme ultra, 2. super, 3. gemma, 4. ultra…
  const DENEME = Math.max(5, MODELLER.length * 2)
  for (let deneme = 1; deneme <= DENEME; deneme++) {
    const MODEL = MODELLER[(deneme - 1) % MODELLER.length]
    await hizBekle()
    try {
      const ctrl = new AbortController()
      // Zamanlayıcı gövdeyi de kapsar (etiketle-cikmis.ts:123'te ölçülen asılma).
      const zaman = setTimeout(() => ctrl.abort(), 240_000)
      let durum = 0
      let j: { error?: { message?: string }; choices?: Array<{ message?: { content?: string } }> } = {}
      try {
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
          signal: ctrl.signal,
          body: JSON.stringify({
            model: MODEL,
            max_tokens: 4000,
            temperature: 0, // eşleme deterministik olmalı — aynı kazanım her koşuda aynı konuya
            response_format: { type: 'json_object' },
            messages: [{ role: 'user', content: istem(ders, konular, grup) }],
          }),
        })
        durum = res.status
        j = (await res.json()) as typeof j
      } finally {
        clearTimeout(zaman)
      }
      if (durum === 429) {
        if (/day|daily/i.test(j.error?.message ?? '')) {
          console.log('\nGÜNLÜK ÜCRETSİZ TAVAN DOLDU — durdum. Yarın aynı komutla devam.')
          return 'durdur'
        }
        await new Promise((r) => setTimeout(r, 65_000))
        continue
      }
      if (j.error || durum < 200 || durum >= 300) {
        const mesaj = j.error?.message ?? `HTTP ${durum}`
        // Kapasite hatasında BEKLEME — sıradaki model zaten farklı bir uç noktada.
        // Ölçüldü: Nvidia tıkalıyken gemma 1.3sn'de yanıtlıyordu; 15sn beklemek israftı.
        if (!kapasiteHatasi(String(mesaj))) {
          await new Promise((r) => setTimeout(r, 10_000 * deneme))
        }
        continue
      }
      const v = jsonCoz<{ eslesme?: Eslesme[] }>(j.choices?.[0]?.message?.content)
      if (!v?.eslesme || !Array.isArray(v.eslesme)) {
        await new Promise((r) => setTimeout(r, 5_000))
        continue
      }
      return v.eslesme
    } catch {
      await new Promise((r) => setTimeout(r, 10_000 * deneme))
    }
  }
  // ⚠️ SESSİZ DÜŞÜŞ YOK. Eskiden burada boş dizi dönüyordu ve çağıran bunu "model hiçbir
  // kazanımı eşleyemedi" sanıyordu — oysa hiç yanıt ALINAMAMIŞTI. İkisi çok farklı:
  // birincisinde sözlük yetersiz, ikincisinde ağ/kapasite sorunu ve KOŞU TEKRARLANMALI.
  basarisizObek += 1
  console.log(`  ⚠️  ${ders}: ${grup.length} kazanımlık parti ${DENEME} denemede alınamadı — ATLANDI`)
  return []
}

/** Hiç yanıt alınamayan parti sayısı — koşu sonunda uyarı basılır. */
let basarisizObek = 0

// ── Ana akış ─────────────────────────────────────────────────────────────────
const konular = await fetchAll<Konu>(() =>
  supabase.from('konular').select('id, ad, sinav, subject, unite'),
)
if (!konular.length) {
  console.error('konular tablosu BOŞ — önce 0027_konu_sozlugu_seed.sql koşulmalı.')
  process.exit(1)
}

const kazanimlar = await fetchAll<Kazanim>(() =>
  supabase.from('curriculum_nodes').select('id, title, subject, path'),
)

// Zaten eşlenmiş olanlar: 'yonetici' HER ZAMAN atlanır; 'llm' yalnız --yeniden ile yeniden hesaplanır.
const mevcut = await fetchAll<{ kazanim_id: number; kaynak: string }>(() =>
  supabase.from('kazanim_konu').select('kazanim_id, kaynak'),
)
const atla = new Set(
  mevcut.filter((m) => m.kaynak === 'yonetici' || !YENIDEN).map((m) => Number(m.kazanim_id)),
)

/**
 * DERS EŞANLAMLILARI — müfredat ders adı → ÖSYM test dersi.
 *
 * ⚠️ Neden gerekli: `curriculum_nodes.subject` MEB'in OKUL DERSİ adını taşır; konu sözlüğü
 * ise ÖSYM'nin TEST dersini. İkisi her zaman aynı değil. "T.C. İnkılap Tarihi ve
 * Atatürkçülük" MEB'de ayrı bir derstir ama ÖSYM'de Tarih testinin içinde sorulur (0030).
 * Bu tablo olmadan script o dersi sözlükte bulamaz ve 16 kazanımın tamamını sessizce
 * düşürürdü — hata vermeden, yalnız eksik sonuçla.
 *
 * Müfredat ağacı KASTEN değiştirilmiyor: MEB adı doğrudur, çevrim sunum katmanında yapılır.
 */
const DERS_ESANLAMI: Record<string, string> = {
  'T.C. İnkılap Tarihi ve Atatürkçülük': 'Tarih',
}
const sozlukDersi = (ders: string): string => DERS_ESANLAMI[ders] ?? ders

const dersKonu = new Map<string, Konu[]>()
for (const k of konular) {
  const l = dersKonu.get(k.subject) ?? []
  l.push(k)
  dersKonu.set(k.subject, l)
}

/**
 * Konu adı (+ varsa sınav) → konu_id çözücüsü.
 *
 * Aynı ad TYT ve AYT'de AYRI satırdır ("Fonksiyonlar" ikisinde de var, farklı derinlikte).
 * Model sınavı söylerse ONA uyulur; söylemezse TYT'ye düşülür (temel seviye varsayılan).
 * Ada yapışmış `[AYT]` son eki ayıklanır ve sınav bilgisi olarak KULLANILIR — atılmaz.
 */
function konuCozucuKur(dersKonulari: Konu[]): (ham: string, sinav?: string | null) => number | undefined {
  const tam = new Map<string, number>()
  const sadeAd = new Map<string, number>()
  for (const k of dersKonulari) tam.set(`${k.ad} ${k.sinav}`, Number(k.id))
  for (const k of [...dersKonulari].sort((a, b) => (a.sinav === 'TYT' ? -1 : 1))) {
    if (!sadeAd.has(k.ad)) sadeAd.set(k.ad, Number(k.id))
  }
  return (ham, sinav) => {
    const m = /^(.*?)[\s([]*\b(TYT|AYT)\b[\s)\]]*$/.exec(String(ham).trim())
    const ad = (m ? m[1] : String(ham)).trim()
    const sn = (m ? m[2] : sinav) ?? null
    if (sn === 'TYT' || sn === 'AYT') {
      const id = tam.get(`${ad} ${sn}`)
      if (id) return id
    }
    return sadeAd.get(ad)
  }
}

// ── --rapordan: ONAYLANAN RAPORU YAZ (model çağrılmaz) ──────────────────────
// Kuru koşu 25-45 dakika ve ~46 çağrı. Onay sonrası --yaz ile ikinci tam tur atmak aynı
// işi iki kez yaptırırdı. Burada rapor OKUNUR ve yazılır.
if (RAPORDAN) {
  if (!existsSync(RAPOR)) {
    console.error('data/eslesme-konu.jsonl yok — önce kuru koşu yapılmalı.')
    process.exit(1)
  }
  const kazanimDers = new Map(kazanimlar.map((k) => [Number(k.id), k.subject]))
  // Rapor APPEND-ONLY: aynı kazanım birden çok koşuda görünebilir. EN SON satır kazanır.
  const enSon = new Map<number, { konu: string; sinav?: string; guven?: number; t: string }>()
  for (const satir of readFileSync(RAPOR, 'utf8').split('\n')) {
    if (!satir.trim()) continue
    try {
      const j = JSON.parse(satir) as { id?: number; konu?: string; sinav?: string; guven?: number; t?: string }
      if (!j.id || !j.konu) continue
      const onceki = enSon.get(Number(j.id))
      if (!onceki || String(j.t ?? '') >= onceki.t) {
        enSon.set(Number(j.id), { konu: j.konu, sinav: j.sinav, guven: j.guven, t: String(j.t ?? '') })
      }
    } catch { /* bozuk satır (yarım yazılmış) atlanır — rapor bir log, sözleşme değil */ }
  }

  const cozucuCache = new Map<string, ReturnType<typeof konuCozucuKur>>()
  const yazilir: Array<{ kazanim_id: number; konu_id: number; kaynak: string; guven: number | null }> = []
  let dusen = 0
  for (const [kid, e] of enSon) {
    if (atla.has(kid)) continue // yönetici düzeltmesi korunur
    const ders = kazanimDers.get(kid)
    if (!ders || (DERS && ders !== DERS)) continue
    let coz = cozucuCache.get(ders)
    if (!coz) { coz = konuCozucuKur(dersKonu.get(sozlukDersi(ders)) ?? []); cozucuCache.set(ders, coz) }
    const konuId = coz(e.konu, e.sinav)
    if (!konuId) { dusen++; continue }
    yazilir.push({ kazanim_id: kid, konu_id: konuId, kaynak: 'llm', guven: e.guven ?? null })
  }

  console.log(`rapordan: ${enSon.size} benzersiz kazanım · ${yazilir.length} yazılacak · ${dusen} sözlük dışı`)
  for (let i = 0; i < yazilir.length; i += 500) {
    const { error } = await supabase
      .from('kazanim_konu')
      .upsert(yazilir.slice(i, i + 500), { onConflict: 'kazanim_id' })
    if (error) { console.error('yazma hatası:', error.message); process.exit(1) }
  }
  console.log(`${yazilir.length} eşleme yazıldı (kaynak='llm').`)
  process.exit(0)
}

// --surdur: raporda ZATEN sonucu olan kazanımları atla (yarıda kesilen kuru koşuyu sürdür).
const raporda = new Set<number>()
if (SURDUR && existsSync(RAPOR)) {
  for (const satir of readFileSync(RAPOR, 'utf8').split('\n')) {
    if (!satir.trim()) continue
    try {
      const j = JSON.parse(satir) as { id?: number }
      if (j.id) raporda.add(Number(j.id))
    } catch { /* yarım satır */ }
  }
  console.log(`--surdur: raporda ${raporda.size} kazanım var, atlanacak`)
}

const bekleyen = kazanimlar
  .filter((k) => !atla.has(Number(k.id)) && !raporda.has(Number(k.id)))
  .filter((k) => !DERS || k.subject === DERS)
console.log(
  `${kazanimlar.length} kazanım · ${atla.size} atlanacak (eşli) · ${bekleyen.length} işlenecek · ` +
    `${konular.length} konu · zincir ${MODELLER.join(' → ')} · ${YAZ ? 'YAZMA AÇIK' : 'KURU KOŞU'}`,
)

const dersGrup = new Map<string, Kazanim[]>()
for (const k of bekleyen) {
  const l = dersGrup.get(k.subject) ?? []
  l.push(k)
  dersGrup.set(k.subject, l)
}

let toplamEsli = 0
let toplamDusen = 0
const sozlukDisi = new Map<string, number>()
const yazilacak: Array<{ kazanim_id: number; konu_id: number; kaynak: string; guven: number | null }> = []

dis: for (const [ders, grup] of dersGrup) {
  const dersKonulari = dersKonu.get(sozlukDersi(ders))
  if (!dersKonulari?.length) {
    // Sözlükte olmayan ders: harf uyuşmazlığı ya da eksik seed. SESSİZ GEÇME — bu, o dersin
    // tüm kazanımlarının kalıcı olarak eşleşmemesi demek (0027 doğrulama sorgusu 4).
    console.log(`  ⚠️  ${ders}: konu sözlüğünde YOK — ${grup.length} kazanım eşlenemedi`)
    toplamDusen += grup.length
    continue
  }
  const coz = konuCozucuKur(dersKonulari)

  for (let i = 0; i < grup.length; i += OBEK) {
    const obek = grup.slice(i, i + OBEK)
    // Eşanlamlı derste modele İKİSİ de söylenir: sözlük Tarih'indir ama kazanımlar
    // İnkılap müfredatından gelir — bu bağlam eşleme kalitesini artırır.
    const etiket = ders === sozlukDersi(ders) ? ders : `${sozlukDersi(ders)} (müfredat dersi: ${ders})`
    const sonuc = await cagir(etiket, dersKonulari, obek)
    if (sonuc === 'durdur') break dis

    const gecerliIdler = new Set(obek.map((k) => Number(k.id)))
    let esli = 0
    for (const e of sonuc) {
      const kid = Number(e.id)
      if (!gecerliIdler.has(kid)) continue // model öbekte olmayan id uydurdu
      const konuId = coz(String(e.konu), e.sinav)
      if (!konuId) {
        sozlukDisi.set(String(e.konu), (sozlukDisi.get(String(e.konu)) ?? 0) + 1)
        continue
      }
      yazilacak.push({
        kazanim_id: kid,
        konu_id: konuId,
        kaynak: 'llm',
        guven: typeof e.guven === 'number' ? e.guven : null,
      })
      esli++
    }
    toplamEsli += esli
    toplamDusen += obek.length - esli
    console.log(`  ${ders}: ${i + obek.length}/${grup.length} → ${esli}/${obek.length} eşlendi`)
    appendFileSync(
      RAPOR,
      sonuc
        .map((e) => JSON.stringify({ ders, ...e, t: new Date().toISOString() }))
        .join('\n') + '\n',
      'utf8',
    )
  }
}

console.log(`\nTOPLAM: ${toplamEsli} eşlendi · ${toplamDusen} eşlenemedi`)
if (basarisizObek) {
  console.log(
    `⚠️  ${basarisizObek} parti HİÇ YANIT ALAMADI (kapasite). Bunlar eksik kaldı —\n` +
      `   aynı komutu --surdur ile tekrar çalıştır, yalnız eksikler işlenir.`,
  )
}
if (sozlukDisi.size) {
  console.log('Sözlük DIŞI dönen adlar (düşürüldü) — sözlüğe eklenmeli mi bak:')
  for (const [ad, n] of [...sozlukDisi].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    console.log(`  "${ad}" × ${n}`)
  }
}

if (!YAZ) {
  console.log(`\nKURU KOŞU — DB'ye yazılmadı. Rapor: data/eslesme-konu.jsonl`)
  console.log('Yazmak için: bun run etiketle-konu -- --yaz')
  process.exit(0)
}

// Yazma: 500'lük öbekler (Supabase tek istekte büyük gövdeyi reddedebiliyor).
for (let i = 0; i < yazilacak.length; i += 500) {
  const { error } = await supabase
    .from('kazanim_konu')
    .upsert(yazilacak.slice(i, i + 500), { onConflict: 'kazanim_id' })
  if (error) {
    console.error('yazma hatası:', error.message)
    process.exit(1)
  }
}
console.log(`${yazilacak.length} eşleme yazıldı (kaynak='llm').`)
