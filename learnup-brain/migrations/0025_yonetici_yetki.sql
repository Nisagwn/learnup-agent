-- =============================================================================
-- 0025 — YÖNETİCİ YETKİ GENİŞLETMESİ
--
-- Ön koşul: 0016 (admin rolü), 0019 (kolon-GRANT), 0020 (denetim defteri),
--           0021 (başvuru kolonları), 0013 (yks_ai_questions). Idempotent.
--
-- ═══ NEDEN ═══
-- 0020'ye kadar yöneticinin yetkisi dört uçtan ibaretti: öğretmen onayı, rol
-- değişimi, sınıf ataması, görev yeniden kuyruklama. Geri kalan her şey salt-okunur
-- istatistikti. Yönetici hiçbir sınıfı göremiyor, hesap açamıyor, kötüye kullanan
-- bir hesabı durduramıyor, havuzdan bozuk soru düşüremiyor, özgünlük eşiğine
-- dokunamıyordu. Bu migration o yetkilerin VERİ tarafını kurar.
--
-- ═══ İÇERİK ═══
--   A) profiles ASKI kolonları           — hesabı durdurmanın tek meşru yolu
--   B) ozgunluk_esikleri tablosu         — eşik koddan DB'ye (panelden düzenlenebilir)
--   C) yks_ai_questions KARANTİNA        — bozuk soruyu geri alınabilir biçimde düşür
--   D) eval_anliklari tablosu            — eval ölçümü kalıcı olsun (dosya değil)
--   E) denetim defteri yorumu            — yeni eylem adları
--
-- ═══ 0019 ÇİZGİSİ KORUNUR ═══
-- Buradaki HİÇBİR profiles kolonu `authenticated` GRANT beyaz listesine eklenmez.
-- Askı durumunu yalnız service_role yazar (POST /admin/kullanici/:id/aski). Aksi
-- hâlde askıya alınan kullanıcı tarayıcı konsolundan kendi askısını kaldırırdı —
-- 0019'un kapattığı ayrıcalık yükseltmesinin birebir aynısı.
-- =============================================================================
set search_path to public, extensions;

-- ─────────────────────────────────────────────────────────────────────────────
-- A) ASKI — hesabı durdur (KALICI SİLME DEĞİL)
--
-- KULLANICI KARARI (2026-07-24): yönetici hesabı askıya alabilir, kalıcı SİLEMEZ.
-- Silme KVKK talebidir ve kullanıcının kendi ucunda kalır (POST /account/delete).
-- Askı geri alınabilir; yanlış askı bir özür, yanlış silme onarılamaz bir kayıptır.
--
-- ⚠️ ASKI ROL DEĞİLDİR. Rolü düşürmek (teacher→student) öğretmenin sınıfını boşaltır
-- ve geri dönüşü zahmetlidir; askı hiçbir bağı koparmaz, yalnız erişimi keser. İki
-- ayrı ihtiyaç, iki ayrı alan.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists askiya_alindi boolean not null default false,
  add column if not exists aski_neden    text,
  add column if not exists aski_veren    uuid,
  add column if not exists aski_at       timestamptz;

-- Askıdaki hesapları listelemek yönetim panelinin sık sorgusu; kısmi indeks yalnız
-- askıdakileri tutar (normal hâlde tablo boyutuna hiç yük bindirmez).
create index if not exists profiles_askida
  on public.profiles (aski_at desc)
  where askiya_alindi;

comment on column public.profiles.askiya_alindi is
  'Hesap askıda mı (0025). true ise requireAktifHesap middleware''i TÜM /api/v1 '
  'uçlarını 403 hesap_askida ile keser. İstemci YAZAMAZ (0019 whitelist dışı) — '
  'yalnız service_role. Rol DEĞİLDİR: askı hiçbir sınıf/öğretmen bağını koparmaz.';

