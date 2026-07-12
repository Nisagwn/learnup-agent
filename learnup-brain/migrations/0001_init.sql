-- =============================================================================
-- LearnUp "Beyin" — §12 / 0001_init.sql   (TAM MIGRASYON — TEK DOSYA)
-- Postgres + pgvector(768) + ltree · Supabase.  Boş projede sıfırdan kurar.
-- Supabase Studio > SQL Editor'e YAPIŞTIR & RUN.  Idempotent (if not exists / or replace).
--
-- İçerik: eklentiler → 9 tablo → indeksler → 2 retrieval RPC → updated_at trigger → RLS → grant.
-- EMBED_DIM = 768 (koddaki F1 ile birebir).  user_id = auth kullanıcı JWT sub (uuid).
--
-- BİRLEŞME HÜKMÜ (THE-LEARNUP-MASTER-PLAN §6): `user_activities` bu dosyadan ÇIKARILDI —
-- telemetri kanoniği mevcut `user_logs` tablosudur (0004 gerekli kolonları ekler).
-- weak_kazanimlar / distractor_traps RPC'leri de buradan taşındı:
--   distractor_traps → 0004 (user_logs üstünden) · weak_kazanimlar → 0005 (user_mastery üstünden).
-- ÇALIŞTIRMA SIRASI: 0001 → 0003 → 0004 → 0005 (hepsi idempotent).
-- =============================================================================

-- ── 0) Eklentiler + search_path ──────────────────────────────────────────────
create schema if not exists extensions;
create extension if not exists vector   with schema extensions;   -- pgvector
create extension if not exists ltree     with schema extensions;   -- hiyerarşik yol
create extension if not exists pgcrypto  with schema extensions;   -- gen_random_uuid()
set search_path to public, extensions;

-- ── 1) Müfredat / referans ───────────────────────────────────────────────────
create table if not exists public.curriculum_nodes (
  id         bigint generated always as identity primary key,
  node_type  text  not null default 'kazanim',    -- subject | unit | topic | kazanim
  code       text,
  title      text  not null,
  path       ltree not null,                       -- ör. mat.turev.zincir_kurali
  subject    text  not null,
  grade      int,
  created_at timestamptz not null default now()
);

create table if not exists public.osym_blueprint (
  id             bigint generated always as identity primary key,
  exam_type      text not null check (exam_type in ('TYT','AYT')),
  subject        text not null,
  question_count int  not null,
  unique (exam_type, subject)
);

-- ── 2) İçerik: soru havuzu + RAG kaynakları ──────────────────────────────────
create table if not exists public.yks_questions (
  id             uuid primary key default gen_random_uuid(),
  subject        text    not null,
  kazanim_id     bigint  references public.curriculum_nodes(id) on delete set null,
  question_text  text    not null,
  options        jsonb   not null,                 -- {"A":..,"B":..,"C":..,"D":..,"E":..}
  correct_option text    not null,                 -- 'A'..'E'
  solution       text,
  difficulty     text,                             -- kolay | orta | zor
  verified       boolean not null default false,
  quality        int,
  created_at     timestamptz not null default now()
);

create table if not exists public.yks_knowledge (
  id           bigint generated always as identity primary key,
  subject      text  not null,
  path         ltree not null,
  kazanim_code text,
  context      text,
  content      text  not null,
  embedding    vector(768) not null,
  created_at   timestamptz not null default now()
);

create table if not exists public.yks_exemplars (
  id             bigint generated always as identity primary key,
  subject        text not null,
  topic          text,
  difficulty     text,
  question_text  text not null,
  options        jsonb not null,
  correct_option text not null,
  solution       text,
  embedding      vector(768) not null,
  created_at     timestamptz not null default now()
);

-- ── 3) Kullanıcı verisi ──────────────────────────────────────────────────────
-- (Telemetri tablosu YOK: kanonik telemetri = mevcut `user_logs`; bkz. 0004.)
create table if not exists public.question_states (
  user_id     uuid  not null,
  question_id uuid  not null,
  state       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  primary key (user_id, question_id)
);

create table if not exists public.roadmaps (
  user_id    uuid  primary key,
  steps      jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_tasks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  kind       text not null,                        -- topup | session | roadmap
  payload    jsonb not null default '{}'::jsonb,
  status     text not null default 'PENDING'
             check (status in ('PENDING','RUNNING','COMPLETED','FAILED')),
  result     jsonb,
  error      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id         bigint generated always as identity primary key,
  user_id    uuid not null,
  session_id text,
  role       text not null,                        -- user | assistant | tool
  content    text not null,
  created_at timestamptz not null default now()
);

