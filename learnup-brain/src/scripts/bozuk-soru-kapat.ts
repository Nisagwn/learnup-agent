/**
 * BOZUK ÇIKMIŞ SORULARI SERVİS DIŞI BIRAK — `verified=false`.
 *
 * NEDEN: çıkmış sorular PDF'ten metne çevrildi; şekiller ve alt/üst indisler yok oldu.
 * Geriye çözülemez metin kaldı ve bu sorular öğrenciye SERVİS EDİLİYORDU (osym.routes,
 * `verified` filtresi yoktu — bu commit'te eklendi). Öğrenci çözemeyip rastgele işaretler,
 * sistem bunu "kavram yanılgısı" sanır → teşhis verisi kirlenir. Servis etmemek, yanlış
 * teşhis üretmekten iyidir.
 *
 * NEDEN SİLMİYORUZ: satır kalsın ki denetlenebilsin ve şekiller bir gün elde edilirse
 * (ÖSYM PDF'lerinden görsel çıkarımı) geri açılabilsin. `verified=false` geri alınabilir;
 * DELETE değil.
 *
 * ⚠️ YANLIŞ POZİTİF KABUL EDİLİYOR (~2-4/32). Bkz. utils/soru-saglik.ts — maliyet asimetrik:
 * bozuk soruyu servis etmek öğrenciyi çözemeyeceği soruyla baş başa bırakır; sağlam bir soruyu
 * 1730'dan çıkarmak fark ettirmez.
 *
 * KULLANIM:
 *   bun src/scripts/bozuk-soru-kapat.ts            # KURU — ne değişecek, göster; DB'ye dokunma
 *   bun src/scripts/bozuk-soru-kapat.ts --commit   # uygula
 *   bun src/scripts/bozuk-soru-kapat.ts --geri-al  # hepsini verified=true yap (geri dönüş)
 */
import { supabase } from '../clients/supabase.js'
import { gorselBagimli } from '../utils/soru-saglik.js'

const COMMIT = process.argv.includes('--commit')
const GERI_AL = process.argv.includes('--geri-al')

type Row = { id: number; question_text: string; subject: string; verified: boolean }
const hepsi: Row[] = []
for (let i = 0; ; i += 1000) {
  const { data, error } = await supabase
    .from('yks_questions')
    .select('id, question_text, subject, verified')
    .eq('source_type', 'osym_cikmis')
    .range(i, i + 999)
  if (error) { console.error(error.message); process.exit(1) }
  if (!data?.length) break
  hepsi.push(...(data as Row[]))
  if (data.length < 1000) break
}

if (GERI_AL) {
  const kapali = hepsi.filter((q) => !q.verified)
  console.log(`GERİ ALMA: ${kapali.length} soru yeniden verified=true yapılacak.`)
  if (!COMMIT) { console.log('(--commit ile uygula)'); process.exit(0) }
  for (let i = 0; i < kapali.length; i += 100) {
    const { error } = await supabase.from('yks_questions').update({ verified: true })
      .in('id', kapali.slice(i, i + 100).map((q) => q.id))
    if (error) { console.error(error.message); process.exit(1) }
  }
  console.log('✓ geri alındı')
  process.exit(0)
}

const bozuk = hepsi.filter((q) => gorselBagimli(q.question_text))
const ds: Record<string, number> = {}
for (const q of bozuk) ds[q.subject] = (ds[q.subject] ?? 0) + 1

console.log(`\nÇıkmış soru: ${hepsi.length} · SERVİS DIŞI kalacak: ${bozuk.length} (%${((bozuk.length / hepsi.length) * 100).toFixed(1)})`)
console.log(`Ders bazında: ${Object.entries(ds).map(([k, v]) => `${k}=${v}`).join(' · ')}\n`)
for (const q of bozuk) console.log(`  [${String(q.id).padStart(5)}] ${q.subject.padEnd(12)} ${q.question_text.replace(/\s+/g, ' ').slice(0, 88)}`)

if (!COMMIT) {
  console.log(`\n>>> KURU ÇALIŞMA — DB'ye HİÇBİR ŞEY yazılmadı.  Uygulamak için: --commit`)
  process.exit(0)
}
for (let i = 0; i < bozuk.length; i += 100) {
  const { error } = await supabase.from('yks_questions').update({ verified: false })
    .in('id', bozuk.slice(i, i + 100).map((q) => q.id))
  if (error) { console.error(error.message); process.exit(1) }
}
console.log(`\n✓ ${bozuk.length} soru servis dışı (verified=false). Geri almak için: --geri-al --commit`)
