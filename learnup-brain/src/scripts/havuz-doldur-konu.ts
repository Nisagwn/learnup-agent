/**
 * havuz-doldur-konu.ts — KONU-GÜDÜMLÜ havuz doldurma (üretim birimi kazanım değil KONU).
 *
 * ═══ NEDEN AYRI SCRIPT ═══
 * `havuz-doldur.ts` hücreyi (kazanım, zorluk) olarak kurar ve bu, kazanım ağacının İÇERİK
 * ekseninde olduğunu varsayar. 13 derste doğru; TDE'de değil:
 *   · 244 TDE kazanımının tamamı BECERİ ekseninde — okuma 59 · konuşma 64 · yazma 63 ·
 *     dinleme_izleme 58. Yalnız okuma ÖSYM'nin ölçtüğü şeye karşılık gelir; kalan 185'i
 *     performans/süreç kazanımıdır ("podcast hazırlayabilme") ve test sorusuna konu olamaz.
 *   · O 59 okuma kazanımı da içerik taşımaz: "'Dünden Bugüne' temasında ele alınan metinlerde
 *     anlam oluşturabilme" cümlesi fablı da destanı da halk hikâyesini de kapsar.
 *   · Sözlükte 102 TDE konusu var. `kazanim_konu` ÇOKTAN-BİRE olduğu için 59 kazanımla 102 konu
 *     doldurulamaz — ölçüldü: eşleme koştuktan sonra bile TDE'nin dolu konu sayısı 0'dı.
 *
 * Bu script hücreyi (KONU, zorluk) olarak kurar. Konu adı doğrudan üretim hedefi olur, grounding
 * ders-geneli vektör aramasıyla gelir (spec.paths boş) ve yazılan satır `konu_id` taşır (0033).
 * `kazanim_id` de yazılır — mastery/adaptif bağı kopmasın diye, en yakın kazanımdan türetilir.
 *
 * ⚠️ 0033 MIGRATION'I BASILMADAN KOŞMA: `konu_id` kolonu yoksa yazım hata verir ve üretim boşa
 * gider. Script açılışta kolonu YOKLAR ve yoksa durur.
 *
 * KULLANIM (kredisiz):
 *   KREDISIZ=1 bun src/scripts/havuz-doldur-konu.ts --ders "Türk Dili ve Edebiyatı" --dry
 *   KREDISIZ=1 bun src/scripts/havuz-doldur-konu.ts --ders "Türk Dili ve Edebiyatı" \
 *              --hedef 2 --zorluk orta,zor --tavan 0
 *   [--sinav AYT] [--perCell 2] [--esZaman 2] [--konu "Fabl Türü ve Genel Özellikleri"]
 */
import { createHash } from 'node:crypto'
import { supabase } from '../clients/supabase.js'
import { generateVerifiedSet } from '../lib/generation.js'
import { maliyetTavani, maliyetHarcanan, MaliyetTavaniAsildi } from '../lib/model-router.js'
import { mapLimit } from '../utils/concurrency.js'
import { logger } from '../utils/logger.js'

const argv = process.argv.slice(2)
const arg = (n: string): string | undefined => {
  const i = argv.indexOf(`--${n}`)
  return i >= 0 ? argv[i + 1] : undefined
}
const DERS = arg('ders')
const SINAV = arg('sinav')
const TEK_KONU = arg('konu')
/** Konu başına hedef doğrulanmış soru. Havuz GENİŞ olsun: çok konudan az soru. */
const HEDEF = Number(arg('hedef') ?? 2)
const PER_CELL = Number(arg('perCell') ?? 2)
const ES_ZAMAN = Number(arg('esZaman') ?? 2)
const DRY = argv.includes('--dry')
const ZORLUK = arg('zorluk')?.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
const gecersiz = ZORLUK?.filter((z) => !['kolay', 'orta', 'zor'].includes(z)) ?? []
if (gecersiz.length) {
  console.error(`⛔ --zorluk yalnız kolay|orta|zor olabilir (geçersiz: ${gecersiz.join(', ')})`)
  process.exit(1)
}
if (!DERS) {
  console.error('⛔ --ders zorunlu (ör. --ders "Türk Dili ve Edebiyatı")')
  process.exit(1)
}
const tavanArg = arg('tavan')
const TAVAN = tavanArg ? Number(tavanArg) : Number.POSITIVE_INFINITY
maliyetTavani(TAVAN)
const SYSTEM_USER = '00000000-0000-0000-0000-000000000000'

