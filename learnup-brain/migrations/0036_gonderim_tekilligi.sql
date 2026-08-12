-- =============================================================================
-- LearnUp — 0036_gonderim_tekilligi.sql   (ÖDEV GÖNDERİM TEKİLLİĞİ + SINIF KODU)
-- Mantık denetimi P0/P1 · Idempotent — Studio SQL Editor'e yapıştır & RUN.
--
-- İçerik:
--   A) assignment_submissions (assignment_id, student_id) UNIQUE  — TOCTOU kapanır
--   B) profiles.class_code kısmi UNIQUE                            — katılım 500'ü biter
--
-- ⚠️ İkisi de VERİ TEMİZLİĞİ gerektirir: kısıt eklenmeden önce mevcut çakışmalar
-- ayıklanır. Temizlik adımları geri alınamaz veri SİLMEZ — yalnız fazlalıkları eler
-- (A) ya da çakışan kodu boşaltır (B), böylece kısıt hatasız kurulur.
-- =============================================================================
set search_path to public, extensions;

-- ── A) Ödev gönderimi: öğrenci başına TEK satır ──────────────────────────────
-- Uygulama tarafındaki "önce say, sonra ekle" kontrolü atomik DEĞİLDİ: iki sekmeden
-- eşzamanlı gönderimde ikisi de `oncekiler = 0` okuyup ikisi de insert ediyordu.
-- "Tek gönderim" garantisi — cevap kâhinini kapatmanın tek dayanağı — yarışta çöküyordu.
-- Tablo legacy şemada tanımlı (migration setinde yok), bu yüzden önce varlığı kontrol edilir.
do $$
begin
  if to_regclass('public.assignment_submissions') is null then
    raise notice '0036/A atlandı: assignment_submissions tablosu yok';
    return;
  end if;

  -- Mevcut çift kayıtlar: her (ödev, öğrenci) için EN ERKEN gönderimi tut, sonrakileri sil.
  -- En erken olan doğru olandır — sonrakiler zaten "tekrar gönderim" sömürüsünün ürünü.
  delete from public.assignment_submissions s
   where exists (
     select 1 from public.assignment_submissions t
      where t.assignment_id = s.assignment_id
        and t.student_id    = s.student_id
        and (t.created_at, t.id) < (s.created_at, s.id)
   );

  begin
    alter table public.assignment_submissions
      add constraint assignment_submissions_odev_ogrenci_uq
      unique (assignment_id, student_id);
  exception
    when duplicate_object then null;   -- kısıt zaten var
    when duplicate_table  then null;
  end;
end $$;

-- ── B) Sınıf kodu: öğretmen başına benzersiz ─────────────────────────────────
-- 0024:48 açıkça "Kolonda UNIQUE YOK (0001:26, yalnız indeks)" diyor. Kod üretimi hem
-- handle_new_user hem benzersizSinifKodu içinde "boşta kod bulunana dek dene" döngüsüyle
-- yapılıyor — ikisi de TOCTOU. Eşzamanlı iki kayıt aynı kodu alırsa, o koda katılmak isteyen
-- HER öğrenci `maybeSingle()` çoklu-satır hatasıyla 500 alır ve iki sınıfın tamamı kayıt
-- olamaz. Kısıt, döngülerin verdiği sözü gerçekten garanti eder.
do $$
declare
  cakisan int;
begin
  if to_regclass('public.profiles') is null then
    raise notice '0036/B atlandı: profiles tablosu yok';
    return;
  end if;

  -- Çakışan kodlar: en ESKİ öğretmen kodu korur, diğerlerinin kodu NULL'lanır.
  -- (Kodu boşalan öğretmene uygulama bir sonraki istekte yeni kod üretir — veri kaybı yok.)
  with cakisanlar as (
    select id,
           row_number() over (partition by class_code order by created_at nulls last, id) as sira
      from public.profiles
     where class_code is not null and role = 'teacher'
  )
  update public.profiles p
     set class_code = null
    from cakisanlar c
   where p.id = c.id and c.sira > 1;

  get diagnostics cakisan = row_count;
  if cakisan > 0 then
    raise notice '0036/B: % çakışan sınıf kodu boşaltıldı (yeniden üretilecek)', cakisan;
  end if;

  create unique index if not exists profiles_class_code_uq
    on public.profiles (class_code)
    where class_code is not null and role = 'teacher';
end $$;

-- =============================================================================
-- DOĞRULAMA (çalıştırdıktan sonra):
--   select conname from pg_constraint where conname = 'assignment_submissions_odev_ogrenci_uq';
--   select indexname from pg_indexes where indexname = 'profiles_class_code_uq';
--   -- ikisi de 1 satır dönmeli
-- =============================================================================