-- ─────────────────────────────────────────────────────────────────────────────
-- B) ÖZGÜNLÜK EŞİKLERİ — koddan DB'ye
--
-- Eşikler utils/benzerlik.ts'te sabitti (ÖSYM aynı-ders NN p99 + 0.05 payıyla
-- türetilmiş; gerekçe o dosyada uzun uzun yazılı). Panelden değiştirilebilir olması
-- gerekiyor: yeni ölçüm geldiğinde eşiği güncellemek için deploy beklemek, kalite
-- bariyerini yönetilemez kılıyordu.
--
-- ⚠️ KOD TABLOSU FALLBACK OLARAK KALIR. ozgunlukEsigi() bu tabloyu 60sn önbellekle
-- okur; tablo boşsa/erişilemezse koddaki değerlere düşer. Üretim hattı ASLA eşiksiz
-- kalmamalı: eşiksiz üretim = bariyersiz üretim.
--
-- Seed değerleri utils/benzerlik.ts:95-101 ile BİREBİR aynı (Matematik 0.62
-- revizyonu dahil). Taban (0.35) burada satır DEĞİL: tabloda olmayan ders taban
-- alır, bu yüzden 1210 kazanımlık müfredatın her dersi için satır tutmak gerekmiyor.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.ozgunluk_esikleri (
  subject      text primary key,
  esik         numeric(4,3) not null check (esik > 0 and esik < 1),
  guncelleyen  uuid,
  updated_at   timestamptz not null default now()
);

-- on conflict do nothing: yeniden koşumda YÖNETİCİNİN DEĞİŞTİRDİĞİ değeri kod
-- varsayılanına geri çevirmek, panelden yapılan işi sessizce silmek olurdu.
insert into public.ozgunluk_esikleri (subject, esik) values
  ('Matematik',               0.620),
  ('Türkçe',                  0.850),
  ('Biyoloji',                0.700),
  ('Kimya',                   0.560),
  ('Türk Dili ve Edebiyatı',  0.430)
on conflict (subject) do nothing;

alter table public.ozgunluk_esikleri enable row level security;
revoke all on public.ozgunluk_esikleri from anon, authenticated;
-- RLS açık + politika YOK → authenticated hiçbir satır göremez/yazamaz. Panel
-- /api/v1/admin/ozgunluk/esik üzerinden, requireRole('admin') kapısının ardından okur.

comment on table public.ozgunluk_esikleri is
  'Ders bazlı özgünlük (Jaccard) eşikleri (0025). utils/benzerlik.ts''teki kod tablosu '
  'FALLBACK olarak kalır: bu tablo boş/erişilemezse üretim koddaki değerlerle sürer. '
  'Eşiği DÜŞÜRMEK kalite bariyerini gevşetir — her değişim yonetim_denetim''e yazılır.';

-- ─────────────────────────────────────────────────────────────────────────────
-- C) KARANTİNA — bozuk soruyu havuzdan düşür (geri alınabilir)
--
-- ⚠️ NEDEN `verified=false` YETMİYOR: `verified` "doğrulama hattını geçemedi"
-- demektir ve üretim telemetrisinin ölçtüğü şeydir. Yöneticinin elle düşürdüğü
-- soruyu aynı kolona bindirmek havuz sayımını YALANLAR: doğrulanmış-oran metriği
-- (admin.routes.ts havuzOzeti) "hattımız kötüleşti" der, oysa insan müdahalesi
-- olmuştur. İki farklı olgu, iki ayrı kolon.
--
-- SİLME YOK: karantina geri alınabilir olmalı. Bir sorunun neden düştüğü, sorunun
-- kendisi kadar değerli bir sinyaldir (aynı hata deseni tekrar üretiliyorsa görülür).
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.yks_ai_questions
  add column if not exists karantina        boolean not null default false,
  add column if not exists karantina_neden  text,
  add column if not exists karantina_at     timestamptz;

create index if not exists yks_ai_questions_karantina
  on public.yks_ai_questions (karantina_at desc)
  where karantina;

comment on column public.yks_ai_questions.karantina is
  'Yönetici elle düşürdü mü (0025). `verified` ile KARIŞTIRILMAZ: verified=false '
  '"doğrulama hattı elemiş", karantina=true "insan düşürmüş". Servis eden her sorgu '
  'ikisini de dışlamak zorunda; havuz metrikleri ikisini AYRI sayar.';

-- ─────────────────────────────────────────────────────────────────────────────
-- D) EVAL ANLIKLARI — ölçüm kalıcı olsun
--
-- ⚠️ MEVCUT DURUM BİR VERİ KAYBI: eval anlıkları `learnup-brain/eval-sonuclari/*.json`
-- dosyalarında tutuluyor (lib/eval-anlik.ts). Ama docker-compose.yml'de o dizin için
-- VOLUME YOK ve brain imajı kaynağı COPY ediyor → panelin gösterdiği anlıklar imaja
-- GÖMÜLÜ, her `docker compose up --build` ile ölçüm geçmişi sıfırlanıyor. Panelden
-- eval tetiklemek ancak sonuç kalıcıysa anlamlı.
--
-- `tarih` primary key: aynı ölçüm iki kez yazılamaz (worker yeniden denerse idempotent).
-- Gövde jsonb: anlık şeması eval ölçümüyle birlikte evrilir, kolon başına migration
-- istemez (types/panel.ts EvalAnlik tipi sözleşmeyi tutar).
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.eval_anliklari (
  tarih      timestamptz primary key,
  ai         jsonb not null default '{}'::jsonb,
  osym       jsonb not null default '{}'::jsonb,
  -- 'dosya' (eski anlıkların taşınması) | 'panel' (yönetici tetikledi) | 'cli' (script)
  kaynak     text not null default 'cli',
  tetikleyen uuid,
  created_at timestamptz not null default now()
);

