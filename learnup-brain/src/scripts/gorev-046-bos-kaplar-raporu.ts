/**
 * gorev-046-bos-kaplar-raporu.ts — GOREV-046: GOREV-029 telif temizliğinin **0 soruya düşürdüğü**
 * ödev kaplarını (sınıf ödevleri + hedefli setler) SALT-OKUNUR bir raporla ortaya çıkarır.
 *
 * NEDEN (kök neden — GOREV-029): 029, çıkmış-kaynaklı 34 soruyu ödevlerden söktü
 * (`bag-kopar+servis-disi`: `question_ids` çözüldü + `verified=false`, satır SİLİNMEDİ). Bir kap
 * TÜM sorularını kaybettiyse 0'a düşer → öğrencinin panosunda durur ama açılınca çözülemez
 * (GOREV-044 UI ölü-ucu görsel dalgaya ertelendi). Bu script sorunu KAYNAĞINDA/VERİDE aydınlatır.
 *
 * SALT-OKUNUR (ORTAK-ANAYASA §7 / V§3.7.2 — önce ölç/raporla, mutasyon AYRI kart):
 *   - Yalnız `select`. Hiçbir update/delete/insert/upsert/RPC-yazım YOK. Boş kap doldurulmaz/silinmez.
 *   - Tek yan etki: `data/gorev-046-bos-kaplar.jsonl` (izlenmez) + konsol özeti. DB'ye tek bayt yazılmaz.
 *   - IDEMPOTENT: girdi + canlı DB aynıysa iki koşu bayt-bayt aynı jsonl'i üretir (deterministik sıra).
 *
 * YÖNTEM:
 *   1) 029 kanıt izinden (`data/gorev-029-dusurulecek-kopyalar.jsonl`, 34 satır) kap başına DÜŞEN
 *      soru sayısını topla. Düşen == `kap_soru_sayisi_once` olan kap = ADAY boş kap (tüm soruları
 *      029'da söküldü). Düşen < once → kısmen boşaldı, kapsam DIŞI.
 *   2) CANLI DOĞRULA (jsonl'e körü körüne güvenme — sonradan elle doldurulmuş olabilir): aday
 *      kap_id'leri `assignments` / `targeted_assignments`'tan oku, `question_ids` uzunluğu GERÇEKTEN
 *      0 mı? Yalnız canlıda hâlâ boş olanlar 'bos'; canlıda dolmuş olanlar 'artik-dolu' (ayrı bölüm);
 *      canlıda hiç yok olanlar 'kayip' (ayrı bölüm) — dürüstlük, üçü de raporlanır.
 *   3) Her BOŞ kap için üret: tür · kap_id · başlık · sahip · class_code · created_at ·
 *      soru_sayisi_once (029) · soru_sayisi_simdi (canlı=0) · etkilenen_ogrenci_sayisi · oneri.
 *
 * ETKİLENEN ÖĞRENCİ (null ≠ 0 — V§3-anayasa):
 *   - targeted: student_id NOT NULL → tam olarak 1 öğrenci.
 *   - assignment: sınıf geneli, öğrenci kolonu YOK → roster `lib/yetki.ts:sinifOgrencileri`
 *     (KANONİK: role='student' AND teacher_id eşleşir VEYA teacher_ids içerir; `fetchAll` — M6).
 *     teacher_id yoksa roster türetilemez → `null` (ölçülemedi; 0'A ÇEVRİLMEZ).
 *
 * ONERİ (yalnız ETİKET — bu kart karar VERMEZ, veri SUNAR; hiçbir eylem tetiklemez):
 *   - etkilenen > 0  → 'doldur-icerik-hatti' (gerçek öğrenci bloke; içerik hattı ayrı kart)
 *   - etkilenen == 0 → 'kaldir' (boş kap, kimse etkilenmiyor)
 *   - etkilenen null → 'incele' (ölçülemedi; elle bak)
 *
 * KOŞUM (learnup-brain/ içinden — bayrak yok, her zaman salt-okunur):
 *   bun src/scripts/gorev-046-bos-kaplar-raporu.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { supabase } from '../clients/supabase.js'
import { sinifOgrencileri } from '../lib/yetki.js' // KANONİK roster (içinde fetchAll — M6 1000 tuzağı)

const HERE = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(HERE, '..', '..', 'data')
const GIRDI = join(DATA_DIR, 'gorev-029-dusurulecek-kopyalar.jsonl')
const CIKTI = join(DATA_DIR, 'gorev-046-bos-kaplar.jsonl')

type KapTuru = 'assignment' | 'targeted'

/** 029 kanıt satırının bu kartta kullanılan alanları (kanit/islem burada gereksiz). */
type Kaynak029 = {
  question_id: string
  kap: KapTuru
  kap_id: string
  kap_baslik: string
  kap_soru_sayisi_once: number
}

