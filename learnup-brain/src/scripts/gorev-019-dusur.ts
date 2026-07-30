/**
 * gorev-019-dusur.ts — GOREV-019 havuz düzeltmesi: LISTEDEKI id'leri `verified=false` yapar.
 *
 * İKİ AŞAMALI YAZIM (ORTAK-ANAYASA §7 / V§3.7.2): kaynak liste ÖNCE dosyada —
 * `data/gorev-019-dusurulenler.jsonl` (ORKESTRATÖR onaylı, GOREV-017 kanıtına dayalı). Bu script
 * o listeyi okur; DB'ye yalnız oradan yazar. **SİLME YOK** — yalnız geri-alınabilir `verified` bayrağı.
 *
 * KULLANIM:
 *   bun src/scripts/gorev-019-dusur.ts            # DRY-RUN (varsayılan; hiçbir şey yazmaz)
 *   bun src/scripts/gorev-019-dusur.ts --uygula   # GERÇEK koşu
 *
 * IDEMPOTENT: güncelleme `verified=true` koşuluyla yapılır → ikinci koşu 0 satır etkiler (no-op).
 * Listede olmayan HİÇBİR satıra dokunmaz (WHERE id = ANY(liste)).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { supabase } from '../clients/supabase.js'

const UYGULA = process.argv.slice(2).includes('--uygula')
const LISTE_DOSYA = join(import.meta.dir, '..', '..', 'data', 'gorev-019-dusurulenler.jsonl')

type Kayit = { id: string; neden: string; islem: string }
const kayitlar: Kayit[] = readFileSync(LISTE_DOSYA, 'utf8')
  .split('\n').map((s) => s.trim()).filter(Boolean)
  .map((satir) => JSON.parse(satir) as Kayit)

// Güvenlik: her kayıt YALNIZ verified=false işlemi olmalı (başka bir DB mutasyonu bu scriptin işi değil).
for (const k of kayitlar) {
  if (k.islem !== 'verified=false') {
    console.error(`⛔ beklenmeyen işlem "${k.islem}" (id ${k.id}) — script yalnız verified=false yapar. Durdu.`)
    process.exit(1)
  }
}
const ids = kayitlar.map((k) => k.id)
if (new Set(ids).size !== ids.length) { console.error('⛔ listede tekrar eden id var. Durdu.'); process.exit(1) }

console.log(`═══ GOREV-019 düşürme · ${UYGULA ? 'GERÇEK KOŞU (--uygula)' : 'DRY-RUN (yazım yok)'} ═══`)
console.log(`liste: ${LISTE_DOSYA}`)
console.log(`hedef id sayısı: ${ids.length}\n`)

// Mevcut durum — yalnız listedeki id'ler.
const { data: mevcut, error: okErr } = await supabase
  .from('yks_ai_questions').select('id, verified, subject, correct_option').in('id', ids)
if (okErr) { console.error(`⛔ okuma hatası: ${okErr.message}`); process.exit(1) }
const durum = new Map((mevcut ?? []).map((r) => [r.id, r]))

let flipEdilecek = 0
for (const k of kayitlar) {
  const r = durum.get(k.id)
  if (!r) { console.log(`  ⚠️  BULUNAMADI  ${k.id}  → DB'de yok (atlanır)`); continue }
  const flip = r.verified === true
  if (flip) flipEdilecek++
  console.log(`  ${flip ? '↓ flip    ' : '· zaten-false'} ${k.id} · verified=${r.verified} · ${k.neden.slice(0, 60)}`)
}
console.log(`\nverified=true → false yapılacak: ${flipEdilecek} / ${ids.length}`)

if (!UYGULA) {
  console.log('\nDRY-RUN bitti — DB DEĞİŞMEDİ. Gerçek koşu için: --uygula')
  process.exit(0)
}

// GERÇEK KOŞU — idempotent: yalnız hâlâ verified=true olanları çevir.
const { data: guncellenen, error: upErr } = await supabase
  .from('yks_ai_questions').update({ verified: false })
  .in('id', ids).eq('verified', true).select('id')
if (upErr) { console.error(`⛔ güncelleme hatası: ${upErr.message}`); process.exit(1) }
console.log(`\n✔ güncellenen satır: ${guncellenen?.length ?? 0}`)

// Son durum doğrulaması.
const { data: son } = await supabase.from('yks_ai_questions').select('id, verified').in('id', ids)
const halaTrue = (son ?? []).filter((r) => r.verified === true)
for (const r of son ?? []) console.log(`  son: ${r.id} · verified=${r.verified}`)
if (halaTrue.length) { console.error(`\n⛔ ${halaTrue.length} id hâlâ verified=true — beklenmedik.`); process.exit(1) }
console.log(`\n✔ TÜM hedef id'ler verified=false. (İkinci koşu 0 satır etkiler — idempotent.)`)
