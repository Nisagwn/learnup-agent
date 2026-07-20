/**
 * ÖZGÜNLÜK ÖLÇÜSÜ — "bu soru, şu sorunun kılık değiştirmiş hâli mi?"
 *
 * NEDEN VAR: dedup yalnız exact md5 idi ve ÖLÇÜLDÜ: son 9 sorunun 2'si birbirinin yakın
 * kopyasıydı — "A(2,4) ve B(8,2) noktaları veriliyor…" ↔ "A(2,4) ve B(6,2) noktaları
 * veriliyor…". md5 bunu göremez (tek karakter farkı yeter); bu dosya görür.
 *
 * TASARIM KARARLARI (her biri bir ölçüme/derse dayanır):
 *  · KARAKTER shingle (4 krk), kelime n-gram DEĞİL — Türkçe eklemeli: "telin uzunluğu" ile
 *    "tel uzunluğunu" kelime düzeyinde eşleşmez, karakter düzeyinde eşleşir.
 *  · SAYILAR → '#' — "aynı senaryo + değişmiş sayılar = kopyadır" (charter ÖZGÜNLÜK maddesi).
 *    Maskeden sonra iki koordinat ikizi neredeyse özdeş metin olur.
 *  · tr-lower — 'İ'.toLowerCase() = 'i̇' (nokta kalır); toLocaleLowerCase('tr') doğru katlar.
 *  · KALIP İFADELER atılır — "Aşağıdakilerden hangisi", "Buna göre" her soruda var; taban
 *    benzerliği şişirir ve gerçek sinyali (senaryo) boğar.
 *  · YALNIZ KÖK karşılaştırılır (çağıranın işi) — sayısal şıklar maskeden sonra hep "#" olur,
 *    şık dahil edilirse benzerlik yapay şişer.
 *
 * ⚠️ DÜRÜST SINIR: bu ölçü TEKRARI yakalar, KLASİĞİ YAKALAMAZ. "Nehir kenarına 120 m tel"
 * her test kitabında var ama bizim referans korpusta yok — modelin eğitim verisinden geliyor.
 * Klasiğe karşı tek bedava savunma, GÖREV'e havuzdaki mevcut kökleri basıp "yeni senaryo kur"
 * demek (generation.ts) — garanti değil, caydırıcı.
 */
import { sayiya } from './shufflers.js'

/** "Yalnız I", "I ve II" — ÖSYM'nin geleneksel kalıbı (shufflers.KOMBIN ile aynı desen). */
const ROMA_KOMBIN = /^(yalnız\s+)?(i{1,3}|iv|v)(\s*(,|ve)\s*(i{1,3}|iv|v))*$/i

/** Her soruda geçen, senaryo taşımayan kalıplar — benzerlik ölçümünden atılır. */
const KALIPLAR = [
  /aşağıdakilerden hangisi(dir|ne|nde|ni)?/g,
  /aşağıdaki(ler)?/g,
  /buna göre,?/g,
  /olduğuna göre,?/g,
  /bu bilgilere göre,?/g,
  /verilenlere göre,?/g,
  /hangisi(dir)?/g,
  /kaçtır\??/g,
  /kaç olur\??/g,
  /olmak üzere,?/g,
]

/**
 * Karşılaştırma için normalize: tr-lower → LaTeX soy → sayı maskesi → kalıp at → boşluk katla.
 * LaTeX soyma latex.ts'teki gibi TAHMİN ETMEZ — yalnız `$` sınırlayıcılarını, `\komut`ları ve
 * süslü parantezleri atar; içerik (rakam/değişken) kalır ve maskelenir.
 */
export function benzerlikNormalize(s: string): string {
  let t = s
    .toLocaleLowerCase('tr')
    .replace(/\$\$?/g, ' ')
    .replace(/\\[a-zA-Z]+/g, ' ')
    .replace(/[{}]/g, ' ')
    .replace(/\d+([.,]\d+)?/g, '#')
  for (const kalip of KALIPLAR) t = t.replace(kalip, ' ')
  return t.replace(/\s+/g, ' ').trim()
}

