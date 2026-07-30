-- =============================================================================
-- 0021 — ÖĞRETMEN BAŞVURU AKIŞI  (self-servis başvuru + kayıt kapısı sertleştirmesi)
--
-- Ön koşul: 0016 (admin rolü + handle_new_user beyaz listesi), 0019 (kolon-GRANT).
-- Idempotent.
--
-- ═══ KULLANICI KARARI (2026-07-23) ═══
-- Öğretmenler kayıt sırasında DEĞİL, BAŞVURUYLA gelir. Kayıt her zaman öğrenci
-- açar; başvuru yalnız "bekliyor" durumunu yazar; rol YALNIZ yönetici onayıyla
-- öğretmene döner (POST /admin/kullanici/:id/rol, denetim izi + önbellek düşürmesiyle).
--
-- ═══ İÇERİK ═══
--   A) handle_new_user SERTLEŞTİRMESİ — kayıtta rol ARTIK 'teacher' olamaz (yalnız 'student')
--   B) profiles başvuru kolonları (istemci YAZAMAZ — 0019 whitelist'i dışında bırakılır)
--   C) bekleyen başvuru için kısmi indeks (admin listesi "başvuru bekliyor" sayar)
-- =============================================================================
set search_path to public, extensions;

-- ─────────────────────────────────────────────────────────────────────────────
-- A) KAYIT KAPISI — rol iddiası TÜMDEN yok sayılır, herkes 'student' açılır
--
-- ⚠️ 0016 hâlâ raw_user_meta_data->>'role' == 'teacher' değerine izin veriyordu:
-- istemci signUp({ data: { role: 'teacher' } }) ile onaysız da olsa TEACHER-ROL
-- hesap açabiliyordu (is_approved=false olduğu için /teacher/* göremiyordu ama
-- admin listesinde "öğretmen" görünüyor, sınıf kodu üretiliyordu). Yeni kararla
-- öğretmenlik yalnız BAŞVURU + yönetici onayı yoludur → kayıt anı rol iddiasını
-- tümden bırakır. Bu, dilek≠sözleşme (V§3.1): niyet frontend'de 'student' gönderse
-- de garanti KODDA/DB'de zorlanır. class_code artık kayıtta ÜRETİLMEZ (öğrenci
-- sınıfa /sinif/katil ile katılır; kod öğretmenin kimliğidir, kayıtta öğretmen yok).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, email, role, grade, student_class)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', 'İsimsiz Kullanıcı'),
    new.email,
    'student',
    new.raw_user_meta_data->>'grade',
    new.raw_user_meta_data->>'student_class'
  );
  return new;
end; $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- B) BAŞVURU KOLONLARI
--
-- 'bekliyor'  → başvurdu, yönetici bekliyor        (admin listesinde görünür)
-- 'onaylandi' → yönetici teacher'a çevirdi          (rol_degis ucu yazar)
-- 'reddedildi'→ ileride yönetici reddi için ayrılmış (bu kart üretmez; alan hazır)
-- null        → başvuru yok
--
-- ⚠️ 0019 GÜVENLİK ÇİZGİSİ KORUNUR: 0019 blanket UPDATE'i geri alıp yalnız beyaz
-- listedeki kolonlara GRANT verdi. Bu üç kolon o listede DEĞİL → `authenticated`
-- (yani istemci) onları YAZAMAZ. Başvuru durumu YALNIZ service_role ile, yani
-- sunucudaki /ogretmen-basvuru ve /admin/* uçlarından yazılır. Rol/onay gibi bunlar
-- da istemci-yazılamaz kalır; ayrı GRANT verilmez (kasıtlı).
alter table public.profiles
  add column if not exists teacher_application_status text,
  add column if not exists teacher_application_at     timestamptz,
  add column if not exists teacher_application_note    text;

alter table public.profiles drop constraint if exists profiles_teacher_application_status_check;
alter table public.profiles add constraint profiles_teacher_application_status_check
  check (teacher_application_status is null
         or teacher_application_status in ('bekliyor','onaylandi','reddedildi'));

-- ─────────────────────────────────────────────────────────────────────────────
-- C) BEKLEYEN BAŞVURU İNDEKSİ — admin listesi "kaç başvuru bekliyor" sayar,
--    kısmi indeks yalnız bekleyenleri tutar (tabloyu tam taramaz).
-- ─────────────────────────────────────────────────────────────────────────────
create index if not exists profiles_teacher_application_pending
  on public.profiles (teacher_application_at)
  where teacher_application_status = 'bekliyor';

comment on column public.profiles.teacher_application_status is
  'Öğretmen başvuru durumu (0021): bekliyor|onaylandi|reddedildi|null. '
  'İstemci YAZAMAZ (0019 whitelist dışı) — yalnız service_role. Rol DEĞİLDİR: '
  'başvuru yalnız niyet; rolü yönetici onayı (rol_degis) çevirir.';

-- =============================================================================
-- DOĞRULAMA:
--   -- 1) Kayıt kapısı artık 'teacher' vermiyor mu (fonksiyon gövdesinde 'student' sabit):
--   select pg_get_functiondef('public.handle_new_user()'::regprocedure);   -- role = 'student'
--
--   -- 2) Kolonlar ekli mi:
--   select column_name from information_schema.columns
--    where table_name='profiles' and column_name like 'teacher_application%';   -- 3 satır
--
--   -- 3) İstemci bu kolonu YAZAMAMALI (0019 çizgisi): 'authenticated' UPDATE yetkisi
--   --    listesinde teacher_application_status GÖRÜNMEMELİ:
--   select column_name from information_schema.column_privileges
--    where table_name='profiles' and grantee='authenticated' and privilege_type='UPDATE'
--    order by column_name;
--
--   -- 4) Bekleyen başvurular:
--   select id, email, teacher_application_at from public.profiles
--    where teacher_application_status = 'bekliyor' order by teacher_application_at;
-- =============================================================================
