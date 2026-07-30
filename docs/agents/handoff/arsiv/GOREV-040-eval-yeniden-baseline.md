---
gorev: GOREV-040-eval-yeniden-baseline
kimden: ORKESTRATÖR
kime: EVAL-LLMOPS
durum: onaylandi
oncelik: P1   # eval kapısı şu an BİLİNÇLİ KIRMIZI (kuralHash uyuşmazlığı) — kapatılmalı
bagimlilik: [GOREV-031]   # ✅ arşivde — kural değişti; ÖN KOŞUL: kullanıcı --uygula'yı koşmalı
dokunulan-dosyalar:
  - learnup-brain/eval-sonuclari/   # yeni işaretli baseline (baseline.json + snapshot)
migration-gerekli: hayir
---

## Amaç
GOREV-031 `shufflers.ts`'e `sayisalNormalize` ekleyince kuralHash `20cc09f2…`→`4d176d68…`
değişti → eval drift kapısı BİLİNÇLİ exit 1 veriyor (GOREV-020 tasarımı). Havuz düzeltmesi
(`--uygula`) uygulandıktan SONRA temiz durum üzerinde yeni baseline işaretlenerek kapı kapatılır.

## Bağlam
- Mekanizma: `arsiv/GOREV-020-*` (marked baseline + kuralHash nöbeti). Mevcut baseline:
  `{dosya: 2026-07-22T11-51-35-449Z.json, kuralHash: 20cc09f2…}`.
- **ÖN KOŞUL (KULLANICI):** GOREV-031'in `gorev-031-endash-duzelt.ts --uygula`'sı koşulmuş
  olmalı (2 VERIFIED→verified=false + metin düzeltmeleri). Yoksa baseline KİRLİ durumu
  dondurur (2 gizli ihlal hâlâ verified). Bu koşulmadan kart BAŞLAMAZ.

## Kabul Kriterleri
- [ ] Ön koşul doğrulanır: `--uygula` koştu mu (DB'de 2a568933/f51f818c `verified=false`,
      düzeltme sayıları jsonl ile tutuyor) — koşmadıysa `engellendi` + kullanıcıya bildir
- [ ] Temiz havuzda `bun run eval` bayraksız koşulur; ham çıktı RAPOR'a (yeni kuralHash 4d176d68…
      ile drift artık KIRMIZI vermemeli — çünkü işaret güncellenecek)
- [ ] `--baseline-al=<yeni snapshot>` ile yeni işaret alınır; `baseline.json` yeni dosya +
      yeni kuralHash + isaretTarihi + not; ESKİ snapshot silinmez (arşiv kalır)
- [ ] Doğrulama: temiz koşuda `bun run eval` artık exit 0 (drift yeşil); RAPOR'a ham kanıt
- [ ] **$0** (eval bayraksız — paralı koşu yok); kuralHash türetimi (benzerlik+shufflers+
      soru-saglik) yeni değerle tutarlı

## Kısıtlar / Kapsam Dışı
- Kod/eşik DEĞİŞTİRİLMEZ (yalnız işaret güncelleme). `--hakem`/paralı koşu YASAK.
  Yeni havuz üretimi bu kartta koşulmaz. shufflers.ts/benzerlik.ts dokunulmaz.

## Başlangıç Durumu
- ORKESTRATÖR, kullanıcı `--uygula`'yı koştuğunu bildirince doldurur + kart serbest kalır.

## Onay Kayıtları
- Paralı koşu: GEREKMEZ ($0).

## RAPOR
### Yürüten: ORKESTRATÖR (kullanıcı "2 ve 3 u sen yap" yetkisiyle; $0 operasyonel — kod/eşik değişmedi)
- **Ön koşul teyidi:** kullanıcı 0021 migration'ı koştu; ben 031 `--uygula`'yı koştum (48/48 satır; ikinci dry-run 0 diff = idempotent). 2a568933 + f51f818c artık `verified=false`.
- **BEFORE (düz `bun run eval`):** cari kuralHash 4d176d68a41d ≠ baseline 20cc09f2bc50 → "drift kıyası YAPILMADI, bilinçli yeniden-baseline gerekli" → exit 1 (bilinçli KIRMIZI, GOREV-020 tasarımı).
- **İŞARET (`bun run eval --baseline-al`):** altın-set 3/3 yakaladı (tek-yanda · uzunluk-sizintisi · gorsel-gonderme) → REDDEDİLMEDİ; yeni baseline `2026-07-23T16-17-48-477Z.json` · kuralHash 4d176d68a41d; SONUÇ YEŞİL.
- **AFTER (düz `bun run eval`):** EVAL_EXIT=0; drift yeni baseline'a göre temiz. `baseline.json` = {dosya: 2026-07-23T16-17-48-477Z.json, kuralHash: 4d176d68…, not: "koşu ile işaret (--baseline-al)"}. Eski snapshot silinmedi (arşiv kalır).
- **Maliyet $0** (bayraksız eval — paralı koşu yok). shufflers/benzerlik/eşik DOKUNULMADI — yalnız işaret güncellendi.

## Günlük
- 2026-07-23 · ORKESTRATÖR · kart açıldı (beklemede; kaynak: GOREV-031 kuralHash değişimi; ÖN KOŞUL kullanıcı --uygula — o koşulunca serbest)
- 2026-07-23 · ORKESTRATÖR · onaylandi + arşiv (kendim yürüttüm — kullanıcı "2 ve 3 u sen yap" yetkisi). Eval kapısı YEŞİL: before exit 1 (bilinçli kuralHash uyuşmazlığı) → --baseline-al (altın-set 3/3 geçti) → after exit 0 temiz. baseline.json kuralHash 20cc09f2→4d176d68. $0.
