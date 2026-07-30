---
gorev: GOREV-027-ogretmen-basvuru-akisi-backend
kimden: ORKESTRATÖR
kime: BACKEND
durum: onaylandi
oncelik: P1
bagimlilik: []   # BAŞLATILABİLİR — ancak aynı ajan GOREV-016'yı (P0) ÖNCE bitirmeli
dokunulan-dosyalar:
  - learnup-brain/src/routes/ogretmen-basvuru.routes.ts   # YENİ — başvuru ucu (GET+POST)
  - learnup-brain/src/routes/ogretmen-basvuru.test.ts     # YENİ — davranış + güvenlik testi
  - learnup-brain/src/routes/admin.routes.ts              # /kullanicilar: basvuruDurumu + bekleyenBasvuru + filtre
  - learnup-brain/src/routes/admin-yonetim.routes.ts      # detay basvuru + rol ucu başvuru kapatma
  - learnup-brain/src/types/panel.ts                      # AdminKullaniciSatiri/Detayi/Yaniti alanları
  - learnup-brain/src/app.ts                              # yalnız import + mount bloğu (016 kirli işine dokunulmadı)
  - learnup-brain/migrations/0021_ogretmen_basvuru.sql    # YENİ — kolonlar + handle_new_user sertleştirme
migration-gerekli: yazildi-kosulmadi   # 0021 yazıldı, KOŞULMADI (kullanıcı elle koşar); canlı DB'de kolon yok (kanıt RAPOR'da)
---

## Amaç
**Kullanıcı kararı (2026-07-23):** öğretmenler self-servis BAŞVURUYLA gelir — kayıt yine öğrenci
olarak açılır, başvuru kaydı düşer, **rol YALNIZ yönetici onayıyla öğretmene döner**. Bu kart
sunucu ayağıdır (UI: GOREV-028).

## Bağlam
- Güvenlik çerçevesi DEĞİŞMEZ: rol `profiles`'tan okunur (M§9); istemci `profiles.role`
  YAZAMAZ (0019 kolon-GRANT — kanıtlanmış ayrıcalık yükseltme açığı geri açılmaz). Başvuru
  mekanizması rolü DEĞİL, yalnız "başvuru bekliyor" durumunu yazar.
- Yönetici tarafında rol değiştirme + öğretmen onayı BUGÜN VAR — başvuru, bu mevcut akışa
  girdi üretir (admin kullanıcı listesinde görünür olur).
- Kayıt-zamanlı niyet ("öğretmen olarak başvur" kutusu) sunucuya NASIL taşınır — mekanizma senin
  kararın (metadata'dan güvenli işleme YA DA ilk oturumda kimlikli başvuru çağrısı); tek kural:
  **rol istemciden asla yazılmaz/türetilmez.**

## Kabul Kriterleri
- [x] **Envanter RAPOR'a:** mevcut rol/onay mekanizması (profiles kolonları, admin rol-değiştirme
      ucu, öğretmen onay alanı) + başvuru durumu için şema kararı (kolon varsa migration İPTAL →
      bayrak "hayir"a çekilir)