/**
 * ÖZGÜNLÜK EŞİĞİ — DERS BAZLI; gerçek ÖSYM'nin aynı-ders en-yakın-komşu (NN) p99'undan türetildi.
 *
 * ⚠️ GLOBAL EŞİK DENENDİ VE ÖLÇÜM ÇÜRÜTTÜ. 0.30'luk tek eşik Matematik'te gerçek ÖSYM
 * sorularının %34'ünü "kopya" sayacaktı — çünkü ÖSYM kalıp TEKRAR EDER: "Dik koordinat
 * düzleminde A(#,#) ve B(#,#)…" açılışı, "… işlemi tanımlanıyor" çerçevesi meşru ve yaygın.
 * Hatta bu kapının ilk gerekçesi olan "koordinat ikizleri" (NN 0.311) bile Matematik'in
 * p90'ının (0.473) ALTINDA — göz kararı "kopya" damgası korpusça doğrulanmadı. Kapının
 * dürüst hedefi bu yüzden İKİ SEVİYE yukarıda: SAYI-DEĞİŞİK BİREBİR kopya (maske sonrası
 * ~özdeş metin). Kalıp çeşitliliği ayrı bir dert ve ayrı araçla çözülür (GÖREV'e havuz
 * köklerinin basılması).
 *
 * TÜRETME (eval 2b, ÖSYM verified n=1695, ders-bazlı NN):
 *   ders         n    p90    p99    → eşik = p99 + 0.05 payı, taban 0.35
 *   Matematik   331  0.473  0.700   → 0.75 → 0.62 (aşağıdaki revizyon)
 *   Türkçe      293  0.500  0.795   → 0.85
 *   Biyoloji    120  0.385  0.651   → 0.70
 *   Kimya       135  0.337  0.507   → 0.56
 *   TDE         176  0.181  0.377   → 0.43
 *   diğerleri   29-203  ≤0.23 ≤0.30 → 0.35 (taban; küçük örneklemde p99 oynak — sıkı eşik
 *                                            meşru soruyu yakar, taban güvenli üst sınır)
 *
 * MATEMATİK REVİZYONU: 0.75 → 0.62 (2026-07-20, CANLI İKİZ VAKASIYLA).
 * p99+pay kuralı üretimde delindi: v4-pro aynı hücrede iki kez aynı soruyu yazdı —
 * "A(a,2)↔B(1,-1) uzaklık 5, a'ların toplamı?" ve "A(2,a)↔B(-1,2) uzaklık 5, a'ların
 * toplamı?" — ÖZÜNDE TEK SORU, ölçülen benzerlik 0.620 < 0.75 → kapı geçirdi, ikisi de
 * havuza yazıldı. Yanlış-alarm tablosu (331 gerçek ÖSYM Matematik, canlı ölçüm):
 *   eşik 0.75 → FP  4/331 (%1.2) · ikizi KAÇIRIR
 *   eşik 0.62 → FP 14/331 (%4.2) · ikizi yakalar   ← seçilen
 *   eşik 0.55 → FP 17/331 (%5.1) · (kazanç yok, bedel artar)
 * %4.2'lik bedel bilinçli: ÖSYM kalıp tekrarını YILLARA yayar, öğrenci sınavda birini görür;
 * bizim havuzda ikizler YAN YANA durur ve aynı oturumda servis edilebilir. Bu yüzden eşiğimizin
 * ÖSYM'nin iç benzerliğine uyması gerekmez — ondan SIKI olması gerekir. (p99=0.700'ün altına
 * inmek "gerçek ÖSYM'de görülen benzerliği yasaklamak" demektir; bunu bilerek yapıyoruz.)
 */
const ESIK_TABAN = 0.35
const OZGUNLUK_ESIKLERI: Record<string, number> = {
  'Matematik': 0.62,
  'Türkçe': 0.85,
  'Biyoloji': 0.7,
  'Kimya': 0.56,
  'Türk Dili ve Edebiyatı': 0.43,
}
export const ozgunlukEsigi = (subject: string): number => OZGUNLUK_ESIKLERI[subject] ?? ESIK_TABAN

const SHINGLE = 4

