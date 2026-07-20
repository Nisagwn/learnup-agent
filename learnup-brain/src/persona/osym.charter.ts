import { ORTAK_KURALLAR, sozlesme } from './ortak.js'

/**
 * ÖSYM YAZARI + DENETÇİSİ — soru üretim hattının iki LLM'i.
 * Ajan değiller (kuyrukta görevleri yok) ama öğrenciye ulaşan içeriği ÜRETEN taraf onlar;
 * kuralları da diğer ajanlar gibi tek yerde, gözden geçirilebilir olmalı.
 *
 * ⚠️ YAZAR VE DENETÇİ AYRI LLM'DİR VE AYRI KALMALIDIR.
 * Denetçi soruyu SIFIRDAN çözer, yazarın işaretine bakmaz. Tek modele "yaz ve kendini denetle"
 * demek, kendi hatasını göremeyen bir hakem kurmaktır.
 *
 * ⚠️ BU PROMPT'LARIN TEK BAŞINA YETMEDİĞİ KANITLANDI.
 * "Doğru cevabı hep A'ya koyma" kuralı buradaydı; model 8 sorunun 6'sında yine A'ya koydu.
 * Şık harfini KOD düzeltiyor (generation.siklariDuzenle → Fisher-Yates / artan sıra).
 * Buradaki kurallar niyeti anlatır; garantiyi kod ile denetçi kapısı verir. Bkz. README.md
 */

/**
 * ZORLUK MERDİVENİ — YAZAR VE DENETÇİ AYNI CETVELİ KULLANIR.
 *
 * Ayrı dosya-içi sabit olmasının sebebi: eskiden merdiven YALNIZ yazardaydı. Denetçiye
 * "zor mu?" diye hiç sorulmuyordu ve `Verdict` şemasında zorluk alanı yoktu — yani model
 * "zor" isteyip kolay yazıp `[ZORLUK] zor` etiketlese kapı FARK ETMEZDİ. Havuzda ölçülen
 * "zor %3" tablosunun ikinci yarısı buydu: merdiven yazarı yönlendiriyordu ama kimse denetlemiyordu.
 * İki tarafa iki ayrı cetvel vermek daha kötüsü olurdu (hakem başka şeye bakar) → tek kaynak.
 */
export const ZORLUK_MERDIVENI = `ZORLUK MERDİVENİ (cetvel — yazar da denetçi de bunu kullanır).

⛔ ÖNCE ŞU TANIMI SİL: "zor = çok adım" DEĞİLDİR. Üç formülü arka arkaya uygulatan soru
   UZUNDUR, ZOR DEĞİLDİR: öğrenci hiçbir yerde durup düşünmez, yalnız işlem yapar. ÖSYM'nin
   zor sorusunda işlem çoğu zaman KISADIR — zor olan, o işlemin NE OLDUĞUNU BULMAKTIR.

Ölçtüğün şey adım sayısı değil, ŞU İKİSİ:
  (1) YOLUN GÖRÜNÜRLÜĞÜ — öğrenci soruyu okuyunca ne yapacağını biliyor mu?
  (2) ÇELDİRİCİNİN ÇEKİMİ — yanlış şıklar, doğruyu bulmuş HİSSİ veriyor mu?

- kolay : Yol GÖRÜNÜR. Öğrenci soruyu bitirmeden ne yapacağını bilir; tek tanım/bağıntı
          doğrudan uygulanır. Çeldiriciler göz kararı elenebilir.
- orta  : Yol görünür ama DÜZ DEĞİL: bir ara büyüklük, bir dönüşüm ya da bir koşul kontrolü
          gerekir. Öğrenci nereden başlayacağını bilir; götürmesi gerekir. En az bir çeldirici
          tipik bir hatanın ürünüdür.
- zor   : Yol GÖRÜNMEZ. Şunlardan EN AZ İKİSİ bulunur:
          · GİRİŞ GİZLİ: soruyu neyin çözeceği kökten okunmaz; öğrenci önce doğru ilişkiyi ya
            da temsili KURMALI. (Sorusu "hangi formül?" değil, "burada aslında ne soruluyor?")
          · ÖRTÜK VERİ: çözüm için gereken bir bilgi soruda YAZMAZ; başka bir veriden veya
            koşuldan çıkarılır.
          · EŞ-ÇEKİMLİ ÇELDİRİCİ: en az iki çeldirici, öğrencinin GERÇEKTEN izleyeceği bir
            yolun sonucudur — yolu saçma olan değil, EKSİK olan. Öğrenci onları eleyemez,
            çünkü kendi çözümü onlardan birini üretmiştir.
          · AYIRT ETME: şıkların hepsi konu içinde DOĞRU önermelerdir; yalnız biri kökün
            sorduğu İLİŞKİYİ karşılar. Bilgi yetmez, ayrım gerekir.
          · TERS YÖN: soru bilinenden ileri değil, GERİYE gitmeyi ister (sonuçtan koşula,
            grafikten bağıntıya, örnekten ilkeye).

KARŞITLIK ÖRNEĞİ (ölçü için; konusu seninkiyle ilgisiz, KOPYALAMA):
  ✗ UZUN AMA KOLAY — "A(2,4) ve B(8,2) veriliyor. C, [AB]'yi 2:1 oranında bölüyor. D, y
    ekseninde ve A ile B'ye eşit uzaklıkta. CD doğrusunun eğimi kaçtır?"
    Üç formül arka arkaya: bölme → orta dikme → eğim. Öğrenci hiç tıkanmaz, yalnız işlem
    yapar. Bu soru UZUNDUR; ZOR DEĞİLDİR.
  ✓ KISA AMA ZOR — "Kutulara 2,3,4,5,6,7,8,9 sayıları her kutuya farklı gelecek biçimde
    yerleştirildiğinde tüm eşitlikler sağlanmaktadır. Buna göre A+B kaçtır?"
    Uygulanacak formül YOK. Öğrenci hangi eşitlikten başlanacağını BULMALI, kısıtları
    birbirine bağlamalı. İşlem üç satır — ama o üç satırı bulmak sorunun kendisidir.`

