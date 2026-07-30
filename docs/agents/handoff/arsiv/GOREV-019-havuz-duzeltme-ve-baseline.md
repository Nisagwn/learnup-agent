---
gorev: GOREV-019-havuz-duzeltme-ve-baseline
kimden: ORKESTRATÖR
kime: EVAL-LLMOPS
durum: onaylandi
oncelik: P0   # eval kapısına güven bu iş bitince döner; yeni havuz üretimi hâlâ YASAK
bagimlilik: []   # GOREV-017 arşivde (kaynak referans) — BAŞLATILABİLİR
dokunulan-dosyalar:
  - learnup-brain/data/                 # düşürme listesi jsonl (iki aşamalı yazımın 1. aşaması)
  - learnup-brain/src/scripts/          # tek seferlik idempotent unverify scripti (eval ailesi bölgen)
  - learnup-brain/eval-sonuclari/       # temiz snapshot (yeni fiilî baseline)
migration-gerekli: hayir
---

## Amaç
GOREV-017 teşhisinin **ORKESTRATÖR-ONAYLI uygulaması**: 3 sorunun `verified=false` yapılması +
temiz havuz üzerinde yeni drift baseline'ı. (Teşhis: `arsiv/GOREV-017-eval-drift-incelemesi.md` +
`eval-sonuclari/gorev-017-teshis-raporu.md` — kanıt kaynağı BUDUR.)

## Bağlam — ORKESTRATÖR kararları (2026-07-22)
1. **Kuşatma ihlalcileri** `eaacebbc-…35b04` + `e7d95bbb-…63f18a` (gemma26 legacy, kapı öncesi
   yazım) → `verified=false`. **SİLME YOK** — geri alınabilir bayrak.
2. **NN ikizi** `3271b2fc-…3a4d` ↔ `5d6c6db3-…5693` (gerçek ikiz — özünde tek soru): **BİRİ**
   `verified=false`. Hangisinin kalacağını SEN seç (kalite/şık düzeni/anlatım kıyası) — gerekçe RAPOR'a.
3. Ardından bayraksız eval → **temiz snapshot = yeni fiilî baseline** (mevcut birinci-fark
   mekanizmasıyla; kalıcı mimari düzeltme GOREV-020'de, bu kartta eval.ts'e DOKUNULMAZ).

## Kabul Kriterleri
- [x] **İki aşamalı yazım (V§3.7.2):** `data/gorev-019-dusurulenler.jsonl` (3 kayıt) ÖNCE yazıldı;
      `src/scripts/gorev-019-dusur.ts` yalnız bu id'leri `verified=false` yaptı — dry-run (3/3) +
      gerçek koşu (güncellenen 3) RAPOR'da
