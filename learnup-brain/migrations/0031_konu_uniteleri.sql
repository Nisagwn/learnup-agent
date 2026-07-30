-- =============================================================================
-- 0031 — KONU ÜNİTELERİ  (34 satırlık düz listeyi taranabilir bloklara böler)
--
-- Ön koşul: 0027, 0029, 0030. Idempotent.
--
-- ═══ NEDEN ═══
-- Ders açılınca konular DÜZ LİSTE geliyordu: Matematik TYT 34, Fizik AYT 26, Matematik
-- AYT 26 satır. Ürün sahibinin şikâyeti: "konular sayfası çok karışık duruyor".
-- Sorun DERİNLİK EKSİKLİĞİ DEĞİL — "Polinomlar" ve "Türev" listede ZATEN var, sadece
-- 34 satırlık duvarın içinde görünmüyor. Yapı var, görünmüyor.
--
-- ⚠️ YENİ GEZİNTİ SEVİYESİ EKLENMEDİ — BİLİNÇLİ. Ünite ayrı bir SAYFA değil, konu
-- listesinin içinde BÖLÜM BAŞLIĞI. Kunduz'un ders→ünite→konu üç seviyesi ünite başına
-- 24 video + 276 soruyla ayakta duruyor; bizde toplam 236 soru var (ölçüldü) ve konu
-- başına ortalama 1'in altına düşüyor. Her ünite için ayrı sayfa açmak, kullanıcıyı her
-- tıklamada DAHA BOŞ bir yere götürürdü. Bölüm başlığı aynı taranabilirliği tık maliyeti
-- ve boş sayfa üretmeden verir.
--
-- ⚠️ KONUNUN ALTINA DÖRDÜNCÜ KIRILIM (alt konu) DA EKLENMEDİ. Soruların bağlandığı katman
-- kazanımdır ve konu→kazanım eşlemesi henüz BOŞ. İçerik bağlanamayan hiyerarşi yalnız boş
-- yaprak üretir. Alt kırılım gerekirse soru ekranında filtre olarak verilir, gezinti
-- seviyesi olarak değil.
--
-- ⚠️ ÜNİTE ADLARI ELLE KÜRATÖRLÜK. MEB path'inden türetilmedi: ortadaki segment SINIF
-- (mat.g10.…), ünite slug'ları 2024 müfredat dilinde (`nicelikler_ve_degisimler`) ve
-- öğrencinin zihnindeki YKS diliyle örtüşmüyor. Kullanıcıya MEB terminolojisi göstermek
-- "karışık" şikâyetini büyütürdü.
--
-- Ayrı ünite tablosu YOK: ünite bir GRUPLAMA ETİKETİDİR, varlık değil. Kendi id'si,
-- kendi sayfası, kendi eşlemesi olmayan bir şeye tablo açmak boş soyutlamadır.
-- =============================================================================
set search_path to public, extensions;

alter table public.konular add column if not exists unite      text;
alter table public.konular add column if not exists unite_sira int not null default 99;

create index if not exists idx_konular_unite on public.konular (subject, sinav, unite_sira);

comment on column public.konular.unite is
  'Konu listesindeki BÖLÜM BAŞLIĞI (0031). Ayrı sayfa/gezinti seviyesi DEĞİL — 34 satırlık '
  'düz listeyi taranabilir bloklara bölmek için. NULL kalırsa arayüz o konuyu "Diğer" '
  'bloğunda gösterir (sessizce kaybolmaz).';