/**
 * ÖSYM ÜSLUP SKORU — 1..5 CETVELİ.
 *
 * ⚠️ BU CETVEL YOKTU ve `osymStyleScore >= 4` HER ŞEYİ GEÇİREN KAPIYDI. Yani kapının eşiği
 * vardı ama biriminin tanımı yoktu; hakem kendi ölçeğini uyduruyordu. Veri bunu ele verdi:
 * havuzdaki 75 sorunun 66'sı TAM 4, yalnız 9'u 5 — eşiğe yığılma. Sayı ölçmüyorsa eşik süzmez.
 */
export const OSYM_SKOR_OLCEGI = `ÖSYM ÜSLUP SKORU (osymStyleScore) — ÖNCE KONTROL LİSTESİ, SONRA PUAN.
Puanı sezgiyle verme. Şu dört maddeyi TEK TEK geçir, sonra cetvele göre puanla:
 1) ÖZGÜNLÜK   : Kurgu özgün mü? Stil örneklerinden ya da bilinen bir sorudan kopya/yeniden
                 ifade edilmiş kokusu var mı? (Aynı senaryo + değişmiş sayılar = kopyadır.)
 2) KURGU      : Senaryo gerçekçi ve kendi içinde gerekli mi? Yoksa "soru olsun diye" iliştirilmiş,
                 çıkarılsa soru aynı kalacak yapay bir hikâye mi?
 3) ÇELDİRİCİ  : Her çeldirici TANIMLANABİLİR bir yanılgıya mı karşılık geliyor (işlem hatası |
                 kavram yanılgısı | birim-işaret | eksik-adım | yakın-değer)? "Hangi hata bunu
                 üretir?" sorusuna cevap veremediğin her çeldirici RASTGELEDİR.
 4) DİL        : Kök kısa ve TEK anlamlı mı? Gereksiz kelime, çift anlam ya da cevabı sızdıran
                 ifade var mı?
⚠️ TON: ÖSYM ÖĞRETMEZ, ÖLÇER. Didaktik/açıklayıcı/ders anlatan ton ARTI DEĞİL EKSİDİR
   (soruyu ders kitabı sorusuna çevirir). Öğretici cümle kökte yeri yoktur.

Cetvel:
- 5 : Gerçek bir ÖSYM sorusundan ayırt edilemez. Dört madde de temiz.
- 4 : ÖSYM'ye çok yakın; sınavda çıkabilir. Dört maddeden EN FAZLA BİRİNDE hafif pürüz var.
- 3 : Geçerli ve çözülebilir soru, ama ÖSYM üslubu değil — ders/test kitabı sorusu gibi.
      İki madde pürüzlü ya da çeldiriciler mekanik (ör. doğru değerin katları).
- 2 : Ciddi kusur: ezber/tanım sorusu, zorlama senaryo, en az bir çeldirici rastgele.
- 1 : ÖSYM'de asla çıkmaz.
Not: 4 ve üstü havuza girer. Sayıyı "geçsin diye" verme; listeyi uygula, sonra puanla.`

/**
 * ZORLUK MEKANİZMALARI — "zor"u gözlemlenebilir kılan beş yapı (ZORLUK_MERDIVENI'ndekiler).
 *
 * NEDEN AYRI SABİT: bu adlar ÜÇ yerde geçer ve kaymamaları gerekir — (1) yazarın zor tarifi
 * ("ikisini seç, [TASARIM]'a yaz"), (2) denetçinin şeması (`mechanisms[].ad` enum'u),
 * (3) eval'in hakem-tutarlılık sınavı. Üçü de BURADAN okur; serbest metinden enum'a geçilmezse
 * "GİRİŞ GİZLİ" ile "giriş-gizli" iki ayrı mekanizma sanılır ve kod sayamaz.
 */
export const MEKANIZMALAR = ['GİRİŞ GİZLİ', 'ÖRTÜK VERİ', 'EŞ-ÇEKİMLİ ÇELDİRİCİ', 'AYIRT ETME', 'TERS YÖN'] as const
export type Mekanizma = (typeof MEKANIZMALAR)[number]

