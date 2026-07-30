---
gorev: GOREV-049-isi-haritasi-ogrenci-kirilimi-frontend
kimden: ORKESTRATÖR
kime: FRONTEND
durum: onaylandi
oncelik: P1
bagimlilik: [GOREV-048]
dokunulan-dosyalar:
  - frontend-v2/src/screens/sinif/SinifIsi.tsx
  - frontend-v2/src/lib/types.teacher.ts   # yeni yanıt tipi (IsiOgrenciKirilimiYaniti)
migration-gerekli: hayir
---

## Amaç
Isı haritasında bir hücre (ders × ünite) seçilince, GOREV-048 ucundan o ünitede **zayıf
öğrencilerin listesini** getirip (en zayıf başta) ekranda göstermek ve her öğrenciyi
**Karşılaştır**'a köprülemek — SinifIsi.tsx'in belgelenmiş iki boşluğunu (satır 27-29) kapatır.

## Bağlam
- **Sözleşme (GOREV-048 ONAYLI, arşivde):** `GET /teacher/sinif/isi-haritasi/ogrenciler?subject=<>&unitPath=<>`
  → `{ subject, unitPath, unitTitle|null, esik:{zayif}, ogrenciler:[{ studentId, ad|null,
  mastery(0..1, 4 ondalık), attempts, nodeCount }], olcumZamani }`. Öğrenciler **en zayıf başta**
  (sunucu sıraladı — istemci YENİDEN SIRALAMAZ). **TUTARLILIK DEĞİŞMEZİ:** dönen `ogrenciler.length`,
  o hücrenin `weakStudentCount` değerine EŞİTTİR (aynı eşik/roster). UI bu iki sayının eşit
  görünmesini bozmamalı (aynı hücrenin rozetindeki zayıf sayısı = listedeki öğrenci sayısı).
- **⚠️ MIGRATION 0023 BAĞIMLI:** uç, migration 0023 canlıya uygulanana dek `500 isi_kirilim_okunamadi`
  döner (kullanıcı Dashboard'da koşacak). Bu kart STATİK kapılarla (tsc + build) doğrulanır; canlı
  davranış migration sonrası çalışır. Hata durumu zaten ele alınmalı (aşağıda).
- **Ekran (frontend-v2/src/screens/sinif/SinifIsi.tsx):** FİDAN `si-*` inline desen (GOREV-035).
  Hücreler `.si-hucre` (ders×ünite), `.secili` = yaprak outline. Seçim URL'de: `ders`/`unite`
  (`useSorgu`). `seciliHucre` (~satır 203) = `unite`'e karşılık gelen hücre; `hucreSec(path, seciliMi)`
  (~223) seçimi toggle'lar. ZATEN bir kazanım-düzeyi zayıf paneli var (`zayif` = `SinifZayifYaniti`,
  ~214) — bu YENİ öğrenci-paneli ONUN KARDEŞİ olur, onu bozmaz.
