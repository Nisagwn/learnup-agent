-- =============================================================================
-- 0011 — EKONOMİ ATOMİK HÂLE GETİRİLİYOR (coin · envanter · bahçe · görev ödülü)
--
-- SORUN: bu akışların hepsi TypeScript'te "oku → kontrol et → geri yaz" biçiminde yazılmış.
-- supabase-js çok-ifadeli transaction yapamaz, dolayısıyla araya başka bir istek girebiliyor.
-- İki sonuç doğuruyor, ikisi de gerçek:
--
--   1) KAYIP GÜNCELLEME (para basma). 100 coin'i olan öğrenci, 100 coin'lik ürüne AYNI ANDA
--      iki satın alma isteği yollar. İkisi de coins=100 okur, ikisi de "yeterli" der, ikisi de
--      coins=0 yazar, ikisi de envanteri +1 yapar → BİR ürünün parasına İKİ ürün. Aynısı görev
--      ödülünde (2× XP, çift tık yeter) ve tohum ekmede (1 tohumdan 2 bitki) geçerli.
--
--   2) KISMİ YAZIM. Coin ÖNCE düşülüp eşya SONRA ekleniyor. Arada süreç ölürse / envanter
--      yazımı hata verirse öğrencinin parası gider, eşyası gelmez. Telafi yazımı yok.
--      "Bitkiyi kaldır" akışında tersi: bitki silinir, eşya geri verilmez.
--
-- ÇÖZÜM: her akış TEK bir plpgsql fonksiyonuna iner. Fonksiyon gövdesi tek transaction'dır;
-- satır `for update` ile kilitlenir → eşzamanlı istek BEKLER, taze bakiyeyi okur. Yetersiz
-- bakiyede `raise exception` → transaction geri sarılır, KISMİ yazım imkânsız.
--
-- Fiyat/kind SUNUCUDAN gelir (routes'taki CATALOG); istemci yalnız item_id söyler.
-- =============================================================================
set search_path to public, extensions;

-- ── 1) SATIN ALMA — coin düş + envanter +1, tek transaction ─────────────────
create or replace function public.satin_al(
  p_user_id uuid,
  p_item_id text,
  p_kind    text,
  p_price   int
)
returns table (coins int, new_count int)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_coins int;
  v_gam   jsonb;
  v_count int;
begin
  -- Satırı KİLİTLE: eşzamanlı ikinci istek burada bekler, sonra TAZE bakiyeyi okur.
  select coalesce(gamification, '{}'::jsonb) into v_gam
    from public.profiles where id = p_user_id for update;
  if not found then raise exception 'profil yok: %', p_user_id using errcode = 'P0002'; end if;

  v_coins := coalesce((v_gam->>'coins')::int, 0);
  if v_coins < p_price then
    raise exception 'yetersiz_coin' using errcode = 'P0001';   -- transaction geri sarılır
  end if;

  v_coins := v_coins - p_price;
  update public.profiles
     set gamification = jsonb_set(v_gam, '{coins}', to_jsonb(v_coins))
   where id = p_user_id;

  insert into public.inventory (user_id, item_id, kind, count)
       values (p_user_id, p_item_id, p_kind, 1)
  on conflict (user_id, item_id)
       do update set count = public.inventory.count + 1   -- ATOMİK artış (oku-yaz değil)
    returning public.inventory.count into v_count;

  return query select v_coins, v_count;
end $$;

-- ── 2) TOHUM EK — envanter -1 + bahçeye satır, tek transaction ──────────────
create or replace function public.tohum_ek(
  p_user_id uuid,
  p_item_id text,
  p_x       numeric,
  p_y       numeric
)
returns table (plant_id uuid, remaining int)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_count int;
  v_id    uuid;
begin
  select count into v_count
    from public.inventory
   where user_id = p_user_id and item_id = p_item_id
     for update;                                    -- kilit → çift ekim imkânsız
  if not found or coalesce(v_count, 0) < 1 then
    raise exception 'tohum_yok' using errcode = 'P0001';
  end if;

  update public.inventory set count = count - 1
   where user_id = p_user_id and item_id = p_item_id
   returning count into v_count;

  insert into public.garden (user_id, item_id, x, y)
       values (p_user_id, p_item_id, p_x, p_y)
    returning id into v_id;                         -- insert patlarsa -1 de geri sarılır

  return query select v_id, v_count;
end $$;

-- ── 3) BİTKİ KALDIR — bahçeden sil + envanter +1, tek transaction ───────────
create or replace function public.bitki_kaldir(
  p_user_id  uuid,
  p_plant_id uuid
)
returns table (item_id text, new_count int)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_item  text;
  v_count int;
