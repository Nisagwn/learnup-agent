-- =============================================================================
-- LearnUp — 0005_agents.sql   (AJAN KATMANI: BİLİŞSEL GRAF + HAFIZA + ANI ENDEKSİ)
-- THE-LEARNUP-MASTER-PLAN §2, §4, §6 · Faz 1.  Idempotent.  Ön koşul: 0001→0004.
--
-- İçerik:
--   A) user_mastery        — ATLAS'ın bilişsel graf overlay'i (BKT-lite + SRS + misconceptions)
--   B) student_memory      — Koç Masası brief'leri + KÂTİP'in semantik gerçekleri
--   C) session_summaries   — episodik anılar + 768d embedding (Kaptan'ın recall halkası)
--   D) nudges              — speakAsKaptan çıktı defteri
--   E) curriculum_nodes.prereq_paths + yks_exemplars künyesi (çıkmış soru kaynağı izi)
--   F) RPC'ler: weak_kazanimlar (user_mastery-rewrite) + match_session_memories
--   G) v_mastery_rollup view + trigger'lar + RLS + grant'lar
-- =============================================================================
set search_path to public, extensions;

-- ── A) user_mastery — kazanım-düzeyi öğrenci overlay'i ───────────────────────
-- Topoloji curriculum_nodes(ltree)'dedir; bu tablo öğrenci-başına durumdur.
create table if not exists public.user_mastery (
  user_id        uuid   not null,
  node_id        bigint not null references public.curriculum_nodes(id) on delete cascade,
  mastery        real   not null default 0.25,   -- BKT-lite: P(bilme)
  stability      real   not null default 0,      -- çürüme direnci (tekrarla artar)
  attempts       int    not null default 0,
  correct        int    not null default 0,
  avg_latency_ms int,
  srs_box        smallint not null default 0,    -- Leitner kutusu (gamification.ts aralıkları)
  srs_due_at     timestamptz,
  misconceptions jsonb  not null default '[]',   -- [{id,taxonomy,confidence,status:open|resolved|persists,
                                                 --   opened_at,closed_at,evidence,prereq_hypothesis,remediation}]
  updated_at     timestamptz not null default now(),
  primary key (user_id, node_id)
);
create index if not exists idx_um_user_weak on public.user_mastery (user_id, mastery);
create index if not exists idx_um_srs_due   on public.user_mastery (user_id, srs_due_at)
  where srs_due_at is not null;

-- ── B) student_memory — Koç Masası + semantik gerçekler ──────────────────────
create table if not exists public.student_memory (
  user_id    uuid  primary key,
  semantic   jsonb not null default '{}',   -- hedef üniversite, sınav tarihi, kişisel bağlam
  briefs     jsonb not null default '{}',   -- {atlas, pusula, nabiz, katip} — her biri ≤300 token
  updated_at timestamptz not null default now()
);

-- ── C) session_summaries — episodik anı + embedding (recall halkası) ─────────
create table if not exists public.session_summaries (
  id         bigint generated always as identity primary key,
  user_id    uuid not null,
  session_id text,
  summary    text not null,                 -- KÂTİP: ≤5 madde
  stats      jsonb,                         -- deterministik oturum istatistikleri
  affect     text,                          -- NABIZ etiketi (varsa)
  embedding  vector(768),                   -- Kaptan'ın "hatırlıyor musun" endeksi
  created_at timestamptz not null default now()
);
create index if not exists idx_ss_user on public.session_summaries (user_id, created_at desc);
create index if not exists idx_ss_vec  on public.session_summaries
  using hnsw (embedding vector_cosine_ops) where embedding is not null;

-- ── D) nudges — Kaptan'ın proaktif mesaj defteri ─────────────────────────────
create table if not exists public.nudges (
  id         bigint generated always as identity primary key,
  user_id    uuid not null,
  kind       text not null,                 -- comeback | morning_plan | streak_save | closure_praise ...
  message    text not null,                 -- speakAsKaptan çıktısı (tek ses ilkesi)
  status     text not null default 'PENDING' check (status in ('PENDING','SENT','CANCELLED')),
  created_at timestamptz not null default now()
);
create index if not exists idx_nudges_pending on public.nudges (user_id, status) where status = 'PENDING';

-- ── E) müfredat önkoşul kenarları + çıkmış soru korpus künyesi ───────────────
alter table public.curriculum_nodes
  add column if not exists prereq_paths ltree[];   -- ATLAS'ın önkoşul hipotez kaynağı

-- yks_exemplars TANIM GEREĞİ çıkmış sorulardır (AI üretiminin üslup/few-shot kaynağı).
-- Künye: yks_questions'a source_type='osym_cikmis' olarak kopyalanan her soru kaynağına izlenebilir.
alter table public.yks_exemplars
  add column if not exists exam_year  smallint,
  add column if not exists exam_label text;

