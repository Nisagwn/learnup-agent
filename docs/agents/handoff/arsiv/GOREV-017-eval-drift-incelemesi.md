---
gorev: GOREV-017-eval-drift-incelemesi
kimden: ORKESTRATÖR
kime: EVAL-LLMOPS
durum: onaylandi
oncelik: P0   # eval kapısı KIRMIZI kaldıkça havuz kalitesine güven yok; yeni havuz üretimi bu çözülmeden yapılmaz
bagimlilik: []   # BAŞLATILABİLİR — kimseyle dosya kesişimi yok
dokunulan-dosyalar:
  - learnup-brain/eval-sonuclari/   # analiz çıktıları (ölçüm önce dosyaya — V§3.7.2)
migration-gerekli: hayir
---

## Amaç
GOREV-012 QA turunda bayraksız `bun run eval` **KIRMIZI** çıktı (EVAL_EXIT=1, baseline
`2026-07-20T10-36-00`):
- `✗ KÖTÜLEŞME — kuşatma ihlal oranı: 0.000 → 0.133`
- `✗ KÖTÜLEŞME — NN kopya adedi: 0.000 → 2.000`

(2a altın-set kapıları + 2c sızıntı/görsel drift YEŞİL.) Kök nedeni teşhis et, kanıtlı karar
önerisi getir. **Bu kart teşhis kartıdır — düzeltme UYGULAMAZ.**

## Bağlam
- GOREV-007/010/008 yalnız frontend dosyalarına dokundu → drift onların regresyonu DEĞİL; havuz
  içeriği / veri hattı kaynaklıdır (baseline 20 Temmuz — o günden beri havuza giren/etiketlenen
  içerik şüpheli bölge).
- Baseline sıfırlama kararı yalnız ORKESTRATÖR'de (qa.md §Katı-5 / eval-llmops.md) — gerekçesiz
  sıfırlama YASAK; sıfırlama önerilecekse kanıt tablosu şart.
- NN kopya = özgünlük bariyeri konusu (`benzerlik.ts` ders-bazlı Jaccard eşikleri senin bölgen).

## Kabul Kriterleri
- [x] `bun run eval` KENDİ oturumunda BAYRAKSIZ yeniden koşulur → ham çıktı RAPOR'a. ⚠️ Sonuç
      **YEŞİL** çıktı, KIRMIZI değil: drift birinci-fark detektörü, QA turu degrade snapshot'ı
      baseline'a gömdü (RAPOR §0). RED, 07-20 baseline'ına karşı yeniden kuruldu + kök nedeni bulundu.
- [x] **NN kopya kimliği:** `3271b2fc`↔`5d6c6db3` (Matematik, 0.6204, eşik 0.62); ikisi de
      07-20 07:54 UTC, v4-pro üretimi (künye-dışı) → **ölçüm değişimi** (0.75→0.62 eşiği)
- [x] **Kuşatma ihlali 0.133:** `eaacebbc` (B=9), `e7d95bbb` (E=9); kaynak `ab-uretim gemma26`
      (gemma-4-26b:free); payda **15** (sayısal-şıklı AI), pay **2** → 2/15 açıkça yazıldı
- [x] **Karar önerisi NET:** kuşatma → (a) veri düzeltme (2 soru → `data/*.jsonl`, DB ayrı kart);
      NN → (b) baseline yenileme + kanıt tablosu (ölçüm değişimi). **KARAR ORKESTRATÖR'DE.**
- [x] **$0 kalındı:** `--hakem`/`--evet` KOŞULMADI; yalnız bayraksız eval + yerel benzerlik
- [x] Analiz çıktıları `eval-sonuclari/`'ye dosya olarak (`…-analiz.json` + `…-teshis-raporu.md`);
      özet RAPOR'da

## Kısıtlar / Kapsam Dışı
- DB'ye YAZIM YOK; baseline dosyasına DOKUNULMAZ; CHAINS/model değişikliği yok.
- Kirli ağaçtaki dosyalara dokunulmaz (`git checkout --` yasak — onaylı işler taşıyor).

## Başlangıç Durumu
- Git rev: `5c2610e` (branch `feat/yks-brain`); kirli ağaç ~57 kayıt — TAMAMI onaylı iş; kullanıcı
  commit'i bekleniyor. `learnup-brain` kirli dosyaları önceki ONAYLI kartlardan (bu incelemede
  drift'e katkıları değerlendirilebilir ama değiştirilemez).

## Onay Kayıtları
- Paralı koşu: GEREKMEZ ($0 — bayraksız eval + yerel analiz). `--hakem` için onay YOKTUR.

## RAPOR