type Oneri = 'doldur-icerik-hatti' | 'kaldir' | 'incele'

/** Çıktı: kap başına bir satır — YALNIZ canlıda hâlâ boş olan kaplar. */
type BosKap = {
  durum: 'bos'
  tur: KapTuru
  kap_id: string
  baslik: string | null
  /** assignment → teacher_id, targeted → student_id (kartın "sahip" alanı). */
  sahip: string | null
  sahip_turu: 'teacher_id' | 'student_id'
  class_code: string | null
  created_at: string | null
  soru_sayisi_once: number
  /** Canlı ölçüm — boş kapta 0 (ölçüldü, uydurulmadı). */
  soru_sayisi_simdi: number
  /** targeted=1; assignment=roster adedi; teacher_id yoksa null (null ≠ 0). */
  etkilenen_ogrenci_sayisi: number | null
  oneri: Oneri
}

function dur(mesaj: string): never {
  console.error(`⛔ ${mesaj}`)
  process.exit(1)
}
function ozet(s: unknown, n = 32): string {
  return String(s ?? '').replace(/\s+/g, ' ').slice(0, n)
}
function sayiKap(v: unknown): number {
  return Array.isArray(v) ? v.length : 0
}

function oku029(): Kaynak029[] {
  if (!existsSync(GIRDI)) dur(`girdi yok: ${GIRDI} — GOREV-029 keşif çıktısı gerekli.`)
  const satirlar = readFileSync(GIRDI, 'utf8')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => JSON.parse(s) as Kaynak029)
  if (!satirlar.length) dur('029 girdisi boş.')
  return satirlar
}

// ═══════════════════ 1) ADAY BOŞ KAPLARI 029'DAN ÇIKAR ═══════════════════
type Aday = {
  kap: KapTuru
  kap_id: string
  kap_baslik_029: string
  dusen: number
  once: number
}

function adaylariCikar(satirlar: Kaynak029[]): { adaylar: Aday[]; kismen: Aday[] } {
  const grup = new Map<string, Aday>()
  for (const s of satirlar) {
    const anahtar = `${s.kap}|${s.kap_id}`
    const mevcut = grup.get(anahtar)
    if (!mevcut) {
      grup.set(anahtar, {
        kap: s.kap,
        kap_id: s.kap_id,
        kap_baslik_029: s.kap_baslik,
        dusen: 1,
        once: s.kap_soru_sayisi_once,
      })
    } else {
      mevcut.dusen += 1
      // kap_soru_sayisi_once kap başına sabit olmalı — değilse girdi tutarsız, dur.
      if (mevcut.once !== s.kap_soru_sayisi_once) {
        dur(`029 girdisi tutarsız: ${anahtar} için kap_soru_sayisi_once ${mevcut.once} ≠ ${s.kap_soru_sayisi_once}`)
      }
    }
  }
  const hepsi = [...grup.values()]
  // Düşen > once mantıksal olarak imkânsız (kaptaki kopya sayısı kapın soru sayısını aşamaz).
  for (const a of hepsi) {
    if (a.dusen > a.once) dur(`veri anomalisi: ${a.kap}/${a.kap_id} düşen ${a.dusen} > once ${a.once}`)
  }
  return {
    adaylar: hepsi.filter((a) => a.dusen === a.once), // tüm soruları söküldü
    kismen: hepsi.filter((a) => a.dusen < a.once), // kısmen boşaldı — kapsam dışı
  }
}

