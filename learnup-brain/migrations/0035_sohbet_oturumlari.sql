-- =============================================================================
-- 0035 — SOHBET OTURUMU LİSTESİ (Koç ekranında geçmişe gezinme)
--
-- Ön koşul: 0001 (chat_messages). Idempotent.
--
-- ═══ NEDEN ═══
-- Koç ekranında öğrenci ESKİ SOHBETLERİNE ULAŞAMIYORDU. `GET /chat/history` yalnız EN SON
-- oturumu döndürüyor, "yeni sohbet" düğmesi de yeni bir session_id açıyordu — yani her yeni
-- sohbet, bir öncekini erişilemez kılıyordu. Veri kaybolmuyordu (chat_messages'ta duruyor),
-- ama ona giden hiçbir yol yoktu: tarih yok, liste yok, geri dönüş yok.
--
-- ═══ NEDEN YENİ TABLO DEĞİL — TÜRETME ═══
-- `session_id` ZATEN chat_messages'ta. Oturum listesi bir TÜRETMEDİR, ayrı bir hakikat değil:
-- ayrı tablo tutmak, iki yerin senkron kalmasını gerektirir ve mesaj silinince/eklenince
-- sayaçların kayması için bir yol daha açardı.
--
-- ⚠️ ESKİ `public.chats` TABLOSU BİLEREK KULLANILMADI. O, brain öncesi Supabase-native
-- uygulamadan kalma ve mesajları `messages jsonb` BLOB'unda tutuyor — bugünkü satır-başına-
-- mesaj modeliyle çelişir. `chat_messages.chat_id` kolonu (0004) o tabloya bakar ama bugünkü
-- backend ona hiç yazmaz. Diriltmek iki hakikat kaynağı demek olurdu.
--
-- ═══ BAŞLIK NEDEN LLM'SİZ ═══
-- Başlık, oturumun İLK KULLANICI MESAJIDIR (80 karakter kırpma). Alternatif her yeni sohbet
-- için bir adlandırma çağrısıydı; bu, projenin sürekli "kredisiz çalışma" kısıtıyla çelişir —
-- ve her sohbetin parayla adlandırılması, sohbet açmayı ücretli hale getirirdi.
-- =============================================================================

-- ── İndeks ───────────────────────────────────────────────────────────────────
-- ⚠️ MEVCUT İNDEKS BU SORGUYA YARAMIYOR. idx_chat_user_session (user_id, session_id)
-- "şu oturumun mesajları" içindir. Liste sorgusu ise kullanıcının TÜM mesajlarını tarayıp
-- son mesaja göre sıralar → (user_id, created_at desc) gerekir. Onsuz her liste açılışı
-- kullanıcının bütün sohbet geçmişini sıralamak zorunda kalırdı.
create index if not exists idx_chat_user_zaman
  on public.chat_messages (user_id, created_at desc);

-- ── Oturum listesi ───────────────────────────────────────────────────────────
create or replace function public.sohbet_oturumlari(p_user_id uuid, p_limit int default 60)
returns table (
  session_id    text,
  baslik        text,
  mesaj_sayisi  int,
  ilk_mesaj_at  timestamptz,
  son_mesaj_at  timestamptz
)
language sql stable
as $$
  select
    m.session_id,
    -- Başlık = oturumun İLK kullanıcı mesajı. Asistan mesajı başlık olamaz: her sohbet
    -- "Merhaba, ben Koç!" diye başlar ve liste tek tip görünürdü.
    coalesce(
      (select left(c.content, 80)
         from public.chat_messages c
        where c.user_id = m.user_id
          and c.session_id = m.session_id
          and c.role = 'user'
        order by c.created_at asc
        limit 1),
      'Adsız sohbet'
    ) as baslik,
    count(*)::int          as mesaj_sayisi,
    min(m.created_at)      as ilk_mesaj_at,
    max(m.created_at)      as son_mesaj_at
  from public.chat_messages m
  where m.user_id = p_user_id
    and m.session_id is not null
    -- 'tool' satırları sohbet balonu değildir (chat.routes.ts ile aynı filtre);
    -- sayıma girerlerse öğrenci 4 mesajlık sohbeti "11 mesaj" görürdü.
    and m.role in ('user', 'assistant')
  group by m.user_id, m.session_id
  order by max(m.created_at) desc
  limit p_limit;
$$;

-- ⚠️ `authenticated` ROLÜNE VERİLMEZ — bilerek. Fonksiyon p_user_id'yi ARGÜMAN alır ve
-- kendi içinde kimlik doğrulamaz; tarayıcıya açılsaydı herkes başkasının sohbet
-- başlıklarını okuyabilirdi. Yalnız service_role (brain) çağırır ve p_user_id'yi
-- DAİMA doğrulanmış req.userId'den geçirir — 0005'teki weak_kazanimlar ile aynı çizgi.
grant execute on function public.sohbet_oturumlari(uuid, int) to service_role;

-- =============================================================================
-- DOĞRULAMA:
--   select * from public.sohbet_oturumlari('<uuid>'::uuid, 10);
--   select indexname from pg_indexes where tablename='chat_messages';  -- idx_chat_user_zaman görünmeli
--   explain analyze select * from public.sohbet_oturumlari('<uuid>'::uuid, 60);  -- index scan
-- =============================================================================
