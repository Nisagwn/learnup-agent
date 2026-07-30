/** Geçici: kaç konuya HİÇ kazanım düşmedi (kalıcı boşluk analizi). */
import { readFileSync } from 'node:fs'
import { supabase } from '../clients/supabase.js'
import { fetchAll } from '../lib/pg.js'

const DERS_ESANLAMI: Record<string, string> = { 'T.C. İnkılap Tarihi ve Atatürkçülük': 'Tarih' }
const sd = (d: string): string => DERS_ESANLAMI[d] ?? d

const konular = await fetchAll<{ id: number; subject: string; ad: string; sinav: string; unite: string | null }>(() =>
  supabase.from('konular').select('id, subject, ad, sinav, unite'),
)
const dersKonu = new Map<string, typeof konular>()
for (const k of konular) { const l = dersKonu.get(k.subject) ?? []; l.push(k); dersKonu.set(k.subject, l as typeof konular) }
const cache = new Map<string, (h: string, s?: string | null) => number | undefined>()
const cozucu = (ders: string) => {
  let c = cache.get(ders); if (c) return c
  const liste = dersKonu.get(ders) ?? []
  const tam = new Map<string, number>(); const sade = new Map<string, number>()
  for (const k of liste) tam.set(`${k.ad} ${k.sinav}`, Number(k.id))
  for (const k of [...liste].sort((a, b) => (a.sinav === 'TYT' ? -1 : 1) - (b.sinav === 'TYT' ? -1 : 1))) if (!sade.has(k.ad)) sade.set(k.ad, Number(k.id))
  c = (h, s) => {
    const m = /^(.*?)[\s([]*\b(TYT|AYT)\b[\s)\]]*$/.exec(String(h).trim())
    const ad = (m ? m[1] : String(h)).trim(); const sn = (m ? m[2] : s) ?? null
    if (sn === 'TYT' || sn === 'AYT') { const id = tam.get(`${ad} ${sn}`); if (id) return id }
    return sade.get(ad)
  }
  cache.set(ders, c); return c
}

const enSon = new Map<number, { ders: string; konu: string; sinav?: string; t: string }>()
for (const s of readFileSync('data/eslesme-konu.jsonl', 'utf8').split('\n')) {
  if (!s.trim()) continue
  try {
    const j = JSON.parse(s) as { id?: number; ders?: string; konu?: string; sinav?: string; t?: string }
    if (!j.id || !j.konu) continue
    const o = enSon.get(Number(j.id))
    if (!o || String(j.t ?? '') >= o.t) enSon.set(Number(j.id), { ders: String(j.ders), konu: j.konu, sinav: j.sinav, t: String(j.t ?? '') })
  } catch { /* */ }
}
const konuKazanim = new Map<number, number>()
for (const [, e] of enSon) {
  const id = cozucu(sd(e.ders))(e.konu, e.sinav)
  if (id) konuKazanim.set(id, (konuKazanim.get(id) ?? 0) + 1)
}

const dersToplam = new Map<string, number>(); const dersDolu = new Map<string, number>()
for (const k of konular) {
  dersToplam.set(k.subject, (dersToplam.get(k.subject) ?? 0) + 1)
  if (konuKazanim.has(Number(k.id))) dersDolu.set(k.subject, (dersDolu.get(k.subject) ?? 0) + 1)
}
console.log('ders                          konu  kazanımlı  KAZANIMSIZ   %')
for (const [d, t] of [...dersToplam].sort((a, b) => b[1] - a[1])) {
  const dolu = dersDolu.get(d) ?? 0
  console.log(`${d.padEnd(28)} ${String(t).padStart(5)} ${String(dolu).padStart(10)} ${String(t - dolu).padStart(11)} ${String(Math.round(dolu / t * 100)).padStart(4)}`)
}
const dolu = konuKazanim.size
console.log(`\nTOPLAM: ${konular.length} konu · ${dolu} kazanımlı · ${konular.length - dolu} KAZANIMSIZ (kalıcı boş)`)

console.log('\nen çok kazanım toplayan 10 konu (aşırı yığılma var mı):')
const ad = new Map(konular.map((k) => [Number(k.id), `${k.subject} › ${k.unite} › ${k.ad} [${k.sinav}]`]))
for (const [id, n] of [...konuKazanim].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
  console.log(`  ${String(n).padStart(3)} × ${ad.get(id)}`)
}
process.exit(0)
