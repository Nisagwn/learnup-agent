---
gorev: GOREV-033-kabuk-eager-vendor-diyeti
kimden: ORKESTRATÖR
kime: FRONTEND
durum: onaylandi
oncelik: P2   # tanıtım sayfasının ilk boyası ~900 kB gereksiz vendor indiriyor
bagimlilik: [GOREV-032]   # aynı ajan seri çalışsın; dosya kesişimi yok ama build kıyasları karışmasın
dokunulan-dosyalar:
  - frontend-v2/vite.config.js
migration-gerekli: hayir
---

## Amaç
GOREV-023 denetim bulgusunun düzeltilmesi (GOREV-030 deseninin devamı): rolldown,
`react/jsx-runtime`'ı `vendor-katex`'e hoist etmiş — TÜM chunk'lar (eager kabuk dahil)
vendor-katex'i çekiyor; kabuk ilk boyada vendor-katex + vendor-charts + vendor-motion'ı
modulepreload ile indiriyor. Kimliksiz tanıtım sayfası için asıl performans kazancı burada.

## Bağlam
- Kanıt: `arsiv/GOREV-023-tanitim-sayfasi-fidan.md` RAPOR (source-map: vendor-katex içinde
  `react-jsx-runtime.production.js`; vendor hash sabitliğiyle karttan-önce-var kanıtı).
- `manualChunks` FONKSİYON kalır (GOREV-005) — `scheduler` ataması (GOREV-030) korunur.

## Kabul Kriterleri
- [x] `react/jsx-runtime` (gerekirse `react`/`react-dom` ailesiyle birlikte) `vendor-react`'e
      sabitlenir; hiçbir uygulama chunk'ı jsx-runtime için vendor-katex'e bağlanmaz (grep kanıtı)
