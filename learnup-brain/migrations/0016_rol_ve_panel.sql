-- =============================================================================
-- 0016 — ROL SİSTEMİ + SINIF ANALİTİĞİ (Öğretmen/Yönetici panelleri)
--
-- Ön koşul: app şeması 0001→0003 + brain 0001→0015. Idempotent.
--
-- İçerik:
--   A) profiles.role'e 'admin' + handle_new_user SERTLEŞTİRMESİ (ayrıcalık yükseltme kapanır)
--   B) Mevcut öğretmenlerin onay geri-doldurması (deploy günü kilitlenmeyi önler)
--   C) Sınıf sorgularının eksik indeksleri
--   D) sinif_mevcudu            — tekil + çoklu üyelik tek yerde
--   E) sinif_ozeti              — mevcut + öğrenci-başına özet (1+3N yerine TEK sorgu)
--   F) sinif_isi_haritasi       — ders × ünite ÇÜRÜME-DÜZELTİLMİŞ ısı haritası
--   G) sinif_zayif_kazanimlar   — sınıfa toplanmış zayıf kazanımlar
--
-- ⚠️ NEDEN v_mastery_rollup KULLANILMIYOR: o view avg(um.mastery) — HAM değer, ÇÜRÜME YOK
-- (0014:19 bunu zaten kusur olarak yazıyor). Öğrenciye gösterilmesi engellenen şişik sayıyı
-- öğretmene göstermek aynı yalandır, üstelik DAHA ZARARLIDIR: öğretmen ona bakıp
-- MÜDAHALE ETMEZ. Aşağıdaki üç RPC çürümeyi lib/mastery.ts:36 ve weak_kazanimlar (0005:87-90)
-- ile BİREBİR aynı formülle uygular.
-- =============================================================================
set search_path to public, extensions;

-- ─────────────────────────────────────────────────────────────────────────────
-- A) ROL — 'admin' eklenir, kayıt kapısı sertleştirilir
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('student','teacher','admin'));

-- ⚠️ GÜVENLİK DÜZELTMESİ (mevcut açık): 0001:64 rolü doğrudan
-- new.raw_user_meta_data->>'role' üzerinden alıyordu. Bu alan İSTEMCİ YAZILABİLİR
-- (supabase.auth.updateUser({ data: { role: 'admin' } })). Yani rol İDDİASI hakikat
-- sanılıyordu. Artık: tanınmayan değer 'student'a düşer, 'admin' bu kapıdan ASLA geçemez.
-- Admin YALNIZ elle SQL ile verilir (aşağıdaki doğrulama bloğu).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_rol text;
begin
  v_rol := coalesce(new.raw_user_meta_data->>'role', 'student');
  if v_rol not in ('student','teacher') then v_rol := 'student'; end if;

  insert into public.profiles (id, name, email, role, grade, student_class, class_code)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', 'İsimsiz Kullanıcı'),
    new.email,
    v_rol,
    new.raw_user_meta_data->>'grade',
    new.raw_user_meta_data->>'student_class',
    case when v_rol = 'teacher'
         then upper(substring(replace(gen_random_uuid()::text,'-','') for 6)) end
  );
  return new;
end; $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- B) ONAY GERİ-DOLDURMASI
--
-- is_approved (0003:10) `default false` ve kod HİÇBİR YERDE true yapmıyor.
-- requireRole('teacher') bunu şart koştuğu an, geri-doldurma olmadan BUGÜN çalışan
-- her öğretmen kilitlenirdi. Onay kapısı YENİ kayıtlar için işler.
-- ─────────────────────────────────────────────────────────────────────────────
update public.profiles
   set is_approved = true
 where role = 'teacher' and is_approved = false;

-- ─────────────────────────────────────────────────────────────────────────────
-- C) EKSİK İNDEKSLER
-- ─────────────────────────────────────────────────────────────────────────────
-- Sınıf mevcudu: teacher_id + role='student' her panel sorgusunun İLK adımı.
create index if not exists profiles_teacher_student
  on public.profiles (teacher_id) where role = 'student';

-- Çoklu sınıf üyeliği (0003:11). `teacher_ids @> '["uuid"]'` aksi hâlde SEQ SCAN'dir.
create index if not exists profiles_teacher_ids_gin
  on public.profiles using gin (teacher_ids jsonb_path_ops);

