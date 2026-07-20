-- =============================================================================
-- 0020 — YÖNETİM DENETİM DEFTERİ
--
-- Ön koşul: 0016 (admin rolü), 0019 (kolon yetkisi). Idempotent.
--
-- ═══ NEDEN ═══
-- 0019'a kadar yöneticinin tek yetkisi öğretmen onayıydı ve onay geri alınabilir,
-- düşük etkili bir işti. Bu migration'la birlikte yönetici ROL DEĞİŞTİREBİLİYOR
-- ve ÖĞRENCİ TAŞIYABİLİYOR. İkisi de geri alınamaz sonuçları olan işler:
--   · rol değişimi bütün RBAC'ı yeniden çiziyor,
--   · sınıf ataması bir öğretmenin sınıf ortalamasını ve ısı haritasını değiştiriyor.
--
-- Denetim izi OLMADAN yetki vermek, yetkiyi kimin nasıl kullandığını kimsenin
-- bilemeyeceği bir sistem üretir. "Bu öğrenci neden benim sınıfımda değil?" ya da
-- "bu hesabı kim yönetici yaptı?" sorularının cevabı bu tabloda.
--
-- ═══ TASARIM ═══
-- · APPEND-ONLY: update/delete yetkisi service_role'a bile VERİLMEZ (aşağıdaki
--   tetikleyici engelliyor). Değiştirilebilir denetim defteri denetim değildir.
-- · `detay jsonb` eylem başına serbest şema — öncesi/sonrası değerler burada.
-- · Yazım BAŞARISIZ OLURSA eylem yine de tamamlanır, ama yanıtta `denetimYazildi:
--   false` döner (lib/denetim.ts). Sessizce iz bırakmamaktansa gürültülü olsun.
-- =============================================================================
set search_path to public, extensions;

create table if not exists public.yonetim_denetim (
  id         bigint generated always as identity primary key,
  admin_id   uuid not null,
  -- ogretmen_onay | rol_degis | sinif_ata | gorev_yeniden
  eylem      text not null,
  hedef_id   uuid,
  hedef_tur  text,                                  -- kullanici | gorev
  detay      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists yonetim_denetim_zaman on public.yonetim_denetim (created_at desc);
create index if not exists yonetim_denetim_admin on public.yonetim_denetim (admin_id, created_at desc);
create index if not exists yonetim_denetim_hedef on public.yonetim_denetim (hedef_id, created_at desc)
  where hedef_id is not null;

-- ── APPEND-ONLY zorlaması ────────────────────────────────────────────────────
-- Servis service_role anahtarı kullanıyor → RLS bypass eder. Tek gerçek koruma
-- tetikleyicidir; rol tabanlı bir kısıt burada hiçbir şey ifade etmez.
create or replace function public.yonetim_denetim_degismez()
returns trigger language plpgsql as $$
begin
  raise exception 'yonetim_denetim append-only: % engellendi', tg_op;
end;
$$;

drop trigger if exists yonetim_denetim_kilit on public.yonetim_denetim;
create trigger yonetim_denetim_kilit
  before update or delete on public.yonetim_denetim
  for each row execute function public.yonetim_denetim_degismez();

-- ⚠️ TRUNCATE AYRI BİR KAPIDIR. Satır düzeyi tetikleyici TRUNCATE'te ÇALIŞMAZ:
-- yukarıdaki kilit varken bile `truncate yonetim_denetim` bütün defteri siler.
-- İlk sürümde bu açıktı ve doğrulama sırasında fark edildi. Statement düzeyi
-- tetikleyici gerekiyor.
drop trigger if exists yonetim_denetim_truncate_kilit on public.yonetim_denetim;
create trigger yonetim_denetim_truncate_kilit
  before truncate on public.yonetim_denetim
  for each statement execute function public.yonetim_denetim_degismez();

-- ── Doğrulama artığı temizliği (idempotent) ──────────────────────────────────
-- Append-only kilidini SINAMAK için atılan `eylem='test'` satırları defterde
-- kalıcı olarak sıkışıyor. Kilidi tam da bu iş için kısa süreliğine indiriyoruz;
-- başka hiçbir yerde bu deyim KULLANILMAMALI.
alter table public.yonetim_denetim disable trigger yonetim_denetim_kilit;
delete from public.yonetim_denetim where eylem = 'test';
alter table public.yonetim_denetim enable trigger yonetim_denetim_kilit;

-- ── Erişim: YALNIZ service_role ──────────────────────────────────────────────
alter table public.yonetim_denetim enable row level security;
revoke all on public.yonetim_denetim from anon, authenticated;
-- RLS açık + politika YOK → authenticated hiçbir satır göremez. Yönetici defteri
-- /api/v1/admin/denetim üzerinden, requireRole('admin') kapısının ardından okur.

comment on table public.yonetim_denetim is
  'Yönetici eylem defteri (0020). APPEND-ONLY — tetikleyici update/delete engeller. '
  'rol_degis ve sinif_ata geri alınamaz sonuçlar üretir; iz olmadan yetki verilmez.';

-- =============================================================================
-- DOĞRULAMA:
--   -- 1) Append-only gerçekten kilitli mi?
--   --    (eylem='test' satırları bu migration'ın yeniden koşumunda temizlenir)
--   insert into public.yonetim_denetim (admin_id, eylem) values (gen_random_uuid(), 'test');
--   update public.yonetim_denetim set eylem='x' where eylem='test';  -- HATA vermeli
--   delete from public.yonetim_denetim where eylem='test';           -- HATA vermeli
--   truncate public.yonetim_denetim;                                 -- HATA vermeli
--
--   -- 2) Son yönetici eylemleri:
--   select created_at, eylem, hedef_id, detay from public.yonetim_denetim
--    order by created_at desc limit 20;
--
--   -- 3) Kaç yönetici var? (son_yonetici korumasının dayandığı sayı)
--   select count(*) from public.profiles where role = 'admin';
-- =============================================================================
