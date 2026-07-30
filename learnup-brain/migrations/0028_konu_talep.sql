-- =============================================================================
-- 0028 — KONU TALEBİ  (öğrenci seyrek konuya girdiğinde üretim önceliği sinyali)
--
-- Ön koşul: 0026 (konular). Idempotent.
--
-- ═══ NEDEN VAR ═══
-- Havuz seyrek (ölçüldü: 236 çözülebilir soru / 14 ders). Hangi konuya soru üretileceği
-- bugün "hisse" bağlı. Öğrencinin BOŞ ya da SEYREK bir konuyu açması en dürüst talep
-- sinyalidir: gerçek kullanıcı, gerçek konu, gerçek an.
--
-- ⚠️ BU TABLO ÜRETİM TETİKLEMEZ. Yalnız sayaçtır; yönetici kapsama ekranında görür ve
-- üretimi ELLE başlatır (POST /admin/havuz/uretim). Otomatik tetikleme KASTEN yok:
--   · Üretim hattının generate/verify zincirlerinin başında PARALI DeepSeek var ve bütçe
--     kapısı yalnız ':free' slug'ları koruyor (config/env.ts NIGHTLY_FORGE gerekçesi).
--     Öğrenci tıklamasına bağlı otomatik üretim = tavansız, kullanıcı-tetikli harcama.
--   · Üretilen soru doğrulama + özgünlük kapısından geçmeden servis edilemez; senkron
--     akışa sığmaz (öğrenci ekranda bekleyemez).
--
-- ⚠️ KİŞİ BAŞI TEK SATIR (unique). Aynı öğrencinin aynı konuyu 20 kez açması 20 talep
-- DEĞİLDİR — tek ilgidir. Bu kısıt olmadan sayaç, en çok tıklayan tek öğrencinin
-- konusunu üretim sırasının başına taşırdı.
-- =============================================================================
set search_path to public, extensions;

create table if not exists public.konu_talep (
  konu_id    bigint not null references public.konular(id) on delete cascade,
  user_id    uuid   not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (konu_id, user_id)
);

create index if not exists idx_konu_talep_konu on public.konu_talep (konu_id);

comment on table public.konu_talep is
  'Öğrencinin seyrek/boş konuya ilgisi (0028). ÜRETİM TETİKLEMEZ — yalnız yöneticinin '
  'kapsama ekranındaki öncelik sayacı. Kişi başı tek satır: tıklama değil İLGİ sayılır.';

-- Ampirik zorluk sorgusu (admin triyaj) question_id üzerinden filtreliyor; kolonda
-- indeks yoktu (0001'de yalnız user_id+created_at). 241 soruda maliyeti yok ama havuz
-- büyüdükçe triyaj listesi her açılışta tam tarama yapardı.
create index if not exists idx_user_answers_question on public.user_answers (question_id);

-- =============================================================================
-- DOĞRULAMA:
--   -- 1) Aynı öğrenci aynı konuyu iki kez talep edemez:
--   --    insert ... on conflict do nothing → ikinci çağrı 0 satır etkiler.
--   -- 2) En çok talep gören boş konular (üretim sırası):
--   select k.subject, k.ad, count(t.user_id) as talep
--     from public.konular k
--     left join public.konu_talep t on t.konu_id = k.id
--     left join public.konu_havuz h on h.konu_id = k.id
--    where coalesce(h.soru_sayisi, 0) = 0
--    group by k.subject, k.ad order by talep desc limit 20;
-- =============================================================================
