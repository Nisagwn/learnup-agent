---
gorev: GOREV-037-odev-atolyesi-fidan
kimden: ORKESTRATÖR
kime: FRONTEND
durum: onaylandi
oncelik: P2
bagimlilik: [GOREV-025]   # ✅ arşivde — telif sökümü (KAYNAK_AI + savunma süzgeci) korunacak zemin
dokunulan-dosyalar:
  - frontend-v2/src/screens/sinif/OdevAtolyesi.tsx
migration-gerekli: hayir
---

## Amaç
Ödev Atölyesi ekranını **kullanıcı onaylı önizlemeyle** hizalamak:
`docs/design/onizleme/odev-atolyesi.html` (2026-07-23 onayı — kaynak referans BUDUR).

## Bağlam
- Tasarım: TASARIM-DILI v1.2 (inline FİDAN `oa-*`). İçerik: EKRAN-HARITASI §14.
- **DAVRANIŞ AYNEN KORUNUR** (görsel + iki ekleme dışında dokunma):
  tek-sayfa akışı (sihirbaz yok — koddaki gerekçe), `KAYNAK_AI` + `kaynak!=='osym'` savunma
  süzgeci (TELİF — GOREV-025/016), elle seçim ↔ rastgele örnekleme, dürüst eksik-sayı uyarısı,
  gecikmeli arama, sayfalama, derin bağlantı ön-dolgusu (`?ogrenci=&kazanim=&ders=`),
  `yayinla` akışı + toast'lar.
- **MOCK YASAK (kullanıcı teyidi 2026-07-23):** yeni Geçmiş Ödevler bölümü GERÇEK uçtan:
  `GET /teacher/odevler` (mevcut, teacher.routes.ts:534) — envanterle yanıt şemasını çıkar;
  tamamlanma oranı yanıtta yoksa çubuk GİZLENİR + RAPOR notu (sayı uydurulmaz).

## Kabul Kriterleri
- [x] Görünüm iki temada da önizlemeyle eşleşir: başlık + havuz-durum şeridi (gerçek `total`) ·
      Kapsam paneli (ders çipleri ısı-haritası verisinden, zorluk segmenti, adet, tek-kazanım
      çipi + kaldır) · Havuz paneli (arama, soru kartları: ✓ seçim + AI/zorluk/kalite KELİMELİ
      rozetler + MathMarkdown, sayfalama) · sağda YAPIŞKAN Set Özeti (kime seçici, mono özet
      satırları — "Kaynak: AI havuzu" SABİT, büyük sayı kutusu, tek birincil "Sınıfa yayınla"/
      "Sete gönder")
- [x] Dürüst eksik durumu önizlemedeki gibi: sayı kutusu sıcak tona döner + "soru uydurulmaz —
      eksik olduğu gibi görünür" metni YAYINLAMADAN ÖNCE görünür (mevcut mantık, FİDAN görünüm)
- [x] **Geçmiş Ödevler bölümü (YENİ):** `GET /teacher/odevler`den — ad · soru sayısı · tarih ·
      KELİMELİ durum (açık/kapandı) · tamamlanma çubuğu (verisi varsa) · **"Şablon olarak
      kopyala"** = formu o ödevin ders/zorluk/adet değerleriyle ÖN-DOLDURUR (aynı derleme ucu;
      yeni uç yok — EKRAN-HARITASI [HAZIR] maddesi); liste boşsa dürüst boş durum
      (uç yanıtında `difficulty` YOK → zorluk 'Hepsi'ye döner — RAPOR şema envanteri)
- [x] Boş durumlar: ders seçilmeden "Başlamak için bir ders seç"; boş havuz mevcut metinlerle;
      sınıf boşsa Lighthouse yerine FİDAN görseli + Sınıf Panosu köprüsü
- [x] Hareket-azalt gateleri; tık hedefleri ≥44px; `tsc --noEmit` sıfır hata + `bun run build`
      yeşil → HAM çıktılar RAPOR'da; **$0**