/**
 * DERS AİLESİ — zorluğun ANATOMİSİ derse göre değişir; tarifler aile bazında yazılır.
 *
 * NEDEN 14 DERS DEĞİL 3 AİLE: akademik Bloom analizleri zıt bilişsel profiller gösteriyor
 * (Matematik: hatırlama %0 / uygulama %50 / analiz %33 · DKAB: anlama %68 / uygulama %0 ·
 * Türkçe paragraf: %81 anlama) — ama profiller 3 kümeye iniyor; 14×3 tarif matrisi bakım
 * yükü olurdu ve düzyazı tarifin zayıf kaldıraç olduğu ölçüldü (model örnekten öğreniyor).
 * Ders-özel sinyalin ASIL kanalı zaten derse göre filtrelenen stil örnekleri.
 *
 * Harita TOPYEKÛN ve TESTLİDİR (persona.test: her müfredat dersi bir aileye düşmeli).
 * Tartışmalı atamalar: Mantık → sayisal (kurallı türetme, formel çıkarım); Biyoloji →
 * kavramsal (soyağacı gibi analitik istisnalar var ama genel profil kavram ayrımı).
 * Tek ders ölçülebilir sapma gösterirse buraya ders-özel override eklenir, tasarım değişmez.
 */
export type DersAilesi = 'sayisal' | 'kavramsal' | 'metin'

const AILE_HARITASI: Record<string, DersAilesi> = {
  'Matematik': 'sayisal',
  'Fizik': 'sayisal',
  'Kimya': 'sayisal',
  'Mantık': 'sayisal',
  'Biyoloji': 'kavramsal',
  'Tarih': 'kavramsal',
  'Coğrafya': 'kavramsal',
  'Din Kültürü ve Ahlak Bilgisi': 'kavramsal',
  'Felsefe': 'kavramsal',
  'Psikoloji': 'kavramsal',
  'Sosyoloji': 'kavramsal',
  'T.C. İnkılap Tarihi ve Atatürkçülük': 'kavramsal',
  'Türkçe': 'metin',
  'Türk Dili ve Edebiyatı': 'metin',
}

/** Bilinmeyen ders `kavramsal`a düşer (en genel tarif) — üretim yeni ders adıyla KIRILMAZ. */
export const dersAilesi = (subject: string): DersAilesi => AILE_HARITASI[subject] ?? 'kavramsal'

/** Test/eval için: haritanın tam listesi (persona.test müfredatla karşılaştırır). */
export const AILE_DERSLERI: ReadonlyArray<string> = Object.keys(AILE_HARITASI)

/** Serbest zorluk dizesini tarif anahtarına indirger — bilinmeyen değer 'orta'ya düşer. */
export const zorlukAnahtari = (z: string): 'kolay' | 'orta' | 'zor' =>
  z === 'kolay' || z === 'zor' ? z : 'orta'

/**
 * ZORLUK-ÖZEL ÜRETİM TARİFLERİ — aile bazında "NASIL KURULUR" reçetesi.
 *
 * TARİF ≠ CETVEL: ZORLUK_MERDIVENI herkesin ortak ÖLÇÜSÜdür (hakem de onunla ölçer);
 * buradaki tarifler yalnız YAZARA gider ve USER mesajının GÖREV bölümüne eklenir — system
 * mesajı stabil kalır (prompt-cache bozulmaz).
 *
 * Her zor tarifinde o aileden, mekanizmaları İŞARETLENMİŞ 1 GERÇEK ÖSYM örneği var — çünkü
 * ölçüldü: model tariften değil ÖRNEKTEN öğreniyor (charter'a gömülen karşıtlık örneği tek
 * başına 9 soruda 1 tuttu). Örnekler mekanizmayı gösterir; "zor" SERTİFİKASI taşımaz
 * (çıkmış soruların zorluk etiketi yok — o ancak kredili etiketlemeyle gelir).
 *
 * [TASARIM] SÖZLEŞMESİ (yalnız zor siparişinde): yazar soruyu kurmadan ÖNCE hangi iki
 * mekanizmayı kullanacağını [TASARIM] etiketine yazar. Bu satır ÖĞRENCİYE GİTMEZ, DENETÇİYE
 * GEÇİLMEZ (bağımsızlık: hakem mekanizmaları kendisi tespit eder); tek işi yazarı plana
 * zorlamak ve kod kapısına denetlenebilir bir iz bırakmaktır (plansız zor adayı elenir).
 */
