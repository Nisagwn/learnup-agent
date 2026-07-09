-- ============================================================================
-- 0003 — Migration boşlukları: client taşıması sırasında ortaya çıkan eksik
-- kolonlar + ai_jobs tablosu + Realtime publication.
-- 0001/0002 UYGULANDIKTAN SONRA çalıştır (yalnız ekleme; mevcut veriyi bozmaz).
-- ============================================================================

-- ── PROFILES eksik alanlar ──
alter table profiles add column if not exists last_goal_reached_date date;         -- günlük hedef konfeti dedupe
alter table profiles add column if not exists last_solved_question   jsonb;        -- quiz "kaldığın yerden devam"
alter table profiles add column if not exists is_approved            boolean not null default false;  -- öğretmen onay akışı (pending→approved)
alter table profiles add column if not exists teacher_ids            jsonb not null default '[]';     -- çoklu sınıf üyeliği (mobil parity)
alter table profiles add column if not exists teacher_names          jsonb not null default '{}';     -- sınıf etiketi cache'i
alter table profiles add column if not exists teacher_name           text;                            -- aktif sınıf öğretmen adı

-- ── QUESTIONS eksik alanlar ──
alter table questions add column if not exists correctness_ratio numeric;           -- seed metadata
alter table questions add column if not exists approved_by       uuid references profiles(id) on delete set null;  -- onay denetim izi
alter table questions add column if not exists approved_at       timestamptz;

-- ── ASSIGNMENTS eksik alanlar ──
alter table assignments add column if not exists title       text;
alter table assignments add column if not exists description text;
alter table assignments add column if not exists max_score   numeric;

-- ── TARGETED_ASSIGNMENTS eksik alanlar ──
alter table targeted_assignments add column if not exists focus_sub_topics jsonb not null default '[]';  -- odak alt-konular (≤5)

-- ── AI_JOBS — asenkron AI üretim işleri (useAIJobListener + generate-* edge fn) ──
create table if not exists ai_jobs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  type       text,                          -- 'generate_questions' | 'targeted_set' | ...
  status     text not null default 'pending' check (status in ('pending','running','done','error')),
  payload    jsonb not null default '{}',
  result     jsonb,
  error      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_jobs_user on ai_jobs (user_id, created_at desc);
alter table ai_jobs enable row level security;
create policy ai_jobs_owner_read on ai_jobs for select to authenticated
  using ((select auth.uid()) = user_id);
-- yazma yalnız service_role (Edge Function) — istemci politikası yok.
drop trigger if exists ai_jobs_set_updated_at on ai_jobs;
create trigger ai_jobs_set_updated_at before update on ai_jobs
  for each row execute function set_updated_at();

-- ── REALTIME — client taşımasında eklenen postgres_changes kanallarının çalışması için
--    ilgili tabloları supabase_realtime publication'a ekle (yoksa canlı güncelleme gelmez).
--    Not: bir tablo zaten publication'daysa "already member" hatası verir; her satır ayrı,
--    hata alırsan o satırı atla (idempotent değil — Supabase publication ADD idempotent değildir).
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','user_logs','user_answers','notifications','assignments',
    'assignment_submissions','targeted_assignments','notes','questions',
    'garden','inventory','announcements','chats','bookmarks','srs_cards',
    'quiz_sessions','league_entries','ai_jobs'
  ] loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;   -- zaten ekli → atla
             when others then null;
    end;
  end loop;
end $$;
