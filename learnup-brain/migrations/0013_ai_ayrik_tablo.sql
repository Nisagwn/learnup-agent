-- =============================================================================
-- 0013 — AI ÜRETİMİ SORULARI KENDİ TABLOSUNA AYIR (yks_ai_questions)
--
-- NEDEN: AI üretimi sorular ile ÖSYM çıkmış sorular tek tabloda (yks_questions),
-- yalnızca `source_type` sütunuyla ayrılıyordu. Servis kodu her sorguda elle
-- `.eq('source_type', ...)` yazmak zorundaydı — bir yerde unutulursa çıkmış soru
-- adaptif sete SIZAR (ya da tersi). Ayrım artık FİZİKSEL: iki ayrı tablo.
--
-- YENİ DÜZEN:
--   yks_ai_questions  → AI üretimi (büyüyen, üretilen içerik). source_type YOK:
--                       tablonun kendisi kaynağı belirtir. Sızma imkânsız.
--   yks_questions     → YALNIZ çıkmış sorular (osym_cikmis). Kanonik, sabit.
--   yks_exemplars     → dokunulmaz (few-shot kaynağı, çıkmış sorular vektörlü).
--
-- CEVAP DOĞRULAMA: öğrenci HER İKİ kaynaktan da soru çözer; doğruluk/XP `id` ile
-- bakılır. İki tabloyu tek noktada çözmek için `cevaplanabilir_sorular` VIEW'i
-- (answers.ts ve atlas.ts bunu okur). Servis yolları ayrı tabloları okur.
-- =============================================================================
set search_path to public, extensions;

begin;

-- 1) AI havuzu — kendi tablosu. exam_year/exam_label/source YOK (onlar ÖSYM'e özgü).
create table if not exists public.yks_ai_questions (
  id             uuid primary key default gen_random_uuid(),
  subject        text    not null,
  kazanim_id     bigint  references public.curriculum_nodes(id) on delete set null,
  topic          text,
  question_text  text    not null,
  options        jsonb   not null,                 -- {"A":..,"B":..,"C":..,"D":..,"E":..}
  correct_option text    not null,                 -- 'A'..'E'
  solution       text,
  difficulty     text,                             -- kolay | orta | zor
  verified       boolean not null default false,
  quality        int,
  content_hash   text,
  created_at     timestamptz not null default now()
);

-- 2) Mevcut AI satırlarını taşı (idempotent — content_hash çakışırsa atla).
--    Trigger yalnız source_type UPDATE'inde ateşlenir; INSERT/DELETE serbest.
insert into public.yks_ai_questions
  (id, subject, kazanim_id, topic, question_text, options, correct_option,
   solution, difficulty, verified, quality, content_hash, created_at)
select
  id, subject, kazanim_id, topic, question_text, options, correct_option,
  solution, difficulty, verified, quality, content_hash, created_at
from public.yks_questions
where source_type = 'ai_generated'
on conflict do nothing;

-- 3) İndeksler — yks_questions'takilerin AI karşılıkları (servis + dedup).
create unique index if not exists uq_yks_ai_questions_hash
  on public.yks_ai_questions (content_hash);
--    yq_dedup_verified'in AI eşi: çok satırlı INSERT tek ifadedir; bir çift satır
--    tüm batch'i düşürür → upsert(ignoreDuplicates) bu indekse dayanır.
create unique index if not exists yaq_dedup_verified
  on public.yks_ai_questions (md5(question_text)) where verified;
--    yq_serve_ai'nin eşi: kazanım+zorluk ile verified AI çekme.
create index if not exists yaq_serve
  on public.yks_ai_questions (kazanim_id, difficulty) where verified;
--    assembleBySubjectFromPool (makro): ders bazlı çekim.
create index if not exists yaq_subject
  on public.yks_ai_questions (subject) where verified;

-- 4) AI satırlarını eski tablodan sil → yks_questions artık YALNIZ çıkmış sorular.
delete from public.yks_questions where source_type = 'ai_generated';

-- 5) Cevap doğrulama görünümü — id ile hem AI hem ÖSYM tek noktadan çözülür.
--    uuid uzayları bağımsız; gen_random_uuid çakışması pratikte imkânsız.
create or replace view public.cevaplanabilir_sorular as
  select id, subject, kazanim_id, question_text, options, correct_option, solution, difficulty
    from public.yks_questions
  union all
  select id, subject, kazanim_id, question_text, options, correct_option, solution, difficulty
    from public.yks_ai_questions;

commit;

-- =============================================================================
-- DOĞRULAMA (çalıştırdıktan sonra):
--   select count(*) from public.yks_ai_questions;                                  -- 8 (taşınan AI)
--   select count(*) from public.yks_questions where source_type = 'ai_generated';  -- 0
--   select count(*) from public.yks_questions;                                     -- 1730 (yalnız ÖSYM)
--   select count(*) from public.cevaplanabilir_sorular;                            -- 1738
--
-- NOT: yks_questions'taki yq_serve_ai kısmi indeksi (where source_type='ai_generated')
-- artık ÖLÜ (eşleşen satır yok) ama zararsız. İstenirse ayrı bir temizlikte düşürülür.
-- =============================================================================
