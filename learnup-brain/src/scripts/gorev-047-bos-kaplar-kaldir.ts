/**
 * gorev-047-bos-kaplar-kaldir.ts — GOREV-047: GOREV-046'nın canlı-teyitli 11 BOŞ ödev kabını
 * (6 sınıf ödevi + 5 hedefli set) kaynağından KALDIRMAK. Cerrahi, referans-güvenli, tam yedekli.
 *
 * NEDEN (GOREV-046 + kullanıcı kararı 2026-07-23): GOREV-029 telif temizliği 34 çıkmış kopyayı
 * ödevlerden söktü; 11 kap TÜM sorularını kaybedip 0'a düştü (öğrenci panosunda görünür ama
 * açılınca çözülemez ölü-uç). Kullanıcı "hepsini kaldır" dedi: hepsi 3 gün önce oluşmuş, hepsi
 * Matematik, 6 ödev 0-roster'lı tek öğretmene ait, 5 set tek öğrenciye ait → 0 gerçek içerik kaybı.
 *
 * İKİ AŞAMA (ORTAK-ANAYASA §7 / V§3.7.2 — önce ölç/rapor, mutasyon AYRI + onaylı):
 *   AŞAMA 1  (bayraksız) DRY-RUN : hiçbir şey silmez / hiçbir dosya yazmaz. 046 jsonl'inden 11 id'yi
 *            okur, her id için CANLI satırı çeker, run-zamanı yeniden doğrular + referans kontrol
 *            eder ve tam manifesti (KARAR ∈ silinecek | atlanacak-dolu | atlanacak-referansli |
 *            zaten-yok) basar. DB'ye tek bayt yazılmaz.
 *   AŞAMA 2  --uygula : yalnız 'silinecek' işaretlileri, silmeden ÖNCE tam kopyalarını
 *            data/gorev-047-silinen-kaplar-yedek.jsonl'e YEDEKLEYEREK, doğru tablodan siler
 *            (assignment→assignments, targeted→targeted_assignments). İkinci --uygula NO-OP (0 siler).
 *            ⚠️ --uygula'yı AJAN KOŞMAZ; dry-run manifesti denetlendikten sonra ORKESTRATÖR koşar.
 *
 * GÜVENLİK KATMANLARI:
 *   1) RUN-ZAMANI YENİDEN DOĞRULA: jsonl'e körü körüne güvenme — canlı `question_ids` uzunluğu HÂLÂ
 *      0 mı? Doluysa → 'atlanacak-dolu', SİLME. Satır yoksa → 'zaten-yok', atla (idempotent).
 *   2) REFERANS GÜVENLİĞİ (öksüz kayıt / kırılma önleme):
 *      · assignment → sınıf ödevi gönderimleri `assignment_submissions`'a yazılır
 *        (assignments.routes.ts submit ucu). Bu assignment_id'ye işaret eden HERHANGİ bir gönderim
 *        satırı varsa → 'atlanacak-referansli', SİLME.
 *      · targeted → hedefli set gönderimi satırın KENDİ alanlarına yazılır (status='completed',
 *        completed_at, score, answers). Tamamlanmışlık göstergesi (status != 'pending' VEYA
 *        completed_at/score dolu VEYA answers var) varsa → 'atlanacak-referansli', SİLME.
 *   3) YEDEK (yalnız --uygula): silinen her satırın TAM kopyası (`select('*')`) silmeden ÖNCE
 *      yedek jsonl'e APPEND edilir (geri-yükleme kaydı = denetim izi; ikinci koşuda eski yedek EZİLMEZ).
 *   4) CERRAHİ: yalnız bu 11 id, yalnız doğru tablo. Silme `.delete().eq('id', id)` tek tek —
 *      asla filtresiz/geniş delete.
 *   5) İDEMPOTENT: ikinci --uygula 0 siler, hata vermez (satırlar zaten yok → 'zaten-yok').
 *
 * DENETİM (M11) — HANGİ YOL: `yonetim_denetim` (0020) tablosuna sistem-kaydı EKLENMEZ. O tablo
 * ADMIN eylem defteridir: `admin_id NOT NULL`, `eylem` ∈ {ogretmen_onay|rol_degis|sinif_ata|
 * gorev_yeniden}, `hedef_tur` ∈ {kullanici|gorev}. Bir bakım/sistem silmesinin admin_id'si yoktur
 * ve hedefi (ödev kabı) ne kullanıcı ne görevdir → uygun bir eylem/hedef_tur yok. Sahte admin_id
 * uydurmak append-only admin defterini kirletir (null ≠ uydur — V§3-anayasa). Bu yüzden denetim izi
 * = YEDEK jsonl (tam satır kopyası + silinme zamanı, geri-yükleme kaydı) + konsol logu.
 *
 * $0 — LLM/paralı çağrı YOK. Migration YOK (şema değişmez; yalnız 11 veri satırı silinir).
 *
 * KOŞUM (learnup-brain/ içinden):
 *   bun src/scripts/gorev-047-bos-kaplar-kaldir.ts            # DRY-RUN (yazım yok)
 *   bun src/scripts/gorev-047-bos-kaplar-kaldir.ts --uygula   # YALNIZ ORKESTRATÖR — gerçek silme
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { supabase } from '../clients/supabase.js'
import { fetchAll } from '../lib/pg.js' // assignment_submissions okuması sınırsız küme → M6 1000-tuzağı

const UYGULA = process.argv.includes('--uygula')
const HERE = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(HERE, '..', '..', 'data')
const GIRDI = join(DATA_DIR, 'gorev-046-bos-kaplar.jsonl')
const YEDEK = join(DATA_DIR, 'gorev-047-silinen-kaplar-yedek.jsonl')

type KapTuru = 'assignment' | 'targeted'
type Karar = 'silinecek' | 'atlanacak-dolu' | 'atlanacak-referansli' | 'zaten-yok'

/** 046 çıktı satırının bu kartta kullanılan alanları (girdi = kesin id listesi). */
type Girdi046 = {
  durum: 'bos'
  tur: KapTuru
  kap_id: string
  baslik: string | null
  sahip: string | null
  sahip_turu: 'teacher_id' | 'student_id'
  soru_sayisi_simdi: number
}

