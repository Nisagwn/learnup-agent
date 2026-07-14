/**
 * TOPLU DÖP HATTI — data/pdf/ içindeki TÜM PDF'leri tek komutla DB'ye taşır.
 *
 *   PDF  →(poppler/docker)→  .txt  →(parse-dop)→  .json  →(ingest-curriculum)→  Supabase
 *
 * Kullanıcının yapması gereken TEK ŞEY: PDF'leri data/pdf/ klasörüne atmak.
 * Ders adı, kod öneki (BİY/FİZ/KİM…) ve ltree kökü belgeden OTOMATİK tespit edilir.
 * Elle --prefix / --subject / --expect girmek YOK.
 *
 * GÜVENLİK: her ders kendi doğrulamasından geçer (parse-dop D1 bağımsız sayım + D2 süreklilik).
 * Bir ders çakarsa O DERS ATLANIR, diğerleri devam eder; sonunda özet tabloda görürsün.
 * --commit verilmedikçe HİÇBİR ŞEY yazılmaz (ön izleme).
 *
 * KULLANIM:
 *   bun src/scripts/ingest-all.ts              # ön izleme — tüm dersler, yazma YOK
 *   bun src/scripts/ingest-all.ts --commit     # DB'ye yaz (upsert; tekrar çalıştırılabilir)
 *   bun src/scripts/ingest-all.ts --force      # .txt'ler varsa bile PDF'i yeniden çıkar
 *   bun src/scripts/ingest-all.ts --only biy,fiz
 */
import { readdirSync, existsSync, readFileSync } from 'node:fs'
import { resolve, join, basename, extname } from 'node:path'
import { spawnSync } from 'node:child_process'

const argv = process.argv.slice(2)
const arg = (n: string): string | undefined => {
  const i = argv.indexOf(`--${n}`)
  return i >= 0 ? argv[i + 1] : undefined
}
const COMMIT = argv.includes('--commit')
const FORCE = argv.includes('--force')
const ONLY = arg('only')?.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)

const PDF_DIR = resolve('data/pdf')
const JSON_DIR = resolve('data')

if (!existsSync(PDF_DIR)) {
  console.error(`⛔ ${PDF_DIR} yok. PDF'leri buraya at.`)
  process.exit(1)
}

// ── Türkçe → ASCII (ltree kökü ve dosya adı için) ──
const TR: Record<string, string> = { ç: 'c', Ç: 'c', ğ: 'g', Ğ: 'g', ı: 'i', I: 'i', İ: 'i', ö: 'o', Ö: 'o', ş: 's', Ş: 's', ü: 'u', Ü: 'u' }
const ascii = (s: string): string =>
  [...s].map((c) => TR[c] ?? c).join('').toLowerCase().replace(/[^a-z0-9]+/g, '')

/** Ders kod önekini metinden tespit et (BİY.9.1.1 → BİY · MAN.1.1 → MAN). parse-dop ile AYNI kural:
 *  önce 4 parçalı desen, yoksa 3 parçalı (seçmeli/tek programlı dersler — Psikoloji, Mantık). */
function detectPrefix(txt: string): string | null {
  const enSik = (re: RegExp): [string, number] | undefined => {
    const tally = new Map<string, number>()
    for (const m of txt.matchAll(re)) tally.set(m[1], (tally.get(m[1]) ?? 0) + 1)
    return [...tally.entries()].sort((a, b) => b[1] - a[1])[0]
  }
  const b4 = enSik(/(?:^|\s)([A-ZÇĞİÖŞÜ]{2,6})\.\s?\d{1,2}\.\s?\d\.\s?\d{1,2}\./g)
  if (b4 && b4[1] >= 5) return b4[0]
  const b3 = enSik(/(?:^|\s)([A-ZÇĞİÖŞÜ]{2,6})\.\s?\d{1,2}\.\s?\d{1,2}\.(?!\s?\d)/g)
  return b3 && b3[1] >= 5 ? b3[0] : null
}

/** Alt süreç çalıştır; stdout+stderr birleşik döner. (node:child_process → @types/bun gerekmez) */
const run = (cmd: string[]): { ok: boolean; out: string } => {
  const r = spawnSync(cmd[0], cmd.slice(1), { encoding: 'utf8', cwd: process.cwd() })
  return { ok: r.status === 0, out: (r.stdout ?? '') + (r.stderr ?? '') }
}

// ═══════════════════════════════════════════════════════════════════════════
// ADIM 1 — PDF → metin (poppler, Docker içinde; makineye hiçbir şey kurulmaz)
// ═══════════════════════════════════════════════════════════════════════════
const pdfs = readdirSync(PDF_DIR).filter((f) => extname(f).toLowerCase() === '.pdf')
if (pdfs.length === 0) {
  console.error(`⛔ ${PDF_DIR} içinde PDF yok.`)
  process.exit(1)
}

const needsExtract = pdfs.filter((f) => FORCE || !existsSync(join(PDF_DIR, basename(f, extname(f)) + '.txt')))
console.log(`\n▸ ${pdfs.length} PDF bulundu · ${needsExtract.length} tanesi metne çıkarılacak`)