update public.konular k
   set unite = v.unite, unite_sira = v.sira
  from (values

  -- ══ MATEMATİK ══
  ('Matematik','TYT','Sayılar ve İşlemler',1, array['Temel Kavramlar','Sayı Basamakları','Bölme ve Bölünebilme','EBOB ve EKOK','Rasyonel Sayılar','Basit Eşitsizlikler','Mutlak Değer','Üslü Sayılar','Köklü Sayılar','Oran ve Orantı']),
  ('Matematik','TYT','Cebir',2, array['Çarpanlara Ayırma','Denklem Çözme','Polinomlar','İkinci Dereceden Denklemler','Kümeler','Mantık','Fonksiyonlar']),
  ('Matematik','TYT','Problemler',3, array['Problemler']),
  ('Matematik','TYT','Veri, Sayma ve Olasılık',4, array['Permütasyon ve Kombinasyon','Olasılık','Veri ve İstatistik']),
  ('Matematik','TYT','Geometri - Açı ve Üçgen',5, array['Doğruda Açılar','Üçgende Açılar','Özel Üçgenler','Açıortay','Kenarortay','Eşlik ve Benzerlik','Üçgende Alan','Açı Kenar Bağıntıları']),
  ('Matematik','TYT','Geometri - Çokgen ve Çember',6, array['Çokgenler','Özel Dörtgenler','Çember ve Daire']),
  ('Matematik','TYT','Geometri - Analitik ve Katı Cisimler',7, array['Analitik Geometri','Katı Cisimler']),

  ('Matematik','AYT','Cebir ve Fonksiyonlar',1, array['Kümeler','Denklem ve Eşitsizlikler','Fonksiyonlar','Fonksiyonlarla İşlemler','İkinci Dereceden Denklem ve Fonksiyonlar','Polinomlar','Denklem ve Eşitsizlik Sistemleri','Fonksiyonlarda Uygulamalar','Üstel ve Logaritmik Fonksiyonlar','Diziler']),
  ('Matematik','AYT','Analiz',2, array['Limit ve Süreklilik','Türev','İntegral']),
  ('Matematik','AYT','Sayma ve Olasılık',3, array['Veri','Sayma','Permütasyon ve Kombinasyon','Olasılık']),
  ('Matematik','AYT','Geometri',4, array['Üçgenler','Dörtgenler ve Çokgenler','Çember ve Daire','Geometrik Cisimler','Uzay Geometri']),
  ('Matematik','AYT','Trigonometri ve Analitik Geometri',5, array['Trigonometri','Analitik Geometri','Çemberin Analitik İncelemesi','Dönüşümler']),

  -- ══ FİZİK ══
  ('Fizik','TYT','Fizik ve Madde',1, array['Fizik Bilimine Giriş','Madde ve Özellikleri']),
  ('Fizik','TYT','Kuvvet ve Hareket',2, array['Hareket ve Kuvvet','Dinamik','İş Güç ve Enerji']),
  ('Fizik','TYT','Akışkanlar ve Isı',3, array['Sıvıların Kaldırma Kuvveti','Basınç','Isı Sıcaklık ve Genleşme']),
  ('Fizik','TYT','Elektrik ve Manyetizma',4, array['Elektrostatik','Elektrik','Manyetizma']),
  ('Fizik','TYT','Dalgalar ve Optik',5, array['Dalgalar','Optik']),

  ('Fizik','AYT','Kuvvet ve Hareket',1, array['Vektörler','Bağıl Hareket','Newtonun Hareket Yasaları','Bir Boyutta Sabit İvmeli Hareket','Atışlar']),
  ('Fizik','AYT','İş, Enerji ve Momentum',2, array['İş Güç ve Enerji','İtme ve Momentum','Tork ve Denge','Basit Makineler']),
  ('Fizik','AYT','Elektrik ve Manyetizma',3, array['Elektrik Alan ve Potansiyel','Paralel Levhalar ve Sığa','Manyetik Alan ve Manyetik Kuvvet','İndüksiyon ve Alternatif Akım']),
  ('Fizik','AYT','Çembersel ve Periyodik Hareket',4, array['Çembersel Hareket','Dönme ve Yuvarlanma','Kütle Çekim ve Kepler Yasaları','Basit Harmonik Hareket']),
  ('Fizik','AYT','Dalga Mekaniği',5, array['Dalga Mekaniği']),
  ('Fizik','AYT','Modern Fizik',6, array['Atom Modelleri','Atom Fiziği ve Radyoaktivite','Kara Cisim Işıması','Fotoelektrik Olay','Özel Görelilik','Büyük Patlama ve Parçacık Fiziği','Modern Fizik','Modern Fiziğin Teknolojideki Uygulamaları']),

  -- ══ KİMYA ══
  ('Kimya','TYT','Kimyanın Temelleri',1, array['Kimya Bilimi','Atom ve Periyodik Sistem','Kimyasal Türler Arası Etkileşimler']),
  ('Kimya','TYT','Madde ve Karışımlar',2, array['Maddenin Halleri','Karışımlar']),
  ('Kimya','TYT','Kimyasal Hesaplamalar',3, array['Kimyanın Temel Kanunları','Kimyasal Hesaplamalar']),
  ('Kimya','TYT','Asit Baz ve Günlük Hayat',4, array['Asit Baz ve Tuz','Doğa ve Kimya','Kimya Her Yerde']),

  ('Kimya','AYT','Atom ve Gazlar',1, array['Modern Atom Teorisi','Gazlar']),
  ('Kimya','AYT','Çözeltiler',2, array['Sıvı Çözeltiler ve Çözünürlük','Çözünürlük Dengesi']),
  ('Kimya','AYT','Tepkimeler',3, array['Kimyasal Tepkimelerde Enerji','Kimyasal Tepkimelerde Hız','Kimyasal Tepkimelerde Denge','Asit Baz Dengesi']),
  ('Kimya','AYT','Elektrokimya',4, array['Kimya ve Elektrik']),
  ('Kimya','AYT','Organik Kimya',5, array['Karbon Kimyasına Giriş','Organik Bileşikler','Enerji Kaynakları ve Bilimsel Gelişmeler']),

  -- ══ BİYOLOJİ ══
  ('Biyoloji','TYT','Canlıların Yapısı',1, array['Canlıların Ortak Özellikleri','Canlıların Temel Bileşenleri']),
  ('Biyoloji','TYT','Hücre',2, array['Hücre ve Organelleri','Hücre Zarından Madde Geçişi']),
  ('Biyoloji','TYT','Canlılar Dünyası',3, array['Canlıların Sınıflandırılması']),
  ('Biyoloji','TYT','Üreme ve Kalıtım',4, array['Mitoz ve Eşeysiz Üreme','Mayoz ve Eşeyli Üreme','Kalıtım']),
  ('Biyoloji','TYT','Ekoloji',5, array['Ekosistem Ekolojisi','Güncel Çevre Sorunları']),

  ('Biyoloji','AYT','İnsan Fizyolojisi',1, array['Sinir Sistemi','Endokrin Sistem','Duyu Organları','Destek ve Hareket Sistemi','Sindirim Sistemi','Dolaşım ve Bağışıklık Sistemi','Solunum Sistemi','Üriner Sistem','Üreme Sistemi ve Embriyonik Gelişim']),
  ('Biyoloji','AYT','Genetik ve Protein Sentezi',2, array['Nükleik Asitler','Genetik Şifre ve Protein Sentezi']),
  ('Biyoloji','AYT','Enerji Dönüşümleri',3, array['Canlılarda Enerji Dönüşümleri','Fotosentez','Kemosentez','Hücresel Solunum']),
  ('Biyoloji','AYT','Bitki Biyolojisi',4, array['Bitki Biyolojisi']),
  ('Biyoloji','AYT','Ekoloji',5, array['Komünite Ekolojisi','Popülasyon Ekolojisi','Canlılar ve Çevre']),

  -- ══ TÜRKÇE / EDEBİYAT ══
  ('Türkçe','TYT','Anlam Bilgisi',1, array['Sözcükte Anlam','Söz Yorumu','Deyim ve Atasözü','Cümlede Anlam']),
  ('Türkçe','TYT','Paragraf',2, array['Paragraf']),
  ('Türkçe','TYT','Dil Bilgisi',3, array['Ses Bilgisi','Sözcükte Yapı','Sözcük Türleri','Fiiller','Sözcük Grupları','Cümlenin Ögeleri','Cümle Türleri']),
  ('Türkçe','TYT','Yazım ve Anlatım',4, array['Yazım Kuralları','Noktalama İşaretleri','Anlatım Bozukluğu']),

  ('Türk Dili ve Edebiyatı','AYT','Dil ve Anlam',1, array['Anlam Bilgisi','Dil Bilgisi']),
  ('Türk Dili ve Edebiyatı','AYT','Edebiyat Bilgileri',2, array['Güzel Sanatlar ve Edebiyat','Metinlerin Sınıflandırılması','Şiir Bilgisi','Edebi Sanatlar']),
  ('Türk Dili ve Edebiyatı','AYT','İslamiyet Öncesi ve Halk Edebiyatı',3, array['İslamiyet Öncesi Türk Edebiyatı','Geçiş Dönemi Eserleri','Halk Edebiyatı']),
  ('Türk Dili ve Edebiyatı','AYT','Divan Edebiyatı',4, array['Divan Edebiyatı']),
  ('Türk Dili ve Edebiyatı','AYT','Yenileşme Dönemi',5, array['Tanzimat Edebiyatı','Servet-i Fünun ve Fecr-i Ati','Milli Edebiyat']),
  ('Türk Dili ve Edebiyatı','AYT','Cumhuriyet ve Batı Edebiyatı',6, array['Cumhuriyet Dönemi Edebiyatı','Batı Edebiyatı ve Akımlar']),

  -- ══ TARİH ══
  ('Tarih','TYT','İlk ve Orta Çağlar',1, array['Tarih ve Zaman','İnsanlığın İlk Dönemleri','Orta Çağda Dünya','İlk ve Orta Çağlarda Türk Dünyası']),
  ('Tarih','TYT','İslam ve Türk-İslam Tarihi',2, array['İslam Medeniyetinin Doğuşu','Türklerin İslamiyeti Kabulü','Selçuklu Türkiyesi']),
  ('Tarih','TYT','Osmanlı Tarihi',3, array['Beylikten Devlete Osmanlı','Dünya Gücü Osmanlı','Değişen Dünya Dengeleri Karşısında Osmanlı','Değişim Çağında Avrupa ve Osmanlı','Uluslararası İlişkilerde Denge Stratejisi']),
  ('Tarih','TYT','Milli Mücadele ve Cumhuriyet',4, array['XX. Yüzyıl Başlarında Osmanlı Devleti ve Dünya','Milli Mücadele','Atatürkçülük ve Türk İnkılabı']),

  ('Tarih','AYT','Tarih Bilimi ve İlk Çağlar',1, array['Tarih Bilimi','İlk Uygarlıklar','İlk Türk Devletleri']),
  ('Tarih','AYT','İslam ve Türk-İslam Tarihi',2, array['İslam Tarihi ve Medeniyeti','Türk İslam Devletleri','Türkiye Tarihi']),
  ('Tarih','AYT','Osmanlı Tarihi',3, array['Beylikten Devlete','Dünya Gücü Osmanlı Devleti','Arayış Yılları','Avrupa ve Osmanlı','En Uzun Yüzyıl']),
  ('Tarih','AYT','Yakın Çağ ve Toplum',4, array['Devrimler Çağında Değişen Devlet Toplum İlişkileri','Sermaye ve Emek','XIX ve XX. Yüzyılda Değişen Gündelik Hayat']),
  ('Tarih','AYT','Milli Mücadele ve Cumhuriyet',5, array['XX. Yüzyıl Başlarında Osmanlı Devleti ve Dünya','Milli Mücadele','Atatürkçülük ve Türk İnkılabı','Çağdaş Türkiye Yolunda Adımlar']),
  ('Tarih','AYT','Çağdaş Dünya',6, array['İki Savaş Arası Dönemde Türkiye ve Dünya','II. Dünya Savaşı Sürecinde Türkiye ve Dünya','II. Dünya Savaşı Sonrası Türkiye ve Dünya','Toplumsal Devrim Çağında Dünya ve Türkiye','Yüzyılın Eşiğinde Türkiye ve Dünya']),

  -- ══ COĞRAFYA ══
  ('Coğrafya','TYT','Doğal Sistemler',1, array['Doğa ve İnsan','Dünyanın Şekli ve Hareketleri','Coğrafi Konum','Harita Bilgisi']),
  ('Coğrafya','TYT','İklim Bilgisi',2, array['Atmosfer ve Sıcaklık','İklimler','Basınç ve Rüzgarlar','Nem Yağış ve Buharlaşma']),
  ('Coğrafya','TYT','Yer Şekilleri ve Doğal Varlıklar',3, array['İç Kuvvetler ve Dış Kuvvetler','Su Toprak ve Bitkiler','Türkiyenin Yer Şekilleri']),
  ('Coğrafya','TYT','Beşeri Sistemler',4, array['Nüfus','Göç','Yerleşme','Ekonomik Faaliyetler','Bölgeler','Uluslararası Ulaşım Hatları']),
  ('Coğrafya','TYT','Çevre ve Toplum',5, array['Çevre ve Toplum','Doğal Afetler']),

  ('Coğrafya','AYT','Doğal Sistemler',1, array['Ekosistem']),
  ('Coğrafya','AYT','Beşeri Sistemler',2, array['Nüfus Politikaları','Şehirleşme ve Ekonomi','Göç ve Şehirleşme']),
  ('Coğrafya','AYT','Türkiye Coğrafyası',3, array['Türkiyede Yerleşme','Türkiye Ekonomisi','Türkiyenin İşlevsel Bölgeleri','Ekonomik Faaliyetler ve Doğal Kaynaklar']),
  ('Coğrafya','AYT','Küresel Ortam',4, array['Küresel Ticaret','İlk Uygarlıklar','Küresel ve Bölgesel Örgütler','Ülkeler Arası Etkileşim','Bölgeler ve Ülkeler']),
  ('Coğrafya','AYT','Çevre ve Toplum',5, array['Çevre ve Toplum','Doğal Afetler ve Toplum']),

  -- ══ FELSEFE GRUBU ══
  ('Felsefe','TYT','Felsefeye Giriş',1, array['Felsefenin Konusu']),
  ('Felsefe','TYT','Felsefenin Alanları',2, array['Bilgi Felsefesi','Varlık Felsefesi','Ahlak Felsefesi','Sanat Felsefesi','Din Felsefesi','Siyaset Felsefesi','Bilim Felsefesi']),
  ('Felsefe','TYT','Felsefe Tarihi',3, array['İlk Çağ Felsefesi','MS 2-15. Yüzyıl Felsefesi','15-17. Yüzyıl Felsefesi','18-19. Yüzyıl Felsefesi','20. Yüzyıl Felsefesi']),

  ('Felsefe','AYT','Felsefeye Giriş',1, array['Felsefenin Alanı']),
  ('Felsefe','AYT','Felsefenin Alanları',2, array['Bilgi Felsefesi','Bilim Felsefesi','Varlık Felsefesi','Ahlak Felsefesi','Siyaset Felsefesi','Sanat Felsefesi','Din Felsefesi']),
  ('Felsefe','AYT','Felsefe Tarihi',3, array['20. Yüzyıl Felsefesi']),

  ('Mantık','AYT','Mantık',1, array['Mantığa Giriş','Klasik Mantık','Mantık ve Dil','Sembolik Mantık']),
  ('Psikoloji','AYT','Psikoloji',1, array['Psikoloji Bilimini Tanıyalım','Psikolojinin Temel Süreçleri','Öğrenme Bellek ve Düşünme','Ruh Sağlığının Temelleri']),
  ('Sosyoloji','AYT','Sosyoloji',1, array['Sosyolojiye Giriş','Birey ve Toplum','Toplumsal Yapı','Toplumsal Değişme ve Gelişme','Toplum ve Kültür','Toplumsal Kurumlar']),

  -- ══ DİN KÜLTÜRÜ ══
  ('Din Kültürü ve Ahlak Bilgisi','TYT','İnanç ve İbadet',1, array['Bilgi ve İnanç','İslam ve İbadet','Allah İnsan İlişkisi','Vahiy ve Akıl']),
  ('Din Kültürü ve Ahlak Bilgisi','TYT','Ahlak ve Değerler',2, array['Ahlak ve Değerler']),
  ('Din Kültürü ve Ahlak Bilgisi','TYT','Hz. Muhammed ve İslam Düşüncesi',3, array['Hz. Muhammed','İslam Düşüncesinde Yorumlar ve Mezhepler']),
  ('Din Kültürü ve Ahlak Bilgisi','TYT','Din, Kültür ve Dünya Dinleri',4, array['Din Kültür ve Medeniyet','İslam ve Bilim','Yaşayan Dinler']),

  ('Din Kültürü ve Ahlak Bilgisi','AYT','İnanç ve İbadet',1, array['İnanç','İbadet','Vahiy ve Akıl','Dünya ve Ahiret','İnançla İlgili Meseleler']),
  ('Din Kültürü ve Ahlak Bilgisi','AYT','Ahlak ve Değerler',2, array['Ahlak ve Değerler','Güncel Dini Meseleler']),
  ('Din Kültürü ve Ahlak Bilgisi','AYT','Hz. Muhammed ve İslam Düşüncesi',3, array['Hz. Muhammed','Kurana Göre Hz. Muhammed','Tasavvufi Yorumlar ve Mezhepler']),
  ('Din Kültürü ve Ahlak Bilgisi','AYT','Din, Kültür ve Medeniyet',4, array['Din Kültür ve Medeniyet','İslam ve Bilim','Anadoluda İslam']),
  ('Din Kültürü ve Ahlak Bilgisi','AYT','Yaşayan Dinler',5, array['Yahudilik ve Hristiyanlık','Hint ve Çin Dinleri'])

) as v(subject, sinav, unite, sira, adlar)
 where k.subject = v.subject and k.sinav = v.sinav and k.ad = any(v.adlar);

