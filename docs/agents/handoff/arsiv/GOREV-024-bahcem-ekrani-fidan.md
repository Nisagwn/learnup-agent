---
gorev: GOREV-024-bahcem-ekrani-fidan
kimden: ORKESTRATÖR
kime: FRONTEND
durum: onaylandi
oncelik: P1
bagimlilik: [GOREV-006, GOREV-007]   # ikisi de ✅ — BAŞLATILABİLİR; inline FİDAN deseni
dokunulan-dosyalar:
  - frontend-v2/src/screens/Bahce.tsx
  - frontend-v2/src/components/Bahce3D.tsx   # yalnız malzeme/renk uyumu (v1.2 paleti)
migration-gerekli: hayir
---

## Amaç
Bahçem ekranını **kullanıcı onaylı önizlemeyle** hizalamak:
`docs/design/onizleme/bahcem.html` (2026-07-22 onayı — kaynak referans BUDUR).

## Bağlam
- Tasarım: TASARIM-DILI v1.2 (inline FİDAN). İçerik: EKRAN-HARITASI §8 (metafor serbest İÇERİK
  bölgesi — bitki/eşya adları serbest, başarı adları düz).
- Veri/davranış AYNEN korunur: tek istek `GET /garden`; atomik RPC'ler `/garden/purchase` ·
  `/plant` · `/move` · `/remove`; **fiyat/kilit otoritesi SUNUCUDA** (arayüz fiyat hesaplamaz);
  akış: envanterden "Dik" → yerleştirme modu → zemine tıkla; bitki paneli (taşı/sök);
  WebGL yoksa 2D ızgara yedeği.
- **3D sahne KORUNUR** (three lazy chunk) — önizlemedeki 2D çizim yalnız çevre arayüzünün temsili.
  Bu kartta sahneye yalnız RENK uyumu yapılır: malzeme/zemin/gök tonları v1.2 paletine çekilir
  (Gün Işığı/Gece Ormanı iki tema), geometri/etkileşim değişmez.

