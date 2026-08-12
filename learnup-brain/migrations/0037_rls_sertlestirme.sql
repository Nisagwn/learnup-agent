-- =============================================================================
-- LearnUp — 0037_rls_sertlestirme.sql   (ÖDEV/LOG TABLOLARINDA RLS SERTLEŞTİRME)
-- Öğretmen paneli denetimi K1–K4 (docs/denetim/04-ogretmen-paneli.md)
-- Idempotent — Studio SQL Editor'e yapıştır & RUN.
--
-- ═══ AÇIK ═══
-- `learnup-brain` service_role ile çalışır ve RLS'i baypas eder; bütün kapıları
-- uygulama katmanında kurar: sorulariSoy (cevap soyma), tek-gönderim kilidi,
-- otoriter puanlama, assertTeacherOwnsStudent. Ama öğrencinin TARAYICISINDA aynı
-- veritabanına açılan ikinci bir yol var: frontend-v2/src/lib/supabase.js anon
-- anahtarla createClient kuruyor ve 0002_rls_policies.sql o yolu kısıtlamıyor.
--
-- Somut sonuçlar (denetimde dosya/satır izlenerek doğrulandı):
--   K1  questions_read using(true)  → ödev sorularının correct_answer'ı okunabilir.
--       Öğrenci /assignments/:id/questions ile id'leri alır, sonra tek sorguda
--       20 doğru cevabı çeker. Cevap soyma tamamen anlamsız hale gelir.
--   K2  asub_insert/asub_update + ta_update(student_id) → öğrenci kendi ödev
--       puanını (score, status, completed_at) doğrudan yazabilir; ödevi hiç
--       açmadan 20/20 girebilir. 0036'daki unique kısıt bunu ENGELLEMEZ, tersine
--       sunucunun meşru gönderimini de bloke eder.
--   K3  logs_insert → user_logs'a sahte satır. sinif_ozeti RPC'si (0016:111) ve
--       /teacher/ozet doğrudan bu tablodan besleniyor: sınıf KPI'ları, risk
--       etiketleri ve "İlgi Bekleyenler" listesi uydurulabilir.
--   K4  yedi tabloda select using(true) → tüm okulun profilleri (öğretmenlerin
--       class_code'ları dahil), logları ve ödev puanları çapraz okunabilir.
--       Sızan class_code ile herhangi bir öğrenci istediği sınıfa katılabilir.
--
-- ═══ ÇÖZÜM ═══
-- 0019'un profiles için kurduğu desen: RLS "hangi SATIR", GRANT "hangi KOLON".
-- Burada satır tarafı yeniden çiziliyor — istemcinin okuması MEŞRU olan tek şey
-- KENDİ satırıdır; öğretmen↔öğrenci karşılıklı okuması 2026'da /teacher/* uçlarına
-- taşındı ve kapsam kapısı (requireOgretmenKapsami + assertTeacherOwnsStudent)
-- tam bunun için yazıldı. 0002'nin başlığındaki "mevcut Firestore kuralı da
-- böyleydi" gerekçesi o taşımayla geçersizleşti.
--
-- ⚠️ İSTEMCİ NE OKUYOR (uygulanmadan önce doğrulandı): frontend-v2 içinde anon
-- istemciyle yapılan TEK tablo erişimi `profiles` üzerinedir ve hepsi KENDİ
-- satırıdır (lib/auth.tsx:100,114 select · Ben.tsx / Konular.tsx / kule/Ayarlar.tsx
-- update). Diğer tabloların hiçbiri istemciden okunmuyor — hepsi /api/v1 üzerinden
-- geliyor. Bu yüzden aşağıdaki daraltmalar arayüzde hiçbir şeyi kırmaz.
-- Yeni bir ekran istemciden bu tablolara giderse 0 satır alır (hata değil, boş
-- sonuç) — doğru yol uca bir uç eklemektir.
-- =============================================================================
set search_path to public, extensions;

-- ── A) PROFILES ── okuma yalnız kendi satırı ─────────────────────────────────
-- Eski: using (true) → tüm okulun kimlik listesi + her öğretmenin class_code'u.
-- profiles_insert/profiles_update DOKUNULMADI: 0019'un kolon yetkisi orada duruyor
-- ve kayıt akışı (handle_new_user sonrası kendi satırını tamamlama) buna bağlı.
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

-- ── B) QUESTIONS ── okuma yalnız soruyu üreten öğretmen ──────────────────────
-- correct_answer + explanation bu tabloda METİN olarak duruyor (odev-derle.ts:325;
-- puanlama options[idx] === correct_answer karşılaştırması olduğu için başka türlü
-- olamaz). Öğrenci soruları YALNIZ /assignments/:id/questions ucundan alır ve o uç
-- cevabı soyar. Öğretmenin kendi sorularını okuması questions_insert/update/delete
-- ile zaten aynı sahiplik çizgisinde.
drop policy if exists questions_read on public.questions;
create policy questions_read on public.questions for select to authenticated
  using ((select auth.uid()) = teacher_id);

