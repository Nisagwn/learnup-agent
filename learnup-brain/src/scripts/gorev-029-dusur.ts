/**
 * gorev-029-dusur.ts — GOREV-029: ödev/setlerdeki ÇIKMIŞ KOPYALARIN öğrenci servisinden çıkarılması.
 *
 * NEDEN İKİ MEKANİZMA BİRDEN (ölçüm: bu kartın keşfi, 2026-07-23):
 *   1) BAĞ KOPARMA — `assignments.question_ids` / `targeted_assignments.question_ids` dizilerinden
 *      listedeki çıkmış kopya id'leri çıkarılır. Gerekli, çünkü assignments.routes soruları bu
 *      dizilerden id ile okur ve HİÇBİR bayrağa bakmaz → satırı işaretlemek tek başına yetmez.
 *   2) SERVİS-DIŞI (verified=false) — kopya satırları `questions`'ta işaretlenir. Gerekli, çünkü
 *      practice.routes yedek havuzu `questions`'ı yalnız `verified=true` filtresiyle KATEGORİDEN
 *      okur (bağdan değil) → bağ koparmak tek başına o yüzeyi kapatmaz. (Yan kazanç:
 *      questions.routes few-shot örnekleyicisi de verified=true filtreli — çıkmış artık örneklenmez.)
 *   Tek başına hiçbiri yeterli değil; ikisi birlikte "çıkmış hiçbir kullanıcı yüzüne servis
 *   edilmez" (telif kararı 2026-07-22) hedefini veri katmanında kapatır.
 *
 * İKİ AŞAMALI YAZIM (ORTAK-ANAYASA §7 / V§3.7.2):
 *   AŞAMA 1  --kesfet : SALT-OKUNUR keşif → data/gorev-029-dusurulecek-kopyalar.jsonl yazılır
 *                       (DB'ye tek bayt yazılmaz). Dosya VARSA durur — onaylı liste ezilmez.
 *   AŞAMA 2  (bayraksız): DRY-RUN — yalnız JSONL'deki hedefler için planı yazar, DB DEĞİŞMEZ.
 *            --uygula  : gerçek koşu — YALNIZ JSONL'dekilere dokunur, sonra doğrular.
 *
 * SİLME YOK — kopya satırları `questions`'ta aynen durur (geri alınabilir).
 * PUAN/CEVAP DOKUNULMAZ — assignment_submissions'a ve targeted_assignments'ın
 * answers/score/max_score/auto_score/status/completed_at kolonlarına yazılmaz; script bunu
 * önce/sonra anlık görüntü karşılaştırmasıyla KANITLAR (fark ≠ 0 → exit 1).
 *
 * GERİ DÖNÜŞ YOLU (tamamı JSONL'den, elle veya küçük bir scriptle):
 *   - bağ: her satır (kap, kap_id, question_id, sira) taşır → aynı kabın satırları `sira` artan
 *     sırayla diziye geri eklenirse orijinal question_ids bayt bayt geri gelir.
 *   - işaret: update questions set verified=true where id in (listedeki question_id'ler).
 *
 * IDEMPOTENT: bağ koparma "dizide varsa çıkar" (ikinci koşuda dizi zaten temiz → 0 güncelleme);
 * verified çevirimi `.eq('verified', true)` koşullu (ikinci koşuda 0 satır). Listede olmayan
 * HİÇBİR kaba/satıra dokunulmaz; DB'de source_type≠'osym_cikmis' çıkan listed id → koşu DURUR.
 *
 * KULLANIM (learnup-brain/ içinden):
 *   bun src/scripts/gorev-029-dusur.ts --kesfet   # aşama 1 (salt-okunur; dosya varsa durur)
 *   bun src/scripts/gorev-029-dusur.ts            # aşama 2 dry-run (yazım yok)
 *   bun src/scripts/gorev-029-dusur.ts --uygula   # aşama 2 gerçek koşu + doğrulama
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { supabase } from '../clients/supabase.js'
import { fetchAll, sayimAl } from '../lib/pg.js'

const ARGS = new Set(process.argv.slice(2))
const KESFET = ARGS.has('--kesfet')
const UYGULA = ARGS.has('--uygula')
const LISTE_DOSYA = join(import.meta.dir, '..', '..', 'data', 'gorev-029-dusurulecek-kopyalar.jsonl')
// Tek işlem türü — GOREV-019 emsalindeki güvenlik kilidi: script başka mutasyon TANIMAZ.
const ISLEM = 'bag-kopar+servis-disi'

type KapTuru = 'assignment' | 'targeted'
type ListeSatiri = {
  question_id: string
  kap: KapTuru
  kap_id: string
  kap_baslik: string
  /** Kopyanın question_ids dizisindeki orijinal konumu — geri dönüşün tek dayanağı. */
  sira: number
  kap_soru_sayisi_once: number
  kanit: {
    source_type: string
    verified: boolean
    category: string | null
    /** 0018 köken izi (kopya hangi yks_questions satırından geldi) — kolon/değer yoksa null. */
    kaynak_soru_id: string | null
    exam_year: number | null
    exam_label: string | null
    question_text_ilk80: string
  }
  islem: string
}

