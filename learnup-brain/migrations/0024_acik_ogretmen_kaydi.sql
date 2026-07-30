-- =============================================================================
-- 0024 — AÇIK ÖĞRETMEN KAYDI  (kayıtta rol seçimi; yönetici onayı KALDIRILDI)
--
-- Ön koşul: 0016 (admin rolü + rol beyaz listesi), 0019 (kolon-GRANT),
--           0021 (kayıt kapısı sertleştirmesi + başvuru kolonları). Idempotent.
--
-- ═══ KULLANICI KARARI (2026-07-24) — 0021'in kararı GERİ ALINDI ═══
-- Öğretmenler artık BAŞVURMAZ. Kayıt formunda "Öğretmenim" seçen hesap ANINDA
-- öğretmen açılır: sınıf kodu üretilir, onay beklemez, yönetici paneline düşmez.
--
-- ⚠️ GÜVENLİK ETKİSİ — BİLİNÇLİ KABUL (kullanıcıya açıkça sunuldu, "tamamen açık"
-- seçildi). Rol iddiası `raw_user_meta_data`dan gelir ve o alan İSTEMCİ YAZILABİLİR
-- (`supabase.auth.signUp({ data: { role: 'teacher' } })`). Yani kayıt olan HERKES
-- kendini öğretmen yapabilir ve öğretmen yüzeyini görür. 0016/0021'in kapattığı
-- ayrıcalık-yükseltme yüzeyi öğretmen için KASTEN yeniden açılıyor.
--
-- Kalan sınırlar (bu migration'ın BOZMADIKLARI — yanlış güven kurulmasın diye yazılı):
--   · 'admin' bu kapıdan HÂLÂ GEÇEMEZ — tanınmayan/izinsiz rol 'student'a düşer.
--     Yönetici YALNIZ elle SQL ile verilir (0016 çizgisi korunur).
--   · Öğretmen rastgele bir öğrencinin verisine erişemez: sınıf mevcudu
--     `sinif_mevcudu` (0016-D) ile teacher_id/teacher_ids üzerinden türetilir ve
--     öğrenci sınıfa ancak ÖĞRETMENİN KODUNU girerek katılır (/sinif/katil).
--     Yani açılan yüzey "boş sınıflı öğretmen paneli"dir, başkasının verisi değil.
--   · `assertTeacherOwnsStudent` / `assertTeacherOwnsClass` (lib/yetki.ts) aynen durur.
--
-- ═══ İÇERİK ═══
--   A) handle_new_user — rol beyaz listesi geri (student|teacher); öğretmene
--      ÇAKIŞMASIZ class_code + is_approved=true
--
-- Bekleyen başvurular (`teacher_application_status='bekliyor'`) KASTEN ellenmez:
-- otomatik terfi, kullanıcının istemediği bir veri mutasyonu olurdu. Yönetici onları
-- Kullanıcılar ekranından onaylamaya devam edebilir (akış bozulmadı).
-- =============================================================================
set search_path to public, extensions;

-- ─────────────────────────────────────────────────────────────────────────────
-- A) KAYIT KAPISI — rol iddiası yeniden kabul edilir (yalnız student|teacher)
--
-- 0021 rolü 'student' sabitine çakmıştı; burada 0016'nın beyaz listesine dönülüyor.
-- 0016'dan İKİ FARK var:
--
--   1) is_approved AÇIKÇA yazılır. Kolon `not null default false` (0003:10) ve
--      requireRole('teacher') onu ŞART koşar (middleware/requireRole.ts:41). Bu
--      satır olmasaydı öğretmen hesabı AÇILIR ama /teacher/* uçlarından
--      'ogretmen_onaysiz' yerdi — yani "onay kaldırıldı" denip onay kapısı
--      sessizce yerinde kalırdı. Onay kalktıysa hesap doğar doğmaz onaylıdır.
--
--   2) class_code ÇAKIŞMASIZ üretilir. Kolonda UNIQUE YOK (0001:26, yalnız indeks);
--      0016'nın tek atışlı üretimi iki öğretmene aynı kodu verebilirdi. O kod
--      sınıfın KİMLİĞİdir (assertTeacherOwnsClass + /sinif/katil): çakışma,
--      öğrencinin yanlış sınıfa katılması demektir. Boşta kod bulunana dek denenir.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_rol text;
  v_kod text;
begin
  v_rol := coalesce(new.raw_user_meta_data->>'role', 'student');
  -- 'admin' ASLA bu kapıdan geçmez; tanınmayan her değer öğrenciye düşer.
  if v_rol not in ('student', 'teacher') then v_rol := 'student'; end if;

  if v_rol = 'teacher' then
    loop
      v_kod := upper(substring(replace(gen_random_uuid()::text, '-', '') for 6));
      exit when not exists (select 1 from public.profiles where class_code = v_kod);
    end loop;
  end if;

  insert into public.profiles (id, name, email, role, grade, student_class, class_code, is_approved)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', 'İsimsiz Kullanıcı'),
    new.email,
    v_rol,
    new.raw_user_meta_data->>'grade',
    new.raw_user_meta_data->>'student_class',
    v_kod,                 -- öğrenci için null (öğrenci sınıfa /sinif/katil ile girer)
    v_rol = 'teacher'      -- öğretmen ANINDA onaylı; öğrencide alan zaten okunmaz
  );
  return new;
end; $$;

comment on function public.handle_new_user() is
  'Kayıt trigger''ı (0024): rol raw_user_meta_data''dan okunur, beyaz liste '
  'student|teacher — ''admin'' ASLA geçmez. Öğretmen ANINDA onaylı açılır '
  '(is_approved=true) ve çakışmasız class_code alır; yönetici onayı YOKTUR. '
  'Rol iddiası istemci-yazılabilir: açık öğretmen kaydı bilinçli üründür.';

-- =============================================================================
-- DOĞRULAMA:
--   -- 1) Fonksiyon beyaz listeyi ve anında onayı içeriyor mu:
--   select pg_get_functiondef('public.handle_new_user()'::regprocedure);
--
--   -- 2) Yeni öğretmen kaydı sonrası (uygulamadan "Öğretmenim" ile kaydol):
--   select email, role, is_approved, class_code from public.profiles
--    where role = 'teacher' order by created_at desc limit 5;
--   -- beklenen: is_approved = true, class_code 6 hane DOLU
--
--   -- 3) 'admin' hâlâ geçemiyor olmalı (kayıtta role:'admin' denense bile):
--   select count(*) from public.profiles where role = 'admin';   -- yalnız elle verilenler
--
--   -- 4) Sınıf kodu çakışması olmamalı:
--   select class_code, count(*) from public.profiles
--    where class_code is not null group by class_code having count(*) > 1;   -- 0 satır
-- =============================================================================