-- ── 4) İndeksler ─────────────────────────────────────────────────────────────
create index if not exists idx_curriculum_path      on public.curriculum_nodes using gist (path);
create index if not exists idx_curriculum_node_type on public.curriculum_nodes (node_type);
create index if not exists idx_knowledge_path       on public.yks_knowledge   using gist (path);
create index if not exists idx_knowledge_embedding  on public.yks_knowledge   using hnsw (embedding vector_cosine_ops);
create index if not exists idx_exemplars_embedding  on public.yks_exemplars   using hnsw (embedding vector_cosine_ops);
create index if not exists idx_questions_kazanim    on public.yks_questions (kazanim_id) where verified;
create index if not exists idx_questions_subject    on public.yks_questions (subject)     where verified;
create index if not exists idx_tasks_user_status    on public.agent_tasks   (user_id, status);
create index if not exists idx_chat_user_session    on public.chat_messages (user_id, session_id);

-- ── 5) RPC fonksiyonları (backend supabase.rpc ile çağırır) ──────────────────
create or replace function public.match_yks_knowledge(
  query_embedding vector(768), filter_subject text, filter_paths text[], match_count int default 8
) returns table (id bigint, content text, context text, kazanim_code text, similarity float)
language sql stable as $$
  select k.id, k.content, k.context, k.kazanim_code,
         1 - (k.embedding <=> query_embedding) as similarity
  from public.yks_knowledge k
  where k.subject = filter_subject
    and (filter_paths is null or coalesce(array_length(filter_paths,1),0)=0
         or exists (select 1 from unnest(filter_paths) fp where k.path <@ fp::ltree))
  order by k.embedding <=> query_embedding
  limit match_count;
$$;

create or replace function public.match_yks_exemplars(
  query_embedding vector(768), filter_subject text, filter_topic text, filter_difficulty text, match_count int default 4
) returns table (question_text text, options jsonb, correct_option text, solution text)
language sql stable as $$
  select e.question_text, e.options, e.correct_option, e.solution
  from public.yks_exemplars e
  where e.subject = filter_subject
    and (filter_topic is null or e.topic = filter_topic)
    and (filter_difficulty is null or e.difficulty = filter_difficulty)
  order by e.embedding <=> query_embedding
  limit match_count;
$$;

-- (weak_kazanimlar → 0005'te user_mastery üstünden · distractor_traps → 0004'te user_logs üstünden)

-- ── 6) updated_at trigger ────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;
drop trigger if exists trg_agent_tasks_updated on public.agent_tasks;
create trigger trg_agent_tasks_updated before update on public.agent_tasks
  for each row execute function public.set_updated_at();
drop trigger if exists trg_qstate_updated on public.question_states;
create trigger trg_qstate_updated before update on public.question_states
  for each row execute function public.set_updated_at();
drop trigger if exists trg_roadmaps_updated on public.roadmaps;
create trigger trg_roadmaps_updated before update on public.roadmaps
  for each row execute function public.set_updated_at();

-- ── 7) RLS (service_role BAYPAS eder; bunlar frontend içindir) ───────────────
alter table public.curriculum_nodes enable row level security;
alter table public.osym_blueprint   enable row level security;
alter table public.yks_questions    enable row level security;
alter table public.yks_knowledge    enable row level security;
alter table public.yks_exemplars    enable row level security;
alter table public.question_states  enable row level security;
alter table public.roadmaps         enable row level security;
alter table public.agent_tasks      enable row level security;
alter table public.chat_messages    enable row level security;

drop policy if exists p_curriculum_read on public.curriculum_nodes;
create policy p_curriculum_read on public.curriculum_nodes for select to authenticated using (true);
drop policy if exists p_blueprint_read on public.osym_blueprint;
create policy p_blueprint_read on public.osym_blueprint for select to authenticated using (true);
drop policy if exists p_qstate_own on public.question_states;
create policy p_qstate_own on public.question_states for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists p_roadmaps_own on public.roadmaps;
create policy p_roadmaps_own on public.roadmaps for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists p_tasks_own on public.agent_tasks;
create policy p_tasks_own on public.agent_tasks for select to authenticated
  using (user_id = auth.uid());
drop policy if exists p_chat_own on public.chat_messages;
create policy p_chat_own on public.chat_messages for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- yks_questions / yks_knowledge / yks_exemplars → policy YOK: yalnız backend (service_role).

-- ── 8) Grants — YALNIZ beyin nesnelerine (mevcut tablolarına DOKUNULMAZ) ──────
grant select, insert, update, delete on
  public.curriculum_nodes, public.osym_blueprint, public.yks_questions, public.yks_knowledge,
  public.yks_exemplars, public.question_states, public.roadmaps,
  public.agent_tasks, public.chat_messages
to service_role;
grant select, insert, update, delete on public.question_states, public.roadmaps, public.chat_messages to authenticated;
grant select on public.agent_tasks, public.curriculum_nodes, public.osym_blueprint to authenticated;
grant execute on function
  public.match_yks_knowledge(vector, text, text[], int),
  public.match_yks_exemplars(vector, text, text, text, int)
to authenticated, service_role;

-- =============================================================================
-- DOĞRULAMA:
--   select count(*) from public.curriculum_nodes;                    -- 0 (şema hazır)
--   select proname from pg_proc where pronamespace='public'::regnamespace
--     and proname like '%yks%' or proname in ('weak_kazanimlar','distractor_traps');
-- =============================================================================
