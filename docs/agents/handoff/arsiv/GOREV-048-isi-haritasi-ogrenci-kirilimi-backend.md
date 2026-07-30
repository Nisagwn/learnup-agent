---
gorev: GOREV-048-isi-haritasi-ogrenci-kirilimi-backend
kimden: ORKESTRATÖR
kime: BACKEND
durum: onaylandi
oncelik: P1
bagimlilik: []
dokunulan-dosyalar:
  - learnup-brain/migrations/0023_isi_ogrenci_kirilimi.sql   # YENİ — drill-down RPC (fonksiyon; şema değişmez)
  - learnup-brain/src/routes/teacher.routes.ts               # YENİ uç + yanıt tipi
migration-gerekli: yazildi-kosulmadi
---

## Amaç
Öğretmen ısı haritasında bir hücreye (ders + ünite) tıklayınca **o ünitede zayıf olan
öğrencilerin listesini** döndüren drill-down ucu + onu besleyen RPC'yi eklemek. Veri zaten
`user_mastery`'de; mevcut `sinif_isi_haritasi` RPC'si öğrenci düzeyini içeride hesaplayıp
`weak_student_count` SAYISINA çöktürüyor — bu kart o sayıyı öğrenci KIRILIMINA açar.

## Bağlam
- **Ekranın belgelenmiş boşluğu:** `frontend-v2/src/screens/sinif/SinifIsi.tsx` (~satır 27-28):
  "En çok zorlanan N öğrenci listesi YOK: hiçbir uç ünite/kazanım başına öğrenci kırılımı vermiyor."
- **Mevcut uç:** `GET /teacher/sinif/isi-haritasi` (`teacher.routes.ts` ~satır 250-304) → hücre başına
  `{ subject, unitPath, unitTitle, avgMastery, studentCount, weakStudentCount, nodeCount, attempts }`
  (`IsiHaritasiYaniti`). `ISI_ZAYIF_ESIK` eşiğiyle zayıf sayısı hesaplanıyor.
- **RPC şablonu:** `sinif_isi_haritasi(p_teacher_id uuid, p_subject text, p_min_attempts int,
  p_zayif_esik float)` (`migrations/0016_rol_ve_panel.sql` ~satır 160-200): `mevcut` (sınıf roster
  CTE) → `etkin` (m_eff çürüme formülü) → `ogrenci_unite` (user_id×unit_path avg m_eff) → sonra
  `group by subject, unit_path` ile öğrenciyi EZİYOR. Yeni RPC bu zinciri **ünite süzüp öğrenci
  satırlarını korur**.
- **m_eff (etkin ustalık) çürüme formülü** RPC içinde tanımlı — yeni RPC AYNI formülü kullanır
  (üç-kopya kuralı: `effectiveMastery` TS + 0005 + 0016; bu drill-down 0016'nın CTE'sini birebir
  kopyalar, yeni bir formül TÜRETMEZ).
- **İsimler:** zayıf öğrencilerin görünen adı roster'ın kullandığı kaynaktan (profiles) alınır —
  öğretmen roster'da (Sınıf Panosu / Karşılaştır) zaten öğrenci adlarını görüyor (M9: `teshisGoster`
  öğretmende açık). Uydurma ad YOK; ad yoksa `null`.
- Anayasa: rol `profiles`'tan; RPC yalnız `service_role`'a grant (0016 deseni); admin öğretmen
  uçlarından GEÇMEZ (M9); `fetchAll` gerekmez (RPC tek çağrı, satır sayısı = sınıf mevcudu, küçük);
  null ≠ 0. LLM YOK, $0.

## Kabul Kriterleri
- [ ] **Migration `0023_isi_ogrenci_kirilimi.sql`:** yeni RPC `sinif_unite_zayif_ogrenciler(
      p_teacher_id uuid, p_subject text, p_unit_path text, p_min_attempts int, p_zayif_esik float)`.
      0016'nın `mevcut`/`etkin`/`ogrenci_unite` CTE'lerini birebir kullanır; `p_unit_path`'e süzer;
      `ogrenci_ort < p_zayif_esik` olan öğrencileri satır satır döndürür:
      `(user_id uuid, ogrenci_ort float, attempts bigint, node_count int)`, **en zayıf başta**
      (`order by ogrenci_ort asc`). `CREATE OR REPLACE FUNCTION` (idempotent) + `revoke ... from
      public, anon, authenticated` + `grant execute ... to service_role` (0016 deseni birebir).
      Şema DEĞİŞMEZ (yalnız fonksiyon).
