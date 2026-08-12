/**
 * tde-eksen-duzelt.ts — TDE havuzundaki EKSEN HATASINI düzeltir (tek seferlik, LLM ÇAĞIRMAZ).
 *
 * ═══ NEDEN ═══
 * TDE, 14 ders içinde müfredat ağacı BECERİ ekseninde yazılmış TEK derstir: 244 kazanımın
 * path'i okuma(59) / konuşma(64) / yazma(63) / dinleme_izleme(58) diye bölünür. Bunlardan
 * yalnız OKUMA ÖSYM'nin ölçtüğü şeye karşılık gelir; kalan 185'i performans/süreç kazanımıdır
 * ("podcast hazırlayabilme", "yazma sürecini yönetebilme") ve 5 şıklı test sorusuna konu olamaz.
 *
 * Havuz bunu ele verdi: 13 TDE sorusunun 9'u OKUMA DIŞI kazanıma yazılmıştı. Öğrenci hiçbir şey
 * dinlemiyor, ekranda metin okuyor — yani kazanım etiketi YALAN ve `user_mastery` o etiketten
 * öğrenecekti. Sorunun kendisi çoğu vakada geçerli; yanlış olan BAĞLANDIĞI YER.
 *
 * ═══ NE YAPAR ═══
 * (1) TAŞI — dinleme/izleme kazanımına yazılmış geçerli metin soruları, AYNI TEMANIN okuma
 *     kazanımına çekilir. Eşleme mekanik ve birebir: müfredat `.1.x` (dinleme) ile `.2.x`
 *     (okuma) alt numaralarını AYNI işlevle kullanıyor (1=yönetme, 2=anlam oluşturma,
 *     3=çözümleme, 4=süreç değerlendirme) → TDE.10.3.1.2 ⇒ TDE.10.3.2.2.
 * (2) KARANTİNA — soru gerçekten ÖSYM sorusu değilse (performans görevi, süreç meta-sorusu ya
 *     da bozuk metin) `karantina=true`. SİLİNMEZ: 0025'in karantina sözleşmesi zaten "servis
 *     etme, havuz derinliğine sayma, ama kaydı koru" demek. Silmek, neyin neden düştüğünü
 *     ölçemez hâle getirirdi.
 *
 * ⚠️ SATIRLAR ELLE OKUNARAK SEÇİLDİ, desen eşleşmesiyle DEĞİL. 13 sorunun her biri metni ve
 * beş şıkkıyla tek tek okundu; aşağıdaki gerekçeler o okumanın kaydıdır. Otomatik bir kural
 * ("dinleme kazanımındaki her soru taşınsın") #1 ve #2'yi de taşır ve iki bozuk soruyu havuzda
 * geçerli gösterirdi.
 *
 * KULLANIM:
 *   bun src/scripts/tde-eksen-duzelt.ts          # KURU KOŞU — hiçbir şey yazmaz
 *   bun src/scripts/tde-eksen-duzelt.ts --yaz    # uygular
 */
import { supabase } from '../clients/supabase.js'

const YAZ = process.argv.includes('--yaz')

/** Taşınacaklar: geçerli metin/tür sorusu, yalnız yanlış eksende duruyor. */
const TASI: Array<{ id: string; hedefKod: string; hedefId: number; neden: string }> = [
  { id: '3c825f63-e4dd-4b28-89fd-ce7dfd1fe47c', hedefKod: 'TDE.11.4.2.2', hedefId: 984,
    neden: 'belgesel metni KÖKTE veriliyor → okuma-anlam sorusu' },
  { id: '92f203be-4644-4f78-9573-f61b7aeb0135', hedefKod: 'TDE.11.4.2.2', hedefId: 984,
    neden: 'aynı belgeselden alıntı sözün anlamı → okuma-anlam' },
  { id: '75a90bb0-9058-4cc9-8a65-3d03436e83c9', hedefKod: 'TDE.10.3.2.2', hedefId: 906,
    neden: 'fabl metni kökte tam veriliyor; "dinlediğiniz" ifadesi kozmetik' },
  { id: '88736f0e-4212-4b9d-a85b-82ec9edf02e5', hedefKod: 'TDE.10.3.2.2', hedefId: 906,
    neden: '"Aşağıda bir fabl metninden bölüm verilmiştir" → düpedüz okuma sorusu' },
  { id: 'b6e237f3-9dcf-4f9a-8549-a0497e1b80f5', hedefKod: 'TDE.10.3.2.2', hedefId: 906,
    neden: 'tilki-üzüm metni kökte; tür/amaç sorusu' },
  { id: '01a02b09-5f47-47df-b003-4920bed22326', hedefKod: 'TDE.10.3.2.2', hedefId: 906,
    neden: 'Dede Korkut tür bilgisi; metin kökte' },
  { id: 'ca69fbf9-8bc7-4c06-b8eb-279f3dcc68e5', hedefKod: 'TDE.10.3.2.3', hedefId: 907,
    neden: 'halk hikâyesi yapı çözümlemesi → okuma-çözümleme' },
  { id: '5eaab62c-8ab8-4968-9daf-114a665b7c77', hedefKod: 'TDE.10.3.2.4', hedefId: 908,
    neden: 'fabl türü genel özellikleri; dinlemeden bağımsız cevaplanabilir tür bilgisi' },
  { id: '3778e2f8-fe8d-46e5-a74d-ff7f4fd173e6', hedefKod: 'TDE.10.3.2.4', hedefId: 908,
    neden: 'fablda sembolik anlatım; tür bilgisiyle cevaplanır' },
]

