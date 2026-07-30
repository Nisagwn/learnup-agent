---
gorev: GOREV-030-vendor-three-scheduler-hoist
kimden: ORKESTRATÖR
kime: FRONTEND
durum: onaylandi
oncelik: P2   # perf — kabuk 900 kB'lık vendor-three'yi eager çekiyor
bagimlilik: []   # BAŞLATILABİLİR — vite.config.js'e dokunan başka aktif kart yok
dokunulan-dosyalar:
  - frontend-v2/vite.config.js
migration-gerekli: hayir
---

## Amaç
GOREV-024 denetiminde HEAD-kıyas build'iyle kanıtlanan ÖNCEDEN-VAR bulgunun düzeltilmesi:
rolldown, React'ın paylaşılan `scheduler` modülünü `vendor-three` chunk'ına hoist ediyor →
`index-*.js` kabuk chunk'ı 900 kB'lık vendor-three'yi EAGER import ediyor; three'nin
lazy'liği pratikte deliniyor.

## Bağlam
- Kanıt: `arsiv/GOREV-024-bahcem-ekrani-fidan.md` RAPOR §3 (three imzası yalnız vendor-three'de;
  index'in importu `scheduler`/`unstable_now` içindir; HEAD'de de aynı).
- **KRİTİK (GOREV-005 kararı):** vite 8/rolldown'da `manualChunks` Object DEĞİL **FONKSİYON**
  olmalı — fonksiyon formu bozulmaz, Object'e dönülmez.
- `vite.config.js` GOREV-005'in ONAYLI işiyle kirli — yalnız bu kartın işi eklenir.