// ═══════════════════ 2) CANLI DOĞRULAMA ═══════════════════
async function kolonVarMi(tablo: 'assignments' | 'targeted_assignments', kolon: string): Promise<boolean> {
  const { error } = await supabase.from(tablo).select(kolon).limit(1)
  return !error
}

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

function assignmentBaslik(r: Record<string, unknown>): string | null {
  const title = r.title == null ? '' : String(r.title).trim()
  if (title) return title
  const sub = `${r.subject ?? ''}${r.topic ? ` · ${r.topic}` : ''}`.trim()
  return sub || null
}
/** targeted_assignments'ta `title` kolonu YOK — başlık subject(·topic)'ten kurulur (029 emsali). */
function targetedBaslik(r: Record<string, unknown>): string | null {
  const sub = `${r.subject ?? ''}${r.topic ? ` · ${r.topic}` : ''}`.trim()
  return sub || null
}
function dersAdi(r: Record<string, unknown> | undefined, fallback: string): string {
  const s = r?.subject == null ? '' : String(r.subject).trim()
  return s || fallback || 'bilinmiyor'
}

function oneriEtiketi(etkilenen: number | null): Oneri {
  if (etkilenen === null) return 'incele'
  return etkilenen > 0 ? 'doldur-icerik-hatti' : 'kaldir'
}

