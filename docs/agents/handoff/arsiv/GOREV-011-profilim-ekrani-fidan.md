---
gorev: GOREV-011-profilim-ekrani-fidan
kimden: ORKESTRATÖR
kime: FRONTEND
durum: onaylandi
oncelik: P1
bagimlilik: [GOREV-006, GOREV-007]   # ikisi de ✅ — FİDAN deseni referansı (ui.tsx'e varyant İNMEDİ; inline desen)
dokunulan-dosyalar:
  - frontend-v2/src/screens/Ben.tsx
  - frontend-v2/src/components/SeriFidani.tsx   # YENİ — 5 kademeli seri görseli (TASARIM-DILI §5 imza öğesi)
migration-gerekli: hayir
---

## Amaç
Profilim ekranını **kullanıcı onaylı önizlemeyle** hizalamak:
`docs/design/onizleme/profilim.html` (2026-07-22 onayı — kaynak referans BUDUR).

## Bağlam
- Tasarım: TASARIM-DILI v1.2. İçerik: EKRAN-HARITASI §10.
- Veri kaynakları (hepsi MEVCUT — sayı uydurulmaz): kimlik/avatar → `profile` + `lib/avatars`
  (seçici diyalog mevcut akış); seviye → gamification `correctAnswers` + ESIK eşikleri (backend
  `levelFromCorrect` aynası — önizlemedeki "340 soru" TEMSİLÎ, gerçek hesap kullanılır); seri +
  günlük görevler + ödül alma → `/gamification/daily` + mevcut claim akışı; lig → `/gamification/league`;
  rozetler → `lib/rozetler` ROZETLER + `profile.unlocked_badges` (GOREV-004 düz adları); sınıf →
  `SinifKatilKarti` (tek nötr mesaj kuralı korunur); tema/ses → `lib/theme` / `lib/ses`;
  günlük hedef → `daily_goal` profil alanı (mevcut güncelleme akışı).
