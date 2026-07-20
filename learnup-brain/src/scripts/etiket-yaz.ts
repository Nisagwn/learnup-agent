/**
 * etiket-yaz.ts — etiketleri DB'ye yazar. `bun run etiket-yaz` (kuru koşu) · `--evet` (gerçek yazım)
 *
 * NE YAPAR / NE YAPMAZ: yalnız `difficulty` sütununu doldurur (UPDATE). Soru metni, şıklar,
 * doğru cevap, çözüm, kazanım — hiçbirine DOKUNMAZ. Satır eklemez/silmez.
 * İki tabloya yazar: `yks_questions` (öğrenciye servis) ve `yks_exemplars` (üretimde modele
 * giden stil örneği — asıl kaliteyi etkileyen budur), content_hash üzerinden eşleştirerek.
 *
 * TEKRAR KOŞULABİLİR: etiketleme günlerce sürdüğü için her gün yeniden koşulur; biriken yeni
 * etiketler DB'ye işlenir, mevcutlar aynı değere yeniden yazılır (zararsız).
 *
 * ── ETİKET POLİTİKASI (ölçümlerden türetildi, uydurma yok) ──
 * ÖLÇÜLDÜ (530 tarama): etiket aslında KANITLI MEKANİZMA SAYISININ eşiğidir —
 *   0 mekanizma → %92 kolay · 1 mekanizma → %71 orta · 2+ → zor.
 * Oynaklık da buradan: sayı taramalar arasında ±1 kayıyor (132 çiftin %75'i ±1 içinde), yani
 * eşiğin sınırında duran soru doğal olarak sallanır. Politika bunu kabul eder:
 *   · iki tarama da ≥2 mekanizma bulduysa      → 'zor'   (çifte onaylı; ölçülen hayatta kalma %63)
 *   · iki tarama var, biri düştüyse            → ortalama sayıya göre 'kolay'/'orta'
 *   · tek tarama                               → sayıya göre (0→kolay, 1→orta, ≥2→'orta' = onay bekliyor)
 *
 * ⚠️ KARARSIZ SORU NULL BIRAKILMAZ — bilerek. RPC'deki filtre şudur:
 *      (filter_difficulty is null OR e.difficulty is null OR e.difficulty = filter_difficulty)
 *    Yani NULL nötr DEĞİL, JOKER: etiketsiz soru HER zorluk siparişinin havuzuna girer. Kararsız
 *    soruyu NULL bırakmak onu hem "kolay" hem "zor" örneği yapardı. Sınırdaki soru gerçekten
 *    ortadadır → 'orta' yazılır: hem dürüst, hem joker sızıntısı yok.
 */
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { supabase } from '../clients/supabase.js'
import { fetchAll } from '../lib/pg.js'

const EVET = process.argv.includes('--evet')
const DOSYA = fileURLToPath(new URL('../../data/etiketler-cikmis.jsonl', import.meta.url))
if (!existsSync(DOSYA)) { console.error('etiket dosyası yok:', DOSYA); process.exit(1) }

type Mek = { ad: string; kanit: string }
type Satir = { id: string; tarama: 1 | 2; subject: string; exam_label: string | null; turet: string | null; mek: Mek[] }
type Zorluk = 'kolay' | 'orta' | 'zor'

/** Kanıtlı (ad var + kanıt ≥20 krk) benzersiz mekanizma sayısı — generation.hakemZorluguTuret ile aynı ölçüt. */
const mekSay = (s: Satir): number =>
  new Set((s.mek ?? []).filter((m) => m?.ad && String(m.kanit ?? '').trim().length >= 20).map((m) => m.ad)).size

const t1 = new Map<string, Satir>()
const t2 = new Map<string, Satir>()
for (const ham of readFileSync(DOSYA, 'utf8').split('\n')) {
  if (!ham.trim()) continue
  try { const s = JSON.parse(ham) as Satir; (s.tarama === 1 ? t1 : t2).set(s.id, s) } catch { /* yarım satır */ }
}

const nihai = new Map<string, { z: Zorluk; kaynak: string }>()
for (const [id, a] of t1) {
  const b = t2.get(id)
  const m1 = mekSay(a)
  if (b) {
    const m2 = mekSay(b)
    if (m1 >= 2 && m2 >= 2) nihai.set(id, { z: 'zor', kaynak: 'çifte-onaylı' })
    else nihai.set(id, { z: (m1 + m2) / 2 < 0.5 ? 'kolay' : 'orta', kaynak: 'ortalama' })
  } else {
    nihai.set(id, { z: m1 === 0 ? 'kolay' : 'orta', kaynak: m1 >= 2 ? 'onay-bekliyor' : 'tek-tarama' })
  }
}

