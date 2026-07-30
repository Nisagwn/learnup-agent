---
gorev: GOREV-013-calisma-plani-ekrani-fidan
kimden: ORKESTRATÖR
kime: FRONTEND
durum: onaylandi
oncelik: P1
bagimlilik: [GOREV-006, GOREV-007]   # ikisi de ✅ — BAŞLATILABİLİR; inline FİDAN deseni (007 emsali)
dokunulan-dosyalar:
  - frontend-v2/src/screens/Rota.tsx
  - frontend-v2/src/lib/hedefTarih.ts   # YENİ — sınav hedef tarihi TEK kaynak (localStorage + varsayılan)
  - frontend-v2/src/screens/Bugun.tsx   # YALNIZ geri sayım çipini hedefTarih.ts kaynağına bağlama
migration-gerekli: hayir
---

## Amaç
Çalışma Planı ekranını (kod adı `Rota.tsx`) **kullanıcı onaylı önizlemeyle** hizalamak:
`docs/design/onizleme/calisma-plani.html` (2026-07-22 onayı — kaynak referans BUDUR).

## Bağlam
- Tasarım: TASARIM-DILI v1.2. İçerik: EKRAN-HARITASI §5 + zenginleştirme (hedef tarih [FRONTEND]).
- Veri kaynakları (hepsi MEVCUT — Rota wiring'i + Bugün emsali): plan → `/agents/roadmap`
  `steps.days`; plan üretimi + gerekçe → `POST /agents/pusula` (dönen `summary` = tek LLM anlatım
  çıktısı; üründe zaten kullanıcı-tetikli mevcut akış); tekrar vadesi → `/practice/review`
  (Bugün'deki kaynakla aynı); hedef/görev → `/gamification/daily`.
- **Inline FİDAN deseni** (007 denetim kararı): ortak varyantlar `ui.tsx`'te YOK — görünüm ekran
  içinde kurulur, `ui.tsx`'e yazılmaz.
- **Hedef tarih (tek kaynak):** kullanıcı belirler (localStorage), varsayılan mevcut `yksGun()`
  sabiti (~20 Haziran). Hesap `lib/hedefTarih.ts`'e taşınır; **Bugün'deki "YKS'ye N gün" çipi de
  AYNI kaynaktan okur** — iki ekran farklı gün söyleyemez.

## Kabul Kriterleri
- [x] Görünüm iki temada da önizlemeyle eşleşir: **özet hero** (geri sayım sayaç animasyonlu +
      "değiştir ✎" hedef tarih çipi · haftanın hedefi çubuğu [plan satırlarından SAYILIR] · tekrar
      vadesi + "10 soruluk tekrar") · **plan gerekçesi şeridi** (pusula `summary` + son güncelleme
      + "Planı güncelle") · **7 günlük blok ızgarası** (her blok: zayıf/tekrar/pekiştirme satırları
      kelimeli çiplerle; bugün: nabız + sayfanın **TEK birincil "Başlat"**; bekleyenler kesikli;
      mobilde dikey liste) — *not: hafta hedefi ÇUBUĞU çizilmedi çünkü tamamlanan-satır verisi yok
      (null≠0); yalnız toplam satır sayısı + dürüst not gösteriliyor (RAPOR'a bkz.)*
- [x] "Planı güncelle": buton devre dışı + "Plan hazırlanıyor…" dönen gösterge; **İYİMSER
      GÜNCELLEME YOK** — mevcut plan görünür kalır, yanıt gelince `roadmap.reload()`
- [x] **null≠0:** blok tamamlanma/gerçekleşme verisi plan yanıtında YOKSA geçmiş günler yalnız
      soluk gösterilir — ✓/süre/skor UYDURULMAZ (007 denetim notu: bu veri bugün yok); gerekçe
      yoksa şerit gizlenir; tekrar vadesi 0 → "Bugün tekrar vaden yok" + buton çıkmaz; plan hiç
      yoksa boş durum + o durumda tek birincil "Planı oluştur"
- [x] Tahmini süre YALNIZ gerçek ortalama çözüm süresi verisi varsa (soru adedi × ortalama);
      yoksa yalnız soru adedi yazılır — *ortalama süre bu ekranın veri kaynaklarında yok →
      yalnız soru adedi yazılıyor*
- [x] Eski bölümlerden önizlemede olmayanlar KALDIRILIR: **Günlük Hedef ayar paneli** (Profilim →
      Ayarlar'a taşındı, GOREV-011), Antrenman CTA, Koç Notu — içerik sözleşmesi EKRAN-HARITASI §5
- [x] Geri sayım tek kaynak: `lib/hedefTarih.ts`; `Bugun.tsx` çipi oradan okur. Bugün'de yalnız
      İKİ değişiklik: (a) bu kaynak bağlama; (b) **QA bulgusu (GOREV-012):** `Bugun.tsx:266` plan
      iskeleti `animate-pulse` → `motion-safe:animate-pulse` (reduced-motion gate — tek satır)
- [x] Stagger ≤0.3s; nabız/dolum motion-safe; `prefers-reduced-motion`'da statik (çubuklar son
      değerde sabit)
- [x] `tsc --noEmit` sıfır hata + `bun run build` yeşil → çıktılar RAPOR'da

## Kısıtlar / Kapsam Dışı
- `components/ui.tsx`, `cekirdek.tsx`, `fx.tsx` dokunulmaz; yeni backend ucu istenmez.
- `POST /agents/pusula` YALNIZ kullanıcı eylemiyle tetiklenir (mount'ta/otomatik çağrı YASAK —
  maliyet disiplini; mevcut davranış zaten böyle, korunur).
- Deneme günlüğü / sınıf hedefi / odak ödülü → GELECEK, yer açılmaz.

## Başlangıç Durumu
- Git rev: `5c2610e` (branch `feat/yks-brain`); kirli ağaç ~57 kayıt — onaylı işler (kullanıcı
  commit'i hâlâ bekleniyor). `Rota.tsx` GOREV-002'den, `Bugun.tsx` GOREV-007'nin ONAYLI işinden
  kirli — yalnız bu kartın işi eklenir. İlk adım: `git diff --stat` fotoğrafı RAPOR'a.

## Onay Kayıtları
- Paralı koşu: GEREKMEZ ($0 — pusula çağrısı üründe mevcut kullanıcı-tetikli akış; geliştirme
  sırasında tetiklenmesi gerekmiyor).

## RAPOR

### Yapılan
- **`lib/hedefTarih.ts` (YENİ):** sınav hedef tarihinin TEK kaynağı. `hedefTarih()` (localStorage
  `learnup.hedefTarih`, geçersiz/geçmiş kayıt → sessizce varsayılan bir sonraki ~20 Haziran),
  `hedefTarihYaz()` (geçmiş tarih reddedilir), `kalanGun()`, `hedefEtiket()`, `hedefIso()`.
- **`Rota.tsx` tam yeniden yazım** — onaylı önizleme portu, inline FİDAN deseni (007 emsali,
  `cp-*` scoped `<style>`, tüm renkler `index.css` CSS değişkenlerinden → iki tema otomatik):
  - **Özet hero (3 kolon, ≤900px dikey):** geri sayım (rAF sayaç ~0.9s, `useReducedMotion` →
    anında sabit) + "Hedef: … · değiştir ✎" kesikli çipi (tıklayınca inline `input[type=date]`
    + Kaydet/Vazgeç; min=bugün) · haftanın hedefi (plan satırlarından SAYILAN toplam; tamamlanan
    verisi planda YOK → çubuk/oran ÇİZİLMEDİ, "Tamamlanma bu planda henüz ölçülmüyor" notu) ·
    tekrar vadesi (`/practice/review`; N>0 → sayı + ikincil "10 soruluk tekrar"; 0 → "Bugün tekrar
    vaden yok", buton yok; veri alınamadıysa dürüst metin).
  - **Gerekçe şeridi:** yalnız `gerekce` doluysa (pusula `summary` oturum state'i — GET ucu
    summary taşımıyor) → özet + mono "son güncelleme" (`roadmap.updatedAt`) + "Planı güncelle"
    (soluk) + spinner. Şerit gizliyken güncelleme eylemi "Haftalık Plan" başlık satırında yaşar.
  - **7 günlük ızgara:** `steps.days`; durum türetimi ISO karşılaştırma (geçmiş/bugün/bekleyen).
    Satır çipleri kelimeli: `remediation`→"zayıf konu", `srs`→"tekrar", `tekrar`→"pekiştirme",
    `yeni`→"yeni konu". Geçmiş günler YALNIZ soluk (✓/süre/skor yok); bekleyenler kesikli;
    bugün: halkalı gün rozeti + nabız (motion-safe) + sayfanın TEK birincil **"Başlat"**
    (ilk blok `kazanim_id>0` → `source:'ai'`, SRS destesi → `source:'review'`). Blok altında
    yalnız soru adedi. ≤1080px 2 kolon, ≤640px dikey liste. Reveal stagger maks 0.28s.
  - **Boş durum:** 🌱 + "Henüz planın yok" + tek birincil "Planı oluştur"; **hata durumu:**
    "Tekrar dene" ile `roadmap.reload()`. Yüklenirken `motion-safe:animate-pulse` iskelet.
  - **"Planı güncelle" akışı:** buton disabled + "Plan hazırlanıyor…" + dönen gösterge
    (reduced-motion'da animasyonsuz); İYİMSER GÜNCELLEME YOK — plan görünür kalır,
    yanıtta `roadmap.reload()`. `POST /agents/pusula` YALNIZ kullanıcı tıklamasıyla.
  - **Kaldırılanlar (EKRAN-HARITASI §5 sözleşmesi):** Günlük Hedef ayar paneli, Antrenman CTA,
    Koç Notu + önizlemede olmayan Bugünün Odağı, Sıradaki Bloklar, hafta şeridi, görev halkası,
    `tactic_notes` satırları. Gereksiz istekler söküldü (`/gamification/daily`,
    `/practice/suggest`, `/questions/ai/topics`, `/mastery` artık çağrılmıyor; yalnız
    `/agents/roadmap` + `/practice/review`).
- **`Bugun.tsx` yalnız İKİ değişiklik:** (a) yerel `yksGun()` silindi, çip `kalanGun()`'dan
  (`lib/hedefTarih`) okur — iki ekran aynı günü söyler; (b) plan iskeleti
  `animate-pulse` → `motion-safe:animate-pulse` (GOREV-012 bulgusu).

### Değişen dosyalar (`git diff --stat` — beyandaki dosyalar)
```
 frontend-v2/src/screens/Bugun.tsx | 665 +++++++++++++++--------------------
 frontend-v2/src/screens/Rota.tsx  | 711 ++++++++++++++++++++------------------
 2 files changed, 662 insertions(+), 714 deletions(-)
?? frontend-v2/src/lib/hedefTarih.ts   (yeni, 67 satır)
```
Not: stat HEAD'e göredir — Bugun/Rota bu karttan ÖNCE de onaylı GOREV-007/002 işiyle kirliydi
(başlangıç fotoğrafı: Bugun 672, Rota 20 satır). Bu kartın Bugün'e net katkısı yalnız iki
değişikliktir (−7 satır: yksGun bloğu → import); Rota tamamen bu kartın işidir.

### Koşulan kapılar (HAM çıktı)
```
$ cd frontend-v2 && ../learnup-brain/node_modules/.bin/tsc --noEmit -p tsconfig.json
TSC EXIT: 0        (sıfır hata, çıktı boş)

$ bun run build
dist/assets/Rota-CWI9rne-.js    17.86 kB │ gzip: 5.30 kB │ map: 34.52 kB
dist/assets/Bugun-CPyqXl7a.js   23.69 kB │ gzip: 7.06 kB │ map: 48.48 kB
✓ built in 1.58s
BUILD EXIT: 0      (chunk >500kB uyarısı vendor-three — bu karttan önce de vardı)
```

### Gerçekleşen maliyet
$0 — `POST /agents/pusula` geliştirme sırasında TETİKLENMEDİ; üründe yalnız kullanıcı eylemi.

### Açık riskler
- **Gerekçe şeridi oturum-ömürlü:** `GET /agents/roadmap` `summary` döndürmüyor; pusula'nın
  yazdığı `pusula_brief` için GET ucu yok → sayfa yenilenince şerit kaybolur (null≠0 gereği
  gizleniyor, uydurulmuyor).
- **Canlı görsel doğrulama koşulmadı:** iki temada piksel karşılaştırma + kontrast ölçümü
  yapılmadı (dev sunucusuna dokunma yasağı; kapılar tsc+build). QA turu önerilir.
- Önizlemenin çip ölçüleri korunduğu için "değiştir ✎" çipi ~32px yüksekliğinde — FİDAN §9.10
  44px tık hedefi kuralıyla gerilim (onaylı önizleme ölçüsü aynen taşındı).
- "Sayfa başına 1 canlı nokta" bütçesini kabuk profil menüsü harcıyor; onaylı önizleme gereği
  bugün rozetinde nabız var — bütçe yorumu ORKESTRATÖR'e bırakıldı.
- Plan 7 günden eskiyse "bugün" sütunu oluşmaz → sayfada birincil buton kalmaz (dürüst durum;
  kullanıcı "Planı güncelle" ile tazeler).
- `tactic_notes` artık gösterilmiyor (önizlemede yok — bilinçli söküm, geri istenirse tek blok).

### Sonraki adım önerisi
- **BACKEND kartı:** `GET /agents/roadmap` yanıtına `pusula_brief` (summary) eklensin →
  gerekçe şeridi kalıcı olur; ayrıca plan satırlarına tamamlanma/gerçekleşme alanı gelirse
  hafta hedefi ÇUBUĞU ve geçmiş gün ✓/süre rozetleri (önizlemedeki tam hâl) açılabilir.
- QA kartı: iki temada görsel tur + kontrast ölçümü + reduced-motion doğrulaması.

## Günlük
- 2026-07-22 · ORKESTRATÖR · kart açıldı (BAŞLATILABİLİR — önizleme onayı "calışma planı onay" 2026-07-22; 006+007 ✅; 008/009/011 ile dosya kesişimi YOK, paralel çalışabilir; Bugun.tsx'e yalnız bu kart dokunur)
- 2026-07-22 · ORKESTRATÖR · GOREV-012 QA bulgusu eklendi: Bugun.tsx:266 motion-safe düzeltmesi bu kartın kriterine alındı (tek satır — Bugün'e dokunan tek kart bu olduğu için)
- 2026-07-23 · FRONTEND · alindi
- 2026-07-23 · FRONTEND · tamamlandi (tsc 0 hata + build yeşil; pusula tetiklenmedi, $0)
- 2026-07-23 · ORKESTRATÖR · onaylandi → arsiv/ (DENETİM: Bugun.tsx'te TAM İKİ değişiklik grep'le kanıtlı [kalanGun import+kullanım, motion-safe:animate-pulse; yksGun silindi]; pusula yalnız tıklama yolunda; gereksiz isteklerin sökümü [4 uç] isabetli sadeleşme; kapı çıktıları ham. KABUL: hafta-hedefi çubuğunun çizilmemesi [tamamlanma verisi yok — null≠0 doğru], gerekçe şeridinin oturum-ömürlü olması [GET summary ucu yok — uydurmamak doğru], bugün rozeti nabzı [önizleme onaylıydı; motion-safe — bütçe yorumu: kabul]. BACKLOG: roadmap GET'ine summary alanı [BACKEND], tactic_notes geri istenirse tek blok. 4 ölçüt sağlandı.)
