---
gorev: GOREV-039-yonetim-panosu-fidan
kimden: ORKESTRATÖR
kime: FRONTEND
durum: onaylandi
oncelik: P2
bagimlilik: []   # BAŞLATILABİLİR — 038 ile dosya kesişimi YOK (kule.tsx vs sinif.tsx)
dokunulan-dosyalar:
  - frontend-v2/src/screens/kule/Kule.tsx
  - frontend-v2/src/components/kule.tsx   # AjanSagligi/EvalTrendi/OlcumYok FİDAN
migration-gerekli: hayir
---

## Amaç
Yönetim Panosu ekranını (kod adı `Kule.tsx`) **kullanıcı onaylı önizlemeyle** hizalamak:
`docs/design/onizleme/yonetim-panosu.html` (2026-07-23 onayı — kaynak referans BUDUR).

## Bağlam
- Tasarım: TASARIM-DILI v1.2 (inline FİDAN). İçerik: EKRAN-HARITASI §16.
- **MOCK YASAK (kullanıcı teyidi 2026-07-23):** tüm sayılar GERÇEK uçlardan (hepsi MEVCUT):
  `GET /admin/havuz` (doğrulanmış oran/hacim/kapsama) · `GET /admin/eval` (sızıntı/trend/son koşu
  yaşı/uyarı) · `GET /admin/gorevler` (ajan sağlığı + kuyruk). Ölçüm olmayan yerde `OlcumYok` —
  0 çizilmez. `POST /admin/gorev/:id/yeniden` (mevcut) davranışı AYNEN (attempts reset + denetim
  + Redis-kapalı mesajı + reload).
