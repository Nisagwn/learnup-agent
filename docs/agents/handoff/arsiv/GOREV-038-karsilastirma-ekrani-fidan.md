---
gorev: GOREV-038-karsilastirma-ekrani-fidan
kimden: ORKESTRATÖR
kime: FRONTEND
durum: onaylandi
oncelik: P2
bagimlilik: [GOREV-036]   # ✅ arşivde — sinif.tsx OgrenciBaslik/OgrenciGezinme FİDAN'a orada geçti; aynı dosya
dokunulan-dosyalar:
  - frontend-v2/src/screens/sinif/Karsilastir.tsx
  - frontend-v2/src/components/sinif.tsx   # KarsilastirmaIzgarasi/OgrenciSecici/SonAktiflikSeridi FİDAN
migration-gerekli: hayir
---

## Amaç
Öğrenci Karşılaştırma ekranını **kullanıcı onaylı önizlemeyle** hizalamak:
`docs/design/onizleme/karsilastirma.html` (2026-07-23 onayı — kaynak referans BUDUR).

## Bağlam
- Tasarım: TASARIM-DILI v1.2 (inline FİDAN). İçerik: EKRAN-HARITASI §15.
- **DAVRANIŞ AYNEN KORUNUR:** seçim URL'de (`?ogrenci=a,b,c`, replace:true, en fazla 4);
  ölçek SATIR BAŞINA normalize (yatay taramayı dürüst kılan kural — koddaki gerekçe); kazanan
  asla yalnız renk (✓ ikon + renk birlikte); "az iyi" ölçütlerde (açık yanılgı) en düşük kazanır.
- **MOCK YASAK (kullanıcı teyidi 2026-07-23):** tüm ölçütler GERÇEK roster alanlarından
  (`OLCUTLER` dizisi: avgMastery, basariOrani, solved, trackedNodes, openMisconceptions, xp);
  değeri olmayan "ölçüm yok"/"veri yok" der — sıfır çizilmez (null≠0). Son aktiflik mevcut
  `SonAktiflikSeridi` verisinden.
- **Sınıf ortalaması sütunu (§15 [HAZIR]):** kesikli toprak sanal sütun. Sınıf özeti verisi
  sağlayıcıda zaten çekiliyor mu ENVANTERLE — varsa sütun eklenir; YOKSA gizlenir + RAPOR notu
  ve BACKEND kartı önerisi (uydurma yasak).

## Kabul Kriterleri
- [x] Görünüm iki temada da önizlemeyle eşleşir: başlık + seçili sayacı · öğrenci seçici çipleri
      (avatar + ad; dolunca kalan çipler soluk/pasif) · ölçüt ızgarası (satır-başına normalize
      çubuklar, kazanan ✓+renk) · son aktiflik nokta şeridi (4-ton) · yatay kaydırma yalnız
      ızgara kabuğunda (sayfa gövdesi taşmaz)
      *(sapma: önizlemedeki "son 14 gün nokta ızgarası" roster'da günlük seri OLMADIĞI için
      uydurulmadı → her satır GERÇEK lastActive'den TEK 4-ton tazelik çipi + gerçek soru/doğruluk;
      RAPOR + BACKEND önerisi)*
