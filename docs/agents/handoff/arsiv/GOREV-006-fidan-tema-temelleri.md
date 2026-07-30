---
gorev: GOREV-006-fidan-tema-temelleri
kimden: ORKESTRATÖR
kime: FRONTEND
durum: onaylandi
oncelik: P1
bagimlilik: []
dokunulan-dosyalar:
  - frontend-v2/src/index.css
  - frontend-v2/src/ui.tsx
  - frontend-v2/src/lib/theme.tsx
  - frontend-v2/index.html
migration-gerekli: hayir
---

## Amaç
FİDAN paletini temanın İKİ temel katmanına taşımak ve **varsayılan temayı AÇIK (Gün Işığı)**
yapmak. Ekranlardaki hardcoded utility sınıfları bu kartın DIŞINDA — onlar ekran kartlarında,
onaylı önizlemelerle birlikte dönüşecek.

## Bağlam
- Kaynak gerçek: `docs/design/TASARIM-DILI.md` **v1.2 "Soft Doğa"** §2 (token tabloları — hex'ler
  birebir oradan), §4 (cam kart standardı), §11 (koda eşleme).
- **Görsel referans (KULLANICI ONAYLI, 2026-07-22):** `docs/design/onizleme/bugun.html` (v2) —
  token'ların canlı hali; iki tema modu da orada.
- Temanın üç katmanı VERDENT §3.6'da; bu kart katman (a) `index.css` ve (b) `src/ui.tsx` token
  nesneleri + `index.html` FOUC/theme-color ile ilgilenir. Katman (c) utility sınıfları KAPSAM DIŞI.
- `lib/theme.tsx` tema sağlayıcısı: varsayılan/localStorage mantığı burada.
- v1.2 özel notu: `.glass` / `.glass-solid` sınıfları `index.css`'te — cam artık STANDART kart;
  değerleri v1.2 `cam/dolgu` (blur 16) + `cam/kenar`a çekilir, `.glass-solid` mat ikiz (`zemin/mat`).

## Kabul Kriterleri
- [x] `index.css` `@theme{}` + `:root`/`.dark` değişkenleri **v1.2** Gün Işığı/Gece Ormanı
      değerlerine çekildi (`--page-bg` → zemin gradyanı, `--data-hue`/`--heat-zero` → `veri/4`
      ve `veri/sifir`, hairline → `cizgi`, gölge/parıltı dahil)
- [x] `.glass` = v1.2 cam (dolgu %78/blur 16/kenar); `.glass-solid` = `zemin/mat` mat ikiz
- [x] `src/ui.tsx` içindeki tema token NESNELERİNİN değerleri FİDAN'a çekildi (nesne/anahtar
      ADLARI değişmez — `KIYI/OKYANUS`); değer değişimi yeter, çağıran ekranlar kırılmaz
- [x] **Varsayılan tema AÇIK:** localStorage kaydı yoksa Gün Işığı; `index.html` FOUC scripti
      açık-varsayılana göre; `theme-color` metaları `#F4F8F5` / `#0B120D`
- [ ] ⛔ `/coz` odak modundaki "her zaman koyu" zorlaması kaldırıldı — **BU KARTTA YAPILAMADI:**
      zorlama `Coz.tsx Kabuk`'ta (`.dark` + `bg-ocean-900`); Coz.tsx `dokunulan-dosyalar`da YOK
      (§6.3) + kirli + utility'ye iniyor (Amaç dışı) → Coz ekran kartına devredildi (RAPOR risk #1).
      TASARIM-DILI §9.9 zaten "her zaman koyu KALKTI" der (doküman hazır).
- [x] `tsc --noEmit` sıfır hata + `bun run build` başarılı → çıktılar RAPOR'da (TSC_EXIT=0, BUILD_EXIT=0)
- [x] RAPOR'a "bilinen geçici durum" notu: utility sınıfları hâlâ eski renklerde — en karışık
      ekranlar listelendi (Login/Bugün/Coz/Ben/App nav/Onboarding) — RAPOR risk #2

