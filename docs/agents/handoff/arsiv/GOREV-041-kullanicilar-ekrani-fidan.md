---
gorev: GOREV-041-kullanicilar-ekrani-fidan
kimden: ORKESTRATÖR
kime: FRONTEND
durum: onaylandi
oncelik: P2
bagimlilik: [GOREV-028]   # ✅ arşivde — 028 minimal ekleme yaptı; bu kart tam FİDAN dönüşümü
dokunulan-dosyalar:
  - frontend-v2/src/screens/kule/Kullanicilar.tsx
  - frontend-v2/src/components/yonetim.tsx   # KullaniciTablosu/RolRozeti/DenetimAkisi/RolDegisDialog/SinifAtaDialog FİDAN
migration-gerekli: hayir
---

## Amaç
Kullanıcılar ekranını **kullanıcı onaylı önizlemeyle** hizalamak:
`docs/design/onizleme/kullanicilar.html` (2026-07-23 onayı — kaynak referans BUDUR).
028 yalnız MİNİMAL ekleme yapmıştı (başvuru rozeti + filtre); bu kart tam FİDAN dönüşümü.

## Bağlam
- Tasarım: TASARIM-DILI v1.2 (inline FİDAN `ku-*`). İçerik: EKRAN-HARITASI §17.
- **DAVRANIŞ AYNEN KORUNUR:** sayfalama SUNUCUDA (1000-satır PostgREST tuzağı yok); iki ayrı
  kuyruk (onay bekleyen ≠ başvuru bekleyen); başvuru onayı = mevcut `onRol(id,'teacher')` (ayrı uç
  yok); kendi rolün KİLİTLİ ("bu sensin"); her mutasyon `yonetim_denetim` + `denetimYazildi:false`
  uyarısı; rol değişince yan etki toast'ı ("N öğrencinin sınıf bağı koptu"); iyimser güncelleme
  YOK → reload; arama debounce; RolDegisDialog/SinifAtaDialog Radix.
- **MOCK YASAK (kullanıcı teyidi):** gerçek uçlar — `/admin/kullanicilar` (sayfalı, filtreler
  sunucuda), `/admin/kullanici/:id` (detay+etkinlik+başvuru+hesap denetimi), `/admin/denetim`.
  Etkinliği olmayan hesap "ölçülecek veri yok" (null≠0).

## Kabul Kriterleri
- [x] Görünüm iki temada da önizlemeyle eşleşir: başlık + bekleyen durumu · 4 stat (tek neon =
      onay bekleyen, tıkla→filtrele) · rol segmenti + arama + iki filtre çipi · sayfalı hesap
      tablosu (rol rozetleri kelime+renk, onaysız öğretmen ayrı rozet, satır-içi "Onayla") ·
      sağda seçili hesap paneli (rol/sınıf/etkinlik/başvuru bölümü + tek-tık onay/rol değiş/sınıf
      ata) · append-only denetim defteri
- [x] Kendi rolün kilitli ("bu sensin"); rol rozetleri asla yalnız renk; null≠0 (etkinlik yoksa dürüst metin)
- [x] Denetim izsiz kalırsa uyarı; mutasyon yan etkileri toast'ta; iyimser güncelleme yok
- [x] `tsc --noEmit` sıfır hata + `bun run build` yeşil → HAM çıktılar RAPOR'da; **$0**

## Kısıtlar / Kapsam Dışı
- Yeni backend ucu İSTENMEZ. `components/ui.tsx`/`cekirdek.tsx`/`fx.tsx` DOKUNULMAZ (yonetim.tsx
  serbest — yönetici paylaşımlı bileşen). Auth/RBAC mantığı değişmez; sayfalama sunucuda kalır.

## Başlangıç Durumu
- Git rev: `5c2610e`; kirli ağaç (onaylı işler). `Kullanicilar.tsx` 028'in ONAYLI işiyle kirli;
  `yonetim.tsx` eski onaylı işlerle. Yalnız bu kartın işi eklenir. İlk adım: `git diff --stat` RAPOR'a.

## Onay Kayıtları
- Paralı koşu: GEREKMEZ ($0).

## RAPOR