async function main(): Promise<void> {
  console.log('═══ GOREV-046 · BOŞ ÖDEV KAPLARI RAPORU (SALT-OKUNUR; DB yazımı YOK) ═══\n')

  const satirlar = oku029()
  const { adaylar, kismen } = adaylariCikar(satirlar)
  const odevAdayIds = adaylar.filter((a) => a.kap === 'assignment').map((a) => a.kap_id)
  const setAdayIds = adaylar.filter((a) => a.kap === 'targeted').map((a) => a.kap_id)

  console.log(`029 kanıt izi     : ${satirlar.length} satır → ${adaylar.length} aday boş kap (${odevAdayIds.length} sınıf ödevi + ${setAdayIds.length} hedefli set)`)
  if (kismen.length) {
    console.log(`kısmen boşalan    : ${kismen.length} kap (düşen < once) — KAPSAM DIŞI (hâlâ soru var):`)
    for (const k of kismen) console.log(`  · ${k.kap} ${k.kap_id.slice(0, 8)} düşen ${k.dusen}/${k.once}`)
  }

  // assignments'ta class_code kolonu VAR MI? (029/018 emsalindeki kolon-yoklama; "class_code varsa".)
  const odevClassCodeVar = odevAdayIds.length ? await kolonVarMi('assignments', 'class_code') : false

  const odevSecim = ['id, title, subject, topic, teacher_id, question_ids, created_at', odevClassCodeVar ? ', class_code' : ''].join('')
  const setSecim = 'id, subject, topic, student_id, teacher_id, question_ids, created_at, status'
  const odevCanli = await canliOku('assignments', odevAdayIds, odevSecim)
  const setCanli = await canliOku('targeted_assignments', setAdayIds, setSecim)

  // assignments class_code'u kolon yoksa sahip öğretmenin profiles.class_code'undan türet
  // (kartın Bağlamı: "etkilenen öğrenciler o öğretmenin/sınıf kodunun roster'ından türetilir" →
  // sınıf kodu = ödevi servis eden öğretmenin kendi kodu). Tek toplu okuma.
  const ogretmenIds = [...new Set([...odevCanli.values()].map((r) => (r.teacher_id == null ? null : String(r.teacher_id))).filter(Boolean) as string[])]
  const ogretmenClassCode = new Map<string, string | null>()
  if (!odevClassCodeVar && ogretmenIds.length) {
    const { data, error } = await supabase.from('profiles').select('id, class_code').in('id', ogretmenIds)
    if (error) dur(`profiles class_code okuma hatası: ${error.message}`)
    for (const p of (data ?? []) as Array<{ id: string; class_code: string | null }>) {
      ogretmenClassCode.set(String(p.id), p.class_code ?? null)
    }
  }

  const bosKaplar: BosKap[] = []
  const artikDolu: Array<{ tur: KapTuru; kap_id: string; baslik: string | null; once: number; simdi: number }> = []
  const kayip: Array<{ tur: KapTuru; kap_id: string; once: number }> = []

  // ── Sınıf ödevleri ──
  for (const a of adaylar.filter((x) => x.kap === 'assignment')) {
    const r = odevCanli.get(a.kap_id)
    if (!r) {
      kayip.push({ tur: 'assignment', kap_id: a.kap_id, once: a.once })
      continue
    }
    const simdi = sayiKap(r.question_ids)
    const baslik = assignmentBaslik(r)
    if (simdi > 0) {
      artikDolu.push({ tur: 'assignment', kap_id: a.kap_id, baslik, once: a.once, simdi })
      continue
    }
    const teacherId = r.teacher_id == null ? null : String(r.teacher_id)
    const etkilenen = teacherId ? (await sinifOgrencileri(teacherId)).length : null
    const classCode = odevClassCodeVar
      ? (r.class_code == null ? null : String(r.class_code))
      : (teacherId ? (ogretmenClassCode.get(teacherId) ?? null) : null)
    bosKaplar.push({
      durum: 'bos',
      tur: 'assignment',
      kap_id: a.kap_id,
      baslik,
      sahip: teacherId,
      sahip_turu: 'teacher_id',
      class_code: classCode,
      created_at: r.created_at == null ? null : String(r.created_at),
      soru_sayisi_once: a.once,
      soru_sayisi_simdi: simdi,
      etkilenen_ogrenci_sayisi: etkilenen,
      oneri: oneriEtiketi(etkilenen),
    })
  }

  // ── Hedefli setler ──
  for (const a of adaylar.filter((x) => x.kap === 'targeted')) {
    const r = setCanli.get(a.kap_id)
    if (!r) {
      kayip.push({ tur: 'targeted', kap_id: a.kap_id, once: a.once })
      continue
    }
    const simdi = sayiKap(r.question_ids)
    const baslik = targetedBaslik(r)
    if (simdi > 0) {
      artikDolu.push({ tur: 'targeted', kap_id: a.kap_id, baslik, once: a.once, simdi })
      continue
    }
    const studentId = r.student_id == null ? null : String(r.student_id)
    // targeted student_id NOT NULL → tam 1 öğrenci; boş kalması beklenmeyen bir satırsa null.
    const etkilenen = studentId ? 1 : null
    bosKaplar.push({
      durum: 'bos',
      tur: 'targeted',
      kap_id: a.kap_id,
      baslik,
      sahip: studentId,
      sahip_turu: 'student_id',
      class_code: null, // hedefli set öğrenciye özel — sınıf kodu boyutu yok
      created_at: r.created_at == null ? null : String(r.created_at),
      soru_sayisi_once: a.once,
      soru_sayisi_simdi: simdi,
      etkilenen_ogrenci_sayisi: etkilenen,
      oneri: oneriEtiketi(etkilenen),
    })
  }

  // Deterministik sıra (idempotency): tür (assignment<targeted) sonra kap_id.
  bosKaplar.sort((x, y) => (x.tur === y.tur ? x.kap_id.localeCompare(y.kap_id) : x.tur < y.tur ? -1 : 1))

  // ── jsonl yaz (kap başına 1 satır) ──
  mkdirSync(DATA_DIR, { recursive: true })
  writeFileSync(CIKTI, bosKaplar.map((k) => JSON.stringify(k)).join('\n') + (bosKaplar.length ? '\n' : ''), 'utf8')

  // ═══════════════════ 3) KONSOL ÖZETİ ═══════════════════
  const odevBos = bosKaplar.filter((k) => k.tur === 'assignment')
  const setBos = bosKaplar.filter((k) => k.tur === 'targeted')
  const olculebilir = bosKaplar.filter((k) => k.etkilenen_ogrenci_sayisi !== null)
  const toplamEtkilenen = olculebilir.reduce((t, k) => t + (k.etkilenen_ogrenci_sayisi as number), 0)
  const olculemez = bosKaplar.length - olculebilir.length

  console.log(`\n── BOŞ KAP ÖZETİ (canlı teyitli) ──`)
  console.log(`tür bazında       : sınıf ödevi ${odevBos.length} · hedefli set ${setBos.length} · TOPLAM ${bosKaplar.length}`)
  console.log(`etkilenen öğrenci : ${toplamEtkilenen} (ölçülebilen ${olculebilir.length} kap) · ölçülemeyen (null) ${olculemez} kap`)

  // Ders dağılımı (canlı subject → boş kap adedi)
  const ders = new Map<string, number>()
  for (const k of bosKaplar) {
    const canliR = k.tur === 'assignment' ? odevCanli.get(k.kap_id) : setCanli.get(k.kap_id)
    const d = dersAdi(canliR, adaylar.find((a) => a.kap_id === k.kap_id)?.kap_baslik_029 ?? '')
    ders.set(d, (ders.get(d) ?? 0) + 1)
  }
  console.log(`ders dağılımı     : ${[...ders.entries()].map(([d, n]) => `${d}:${n}`).join('  ') || '—'}`)

  // Öneri dağılımı
  const oneri = new Map<Oneri, number>()
  for (const k of bosKaplar) oneri.set(k.oneri, (oneri.get(k.oneri) ?? 0) + 1)
  console.log(`öneri etiketi     : ${[...oneri.entries()].map(([o, n]) => `${o}:${n}`).join('  ') || '—'}`)

  // Satır dökümü
  console.log(`\n  tür         kap_id    başlık                            once→simdi  etkilenen  öneri`)
  for (const k of bosKaplar) {
    console.log(
      `  ${(k.tur === 'assignment' ? 'ödev' : 'set').padEnd(11)} ${k.kap_id.slice(0, 8)}  ${ozet(k.baslik ?? '—').padEnd(33)} ${`${k.soru_sayisi_once}→${k.soru_sayisi_simdi}`.padEnd(11)} ${String(k.etkilenen_ogrenci_sayisi ?? 'null').padEnd(10)} ${k.oneri}`,
    )
  }

  // ── Dürüstlük bölümleri: artik-dolu + kayip (jsonl'e GİRMEZ; boş DEĞİL) ──
  console.log(`\n── ARTIK DOLU (029'da boşalmış ama canlıda yeniden soru var — "boş" SAYILMAZ): ${artikDolu.length} ──`)
  for (const a of artikDolu) console.log(`  ${a.tur} ${a.kap_id.slice(0, 8)} · ${ozet(a.baslik ?? '—')} · once ${a.once} → simdi ${a.simdi}`)
  console.log(`── KAYIP (029 adayı ama canlı tabloda YOK — silinmiş/taşınmış): ${kayip.length} ──`)
  for (const k of kayip) console.log(`  ${k.tur} ${k.kap_id.slice(0, 8)} · once ${k.once}`)

  console.log(`\n✔ jsonl yazıldı: ${CIKTI} (${bosKaplar.length} boş kap)`)
  console.log('SALT-OKUNUR: DB DEĞİŞMEDİ. İkinci koşu aynı çıktıyı üretir (idempotent).')
}

await main()
// Açık redis/postgres handle'ları event loop'u ayakta tutuyor — tek-atışlık script temiz çıksın.
process.exit(0)