// ── 0) 0033 KAPISI — kolon yoksa üretime hiç girme ──────────────────────────
{
  const { error } = await supabase.from('yks_ai_questions').select('konu_id').limit(1)
  if (error) {
    console.error(
      `⛔ yks_ai_questions.konu_id okunamadı → 0033_soru_konu_bagi.sql basılmamış olabilir.\n` +
      `   Üretim yapılmadı (yazılamayacak soruyu üretmek kotayı boşa yakardı).\n   Hata: ${error.message}`,
    )
    process.exit(1)
  }
}

type Konu = { id: number; subject: string; ad: string; sinav: string; unite: string | null; sira: number }
type Hucre = { konu: Konu; difficulty: string }

// ── 1) Konular + mevcut doluluk ─────────────────────────────────────────────
let ksorgu = supabase.from('konular').select('id, subject, ad, sinav, unite, sira').eq('subject', DERS)
if (SINAV) ksorgu = ksorgu.eq('sinav', SINAV)
const { data: konularRaw, error: kErr } = await ksorgu.order('sira')
if (kErr || !konularRaw?.length) {
  console.error(`⛔ "${DERS}" için konu bulunamadı:`, kErr?.message ?? '(sözlükte yok)')
  process.exit(1)
}
let konular = konularRaw as Konu[]
if (TEK_KONU) konular = konular.filter((k) => k.ad === TEK_KONU)
if (!konular.length) { console.error(`⛔ "${TEK_KONU}" konusu bulunamadı`); process.exit(1) }

const { data: havuzRaw } = await supabase
  .from('konu_havuz')
  .select('konu_id, soru_sayisi, kolay, orta, zor')
  .eq('subject', DERS)
const havuz = new Map(
  ((havuzRaw ?? []) as Array<{ konu_id: number; soru_sayisi: number; kolay: number; orta: number; zor: number }>)
    .map((h) => [Number(h.konu_id), h]),
)

/** Sipariş edilen kademe(ler) için mevcut sayı — ZORLUK seçiliyse yalnız o kademeler sayılır. */
const mevcutSayi = (konuId: number): number => {
  const h = havuz.get(konuId)
  if (!h) return 0
  if (!ZORLUK?.length) return Number(h.soru_sayisi)
  return ZORLUK.reduce((s, z) => s + Number((h as unknown as Record<string, number>)[z] ?? 0), 0)
}

// ── 2) Hücre planı: en BOŞ konular önce, kademe rotasyonlu ──────────────────
const DIFFS = ZORLUK?.length ? ZORLUK : ['orta', 'kolay', 'zor']
const eksikler = konular
  .map((k) => ({ konu: k, var: mevcutSayi(Number(k.id)) }))
  .filter((x) => x.var < HEDEF)
  .sort((a, b) => a.var - b.var || a.konu.sira - b.konu.sira)

const kuyruk: Hucre[] = []
eksikler.forEach((x, i) => {
  const kalan = HEDEF - x.var
  const kademeSayisi = Math.max(1, Math.ceil(kalan / PER_CELL))
  for (let j = 0; j < kademeSayisi; j++) kuyruk.push({ konu: x.konu, difficulty: DIFFS[(i + j) % DIFFS.length] })
})

console.log(`\n=== KONU-GÜDÜMLÜ HAVUZ DOLDURMA ===`)
console.log(`Ders: ${DERS}${SINAV ? ` · sınav: ${SINAV}` : ''}${TEK_KONU ? ` · konu: ${TEK_KONU}` : ''}`)
console.log(`Konu başına hedef ${HEDEF} soru · hücre ${PER_CELL} · eşzamanlı ${ES_ZAMAN}`)
console.log(`Zorluk: ${DIFFS.join(' → ')}${ZORLUK?.length ? ' (SEÇİLİ — sayım da bunlara indirgendi)' : ' (rotasyon)'}`)
console.log(
  Number.isFinite(TAVAN)
    ? `MALİYET TAVANI: $${TAVAN.toFixed(2)}`
    : `⚠️  TAVANSIZ — büyük koşuda --tavan 0 (kredisiz) ya da --tavan <usd> ver`,
)
console.log(`Sözlükte ${konular.length} konu · ${eksikler.length} konu hedefin altında · kuyruk ${kuyruk.length} hücre\n`)
if (DRY) {
  console.log('EN BOŞ 15 KONU:')
  for (const x of eksikler.slice(0, 15)) {
    console.log(`  ${String(x.var).padStart(2)}/${HEDEF}  ${x.konu.sinav}  ${(x.konu.unite ?? '—').slice(0, 26).padEnd(27)} ${x.konu.ad}`)
  }
  console.log('\n>>> --dry: LLM çağrısı yapılmadı.')
  process.exit(0)
}

