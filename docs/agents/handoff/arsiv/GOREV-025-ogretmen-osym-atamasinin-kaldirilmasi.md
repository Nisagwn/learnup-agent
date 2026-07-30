---
gorev: GOREV-025-ogretmen-osym-atamasinin-kaldirilmasi
kimden: ORKESTRATÖR
kime: FRONTEND
durum: onaylandi
oncelik: P0   # telif kapanışı — öğrenci /odevler üzerinden çıkmışa DOLAYLI maruz kalabiliyor (GOREV-015 açık riski)
bagimlilik: []   # BAŞLATILABİLİR — GOREV-016 (sunucu reddi) ile eş amaçlı, dosya kesişimi yok
dokunulan-dosyalar:
  - frontend-v2/src/screens/sinif/OdevAtolyesi.tsx   # kaynak seçeneğinden 'osym' kalkar
migration-gerekli: hayir
---

## Amaç
Telif kararının son arayüz açığını kapatmak (GOREV-015 denetim bulgusu): Ödev Atölyesi'nde
öğretmen `kaynak:'osym'` seçebiliyor → öğrenci `/odevler`de çıkmış ÖSYM sorusu görebiliyor.
**Öğretmen ödev derlemesinde osym kaynağı arayüzden KALDIRILIR** (yalnız AI havuzu).

## Bağlam
- Karar: 2026-07-22 telif kararı ("çıkmışlar HİÇBİR kullanıcı yüzüne servis edilmez") —
  EKRAN-HARITASI §7/§14 notu. Sunucu tarafı reddi GOREV-016'nın kriteri (BACKEND) — bu kart
  UI'yı, 016 API'yi kapatır; ikisi bağımsız ilerleyebilir.
- Yönetici iç görünümleri (kule/SoruHavuzu hacim istatistikleri, rontgen kalibrasyon grafiği)
  KAPSAM DIŞI — bunlar servis değil şeffaflık göstergesi (GOREV-015 denetiminde kabul edildi).

## Kabul Kriterleri
- [x] Ödev derleme formunda kaynak seçeneği olarak 'osym' KALKAR (tek kaynak: AI havuzu);
      seçenek kalıntısı grep ile kanıtlanır
- [x] Derleme önizlemesi/adet sayacı yalnız AI havuzundan sayar; havuz yetmezse eksik sayı
      AÇIKÇA gösterilir (mevcut dürüstlük kuralı korunur — soru uydurulmaz)
- [x] **Geçmişte atanmış osym'li ödevler:** görüntüleme davranışı DEĞİŞTİRİLMEZ (mevcut
      cevap/geçmiş bozulmaz — GOREV-019 emsali geri-alınabilirlik ilkesi); durum RAPOR'a not edilir
- [x] Öğretmen yüzünde "çıkmış sorulardan ödev" vaadi metni kalmaz (grep kanıtı)
- [x] `tsc --noEmit` sıfır hata + `bun run build` yeşil → çıktılar RAPOR'da

## Kısıtlar / Kapsam Dışı
- Backend ödev uçları GOREV-016'nın işi — bu kart yalnız arayüz.
- Ödev Atölyesi'nin FİDAN görsel dönüşümü BU KART DEĞİL (P2 ekran kartında) — burada yalnız
  osym seçeneğinin sökümü + zorunlu metin düzeltmeleri.

