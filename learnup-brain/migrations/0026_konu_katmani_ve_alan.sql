-- =============================================================================
-- 0026 — KONU KATMANI + ÖĞRENCİ ALANI  (ders → konu → kazanım; sayısal/sözel/EA)
--
-- Ön koşul: 0001 (curriculum_nodes, profiles), 0013 (yks_ai_questions),
--           0019 (kolon-GRANT), 0024 (handle_new_user), 0025. Idempotent.
--
-- ═══ NEDEN VAR ═══
-- Öğrenci "Matematik → Türev" istiyor. Ama `curriculum_nodes`'un 907 satırının
-- TAMAMI node_type='kazanim' (ölçüldü) — hiç ünite/konu düğümü yok. Ünite yalnız
-- `path` ltree'sinde slug olarak var ve bunlar 2024 MEB adları:
-- `nicelikler_ve_degisimler`, `degisimin_matematigi`, `veriden_olasiliga`…
-- "Türev" bu taksonomide bir düğüm DEĞİL; `mat.g12.degisimin_matematigi`nin içinde.
--
-- ⚠️ MÜFREDAT AĞACINI DEĞİŞTİRMİYORUZ. `curriculum_nodes` kanonik kalır; klasik YKS
-- konu adları AYRI bir katman olarak üstüne biner. Sebep: `kazanim_id` adaptif
-- pratiğin (mastery, /practice/next) ve RAG istatistiğinin dayandığı bağ. Ağacı
-- klasik konularla değiştirmek o bağı koparırdı ve MEB müfredatı her değiştiğinde
-- ikinci kez acı çekilirdi. Bu katman ayrıca ltree'nin derinlik tutarsızlığını
-- (2 seviye 66, 3 seviye 597, 4 seviye 244 satır) arayüzden TAMAMEN gizler.
--
-- ⚠️ KONU ADI SERBEST METİN DEĞİL. `konular` KONTROLLÜ SÖZLÜKTÜR (ders başına ~15-25
-- sabit ad, ÖSYM konu listesinden). Serbest metin bırakılsaydı eşleme katmanı birkaç
-- ayda çöplüğe dönerdi: "Türev", "türev", "Türev-İntegral" üç ayrı konu olurdu.
--
-- ⚠️ ETİKET SORUDA DEĞİL KAZANIMDA TUTULUR. `yks_ai_questions.topic` kolonu (bugün
-- tüm Matematik sorularında NULL) DOLDURULMAZ. Soru başına denormalize etiket kayma
-- (drift) üretir: kazanımın konusu düzeltilince eski sorular yanlış konuda kalırdı.
-- Sorunun konusu daima kazanım üzerinden JOIN'le türer.
--
-- ═══ İÇERİK ═══
--   A) profiles.alan     — öğrencinin YKS alanı (kayıtta seçilir)
--   B) ders_kapsam       — hangi ders hangi sınavda/alanda görünür
--   C) konular           — kontrollü konu sözlüğü (ders × sınav)
--   D) kazanim_konu      — kazanım → konu eşlemesi (çoktan-bire)
--   E) konu_havuz view   — konu başına çözülebilir soru adedi
-- =============================================================================
set search_path to public, extensions;

-- ─────────────────────────────────────────────────────────────────────────────
-- A) ÖĞRENCİ ALANI
--
-- TYT dersleri HERKESE görünür; AYT dersleri alana göre daralır. Alan NULL olabilir
-- (mevcut hesaplar ve öğretmen/yönetici): NULL = "henüz seçmedi" → arayüz yalnız TYT
-- gösterir ve seçime davet eder. NULL'u 'sayisal'a varsaymak, sözelci bir öğrenciye
-- Fizik/Kimya listelemek demekti.
--
-- 'dil' (YDT) KASTEN YOK: havuzda tek İngilizce sorusu, curriculum_nodes'ta tek
-- İngilizce kazanımı yok. Boş bir alan seçeneği sunmak, seçen öğrenciye bomboş bir
-- ürün göstermek olurdu. İçerik gelince buraya eklenir.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.profiles add column if not exists alan text;

alter table public.profiles drop constraint if exists profiles_alan_check;
alter table public.profiles add constraint profiles_alan_check
  check (alan is null or alan in ('sayisal', 'sozel', 'esit_agirlik'));

-- 0019'un kolon-GRANT çizgisi: alan bir YETKİ değil TERCİHTİR → öğrenci kendi
-- alanını değiştirebilmeli (alan değiştiren öğrenci gerçek bir senaryo).
grant update (alan) on public.profiles to authenticated;