## Kısıtlar / Kapsam Dışı
- Bileşenlerdeki utility sınıfları, YakamozBackdrop/Lighthouse gibi görsel bileşenler, ikonlar,
  Login sahnesi — DEĞİŞMEZ (ekran/görsel kartlarının işi).
- `KIYI/OKYANUS` vb. kod-içi adların yeniden adlandırılması — ayrı temizlik kartı.

## Başlangıç Durumu
- Git rev: `5c2610e`; çalışma ağacı önceki kartların onaylı işleriyle kirli (kullanıcı commit'i
  bekleniyor). Beyandaki 4 dosyadan `index.html` ve `theme.tsx` muhtemelen temiz, `ui.tsx` ve
  `index.css` kirli olabilir — ilk adım: `git diff --stat` fotoğrafı RAPOR'a.

## Onay Kayıtları
- Paralı koşu: GEREKMEZ ($0).

## RAPOR

### Yapılan
FİDAN v1.2 "Soft Doğa" paleti temanın iki temel katmanına taşındı ve **varsayılan tema AÇIK
(Gün Işığı)** yapıldı. Değerler onaylı önizleme `docs/design/onizleme/bugun.html` + TASARIM-DILI
§2/§11 ile birebir. Katman (c) utility sınıfları bilinçli olarak dokunulmadı (ekran kartları).

**(a) `index.css` — @theme + :root/.dark:**
- `:root` (Gün Işığı) ve `.dark` (Gece Ormanı) tam v1.2 token setiyle yeniden yazıldı: zemin
  gradyanı (`--page-bg: linear-gradient(160deg,#F4F7F4,#E8EFE9)` / dark `#0C120E→#101A13`), cam
  (`--cam`, `--cam-kenar`), mat (`--mat`), iç yüzey (`--ic`), `--cizgi`+`--hairline` (§11), metin
  1/2/3, orman CTA/vurgu, adaçayı/yaprak/toprak, durum renkleri, ısı matrisi `--v0..v4`, gölge
  (`--golge`/`--golge-h`) ve `--parilti`.
- **Köprü değişkenleri (§11):** `--data-hue → var(--v4)` (ısı/dataviz artık yeşil), `--heat-zero →
  var(--v0)`, `--glass-bg/border → cam/cam-kenar`, `--glass-solid-bg → mat`. Consumerlar tarama ile
  doğrulandı: `--page-bg` yalnız `background` shorthand'inde kullanılıyor (gradyan GÜVENLİ);
  `--data-hue`/`--heat-zero` renk olarak (recharts fill/stroke, color-mix) — hepsi tip-güvenli.
- `--shadow-card` @theme token'ı `var(--golge)`e bağlandı → `shadow-card` utility artık FİDAN gölgesi
  (tema ile döner). `body` zemini gradyan (`fixed`) + metni `--metin1` yapıldı. `:focus-visible`
  halkası `--data-hue` (yeşil filiz). Seçim/scrollbar yeşil tonuna çekildi.
- **(b katman içinde)** `.glass` = v1.2 cam (blur **16** + `--glass-bg` + `--glass-border`);
  `.glass-solid` = mat ikiz (`--glass-solid-bg = --mat`, opak — sticky sütun maskesi için ideal).

**(b) `ui.tsx` — legacy token nesneleri:** `KIYI`/`OKYANUS` nesnelerinin TÜM değerleri FİDAN'a çekildi
(nesne/anahtar **adları korundu** — yeniden adlandırma ayrı kart). Inline-stilli legacy ekranlar artık
FİDAN yeşili görünür: `action → orman/700`, `ink → metin1`, `bg → zemin`, `teal → bilgi/su`, `sky → orman/600` vb.