-- ── F1) weak_kazanimlar — user_mastery üstünden (imza 0001 ile birebir) ──────
-- wrong_rate artık çürüme-farkındalıklı zayıflıktır: 1 − m_eff. Sıralama semantiği korunur.
create or replace function public.weak_kazanimlar(p_user_id uuid, p_limit int default 4)
returns table (subject text, kazanim_id bigint, code text, title text, path text, wrong_rate float)
language sql stable
as $$
  select n.subject, n.id as kazanim_id, n.code, n.title, n.path::text as path,
         (1.0 - (um.mastery * exp(
            -greatest(extract(epoch from (now() - um.updated_at)) / 86400.0, 0)
            / (7.0 * (1.0 + um.stability))
         )))::float as wrong_rate
  from public.user_mastery um
  join public.curriculum_nodes n on n.id = um.node_id
  where um.user_id = p_user_id
    and um.attempts >= 3                    -- "kronik" eşiği korunur
  order by wrong_rate desc, um.attempts desc
  limit p_limit;
$$;
revoke execute on function public.weak_kazanimlar(uuid, int) from public, anon, authenticated;
grant  execute on function public.weak_kazanimlar(uuid, int) to service_role;

-- ── F2) match_session_memories — Kaptan'ın episodik recall'u ─────────────────
create or replace function public.match_session_memories(
  p_user_id       uuid,
  query_embedding vector(768),
  match_count     int default 3
) returns table (id bigint, summary text, affect text, created_at timestamptz, similarity float)
language sql stable
as $$
  select s.id, s.summary, s.affect, s.created_at,
         1 - (s.embedding <=> query_embedding) as similarity
  from public.session_summaries s
  where s.user_id = p_user_id and s.embedding is not null
  order by s.embedding <=> query_embedding
  limit match_count;
$$;
revoke execute on function public.match_session_memories(uuid, vector, int) from public, anon, authenticated;
grant  execute on function public.match_session_memories(uuid, vector, int) to service_role;

-- ── G) rollup view + trigger'lar + RLS + grant ───────────────────────────────
-- Ünite/ders düzeyi ustalık ortalamaları (PUSULA optimizer + öğretmen analitiği)
create or replace view public.v_mastery_rollup as
select um.user_id,
       n.subject,
       subltree(n.path, 0, least(nlevel(n.path), 2))::text as unit_path,
       avg(um.mastery)::real  as avg_mastery,
       sum(um.attempts)::int  as attempts,
       count(*)::int          as node_count
from public.user_mastery um
join public.curriculum_nodes n on n.id = um.node_id
group by um.user_id, n.subject, subltree(n.path, 0, least(nlevel(n.path), 2));

drop trigger if exists trg_um_updated on public.user_mastery;
create trigger trg_um_updated before update on public.user_mastery
  for each row execute function public.set_updated_at();
drop trigger if exists trg_sm_updated on public.student_memory;
create trigger trg_sm_updated before update on public.student_memory
  for each row execute function public.set_updated_at();

alter table public.user_mastery      enable row level security;
alter table public.student_memory    enable row level security;
alter table public.session_summaries enable row level security;
alter table public.nudges            enable row level security;

-- Öğrenci kendi verisini OKUYABİLİR (ileride UI: ustalık haritası, nudge listesi);
-- yazma yalnız backend (service_role RLS'i baypas eder — insert/update policy yok).
drop policy if exists p_um_own_read on public.user_mastery;
create policy p_um_own_read on public.user_mastery for select to authenticated
  using (user_id = auth.uid());
drop policy if exists p_sm_own_read on public.student_memory;
create policy p_sm_own_read on public.student_memory for select to authenticated
  using (user_id = auth.uid());
drop policy if exists p_ss_own_read on public.session_summaries;
create policy p_ss_own_read on public.session_summaries for select to authenticated
  using (user_id = auth.uid());
drop policy if exists p_nudge_own_read on public.nudges;
create policy p_nudge_own_read on public.nudges for select to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on
  public.user_mastery, public.student_memory, public.session_summaries, public.nudges
to service_role;
grant select on public.user_mastery, public.student_memory, public.session_summaries, public.nudges
to authenticated;
grant select on public.v_mastery_rollup to service_role, authenticated;

-- =============================================================================
-- DOĞRULAMA:
--   select table_name from information_schema.tables where table_name in
--     ('user_mastery','student_memory','session_summaries','nudges');            -- 4 satır
--   select proname from pg_proc where proname in
--     ('weak_kazanimlar','match_session_memories');                              -- 2 satır
--   select column_name from information_schema.columns
--     where table_name='yks_exemplars' and column_name in ('exam_year','exam_label'); -- 2 satır
--   select * from public.v_mastery_rollup limit 1;                               -- hata yoksa OK
-- =============================================================================
