-- =============================================================================
-- 0029 — KONU SÖZLÜĞÜ DÜZELTMESİ  (web kaynaklarıyla karşılaştırma sonrası)
--
-- Ön koşul: 0027 (konu sözlüğü seed). Idempotent.
--
-- ═══ NEDEN AYRI MIGRATION ═══
-- 0027 UYGULANDI (309 konu yazıldı). Uygulanmış bir migration'ın gövdesi DEĞİŞTİRİLMEZ:
-- başka bir ortamda 0027 farklı içerikle koşar ve iki veritabanı sessizce ayrışır.
-- Düzeltme yeni dosyaya yazılır.
--
-- ═══ KAYNAK KARŞILAŞTIRMASI (2026-07-27) ═══
-- 0027'nin listesi rehberimsensin.com, dopinghafiza.com, kunduz.com ve kitapsec.com
-- listeleriyle ders ders karşılaştırıldı. Sözlüğün BÜYÜK KISMI doğrulandı; üç yerde
-- gerçek eksik bulundu. Eksik olmayan yerlere DOKUNULMADI — "kaynakta farklı yazılmış"
-- ile "eksik" ayrı şeylerdir (ör. kaynak "Elektrokimya" diyor, bizde "Kimya ve Elektrik";
-- aynı konu, ad değişikliği eşlemeyi bozar, fayda getirmez).
--
-- ⚠️ AD DEĞİŞTİRİLMEZ, YALNIZ EKLENİR. Var olan bir konunun adını değiştirmek
-- kazanim_konu'daki eşlemeyi kopartmaz (FK id üzerinden) ama yöneticinin onayladığı
-- eşlemenin anlamını sessizce kaydırır. Yeniden adlandırma gerekirse ayrı ve bilinçli
-- bir iş olmalı.
--
-- ⚠️ `sira` TÜM LİSTE İÇİN YENİDEN YAZILIR (do update). Yeni konuyu listenin sonuna
-- iliştirmek "Permütasyon ve Kombinasyon"u "İntegral"den sonra gösterirdi; öğrenci
-- konuları öğrendiği sırayla görmeli.
-- =============================================================================
set search_path to public, extensions;

insert into public.konular (subject, sinav, ad, sira)
select v.subject, v.sinav, k.ad, k.sira::int
from (values

  -- ── TYT FİZİK: 'Elektrostatik' eksikti ──────────────────────────────────────
  -- Kaynaklar elektrostatiği 'Elektrik'ten (akım/devre) AYIRIYOR ve TYT'de ayrı soru
  -- getiriyor. Tek 'Elektrik' başlığı, yük/alan sorularını akım konusuna gömüyordu.
  ('Fizik', 'TYT', array[
    'Fizik Bilimine Giriş','Madde ve Özellikleri','Sıvıların Kaldırma Kuvveti',
    'Basınç','Isı Sıcaklık ve Genleşme','Hareket ve Kuvvet','Dinamik',
    'İş Güç ve Enerji','Elektrostatik','Elektrik','Manyetizma','Dalgalar','Optik']),

  -- ── AYT MATEMATİK: üç eksik ────────────────────────────────────────────────
  -- 'Fonksiyonlarda Uygulamalar' (grafik/dönüşüm uygulamaları — 11. sınıf ünitesi),
  -- 'Permütasyon ve Kombinasyon' (0027'de yalnız 'Sayma' vardı; kaynaklar P-K-O'yu
  -- ayrı sayıyor ve her yıl soru getiriyor), 'Çemberin Analitik İncelemesi'
  -- ('Analitik Geometri' altında eriyordu, ayrı ünite).
  ('Matematik', 'AYT', array[
    'Kümeler','Denklem ve Eşitsizlikler','Fonksiyonlar','Üçgenler','Veri',
    'Sayma','Permütasyon ve Kombinasyon','Olasılık','Fonksiyonlarla İşlemler',
    'Dörtgenler ve Çokgenler','İkinci Dereceden Denklem ve Fonksiyonlar','Polinomlar',
    'Geometrik Cisimler','Trigonometri','Fonksiyonlarda Uygulamalar','Analitik Geometri',
    'Çemberin Analitik İncelemesi','Denklem ve Eşitsizlik Sistemleri','Çember ve Daire',
    'Uzay Geometri','Üstel ve Logaritmik Fonksiyonlar','Diziler','Limit ve Süreklilik',
    'Türev','İntegral','Dönüşümler']),

  -- ── AYT FİZİK: 'Modern Fizik' tek başlıkta çok şey saklıyordu ───────────────
  -- Kaynaklar modern fiziği beş ayrı konuya bölüyor ve her biri ayrı soru getiriyor.
  -- Tek başlık altında toplamak, öğrenciye "Modern Fizik" deyip 5 farklı konunun
  -- sorularını karışık vermek demekti; kapsama ekranında da açık görünmezdi.
  ('Fizik', 'AYT', array[
    'Vektörler','Bağıl Hareket','Newtonun Hareket Yasaları',
    'Bir Boyutta Sabit İvmeli Hareket','Atışlar','İş Güç ve Enerji',
    'İtme ve Momentum','Tork ve Denge','Basit Makineler',
    'Elektrik Alan ve Potansiyel','Paralel Levhalar ve Sığa',
    'Manyetik Alan ve Manyetik Kuvvet','İndüksiyon ve Alternatif Akım',
    'Çembersel Hareket','Dönme ve Yuvarlanma','Kütle Çekim ve Kepler Yasaları',
    'Basit Harmonik Hareket','Dalga Mekaniği','Atom Modelleri',
    'Atom Fiziği ve Radyoaktivite','Kara Cisim Işıması','Fotoelektrik Olay',
    'Özel Görelilik','Büyük Patlama ve Parçacık Fiziği','Modern Fizik',
    'Modern Fiziğin Teknolojideki Uygulamaları'])

) as v(subject, sinav, adlar)
cross join lateral unnest(v.adlar) with ordinality as k(ad, sira)
on conflict (subject, ad, sinav) do update set sira = excluded.sira;

-- =============================================================================
-- DOĞRULAMA:
--   -- 1) Yeni konular geldi mi (9 satır beklenir):
--   select subject, sinav, ad from public.konular
--    where ad in ('Elektrostatik','Fonksiyonlarda Uygulamalar','Permütasyon ve Kombinasyon',
--                 'Çemberin Analitik İncelemesi','Atom Modelleri','Kara Cisim Işıması',
--                 'Fotoelektrik Olay','Özel Görelilik','Büyük Patlama ve Parçacık Fiziği')
--    order by subject, sinav, sira;
--
--   -- 2) Toplam konu sayısı 309 → 318:
--   select count(*) from public.konular;
--
--   -- 3) TYT ve AYT gerçekten ayrı mı (aynı ders iki sınavda ayrı satır):
--   select subject, sinav, count(*) from public.konular
--    group by 1,2 having subject = 'Matematik' order by 2;
--
--   -- 4) Sıralama bozulmadı mı (her ders/sınav 1..N kesintisiz):
--   select subject, sinav, min(sira), max(sira), count(*) from public.konular
--    group by 1,2 order by 1,2;
-- =============================================================================
