---
gorev: GOREV-023-tanitim-sayfasi-fidan
kimden: ORKESTRATÖR
kime: FRONTEND
durum: onaylandi
oncelik: P1
bagimlilik: [GOREV-015, GOREV-018]   # App.tsx zinciri: 015 (telif rota sökümü) → 018 (kabuk FİDAN) → bu kart
dokunulan-dosyalar:
  - frontend-v2/src/screens/Tanitim.tsx   # YENİ — kimliksiz tanıtım sayfası
  - frontend-v2/src/App.tsx               # yalnız kimliksiz kök rotası
migration-gerekli: hayir
---

## Amaç
Tanıtım (landing) sayfasını **kullanıcı onaylı önizlemeyle** hizalamak:
`docs/design/onizleme/tanitim.html` (2026-07-22 onayı — **hero soru-reklam revizyonu DAHİL**:
"ÖSYM formatına en yakın sorular" başlığı; kaynak referans BUDUR).

## Bağlam
- İçerik sözleşmesi: EKRAN-HARITASI §0 (metin kuralları oradadır ve DEĞİŞTİRİLEMEZ:
  uydurma sosyal kanıt yasak; çıkmış soru YAYINI vaadi yasak; "ÖSYM formatında" yalnız BİÇİM
  iddiası — resmî bağ/onay iması yok).
- **Rota:** kimliksiz kök `/` → Tanitim; "Giriş yap" ve "Ücretsiz başla" → mevcut giriş ekranı
  ("Ücretsiz başla" kayıt sekmesi açık gelmeli — sekme parametreyle seçilebiliyorsa kullan,
  yoksa RAPOR notu). Kimlikli kullanıcı kökte Bugün'e gitmeye DEVAM eder (mevcut davranış).
- Sahne: `GirisSahnesi` yeniden kullanılabilir ya da sayfa içi hafif SVG (önizlemedeki gibi) —
  **three.js YOK**. Inline FİDAN deseni.