-- Kayıt kapısı: alan raw_user_meta_data'dan okunur. 0024'ün gövdesi AYNEN korunur —
-- yalnız alan eklenir. (Rol beyaz listesi, çakışmasız class_code, anında onay: hepsi
-- 0024'teki gibi; buradaki tek fark yeni kolonun yazılması.)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_rol  text;
  v_kod  text;
  v_alan text;
begin
  v_rol := coalesce(new.raw_user_meta_data->>'role', 'student');
  if v_rol not in ('student', 'teacher') then v_rol := 'student'; end if;

  -- Tanınmayan alan değeri sessizce NULL'a düşer: kayıt hiçbir zaman bu yüzden
  -- patlamamalı, öğrenci alanını sonradan profilinden de seçebilir.
  v_alan := new.raw_user_meta_data->>'alan';
  if v_alan not in ('sayisal', 'sozel', 'esit_agirlik') then v_alan := null; end if;
  -- Öğretmen/yönetici hesabında alan anlamsız — okunmaz, yine de kirletmeyelim.
  if v_rol <> 'student' then v_alan := null; end if;

  if v_rol = 'teacher' then
    loop
      v_kod := upper(substring(replace(gen_random_uuid()::text, '-', '') for 6));
      exit when not exists (select 1 from public.profiles where class_code = v_kod);
    end loop;
  end if;

  insert into public.profiles (id, name, email, role, grade, student_class, class_code, is_approved, alan)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', 'İsimsiz Kullanıcı'),
    new.email,
    v_rol,
    new.raw_user_meta_data->>'grade',
    new.raw_user_meta_data->>'student_class',
    v_kod,
    v_rol = 'teacher',
    v_alan
  );
  return new;
end; $$;

comment on column public.profiles.alan is
  'Öğrencinin YKS alanı: sayisal | sozel | esit_agirlik. NULL = seçilmemiş → yalnız '
  'TYT dersleri gösterilir. Alan bir YETKİ DEĞİL tercihtir; öğrenci kendi değiştirebilir (0026).';

-- ─────────────────────────────────────────────────────────────────────────────
-- B) DERS KAPSAMI — hangi ders kime görünür
--
-- Kod sabiti yerine TABLO: "sayısalcı hangi dersleri görür" sorusu soru sayımlarıyla
-- BİRLİKTE tek sorguda cevaplanmalı. Kod sabitinde her ders listesi için ikinci bir
-- tur atmak ya da tüm havuzu çekip bellekte filtrelemek gerekirdi.
--
-- tyt=true  → TYT'de çıkar, ALANDAN BAĞIMSIZ herkes görür (kullanıcı kararı).
-- ayt_alanlar → AYT'de bu dersi hangi alanlar okur. Boş dizi = AYT'de yok.
-- Bir ders İKİSİ BİRDEN olabilir (Matematik: TYT'de herkese, AYT'de say+EA).
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.ders_kapsam (
  subject     text primary key,
  tyt         boolean not null default false,
  ayt_alanlar text[]  not null default '{}',
  sira        int     not null default 100
);

comment on table public.ders_kapsam is
  'Ders görünürlüğü (0026): tyt=true herkese açık; ayt_alanlar o dersi okuyan YKS '
  'alanları. Öğrenci ders listesi = tyt olanlar ∪ (ayt_alanlar @> öğrencinin alanı).';

-- ─────────────────────────────────────────────────────────────────────────────
-- C) KONU SÖZLÜĞÜ — kontrollü liste
--
-- (subject, ad, sinav) benzersiz: aynı ders aynı konuyu TYT ve AYT'de ayrı ayrı
-- taşıyabilir (TYT "Fonksiyonlar" ile AYT "Fonksiyonlar" farklı derinliktedir), ama
-- aynı sınavda iki kez taşıyamaz.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.konular (
  id      bigint generated always as identity primary key,
  subject text not null,
  ad      text not null,
  sinav   text not null check (sinav in ('TYT', 'AYT')),
  sira    int  not null default 100,
  unique (subject, ad, sinav)
);

create index if not exists idx_konular_subject on public.konular (subject, sinav);

comment on table public.konular is
  'Klasik YKS konu sözlüğü (0026) — KONTROLLÜ liste, serbest metin değil. '
  'curriculum_nodes''u DEĞİŞTİRMEZ; üstüne biner. Öğrenci arayüzü ders → konu gösterir, '
  'MEB ünite hiyerarşisi ve ltree path arayüze HİÇ sızmaz.';