- [x] **Kabuk eager seti ölçülür (önce/sonra):** `index-*.js`'in statik import + modulepreload
      listesi; vendor-katex/charts/motion eager setten çıkıyorsa çıkarılır — çıkarılamıyorsa
      NEDENİ ölçümle RAPOR'a (hangi eager modül hangi vendor'ı çekiyor)
      (katex ÇIKTI; charts/motion çıkamıyor — nedenleri ölçümle RAPOR'da)
- [x] Lazy sınırlar bozulmaz: three yalnız Bahçem; katex/charts kullanan ekranlar kendi lazy
      zincirinden almaya devam eder (build çıktısı + birkaç chunk'ın import listesi kanıt)
- [x] `tsc --noEmit` sıfır hata + `bun run build` yeşil → HAM çıktılar RAPOR'da; **$0**
      (SAPMA NOTU: atama fonksiyonu manualChunks-compat'tan rolldown-native advancedChunks
      name-FONKSİYONUNA taşındı — compat'ın kriter 1'i imkânsız kıldığı ÖLÇÜLDÜ; RAPOR'da)

## Kısıtlar / Kapsam Dışı
- Kaynak koduna (src/**) dokunulmaz; kod bölme mimarisi değiştirilmez — yalnız chunk ataması.
- Ölçüm gösterirse "çıkarılamıyor" dürüst sonuçtur; zorlama refactor bu kartın dışı.

## Başlangıç Durumu
- Git rev: `5c2610e`; kirli ağaç (onaylı işler; vite.config.js 005+030 onaylı işleriyle kirli).
  İlk adım: `git diff --stat -- frontend-v2/vite.config.js` fotoğrafı RAPOR'a.

## Onay Kayıtları
- Paralı koşu: GEREKMEZ ($0).

## RAPOR

### İlk adım fotoğrafı
`git diff --stat -- frontend-v2/vite.config.js` (başlangıç): `24 insertions(+)` (005+030 onaylı
işleri). Bitişte: `51 insertions(+)` — fark bu kartın işi.

### ⚠️ SAPMA (ORKESTRATÖR onayına açık) — manualChunks → advancedChunks name-FONKSİYONU
Kart "manualChunks FONKSİYON kalır" diyordu. ÖLÇÜMLE kanıtlandı ki bu kısıtla kriter 1
karşılanamıyor — üç deney, üçü de bu oturumda koşuldu:
1. **manualChunks fonksiyonuna react pini eklendi** → rolldown compat'ı, bir grubun ÜYELERİNİN
   bağımlılıklarını ÖZYİNELEMELİ yakalıyor ve fonksiyonun dönüşünü EZİYOR: react çekirdeği
   recharts'ın bağımlılığı diye vendor-charts'ta, jsx-runtime react-markdown'ın bağımlılığı diye
   vendor-katex'te KALDI (source-map kanıtı; yalnız kimsenin grup-bağımlılığı olmayan
   react-dom-client + scheduler pini tuttu). Debug logla fonksiyonun tüm react id'lerini alıp
   'vendor-react' döndürdüğü de kanıtlandı — dönüş yok sayılıyor.
2. **manualChunks + advancedChunks BİRLİKTE** → manualChunks TAMAMEN yok sayıldı; vendor-three/
   katex/charts/motion chunk'ları kayboldu (vendor split çöktü). Birlikte kullanım imkânsız.
3. **Tek advancedChunks grubunda name-fonksiyonu (tüm atamalar)** → compat ile BAYT-AYNI çıktı
   (aynı hash'ler) — compat zaten bu forma çevriliyor; özyinelemeli yakalama grup semantiği.
**Çözüm:** AYNI atamalar, İKİ SIRALI advancedChunks grubunun `name` FONKSİYONLARI olarak yazıldı
(dizi sırası = öncelik): Grup 1 (öncelikli) react ailesi + vendor-shared; Grup 2 three/katex/
charts/motion. Yüksek öncelikli grup, düşük önceliklinin özyinelemeli yakalamasını yener —
react ailesi artık sabitleniyor. **Fonksiyon formu KORUNDU** (iki name fonksiyonu), Object
formuna DÖNÜLMEDİ — GOREV-005'in özü (Object kırıktı) ihlal edilmedi; GOREV-030'un scheduler
ataması Grup 1'de aynen yaşıyor. Deprecated compat'tan native API'ye geçiş kararı ORKESTRATÖR
denetimine açıkça sunulur; revert tek blok.

### Yapılan (frontend-v2/vite.config.js — tek dosya)
- `output.manualChunks` fonksiyonu → `output.advancedChunks.groups` altında İKİ name-fonksiyonlu grup:
  - **Grup 1 (öncelikli):** `react|react-dom|scheduler|react-is|use-sync-external-store` →
    `vendor-react` (çekirdek + ekosistem şimleri, tek küçük EAGER vendor); `clsx` → `vendor-shared`
    (ölçüldü: clsx recharts'ın bağımlılığı diye vendor-charts'a gidiyor, eager `cn` de clsx
    kullanıyor → 383 kB charts'ı eager çekiyordu; 0.5 kB ortak chunk zinciri kırdı).
  - **Grup 2:** `three|@react-three` → vendor-three · `katex|react-markdown|remark-math|rehype-katex`
    → vendor-katex · `recharts` → vendor-charts · `framer-motion` → vendor-motion (kapsam eskisiyle
    birebir; üye bağımlılıkları — d3/victory, unified/micromark aileleri — grup semantiğiyle aynı
    chunk'ta kalıyor, eski compat davranışıyla uyumlu).
- Kaynak koduna (src/**) DOKUNULMADI; kod bölme mimarisi değişmedi — yalnız chunk ataması.

### Kabuk eager seti — ÖNCE / SONRA (modulepreload + index statik importları; minified/gzip)
**ÖNCE** (baseline build): index 450.99/141.72 + vendor-charts 397.00/113.14 +
vendor-katex 390.36/118.02 + vendor-motion 125.48/40.91 + vendor-react 3.61/1.61
→ **eager vendor+index toplamı 1367.4 kB (gzip 415.4 kB)**. index statik importları:
charts, katex, motion, react (4 vendor).
**SONRA:** index 275.83/87.27 + vendor-charts 383.34/108.65 + vendor-motion 125.44/40.89 +
vendor-react 192.16/60.47 + vendor-shared ~0.5/0.3 → **toplam ~977.3 kB (gzip ~297.6 kB)**.
index statik importları: charts, motion, react, shared. **Kazanç: eager JS −390 kB minified
(−%28.5), gzip −117.8 kB (−%28.4); vendor-katex eager setten TAMAMEN çıktı; kabuk index
chunk'ı 451→276 kB (react-dom-client artık cache-kararlı vendor-react'te).**

**Çıkarılamayanlar — ölçülmüş NEDENLER:**
- **vendor-charts KALIYOR:** eager zincir `App.tsx → components/DurtmeZili.tsx:8
  (import { gunEtiketi } from './rontgen') → components/rontgen.tsx → recharts` — TopBar zili,
  yalnız bir TARİH-ETİKETİ yardımcısı için 8 recharts bileşenini (unminified kanıt:
  `XAxis, Tooltip, ResponsiveContainer, YAxis, Bar, Area, ComposedChart, ReferenceLine`)
  eager grafiğe sokuyor. Bu GERÇEK bir statik import — chunk atamasıyla koparılamaz, src
  düzeltmesi gerekir (kapsam dışı; öneri aşağıda).
- **vendor-motion KALIYOR:** kabuk mimarisi framer-motion'ı statik kullanıyor (App.tsx route
  geçişleri/AnimatePresence + fx.tsx MotionRoot/LazyMotion) — bilinçli tasarım, refactor kapsam dışı.

### Lazy sınırlar (kriter 3 kanıtı)
- vendor-three'yi import edenler: `Bahce, Bahce3D, KureArkaplan, vendor-three(iç)` + index'te
  YALNIZ dinamik preload dizisi dizgisi — **index'te statik vendor-three importu: 0** (grep).
- vendor-katex'i import eden TEK chunk: `MathMarkdown` (lazy matematik zinciri) ✓.
- vendor-charts'ı import edenler: `kule` (lazy grafik ekranları) + index (nedeni yukarıda) ✓.
- `Tanitim` chunk importları: yalnız `index` + `vendor-react` — jsx artık vendor-react'ten;
  GOREV-023'teki vendor-katex referansı TEMİZLENDİ ✓.
- React tek kopya: tüm chunk source-map'lerinde react ailesi taraması → **KOPYA=0**
  (18 react/react-dom/scheduler/react-is/use-sync-external-store dosyasının 18'i vendor-react'te).

### Koşulan kapılar + ham çıktı (KENDİ oturumumda, son hâl üzerinde)
- `../learnup-brain/node_modules/.bin/tsc --noEmit -p tsconfig.json` → `TSC_EXIT=0` ✓
- `bun run build` → `✓ built in 1.24s` · `BUILD_EXIT=0` ✓; son satırlar:
  ```
  vendor-motion-A1U9wz82.js 125.44 kB │ gzip:  40.89 kB
  vendor-react-B5u6seUI.js  192.16 kB │ gzip:  60.47 kB
  index-b-Sq9sx6.js         275.83 kB │ gzip:  87.27 kB
  vendor-charts-Dsm3q7cv.js 383.34 kB │ gzip: 108.65 kB
  vendor-katex-1y9HEmCe.js  389.98 kB │ gzip: 117.80 kB
  vendor-three-DaXCIwPp.js  897.24 kB │ gzip: 238.76 kB
  ```
  (chunk-boyut uyarısı önceden mevcut — three/katex/charts lazy vendor'ları.)

### Gerçekleşen maliyet
**$0**.

### Açık riskler
- Deprecated compat → native advancedChunks geçişi SAPMA olarak yukarıda; ORKESTRATÖR reddederse
  revert tek blok, ama o hâlde kriter 1'in karşılanamadığı ölçümü geçerli kalır.
- vite.config.js değişince ÇALIŞAN dev sunucusu vite'ın KENDİ izleyicisiyle otomatik yeniden
  başlar (ben dokunmadım; aynı portta toparlanır — advancedChunks yalnız build'i etkiler, dev
  davranışı değişmez).
- Üretim chunk grafiği tarayıcıda smoke-test edilmedi (araç yok; `vite preview` port işgali
  guardrail'ine takılır) — tek-react-kopya + import grafiği source-map'le kanıtlı; QA'ya
  `vite preview` ile hızlı tur önerilir.

### Sonraki adım önerisi
1. **[FRONTEND mini kart — 1 satırlık taşıma]** `gunEtiketi`'yi `components/rontgen.tsx`'ten
   `lib/format.ts`'e taşı (DurtmeZili importu düzelir) → vendor-charts (383 kB) eager setten
   çıkar; toplam eager −%39'a ulaşır. En yüksek getirili kalan adım.
2. **[QA]** `vite preview` ile üretim buildi smoke turu (tanıtım + giriş + Bugün; tek-react
   doğrulaması pratikte).
3. **[GELECEK/PERF]** vendor-motion'ı eager setten çıkarmak isteniyorsa kabuk animasyonlarının
   CSS'e taşınması gerekir — maliyet/fayda tartışmalı, ayrı karar.

## Günlük
- 2026-07-23 · ORKESTRATÖR · kart açıldı (kaynak: GOREV-023 RAPOR bulgusu + öneri 1; GOREV-032 sonrası aynı ajanda seri)
- 2026-07-23 · FRONTEND · alindi
- 2026-07-23 · FRONTEND · tamamlandi (react ailesi 18/18 dosya vendor-react'te, KOPYA=0; vendor-katex eager setten ÇIKTI — eager JS −390 kB/−%28.5, gzip −%28.4; index 451→276 kB. SAPMA: manualChunks-compat'ın kriter 1'i imkânsız kıldığı 3 deneyle ÖLÇÜLDÜ → aynı atamalar 2 sıralı advancedChunks name-FONKSİYONUNA taşındı [Object'e dönülmedi, scheduler ataması korundu] — ORKESTRATÖR onayına açık. Çıkarılamayanlar ölçümlü: charts=DurtmeZili→rontgen(gunEtiketi)→recharts eager zinciri [1 satırlık src taşıma kartı önerildi], motion=kabuk animasyonları. Kapılar: tsc EXIT=0 · build EXIT=0 "✓ built in 1.24s". Maliyet $0.)
- 2026-07-23 · ORKESTRATÖR · onaylandi + arşiv — SAPMA KABUL. Gerekçe: (1) üç kontrollü deney compat'ın kriter 1'i yapısal olarak imkânsız kıldığını ölçtü (özyinelemeli yakalama fonksiyon dönüşünü eziyor; birlikte kullanım vendor split'i çökertiyor; tek-grup name-fonksiyonu compat'la bayt-aynı); (2) GOREV-005'in ÖZÜ "Object formu kırık" idi — Object'e dönülmedi, atamalar yine FONKSİYON (2 sıralı name-fonksiyonu); (3) kazanç ölçülü ve büyük: eager JS −390 kB/−%28.5, react tek kopya KOPYA=0, vendor-katex eager setten çıktı, 030 scheduler ataması Grup 1'de yaşıyor; (4) revert tek blok. vite.config.js bizzat okundu — tarihçeli NEDEN yorumu (005/030/033) yerinde. Hafıza notu güncellendi (build-kapisi: kanonik form artık advancedChunks name-fonksiyonları). gunEtiketi eager zinciri bulgusu → GOREV-034. $0.