- [x] Sınıf ortalaması sanal sütunu (veri varsa; yoksa dürüst gizleme + not)
      *(sağlayıcıdaki TÜM roster'dan gerçek ortalama hesaplandı — sütun ÇİZİLDİ; uydurma/uç yok)*
- [x] Boş durum (<2 seçim): Lighthouse yerine FİDAN filizi + "En az iki öğrenci seç"
- [x] Hareket-azalt: kart girişleri (Reveal) + çubuk dolumları (Meter whileInView) gateli;
      çip tık hedefleri ≥44px (`min-h-[44px]`)
- [x] `tsc --noEmit` sıfır hata + `bun run build` yeşil → HAM çıktılar RAPOR'da; **$0**

## Kısıtlar / Kapsam Dışı
- Yeni backend ucu İSTENMEZ (eksik → RAPOR + kart). `components/ui.tsx`/`cekirdek.tsx`/`fx.tsx`
  DOKUNULMAZ (sinif.tsx serbest — teacher paylaşımlı bileşen, 036 emsali). En-fazla-4 kuralı,
  URL sözleşmesi değişmez.

## Başlangıç Durumu
- Git rev: `5c2610e`; kirli ağaç (onaylı işler). `sinif.tsx` 036'nın ONAYLI işiyle kirli;
  `Karsilastir.tsx` eski onaylı işlerle. Yalnız bu kartın işi eklenir. İlk adım: `git diff --stat`
  fotoğrafı RAPOR'a.

## Onay Kayıtları
- Paralı koşu: GEREKMEZ ($0).

## RAPOR

### Yapılan
- **`Karsilastir.tsx` (FİDAN yeniden kurulum):** COASTAL `SinifBaslik`/`StatusLine`/`GlowBorder`/
  `Lighthouse`/`BosDurum` söküldü — yerine ekran-yerel FİDAN başlık (mono "N/4 seçili" çipi;
  StatusLine'ın canlı noktası kalktı → 1-canlı-nokta bütçesi harcanmadı) + seçici kartı (etiket +
  çipler + `?ogrenci=a,b,c` URL notu) + boş durum (inline **FİDAN filiz** SVG, "En az iki öğrenci
  seç"). **DAVRANIŞ AYNEN:** seçim URL'de, `replace:true`, `EN_FAZLA=4`, `.slice(0,4)` — hiç
  değişmedi. Kritik perf kararı: filiz `rontgen`'den değil ekran-yerel çizildi → **Karsilastir
  chunk'ı recharts ÇEKMİYOR** (build'de doğrulandı: "Karsilastir chart-free").
- **`sinif.tsx` — `OgrenciSecici` (FİDAN):** `FiltreCipi` yerine avatar (baş harf) + ad çipleri;
  seçili dolu (`--v1`/adaçayı kenar/vurgu), kapasite dolunca kalan çipler `disabled` + `opacity-40`
  (soluk/pasif) + `not-allowed`; `min-h-[44px]` tık hedefi; `aria-pressed`. En-fazla-4 kuralı
  bileşende korundu.
- **`sinif.tsx` — `KarsilastirmaIzgarasi` (FİDAN + gerçek sınıf ort. sütunu):** ölçek SATIR
  BAŞINA normalize KORUNDU (koddaki gerekçe yorumu duruyor); kazanan ✓ ikon + `--dogru` renk
  BİRLİKTE, yalnız `gecerli.length > 1` iken; "az iyi" ölçütlerde (açık yanılgı) `iyiYon:'dusuk'`
  → en düşük kazanır (+ başlıkta "· az iyi" etiketi). YENİ OPSİYONEL `sinifOrtalama?: OgrenciSatiri[]`
  → verilirse kesikli-toprak "Σ Sınıf ort." sanal sütunu; ortalama TÜM roster'dan metrik başına
  GERÇEK hesaplanır (`m.deger` üzerinden, null'lar dışlanır); bir metrikte hiç değer yoksa
  `m.bicim(null)` = "veri yok"/"ölçüm yok" (null≠0). Sınıf ort. sütunu KAZANAN olamaz (yarışmaz),
  ama ortak ölçeğe girer ki çubuğu taşmasın. Yüzde-metrik tespiti `m.bicim(0.5).includes('%')` →
  sayaç metriklerinde ortalama `Math.round`'lanır (ondalık çöp gösterilmez). Sticky ilk sütun,
  yatay kaydırma yalnız kart kabuğunda (`overflow-x-auto`).
- **`sinif.tsx` — `SonAktiflikSeridi` → "Etkinlik Özeti" (DÜRÜSTLÜK düzeltmesi):** eski hâli 4
  ilişkisiz skaleri (`solved/correct/trackedNodes/openMisconceptions`) tek Sparkline'a sokuyordu —
  bu zaman-serisi DEĞİL, yanıltıcıydı; kaldırıldı. Yeni satır GERÇEK alanları gösterir: baş-harf
  avatar + ad + `{N} soru` + doğruluk (yoksa "doğruluk: veri yok") + `lastActive`'den türetilen
  TEK 4-ton tazelik çipi (kelime + renk birlikte: bugün/dün/N gün önce/hiç). Kullanılmayan
  `Sparkline`/`FiltreCipi` importları temizlendi.

### Sınıf ortalaması sütunu — ENVANTER SONUCU
Kart "sağlayıcıda sınıf özeti verisi var mı?" diye sordu. `useSinif().roster` (OgrenciSatiri[])
sağlayıcıda ZATEN yüklü (GET `/teacher/sinif`, varsayılan limit 200). Sınıf ortalaması yeni uç
GEREKTİRMEDEN bu roster'dan metrik başına gerçek ortalama olarak hesaplandı → sanal sütun **çizildi**
(uydurma yok, dürüst gizleme senaryosuna düşülmedi). Not: 200'ü aşan sınıflarda ortalama yüklü
sayfayı kapsar (tipik sınıfta = tüm sınıf); ayrı "sunucu-taraflı sınıf ortalaması" ucu istenirse
daha büyük sınıflar için kesinleşir (aşağıda öneri).

### Dürüstlük sapmaları (önizleme ↔ gerçek veri)
1. **"Son 14 gün nokta ızgarası" ÇİZİLMEDİ** — `OgrenciSatiri` yalnız pencere-agregatı taşır,
   öğrenci başına GÜNLÜK seri yok; 14 kutuyu uydurmak mock-yasağını çiğnerdi. Yerine gerçek
   `lastActive`'den tek 4-ton tazelik çipi + gerçek soru/doğruluk kondu (036'daki "(doğru: D)"
   emsalinin aynısı: alan yoksa çizme).
2. Sınıf ort. büyük sınıflarda yüklü roster (≤200) üzerinden — bkz. üstteki envanter notu.

### `git diff --stat` (bu kartın 2 dosyası)
```
 frontend-v2/src/components/sinif.tsx          | 292 ++++++++++++++++++++------
 frontend-v2/src/screens/sinif/Karsilastir.tsx | 109 +++++++---
 2 files changed, 306 insertions(+), 95 deletions(-)
```
(Ağaçtaki diğer kirli kayıtlar önceki onaylı kartlardan; bu kart yalnız beyandaki 2 dosyaya + kart
dosyasına yazdı.)

### Kapılar (HAM çıktı)
```
$ ../learnup-brain/node_modules/.bin/tsc --noEmit -p tsconfig.json
(çıktı yok)
tsc exit: 0

$ bun run build   (son satırlar)
✓ built in 1.40s
(!) Some chunks are larger than 500 kB after minification. …  ← bilinen uyarı (vendor-three/katex/charts), bu karttan bağımsız

$ (chunk denetimi) Karsilastir-*.js → recharts YOK → "Karsilastir chart-free (ok)"
```

### Gerçekleşen maliyet
$0 (paralı LLM koşusu yok).

### Açık riskler
1. Sınıf ort. sütunu yüklü roster'dan (≤200 varsayılan); 200+ mevcutlu sınıfta sayfa-kapsamı
   olur (etiket "Sınıf ort." bunu tekil sayı sunar, yanıltıcı seri yok).
2. `SonAktiflikSeridi` artık zaman-serisi göstermiyor (dürüstçe); önizlemenin görsel zenginliği
   ancak günlük-aktiflik ucu gelirse geri döner.
3. `KarsilastirmaIzgarasi`'nın yüzde-metrik tespiti `m.bicim(0.5).includes('%')` sezgiseldir —
   yeni bir yüzde-ölçüt eklenirse bicim'i `%` üretmeli (OLCUTLER'deki mevcut dördü uyumlu).

