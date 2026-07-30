-- =============================================================================
-- 0027 — KONU SÖZLÜĞÜ + DERS KAPSAMI SEED  (ÖSYM TYT/AYT konu listesi)
--
-- Ön koşul: 0026 (ders_kapsam, konular). Idempotent (on conflict do nothing).
--
-- ═══ NEDEN AYRI DOSYA ═══
-- 0026 ŞEMA, bu dosya VERİ. Konu listesi ÖSYM sınav kapsamı değiştikçe güncellenir;
-- şema değişmez. Ayrı tutulmazsa "konu ekleyeceğim" diye şema migration'ı düzenlenir
-- ve zaten çalışmış bir migration'ın gövdesi değişir (uygulanmış ortamlarda sessizce
-- ayrışma).
--
-- ⚠️ BU LİSTE KONTROLLÜ SÖZLÜKTÜR. Buraya konu EKLENİR, serbest metin olarak
-- kullanıcıdan ASLA gelmez (bkz. 0026 gerekçesi).
--
-- ⚠️ DERSLER `curriculum_nodes.subject` DEĞERLERİYLE BİREBİR AYNI YAZILMALI.
-- Ölçülen 14 ders: Matematik, Fizik, Kimya, Biyoloji, Türkçe, Türk Dili ve Edebiyatı,
-- Tarih, Coğrafya, Felsefe, Mantık, Psikoloji, Sosyoloji, Din Kültürü ve Ahlak Bilgisi,
-- T.C. İnkılap Tarihi ve Atatürkçülük. Harf/boşluk farkı eşlemeyi sessizce boşa düşürür.
--
-- ⚠️ GEOMETRİ AYRI DERS DEĞİL. curriculum_nodes'ta geometri kazanımları `mat.*`
-- altında (mat.g10.geometrik_sekiller, mat.g11.analitik_inceleme…). ÖSYM'de ayrı test
-- gibi anılsa da veri Matematik'te; geometri konuları Matematik'e yazılır.
-- =============================================================================
set search_path to public, extensions;

-- ─────────────────────────────────────────────────────────────────────────────
-- A) DERS KAPSAMI — kim hangi dersi görür
--
-- Kullanıcı kararı: TYT dersleri BÜTÜN öğrencilerde görünür (alandan bağımsız).
-- AYT dersleri yalnız o dersi okuyan alanlarda.
--
-- Türkçe (TYT) ile Türk Dili ve Edebiyatı (AYT) AYRI derslerdir — TYT'de "Türkçe"
-- testi, AYT'de "Türk Dili ve Edebiyatı" testi vardır. İkisi tek derse katlanırsa
-- sayısalcı öğrenci AYT edebiyat konularını görür (okumadığı test).
--
-- Mantık/Psikoloji/Sosyoloji: AYT Felsefe Grubu'nun parçası → yalnız sözel.
-- TYT'de yoklar (TYT Felsefe testi bu üçünü ayrı ders olarak saymaz).
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.ders_kapsam (subject, tyt, ayt_alanlar, sira) values
  ('Türkçe',                              true,  '{}',                                10),
  ('Matematik',                           true,  '{sayisal,esit_agirlik}',            20),
  ('Fizik',                               true,  '{sayisal}',                         30),
  ('Kimya',                               true,  '{sayisal}',                         40),
  ('Biyoloji',                            true,  '{sayisal}',                         50),
  ('Türk Dili ve Edebiyatı',              false, '{sozel,esit_agirlik}',              60),
  ('Tarih',                               true,  '{sozel,esit_agirlik}',              70),
  ('T.C. İnkılap Tarihi ve Atatürkçülük', true,  '{sozel,esit_agirlik}',              75),
  ('Coğrafya',                            true,  '{sozel,esit_agirlik}',              80),
  ('Felsefe',                             true,  '{sozel}',                           90),
  ('Din Kültürü ve Ahlak Bilgisi',        true,  '{sozel}',                          100),
  ('Mantık',                              false, '{sozel}',                          110),
  ('Psikoloji',                           false, '{sozel}',                          120),
  ('Sosyoloji',                           false, '{sozel}',                          130)
on conflict (subject) do update
  set tyt = excluded.tyt, ayt_alanlar = excluded.ayt_alanlar, sira = excluded.sira;

