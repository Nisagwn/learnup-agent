-- =============================================================================
-- 0033 — SORUYA DOĞRUDAN KONU BAĞI (konu-güdümlü üretim için)
--
-- Ön koşul: 0013 (yks_ai_questions), 0026 (konular, kazanim_konu, konu_havuz),
--           0031 (konu_havuz ünite kolonları), 0032 (sözlük). Idempotent.
--
-- ═══ NEDEN — VE 0026'NIN KURALINI NEDEN BOZMUYOR ═══
-- 0026 açıkça şunu diyor: "ETİKET SORUDA DEĞİL KAZANIMDA TUTULUR… Soru başına denormalize
-- etiket kayma (drift) üretir: kazanımın konusu düzeltilince eski sorular yanlış konuda
-- kalırdı." Bu gerekçe TÜRETİLEN etiket için doğrudur ve aynen geçerlidir.
--
-- Burada eklenen alan TÜRETİLEN bir etiket DEĞİL, ÜRETİM GİRDİSİDİR. Konu-güdümlü üretimde
-- soru "Şiirde Ahenk Unsurları" konusu VERİLEREK yazılır; konu, sorunun kaynağıdır. Kaymaya
-- konu olacak bir çıkarım yok — kazanımın konusu sonradan düzeltilse bile bu sorunun hangi
-- konu için yazıldığı değişmez.
--
-- ═══ NEDEN GEREKLİ — ÖLÇÜLDÜ (TDE) ═══
-- `kazanim_konu.kazanim_id` PRIMARY KEY'dir, yani ÇOKTAN-BİRE: bir kazanım tek konuya gider.
-- TDE'de bu duvara çarpıyor:
--   · 244 TDE kazanımının tamamı BECERİ ekseninde (okuma 59 · konuşma 64 · yazma 63 ·
--     dinleme 58); yalnız okuma ÖSYM'nin ölçtüğü şeye karşılık geliyor.
--   · O 59 okuma kazanımı da içerik taşımıyor — "'Dünden Bugüne' temasında ele alınan
--     metinlerde anlam oluşturabilme" cümlesi hem fabl hem halk hikâyesi hem destan kapsar.
--   · Sözlükte ise 102 TDE konusu var (Fabl Türü, Halk Hikâyeleri, Destan, Divan Şiiri…).
--   59 kazanımla 102 konu doldurulamaz: çoktan-bire eşleme matematiksel olarak yetmez.
-- Ölçülen sonuç: eşleme koştuktan sonra bile TDE'nin 102 konusundan 0'ı doluydu.
--
-- Bu yüzden konu-güdümlü üretimde üretim birimi KONU'dur ve soru konusunu doğrudan taşır.
-- `kazanim_id` yine yazılır (mastery/adaptif bağı kopmasın) ama artık konu için ZORUNLU değil.
--
-- ⚠️ ÖNCELİK: konu_id VARSA O GEÇERLİDİR. Soru bir konu için yazıldıysa, kazanımının
-- eşlemesi başka bir konuya işaret etse bile doğru cevap üretim girdisidir.
-- =============================================================================
set search_path to public, extensions;

begin;

-- 1) Alan — nullable. Kazanım-güdümlü üretim (13 dersin tamamı) bugünkü gibi NULL bırakır.
alter table public.yks_ai_questions
  add column if not exists konu_id bigint references public.konular(id) on delete set null;

-- Kısmi indeks: satırların ezici çoğunluğu NULL kalacak, tam indeks yer israfı olurdu.
create index if not exists idx_ai_questions_konu
  on public.yks_ai_questions (konu_id) where konu_id is not null;

comment on column public.yks_ai_questions.konu_id is
  'Konu-güdümlü üretimde sorunun YAZILDIĞI konu (0033). Türetilen etiket DEĞİL, üretim '
  'girdisidir — bu yüzden 0026''nın "etiket kazanımda tutulur" kuralını bozmaz. '
  'NULL = kazanım-güdümlü üretim; konu kazanim_konu üzerinden türer.';

-- 2) konu_havuz — iki yolu birleştir, ÇİFT SAYMA YOK.
--    Bir soru ya doğrudan konu_id taşır ya da kazanımı üzerinden bir konuya bağlanır;
--    coalesce ile soru başına TEK konu belirlenir, sonra konulara sayılır.
drop view if exists public.konu_havuz;

create view public.konu_havuz as
with soru_konu as (
  select
    q.id,
    q.difficulty,
    -- konu_id ÖNCE: üretim girdisi, türetilmiş eşlemeden güçlüdür.
    coalesce(q.konu_id, kk.konu_id) as konu_id
  from public.yks_ai_questions q
  left join public.kazanim_konu kk on kk.kazanim_id = q.kazanim_id
  where q.verified = true
    and q.karantina = false
)
select
  k.id                       as konu_id,
  k.subject,
  k.ad,
  k.sinav,
  k.sira,
  k.unite,
  k.unite_sira,
  count(s.id)                as soru_sayisi,
  count(s.id) filter (where s.difficulty = 'kolay') as kolay,
  count(s.id) filter (where s.difficulty = 'orta')  as orta,
  count(s.id) filter (where s.difficulty = 'zor')   as zor
from public.konular k
left join soru_konu s on s.konu_id = k.id
group by k.id, k.subject, k.ad, k.sinav, k.sira, k.unite, k.unite_sira;

comment on view public.konu_havuz is
  'Konu başına ÇÖZÜLEBİLİR soru adedi (verified ∧ ¬karantina) + zorluk kırılımı + ünite. '
  'Soru→konu iki yoldan gelir: doğrudan yks_ai_questions.konu_id (konu-güdümlü üretim, 0033) '
  'ya da kazanim_konu üzerinden (kazanım-güdümlü). konu_id öncelikli; çift sayma yok. '
  'Yalnız service_role okur — authenticated''a GRANT verilmez (RLS dolanma yüzeyi).';

commit;

-- =============================================================================
-- DOĞRULAMA:
--   -- 1) Kolon ve indeks:
--   select column_name from information_schema.columns
--    where table_name='yks_ai_questions' and column_name='konu_id';          -- 1 satır
--
--   -- 2) Çift sayma yok — toplam soru sayısı konu dağılımını AŞMAMALI:
--   select (select count(*) from yks_ai_questions where verified and not karantina) as havuz,
--          (select sum(soru_sayisi) from konu_havuz)                          as konuya_dusen;
--   -- konuya_dusen <= havuz olmalı (eşlemesi olmayan sorular hiçbir konuya düşmez).
--
--   -- 3) konu_id önceliği çalışıyor mu (konu-güdümlü satır yazıldıktan sonra):
--   select k.ad, count(*) from yks_ai_questions q join konular k on k.id = q.konu_id
--    group by 1 order by 2 desc limit 10;
-- =============================================================================