create index if not exists eval_anliklari_zaman on public.eval_anliklari (tarih desc);

alter table public.eval_anliklari enable row level security;
revoke all on public.eval_anliklari from anon, authenticated;

comment on table public.eval_anliklari is
  'Yapısal-eval ölçüm anlıkları (0025). Dosya tabanlı eval-sonuclari/ dizinini '
  'DEVRALIR: o dizin Docker volume DEĞİLDİ, her build ölçüm geçmişini siliyordu. '
  'lib/eval-anlik.ts önce buraya bakar, dosyalara yalnız fallback yapar.';

-- ─────────────────────────────────────────────────────────────────────────────
-- E) DENETİM DEFTERİ — yeni eylem adları
--
-- Tabloda eylem üzerinde CHECK YOK (0020 kasıtlı bıraktı: yeni yetki eklemek
-- migration beklemesin). Sözleşmeyi TS tarafı tutar: lib/denetim.ts DenetimEylemi.
-- Buradaki yorum o listenin DB tarafındaki aynasıdır.
-- ─────────────────────────────────────────────────────────────────────────────
comment on column public.yonetim_denetim.eylem is
  'Yönetici eylemi. 0020: ogretmen_onay | rol_degis | sinif_ata | gorev_yeniden. '
  '0025 eklenenler: hesap_olustur | profil_duzelt | sifre_sifirla | hesap_askiya | '
  'hesap_geri_al | basvuru_reddet | soru_dogrulama | soru_karantina | soru_etiket | '
  'uretim_tetik | esik_degis | eval_tetik | onbellek_dus | gorev_iptal | '
  'ogretmen_adina_odev | ogretmen_adina_ogrenci. Kanonik liste: lib/denetim.ts.';

comment on column public.yonetim_denetim.hedef_tur is
  'Hedefin türü: kullanici | gorev | ogretmen | soru | sistem. '
  '`ogretmen` = yönetici o öğretmenin sınıfında ONUN ADINA işlem yaptı (0025 vekil kapsam). '
  '`sistem` = hedefi olmayan ops eylemi (önbellek düşürme, eval tetikleme, eşik değişimi).';

-- =============================================================================
-- DOĞRULAMA:
--   -- 1) Askı kolonları ekli ve İSTEMCİ YAZAMIYOR mu (0019 çizgisi)?
--   select column_name from information_schema.columns
--    where table_name='profiles' and column_name like 'aski%';          -- 4 satır
--   select column_name from information_schema.column_privileges
--    where table_name='profiles' and grantee='authenticated' and privilege_type='UPDATE'
--    order by column_name;            -- askiya_alindi / aski_* GÖRÜNMEMELİ
--
--   -- 2) Eşikler seed'li mi ve kod tablosuyla aynı mı?
--   select subject, esik from public.ozgunluk_esikleri order by esik desc;
--   --    Türkçe 0.850 · Biyoloji 0.700 · Matematik 0.620 · Kimya 0.560 · TDE 0.430
--
--   -- 3) Eşik kısıtı çalışıyor mu (0<esik<1)?
--   insert into public.ozgunluk_esikleri (subject, esik) values ('X', 1.5);  -- HATA vermeli
--
--   -- 4) Karantina kolonu ekli mi, verified'dan ayrı mı sayılıyor?
--   select count(*) filter (where verified) as dogrulanmis,
--          count(*) filter (where karantina) as karantinada
--     from public.yks_ai_questions;
--
--   -- 5) Yeni tablolar istemciye kapalı mı (RLS açık + politika yok)?
--   select relname, relrowsecurity from pg_class
--    where relname in ('ozgunluk_esikleri','eval_anliklari');   -- ikisi de true
--   select count(*) from pg_policies
--    where tablename in ('ozgunluk_esikleri','eval_anliklari');  -- 0
-- =============================================================================
