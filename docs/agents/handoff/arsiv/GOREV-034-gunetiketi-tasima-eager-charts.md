---
gorev: GOREV-034-gunetiketi-tasima-eager-charts
kimden: ORKESTRATÖR
kime: FRONTEND
durum: onaylandi
oncelik: P2   # kalan en yüksek getirili perf adımı: eager setten −383 kB (toplam −%39'a ulaşır)
bagimlilik: [GOREV-033]   # ✅ arşivde — ölçüm ve neden oradan
dokunulan-dosyalar:
  - frontend-v2/src/lib/format.ts           # gunEtiketi buraya taşınır
  - frontend-v2/src/components/rontgen.tsx  # gunEtiketi çıkar, format'tan re-export/import
  - frontend-v2/src/components/DurtmeZili.tsx  # import kaynağı değişir
migration-gerekli: hayir
---

## Amaç
GOREV-033 ölçümünün gösterdiği eager zincirin kırılması: `App → DurtmeZili.tsx:8
(gunEtiketi ← rontgen.tsx) → recharts` — TopBar zili yalnız bir TARİH-ETİKETİ yardımcısı için
383 kB'lık vendor-charts'ı ilk boyada indirtiyor. `gunEtiketi` `lib/format.ts`'e taşınır.

## Kabul Kriterleri
- [x] `gunEtiketi` `lib/format.ts`'te tek kaynak; `DurtmeZili` oradan import eder; `rontgen.tsx`
      içindeki kullanımlar da aynı kaynağa döner (davranış birebir — fonksiyon gövdesi DEĞİŞMEZ)