### Yapılan
Bayraksız `bun run eval` kendi oturumumda koşuldu; NN/kuşatma metrikleri TÜM verified AI havuzuna
(n=98) karşı, **kapının kendi fonksiyonlarını import eden** salt-okunur bir analizle yeniden
hesaplandı (ölçüm kapıyla birebir). Kusurlu soruların id'leri, skorları, created_at'leri ve
`data/ab-*.json` künyeleriyle kaynak-koşu eşleşmesi çıkarıldı. Git + mtime ile eşik/kapı
sertleştirme zamanlaması doğrulandı. **Düzeltme UYGULANMADI** (teşhis kartı). Detay:
[`eval-sonuclari/gorev-017-teshis-raporu.md`](../../../learnup-brain/eval-sonuclari/gorev-017-teshis-raporu.md)
· makine çıktısı [`…-nn-kusatma-analiz.json`](../../../learnup-brain/eval-sonuclari/gorev-017-nn-kusatma-analiz.json).

### Kök neden — İKİ BAĞIMSIZ neden (ikisi de 07-20 üretimi, frontend kartları DEĞİL)

**① NN kopya `0 → 2` = ÖLÇÜM DEĞİŞİMİ (gerçek kötüleşme değil).**
Aşan çift `3271b2fc-…3a4d` ↔ `5d6c6db3-…5693` (Matematik, MAT.10.6.1), skor **0.6204**, eşik 0.62,
ikisi de created_at **2026-07-20 07:54 UTC**, künye-dışı (v4-pro). Bu, benzerlik.ts'te belgelenen
"CANLI İKİZ VAKASI"nın kendisi — A(a,2)↔B(1,−1) / A(2,a)↔B(−1,2) uzaklık-5 ikizi. Eşik **bu çifti
yakalamak için** bilerek `0.75→0.62` indirildi. Baseline (07-20 **10:36 UTC**) nnKopya=0'ı **0.75
eşiğiyle** hesapladı (çift o an havuzdaydı ama 0.6204<0.75); 0.62'yi getiren commit `2379ce5`
**12:42 UTC** (baseline'dan sonra; bir önceki 19777db'de benzerlik.ts yoktu). Yani `0→2` sıçraması
baseline'ın 0.75, ölçümün 0.62 ile alınmasından. Çift **gerçek ikiz**; "regresyon" etiketi sahte.

**② Kuşatma `0 → 0.133` = GERÇEK içerik kusuru.** Oran **2/15** (payda=15 sayısal-şıklı AI sorusu,
pay=2 `tek-yanda`). İhlalciler:
- `eaacebbc-…35b04` — doğru B=9, şıklar 6/9/12/15/18 (alt=1,üst=3), created 07-20 **10:40 UTC**
- `e7d95bbb-…63f18a` — doğru E=9, şıklar 5/6/7/8/9 (alt=4,üst=0), created 07-20 **10:51 UTC**

İkisi de `ab-uretim --etiket gemma26` künyesinde (`google/gemma-4-26b-a4b-it:free`), baseline
10:36 UTC'den **sonra** yazıldı. generation.ts yazım-yolu kuşatma reddi de aynı `2379ce5`
(12:42 UTC) ile ilk kez geldi → sorular kapı commit'lenmeden yazıldı. Cari kod bunları reddederdi;
**eski kural-setiyle girmiş legacy satırlar.**

**Ortak örüntü:** kusurlu içerik 07-20 sabahı gevşek kuralla üretildi → `2379ce5` (15:42 TSİ)
hem 0.62 eşiğini hem yazım kapılarını sertleştirdi → **baseline (13:36 TSİ) arada kaldı, hiç
yenilenmedi** → QA turu legacy içeriği YENİ kuralla ölçünce iki metrik de bayat baseline'a göre
"kötüleşti".

**Ek bulgu (§0):** RED artık yeniden üretilemiyor — drift kapısı sabit değil **en-son snapshot'a**
göre kıyaslıyor (`sort().at(-1)`); QA turu degrade snapshot'ı yazınca baseline oldu, bu oturumda
bayraksız eval `0.133→0.133 / 2→2` = **YEŞİL** çıktı.

### KARAR ÖNERİSİ (karar ORKESTRATÖR'de — uygulama bu kartta yok)
- **Kuşatma → Path (a) veri düzeltme:** 2 gemma26 sorusu (`eaacebbc`, `e7d95bbb`) işaretlen/düşür
  → önce `data/*.jsonl`, **DB yazımı AYRI kart + AYRI onay**. (İkincil: 7'lik gemma26 :free partisi
  kalite gözden geçirilebilir.)
- **NN kopya → Path (b) baseline yenileme:** `0→2` ölçüm artefaktı; baseline cari 0.62 kural-setiyle
  **yeniden alınmalı** (sıfırlama YALNIZ ORKESTRATÖR). Çift gerçek ikiz olduğundan opsiyonel Path a:
  ikizden **biri düşürülür**.
- **Sistemik (sonraki-adım, eval.ts benim bölgem ama teşhis kartı → uygulamadım):**
  (1) snapshot kapı-sabitlerinin hash'ini saklamalı; kural değişince sessiz kırmızı yerine bilinçli
  yeniden-baseline. (2) drift sabitlenmiş/etiketli baseline'a göre kıyaslamalı — birinci-fark değil.