/** Karantinaya alınacaklar: ÖSYM sorusu değil ya da metni bozuk. */
const KARANTINA: Array<{ id: string; neden: string }> = [
  { id: 'f207aa19-6c4a-4c4e-bd23-6dd4d944013a',
    neden: 'PERFORMANS GÖREVİ: "podcast giriş stratejisi" — ders içi uygulama sorusu, ÖSYM sorusu değil' },
  { id: '6caecd10-d285-4646-8743-c927b2b34501',
    neden: 'PERFORMANS GÖREVİ: "film şeridi planı oluşturma beklentisi" — yazma süreci, ölçülebilir edebiyat bilgisi yok' },
  { id: '7180a402-d597-4295-8d32-21e4711ac6de',
    neden: 'BOZUK METİN: kök kendini tekrar ediyor ("…şu parçayı okuyalım: «Dede Korkut\'in…»"), ' +
           '"bir deva ile savaşması" (dev→deva), "uyşup/vurgayarak/bağlmini" yazım hataları, kökte ham **bold** işareti' },
  { id: '5433de56-ed53-4b68-a612-d5d065eb974b',
    neden: 'SÜREÇ META-SORUSU: kurgusal öğrencinin okuma sürecini değerlendiriyor; ayrıca "bağlmini" yazım hatası KÖKTE ve B şıkkında' },
]

const { data: sorular, error } = await supabase
  .from('yks_ai_questions')
  .select('id, kazanim_id, difficulty, karantina, question_text')
  .in('id', [...TASI.map((t) => t.id), ...KARANTINA.map((k) => k.id)])
if (error) { console.error('okuma hatası:', error.message); process.exit(1) }

const mevcut = new Map(
  ((sorular ?? []) as Array<{ id: string; kazanim_id: number | null; difficulty: string | null; karantina: boolean; question_text: string }>)
    .map((r) => [r.id, r]),
)

console.log(`\n=== TDE EKSEN DÜZELTMESİ ${YAZ ? '(YAZILIYOR)' : '(KURU KOŞU — hiçbir şey yazılmaz)'} ===\n`)
console.log(`TAŞINACAK (${TASI.length}) — dinleme/izleme → aynı temanın okuma kazanımı:`)
let eksik = 0
for (const t of TASI) {
  const r = mevcut.get(t.id)
  if (!r) { console.log(`  ⚠️  ${t.id} BULUNAMADI (silinmiş olabilir)`); eksik++; continue }
  console.log(`  ${r.kazanim_id} → ${t.hedefId} (${t.hedefKod})  ${r.question_text.slice(0, 46).replace(/\s+/g, ' ')}…`)
  console.log(`      ${t.neden}`)
}
console.log(`\nKARANTİNAYA ALINACAK (${KARANTINA.length}):`)
for (const k of KARANTINA) {
  const r = mevcut.get(k.id)
  if (!r) { console.log(`  ⚠️  ${k.id} BULUNAMADI`); eksik++; continue }
  console.log(`  ${r.question_text.slice(0, 46).replace(/\s+/g, ' ')}…`)
  console.log(`      ${k.neden}`)
}
if (eksik) console.log(`\n⚠️  ${eksik} satır bulunamadı — havuz beklenenden farklı, önce nedenini araştır.`)

if (!YAZ) {
  console.log(`\nKURU KOŞU — DB'ye dokunulmadı. Uygulamak için: --yaz`)
  process.exit(0)
}

let tasinan = 0
for (const t of TASI) {
  if (!mevcut.has(t.id)) continue
  const { error: e } = await supabase.from('yks_ai_questions').update({ kazanim_id: t.hedefId }).eq('id', t.id)
  if (e) console.error(`  taşıma hatası ${t.id}: ${e.message}`)
  else tasinan++
}
let karantinaya = 0
for (const k of KARANTINA) {
  if (!mevcut.has(k.id)) continue
  const { error: e } = await supabase.from('yks_ai_questions').update({ karantina: true }).eq('id', k.id)
  if (e) console.error(`  karantina hatası ${k.id}: ${e.message}`)
  else karantinaya++
}
console.log(`\nBİTTİ: ${tasinan} soru okuma kazanımına taşındı · ${karantinaya} soru karantinaya alındı.`)
console.log(`TDE servis edilebilir havuz: ${tasinan + (13 - tasinan - karantinaya)} soru (karantina servis edilmez).`)
process.exit(0)
