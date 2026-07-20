-- =============================================================================
-- 0018 — ÖDEV KAYNAK İZİ (geniş havuz hazırlığı)
--
-- Ön koşul: 0016. Idempotent.
--
-- NEDEN: Ödeve giren soru, havuzdan `questions` tablosuna KOPYALANIR (lib/odev-derle.ts;
-- öğrenci yalnız `questions`'tan okur). Kopya, ödevi değişmez kılar — ama kopyanın
-- NEREDEN geldiği kaydedilmiyordu.
--
-- Havuz küçükken (86 AI sorusu) bu görünmezdi. Havuz büyüdükçe iki arıza doğar:
--   1) Aynı soru aynı öğrenciye defalarca atanır — sistem "yeni set" der, öğrenci
--      aynı soruyu görür. Öğrencinin gözünde bu, ürünün bozuk olması demektir.
--   2) "Bu havuz sorusu kaç kez ödevlendirildi" sorusu yanıtsız kalır (ölçüm yok).
--
-- ÇÖZÜM: kopyaya kökenini yaz. Tek kolon + tek indeks; dışlama sorgusu bunun üstünde.
-- =============================================================================
set search_path to public, extensions;

-- Hangi havuz satırından kopyalandı. NULL = elle/eski yolla girilmiş soru (geçerli hâl).
alter table public.questions
  add column if not exists kaynak_soru_id uuid;

comment on column public.questions.kaynak_soru_id is
  'Kopyalandığı havuz satırının id''si (yks_questions | yks_ai_questions). '
  'FK YOK: iki farklı tabloyu işaret edebilir ve havuz satırı silinse bile '
  'ödevin bütünlüğü korunmalıdır (kopya = değişmez anlık görüntü).';

-- Dışlama sorgusu: "bu öğrenciye daha önce atanmış havuz soruları".
-- teacher_id + kaynak_soru_id üzerinden gidilir; kısmi indeks NULL'ları dışarıda tutar.
create index if not exists questions_kaynak_soru
  on public.questions (kaynak_soru_id)
  where kaynak_soru_id is not null;

-- =============================================================================
-- DOĞRULAMA:
--   select column_name from information_schema.columns
--    where table_name='questions' and column_name='kaynak_soru_id';        -- 1 satır
--   select indexname from pg_indexes where indexname='questions_kaynak_soru'; -- 1 satır
-- =============================================================================
