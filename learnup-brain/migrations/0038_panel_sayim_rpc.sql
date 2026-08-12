-- =============================================================================
-- LearnUp — 0038_panel_sayim_rpc.sql   (ÖĞRETMEN PANELİ: SAYIM/TREND RPC'LERİ)
-- Öğretmen paneli denetimi O3 · D2 (docs/denetim/04-ogretmen-paneli.md)
-- Idempotent — Studio SQL Editor'e yapıştır & RUN.
--
-- ═══ NEDEN ═══
-- Panelin iki sıcak yolu, SAYI istediği hâlde SATIR çekiyordu. `lib/pg.ts` bu tuzağı
-- ("PostgREST 1000 satırda SESSİZCE keser" + `sayimAl`) yazmış olmasına rağmen ödev/panel
-- hattında uygulanmamıştı:
--
--   O3  GET /teacher/ozet → sınıfın 84 GÜNLÜK tüm cevap logunu belleğe çekiyor
--       (40 kişilik sınıfta ~60.000 satır, ~60 ardışık PostgREST isteği) ve sonunda
--       42 kovalık bir sparkline + üç KPI üretiyordu. Uçta yanıt önbelleği YOK (bilerek —
--       öğretmenler arası sızıntı), yani bu maliyet her panel açılışında yeniden ödeniyordu.
--       200 öğrencide `.in()` sorgu dizesi ~7,5 KB'a çıkıyor ve bilinen 414 sınırına yaklaşıyor.
--
--   D2  GET /teacher/sinif/zayif-kazanimlar → kazanım başına STOK SAYISI için tüm soru
--       satırlarını getirip JS'te Map'e sayıyordu: 100 kazanım × ~200 soru × iki tablo
--       ≈ 40.000 satır. Üstelik `osym` sayacı telif kararından (2026-07-22) sonra ödev
--       yüzeyinde ANLAMSIZ — çıkmış soru derlemeye giremiyor.
--
-- ═══ ÇÖZÜM ═══
-- İki `stable` RPC. Gün anahtarı Europe/Istanbul: uygulama katmanı da (rontgen.ts,
-- teacher.routes.ts) gün anahtarını böyle kuruyor — kural TEK yerde bozulmasın.
--
-- Yetki: her ikisi de `revoke ... from public, anon, authenticated` + `grant to service_role`
-- (0016'daki sinif_mevcudu / sinif_ozeti deseni). Panel verisi yalnız uçtan geçer;
-- 0037 istemcinin bu tabloları doğrudan okumasını zaten kapattı.
-- =============================================================================
set search_path to public, extensions;

-- ── A) sinif_gunluk_trend — sınıfın gün gün toplamı (tek sorgu) ──────────────
-- Dönen satır sayısı = ölçüm olan gün sayısı (≤ p_days), 60.000 değil ≤ 84.
-- `solved` sayımı uygulamadaki kuralla BİREBİR aynı: atlanmış (is_skipped) ve
-- cevaplanmamış (is_correct is null) satırlar çözüm sayılmaz ama XP'leri sayılır.
create or replace function public.sinif_gunluk_trend(
  p_teacher_id uuid,
  p_days       int default 84
)
returns table (
  gun     date,
  solved  int,
  correct int,
  xp      bigint
)
language sql stable
as $$
  with mevcut as (select student_id from public.sinif_mevcudu(p_teacher_id))
  select (l.created_at at time zone 'Europe/Istanbul')::date              as gun,
         count(*) filter (where not l.is_skipped and l.is_correct is not null)::int as solved,
         count(*) filter (where l.is_correct)::int                        as correct,
         coalesce(sum(l.xp), 0)::bigint                                   as xp
  from public.user_logs l
  join mevcut m on m.student_id = l.student_id
  where l.created_at >= now() - make_interval(days => p_days)
  group by 1
  order by 1;
$$;
revoke execute on function public.sinif_gunluk_trend(uuid, int) from public, anon, authenticated;
grant  execute on function public.sinif_gunluk_trend(uuid, int) to service_role;

-- ── B) havuz_stok — kazanım başına DOĞRULANMIŞ AI sorusu sayısı ──────────────
-- ⚠️ YALNIZ AI. Telif kararı gereği çıkmış ÖSYM sorusu ödeve derlenemiyor (havuzdanSec
-- açık 'osym' isteğini 400 ile reddediyor, tablodanOrnekle tabloyu yks_ai_questions
-- olarak sabitlemiş). Çıkmış stoğunu saymak, arayüzde "havuz dolu" izlenimi veren ama
-- derlenemeyen bir sayı üretiyordu — Sınıf Panosu'nun ödev kapısı tam bu yüzden yanlış
-- açılıyordu (O1). Sayacı burada da kurmuyoruz: yanlış sayı üretilmesin.
--
-- ⚠️ İKİ FİLTRE BİRLİKTE (0025 kuralı): verified = doğrulama hattının kararı,
-- karantina = yöneticinin. Biri olmadan diğeri havuzu yalan gösterir.
create or replace function public.havuz_stok(p_kazanim_ids int[])
returns table (
  kazanim_id int,
  ai         int
)
language sql stable
as $$
  select q.kazanim_id, count(*)::int as ai
  from public.yks_ai_questions q
  where q.kazanim_id = any(p_kazanim_ids)
    and q.verified = true
    and q.karantina = false
  group by q.kazanim_id;
$$;
revoke execute on function public.havuz_stok(int[]) from public, anon, authenticated;
grant  execute on function public.havuz_stok(int[]) to service_role;

-- =============================================================================
-- DOĞRULAMA:
--   -- 1) Trend: gün sayısı makul mü, toplamlar sinif_ozeti ile tutuyor mu?
--   select count(*) as gun_sayisi, sum(solved) as toplam_cozulen
--     from public.sinif_gunluk_trend('<ogretmen-uuid>', 84);
--
--   -- 2) Stok: elle sayımla karşılaştır
--   select * from public.havuz_stok(array[101,102,103]);
--   select kazanim_id, count(*) from public.yks_ai_questions
--    where kazanim_id in (101,102,103) and verified and not karantina group by 1;
--
--   -- 3) Yetki: authenticated ÇAĞIRAMAMALI
--   select has_function_privilege('authenticated',
--     'public.havuz_stok(int[])', 'execute');       -- false dönmeli
--
-- GERİ ALMA: uçlar RPC yoksa ESKİ YOLA DÜŞER (fetchAll + bellekte sayım) ve log'a
-- uyarı basar — panel çalışmaya devam eder, yalnız pahalı yoldan. Yani bu migration
-- servisten önce ya da sonra uygulanabilir. Fonksiyonları düşürmek için:
--   drop function if exists public.sinif_gunluk_trend(uuid, int);
--   drop function if exists public.havuz_stok(int[]);
-- =============================================================================