- [x] **Kanıt:** build sonrası `index-*.js` statik import + modulepreload listesinde
      vendor-charts YOK; vendor-charts'ı import edenler yalnız lazy grafik zincirleri
      (grep + import listesi RAPOR'a); eager toplam önce/sonra ölçümü
- [x] Röntgen/Analizler panelleri ve DurtmeZili davranışı değişmez (tsc + görsel kod kanıtı)
- [x] `tsc --noEmit` sıfır hata + `bun run build` yeşil → HAM çıktılar RAPOR'da; **$0**

## Kısıtlar / Kapsam Dışı
- Yalnız taşıma — `gunEtiketi` gövdesi/imzası değişmez; başka yardımcı taşınmaz;
  vite.config.js dokunulmaz (033'te bitti). vendor-motion bu kartın dışı (bilinçli eager).

## Başlangıç Durumu
- Git rev: `5c2610e`; kirli ağaç (onaylı işler). `rontgen.tsx` 009'un, `format.ts` eski onaylı
  işlerin kirlisi — yalnız bu kartın işi eklenir. İlk adım: `git diff --stat` fotoğrafı RAPOR'a.

## Onay Kayıtları
- Paralı koşu: GEREKMEZ ($0).

## RAPOR

### Yapılan (salt taşıma — üç dosya)
- **`lib/format.ts`:** `gunEtiketi` + özel `AY_KISA` sabiti `components/rontgen.tsx`'ten AYNEN
  taşındı — gövde/imza bayt-bayt aynı (`iso → '19 Tem'`; tarih-dışı etiket olduğu gibi döner);
  taşıma gerekçesi yorumda.
- **`components/rontgen.tsx`:** yerel tanım silindi; `gunEtiketi` mevcut `'../lib/format'`
  importuna eklendi (dersAnahtar'ın yanına). Modülden RE-EXPORT edilmedi (bilinçli: re-export
  kalsa çizelge-dışı bir tüketici onu yine rontgen'den alıp recharts'ı eager grafiğe sokabilirdi;
  yorumla belgelendi). İçerideki 3 kullanım (CamTooltip etiketi :142, trend ekseni tickFormatter
  :233, kayıt listesi :400) aynı fonksiyona formatındaki yeni kaynaktan bağlanıyor — davranış birebir.
- **`components/DurtmeZili.tsx`:** import kaynağı `'./rontgen'` → `'../lib/format'` (+açıklama
  yorumu). Başka hiçbir satırı değişmedi.
- `Rota.tsx`'teki ayrı `AY_KISA` kopyasına DOKUNULMADI ("başka yardımcı taşınmaz" kısıtı;
  birleştirme istenirse ayrı öneri).

### Kanıt — eager set (build sonrası)
- **`index-BsP9X2Ff.js` statik importları:** api · auth · cn · preload-helper · rolldown-runtime ·
  ui · vendor-motion · vendor-react — **vendor-charts YOK** ✓
- **modulepreload seti (dist/index.html):** index · api · auth · cn · preload-helper ·
  rolldown-runtime · ui · vendor-motion · vendor-react · vendor-shared — **vendor-charts YOK** ✓
- **vendor-charts'ı import edenler (grep):** yalnız `kule-Bq98juaT.js` + `rontgen-BKF5ZlCB.js` —
  ikisi de lazy grafik zinciri (kule ekranları; Harita/OgrenciRontgeni'nin paylaştığı, artık
  index'ten AYRILMIŞ yeni rontgen chunk'ı) ✓
- **Bonus:** `components/rontgen.tsx` DurtmeZili bağı kopunca eager index'ten çıkıp kendi lazy
  chunk'ına düştü (`rontgen-BKF5ZlCB.js` 23.91 kB) — index 275.83 → 252.24 kB.

### Eager toplam — önce/sonra (vendor+index, minified/gzip)
- **033 ÖNCESİ taban:** 1367.4 kB / 415.4 kB
- **033 SONRASI (önce):** 977.3 kB / 297.6 kB — index 275.83 + charts 383.34 + motion 125.44 +
  react 192.16 + shared 0.41
- **BU KART SONRASI:** **570.3 kB / 182.9 kB** — index 252.24 + motion 125.44 + react 192.16 +
  shared 0.41. **Bu kartın kazancı −407.0 kB (charts 383.3 + rontgen 23.9); tabana göre kümülatif
  −%58.3 minified / −%56.0 gzip.** (033 öngörüsü −%39'du — rontgen'in de eager'dan çıkması hedefi aştı.)

### Koşulan kapılar + ham çıktı (KENDİ oturumumda, düzenleme SONRASI)
- `../learnup-brain/node_modules/.bin/tsc --noEmit -p tsconfig.json` → `TSC_EXIT=0` ✓
- `bun run build` → `✓ built in 1.30s` · `BUILD_EXIT=0` ✓; ilgili satırlar:
  ```
  vendor-shared-CjueKrWZ.js   0.41 kB │ gzip:   0.28 kB
  rontgen-BKF5ZlCB.js        23.91 kB │ gzip:   7.05 kB   ← YENİ lazy chunk (eski eager sakini)
  vendor-motion-A1U9wz82.js 125.44 kB │ gzip:  40.89 kB
  vendor-react-B5u6seUI.js  192.16 kB │ gzip:  60.47 kB
  index-BsP9X2Ff.js         252.24 kB │ gzip:  81.21 kB
  vendor-charts-Bc0UYG3h.js 383.34 kB │ gzip: 108.64 kB   ← artık YALNIZ lazy tüketiciler
  ```
  (chunk-boyut uyarısı önceden mevcut — lazy three/katex/charts vendor'ları.)

### Değişen dosyalar (beyanla birebir)
```
 frontend-v2/src/components/DurtmeZili.tsx |   4 +-
 frontend-v2/src/components/rontgen.tsx    | 915 ++++++++++++++++++------------
 frontend-v2/src/lib/format.ts             |  15 +-
```
+ kart dosyası. (rontgen.tsx'in büyük satır sayısı KÜMÜLATİF — 009'un onaylı FİDAN işi kirli
ağaçta; bu kartın payı yalnız tanımın silinmesi + import satırı.) vite.config.js DOKUNULMADI.

### Gerçekleşen maliyet
**$0**.

### Açık riskler
- Tarayıcı smoke koşulmadı (araç yok) — davranış kanıtı: gövde bayt-aynı taşıma + tsc yeşil +
  aynı fonksiyonun aynı çağrı yerlerinden kullanımı. QA `vite preview` turu (033 önerisi) hâlâ geçerli.

### Sonraki adım önerisi
- `Rota.tsx:21`'deki `AY_KISA` kopyası da `lib/format.gunEtiketi`'ye bağlanabilir (mikro temizlik,
  acil değil — ayrı kartlık bile olmayabilir, ilk Rota kartına binebilir).
- Eager sette kalan son büyük kalem vendor-motion (125 kB, bilinçli) — 033 RAPOR'undaki
  maliyet/fayda notu geçerli.

## Günlük
- 2026-07-23 · ORKESTRATÖR · kart açıldı (kaynak: GOREV-033 RAPOR ölçümü + öneri 1; 033'ü bitiren ajana zincirlendi)
- 2026-07-23 · FRONTEND · alindi
- 2026-07-23 · FRONTEND · tamamlandi (gunEtiketi + AY_KISA format.ts'e bayt-aynı taşındı; DurtmeZili + rontgen içi 3 kullanım aynı kaynağa bağlandı; re-export bilinçli YOK. Kanıt: index statik import + modulepreload'da vendor-charts YOK; charts'ı yalnız lazy kule+rontgen chunk'ları çekiyor; rontgen.tsx de eager'dan çıkıp kendi 23.9 kB lazy chunk'ına düştü. Eager 977→570 kB — bu kart −407 kB, tabana göre kümülatif −%58.3. Kapılar: tsc EXIT=0 · build EXIT=0 "✓ built in 1.30s". Maliyet $0.)
- 2026-07-23 · ORKESTRATÖR · onaylandi + arşiv. Denetim kanıtı: format.ts:52-56 gunEtiketi+AY_KISA tek kaynak; DurtmeZili '../lib/format' importu (GOREV-034 yorumu); rontgen.tsx yerel tanımsız + re-export'suz (koruyucu yorum satır 7) — repo grep'inde başka tanım YOK. index statik import + modulepreload'da vendor-charts YOK, rontgen 23.9 kB lazy chunk'a düştü (RAPOR ham kanıtları). Eager kümülatif −%58.3 — 033 öngörüsünü aştı. tsc 0 + build yeşil; $0; beyanla birebir. Rota.tsx AY_KISA kopyası önerisi backlog'a (ilk Rota kartına binecek).