### Yapılan
Kullanıcılar ekranı, onaylı önizlemeye (`docs/design/onizleme/kullanicilar.html`) FİDAN v1.2 inline
desenle TAM taşındı. Kule.tsx/kule.tsx sibling deseni birebir izlendi: ekranda tek `<style>` bloğu +
`ku-*` scoped sınıflar, renkler `index.css` CSS değişkenlerinden (`--cam/--cam-kenar/--metin1..3/
--vurgu/--adacayi/--yaprak/--toprak/--uyari/--bilgi/--dogru/--yanlis/--v0/--v1/--mat/--cta/--golge/
--parilti`) → iki tema (Gün Işığı + Gece Ormanı) otomatik. COASTAL primitifleri
(`StatTile/PanelBaslik/SinifBaslik/Chip/Badge/FiltreCipi/SegmentGecis/GlowBorder/WaveDivider/
StatusLine`) söküldü; yerlerine önizlemedeki `ku-*` desen geldi. `Reveal/Sayfa/PanoIskeleti/Sayi/
CanliSayi/Icon` korundu (Kule presedanı). ui.tsx/cekirdek.tsx/fx.tsx'e DOKUNULMADI.

**Taşınan görsel öğeler (önizlemeyle eşleşir):** başlık + sağ üstte bekleyen `ku-durum` çipi (statik,
canlı-nokta bütçesi harcanmadı) · 4 stat, tek neon = onay bekleyen (`ku-neon` uyari kenar, `<button>`,
tıkla→bekleyen filtresi; bekleyen yoksa nötr stat + "tüm öğretmenler panelde") · panel başlığı + rol
segmenti (`ku-segment`) · arama + iki filtre çipi (`ku-filtre-cip`) · sayfalı hesap tablosu (`ku-utablo`,
rol rozetleri kelime+renk, onaysız öğretmen AYRI `onaysız` rozeti, satır-içi `ku-mini-onay` "Onayla") ·
sağ seçili hesap paneli (rol/sınıf/etkinlik/başvuru + `ku-btn` eylemler) · append-only `ku-denetim-satir`
defteri. Radix RolDegisDialog/SinifAtaDialog/Onayı-kaldır onay diyalogları `ku-modal`/`ku-overlay`/
`ku-btn`/`ku-segment` ile FİDAN'a boyandı (Portal→body; `<style>` belge-global olduğu için sınıflar orada da geçerli).

**DAVRANIŞ AYNEN KORUNDU (mock yok, gerçek uçlar):** sayfalama SUNUCUDA (`limit/offset`, 1000-satır
tuzağı yok) · iki ayrı kuyruk (bekleyen onay ≠ başvuru bekleyen; filtreler karşılıklı sıfırlanır) ·
başvuru onayı = mevcut `onRol(id,'teacher')` (ayrı uç yok) · kendi rolün KİLİTLİ ("bu sensin" çipi +
RolDegisDialog kilit-kutusu) · her mutasyonda `denetimYazildi:false` → toast uyarısı (`izUyar`) · rol
değişince "N öğrencinin sınıf bağı koptu" yan etki toast'ı · iyimser güncelleme YOK → buton dönerken
devre dışı + `tazele()` reload · arama debounce (300 ms) · rol rozetleri kelime+renk · null≠0 (etkinlik
yoksa "Hiç soru çözmemiş — ölçülecek veri yok"; denetim defteri yoksa "—/defter yok", 0020 farkı korundu).

