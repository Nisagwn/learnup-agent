-- =============================================================================
-- 0023 — ISI HARİTASI ÖĞRENCİ KIRILIMI (drill-down)
--
-- Ön koşul: 0016 (sinif_mevcudu + sinif_isi_haritasi). Idempotent. YALNIZ FONKSİYON —
-- şema (tablo/kolon/indeks) DEĞİŞMEZ.
--
-- İçerik:
--   sinif_unite_zayif_ogrenciler — sinif_isi_haritasi bir hücreyi weak_student_count
--   SAYISINA çöktürüyor; bu RPC o sayıyı öğrenci SATIRLARINA açar (drill-down).
--
-- ⚠️ ÜÇ-KOPYA KURALI: çürüme formülü lib/mastery.ts:36 + weak_kazanimlar (0005:87-90) +
-- 0016'nın üç RPC'sinde BİREBİR aynıdır. Bu RPC yeni bir formül TÜRETMEZ — 0016
-- sinif_isi_haritasi'nın mevcut/etkin/ogrenci_unite CTE zincirini bayt-bayt kopyalar;
-- yalnız son SELECT'te öğrenciyi EZMEK yerine p_unit_path'e süzüp satırları korur.
--
-- ⚠️ TUTARLILIK DEĞİŞMEZİ (sözleşme): uç bu RPC'yi ısı haritası hücresiyle AYNI roster
-- (sinif_mevcudu), AYNI p_min_attempts ve AYNI p_zayif_esik ile çağırır. Dönen satır
-- sayısı, o hücrenin sinif_isi_haritasi'daki weak_student_count değerine EŞİTTİR
-- (ogrenci_unite'da her öğrenci ünite başına tek satır; süzgeç ou.ogrenci_ort < esik
-- 0016'daki `filter (where ou.ogrenci_ort < p_zayif_esik)` ile aynı koşuldur).
-- =============================================================================
set search_path to public, extensions;

-- ─────────────────────────────────────────────────────────────────────────────
-- sinif_unite_zayif_ogrenciler — tek ünitede (ders × unit_path) çürüme-düzeltilmiş
-- ortalaması p_zayif_esik altında kalan öğrenciler, EN ZAYIF BAŞTA (müdahale sırası).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.sinif_unite_zayif_ogrenciler(
  p_teacher_id   uuid,
  p_subject      text,
  p_unit_path    text,
  p_min_attempts int   default 1,
  p_zayif_esik   float default 0.40
)
returns table (
  user_id uuid, ogrenci_ort float, attempts bigint, node_count int
)
language sql stable
as $$
  -- ── 0016 sinif_isi_haritasi CTE zinciri (BİREBİR — üç-kopya kuralı) ──
  with mevcut as (select student_id from public.sinif_mevcudu(p_teacher_id)),
  etkin as (
    select um.user_id, n.subject,
           subltree(n.path, 0, least(nlevel(n.path), 2))::text as unit_path,
           um.attempts,
           -- ÇÜRÜME: lib/mastery.ts:36 ve weak_kazanimlar (0005:87-90) ile BİREBİR
           (um.mastery * exp(
             -greatest(extract(epoch from (now() - um.updated_at)) / 86400.0, 0)
             / (7.0 * (1.0 + um.stability))))::float as m_eff
    from public.user_mastery um
    join mevcut m on m.student_id = um.user_id
    join public.curriculum_nodes n on n.id = um.node_id
    where um.attempts >= p_min_attempts
      and (p_subject is null or n.subject = p_subject)
  ),
  ogrenci_unite as (
    select user_id, subject, unit_path,
           avg(m_eff)    as ogrenci_ort,
           sum(attempts) as attempts,
           count(*)      as node_count
    from etkin
    group by user_id, subject, unit_path
  )
  -- ── 0016'dan SAPMA: `group by subject, unit_path` ile öğrenciyi EZMEK yerine
  --    hücreyi p_unit_path'e süzüp öğrenci satırlarını olduğu gibi döndür. ──
  select ou.user_id,
         ou.ogrenci_ort::float,
         ou.attempts::bigint,
         ou.node_count::int
  from ogrenci_unite ou
  where ou.unit_path = p_unit_path
    and ou.ogrenci_ort < p_zayif_esik
  order by ou.ogrenci_ort asc;      -- en zayıf başta: müdahale sırası
$$;
revoke execute on function public.sinif_unite_zayif_ogrenciler(uuid, text, text, int, float)
  from public, anon, authenticated;
grant  execute on function public.sinif_unite_zayif_ogrenciler(uuid, text, text, int, float)
  to service_role;

-- =============================================================================
-- DOĞRULAMA:
--   select proname from pg_proc where proname = 'sinif_unite_zayif_ogrenciler';  -- 1 satır
--   -- Tutarlılık: bir öğretmen + hücre için drill-down satır sayısı = ısı haritası
--   -- weak_student_count (aynı p_min_attempts + p_zayif_esik ile):
--   select count(*) from public.sinif_unite_zayif_ogrenciler(
--            '<teacher_id>', '<subject>', '<unit_path>', 1, 0.40);
--   select weak_student_count from public.sinif_isi_haritasi('<teacher_id>', '<subject>', 1, 0.40)
--    where unit_path = '<unit_path>';                                -- iki sayı EŞİT olmalı
-- =============================================================================
