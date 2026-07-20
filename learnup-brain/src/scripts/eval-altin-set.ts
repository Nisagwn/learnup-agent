/**
 * ALTIN SET — kusuru ÖNCEDEN BİLİNEN sorular; kod kapılarının regresyon yemi.
 *
 * Her kayıt "bu kapı bunu YAKALAMALI" ya da "bu temizi GEÇİRMELİ" iddiasıdır. Eval (2a) tüm
 * kapı zincirini bu set üzerinde koşturur: bir kapı kendi kusurunu kaçırırsa ya da temizi
 * yakarsa pipeline KIRMIZI düşer. Yöntem bu projede kendini kanıtladı: ucuz hakemlerin
 * çeldirici kuşatmasını kaçırdığı böyle ölçülmüş, kural koda taşınmıştı.
 *
 * Kayıtların çoğu GERÇEKTİR — ya DB'den birebir (çıkmış soru / üretilen ikizler) ya da bu
 * oturumda ölçülen bir arızanın asgari kopyası. Uydurma senaryo eklemeden önce düşün: kapılar
 * gerçek arızaları yakalamak için var, hayal edilenleri değil.
 */
import type { SikliSoru } from '../utils/shufflers.js'

export type AltinKayit = {
  ad: string
  /** Hangi kapının yakalaması bekleniyor — `null` = TEMİZ, hiçbir kapı takılmamalı. */
  kusur: 'tek-yanda' | 'uzunluk-sizintisi' | 'latex' | 'ham-mat' | 'gorsel-gonderme' | 'kopya' | null
  soru: SikliSoru & { soruMetni: string }
  /** kopya kusurunda: kime benzediği (kokBenzerligi bu çiftte eşiği aşmalı). */
  kopyaEsi?: string
}

const s = (
  soruMetni: string,
  siklar: [string, string, string, string, string],
  dogru: string,
): AltinKayit['soru'] => ({
  soruMetni,
  siklar: { A: siklar[0], B: siklar[1], C: siklar[2], D: siklar[3], E: siklar[4] },
  dogru,
  cozum: 'Adım adım çözüm burada yer alır; test amaçlı yeterince uzun bir metin.',
})