- [x] **Başvuru ucu:** kimlikli kullanıcı YALNIZ kendi hesabı için başvurur; tekrarlı başvuru
      idempotent (nazik Türkçe mesaj); `standardLimiter` altında; zod validate; başvuru sonrası
      rol hâlâ `student` (kanıt) — *kanıt: route testi (YAMA'da role/is_approved YOK) + 0019 canlı*
- [x] **0019 regresyon kanıtı:** istemci rolüyle `profiles.role` güncelleme girişimi reddediliyor
      (test çıktısı RAPOR'a — qa.md güvenlik listesiyle aynı senaryo) — *canlı 42501, HAM çıktı RAPOR'da*
- [x] **Onay akışı:** yönetici onayı başvuru durumunu kapatır + rolü öğretmene çevirir +
      `yonetim_denetim` kaydı düşer + önbellek düşürme (`kimligiUnut`) çalışır (M§11-12)
      — *mevcut `POST /admin/kullanici/:id/rol` ucuna entegre; kod yolları RAPOR'da*
- [x] **Liste verisi:** admin kullanıcı listesi yanıtında "başvuru bekliyor" durumu görünür
      (GOREV-028 rozeti bunu okuyacak) — *`basvuruDurumu` satırda + `bekleyenBasvuru` sayacı + `?basvuru=` filtresi*
- [x] Hata `message` tam Türkçe cümle + sabit `code` (V§3.3); route çift mount düzenine uyum
- [x] Migration yazıldıysa: idempotent + elle koşulacak (Dashboard) → `migration-gerekli` bayrağı
      `yazildi-kosulmadi`ya güncellenir; numara = migrations dizinindeki en büyük + 1 → **0021**
- [x] `bun run typecheck` + `lint` + `bun test src` sıfır hata; `bun run eval` bayraksız ($0) →
      çıktılar RAPOR'da

## Kısıtlar / Kapsam Dışı
- E-posta doğrulama / dış bildirim YOK (GELECEK). UI işi GOREV-028'in.
- Mevcut öğretmenlerin hesapları etkilenmez; admin'in doğrudan rol atama yolu KALIR (başvurusuz).
- model-router/CHAINS bölgesine dokunulmaz.

## Başlangıç Durumu
- Git rev: `5c2610e`; kirli ağaç ~58 kayıt (onaylı işler — kullanıcı commit'i bekleniyor).
  İlk adım: `git diff --stat` fotoğrafı RAPOR'a.

## Onay Kayıtları
- Paralı koşu: GEREKMEZ ($0).

## RAPOR

### Envanter (başlangıç durumu)
- **Rol kaynağı:** yalnız `profiles.role` (0016 CHECK: student|teacher|admin); `lib/yetki.ts:kimlikAl`
  önbellekli okur, JWT'den ASLA. `requireRole('teacher')` ayrıca `is_approved` şart koşar.
- **Rol yazma yolları (bugün):** yalnız `POST /admin/kullanici/:id/rol` (admin) ve
  `POST /admin/ogretmen/:id/onay` (is_approved). İkisi de `admin-yonetim`/`admin` altında,
  `requireRole('admin')` arkasında, `denetimYaz` + `kimligiUnut` ile.
- **Güvenlik çizgisi:** 0019 blanket UPDATE'i geri aldı, `authenticated`'a yalnız beyaz-liste
  kolonlarında GRANT verdi. `role · is_approved · teacher_id · class_code · …` = yalnız service_role.
- **Kayıt kapısı (açık nokta):** 0016'nın `handle_new_user()`'ı `raw_user_meta_data->>'role'`
  değerine `'teacher'` için HÂLÂ izin veriyordu → istemci onaysız da olsa teacher-rol hesap
  açabiliyordu. Yeni karar bunu kapatmayı gerektiriyor.
- **Başvuru durumu için kolon YOK** → migration gerekli (bayrak `evet-yazilacak` doğrulandı,
  `hayir`a çekilmedi). Şema kararı: ayrı tablo yerine `profiles`'a 3 kolon (mimari "ayrı tablo
  yok, 1:1 ise profiles'a denormalize et" çizgisiyle tutarlı — M§9 sınıf modeli gerekçesi).

### Yapılan
1. **Migration `0021_ogretmen_basvuru.sql` (idempotent, KOŞULMADI):**
   - `handle_new_user()` SERTLEŞTİRME: kayıtta rol artık her zaman `'student'` — meta rol iddiası
     tümden yok sayılır (kayıtta class_code da üretilmez; öğretmen yok). Dilek≠sözleşme (V§3.1).
   - `profiles`'a 3 kolon: `teacher_application_status` (check: bekliyor|onaylandi|reddedildi|null),
     `teacher_application_at`, `teacher_application_note`. **GRANT VERİLMEDİ** → istemci yazamaz
     (0019 çizgisi kolon-bazlı korunur).
   - Bekleyen başvuru için kısmi indeks.
2. **Yeni uç `POST/GET /ogretmen-basvuru`** (`ogretmen-basvuru.routes.ts`): kimlikli kullanıcı
   YALNIZ kendi hesabı için başvurur (hedef = `req.userId`, gövdeden değil); zod validate (`not` ≤500);
   `standardLimiter` altında çift-mount (`/api` + `/api/v1`); rol `profiles`'tan okunur; öğretmen/
   yönetici reddedilir; tekrar başvuru idempotent (yazım yok, `yeni:false`). **YAMA yalnız
   `teacher_application_status/at/note` yazar — role/is_approved İÇERMEZ.**
   - **Mekanizma kararı:** kayıt-anı meta bayrağı yerine kimlikli çağrı seçildi (test edilebilir +
     mevcut öğrencileri de kapsar + istemci-metadata'ya bağlı değil). Gerekçe dosya başında.
3. **Onay akışı = mevcut `POST /admin/kullanici/:id/rol`'e entegre:** `→teacher` terfisi başvuruyu
   `'onaylandi'`ya çeker (kapatır); başka role geçiş `null`'lar. `rol_degis` denetim detayına
   `basvuruKapatildi` eklendi. Zaten var olan `denetimYaz` + `kimligiUnut` + sınıf boşaltma korunur.
4. **Admin liste/detay:** `/kullanicilar` yanıtına `basvuruDurumu` (satır) + `bekleyenBasvuru`
   (sayaç) + `?basvuru=bekliyor` filtresi; `/kullanici/:id` detayına `basvuru {durum,tarih,not}`.
   Tip sözleşmeleri `types/panel.ts`'te güncellendi.

### Değişen dosyalar (`git diff --stat`, yalnız kendi işim)
```
 learnup-brain/src/app.ts                         | 24 +++++-- (bu diff'in ÇOĞU GOREV-016'nın kirli işi;
                                                              benim eklediğim = 1 import + 1 mount bloğu)
 learnup-brain/src/routes/admin-yonetim.routes.ts | 23 ++++++--
 learnup-brain/src/routes/admin.routes.ts         | 27 +++++++----
 learnup-brain/src/types/panel.ts                 | 13 ++++++
 4 files changed, 74 insertions(+), 13 deletions(-)
YENİ (untracked):
 learnup-brain/migrations/0021_ogretmen_basvuru.sql
 learnup-brain/src/routes/ogretmen-basvuru.routes.ts
 learnup-brain/src/routes/ogretmen-basvuru.test.ts
```

### Koşulan kapılar + HAM çıktılar
- **`bun run typecheck`** → `$ tsc --noEmit` (çıktı yok = SIFIR hata). ✓
- **`bun run lint`** → `✖ 9 problems (0 errors, 9 warnings)` — 9 uyarının HEPSİ dokunmadığım
  dosyalarda (gamification/garden/practice.routes, parse-dop, parse-sorular); yeni dosyalarımda 0. ✓
- **`bun test src`** → `115 pass · 0 fail · 362 expect() calls · 6 files`. Yeni 5 test dahil
  (`öğrenci başvurur → YAMA role/is_approved İÇERMEZ`, idempotent, teacher 400, admin 400, zod 400). ✓
- **`bun run eval`** (bayraksız, $0) → `SONUÇ: YEŞİL — altın set geçti, drift temiz.`
  (`✓ sızıntı 0.286→0.286 · kuşatma 0.000 · NN kopya 0 · hakem kapalı [kredisiz]`). ✓
- **0019 CANLI REGRESYON** (scratchpad script, geçici kullanıcı → escalation → temizlik; $0):
  ```
  3a) update({ role: "admin" })                 → {"code":"42501","msg":"permission denied for table profiles","data":null}
  3b) update({ is_approved: true })             → {"code":"42501","msg":"permission denied for table profiles"}
  3c) update({ teacher_application_status:… })  → {"code":"PGRST204","msg":"Could not find the 'teacher_application_status' column … in the schema cache"}
  3d) update({ name: "…" })  (whitelist)        → {"code":null, data:[{name:"Regresyon Yeni Ad"}]}   ← BAŞARILI (engel kolon-bazlı)
  4)  service_role kesin okuma                  → {"role":"student","is_approved":false,"name":"Regresyon Yeni Ad"}
  5)  temizlik: geçici kullanıcı silindi OK
  ```
  → Ayrıcalık yükseltme REDDEDİLDİ (42501); rol `student` kaldı; whitelist kolonu çalışıyor
  (blanket değil kolon-bazlı). **3c'deki PGRST204 aynı zamanda 0021'in canlıda KOŞULMADIĞINI
  bağımsız olarak kanıtlar** (bayrak `yazildi-kosulmadi` doğru).

### Gerçekleşen maliyet
- **$0.** Paralı LLM koşusu yapılmadı (eval bayraksız; hakem kapalı). 0019 kanıtı yalnız DB
  (auth create/delete + update denemeleri), LLM yok.

### Açık riskler / notlar
- **Migration KOŞULMADI (yazildi-kosulmadi):** `/ogretmen-basvuru` ucu canlıda çalışmadan ÖNCE
  kullanıcı `0021`'i Dashboard→SQL Editor'de koşmalı (kolonlar + `handle_new_user` güncellemesi).
  Koşulmadan uç çağrılırsa PGRST204 (kolon yok) döner. **ORTAK-ANAYASA §7 tension:** kural
  "yazildi-kosulmadi iken davranış doğrulaması yapılamaz → engellendi" diyor; ancak (a) her
  migration kartı bu durumda olur, (b) davranış birim testiyle + güvenlik çizgisi canlı kanıtla
  doğrulandı, (c) ORKESTRATÖR açıkça `tamamlandi` yönlendirdi → `tamamlandi`. Canlı uçtan-uca
  doğrulama migration koşulunca yapılabilir. Karar ORKESTRATÖR'de.
- **handle_new_user sertleştirmesi mevcut öğretmenleri ETKİLEMEZ** (yalnız YENİ kayıtları); admin'in
  doğrudan rol atama yolu (başvurusuz) KALIR — kart kısıtıyla uyumlu.
- Frontend Login.tsx zaten `role:'student'` gönderiyordu; 0021 bunu DB'de garanti altına aldı
  (istemci sahte `role:'teacher'` gönderse de artık student açılır).

### Sonraki adım önerisi (ORKESTRATÖR'e — bölge dışı, kart açılmalı)
- **GOREV-028 (FRONTEND):** kayıt ekranına "öğretmen olarak başvur" kutusu → başarılı signup +
  ilk oturumda `POST /ogretmen-basvuru` çağrısı; Ben/ayarlar ekranında başvuru durumu; admin
  Kullanıcılar ekranında `basvuruDurumu` rozeti + `bekleyenBasvuru` sayacı + `?basvuru=bekliyor`
  filtresi. Sözleşme: yanıt alanları `AdminKullaniciSatiri.basvuruDurumu`, `AdminKullanicilarYaniti.
  bekleyenBasvuru`, `AdminKullaniciDetayi.basvuru`, `GET/POST /ogretmen-basvuru`.
- **İsteğe bağlı (BACKEND):** yönetici "başvuru reddet" ucu (`teacher_application_status='reddedildi'`
  + denetim) — kolon/constraint hazır; bu kartın kapsamı dışıydı.

## Günlük
- 2026-07-23 · ORKESTRATÖR · kart açıldı (BAŞLATILABİLİR — kullanıcı kararı "Öğretmen başvuru akışı"; aynı ajan GOREV-016'yı [P0 telif] önce bitirmeli; dosya kesişimi 016 ile OLASI [routes/] → seri çalışılacak)
- 2026-07-23 · BACKEND · alindi
- 2026-07-23 · BACKEND · tamamlandi (0021 yazıldı-koşulmadı; başvuru ucu + admin entegrasyonu; typecheck/lint/test/eval YEŞİL; 0019 canlı regresyon 42501 kanıtı RAPOR'da; $0. NOT: canlı uçtan-uca doğrulama migration koşumuna bağlı — §7 tension RAPOR'da, karar ORKESTRATÖR'de)
- 2026-07-23 · ORKESTRATÖR · onaylandi + arşiv (ajan ~7.5s ölmüştü, transkriptten yeniden başlatıldı — envanter dışında iş kaydedilmemişti, sıfırdan uygulandı). GÜVENLİK DENETİMİ: başvuru ucu UPDATE'i yalnız teacher_application_status/at/note yazıyor — role/is_approved YOK (ogretmen-basvuru.routes.ts:92-99 bizzat okundu); `.eq('role','student')` yarış koruması; migration 0021 handle_new_user'ı 'student' sabitine çekip 0016 meta-'teacher' açığını kapatıyor (bizzat okundu); başvuru kolonları 0019 whitelist DIŞI → istemci yazamaz (yalnız service_role). 0019 CANLI regresyon: role→admin + is_approved→true = 42501 red, name whitelist geçti, rol student kaldı. Migration numarası 0021 = en büyük(0020)+1 ✓ idempotent, yazildi-kosulmadi (KULLANICI elle koşacak). Kapılar HAM: typecheck 0 · lint 0 · 115/115 test (5 yeni) · eval YEŞİL drift temiz; $0; yalnız beyanlı bölge (yeni ogretmen-basvuru.routes.ts+test, admin rol ucu entegrasyonu, migration). Açık nokta: canlı e2e 0021 koşulmasına bağlı (ORTAK-ANAYASA §7 tension dürüstçe not — kabul). GOREV-028 SERBEST (sözleşme alanları RAPOR'da).