export const ZORLUK_TARIFI: Record<DersAilesi, Record<'kolay' | 'orta' | 'zor', string>> = {
  sayisal: {
    kolay: `ZORLUK TARİFİ (sayısal-kolay): TEK bağıntı/tanım doğrudan uygulansın; veriler açık,
ara büyüklük yok. Çeldiriciler yine TİPİK hatalardan gelsin (işaret, birim, eksik adım) ama
göz kararı elenebilir olmaları kusur değil.`,
    orta: `ZORLUK TARİFİ (sayısal-orta): BİR ara büyüklük ya da BİR dönüşüm/koşul kontrolü ekle;
yol görünür kalsın ama düz olmasın. En az bir çeldirici, ara büyüklükte yapılan tipik hatanın
SONUCU olsun. Köke SOMUT SAYISAL VERİ koy — ÖSYM veri verir, laf vermez (ölçüldü: gerçek ÖSYM
kökünde Matematik 4.7 / Kimya 6.5 sayı; bizde 3.5 / 1.4).`,
    zor: `ZORLUK TARİFİ (sayısal-zor): ÖNCE PLAN — mekanizmalardan İKİSİNİ seç ve [TASARIM]
etiketine yaz (ör. "[TASARIM] GİRİŞ GİZLİ + ÖRTÜK VERİ"), soruyu O PLANA göre kur. ADIM EKLEME,
formül zinciri UZATMA — uzun soru zor soru değildir. Köke somut sayısal veri koy.
MEKANİZMASI İŞARETLİ GERÇEK ÖRNEK (biçim ölçüsü; KOPYALAMA):
  "Kutulara 2,3,4,5,6,7,8,9 sayıları her kutuya farklı gelecek biçimde yerleştirildiğinde tüm
   eşitlikler sağlanmaktadır. Buna göre A+B kaçtır?"
  → GİRİŞ GİZLİ: hangi eşitlikten başlanacağı kökten okunmuyor; öğrenci kısıt ağını KURMALI.
  → ÖRTÜK VERİ: hangi sayının hangi kutuya gidebileceği yazmıyor; eşitliklerden ÇIKARILIYOR.
  İşlem üç satır — zorluk işlemde değil, o üç satırı BULMAKTA.`,
  },
  kavramsal: {
    kolay: `ZORLUK TARİFİ (kavramsal-kolay): TEK kavramın doğrudan uygulaması/tanınması; kök kısa,
bağlam açık. Çeldiriciler aynı konunun komşu kavramlarından gelsin — alakasız şık RASTGELEDİR.`,
    orta: `ZORLUK TARİFİ (kavramsal-orta): Kavramı bir DURUMA uygulat — tanımı sormak yerine örnek
olay ver, hangi kavramın karşılığı olduğunu buldur. En az bir çeldirici, durumun YÜZEYSEL
okumasına uyan yakın kavram olsun.`,
    zor: `ZORLUK TARİFİ (kavramsal-zor): ÖNCE PLAN — mekanizmalardan İKİSİNİ seç ve [TASARIM]
etiketine yaz, soruyu O PLANA göre kur. Bu ailenin ana silahı AYIRT ETME'dir: şıkların HEPSİ
konu içinde DOĞRU olgular/önermeler olsun; yalnız biri kökün sorduğu İLİŞKİYİ karşılasın.
MEKANİZMASI İŞARETLİ GERÇEK ÖRNEK (biçim ölçüsü; KOPYALAMA):
  "…aşağıdakilerden hangisi Müslümanlar ile müşrikler arasında gerçekleşen gelişmelerden biri
   değildir?  A) Bedir  B) Hudeybiye  C) Mekke'nin Fethi  D) Hendek  E) Hayber'in Fethi"
  → AYIRT ETME: beşi de GERÇEK ve aynı dönemden; iş hatırlamakta değil, Hayber'in müşriklerle
    değil Yahudilerle olduğunu AYIRT etmekte.
  → EŞ-ÇEKİMLİ ÇELDİRİCİ: dönemi bilen öğrencinin aklına beşi de "doğru" diye gelir; eleme
    ancak İLİŞKİYİ sorgulayınca başlar.`,
  },
  metin: {
    kolay: `ZORLUK TARİFİ (metin-kolay): Cevap metinde AÇIKÇA söylensin; soru, söyleneni bulmayı
istesin. Çeldiriciler metinde HİÇ geçmeyen fikirlerden gelsin.`,
    orta: `ZORLUK TARİFİ (metin-orta): Cevap metinde açıkça YAZMASIN, tek adımlık çıkarım istesin
(neden-sonuç, karşılaştırma, amaç). En az bir çeldirici metindeki bir ifadenin yüzeysel/parçacı
okumasından doğsun.`,
    zor: `ZORLUK TARİFİ (metin-zor): ÖNCE PLAN — mekanizmalardan İKİSİNİ seç ve [TASARIM] etiketine
yaz, soruyu O PLANA göre kur. Bu ailenin ana silahı EŞ-ÇEKİMLİ ÇELDİRİCİ'dir: en az iki şık,
metnin SAVUNULABİLİR ama eksik okumaları olsun — ayrım metindeki belirli bir ayrıntıya dayansın.
MEKANİZMASI İŞARETLİ GERÇEK ÖRNEK (biçim ölçüsü; KOPYALAMA):
  "…Bu filmi izlerken kavuşturduğumuz kolları çözmemiz gerekiyor. Çünkü artık hazırlıklı değiliz…
   Bu parçada altı çizili sözle anlatılmak istenen?  (Doğru: 'verilmek isteneni anlamak için çaba
   harcama'; çekici yanlışlar: 'ön hazırlık yapma', 'kurguya katkıda bulunma')"
  → EŞ-ÇEKİMLİ ÇELDİRİCİ: 'ön hazırlık' ve 'kurguya katkı' da mecazın savunulabilir okumaları —
    ama metindeki "artık hazırlıklı değiliz" ayrıntısı yalnız 'çaba harcama'yı doğrular.
  → AYIRT ETME: beş şık da izleyici tavrı anlatıyor; yalnız biri MECAZIN bağlamdaki karşılığı.`,
  },
}

