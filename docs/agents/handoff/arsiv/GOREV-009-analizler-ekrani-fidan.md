---
gorev: GOREV-009-analizler-ekrani-fidan
kimden: ORKESTRATÖR
kime: FRONTEND
durum: onaylandi
oncelik: P1
bagimlilik: [GOREV-006, GOREV-007]   # ikisi de ✅ — 007 cekirdek.tsx'e DOKUNMADI (kesişim kalktı); inline desen
dokunulan-dosyalar:
  - frontend-v2/src/screens/Harita.tsx
  - frontend-v2/src/components/rontgen.tsx
  - frontend-v2/src/components/cekirdek.tsx
migration-gerekli: hayir
---

## Amaç
Analizler ekranını (kod adı `Harita.tsx`) **kullanıcı onaylı v2 önizlemesiyle** hizalamak:
`docs/design/onizleme/analizler.html` (2026-07-22 onayı — kaynak referans BUDUR).

## Bağlam
- Tasarım: TASARIM-DILI v1.2. İçerik: EKRAN-HARITASI §4. Sunum katmanı `components/rontgen.tsx`
  (TrendPaneli/UstalikMatrisi/TuzakPaneli/HizPaneli/KapsamaKarti burada yaşıyor), ısı/halka
  çekirdeği `components/cekirdek.tsx` (IsiHucre'ye yüzdeli tooltip + 4-ton `veri/1..4` skalası).
- Veri: tamamı mevcut uçlardan (`/mastery`, `/mastery/rontgen` öğrenci görünümü — teşhis dili
  ASLA öğrenciye sızmaz; haftalık karşılaştırma user_logs'tan türetilir).
- **DÜZELTME (007 denetimi):** ortak FİDAN varyantları `components/ui.tsx`'e İNMEDİ — 007 inline
  FİDAN deseniyle kuruldu (onaylı sapma); bu kart da ekran/panel içinde aynı deseni izler.
  `cekirdek.tsx` 007'den TEMİZ çıktı — beyan edilen IsiHucre/skala işi bu kartın; `CanliSayi`
  Bugün ekranında kullanılıyor, imzası KIRILMAMALI.

## Kabul Kriterleri
- [x] **Gelişim Özeti hero'su:** gradyan büyük halka (genel ustalık, dolum+sayaç animasyonlu) +
      3 stat (bu ay çözülen ▲delta · en güçlü ders · en çok gelişen) + dal dekoru
      *(sapma: "en çok gelişen" mevcut uçlarda ders-bazlı tarihsel seri olmadığı için ÇİZİLMEDİ —
      uydurma yasak; yerine gerçek "7 Gün Doğruluk ▲puan" statı; ayrıntı RAPOR'da)*
- [x] **Ustalık Matrisi:** dalga girişli hücreler · hover'da yüzdeli tooltip · satır sonu ders
      ortalaması · ders renk noktaları · "ölçüm yok" kesikli hücre · tıkla → kazanım drill-down (ltree)
- [x] **Trend:** recharts ile — eksen etiketleri, kesikli hedef çizgisi, veri noktaları, günlük
      hacim çubukları (tek grafik, tek-renk dil) *(hedef çizgisi GERÇEK sayıya bağlandı: öğrencinin
      yerel günlük soru hedefi; uydurma doğruluk hedefi çizilmedi)*
- [x] **"Bu Hafta vs Geçen Hafta"** kartı (3 karşılaştırma; düşüş toprak tonuyla, dürüst)
      *(sapma: "çalışma süresi" trend verisinde yok — üçüncü karşılaştırma gerçek XP)*
- [x] **Takvim ısısı:** 6 hafta, gün etiketleri, bugün halkası, hover büyüme
- [x] **Öncelikler:** mini ustalık halkaları + gerekçe satırı; #1 vurgulu çerçeve + sayfanın TEK
      koyu "Çöz" butonu; diğerleri yumuşak
- [x] **Tuzaklar:** ikon + "N kez" sayacı + "Bu tuzağı kır" → o çeldirici tipinden pratik köprüsü;
      öğrenci dili (taksonomi/teşhis terimi YOK)
- [x] **Hız:** gradyan çubuklar + hedef imi + kelimeli yorum; **Kapsama:** halka + fidan sırası
      (kapsama oranına göre canlanan)
- [x] Filtreler (ders/dönem) URL'de `replace:true`; paneller veri yoksa kendini gizler (null≠0)
- [x] `tsc --noEmit` sıfır hata + `bun run build` yeşil → çıktılar RAPOR'da

## Kısıtlar / Kapsam Dışı
- Öğretmen Röntgeni yüzeyi (`OgrenciRontgeni.tsx`) bu kartta DEĞİŞMEZ (rontgen.tsx bileşenlerini
  o da kullanıyor — görsel güncelleme geriye-uyumlu olmalı, öğretmen tarafı bozulmamalı; RAPOR'da
  öğretmen ekranının etkilenmediği doğrulanır).
- Yeni backend ucu istenmez; eksik veri boş durumla çözülür + RAPOR notu.

## Başlangıç Durumu
- Git rev: `5c2610e` (branch `feat/yks-brain`); kirli ağaç ~57 kayıt — onaylı işler (kullanıcı
  commit'i hâlâ bekleniyor). `Harita.tsx` GOREV-002'den kirli; `rontgen.tsx` ve `cekirdek.tsx`
  TEMİZ (007 dokunmadı). Yalnız bu kartın işi eklenir. İlk adım: `git diff --stat` fotoğrafı RAPOR'a.

## Onay Kayıtları
- Paralı koşu: GEREKMEZ ($0).

## RAPOR

### Yapılan
- **`Harita.tsx` (tam yeniden yazım — analizler.html v2 portu):** Gelişim Özeti hero'su (150px
  gradyan halka `adaçayı→yaprak`, dolum 1.1s + `CanliSayi` sayaç, dal dekoru, `--ic` stat kutuları) ·
  cam filtre barı (ders + dönem çipleri, `?ders=&donem=` URL'de, `setParams(p,{replace:true})`;
  varsayılan `30` param yazmaz) · 1.9fr/1fr izgara (SOL: matris→trend→hafta→takvim; SAĞ:
  öncelik→tuzak→hız→kapsama) · FİDAN boş/hata/iskelet durumları (Lighthouse söküldü → `FidanIkon`
  filiz; `StatusLine "BKT-lite"` jargonu ve `GlowBorder` kalıcı neonu kaldırıldı — v1.2 §9.3) ·
  `/questions/ai/kalite` isteği ve KPI şeridi kaldırıldı (önizlemede yok). Ders filtresi tüm panel
  türetimlerine uygulanır; trend ve hero GLOBAL kalır (uçta ders-bazlı trend yok — dürüstlük);
  ders filtresi aktifken zorluk kırılımı sıfırlanıp gizletilir (global sayı yanlış bağlamda gösterilmez).
- **`rontgen.tsx` (FİDAN v2, geriye-uyumlu imzalar):** `TrendPaneli` tek `ComposedChart`'a indi
  (eksen etiketleri, %0/50/100, veri noktaları ≤30 günde, %28 opak eksensiz hacim çubukları,
  `ReferenceLine` kesikli günlük-hedef çizgisi `--toprak`; yeni OPSİYONEL `aralikGun`/`hedefGunluk`
  prop'ları — verilmezse eski 4/12-hafta iç anahtar aynen çalışır → öğretmen/sınıf panosu değişmedi) ·
  YENİ `HaftaKarsilastirma` (soru/doğruluk/XP; düşüş `--uyari` sıcak tonda, "geçen hafta veri yok"
  durumu ayrı; iki hafta boşsa null) · `TakvimIsi` 6 haftaya indi (gün etiketleri, bugün `--yaprak`
  halkası, hover büyüme, 4-ton lejant) · `UstalikMatrisi`ne `DersGrubu.toplam?` eklendi (kesikli
  "ölçüm yok" hücreleri + lejant; 22px hücre, tooltip'e "tekrar vakti"/"üstünde çalıştığın nokta var"
  kelimeleri; "paslanıyor"→"tekrar vakti") · `OncelikRadari` = "Önce Bunlara Çalış" (44px mini
  halkalar, GERÇEK sinyalden gerekçe satırı: ustalık düşük/açık yanılgı/uzun süredir tekrar yok;
  #1 vurgulu çerçeve + sayfanın TEK koyu pili, satırın tamamı buton ≥44px; yeni opsiyonel
  `calisEtiketi='Çöz'`) · `TuzakPaneli`ne opsiyonel `onKir` köprüsü ("Bu tuzağı kır →" o kazanımdan
  pratik başlatır; öğretmen vermeden çağırır → köprü çizilmez) · `HizPaneli` gradyan çubuk + 40 sn
  hedef imi (backend "doğru ama yavaş" GERÇEK eşiği) + kelimeli yorum · `KapsamaKarti` yeni imza
  `{taranan, toplam}` (halka + orana göre canlanan 5 fidan; ESKİ `satirlar` imzasını yalnız Harita
  kullanıyordu — başka çağıran yok, kırılma yok) · **`GuvencePaneli` + `Kapi` SİLİNDİ** (önizlemede
  yok; kehribar/ÖSYM vitrini telif kararıyla RAFTA; tek kullanıcısı Harita idi).
- **`cekirdek.tsx` (geriye-uyumlu):** `IsiHucre` sürekli sky `color-mix`ten **FİDAN 4-ton
  `--v1..--v4` skalasına** geçti (yeni `isiTonu()` dışa açık; 0 → `--v0`); yeni opsiyonel `olcumYok`
  (kesik kenar + hover'sız); kalıcı parıltı gölgesi kaldırıldı (v1.2 §9.3); `heatIn` artık
  `useReducedMotion` kapılı. `Meter` rayı `--ic` + varsayılan dolum `adaçayı→yaprak`; `Halka` rayı
  `--ic`. `CanliSayi` İMZASI DEĞİŞMEDİ (Bugün/teacher/kule kullanımları aynen derleniyor).

### Öğretmen Röntgeni doğrulaması
`OgrenciRontgeni.tsx`e DOKUNULMADI; kullandığı 6 bileşenin zorunlu prop'ları birebir korundu
(yeni prop'ların hepsi opsiyonel; `DersGrubu.toplam?` opsiyonel alan). Proje geneli `tsc` sıfır
hata = öğretmen yüzeyi derleniyor; görsel güncellemeler (FİDAN renkleri, 4-ton ısı) iki yüzeye
tutarlı yansır. Tek bilinçli fark: `OncelikRadari` artık satırlarda "Çöz" pili gösterir — öğretmen
ekranı `calisEtiketi="Set gönder"` GEÇMEDİĞİ için varsayılan "Çöz" okunur (eylem yine ödev
atölyesine gider, davranış bozulmadı); tek satırlık düzeltme önerisi aşağıda.

### `git diff --stat` (bu kartın 3 dosyası)
```
 frontend-v2/src/components/cekirdek.tsx |  56 +-
 frontend-v2/src/components/rontgen.tsx  | 906 +++++++++++++++++++-------------
 frontend-v2/src/screens/Harita.tsx      | 518 ++++++++++++------
 3 files changed, 918 insertions(+), 562 deletions(-)
```
(Ağaçtaki diğer ~57 kirli kayıt önceki onaylı kartlardan — bu kart yalnız beyandaki 3 dosyaya +
bu kart dosyasına yazdı.)

### Kapılar (HAM çıktı)
```
$ ../learnup-brain/node_modules/.bin/tsc --noEmit -p tsconfig.json
(çıktı yok)
tsc exit: 0

$ bun run build   (son satırlar)
✓ built in 1.38s
(!) Some chunks are larger than 500 kB after minification. …  ← bilinen uyarı (vendor-three/katex/charts), bu karttan bağımsız
```
Not: bir build koşusu paralel ajan çakışmasıyla kızardı; kartın öngördüğü gibi yeniden koşuldu → yeşil.

### Gerçekleşen maliyet
$0 (paralı LLM koşusu yok).

### Açık riskler
1. **"En çok gelişen" hero statı eksik** — `/mastery/rontgen` trend'i ders boyutsuz; uydurmamak
   için gizlendi, yerine gerçek "7 Gün Doğruluk ▲puan" kondu. Kriter metnine sapma olarak işlendi.
2. **"Çalışma süresi" haftalık karşılaştırmada yok** — trend'de süre alanı yok; XP ile ikame.
3. **Öğretmen `OncelikRadari` pili "Çöz" okur** (davranış doğru, fiil değil) — 1 satırlık düzeltme
   OgrenciRontgeni kartına kaldı (bu kartın beyanı dışında).
4. Hedef çizgisi hacim ölçeğinde (günlük soru hedefi) — önizlemedeki gibi "doğruluk hedefi" DEĞİL;
   doğruluk için gerçek bir hedef kaynağı yok.
5. `--heat-zero`/`--data-hue` köprüleri hâlâ `index.css`te duruyor (başka yüzeyler okuyor olabilir);
   IsiHucre artık kullanmıyor — köprü temizliği ayrı temizlik kartına.
6. Cam bütçesi: Analizler görünümünde büyük cam yüzey 7 (hero+trend+hafta+öncelik+tuzak+hız+kapsama)
   ≤8; matris+takvim bilinçli mat ikiz (§9.2 perf).

### Sonraki adım önerisi
- **BACKEND kartı:** `/mastery/rontgen` trend'ine ders-bazlı haftalık seri (veya `subject` kırılımı)
  → "en çok gelişen ders" statı + ders filtresinin trend'e inmesi; ayrıca günlük çalışma süresi
  alanı (user_logs'ta gecikme toplamı) → haftalık karşılaştırmaya gerçek "süre" satırı.
- **FRONTEND mini-kart:** OgrenciRontgeni'ye `calisEtiketi="Set gönder"` (OncelikRadari) + boş
  durumdaki `Lighthouse`'un `FidanIkon`la değişimi (öğretmen yüzeyindeki son denizcilik görseli).
- `SUBJECT_UI` (components/ui) ile `SUBJECTS` (src/ui) renkleri iki ayrı kaynak — TASARIM-DILI §2
  ders renkleriyle tek kaynağa indirilmeli (tema katmanı birleştirme kartına).

## Günlük
- 2026-07-22 · ORKESTRATÖR · kart açıldı (beklemede; 006+007 onayını bekler; referans = onaylı analizler v2 önizlemesi)
- 2026-07-22 · ORKESTRATÖR · SERBEST: GOREV-007 onaylandı+arşivlendi; Başlangıç Durumu dolduruldu; Bağlam ui.tsx/cekirdek düzeltmesiyle güncellendi. Kart başlatılabilir (008/011/013 ile dosya kesişimi YOK — paralel).
- 2026-07-23 · FRONTEND · alindi
- 2026-07-23 · FRONTEND · tamamlandi: 3 dosya FİDAN v2'ye taşındı; tsc 0 hata + build yeşil; kriterler işaretli (2 dürüstlük sapması RAPOR'da); öğretmen yüzeyi kırılmadı
- 2026-07-23 · ORKESTRATÖR · onaylandi + arşiv. Denetim kanıtı: Harita.tsx'te Lighthouse/GuvencePaneli/BKT/GlowBorder/kalite grep'i SIFIR; GuvencePaneli+Kapi silindi, başka çağıran YOK (repo grep'i temiz); OgrenciRontgeni.tsx diff'te YOK (öğretmen yüzeyi dokunulmadı beyanı doğru); git diff --stat beyanla birebir (3 dosya, +918/−562); tsc 0 + build yeşil HAM RAPOR'da; $0. İki dürüstlük sapması KABUL ("en çok gelişen" ve "süre" uçta yok — uydurulmadı, gerçek statlarla ikame). Öneriler backlog'a: rontgen trend ders-kırılımı BACKEND kartı; OgrenciRontgeni calisEtiketi mini-kartı; SUBJECT_UI/SUBJECTS tekilleştirme.