-- ─────────────────────────────────────────────────────────────────────────────
-- konu_havuz view'i ünite kolonlarını da döndürmeli.
--
-- 0026'daki tanım yeniden yazılır (0026 DOSYASI DEĞİŞTİRİLMEZ — uygulanmış migration'ın
-- gövdesi asla düzenlenmez, yoksa başka ortamda farklı içerikle koşar). Arayüz üniteye
-- göre gruplamayı TEK sorguda yapabilsin diye kolonlar view'a taşınıyor; ikinci bir
-- `konular` sorgusu + bellekte birleştirme, sayım ile grup bilgisinin ayrışmasına açık olurdu.
--
-- ⚠️ DROP + CREATE, "CREATE OR REPLACE" DEĞİL — ÖLÇÜLDÜ, ilk deneme buna takıldı:
--     ERROR 42P16: cannot change name of view column "soru_sayisi" to "unite"
-- Postgres'te CREATE OR REPLACE VIEW kolonları YALNIZ SONA ekleyebilir; var olan kolon
-- sırasını/adını değiştiremez. `unite` kolonunu `sira`dan sonraya koymak 6. kolonu
-- soru_sayisi'ndan unite'ye kaydırıyor ve reddediliyor. Sona eklemek de mümkündü ama
-- kolon sırası okunaksız kalırdı; view'in bağımlısı yok (yalnız brain service_role ile
-- okuyor), o yüzden düşürüp yeniden kurmak güvenli.
-- ─────────────────────────────────────────────────────────────────────────────
drop view if exists public.konu_havuz;