## Kabul Kriterleri
- [x] Görünüm iki temada da önizlemeyle eşleşir: yapışkan nav (logo · bölüm linkleri · ikincil
      "Giriş yap" + birincil "Ücretsiz başla") · **hero** ("ÖSYM formatına en yakın sorular."
      başlığı + biçim-iddiası alt metni + orman/göl/filiz sahnesi + yüzen arayüz vinyetleri —
      vinyetler STATİK/temsilî, canlı veri iddiası taşımaz) · **6 özellik kartı** (ilk kart "ÖSYM
      Formatında Sorular") · 3 adım (kesikli yol çizgisi) · öğretmen bölümü + sınıf kodu kartı
      (temsilî olduğu belirtilmiş) · kapanış bandı ("Fidanını bugün dik.") · footer
- [x] Metinler önizlemeden AYNEN alınır; EKRAN-HARITASI §0 katı kurallarına uyum QA'da taranacak
      (sosyal kanıt/istatistik eklenmez, çıkmış yayını iması eklenmez)
- [x] CTA yönlendirmeleri çalışır; kimlikli kullanıcı `/`'ta Bugün'e (regresyon yok)
      (kod-düzeyi doğrulama — tarayıcı smoke turu RAPOR'daki nota göre QA'ya)
- [x] `Tanitim` ayrı lazy chunk; three/recharts/katex ÇEKMEZ (build çıktısı kanıtı)
      (kanıt + önceden var olan jsx-runtime hoist notu RAPOR'da)
- [x] Hareket-azalt: vinyet yüzmesi, yapraklar, hero belirmesi durur; `scroll-behavior` düzleşir
- [x] `tsc --noEmit` sıfır hata + `bun run build` yeşil → çıktılar RAPOR'da

## Kısıtlar / Kapsam Dışı
- `Login.tsx` davranışı değişmez (yalnız yönlendirme hedefi olur).
- `index.html` dokunulmaz (GOREV-018 bölgesi; meta/description önerisi varsa RAPOR'a).
- SEO/analitik araçları bu kartın dışı (GELECEK).

## Başlangıç Durumu
- Git rev: `5c2610e` (branch `feat/yks-brain`); kirli ağaç ~60 kayıt — onaylı işler (kullanıcı
  commit'i hâlâ bekleniyor). `App.tsx` GOREV-015+018'in ONAYLI işleriyle kirli — yalnız bu
  kartın işi eklenir (kimliksiz kök rotası). İlk adım: `git diff --stat` fotoğrafı RAPOR'a.

## Onay Kayıtları
- Paralı koşu: GEREKMEZ ($0).

## RAPOR

### Yapılan
- **`frontend-v2/src/screens/Tanitim.tsx` (YENİ):** onaylı önizleme `docs/design/onizleme/tanitim.html`
  birebir porta edildi — yapışkan nav (logo 🌱 LearnUp · Özellikler/Nasıl çalışır/Öğretmenler için ·
  ikincil "Giriş yap" + birincil "Ücretsiz başla") · hero ("ÖSYM formatına *en yakın* sorular." +
  biçim-iddiası alt metni + SVG orman/göl/filiz sahnesi + 2 statik vinyet) · 6 özellik kartı (ilki
  "ÖSYM Formatında Sorular") · 3 adım + kesikli yol çizgisi · öğretmen bölümü + temsilî sınıf kodu
  kartı ("Kod temsilîdir…" metni önizlemeden aynen) · kapanış bandı ("Fidanını bugün dik.") · footer.
  **Metinler AYNEN**; önizlemenin "Tasarım notları" bölümü ve önizleme şerit/tema düğmesi (mock
  iskelesi) porta edilmedi. İki tema: FİDAN uygulama değişkenleri + tanıtıma özel sahne token'ları
  `.tnt` / `.dark .tnt` kapsamında yerel (index.css'e dokunulmadı). Animasyonların TAMAMI saf CSS ve
  `@media (prefers-reduced-motion: no-preference)` İÇİNDE: hero belirmesi, vinyet yüzmesi, süzülen
  yapraklar (azaltta hiç render edilmez — display:none), buton hover kalkışları, kart hover kalkışı,
  `html{scroll-behavior:smooth}` (azaltta düz). framer-motion dahi kullanılmadı (chunk yalın kalsın).
- **`frontend-v2/src/App.tsx` (yalnız kimliksiz kök + gerekli eşleri):**
  - Kimliksiz yüzey `Routes`'a bağlandı: `index → <Tanitim/>` (lazy, Splash fallback),
    `* → <Login/>` — derin bağlantı davranışı KORUNDU (kimliksiz `/rota` yine Giriş'i görür,
    URL korunur, girişten sonra hedef rota açılır).
  - `Tanitim` lazy import (kendi chunk'ı).
  - Kimlikli tarafa `giris → Navigate to="/"` eklendi: tanıtım CTA'sından `/giris`'te oturum açan
    kullanıcı köke (AnaKapi rol yönlendirmesi → öğrenci Bugün) düşer; NotFound'a takılmaz.
    Kimlikli `/` davranışı DEĞİŞMEDİ (AnaKapi'ye dokunulmadı — regresyon yok).
  - Sekme başlığı efekti oturum-duyarlı yapıldı: kimliksiz yüzeyde "Genel Bakış · LearnUp" gibi
    uygulama-içi ad basılmaz, nötr "LearnUp — YKS Hazırlık" kalır (aynı effect, tek koşul).
- **CTA hedefleri:** "Giriş yap" → `/giris`; "Ücretsiz başla" (nav+hero+kapanış, 3'ü aynı eylem) →
  `/giris?sekme=kayit`.

### RAPOR NOTU — kayıt sekmesi parametresi (kart Bağlam'ının istediği not)
`Login.tsx` sekmeyi İÇ state'te tutar (`useState<'in'|'up'>('in')`) — parametreyle seçilebilir
sekme desteği YOK ve Login bu kartın beyanı dışında + "davranışı değişmez" kısıtı altında.
"Ücretsiz başla" şimdilik Giriş sekmesiyle açılır; niyet URL'de taşınır (`?sekme=kayit`), tek
satırlık takip kartıyla Login `useSearchParams` okuyup kayıt sekmesini açabilir (öneri aşağıda).

### Değişen dosyalar (beyanla birebir)
```
 frontend-v2/src/App.tsx | 169 ++++++++++++++++++++++++++++++++----------------
 1 file changed, 113 insertions(+), 56 deletions(-)          (kümülatif: 015+018 onaylı işleri + bu kart)
?? frontend-v2/src/screens/Tanitim.tsx                        (YENİ — untracked)
```
+ kart dosyası. Başka dosyaya yazılmadı (index.html, Login.tsx, vite.config.js DOKUNULMADI).

### Koşulan kapılar + ham çıktı (KENDİ oturumumda, tüm düzenlemeler SONRASI)
- `../learnup-brain/node_modules/.bin/tsc --noEmit -p tsconfig.json` → `TSC_EXIT=0` ✓ (sıfır hata)
- `bun run build` → `✓ built in 1.45s` · `BUILD_EXIT=0` ✓; tek uyarı önceden mevcut chunk-boyut
  uyarısı. İlgili satırlar:
  ```
  dist/assets/Tanitim-DjbiQPUZ.js    25.11 kB │ gzip: 6.71 kB   ← YENİ, ayrı lazy chunk
  dist/assets/vendor-three-BgtuSQai.js  897.32 kB   (hash DEĞİŞMEDİ — GOREV-030 ayrımı bozulmadı)
  dist/assets/vendor-katex-BYvE29NB.js  390.36 kB   (hash DEĞİŞMEDİ)
  dist/assets/vendor-charts-4b3Ms4Kg.js 397.00 kB   (hash DEĞİŞMEDİ)
  dist/assets/vendor-motion-FTcJAI3n.js 125.48 kB   (hash DEĞİŞMEDİ)
  ```
- **Chunk kanıtı (kriter 4):** `Tanitim-DjbiQPUZ.js` içinde referans sayımı —
  `vendor-three: 0 · vendor-charts: 0 · vendor-motion: 0 · vendor-katex: 1`;
  chunk'ın import listesi yalnız `./index-*.js` + `./vendor-katex-*.js`; source map'te chunk'ın
  TEK kaynağı `src/screens/Tanitim.tsx` (üçüncü parti kod gömülmemiş).
- **vendor-katex referansının açıklaması (ÖNCEDEN VAR OLAN altyapı durumu — bu kartın işi değil):**
  içe alınan tek sembol `import{i as e}` = **`react/jsx-runtime`** — rolldown bu paylaşılan modülü
  vendor-katex chunk'ına hoist etmiş (vendor-katex source map'inde `react/cjs/react-jsx-runtime.production.js`
  görülüyor). Bu GOREV-030'daki `scheduler` vakasının eşi ve TÜM chunk'ları etkiliyor: Kule,
  SoruHavuzu, Bugun… hepsi aynı `{i}`yi vendor-katex'ten alıyor ve **eager kabuk (index) chunk'ı da**
  vendor-katex + vendor-charts + vendor-motion'ı modulepreload ile İLK boyada çekiyor (vendor
  hash'leri değişmedi = durum bu karttan önce de aynıydı). Yani Tanitim, kabuğun zaten indirdiğinin
  ötesinde TEK bayt katex/chart kodu indirtmez; Tanitim kaynak düzeyinde yalnız react + react-router
  kullanır. Kalıcı çözüm (jsx-runtime'ı `vendor-react`'e sabitlemek) `vite.config.js` gerektirir —
  beyan DIŞI; öneri aşağıda.

### Gerçekleşen maliyet
**$0** — paralı LLM koşusu yok.

### Açık riskler
- **Tarayıcı smoke turu bu oturumda KOŞULMADI** (tarayıcı aracı yok; dev sunucusuna dokunma
  guardrail'i gereği ayrı koşu da başlatılmadı): CTA akışı + iki tema + hareket-azalt görünümü kod
  düzeyinde ve kapılarla doğrulandı. Kullanıcı localhost:5174'te kimliksiz açarak görebilir;
  QA ekran turu önerilir (EKRAN-HARITASI §0 metin taraması zaten QA planında).
- "Ücretsiz başla" kayıt sekmesini HENÜZ açmıyor (yukarıdaki not — Login param desteği ayrı kart).
- Footer'daki KVKK/Koşullar/İletişim bağlantıları önizlemedeki gibi yer tutucu (`#`) — sayfalar yok
  (GELECEK); yayına çıkmadan gerçek hedef veya geçici gizleme kararı gerekir.
- Bilinçli mikro-sapmalar (görsel eşleşmeyi bozmaz): butonlara `min-height:44px` eklendi (FİDAN §9.10
  tık hedefi — önizleme dolguları 38-40px kalıyordu); koyu tema tonları önizlemenin yerel değerleri
  yerine uygulamanın kanonik FİDAN değişkenlerinden geliyor (ör. vurgu #7FC79C vs önizleme #7FBF95).

### Sonraki adım önerisi
1. **[BUILD/PERF kartı — vite.config.js]** `react/jsx-runtime`'ı (gerekirse `react`+`react-dom`'u)
   `vendor-react`'e sabitle (GOREV-030 deseninin devamı) ve kabuğun eager vendor-katex/charts
   bağımlılığını incele — kimliksiz ilk boya şu an ~900 kB gereksiz vendor indiriyor (tanıtım
   sayfası performansı için asıl kazanç burada).
2. **[FRONTEND mini kart — Login.tsx]** `useSearchParams` ile `?sekme=kayit` okunup kayıt sekmesi
   açık başlasın ("Ücretsiz başla" niyetini tamamlar; URL'ler hazır).
3. **[İçerik]** KVKK & Gizlilik / Kullanım Koşulları / İletişim sayfaları (footer yer tutucuları).
4. **[QA]** Tanıtım ekran turu: iki tema + hareket-azalt + §0 metin taraması + CTA smoke.

## Günlük
- 2026-07-22 · ORKESTRATÖR · kart açıldı (beklemede; önizleme onayı "onaylıyrm" 2026-07-22 — hero soru-reklam revizyonuyla; App.tsx zinciri gereği 015→018 sonrası başlar)
- 2026-07-23 · ORKESTRATÖR · kullanıcı talebi teyidi: "karşılama sayfasında butonla giriş ya da kaydola geçilmeli" — kriterlerde ZATEN var (kimliksiz kök / → Tanitim; "Giriş yap" ikincil + "Ücretsiz başla" birincil → giriş ekranı, kayıt sekmesi açık). 018 tamamlanır tamamlanmaz AYNI ajana zincirlenecek.
- 2026-07-23 · ORKESTRATÖR · SERBEST: GOREV-018 onaylandı+arşivlendi (015 zaten arşivde). Başlangıç Durumu dolduruldu; kart GOREV-018'i bitiren FRONTEND ajanına atandı (kabuk bağlamı taze).
- 2026-07-23 · FRONTEND · alindi
- 2026-07-23 · FRONTEND · tamamlandi (Tanitim.tsx YENİ — onaylı önizleme birebir port, metinler aynen, §0 kurallarına uyum; App.tsx kimliksiz kök → Tanıtım + kimlikli /giris → / redirecti + oturum-duyarlı sekme başlığı. Kapılar: tsc EXIT=0 · build EXIT=0 "✓ built in 1.45s"; Tanitim ayrı 25 kB lazy chunk, three/charts/motion referansı 0; vendor-katex'e tek referans = rolldown'un hoist ettiği react/jsx-runtime [ÖNCEDEN VAR OLAN, tüm chunk'larda — vite.config önerisi RAPOR'da]. "Ücretsiz başla" kayıt sekmesi notu RAPOR'da [Login param desteği yok — beyan dışı]. Maliyet $0.)
- 2026-07-23 · ORKESTRATÖR · onaylandi + arşiv. Denetim kanıtı: Tanitim.tsx §0 taraması bizzat yapıldı (grep: sosyal kanıt/istatistik SIFIR; "ÖSYM formatına en yakın" yalnız biçim iddiası, dosya başında koruyucu yorum; çıkmış-yayın iması YOK); App.tsx:89 kimliksiz index→Tanitim + :125 kimlikli /giris→/ redirecti + derin bağlantı korunumu okundu; Tanitim 25 kB ayrı lazy chunk, vendor hash'leri değişmemiş (030 ayrımı sağlam); vendor-katex tek referansı = jsx-runtime hoist'u (source-map kanıtlı, ÖNCEDEN VAR — 024'teki scheduler vakasının eşi) KABUL → GOREV-033. tsc 0 + build yeşil; $0; yalnız beyanlı dosyalar. Dürüst sapmalar kabul: kayıt sekmesi paramı → GOREV-032 (kullanıcı talebinin tamamlayıcısı); tarayıcı smoke'u kullanıcı/QA turuna; footer yer tutucuları backlog (KVKK/Koşullar/İletişim sayfaları yayın öncesi şart).
