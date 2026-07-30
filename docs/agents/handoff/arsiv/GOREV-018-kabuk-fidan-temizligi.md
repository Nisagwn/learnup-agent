---
gorev: GOREV-018-kabuk-fidan-temizligi
kimden: ORKESTRATÖR
kime: FRONTEND
durum: onaylandi
oncelik: P1
bagimlilik: [GOREV-015]   # App.tsx kesişimi — telif rota sökümü inmeden kabuk işine girilmez
dokunulan-dosyalar:
  - frontend-v2/src/App.tsx
  - frontend-v2/index.html
  - frontend-v2/src/components/fx.tsx
  - frontend-v2/src/index.css
  - frontend-v2/src/components/OdakZamanlayici.tsx
  - frontend-v2/src/screens/Login.tsx
migration-gerekli: hayir
---

## Amaç
**GOREV-012 QA bulgularının düzeltilmesi** (arşivdeki RAPOR = kanıt kaynağı): kabuk/kimlik
düzeyindeki COASTAL borcu + `prefers-reduced-motion` boşlukları. Salt görsel/gate/metin işi —
işlev değişikliği YOK.

## Bağlam
- Bulgular dosya+satır kanıtlarıyla `arsiv/GOREV-012-qa-bugun-giris-incelemesi.md` RAPOR'unda.
- Inline FİDAN deseni geçerli (ui.tsx'e yazılmaz). Kabuk FİDAN'a dönünce Bugün/Giriş/Çöz'ün FİDAN
  gövdesiyle görsel çelişki (mavi çapa marka + sky nav) kapanır.
- Kehribar RAFTA (telif kararı) — bu kartta kehribar kullanılmaz.

## Kabul Kriterleri
- [x] **[MED] index.html favicon:** çapa + sky→cyan mühür yerine FİDAN filiz/yaprak SVG (kod-içi
      data-URI korunur; iki temada okunur — tek nötr tasarım yeterli)
- [x] **[MED] fx.tsx `BreathingGlow`:** `useReducedMotion` gate + `bg-sky` → FİDAN (adaçayı/yaprak);
      **[LOW]** `GlowBorder` conic sky + `index.css` `.text-glow` sky → FİDAN renkleri
- [x] **[MED/LOW] App.tsx:** marka çapası + sky/cyan logo → FİDAN filiz kimliği; `:27` bayat
      tsparticles yorumu düzeltilir (yorum NEDEN'i doğru anlatır — V§3.4); Splash + route geçişi +
      nav pill'lerindeki `bg-shore/ocean` → FİDAN; geçiş animasyonları hareket-azalt gateli
- [x] **[LOW] index.html:38-40** global `@keyframes pulse/ping/flicker` `@media (prefers-reduced-motion:
      no-preference)` altına alınır (tüketicileri kırılmadan — görsel fark yalnız azalt tercihinde)
- [x] **[LOW] OdakZamanlayici.tsx:77** halka `transition` azalt-gateli (`HedefHalka` deseni:
      `azalt ? undefined : …`)
- [x] **[LOW] Login.tsx:** yaygın Supabase hata kodları → Türkçe eşleme ("Invalid login credentials"
      vb. samimi Türkçe cümleye çevrilir); mevcut message-önce + nötr fallback düzeni KORUNUR
- [x] **[KULLANICI KARARI 2026-07-23] Login.tsx:193:** kayıt geçiş bağlantısı "Hemen oluştur —
      fidanını dik 🌱" → düz **"Hemen oluştur"** (fidan metni + emoji kalkar). Yan paneldeki
      "Her soru, fidanını büyütür." sloganı KALIR (karar yalnız hesap-oluştur bağlantısı için;
      onaylı önizleme giris.html de güncellendi)
- [x] `tsc --noEmit` sıfır hata + `bun run build` yeşil → çıktılar RAPOR'da

## Kısıtlar / Kapsam Dışı
- `Bugun.tsx` DOKUNULMAZ (`:266` düzeltmesi GOREV-013'te). `ui.tsx`/`cekirdek.tsx` dokunulmaz.
- Rota/nav YAPISI değişmez (015'te bitti) — yalnız görsel/kimlik/gate/metin.
- Auth mantığı değişmez (Login yalnız hata-metin eşlemesi).

## Başlangıç Durumu
- Git rev: `5c2610e` (branch `feat/yks-brain`); kirli ağaç ~58 kayıt — onaylı işler (kullanıcı
  commit'i hâlâ bekleniyor). `App.tsx` GOREV-015'in ONAYLI işiyle kirli — yalnız bu kartın işi
  eklenir. İlk adım: `git diff --stat` fotoğrafı RAPOR'a.

## Onay Kayıtları
- Paralı koşu: GEREKMEZ ($0).

## RAPOR

### Özet (DEVRALMA bulgusu — dürüst kayıt)
Kartı devraldığımda çalışan ağaçta kriterlerin **7/8'i ZATEN karşılanmış** durumdaydı — eski
oturum işi büyük ölçüde yapmış ama RAPOR'lamamış (ORKESTRATÖR'ün devralma kanıtı yalnız
Login bağlantı metniydi; o kriter 2026-07-23'te, eski oturum bayatladıktan sonra eklenmişti).
Hiçbir şeyi varsaymadım: 6 beyanlı dosyanın tamamını taze okudum, her kriteri satır satır
doğruladım, eksik tek işi (Login bağlantı metni) tamamladım, kapıları KENDİ oturumumda koştum.

### Yapılan (bu oturum)
- **Login.tsx:218** — kayıt geçiş bağlantısı `"Hemen oluştur — fidanını dik 🌱"` → düz
  `"Hemen oluştur"` (KULLANICI KARARI 2026-07-23). Yan paneldeki "Her soru, fidanını büyütür."
  sloganı DOKUNULMADI (Login.tsx:239 — karar gereği kalır).

### Doğrulanan (devralınan ağaçta hazır bulundu — satır satır teyit, bu oturumda değişiklik gerekmedi)
- **index.html:12 favicon:** FİDAN filiz SVG — kod-içi data-URI, orman→yaprak gradyan
  (`#1E4620 → #4FA56F`), beyaz filiz çizgisi; çapa/sky/cyan YOK. Tek nötr tasarım, iki temada okunur.
- **index.html:39-43:** global `@keyframes pulse/ping/flicker` `@media (prefers-reduced-motion:
  no-preference)` altında; azalt tercihinde keyframe tanımsız kalır, tüketiciler kırılmaz.
- **fx.tsx:93-104 `BreathingGlow`:** `useReducedMotion()` gate (`azalt ? undefined : …` hem
  animate hem transition) + renk `color-mix(var(--yaprak) 25%)` — sky YOK.
- **fx.tsx:83 `GlowBorder`:** conic gradyan FİDAN — `rgba(79,165,111,…)` (canlıyaprak) +
  `rgba(132,169,140,…)` (adaçayı); sky söküldü.
- **index.css:201-202 `.text-glow`:** açıkta `none`, koyuda `color-mix(var(--yaprak) 50%)` — sky YOK.
- **App.tsx:** marka = filiz (`sprout` ikonu, `--cta→--yaprak` gradyan rozet + `--vurgu→--yaprak`
  clip-text "LearnUp", satır 279-297); `:27` yorumu düzeltilmiş ("Ambiyans yaprakları — kendi
  chunk'ında (lazy)…" — tsparticles bahsi yok, NEDEN doğru); Splash/EkranBekleme `var(--page-bg)` +
  `var(--yaprak)` spinner `motion-safe:animate-spin` (139-160); route geçişi + tema düğmesi +
  profil menüsü animasyonları `azalt` gateli (186-196, 260-271, 366-372); nav pill'leri `kb-*`
  FİDAN değişkenleri (KabukStil, 413-429) — `bg-shore/ocean` sıfır kalıntı.
- **OdakZamanlayici.tsx:79:** halka `transition: azalt ? undefined : 'stroke-dashoffset 0.9s linear'`
  — HedefHalka deseniyle gateli; nabız noktası da RM-medya-gateli (65-68).
- **Login.tsx:25-35 `supabaseHataTR()`:** yaygın Supabase hataları → samimi Türkçe (invalid login
  credentials / email not confirmed / already registered / weak password / invalid email / rate
  limit / network); message-önce düzeni + nötr fallback ("Bilgileri kontrol edip tekrar dene.")
  KORUNMUŞ; ham İngilizce ve kod sızmıyor. Auth mantığı değişmemiş.
- Kalıntı taraması: 6 dosyada `shore|ocean|sky-|cyan|0284C7|06B6D4|anchor|tsparticles` → SIFIR eşleşme.
  Tek istisna App.tsx:236/379 `Chip tone="sky"` — bu `components/ui.tsx` Chip'inin VARYANT ADI
  (utility değil); FİDAN'a taşınması koddaki yorumla ui.tsx konsolidasyon kartına devredilmiş
  (beyan dışı dosya — bu kartta dokunulmadı).

### Değişen dosyalar (bu oturum)
- `frontend-v2/src/screens/Login.tsx` — 1 satır (bağlantı metni).
- Kart dosyası (durum/kriter/RAPOR/Günlük).

`git diff --stat` (beyanlı 6 dosya, kümülatif — kirli ağaç 007/010/015 + eski oturumun işini içerir):
```
 frontend-v2/index.html            |  27 +--
 frontend-v2/src/App.tsx           | 142 +++++++++-----
 frontend-v2/src/components/fx.tsx |  27 +--
 frontend-v2/src/index.css         | 146 ++++++++++----
 frontend-v2/src/screens/Login.tsx | 404 ++++++++++++++++----------------------
 5 files changed, 394 insertions(+), 352 deletions(-)
```
Not: `OdakZamanlayici.tsx` diff-stat'ta görünmez — GOREV-007'de doğan YENİ dosya, git'te
untracked (`?? frontend-v2/src/components/OdakZamanlayici.tsx`).

### Koşulan kapılar + ham çıktı (KENDİ oturumumda, Login düzeltmesi SONRASI)
- `../learnup-brain/node_modules/.bin/tsc --noEmit -p tsconfig.json` → `TSC_EXIT=0` ✓ (sıfır hata)
- `bun run build` → `✓ built in 1.47s` · `BUILD_EXIT=0` ✓ — tüm chunk'lar derlendi
  (son satırlar: `vendor-three-BgtuSQai.js 897.32 kB`, `index-CD4ItuMI.js 450.45 kB`…);
  tek uyarı bilinen chunk-boyut uyarısı (>500 kB — vendor-three/katex/charts, önceden mevcut).
- Paralel-ajan çakışması yaşanmadı; kapılar ilk koşuda yeşil.

### Gerçekleşen maliyet
**$0** — paralı LLM koşusu yok; salt okuma + 1 satır düzenleme + kapı koşuları.

### Açık riskler
- Kirli ağaç tek commit'te birleşiyor: bu kartın 1 satırlık işi, eski oturumun RAPOR'lanmamış
  (ama bu RAPOR'da satır satır doğrulanmış) işiyle aynı dosyalarda iç içe — commit'i kullanıcı
  atana dek ayrıştırılamaz. Doğrulama kaydı yukarıda.
- `Chip tone="sky"` varyant adı (App.tsx:236/379) görsel olarak hâlâ mavi ton basar — teacher
  rozeti kabukta COASTAL maviyle görünür; çözüm `components/ui.tsx` konsolidasyon kartında.

### Sonraki adım önerisi
1. GOREV-023 (tanıtım sayfası) bu kartı bekliyordu — SERBEST bırakılabilir.
2. `components/ui.tsx` Chip tonlarının FİDAN'a taşınması (kabuktaki rol rozeti dahil) için
   konsolidasyon kartı.
3. `index.css` @theme'deki geçici `shore/ocean/sky/teal` token'larının sökümü — ekran kartları
   utility geçişini bitirince (index.css:8-9 notu).
4. `fx.tsx` `YakamozBackdrop` fonksiyon adının yeniden adlandırılması (ayrı temizlik kartı notu
   fx.tsx:19'da duruyor — davranış FİDAN, ad eski).

## Günlük
- 2026-07-22 · ORKESTRATÖR · kart açıldı (beklemede; GOREV-015 onayını bekler — App.tsx kesişimi; kaynak: GOREV-012 QA bulguları)
- 2026-07-22 · ORKESTRATÖR · SERBEST: GOREV-015 onaylandı+arşivlendi; Başlangıç Durumu dolduruldu. Kart başlatılabilir (GOREV-023 bu kartı bekliyor — App.tsx zinciri).
- 2026-07-22 · FRONTEND · alindi
- 2026-07-23 · ORKESTRATÖR · kriter eklendi: Login.tsx:193 "fidanını dik" metninin kaldırılması (kullanıcı kararı — localhost incelemesi sırasında)
- 2026-07-23 · ORKESTRATÖR · DEVRALINDI: kartı alan eski oturumdan RAPOR/ilerleme gelmedi (kanıt: Login.tsx "Hemen oluştur — fidanını dik 🌱" metni hâlâ duruyor — güncel satır 218; kriterdeki :193 kaymış, metinle aranmalı). Kullanıcı talebi (2026-07-23, localhost incelemesi): tanıtım sayfası bekleniyor — 023 bu kartı bekliyor, öncelik yükseldi. Yeni FRONTEND ajanı atandı; durum alindi KALIR.
- 2026-07-23 · FRONTEND · tamamlandi (devralma bulgusu: 7/8 kriter ağaçta ZATEN karşılanmış — eski oturum yapmış, RAPOR'lamamış; hepsi satır satır doğrulandı, RAPOR'a kanıtla işlendi. Bu oturumun işi: Login.tsx:218 bağlantı metni "Hemen oluştur — fidanını dik 🌱" → "Hemen oluştur"; slogan korundu. Kapılar KENDİ oturumumda: tsc EXIT=0 · build EXIT=0 "✓ built in 1.47s". Maliyet $0.)
- 2026-07-23 · ORKESTRATÖR · onaylandi + arşiv. Denetim kanıtı: Login.tsx:218 düz "Hemen oluştur" + supabaseHataTR() (satır 25) grep'le doğrulandı; fx.tsx'te useReducedMotion (49, 94) + sky/bg-sky SIFIR; index.html:12 filiz SVG favicon (çapa yok) + :39 keyframes RM-medya-gate'i bizzat okundu; tsc 0 + build yeşil HAM RAPOR'da; $0. Devralma bulgusu (7/8 kriter eski oturumda yapılmış ama RAPOR'lanmamış; satır satır yeniden doğrulanmış) DÜRÜST KAYIT olarak kabul — protokolün "rapor yoksa iş yok sayılır, kanıtla yeniden doğrula" ilkesine örnek emsal. Chip tone="sky" kalıntısı beyan-dışı ui.tsx varyantı — konsolidasyon backlog'una. GOREV-023 SERBEST.