type ManifestSatiri = {
  tur: KapTuru
  kap_id: string
  baslik: string | null
  sahip: string | null
  canliSoruSayisi: number | null // null = satır yok
  referansDurumu: string
  karar: Karar
}

function dur(mesaj: string): never {
  console.error(`⛔ ${mesaj}`)
  process.exit(1)
}
function kisa(s: unknown): string {
  return String(s ?? '').slice(0, 8)
}
function ozet(s: unknown, n = 26): string {
  return String(s ?? '—').replace(/\s+/g, ' ').slice(0, n)
}
/** question_ids dizisinin uzunluğu (046 `sayiKap` emsali; dizi değilse 0). */
function sayiKap(v: unknown): number {
  return Array.isArray(v) ? v.length : 0
}

// ═══════════════════ GİRDİ: 046 jsonl (11 id) ═══════════════════
function oku046(): Girdi046[] {
  if (!existsSync(GIRDI)) dur(`girdi yok: ${GIRDI} — GOREV-046 çıktısı gerekli.`)
  const satirlar = readFileSync(GIRDI, 'utf8')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => JSON.parse(s) as Girdi046)
  if (!satirlar.length) dur('046 girdisi boş — kaldırılacak kap yok.')
  // Güvenlik kilidi: yalnız bilinen iki tür + benzersiz id; başka mutasyon TANIMA.
  const gorulen = new Set<string>()
  for (const s of satirlar) {
    if (s.tur !== 'assignment' && s.tur !== 'targeted') dur(`beklenmeyen kap türü "${s.tur}" (${s.kap_id}).`)
    if (!s.kap_id) dur('girdi satırında kap_id yok.')
    const anahtar = `${s.tur}|${s.kap_id}`
    if (gorulen.has(anahtar)) dur(`girdide tekrar eden kap: ${anahtar}`)
    gorulen.add(anahtar)
  }
  return satirlar
}

