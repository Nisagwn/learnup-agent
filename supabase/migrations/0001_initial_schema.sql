-- ============================================================================
-- LearnUp — Firebase → Supabase geçişi: başlangıç şeması (veri taşınmıyor)
-- Uygulamanın GERÇEK kullandığı koleksiyonların Postgres karşılığı.
-- Compound stat blob'ları (stats, gamification, ...) jsonb olarak tutulur ki
-- istemci Firestore doküman şeklini minimum değişiklikle okusun.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;  -- gen_random_uuid()

-- updated_at otomatik güncelleyici
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 1) PROFILES  (users/{uid})  — auth.users'a bağlı
-- ─────────────────────────────────────────────────────────────────────────
create table profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  name           text,
  email          text,
  role           text not null default 'student' check (role in ('student','teacher')),
  grade          text,
  student_class  text,
  teacher_id     uuid references profiles(id) on delete set null,
  class_code     text,
  students       jsonb not null default '[]',        -- öğretmenin öğrenci uid listesi
  avatar         text,
  -- Firestore'daki iç içe stat map'lerinin birebir karşılığı (jsonb):
  stats            jsonb not null default '{}',       -- {totalSolved,correctAnswers,totalChatMessages}
  stats_summary    jsonb not null default '{}',
  mastery_scores   jsonb not null default '{}',
  mastery          jsonb not null default '{}',
  learning_profile jsonb not null default '{}',
  level_data       jsonb not null default '{}',
  gamification     jsonb not null default '{}',       -- xp/coins/streak/league/dailyQuests
  unlocked_badges  jsonb not null default '{}',
  -- Ad-hoc/ayar alanları (uygulama users dokümanına serbestçe yazıyordu):
  daily_goal            int,
  notifications_enabled boolean not null default true,
  teacher_notif_prefs   jsonb not null default '{}',
  total_chat_messages   int not null default 0,
  school                text,
  branch                text,
  bio                   text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index profiles_teacher on profiles (teacher_id);
create index profiles_class   on profiles (class_code);
create index profiles_role    on profiles (role);
create trigger profiles_set_updated_at before update on profiles
  for each row execute function set_updated_at();

-- Yeni auth.users satırında profili otomatik oluştur (signUp options.data'dan).
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, email, role, grade, student_class, class_code)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', 'İsimsiz Kullanıcı'),
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'student'),
    new.raw_user_meta_data->>'grade',
    new.raw_user_meta_data->>'student_class',
    case when coalesce(new.raw_user_meta_data->>'role','student') = 'teacher'
         then upper(substring(replace(gen_random_uuid()::text,'-','') for 6)) end
  );
  return new;
end; $$;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function handle_new_user();

-- ─────────────────────────────────────────────────────────────────────────
-- 2) QUESTIONS  — soru havuzu (4 şık; şıklar jsonb dizi/metin)
-- ─────────────────────────────────────────────────────────────────────────
create table questions (
  id              uuid primary key default gen_random_uuid(),
  teacher_id      uuid references profiles(id) on delete set null,
  category        text,                -- kanonik EN ders
  subject         text,
  subject_tr      text,
  topic           text,
  sub_topic       text,
  question_text   text not null,
  options         jsonb not null default '[]',   -- ["A metni","B metni",...]
  correct_answer  text,                -- doğru şıkkın METNİ (mevcut app böyle tutuyor)
  explanation     text,
  difficulty      text,                -- easy/medium/hard | kolay/orta/zor
  grade           text,
  verified        boolean not null default false,
  is_ai_generated boolean not null default false,
  gen_mode        text,
  random_seed     int,
  quality_score   int,
  created_at      timestamptz not null default now()
);
create index questions_cat_grade  on questions (category, grade, topic);
create index questions_teacher     on questions (teacher_id, verified);
create index questions_cat_diff    on questions (category, difficulty, grade);
create index questions_seed        on questions (random_seed);

