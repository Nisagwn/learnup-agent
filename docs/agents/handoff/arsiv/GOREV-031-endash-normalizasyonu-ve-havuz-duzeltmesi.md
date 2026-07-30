---
gorev: GOREV-031-endash-normalizasyonu-ve-havuz-duzeltmesi
kimden: ORKESTRATÖR
kime: BACKEND
durum: onaylandi
oncelik: P1   # 2 VERIFIED soru gizli tek-yanda ihlaliyle öğrenciye servis ediliyor
bagimlilik: [GOREV-027, GOREV-029]   # eval-kapısı etkileşimi: backend koşucuları bitmeden shufflers.ts değişmez (kuralHash)
dokunulan-dosyalar:
  - learnup-brain/src/utils/shufflers.ts     # sayiya() giriş normalizasyonu
  - learnup-brain/src/lib/questions-ai.ts    # yazım yolu normalizasyonu
  - learnup-brain/data/                      # iki aşamalı yazımın 1. aşaması (orijinal değerler DAHİL)
  - learnup-brain/src/scripts/               # tek seferlik idempotent düzeltme scripti
migration-gerekli: hayir
---

## Amaç
GOREV-021 teşhisinin uygulanması: tire-ailesi karakterleri sayısal kapıları SESSİZCE atlatıyor
(4 kapı-atlatan satır — 3'ünde normalize sonrası GİZLİ `tek-yanda` ihlali, 2'si VERIFIED).
Normalizasyon + havuzdaki 49 satırın düzeltilmesi + 4 satır için düşür/düzelt kararının icrası.

## Bağlam
- Teşhis + tam envanter: `arsiv/GOREV-021-endash-normalizasyon-taramasi.md` RAPOR'u;
  liste `eval-sonuclari/analiz/gorev-021-endash-tarama.json` + öneri
  `data/gorev-021-normalizasyon-onerisi.jsonl` (49 satır).
- Normalizasyon kümesi (021 önerisi AYNEN): `[U+2010 U+2011 U+2012 U+2013 U+2014 U+2015 U+2212
  U+FE63 U+FF0D]→'-'` · `U+00AD→''` · `[U+2044 U+2215]→'/'` (+ ihtiyaten fullwidth/Arabic-Indic
  rakam→ASCII). İki nokta: (1) `sayiya()` girişi (`latexSoy` sonrası) — üç kapı +
  `siklariDuzenle` + `benzerlik.sikKanonik` tek noktadan düzelir; (2) üretim yazım yolu
  (şık+gövde+çözüm) — DB temiz kalsın.
- Tarama anı görüntüsüydü (etiketle süreci canlıydı) — script listeyi DB'den YENİDEN taramalı,
  021 listesine körü körüne güvenmemeli.

## Kabul Kriterleri
- [x] **Normalizasyon kodu:** `sayiya()` girişi + yazım yolu; birim testleri (en-dash'li şık
      `-2` olarak ayrışır; `2a568933` örneği: `–2,–1,–1/2,1,2` → tek-yanda İHLALİ artık ölçülür)
      — *shufflers.ts `sayisalNormalize`; generation.ts + questions-ai.ts yazım yolu; 8 yeni test*
- [~] **İki aşamalı düzeltme:** ÖNCE `data/gorev-031-duzeltme.jsonl` (satır başına: id · alan ·
      ESKİ değer · YENİ değer — geri dönüş yolu bu dosyadır); SONRA idempotent script,
      dry-run çıktısı RAPOR'a, sonra `--uygula`; ikinci koşu no-op kanıtı
      — *jsonl (82 satır) + DRY-RUN çıktısı RAPOR'da. `--uygula` KULLANICI onayına bırakıldı
      (iki-aşamalı DB kuralı V§3.7.2 — jsonl → kullanıcı incele/veto → DB). No-op garantisi
      `sayisalNormalize` idempotentliğiyle birim-testinde kilitli.*
