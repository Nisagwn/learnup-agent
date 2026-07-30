---
gorev: GOREV-020-eval-drift-mimarisi
kimden: ORKESTRATÖR
kime: EVAL-LLMOPS
durum: onaylandi
oncelik: P1
bagimlilik: [GOREV-019]   # önce temiz havuz + temiz snapshot insin; ilk işaretli baseline o olacak
dokunulan-dosyalar:
  - learnup-brain/src/scripts/eval.ts
migration-gerekli: hayir
---

## Amaç
GOREV-017 §0 bulgusunun **kalıcı çözümü**: drift kapısı birinci-fark detektörü olmaktan çıkar —
regresyon bir kez ateşlenip baseline'a gömülemez, kural-seti değişimi sessiz kırmızı/yeşil üretemez.

## Bağlam
- Mevcut kusur (kanıtlı, 017 §0): drift `eval-sonuclari/` içindeki **en son snapshot'a** kıyaslıyor
  (`readdirSync().sort().at(-1)`) → QA turunun KIRMIZI'sı bir sonraki koşuda YEŞİL'e döndü
  (degrade değerler baseline oldu). Ayrıca eşik değişimi (0.75→0.62) baseline'ı sessizce
  geçersizleştirdi — 017'deki sahte "NN regresyonu"nun kökü.
- Bu dosya senin bölgen; 019'un temiz snapshot'ı (`2026-07-22T11-51-35-449Z.json`, n=95) ilk
  işaretli baseline olacak.
- **019'dan somut ek girdi:** `sort().at(-1)` snapshot-olmayan `.json`'a da takılıyor —
  `gorev-017-nn-kusatma-analiz.json` baseline sanılıp `TypeError: eski.ai undefined` çökmesi
  yaşandı (geçici çözüm: analiz çıktıları `analiz/` alt klasörüne taşındı). Kalıcı çözümde
  snapshot AD DESENİ doğrulaması da olmalı (zaman-damgası deseni dışındaki dosyalar yok sayılır).

## Kabul Kriterleri
- [x] **Sabit baseline:** drift, `baseline` olarak İŞARETLİ snapshot'a kıyaslar (en-son-dosya
      DEĞİL); baseline işaretleme yalnız açık komut/bayrakla (ör. `--baseline-al`) yapılır ve
      koşu çıktısında hangi baseline'a kıyaslandığı yazılır
- [x] **Degrade koşu baseline'ı DEĞİŞTİRMEZ:** kırmızı sonuç kaç kez koşulursa koşulsun kırmızı
      kalır (017'deki gömülme senaryosu test/kanıtla kapatılır)
- [x] **Kural-seti hash'i:** snapshot, kapı sabitlerinin (NN eşiği, kuşatma kuralları, sızıntı/görsel
      eşikleri) hash'ini taşır; cari hash ≠ baseline hash'i ise drift kıyası YAPILMAZ — açık mesajla
      ("kural seti değişti — bilinçli yeniden-baseline gerekli, --baseline-al") **exit 1**
      (sessiz yeşil YASAK, sessiz kırmızı da)
