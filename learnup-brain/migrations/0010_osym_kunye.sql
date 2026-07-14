-- =============================================================================
-- 0010 — 0009'un fazlalığını temizler: yks_questions.source KALDIRILIR.
--
-- NEDEN: 0009'da "source" (metin, "2019-TYT") sütununu eklemiştim. 0004 zaten
-- aynı bilgiyi TİPLİ iki sütunda tutuyordu:
--     exam_year  smallint  → 2019
--     exam_label text      → 'TYT'
-- osym.routes.ts bu iki sütunu okur, "source"u hiç kullanmaz. İki yerde duran
-- aynı gerçek er ya da geç birbirinden ayrışır (biri güncellenir, öteki kalır).
-- Tek otorite: exam_year + exam_label.
--
-- yks_exemplars.source KALIR — o tabloda exam_year/exam_label yok ve exemplar'ın
-- hangi sınavdan geldiğini bilmek üretim denetimi için gerekli.
--
-- NOT: bu migration ZORUNLU DEĞİL, temizliktir. Çalıştırılmazsa sütun boş kalır.
-- =============================================================================
set search_path to public, extensions;

alter table public.yks_questions drop column if exists source;

-- DOĞRULAMA:
--   select source_type, count(*), min(exam_year), max(exam_year)
--     from yks_questions group by source_type;
--   -- osym_cikmis satırlarının exam_year/exam_label'i DOLU olmalı (yq_osym_meta_chk zaten zorluyor)
