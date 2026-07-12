-- =============================================================================
-- LearnUp — 0004_unification.sql   (BİRLEŞME + KAYNAK AYRIMI + ATOMİK CEVAP)
-- THE-LEARNUP-MASTER-PLAN §6 · Faz 0-1.  Idempotent — Studio SQL Editor'e yapıştır & RUN.
-- Ön koşul: app şeması (profiles/user_logs/srs_cards/league_entries/questions/chats)
--           + brain 0001 & 0003 uygulanmış olmalı.
--
-- İçerik:
--   A) user_logs birleşme ALTER'ları (kanonik telemetri: kazanim_id + selected_option + duration_ms)
--   B) distractor_traps RPC (user_logs üstünden — 0001'deki imzayla birebir)
--   C) KAYNAK AYRIMI (ürün kuralı #6): question_source enum + source_type + değişmezlik trigger'ı
--   D) record_answer RPC — user_logs + srs_cards + profiles + league_entries TEK transaction
--   E) agent_tasks sağlamlaştırma (attempts / locked_by / locked_at) + Realtime publication
--   F) yks_questions md5 dedup + chat_messages.chat_id
-- =============================================================================
set search_path to public, extensions;

-- ── A) user_logs — kanonik telemetriye eksik kolonlar ────────────────────────
alter table public.user_logs
  add column if not exists kazanim_id      bigint references public.curriculum_nodes(id) on delete set null,
  add column if not exists selected_option text,
  add column if not exists duration_ms     int;

-- Şık harfi koruması (eski satırlar NULL — serbest)
do $$ begin
  alter table public.user_logs add constraint ul_selected_option_chk
    check (selected_option is null or selected_option in ('A','B','C','D','E'));
exception when duplicate_object then null; end $$;

create index if not exists idx_ul_user_kazanim
  on public.user_logs (student_id, kazanim_id) where kazanim_id is not null;

-- ── B) distractor_traps — kanonik telemetri üstünden (imza 0001 ile aynı) ────
create or replace function public.distractor_traps(p_user_id uuid, p_limit int default 5)
returns table (kazanim_id bigint, selected_option text, miss_count bigint)
language sql stable
as $$
  select l.kazanim_id, l.selected_option, count(*) as miss_count
  from public.user_logs l
  where l.student_id = p_user_id and l.is_correct = false
    and l.selected_option is not null and l.kazanim_id is not null
  group by l.kazanim_id, l.selected_option
  order by miss_count desc
  limit p_limit;
$$;
-- IDOR önlemi: p_user_id parametreli analitik RPC'yi yalnız backend çağırır.
revoke execute on function public.distractor_traps(uuid, int) from public, anon, authenticated;
grant  execute on function public.distractor_traps(uuid, int) to service_role;

