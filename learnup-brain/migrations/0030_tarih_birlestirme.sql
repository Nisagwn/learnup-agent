-- =============================================================================
-- 0030 — TARİH BİRLEŞTİRME  (T.C. İnkılap Tarihi ayrı ders değil, Tarih'in parçası)
--
-- Ön koşul: 0027, 0029 (konu sözlüğü). Idempotent.
--
-- ═══ NEDEN ═══
-- 0027 "T.C. İnkılap Tarihi ve Atatürkçülük"i ayrı bir DERS olarak seed etmişti. Yanlış:
-- o bir OKUL DERSİ adıdır (curriculum_nodes'ta `ita.*` olarak öyle geçiyor), ÖSYM TESTİ
-- değil. ÖSYM'de tek "Tarih" testi vardır; İnkılap konuları TYT Tarih'in ve AYT Tarih'in
-- İÇİNDE sorulur.
--
-- Ayrı ders bırakmanın somut zararı: öğrenci ders listesinde "Tarih" ve "T.C. İnkılap
-- Tarihi ve Atatürkçülük" yan yana görünürdü. Bu, sınavda olmayan bir ayrımı öğretir ve
-- "Milli Mücadele"yi hangisinden çalışacağını belirsizleştirirdi (iki derste de vardı).
--
-- ⚠️ MÜFREDAT AĞACINA DOKUNULMAZ. `curriculum_nodes.subject` = 'T.C. İnkılap Tarihi ve
-- Atatürkçülük' AYNEN kalır — o MEB'in ders adıdır ve doğrudur. Değişen yalnız SUNUM
-- katmanı: o dersin kazanımları artık Tarih'in konularına eşlenir. Eşleme kazanim_id
-- üzerinden yürüdüğü için (konu_havuz view'i soruları kazanımdan sayar) İnkılap sorularının
-- tamamı Tarih altında görünür.
--
-- ⚠️ ETİKETLEME SCRIPTİ EŞANLAMLI TABLOSUNA MUHTAÇ. `curriculum_nodes.subject` hâlâ İnkılap
-- derken `konular`da o ders kalmayınca script "konu sözlüğünde YOK" deyip 16 kazanımı
-- düşürürdü. src/scripts/etiketle-konu.ts içine DERS_ESANLAMI eklendi (aynı commit).
--
-- ⚠️ SİLME SIRASI ÖNEMLİ: önce Tarih'e eksik konular EKLENİR, sonra İnkılap satırları
-- silinir. Ters sırada, silme ile ekleme arasındaki pencerede o konular hiç yoktur.
-- kazanim_konu ve konu_talep şu an BOŞ olduğundan cascade silme veri kaybetmez; dolu
-- olsaydı önce eşlemelerin Tarih karşılığına taşınması gerekirdi.
-- =============================================================================
set search_path to public, extensions;

-- ─────────────────────────────────────────────────────────────────────────────
-- A) Tarih'e eksik İnkılap konularını ekle (sıra korunarak)
--
-- TYT Tarih 0027'de "Uluslararası İlişkilerde Denge Stratejisi"nde bitiyordu; ÖSYM TYT
-- Tarih listesi XX. yüzyıl + Milli Mücadele + Atatürkçülük ile devam eder (kaynak:
-- rehberimsensin, kitapsec — 2026-07-27 karşılaştırması).
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.konular (subject, sinav, ad, sira)
select v.subject, v.sinav, k.ad, k.sira::int
from (values

  ('Tarih', 'TYT', array[
    'Tarih ve Zaman','İnsanlığın İlk Dönemleri','Orta Çağda Dünya',
    'İlk ve Orta Çağlarda Türk Dünyası','İslam Medeniyetinin Doğuşu',
    'Türklerin İslamiyeti Kabulü','Selçuklu Türkiyesi','Beylikten Devlete Osmanlı',
    'Dünya Gücü Osmanlı','Değişen Dünya Dengeleri Karşısında Osmanlı',
    'Değişim Çağında Avrupa ve Osmanlı','Uluslararası İlişkilerde Denge Stratejisi',
    'XX. Yüzyıl Başlarında Osmanlı Devleti ve Dünya','Milli Mücadele',
    'Atatürkçülük ve Türk İnkılabı']),

  ('Tarih', 'AYT', array[
    'Tarih Bilimi','İlk Uygarlıklar','İlk Türk Devletleri',
    'İslam Tarihi ve Medeniyeti','Türk İslam Devletleri','Türkiye Tarihi',
    'Beylikten Devlete','Dünya Gücü Osmanlı Devleti','Arayış Yılları',
    'Avrupa ve Osmanlı','En Uzun Yüzyıl',
    'Devrimler Çağında Değişen Devlet Toplum İlişkileri','Sermaye ve Emek',
    'XIX ve XX. Yüzyılda Değişen Gündelik Hayat',
    'XX. Yüzyıl Başlarında Osmanlı Devleti ve Dünya','Milli Mücadele',
    'Atatürkçülük ve Türk İnkılabı',
    'İki Savaş Arası Dönemde Türkiye ve Dünya',
    'II. Dünya Savaşı Sürecinde Türkiye ve Dünya',
    'II. Dünya Savaşı Sonrası Türkiye ve Dünya',
    'Toplumsal Devrim Çağında Dünya ve Türkiye',
    'Çağdaş Türkiye Yolunda Adımlar',
    'Yüzyılın Eşiğinde Türkiye ve Dünya'])

) as v(subject, sinav, adlar)
cross join lateral unnest(v.adlar) with ordinality as k(ad, sira)
on conflict (subject, ad, sinav) do update set sira = excluded.sira;

-- ─────────────────────────────────────────────────────────────────────────────
-- B) Ayrı ders olarak İnkılap'ı kaldır
--
-- kazanim_konu.konu_id ve konu_talep.konu_id FK'leri ON DELETE CASCADE'dir; bu satırlara
-- bağlı eşleme/talep varsa BİRLİKTE silinir. Şu an ikisi de boş (eşleme henüz yazılmadı),
-- yani kayıp yok. Dolu bir ortamda bu migration'dan ÖNCE eşlemeler Tarih'in aynı adlı
-- konusuna taşınmalıdır.
-- ─────────────────────────────────────────────────────────────────────────────
delete from public.konular where subject = 'T.C. İnkılap Tarihi ve Atatürkçülük';
delete from public.ders_kapsam where subject = 'T.C. İnkılap Tarihi ve Atatürkçülük';

-- =============================================================================
-- DOĞRULAMA:
--   -- 1) İnkılap artık ders değil (0 satır beklenir):
--   select * from public.konular     where subject like 'T.C. İnkılap%';
--   select * from public.ders_kapsam where subject like 'T.C. İnkılap%';
--
--   -- 2) Tarih konuları: TYT 15, AYT 23:
--   select sinav, count(*) from public.konular where subject='Tarih' group by 1;
--
--   -- 3) Toplam konu 318 → 318 - 12 (İnkılap) + 7 (Tarih'e eklenen) = 313:
--   select count(*) from public.konular;
--
--   -- 4) Müfredat ağacı DEĞİŞMEDİ (İnkılap kazanımları yerinde, 16 satır civarı):
--   select count(*) from public.curriculum_nodes where subject like 'T.C. İnkılap%';
-- =============================================================================