## Kabul Kriterleri
- [x] Görünüm iki temada da önizlemeyle eşleşir: üst şerit (coin çipi · koleksiyon sayacı N/M) ·
      **market** (durumlar KELİMELİ: seçili + tek birincil "Satın al" / seçilebilir / "yetersiz
      coin" devre dışı / "✓ sahipsin" → Dik; nadirlik rozetleri yaygın/nadir/efsanevi kelime+renk) ·
      **yerleştirme modu** (üstte nabızlı şerit + zeminde hedef vurgusu) · **seçili bitki paneli**
      (Taşı · Sök — sök Radix Dialog) · **envanter** (masaüstü ızgara; mobilde mevcut vaul çekmecesi)
- [x] Boş bahçe durumu: samimi metin + o durumda tek birincil "Markete göz at"; WebGL-yok
      2D yedeği çalışır kalır + kelimeli not
- [x] `Bahce3D` malzeme/ortam renkleri v1.2 paletine uyumlandı (iki temada doğrulanır);
      geometri/tıklama etkileşimi DEĞİŞMEDİ
- [x] null≠0: coin/katalog/envanter tamamı sunucudan; sayı uydurulmaz; katalog boşsa dürüst boş durum
- [x] Ambiyans yaprak katmanı bu ekranda KAPALI (sahne zaten doğa); mod şeridi nabzı + hedef
      vurgusu motion-safe; `prefers-reduced-motion`'da statik
- [x] `tsc --noEmit` sıfır hata + `bun run build` yeşil; **three yalnız Bahçem chunk'larında**
      (build kanıtı — NOT: index→vendor-three'de ÖNCEDEN VAR OLAN `scheduler` hoist sorunu
      RAPOR'da; HEAD kıyas build'iyle bu karttan bağımsız olduğu kanıtlandı) → çıktılar RAPOR'da

## Kısıtlar / Kapsam Dışı
- RPC uçları/atomiklik/kilit mantığı değişmez; yeni uç istenmez.
- Odak seansına bahçe ödülü GELECEK — yer açılmaz.
- `components/ui.tsx`, `cekirdek.tsx`, `fx.tsx` dokunulmaz.

## Başlangıç Durumu
- Git rev: `5c2610e`; kirli ağaç ~58 kayıt (onaylı işler — kullanıcı commit'i bekleniyor).
  `Bahce.tsx` GOREV-002'den kirli olabilir — yalnız bu kartın işi eklenir. İlk adım:
  `git diff --stat` fotoğrafı RAPOR'a.

## Onay Kayıtları
- Paralı koşu: GEREKMEZ ($0).

## RAPOR

### Yapılan
- **`Bahce.tsx` FİDAN v1.2'ye taşındı** (onaylı önizleme `docs/design/onizleme/bahcem.html` birebir referans; inline FİDAN deseni — Bugun.tsx `bg-*` kalıbının `bh-*` karşılığı, tüm renkler `var(--…)` token'larından → iki tema otomatik):
  - Üst şerit: başlık + **coin çipi** (toprak tonu, `Sayi`/NumberFlow, sunucudan) + **koleksiyon sayacı N/M tür** + sağda mono ipucu ("Soru çöz → coin kazan → bahçeni büyüt"). Eski Koleksiyon Defteri kartı önizlemeye uyarak çipe indirgendi.
  - **Market artık sağ kolonda kalıcı panel** (eski vaul-çekmece-market kaldırıldı): kind gruplu, kaydırılan yoğun liste → **mat ikiz** (`--mat`, FİDAN Anayasası 2). Durumlar KELİMELİ: seçili → tek birincil **"Satın al"** (`--cta`, ekrandaki tek birincil) · seçilebilir → "Seç" · **"yetersiz coin"** devre dışı · **"✓ sahipsin" → Dik** · kilitli → "rozetle açılır" + kilit ikonu. Nadirlik rozetleri kelime+renk (`NADIRLIK` aynasındaki 5 kelime; FİDAN renk eşlemesi `NADIR_STIL`).
  - **Yerleştirme modu**: üstte cam şerit + **nabızlı nokta** (yalnız `prefers-reduced-motion: no-preference` içinde; azalt'ta statik) + "… zemine tıkla · ESC iptal" + Vazgeç; **ESC ile iptal** eklendi; Dik'e basınca sahneye yumuşak kaydırma (reduce'ta anında).
  - **Seçili bitki paneli** (sağ-alt cam panel): görsel + ad + nadirlik rozeti + **Taşı** + **Sök → Radix `Dialog` onayı** (yıkıcı eylem; eskiden onaysız direkt siliyordu — kural ihlali giderildi).
  - **Envanter**: masaüstünde ızgara kutuları; **mobilde mevcut vaul alt çekmecesi** (kontrollü; Dik → çekmece kapanır + yerleştirme modu). Boş envanter/boş katalog için dürüst boş durumlar (sayı uydurma yok).
  - **Boş bahçe**: sahne üstünde ortalanmış samimi kart ("Bahçen seni bekliyor…") + **"Markete göz at"** — market seçimi yokken birincil, seçim varken soluk (tek-birincil bütçesi korunur).
  - **WebGL-yok 2D yedeği çalışır** + kelimeli not **"Basit görünüm — işlevler aynı"**; ayrıca yerleştirme modunda zemine tıklama 0–100 yüzdesine çevrilip AYNI `zeminTikla` akışına verilir (önizleme metni: "dik/taşı/sök akışı birebir aynı" — eski yedekte dik/taşı çalışmıyordu).
  - **Ambiyans yaprak katmanı bu ekranda kapalı**: ekrana özgü `<style>` ile `.amb-yprk{display:none}` (Ambiyans Shell'de mount edildiği ve `App.tsx` beyan dışı olduğu için CSS ile, bileşen ömrüne bağlı — ekrandan çıkınca geri gelir).
  - Veri/davranış AYNEN: tek `GET /garden`; atomik `/garden/purchase·/plant·/move·/remove`; fiyat/kilit otoritesi sunucuda (arayüz fiyat hesaplamaz, `kilitli`yi `unlockBadge`+`badges`'ten yalnız GÖSTERİM için türetir; asıl doğrulama RPC'de).
- **`Bahce3D` yalnız malzeme/ortam renkleri** v1.2'ye uyumlandı — geometri/etkileşim/animasyon mantığı DEĞİŞMEDİ: gök+sis (açık `#D9E7DC` adaçayı gök · koyu `#0D1710` gece ormanı), ışıklar (açık bal/amber `#F9EBC8` · koyu yeşil ay ışığı `#9DBFA6`/`#AECFB6`; gece nokta ışığı sky-mavisinden `#5CB781` yaprağa), su (`#6FA8B5`/`#12262C` sakin göl), çim (`#79B187`/`#26402F`), kumsal (`#DEC99B`/`#57503B`), **seçim + yerleştirme halkaları** sky `#38BDF8` → tema-duyarlı yaprak (`#4FA56F`/`#5CB781`), fide yaprakları `canliyaprak`/`adacayi`. Tür/dekor kimlik renkleri (Akçaağaç turuncusu, Mavi Çam, mantar/totem…) İÇERİKTİR — korundu; yıldızlar/ateşböcekleri korundu.

### Değişen dosyalar (`git diff --stat` — yalnız beyandakiler)
```
 frontend-v2/src/components/Bahce3D.tsx |  31 +-
 frontend-v2/src/screens/Bahce.tsx      | 755 +++++++++++++++++++++------------
 2 files changed, 507 insertions(+), 279 deletions(-)
```
(+ bu kart dosyası. Başlangıç fotoğrafı: kirli ağaç ~50 dosya/1841+ — diğer kartların onaylı işleri, dokunulmadı. `Bahce.tsx`/`Bahce3D.tsx` başlangıçta TEMİZDİ, GOREV-002 kalıntısı yoktu.)

### Koşulan kapılar + HAM çıktılar
1. `cd frontend-v2 && ../learnup-brain/node_modules/.bin/tsc --noEmit -p tsconfig.json`
```
TSC_EXIT=0
```
(Ara koşularda `Harita.tsx`/`rontgen.tsx` kaynaklı 2 hata görüldü — paralel ajanın o anki yarım düzenlemesi; kartın "build çakışırsa yeniden koş" notu gereği beklenip yeniden koşuldu, ~80 sn sonra temizlendi. Benim dosyalarım her koşuda temizdi.)
2. `bun run build` (ilgili satırlar):
```
dist/assets/Bahce3D-INWyQ6Bi.js     11.11 kB │ gzip:   3.11 kB
dist/assets/Bahce-COTxZlLc.js       50.26 kB │ gzip:  14.68 kB
dist/assets/vendor-three-DsdZ19vt.js 900.77 kB │ gzip: 240.29 kB
✓ built in 1.44s
```
3. **three yalnız Bahçem chunk'larında — kanıt:** three kaynak imzası (`WebGLRenderer`) YALNIZ `vendor-three-*.js` içinde (`grep -l "WebGLRenderer" dist/assets/*.js` → tek dosya). `vendor-three`'ye chunk başvurusu: `Bahce-*.js`, `Bahce3D-*.js` (lazy zincir, doğru) + `index-*.js` — ANCAK index'inki three değil: rolldown, React'ın paylaşılan **`scheduler`** modülünü (`unstable_now` imzası) vendor-three chunk'ına hoist etmiş; index `import{o as f}from"./vendor-three…"` ile onu çekiyor. **Bu durum bu karttan ÖNCE DE VARDI** — beyanlı iki dosya geçici olarak `git show HEAD:` içerikleriyle değiştirilip kıyas build alındı: HEAD'de de `index-*.js` içinde `import{o as p}from"./vendor-three-…"` mevcut (sonra kendi sürümlerim geri kondu). Yani bu kartın işi durumu değiştirmedi; kök neden `vite.config.js` chunk stratejisinde (beyan dışı + başka kartın kirli dosyası → dokunulmadı).

### Gerçekleşen maliyet
$0 — paralı koşu yok (yalnız yerel tsc/build).

### Açık riskler
- **[ÖNCEDEN VAR — perf] `scheduler` hoist'u vendor-three'de:** kabuk (index) 900 kB'lık vendor-three chunk'ını EAGER yüklüyor; three'nin lazy'liği pratikte deliniyor. Fix `vite.config.js` `manualChunks`'ta (ör. `scheduler`'ı react vendor'ına sabitlemek) — dosya beyan dışı ve kirli; kart öneriyorum (aşağıda).
- Görsel "iki temada önizlemeyle eşleşir" doğrulaması kod düzeyinde yapıldı (tüm renkler tema token'ı; nabız/halka motion-safe); piksel düzeyi göz doğrulaması kullanıcı/ORKESTRATÖR onay turuna kalır. Dev sunucusuna dokunulmadı (kural).
- Market satırındaki "kilitli" butonu ile satır içi "rozetle açılır" etiketi birlikte kelimeli durum verir; kilidin HANGİ rozetle açıldığı gösterilmiyor (sunucu `unlockBadge` id'si ham geliyor — ad eşlemesi rozet kataloğu işi, kapsam dışı bırakıldı).
- Koleksiyon çipi istemci aynası `TUM_AGACLAR`'dan M=8 sayar (fiyat değil, tür listesi); katalog ileride yeni tür eklerse ayna güncellenmeli (`lib/katalog.ts` — beyan dışı).

### Sonraki adım önerisi
1. **BEKLEYEN kart (FRONTEND, `vite.config.js`):** `manualChunks`'a `scheduler` (ve gerekirse `react-reconciler`/`its-fine`) için açık atama ekleyip vendor-three'yi gerçekten lazy yapmak; kanıt olarak index'te vendor-three importunun kaybolması.
2. İsteğe bağlı: `unlockBadge` → rozet ADI eşlemesi (kilitli ürünlerde "X rozetiyle açılır" metni) — rozet kataloğu `lib/rozetler.ts` ile küçük bir FRONTEND kartı.
3. Odak seansına bahçe ödülü GELECEK bekliyor (bu kartta yer açılmadı — kural gereği).

## Günlük
- 2026-07-22 · ORKESTRATÖR · kart açıldı (BAŞLATILABİLİR — önizleme onayı "bahce onay" 2026-07-22; aktif kartlarla dosya kesişimi YOK; P1 önizleme seti bu kartla TAMAMLANDI)
- 2026-07-23 · FRONTEND · alindi
- 2026-07-23 · FRONTEND · tamamlandi (kapılar yeşil; three-chunk kanıtı + önceden var olan scheduler-hoist bulgusu RAPOR'da)
- 2026-07-23 · ORKESTRATÖR · onaylandi + arşiv. Denetim kanıtı: Bahce.tsx'te Radix Dialog söküm onayı (satır 358+), ESC iptali (119), .amb-yprk display:none (198), kelimeli market durumları ("yetersiz coin"/"✓ sahipsin"/"rozetle açılır") ve prefers-reduced-motion kapıları grep'le doğrulandı; Bahce3D.tsx'te sky/#38BDF8 kalıntısı SIFIR; git diff --stat beyanla birebir (2 dosya, +507/−279); tsc 0 + build yeşil HAM RAPOR'da; $0. scheduler-hoist bulgusu HEAD kıyas build'iyle karttan-önce-var kanıtlı — KABUL; düzeltme GOREV-030'a taşınacak.
