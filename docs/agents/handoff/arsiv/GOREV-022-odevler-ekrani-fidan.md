---
gorev: GOREV-022-odevler-ekrani-fidan
kimden: ORKESTRATÖR
kime: FRONTEND
durum: onaylandi
oncelik: P1
bagimlilik: [GOREV-006, GOREV-007]   # ikisi de ✅ — BAŞLATILABİLİR; inline FİDAN deseni
dokunulan-dosyalar:
  - frontend-v2/src/screens/Odevler.tsx   # liste + OdevCoz aynı dosyada
migration-gerekli: hayir
---

## Amaç
Ödevler ekranını **kullanıcı onaylı önizlemeyle** hizalamak:
`docs/design/onizleme/odevler.html` (2026-07-22 onayı — kaynak referans BUDUR).

## Bağlam
- Tasarım: TASARIM-DILI v1.2 (inline FİDAN). İçerik: EKRAN-HARITASI §9.
- Veri: tek istek `GET /assignments` (`assignments` + `targeted` — mevcut wiring aynen).
- **Davranış DEĞİŞMEZ:** sorular cevapsız gelir (sunucu soyar), cevaplar yerelde toplanır,
  TEK gönderim + Radix onay → otoriter skor. Ekran yalnız `teacher_id`'li öğrencide (nav kuralı).
- **Telif uyumu:** bu ekranda çıkmış/ÖSYM içeriği ve kehribar kimlik YOKTUR (osym ödev kaynağı
  GOREV-016 ile sunucuda da kapanıyor).

## Kabul Kriterleri
- [x] Görünüm iki temada da önizlemeyle eşleşir: aktif ödev kartları (öğretmen adı · soru sayısı ·
      son tarih) · **teslim sayacı** [FRONTEND]: son tarihe ≤2 gün kala toprak tonlu kelimeli
      rozet ("teslime N gün") + kart çerçevesi · **hedefli set** kesikli adaçayı vurgu + "sana
      özel" rozeti · tek gönderim bilgi şeridi · **geçmiş** (mini skor halkaları + "Soru dökümü"
      mevcut detay görünümüne)
- [x] Sayfada TEK birincil buton: en acil ödevdeki "Çözmeye başla"; diğerleri soluk; boş durumda
      koyu buton YOK ("Henüz ödevin yok" + samimi metin)
- [x] `OdevCoz` görünümü FİDAN'a taşınır (aynı dosya; GOREV-008 odak kabuğu diliyle uyumlu):
      üst şeritte ödev adı + SORU n/N; **tek-gönderim + Radix onay akışı AYNEN korunur**
- [x] null≠0: sayaç gerçek son-tarihten saf hesap; skorlar gerçek sonuçtan; rozetler kelimeli;
      sayı uydurulmaz
- [x] Kart giriş stagger'ı ≤0.3s; skor halkaları yüklenince dolar; `prefers-reduced-motion`'da statik
- [x] `tsc --noEmit` sıfır hata + `bun run build` yeşil → çıktılar RAPOR'da

## Kısıtlar / Kapsam Dışı
- `components/ui.tsx`, `cekirdek.tsx`, `fx.tsx`, backend uçları dokunulmaz; yeni uç istenmez.
- "Yapmayanlara hatırlat" öğretmen dürtmesi GELECEK — yer açılmaz.

## Başlangıç Durumu
- Git rev: `5c2610e`; kirli ağaç ~58 kayıt (onaylı işler — kullanıcı commit'i bekleniyor).
  `Odevler.tsx` GOREV-002'den kirli — yalnız bu kartın işi eklenir. İlk adım: `git diff --stat` RAPOR'a.

## Onay Kayıtları
- Paralı koşu: GEREKMEZ ($0).

## RAPOR

### Yapılan
- `Odevler.tsx` tamamen FİDAN'a taşındı (inline `od-*` stil bloğu — Bugun/Coz deseni; COASTAL
  primitifleri `GlassCard/GlowButton/Badge/Halka/BosDurum/Skeleton` bu ekrandan çıkarıldı,
  bileşen dosyalarına DOKUNULMADI).
- **Liste görünümü** (önizleme birebiri): aktif sınıf ödevleri son tarihe göre acilden uzağa
  sıralı satır kartları (📝 ikon · başlık · öğretmen adı? · N soru · "Son: 23 Temmuz 23:59");
  **teslim sayacı** saf takvim hesabı (`kalanGun`), ≤2 gün → toprak "⏳ teslime N gün / son gün
  bugün" rozeti + toprak çerçeve; süresi geçmişse "süresi geçti" (uyarı tonu, kelimeli); hedefli
  setler kesikli adaçayı çerçeve + "sana özel" rozeti; tek-gönderim bilgi şeridi; **Geçmiş**
  kartı: mini skor halkaları (yüklenince dolar, `useReducedMotion`'da statik) + "tamamlandı"
  rozeti (kelime+✓ ikon) + tarih + "Soru dökümü →".
- **TEK birincil buton:** en acil bekleyen sınıf ödevinde "Çözmeye başla" (`orman/700`); sınıf
  ödevi yoksa ilk bekleyen hedefli sette; diğer tüm eylemler soluk. Boş durumda koyu buton YOK
  (🌱 + samimi metin, önizleme metni).
- **OdevCoz FİDAN'a taşındı:** cam üst şerit (kapat + ödev adı + mono `SORU n/N` + ilerleme
  çubuğu), sorular mat kartlarda (blur bütçesi), `od-sik` şık dili (GOREV-008 `cz-sik` ile aynı
  gramer); **tek-gönderim + Radix onay davranışı AYNEN** (aynı Dialog yapısı, `gonder()` mantığı,
  uçlar ve yükler bit-bit korundu); sonuç ekranı halka + "Panoya dön". Soru yükleme HATA durumu
  eklendi (eskiden sessizce boş kalıyordu — yalnız sunum katmanı).