-- ── C) KAYNAK AYRIMI — çıkmış soru ↔ AI üretimi (ürün kuralı #6) ─────────────
-- Gerçek ÖSYM çıkmış sorular ile AI üretimi sorular DB düzeyinde kesin ayrılır.
-- Frontend source_type='osym_cikmis' gördüğünde "ÖSYM ÇIKMIŞ SORU" rozetini basar;
-- adaptif testler YALNIZ 'ai_generated' (+verified) servis eder.
do $$ begin
  create type public.question_source as enum ('osym_cikmis', 'ai_generated', 'ogretmen');
exception when duplicate_object then null; end $$;

alter table public.yks_questions
  add column if not exists source_type public.question_source not null default 'ai_generated',
  add column if not exists exam_year   smallint,   -- yalnız osym_cikmis: örn. 2023
  add column if not exists exam_label  text;       -- yalnız osym_cikmis: örn. 'TYT' / 'AYT-Matematik'

alter table public.questions
  add column if not exists source_type public.question_source not null default 'ai_generated';

-- Legacy backfill (app questions): AI işaretli değilse öğretmen içeriğidir.
-- (Trigger'lardan ÖNCE koşar; WHERE sayesinde tekrar çalıştırmada no-op → idempotent.)
update public.questions
   set source_type = 'ogretmen'
 where not is_ai_generated and source_type = 'ai_generated';

-- Çıkmış soru künyesi zorunlu
do $$ begin
  alter table public.yks_questions add constraint yq_osym_meta_chk
    check (source_type <> 'osym_cikmis' or (exam_year is not null and exam_label is not null));
exception when duplicate_object then null; end $$;

-- KORUMA: source_type insert'ten sonra DEĞİŞTİRİLEMEZ (AI→çıkmış sahteciliği imkânsız)
create or replace function public.forbid_source_type_change()
returns trigger language plpgsql as $$
begin
  raise exception 'source_type değiştirilemez: %.% (% → %)',
    tg_table_schema, tg_table_name, old.source_type, new.source_type;
end $$;

drop trigger if exists yq_source_immutable on public.yks_questions;
create trigger yq_source_immutable
  before update on public.yks_questions
  for each row when (old.source_type is distinct from new.source_type)
  execute function public.forbid_source_type_change();

drop trigger if exists q_source_immutable on public.questions;
create trigger q_source_immutable
  before update on public.questions
  for each row when (old.source_type is distinct from new.source_type)
  execute function public.forbid_source_type_change();

-- Servis indeksleri: iki dünya ayrı yollardan okunur
create index if not exists yq_serve_ai
  on public.yks_questions (kazanim_id, difficulty)
  where verified and source_type = 'ai_generated';
create index if not exists yq_serve_osym
  on public.yks_questions (subject, exam_year desc)
  where source_type = 'osym_cikmis';

-- ── D) record_answer — atomik cevap yazımı (tek transaction) ─────────────────
-- supabase-js çoklu-ifade transaction yapamaz → çoklu-yazım invariantı RPC'ye iner.
-- Gamification/mastery HESABI TypeScript'te (lib/gamification.ts) kalır; bu RPC yalnız
-- sonuçların ATOMİK yazımını üstlenir. NULL geçilen parça atlanır.
create or replace function public.record_answer(
  p_user_id         uuid,
  p_log             jsonb,            -- user_logs alanları (student_id/id/created_at hariç)
  p_srs             jsonb default null,   -- srs_cards satırı (user_id hariç) | null → atla
  p_gamification    jsonb default null,   -- profiles.gamification tam yeni değeri | null → atla
  p_mastery_scores  jsonb default null,   -- profiles.mastery_scores | null → atla
  p_stats           jsonb default null,   -- profiles.stats | null → atla
  p_unlocked_badges jsonb default null,   -- profiles.unlocked_badges | null → atla
  p_league          jsonb default null    -- league_entries satırı (uid hariç) | null → atla
) returns uuid
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_log_id uuid;
  r_log    public.user_logs;
  r_srs    public.srs_cards;
  r_lg     public.league_entries;
begin
  -- 1) user_logs (kanonik telemetri)
  r_log := jsonb_populate_record(null::public.user_logs, coalesce(p_log, '{}'::jsonb));
  insert into public.user_logs
    (student_id, teacher_id, subject, sub_topic, question_id, is_correct, is_skipped,
     time_spent, attempt_number, xp, difficulty, kazanim_id, selected_option, duration_ms)
  values
    (p_user_id, r_log.teacher_id, r_log.subject, r_log.sub_topic, r_log.question_id,
     r_log.is_correct, coalesce(r_log.is_skipped, false), r_log.time_spent,
     r_log.attempt_number, coalesce(r_log.xp, 0), r_log.difficulty,
     r_log.kazanim_id, r_log.selected_option, r_log.duration_ms)
  returning id into v_log_id;

  -- 2) srs_cards upsert (Leitner)
  if p_srs is not null then
    r_srs := jsonb_populate_record(null::public.srs_cards, p_srs);
    insert into public.srs_cards
      (user_id, question_id, box, consecutive_correct, total_attempts, next_review_at,
       last_reviewed_at, subject, topic, sub_topic, snapshot, last_attempt_id, updated_at)
    values
      (p_user_id, r_srs.question_id, coalesce(r_srs.box, 0),
       coalesce(r_srs.consecutive_correct, 0), coalesce(r_srs.total_attempts, 0),
       r_srs.next_review_at, r_srs.last_reviewed_at, r_srs.subject, r_srs.topic,
       r_srs.sub_topic, r_srs.snapshot, r_srs.last_attempt_id, now())
    on conflict (user_id, question_id) do update set
      box                 = excluded.box,
      consecutive_correct = excluded.consecutive_correct,
      total_attempts      = excluded.total_attempts,
      next_review_at      = excluded.next_review_at,
      last_reviewed_at    = excluded.last_reviewed_at,
      subject             = coalesce(excluded.subject,  public.srs_cards.subject),
      topic               = coalesce(excluded.topic,    public.srs_cards.topic),
      sub_topic           = coalesce(excluded.sub_topic, public.srs_cards.sub_topic),
      snapshot            = coalesce(excluded.snapshot, public.srs_cards.snapshot),
      last_attempt_id     = excluded.last_attempt_id,
      updated_at          = now();
  end if;

  -- 3) profiles jsonb blokları (yalnız verilenler)
  update public.profiles set
    gamification    = coalesce(p_gamification,    gamification),
    mastery_scores  = coalesce(p_mastery_scores,  mastery_scores),
    stats           = coalesce(p_stats,           stats),
    unlocked_badges = coalesce(p_unlocked_badges, unlocked_badges),
    updated_at      = now()
  where id = p_user_id
    and (p_gamification is not null or p_mastery_scores is not null
         or p_stats is not null or p_unlocked_badges is not null);

  -- 4) league_entries upsert (haftalık lig) — week_id yoksa sessizce atla
  if p_league is not null and p_league ? 'week_id' then
    r_lg := jsonb_populate_record(null::public.league_entries, p_league);
    insert into public.league_entries (week_id, uid, name, tier, weekly_xp, role, updated_at)
    values (r_lg.week_id, p_user_id, r_lg.name, r_lg.tier,
            coalesce(r_lg.weekly_xp, 0), coalesce(r_lg.role, 'student'), now())
    on conflict (week_id, uid) do update set
      name       = coalesce(excluded.name, public.league_entries.name),
      tier       = coalesce(excluded.tier, public.league_entries.tier),
      weekly_xp  = excluded.weekly_xp,
      updated_at = now();
  end if;

  return v_log_id;
