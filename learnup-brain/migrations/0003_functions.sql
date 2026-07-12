-- =============================================================================
-- LearnUp "Beyin" — §12 / 0003_functions.sql   (RETRIEVAL RPC'LERİ)
-- 2 retrieval RPC + indeksleri. Tablolar (0001) zaten kurulu.
-- Analitik RPC'ler taşındı: distractor_traps → 0004 · weak_kazanimlar → 0005.
--
-- 42P01 DÜZELTMESİ: SQL Editor oturumunun search_path'i public'i kapsamayabiliyor →
--   (a) search_path açıkça public + extensions'a alınır (ltree/vector operatörleri için),
--   (b) TÜM tablo/fonksiyon adları `public.` ile nitelenir → çıplak-isim çözümleme sorunu biter.
-- Idempotent — tablolarına/verilerine dokunmaz.
-- =============================================================================
set search_path to public, extensions;

create extension if not exists vector;
create extension if not exists ltree;

-- Retrieval performansı: vektör HNSW (cosine) + ltree GiST   (varsa atlar)
create index if not exists idx_knowledge_embedding on public.yks_knowledge using hnsw (embedding vector_cosine_ops);
create index if not exists idx_exemplars_embedding on public.yks_exemplars using hnsw (embedding vector_cosine_ops);
create index if not exists idx_knowledge_path      on public.yks_knowledge using gist (path);

-- 1) match_yks_knowledge — grounding retrieval (subject + ltree ön-ek + cosine)
create or replace function public.match_yks_knowledge(
  query_embedding vector(768),
  filter_subject  text,
  filter_paths    text[],
  match_count     int default 8
)
returns table (id bigint, content text, context text, kazanim_code text, similarity float)
language sql stable
as $$
  select k.id, k.content, k.context, k.kazanim_code,
         1 - (k.embedding <=> query_embedding) as similarity
  from public.yks_knowledge k
  where k.subject = filter_subject
    and (
      filter_paths is null
      or coalesce(array_length(filter_paths, 1), 0) = 0
      or exists (select 1 from unnest(filter_paths) fp where k.path <@ fp::ltree)
    )
  order by k.embedding <=> query_embedding
  limit match_count;
$$;

-- 2) match_yks_exemplars — altın ÖSYM soruları (subject/topic/difficulty + cosine)
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
    and (filter_difficulty is null or e.difficulty = filter_difficulty)
  order by e.embedding <=> query_embedding
  limit match_count;
$$;

-- 3-4) weak_kazanimlar / distractor_traps BU DOSYADAN TAŞINDI (birleşme hükmü):
--   distractor_traps → 0004_unification.sql (kanonik telemetri user_logs üstünden)
--   weak_kazanimlar  → 0005_agents.sql      (user_mastery — çürüme-farkındalıklı — üstünden)

-- Çağrı yetkileri (backend service_role zaten tam yetkili; frontend için authenticated)
grant execute on function
  public.match_yks_knowledge(vector, text, text[], int),
  public.match_yks_exemplars(vector, text, text, text, int)
to authenticated, service_role;

-- =============================================================================
-- DOĞRULAMA (opsiyonel):
--   select proname from pg_proc where pronamespace = 'public'::regnamespace
--     and proname in ('match_yks_knowledge','match_yks_exemplars','weak_kazanimlar','distractor_traps');
--   -- 4 satır dönerse tamamdır.
-- =============================================================================