## Kabul Kriterleri
- [x] `manualChunks` fonksiyonunda `scheduler` (ve gerekiyorsa `react-reconciler`/`its-fine` gibi
      three-dışı paylaşılanlar) react vendor chunk'ına açıkça atanır — fonksiyon formu KORUNUR
      (yalnız `scheduler` atandı; reconciler/its-fine "gerek" koşulunu OLUŞTURMADI — gerekçe RAPOR'da)
- [x] **Kanıt:** build sonrası `index-*.js` içinde `vendor-three` importu YOK (grep çıktısı RAPOR'a);
      `WebGLRenderer` imzası hâlâ YALNIZ vendor-three'de; Bahce/Bahce3D lazy zinciri çalışır
- [x] Chunk boyutları RAPOR'a (önce/sonra — kabuk eager toplamının küçüldüğü gösterilir)
- [x] `tsc --noEmit` sıfır hata + `bun run build` yeşil → HAM çıktılar RAPOR'da; **$0**

## Kısıtlar / Kapsam Dışı
- Yeni vendor chunk stratejisi icat edilmez — yalnız hoist düzeltmesi.
- Kaynak koduna (src/**) dokunulmaz.

## Başlangıç Durumu
- Git rev: `5c2610e`; kirli ağaç (onaylı işler — kullanıcı commit'i bekleniyor).
  İlk adım: `git diff --stat -- frontend-v2/vite.config.js` fotoğrafı RAPOR'a.

## Onay Kayıtları
- Paralı koşu: GEREKMEZ ($0).

## RAPOR

### Yapılan
`frontend-v2/vite.config.js` `manualChunks` FONKSİYONUNA (form korundu — GOREV-005) tek satırlık
açık atama eklendi: `scheduler` → **`vendor-react`** chunk'ı. Böylece react-dom'un eager ihtiyaç
duyduğu paylaşılan modül vendor-three'den çıktı; kabuk artık 3.6 kB'lık vendor-react'ı çekiyor,
900 kB'lık vendor-three YALNIZ Bahçem lazy zincirinden yükleniyor.

**`react-reconciler`/`its-fine` BİLEREK atanmadı** (kartın "gerekiyorsa" koşulu): bu modülleri
yalnız `@react-three/fiber` (lazy zincir) kullanıyor; index'in vendor-three'den çektiği TEK şey
`scheduler`dı (GOREV-024 kanıtı). Onları eager `vendor-react`'a almak kabuğu gereksiz BÜYÜTÜRDÜ.
Düzeltme sonrası index importlarında vendor-three'nin tamamen kaybolması bu kararın yeterli
olduğunu kanıtlıyor (aşağıda).

### Başlangıç fotoğrafı (kartın istediği ilk adım)
`git diff --stat -- frontend-v2/vite.config.js` (bu kart ÖNCESİ — GOREV-005'in onaylı işi):
```
 frontend-v2/vite.config.js | 17 +++++++++++++++++
 1 file changed, 17 insertions(+)
```
Bu kart SONRASI: `24 insertions(+)` (fark: +7 satır = 1 atama satırı + 6 satır gerekçe yorumu).

### Koşulan kapılar + HAM çıktılar
1. `tsc --noEmit` → `TSC_EXIT=0`
2. `bun run build` (ilgili satırlar):
```
dist/assets/vendor-react-0FxiP1YH.js     3.61 kB │ gzip:   1.61 kB
dist/assets/Bahce3D-CE92RfqS.js         11.11 kB │ gzip:   3.11 kB
dist/assets/Bahce-TULbhdYA.js           50.30 kB │ gzip:  14.70 kB
dist/assets/index-CD4ItuMI.js          450.45 kB │ gzip: 141.72 kB
dist/assets/vendor-three-BgtuSQai.js   897.32 kB │ gzip: 238.79 kB
✓ built in 1.60s
```

### Kanıtlar (HAM)
- **index'te vendor-three importu KAYBOLDU:**
  `grep -o 'import{...}from"./vendor-three..."' index-CD4ItuMI.js` → `YOK (kayboldu)`.
  Dosyadaki tek metinsel `vendor-three` geçişi `__vite__mapDeps` dizisinde (dinamik import
  URL tablosu — eager yükleme DEĞİL): `...,"assets/vendor-three-BgtuSQai.js","assets/vendor-react-0FxiP1YH.js",...`
- **index'in eager import seti (sonra):** rolldown-runtime · vendor-charts · **vendor-react** ·
  api · vendor-katex · auth · ui · vendor-motion · cn — vendor-three LİSTEDE YOK.
  (Önce: aynı liste, vendor-react yerine **vendor-three** vardı.)
- **`WebGLRenderer` imzası:** `grep -l "WebGLRenderer" dist/assets/*.js` → yalnız
  `vendor-three-BgtuSQai.js`.
- **Lazy zincir çalışıyor:** `Bahce-*.js` mapDeps'i `Bahce3D-CE92RfqS.js`'i işaret ediyor;
  `Bahce3D-*.js` → `from"./vendor-three-BgtuSQai.js"`.
- **vendor-react içeriği scheduler:** `unstable_now` imzası vendor-react'ta (1 geçiş).

### Chunk boyutları — önce/sonra (bayt; aynı kaynak, yalnız config farkı)
| Chunk | Önce | Sonra |
|---|---|---|
| KABUK eager: vendor-three | **900 814 (EAGER)** | — (eager listeden çıktı) |
| KABUK eager: vendor-react | — | **3 614** |
| index | 450 429 | 450 457 |
| vendor-three (artık yalnız lazy) | 900 814 | 897 329 |
**Kabuk eager JS net değişimi: −897 200 bayt ham (~−237 kB gzip)** — three artık gerçekten
yalnız Bahçem'e girince iniyor.

### Gerçekleşen maliyet
$0 — paralı koşu yok.

### Açık riskler
- Kabuğun eager seti hâlâ ağır (vendor-charts 397 kB + vendor-katex 390 kB + api 207 kB eager
  yükleniyor — muhtemelen benzer hoist/iç içe bağımlılık etkileri). KAPSAM DIŞI bırakıldı
  (kart: "yeni vendor chunk stratejisi icat edilmez"); ayrı inceleme kartı önerilir.
- Önce-ölçümündeki hash'ler GOREV-024 RAPOR'undakinden farklı: aradaki paralel ajan build'i
  (Harita/rontgen işi) dist'i yenilemişti; önce-değerleri bu kartın DEĞİŞİKLİĞİNDEN hemen önceki
  build'den alındı — kıyas temiz.

### Sonraki adım önerisi
- Kabuk eager setinin (charts/katex'in index'e statik bağlanma nedeni) profillenmesi için ayrı
  P3 kartı: rota-bazlı kullanılan recharts/katex'in gerçekten eager gerekip gerekmediği ölçülsün.

## Günlük
- 2026-07-23 · ORKESTRATÖR · kart açıldı (kaynak: GOREV-024 RAPOR bulgusu; GOREV-024'ü bitiren ajana zincirlendi — bağlam hazır)
- 2026-07-23 · FRONTEND · alindi
- 2026-07-23 · FRONTEND · tamamlandi (index'te vendor-three importu kayboldu; kabuk eager JS −897 kB ham/−237 kB gzip; kapılar yeşil, kanıtlar RAPOR'da)
- 2026-07-23 · ORKESTRATÖR · onaylandi + arşiv. Denetim kanıtı: vite.config.js diff bizzat okundu — manualChunks FONKSİYON formu korunmuş (GOREV-005 kararı), scheduler→vendor-react tek açık atama + NEDEN'li yorum; react-reconciler/its-fine'ın bilinçli dışarıda bırakılması (yalnız lazy fiber zinciri) gerekçesiyle KABUL. Kabuk eager setinden −897 kB ham / ~−237 kB gzip; WebGLRenderer yalnız vendor-three'de, lazy zincir sağlam (RAPOR ham kanıtları). tsc 0 + build yeşil; $0; yalnız beyanlı dosya.