**Önizlemenin ötesinde bilinçli KORUNAN 2 nokta (DAVRANIŞ AYNEN gereği, RAPOR'a not):**
1. Detay panelinde "Bu hesapta yapılanlar" mini denetim listesi (`detay.denetim`) — önizleme mock'unda
   çizili değildi ama 028'in onaylı işlevi; FİDAN'a boyanıp korundu (silmek işlev kaybı olurdu).
2. Tablodaki onaylı öğretmen için "Onayı kaldır" (Radix onay diyaloğu) — önizlemede boş hücreydi ama
   onay-geri-alma tek erişim yolu; `ku-mini-kaldir` olarak sessizce korundu. İkisinin de önizlemeden
   çıkarılması istenirse ORKESTRATÖR haber versin.

### Değişen dosyalar (`git diff --stat`, yalnız beyan edilenler)
```
 frontend-v2/src/components/yonetim.tsx        | 300 ++++++-------
 frontend-v2/src/screens/kule/Kullanicilar.tsx | 594 ++++++++++++++++++--------
 2 files changed, 558 insertions(+), 336 deletions(-)
```
`git status --short`: yalnız bu iki dosya `M`. Beyan dışı kirli dosyaya dokunulmadı; `git checkout/restore`
kullanılmadı. (Kart dosyası `docs/agents/handoff/` git'te izlenmiyor — `??`.)

### Koşulan kapılar + HAM çıktı
```
$ cd frontend-v2 && ../learnup-brain/node_modules/.bin/tsc --noEmit -p tsconfig.json
---TSC EXIT: 0---            # sıfır hata

$ bun run build
✓ 1922 modules transformed.
dist/assets/Kullanicilar-BLP07tBT.js   37.28 kB │ gzip: 9.35 kB │ map: 79.44 kB
...
✓ built in 1.42s
---BUILD EXIT: 0---
```
Uyarılar (ikisi de MEVCUT, bu karttan bağımsız): `advancedChunks option is deprecated` ve
`Some chunks are larger than 500 kB` (vendor-three/katex/charts). manualChunks fonksiyon kaldı — build YEŞİL.

### Gerçekleşen maliyet
**$0** — paralı LLM koşusu yok (salt frontend/tsc/build).

### Açık riskler
- **Rol-rozet kontrastı önizlemeden birebir alındı** (`--bilgi` öğretmen, `--toprak` yönetici, `--uyari`
  onaysız — düşük doygunluklu tonlar). Önizleme kullanıcı-onaylı ama küçük bold rozet metninin ≥4.5:1'i
  UYGULAMADA ölçülmedi — §9.10 gereği "sağlandı" DEMİYORUM. Renk-körü güvenliği tamam (her rozet kelime taşır).
- Stil kaynağı çift-dosya: `ku-*` sınıfları Kullanicilar.tsx `<style>`'ında, yonetim.tsx onları tüketiyor.
  Güvenli çünkü bu bileşenler YALNIZ bu ekranda render ediliyor (grep-doğrulandı) ve `<style>` belge-global
  (dialog Portal'ları dahil). Başka ekranda kullanılırsa stilsiz kalır — dosya başına not düşüldü.
- 042/043 kule.tsx'te paralel; dosya kesişimi YOK. Kapılar temiz koştu (başka ajanın ara hatası görülmedi).

### Sonraki adım önerisi
- Önizlemede olmayan iki korunan öğe (yukarıda) için ORKESTRATÖR kararı: kalsın mı, önizlemeye eklensin mi?
- İleride `src/ui.tsx` legacy Icon dışında `components/ui.tsx` COASTAL primitifleri (sky/teal) FİDAN'a
  geçince, error-state'teki tek `GlowButton` (Kule presedanıyla korundu) da `ku-btn`e dönebilir — ayrı temizlik.

## Günlük
- 2026-07-23 · ORKESTRATÖR · kart açıldı (önizleme onayı "onay" 2026-07-23; YENİ ajana; 042/043 [kule.tsx] ile dosya kesişimi YOK — paralel)
- 2026-07-23 · FRONTEND · alindi
- 2026-07-23 · FRONTEND · tamamlandi (Kullanicilar.tsx + yonetim.tsx FİDAN `ku-*` inline dönüşümü; tsc EXIT 0 + build EXIT 0 YEŞİL; $0; DAVRANIŞ AYNEN)
- 2026-07-23 · ORKESTRATÖR · onaylandi + arşiv. Denetim kanıtı: gerçek uçlar korundu (8 apiGet/apiPost — /admin/kullanicilar·/kullanici/:id·/denetim); COASTAL primitif Kullanicilar.tsx'te SIFIR; yonetim.tsx 36 ku-* (FİDAN). cekirdek.tsx/fx.tsx M görünüyor AMA diff'lerinde ku-*/kullanici izi SIFIR → o değişiklikler 009/018'in (onaylı/arşiv) kirli izleri, 041 DOKUNMADI (bağımsız grep kanıtı). git diff --stat beyanla birebir (2 dosya, +558/−336); tsc 0 + build 0 HAM RAPOR'da; $0. İki bilinçli karar KABUL (DAVRANIŞ AYNEN): "Bu hesapta yapılanlar" mini denetim listesi + "Onayı kaldır" diyaloğu önizlemede yoktu ama onay-geri-alma tek yolu — korunması doğru. Kontrast dürüstlüğü: ajan rozet ≥4.5:1'i "sağlandı" demedi (renk-körü tam: her rozet kelime taşır) — backlog kontrast denetimine.