## Kısıtlar / Kapsam Dışı
- Kaynak seçici GERİ GELMEZ (telif — kalıcı). Yeni backend ucu istenmez. `components/ui.tsx`/
  `cekirdek.tsx`/`rontgen.tsx` dokunulmaz. `lib/types.teacher.ts` yalnız OKUNUR (tip gerekirse
  ekran-içi tanım).

## Başlangıç Durumu
- Git rev: `5c2610e`; kirli ağaç (onaylı işler). `OdevAtolyesi.tsx` 025'in ONAYLI işiyle kirli —
  yalnız bu kartın işi eklenir. İlk adım: `git diff --stat` fotoğrafı RAPOR'a.

## Onay Kayıtları
- Paralı koşu: GEREKMEZ ($0).

## RAPOR

### İlk adım fotoğrafı
Başlangıçta `OdevAtolyesi.tsx` kirli ağaçta 025'in onaylı işiyle mevcuttu; bitiş
`git diff --stat`: `655 ++--- (420 insertions, 235 deletions)` — kümülatif (025 + bu kart).

### Uç şeması envanteri — GET /teacher/odevler (teacher.routes.ts:534, MOCK YASAK gereği önce çıkarıldı)
```
{ assignments: [{ id, subject|null, topic|null, soruSayisi, dueDate|null, status ('active'|…),
    createdAt, gonderim: { toplam, ortalamaYuzde|null, bekleyen } }],
  hedefli: [...], ogrenciSayisi, total }
```
- **Tamamlanma verisi VAR** → çubuk GÖSTERİLİR: `gonderim.toplam / ogrenciSayisi`
  (önizlemedeki "14/24" semantiği). `ogrenciSayisi === 0` ise çubuk GİZLENİR (pay uydurulmaz).
  `ortalamaYuzde` (puan ortalaması) kullanılmadı — tamamlanma ≠ puan; null olabilir.
- **`difficulty` yanıtta YOK** → "Şablon olarak kopyala" zorluğu ön-DOLDURAMAZ; zorluk
  'Hepsi'ye sıfırlanır (bilinmeyen uydurulmaz). Kriterdeki "ders/zorluk/adet" üçlüsünden
  ders+adet gerçek veriyle dolar — dürüst sapma.
