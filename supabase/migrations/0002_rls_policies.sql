-- ============================================================================
-- RLS politikaları. service_role (Edge Functions) RLS'i bypass eder.
-- Model:
--  • Paylaşılan/analitik tablolar: authenticated SELECT açık (öğretmen↔öğrenci
--    karşılıklı okumalar buna bağlı — mevcut Firestore kuralı da böyleydi).
--  • Kişisel tablolar: yalnız sahibi okur+yazar (auth.uid() = user_id).
--  • Sunucu-otoriteli (league_entries): istemci yazamaz (politika yok = deny).
--  NOT: Sınıfa katılma (öğrencinin öğretmen satırını güncellemesi) ve
--       gamification server-otoritesi Edge Functions aşamasında RPC'ye taşınacak.
-- ============================================================================

alter table profiles               enable row level security;
alter table questions              enable row level security;
alter table user_answers           enable row level security;
alter table user_logs              enable row level security;
alter table quiz_sessions          enable row level security;
alter table srs_cards              enable row level security;
alter table assignments            enable row level security;
alter table assignment_submissions enable row level security;
alter table targeted_assignments   enable row level security;
alter table announcements          enable row level security;
alter table bookmark_folders       enable row level security;
alter table bookmarks              enable row level security;
alter table notes                  enable row level security;
alter table chats                  enable row level security;
alter table league_entries         enable row level security;
alter table garden                 enable row level security;
alter table inventory              enable row level security;
alter table notifications          enable row level security;

-- ── PROFILES ── read all (authed); write own row
create policy profiles_read   on profiles for select to authenticated using (true);
create policy profiles_insert on profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy profiles_update on profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- ── QUESTIONS ── read all; sahibi öğretmen CRUD
create policy questions_read   on questions for select to authenticated using (true);
create policy questions_insert on questions for insert to authenticated with check ((select auth.uid()) = teacher_id);
create policy questions_update on questions for update to authenticated
  using ((select auth.uid()) = teacher_id) with check ((select auth.uid()) = teacher_id);
create policy questions_delete on questions for delete to authenticated using ((select auth.uid()) = teacher_id);

-- ── USER_ANSWERS ── read all (analitik); insert own
create policy answers_read   on user_answers for select to authenticated using (true);
create policy answers_insert on user_answers for insert to authenticated with check ((select auth.uid()) = user_id);

-- ── USER_LOGS ── read all (öğretmen dashboard); insert own
create policy logs_read   on user_logs for select to authenticated using (true);
create policy logs_insert on user_logs for insert to authenticated with check ((select auth.uid()) = student_id);

-- ── QUIZ_SESSIONS ── sahibi tam CRUD
create policy qs_all on quiz_sessions for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ── SRS_CARDS ── sahibi tam CRUD
create policy srs_all on srs_cards for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ── ASSIGNMENTS ── read all; sahibi öğretmen CRUD
create policy asg_read   on assignments for select to authenticated using (true);
create policy asg_write  on assignments for all to authenticated
  using ((select auth.uid()) = teacher_id) with check ((select auth.uid()) = teacher_id);

-- ── ASSIGNMENT_SUBMISSIONS ── read all; öğrenci kendi gönderimini yazar
create policy asub_read   on assignment_submissions for select to authenticated using (true);
create policy asub_insert on assignment_submissions for insert to authenticated with check ((select auth.uid()) = student_id);
create policy asub_update on assignment_submissions for update to authenticated
  using ((select auth.uid()) = student_id) with check ((select auth.uid()) = student_id);

-- ── TARGETED_ASSIGNMENTS ── read all; öğretmen oluşturur, öğrenci kendi cevabını günceller
create policy ta_read     on targeted_assignments for select to authenticated using (true);
create policy ta_insert   on targeted_assignments for insert to authenticated with check ((select auth.uid()) = teacher_id);
create policy ta_update   on targeted_assignments for update to authenticated
  using ((select auth.uid()) in (teacher_id, student_id))
  with check ((select auth.uid()) in (teacher_id, student_id));

-- ── ANNOUNCEMENTS ── read all; sahibi öğretmen CRUD
create policy ann_read  on announcements for select to authenticated using (true);
create policy ann_write on announcements for all to authenticated
  using ((select auth.uid()) = teacher_id) with check ((select auth.uid()) = teacher_id);

-- ── KİŞİSEL TABLOLAR ── sahibi tam CRUD
create policy bmf_all on bookmark_folders for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy bm_all on bookmarks for all to authenticated
  using ((select auth.uid()) = student_id) with check ((select auth.uid()) = student_id);
create policy notes_all on notes for all to authenticated
  using ((select auth.uid()) = student_id) with check ((select auth.uid()) = student_id);
create policy chats_all on chats for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy garden_all on garden for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy inventory_all on inventory for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy notif_all on notifications for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ── LEAGUE_ENTRIES ── read all; yazma yalnız service_role (istemci politikası yok = deny)
create policy league_read on league_entries for select to authenticated using (true);