create view public.konu_havuz as
select
  k.id                       as konu_id,
  k.subject,
  k.ad,
  k.sinav,
  k.sira,
  k.unite,
  k.unite_sira,
  count(q.id)                as soru_sayisi,
  count(q.id) filter (where q.difficulty = 'kolay') as kolay,
  count(q.id) filter (where q.difficulty = 'orta')  as orta,
  count(q.id) filter (where q.difficulty = 'zor')   as zor
from public.konular k
left join public.kazanim_konu kk on kk.konu_id = k.id
left join public.yks_ai_questions q
       on q.kazanim_id = kk.kazanim_id
      and q.verified = true
      and q.karantina = false
group by k.id, k.subject, k.ad, k.sinav, k.sira, k.unite, k.unite_sira;

comment on view public.konu_havuz is
  'Konu başına ÇÖZÜLEBİLİR soru adedi (verified ∧ ¬karantina) + zorluk kırılımı + ünite (0031). '
  'Yalnız service_role okur — authenticated''a GRANT verilmez (RLS dolanma yüzeyi).';

-- =============================================================================
-- DOĞRULAMA:
--   -- 1) ÜNİTESİZ KONU KALMAMALI (0 satır beklenir; satır dönerse arayüz "Diğer"e atar):
--   select subject, sinav, ad from public.konular where unite is null order by 1,2,3;
--
--   -- 2) Ünite başına konu sayısı — hiçbir blok 10'u geçmemeli (taranabilirlik):
--   select subject, sinav, unite, count(*) c from public.konular
--    group by 1,2,3 having count(*) > 10 order by c desc;
--
--   -- 3) Matematik TYT artık 7 blok (34 düz satır yerine):
--   select unite, count(*) from public.konular
--    where subject='Matematik' and sinav='TYT' group by 1 order by min(unite_sira);
--
--   -- 4) Toplam hâlâ 313 (ünite ataması satır EKLEMEZ/SİLMEZ):
--   select count(*) from public.konular;
-- =============================================================================