// ═══════════════════ CANLI OKUMA ═══════════════════
async function canliOku(
  tablo: 'assignments' | 'targeted_assignments',
  ids: string[],
  secim: string,
): Promise<Map<string, Record<string, unknown>>> {
  if (!ids.length) return new Map()
  const { data, error } = await supabase.from(tablo).select(secim).in('id', ids)
  if (error) dur(`${tablo} okuma hatası: ${error.message}`)
  const satirlar = (data ?? []) as unknown as Array<Record<string, unknown>>
  return new Map(satirlar.map((r) => [String(r.id), r]))
}

/** Sınıf ödevi gönderimleri: assignment_id → gönderim adedi (>0 ise kap referanslı). */
async function odevGonderimSayisi(odevIds: string[]): Promise<Map<string, number>> {
  const say = new Map<string, number>()
  if (!odevIds.length) return say
  const subs = await fetchAll<Record<string, unknown>>(() =>
    supabase.from('assignment_submissions').select('id, assignment_id').in('assignment_id', odevIds),
  )
  for (const s of subs) {
    const aid = String(s.assignment_id)
    say.set(aid, (say.get(aid) ?? 0) + 1)
  }
  return say
}

/**
 * Hedefli set satırının kendisinde tamamlanmışlık/gönderim izi var mı? (submit route satırın KENDİ
 * alanlarına yazar: status='completed', completed_at, score, auto_score, answers — hepsi TEK update'te).
 *
 * ⚠️ max_score DIŞARIDA: ÖLÇÜLDÜ (2026-07-23, bu 5 satır) → max_score satır OLUŞTURULURKEN dolduruluyor
 * (değerleri 6/4/3/3/3 = 046 `soru_sayisi_once` ile bire bir), gönderimde değil. Bu yüzden max_score
 * bir tamamlanmışlık göstergesi DEĞİL; kontrole katmak hiç gönderilmemiş boş seti yanlışlıkla
 * "referanslı" işaretler (false-positive koruma). Gerçek gönderim izleri: status/completed_at/
 * score/auto_score/answers — hepsi bu 5 satırda boş (status=pending, geri kalanı null/[]).
 */
function setReferansli(r: Record<string, unknown>): { referansli: boolean; durum: string } {
  const status = String(r.status ?? 'pending')
  const answersLen = Array.isArray(r.answers) ? r.answers.length : 0
  const bitisVar = r.completed_at != null
  // score=0 gerçek bir gönderimdir (0 != null → true), boş kapla karışmaz. max_score KASITLI hariç.
  const puanVar = r.score != null || r.auto_score != null
  const referansli = status !== 'pending' || bitisVar || puanVar || answersLen > 0
  const durum = `status=${status}·bitis=${bitisVar ? 'var' : 'yok'}·score=${r.score ?? 'yok'}·auto=${r.auto_score ?? 'yok'}·cevap=${answersLen}`
  return { referansli, durum }
}