-- ─────────────────────────────────────────────────────────────────────────
-- 3) USER_ANSWERS  — analitik cevap kaydı
-- ─────────────────────────────────────────────────────────────────────────
create table user_answers (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  question_id  text,
  subject      text,
  sub_topic    text,
  is_correct   boolean,
  given_answer text,
  skipped      boolean not null default false,
  xp           int not null default 0,
  duration     int,                    -- saniye
  created_at   timestamptz not null default now()
);
create index user_answers_user on user_answers (user_id, created_at desc);

-- ─────────────────────────────────────────────────────────────────────────
-- 4) USER_LOGS  — birincil telemetri (öğretmen sorguları buradan)
-- ─────────────────────────────────────────────────────────────────────────
create table user_logs (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references auth.users(id) on delete cascade,
  teacher_id     uuid references profiles(id) on delete set null,
  subject        text,
  sub_topic      text,
  question_id    text,
  is_correct     boolean,
  is_skipped     boolean not null default false,
  time_spent     int,
  attempt_number int,
  xp             int not null default 0,
  difficulty     text,
  created_at     timestamptz not null default now()
);
create index user_logs_student on user_logs (student_id, created_at desc);
create index user_logs_teacher on user_logs (teacher_id, created_at desc);
create index user_logs_correct on user_logs (is_correct, created_at);

-- ─────────────────────────────────────────────────────────────────────────
-- 5) QUIZ_SESSIONS  — adaptif oturum durumu (kullanıcı başına tek satır)
-- ─────────────────────────────────────────────────────────────────────────
create table quiz_sessions (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  current_difficulty int not null default 1,
  last_30_ids        jsonb not null default '[]',
  expires_at         timestamptz,
  updated_at         timestamptz not null default now()
);
create trigger quiz_sessions_set_updated_at before update on quiz_sessions
  for each row execute function set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- 6) SRS_CARDS  — "Yanlışlarım" tekrar destesi
-- ─────────────────────────────────────────────────────────────────────────
create table srs_cards (
  user_id             uuid not null references auth.users(id) on delete cascade,
  question_id         text not null,
  box                 int not null default 0,
  consecutive_correct int not null default 0,
  total_attempts      int not null default 0,
  next_review_at      timestamptz,
  last_reviewed_at    timestamptz,
  subject             text,
  topic               text,
  sub_topic           text,
  snapshot            jsonb,            -- {question, choices[], answer}
  last_attempt_id     text,
  updated_at          timestamptz not null default now(),
  primary key (user_id, question_id)
);
create index srs_due     on srs_cards (user_id, next_review_at);
create index srs_subject on srs_cards (user_id, subject, consecutive_correct);
create trigger srs_cards_set_updated_at before update on srs_cards
  for each row execute function set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- 7) ASSIGNMENTS  — öğretmen ödevleri
-- ─────────────────────────────────────────────────────────────────────────
create table assignments (
  id             uuid primary key default gen_random_uuid(),
  teacher_id     uuid not null references profiles(id) on delete cascade,
  subject        text,
  topic          text,
  question_count int,
  question_ids   jsonb not null default '[]',
  due_date       timestamptz,
  status         text not null default 'active',
  created_at     timestamptz not null default now()
);
create index assignments_teacher on assignments (teacher_id, created_at desc);