- **DÜRÜST BOŞLUK KORUNUR (imza):** "Üretim hunisi henüz ölçülmüyor" kartı — koddaki gerekçe
  aynen kalır (elenen adaylar bellekte eleniyor; huniyi eval'den türetmek uydurma olurdu).
- **Telif (§18):** havuz sayımında ÖSYM görünmesi normaldir — yönetici iç operasyonu; öğrenci/
  öğretmen yüzüne yayın YOK.

## Kabul Kriterleri
- [x] Görünüm iki temada da önizlemeyle eşleşir: başlık + son-eval durumu · 4 stat (doğrulanmış
      oran halkası · havuz hacmi · kapsama · şık sızıntısı — ters ölçüt ▲=kötü, ikon+kelime) ·
      eval trendi grafiği · **üretim hunisi dürüst-boşluk kartı** · ajan sağlığı (görev kuyruğu:
      tür + KELİMELİ durum + yaş; başarısız görevde "Yeniden kuyrukla") · servis sağlığı satırları
      (nokta + KELİMELİ; Redis kapalı "bekçi modu")
- [x] `OlcumYok` ölçüm olmayan her yerde (null≠0); eval hiç koşmadıysa dürüst metin
- [x] Görev yeniden kuyruklama mevcut mantığı korur (attempts reset toast'ı, denetimYazildi:false
      → 0020 uyarısı, akisaItildi ayrımı)
- [x] Hareket-azalt: kart girişleri + halka dolumu gateli; kalıcı ping/glow yok (FİDAN §9.3)
- [x] `tsc --noEmit` sıfır hata + `bun run build` yeşil → HAM çıktılar RAPOR'da; **$0**

## Kısıtlar / Kapsam Dışı
- Yeni backend ucu İSTENMEZ. `components/ui.tsx`/`cekirdek.tsx`/`fx.tsx` DOKUNULMAZ
  (kule.tsx serbest — yönetici paylaşımlı bileşen). Görev yeniden-kuyruklama davranışı değişmez.

## Başlangıç Durumu
- Git rev: `5c2610e`; kirli ağaç (onaylı işler). `Kule.tsx`/`kule.tsx` eski onaylı işlerle kirli
  olabilir; yalnız bu kartın işi eklenir. İlk adım: `git diff --stat` fotoğrafı RAPOR'a.

## Onay Kayıtları
- Paralı koşu: GEREKMEZ ($0).

## RAPOR

### Yapılan
Yönetim Panosu (`Kule.tsx`) onaylı önizlemeye (`docs/design/onizleme/yonetim-panosu.html`) FİDAN
v1.2 inline desenle taşındı. COASTAL primitifleri (`SinifBaslik`/`StatTile`/`GlowBorder`/`Halka`/
`WaveDivider`/`StatusLine`) söküldü; ekran chrome'u `yp-*` scoped `<style>` bloğu + `index.css` CSS
değişkenleriyle yeniden çizildi (renkler `var(--cam/--metin1/--dogru/...)` → iki tema otomatik).

- **Başlık kartı** + son-eval durumu (statik nokta + mono metin): nokta rengi gerçek durumdan
  türer — eval yoksa/hata → nötr, bayat veya ajan sağlığı≠iyi → uyarı, aksi → doğru.
  StatusLine'ın pulslu noktası kaldırıldı → sayfada **sıfır canlı nokta** (bütçe temiz).
- **4 stat** (önizleme düzeni, gerçek `/admin/havuz`+`/admin/eval`): Doğrulanmış Oran (mount'ta
  dolan 64px halka, reduced-motion uyumlu) · Havuz Hacmi (`ÖSYM n · AI n` — §18 telif: yönetici iç,
  yayın yok) · Müfredat Kapsaması · **Şık Uzunluk Sızıntısı** (ters ölçüt: gerçek trendden türetilen
  delta ▲/▼ + `arttı/azaldı` kelimesi + uyarı/doğru rengi; iki ölçüm yoksa delta yok — uydurma yön
  çizilmez; değer null ise `OlcumYok`).
- **Eval Trendi** (`components/kule.tsx`): FİDAN karta alındı; gerçek drift serileri korundu
  (şık sızıntısı = uyarı tonu, en-yakın-komşu p90 = veri tonu), recharts + `connectNulls` +
  KuleTooltip aynen; <2 ölçümde dürüst "en az iki koşum gerekiyor" metni.
- **Üretim hunisi dürüst-boşluk kartı (imza) KORUNDU** — gerekçe paragrafı birebir aynı (elenen
  adaylar bellekte eleniyor; huniyi eval'den türetmek uydurma olurdu; eval yalnız havuza girmiş
  soruyu ölçer). Uyarı üçgeni ikonu eklendi, metin değişmedi.
- **Ajan Sağlığı** (`components/kule.tsx`): görev kuyruğu FİDAN'a taşındı — 4 KELİMELİ sayaç
  (bekliyor/çalışıyor/tamamlandı/başarısız) + takılan/başarısız satırları (tür + kelimeli durum
  rozeti + yaş/deneme + **"Yeniden kuyrukla"** düğmesi). saglik rozeti kelime+ikon (asla yalnız
  renk). İYİMSER GÜNCELLEME YOK (düğme dönerken devre dışı → reload).
- **Servis Sağlığı** (yeni panel, nokta + KELİMELİ): ayrı servis-sağlık ucu YOK → her satır GERÇEK
  sinyalden DÜRÜSTÇE türetildi, uydurulmadı: API "çalışıyor" (istek çözüldü) · Supabase "bağlı"
  (havuz verisi Postgres'ten geldi) · Worker `/admin/gorevler` `saglik`inden (veri yoksa `OlcumYok`) ·
  **Redis** anlık durumu üç uçta yok → `OlcumYok` ("yeniden kuyruklarken görünür"). Redis'in "kapalı →
  bekçi modu" gerçeği yalnız görev-yeniden yanıtındaki `akisaItildi` ile REAKTİF görünür (toast'ta
  aynen korundu). Önizlemedeki sabit "Redis kapalı · bekçi modu / API 8080 / Worker son 12 sn" DEĞERLERİ
  mock'tu → MOCK YASAK + null≠0 gereği türetilmiş/OlcumYok ile değiştirildi (yapı önizlemeyle aynı).
- **Eval uyarısı** (gerçek `ev.data.uyari`: "hiç koşmadı"/"bayat") FİDAN uyarı kartı olarak korundu.
- **Görev yeniden kuyruklama davranışı AYNEN**: `gorevYeniden` birebir (attempts reset toast'ı,
  `akisaItildi` ayrımı, `denetimYazildi:false` → 0020 uyarısı, `reload()` — iyimser güncelleme yok).
- `OlcumYok` FİDAN silik tona alındı (`var(--metin3)`); API'si değişmedi → `SoruHavuzu`/
  `OzgunlukBariyeri` (henüz COASTAL, bu kartın dışı) kırılmadı, sadece renk tutarlılaştı.
- **Dokunulmadı**: `ui.tsx`/`cekirdek.tsx`/`fx.tsx` (yalnız reuse) · `sinif.tsx` (038 aktif — bağımlılık
  kurmamak için SinifBaslik yerine inline başlık) · `index.css` (beyan dışı) · backend (yeni uç yok).

### Değişen dosyalar
```
 frontend-v2/src/components/kule.tsx   | 173 +++++++++++-----   (OlcumYok/AjanSagligi/GorevSatiri/EvalTrendi FİDAN)
 frontend-v2/src/screens/kule/Kule.tsx | 372 ++++++++++++++++++  (tam yeniden yazım: yp-* inline desen)
 2 files changed, 406 insertions(+), 139 deletions(-)
```
Beyan dışı `screens/kule/Kullanicilar.tsx ` M` görünür — bu benim değişikliğim DEĞİL (oturum öncesi
kirli/başka iş); dokunmadım, geri almadım (Anayasa §5).

### Koşulan kapılar + çıktıları
```
$ ../learnup-brain/node_modules/.bin/tsc --noEmit -p tsconfig.json
TSC_EXIT=0

$ bun run build
✓ 1922 modules transformed.
dist/assets/Kule-aCiaGPUd.js   12.65 kB │ gzip: 4.12 kB   (ekran chunk'ı)
dist/assets/kule-Do7pcbZw.js   12.63 kB │ gzip: 4.15 kB   (paylaşımlı yönetici bileşenleri — ayrı chunk; öğrenci/öğretmen indirmez)
✓ built in 1.27s
BUILD_EXIT=0
```
(Chunk-size >500kB uyarısı yalnız önceden var olan `vendor-three/katex/charts` içindir — bu kartla ilgisiz.)

### Gerçekleşen maliyet
**$0** — paralı LLM koşusu yok (yalnız kod + yerel derleme).

### Açık riskler
- **Servis Sağlığı yapısal ödün**: önizleme 4 canlı satır gösteriyordu; MOCK YASAK gereği API/Supabase
  gerçek sinyalden, Worker `saglik`ten, Redis `OlcumYok`'tur. Redis'in proaktif "kapalı" durumu
  gösterilemez (uç yok). Yönetici Redis'i yalnız görev-yeniden anında (toast) görür. Bu bilinçli
  dürüstlük kararı — istenirse ORKESTRATÖR onayıyla `/health/ready` (deps.redis) tüketimi ayrı kart.
- Eval Trendi başlığı "Eval Trendi" (önizleme), alt-metin gerçek serileri anlatır ("drift %") —
  önizlemenin "doğruluk %" alt-metni mock'tu; gerçek uçta doğruluk serisi yok.

### Sonraki adım önerisi
1. **BACKEND kartı (öneri):** `/admin/health` veya `/admin/gorevler`e `redis`/`worker heartbeat`
   alanı eklenirse Servis Sağlığı proaktif dolar (şimdi OlcumYok olan iki satır gerçekleşir).
2. **BACKEND kartı (öneri):** üretim hattı telemetri tablosu → dürüst-boşluk kartı gerçek huniye döner.
3. `SoruHavuzu.tsx`/`OzgunlukBariyeri.tsx` (aynı `kule.tsx` bileşenlerini kullanır) hâlâ COASTAL —
   FİDAN taşıması ayrı P2 kartları (bu kartın kapsamı dışıydı).

## Günlük
- 2026-07-23 · ORKESTRATÖR · kart açıldı (önizleme onayı "onaylıyorum hepsını" 2026-07-23; YENİ frontend ajanına; 038 ile dosya kesişimi YOK — paralel)
- 2026-07-23 · FRONTEND · alindi
- 2026-07-23 · FRONTEND · tamamlandi (Kule.tsx yp-* inline FİDAN'a taşındı; AjanSagligi/EvalTrendi/OlcumYok FİDAN; Servis Sağlığı gerçek sinyalden türetildi/Redis OlcumYok — MOCK YASAK; dürüst-boşluk + görev-yeniden AYNEN; TSC_EXIT=0 · BUILD_EXIT=0 · $0)
- 2026-07-23 · ORKESTRATÖR · onaylandi + arşiv. Denetim kanıtı: yalnız gerçek uçlar (/admin/havuz·/eval·/gorevler + /admin/gorev/:id/yeniden — Kule.tsx:29-43); üretim-hunisi dürüst-boşluk kartı korunmuş (satır 227); gorevYeniden davranışı aynen (attempts reset yorumu 36, toast 47, denetimYazildi/akisaItildi ayrımı); şık sızıntısı ters ölçüt. DÜRÜST KARAR ÖRNEK: önizlemedeki Servis Sağlığı mock'tu (ayrı sağlık ucu yok) → panel yapısı korunup GERÇEK sinyalden türetildi (API/Supabase istekten, Worker /admin/gorevler saglik'inden), Redis OlcumYok ("ölçüm yok · yeniden kuyruklarken görünür" satır 377 — anlık durum 3 uçta yok, uydurulmadı). git diff --stat beyanla birebir (2 dosya, +406/−139); Kule/kule chunk ayrı (öğrenci/öğretmen indirmez); tsc 0 + build yeşil; $0. /health/ready deps.redis tüketimi → BACKEND önerisi backlog'a.