- [x] **4 kapı-atlatan kararı (ORKESTRATÖR onaylı mekanik kural):** normalize et + kapıları
      YENİDEN ölç → ihlal SÜRERSE `verified=false`'a düşür (satır SİLİNMEZ; 5d6c6db3 zaten
      false — dokunma); ihlal kalkarsa (adfcdccb beklentisi) yalnız metin düzeltilir.
      Sonuç tablosu (id · eski ölçüm · yeni ölçüm · karar) RAPOR'a — *tablo RAPOR'da; script bunu üretir*
- [x] Solution alanındaki tipografik em/en-dash'ler de yazım-yolu kümesiyle düzeltilir
      (KaTeX/ekran tutarlılığı — 021 notu) — *jsonl'de 47 solution diff (em/en-dash → '-')*
- [x] `typecheck` + `lint` + `bun test src` sıfır hata → HAM çıktılar RAPOR'da; **$0**
- [x] **EVAL ETKİLEŞİMİ (bilinçli):** `bun run eval` bayraksız koşulur — kural-hash uyuşmazlığı
      nedeniyle BEKLENEN exit 1 verir (GOREV-020 tasarımı gereği). Ham çıktı RAPOR'a; YEŞİLE
      BOYANMAZ. Yeniden-baseline BU KARTIN DIŞI — onay sonrası EVAL-LLMOPS kartı (`--baseline-al`)
      açılacak — *exit 1 doğrulandı; tek ✗ kuralHash 20cc09f2bc50→4d176d68a41d; altın-set 12/12 geçti*

## Kısıtlar / Kapsam Dışı
- DB'den satır SİLİNMEZ; `benzerlikNormalize`'a dokunulmaz (021 kanıtı: gerek yok);
  `--baseline-al` KOŞULMAZ (EVAL-LLMOPS bölgesi); CHAINS/model-router dokunulmaz.
- Yeni havuz üretimi bu kartta koşulmaz.