- **"Soru dökümü"** mevcut detay görünümüne açılır: aynı `OdevCoz` bileşeni `inceleme` modunda —
  aynı `GET .../questions` ucu, şeritte gerçek `SKOR s/m` (liste verisinden), şık seçimi ve
  gönderim kapalı; "cevap anahtarı sunucuda kalır" bilgi notu. Yeni uç YOK.
- null≠0 her yerde: `dueDate` yoksa sayaç/`Son:` çizilmez; skor yoksa halka yerine "—" (kesikli
  daire), sayı uydurulmaz; öğretmen adı yalnız profil `teacher_name` doluysa gösterilir.
- Telif: ekranda çıkmış/ÖSYM içeriği ve kehribar SIFIR kullanım.
- Erişilebilirlik: tüm tık hedefleri ≥44px (`min-height:44px` buton/şık/kapat), `:focus-visible`
  filiz halkası, progressbar aria'ları, rozetler daima kelimeli; stagger ≤0.3s ve tüm
  animasyonlar hareket-azalt kapılı (Reveal `useReducedMotion` + CSS `prefers-reduced-motion`).

### Değişen dosyalar (`git diff --stat`)
```
 frontend-v2/src/screens/Odevler.tsx | 652 ++++++++++++++++++++++++++++--------
 1 file changed, 503 insertions(+), 149 deletions(-)
```
Not: kart "Odevler.tsx GOREV-002'den kirli" diyordu; başlangıçta dosya HEAD'e göre TEMİZDİ
(GOREV-002 işi commit'lenmiş) — bu diff yalnız bu kartın işidir.

### Koşulan kapılar + HAM çıktılar
`cd frontend-v2 && ../learnup-brain/node_modules/.bin/tsc --noEmit -p tsconfig.json`
```
(çıktı yok — sıfır hata) TSC_EXIT=0
```
`bun run build` (son satırlar):
```
dist/assets/Odevler-SPj2oEy7.js                        22.06 kB │ gzip:   6.49 kB │ map:    46.20 kB
...
dist/assets/vendor-three-CmLVOKeS.js                  900.77 kB │ gzip: 240.29 kB │ map: 3,918.50 kB
✓ built in 1.55s
(!) Some chunks are larger than 500 kB after minification. (önceden var olan uyarı)
BUILD_EXIT=0
```

### Gerçekleşen maliyet
$0 (paralı koşu yok).

### Açık riskler
- Önizlemedeki ikincil "İncele" etiketi yerine **"Çöz"** kullanıldı: mevcut davranışta karta
  tıklamak doğrudan çözüm akışını açıyor; "İncele" yanıltıcı olurdu (görsel hiyerarşi — tek
  birincil + soluk — aynen korundu). ORKESTRATÖR isterse tek kelimelik geri dönüş kolay.
- Öğretmen adı `profiles.teacher_name` cache kolonundan (0003 migration); kolon boşsa ad
  görünmez (uydurulmaz) — kriterin "öğretmen adı" kalemi veri doluluğuna bağlı.
- Aktif kartlar cam (blur): liste tipik boyutta (birkaç ödev) bütçe içi (≤8 büyük cam yüzey);
  50 ödevlik uçta aşabilir — soru kartları bu yüzden şimdiden MAT.
- Önizleme varyant metnindeki "yarıda çıkarsa cevaplar yerel taslakta bekler" davranışı
  UYGULANMADI — davranış-değişmez kısıtı gereği (mevcutta da yok).

### Sonraki adım önerisi
- Yerel cevap taslağı (localStorage, `learnup.devam` deseni) + çıkışta Radix onayı: ayrı kart
  ister (davranış değişikliği).
- Gönderim sonrası soru-bazlı döküm için sunucuda `assignment_submissions.answers`'ı okuyan bir
  uç yok — istenirse BACKEND kartı (şimdilik döküm dürüstçe yalnız soruları gösteriyor).

## Günlük
- 2026-07-22 · ORKESTRATÖR · kart açıldı (BAŞLATILABİLİR — önizleme onayı "onaylıyorum" 2026-07-22; aktif kartlarla dosya kesişimi YOK, paralel çalışabilir)
- 2026-07-23 · FRONTEND · alindi
- 2026-07-23 · FRONTEND · tamamlandi (tsc 0 hata + build yeşil; RAPOR dolduruldu)
- 2026-07-23 · ORKESTRATÖR · onaylandi → arsiv/ (DENETİM: grep — tek-gönderim Radix onayı yerinde, kullanıcıya görünen osym/kehribar SIFIR; diff yalnız beyanlı dosya; kapı çıktıları ham. KABUL: "İncele"→"Çöz" etiketi [dürüst — mevcut davranış doğrudan çözüm açıyor], yerel taslak UYGULANMADI [davranış-değişmez kısıtına doğru uyum — ayrı kart önerisi backlog'a], teacher_name doluluk bağımlılığı [null≠0 doğru]. BACKLOG: yerel cevap taslağı kartı, gönderim sonrası soru-bazlı döküm ucu [BACKEND]. Not: "Odevler.tsx GOREV-002'den kirli" başlangıç varsayımım yanlıştı — dosya temizmiş; ajan doğru fotoğrafladı. 4 ölçüt sağlandı.)