-- ─────────────────────────────────────────────────────────────────────────────
-- B) KONU SÖZLÜĞÜ
--
-- Dizi sırası = `sira` (unnest ... with ordinality). ÖSYM listesindeki müfredat
-- sırası korunur; alfabetik sıralamak "Türev"i "Diziler"in önüne atardı ve öğrenci
-- konuları öğrendiği sırayla göremezdi.
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.konular (subject, sinav, ad, sira)
select v.subject, v.sinav, k.ad, k.sira::int
from (values

  -- ══ TYT ══
  ('Türkçe', 'TYT', array[
    'Sözcükte Anlam','Söz Yorumu','Deyim ve Atasözü','Cümlede Anlam','Paragraf',
    'Ses Bilgisi','Yazım Kuralları','Noktalama İşaretleri','Sözcükte Yapı',
    'Sözcük Türleri','Fiiller','Sözcük Grupları','Cümlenin Ögeleri','Cümle Türleri',
    'Anlatım Bozukluğu']),

  ('Matematik', 'TYT', array[
    'Temel Kavramlar','Sayı Basamakları','Bölme ve Bölünebilme','EBOB ve EKOK',
    'Rasyonel Sayılar','Basit Eşitsizlikler','Mutlak Değer','Üslü Sayılar',
    'Köklü Sayılar','Çarpanlara Ayırma','Oran ve Orantı','Denklem Çözme','Problemler',
    'Kümeler','Mantık','Fonksiyonlar','Polinomlar','İkinci Dereceden Denklemler',
    'Permütasyon ve Kombinasyon','Olasılık','Veri ve İstatistik',
    'Doğruda Açılar','Üçgende Açılar','Özel Üçgenler','Açıortay','Kenarortay',
    'Eşlik ve Benzerlik','Üçgende Alan','Açı Kenar Bağıntıları','Çokgenler',
    'Özel Dörtgenler','Çember ve Daire','Analitik Geometri','Katı Cisimler']),

  ('Fizik', 'TYT', array[
    'Fizik Bilimine Giriş','Madde ve Özellikleri','Sıvıların Kaldırma Kuvveti',
    'Basınç','Isı Sıcaklık ve Genleşme','Hareket ve Kuvvet','Dinamik',
    'İş Güç ve Enerji','Elektrik','Manyetizma','Dalgalar','Optik']),

  ('Kimya', 'TYT', array[
    'Kimya Bilimi','Atom ve Periyodik Sistem','Kimyasal Türler Arası Etkileşimler',
    'Maddenin Halleri','Doğa ve Kimya','Kimyanın Temel Kanunları',
    'Kimyasal Hesaplamalar','Karışımlar','Asit Baz ve Tuz','Kimya Her Yerde']),

  ('Biyoloji', 'TYT', array[
    'Canlıların Ortak Özellikleri','Canlıların Temel Bileşenleri','Hücre ve Organelleri',
    'Hücre Zarından Madde Geçişi','Canlıların Sınıflandırılması',
    'Mitoz ve Eşeysiz Üreme','Mayoz ve Eşeyli Üreme','Kalıtım','Ekosistem Ekolojisi',
    'Güncel Çevre Sorunları']),

  ('Tarih', 'TYT', array[
    'Tarih ve Zaman','İnsanlığın İlk Dönemleri','Orta Çağda Dünya',
    'İlk ve Orta Çağlarda Türk Dünyası','İslam Medeniyetinin Doğuşu',
    'Türklerin İslamiyeti Kabulü','Selçuklu Türkiyesi','Beylikten Devlete Osmanlı',
    'Dünya Gücü Osmanlı','Değişen Dünya Dengeleri Karşısında Osmanlı',
    'Değişim Çağında Avrupa ve Osmanlı','Uluslararası İlişkilerde Denge Stratejisi']),

  ('T.C. İnkılap Tarihi ve Atatürkçülük', 'TYT', array[
    'XX. Yüzyıl Başlarında Osmanlı Devleti ve Dünya','Milli Mücadele',
    'Atatürkçülük ve Türk İnkılabı','İki Savaş Arası Dönemde Türkiye ve Dünya',
    'II. Dünya Savaşı Sürecinde Türkiye ve Dünya','Çağdaş Türkiye Yolunda Adımlar']),

  ('Coğrafya', 'TYT', array[
    'Doğa ve İnsan','Dünyanın Şekli ve Hareketleri','Coğrafi Konum','Harita Bilgisi',
    'Atmosfer ve Sıcaklık','İklimler','Basınç ve Rüzgarlar','Nem Yağış ve Buharlaşma',
    'İç Kuvvetler ve Dış Kuvvetler','Su Toprak ve Bitkiler','Nüfus','Göç','Yerleşme',
    'Türkiyenin Yer Şekilleri','Ekonomik Faaliyetler','Bölgeler',
    'Uluslararası Ulaşım Hatları','Çevre ve Toplum','Doğal Afetler']),

  ('Felsefe', 'TYT', array[
    'Felsefenin Konusu','Bilgi Felsefesi','Varlık Felsefesi','Ahlak Felsefesi',
    'Sanat Felsefesi','Din Felsefesi','Siyaset Felsefesi','Bilim Felsefesi',
    'İlk Çağ Felsefesi','MS 2-15. Yüzyıl Felsefesi','15-17. Yüzyıl Felsefesi',
    '18-19. Yüzyıl Felsefesi','20. Yüzyıl Felsefesi']),

  ('Din Kültürü ve Ahlak Bilgisi', 'TYT', array[
    'Bilgi ve İnanç','İslam ve İbadet','Ahlak ve Değerler','Allah İnsan İlişkisi',
    'Hz. Muhammed','Vahiy ve Akıl','İslam Düşüncesinde Yorumlar ve Mezhepler',
    'Din Kültür ve Medeniyet','İslam ve Bilim','Yaşayan Dinler']),

  -- ══ AYT ══
  ('Matematik', 'AYT', array[
    'Kümeler','Denklem ve Eşitsizlikler','Fonksiyonlar','Üçgenler','Veri','Olasılık',
    'Sayma','Fonksiyonlarla İşlemler','Dörtgenler ve Çokgenler',
    'İkinci Dereceden Denklem ve Fonksiyonlar','Polinomlar','Geometrik Cisimler',
    'Trigonometri','Analitik Geometri','Denklem ve Eşitsizlik Sistemleri',
    'Çember ve Daire','Uzay Geometri','Üstel ve Logaritmik Fonksiyonlar','Diziler',
    'Limit ve Süreklilik','Türev','İntegral','Dönüşümler']),

  ('Fizik', 'AYT', array[
    'Vektörler','Bağıl Hareket','Newtonun Hareket Yasaları',
    'Bir Boyutta Sabit İvmeli Hareket','Atışlar','İş Güç ve Enerji',
    'İtme ve Momentum','Tork ve Denge','Basit Makineler',
    'Elektrik Alan ve Potansiyel','Paralel Levhalar ve Sığa',
    'Manyetik Alan ve Manyetik Kuvvet','İndüksiyon ve Alternatif Akım',
    'Çembersel Hareket','Dönme ve Yuvarlanma','Kütle Çekim ve Kepler Yasaları',
    'Basit Harmonik Hareket','Dalga Mekaniği','Atom Fiziği ve Radyoaktivite',
    'Modern Fizik','Modern Fiziğin Teknolojideki Uygulamaları']),

  ('Kimya', 'AYT', array[
    'Modern Atom Teorisi','Gazlar','Sıvı Çözeltiler ve Çözünürlük',
    'Kimyasal Tepkimelerde Enerji','Kimyasal Tepkimelerde Hız',
    'Kimyasal Tepkimelerde Denge','Asit Baz Dengesi','Çözünürlük Dengesi',
    'Kimya ve Elektrik','Karbon Kimyasına Giriş','Organik Bileşikler',
    'Enerji Kaynakları ve Bilimsel Gelişmeler']),

  ('Biyoloji', 'AYT', array[
    'Sinir Sistemi','Endokrin Sistem','Duyu Organları','Destek ve Hareket Sistemi',
    'Sindirim Sistemi','Dolaşım ve Bağışıklık Sistemi','Solunum Sistemi',
    'Üriner Sistem','Üreme Sistemi ve Embriyonik Gelişim','Komünite Ekolojisi',
    'Popülasyon Ekolojisi','Nükleik Asitler','Genetik Şifre ve Protein Sentezi',
    'Canlılarda Enerji Dönüşümleri','Fotosentez','Kemosentez','Hücresel Solunum',
    'Bitki Biyolojisi','Canlılar ve Çevre']),

  ('Türk Dili ve Edebiyatı', 'AYT', array[
    'Anlam Bilgisi','Dil Bilgisi','Güzel Sanatlar ve Edebiyat',
    'Metinlerin Sınıflandırılması','Şiir Bilgisi','Edebi Sanatlar',
    'İslamiyet Öncesi Türk Edebiyatı','Geçiş Dönemi Eserleri','Halk Edebiyatı',
    'Divan Edebiyatı','Tanzimat Edebiyatı','Servet-i Fünun ve Fecr-i Ati',
    'Milli Edebiyat','Cumhuriyet Dönemi Edebiyatı','Batı Edebiyatı ve Akımlar']),

  ('Tarih', 'AYT', array[
    'Tarih Bilimi','İlk Uygarlıklar','İlk Türk Devletleri',
    'İslam Tarihi ve Medeniyeti','Türk İslam Devletleri','Türkiye Tarihi',
    'Beylikten Devlete','Dünya Gücü Osmanlı Devleti','Arayış Yılları',
    'Avrupa ve Osmanlı','En Uzun Yüzyıl',
    'Devrimler Çağında Değişen Devlet Toplum İlişkileri','Sermaye ve Emek',
    'XIX ve XX. Yüzyılda Değişen Gündelik Hayat',
    'İki Savaş Arası Dönemde Türkiye ve Dünya',
    'II. Dünya Savaşı Sürecinde Türkiye ve Dünya',
    'II. Dünya Savaşı Sonrası Türkiye ve Dünya',
    'Toplumsal Devrim Çağında Dünya ve Türkiye',
    'Yüzyılın Eşiğinde Türkiye ve Dünya']),

  ('T.C. İnkılap Tarihi ve Atatürkçülük', 'AYT', array[
    'XX. Yüzyıl Başlarında Osmanlı Devleti ve Dünya','Milli Mücadele',
    'Atatürkçülük ve Türk İnkılabı','İki Savaş Arası Dönemde Türkiye ve Dünya',
    'II. Dünya Savaşı Sürecinde Türkiye ve Dünya','Çağdaş Türkiye Yolunda Adımlar']),

  ('Coğrafya', 'AYT', array[
    'Ekosistem','Nüfus Politikaları','Şehirleşme ve Ekonomi','Türkiyede Yerleşme',
    'Türkiye Ekonomisi','Türkiyenin İşlevsel Bölgeleri',
    'Ekonomik Faaliyetler ve Doğal Kaynaklar','Göç ve Şehirleşme','Küresel Ticaret',
    'İlk Uygarlıklar','Küresel ve Bölgesel Örgütler','Ülkeler Arası Etkileşim',
    'Bölgeler ve Ülkeler','Çevre ve Toplum','Doğal Afetler ve Toplum']),

  ('Felsefe', 'AYT', array[
    'Felsefenin Alanı','Bilgi Felsefesi','Bilim Felsefesi','Varlık Felsefesi',
    'Ahlak Felsefesi','Siyaset Felsefesi','Sanat Felsefesi','Din Felsefesi',
    '20. Yüzyıl Felsefesi']),

  ('Mantık', 'AYT', array[
    'Mantığa Giriş','Klasik Mantık','Mantık ve Dil','Sembolik Mantık']),

  ('Psikoloji', 'AYT', array[
    'Psikoloji Bilimini Tanıyalım','Psikolojinin Temel Süreçleri',
    'Öğrenme Bellek ve Düşünme','Ruh Sağlığının Temelleri']),

  ('Sosyoloji', 'AYT', array[
    'Sosyolojiye Giriş','Birey ve Toplum','Toplumsal Yapı',
    'Toplumsal Değişme ve Gelişme','Toplum ve Kültür','Toplumsal Kurumlar']),

  ('Din Kültürü ve Ahlak Bilgisi', 'AYT', array[
    'İnanç','İbadet','Ahlak ve Değerler','Din Kültür ve Medeniyet','Hz. Muhammed',
    'Vahiy ve Akıl','Dünya ve Ahiret','Kurana Göre Hz. Muhammed',
    'İnançla İlgili Meseleler','Yahudilik ve Hristiyanlık','İslam ve Bilim',
    'Anadoluda İslam','Tasavvufi Yorumlar ve Mezhepler','Güncel Dini Meseleler',
    'Hint ve Çin Dinleri'])

) as v(subject, sinav, adlar)
cross join lateral unnest(v.adlar) with ordinality as k(ad, sira)
on conflict (subject, ad, sinav) do nothing;

-- =============================================================================
-- DOĞRULAMA:
--   -- 1) Ders kapsamı 14 satır, Türkçe AYT'de YOK, TDE TYT'de YOK:
--   select subject, tyt, ayt_alanlar from public.ders_kapsam order by sira;
--
--   -- 2) Konu sayıları (ders × sınav):
--   select subject, sinav, count(*) from public.konular group by 1,2 order by 1,2;
--
--   -- 3) "Türev" gerçekten var mı (kullanıcının asıl istediği):
--   select * from public.konular where ad = 'Türev';        -- Matematik / AYT
--
--   -- 4) Sözlükteki her ders curriculum_nodes'ta da var mı (harf uyuşmazlığı avı):
--   select distinct k.subject from public.konular k
--    where not exists (select 1 from public.curriculum_nodes c where c.subject = k.subject);
--   -- 0 satır beklenir; satır dönerse o ders ASLA eşleşmez (sessiz boş liste).
-- =============================================================================