-- ─────────────────────────────────────────────────────────────────────────────
-- D) KAZANIM → KONU EŞLEMESİ
--
-- kazanim_id PRIMARY KEY → bir kazanım TEK konuya gider (çoktan-bire). Çoka-çok
-- yapılsaydı "Türev" ve "Limit" aynı kazanımı paylaşır, öğrenci aynı soruyu iki
-- konuda görür ve soru sayıları toplandığında havuz olduğundan büyük görünürdü.
--
-- kaynak: 'llm' otomatik etiketleme, 'yonetici' elle düzeltme. Yönetici düzeltmesi
-- yeniden etiketleme koşusunda EZİLMEZ (script kaynak='yonetici' satırlara dokunmaz) —
-- yoksa yöneticinin her düzeltmesi bir sonraki koşuda geri alınırdı.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.kazanim_konu (
  kazanim_id bigint primary key references public.curriculum_nodes(id) on delete cascade,
  konu_id    bigint not null references public.konular(id) on delete cascade,
  kaynak     text   not null default 'llm' check (kaynak in ('llm', 'yonetici')),
  guven      real,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_kazanim_konu_konu on public.kazanim_konu (konu_id);

comment on table public.kazanim_konu is
  'Kazanım → klasik konu eşlemesi (0026). ÇOKTAN-BİRE: kazanim_id PK. '
  'kaynak=''yonetici'' satırlar otomatik etiketleme koşusunda KORUNUR.';

-- ─────────────────────────────────────────────────────────────────────────────
-- E) KONU HAVUZ GÖRÜNÜMÜ — konu başına çözülebilir soru adedi
--
-- Öğrenciye gösterilen adet, öğrencinin GERÇEKTEN çözebileceği soru sayısı olmalı:
-- verified=true ve karantina=false. Yönetici bir soruyu karantinaya aldığında konu
-- adedi ANINDA düşmeli — bu yüzden view (materialized değil).
--
-- ⚠️ authenticated'a GRANT VERİLMEZ. Yalnız service_role (brain) okur. View'lar
-- Postgres'te varsayılan security_definer'dır; authenticated'a açmak yks_ai_questions
-- üzerindeki RLS'i dolanmanın yolu olurdu.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace view public.konu_havuz as
select
  k.id                       as konu_id,
  k.subject,
  k.ad,
  k.sinav,
  k.sira,
  count(q.id)                as soru_sayisi,
  count(q.id) filter (where q.difficulty = 'kolay') as kolay,
  count(q.id) filter (where q.difficulty = 'orta')  as orta,
  count(q.id) filter (where q.difficulty = 'zor')   as zor
from public.konular k
left join public.kazanim_konu kk on kk.konu_id = k.id
left join public.yks_ai_questions q
       on q.kazanim_id = kk.kazanim_id
      and q.verified = true
      and q.karantina = false
group by k.id, k.subject, k.ad, k.sinav, k.sira;

comment on view public.konu_havuz is
  'Konu başına ÇÖZÜLEBİLİR soru adedi (verified ∧ ¬karantina) + zorluk kırılımı (0026). '
  'Yalnız service_role okur — authenticated''a GRANT verilmez (RLS dolanma yüzeyi).';

-- =============================================================================
-- DOĞRULAMA:
--   -- 1) Alan kolonu ve kısıt:
--   select column_name from information_schema.columns
--    where table_name='profiles' and column_name='alan';                    -- 1 satır
--   insert into public.profiles(id, alan) values (gen_random_uuid(), 'xyz'); -- HATA vermeli
--
--   -- 2) Kayıt trigger'ı alanı yazıyor mu:
--   select pg_get_functiondef('public.handle_new_user()'::regprocedure) like '%v_alan%';  -- true
--
--   -- 3) Öğrenci kendi alanını yazabiliyor, rolünü YAZAMIYOR olmalı:
--   --    (authenticated olarak) update profiles set alan='sayisal' where id=auth.uid();  -- OK
--   --    (authenticated olarak) update profiles set role='admin'   where id=auth.uid();  -- RED
--
--   -- 4) Eşleme çoktan-bire mi (bir kazanım iki konuda olamaz):
--   select kazanim_id, count(*) from public.kazanim_konu
--    group by kazanim_id having count(*) > 1;                               -- 0 satır
--
--   -- 5) View çalışıyor mu (seed + etiketleme sonrası):
--   select subject, ad, soru_sayisi from public.konu_havuz
--    where soru_sayisi > 0 order by soru_sayisi desc limit 10;
-- =============================================================================