- [x] İlk işaretli baseline = 019'un temiz snapshot'ı (koşu kaydı RAPOR'a)
- [x] 2a altın-set + 2c sızıntı/görsel davranışları korunur; `bun run typecheck` + `lint` +
      `bun test src` sıfır hata; eval BAYRAKSIZ $0
- [x] eval.ts değişikliği NEDEN yorumlu (V§3.4; 017 vakası referans gösterilir)

## Kısıtlar / Kapsam Dışı
- Router/CHAINS/eşik DEĞERLERİ dokunulmaz (yalnız kıyas mekanizması + hash altyapısı).
- `--hakem` YOK; geçmiş snapshot dosyaları silinmez.

## Başlangıç Durumu
- Git rev: `5c2610e`; kirli ağaç ~58 kayıt (onaylı işler + `gorev-019-dusur.ts` — kullanıcı
  commit'i bekleniyor). `eval.ts` temiz (kimse dokunmadı). Yalnız bu kartın işi eklenir.
  İlk adım: `git diff --stat` fotoğrafı RAPOR'a.

## Onay Kayıtları
- Paralı koşu: GEREKMEZ ($0).

## RAPOR

### Başlangıç fotoğrafı (`git diff --stat` son satırı)
```
49 files changed, 1823 insertions(+), 1350 deletions(-)   (kartın beyanıyla uyumlu; eval.ts temizdi)
```

### Yapılan
Drift kapısı "en son .json'a kıyasla" (birinci-fark) mimarisinden **işaretli-baseline + kural-seti
hash** mimarisine geçirildi. Tamamı `eval.ts` içinde:
1. **İşaret dosyası** `eval-sonuclari/baseline.json` (`{dosya, kuralHash, isaretTarihi, not}`):
   2c yalnız buradaki snapshot'a kıyaslar; olağan koşu snapshot yazar ama işarete ASLA dokunmaz.
   Çıktıda `baseline: <dosya> (işaret: <tarih> · kuralHash <h12>)` satırı basılır.
2. **İşaretleme yalnız açık bayrakla:** `--baseline-al` (bu koşunun snapshot'ı; 2a altın-set
   kırmızıysa REDDEDİLİR) veya `--baseline-al=<snapshot.json>` (var olan dosya, DB'siz).
3. **Kural-seti hash'i:** snapshot `kuralHash` (sha256, CRLF-normalize) taşır; kaynak = drift
   metriklerini üreten üç kapı dosyası (`benzerlik.ts` NN eşik+shingle · `shufflers.ts`
   kuşatma+sızıntı · `soru-saglik.ts` görsel). Hash uyuşmazsa kıyas YAPILMAZ, açık mesaj + exit 1.
   Eski-şema snapshot'larda hash işaretten okunur (işaretleme = "cari kural setiyle geçerli" beyanı).
4. **Ad-deseni doğrulaması** (`YYYY-AA-GGTss-dd-ss-mmmZ.json`): desen dışı .json baseline olamaz —
   019'daki `eski.ai undefined` çökme sınıfı kapandı (ayrıca şema nöbeti: `ai` bloğu doğrulanır).
5. **`--drift-prova=<snap>`:** DB'siz replay kanıt aracı — verilen snapshot, CANLI kıyasla AYNI
   `driftKiyasla()` fonksiyonundan işaretli baseline'a kıyaslanır; hiçbir dosya yazılmaz.
6. `readdirSync().sort().at(-1)` tamamen söküldü; tüm değişiklikler NEDEN yorumlu (017 §0 referanslı).

### Değişen dosyalar
- `learnup-brain/src/scripts/eval.ts` (tek kod dosyası)
- `learnup-brain/eval-sonuclari/baseline.json` (YENİ — işaret dosyası; 019 snapshot'ını gösterir)
- `learnup-brain/eval-sonuclari/2026-07-23T07-41-03-842Z.json` (bayraksız kanıt koşusunun snapshot'ı)
- bu kart. Hiçbir geçmiş snapshot silinmedi/değiştirilmedi.

### Kapı çıktıları (HAM, son satırlar)
```
$ bun run typecheck        → tsc --noEmit                       (çıktı yok)  exit 0
$ bun run lint             → ✖ 9 problems (0 errors, 9 warnings) exit 0
                             (9 uyarının tümü başka dosyalarda, önceden vardı; eval.ts temiz)
$ bun test src             → 110 pass / 0 fail, 342 expect, 5 dosya [604ms]  exit 0
$ bun run eval  (BAYRAKSIZ)→
  ══ 2c DRİFT — işaretli baseline'a göre ══
    snapshot yazıldı: 2026-07-23T07-41-03-842Z.json · kuralHash 20cc09f2bc50
    baseline: 2026-07-22T11-51-35-449Z.json (işaret: 2026-07-23T07:40:47.027Z · kuralHash 20cc09f2bc50)
    ✓ sızıntı oranı: 0.286 → 0.286   ✓ kuşatma ihlal oranı: 0.000 → 0.000
    ✓ görsel gönderme adedi: 4.000 → 4.000   ✓ NN kopya adedi: 0.000 → 0.000
  SONUÇ: YEŞİL — altın set geçti, drift temiz.   exit 0
  (2a: 12/12 ✓ — 6 kusur yakalandı, 6 temiz geçti; 2b tabloları değişmedi)
```

### Kanıt koşuları
```
# İlk işaretli baseline = 019 temiz snapshot (kriter 4):
$ bun src/scripts/eval.ts --baseline-al=2026-07-22T11-51-35-449Z.json
  ✓ baseline işaretlendi: 2026-07-22T11-51-35-449Z.json · kuralHash 20cc09f2bc50   exit 0

# 017 gömülme senaryosu (kriter 2) — degrade QA snapshot'ı İKİ KEZ, aynı gerçek kıyas yolundan:
$ bun src/scripts/eval.ts --drift-prova=2026-07-22T08-35-16-448Z.json   (1. ve 2. koşu AYNI)
  ✗ KÖTÜLEŞME — kuşatma ihlal oranı: 0.000 → 0.133   ✗ KÖTÜLEŞME — NN kopya adedi: 0.000 → 2.000
  SONUÇ: KIRMIZI — 2 kötüleşme (prova; işaret değişmedi)   exit 1  → iki koşuda da KIRMIZI;
  baseline.json bayt-bayt değişmedi. (Eski mimaride 2. bakış YEŞİL'e dönüyordu.)

# Kural-hash uyuşmazlığı (kriter 3) — işarete geçici sahte hash yazılıp gerçek kıyas koşuldu:
$ bun src/scripts/eval.ts --drift-prova=2026-07-23T07-41-03-842Z.json
  ✗ kural seti değişti (baseline deadbeefdead ≠ cari 20cc09f2bc50) — drift kıyası YAPILMADI;
    bilinçli yeniden-baseline gerekli: bun run eval --baseline-al   exit 1
  (ardından işaret --baseline-al=…449Z.json ile geri kondu; doğrulandı)

# Ad-deseni nöbeti (019 çökme sınıfı):
$ bun src/scripts/eval.ts --baseline-al=gorev-017-nn-kusatma-analiz.json
  ✗ baseline-al: desen dışı ad … (beklenen: YYYY-AA-GGTss-dd-ss-mmmZ.json)   exit 1
```

### Gerçekleşen maliyet
**$0.** Tek LLM çağrısı yok (`--hakem` hiç kullanılmadı); tüm koşular DB-okuma/dosya düzeyinde.

### Açık riskler
1. **Eşzamanlı ortam olayı (dürüstlük kaydı):** iş sürerken dışarıdan iki bayraksız eval koşuldu
   (ortamda `bun run etiketle` + 2 dev server canlı): `2026-07-23T07-38-36-583Z.json` (ESKİ kod,
   hash'siz — süreç düzenlemelerimden önce başlamış) ve `2026-07-23T07-41-26-751Z.json` (yeni kod).
   İkincisi, hash-uyuşmazlık provasının ~5 sn'lik sahte-hash penceresine denk geldiyse o aktör bir
   kez "kural seti değişti / exit 1" görmüştür — mekanizma arızası değil, demo çakışması; işaret
   şu an doğru (019 + gerçek hash, doğrulandı). İki dosya da meşru tarihçe olarak bırakıldı.
2. Kural hash'i **dosya-içeriği** bazlı: üç kapı dosyasında yorum değişikliği bile bilinçli
   `--baseline-al` ister. Bilinçli tercih (muhafazakâr, gürültülü-ama-açık); NEDEN'i kodda.
3. Eski-şema snapshot'lar hash taşımaz; işaretlenirlerse hash beyanı işaretleme anından gelir
   (kodda yorumlu). Yeni snapshot'lar hash'i kendileri taşır.

### Sonraki adım önerisi
- ORKESTRATÖR onayı sonrası kullanıcı commit'i (eval.ts + baseline.json + yeni snapshot'lar).
- 2b'nin görünür tuttuğu C-yozlaşması (kuşatma 2-2 kuralı ↔ ÖSYM gerçeği) politika kararı hâlâ
  kullanıcıda — bu karttan bağımsız, ayrı kart ister.

## Günlük
- 2026-07-22 · ORKESTRATÖR · kart açıldı (beklemede; GOREV-019 onayını bekler — kaynak: GOREV-017 §0 bulgusu)
- 2026-07-22 · ORKESTRATÖR · SERBEST: GOREV-019 onaylandı+arşivlendi; Başlangıç Durumu dolduruldu; 019'un non-snapshot-json çökme bulgusu Bağlam'a eklendi (ad deseni doğrulaması kriter kapsamında). Kart başlatılabilir.
- 2026-07-23 · EVAL-LLMOPS · alindi
- 2026-07-23 · EVAL-LLMOPS · tamamlandi: işaretli-baseline + kural-hash mimarisi; ilk baseline = 019 snapshot'ı; kapılar yeşil; $0
- 2026-07-23 · ORKESTRATÖR · onaylandi → arsiv/ (DENETİM: baseline.json işaret dosyası bizzat okundu [019 snapshot'ı + kuralHash]; ÇAPRAZ KANIT — GOREV-016'nın bağımsız eval koşusu yeni mekanizmayı canlı gösterdi [aynı kuralHash 20cc09f2, işaretli baseline satırı, YEŞİL]; kanıt koşuları ikna edici [gömülme 2x KIRMIZI + bayt-bayt sabit işaret, sahte-hash exit 1, ad-deseni reddi]. KABUL: dosya-içeriği bazlı muhafazakâr hash [gürültülü-ama-açık tercihi doğru], eşzamanlılık dürüstlük kaydı [demo çakışması — mekanizma arızası değil]. 017 §0 sistemik kusuru KAPANDI. Aynı ajana GOREV-021 verildi. 4 ölçüt sağlandı.)