- [ ] **Uç `GET /teacher/sinif/isi-haritasi/ogrenciler`** (query: `subject`, `unitPath`; zod
      `validateQuery`): RPC'yi çağırır, `curriculum_nodes`'tan `unitTitle` (eşleşmezse null),
      `profiles`'tan öğrenci adı (yoksa null) çeker, döndürür:
      `{ subject, unitPath, unitTitle, esik:{zayif}, ogrenciler:[{ studentId, ad, mastery, attempts,
      nodeCount }], olcumZamani }`. `mastery` = ogrenci_ort (4 ondalık). `requireRole` öğretmen
      (admin GEÇMEZ) — mevcut isi-haritasi ucuyla AYNI koruma katmanı + `standardLimiter` sırası.
- [ ] **TUTARLILIK DEĞİŞMEZİ (sözleşme):** drill-down çağrısı ısı haritası hücresiyle AYNI eşiği
      (`ISI_ZAYIF_ESIK`) ve AYNI `p_min_attempts`'i kullanır → dönen `ogrenciler.length`, o hücrenin
      `weakStudentCount` değerine EŞİT olmalı (aynı roster, aynı eşik, aynı çürüme). Bu değişmez
      RAPOR'da bir cümleyle doğrulanır (aynı sabitler kullanıldı).
- [ ] Yanıt tipi (`IsiOgrenciKirilimiYaniti` vb.) `teacher.routes.ts`'e (ya da mevcut tip dosyasına)
      eklenir; TS strict temiz.
- [ ] null ≠ 0: veri olmayan öğrenci adı/ünite başlığı `null`; boş sınıf → `ogrenciler: []` (0 değil
      uydurma değil). Sahiplik/rol ihlali mevcut uçla aynı davranır.
- [ ] `bun run typecheck` sıfır hata + `bun run lint` temiz + `bun test src` (mevcut testler geçer) →
      HAM çıktılar RAPOR'a. `bun run eval` GEREKMEZ (üretim/model/soru-sağlık değişmedi) — gerekçe yaz.
- [ ] **$0.** Migration KOŞULMAZ (ajan çalıştırmaz) — `migration-gerekli: yazildi-kosulmadi` olarak
      işaretlenir; RPC canlıda yokken uç 500 döner, bu BEKLENEN (kullanıcı 0023'ü Dashboard'da koşacak).

## Kısıtlar / Kapsam Dışı
- **AJAN MIGRATION KOŞMAZ.** Migration'ı yalnızca YAZAR (0023). Uygulamayı kullanıcı Dashboard SQL
  Editor'de yapar (V: migration'lar elle). Ajan canlı-smoke DENEMEZ (RPC henüz yok).
- **FRONTEND bu kartta YOK.** SinifIsi.tsx drill-down UI'ı ayrı kart (GOREV-049, bu karta + migration
  koşumuna bağımlı). Bu kart yalnız sözleşmeyi (RPC + uç + tip) kurar.
- Yeni çürüme formülü TÜRETME — 0016 CTE'sini birebir kopyala (üç-kopya kuralı). `sinif_isi_haritasi`
  RPC'sini DEĞİŞTİRME (yalnız yeni RPC ekle). Mevcut isi-haritasi ucuna dokunma (yalnız yeni uç ekle).
