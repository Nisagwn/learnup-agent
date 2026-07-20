/**
 * SORU SAĞLIĞI — metne bakıp "bu soru ÇÖZÜLEBİLİR mi?" sorusuna deterministik cevap.
 *
 * NEDEN VAR: çıkmış ÖSYM soruları PDF'ten metne çevrildi ve şekiller/alt-üst indisler
 * yok oldu. Geriye çözülemez metin kaldı. ÖLÇÜLDÜ (1730 çıkmış soru): 32'si (%1.8) bozuk,
 * Matematik'te oran %6. Örnekler:
 *   · "Dik koordinat düzleminde f fonksiyonunun grafiği aşağıda verilmiştir. y 7 6 y = f(x)
 *      5 4 3 2 1 x O 1 2 3 4 5 …"            ← grafik yok, eksen etiketleri metne düşmüş
 *   · "log 1 a, log 1 b … 2 2 2 2"            ← log₁/₂ alt indisi yok olmuş
 *   · "Örnek: 3 7 = 34 ⋅ 70 = 81"             ← üs gösterimi yok olmuş
 *   · "Aşağıdaki soyağacında … 1 2 3 4 5 6"   ← soyağacı yok
 *
 * BU SORULAR İKİ YERDE ZARAR VERİYOR:
 *   1. yks_exemplars → modele "ÖSYM böyle yazar" diye BOZUK soru gösteriliyor.
 *   2. yks_questions → verified=true, yani ÖĞRENCİYE servis ediliyor; öğrenci çözemez ve
 *      cevabı yanlış işaretler → sistem bunu "kavram yanılgısı" diye kaydeder (kirli teşhis).
 *
 * ⚠️ YANLIŞ POZİTİF VAR ve bilinçli kabul ediliyor. İki tip ölçüldü:
 *   · Şıkları soru köküne sızmış sorular ("…kaçtır? 16 18 20 22 24") — kök sağlam, çözülebilir.
 *   · Şekli GEREKSİZ olan sorular ("üzerlerinde 6, 8, 10 ve 12 yazan dört kart… 6 8 10 12")
 *     — sayılar zaten düz metinde geçiyor.
 * 32'nin ~2-4'ü böyle. Maliyet asimetrik olduğu için agresif kalıyoruz: bozuk soruyu servis
 * etmek öğrenciyi çözemeyeceği soruyla baş başa bırakır VE teşhis verisini kirletir; sağlam
 * bir soruyu 1730'dan çıkarmak ise fark ettirmez.
 */

/** Şekil/tablo/grafik göndermesi. ⚠️ Kelime SONUNA \b KOYMA — Türkçe eklemeli:
 *  "grafiği", "tabloda", "şematize" hepsi tutmalı. (Bu tam olarak bir kez ıskalandı:
 *  `\b(grafik)\b` deseni "grafiği"ni kaçırıp "görsel gönderme %0" gibi YANLIŞ bir ölçüm verdi.) */
const GORSEL = /\b(şekil|grafi[kğ]|tablo|çizim|görsel|harita|şema|soyağac)/i

/** Kaybolan şekil/indis, metne öksüz sayı dizisi olarak düşer: "y 7 6 … 5 4 3 2 1 x O 1 2 3 4 5".
 *  4+ ardışık, tek başına duran 1-3 basamaklı sayı — normal düzyazıda görülmez. */
const OKSUZ_SAYI = /(?:(?:^|\s)\d{1,3}(?=\s)){4,}/

/**
 * Soru, metinde OLMAYAN bir görsele ya da kaybolmuş bir gösterime dayanıyor mu?
 * `true` → soru çözülemez; ne örnek gösterilmeli ne öğrenciye servis edilmeli.
 *
 * ⚠️ YALNIZ PDF-KAYNAKLI (çıkmış) SORULAR İÇİN. AI sorularında KULLANMA: "fonksiyonun grafiği
 * x eksenini keser" meşru metinsel matematiktir ve bu desen onu da yakalar — AI tarafının
 * ölçüsü aşağıdaki `varOlmayanGorseleGonderme`.
 */
export const gorselBagimli = (soruMetni: string): boolean =>
  GORSEL.test(soruMetni) || OKSUZ_SAYI.test(soruMetni)