// ── 3) Üretim ───────────────────────────────────────────────────────────────
let uretilen = 0
let yazilan = 0
let durTavan = false
const t0 = Date.now()

/**
 * KAZANIM BAĞI — mastery/adaptif kopmasın diye yazılır ama konu bağını BELİRLEMEZ (0033'te
 * konu_id öncelikli). Konuya eşli bir kazanım varsa o; yoksa NULL. Uydurma kazanım yazmaktansa
 * boş bırakmak doğru: yanlış kazanım, mastery'yi yanlış yerden besler (TDE'de tam bu olmuştu).
 */
const kazanimBagi = async (konuId: number): Promise<number | null> => {
  const { data } = await supabase
    .from('kazanim_konu').select('kazanim_id').eq('konu_id', konuId).limit(1).maybeSingle()
  return data ? Number((data as { kazanim_id: number }).kazanim_id) : null
}

await mapLimit(kuyruk, ES_ZAMAN, async (h) => {
  if (durTavan) return null
  const { konu, difficulty } = h
  try {
    const set = await generateVerifiedSet(
      {
        userId: SYSTEM_USER,
        subject: konu.subject,
        paths: [],            // ders-geneli vektör araması — konu adı sorgu dizesinde
        kazanim: konu.ad,     // konu-güdümlüde bu bir KOD değil konu ADIdır (istem "konu" der)
        topic: konu.unite ? `${konu.unite} — ${konu.ad}` : konu.ad,
        difficulty,
        konuId: Number(konu.id),
      },
      PER_CELL,
      'P2',
    )
    uretilen += set.length
    let n = 0
    if (set.length) {
      const kazanimId = await kazanimBagi(Number(konu.id))
      const rows = set.map((q) => ({
        subject: konu.subject,
        kazanim_id: kazanimId,
        konu_id: Number(konu.id),
        question_text: q.soru,
        options: q.siklar,
        correct_option: q.dogru,
        solution: q.cozum,
        difficulty: q.zorluk || difficulty,
        verified: true,
        quality: q.quality,
        content_hash: createHash('md5').update(q.soru).digest('hex'),
      }))
      const { data, error } = await supabase
        .from('yks_ai_questions')
        .upsert(rows, { onConflict: 'content_hash', ignoreDuplicates: true })
        .select('id')
      if (error) logger.warn({ err: error, konuId: konu.id }, 'konu havuzu: upsert hatası')
      n = data?.length ?? 0
      yazilan += n
    }
    const dk = ((Date.now() - t0) / 60000).toFixed(1)
    console.log(
      `[${dk} dk] ${konu.sinav} ${konu.ad.slice(0, 34).padEnd(35)} (${difficulty}) → üretilen ${set.length}, yazılan ${n} · genel ${yazilan} · $${maliyetHarcanan().toFixed(4)}`,
    )
  } catch (err) {
    if (err instanceof MaliyetTavaniAsildi) { durTavan = true; return null }
    console.log(`⚠️  ${konu.ad} (${difficulty}) hücre başarısız: ${err instanceof Error ? err.message.slice(0, 110) : String(err)}`)
  }
  return null
})

console.log(`\n=== BİTTİ (${((Date.now() - t0) / 60000).toFixed(1)} dk) ===`)
console.log(`Üretilen aday: ${uretilen} · Havuza yazılan: ${yazilan} · Harcanan: $${maliyetHarcanan().toFixed(4)}`)
if (durTavan) console.log(`⛔ MALİYET TAVANI AŞILDI — koşu erken durdu`)
process.exit(0)
