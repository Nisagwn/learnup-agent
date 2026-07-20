-- =============================================================================
-- 0019 — PROFİL KOLON YETKİSİ  🚨 AYRICALIK YÜKSELTME AÇIĞINI KAPATIR
--
-- Ön koşul: app 0001–0003, brain 0016. Idempotent.
--
-- ═══ AÇIK (DOĞRULANDI, sömürülebilir) ═══
-- 0002_rls_policies.sql:34 şu politikayı kuruyor:
--     create policy profiles_update on profiles for update to authenticated
--       using (auth.uid() = id) with check (auth.uid() = id);
--
-- Politika SATIRI kısıtlıyor ("yalnız kendi satırın") ama KOLONU kısıtlamıyor.
-- Postgres'te RLS politikası kolon bazlı değildir. Sonuç: giriş yapmış HERHANGİ
-- bir öğrenci, tarayıcı konsolundan tek satırla kendini yönetici yapabiliyordu:
--
--     supabase.from('profiles').update({ role: 'admin' }).eq('id', myId)
--
-- CANLI DB'DE DOĞRULANDI: güncelleme KABUL EDİLDİ, profiles.role = 'admin' oldu.
--
-- Bu, 0016'da kapattığımız kayıt-anı yükseltmesinden DAHA CİDDİDİR: orada rol
-- yalnız kayıt sırasında iddia edilebiliyordu ve beyaz listeye takılıyordu;
-- burada mevcut bir kullanıcı istediği an kendini yükseltiyor. requireRole
-- middleware'i rolü `profiles`'tan okuduğu için TÜM RBAC bu açıkla geçersizdi.
--
-- ═══ ÇÖZÜM ═══
-- Kolon bazlı GRANT. RLS "hangi SATIR"ı, GRANT "hangi KOLON"u belirler; ikisi
-- birlikte gerekir. Blanket UPDATE geri alınır, yalnız kullanıcının kendi
-- yönetmesi MEŞRU olan alanlar verilir.
--
-- YETKİ ALANLARI (istemci ASLA yazamaz — yalnız service_role):
--   role · is_approved   → yetki. Kendi kendine rol vermek tanımı gereği yasak.
--   teacher_id/teacher_ids/class_code/students → sınıf üyeliği. Katılım
--     /api/v1/sinif/katil ucundan geçer; orada kod doğrulanır.
--   stats/mastery*/gamification/level_data/unlocked_badges → puan ve ilerleme.
--     İstemci yazabilseydi her öğrenci kendi XP'sini ve ustalığını uydururdu;
--     bunlar record_answer RPC'siyle sunucuda hesaplanır.
--   email/created_at → kimlik ve denetim izi.
-- =============================================================================
set search_path to public, extensions;

-- 1) Blanket UPDATE'i geri al. (RLS politikası kalır; artık kolon yetkisi de var.)
revoke update on public.profiles from authenticated;

-- 2) Yalnız kullanıcının kendi yönetmesi meşru olan alanları ver.
--    Not: GRANT, RLS'in YERİNE geçmez — profiles_update politikası hâlâ
--    "yalnız auth.uid() = id" diyor. İkisi birlikte: doğru satır + doğru kolon.
grant update (
  name,
  avatar,
  grade,
  student_class,
  school,
  branch,
  bio,
  daily_goal,
  notifications_enabled,
  teacher_notif_prefs,
  total_chat_messages,
  last_goal_reached_date,
  last_solved_question,
  updated_at
) on public.profiles to authenticated;

-- 3) Kaçak yükseltmeleri temizle: bu açıkla admin/teacher olmuş hesap var mı?
--    Meşru yöneticiler ELLE verilir; bu yüzden burada otomatik düşürme YAPILMAZ —
--    yalnız denetim için listelenebilir (aşağıdaki doğrulama sorgusu).

comment on table public.profiles is
  'Kullanıcı profili. UPDATE yetkisi KOLON BAZLIDIR (0019): role/is_approved/'
  'teacher_id/class_code/stats/gamification istemciden YAZILAMAZ — yalnız service_role. '
  'Bu kısıt olmadan RLS''in satır koruması ayrıcalık yükseltmeyi engellemiyordu.';

-- =============================================================================
-- DOĞRULAMA:
--   -- 1) Yalnız beyaz listedeki kolonlarda UPDATE yetkisi kalmalı:
--   select column_name from information_schema.column_privileges
--    where table_name='profiles' and grantee='authenticated' and privilege_type='UPDATE'
--    order by column_name;                       -- role/is_approved GÖRÜNMEMELİ
--
--   -- 2) Bu açıkla yükselmiş hesap var mı (elle verdiklerin dışında)?
--   select id, email, role from public.profiles where role <> 'student';
--
--   -- 3) Uçtan uca: bir öğrenci oturumuyla
--   --    supabase.from('profiles').update({ role: 'admin' }).eq('id', <kendi id>)
--   --    artık 42501 (insufficient_privilege) ile REDDEDİLMELİ.
-- =============================================================================