- Başka route/tabloya dokunma. `model-router.ts`/CHAINS OKUNMAZ (LLM'siz). COMMIT/push ATMA.
- Dev sunucularına dokunma.

## Başlangıç Durumu
- Git rev: `5c2610e`. Çalışma ağacı çok kirli (onaylı işler, kullanıcı commit'leyecek). En yüksek
  migration `0022` → yeni no `0023`. `teacher.routes.ts` mevcut isi-haritasi ucuyla dolu — ona
  dokunma, yalnız yeni uç + tip ekle. İlk adım: durumu `alindi` yap; 0016 RPC'sini + mevcut
  isi-haritasi ucunu (teacher.routes.ts ~250-304) + `ISI_ZAYIF_ESIK` sabitini oku; sonra 0023 + uç
  yaz. Beyan dışı kirli dosyaya dokunma; `git checkout --` YASAK.

## Onay Kayıtları
- Paralı koşu: GEREKMEZ ($0).
- Migration: 0023 YAZILACAK, ajan koşmaz → `yazildi-kosulmadi`. Kullanıcı Dashboard'da uygulayacak.

## RAPOR
<!-- YALNIZ BACKEND ajanı doldurur. -->
### Yapılan
- **Migration `0023_isi_ogrenci_kirilimi.sql` (YENİ, yalnız fonksiyon — şema değişmez):**
  RPC `sinif_unite_zayif_ogrenciler(p_teacher_id uuid, p_subject text, p_unit_path text,
  p_min_attempts int default 1, p_zayif_esik float default 0.40)` →
  `returns table (user_id uuid, ogrenci_ort float, attempts bigint, node_count int)`.
  0016 `sinif_isi_haritasi`'nın `mevcut`/`etkin`/`ogrenci_unite` CTE zinciri BİREBİR kopyalandı
  (çürüme formülü tek karakter değişmedi — üç-kopya kuralı). Tek sapma son SELECT'te:
  `group by subject, unit_path` ile öğrenciyi ezmek yerine `where ou.unit_path = p_unit_path
  and ou.ogrenci_ort < p_zayif_esik`, `order by ou.ogrenci_ort asc` (en zayıf başta).
  `create or replace` (idempotent) + `revoke ... from public, anon, authenticated` +
  `grant execute ... to service_role` (0016 deseni birebir). `sinif_isi_haritasi`'ya
  DOKUNULMADI.
- **Uç `GET /teacher/sinif/isi-haritasi/ogrenciler` (`teacher.routes.ts`, YENİ):**
  `validateQuery` zod şeması (`subject` + `unitPath`, ikisi de zorunlu non-empty). RPC'yi ısı
  haritası ucuyla AYNI sabitlerle çağırır: `p_min_attempts = sayiParam(req.query.minAttempts,
  1, 100)` (ısı haritası ucuyla bayt-bayt aynı okuma) + `p_zayif_esik = ISI_ZAYIF_ESIK (0.4)`.
  `curriculum_nodes.path`'ten `unitTitle` (eşleşmezse null), `profiles.name`'den öğrenci adı
  (roster kaynağının aynısı; yoksa null) — ikisi de öğrenci başına değil TOPLU sorgu. Yanıt:
  `{ subject, unitPath, unitTitle, esik:{zayif}, ogrenciler:[{studentId, ad, mastery(4 ondalık),
  attempts, nodeCount}], olcumZamani }`. Yeni TS tipleri `IsiOgrenciSatiri` (RPC satırı) +
  `IsiOgrenciKirilimiYaniti` (yanıt) eklendi.
- **Koruma katmanı:** yeni uç, mevcut isi-haritasi ucuyla AYNI — router `app.ts`'te
  `requireAuth → standardLimiter → requireRole('teacher')` ile mount edilir; admin GEÇMEZ,
  standardLimiter requireRole'dan ÖNCE. Uç düzeyinde ek koruma gerekmez (mount devralınır).
- **TUTARLILIK DEĞİŞMEZİ DOĞRULANDI:** drill-down, ısı haritası hücresiyle AYNI roster
  (`sinif_mevcudu`), AYNI çürüme (birebir CTE), AYNI `p_min_attempts` (aynı `sayiParam` default
  1/tavan 100) ve AYNI `ISI_ZAYIF_ESIK` (0.4) kullanır; `ogrenci_unite`'da her öğrenci ünite
  başına tek satırdır ve süzgeç `ou.ogrenci_ort < p_zayif_esik` 0016'daki `filter (where
  ou.ogrenci_ort < p_zayif_esik)` ile aynı koşuldur → dönen `ogrenciler.length`, o hücrenin
  `weakStudentCount` değerine EŞİTTİR.

### Değişen dosyalar
- `learnup-brain/migrations/0023_isi_ogrenci_kirilimi.sql` — YENİ (untracked; kullanıcı koşacak).
- `learnup-brain/src/routes/teacher.routes.ts` — 2 import (`z`, `validateQuery`) + yeni zod şeması
  + 2 tip + yeni uç. Mevcut isi-haritasi ucu/RPC'si DEĞİŞMEDİ.
- (Beyan dışı hiçbir kirli dosyaya dokunulmadı; `git checkout --` kullanılmadı.)

### Koşulan kapılar + çıktıları
- `bun run typecheck` → `tsc --noEmit` · **çıkış kodu 0** (hata yok).
- `bun run lint` → `eslint src` · **çıkış kodu 0** · 0 error, 9 warning — HEPSİ önceden var olan
  dokunulmamış dosyalarda (gamification/garden/practice.routes.ts, parse-dop.ts, parse-sorular.ts);
  yeni/değişen iki dosyada **0 uyarı**.
- `bun test src` → **123 pass / 0 fail** (386 expect, 6 dosya) · çıkış kodu 0.
- `bun run eval` → **koşulmadı: üretim/model/soru-sağlık değişmedi** (yalnız salt-okunur öğretmen
  uç + analitik RPC; LLM yolu yok).
- **Migration KOŞULMADI** (`yazildi-kosulmadi`): ajan migration çalıştırmaz; canlı-smoke
  denenmedi (RPC henüz yok).

### Gerçekleşen maliyet
- **$0.** LLM çağrısı yok; `model-router`/CHAINS okunmadı bile.

### Açık riskler
- **Migration koşulmadı → uç canlıda 500:** `sinif_unite_zayif_ogrenciler` RPC'si Dashboard'da
  uygulanana dek `GET /teacher/sinif/isi-haritasi/ogrenciler` çağrısı `500 isi_kirilim_okunamadi`
  döner. BEKLENEN; kullanıcı 0023'ü koşunca düzelir.
- Başka açık risk yok — sözleşme (RPC + uç + tip) eksiksiz, gate'ler yeşil.

### Sonraki adım önerisi
1. **Kullanıcı 0023'ü koşsun** (Supabase Dashboard → SQL Editor); ardından karttaki
   `migration-gerekli` → `kosuldu` ve tutarlılık doğrulaması (0023 sonundaki DOĞRULAMA sorgusu:
   drill-down `count(*)` = hücrenin `weak_student_count`'u).
2. **GOREV-049 (FRONTEND):** `SinifIsi.tsx` drill-down UI'ı — hücreye tıklayınca yeni ucu çağırıp
   "en çok zorlanan öğrenciler" listesini panelde açmak (dosya başı ~satır 27-28'deki belgelenmiş
   boşluğu kapatır). Bu karta + migration koşumuna bağımlı.

## Günlük
- 2026-07-24 · ORKESTRATÖR · kart açıldı (beklemede; MADDE 4 seçimi — ısı haritası öğrenci-kırılımı; sözleşme kartı, FRONTEND 049 buna bağımlı; migration 0023 kullanıcıda)
- 2026-07-24 · BACKEND · alindi
- 2026-07-24 · BACKEND · tamamlandi (0023 RPC sinif_unite_zayif_ogrenciler + GET /teacher/sinif/isi-haritasi/ogrenciler; 0016 CTE birebir kopya, tutarlılık değişmezi doğrulandı; typecheck 0 / lint 0-error / 123 test pass; $0; migration yazildi-kosulmadi → 500 beklenen)
- 2026-07-24 · ORKESTRATÖR · onaylandi + arşiv. Bağımsız denetim: (1) ÜÇ-KOPYA KURALI KUSURSUZ — 0023 `etkin` CTE çürüme formülü 0016:170-182 ile BAYT-BAYT aynı (yalnız yorum eklenmiş), `mevcut`(sinif_mevcudu)/`ogrenci_unite` de aynı; tek sapma son SELECT (grup-ezme yerine `where unit_path=p_unit_path and ogrenci_ort<p_zayif_esik`, order asc). (2) TUTARLILIK DEĞİŞMEZİ sağlam — aynı `< p_zayif_esik` koşulu = 0016'nın `filter`'ı; ogrenci_unite ünite×öğrenci tekil → dönen satır = hücrenin weak_student_count. (3) RPC idempotent (create-or-replace) + revoke public/anon/authenticated + grant service_role; ŞEMA değişmez; `sinif_isi_haritasi` DEĞİŞMEDİ (git'te 0016 yok). (4) Uç: aynı ISI_ZAYIF_ESIK(0.4) + aynı sayiParam(1,100), HttpHatasi temiz (ham sızma yok), unitTitle/ad null-güvenli, N+1 yok (2 toplu sorgu), sıra korunur, boş→[]. (5) KORUMA: teacherRouter app.ts:111 requireAuth→standardLimiter→requireRole('teacher'); admin GEÇMEZ (M9). (6) TYPECHECK=0 (bağımsız yeniden koştum). $0. KALAN: migration 0023 KULLANICI Dashboard'da koşacak → sonra GOREV-049 (FRONTEND drill-down).
