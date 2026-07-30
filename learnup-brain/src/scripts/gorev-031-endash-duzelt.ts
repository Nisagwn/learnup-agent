/**
 * GOREV-031 — EN-DASH HAVUZ DÜZELTMESİ (iki aşamalı, idempotent, DB'den TAZE tarar).
 *
 * NEDEN (GOREV-021 teşhisi): yks_ai_questions'ta tire ailesi / kesir-bölü / rakam-benzeri
 * ASCII-dışı karakterler var. En-dash'li SAYISAL şıklar `sayiya`'yı null'a düşürüp kuşatma /
 * artan-sıra / uzunluk kapılarını SESSİZCE atlatıyordu → gizli `tek-yanda` ihlaliyle VERIFIED
 * soru servis ediliyor. Kod tarafı artık `sayisalNormalize` ile düzeltildi (shufflers.ts);
 * bu script MEVCUT havuz satırlarının metnini de temizler + ihlali süren kapı-atlatanları düşürür.
 *
 * İKİ AŞAMA (V§3.7.2 — önce dosya, kullanıcı onayı, sonra DB):
 *   1) DRY-RUN (varsayılan): DB'yi TAZE tarar, değişiklikleri `data/gorev-031-duzeltme.jsonl`e
 *      yazar (satır başına id·alan·ESKİ·YENİ = GERİ DÖNÜŞ yolu), karar tablosunu basar. DB'ye
 *      DOKUNMAZ. Kullanıcı jsonl'i inceleyip veto edebilir.
 *   2) --uygula: aynı taramayı yapıp DB'ye yazar. İKİNCİ koşu NO-OP olur (sayisalNormalize
 *      idempotent → düzeltilmiş satırda artık değişecek karakter yok).
 *
 * MEKANİK KARAR (ORKESTRATÖR onaylı): normalize + kuşatmayı YENİDEN ölç → ihlal (`tek-yanda`)
 * SÜRÜYORSA `verified=false` (satır SİLİNMEZ). Zaten verified=false olan (5d6c6db3) DOKUNULMAZ,
 * yalnız metni düzeltilir. İhlal kalkarsa (adfcdccb: kuşatilmis) yalnız metin düzeltilir.
 *
 * Koşum:
 *   bun src/scripts/gorev-031-endash-duzelt.ts            # DRY-RUN
 *   bun src/scripts/gorev-031-endash-duzelt.ts --uygula   # DB'ye yaz
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { supabase } from '../clients/supabase.js'
import { fetchAll } from '../lib/pg.js'
import { sayisalNormalize, celdiriciKusatmasi, type SikliSoru } from '../utils/shufflers.js'

const UYGULA = process.argv.includes('--uygula')
const HARFLER = ['A', 'B', 'C', 'D', 'E'] as const

type Row = {
  id: string
  subject: string
  question_text: string | null
  options: unknown
  correct_option: string | null
  solution: string | null
  verified: boolean
}

/**
 * OLD `sayiya` davranışı (normalize YOK) — YALNIZ rapor differential'ı için: düzeltmeden ÖNCE
 * kapının ne gördüğünü (çoğu satırda null = atlandı) faithfully göstermek. Üretim kodu artık
 * shufflers.ts'te normalize ediyor; buradaki kopya kasıtlı ve yalnızca ölçüm-öncesi içindir.
 */
function rawSayiya(s: string): number | null {
  const soyulmus = s.trim().replace(/^\$\$?([\s\S]*?)\$\$?$/, '$1')
  const t = soyulmus
    .replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, (_m, p: string, q: string) => `${p}/${q}`)
    .replace(/\s/g, '')
  const kesir = t.match(/^([-+]?\d+)\/(\d+)$/)
  if (kesir) return Number(kesir[1]) / Number(kesir[2])
  const n = Number(t.replace(',', '.'))
  return Number.isFinite(n) && t.length > 0 ? n : null
}

function rawKusatma(siklar: Record<string, string>, dogru: string): 'kusatilmis' | 'tek-yanda' | null {
  const idx = HARFLER.indexOf(dogru as (typeof HARFLER)[number])
  if (idx < 0) return null
  const sayilar = HARFLER.map((l) => rawSayiya(siklar[l] ?? ''))
  if (sayilar.some((n) => n === null)) return null
  const dogruDeger = sayilar[idx] as number
  let alt = 0
  let ust = 0
  sayilar.forEach((n, i) => {
    if (i === idx) return
    if ((n as number) < dogruDeger) alt++
    else if ((n as number) > dogruDeger) ust++
  })
  return alt >= 2 && ust >= 2 ? 'kusatilmis' : 'tek-yanda'
}

/** options jsonb'ini {A..E} string haritasına indirger (obje ya da dizi). */
function optionsHarita(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (Array.isArray(raw)) {
    raw.forEach((v, i) => {
      if (i < HARFLER.length) out[HARFLER[i]] = String(v ?? '')
    })
  } else if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) out[k] = String(v ?? '')
  }
  return out
}

const rows = await fetchAll<Row>(() =>
  supabase.from('yks_ai_questions').select('id, subject, question_text, options, correct_option, solution, verified'),
)

type Diff = { id: string; alan: string; eski: string; yeni: string }
type Karar = {
  id: string
  subject: string
  eskiOlcum: string
  yeniOlcum: string
  eskiVerified: boolean
  yeniVerified: boolean
  karar: string
}

const diffler: Diff[] = []
const kararlar: Karar[] = []
const guncellemeler: Array<{ id: string; yama: Record<string, unknown> }> = []

