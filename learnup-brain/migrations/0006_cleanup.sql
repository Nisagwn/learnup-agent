-- =============================================================================
-- LearnUp — 0006_cleanup.sql   (ESKİ BRAIN 0001 ARTIKLARININ TEMİZLİĞİ)
-- YALNIZ 0004 + 0005'TEN SONRA çalıştır (o dosyalar eski RPC'leri yeni kaynaklara
-- çevirdikten sonra bu tabloya hiçbir şey bakmıyor olur).
--
-- Bağlam: Eski brain 0001_init.sql `user_activities` tablosunu oluşturmuştu.
-- Birleşme hükmü (THE-LEARNUP-MASTER-PLAN §6): kanonik telemetri = user_logs.
-- Uzak DB'de tablo BOŞ doğrulandı (2026-07-11, 0 satır) → veri kaybı yok.
-- =============================================================================

drop table if exists public.user_activities;

-- DOĞRULAMA:
--   select count(*) from information_schema.tables where table_name='user_activities';  -- 0 beklenir
