---
gorev: GOREV-036-ogrenci-rontgeni-fidan
kimden: ORKESTRATÖR
kime: FRONTEND
durum: onaylandi
oncelik: P2
bagimlilik: [GOREV-009]   # ✅ arşivde — rontgen.tsx FİDAN panelleri oradan; opsiyonel-prop deseni sürer
dokunulan-dosyalar:
  - frontend-v2/src/screens/sinif/OgrenciRontgeni.tsx
  - frontend-v2/src/components/rontgen.tsx      # YALNIZ yeni OPSİYONEL prop'lar (kırıcı değişiklik yasak)
  - frontend-v2/src/components/sinif.tsx        # OgrenciBaslik/OgrenciGezinme FİDAN uyumu
  - frontend-v2/src/lib/types.teacher.ts        # loglar/odevler tip ekleri gerekirse
migration-gerekli: hayir
---

## Amaç
Öğrenci Röntgeni ekranını **kullanıcı onaylı önizlemeyle** hizalamak:
`docs/design/onizleme/ogrenci-rontgeni.html` (2026-07-23 onayı — kaynak referans BUDUR).

## Bağlam
- "Aynı ürün" ilkesi KORUNUR: paneller `rontgen.tsx`'ten AYNEN (009'da FİDAN'a geçti);
  öğretmen farkı eylem fiili + teşhis dilinin açık olması. EKRAN-HARITASI §13.
- **MOCK YASAK (kullanıcı teyidi 2026-07-23):** tüm veri GERÇEK uçlardan (hepsi MEVCUT —
  envanter ORKESTRATÖR tarafından yapıldı):
  - `GET /teacher/ogrenci/:id/rontgen` (mevcut kullanım sürer)
  - **Cevap logları:** `GET /teacher/ogrenci/:id/loglar` — sayfalı (`offset/limit/total`,
    teacher.routes.ts:486). **DİKKAT:** yanıtta "doğru şık" alanı YOK — tabloda yalnız
    tarih · kazanım · KELİMELİ sonuç (doğru/yanlış/boş — is_skipped) · süre · seçilen şık
    gösterilir; önizlemedeki "(doğru: D)" parçası ÇİZİLMEZ (uydurma yasak; RAPOR notu)
  - **Sınıf ortalaması referans çizgisi:** sınıf özeti verisinden (`/teacher/ozet` veya sınıf
    sağlayıcısında zaten çekilen özet — envanterle doğrula); `TrendPaneli`ne YENİ OPSİYONEL
    prop (verilmezse çizgi yok → öğrenci Analizler yüzeyi ETKİLENMEZ)
  - **Ödev geçmişi:** `GET /teacher/odevler` — bu öğrenciye ait/uygulanan setler süzülerek;
    öğrenci-bazlı tamamlanma yanıtta yoksa o sütun GİZLENİR + RAPOR notu

## Kabul Kriterleri
- [x] Başlık kartı FİDAN: avatar + ad + sınıf çipi + son aktivite; ← → roster gezinme + Esc
      pano (MEVCUT davranış korunur, girdi alanında devre dışı); ekrandaki TEK birincil
      **"Hedefli ödev gönder"** → `/sinif/odev?ogrenci=:id`
- [x] 4 stat şeridi (ustalık halkası · kapsama · 7 gün doğruluk ▲delta+kıvılcım · açık yanılgı)
      — mevcut türetimler AYNEN (Harita ile birebir kuralı)