/* ── Yönetici paneli için salt-okunur dışa verimler (davranış DEĞİŞMEZ) ──
   Eşikleri panelde göstermek, bariyeri savunulabilir kılan şeyin ta kendisi:
   "%X özgünlük" iddiası, eşiğin nereden geldiği görünmeden anlamsızdır. */
export const OZGUNLUK_TABAN = ESIK_TABAN
export const OZGUNLUK_TABLOSU: Readonly<Record<string, number>> = OZGUNLUK_ESIKLERI
export const SHINGLE_BOYU = SHINGLE

/** Metnin 4-karakterlik shingle kümesi (normalize edilmiş metin üzerinde). */
export function shingleKumesi(s: string): Set<string> {
  const t = benzerlikNormalize(s)
  const out = new Set<string>()
  for (let i = 0; i + SHINGLE <= t.length; i++) out.add(t.slice(i, i + SHINGLE))
  return out
}

/** Jaccard benzerliği [0,1]. Kısa metinlerde (shingle<10) 0 döner — ölçüm anlamsız. */
export function kokBenzerligi(a: string, b: string): number {
  const A = shingleKumesi(a)
  const B = shingleKumesi(b)
  if (A.size < 10 || B.size < 10) return 0
  let kesisim = 0
  for (const x of A) if (B.has(x)) kesisim++
  return kesisim / (A.size + B.size - kesisim)
}

/**
 * Hazır shingle kümeleriyle Jaccard — havuza karşı N karşılaştırmada kümeyi bir kez kur.
 * (86 soruluk havuzda fark önemsiz; havuz büyüdükçe fark büyür.)
 */
export function kumeBenzerligi(A: Set<string>, B: Set<string>): number {
  if (A.size < 10 || B.size < 10) return 0
  let kesisim = 0
  for (const x of A) if (B.has(x)) kesisim++
  return kesisim / (A.size + B.size - kesisim)
}

/** Tek şıkkı kıyaslanabilir kanonik biçime getirir: sayıysa sayı değeri, değilse tr-lower metin. */
const sikKanonik = (v: string): string => {
  const n = sayiya(v)
  return n !== null ? `n:${n}` : `t:${benzerlikNormalize(v)}`
}

/**
 * ÇELDİRİCİ-KÜME ÇAKIŞMASI — "kök değişmiş ama beş şık aynen taşınmış mı?"
 *
 * Model bazen hikâyeyi değiştirip şık kümesini eski bir sorudan aynen kopyalar; kök-benzerliği
 * bunu kaçırabilir. Küme karşılaştırması (sıra bağımsız, 5/5 birebir) bunu bedavaya yakalar.
 *
 * İKİ KORUMA (yanlış alarmın bilinen iki kaynağı):
 *  · ROMA kalıbı HARİÇ — "Yalnız I / I ve II / …" kümesi binlerce gerçek soruda ÖZDEŞ;
 *    hariç tutulmasa kapı ÖSYM'nin en yaygın kalıbını topyekûn kopya sayardı.
 *  · SAYISAL kümeler HARİÇ — ardışık tamsayı kümeleri ({1,2,3,4,5}) gerçek ÖSYM'de meşru
 *    olarak tekrar eder (eval taban oranı ölçümü). Kapı yalnız METİNSEL kümelere bakar;
 *    sayısal kopya zaten kök-benzerliğine takılır (sayılar maskeli olsa da senaryo aynıdır).
 */
export function celdiriciKumesiAyni(
  a: Record<string, string>,
  b: Record<string, string>,
): boolean {
  const va = Object.values(a).filter((x): x is string => typeof x === 'string' && !!x.trim())
  const vb = Object.values(b).filter((x): x is string => typeof x === 'string' && !!x.trim())
  if (va.length !== 5 || vb.length !== 5) return false
  if (va.every((x) => ROMA_KOMBIN.test(x.trim()))) return false // Roma → kural dışı
  if (va.every((x) => sayiya(x) !== null)) return false         // sayısal → kural dışı
  const ka = new Set(va.map(sikKanonik))
  const kb = new Set(vb.map(sikKanonik))
  if (ka.size !== 5 || kb.size !== 5) return false // küme içi tekrar varsa ölçme
  for (const x of ka) if (!kb.has(x)) return false
  return true
}