-- ── C) USER_LOGS ── istemci YAZAMAZ, yalnız kendi satırını okur ──────────────
-- Yazan tek meşru yol record_answer RPC'si ve POST /answers ucudur; ikisi de
-- service_role ile çalışır ve doğruluğu DB'den çözer (lib/answers.ts · dogrulukKontrol).
-- Sunucu doğru davranıyordu; sorun sunucunun tamamen atlanabilmesiydi.
drop policy if exists logs_insert on public.user_logs;
drop policy if exists logs_read   on public.user_logs;
create policy logs_read on public.user_logs for select to authenticated
  using ((select auth.uid()) = student_id);

-- ── D) USER_ANSWERS ── aynı gerekçe (analitiğin ikinci kaynağı) ──────────────
drop policy if exists answers_insert on public.user_answers;
drop policy if exists answers_read   on public.user_answers;
create policy answers_read on public.user_answers for select to authenticated
  using ((select auth.uid()) = user_id);

-- ── E) ASSIGNMENTS ── okuma yalnız ödevi veren öğretmen ──────────────────────
-- asg_write (for all, teacher_id sahipliği) zaten SELECT'i de kapsıyor; ayrı
-- asg_read'in tek işlevi tabloyu herkese açmaktı. Öğrenci ödevlerini
-- /assignments uçlarından alır (orada kapsam ve son tarih kontrolü var).
drop policy if exists asg_read on public.assignments;

-- ── F) ASSIGNMENT_SUBMISSIONS ── istemci hiç dokunamaz ───────────────────────
-- Gönderim POST /assignments/submit üzerinden gider: tek-gönderim kilidi (0036
-- unique kısıtı + 23505→409), otoriter puanlama ve maxScore hesabı orada.
-- İstemcinin insert/update yetkisi o zincirin tamamını atlatıyordu.
drop policy if exists asub_insert on public.assignment_submissions;
drop policy if exists asub_update on public.assignment_submissions;
drop policy if exists asub_read   on public.assignment_submissions;

-- ── G) TARGETED_ASSIGNMENTS ── istemci hiç dokunamaz ─────────────────────────
-- ta_update'in `student_id` kolu 2026 öncesi doğrudan-istemci mimarisinin
-- kalıntısı: assignments.routes.ts:307,331'deki tek-gönderim kilidini (yorumu
-- "cevap kâhinini kapatmanın TEK dayanağı" diyor) tek satırlık bir UPDATE ile
-- atlatıyordu. Öğretmen tarafı da service_role'dan yazıyor (POST /teacher/hedefli-odev).
drop policy if exists ta_insert on public.targeted_assignments;
drop policy if exists ta_update on public.targeted_assignments;
drop policy if exists ta_read   on public.targeted_assignments;

comment on table public.user_logs is
  'Cevap/etkinlik defteri. İSTEMCİ YAZAMAZ (0037): tek yazma yolu record_answer RPC''si '
  've POST /answers ucudur. Sınıf KPI''ları (sinif_ozeti) ve risk etiketleri buradan '
  'üretildiği için istemci yazması, öğretmenin gördüğü her sayıyı uydurulabilir yapıyordu.';

comment on table public.assignment_submissions is
  'Ödev gönderimi. İSTEMCİ YAZAMAZ/OKUYAMAZ (0037): puanlama POST /assignments/submit '
  'içinde sunucuda yapılır, tekillik 0036 unique kısıtıyla korunur.';

-- =============================================================================
-- DOĞRULAMA (öğrenci oturumuyla, tarayıcı konsolundan):
--   supabase.from('questions').select('id,correct_answer').limit(1)          -- 0 satır
--   supabase.from('user_logs').insert({ student_id: <kendi id>, xp: 999 })   -- 42501
--   supabase.from('assignment_submissions').insert({ ... })                  -- 42501
--   supabase.from('profiles').select('id,class_code')                        -- yalnız kendi satırı
--   supabase.from('profiles').select('*').eq('id', <kendi id>)               -- ÇALIŞMALI (giriş akışı)
--
-- Politika envanteri:
--   select tablename, policyname, cmd, qual from pg_policies
--    where schemaname='public'
--      and tablename in ('profiles','questions','user_logs','user_answers',
--                        'assignments','assignment_submissions','targeted_assignments')
--    order by tablename, policyname;
--
-- GERİ ALMA (yalnız acil durumda — açığı yeniden açar):
--   create policy profiles_read on public.profiles for select to authenticated using (true);
--   create policy questions_read on public.questions for select to authenticated using (true);
--   create policy logs_read  on public.user_logs    for select to authenticated using (true);
--   create policy logs_insert on public.user_logs   for insert to authenticated
--     with check ((select auth.uid()) = student_id);
--   -- (0002_rls_policies.sql:31-76 tam listeyi taşıyor)
-- =============================================================================