for (const r of rows) {
  const yama: Record<string, unknown> = {}

  // 1) question_text
  const q = r.question_text ?? ''
  const qN = sayisalNormalize(q)
  if (qN !== q) {
    diffler.push({ id: r.id, alan: 'question_text', eski: q, yeni: qN })
    yama.question_text = qN
  }

  // 2) options (obje ya da dizi) — her şık ayrı diff satırı
  const opts = optionsHarita(r.options)
  const optsN: Record<string, string> = {}
  let optsChanged = false
  const objeMi = !Array.isArray(r.options)
  for (const [k, v] of Object.entries(opts)) {
    const vN = sayisalNormalize(v)
    optsN[k] = vN
    if (vN !== v) {
      diffler.push({ id: r.id, alan: `options.${k}`, eski: v, yeni: vN })
      optsChanged = true
    }
  }
  if (optsChanged) {
    // Şekli koru: dizi ise dizi yaz, obje ise obje.
    yama.options = Array.isArray(r.options) ? HARFLER.filter((h) => h in optsN).map((h) => optsN[h]) : optsN
  }

  // 3) solution
  if (r.solution != null) {
    const sN = sayisalNormalize(r.solution)
    if (sN !== r.solution) {
      diffler.push({ id: r.id, alan: 'solution', eski: r.solution, yeni: sN })
      yama.solution = sN
    }
  }

  if (Object.keys(yama).length === 0) continue // etkilenmedi → atla

  // ── KAPI-ATLATAN KARARI: normalize sonrası kuşatmayı YENİDEN ölç ──
  const dogru = r.correct_option ?? ''
  const eskiOlcum = objeMi ? rawKusatma(opts, dogru) : null // düzeltmeden ÖNCE gate ne gördü
  const sikliN: SikliSoru = { siklar: optsN as SikliSoru['siklar'], dogru }
  const yeniOlcum = objeMi ? celdiriciKusatmasi(sikliN) : null // düzeltmeden SONRA gerçek ölçüm

  let yeniVerified = r.verified
  let karar: string
  if (r.verified && yeniOlcum === 'tek-yanda') {
    yeniVerified = false
    yama.verified = false
    karar = 'verified=false — normalize sonrası tek-yanda İHLAL sürüyor'
  } else if (!r.verified) {
    karar = 'zaten verified=false — yalnız metin düzeltildi'
  } else {
    karar = `verified korunur — kuşatma ${yeniOlcum ?? 'uygulanamaz (metinsel)'}`
  }

  // Karar tablosuna yalnız sayısal-gate ilgili satırları (ölçüm null değilse) VEYA verified düşenleri al.
  if (eskiOlcum !== null || yeniOlcum !== null || yama.verified === false) {
    kararlar.push({
      id: r.id,
      subject: r.subject,
      eskiOlcum: String(eskiOlcum),
      yeniOlcum: String(yeniOlcum),
      eskiVerified: r.verified,
      yeniVerified,
      karar,
    })
  }

  guncellemeler.push({ id: r.id, yama })
}

// ── jsonl her zaman yazılır (geri dönüş yolu) ──
const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data')
mkdirSync(dataDir, { recursive: true })
const jsonlYol = join(dataDir, 'gorev-031-duzeltme.jsonl')
writeFileSync(jsonlYol, diffler.map((d) => JSON.stringify(d)).join('\n') + (diffler.length ? '\n' : ''))

console.log(`\n=== GOREV-031 EN-DASH DÜZELTME ${UYGULA ? '(UYGULA)' : '(DRY-RUN)'} ===`)
console.log(`Taranan satır: ${rows.length} · etkilenen satır: ${guncellemeler.length} · alan-diff: ${diffler.length}`)
console.log(`jsonl yazıldı: ${jsonlYol} (${diffler.length} satır)`)

// Diff'in karakter dağılımı (hangi tür karakter kaç kez)
const alanSayim = new Map<string, number>()
for (const d of diffler) alanSayim.set(d.alan.split('.')[0], (alanSayim.get(d.alan.split('.')[0]) ?? 0) + 1)
console.log('Alan bazında değişiklik:', [...alanSayim.entries()].map(([a, n]) => `${a}:${n}`).join('  '))

console.log(`\nKAPI-ATLATAN / ÖLÇÜM KARARLARI (${kararlar.length}):`)
console.log('  id        ders            kuşatma(eski→yeni)   verified(eski→yeni)  karar')
for (const k of kararlar) {
  console.log(
    `  ${k.id.slice(0, 8)}  ${k.subject.slice(0, 14).padEnd(14)}  ${(`${k.eskiOlcum}→${k.yeniOlcum}`).padEnd(20)} ${(`${k.eskiVerified}→${k.yeniVerified}`).padEnd(19)} ${k.karar}`,
  )
}

if (!UYGULA) {
  console.log('\nDRY-RUN — DB YAZILMADI. İncele: data/gorev-031-duzeltme.jsonl · Uygulamak için: --uygula')
  process.exit(0)
}

// ── UYGULA ──
let yazilan = 0
for (const g of guncellemeler) {
  const { error } = await supabase.from('yks_ai_questions').update(g.yama).eq('id', g.id)
  if (error) {
    console.error(`  yazım HATASI ${g.id}: ${error.message}`)
    continue
  }
  yazilan++
}
console.log(`\nUYGULANDI: ${yazilan}/${guncellemeler.length} satır güncellendi. İkinci koşu NO-OP olmalı (0 diff).`)