// ═══════════════════ KARAR MOTORU (dry-run + --uygula ORTAK) ═══════════════════
async function kararlariHesapla(girdiler: Girdi046[]): Promise<ManifestSatiri[]> {
  const odevIds = girdiler.filter((g) => g.tur === 'assignment').map((g) => g.kap_id)
  const setIds = girdiler.filter((g) => g.tur === 'targeted').map((g) => g.kap_id)

  const odevCanli = await canliOku(
    'assignments',
    odevIds,
    'id, title, subject, topic, teacher_id, question_ids, created_at',
  )
  const setCanli = await canliOku(
    'targeted_assignments',
    setIds,
    'id, subject, topic, student_id, teacher_id, question_ids, created_at, status, score, max_score, auto_score, completed_at, answers',
  )
  const odevGonderim = await odevGonderimSayisi(odevIds)

  const manifest: ManifestSatiri[] = []
  for (const g of girdiler) {
    const canli = g.tur === 'assignment' ? odevCanli.get(g.kap_id) : setCanli.get(g.kap_id)

    // KATMAN 1a — satır yok → idempotent atla
    if (!canli) {
      manifest.push({ tur: g.tur, kap_id: g.kap_id, baslik: g.baslik, sahip: g.sahip, canliSoruSayisi: null, referansDurumu: '—', karar: 'zaten-yok' })
      continue
    }

    const canliSoru = sayiKap(canli.question_ids)
    const sahip = g.tur === 'assignment'
      ? (canli.teacher_id == null ? g.sahip : String(canli.teacher_id))
      : (canli.student_id == null ? g.sahip : String(canli.student_id))

    // KATMAN 1b — canlıda ARTIK DOLU → SİLME
    if (canliSoru > 0) {
      manifest.push({ tur: g.tur, kap_id: g.kap_id, baslik: g.baslik, sahip, canliSoruSayisi: canliSoru, referansDurumu: '—', karar: 'atlanacak-dolu' })
      continue
    }

    // KATMAN 2 — REFERANS GÜVENLİĞİ
    let referansli: boolean
    let referansDurumu: string
    if (g.tur === 'assignment') {
      const n = odevGonderim.get(g.kap_id) ?? 0
      referansli = n > 0
      referansDurumu = `gonderim=${n}`
    } else {
      const r = setReferansli(canli)
      referansli = r.referansli
      referansDurumu = r.durum
    }

    manifest.push({
      tur: g.tur,
      kap_id: g.kap_id,
      baslik: g.baslik,
      sahip,
      canliSoruSayisi: canliSoru,
      referansDurumu,
      karar: referansli ? 'atlanacak-referansli' : 'silinecek',
    })
  }

  // Deterministik sıra (idempotency): tür (assignment<targeted) sonra kap_id.
  manifest.sort((x, y) => (x.tur === y.tur ? x.kap_id.localeCompare(y.kap_id) : x.tur < y.tur ? -1 : 1))
  return manifest
}

// ═══════════════════ MANİFEST BASIMI ═══════════════════
function manifestBas(manifest: ManifestSatiri[]): void {
  console.log(`\n  tür    kap_id    başlık                      sahip     canlı#  referans                                        KARAR`)
  for (const m of manifest) {
    console.log(
      `  ${(m.tur === 'assignment' ? 'ödev' : 'set').padEnd(6)} ${kisa(m.kap_id)}  ${ozet(m.baslik).padEnd(26)} ${kisa(m.sahip).padEnd(9)} ${String(m.canliSoruSayisi ?? 'yok').padEnd(6)} ${m.referansDurumu.padEnd(47)} ${m.karar}`,
    )
  }
  const say = (k: Karar) => manifest.filter((m) => m.karar === k).length
  console.log(
    `\n  ── KARAR ÖZETİ ──  silinecek: ${say('silinecek')} · atlanacak-dolu: ${say('atlanacak-dolu')} · atlanacak-referansli: ${say('atlanacak-referansli')} · zaten-yok: ${say('zaten-yok')} · toplam: ${manifest.length}`,
  )
}