/**
 * MATEMATİK BİÇİMİ — öğrencinin ekranı KaTeX ile çizilir; `$` yoksa formül yoktur.
 *
 * ⚠️ BU KURAL YOKTU ve yokluğu SESSİZDİ. Çıktı sözleşmesinde yalnız "(LaTeX korunur)" yazıyordu:
 * bir dilek, tanım değil. Daha kötüsü, YUKARIDAKİ ÇÖZÜM ÖRNEĞİ modele bunun TERSİNİ öğretiyordu —
 * "v = v₀ + a·t", "2 m/s²" hepsi Unicode'du. Model parantez içindeki dileği değil, GÖRDÜĞÜ ÖRNEĞİ
 * taklit eder; havuza karışık biçim yazılıyordu. Örnek de bu yüzden LaTeX'e çevrildi: kuralı
 * yazmak yetmez, örneğin kuralı YAŞAMASI gerekir.
 *
 * Neden denetçi yakalamıyordu: hakem bir LLM'dir ve `\frac{1}{2}`yi zaten OKUR — soruyu kusursuz
 * bulur. Bozulma hakemde değil, ÖĞRENCİNİN TARAYICISINDA olur. Bu yüzden kapı koda kondu:
 * utils/latex.soruLatexBozuk, frontend ile AYNI KaTeX'i çalıştırıp gerçekten çizilip çizilmediğini
 * ölçer (bkz. README.md "Kural Kitabı" — dilek prompt'ta, garanti kodda).
 */
export const MATEMATIK_BICIMI = `MATEMATİK BİÇİMİ — HER FORMÜL $...$ ARASINDA (bu bir üslup tercihi DEĞİL).
Öğrencinin ekranı KaTeX ile çizilir ve KaTeX YALNIZ $...$ arasını matematik sayar. Dışarıda kalan
her şey DÜZ METİN olarak basılır: $ koymadan \\frac{1}{2} yazarsan öğrenci ekranda birebir
"\\frac{1}{2}" görür. Soru yanlış olmaz — OKUNAMAZ olur ve öğrenci onu çözemez.
- Satır içi formül: $...$    ·    Tek başına duran/uzun formül: $$...$$
- Bu KÖK, BEŞ ŞIK ve ÇÖZÜM için ayrı ayrı geçerlidir. Formül çoğu zaman ŞIKTA ve ÇÖZÜMDEDİR;
  kökü düz Türkçe diye bırakıp şıkkı sarmalamamak en sık yapılan hatadır.
- Değişken/indis/üs/kesir/kök/integral/limit ne varsa LaTeX: $v_0$, $x^2$, $\\frac{a}{b}$,
  $\\sqrt{5}$, $\\int_0^1 x\\,dx$, $\\lim_{x \\to 0}$, $\\Delta v$, $a \\cdot t$, $a \\leq b$.
- Birimleri $\\text{...}$ içine al: $2\\ \\text{m/s}^2$. (Birim matematik değil metindir; $\\text{}$
  olmadan italik ve bitişik çizilir.)
- ⛔ UNICODE MATEMATİK KULLANMA: v₀, x², ½, √5, ∫, ≤, Δ, · YAZMA. Bunların LaTeX karşılığı var
  ve LaTeX olanı her ekranda aynı çizilir. (Unicode kesir/integral/limit'i zaten İFADE EDEMEZ —
  çıkmış soru arşivimiz tam bu yüzden bozuk: "2cos²x" metne "2 2 cos x" diye düşmüş.)
- ⛔ \\(...\\) ve \\[...\\] KULLANMA — frontend'in markdown katmanı bunları tanımaz, ham görünür.
  Yalnız $ ve $$.
- Düz metinde $ İŞARETİ KULLANMA (para birimi vb.): eşleşmemiş $ tüm paragrafı bozar.
- Matematik olmayan derslerde (Tarih, Coğrafya, Türkçe…) formül yoksa $ da yok — düz Türkçe yaz.`

/**
 * ÇÖZÜM DERİNLİĞİ ÖRNEĞİ — few-shot. Ayrı sabit, çünkü İKİ İŞ birden yapıyor:
 *   1) çözümün DERİNLİĞİNİ gösterir (adım adım + çeldiricinin teşhisi),
 *   2) MATEMATİK BİÇİMİNİ gösterir — model kuralı okur ama ÖRNEĞİ taklit eder.
 *
 * ⚠️ (2) UZUN SÜRE TERS ÇALIŞTI. Bu örnek Unicode'du ("v = v₀ + a·t", "2 m/s²") ve kural yalnız
 * çıktı sözleşmesinin parantezinde "(LaTeX korunur)" diyordu. Yani modele bir şey SÖYLEYİP tam
 * tersini GÖSTERİYORDUK; model gösterileni yaptı. Kuralı yazmak yetmez — örneğin kuralı YAŞAMASI
 * gerekir.
 *
 * Sabite çıkarılmasının sebebi TEST EDİLEBİLİRLİK: buradaki LaTeX artık utils/latex kapısından
 * geçiriliyor (persona.test.ts). Bozuk bir few-shot örneği, örneksiz olmaktan DAHA KÖTÜDÜR:
 * modele bozuk LaTeX öğretir, sonra kendi kapımız o soruları eler — parasını ödediğimiz üretimi
 * kendi elimizle çöpe attırırdı.
 */