create table assignment_submissions (
  id            uuid primary key default gen_random_uuid(),
  assignment_id uuid references assignments(id) on delete cascade,
  student_id    uuid not null references auth.users(id) on delete cascade,
  teacher_id    uuid references profiles(id) on delete set null,
  status        text not null default 'submitted',
  answers       jsonb not null default '[]',      -- [{questionId, selectedIndex}]
  auto_score    numeric,
  score         numeric,
  max_score     numeric,
  correct_count int,
  created_at    timestamptz not null default now()
);
create index asub_student    on assignment_submissions (student_id);
create index asub_teacher     on assignment_submissions (teacher_id);
create index asub_assignment  on assignment_submissions (assignment_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 8) TARGETED_ASSIGNMENTS  — AI kişiselleştirilmiş setler
-- ─────────────────────────────────────────────────────────────────────────
create table targeted_assignments (
  id                 uuid primary key default gen_random_uuid(),
  teacher_id         uuid references profiles(id) on delete set null,
  student_id         uuid not null references auth.users(id) on delete cascade,
  subject            text,
  topic              text,
  grade              text,
  mode               text,
  question_ids       jsonb not null default '[]',
  source_wrong_count int,
  topped_up_count    int,
  status             text not null default 'draft',
  answers            jsonb not null default '[]',
  auto_score         numeric,
  score              numeric,
  max_score          numeric,
  rationale          text,
  source             text,
  difficulty         text,
  created_at         timestamptz not null default now(),
  completed_at       timestamptz
);
create index ta_student on targeted_assignments (student_id);
create index ta_teacher on targeted_assignments (teacher_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 9) ANNOUNCEMENTS
-- ─────────────────────────────────────────────────────────────────────────
create table announcements (
  id         uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references profiles(id) on delete cascade,
  class_code text,
  title      text,
  body       text,
  created_at timestamptz not null default now()
);
create index ann_class   on announcements (class_code, created_at desc);
create index ann_teacher on announcements (teacher_id, created_at desc);

-- ─────────────────────────────────────────────────────────────────────────
-- 10) BOOKMARKS + FOLDERS + NOTES
-- ─────────────────────────────────────────────────────────────────────────
create table bookmark_folders (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text,
  color      text,
  icon       text,
  item_count int not null default 0,
  created_at timestamptz not null default now()
);
create index bmf_user on bookmark_folders (user_id);

create table bookmarks (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references auth.users(id) on delete cascade,
  question_id    text,
  subject        text,
  question_text  text,
  options        jsonb,
  correct_answer text,
  explanation    text,
  topic          text,
  difficulty     text,
  source         text default 'db',
  folder_id      uuid references bookmark_folders(id) on delete set null,
  tags           jsonb not null default '[]',
  note           text,
  review_count   int not null default 0,
  created_at     timestamptz not null default now(),
  unique (student_id, question_id)
);
create index bm_student on bookmarks (student_id, created_at desc);

create table notes (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  title      text,
  body       text,
  subject    text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index notes_student on notes (student_id, updated_at desc);
create trigger notes_set_updated_at before update on notes
  for each row execute function set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- 11) CHATS  — AI sohbet geçmişi (mesajlar jsonb dizi)
-- ─────────────────────────────────────────────────────────────────────────
create table chats (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  topic           text,
  messages        jsonb not null default '[]',
  message_count   int not null default 0,
  last_message_at timestamptz not null default now(),
  created_at      timestamptz not null default now()
);
create index chats_user on chats (user_id, last_message_at desc);

-- ─────────────────────────────────────────────────────────────────────────
-- 12) LEAGUE_ENTRIES  — haftalık lig
-- ─────────────────────────────────────────────────────────────────────────
create table league_entries (
  week_id    text not null,
  uid        uuid not null references auth.users(id) on delete cascade,
  name       text,
  tier       text,
  weekly_xp  int not null default 0,
  role       text not null default 'student',
  updated_at timestamptz not null default now(),
  primary key (week_id, uid)
);
create index league_rank on league_entries (week_id, weekly_xp desc);

-- ─────────────────────────────────────────────────────────────────────────
-- 13) GARDEN + INVENTORY  — oyunlaştırma bahçesi
-- ─────────────────────────────────────────────────────────────────────────
create table garden (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  item_id         text,
  x               numeric,
  y               numeric,
  stage           text default 'seed',
  planted_at      timestamptz not null default now(),
  last_watered_at timestamptz,
  status          text default 'healthy',
  scale           numeric default 1
);
create index garden_user on garden (user_id);

create table inventory (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text,
  kind    text default 'seed',
  count   int not null default 0,
  unique (user_id, item_id)
);
create index inventory_user on inventory (user_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 14) NOTIFICATIONS
-- ─────────────────────────────────────────────────────────────────────────
create table notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  type       text,
  title      text,
  body       text,
  icon       text,
  tone       text,
  deep_link  text,
  data       jsonb not null default '{}',
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notif_user on notifications (user_id, created_at desc);
