-- 0017 — ZORLUĞU TUTAN ÖRNEK ÖNCE (match_yks_exemplars sıralaması + difficulty dönüşü)
--
-- NEDEN: RPC'nin zorluk süzgeci NULL'a toleranslıdır —
--     (filter_difficulty is null or e.difficulty is null or e.difficulty = filter_difficulty)
-- Bu, çıkmış soruların zorluğu BİLİNMEZKEN doğruydu (0009): etiketsiz soru her seviye için
-- geçerli bir ÜSLUP örneğidir. Etiketleme başlayınca anlamı değişti — NULL artık nötr değil
-- JOKER: etiketsiz her soru HER zorluk siparişinin havuzuna giriyor.
--
-- ÖLÇÜLDÜ (etiketlemenin %31'i bitmişken, yks_exemplars):
--     Matematik → zor=19 · etiketsiz(joker)=267    Türkçe → zor=18 · joker=197
-- Saf vektör sırasıyla ilk 4 örneğe ortalama 0.3 gerçek-zor düşüyordu; yani etiketler DB'de
-- dururken üretime HİÇ yansımıyordu. Süzgeç değil SIRALAMA sorunu: aday havuzunda etiketliler
-- azınlıkta olduğu için vektör sırası onları hep aşağı itiyor.
--
-- ÇÖZÜM: süzgeç aynen kalır (daraltmaz — aşağıdaki uyarıya bak), SIRA değişir: zorluğu tutan
-- satırlar öne alınır, joker'ler ancak açık kalırsa girer.
--
-- ⚠️ SÜZGEÇ SERTLEŞTİRİLMEDİ, BİLEREK. `e.difficulty = filter_difficulty` şartını zorunlu
-- yapmak, o derste henüz etiketli örneği olmayan siparişi ÖRNEKSİZ bırakırdı. ÖLÇÜLDÜ: Fizik'te
-- "zor" etiketli örnek SIFIR (Mantık 1, DKAB 1). Exemplar'ın TEK işi biçim öğretmek; örneksiz
-- kalmak, zorluğu tutmayan örnek görmekten kötüdür. Sıralama tercih eder, süzgeç dışlamaz.
--
-- ⚠️ Dönen tabloya `difficulty` eklendi → dönüş tipi DEĞİŞTİ → `create or replace` PATLAR;
-- tx içinde DROP + CREATE (0009/0015'teki kalıp).

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
    -- 1) zorluğu tutan örnek önce (sipariş NULL ise bu terim herkes için false → etkisiz)
    (filter_difficulty is not null and e.difficulty = filter_difficulty) desc,
    -- 2) sonra konu/biçim yakınlığı (mevcut davranış)
    e.embedding <=> query_embedding
  limit match_count;
$$;

commit;

-- DOĞRULAMA (migration sonrası elle) — Matematik "zor" siparişinde ilk 4 örneğin zorluğu:
--   select difficulty, count(*) from (
--     select * from match_yks_exemplars(
--       (select embedding from yks_exemplars where subject='Matematik' limit 1),
--       'Matematik', null, 'zor', 4)
--   ) t group by difficulty;
--   -- beklenen: zor=4 (etiketli havuz 19 > 4 olduğu için joker'e hiç düşmemeli)