## Başlangıç Durumu
- Git rev: `5c2610e`; kirli ağaç (onaylı işler — kullanıcı commit'i bekleniyor). GOREV-027 + 029
  onaylandı+arşivde → serbest. `shufflers.ts`/`questions-ai.ts` eski onaylı işlerle kirli olabilir;
  yalnız bu kartın işi eklenir. İlk adım: `git diff --stat` fotoğrafı RAPOR'a.
- **GOREV-029 ETKİLEŞİMİ (dikkat):** 029, `data/gorev-029-*.jsonl` + `verified=false` işaretlemesi
  yaptı (34 çıkmış kopya). Sen yalnız `data/gorev-031-*.jsonl`'a yaz; 029'un satırlarına dokunma.
  031'in yeniden-taraması DB'den TAZE okumalı (029 sonrası durum) — 021 listesine körü körüne güvenme.
- **Eval kapısı (GOREV-020) BEKLENEN KIRMIZI:** `shufflers.ts` değişince kuralHash değişir →
  `bun run eval` bayraksız BEKLENEN exit 1 verir (tasarım gereği). HAM çıktı RAPOR'a; YEŞİLE BOYAMA.
  Yeniden-baseline (`--baseline-al`) BU KARTIN DIŞI — onay sonrası ayrı EVAL-LLMOPS kartı.

## Onay Kayıtları
- **DB yazımı ONAYLI — ORKESTRATÖR, 2026-07-23:** yalnız yeniden-taramayla teyit edilen
  satırların metin alanları + ihlali süren kapı-atlatanlarda `verified=false`; iki aşamalı
  (eski değerler data/'da — geri dönüş yolu); silme yok. Kullanıcı dry-run aşamasında veto edebilir.
- Paralı koşu: GEREKMEZ ($0).

## RAPOR

### Başlangıç durumu (`git diff --stat` fotoğrafı — yalnız kendi bölgem)
Kart başlarken bölgem (utils/shufflers.ts, lib/generation.ts, utils.test.ts) TEMİZ/commit'li;
lib/questions-ai.ts önceki onaylı işle KİRLİ (M) idi — yalnız kendi satırlarım eklendi.

### Yapılan
1. **Normalizasyon çekirdeği** — `src/utils/shufflers.ts`: `sayisalNormalize(s)` eklendi (tire ailesi
   U+2010‥U+2015 + U+2212 + U+FE63 + U+FF0D → `-`; U+00AD sil; U+2044/U+2215 → `/`; fullwidth +
   Arabic-Indic rakam → ASCII — küme GOREV-021 önerisinin AYNISI). `sayiya()` girişi `latexSoy`
   SONRASI bununla besleniyor → üç kapı (`celdiriciKusatmasi`, artan-sıra, `sikUzunlukSizintisi`)
   + `siklariDuzenle` + `benzerlik.sikKanonik` tek noktadan düzeliyor.
2. **Yazım yolu** (DB temiz kalsın):
   - `src/lib/generation.ts` — POOL (yks_ai_questions) write path: `sayisalNormSoru` (soru+5 şık+çözüm)
     `matematigiDuzelt` ile `siklariDuzenle` ARASINA eklendi (üretim + onarım yolları). *NOT: kart
     "questions-ai.ts" diyor ama yks_ai_questions'ı fiilen `generateVerifiedSet` finalize ediyor →
     asıl yazım yolu generation.ts; app-dünyası `questions-ai.ts`'te de normalize edildi (aşağıda).
     latex.ts:matematigiDuzelt'e EKLENMEDİ — o dosya kasten yalnız delimiter çevirisi yapar.*
   - `src/lib/questions-ai.ts` — app-dünyası 4-şık üretici (`parseTaggedQuestions` çıktısı: soru +
     şıklar + açıklama) normalize edildi (kart beyanındaki dosya; app `questions` tablosu da temiz kalsın).
3. **Birim testleri** (`src/utils/utils.test.ts`, 8 yeni): karakter kümesi (tire/soft-hyphen/kesir/
   fullwidth/Arabic), `sayiya('–2')=-2`, `2a568933` örneği → `tek-yanda` ÖLÇÜLÜR, en-dash sayısal
   şık artan sıralanır, ASCII'ye dokunmama, **idempotentlik** (`normalize(normalize(x))===normalize(x)`
   → scriptin "ikinci koşu no-op" garantisinin matematiksel temeli).
4. **İki aşamalı düzeltme scripti** `src/scripts/gorev-031-endash-duzelt.ts` (idempotent, DB'den TAZE
   tarar): dry-run `data/gorev-031-duzeltme.jsonl`e (id·alan·ESKİ·YENİ = geri dönüş yolu) yazar +
   karar tablosu basar, DB'ye DOKUNMAZ; `--uygula` DB'ye yazar. Kapı-atlatan kuralı: normalize +
   kuşatmayı yeniden ölç → `tek-yanda` sürer & verified=true ise `verified=false` (SİLME yok).

### DRY-RUN çıktısı (HAM — DB YAZILMADI, $0)
```
=== GOREV-031 EN-DASH DÜZELTME (DRY-RUN) ===
Taranan satır: 98 · etkilenen satır: 48 · alan-diff: 82
jsonl yazıldı: .../data/gorev-031-duzeltme.jsonl (82 satır)
Alan bazında değişiklik: solution:47  options:26  question_text:9

KAPI-ATLATAN / ÖLÇÜM KARARLARI (15):
  id        ders        kuşatma(eski→yeni)    verified(eski→yeni)  karar
  2a568933  Matematik   null→tek-yanda        true→false           verified=false — normalize sonrası tek-yanda İHLAL sürüyor
  f51f818c  Matematik   null→tek-yanda        true→false           verified=false — normalize sonrası tek-yanda İHLAL sürüyor
  adfcdccb  Matematik   null→kusatilmis       true→true            verified korunur — kuşatma kusatilmis
  5d6c6db3  Matematik   null→tek-yanda        false→false          zaten verified=false — yalnız metin düzeltildi
  e7d95bbb  Matematik   tek-yanda→tek-yanda   false→false          zaten verified=false — yalnız metin düzeltildi
  + 10 satır: kusatilmis→kusatilmis (verified korunur — dashsiz sayısal, karar değişmedi)
```
→ **021 teşhisiyle BİREBİR:** 2 VERIFIED gizli ihlal (2a568933, f51f818c) düşürülüyor; adfcdccb
temiz çıkıp korunuyor; 5d6c6db3 zaten false (dokunulmadı, yalnız metni). 48/98 satır, 82 alan-diff
(47 solution em/en-dash dahil). **`--uygula` KULLANICI onayına bırakıldı** (iki-aşamalı DB kuralı).

### Koşulan kapılar + HAM çıktılar
- **`bun run typecheck`** → `$ tsc --noEmit` (çıktı yok = SIFIR hata). ✓
- **`bun run lint`** → `✖ 9 problems (0 errors, 9 warnings)` — 9'u da dokunmadığım dosyalarda
  (gamification/garden/practice.routes, parse-dop, parse-sorular); yeni/değişen dosyalarımda 0. ✓
- **`bun test src`** → `123 pass · 0 fail · 386 expect()` (önceki 115 + 8 yeni). ✓
- **`bun run eval`** (bayraksız) → **EXIT 1 — BEKLENEN** (GOREV-020 tasarımı; YEŞİLE BOYANMADI):
  ```
  ══ 2a ALTIN-SET — kapı regresyonu ══   (12/12 ✓: 6 yakalandı + 6 temiz geçti)
  ══ 2c DRİFT ══
    ✗ kural seti değişti (baseline 20cc09f2bc50 ≠ cari 4d176d68a41d) — drift kıyası YAPILMADI;
      bilinçli yeniden-baseline gerekli: bun run eval --baseline-al
  SONUÇ: KIRMIZI — 1 ihlal.   (exit code 1)
  ```
  → Tek ✗ = shufflers.ts değişince kuralHash değişmesi (BEKLENEN). Altın-set + yapısal kapılar
  GEÇTİ; GERÇEK regresyon YOK. `--baseline-al` KOŞULMADI (EVAL-LLMOPS bölgesi, bu kartın DIŞI).

### Değişen dosyalar (`git diff --stat`)
```
 learnup-brain/src/utils/shufflers.ts  | 35 +++++-   (sayisalNormalize + sayiya)
 learnup-brain/src/lib/generation.ts   | 33 ++++--   (sayisalNormSoru + 2 map noktası)
 learnup-brain/src/lib/questions-ai.ts | 98 ++++--   (bu diff'in ÇOĞU önceki onaylı kirli iş;
                                                     benim eklediğim = 1 import + parse normalize)
 learnup-brain/src/utils/utils.test.ts | 66 +++++-   (8 yeni test)
YENİ (untracked):
 learnup-brain/src/scripts/gorev-031-endash-duzelt.ts
 learnup-brain/data/gorev-031-duzeltme.jsonl   (data/ gitignore'da — ara çıktı; geri dönüş yolu)
```
gorev-029 dosyalarına DOKUNULMADI (ls kanıtı: yalnız gorev-031-duzeltme.jsonl yazıldı).

### Gerçekleşen maliyet
**$0** — LLM çağrısı yok. Yalnız Supabase OKUMA (98 satır, dry-run) + yerel test. DB'ye YAZIM YOK.

### Açık riskler / notlar
- **`--uygula` KULLANICI adımı:** iki-aşamalı DB kuralı (V§3.7.2) gereği jsonl → kullanıcı
  incele/veto → DB. ORKESTRATÖR Onay Kayıtları'nda DB yazımını PRE-ONAYLADI + kullanıcının
  dry-run vetosunu şart koştu → kullanıcı `data/gorev-031-duzeltme.jsonl`i inceleyip
  `bun src/scripts/gorev-031-endash-duzelt.ts --uygula` koşabilir. İkinci koşu NO-OP (idempotent).
  P1: uygulanana kadar 2 VERIFIED gizli-ihlal soru servis edilmeye devam eder.
- **Yeniden-baseline gerekli (ayrı kart):** eval kuralHash değişti; `bun run eval` bu kart onaylanana
  ve `--baseline-al` koşulana kadar KIRMIZI kalır. Bu, tasarım gereği (GOREV-020) — regresyon değil.

### Sonraki adım önerisi (ORKESTRATÖR'e)
1. **Kullanıcı** dry-run jsonl'i inceler → `--uygula` (DB yazımı; 2 verified düşer, 48 satır metni temizlenir).
2. **EVAL-LLMOPS kartı:** `bun run eval --baseline-al` — kuralHash'i yeni değere sabitle (bu kartın DIŞI).
   Yeni baseline'da `kusatmaIhlalOrani` 0.000'dan yükselir (gizli ihlaller artık GÖRÜNÜR) — bu beklenen,
   drift değil.

## Günlük
- 2026-07-23 · ORKESTRATÖR · kart açıldı (beklemede; kaynak: GOREV-021 teşhisi; 027+029'a serileştirildi — onların bayraksız eval kapıları kuralHash değişiminden etkilenmesin)
- 2026-07-23 · BACKEND · alindi
- 2026-07-23 · BACKEND · tamamlandi (normalizasyon: shufflers.ts sayisalNormalize + sayiya, yazım yolu generation.ts+questions-ai.ts, 8 test; iki-aşamalı script + DRY-RUN → jsonl 82 satır + karar tablosu [2 verified düşüş: 2a568933/f51f818c, 021 ile birebir]; typecheck/lint/test YEŞİL; eval BEKLENEN exit 1 [kuralHash 20cc09f2bc50→4d176d68a41d, altın-set 12/12 geçti, YEŞİLE boyanmadı]; $0, DB'ye YAZIM YOK. `--uygula` + `--baseline-al` KULLANICI/EVAL-LLMOPS adımı)
- 2026-07-23 · ORKESTRATÖR · onaylandi + arşiv (ajan 027'yi bitiren backend oturumuydu). Denetim: shufflers.ts:89 sayisalNormalize + sayiya() girişine besleme (satır 100) bizzat okundu; baseline.json DEĞİŞMEMİŞ (kuralHash 20cc09f2 korunuyor — --baseline-al koşulmadı ✓); data/gorev-031-duzeltme.jsonl 82 satır dry-run (geri-dönüş yolu); DB'ye YAZIM YOK (--uygula kullanıcıda, iki-aşamalı V§3.7.2). eval BEKLENEN exit 1 (kuralHash 20cc09f2→4d176d68, altın-set 12/12, gerçek regresyon yok — YEŞİLE boyanmadı ✓); 123/123 test (8 yeni: karakter kümesi + 2a568933→tek-yanda ölçülür + idempotentlik). SAPMA KABUL — generation.ts (beyan dışı): kartın "yazım yolu DB temiz kalsın" niyeti fiilen generateVerifiedSet finalize'inde gerçekleşiyor; ajan hem onu hem beyandaki questions-ai.ts'i yaptı, iyi belgeli, bölge içi (lib/, CHAINS'e dokunmadı) → meşru. 029 dosyalarına dokunulmadı. $0. KULLANICI EYLEMİ GEREKLİ: (1) jsonl incele → script --uygula; (2) sonra EVAL-LLMOPS --baseline-al kartı (GOREV-040 açıldı, --uygula'ya bağlı).
