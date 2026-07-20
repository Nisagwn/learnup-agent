-- ═══════════════════════════════════════════════════════════════════════════
-- 0015 — EXEMPLAR KÜNYESİ: TYT/AYT çapası + kazanım bağlantısı örnek yoluna taşınır
-- ═══════════════════════════════════════════════════════════════════════════
--
-- NEDEN: yks_exemplars'ta exam_label/exam_year sütunları 0005'ten beri VAR ama ingest
-- doldurmadı (ölçüldü: hepsi NULL) ve RPC döndürmüyor. Oysa 710 TYT / 1020 AYT etiketi
-- elimizdeki tek BEDAVA seviye sinyali; çıkmış soruların %88'i (1518/1730) kazanıma bağlı
-- ama bu bağ yks_questions'ta hapis — örnek seçen yol (match_yks_exemplars) göremiyor.
-- İki tablo content_hash = md5(question_text) ile birebir join'lenir (ingest ikisine de
-- aynı hash'i yazdı).
--
-- İLK KULLANIM VERİ TAŞIMAKTIR, DAVRANIŞ DEĞİŞTİRMEK DEĞİL: örnek seçimi bu migration'la
-- DARALMAZ (AYT=zor varsayımı doğrulanmadı; aynı-kazanım örneği içerik-kopyası riski).
-- Kolonlar eval/hakem-sınavı verisi olarak ve gelecekteki zorluk-etiketli seçim için taşınır;
-- kullanımına A/B ölçümü karar verir.
--
-- ⚠️ RPC'nin DÖNÜŞ TİPİ DEĞİŞİYOR → `create or replace` PATLAR ("cannot change return type").
--    Tek yol tx içinde DROP + CREATE (0013 kalıbı). Çağıran (rag.ts) yeni kolonlara karşı
--    geri-uyumlu: fazladan alan TypeScript tarafında yalnız tipe eklenir.

begin;

-- 1) Kazanım bağlantısı kolonu (exam_label/exam_year zaten var — 0005)
alter table public.yks_exemplars
  add column if not exists kazanim_id bigint references public.curriculum_nodes(id) on delete set null;

-- 2) Backfill — content_hash join ile yks_questions'tan künye taşınır.
--    Yalnız çıkmış sorulardan (osym_cikmis): AI satırı exemplar tablosunda yok ama olursa da
--    yanlış künye basılmasın. %88 kapsama beklenir; kalan 212 eşleşmemiş satır NULL kalır.
update public.yks_exemplars e
set exam_label = q.exam_label,
    exam_year  = q.exam_year,
    kazanim_id = q.kazanim_id
from public.yks_questions q
where q.content_hash = e.content_hash
  and q.source_type = 'osym_cikmis';

-- 3) RPC: dönüşe exam_label + kazanim_id eklenir. WHERE ve sıralama 0009 ile BİREBİR AYNI —
--    bu migration seçim davranışını değiştirmez, yalnız künyeyi görünür kılar.
drop function if exists public.match_yks_exemplars(vector, text, text, text, int);

create function public.match_yks_exemplars(
  query_embedding   vector(768),
  filter_subject    text,
  filter_topic      text,
  filter_difficulty text,
  match_count       int default 4
)
returns table (
  question_text  text,
  options        jsonb,
  correct_option text,
  solution       text,
  exam_label     text,
  kazanim_id     bigint
)
language sql stable
as $$
  select e.question_text, e.options, e.correct_option, e.solution, e.exam_label, e.kazanim_id
  from public.yks_exemplars e
  where e.subject = filter_subject
    and (filter_topic      is null or e.topic      = filter_topic)
    and (filter_difficulty is null or e.difficulty is null or e.difficulty = filter_difficulty)
  order by e.embedding <=> query_embedding
  limit match_count;
$$;

commit;

-- DOĞRULAMA (migration sonrası elle):
--   select count(*) filter (where exam_label is not null) as etiketli,
--          count(*) filter (where kazanim_id is not null) as kazanimli,
--          count(*) as toplam
--   from yks_exemplars;
--   -- beklenen: etiketli ≈ 1730 (hash birebir), kazanimli ≈ 1518 (%88)