/**
 * AI SORUSU var olmayan bir görsele Mİ gönderme yapıyor? (dar desen)
 *
 * AI soruları görsel İÇEREMEZ (metin üretiyoruz); "grafiği AŞAĞIDA VERİLMİŞTİR" yazan AI
 * sorusu, öğrenciye asla var olmayacak bir şekli işaret eder → çözülemez. Ama `gorselBagimli`
 * buraya uygulanamaz: o desen "grafiği x eksenini keser" gibi MEŞRU metinsel göndermeyi de
 * yakalar (PDF tarafında sorun değildi; orada görsel gerçekten vardı ve kaybolmuştu).
 * Bu yüzden dar desen: görsel kelimesi + "aşağıda/yukarıda … veril/göster" BİRLİKTELİĞİ.
 */
const GONDERME_ILERI = /(şekil|grafi[kğ]|tablo|şema|görsel|çizim)\w*[^.!?]{0,60}(aşağıda|yukarıda)\w*[^.!?]{0,40}(veril|göster)/i
const GONDERME_GERI = /(aşağıda|yukarıda)\w*[^.!?]{0,60}(şekil|grafi[kğ]|tablo|şema|görsel|çizim)/i

export const varOlmayanGorseleGonderme = (soruMetni: string): boolean =>
  GONDERME_ILERI.test(soruMetni) || GONDERME_GERI.test(soruMetni)

/**
 * PDF GLİF ÇÖPÜ — formülün yerinde kalan C0 kontrol karakterleri.
 *
 * ÖLÇÜLDÜ (data/sorular.json, 2210 çıkmış soru): 27 soru kontrol karakteri taşıyor
 * (kökte 25, şıkta 2). Bunların 21'i (%1.0) yukarıdaki kapıların HİÇBİRİNE takılmıyor ve
 * ŞU ANDA ÖĞRENCİYE SERVİS EDİLİYOR — 18'i Matematik, 3'ü Kimya. Birebir örnekler:
 *   · "␣␣ P x ve Q x gerçel katsayılı polinomlar olmak üzere P ␣ x ␣ ␣ Q…"
 *   · "1 ␣ f g x ␣ ␣ ␣␣ dx ␣ 18"        ← integral yok olmuş
 *   · "x, y ve z sayıları ␣ , , ␣ kümesinin farklı ␣␣ 4 4 4…"
 * Bunlar `gorselBagimli`ye takılmıyor çünkü ne görsel kelimesi geçiyor ne de 4+ öksüz sayı
 * dizisi var — çöp, sayı değil KONTROL KARAKTERİ olarak düşmüş.
 *
 * NEDEN AYRI KAPI: `gorselBagimli` "şekli kaybolmuş" der; bu ise "gösterimin kendisi çöpe
 * dönmüş" der. İkisi farklı arıza ve farklı yerlerde geçerli (bu kapı AI sorularında da
 * anlamlıdır — hiçbir metinde C0 karakteri meşru değildir).
 *
 * YANLIŞ POZİTİF YOK: tab/LF/CR hariç C0 kontrol karakterleri hiçbir Türkçe metinde
 * meşru olarak bulunmaz. Bu, diğer iki kapının aksine KESİN bir ölçüttür.
 */
const KONTROL_KARAKTER = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/

export const bozukGosterim = (metin: string): boolean => KONTROL_KARAKTER.test(metin ?? '')

/**
 * Çıkmış (PDF kaynaklı) bir soru öğrenciye servis edilebilir mi? `true` → EDİLEMEZ.
 * Kök + BEŞ ŞIK birlikte denetlenir.
 *
 * ⚠️ ŞIKLARA `gorselBagimli` UYGULANMAZ — bilerek. ÖLÇÜLDÜ: şıkları da o desene sokunca
 * yakalama %8.6'dan %24.5'e fırlıyor, çünkü SAYISAL ŞIKLAR (`12 15 18 21 24`) tam olarak
 * OKSUZ_SAYI desenidir — "4+ ardışık öksüz sayı". Yani her sayısal soru bozuk sayılırdı.
 * Şıkta aranan tek şey, ölçütü KESİN olan glif çöpü.
 */
export const cikmisSoruBozuk = (q: {
  question_text?: string | null
  options?: Record<string, unknown> | null
}): boolean => {
  const kok = q.question_text ?? ''
  if (gorselBagimli(kok) || bozukGosterim(kok)) return true
  return Object.values(q.options ?? {}).some((s) => bozukGosterim(String(s ?? '')))
}
