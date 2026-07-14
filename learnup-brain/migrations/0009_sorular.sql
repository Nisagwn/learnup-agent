-- =============================================================================
-- 0009 — Çıkmış sorular (ÖSYM 2018-2025) için şema hazırlığı.
--
-- ÜÇ İŞ YAPAR:
--
-- 1) İDEMPOTENSİ (content_hash + unique index)
--    yks_questions ve yks_exemplars'ta HİÇBİR benzersizlik kısıtı yoktu. Ingest scriptini
--    tekrar çalıştırmak NORMAL iş akışıdır; kısıt olmadan her koşuda sorular ÇİFTLENİR.
--    (yks_knowledge'da bu tam olarak başımıza geldi: 576 kazanıma karşı 724 satır.)
--    → content_hash = md5(question_text). PostgREST upsert'i sütun adı ister, ifade indeksi
--      kullanamaz; bu yüzden hash'i SÜTUN olarak tutuyoruz.
--
-- 2) ÜRÜN ALANLARI (source, topic)
--    Site "çıkmış sorular" başlığıyla yayımlayacak → hangi yıl/hangi sınav bilgisi ŞART.
--      source = "2019-TYT" · topic = belgenin kendi konu başlığı ("Sözcükte Anlam")
--
-- 3) match_yks_exemplars — ZORLUK FİLTRESİ GEVŞETİLİYOR
--    Mevcut hâli:  (filter_difficulty is null or e.difficulty = filter_difficulty)
--    ÖSYM sorularının zorluğunu BİLMİYORUZ (belgede yok) → uydurmuyoruz → difficulty = NULL.
--    Ama NULL = 'orta' ifadesi NULL döner → satır ELENİR. Yani zorluk filtresi verilen HER
--    çağrıda çıkmış soruların TAMAMI görünmez olurdu; exemplar hattı sessizce boş dönerdi.
--    → Zorluğu BİLİNMEYEN soru, her zorluk için geçerli bir ÜSLUP örneğidir; elenmemeli.
-- =============================================================================
set search_path to public, extensions;

-- ── 1+2) Sütunlar ────────────────────────────────────────────────────────────
alter table public.yks_questions add column if not exists content_hash text;
alter table public.yks_questions add column if not exists source       text;   -- "2019-TYT"
alter table public.yks_questions add column if not exists topic        text;   -- belge konu başlığı

alter table public.yks_exemplars add column if not exists content_hash text;
alter table public.yks_exemplars add column if not exists source       text;

-- Mevcut satırlar için hash'i doldur (tablolar şu an boş; yine de güvenli)
update public.yks_questions set content_hash = md5(question_text) where content_hash is null;
update public.yks_exemplars set content_hash = md5(question_text) where content_hash is null;

create unique index if not exists uq_yks_questions_hash on public.yks_questions (content_hash);
create unique index if not exists uq_yks_exemplars_hash on public.yks_exemplars (content_hash);

-- ── 3) Zorluk filtresi: NULL zorluk artık ELENMİYOR ─────────────────────────
create or replace function public.match_yks_exemplars(
  query_embedding   vector(768),
  filter_subject    text,
  filter_topic      text,
  filter_difficulty text,
  match_count       int default 4
)
returns table (question_text text, options jsonb, correct_option text, solution text)
language sql stable
as $$
  select e.question_text, e.options, e.correct_option, e.solution
  from public.yks_exemplars e
  where e.subject = filter_subject
    and (filter_topic      is null or e.topic      = filter_topic)
    and (filter_difficulty is null or e.difficulty is null or e.difficulty = filter_difficulty)
  order by e.embedding <=> query_embedding
  limit match_count;
$$;

grant execute on function public.match_yks_exemplars(vector, text, text, text, int)
  to authenticated, service_role;

-- DOĞRULAMA:
--   select count(*), count(distinct content_hash) from yks_questions;   -- eşit olmalı
--   select indexname from pg_indexes where tablename in ('yks_questions','yks_exemplars')
--     and indexname like 'uq_%';                                        -- 2 satır