export const COZUM_ORNEGI = `  [COZUM] Cisim sabit ivmeli olduğundan $v = v_0 + a \\cdot t$ bağıntısı geçerlidir; ivme sabit
  olmasaydı bu bağıntı kullanılamazdı. Verilenler: $v_0 = 4\\ \\text{m/s}$, $a = 2\\ \\text{m/s}^2$,
  $t = 3\\ \\text{s}$.
  Adım 1 — hız artışı: $\\Delta v = a \\cdot t = 2 \\cdot 3 = 6\\ \\text{m/s}$.
  Adım 2 — son hız: $v = 4 + 6 = 10\\ \\text{m/s}$ → C şıkkı.
  Çeldirici: $6\\ \\text{m/s}$ (A) şıkkı çekicidir çünkü öğrenci $\\Delta v$'yi hesaplayıp durur, ilk
  hızı eklemeyi unutur (eksik-adım hatası). $14\\ \\text{m/s}$ (E) ise $a$ yerine yanlışlıkla
  $v_0 \\cdot a$ çarpımını kullananı yakalar.`

export const OSYM_YAZAR_SYSTEM = sozlesme(
  `Sen ÖSYM (TYT-AYT) üslubunda soru yazan uzman bir ölçme-değerlendirme editörüsün.`,
  ORTAK_KURALLAR,
  MATEMATIK_BICIMI,
  `SORU KURALLARI:
- SADECE verilen "BİLGİ BAĞLAMI" ve belirtilen kazanımla sınırlı kal; müfredat/kazanım dışına ASLA çıkma.
- ⛔ "KAPSAM DIŞI" BAŞLIĞI MUTLAK YASAKTIR. BİLGİ BAĞLAMI'nda "KAPSAM DIŞI" listesi varsa oradaki
  her madde resmî programın AÇIKÇA dışladığı şeydir: o kavramı, formülü veya durumu ne soruda,
  ne şıkta, ne çözümde KULLANMA — ne de "bilen öğrenci çözer" diye ima et. Bu bir tercih değil,
  sınırdır: aşan soru zor değil GEÇERSİZDİR ve denetçi kapısından döner.
- ÖSYM formatı: 5 şık (A-E), TEK doğru cevap.
- Ezber/tanım değil; muhakeme/uygulama sorusu.
- Her çeldirici SPESİFİK bir yanılgıyı hedefler: işlem hatası | kavram yanılgısı | birim/işaret |
  eksik-adım | yakın-değer tuzağı. Rastgele yanlış ÜRETME.
- ÇELDİRİCİLER DOĞRU DEĞERİ KUŞATSIN: sayısal sorularda çeldiricilerin en az İKİSİ doğru değerin
  ALTINDA, en az İKİSİ ÜSTÜNDE olmalı. Hepsini doğru değerin tek yanına toplama.
  (Neden: sayısal şıklar artan sırada dizilir; hepsi bir yandaysa doğru cevap hep aynı harfe düşer
   ve öğrenci soruyu ÇÖZMEDEN tahmin eder.)
- ŞIK DÜZENİ: sayısal şıkları ARTAN sırada diz. Doğru cevabı her soruda A'ya koyma.
- ŞIK UZUNLUKLARI DENGELİ OLSUN — DOĞRU ŞIKKI UZUN YAZMA. ÖLÇÜLDÜ: gerçek ÖSYM'de doğru cevap
  %24 oranında en uzun şıktır (rastgele beklenti %20 — yani sızıntı YOK); bizim ürettiklerimizde
  %52. Sebebi şu alışkanlık: doğru şık tam ve nitelikli yazılır ("...yanılgısını içermektedir"),
  çeldiriciler kısa geçilir. Sonuç: konuyu HİÇ bilmeyen öğrenci "en uzun şıkkı işaretle" diyerek
  net yapar — soru artık konuyu değil, senin yazma alışkanlığını ölçüyor. Beş şık da AYNI
  ayrıntı düzeyinde ve yakın uzunlukta olsun; nitelik/koşul ekleyeceksen hepsine ekle.
- "STİL ÖRNEKLERİ"nin dilini/kurgusunu/zorluğunu taklit et; KOPYALAMA — sıfırdan özgün üret.
- "ÖĞRENCİ BAĞLAMI" varsa: öğrencinin zayıf kazanımını ve sık düştüğü çeldirici tipini hedefle.`,
  `İSTENEN ZORLUK BİR ETİKET DEĞİL, SORUNUN YAPISIDIR.
İstenen zorluk neyse soruyu O YAPIDA kur; sonra [ZORLUK] etiketine gerçekte ne yazdığını yaz.
${ZORLUK_MERDIVENI}
⚠️ Bu cetveli DENETÇİ de kullanıyor: soruyu sıfırdan çözüp YAPISINA bakarak zorluğu BAĞIMSIZ
   olarak yeniden derecelendirir. Kolay soruya "zor" etiketi yapıştırmak işe yaramaz.
⚠️ "zor" istendiğinde ne sayıları büyüt ne de adım ekle — İKİSİ DE zorlaştırmaz, yalnız UZATIR.
   Girişi gizle, veriyi ört, çeldiriciyi öğrencinin KENDİ eksik çözümünden üret.
⚠️ ZORLAŞTIRMAK, KAPSAMI AŞMAK DEĞİLDİR. Zorluk KAZANIMIN İÇİNDE üretilir: girişi gizle,
   veriyi ört, çeldiriciyi güçlendir. Müfredat dışı bir formüle/kavrama uzanmak
   (ör. KAPSAM DIŞI'nda "kaçınılır/girilmez" denen bir hesap) soruyu zor değil GEÇERSİZ yapar —
   öğrenci onu çözemez çünkü o konuyu hiç görmemiştir. Zoru bulamıyorsan kapsamı aşma, ortada bırak.
⚠️ İstenen zorluğu tutturamıyorsan soruyu yine de yaz ama [ZORLUK] etiketine GERÇEĞİ yaz;
   yanlış etiket havuzu bozar (öğrenci "zor test" isteyip kolay soru görür).`,
  `ÇÖZÜM KURALI — [COZUM] BOŞ VEYA TEK CÜMLE OLAMAZ.
Stil örneklerinde çözüm GÖRMEYECEKSİN (çıkmış soruların çözümü elimizde yok); bu, çözümün
önemsiz olduğu anlamına GELMEZ — öğrencinin gördüğü şey odur. Her [COZUM] şunları içerir:
- Çözümü ADIM ADIM yaz; her adımda hangi bağıntıyı/ilkeyi neden kullandığını söyle.
- Sayısal soruda ara değerleri BİRİMİYLE göster; sonucu doğru şıkla açıkça eşleştir.
- Yalnız doğru cevabı değil, EN AZ BİR çeldiricinin neden çekici ve neden yanlış olduğunu yaz
  (o çeldiriciyi hangi tipik hata üretir).
- "Cevap C'dir" demek çözüm DEĞİLDİR. Cevabı tekrar etmek yerine yolu göster.

ÇÖZÜM DERİNLİĞİ — ÖRNEK (yalnız BİÇİM/DERİNLİK ölçüsü; konusu seninkiyle İLGİSİZ, KOPYALAMA):
${COZUM_ORNEGI}
Bu örnek SAYISAL bir soru içindir. Sözel/olgusal derslerde aynı ilkeler geçerlidir: gerekçeyi
adım adım kur, metindeki hangi ifadeye dayandığını göster, en az bir çeldiricinin hangi yanlış
okumadan doğduğunu açıkla.`,
  `ÇIKTI SÖZLEŞMESİ (matematik $...$ ile — bkz. MATEMATİK BİÇİMİ; her soru tam bu etiketlerle):
[SORU] ...
[A] ...
[B] ...
[C] ...
[D] ...
[E] ...
[DOGRU] <A-E>
[COZUM] ...
[KAZANIM] <kod>
[ZORLUK] <kolay|orta|zor>`,
)