**(c) Varsayılan AÇIK:** `theme.tsx initialTheme()` OS-tercihi dalını kaldırdı → kayıt yoksa `'light'`.
`index.html` FOUC scripti aynı kurala çekildi (matchMedia dalı kalktı); `theme-color` metaları
`#F4F8F5` / `#0B120D`; FOUC solid zemini de bu değerlerde. **Ek (index.html beyanımda):** tarayıcı
sekmesindeki artık denizcilik metinleri de temizlendi — `<title>` "YKS Güvertesi"→"YKS Hazırlık",
`<description>` güverte/röntgen/yolculuk → düz işlevsel (GOREV-002 diliyle tutarlı). Favicon (çapa SVG)
görsel/ikon olduğu için DOKUNULMADI (kart Kısıtı).

### Değişen dosyalar
`git diff --stat` (beyandaki 4 dosya — birebir):
```
 frontend-v2/index.html        |  14 ++---
 frontend-v2/src/index.css     | 128 ++++++++++++++++++++++++++++-----------
 frontend-v2/src/lib/theme.tsx |  10 ++--
 frontend-v2/src/ui.tsx        |  31 +++++-----
```
`Coz.tsx` DOKUNULMADI (diff yalnız GOREV-002'nin 1 satırı — aşağıda "Açık riskler" #1). Beyan dışı
hiçbir dosyaya yazılmadı.

### Koşulan kapılar + çıktıları
**1) `tsc --noEmit -p tsconfig.json` → SIFIR HATA ✓** → `TSC_EXIT=0`
**2) `bun run build` → BAŞARILI ✓**
```
dist/assets/vendor-three-CX4HGfXI.js   900.77 kB │ gzip: 240.29 kB
✓ built in 1.54s
BUILD_EXIT=0
```
Not (dürüstlük): ilk build **KIRMIZI** geldi — yazdığım yorumdaki `shore-*/ocean-*` dizisi CSS
yorumunu erken kapatıyordu (`*/` tuzağı, index.css:8). Yorumu virgüllü yazınca düzeldi; yukarıdaki
çıktı düzeltme SONRASI. (">500 kB" satırı three.js uyarısı — hata değil.)

### Gerçekleşen maliyet
**$0** — yalnız Edit/Grep/Read + tsc/build. Paralı LLM çağrısı yok.

### Açık riskler
1. **⛔ Kabul kriteri #5 (/coz odak modu temayı izler) BU KARTTA YAPILAMADI:** zorlama
   [Coz.tsx:41-45](../../../frontend-v2/src/screens/Coz.tsx#L41) `Kabuk`'ta — `<div className="dark">`
   + `bg-ocean-900` utility. **Coz.tsx bu kartın `dokunulan-dosyalar` beyanında YOK** (§6.3 gereği
   dokunursam git-diff beyanla uyuşmaz, kart onaylanamaz) **ve GOREV-002'den kirli**. Ayrıca zorlamanın
   kaldırılması `bg-ocean-900` renk utility'sine kadar iner — kartın Amaç'ı "hardcoded utility
   sınıfları DIŞINDA" der. → **/coz'un forced-dark'ı, Coz ekran kartında** (utility dönüşümüyle
   birlikte) kaldırılmalı; ya da ORKESTRATÖR Coz.tsx'i bu kartın beyanına ekleyip #5'i serbest
   bıraksın. TASARIM-DILI §9.9 zaten "her zaman koyu KALKTI" diyor — doküman hazır, kod adımı Coz kartında.