function ozet(s: unknown, n = 40): string {
  return String(s ?? '').replace(/\s+/g, ' ').slice(0, n)
}
/** Kap başlığı — assignments'ta `title` var; targeted_assignments'ta YOK (subject·topic'ten kurulur). */
const KAP_SELECT = {
  assignments: 'id, title, question_ids',
  targeted_assignments: 'id, subject, topic, question_ids',
} as const
function kapBaslik(tablo: 'assignments' | 'targeted_assignments', r: Record<string, unknown>): string {
  if (tablo === 'assignments') return String(r.title ?? '')
  return `${r.subject ?? ''}${r.topic ? ` · ${r.topic}` : ''}`.trim()
}
function sha256(v: unknown): string {
  return createHash('sha256').update(JSON.stringify(v ?? null)).digest('hex').slice(0, 16)
}
function dur(mesaj: string): never {
  console.error(`⛔ ${mesaj}`)
  process.exit(1)
}

/** 0018 uygulanmamış ortamda select 42703 ile patlamasın diye kolonu yoklar (kokenIziVarMi deseni). */
async function kokenIziKolonuVarMi(): Promise<boolean> {
  const { error } = await supabase.from('questions').select('kaynak_soru_id').limit(1)
  return !error
}

// ═══════════════════ AŞAMA 1 — KEŞİF (salt-okunur) ═══════════════════
async function kesfet(): Promise<void> {
  if (existsSync(LISTE_DOSYA)) {
    dur(`liste zaten var: ${LISTE_DOSYA}\n   Onaylı liste ezilmez — yeniden üretmek bilinçli bir karar olmalı (önce dosyayı elle kaldır).`)
  }
  console.log('═══ GOREV-029 · AŞAMA 1: KEŞİF (salt-okunur; DB yazımı YOK) ═══\n')

  const [odevler, setler] = await Promise.all([
    fetchAll<Record<string, unknown>>(() =>
      supabase.from('assignments').select(KAP_SELECT.assignments)),
    fetchAll<Record<string, unknown>>(() =>
      supabase.from('targeted_assignments').select(KAP_SELECT.targeted_assignments)),
  ])

  // Kaplardaki TÜM id'lerin birleşimi → hangileri çıkmış kopya?
  const tumIds = new Set<string>()
  for (const k of [...odevler, ...setler]) {
    for (const id of Array.isArray(k.question_ids) ? k.question_ids : []) tumIds.add(String(id))
  }

  const izVar = await kokenIziKolonuVarMi()
  const secim = izVar
    ? 'id, source_type, verified, category, question_text, kaynak_soru_id'
    : 'id, source_type, verified, category, question_text'
  const idListe = [...tumIds]
  const kopyalar: Array<Record<string, unknown>> = []
  for (let i = 0; i < idListe.length; i += 200) { // 200'lük dilim: .in() URL uzunluğu güvenli kalsın
    const dilim = idListe.slice(i, i + 200)
    const { data, error } = await supabase
      .from('questions').select(secim).in('id', dilim).eq('source_type', 'osym_cikmis')
    if (error) dur(`questions okuma hatası: ${error.message}`)
    kopyalar.push(...((data ?? []) as unknown as Array<Record<string, unknown>>))
  }
  const kopyaMap = new Map(kopyalar.map((r) => [String(r.id), r]))

  // Kaynak künyesi (kanıt): köken izi olan kopyaların yks_questions satırı.
  const kokenIds = [...new Set(kopyalar.map((r) => r.kaynak_soru_id).filter(Boolean).map(String))]
  const kunye = new Map<string, { exam_year: number | null; exam_label: string | null }>()
  if (kokenIds.length) {
    const { data, error } = await supabase
      .from('yks_questions').select('id, exam_year, exam_label').in('id', kokenIds)
    if (error) dur(`yks_questions künye okuma hatası: ${error.message}`)
    for (const r of (data ?? []) as Array<{ id: string; exam_year: number | null; exam_label: string | null }>) {
      kunye.set(String(r.id), { exam_year: r.exam_year ?? null, exam_label: r.exam_label ?? null })
    }
  }

  const satirlar: ListeSatiri[] = []
  const kapOzet: string[] = []
  for (const [kap, tablo, kaplar] of [
    ['assignment', 'assignments', odevler],
    ['targeted', 'targeted_assignments', setler],
  ] as const) {
    let cikmisliKap = 0
    for (const k of kaplar) {
      const ids = Array.isArray(k.question_ids) ? k.question_ids.map(String) : []
      const buradakiler = ids
        .map((id, i) => ({ id, i }))
        .filter(({ id }) => kopyaMap.has(id))
      if (!buradakiler.length) continue
      cikmisliKap += 1
      for (const { id, i } of buradakiler) {
        const q = kopyaMap.get(id)!
        const koken = q.kaynak_soru_id ? String(q.kaynak_soru_id) : null
        satirlar.push({
          question_id: id,
          kap,
          kap_id: String(k.id),
          kap_baslik: kapBaslik(tablo, k),
          sira: i,
          kap_soru_sayisi_once: ids.length,
          kanit: {
            source_type: String(q.source_type),
            verified: q.verified === true,
            category: q.category == null ? null : String(q.category),
            kaynak_soru_id: koken,
            exam_year: koken ? (kunye.get(koken)?.exam_year ?? null) : null,
            exam_label: koken ? (kunye.get(koken)?.exam_label ?? null) : null,
            question_text_ilk80: ozet(q.question_text, 80),
          },
          islem: ISLEM,
        })
      }
    }
    kapOzet.push(`${kap === 'assignment' ? 'sınıf ödevi' : 'hedefli set'}: ${cikmisliKap}/${kaplar.length} kapta çıkmış var`)
  }

  // Çapraz kontrol: tablo genelindeki kopya sayısı ↔ kaplara bağlı kopya sayısı.
  const tabloKopya = await sayimAl(
    supabase.from('questions').select('*', { count: 'exact', head: true }).eq('source_type', 'osym_cikmis'))
  const bagliKopya = new Set(satirlar.map((s) => s.question_id)).size

  console.log(`kap tarama        : ${odevler.length} sınıf ödevi + ${setler.length} hedefli set (dizilerdeki toplam ${tumIds.size} benzersiz id)`)
  console.log(`${kapOzet.join('\n')}`)
  console.log(`çıkmış kopya bağı : ${satirlar.length} satır (benzersiz kopya: ${bagliKopya})`)
  console.log(`tablo genelinde   : ${tabloKopya} osym_cikmis kopya → bağsız (hiçbir kapta olmayan): ${tabloKopya - bagliKopya}`)
  console.log(`köken izi (0018)  : kolon ${izVar ? 'VAR' : 'YOK'}; izli kopya: ${kopyalar.filter((r) => r.kaynak_soru_id).length}/${kopyalar.length}`)
  if (tabloKopya - bagliKopya > 0) {
    console.log(`⚠️  bağsız kopyalar assignments uçlarından ERİŞİLEMEZ ama verified=true iseler practice yedeğinden hâlâ servis edilebilirler — RAPOR'a not düş.`)
  }

  writeFileSync(LISTE_DOSYA, satirlar.map((s) => JSON.stringify(s)).join('\n') + '\n', 'utf8')
  console.log(`\n✔ liste yazıldı: ${LISTE_DOSYA} (${satirlar.length} satır)`)
  console.log('Sonraki adım: listeyi gözden geçir → dry-run → --uygula')
}