export const ALTIN_SET: AltinKayit[] = [
  // ── KUSURLU: her biri TEK kapının yemi ─────────────────────────────────
  {
    ad: 'tek-yanda: çeldiricilerin hepsi doğrunun altında (artan sırada hep E)',
    kusur: 'tek-yanda',
    soru: s('Bir sayının 3 katının 4 fazlası 28 olduğuna göre bu sayı kaçtır?', ['2', '4', '6', '7', '8'], 'E'),
  },
  {
    ad: 'uzunluk sızıntısı: doğru şık belirgin uzun (öğrenci okumadan işaretler)',
    kusur: 'uzunluk-sizintisi',
    soru: s(
      'Bir araştırmada iki değişken arasında pozitif ilişki gözlenmiştir. Bu bulguyla ilgili aşağıdakilerden hangisi doğrudur?',
      ['Kısa yanlış bir', 'Kısa yanlış iki', 'Yorum, iki değişken arasındaki ilişkililiğin neden-sonuç ilişkisi olduğu yanılgısını içermektedir', 'Kısa yanlış üç', 'Kısa yanlış dört'],
      'C',
    ),
  },
  {
    ad: 'latex: sarmalanmamış \\frac (öğrenci ekranda ham komut görür)',
    kusur: 'latex',
    soru: s('Bir bölme işleminin sonucu \\frac{3}{4} olduğuna göre bölünen kaçtır?', ['$9$', '$12$', '$15$', '$18$', '$21$'], 'B'),
  },
  {
    ad: 'ham-mat: sarmalsız üs x^2 (sayısal ailede yakalanır)',
    kusur: 'ham-mat',
    soru: s('f(x) = x^2 + 3x fonksiyonunun minimum değeri kaçtır?', ['$-3$', '$-\\frac{9}{4}$', '$-2$', '$-\\frac{3}{4}$', '$0$'], 'B'),
  },
  {
    ad: 'görsel gönderme: AI sorusu var olmayan grafiğe işaret ediyor',
    kusur: 'gorsel-gonderme',
    soru: s(
      'Bir f fonksiyonunun grafiği aşağıda verilmiştir. Buna göre f fonksiyonunun x eksenini kestiği noktaların apsisleri toplamı kaçtır?',
      ['$-2$', '$-1$', '$0$', '$1$', '$2$'], 'C',
    ),
  },
  {
    // KAPININ GERÇEK HEDEFİ: sayı-değişik BİREBİR kopya — maske sonrası ~özdeş metin.
    // (Charter ÖZGÜNLÜK maddesi: "aynı senaryo + değişmiş sayılar = kopyadır".)
    ad: 'kopya: aynı soru, yalnız sayılar değişmiş (maske sonrası özdeş)',
    kusur: 'kopya',
    soru: s(
      'Dik koordinat düzleminde A(1, 6) ve B(9, 4) noktaları veriliyor. C noktası [AB] doğru parçasını |AC| = 3|BC| olacak şekilde içten bölen noktadır. D noktası ise A ve B noktalarına eşit uzaklıkta olup y ekseni üzerindedir. Buna göre, C ve D noktalarından geçen doğrunun eğimi kaçtır?',
      ['$\\frac{11}{9}$', '$\\frac{4}{3}$', '$\\frac{22}{9}$', '$\\frac{25}{9}$', '$3$'], 'C',
    ),
    kopyaEsi:
      'Dik koordinat düzleminde A(2, 4) ve B(8, 2) noktaları veriliyor. C noktası [AB] doğru parçasını |AC| = 2|BC| olacak şekilde içten bölen noktadır. D noktası ise A ve B noktalarına eşit uzaklıkta olup y ekseni üzerindedir. Buna göre, C ve D noktalarından geçen doğrunun eğimi kaçtır?',
  },
  {
    // İLK YARGININ MEZAR TAŞI — bu çift "yakın kopya" diye damgalanmıştı; korpus çürüttü.
    // NN=0.311, gerçek ÖSYM Matematik p90'ı 0.473: "Dik koordinat düzleminde A(#,#)…" açılışı
    // MEŞRU bir kalıptır ve ÖSYM kendisi bundan yoğun tekrar eder. Kalıp paylaşımı ≠ kopya.
    // Bu fixture, eşik bir gün global/sıkı yapılırsa KIRMIZI yanar ve o hatayı geri getirtmez.
    ad: 'temiz: kalıp paylaşan iki FARKLI soru (koordinat açılışı — ÖSYM-normali, kopya DEĞİL)',
    kusur: null,
    soru: s(
      'Dik koordinat düzleminde A(2, 4) ve B(6, 2) noktaları veriliyor. ABC bir ikizkenar üçgen olup |AC| = |BC| dir. C noktası y = x doğrusu üzerinde olduğuna göre, C noktasının koordinatları toplamı kaçtır?',
      ['6', '8', '10', '12', '16'], 'C',
    ),
    kopyaEsi:
      'Dik koordinat düzleminde A(2, 4) ve B(8, 2) noktaları veriliyor. C noktası [AB] doğru parçasını |AC| = 2|BC| olacak şekilde içten bölen noktadır. D noktası ise A ve B noktalarına eşit uzaklıkta olup y ekseni üzerindedir. Buna göre, C ve D noktalarından geçen doğrunun eğimi kaçtır?',
  },

  // ── TEMİZ: gerçek ÖSYM soruları — HİÇBİR kapı takılmamalı ──────────────
  {
    ad: 'temiz: kutular sorusu (gerçek ÖSYM — kısa ama zor; giriş gizli)',
    kusur: null,
    soru: s(
      'Aşağıdaki kutuların içine 2, 3, 4, 5, 6, 7, 8 ve 9 sayıları, her kutuya farklı bir sayı gelecek biçimde yerleştirildiğinde tüm eşitlikler sağlanmaktadır. Buna göre A + B toplamı kaçtır?',
      ['13', '14', '15', '16', '17'], 'C',
    ),
  },
  {
    ad: 'temiz: Hayber sorusu (gerçek ÖSYM — ayırt etme; Hudeybiye şıkkı uzun ama sızıntı değil)',
    kusur: null,
    soru: s(
      'Hicret\'ten sonra müşriklerin Müslümanlara karşı baskı ve saldırıları sürmüş, bazen çatışma bazen de antlaşmalarla ikili ilişkiler devam etmiştir. Buna göre aşağıdakilerden hangisi Müslümanlar ile müşrikler arasında gerçekleşen gelişmelerden biri değildir?',
      ['Bedir Savaşı', 'Hudeybiye Antlaşması', 'Mekke\'nin Fethi', 'Hendek Savaşı', 'Hayber\'in Fethi'], 'E',
    ),
  },
  {
    ad: 'temiz: roma kombinasyon şıkları (ÖSYM\'nin en yaygın kalıbı — hiçbir kapı Roma\'ya takılmamalı)',
    kusur: null,
    soru: s(
      'Mezopotamya\'da ziggurat adı verilen yapılar I. gök cisimlerinin izlenmesi, II. ibadetlerin yerine getirilmesi, III. kral mezarı olarak kullanılması işlevlerinden hangileri için kullanılmıştır?',
      ['Yalnız I', 'Yalnız II', 'I ve II', 'I ve III', 'I, II ve III'], 'C',
    ),
  },
  {
    // İlk sürümün şıkları ($-2..$3$, doğru B) kuşatma kapısına TAKILDI — fixture kusurluydu,
    // kapı haklıydı (alt=1). Pipeline ilk koşusunda kendi yemini yakaladı; şıklar 2-2 yapıldı.
    ad: 'temiz: LaTeX\'li sayısal soru (sarmalı doğru — ham-mat ve latex kapıları geçirmeli)',
    kusur: null,
    soru: s(
      'Gerçel sayılarda tanımlı $f(x) = x^2 - 4x + 3$ fonksiyonunun en küçük değeri kaçtır?',
      ['$-3$', '$-2$', '$-1$', '$0$', '$1$'], 'C',
    ),
  },
  {
    // İlk sürümde doğru cevap en küçük değerdi (çarpım $-9$, şık A) → kuşatma 'tek-yanda' dedi.
    // Gerçek ÖSYM'de uç-değer cevap MEŞRU (harf dağılımı düzgün, uçlar dahil) ama bu fixture'ın
    // işi görsel-gönderme dar desenini sınamak — kuşatma tartışmasına bulaşmasın diye 2-2'lendi.
    ad: 'temiz: meşru metinsel grafik göndermesi ("grafiği x eksenini keser" — dar desen yakalamamalı)',
    kusur: null,
    soru: s(
      'Gerçel sayılarda tanımlı $f(x) = x^2 - 9$ fonksiyonunun grafiği x eksenini iki noktada kesmektedir. Bu noktaların apsisleri çarpımı kaçtır?',
      ['$-12$', '$-10$', '$-9$', '$-6$', '$-3$'], 'C',
    ),
  },
]