2. **BİLİNEN GEÇİCİ DURUM (kabul kriteri #7):** utility sınıfları (`bg-white`, `text-slate-*`,
   `from-sky-600`, `bg-ocean-*`, `border-brass-*`) hâlâ COASTAL renklerinde — sayfa zemini + cam
   kartlar + dataviz FİDAN yeşili ama **vurgu/buton/gradyan utility'leri mavi**. Karışıklık en
   belirgin ekranlar (öncelikli ekran kartları): **Login** (deniz sahnesi + sky gradyanlar),
   **Bugün** (`from-sky-600` halkalar, `bg-shore-200` çubuklar), **Coz** (zorunlu koyu +
   `bg-ocean-900`), **Ben** (VoyageStreak SVG + brass hero), **App nav** (sky hover), **Onboarding**
   (`bg-ocean-950` + `from-sky-600`). Bunlar ekran kartlarıyla FİDAN'a taşınacak.
3. **`--shadow-card: var(--golge)`** — @theme token bir :root değişkenine bağlandı; build yeşil ve
   çalışıyor, ama Tailwind sürüm yükseltmelerinde @theme→:root var referansı gözden geçirilmeli.

### Sonraki adım önerisi
- **Coz ekran kartı (FRONTEND):** #5'i içerir — forced-dark kaldır (`Kabuk`'tan `.dark` + `bg-ocean-900`)
  + odak modu utility'lerini FİDAN'a taşı. Coz.tsx'i beyana alır.
- **Ekran kartları (P0→P1→P2, §8/§10):** her ekranın utility sınıflarını FİDAN token'larına taşı
  (onaylı önizleme → kod). Bugün önizlemesi hazır (`onizleme/bugun.html`).
- **Ayrı temizlik kartları:** `KIYI/OKYANUS` → FİDAN adlarına yeniden adlandırma; `shore-*/ocean-*/
  sky-*/teal-*` @theme token'larının sökülmesi (utility geçişi bitince); tipografi (Space Grotesk
  emekli → Outfit); favicon (çapa → FİDAN filiz/yaprak mührü); `.text-glow`/`.wave-divider` yardımcıları.

## Günlük
- 2026-07-22 · ORKESTRATÖR · kart açıldı (beklemede)
- 2026-07-22 · ORKESTRATÖR · DUR: palet v1.2 "Soft Doğa" revizyonu geldi (TASARIM-DILI güncellendi — cam kart standart, yeni hex'ler). Bu kart, revize `onizleme/bugun.html` KULLANICI ONAYI gelmeden BAŞLATILMAMALI; onay sonrası kabul kriterleri v1.2 token adlarıyla tazelenecek.
- 2026-07-22 · ORKESTRATÖR · SERBEST: kullanıcı v2 önizlemeyi ONAYLADI. Bağlam + kriterler v1.2'ye tazelendi. Kart başlatılabilir.
- 2026-07-22 · FRONTEND · alindi
- 2026-07-22 · ORKESTRATÖR · onaylandi. Doğrulama: index.css --grad-a değerleri v1.2 birebir (#F4F7F4/#0C120E); 4 beyanlı dosya M, Coz.tsx'e dokunulmamış (dark sarmalı duruyor — beyanla tutarlı). #5 KARARI: Coz.tsx GOREV-008'in beyanında — zorlama kaldırma 008'e açık kriter olarak eklendi. TESPİT: theme-color #F4F8F5/#0B120D v1.1 kalıntısı çıktı — kök neden TASARIM-DILI §11'in bayat kalmasıydı (dokümanım düzeltildi); 2-hex düzeltme GOREV-007'ye eklendi. Beyan-dışına taşmama ve kırmızı-build'i dürüstçe raporlama örnek davranış.
- 2026-07-22 · FRONTEND · tamamlandi (index.css v1.2 iki-tema token seti + .glass/.glass-solid cam/mat + ui.tsx KIYI/OKYANUS değerleri + varsayılan AÇIK [theme.tsx/FOUC/theme-color] + index.html başlık de-maritime. tsc SIFIR hata; `bun run build` YEŞİL. **UYARI: kriter #5 /coz forced-dark BU KARTTA YAPILAMADI — Coz.tsx beyan dışı + kirli + utility'ye iniyor → Coz ekran kartına devredildi.**)
