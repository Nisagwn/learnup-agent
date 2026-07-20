/**
 * ŞIK DAĞILIMI DENETİMİ — doğru cevap harfleri dengeli mi?
 *
 * siklariDuzenle üç yol izliyor ve ÜÇÜNÜN GARANTİSİ FARKLI:
 *   METİNSEL → Fisher-Yates karıştırma  → dağılım GARANTİLİ düzgün.
 *   SAYISAL  → artan sıra (ÖSYM kuralı) → harf, doğru değerin çeldiricilere göre BÜYÜKLÜĞÜNE
 *              bağlı. Model çeldiricileri hep doğru değerden BÜYÜK seçerse doğru cevap
 *              hep en küçük olur ve A'da kalır — karıştırma bunu ÇÖZMEZ.
 *   ROMA     → dokunulmaz ("Yalnız I / I ve II") → modelin koyduğu harf neyse o kalır.
 *
 * Bu script hangi yolun ne ürettiğini AYRI AYRI ölçer; toplam dağılım yanıltıcı olabilir.
 *
 * KULLANIM: bun src/scripts/sik-dagilim.ts
 */
import { supabase } from '../clients/supabase.js'
import { fetchAll } from '../lib/pg.js'

const KOMBIN = /^(yalnız\s+)?(i{1,3}|iv|v)(\s*(,|ve)\s*(i{1,3}|iv|v))*$/i
function sayiya(s: string): number | null {
  const t = s.trim().replace(/\s/g, '')
  const k = t.match(/^([-+]?\d+)\/(\d+)$/)
  if (k) return Number(k[1]) / Number(k[2])
  const n = Number(t.replace(',', '.'))
  return Number.isFinite(n) && t.length > 0 ? n : null
}

type Row = { options: Record<string, string>; correct_option: string }
const rows = await fetchAll<Row>(() =>
  supabase.from('yks_ai_questions').select('options, correct_option') // AI havuzu ayrı tablo (0013)
    .eq('verified', true),
)

const tipler = { sayisal: [] as string[], roma: [] as string[], metinsel: [] as string[] }
for (const r of rows) {
  const vals = ['A', 'B', 'C', 'D', 'E'].map((L) => r.options?.[L] ?? '')
  if (vals.some((v) => !v)) continue
  if (vals.every((v) => KOMBIN.test(v.trim()))) tipler.roma.push(r.correct_option)
  else if (vals.every((v) => sayiya(v) !== null)) tipler.sayisal.push(r.correct_option)
  else tipler.metinsel.push(r.correct_option)
}

/** Ki-kare: gözlenen dağılım düzgünden anlamlı sapıyor mu? (4 sd, %5 kritik = 9.49) */
function kiKare(harfler: string[]): number {
  const n = harfler.length
  if (n === 0) return 0
  const bek = n / 5
  let x = 0
  for (const L of ['A', 'B', 'C', 'D', 'E']) {
    const g = harfler.filter((h) => h === L).length
    x += (g - bek) ** 2 / bek
  }
  return x
}

const yaz = (ad: string, harfler: string[], garanti: string): void => {
  const n = harfler.length
  console.log(`\n── ${ad}  (n=${n})  · ${garanti}`)
  if (!n) { console.log('   veri yok'); return }
  for (const L of ['A', 'B', 'C', 'D', 'E']) {
    const c = harfler.filter((h) => h === L).length
    console.log(`   ${L}: ${String(c).padStart(4)}  ${'█'.repeat(Math.round((c / n) * 40))}`)
  }
  const x = kiKare(harfler)
  const saglam = n < 25 ? null : x < 9.49
  console.log(`   ki-kare = ${x.toFixed(2)}  ${
    saglam === null ? '(n<25 — hüküm vermek için az)' : saglam ? '✓ düzgün sayılır' : '✗ ANLAMLI SAPMA'
  }`)
}

console.log(`AI üretimi doğrulanmış havuz: ${rows.length} soru`)
yaz('METİNSEL şıklar', tipler.metinsel, 'Fisher-Yates → düzgün GARANTİLİ')
yaz('SAYISAL şıklar', tipler.sayisal, 'artan sıra → modelin çeldirici seçimine BAĞLI')
yaz('ROMA kalıbı', tipler.roma, 'dokunulmuyor → tamamen MODELE bağlı')

if (tipler.sayisal.length >= 25 && kiKare(tipler.sayisal) >= 9.49) {
  console.log('\n⚠ SAYISAL yolda sapma var: model çeldiricileri doğru değerin tek yanında topluyor.')
  console.log('  Prompt kuralı ("çeldiriciler doğrunun HEM ALTINDA hem ÜSTÜNDE olsun") tutmuyor demektir.')
}
process.exit(0)
