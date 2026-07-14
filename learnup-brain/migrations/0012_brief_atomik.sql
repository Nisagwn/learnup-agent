-- =============================================================================
-- 0012 — AJAN BRİEF'LERİ ATOMİK YAZILIYOR
--
-- SORUN: katip.upsertBrief "oku → birleştir → tüm objeyi geri yaz" yapıyordu:
--
--     select briefs from student_memory where user_id = X       -- {}
--     briefs = { ...eskisi, [agent]: yeniBrief }                -- bellekte birleştir
--     upsert student_memory (briefs)                            -- TÜM objeyi ez
--
-- Bu bir KAYIP GÜNCELLEME. Dört uzman da (ATLAS, NABIZ, PUSULA, KÂTİP) bu fonksiyonu
-- çağırıyor ve worker eşzamanlılık 2 ile çalışıyor. İkisi aynı anda bitirirse:
--     A: briefs {} okur → {atlas: "..."} yazar
--     B: briefs {} okur → {nabiz: "..."} yazar      ← ATLAS'IN BRİEF'İ SİLİNDİ
-- Kaptan'ın masasına eksik bilgi gider; hangi uzmanın kaybolduğu belli bile olmaz.
-- Çok-ajanlı mimarinin tam kalbinde, sessiz bir veri kaybı.
--
-- ÇÖZÜM: birleştirme UYGULAMADA değil, VERİTABANINDA yapılır. `||` operatörü
-- ON CONFLICT DO UPDATE içinde, satır kilidi altında, TAZE değer üzerinde çalışır.
-- Okuma-yazma penceresi diye bir şey kalmaz.
-- =============================================================================
set search_path to public, extensions;

create or replace function public.brief_yaz(
  p_user_id uuid,
  p_agent   text,
  p_brief   text
)
returns void
language sql
security definer
set search_path = public, extensions
as $$
  insert into public.student_memory (user_id, briefs, updated_at)
       values (p_user_id, jsonb_build_object(p_agent, to_jsonb(p_brief)), now())
  on conflict (user_id) do update
       set briefs = coalesce(public.student_memory.briefs, '{}'::jsonb)
                    || jsonb_build_object(p_agent, to_jsonb(p_brief)),   -- ← ATOMİK birleşme
           updated_at = now();
$$;

revoke execute on function public.brief_yaz(uuid, text, text) from public, anon, authenticated;
grant  execute on function public.brief_yaz(uuid, text, text) to service_role;

-- DOĞRULAMA (eşzamanlılık): iki oturumda AYNI ANDA
--   select brief_yaz('<uid>', 'atlas', 'A');
--   select brief_yaz('<uid>', 'nabiz', 'B');
-- Sonuç: briefs = {"atlas":"A","nabiz":"B"} — İKİSİ DE durur. Eskiden biri kaybolurdu.