// ═══════════════════ AŞAMA 2 — DRY-RUN / UYGULA ═══════════════════

type KapDurumu = {
  kap: KapTuru
  kap_id: string
  baslik: string
  mevcut: string[]
  yeni: string[]
  dusen: string[]
}

/** Puan/cevap değişmezliği anlık görüntüsü: satır kimliği → puan+cevap parmak izi. */
async function puanCevapGoruntusu(odevIds: string[], setIds: string[]): Promise<Map<string, string>> {
  const g = new Map<string, string>()
  if (odevIds.length) {
    const subs = await fetchAll<Record<string, unknown>>(() =>
      supabase.from('assignment_submissions')
        .select('id, assignment_id, student_id, status, score, max_score, auto_score, correct_count, answers')
        .in('assignment_id', odevIds))
    for (const s of subs) {
      g.set(`sub:${s.id}`, sha256([s.status, s.score, s.max_score, s.auto_score, s.correct_count, sha256(s.answers)]))
    }
  }
  if (setIds.length) {
    const { data, error } = await supabase.from('targeted_assignments')
      .select('id, status, score, max_score, auto_score, completed_at, answers').in('id', setIds)
    if (error) dur(`targeted_assignments puan görüntüsü okunamadı: ${error.message}`)
    for (const t of (data ?? []) as Array<Record<string, unknown>>) {
      g.set(`ta:${t.id}`, sha256([t.status, t.score, t.max_score, t.auto_score, t.completed_at, sha256(t.answers)]))
    }
  }
  return g
}

