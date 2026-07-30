---
gorev: GOREV-021-endash-normalizasyon-taramasi
kimden: ORKESTRATÖR
kime: EVAL-LLMOPS
durum: onaylandi
oncelik: P1
bagimlilik: []   # bağımsız; aynı ajan olduğundan GOREV-020'den SONRA alınması önerilir
dokunulan-dosyalar:
  - learnup-brain/eval-sonuclari/analiz/   # tarama çıktısı
  - learnup-brain/data/                    # düşürme/düzeltme ÖNERİ listesi (yazım yok — öneri)
migration-gerekli: hayir
---

## Amaç
GOREV-019'un ek bulgusunun havuz-geneli taraması: **en-dash (`–`, U+2013) `sayiya()`'yı null'a
düşürüp sayısal kapıları (kuşatma / artan-sıra / uzunluk) SESSİZCE atlatıyor** (kanıt: `5d6c6db3`
— shufflers.ts'in "sessiz üç kat arıza" uyarısıyla birebir). Havuzda başka atlatan satır var mı?
**Teşhis kartıdır — düzeltme UYGULANMAZ** (017/019 emsali).

## Kabul Kriterleri
- [x] **Tarama:** TÜM AI havuzu (verified + unverified) şık ve gövde metinlerinde ASCII-dışı
      sayısal karakterler: U+2013 (en-dash), U+2014 (em-dash), U+2212 (minus sign) + tespit
      edilen benzerleri → etkilenen satır listesi (id · alan · karakter · verified durumu)
      `eval-sonuclari/analiz/`'e
- [x] Etkilenenlerden **sayısal kapıları fiilen atlatanlar** (`celdiriciKusatmasi=null` vb.)
      ayrıca işaretlenir; düşürme/düzeltme ÖNERİ listesi `data/*.jsonl`'e — **DB yazımı YOK,
      karar ORKESTRATÖR'de**
- [x] **Normalizasyon önerisi NET:** hangi noktada (yazım yolu — `sayiya`/`benzerlikNormalize`
      öncesi) hangi karakter kümesi normalize edilmeli; dokunulacak dosyaların bölge sahipliği
      (senin bölgen mi, BACKEND kartı mı gerekir) açıkça yazılır
- [x] `typecheck`/`lint` yeşil (geçici script kullanılırsa silinir, iz kalmaz); **$0**

## Kısıtlar / Kapsam Dışı
- DB'ye YAZIM YOK; üretim koduna (lib/scripts kalıcı dosyaları) DOKUNULMAZ.
- ÖSYM/çıkmış korpusu kapsam DIŞI (yalnız RAG kaynağı — telif kararı; AI havuzu yeterli).

## Başlangıç Durumu
- Git rev: `5c2610e`; kirli ağaç ~58 kayıt (onaylı işler). Salt-okuma tarama + dosya çıktısı.

## Onay Kayıtları
- Paralı koşu: GEREKMEZ ($0).

## RAPOR

### Tarama (yks_ai_questions, TÜM havuz: 98 satır = 95 verified + 3 unverified; alanlar:
### question_text · options.A-E · solution)
- **Etkilenen satır: 49/98** (tam liste `eval-sonuclari/analiz/gorev-021-endash-tarama.json` —
  id · alan · karakter · adet · verified + kapı differential'ı satır başına).
- Karakter dağılımı (adet, alan bazında):
  ```
  U+2013 EN DASH            options:51  solution:186  question_text:11   ← TEK kapı-etkili karakter
  U+2014 EM DASH            solution:90                                  ← tipografik (çözüm metni)
  U+2212 MINUS SIGN         solution:4
  U+2011 NO-BREAK HYPHEN    solution:2
  U+00BD ½                  solution:3
  U+00D7 ×                  solution:2
  Rakam benzeri (fullwidth/Arabic-Indic) HİÇ YOK → benzerlikNormalize \d maskesi etkilenmiyor.
  ```

### Kapı-atlatanlar (4 satır — hepsi Matematik, hepsinde şıklarda U+2013; differential:
### orijinal ölçüm vs normalize-sonrası ölçüm, gerçek `celdiriciKusatmasi`/`sayiya` ile)
```
2a568933… verified=true  kusatma null→tek-yanda   İHLAL-GIZLİ  + artan-sıra-atlatıldı
f51f818c… verified=true  kusatma null→tek-yanda   İHLAL-GIZLİ  + artan-sıra-atlatıldı
5d6c6db3… verified=false kusatma null→tek-yanda   İHLAL-GIZLİ  + artan-sıra-atlatıldı  (019'un kanıt vakası)
adfcdccb… verified=true  kusatma null→kusatilmis  (temiz ama ölçülmemişti) + artan-sıra-atlatıldı
```
Örnek (2a568933, VERIFIED): şıklar `–2, –1, –1/2, 1, 2`, doğru B(–1) → normalize sonrası altta
yalnız 1 çeldirici (–2), üstte 3 → `tek-yanda` İHLALİ; en-dash yüzünden kapı hiç çalışmamıştı.
Öneri listesi: `data/gorev-021-normalizasyon-onerisi.jsonl` (49 satır; 3× DUSUR-veya-DUZELT,
1× DUZELT, 45× DUZELT-düşük-öncelik/tipografik). **DB'ye yazılmadı — karar ORKESTRATÖR'de.**

### Normalizasyon önerisi (NET) + bölge sahipliği
1. **Kapı tarafı — `sayiya()` girişi** (`src/utils/shufflers.ts`, `latexSoy` sonrası, ayrıştırma
   öncesi): `[U+2010 U+2011 U+2012 U+2013 U+2014 U+2015 U+2212 U+FE63 U+FF0D]→'-'` ·
   `U+00AD→''` · `[U+2044 U+2215]→'/'` (+ ihtiyaten fullwidth/Arabic-Indic rakam→ASCII).
   Tek noktadan üç kapı + `siklariDuzenle` + `benzerlik.sikKanonik` düzelir.
   **BÖLGEM DEĞİL** (rolümde benzerlik.ts'in yalnız EŞİKLERİ var; shufflers.ts üretim-hattı
   kapısıdır) → **BACKEND kartı gerekir.**
2. **Yazım yolu** (soru havuza girerken — questions-ai.ts üretim hattı): aynı küme şık+gövde+çözüme
   uygulanmalı ki DB temiz dursun; mevcut 49 satırın düzeltilmesi de bu kartın kapsamına girer.
   **BACKEND bölgesi.**
3. `benzerlikNormalize` için değişiklik ŞİMDİLİK GEREKMEZ (rakam-benzeri karakter havuzda yok —
   tarama kanıtı); sayiya-içi normalizasyon sikKanonik yolunu zaten kapsar.
4. **GOREV-020 ETKİLEŞİMİ (kritik):** shufflers.ts değişince kural-seti hash'i değişir → eval
   drift kıyası bilinçli `--baseline-al` ister. Ayrıca düzeltme sonrası 2 verified gizli
   `tek-yanda` ölçülür hâle gelir → `kusatmaIhlalOrani` 0.000'dan yükselir ve drift KIRMIZI verir.
   Düzeltme kartı; (a) normalizasyon, (b) 4 satır için düşür/düzelt kararı, (c) yeniden-baseline
   adımını BİRLİKTE planlamalı — yoksa kapı, düzeltmeyi regresyon sanır.

### Kapılar (HAM, son satırlar) — geçici script silindikten SONRA koşuldu
```
$ bun run typecheck → tsc --noEmit (çıktı yok)                 exit 0
$ bun run lint      → ✖ 9 problems (0 errors, 9 warnings)      exit 0   (tümü eski, başka dosyalarda)
git status src/     → yalnız önceden kirli dosyalar; _tmp-gorev-021-tarama.ts SİLİNDİ, iz yok
data/gorev-029-*    → dokunulmadı (yalnız gorev-021-normalizasyon-onerisi.jsonl eklendi)
```

### Gerçekleşen maliyet
**$0** — LLM çağrısı yok; yalnız Supabase okuma (98 satır) + yerel differential test.

### Açık riskler / notlar
- Solution alanındaki 186 en-dash + 90 em-dash tipografik; kapı etkisi yok ama KaTeX/ekran
  tutarlılığı için yazım-yolu normalizasyonuna dahil edilebilir (BACKEND kararı).
- Tarama anı görüntüsüdür: `bun run etiketle` süreci canlıydı (difficulty yazar, metin yazmaz —
  sonuçları etkilemez); yeni üretim koşuları listeyi eskitebilir, düzeltme kartında yeniden koşulmalı.

### Sonraki adım önerisi
- ORKESTRATÖR: BACKEND'e normalizasyon+düzeltme kartı (yukarıdaki 4 maddelik plan; GOREV-020
  yeniden-baseline adımı dahil); 4 kapı-atlatan satır için düşür/düzelt kararı.

## Günlük
- 2026-07-22 · ORKESTRATÖR · kart açıldı (beklemede; kaynak: GOREV-019 en-dash bulgusu; aynı ajanda GOREV-020'den sonra alınması önerilir — dosya kesişimi yok)
- 2026-07-23 · EVAL-LLMOPS · alindi
- 2026-07-23 · EVAL-LLMOPS · tamamlandi: 49/98 satır etkilenmiş, 4 kapı-atlatan (3 gizli ihlal); öneri jsonl + BACKEND kartı ihtiyacı raporlandı; $0
- 2026-07-23 · ORKESTRATÖR · onaylandi + arşiv. Denetim kanıtı: iki çıktı dosyası bizzat doğrulandı (analiz/gorev-021-endash-tarama.json 42 KB + data/gorev-021-normalizasyon-onerisi.jsonl 49 satır, şema id·subject·verified·alanlar·karakterler·kapiAtlatma·oneri); DB yazımı YOK, gorev-029 dosyalarına dokunulmamış (ls kanıtı), geçici script izsiz, typecheck/lint yeşil, $0. TEŞHİS kartı disiplinine tam uyum. 020-etkileşim analizi (kuralHash değişimi + gizli ihlallerin görünür olması → bilinçli yeniden-baseline) düzeltme kartının plan girdisi: GOREV-031 açılıyor (BACKEND; 027+029 bitince — eval kapısı etkileşimi nedeniyle serileştirildi).