-- ─────────────────────────────────────────────────────────────────────────────
-- D) ORTAK: sınıf mevcudu — tekil (teacher_id) VEYA çoklu (teacher_ids)
--    Üyelik mantığı TEK YERDE; üç RPC de buradan okur, sapma imkânsız.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.sinif_mevcudu(p_teacher_id uuid)
returns table (student_id uuid)
language sql stable
as $$
  select p.id
  from public.profiles p
  where p.role = 'student'
    and (p.teacher_id = p_teacher_id
         or p.teacher_ids @> to_jsonb(p_teacher_id::text));
$$;
revoke execute on function public.sinif_mevcudu(uuid) from public, anon, authenticated;
grant  execute on function public.sinif_mevcudu(uuid) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- E) sinif_ozeti — mevcut + öğrenci-başına özet, TEK sorgu
--    N+1 KAPANIR: eskiden roster + öğrenci başına (ustalık, log, misconception) = 1+3N.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.sinif_ozeti(
  p_teacher_id uuid,
  p_days       int default 30
)
returns table (
  student_id uuid, name text, grade text, student_class text,
  solved int, correct int, xp bigint, last_active timestamptz,
  avg_mastery float, tracked_nodes int, open_misconceptions int
)
language sql stable
as $$
  with mevcut as (select student_id from public.sinif_mevcudu(p_teacher_id)),
  loglar as (
    select l.student_id,
           count(*) filter (where not l.is_skipped and l.is_correct is not null)::int as solved,
           count(*) filter (where l.is_correct)::int                                  as correct,
           coalesce(sum(l.xp), 0)::bigint                                             as xp,
           max(l.created_at)                                                          as last_active
    from public.user_logs l
    join mevcut m on m.student_id = l.student_id
    where l.created_at >= now() - make_interval(days => p_days)
    group by l.student_id
  ),
  ustalik as (
    select um.user_id,
           -- ÇÜRÜME: lib/mastery.ts:36 ve weak_kazanimlar (0005:87-90) ile BİREBİR
           avg(um.mastery * exp(
             -greatest(extract(epoch from (now() - um.updated_at)) / 86400.0, 0)
             / (7.0 * (1.0 + um.stability))))::float as avg_mastery,
           count(*)::int as tracked_nodes,
           coalesce(sum((
             select count(*) from jsonb_array_elements(um.misconceptions) mc
             where mc->>'status' = 'open'
           )), 0)::int as open_misconceptions
    from public.user_mastery um
    join mevcut m on m.student_id = um.user_id
    group by um.user_id
  )
  select p.id, p.name, p.grade, p.student_class,
         coalesce(l.solved, 0), coalesce(l.correct, 0), coalesce(l.xp, 0), l.last_active,
         -- takip edilen düğüm yoksa NULL: "veri yok" ile "ustalık 0" AYRI şeylerdir.
         u.avg_mastery, coalesce(u.tracked_nodes, 0), coalesce(u.open_misconceptions, 0)
  from mevcut m
  join public.profiles p on p.id = m.student_id
  left join loglar  l on l.student_id = m.student_id
  left join ustalik u on u.user_id    = m.student_id
  order by u.avg_mastery asc nulls last, p.name asc;
$$;
revoke execute on function public.sinif_ozeti(uuid, int) from public, anon, authenticated;
grant  execute on function public.sinif_ozeti(uuid, int) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- F) sinif_isi_haritasi — ders × ünite, ÇÜRÜME DÜZELTİLMİŞ
--
-- İKİ KATMANLI ORTALAMA (önce öğrenci-içi, sonra öğrenciler arası). Tek katmanlı
-- avg(m_eff), 40 düğüme dokunmuş öğrenciyi 2 düğüme dokunmuşun 20 KATI ağırlıklandırır —
-- "sınıf ortalaması" o zaman sınıfın değil, EN ÇALIŞKANIN haritası olur.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.sinif_isi_haritasi(
  p_teacher_id   uuid,
  p_subject      text  default null,
  p_min_attempts int   default 1,
  p_zayif_esik   float default 0.40
)
returns table (
  subject text, unit_path text, avg_mastery float,
  student_count int, weak_student_count int, node_count int, attempts bigint
)
language sql stable
as $$
  with mevcut as (select student_id from public.sinif_mevcudu(p_teacher_id)),
  etkin as (
    select um.user_id, n.subject,
           subltree(n.path, 0, least(nlevel(n.path), 2))::text as unit_path,
           um.attempts,
           (um.mastery * exp(
             -greatest(extract(epoch from (now() - um.updated_at)) / 86400.0, 0)
             / (7.0 * (1.0 + um.stability))))::float as m_eff
    from public.user_mastery um
    join mevcut m on m.student_id = um.user_id
    join public.curriculum_nodes n on n.id = um.node_id
    where um.attempts >= p_min_attempts
      and (p_subject is null or n.subject = p_subject)
  ),
  ogrenci_unite as (
    select user_id, subject, unit_path,
           avg(m_eff)    as ogrenci_ort,
           sum(attempts) as attempts,
           count(*)      as node_count
    from etkin
    group by user_id, subject, unit_path
  )
  select ou.subject, ou.unit_path,
         avg(ou.ogrenci_ort)::float,
         count(*)::int,
         count(*) filter (where ou.ogrenci_ort < p_zayif_esik)::int,
         sum(ou.node_count)::int,
         sum(ou.attempts)::bigint
  from ogrenci_unite ou
  group by ou.subject, ou.unit_path
  order by avg(ou.ogrenci_ort) asc;      -- en zayıf ünite başta: müdahale sırası