const say: Record<string, number> = {}
const kaynakSay: Record<string, number> = {}
for (const v of nihai.values()) { say[v.z] = (say[v.z] ?? 0) + 1; kaynakSay[v.kaynak] = (kaynakSay[v.kaynak] ?? 0) + 1 }
console.log(`ETİKET YAZIMI ${EVET ? '(GERÇEK)' : '(KURU KOŞU — yazmaz; yazmak için --evet)'}`)
console.log(`  etiketlenecek soru: ${nihai.size}`)
console.log(`  dağılım: ${Object.entries(say).map(([k, n]) => `${k}=${n}`).join(' ')}`)
console.log(`  kaynak:  ${Object.entries(kaynakSay).map(([k, n]) => `${k}=${n}`).join(' ')}`)

// content_hash eşlemesi — exemplar tarafı id değil hash ile bağlanır
const sorular = await fetchAll<{ id: string; content_hash: string | null }>(() =>
  supabase.from('yks_questions').select('id, content_hash').eq('source_type', 'osym_cikmis').eq('verified', true))
const hashOf = new Map(sorular.map((r) => [r.id, r.content_hash]))
const eksikHash = [...nihai.keys()].filter((id) => !hashOf.get(id)).length
console.log(`  content_hash'i olmayan (exemplar'a yazılamaz): ${eksikHash}`)

if (!EVET) {
  console.log('\nKURU KOŞU BİTTİ — DB\'ye hiçbir şey yazılmadı. Yazmak için: bun run etiket-yaz --evet')
  process.exit(0)
}

// Zorluğa göre öbekle → 3 etiket × parçalar (satır satır UPDATE yerine toplu .in())
const obek: Record<Zorluk, string[]> = { kolay: [], orta: [], zor: [] }
for (const [id, v] of nihai) obek[v.z].push(id)
const PARCA = 100
let qYazilan = 0
for (const z of ['kolay', 'orta', 'zor'] as const) {
  for (let i = 0; i < obek[z].length; i += PARCA) {
    const parca = obek[z].slice(i, i + PARCA)
    const { error, count } = await supabase.from('yks_questions')
      .update({ difficulty: z }, { count: 'exact' }).in('id', parca)
    if (error) throw new Error(`yks_questions ${z}: ${error.message}`)
    qYazilan += count ?? 0
  }
  process.stdout.write(`\r  yks_questions yazıldı: ${qYazilan}`)
}
console.log()

let eYazilan = 0
for (const z of ['kolay', 'orta', 'zor'] as const) {
  const hashler = obek[z].map((id) => hashOf.get(id)).filter((h): h is string => !!h)
  for (let i = 0; i < hashler.length; i += PARCA) {
    const parca = hashler.slice(i, i + PARCA)
    const { error, count } = await supabase.from('yks_exemplars')
      .update({ difficulty: z }, { count: 'exact' }).in('content_hash', parca)
    if (error) throw new Error(`yks_exemplars ${z}: ${error.message}`)
    eYazilan += count ?? 0
  }
  process.stdout.write(`\r  yks_exemplars yazıldı: ${eYazilan}`)
}
console.log()

// Doğrulama — DB'nin gerçek hâli (yazdığımıza değil, okuduğumuza bak)
const dogrula = async (tablo: 'yks_questions' | 'yks_exemplars'): Promise<void> => {
  const rows = await fetchAll<{ difficulty: string | null }>(() => {
    const q = supabase.from(tablo).select('difficulty')
    return tablo === 'yks_questions' ? q.eq('source_type', 'osym_cikmis').eq('verified', true) : q
  })
  const d: Record<string, number> = {}
  for (const r of rows) d[String(r.difficulty)] = (d[String(r.difficulty)] ?? 0) + 1
  console.log(`  ${tablo}: ${Object.entries(d).map(([k, n]) => `${k}=${n}`).join(' ')} (toplam ${rows.length})`)
}
console.log('\n── DB DOĞRULAMA ──')
await dogrula('yks_questions')
await dogrula('yks_exemplars')
console.log('\nNOT: null kalanlar JOKER\'dir (her zorluk havuzuna girer). Etiketleme ilerledikçe')
console.log('bu script yeniden koşulmalı — her gün: bun run etiket-yaz --evet')