end $$;

revoke execute on function public.record_answer(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant  execute on function public.record_answer(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb)
  to service_role;

-- ── E) agent_tasks sağlamlaştırma + Realtime ─────────────────────────────────
alter table public.agent_tasks
  add column if not exists attempts  int  not null default 0,
  add column if not exists locked_by text,
  add column if not exists locked_at timestamptz;

-- Realtime: görev tamamlanınca istemciye push (owner-SELECT politikası 0001'de mevcut)
alter table public.agent_tasks replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.agent_tasks;
exception when duplicate_object then null; end $$;

-- ── F) demirhane dedup + sohbet thread bağı ──────────────────────────────────
-- Aynı doğrulanmış soru metni havuza iki kez giremez (at-least-once teslimatta çift-iş koruması)
create unique index if not exists yq_dedup_verified
  on public.yks_questions (md5(question_text)) where verified;

-- chat_messages ↔ chats (thread başlığı) bağı
alter table public.chat_messages
  add column if not exists chat_id uuid references public.chats(id) on delete set null;
create index if not exists idx_chat_messages_chat on public.chat_messages (chat_id);

-- =============================================================================
-- DOĞRULAMA:
--   select column_name from information_schema.columns
--     where table_name='user_logs' and column_name in ('kazanim_id','selected_option','duration_ms'); -- 3 satır
--   select enum_range(null::public.question_source);        -- {osym_cikmis,ai_generated,ogretmen}
--   update public.yks_questions set source_type='osym_cikmis' where false; -- (test etme; trigger canlı)
--   select proname from pg_proc where proname in ('record_answer','distractor_traps'); -- 2 satır
--   select * from pg_publication_tables where pubname='supabase_realtime' and tablename='agent_tasks'; -- 1 satır
-- =============================================================================