function listeyiOku(): ListeSatiri[] {
  if (!existsSync(LISTE_DOSYA)) dur(`liste yok: ${LISTE_DOSYA} — önce --kesfet koş (aşama 1).`)
  const satirlar = readFileSync(LISTE_DOSYA, 'utf8')
    .split('\n').map((s) => s.trim()).filter(Boolean)
    .map((s) => JSON.parse(s) as ListeSatiri)
  if (!satirlar.length) dur('liste boş — düşürülecek bağ yok.')
  const ciftler = new Set<string>()
  for (const s of satirlar) {
    if (s.islem !== ISLEM) dur(`beklenmeyen işlem "${s.islem}" (question_id ${s.question_id}) — script yalnız "${ISLEM}" yapar.`)
    if (s.kap !== 'assignment' && s.kap !== 'targeted') dur(`beklenmeyen kap türü "${s.kap}" (question_id ${s.question_id}).`)
    const anahtar = `${s.kap_id}|${s.question_id}`
    if (ciftler.has(anahtar)) dur(`listede tekrar eden bağ: ${anahtar}`)
    ciftler.add(anahtar)
  }
  return satirlar
}

async function calistir(): Promise<void> {
  console.log(`═══ GOREV-029 · AŞAMA 2: ${UYGULA ? 'GERÇEK KOŞU (--uygula)' : 'DRY-RUN (yazım yok)'} ═══`)
  console.log(`liste: ${LISTE_DOSYA}\n`)

  const satirlar = listeyiOku()
  const qids = [...new Set(satirlar.map((s) => s.question_id))]
  const odevIds = [...new Set(satirlar.filter((s) => s.kap === 'assignment').map((s) => s.kap_id))]
  const setIds = [...new Set(satirlar.filter((s) => s.kap === 'targeted').map((s) => s.kap_id))]
  console.log(`hedef: ${satirlar.length} bağ · ${qids.length} benzersiz kopya · ${odevIds.length} sınıf ödevi + ${setIds.length} hedefli set\n`)

  // GÜVENLİK KİLİDİ: listedeki her id DB'de hâlâ osym_cikmis olmalı. Değilse liste ile DB
  // uyuşmuyor demektir — çıkmış OLMAYAN bir bağı asla kesmeyiz, koşu durur.
  const { data: qRows, error: qErr } = await supabase
    .from('questions').select('id, source_type, verified').in('id', qids)
  if (qErr) dur(`questions okuma hatası: ${qErr.message}`)
  const qMap = new Map((qRows ?? []).map((r) => [String(r.id), r]))
  for (const id of qids) {
    const r = qMap.get(id)
    if (!r) { console.log(`  ⚠️  ${id} → questions'ta YOK (bağ yine de koparılır; işaretlenecek satır yok)`); continue }
    if (r.source_type !== 'osym_cikmis') dur(`listedeki ${id} DB'de source_type='${r.source_type}' — çıkmış değil, koşu durduruldu.`)
  }
  const flipEdilecek = qids.filter((id) => qMap.get(id)?.verified === true)

  // Kapların mevcut durumu + plan.
  const kaplar: KapDurumu[] = []
  for (const [kap, tablo, ids] of [
    ['assignment', 'assignments', odevIds],
    ['targeted', 'targeted_assignments', setIds],
  ] as const) {
    if (!ids.length) continue
    const { data, error } = await supabase.from(tablo).select("*").in('id', ids)
    if (error) dur(`${tablo} okuma hatası: ${error.message}`)
    const bulunan = new Map((data ?? []).map((r) => [String((r as Record<string, unknown>).id), r as Record<string, unknown>]))
    for (const kapId of ids) {
      const r = bulunan.get(kapId)
      if (!r) dur(`listedeki kap ${tablo}/${kapId} DB'de yok — liste bayat, koşu durduruldu.`)
      const mevcut = Array.isArray(r.question_ids) ? r.question_ids.map(String) : []
      const buKaptakiler = new Set(satirlar.filter((s) => s.kap_id === kapId).map((s) => s.question_id))
      const yeni = mevcut.filter((id) => !buKaptakiler.has(id)) // sıra korunur, yalnız listedekiler düşer
      kaplar.push({
        kap, kap_id: kapId, baslik: kapBaslik(tablo, r),
        mevcut, yeni, dusen: mevcut.filter((id) => buKaptakiler.has(id)),
      })
    }
  }

  console.log('kap planı (önce → sonra · düşen):')
  for (const k of kaplar) {
    const durum = k.dusen.length ? `düşen ${k.dusen.length}` : 'zaten temiz (no-op)'
    console.log(`  ${k.kap === 'assignment' ? 'ödev' : 'set '} · ${ozet(k.baslik, 32).padEnd(32)} · ${k.mevcut.length} → ${k.yeni.length} · ${durum}`)
  }
  const degisecekKap = kaplar.filter((k) => k.dusen.length)
  console.log(`\ngüncellenecek kap: ${degisecekKap.length}/${kaplar.length} · verified=true→false yapılacak kopya: ${flipEdilecek.length}/${qids.length}`)

  // SRS tarafı — yalnız DOĞRULAMA (016'da /practice/review çıkmış okumaz; kartlar sessizce atlanır).
  const srsSayisi = await sayimAl(
    supabase.from('srs_cards').select('*', { count: 'exact', head: true }).in('question_id', qids))
  console.log(`SRS doğrulama     : listedeki kopyalara işaret eden srs_cards satırı: ${srsSayisi} (review çıkmış okumaz — dokunulmaz, sessizce atlanır)`)

  // Puan/cevap değişmezliği — ÖNCE görüntüsü (dry-run'da da ölçülür ki taban belli olsun).
  const once = await puanCevapGoruntusu(odevIds, setIds)
  console.log(`puan/cevap tabanı : ${once.size} satır parmak izi alındı (gönderimler + hedefli set sonuçları)`)

  if (!UYGULA) {
    console.log('\nDRY-RUN bitti — DB DEĞİŞMEDİ. Gerçek koşu için: --uygula')
    return
  }

  // ── GERÇEK KOŞU ──
  let guncellenenKap = 0
  for (const k of degisecekKap) {
    const tablo = k.kap === 'assignment' ? 'assignments' : 'targeted_assignments'
    const { error } = await supabase.from(tablo).update({ question_ids: k.yeni }).eq('id', k.kap_id)
    if (error) dur(`${tablo}/${k.kap_id} güncellenemedi: ${error.message}`)
    guncellenenKap += 1
  }
  // İşaretleme idempotent: yalnız hâlâ verified=true olanlar; source_type koşulu ek emniyet.
  const { data: flip, error: fErr } = await supabase
    .from('questions').update({ verified: false })
    .in('id', qids).eq('verified', true).eq('source_type', 'osym_cikmis').select('id')
  if (fErr) dur(`verified çevirimi başarısız: ${fErr.message}`)
  console.log(`\n✔ yazım bitti: ${guncellenenKap} kap güncellendi · ${flip?.length ?? 0} kopya verified=false yapıldı`)

  // ── DOĞRULAMA ──
  console.log('\n── doğrulama ──')
  let hata = 0

  // 1) Servis kanıtı: her kabın dizisi listedekilerden arınmış mı + kalan id'ler arasında çıkmış var mı?
  //    (GET /assignments/:id/questions birebir bu diziden okur — DB'deki bu küme servis edilen kümedir.)
  for (const [kap, tablo, ids] of [
    ['assignment', 'assignments', odevIds],
    ['targeted', 'targeted_assignments', setIds],
  ] as const) {
    if (!ids.length) continue
    const { data, error } = await supabase.from(tablo).select("*").in('id', ids)
    if (error) dur(`${tablo} doğrulama okuması: ${error.message}`)
    for (const r of (data ?? []) as Array<Record<string, unknown>>) {
      const dizi = Array.isArray(r.question_ids) ? r.question_ids.map(String) : []
      const kacak = dizi.filter((id) => qids.includes(id))
      let cikmis = 0
      if (dizi.length) {
        cikmis = await sayimAl(supabase.from('questions')
          .select('*', { count: 'exact', head: true }).in('id', dizi).eq('source_type', 'osym_cikmis'))
      }
      const tamam = kacak.length === 0 && cikmis === 0
      if (!tamam) hata += 1
      console.log(`  ${tamam ? '✔' : '⛔'} ${kap === 'assignment' ? 'ödev' : 'set '} · ${ozet(kapBaslik(tablo, r), 32).padEnd(32)} · servis kümesi ${dizi.length} soru · çıkmış: ${cikmis} · listeden kalan: ${kacak.length}`)
    }
  }

  // 2) İşaret kanıtı: listedeki tüm kopyalar servis-dışı + tablo genelinde servis edilebilir çıkmış kalmadı mı?
  const { data: sonQ } = await supabase.from('questions').select('id, verified').in('id', qids)
  const halaTrue = ((sonQ ?? []) as Array<{ id: string; verified: boolean }>).filter((r) => r.verified === true)
  if (halaTrue.length) { hata += 1; console.log(`  ⛔ ${halaTrue.length} listed kopya hâlâ verified=true`) }
  else console.log(`  ✔ listedeki ${sonQ?.length ?? 0} kopyanın tamamı verified=false (satırlar YERİNDE — silinmedi)`)
  const tabloAcik = await sayimAl(supabase.from('questions')
    .select('*', { count: 'exact', head: true }).eq('source_type', 'osym_cikmis').eq('verified', true))
  console.log(`  ${tabloAcik === 0 ? '✔' : '⚠️ '} tablo genelinde verified=true çıkmış kopya: ${tabloAcik} (0 beklenir; >0 ise bağsız kopya var — RAPOR'a)`)

  // 3) Puan/cevap değişmezliği: SONRA görüntüsü ÖNCE ile bire bir aynı olmalı.
  const sonra = await puanCevapGoruntusu(odevIds, setIds)
  let fark = 0
  for (const [k, v] of once) if (sonra.get(k) !== v) { fark += 1; console.log(`  ⛔ değişen puan/cevap satırı: ${k}`) }
  for (const k of sonra.keys()) if (!once.has(k)) { fark += 1; console.log(`  ⛔ koşu sırasında yeni satır: ${k}`) }
  if (fark === 0) console.log(`  ✔ puan/cevap kayıtları DEĞİŞMEDİ (${once.size} satır karşılaştırıldı, 0 fark)`)
  else hata += 1

  if (hata) dur(`${hata} doğrulama başlığı KIRMIZI — yukarıdaki satırlara bak.`)
  console.log('\n✔ GOREV-029 uygulandı: bağlar koptu, kopyalar servis-dışı, puan/cevap dokunulmadı. (İkinci koşu no-op — idempotent.)')
}

if (KESFET && UYGULA) dur('--kesfet ile --uygula birlikte kullanılamaz (aşamalar ayrı koşulur).')
if (KESFET) await kesfet()
else await calistir()
