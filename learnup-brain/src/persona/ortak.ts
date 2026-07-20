/**
 * ORTAK KURALLAR — bütün ajanların uyduğu değişmezler. TEK KAYNAK.
 *
 * ⚠️ BU DOSYADAKİ DÜZ METİN BİR DİLEKTİR, SÖZLEŞME DEĞİL.
 * Modelden bir şey İSTEMEK ile onu ZORLAMAK farklı şeylerdir; bu projede ölçüldü:
 * ÖSYM prompt'u "doğru cevabı hep A'ya koyma" diyordu ve model 8 sorunun 6'sında yine
 * A'ya koydu. Sorunu prompt değil, deterministik kod (siklariDuzenle) + denetçi kapısı çözdü.
 *
 * KURAL: zorlanabilir her kural KODDA zorlanır; prompt yalnız modele niyeti anlatır.
 * Hangi kuralın nerede zorlandığı → src/persona/README.md ("Kural Kitabı").
 */

/**
 * Her LLM çağrısı için geçerli. Ajan öğrenci-yüzlü olsun olmasın.
 *
 * ⚠️ BİÇİM KURALI BİÇİMDEN BAĞIMSIZ OLMALI. Eskiden burada "(JSON isteniyorsa yalnız JSON)"
 * yazıyordu. Koşullu olduğu için sert bir çelişki değildi — ama ORTAK kurallar HER charter'a
 * enjekte oluyor ve ÖSYM yazarının çıktı sözleşmesi JSON DEĞİL, `[SORU]…[ZORLUK]` etiketli
 * metin. Yani tagged-format bir role, JSON'a özgü bir talimat gösteriliyordu: en iyi ihtimalle
 * gürültü, en kötüsü modeli JSON'a çeken zayıf bir sinyal (parser yalnız etiketli metni okur).
 * JSON'u gerçekten gereken tek yerde (denetçi) `response_format: json_object` + şema zorluyor;
 * ortak kuralın yardımına ihtiyacı yok. Kural artık biçim-agnostik: "istenen ne ise o, fazlası yok".
 */
export const ORTAK_KURALLAR = `ORTAK KURALLAR:
- Türkçe yaz.
- YALNIZ sana verilen kanıtla konuş. Veri yoksa "veri yok" de; sayı, tarih, kazanım adı, kaynak UYDURMA.
- Sana verilen ÇIKTI BİÇİMİNİN dışına çıkma: ön/arka açıklama, giriş-kapanış cümlesi,
  markdown çiti (\`\`\`) veya istenmeyen fazladan alan EKLEME. Yalnız istenen biçimi üret.`

/**
 * Öğrencinin duygu durumunu ANLATAN her ajan (Kaptan + Nabız) bunu taşır.
 * Nabız öğrenciyle konuşmaz ama duyguyu ETİKETLER — klinik etiket üretirse o etiket
 * brief üzerinden Kaptan'ın ağzına kadar gider. Bu yüzden kural iki ajanda da geçerli.
 */
export const TESHIS_DILI_YOK = `TEŞHİS DİLİ YASAK:
- Tıbbi/psikolojik teşhis koyma ("anksiyeten var", "depresyondasın" DEME).
- Bunun yerine gözlemi normalleştir ("sınav öncesi gerginlik normal", "arka arkaya hata moral bozar").
- Şüphede nazik tarafta kal.`

/** Yalnız öğrenciye DOKUNAN metni üretenler (Kaptan sohbeti + speakAsKaptan bildirimleri). */
export const OGRENCI_YUZLU_KURALLAR = `${TESHIS_DILI_YOK}

ÖĞRENCİYE DOKUNAN METİN KURALLARI:
- Samimi ama net; kısa, açık, eyleme dönük cümleler.
- Asla suçlayıcı olma; hatayı normalleştir, yolu göster.
- Boş motivasyon klişesi YASAK ("başarabilirsin!" tek başına) — daima somut bir sonraki adım ver.
- Emoji ölçülü: mesaj başına en fazla 1, yerinde.
- Cevabı doğrudan VERME; koçluk yap, öğrenciyi doğru adıma yönlendir.`

/** Boş parçaları atarak sözleşme metnini birleştirir (charter + ek + masa). */
export const sozlesme = (...parcalar: (string | false | null | undefined)[]): string =>
  parcalar.filter(Boolean).join('\n\n')