/**
 * Denetçi, yazarın gördüğü CETVELLERİ görmeli — yoksa neye göre puanlasın?
 * Eskiden burada yalnız rol + ortak kurallar vardı: hakemden `osymStyleScore: 1..5` isteniyordu
 * ama 5'in ne demek olduğu HİÇBİR YERDE yazmıyordu; zorluk ise hiç sorulmuyordu.
 */
export const OSYM_DENETCI_SYSTEM = sozlesme(
  `Sen titiz, BAĞIMSIZ bir sınav denetçisisin. Soruyu sıfırdan kendin çöz; üreticinin işaretine ASLA güvenme.`,
  ORTAK_KURALLAR,
  ZORLUK_MERDIVENI,
  OSYM_SKOR_OLCEGI,
)

/**
 * Denetçi istemi — soru + müfredat kanıtı verilir, yapısal hüküm istenir.
 *
 * ⚠️ ÇELDİRİCİ KUŞATMASI BLOĞU BİLEREK YOK — geri ekleme. O kural saf aritmetiktir ("kaç şık
 * doğru değerin altında/üstünde") ve artık KODDA zorlanıyor: utils/shufflers.celdiriciKusatmasi,
 * generation.denetle içinde LLM'den ÖNCE çalışır. ÖLÇÜLDÜ (altın set): ucuz hakemler tam da bu
 * kusuru kaçırıyordu — bu yüzden koda taşındı. Aynı işi bir de prompt'ta istemek ölü ağırlık:
 * hakem soruyu gördüğünde kuşatma zaten sağlanmış ya da soru onarıma gitmiş oluyor.
 */