- **Karşılaştır köprüsü:** `Karsilastir.tsx` seçimi `?ogrenci=a,b,c` (virgülle) okur (kod: Karsilastir
  ~satır 16). Öğrenci satırından köprü = Karşılaştır rotasına `?ogrenci=<studentId>` ile git (rota
  yolunu `lib/nav.ts`/router'dan doğrula; mevcut kazanım→ödev köprüsü `nav('/sinif/odev?...')` ~231
  emsal). Tekil öğrenci yeterli (virgüllü çoklu Karşılaştır'ın işi).
- Anayasa: **MOCK YASAK** (tek gerçek uç 048); **null ≠ 0** — `ogrenciler` boşsa "bu ünitede eşik
  altı öğrenci yok" DÜRÜST metni (0 öğrenci uydurma DEĞİL; `OlcumYok`/boş-durum deseni), `ad==null`
  ise makul yedek (örn. "Öğrenci" + kısa id — uydurma isim YOK); §14 salt renk değil.

## Kabul Kriterleri
- [ ] **Hücre seçilince öğrenci-kırılımı yüklenir:** seçili `ders`+`unite` için 048 ucu çağrılır
      (seçim değişince yeniden çekilir; seçim yoksa çağrı yok). Yükleme iskeleti + hata durumu
      (`500` dahil — "kırılım yüklenemedi" + tekrar dene) ele alınır. Mevcut `zayif` kazanım paneli
      BOZULMAZ.
- [ ] **Zayıf öğrenci listesi:** her satır `ad` (yoksa yedek) · `mastery` yüzde (`%NN`) · `attempts`;
      **en zayıf başta** (sunucu sırası KORUNUR). FİDAN `si-*` diliyle (yeni sınıflar aynı önekte),
      tema değişkenlerinden (sabit renk yok).
- [ ] **Karşılaştır köprüsü:** her öğrenci satırında Karşılaştır'a `?ogrenci=<studentId>` ile giden
      bağlantı/buton (doğru rota). Satır 29'daki "bağlantı YOK" boşluğu kapanır.
- [ ] **null ≠ 0 / dürüstlük:** `ogrenciler: []` → "bu ünitede eşik altı öğrenci yok" (uydurma 0
      öğrenci değil). Hücrenin `weakStudentCount`'u ile liste uzunluğu tutarlı görünür (değişmez).
- [ ] **Belgelenmiş boşluk yorumları güncellenir:** SinifIsi.tsx başındaki (satır ~27-29) "En çok
      zorlanan N öğrenci listesi YOK" ve "Karşılaştırma bağlantısı YOK" notları, artık ÇÖZÜLDÜ olarak
      güncellenir (yanıltıcı eski yorum kalmaz).
- [ ] Yeni yanıt tipi `lib/types.teacher.ts`'e eklenir (backend `IsiOgrenciKirilimiYaniti` aynası).
- [ ] `cd frontend-v2 && ../learnup-brain/node_modules/.bin/tsc --noEmit -p tsconfig.json` sıfır
      hata + `bun run build` yeşil → HAM çıktılar RAPOR'a. **$0.**

## Kısıtlar / Kapsam Dışı
- Yalnız `SinifIsi.tsx` + `lib/types.teacher.ts`. `components/ui.tsx`/`cekirdek.tsx`/`fx.tsx`
  DOKUNULMAZ (yalnız import). Backend'e/uca DOKUNMA (048 sözleşmesi sabit).
- **Karsilastir.tsx'e DOKUNMA** — yalnız oraya `?ogrenci=` ile YÖNLENDİR (Karşılaştır zaten okuyor).
- Mevcut ısı haritası veri akışını (tek istek + istemci ders süzgeci) ve `zayif` kazanım panelini
  DEĞİŞTİRME — yalnız yeni öğrenci-paneli + fetch ekle.
- Migration/backend YOK. Yeni endpoint önerme. Dev sunucularına dokunma.

## Başlangıç Durumu
- Git rev: `5c2610e`. Çalışma ağacı çok kirli (onaylı işler). GOREV-048 ONAYLANDI+arşivde (uç + tip
  hazır; migration 0023 kullanıcıda). `SinifIsi.tsx` GOREV-035 FİDAN işiyle kirli — o `si-*` yapıyı
  KORU, üstüne öğrenci-paneli ekle. İlk adım: durumu `alindi` yap; SinifIsi.tsx'i + Karsilastir'ın
  `?ogrenci=` okumasını + Karşılaştır rota yolunu (`lib/nav.ts`) oku; sonra işle. `git diff --stat`
  RAPOR'a. Beyan dışı kirli dosyaya dokunma; `git checkout --` YASAK.

## Onay Kayıtları
- Paralı koşu: GEREKMEZ ($0). Migration: yok (0023 GOREV-048'de, kullanıcıda).

## RAPOR
<!-- YALNIZ FRONTEND ajanı doldurur. -->
### Yapılan
- `lib/types.teacher.ts`: 048 sözleşmesinin aynası eklendi — `IsiOgrenciKirilimiSatiri`
  (`studentId · ad|null · mastery 0..1 · attempts · nodeCount`) + `IsiOgrenciKirilimiYaniti`
  (`subject · unitPath · unitTitle|null · esik.zayif · ogrenciler[] · olcumZamani`). Tutarlılık
  değişmezi (`ogrenciler.length = weakStudentCount`) ve "en zayıf başta / yeniden sıralama yok"
  notları tipe yazıldı.
- `SinifIsi.tsx`:
  - Seçili hücre için yeni `useAsync` (`kirilim`) — `GET /teacher/sinif/isi-haritasi/ogrenciler`
    `apiGet` ile (çıplak fetch YOK). Deps İLKEL (`[kirilimSubject, kirilimUnite]`) → seçim
    değişince yeniden çeker; **seçim yoksa çağrı yok** (`fn` `Promise.resolve(null)`'a çözülür).
    `kirilimData` yanıtı yalnız SEÇİLİ üniteye aitse geçerli sayar (dep-geçiş karesinde bayat
    veri sızmasın).
  - Yeni "Bu ünitede eşik altı öğrenciler" paneli — mevcut `zayif` kazanım panelinin KARDEŞİ,
    dağılım bantları ile kazanım listesi ARASINA yerleşti. Yükleme iskeleti (`Skeleton`), hata
    yolu ("Öğrenci kırılımı yüklenemedi: … + tekrar dene" → `kirilim.reload()`; **500
    `isi_kirilim_okunamadi` bu yolu tetikler, ekran çökmez**), boş durum ("bu ünitede eşik altı
    öğrenci yok" — 0 uydurma değil).
  - Her satır: `ad` (yoksa yedek `Öğrenci <id ilk 4>` — uydurma isim YOK) · `%NN ustalık` ·
    `N deneme`; **sunucu sırası korunur** (yeniden sıralama yok). FİDAN `si-*` dili (`.si-ogr*`
    yeni sınıflar aynı önek), yalnız tema değişkenleri (sabit renk yok), `:hover` gateli.
  - **Karşılaştır köprüsü**: satır tıklanınca `nav('/sinif/karsilastir?ogrenci=<studentId>')`
    (studentId `encodeURIComponent`li; Karsilastir `?ogrenci=` okur — DOKUNULMADI).
  - Dosya başı envanter: iki "YOK" boşluğu (öğrenci kırılımı / Karşılaştır bağlantısı)
    **[ÇÖZÜLDÜ · GOREV-049]** olarak güncellendi; uç listesi "iki→üç GERÇEK uç" düzeltildi.
  - Mevcut ısı haritası akışı (tek istek + istemci ders süzgeci) ve `zayif` kazanım paneli
    DEĞİŞMEDİ — yalnız ekleme.

### Değişen dosyalar
- `frontend-v2/src/lib/types.teacher.ts` (+29 satır: yeni tip blokları; başka hunk pre-existing branch işi, DOKUNULMADI)
- `frontend-v2/src/screens/sinif/SinifIsi.tsx`
- (bu kart: durum + Günlük + RAPOR)

### Koşulan kapılar + çıktıları
- İlk `git diff --stat -- …/SinifIsi.tsx` (çalışma başlangıcı, GOREV-035 tabanı):
  `1 file changed, 458 insertions(+), 107 deletions(-)`
- `cd frontend-v2 && ../learnup-brain/node_modules/.bin/tsc --noEmit -p tsconfig.json` → **TSC_EXIT=0** (sıfır hata)
- `bun run build` → **BUILD_EXIT=0** · `✓ built in 2.31s` · `dist/assets/SinifIsi-DkPs2VAS.js 17.99 kB │ gzip 5.26 kB`.
  (Chunk >500 kB uyarısı PRE-EXISTING: vendor-three/katex/charts — bu kartla ilgisiz.)
- Son `git diff --stat`: SinifIsi.tsx `+552/−107`, types.teacher.ts `+55` (29'u benim, kalanı pre-existing).
- Canlı-smoke: YAPILMADI (kart talimatı — migration 0023 yok, uç 500 döner; hata yolu bunu karşılar).

### Gerçekleşen maliyet
- $0 (paralı LLM koşusu yok; yalnız statik kapılar).

### Açık riskler
- **Canlı davranış migration 0023'e bağlı:** uç uygulanana dek `500 isi_kirilim_okunamadi`
  döner → panel "Öğrenci kırılımı yüklenemedi + tekrar dene" gösterir (beklenen; statik kapılar
  yeşil, canlı doğrulama migration sonrası).
- Tutarlılık değişmezi (`ogrenciler.length = weakStudentCount`) SUNUCU garantisi; UI listeyi
  süzmez/sıralamaz, dağılımdaki "eşik altı" bandı = liste uzunluğu — migration sonrası göz doğrulaması önerilir.

### Sonraki adım önerisi
- Migration 0023 kullanıcı Dashboard'da koşunca: hücre seç → öğrenci listesi + Karşılaştır köprüsü
  canlı smoke (ORKESTRATÖR onay adımı).
- İsteğe bağlı iyileştirme (yeni kart): tekil köprü yerine hücredeki tüm eşik-altı öğrencileri tek
  tıkla Karşılaştır'a taşıyan çoklu-seçim köprüsü (`?ogrenci=a,b,c`, EN_FAZLA=4 sınırıyla).

## Günlük
- 2026-07-24 · ORKESTRATÖR · kart açıldı (beklemede; 048 sözleşmesine bağımlı [ONAYLI]; canlı davranış migration 0023 sonrası; statik kapılarla doğrulanır)
- 2026-07-24 · FRONTEND · alindi
- 2026-07-24 · FRONTEND · tamamlandi (öğrenci-kırılımı paneli + Karşılaştır köprüsü; tsc=0/build=0; $0; canlı davranış migration 0023 sonrası)
- 2026-07-24 · ORKESTRATÖR · onaylandi + arşiv. Bağımsız denetim: (1) fetch kapısı `kirilimSubject && kirilimUnite ? apiGet('/teacher/sinif/isi-haritasi/ogrenciler') : Promise.resolve(null)` — SEÇİM YOKSA ÇAĞRI YOK; ilkel deps `[kirilimSubject, kirilimUnite]`; çıplak fetch YOK (apiGet). (2) BAYAT-VERİ KORUMASI: `kirilim.data.unitPath === kirilimUnite` kontrolü (dep-geçiş karesinde bayat kırılım sızmaz). (3) Boş-durum DÜRÜST (satır 461 "bu ünitede eşik altı öğrenci yok" — 0 uydurma değil); ad null → yedek "Öğrenci <id>" (uydurma isim yok); sunucu sırası (en-zayıf-başta) korunur. (4) Karşılaştır köprüsü DOĞRU rota — `nav('/sinif/karsilastir?ogrenci='+encodeURIComponent)` (nav.ts:30 + App.tsx:111 teyitli); Karsilastir.tsx DOKUNULMADI. (5) Boşluk yorumları [ÇÖZÜLDÜ·049] (satır 25/33-37); mevcut `isi`/`zayif` akışı DEĞİŞMEDİ (198/200/259). (6) Yeni tip `IsiOgrenciKirilimiYaniti` types.teacher.ts'te (backend aynası). Yalnız 2 beyan dosya (M). KONSOLİDE KAPI: TSC=0 + BUILD=0 (SinifIsi 17.99kB temiz, 1921 modül). $0. **KALAN: kullanıcı migration 0023'ü koşunca özellik uçtan uca canlı — o zaman ORKESTRATÖR full-chain smoke önerilir.**