if (needsExtract.length) {
  console.log('  (poppler-utils tek Docker konteynerinde, hepsi birden…)')
  const mount = PDF_DIR.replace(/\\/g, '/')
  const r = run([
    'docker', 'run', '--rm', '-v', `${mount}:/w`, '-w', '/w', 'alpine', 'sh', '-c',
    'apk add --no-cache poppler-utils >/dev/null 2>&1 && for f in *.pdf; do pdftotext -layout "$f" "${f%.pdf}.txt"; done && echo OK',
  ])
  if (!r.ok || !r.out.includes('OK')) {
    console.error('⛔ PDF→metin başarısız. Docker Desktop açık mı?\n' + r.out.slice(-500))
    process.exit(1)
  }
  console.log('  ✓ metin çıkarıldı')
}

// ═══════════════════════════════════════════════════════════════════════════
// ADIM 2 — her ders: parse (doğrulamalı) → ingest
// ═══════════════════════════════════════════════════════════════════════════
type Sonuc = { pdf: string; ders: string; slug: string; cikti: number; durum: string; not: string }
const sonuclar: Sonuc[] = []

for (const pdf of pdfs) {
  const stem = basename(pdf, extname(pdf))
  const txtPath = join(PDF_DIR, stem + '.txt')

  if (!existsSync(txtPath)) {
    sonuclar.push({ pdf, ders: '—', slug: '—', cikti: 0, durum: '✗ METİN YOK', not: 'pdftotext çıktı üretmedi' })
    continue
  }

  const txt = readFileSync(txtPath, 'utf8')
  const prefix = detectPrefix(txt)
  if (!prefix) {
    sonuclar.push({ pdf, ders: '—', slug: '—', cikti: 0, durum: '✗ ATLANDI', not: 'DÖP kod deseni (ÖRN.9.1.1) yok — bu bir öğretim programı değil?' })
    continue
  }
  const slug = ascii(prefix)                     // BİY → biy  (ltree kökü ile AYNI)
  if (ONLY && !ONLY.includes(slug)) continue

  const jsonPath = join(JSON_DIR, slug + '.json')

  console.log(`\n${'═'.repeat(70)}\n▸ ${pdf}   [${prefix}]\n${'═'.repeat(70)}`)

  // 2a) parse — kendi doğrulamasından geçmezse JSON yazmaz, exit 1 verir
  const p = run(['bun', 'src/scripts/parse-dop.ts', '--txt', txtPath, '--out', jsonPath])
  const dersAdi = /oto-tespit: ders="([^"]+)"/.exec(p.out)?.[1] ?? slug
  if (!p.ok) {
    console.log(p.out.split('\n').slice(-14).join('\n'))
    sonuclar.push({ pdf, ders: dersAdi, slug, cikti: 0, durum: '✗ DOĞRULAMA', not: 'parse-dop reddetti — JSON yazılmadı' })
    continue
  }
  const cikti = Number(/\((\d+) öğrenme çıktısı\)/.exec(p.out)?.[1] ?? 0)
  console.log(p.out.split('\n').filter((l) => /oto-tespit|Toplam|D1 |D2 |JSON yazıldı|DİZGİ/.test(l)).join('\n'))

  // 2b) ingest — --commit yoksa yalnız ön izleme
  const iCmd = ['bun', 'src/scripts/ingest-curriculum.ts', '--file', jsonPath]
  if (COMMIT) iCmd.push('--commit')
  const g = run(iCmd)
  if (!g.ok) {
    console.log(g.out.split('\n').slice(-12).join('\n'))
    sonuclar.push({ pdf, ders: dersAdi, slug, cikti, durum: '✗ INGEST', not: 'ingest-curriculum hata verdi' })
    continue
  }
  console.log(g.out.split('\n').filter((l) => /upsert|yks_knowledge|TAMAM|ÖN İZLEME|Dersler/.test(l)).join('\n'))

  sonuclar.push({
    pdf, ders: dersAdi, slug, cikti,
    durum: COMMIT ? '✓ YAZILDI' : '✓ ön izleme',
    not: COMMIT ? '' : '--commit ile yaz',
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// ÖZET
// ═══════════════════════════════════════════════════════════════════════════
console.log(`\n\n${'═'.repeat(78)}\n  ÖZET — ${COMMIT ? 'DB\'YE YAZILDI' : 'ÖN İZLEME (hiçbir şey yazılmadı)'}\n${'═'.repeat(78)}`)
console.log('DERS              SLUG   ÇIKTI  DURUM         NOT')
console.log('-'.repeat(78))
for (const s of sonuclar) {
  console.log(
    `${s.ders.slice(0, 17).padEnd(17)} ${s.slug.padEnd(6)} ${String(s.cikti).padStart(5)}  ${s.durum.padEnd(13)} ${s.not}`,
  )
}
const basarili = sonuclar.filter((s) => s.durum.startsWith('✓'))
const toplam = basarili.reduce((n, s) => n + s.cikti, 0)
console.log('-'.repeat(78))
console.log(`${basarili.length}/${sonuclar.length} ders · ${toplam} öğrenme çıktısı`)

const hatali = sonuclar.filter((s) => s.durum.startsWith('✗'))
if (hatali.length) {
  console.error(`\n⚠️  ${hatali.length} ders işlenemedi: ${hatali.map((s) => s.pdf).join(', ')}`)
  console.error('   (diğer dersler etkilenmedi — yukarıdaki log\'a bak)')
  process.exit(1)
}
if (!COMMIT) console.log('\n→ Yazmak için:  bun src/scripts/ingest-all.ts --commit')
