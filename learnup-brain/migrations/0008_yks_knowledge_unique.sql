-- =============================================================================
-- 0008 — yks_knowledge: (subject, kazanim_code) üzerinde UNIQUE index + mükerrer temizliği.
--
-- SORUN: ingest-curriculum, yks_knowledge'a INSERT ediyordu (upsert değil). curriculum_nodes
--   idempotent olduğu için müfredat scriptini tekrar çalıştırmak NORMAL iş akışı; ama her
--   çalıştırmada grounding satırları ÇİFTLENİYORDU.
--   Ölçülen durum: 576 benzersiz kazanıma karşılık 724 satır → 148 mükerrer.
--
-- ETKİSİ (neden önemli): RAG araması aynı kazanımı 2 kez döndürür. match_count=5 ise
--   gerçekte 3 farklı kazanım gelir → ajanın gördüğü bağlam daralır, çeşitlilik düşer.
--
-- ÇÖZÜM:
--   1) Mükerrerleri sil — her (subject, kazanim_code) için EN YENİ satırı (max id) tut.
--      En yenisi doğru olan: tireleme onarımı sonrası yeniden üretilen metin.
--   2) UNIQUE index kur → bir daha çiftlenemez.
--   3) ingest-curriculum artık upsert(onConflict:'subject,kazanim_code') kullanır.
--
-- NOT: kazanim_code'u NULL olan satırlar (müfredat dışı bilgi parçaları) ETKİLENMEZ —
--   Postgres unique index birden çok NULL'a izin verir ve temizlik NULL'ları atlar.
-- =============================================================================
set search_path to public, extensions;

-- 1) Mükerrerleri sil (her ders+kod için en büyük id kalır)
delete from public.yks_knowledge a
using public.yks_knowledge b
where a.kazanim_code is not null
  and a.kazanim_code = b.kazanim_code
  and a.subject = b.subject
  and a.id < b.id;

-- 2) Bir daha çiftlenemesin
create unique index if not exists uq_yks_knowledge_subject_code
  on public.yks_knowledge (subject, kazanim_code);

-- DOĞRULAMA:
--   select count(*) from yks_knowledge;         -- curriculum_nodes ile AYNI olmalı (10 ders: 820)
--   select count(*) from (select subject, kazanim_code from yks_knowledge
--                          where kazanim_code is not null
--                          group by 1,2 having count(*) > 1) t;          -- 0 olmalı
--
-- NOT: Bu migration idempotenttir — tekrar çalıştırmak zararsızdır (delete no-op olur,
--      index zaten varsa "if not exists" hiçbir şey yapmaz).