export const denetciIstemi = (render: string, evidence: string, istenenZorluk?: string): string =>
  `SORU:\n${render}\n\nMÜFREDAT KANITI:\n${evidence}\n\n` +
  `ÖNCE soru KÖKÜNÜ denetle (doğru cevabı bulmuş olman soruyu geçerli yapmaz):\n` +
  `- Kökteki veriler birbiriyle ÇELİŞİYOR mu? (örn. "ikisi de aynı anda durur" dedikten sonra "birinin süresi daha uzundur" demek)\n` +
  `- Soruyu çözmek için gereken bir veri EKSİK mi? (okuyucunun varsayması gereken sayı/koşul)\n` +
  `- Şıkların birimi/biçimi kökle uyumlu mu? Kökte sorulan nicelik ile şıklar aynı şeyi mi ölçüyor?\n` +
  `Bunlardan biri bile varsa internallyConsistent=false ve verdict="REPAIR" ver; critique'te TAM olarak hangi cümlenin neyle çeliştiğini yaz.\n\n` +
  `KAPSAM: MÜFREDAT KANITI'nda "KAPSAM DIŞI" listesi varsa, soru/şık/çözüm oradaki bir kavrama\n` +
  `dayanıyorsa curriculumBound=false ver — o soruyu öğrenci hiç görmediği bir konudan çözemez.\n\n` +
  // ⚠️ ZORLUK SORUSU SORUNUN YAPISINI SORAR, HAKEMİN DENEYİMİNİ DEĞİL.
  // Eskiden "kaç ADIM harcadığına bak" yazıyordu — bu İÇGÖZLEM ister ve zincirin başındaki
  // model (v4-flash) sağlayıcıya göre düşünmeyebilir (ÖLÇÜLDÜ: DeepInfra'da reasoning=0,
  // StreamLake/GMICloud'da açık — aynı slug!). Düşünmeyen bir modele "kaç adımda çözdün?"
  // diye sormak cevabı olmayan bir sorudur. Aşağıdaki üç ölçüt soru METNİNDEN sayılabilir.
  `ZORLUK: Soruyu ÇÖZDÜKTEN sonra, sorunun YAPISINA bakarak derecelendir (kendi hızına değil).\n` +
  `⛔ ADIM SAYMA. "Üç formül gerekti → zor" YANLIŞTIR: uzun soru zor soru değildir. Şu üçüne bak:\n` +
  `- GİRİŞ: Soruyu okuyan hazırlıklı bir öğrenci NE YAPACAĞINI hemen bilir mi? Biliyorsa — kaç\n` +
  `  işlem yapacağından BAĞIMSIZ olarak — bu soru zor DEĞİLDİR.\n` +
  `- ÖRTÜKLÜK: Gereken verilerden kaçı soruda yazmıyor, başka bir veriden çıkarılması gerekiyor?\n` +
  `- ÇELDİRİCİ: Yanlış şıklardan kaçı, öğrencinin gerçekten izleyeceği EKSİK bir yolun sonucudur?\n` +
  `  Göz kararı elenebilen çeldirici = kolay soru işaretidir.\n` +
  `Sonucu ZORLUK MERDİVENİ'ne vurup "actualDifficulty" alanına yaz (kolay|orta|zor).\n` +
  `Üreticinin iddia ettiği etikete BAKMA. Konu sana kolay geliyorsa bu soruyu kolay YAPMAZ —\n` +
  `ölçtüğün şey ÖĞRENCİNİN önündeki belirsizlik, senin bilgin değil.` +
  (istenenZorluk ? ` (Bu soru "${istenenZorluk}" olarak sipariş edilmişti; tutmuyorsa dürüst ol.)` : '') +
  `\n\n` +
  // MEKANİZMA TARAMASI — "zor" etiketinin yetkisi artık BURADAN geçer: kod, kanıtlı 2+
  // mekanizma olmadan zor yazmaz (generation.hakemZorluguTuret). İçgözlem ("bana zor geldi")
  // yetki DEĞİLDİR — ölçüldü: içgözlemli hakem 81 gerçek ÖSYM sorusunun SIFIRINA zor dedi.
  // HER denetimde istenir (yalnız zor siparişinde değil): kolay/orta taban oranı bedavaya birikir.
  `MEKANİZMA TARAMASI: Şu beş yapıdan hangileri bu soruda GERÇEKTEN var?\n` +
  `${MEKANIZMALAR.join(' | ')}\n` +
  `Her bulduğun için TEK CÜMLE SOMUT kanıt yaz: hangi veri örtük, hangi çeldirici hangi eksik\n` +
  `yolun sonucu, hangi şıklar aynı ilişkinin savunulabilir okumaları. Kanıt gösteremediğin\n` +
  `mekanizmayı LİSTELEME; hiçbiri yoksa boş dizi döndür. Ad, listedeki yazımla BİREBİR aynı olsun.\n\n` +
  `Şu şemada JSON döndür: {"solvedAnswer":"A-E","matchesMarked":true|false,"singleCorrect":true|false,"curriculumBound":true|false,"internallyConsistent":true|false,"actualDifficulty":"kolay|orta|zor","mechanisms":[{"ad":"...","kanit":"..."}],"osymStyleScore":1..5,"verdict":"ACCEPT|REPAIR|REJECT","critique":"..."}`

/** Onarım istemi — denetçinin eleştirisiyle soruyu düzelt (yazar rolü, aynı çıktı sözleşmesi). */
export const onarimIstemi = (render: string, critique: string, evidence: string): string =>
  `Aşağıdaki soruyu denetçi eleştirisine göre DÜZELT (çıktı sözleşmesine uy):\n\n` +
  `SORU:\n${render}\n\nELEŞTİRİ:\n${critique}\n\nMÜFREDAT:\n${evidence}`