## Başlangıç Durumu
- Git rev: `5c2610e`; kirli ağaç ~58 kayıt (onaylı işler — kullanıcı commit'i bekleniyor).
  İlk adım: `git diff --stat` fotoğrafı RAPOR'a.

## Onay Kayıtları
- Paralı koşu: GEREKMEZ ($0).

## RAPOR

### Yapılan
- `KAYNAK` seçici dizisi (`karisik/osym/ai`) ve `kaynak` state'i tamamen söküldü; yerine
  `KAYNAK_AI = 'ai' as const` sabiti + telif kararı yorumu kondu (GOREV-016 referanslı).
- Formdaki "Kaynak" `SegmentGecis` bloğu kaldırıldı — kapsam artık yalnız Ders + Zorluk + Soru sayısı.
- Üç API çağrısının tümü artık sabit `kaynak: 'ai'` gönderiyor: `GET /teacher/soru-havuzu`,
  `POST /teacher/odev`, `POST /teacher/hedefli-odev`. `useAsync` deps'inden `kaynak` çıktı (ilkel kuralı korunuyor).
- Savunma hattı: havuz yanıtı istemcide de süzülüyor (`.filter(q => q.kaynak !== 'osym')`) —
  GOREV-016 inene dek sunucu yanlışlıkla çıkmış sızdırsa bile öğretmen yüzüne çıkmaz.
- Metin düzeltmeleri: başlık alt bilgisi "ÖSYM kalibrasyonundan geçmiş soruları…" →
  "AI havuzundan soru derle…"; boş-durum önerisindeki "kaynak 'Karışık'" ibaresi kalktı;
  Set Özeti "Kaynak" satırı sabit "AI havuzu". Liste rozeti artık her zaman `sky/AI` —
  brass (kehribar) rozet ve `examLabel`/`examYear` rozetleri ekrandan kalktı (kehribar kuralı:
  yalnız ÖSYM mührü; bu ekranda ÖSYM içeriği kalmadığı için kullanım da kalmadı).
- Adet sayacı/önizleme değişmedi: `bulunan < istenen` uyarısı ve "Soru uydurulmaz — eksik
  olduğu gibi görünür" dürüstlük bloğu aynen korunuyor; sayılar artık yalnız AI havuzundan
  gelen `total` üzerinden.
- **Geçmişte atanmış osym'li ödevler:** bu karta hiçbir görüntüleme yolu DEĞİŞTİRİLMEDİ —
  dosya yalnız derleme/atama ekranı; öğrenci `/odevler` görüntülemesi ve mevcut cevap/geçmiş
  akışları (GOREV-019 geri-alınabilirlik emsali) olduğu gibi duruyor.

### Grep kanıtı (dosyada kalan `osym|ÖSYM|çıkmış|Karışık|KAYNAK` geçişleri)
```
36:  kaynak: 'osym' | 'ai'                       ← sunucu yanıt tipinin aynası (sözleşme)
48: * TELİF KARARI (2026-07-22): çıkmış (ÖSYM)…  ← yorum (kullanıcıya görünmez)
52:const KAYNAK_AI = 'ai' as const
101:        kaynak: KAYNAK_AI,
113:  // sunucu yanlışlıkla çıkmış sızdırsa bile… ← yorum
114:  …filter((q) => q.kaynak !== 'osym')         ← savunma süzgeci (seçenek değil)
141:          kaynak: KAYNAK_AI,
149:          kaynak: KAYNAK_AI,
```
Kullanıcıya görünen hiçbir metinde ÖSYM/çıkmış/Karışık kalmadı; form seçeneği olarak 'osym' sıfır.

### Değişen dosyalar (`git diff --stat`)
```
 frontend-v2/src/screens/sinif/OdevAtolyesi.tsx | 43 +++++++++++---------------
 1 file changed, 18 insertions(+), 25 deletions(-)
```
Başlangıç fotoğrafı (rev `5c2610e`): ağaç 49 dosya / 1823+ 1350- idi; kapanışta 54 dosya /
1904+ 1574- — fark paralel kart ajanlarının onaylı işleri, benim yazımım yalnız yukarıdaki
dosya + bu kart.

### Koşulan kapılar (HAM çıktı)
```
$ ../learnup-brain/node_modules/.bin/tsc --noEmit -p tsconfig.json
TSC_EXIT=0            (sıfır hata, çıktı boş)

$ bun run build   (son satırlar)
dist/assets/vendor-three-CX4HGfXI.js                  900.77 kB │ gzip: 240.29 kB │ map: 3,918.50 kB
✓ built in 1.91s
(!) Some chunks are larger than 500 kB after minification. …  ← önceden var olan uyarı, engel değil
BUILD_EXIT=0
```

### Gerçekleşen maliyet
$0 — LLM koşusu yok.

### Açık riskler
- Sunucu tarafı: `/teacher/odev` ve `/teacher/hedefli-odev` uçları `kaynak:'osym'` payload'ını
  hâlâ KABUL eder — API'yi doğrudan çağıran biri çıkmış atayabilir. Kapanış GOREV-016'da (BACKEND).
- `HavuzSorusu.kaynak` union'ı ve `examLabel/examYear` alanları sunucu sözleşmesi aynası olarak
  tipte duruyor; GOREV-016 sonrası sözleşme daralırsa tip de sadeleştirilebilir.

### Sonraki adım önerisi
- GOREV-016 kapanınca bu ekrandaki savunma süzgeci (satır 112-114) sadeleşebilir (tek satır temizlik).
- Ödev Atölyesi'nin FİDAN görsel dönüşümü ayrı P2 kartında (bu kartın kapsam dışı notu gereği).

## Günlük
- 2026-07-22 · ORKESTRATÖR · kart açıldı (BAŞLATILABİLİR — P0; kaynak: GOREV-015 denetimi açık risk #1; GOREV-016 ile eş amaçlı [UI+API], dosya kesişimi yok)
- 2026-07-23 · FRONTEND · alindi
- 2026-07-23 · FRONTEND · tamamlandi (tsc 0 hata, build yeşil; osym seçeneği söküldü + savunma süzgeci)
- 2026-07-23 · ORKESTRATÖR · onaylandi → arsiv/ (DENETİM: kendi grep'im rapordaki kanıtla BİREBİR — kalan osym geçişleri yalnız tip aynası/yorum/savunma süzgeci, kullanıcıya görünen SIFIR; diff yalnız beyanlı dosya; savunma süzgeci kapsam-içi isabetli ek. Kapı çıktıları ham ve makul; 7 paralel ajan ağacı değiştirdiğinden BAĞIMSIZ tam-ağaç tsc/build denetimini dalga bitince topluca koşacağım [Günlük'e işlenecek]. Açık risk zaten GOREV-016'nın kriteri. Telif UI kapanışı TAMAM — sunucu ayağı bekleniyor.)
