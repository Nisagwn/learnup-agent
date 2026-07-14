-- =============================================================================
-- 0007 — curriculum_nodes: (subject, code) üzerinde UNIQUE index.
--
-- NEDEN (subject, code) — sadece code DEĞİL:
--   MEB kazanım kodları ders İÇİNDE benzersizdir, global değil. "9.1.1.1" hem
--   Matematik'te hem Fizik'te hem Kimya'da vardır. Yalnız `code` üzerinde unique
--   index kurulsaydı, Matematik 9.1.1.1 yazıldıktan sonra Fizik 9.1.1.1 REDDEDİLİRDİ.
--
-- NE SAĞLAR: müfredat ingestion'ı idempotent olur. upsert(onConflict:'subject,code')
--   ile script tekrar çalıştırılabilir; kazanım id'leri KORUNUR
--   (yks_questions.kazanim_id / user_mastery.node_id bağları kopmaz).
--
-- NOT: Postgres unique index birden çok NULL'a izin verir → code'u olmayan
--   (ünite/ders gibi) düğümler engellenmez.
-- =============================================================================
set search_path to public, extensions;

create unique index if not exists uq_curriculum_subject_code
  on public.curriculum_nodes (subject, code);

-- DOĞRULAMA:
-- select indexname from pg_indexes
--  where tablename = 'curriculum_nodes' and indexname = 'uq_curriculum_subject_code';  -- 1 satır