### Değişen dosyalar (`git status` = beyan)
- `learnup-brain/eval-sonuclari/gorev-017-nn-kusatma-analiz.json` (yeni — analiz çıktısı)
- `learnup-brain/eval-sonuclari/gorev-017-teshis-raporu.md` (yeni — teşhis raporu)
- `learnup-brain/eval-sonuclari/2026-07-22T10-22-49-140Z.json` (yeni — bayraksız eval koşumun
  yazdığı drift snapshot; 07-20 baseline dosyasına DOKUNULMADI)
- (geçici analiz scripti `eval-sonuclari/_gorev017_analiz.ts` koşuldu ve **silindi** → git izi yok)
- Bölge dışına yazım YOK; CHAINS/eşik/router/migration DEĞİŞMEDİ; DB'ye yazım YOK.

### Koşulan kapılar + çıktıları
```
bun run eval  → exit 0  (2a altın-set 12/12 ✓ · 2c drift: sızıntı 0.286→0.286, kuşatma
                0.133→0.133, görsel 4→4, NN 2→2 — hepsi ✓; SONUÇ: YEŞİL)  [birinci-fark; §0]
bun run typecheck → exit 0
bun run lint      → exit 0 (0 hata, 10 uyarı; hepsi kart-dışı önceden var olan unused-var)
bun test src      → uygulanmadı (kaynak TS değişmedi)
--hakem/--evet    → KOŞULMADI (yazılı onay yok)
```

### Gerçekleşen maliyet
**$0.** Yalnız bayraksız eval + yerel benzerlik hesabı; tek bir paralı LLM çağrısı gönderilmedi.

### Açık riskler
- NN çiftinin baseline (10:36 UTC) anında `verified=true` olduğu, created_at (07:54, baseline'dan
  önce) + üretim hattının yazımda `verified:true` set etmesi + benzerlik.ts'in "ikisi de havuza
  yazıldı" ifadesiyle **güçlü** ama %100 log-kanıtlı değil (verified bayrağı sonradan da dönmüş
  olabilir). Sonuç değişmez: her hâlde frontend regresyonu değil, 07-20 üretimi.
- Havuz n: baseline 94 → şimdi 98 (+4); gemma26 +7 yazmış → net fark tam mutabakatı (ara
  unverify/temizlik) bu kartın kapsamı dışı, drift metriklerini etkilemez.
- Bu oturumun eval koşumu yeni bir degrade-seviye snapshot (`10-22`) yazdı → baseline kararı
  alınırken en-yeni snapshot budur.

### Sonraki adım önerisi
ORKESTRATÖR: (1) kuşatma için veri-düzeltme kartı aç (`data/*.jsonl` → onay → DB), (2) NN için
cari kural-setiyle baseline yenileme kararı ver, (3) sistemik iki eval.ts iyileştirmesi için ayrı
kart (kapı-hash'i + sabitlenmiş baseline).

## Günlük
- 2026-07-22 · ORKESTRATÖR · kart açıldı (BAŞLATILABİLİR — P0; kaynak: GOREV-012 QA turu eval KIRMIZI bulgusu; kimseyle dosya kesişimi yok)
- 2026-07-22 · EVAL-LLMOPS · alindi
- 2026-07-22 · EVAL-LLMOPS · tamamlandi (teşhis: NN 0→2 = ölçüm değişimi [0.75→0.62 eşiği baseline'dan sonra]; kuşatma 0→0.133 = gerçek kusur [2 gemma26 legacy sorusu, kapı öncesi yazım]; ek bulgu: drift kapısı birinci-fark — RED baseline'a gömüldü. $0; düzeltme uygulanmadı.)
- 2026-07-22 · ORKESTRATÖR · onaylandi → arsiv/ (DENETİM: analiz dosyaları + zaman damgaları doğrulandı [baseline 10:36, QA snapshot 08:35, 017 koşusu 10:22 UTC — anlatıyla birebir]; kaynak koda yazım YOK; $0. Bağımsız eval koşusu BİLİNÇLİ atlandı — her koşu yeni snapshot yazıp ölçüm zincirini kirletiyor [017 §0'ın kanıtladığı kusur]. KARARLAR: ① kuşatma ihlalcileri eaacebbc+e7d95bbb → verified=false [silme yok, geri alınabilir]; ② NN ikizinden BİRİ → verified=false [seçim EVAL-LLMOPS'ta, gerekçeli]; ③ temiz havuz üzerinde yeni baseline → GOREV-019 [P0, DB yazım onayı kartta]; ④ sistemik drift mimarisi [sabit baseline + kural-seti hash'i] → GOREV-020 [P1, 019'a bağlı]. 4 onay ölçütü sağlandı.)
- 2026-07-22 · EVAL-LLMOPS · alindi (teşhis kartı; $0 — bayraksız eval + yerel benzerlik analizi)
- 2026-07-22 · EVAL-LLMOPS · tamamlandi (iki bağımsız kök neden: NN=ölçüm değişimi [0.75→0.62 eşiği], kuşatma=gerçek kusur [gemma26 :free 2 soru]; karar önerisi ORKESTRATÖR'e; $0; kapılar YEŞİL)