- [x] `OncelikRadari`ye `calisEtiketi="Set gönder"` geçilir (009 RAPOR'unun bekleyen tek satırı)
- [x] **Yanılgı Teşhisi paneli FİDAN:** "yalnız öğretmen görür" rozeti + taksonomi/güven/kanıt/
      sık-seçilen/önkoşul hipotezi (mevcut veri alanları; kehribar DEĞİL `--uyari` tonu)
- [x] Trend'de kesikli **sınıf ortalaması** çizgisi (toprak tonu + etiket; veri yoksa çizgi yok)
- [x] **Cevap Logları** sayfalı tablo (gerçek uç; sonuç HER ZAMAN kelimeli rozet; boş geçilen
      "boş" der) + **Ödev geçmişi** listesi (yukarıdaki dürüstlük kuralları)
      *(sapmalar RAPOR'da: doğru şık uçta yok → çizilmedi; ödev geçmişi öğrenci-bazlı hâliyle
      `/teacher/ogrenci/:id` `sonOdevler`den; soru-bazlı ilerleme uçta yok → yalnız puan)*
- [x] Boş durumdaki `Lighthouse` görseli FİDAN karşılığıyla değişir (öğretmen yüzeyindeki son
      denizcilik görseli — 009 önerisi); null≠0 her panelde sürer
- [x] Öğrenci Analizler yüzeyi KIRILMAZ: rontgen.tsx'e yalnız opsiyonel prop; `tsc` proje geneli 0
- [x] `tsc --noEmit` sıfır hata + `bun run build` yeşil → HAM çıktılar RAPOR'da; **$0**

## Kısıtlar / Kapsam Dışı
- Yeni backend ucu İSTENMEZ; `Harita.tsx`/`cekirdek.tsx`/`ui.tsx` dokunulmaz; teşhis dili
  öğrenci yüzeyine SIZMAZ (M§9 — persona kuralı).

## Başlangıç Durumu
- Git rev: `5c2610e`; kirli ağaç (onaylı işler). `rontgen.tsx` 009+034'ün ONAYLI işleriyle
  kirli — yalnız bu kartın işi eklenir. İlk adım: `git diff --stat` fotoğrafı RAPOR'a.

## Onay Kayıtları
- Paralı koşu: GEREKMEZ ($0).

## RAPOR

### Yapılan
- **`OgrenciRontgeni.tsx` (yeniden yazım — ogrenci-rontgeni.html portu):** FİDAN başlık kartı
  (← Pano · baş harfli 52px avatar · sınıf çipi · GERÇEK "son aktivite" (roster `lastActive`) +
  "bu hafta N soru" (rontgen trend'inden) · klavye ipucu · gezinme okları · ekranın TEK koyu
  **"Hedefli ödev gönder"**; boş durumda bu CTA gizlenir, birincilliği "Tanışma seti gönder"
  devralır — tek-birincil bütçesi korunur) · 4 stat şeridi FİDAN inline kartlarla, türetimler
  Harita ile birebir AYNEN · `OncelikRadari`/`UstalikMatrisi`ye `calisEtiketi="Set gönder"`
  (009'un bekleyen satırı kapandı) · matrise `DersGrubu.toplam` verildi (kesikli "ölçüm yok"
  hücreleri artık öğretmende de) · **Yanılgı Teşhisi FİDAN** ("yalnız öğretmen görür" `--uyari`
  rozeti; ders/taksonomi/sık-seçilen çipleri + güven + kanıt + önkoşul hipotezi; kehribar YOK;
  eski tooltip'teki "ATLAS" iç ajan adı arayüz metninden çıkarıldı) · **Cevap Logları**: sayfalı
  tablo `GET /teacher/ogrenci/:id/loglar` (limit 20; tarih "bugün 14:20" biçimi · kazanım adı
  rontgen düğümlerinden GERÇEK eşleme, yoksa `subTopic`, o da yoksa "—" · sonuç HER ZAMAN
  kelimeli rozet: doğru/yanlış/**boş** (`is_skipped`) · süre "1 dk 42 sn" · seçilen şık; sayfalama
  ‹ 1 … n › + `aria-current`; öğrenci değişince sayfa sıfırlanır; `total`=0 → panel gizli; hata →
  "Tekrar dene") · **Ödev Geçmişi**: `GET /teacher/ogrenci/:id` `sonOdevler` (tür çipi sınıf/hedefli ·
  puan `7/10 · %70` · durum rozeti tamamlandı/sürüyor; boşsa panel gizli) · boş durumda
  `Lighthouse` → `FidanIkon` filiz üçlüsü (öğretmen yüzeyindeki SON denizcilik görseli kalktı).
- **`rontgen.tsx` (YALNIZ opsiyonel ek):** `TrendPaneli`ne `sinifOrt?: number | null` —
  verilirse `--toprak` kesikli referans çizgisi + "sınıf ort. %N" etiketi + alt lejant kelimesi;
  verilmezse HİÇBİR şey değişmez (öğrenci Analizler yüzeyi etkilenmez). 034'ün `gunEtiketi`
  lib/format taşıması ve koruyucu yorumu AYNEN korundu (re-export eklenmedi).
- **`sinif.tsx`:** `OgrenciBaslik` FİDAN kimlik kartına dönüştü (cam kart; `← Pano` pili; baş
  harfli avatar `--v2/--vurgu`; sınıf çipi; YENİ OPSİYONEL `altBilgi` slotu — tek kullanıcı bu
  ekran, imza geriye-uyumlu) · `OgrenciGezinme` FİDAN ok tuşları (`--v0` zemin + `--cam-kenar`).
- **`types.teacher.ts`:** `OgrenciLogSatiri` + `OgrenciLoglarYaniti` eklendi (teacher.routes.ts:486
  aynası; tip yorumunda "doğru şık alanı YOK" uyarısı).
- Sınıf ortalaması İSTEKSİZ türetildi: `SinifSaglayici`nın zaten çektiği `/teacher/ozet`
  `trend`'i (30 günlük) üzerinden doğruluk ortalaması — yeni uç/istek yok.

### Dürüstlük sapmaları (önizleme ↔ gerçek veri)
1. **"(doğru: D)" ÇİZİLMEDİ** — loglar yanıtında doğru şık alanı yok; tablo yalnız seçilen şıkkı
   ve kelimeli sonucu gösterir (kartın kendi talimatı).
2. **Ödev geçmişi kaynağı**: `/teacher/odevler` yerine `GET /teacher/ogrenci/:id` `sonOdevler`
   kullanıldı — o da MEVCUT uç ve öğrenci-bazlı puanı SUNUCUDA süzülü verir; `/teacher/odevler`
   sınıf ödevlerinde öğrenci-bazlı tamamlanma alanı taşımıyor (agregat). Kartın "alan yoksa sütun
   gizlenir" senaryosuna hiç düşülmedi.
3. **"7/10 sürüyor" soru-bazlı ilerleme** uçta yok → oran yalnız gerçek `score/maxScore` varken
   çizilir; sürüyor satırında oran boş. Ayrıca `sonOdevler` sınıf ödevlerinden yalnız GÖNDERİLMİŞ
   olanları içerir (submission satırı olmayan sınıf ödevi listede görünmez) — backend davranışı.
4. Önizlemedeki öncelik gerekçeleri ("çürüme başladı", "doğruluk dalgalı") temsilîydi —
   `OncelikRadari` 009'daki GERÇEK sinyal gerekçelerini kullanır (ustalık düşük / açık yanılgı /
   uzun süredir tekrar yok).
5. Önizlemede olmayan `TuzakPaneli` KORUNDU (mevcut gerçek-veri özelliği; kaldırmak istenmedi —
   regresyon yaratmamak için).

### `git diff --stat` (bu kartın 4 dosyası — rontgen.tsx satırları 009+034 onaylı işleriyle kümülatif; 036'nın rontgen delta'sı yalnız ~25 satırlık `sinifOrt` eki)
```
 frontend-v2/src/components/rontgen.tsx            | 931 +++++++++++++---------
 frontend-v2/src/components/sinif.tsx              |  78 +-
 frontend-v2/src/lib/types.teacher.ts              |  26 +
 frontend-v2/src/screens/sinif/OgrenciRontgeni.tsx | 666 ++++++++++++----
 4 files changed, 1170 insertions(+), 531 deletions(-)
```

### Kapılar (HAM çıktı)
```
$ ../learnup-brain/node_modules/.bin/tsc --noEmit -p tsconfig.json
(çıktı yok)
tsc exit: 0

$ bun run build   (son satırlar)
✓ built in 1.29s
(!) Some chunks are larger than 500 kB after minification. …  ← bilinen uyarı (vendor-three/katex/charts), bu karttan bağımsız
```

### Gerçekleşen maliyet
$0 (paralı LLM koşusu yok).

### Açık riskler
1. Sınıf ortalaması çizgisi 30 günlük `/teacher/ozet` penceresinden; panelin iç 4/12-hafta
   anahtarıyla pencere birebir örtüşmeyebilir (referans sabittir) — etiket "sınıf ort." bunu
   tekil sayı olarak sunar, yanıltıcı seri çizilmez.
2. Log tablosunda kazanım adı eşlemesi rontgen düğümlerinden — düğümü olmayan (ör. tanışma
   seti öncesi) kayıtlarda `subTopic`/"—" görünür; uçta kazanım başlığı taşınırsa zenginleşir.
3. `zamanEtiketi`/`sureEtiketi` ekran-yerel yardımcılar — üçüncü kullanım çıkarsa lib/format'a
   taşınmalı (şimdilik iki ekranda benzer ihtiyaç yok).

### Sonraki adım önerisi
- **BACKEND (küçük):** loglar yanıtına kazanım başlığı (`title`) join'i + istenirse `correct_option`
  (öğretmene açık olması ürün kararı gerektirir — telif/güvenlik değil, pedagoji tercihi).
- **BACKEND (küçük):** `targeted_assignments`a soru-bazlı ilerleme (cevaplanan/toplam) →
  "7/10 sürüyor" oranı gerçeklenebilir.
- `PanoIskeleti` hâlâ COASTAL iskelet dilinde — /sinif geneli FİDAN iskelet kartı ayrı ekran
  kartlarının işi (RolGecidi beyan dışıydı).

## Günlük
- 2026-07-23 · ORKESTRATÖR · kart açıldı (önizleme onayı 2026-07-23; GOREV-009'u yapan ajana atandı — rontgen.tsx bağlamı onda; 035/037 ile dosya kesişimi YOK)
- 2026-07-23 · FRONTEND · alindi
- 2026-07-23 · FRONTEND · tamamlandi: ekran FİDAN önizlemesine taşındı; loglar+ödev geçmişi GERÇEK uçlardan; TrendPaneli'ne yalnız opsiyonel sinifOrt; tsc 0 + build yeşil; sapmalar RAPOR'da
- 2026-07-23 · ORKESTRATÖR · onaylandi + arşiv. Denetim kanıtı: cevap logları GERÇEK uçtan (/teacher/ogrenci/:id/loglar:85, sayfalı); "(doğru: X)" grep'i SIFIR — yanıtta doğru şık yok, uydurulmadı; ödev geçmişi sonOdevler (öğrenci-bazlı, sunucuda süzülü). rontgen.tsx'e YALNIZ opsiyonel sinifOrt (satır 153/161, veri yoksa çizgi yok); Harita.tsx sinifOrt GEÇMİYOR (grep 0) → öğrenci Analizler yüzeyi KIRILMADI; 034 gunEtiketi re-export koruması (satır 7) bozulmamış. Teşhis --uyari tonlu, "ATLAS" iç adı arayüzden çıkmış (kehribar/telif temiz). OncelikRadari "Set gönder" (009 borcu kapandı). tsc 0 + build yeşil; $0; beyanlı 4 dosya. 5 dürüstlük sapması + BACKEND önerileri (log satırı kazanım başlığı; hedefli set soru-bazlı ilerleme) backlog'a.
