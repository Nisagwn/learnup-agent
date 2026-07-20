/**
 * ab-karsilastir.ts — iki üretim kolunu yan yana koyar. `bun src/scripts/ab-karsilastir.ts pro gemma26`
 *
 * Rakamlar "kapıdan geçti" der ama "ÖSYM tadında mı" demez — o hükmü insan verir. Bu yüzden
 * çıktı iki katmanlı: (1) ölçülebilir tablo, (2) soruların TAM METNİ okunacak biçimde.
 *
 * Özgünlük kolonu neden var: ucuz modelin tipik zaafı kapılardan geçen ama BİRBİRİNE benzeyen
 * sorular üretmektir (aynı şablonu sayı değiştirerek tekrarlamak). Kod kapısı yalnız eşiği aşanı
 * eler; eşik altındaki sürüklenme tabloda görünmezse fark edilmez.
 */
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { kokBenzerligi } from '../utils/benzerlik.js'

const kollar = process.argv.slice(2)
if (kollar.length < 1) { console.error('kullanım: bun src/scripts/ab-karsilastir.ts <kol1> [kol2]'); process.exit(1) }

type Kayit = {
  id: string; kazanim: string; difficulty: string; istenenZorluk: string
  quality: number; soru: string; siklar: Record<string, string>; dogru: string
}
type Kol = {
  etiket: string; model: string; maliyet: number; uretilenAday: number; yazilan: number
  sureDk: number; durSebep: string; kazanimSayisi: number; ortKalite: number; kayitlar: Kayit[]
}

const veriler: Kol[] = []
for (const k of kollar) {
  const yol = fileURLToPath(new URL(`../../data/ab-${k}.json`, import.meta.url))
  if (!existsSync(yol)) { console.error(`⛔ kol dosyası yok: ${yol}`); continue }
  veriler.push(JSON.parse(readFileSync(yol, 'utf8')) as Kol)
}
if (!veriler.length) process.exit(1)

/** Kol içi en-yakın-komşu benzerliği — "kendi kendini tekrarlıyor mu?" */
const icBenzerlik = (k: Kol): { ort: number; enYuksek: number } => {
  const n = k.kayitlar.length
  if (n < 2) return { ort: 0, enYuksek: 0 }
  const enYakin: number[] = []
  for (let i = 0; i < n; i++) {
    let m = 0
    for (let j = 0; j < n; j++) if (i !== j) m = Math.max(m, kokBenzerligi(k.kayitlar[i].soru, k.kayitlar[j].soru))
    enYakin.push(m)
  }
  return { ort: enYakin.reduce((a, b) => a + b, 0) / n, enYuksek: Math.max(...enYakin) }
}

console.log('═══ KOL KARŞILAŞTIRMASI ═══\n')
console.log('kol'.padEnd(10) + 'model'.padEnd(34) + 'yazılan'.padStart(8) + 'aday'.padStart(6) +
  'kabul%'.padStart(8) + 'maliyet'.padStart(10) + '$/soru'.padStart(9) + 'kalite'.padStart(8) + 'kazanım'.padStart(9) + 'dk'.padStart(7))
for (const k of veriler) {
  const kabul = k.uretilenAday ? (100 * k.yazilan) / k.uretilenAday : 0
  const bas = k.yazilan ? k.maliyet / k.yazilan : 0
  console.log(
    k.etiket.padEnd(10) + k.model.slice(0, 33).padEnd(34) +
    String(k.yazilan).padStart(8) + String(k.uretilenAday).padStart(6) +
    `${kabul.toFixed(0)}%`.padStart(8) + `$${k.maliyet.toFixed(4)}`.padStart(10) +
    `$${bas.toFixed(4)}`.padStart(9) + k.ortKalite.toFixed(2).padStart(8) +
    String(k.kazanimSayisi).padStart(9) + k.sureDk.toFixed(1).padStart(7),
  )
}

console.log('\n── ZORLUK: SİPARİŞ TUTMA + DAĞILIM ──')
console.log('(hakem yazarın iddiasını değil KENDİ ölçümünü yazar; "tutma" = sipariş edilen ile ölçülen aynı)')
for (const k of veriler) {
  const dag: Record<string, number> = {}
  let tutan = 0
  const siparisBazli: Record<string, { t: number; n: number }> = {}
  for (const r of k.kayitlar) {
    dag[r.difficulty] = (dag[r.difficulty] ?? 0) + 1
    siparisBazli[r.istenenZorluk] = siparisBazli[r.istenenZorluk] ?? { t: 0, n: 0 }
    siparisBazli[r.istenenZorluk].n++
    if (r.difficulty === r.istenenZorluk) { tutan++; siparisBazli[r.istenenZorluk].t++ }
  }
  const detay = Object.entries(siparisBazli).map(([z, v]) => `${z} ${v.t}/${v.n}`).join(' · ')
  console.log(`  ${k.etiket.padEnd(9)} ölçülen: ${Object.entries(dag).map(([z, n]) => `${z}=${n}`).join(' ') || '-'}`)
  console.log(`  ${''.padEnd(9)} sipariş tutma: ${k.kayitlar.length ? Math.round((100 * tutan) / k.kayitlar.length) : 0}%  (${detay || '-'})`)
}

console.log('\n── ÖZGÜNLÜK (kol içi en-yakın-komşu; yüksek = kendini tekrarlıyor) ──')
for (const k of veriler) {
  const b = icBenzerlik(k)
  console.log(`  ${k.etiket.padEnd(9)} ortalama ${b.ort.toFixed(3)} · en yüksek ${b.enYuksek.toFixed(3)}`)
}
if (veriler.length === 2) {
  let capraz = 0
  for (const a of veriler[0].kayitlar)
    for (const b of veriler[1].kayitlar) capraz = Math.max(capraz, kokBenzerligi(a.soru, b.soru))
  console.log(`  kollar ARASI en yüksek benzerlik: ${capraz.toFixed(3)}`)
}

console.log('\n\n═══ SORULARIN TAM METNİ (gözle değerlendirme) ═══')
for (const k of veriler) {
  console.log(`\n\n████ KOL: ${k.etiket} — ${k.model} ████`)
  k.kayitlar.forEach((r, i) => {
    console.log(`\n─── ${i + 1}. ${r.kazanim} · sipariş=${r.istenenZorluk} → hakem=${r.difficulty} · kalite=${r.quality}`)
    console.log(r.soru)
    for (const h of ['A', 'B', 'C', 'D', 'E']) console.log(`  ${h}) ${r.siklar[h] ?? ''}${r.dogru === h ? '   ← doğru' : ''}`)
  })
}