begin
  delete from public.garden
   where id = p_plant_id and user_id = p_user_id   -- SAHİPLİK: başkasının bitkisi silinemez
   returning garden.item_id into v_item;
  if v_item is null then
    raise exception 'bitki_yok' using errcode = 'P0002';
  end if;

  insert into public.inventory (user_id, item_id, kind, count)
       values (p_user_id, v_item, 'seed', 1)
  on conflict (user_id, item_id)
       do update set count = public.inventory.count + 1
    returning public.inventory.count into v_count;  -- iade patlarsa SİLME de geri sarılır

  return query select v_item, v_count;
end $$;

-- ── 4) GÖREV ÖDÜLÜ — "claimed" kapısı ile XP, tek transaction ───────────────
--     Eskiden: oku → claimed mi? → xp += ödül → yaz. ÇİFT TIK = 2× XP, ve şişen weeklyXP
--     league_entries'e de yazıldığı için lider tablosu bozuluyordu.
--     Ödül miktarı İSTEMCİDEN DEĞİL, profilin kendi blob'undaki quest kaydından okunur.
--     Şema: gamification.dailyQuests.quests = [{id, progress, target, rewardXP, claimed}, …]
create or replace function public.gorev_odulu_al(
  p_user_id  uuid,
  p_quest_id text
)
returns table (xp int, weekly_xp int, reward_xp int, already_claimed boolean)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_gam    jsonb;
  v_quests jsonb;
  v_idx    int;
  v_quest  jsonb;
  v_reward int;
  v_xp     int;
  v_weekly int;
begin
  select coalesce(gamification, '{}'::jsonb) into v_gam
    from public.profiles where id = p_user_id for update;   -- kilit: 2. istek burada bekler
  if not found then raise exception 'profil_yok' using errcode = 'P0002'; end if;

  v_quests := coalesce(v_gam#>'{dailyQuests,quests}', '[]'::jsonb);

  -- Görevi dizide bul (id ile)
  select i, e into v_idx, v_quest
    from jsonb_array_elements(v_quests) with ordinality as t(e, i)
   where e->>'id' = p_quest_id
   limit 1;
  if v_quest is null then raise exception 'gorev_yok' using errcode = 'P0002'; end if;

  -- ZATEN ALINMIŞSA hiçbir şey yazma (idempotent) → çift tık ödül basamaz.
  if coalesce((v_quest->>'claimed')::boolean, false) then
    return query select coalesce((v_gam->>'xp')::int, 0),
                        coalesce((v_gam#>>'{league,weeklyXP}')::int, 0),
                        0, true;
    return;
  end if;

  if coalesce((v_quest->>'progress')::int, 0) < coalesce((v_quest->>'target')::int, 0) then
    raise exception 'gorev_tamamlanmadi' using errcode = 'P0001';
  end if;

  v_reward := coalesce((v_quest->>'rewardXP')::int, 0);   -- ← SUNUCU durumundan, istemciden DEĞİL
  v_xp     := coalesce((v_gam->>'xp')::int, 0) + v_reward;
  v_weekly := coalesce((v_gam#>>'{league,weeklyXP}')::int, 0) + v_reward;

  v_gam := jsonb_set(v_gam, array['dailyQuests','quests', (v_idx - 1)::text, 'claimed'], 'true'::jsonb, true);
  v_gam := jsonb_set(v_gam, '{xp}', to_jsonb(v_xp), true);
  v_gam := jsonb_set(v_gam, '{league,weeklyXP}', to_jsonb(v_weekly), true);

  update public.profiles set gamification = v_gam where id = p_user_id;
  return query select v_xp, v_weekly, v_reward, false;
end $$;

-- Bu RPC'ler service-role (backend) tarafından çağrılır; istemciye AÇILMAZ.
revoke execute on function public.satin_al(uuid, text, text, int)        from public, anon, authenticated;
revoke execute on function public.tohum_ek(uuid, text, numeric, numeric) from public, anon, authenticated;
revoke execute on function public.bitki_kaldir(uuid, uuid)               from public, anon, authenticated;
revoke execute on function public.gorev_odulu_al(uuid, text)             from public, anon, authenticated;
grant  execute on function public.satin_al(uuid, text, text, int)        to service_role;
grant  execute on function public.tohum_ek(uuid, text, numeric, numeric) to service_role;
grant  execute on function public.bitki_kaldir(uuid, uuid)               to service_role;
grant  execute on function public.gorev_odulu_al(uuid, text)             to service_role;

-- DOĞRULAMA (eşzamanlılık): iki oturumda aynı anda
--   select * from satin_al('<uid>', 'tohum_gul', 'seed', 100);
-- İkincisi ya bekler ve 'yetersiz_coin' der ya da doğru bakiyeyi görür. ASLA ikisi de geçmez.
