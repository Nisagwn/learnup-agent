/** _tmp-filtre-olc.ts — gorselBagimli'nin Matematik exemplar'larında fazla-eleme ölçümü.
 *  Mevcut filtre vs dar filtre (bozukGosterim || varOlmayanGorseleGonderme). */
import { supabase } from '../clients/supabase.js'
import { gorselBagimli, bozukGosterim, varOlmayanGorseleGonderme } from '../utils/soru-saglik.js'

const GORSEL = /\b(şekil|grafi[kğ]|tablo|çizim|görsel|harita|şema|soyağac)/i
const OKSUZ = /(?:(?:^|\s)\d{1,3}(?=\s)){4,}/

const { data } = await supabase.from('yks_exemplars')
  .select('question_text, difficulty').eq('subject', 'Matematik').limit(400)
const ex = (data ?? []) as Array<{ question_text: string; difficulty: string | null }>

let gorselHit = 0, oksuzHit = 0, kontrolHit = 0, gondermeHit = 0
for (const e of ex) {
  const q = e.question_text ?? ''
  if (GORSEL.test(q)) gorselHit++
  if (OKSUZ.test(q)) oksuzHit++
  if (bozukGosterim(q)) kontrolHit++
  if (varOlmayanGorseleGonderme(q)) gondermeHit++
}
const mevcutGecen = ex.filter((e) => !gorselBagimli(e.question_text ?? ''))
const darGecen = ex.filter((e) => !bozukGosterim(e.question_text ?? '') && !varOlmayanGorseleGonderme(e.question_text ?? ''))
const kurtarilan = darGecen.filter((e) => gorselBagimli(e.question_text ?? '')) // mevcut eler, dar geçirir

console.log(`Matematik exemplar: ${ex.length}`)
console.log(`kural tetikleri → GORSEL(kelime):${gorselHit} · OKSUZ(4+sayı):${oksuzHit} · KONTROL(çöp):${kontrolHit} · GÖNDERME(dar):${gondermeHit}`)
console.log(`MEVCUT filtre geçen: ${mevcutGecen.length}/${ex.length}`)
console.log(`DAR   filtre geçen: ${darGecen.length}/${ex.length}  (kurtarılan: ${kurtarilan.length})`)
const dagilim = (arr: typeof ex) => { const d: Record<string, number> = {}; for (const e of arr) d[e.difficulty ?? 'null'] = (d[e.difficulty ?? 'null'] ?? 0) + 1; return JSON.stringify(d) }
console.log(`  dar-geçen difficulty dağılımı: ${dagilim(darGecen)}`)

console.log('\n=== KURTARILAN 5 örnek (mevcut eliyor, dar geçiriyor) — gerçekten temiz mi? ===')
for (const e of kurtarilan.slice(0, 5)) console.log(`  [${e.difficulty}] ${(e.question_text ?? '').replace(/\s+/g, ' ').slice(0, 130)}…`)
console.log('\n=== DAR filtrenin hâlâ ELEDİĞİ 4 örnek — gerçekten bozuk mu? ===')
const darElenen = ex.filter((e) => bozukGosterim(e.question_text ?? '') || varOlmayanGorseleGonderme(e.question_text ?? ''))
for (const e of darElenen.slice(0, 4)) console.log(`  [${e.difficulty}] ${(e.question_text ?? '').replace(/\s+/g, ' ').slice(0, 130)}…`)
process.exit(0)