### Sonraki adım önerisi
- **BACKEND (opsiyonel):** öğrenci başına son N gün günlük aktiflik serisi (user_logs'tan
  gün-kovaları) → önizlemedeki 14-gün 4-ton nokta ızgarası gerçeklenebilir.
- **BACKEND (opsiyonel):** `/teacher/ozet`e sınıf-geneli metrik ortalamaları (ustalık/doğruluk/
  çözülen/kazanım/yanılgı/xp) → 200+ mevcutlu sınıflarda "Sınıf ort." tam-sınıf kesinleşir.
- `SinifBaslik` hâlâ COASTAL slate sınıflarında (SinifPanosu vb. kullanıyor) — /sinif geneli
  FİDAN başlık birleştirmesi ayrı kartın işi (bu kartta beyan dışıydı; yerel başlıkla çözüldü).

## Günlük
- 2026-07-23 · ORKESTRATÖR · kart açıldı (önizleme onayı "onaylıyorum hepsını" 2026-07-23; GOREV-036'yı yapan ajana atandı — sinif.tsx bağlamı onda; 039 ile dosya kesişimi YOK)
- 2026-07-23 · FRONTEND · alindi
- 2026-07-23 · FRONTEND · tamamlandi: ekran+3 bileşen FİDAN'a taşındı; sınıf ort. sütunu GERÇEK roster'dan çizildi; URL/normalize/kazanan davranışı AYNEN; 14-gün nokta uydurulmadı (dürüst tazelik çipi); tsc 0 + build yeşil; Karsilastir chunk recharts-siz
- 2026-07-23 · ORKESTRATÖR · onaylandi + arşiv. Denetim kanıtı: sınıf ortalaması sütunu GERÇEK roster'dan hesaplanıyor (KarsilastirmaIzgarasi sinifOrtalama={roster}, Karsilastir.tsx:110 — sahte uç YOK); tüm ölçütler gerçek OLCUTLER roster alanları; Lighthouse grep SIFIR (FİDAN filizle değişti); davranış aynen (URL ?ogrenci= en-fazla-4 replace:true, satır-başına normalize, kazanan ✓+renk). DÜRÜST SAPMA KABUL: önizlemedeki "14 gün nokta ızgarası" roster'da günlük seri OLMADIĞI için UYDURULMADI — SonAktiflikSeridi gerçek lastActive tazelik çipi + gerçek soru/doğruluk ile yeniden yazıldı (yanıltıcı 4-skaler sparkline kaldırıldı; günlük-aktiflik ucu BACKEND önerisi backlog'a). git diff --stat beyanla birebir (2 dosya); tsc 0 + build yeşil (Karsilastir chunk chart-free); ≥44px; RM gateli; $0. İkinci sapma (200+ sınıf ort. kapsamı) not edildi.