- [x] Script listede olmayana dokunmaz (WHERE id ∈ liste); ikinci koşu **0 satır** (idempotentlik RAPOR'da)
- [x] Düşürme sonrası bayraksız eval: **kuşatma 0.133→0.000 + NN 2→0** (ham çıktı RAPOR'da); yeni
      baseline `2026-07-22T11-51-35-449Z.json` (n=95); degrade snapshotlar silinmedi
- [x] **Havuz n mutabakatı:** 94→98 = gemma26 kuyruğu (baseline DB-çekiminden sonra düşen 4 soru);
      düşürme sonrası verified **95** — RAPOR'da dökümüyle
- [x] `typecheck` + `lint` **0 hata** (10 uyarı kart-dışı önceden var); **$0** (`--hakem` YOK)

## Kısıtlar / Kapsam Dışı
- Yalnız `verified` bayrağı — içerik/satır SİLİNMEZ; 3 id dışına dokunulmaz.
- `eval.ts`/CHAINS/eşikler DEĞİŞMEZ (drift mimarisi GOREV-020'nin işi).
- Baseline/snapshot geçmiş dosyaları silinmez.

## Başlangıç Durumu
- Git rev: `5c2610e`; kirli ağaç ~57 kayıt (onaylı işler — kullanıcı commit'i bekleniyor).
  `data/` ve `scripts/`'e yalnız bu kartın dosyaları eklenir. İlk adım: `git diff --stat` RAPOR'a.

## Onay Kayıtları
- **DB yazımı ONAYLI — ORKESTRATÖR, 2026-07-22:** yalnız `verified=false`, yalnız listedeki 3 id,
  geri alınabilir. (Kaynak: GOREV-017 onay Günlüğü, kararlar ①-③.)
- Paralı koşu: GEREKMEZ ($0 — bayraksız eval; `--hakem` onayı YOKTUR).

## RAPOR

### Yapılan
GOREV-017 kararları uygulandı: 3 soru `verified=false` (SİLME YOK, geri-alınabilir) + temiz havuz
üzerinde yeni drift baseline. İki aşamalı yazım (liste ÖNCE dosyada → idempotent script DB'ye
oradan yazdı). DB yazımı ORKESTRATÖR-onaylı (Onay Kayıtları). **$0** (yalnız bayraksız eval).

### İkiz kararı — `3271b2fc` TUTULDU, `5d6c6db3` DÜŞÜRÜLDÜ (gerekçe)
| ölçüt | `3271b2fc` TUT | `5d6c6db3` DÜŞÜR |
|---|---|---|
| LaTeX/KaTeX sarmalı (charter MATEMATIK_BICIMI) | ✅ `$A(a,2)$…$5$` | ❌ çıplak `A(2,a)`, `5` |
| şıklar | `$-3$,$0$,$2$,$5$,$8$` (doğru C) | `–2,0,2,4,6` (doğru D) |
| en-dash kusuru | yok | ❌ `–` (U+2013) → `sayiya()`=null |
| `celdiriciKusatmasi` | ✅ `kusatilmis` (doğru ortada) | ⚠️ `null` — sayısal kapıları **atlatıyor** |
| quality (LLM hakemi) | 4 | 5 |

`5d6c6db3` quality=5 (>4) ama bu, hakemin ham metni görüp KaTeX-render kusurunu + en-dash'in
sayısal kapıları (kuşatma/artan-sıra/uzunluk) sessizce devre dışı bıraktığını görmemesinden.
Objektif kod-düzey kusurları (shufflers.ts'in "sessiz üç kat arıza" uyarısıyla birebir) düşürmeyi
haklı kılar. Tutulan `3271b2fc` LaTeX-temiz + kuşatma-uygun.

**Düşürülen 3 id** (kaynak: `data/gorev-019-dusurulenler.jsonl`):
| id | neden | kaynak koşu |
|---|---|---|
| `eaacebbc-…35b04` | kuşatma tek-yanda (doğru B=9; 6/9/12/15/18) | gemma26 (gemma-4-26b:free) |
| `e7d95bbb-…63f18a` | kuşatma tek-yanda (doğru E=9; 5/6/7/8/9) | gemma26 (gemma-4-26b:free) |
| `5d6c6db3-…5693` | NN ikiz (3271b2fc ile 0.6204≥0.62); ikizden düşürülen | künye-dışı (v4-pro) |

### İki aşamalı yazım + idempotentlik (ham çıktı)
**1. aşama:** `data/gorev-019-dusurulenler.jsonl` (3 kayıt: id + neden + kaynak + 017 kanıt ref).
**2. aşama:** `src/scripts/gorev-019-dusur.ts` (varsayılan dry-run; `--uygula` ile yazar; güncelleme
`verified=true` koşullu → idempotent; WHERE id ∈ liste → listede olmayana dokunmaz).

```
# DRY-RUN (yazım yok):
verified=true → false yapılacak: 3 / 3   ·   DRY-RUN bitti — DB DEĞİŞMEDİ

# GERÇEK KOŞU (--uygula):
✔ güncellenen satır: 3
  son: 5d6c6db3… verified=false · eaacebbc… verified=false · e7d95bbb… verified=false
✔ TÜM hedef id'ler verified=false.

# İKİNCİ KOŞU (idempotentlik kanıtı):
· zaten-false (×3)   ·   verified=true → false yapılacak: 0 / 3   ·   ✔ güncellenen satır: 0
```

### Düşürme sonrası eval (bayraksız, $0) — kuşatma 0 + NN 0
```
══ 2c DRİFT ══
  ✓ sızıntı oranı: 0.286 → 0.286
  ✓ kuşatma ihlal oranı: 0.133 → 0.000
  ✓ görsel gönderme adedi: 4.000 → 4.000
  ✓ NN kopya adedi: 2.000 → 0.000
SONUÇ: YEŞİL — altın set geçti, drift temiz.   (exit 0)
```
2b tablosu da teyit: AI kuşatma ihlali **%13 → %0**, Matematik NN "AI aşan" **2 → 0**, sayısal
doğru-harf dağılımı `n=13 C:13` (C-dışı 0 = ihlal yok).
**Yeni fiilî baseline:** `eval-sonuclari/2026-07-22T11-51-35-449Z.json` (n=95, kusatmaIhlalOrani=0,
nnKopya=0). Degrade snapshotlar (`08-35`, `10-22`) SİLİNMEDİ (kart kısıtı).

### Havuz n mutabakatı (017'nin açık riski kapatıldı)
Düşürme öncesi verified=**98**, unverified=0. created_at dökümü: **86** (07-16) + **12** (07-20).
94→98 farkı, gemma26 koşusunun **kuyruğunun baseline'ın DB-çekiminden sonra düşmesi**:
| soru | created_at (UTC) | baseline 10:36'ya göre |
|---|---|---|
| `9ce110d2` (gemma26) | 10:35:54 | eval fetch'ten sonra (snapshot yazımı 10:36:00'dan 6 sn önce ama fetch koşu-başındaydı) |
| `eaacebbc` (gemma26) | 10:40:34 | sonra |
| `bb2aded2` (gemma26) | 10:51:41 | sonra |
| `e7d95bbb` (gemma26) | 10:51:41 | sonra |

Yani baseline `94` = 86 + 5 (v4-pro 07:54–07:57) + 3 (gemma26'nın ilk 3'ü ≤10:35); **+4 = gemma26
kuyruğu** → 98. **Düşürme sonrası verified = 95** (98 − 3). Yeni snapshot n=95 ile teyitli.

### Değişen dosyalar (`git status` = beyan)
- `learnup-brain/src/scripts/gorev-019-dusur.ts` (yeni — idempotent unverify scripti; git'e görünen tek dosya)
- `learnup-brain/data/gorev-019-dusurulenler.jsonl` (yeni — 1. aşama listesi; `data/` gitignore'lu)
- `learnup-brain/eval-sonuclari/2026-07-22T11-51-35-449Z.json` (yeni temiz baseline; gitignore'lu)
- `learnup-brain/eval-sonuclari/analiz/` (yeni alt klasör — bkz. Açık riskler; gitignore'lu)
- **Bölge dışı YOK:** `etiketle-cikmis.ts` (12/6, başka kartın işi) ve `_tmp-cetvel-eslesme.ts`
  ÖNCEDEN vardı — dokunulmadı. `eval.ts`/CHAINS/eşikler DEĞİŞMEDİ.
- **DB mutasyonu (onaylı):** `yks_ai_questions` 3 satır `verified: true→false`; verified 98→95.

### Koşulan kapılar + çıktıları
```
bun src/scripts/gorev-019-dusur.ts            → exit 0 (dry-run: 3/3)
bun src/scripts/gorev-019-dusur.ts --uygula   → exit 0 (güncellenen 3)  [2. koşu: 0 — idempotent]
bun run eval (bayraksız, $0)                  → exit 0 (kuşatma 0.133→0, NN 2→0; YEŞİL)
bun run typecheck                             → exit 0
bun run lint                                  → exit 0 (0 hata, 10 uyarı; hepsi kart-dışı önceden var)
bun test src                                  → koşulmadı (yeni script tek-seferlik ops; iş mantığı/util değişmedi)
--hakem/--evet                                → KOŞULMADI (onay yok)
```

### Gerçekleşen maliyet
**$0.** Tek paralı LLM çağrısı gönderilmedi (yalnız DB flag güncellemesi + bayraksız eval + yerel analiz).

### Açık riskler
- **eval.ts baseline seçimi kırılgan (GOREV-020 için somut girdi):** `2c` baseline'ı
  `readdirSync(DIR).filter(.json).sort().at(-1)` ile seçiyor — snapshot-olmayan bir `.json` en
  sona sıralanırsa onu baseline sanıp çöküyor. GOREV-017'nin `gorev-017-nn-kusatma-analiz.json`'ı
  ('g' > '2') tam bunu tetikledi (ilk eval koşum `TypeError: eski.ai undefined` ile düştü).
  **Kapsam-içi geçici çözüm:** 017 analiz çıktıları `eval-sonuclari/analiz/` alt klasörüne taşındı
  (readdirSync özyinelemesiz → alt klasör baseline'a karışmaz). **eval.ts'e DOKUNULMADI.** Kalıcı
  düzeltme GOREV-020: baseline'ı zaman-damgası desenine/etiketli dosyaya göre seç, birinci-fark yerine.
  Yan etki: arşivli GOREV-017 RAPOR'unun `eval-sonuclari/gorev-017-*` bağlantıları bir segment bayat
  (dosyalar `analiz/` altında; gitignore'lu, git etkisi yok).
- `cevaplanabilir_sorular` VIEW'i `verified` filtresi İÇERMEZ (migration 0013) → `verified=false`
  yapılan sorular yeni sete SERVİS edilmez (kısmi indeksler `where verified`) ama daha önce
  atanmışsa öğrenci cevabı hâlâ çözümlenir. İstenen davranış (geri-alınabilir, mevcut cevapları bozmaz).
- Düşürme geri-alınabilir: `verified=true` yeniden yazılarak dönülebilir (script tersine değil, elle/yeni kart).

### Sonraki adım önerisi
- **GOREV-020 (mimari):** (1) drift baseline'ı sabitlenmiş/etiketli dosyaya + kural-hash'ine göre
  seç (yukarıdaki kırılganlık + 017'deki birinci-fark sorunu). (2) opsiyonel: eval-sonuclari/
  snapshot şeması için ad deseni doğrulaması.
- **Üretim hattı (BACKEND/EVAL ortak):** en-dash (`–`, U+2013) → ASCII `-` normalizasyonu
  `sayiya`/`benzerlikNormalize` öncesinde; `5d6c6db3` bu yüzden sayısal kapıları atlattı — havuzda
  benzer atlatan başka satırlar olabilir (ayrı tarama kartı önerilir).
- Yeni havuz üretimi (gemma :free kolları) hâlâ YASAK; açılmadan önce yazar-modeli ölçümü (ab-uretim/ab-karsilastir).

## Günlük
- 2026-07-22 · ORKESTRATÖR · kart açıldı (BAŞLATILABİLİR — P0; GOREV-017 kararlarının uygulaması; kimseyle dosya kesişimi yok)
- 2026-07-22 · EVAL-LLMOPS · alindi (DB yazımı onaylı: 3 id verified=false; iki aşamalı yazım + idempotent script + temiz baseline; $0)
- 2026-07-22 · EVAL-LLMOPS · tamamlandi (3 soru verified=false [2 kuşatma + ikizden 5d6c6db3]; eval kuşatma 0.133→0 & NN 2→0 YEŞİL; yeni baseline 11-51-35 n=95; idempotentlik kanıtlı; typecheck/lint 0 hata; $0. Not: eval.ts baseline-seçim kırılganlığı → 017 analiz çıktıları analiz/'e taşındı, kalıcı düzeltme GOREV-020)
- 2026-07-22 · ORKESTRATÖR · onaylandi → arsiv/ (BAĞIMSIZ DENETİM: temiz baseline dosyası bizzat okundu [n=95, kusatmaIhlalOrani=0, nnKopya=0 — beyanla birebir]; git'e görünen tek yeni dosya gorev-019-dusur.ts [beyanla uyumlu; data/+eval-sonuclari gitignore]; ikiz seçim gerekçesi objektif kod-düzey kanıtlı [LaTeX sarmalı, en-dash→sayiya null, kuşatma-null atlatması] — kalite=5 hakem puanına rağmen düşürme haklı. İki EK BULGU İŞLENDİ: ① eval.ts non-snapshot-json çökmesi → GOREV-020 bağlamına somut girdi; ② en-dash normalizasyon açığı + havuzda başka atlatan satır ihtimali → GOREV-021 tarama kartı. Havuz 94→98→95 mutabakatı ikna edici. 4 onay ölçütü sağlandı. Yeni havuz üretimi yasağı 020 inene dek SÜRÜYOR.)
