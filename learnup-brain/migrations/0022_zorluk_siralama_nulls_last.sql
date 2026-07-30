-- 0022 — 0017'nin NULLS-FIRST sıralama hatasını düzeltir (match_yks_exemplars)
-- (0018/0019 zaten başka migration'larda kullanıldığı için bu düzeltme 0022'ye alındı.)
--
-- HATA (0017): sıralama terimi
--     (filter_difficulty is not null and e.difficulty = filter_difficulty) desc
-- Etiketsiz (joker) satırlarda `e.difficulty = filter_difficulty` → NULL, dolayısıyla terim NULL.
-- Postgres'te `ORDER BY ... DESC` varsayılanı NULLS FIRST'tür → joker'ler zor'ların ÖNÜNE geçer.
-- ÖLÇÜLDÜ (2026-07-23, canlı): match_yks_exemplars('Matematik', null, 'zor', 12) → dönen 12 satırın
-- 12'si de difficulty=null; 127 etiketli zor Matematik örneği havuzda dururken hiçbiri ilk 12'ye
-- giremedi. 0017'nin amacı (etiketli önce) tam tersine döndü. Maintainer'ın doğrulama sorgusu
-- (0017 satır 63) çalıştırılsaydı zor=4 yerine zor=0 görülür ve hata yakalanırdı.
--
-- ÇÖZÜM: aynı terime `NULLS LAST` ekle → true(zor) önce, NULL(joker) sonra. Süzgeç/WHERE
-- değişmez; sipariş NULL iken (difficulty istenmemişse) terim herkes için false → yine etkisiz.
-- DOĞRULANDI (uygulama sonrası, canlı): aynı sorgu → 12/12 zor, saglam 12, joker 0.

begin;

drop function if exists public.match_yks_exemplars(vector, text, text, text, int);

create function public.match_yks_exemplars(
  query_embedding   vector(768),
  filter_subject    text,
  filter_topic      text,
  filter_difficulty text,
  match_count       int default 4
)
returns table (
  question_text  text,
  options        jsonb,
  correct_option text,
  solution       text,
  exam_label     text,
  kazanim_id     bigint,
  difficulty     text
)
language sql stable
as $$
  select e.question_text, e.options, e.correct_option, e.solution, e.exam_label, e.kazanim_id, e.difficulty
  from public.yks_exemplars e
  where e.subject = filter_subject
    and (filter_topic      is null or e.topic      = filter_topic)
    and (filter_difficulty is null or e.difficulty is null or e.difficulty = filter_difficulty)
  order by
    -- 1) zorluğu tutan örnek önce — NULLS LAST: joker (difficulty=null) terimi NULL üretir,
    --    NULLS LAST olmadan Postgres onu DESC'te en öne alır (0017 hatası).
    (filter_difficulty is not null and e.difficulty = filter_difficulty) desc nulls last,
    -- 2) sonra konu/biçim yakınlığı
    e.embedding <=> query_embedding
  limit match_count;
$$;

commit;