- **ORKESTRATÖR kararları — önizleme kapsamı dışındaki mevcut bölümler:**
  1. **Lig TABLOSU kalır** (tam sıralama başka ekranda yok): rozet galerisinin altında FİDAN cam
     kartı olarak, TASARIM-DILI desenleriyle sade uygulanır (önizlemede yer almadı — serbestlik
     bu kartla tanınır, sonuç RAPOR'a not düşülür).
  2. **Sekmeli istatistikler (`SubjectChart`) bu ekrandan ÇIKAR** — Analizler ekranı (GOREV-009)
     bu işin sahibi; yerine "Analizler'e git" köprü çipi.
  3. **`Fener` sahnesi (denizcilik) EMEKLİ** — kullanım kalkar, dosya silinmez (Login3D emsali).
  4. **Hesap işlemleri KORUNUR:** çıkış + KVKK hesap silme, Ayarlar kartı içinde (Dialog'lu).
  5. **Rol ayrımı korunur:** oyunlaştırma bölümleri yalnız öğrencide; öğretmen/yöneticide yalnız
     Hesap bölümü (mevcut davranış).

## Kabul Kriterleri
- [x] Görünüm iki temada da önizlemeyle eşleşir: hero (96px avatar + değiştir diyaloğu · ad ·
      lig/seri/toplam çipleri · **Seviye halkası** "Seviye N · Seviye N+1'e X soru", yüklenince
      dolum) · **Streak Fidanı kartı** (5 kademe Tohum→Ulu Ağaç; aktif kademe hafif salınım;
      "en uzun serin") · rozet galerisi (14; açık renkli, kilitli soluk + koşul metni; kelimeli)
      · günlük görevler (ilerleme çubukları; tamamlananda sayfanın **TEK birincil** "Ödülü al")
      · sınıf kartı · ayarlar — *(halka birimi "doğru" yazıldı, RAPOR notu 1)*
- [x] **Mock yasak / null≠0:** her görünen sayı yukarıdaki uçlardan veya profilden türer.
      **Dondurma hakkı** yalnız gamification yanıtında gerçek alan varsa gösterilir (yoksa rozet
      HİÇ render edilmez + RAPOR notu); **bildirim anahtarı** yalnız gerçek bir saklama alanı
      varsa (profil kolonu/localStorage) gösterilir — yoksa çıkarılır + RAPOR notu.
      *(ikisi de GERÇEK: `streak.freezesAvailable` + `profiles.notifications_enabled` — RAPOR notu 2)*
- [x] Ayarlar kartı: tema segmenti (varsayılan Gün Işığı) · ses anahtarı · günlük hedef sayacı
      (`daily_goal` mevcut akışla) · çıkış · KVKK hesap silme (Dialog)
- [x] Sınıftan ayrıl yıkıcı → Radix Dialog; kod katılım hatası tek nötr mesaj korunur
- [x] Kart giriş stagger'ı ≤0.3s; hover yükselmesi; `prefers-reduced-motion`'da HEPSİ statik
      (fidan salınımı ve ödül parıltısı dahil)
- [x] `SubjectChart` ve `Fener` kullanımdan kalktı; Lig tablosu FİDAN stilinde korundu
- [x] `tsc --noEmit` sıfır hata + `bun run build` yeşil → çıktılar RAPOR'da

## Kısıtlar / Kapsam Dışı
- `components/ui.tsx`, `cekirdek.tsx`, `fx.tsx` dokunulmaz — FİDAN görünümü 007 deseniyle ekran
  içinde inline kurulur (ortak varyant konsolidasyonu ayrı temizlik kartında; `cekirdek.tsx`
  GOREV-009 bölgesi).
- Rozet ikon seti bu kartta değişmez (çapa vb. → ayrı görsel kart, backlog'da).
- Yeni backend ucu istenmez; eksik veri → bölüm gizlenir + RAPOR notu.

## Başlangıç Durumu
- Git rev: `5c2610e` (branch `feat/yks-brain`); kirli ağaç ~57 kayıt — onaylı işler (kullanıcı
  commit'i hâlâ bekleniyor). `Ben.tsx` GOREV-002/004'ten kirli — yalnız bu kartın işi eklenir.
  İlk adım: `git diff --stat` fotoğrafı RAPOR'a.

## Onay Kayıtları
- Paralı koşu: GEREKMEZ ($0).

## RAPOR

### Yapılan
- `Ben.tsx` onaylı önizlemeye (`docs/design/onizleme/profilim.html`) göre sıfırdan kuruldu —
  GOREV-007 inline-FİDAN deseniyle (`pf-*` sınıfları, `--cam/--vurgu/--yaprak…` CSS
  değişkenleri; `ui.tsx`/`cekirdek.tsx`/`fx.tsx` DOKUNULMADI, yalnız import edildi).
- **Hero:** 96px avatar (✎ → mevcut Radix seçici diyalog, FİDAN stiline döndü) · ad ·
  lig/seri/toplam çipleri (yalnız veri varsa) · "Katıldı: <ay yıl>" (`profile.created_at`) ·
  **Seviye halkası** 110px, mount'ta 0.9s dolum, hareket-azalt'ta anında.
- **YENİ `SeriFidani.tsx`:** 5 kademe (Tohum 1 · Filiz 3 · Fidan 7 · Genç Ağaç 30 · Ulu Ağaç 100),
  önizlemedeki SVG'ler; aktif kademe nokta imli + salınım (yalnız
  `prefers-reduced-motion: no-preference`); `seriSonrakiKademe()` dışa açık (Bugün de kullanabilir).
- **Streak Fidanı kartı:** "Serin: X gün" · ❄ dondurma rozeti (hak>0 ise) · sonraki kademe ·
  "En uzun serin" (`streak.longest`) · durum rozeti (bugün tamamlandı ✓ / donduruldu ❄) ·
  eski DondurmaKarti'nın "Bugünü dondur" tüketim akışı bu karta taşındı (işlev kaybı yok).
- **Rozet galerisi:** 14 rozet, açık renkli + "açıldı", kilitli soluk + koşul metni (ikon seti değişmedi).
- **Lig tablosu** (ORKESTRATÖR kararı 1): rozet galerisinin altında FİDAN cam kartı; tier çipi +
  "sıran" satırı + top-N listesi ("(sen)" vurgusu adaçayı dolgu); boş durum dürüst metin.
- **Günlük görevler:** sunucu emoji'siyle satırlar, ilerleme çubukları; sayfanın TEK birincil
  eylemi = İLK talep edilebilir "Ödülü al" (parıltı animasyonu motion-safe); birden fazla görev
  tamamsa diğerleri outline (tek-birincil bütçesi).
- **Analizler köprüsü** (karar 2): SubjectChart/sekmeli istatistik ÇIKTI; yerine `/harita`'ya
  köprü kartı ("Analizler'e git →").
- **Sınıf kartı:** `/sinif` akışı Ben.tsx içinde FİDAN stiliyle yeniden kuruldu — **ayrılma artık
  Radix Dialog'lu** (kriter); katılım hatasında sunucunun tek nötr mesajı olduğu gibi.
  `SinifKatil.tsx` dosyasına dokunulmadı; kullanım Ben'den kalktı (Login3D emsali).
- **Ayarlar:** e-posta · tema segmenti (Gün Işığı/Gece Ormanı) · ses anahtarı · bildirim anahtarı ·
  günlük hedef sayacı (yalnız öğrenci; 5–100, adım 5) · çıkış · KVKK silme (Dialog, karar 4).
- **Rol ayrımı** (karar 5): öğretmen/yönetici yalnız hero (çipsiz/halkasız) + Ayarlar görür.
- **Fener + Sefer sahnesi (denizcilik) EMEKLİ** (karar 3): `Fener`/`VoyageStreak`/konfeti Ben.tsx
  İÇİ tanımlardı (ayrı dosya yoktu) — koddan kaldırıldı; `SubjectChart.tsx` dosyası silinmedi.

### Notlar (sapma/karar)
1. **Seviye halkası birimi:** kriter metni "Seviye N+1'e X soru" diyordu; eşikler
   `correctAnswers` üzerinden (backend `levelFromCorrect`) — "X soru çöz" yanıltıcı olurdu.
   Dürüst birim seçildi: **"Seviye N+1'e X doğru"**. Farklı istenirse tek satırlık değişiklik.
2. **Mock taraması:** dondurma hakkı GERÇEK (`gamification.streak.freezesAvailable` +
   `freezeUsedDates`, brain `lib/gamification.ts`); bildirim anahtarı GERÇEK
   (`profiles.notifications_enabled`, 0019 beyaz listesi, varsayılan true); günlük hedef GERÇEK
   (`profiles.daily_goal`, 0019 beyaz listesi). Üçü de render edildi — gizlenen bölüm yok.
   Önizlemedeki "28 öğrenci · Eylül'den beri üyesin" satırının verisi `/sinif` yanıtında YOK →
   render edilmedi (okul + sınıf kodu gösteriliyor).
3. **Günlük hedef çift yazım:** `profiles.daily_goal` + `localStorage['learnup.hedef']` birlikte
   güncellenir — Bugün ekranı (beyan dışı) hedefi localStorage'dan okuyor; iki yüzey tek değerde
   kalsın diye. Kalıcı tekilleştirme (Bugün'ün profile geçmesi) ayrı kart önerisi.

### Değişen dosyalar (`git diff --stat` + status)
```
 frontend-v2/src/screens/Ben.tsx | 1355 ++++++++++++++++++++-------------------
 1 file changed, 705 insertions(+), 650 deletions(-)
 M frontend-v2/src/screens/Ben.tsx
?? frontend-v2/src/components/SeriFidani.tsx
```
Başlangıç fotoğrafı (kart alınırken): `Ben.tsx | 28 +++---- (14+/14-)` — GOREV-002/004'ün onaylı
kirli izi; bu kartın işi üzerine yazıldı (tek dosyada birleşik diff, beyanla uyumlu).
Ağaçtaki diğer ~57 kirli kayıt önceki onaylı kartların — dokunulmadı.

### Koşulan kapılar (HAM çıktı)
```
$ cd frontend-v2 && ../learnup-brain/node_modules/.bin/tsc --noEmit -p tsconfig.json
TSC_EXIT=0        (çıktı boş — SIFIR hata)

$ bun run build
dist/assets/Ben-BMrIJ_DT.js                            37.52 kB │ gzip:  10.57 kB │ map:    82.26 kB
...
✓ built in 1.69s
(!) Some chunks are larger than 500 kB after minification. (önceden var — vendor-three vb.)
BUILD_EXIT=0
```

### Gerçekleşen maliyet
$0 — LLM koşusu yok.

### Açık riskler
- Tarayıcıda piksel/kontrast doğrulaması KOŞULMADI (dev sunucularına dokunma kuralı) —
  FİDAN anayasa §10 "ölçülerek doğrulanır" maddesi bu ekran için henüz ölçülmedi.
- Birden fazla görev aynı anda talep edilebilirse yalnız ilki birincil stil alır — bilinçli
  (tek-birincil bütçesi) ama kullanıcı "ikisi neden farklı" diyebilir.
- Ses/bildirim anahtarları 44×25px (önizlemeyle birebir) — ≥44px tık hedefi kuralını dikeyde
  karşılamıyor; önizleme onaylı olduğu için korundu.

### Sonraki adım önerisi
- Bugün ekranının günlük hedefi `profiles.daily_goal`'dan okuması (localStorage tekilleştirme) — FRONTEND temizlik kartı.
- `SinifKatil.tsx` artık kullanımsız (Login3D emsali raf) — ortak temizlik kartında kaldırılabilir.
- Rozet ikon setinin FİDAN'a uyarlanması (çapa → düz ikon) — backlog'daki görsel kart.
- `pf-*` inline deseni 3 ekranda tekrarlanıyor (Bugün/Profilim/…) — ortak varyant konsolidasyonu
  ayrı temizlik kartı (kartın kısıtındaki planla uyumlu).

## Günlük
- 2026-07-22 · ORKESTRATÖR · kart açıldı (beklemede; önizleme onayı alındı — "onaylıyorum"; 006 ✅ + 007 onayını bekler; Ben.tsx aktif kartlarla kesişmiyor, 007 sonrası 008/009 ile PARALEL çalışabilir)
- 2026-07-22 · ORKESTRATÖR · SERBEST: GOREV-007 onaylandı+arşivlendi; Başlangıç Durumu dolduruldu; inline-FİDAN düzeltme notu işlendi. Kart başlatılabilir (008/009/013 ile dosya kesişimi YOK — paralel).
- 2026-07-23 · FRONTEND · alindi
- 2026-07-23 · FRONTEND · tamamlandi (Ben.tsx yeniden kuruldu + SeriFidani.tsx eklendi; tsc 0 hata, build yeşil; oturum kesintisi sonrası kaldığı yerden sürdürüldü)
- 2026-07-23 · ORKESTRATÖR · onaylandi → arsiv/ (DENETİM: freezesAvailable backend'de BİZZAT doğrulandı [gamification.ts]; SubjectChart/Fener kullanım-dışı [grep]; SeriFidani.tsx yeni dosya beyanlı; diff beyanla uyumlu; kapı çıktıları ham. KABUL: "Seviye N+1'e X doğru" birimi [dürüstlük — kriterin "soru" kelimesinden sapma isabetli], toggle 44×25 önizleme-sadakati, günlük hedef çift-yazım köprüsü [pragmatik]. BACKLOG: Bugün hedef kaynağı tekilleştirme + SinifKatil.tsx raf temizliği [ortak temizlik kartına]. Tarayıcı piksel doğrulaması kullanıcının manuel turunda. 4 ölçüt sağlandı.)
