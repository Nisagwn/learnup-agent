-- =============================================================================
-- 0014 — v_mastery_rollup: RLS BAYPASINI KAPAT
--
-- ARIZA: 0005_agents.sql:165 `grant select on public.v_mastery_rollup to
-- service_role, authenticated;` veriyor. Ama v_mastery_rollup DÜZ bir view —
-- `security_invoker` DEĞİL. Postgres'te düz view SAHİBİNİN haklarıyla çalışır,
-- yani altındaki user_mastery'nin RLS'i (p_um_own_read: user_id = auth.uid())
-- HİÇ DEVREYE GİRMEZ.
--
-- Sonuç: herhangi bir giriş yapmış öğrenci
--     select * from v_mastery_rollup;            -- user_id filtresi YOK
-- diyerek TÜM öğrencilerin ders/ünite ustalık ortalamalarını okuyabilir.
-- user_mastery tablosunun kendisi doğru korunuyor; sızıntı yalnız view üzerinden.
--
-- KARAR: view'i istemciye kapatmak. Amacı zaten PUSULA optimizer'ı + öğretmen
-- analitiği (0005:121) — ikisi de service_role ile çalışır. Öğrenci-yüzlü ustalık
-- verisi artık GET /api/v1/mastery ucundan gider; o uç hem kullanıcıyı JWT'den
-- kilitler hem de effectiveMastery() ile çürümeyi uygular (view'in ham avg(mastery)'si
-- çürümeyi zaten HESAPLAMIYOR → istemciye şişik değer gösteriyordu).
--
-- KIRILMA RİSKİ YOK: frontend v_mastery_rollup'ı kullanmıyor (Bugun/Harita dahil).
-- =============================================================================
set search_path to public, extensions;

revoke select on public.v_mastery_rollup from authenticated;

-- =============================================================================
-- DOĞRULAMA:
--   select grantee, privilege_type from information_schema.role_table_grants
--    where table_name = 'v_mastery_rollup';        -- yalnız service_role kalmalı
-- =============================================================================