- Ödev ADI yanıtta yok → başlık gerçek alanlardan türetilir: `[subject, topic].join(' · ')`
  (backend'in hedefli `title` türetmesiyle aynı desen); "Türev tekrar seti" gibi adlar
  önizlemede TEMSİLÎYDİ, uydurulmadı.
- Önizlemedeki **"son 30 gün" ibaresi uç gerçeğiyle eşleşmiyor** (uç son kayıtları döner,
  30 gün filtresi yok) → yerine gerçek `total` yazıldı: "N ödev".
- Tip ekran-YEREL tanımlandı (`GecmisOdev`/`GecmisYaniti` — yalnız okunan kesit);
  `types.teacher.ts`'e DOKUNULMADI (salt-okunur kısıtı; SinifPanosu `OdevTakipYaniti` emsali).

### Yapılan
- **FİDAN v1.2 inline dönüşüm (`oa-*`, SinifPanosu `sp-*` kalıbı):** legacy bileşen katmanı
  (StatusLine, GlowBorder neon, GlowButton, Badge, Chip, FiltreCipi, SegmentGecis, Skeleton,
  BosDurum, PanelBaslik, SinifBaslik, Lighthouse) söküldü; önizleme CSS'i FİDAN değişkenleriyle
  ekran-içi `STIL` bloğuna taşındı: cam kart, oa-cip/segment/sayi-girdi, oa-soru (+secili yaprak
  tonu), KELİMELİ rozetler (AI/zorluk/kalite), adaçayı kenarlı YAPIŞKAN sepet (neon YOK — tek
  birincil eylem `oa-btn-birincil`), mono özet satırları, oa-buyuk (yeşil/nötr/sıcak eksik hâli).
  Korunanlar: `Sayfa`, `Reveal`, `MathMarkdown`, `Icon`, `Sayi` (NumberFlow mikro-etkileşimi),
  `SubjectName` (ders çipi etiketi — ders rengi yalnız çipte, FİDAN §2 uyumlu).
- **DAVRANIŞ AYNEN (kod bloğu bloğuna korundu):** `KAYNAK_AI` sabiti + `kaynak!=='osym'`
  savunma süzgeci (TELİF — dokunulmadı), tek-sayfa akışı + sihirbaz-yok gerekçe yorumu,
  elle seçim ↔ rastgele (Seçimi temizle), dürüst eksik uyarısı yayınlamadan önce, 350ms
  gecikmeli arama, sayfalama, derin bağlantı ön-dolgusu (`?ogrenci=&kazanim=&ders=`),
  `yayinla` + başarı/uyarı/hata toast'ları, `useAsync` İLKEL deps.
- **Geçmiş Ödevler (YENİ):** gerçek uçtan satırlar — türetilmiş ad · `N soru · göreceli tarih`
  (gerçek tarih hesabı: bugün/dün/N gün/N hafta; 30+ günde `gunEtiketi` kısa tarihi) · KELİMELİ
  durum (`active`→"açık", diğer→"kapandı") · tamamlanma çubuğu `toplam/ogrenciSayisi`
  (yalnız veri varken) · **"Şablon olarak kopyala"**: ders+adet ön-dolar, zorluk 'Hepsi',
  elle seçim/sayfa sıfır, hedef sınıf, bayat derin-bağ parametreleri URL'den temizlenir,
  hareket-azalt uyumlu yukarı kaydırma + "Şablon yüklendi — yayınlamadan önce gözden geçir"
  toast'ı. Yükleniyor=iskelet · hata=oa-hata+Tekrar dene · boş="Henüz ödev göndermedin — ilk
  seti yukarıdan derle."
- **Sepette "Kaynak: AI havuzu" SABİT satır** (yorumla telif referansı); kaynak seçici YOK.
- **Boş sınıf:** Lighthouse emekli → FİDAN filiz SVG'si (Login marka filizinin eşi) + tek köprü
  "Sınıf Panosu'na git".
- **Hareket-azalt:** kart girişleri `Reveal` (JS-gateli); soru-kartı hover kalkışı, iskelet
  nabzı ve tamamlanma çubuğu dolum animasyonu `@media (prefers-reduced-motion: no-preference)`
  içinde; şablon kaydırması `azalt ? 'auto' : 'smooth'`.
- **Tık hedefleri ≥44px:** buton/çip/segment/girdi/arama/seçici min-height 44 (önizlemenin
  30-38px mini/segment dolguları bilinçli büyütüldü — FİDAN §9.10; 023/036 emsali).

### Koşulan kapılar + ham çıktı (KENDİ oturumumda, düzenleme SONRASI)
- `../learnup-brain/node_modules/.bin/tsc --noEmit -p tsconfig.json` → `TSC_EXIT=0` ✓ (sıfır hata)
- `bun run build` → `✓ built in 1.37s` · `BUILD_EXIT=0` ✓ —
  `dist/assets/OdevAtolyesi-Biih2kCB.js 21.89 kB │ gzip: 6.43 kB` (önceki 10.76 kB — Geçmiş
  Ödevler + inline STIL büyümesi; lazy chunk, kabuğu etkilemez). Paralel ajan çakışması
  yaşanmadı; kapılar ilk koşuda yeşil.

### Değişen dosyalar (beyanla birebir)
```
 frontend-v2/src/screens/sinif/OdevAtolyesi.tsx | 655 ++++++++++++++++---------
 1 file changed, 420 insertions(+), 235 deletions(-)   (kümülatif: 025 onaylı işi + bu kart)
```
+ kart dosyası. `types.teacher.ts`, `components/ui.tsx`, `cekirdek.tsx`, `rontgen.tsx`,
vite.config.js DOKUNULMADI.

### Gerçekleşen maliyet
**$0**.

### Açık riskler
- Tarayıcı smoke koşulmadı (araç yok) — davranış kanıtı: mantık blokları bire bir taşındı
  (state/effect/istek gövdeleri değişmedi) + tsc. QA ekran turu önerilir (iki tema +
  hareket-azalt + şablon kopyalama akışı).
- Önizlemeden bilinçli sapmalar (hepsi dürüstlük/kural gereği, yukarıda gerekçeli):
  "son 30 gün"→"N ödev" · ödev adları türetilmiş · zorluk şablonda ön-dolamıyor ·
  44px tık hedefleri · 📤 emoji yerine `send` ikonu (uygulama ikonografisi).
- Şablon kopyala toast'ı önizlemede yok — geri bildirim için eklendi (kelimeli, tek satır);
  istenmezse tek satır silinir.

### Sonraki adım önerisi
1. **[BACKEND öneri]** `GET /teacher/odevler` yanıtına `difficulty` (assignments tablosunda
   varsa) eklenirse şablon kopyala zorluğu da taşır — tek alanlık genişletme.
2. **[QA]** Ödev Atölyesi ekran turu (iki tema, RM, derin bağlantı + şablon akışı).
3. Yanıttaki `hedefli` listesi arayüzde hiç gösterilmiyor — Geçmiş Ödevler'e "hedefli setler"
  alt bölümü ayrı kart olabilir (önizlemede yok, bu kartın kapsamı dışında bırakıldı).

## Günlük
- 2026-07-23 · ORKESTRATÖR · kart açıldı (önizleme onayı 2026-07-23; 018→023→032→033→034 zincirini bitiren ajana atandı; 035/036 ile dosya kesişimi YOK)
- 2026-07-23 · FRONTEND · alindi
- 2026-07-23 · FRONTEND · tamamlandi (onaylı önizleme `oa-*` inline FİDAN'a port; davranış bloklar hâlinde AYNEN — KAYNAK_AI + osym-süzgeci/tek-sayfa/elle-seçim/dürüst-eksik/gecikmeli-arama/sayfalama/derin-bağ/yayinla korunmuş. Geçmiş Ödevler GERÇEK uçtan [şema envanteri RAPOR'da]: kelimeli durum, toplam/öğrenci tamamlanma çubuğu [öğrenci 0 ise gizli], şablon kopyala ders+adet ön-dolar [uçta difficulty YOK → zorluk Hepsi — dürüst sapma]; "son 30 gün"→gerçek "N ödev". Lighthouse→FİDAN filizi. Kapılar: tsc EXIT=0 · build EXIT=0 "✓ built in 1.37s", chunk 21.89 kB lazy. Maliyet $0.)
- 2026-07-23 · ORKESTRATÖR · onaylandi + arşiv. Denetim kanıtı: KAYNAK_AI + `kaynak!=='osym'` savunma süzgeci KORUNMUŞ (satır 64, 255) — telif zemini sağlam; Geçmiş Ödevler GERÇEK uçtan (/teacher/odevler:234, yorumla "mock yok" belgeli); mock/temsilî isim grep'i SIFIR (Deniz Kaya/Türev tekrar seti yok — hepsi türetilmiş subject·topic). Dürüst şema sapmaları KABUL: `difficulty` uçta yok → şablon-kopyala zorluğu 'Hepsi'ye döner (uydurma yok); ödev adı türetilir; "son 30 gün"→gerçek total; tamamlanma çubuğu yalnız ogrenciSayisi>0'da. git diff --stat beyanla birebir (655, +420/−235 kümülatif); tsc 0 + build yeşil; $0; yalnız beyanlı dosya. Öneriler backlog'a: /teacher/odevler'e difficulty alanı (BACKEND); şablon-kopyala toast'ı (önizlemede yoktu, kabul).