$$;
revoke execute on function public.sinif_isi_haritasi(uuid, text, int, float)
  from public, anon, authenticated;
grant  execute on function public.sinif_isi_haritasi(uuid, text, int, float) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- G) sinif_zayif_kazanimlar — weak_kazanimlar'ın sınıf ölçeği
--
-- weak_kazanimlar (0005:83) ÖĞRENCİ BAŞINADIR; sınıf için öğrenci başına çağırmak N+1'dir.
-- Eşikler ORADAKİLERLE AYNI: attempts >= 3 ("kronik"), wrong_rate = 1 − m_eff.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.sinif_zayif_kazanimlar(
  p_teacher_id   uuid,
  p_limit        int   default 20,
  p_subject      text  default null,
  p_min_attempts int   default 3,
  p_zayif_esik   float default 0.60
)
returns table (
  kazanim_id bigint, code text, title text, subject text, path text,
  avg_wrong_rate float, student_count int, weak_student_count int, attempts bigint
)
language sql stable
as $$
  with mevcut as (select student_id from public.sinif_mevcudu(p_teacher_id)),
  etkin as (
    select um.node_id, um.user_id, um.attempts,
           (1.0 - (um.mastery * exp(
             -greatest(extract(epoch from (now() - um.updated_at)) / 86400.0, 0)
             / (7.0 * (1.0 + um.stability)))))::float as wrong_rate
    from public.user_mastery um
    join mevcut m on m.student_id = um.user_id
    where um.attempts >= p_min_attempts
  )
  select n.id, n.code, n.title, n.subject, n.path::text,
         avg(e.wrong_rate)::float,
         count(distinct e.user_id)::int,
         count(distinct e.user_id) filter (where e.wrong_rate >= p_zayif_esik)::int,
         sum(e.attempts)::bigint
  from etkin e
  join public.curriculum_nodes n on n.id = e.node_id
  where (p_subject is null or n.subject = p_subject)
  group by n.id, n.code, n.title, n.subject, n.path
  -- Sıra ÖNCE "kaç öğrenciyi etkiliyor": sınıf müdahalesi bireysel şiddeti değil
  -- YAYGINLIĞI hedefler. Bireysel şiddet zaten /ogrenci/:id/rontgen'de.
  order by count(distinct e.user_id) filter (where e.wrong_rate >= p_zayif_esik) desc,
           avg(e.wrong_rate) desc
  limit p_limit;
$$;
revoke execute on function public.sinif_zayif_kazanimlar(uuid, int, text, int, float)
  from public, anon, authenticated;
grant  execute on function public.sinif_zayif_kazanimlar(uuid, int, text, int, float)
  to service_role;

-- =============================================================================
-- DOĞRULAMA:
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conname = 'profiles_role_check';                 -- 3 değer görünmeli
--   select proname from pg_proc where proname in
--     ('sinif_mevcudu','sinif_ozeti','sinif_isi_haritasi','sinif_zayif_kazanimlar');  -- 4 satır
--   select count(*) from public.profiles
--    where role='teacher' and is_approved = false;          -- 0 olmalı
--
-- İLK ADMİN — ELLE. Hiçbir kod yolu 'admin' VEREMEZ (yükseltme yüzeyi sıfır):
--   update public.profiles set role = 'admin' where email = '<admin e-postası>';
-- =============================================================================