// ═══════════════════ --uygula: YEDEK + CERRAHİ SİLME ═══════════════════
async function uygula(manifest: ManifestSatiri[]): Promise<void> {
  const silinecek = manifest.filter((m) => m.karar === 'silinecek')
  const odevIds = silinecek.filter((m) => m.tur === 'assignment').map((m) => m.kap_id)
  const setIds = silinecek.filter((m) => m.tur === 'targeted').map((m) => m.kap_id)

  console.log(`\n═══ UYGULA — silinecek: ${silinecek.length} (${odevIds.length} ödev + ${setIds.length} set) ═══`)
  if (!silinecek.length) {
    console.log('Silinecek kap yok — NO-OP (idempotent). Yedek yazılmadı, DB değişmedi.')
    return
  }

  // 1) TAM KOPYA YEDEĞİ (silmeden ÖNCE; append — eski yedek EZİLMEZ) ─────────────
  const zaman = new Date().toISOString()
  const yedekSatirlari: string[] = []
  if (odevIds.length) {
    const { data, error } = await supabase.from('assignments').select('*').in('id', odevIds)
    if (error) dur(`yedek için assignments okunamadı: ${error.message}`)
    for (const r of (data ?? []) as Array<Record<string, unknown>>) {
      yedekSatirlari.push(JSON.stringify({ _gorev: 'GOREV-047', _tablo: 'assignments', _silinme_zamani: zaman, satir: r }))
    }
  }
  if (setIds.length) {
    const { data, error } = await supabase.from('targeted_assignments').select('*').in('id', setIds)
    if (error) dur(`yedek için targeted_assignments okunamadı: ${error.message}`)
    for (const r of (data ?? []) as Array<Record<string, unknown>>) {
      yedekSatirlari.push(JSON.stringify({ _gorev: 'GOREV-047', _tablo: 'targeted_assignments', _silinme_zamani: zaman, satir: r }))
    }
  }
  if (yedekSatirlari.length !== silinecek.length) {
    dur(`yedek satır sayısı (${yedekSatirlari.length}) silinecek sayısıyla (${silinecek.length}) uyuşmuyor — canlı satır kayboldu, SİLME DURDU.`)
  }
  mkdirSync(DATA_DIR, { recursive: true })
  appendFileSync(YEDEK, yedekSatirlari.join('\n') + '\n', 'utf8')
  console.log(`yedek yazıldı (append): ${YEDEK} (+${yedekSatirlari.length} satır)`)

  // 2) CERRAHİ SİLME — tek tek, yalnız doğrulanmış id, yalnız doğru tablo ──────────
  let silinen = 0
  for (const id of odevIds) {
    const { error } = await supabase.from('assignments').delete().eq('id', id)
    if (error) {
      console.error(`  silme HATASI assignments/${id}: ${error.message}`)
      continue
    }
    silinen++
    console.log(`  silindi assignments/${kisa(id)}`)
  }
  for (const id of setIds) {
    const { error } = await supabase.from('targeted_assignments').delete().eq('id', id)
    if (error) {
      console.error(`  silme HATASI targeted_assignments/${id}: ${error.message}`)
      continue
    }
    silinen++
    console.log(`  silindi targeted_assignments/${kisa(id)}`)
  }
  console.log(`\nUYGULANDI: ${silinen}/${silinecek.length} kap silindi. İkinci --uygula NO-OP olmalı (0 siler).`)
}

// ═══════════════════ MAIN ═══════════════════
async function main(): Promise<void> {
  console.log(`═══ GOREV-047 · BOŞ ÖDEV KAPLARINI KALDIR ${UYGULA ? '(UYGULA — gerçek silme)' : '(DRY-RUN — yazım YOK)'} ═══`)
  const girdiler = oku046()
  console.log(`girdi: ${GIRDI} → ${girdiler.length} kap (${girdiler.filter((g) => g.tur === 'assignment').length} ödev + ${girdiler.filter((g) => g.tur === 'targeted').length} set)`)

  const manifest = await kararlariHesapla(girdiler)
  manifestBas(manifest)

  if (!UYGULA) {
    console.log('\nDRY-RUN — DB YAZILMADI, yedek YAZILMADI. Manifesti denetle; silmek için (YALNIZ ORKESTRATÖR): --uygula')
    return
  }
  await uygula(manifest)
}

await main()
// Açık redis/postgres handle'ları event loop'u ayakta tutar — tek-atışlık script temiz çıksın.
process.exit(0)
