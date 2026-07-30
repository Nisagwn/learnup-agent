---
gorev: GOREV-026-sinif-panosu-ekrani-fidan
kimden: ORKESTRATÖR
kime: FRONTEND
durum: onaylandi
oncelik: P2
bagimlilik: [GOREV-006, GOREV-007]   # ikisi de ✅ — BAŞLATILABİLİR; inline FİDAN deseni
dokunulan-dosyalar:
  - frontend-v2/src/screens/sinif/SinifPanosu.tsx
migration-gerekli: hayir
---

## Amaç
Öğretmen Sınıf Panosu'nu **kullanıcı onaylı önizlemeyle** hizalamak:
`docs/design/onizleme/sinif-panosu.html` (2026-07-23 onayı — kaynak referans BUDUR).
İlk P2 (öğretmen) ekranı.

## Bağlam
- Tasarım: TASARIM-DILI v1.2 (inline FİDAN). İçerik: EKRAN-HARITASI §11 + zenginleştirmeler
  (haftalık rapor şeridi [HAZIR] · pasif öğrenci filtresi [HAZIR] · ödev tamamlanma takibi [HAZIR] ·
  CSV dışa aktarım [FRONTEND]).
- Veri: TAMAMI mevcut uçlardan — sınıf sağlayıcısı (kod + mevcut), roster (son aktivite/doğruluk/
  hacim), motorun triaj işaretleri, sınıf zayıf kazanımları (N+1-siz RPC'ler — M§10), ödev geçmişi.
  **`v_mastery_rollup` KULLANILMAZ** (M§10 — QA bunu tarar).
- **Teşhis dili öğretmende AÇIK** (ürün kuralı): triaj gerekçelerinde kavram yanılgısı adı
  görünebilir; risk rozetleri yine KELİMELİ. `/teacher/*` yanıtlarında önbellek YOK (M§11).

## Kabul Kriterleri
- [x] Görünüm iki temada da önizlemeyle eşleşir: üst şerit (sınıf kodu kartı + kopyala · haftalık
      rapor 3 KPI [bu hafta çözülen / aktif öğrenci N/M / ort. doğruluk] · 84 günlük aktivite
      trendi) · **İlgi Bekleyenler** (kelimeli risk rozetleri + gerekçe + "Röntgeni aç" köprüsü) ·
      **zayıf kazanımlar ilk 5** (kaç öğrenci etiketiyle) + sayfanın TEK birincil "Seçili
      kazanımdan ödev derle" (Ödev Atölyesi'ne SEÇİMLE gider) · öğrenci tablosu · ödev takibi ·
      öğrenci yönetimi *(not: önizlemedeki "düşüş eğilimi" rozeti veriyle desteklenemiyor —
      öğrenci başına trend ucu yok; triaj yalnız gerçek sinyalleri gösterir, bkz. RAPOR)*
- [x] Öğrenci tablosu: arama + **pasif filtresi (son 7 gün)** + düşük doğruluk filtresi + sıralama —
      hepsi URL'de `replace:true` (paylaşılabilir); satır → Röntgen; **CSV** istemci tarafında üretilir
- [x] Ödev takibi: aktif ödev tamamlanma çubukları + "henüz yapmayanlar" listesi (ödev geçmişi
      verisinden); null≠0 — aktif ödev yoksa panel gizlenir *(not: mevcut uç yalnız SAYI veriyor
      — önizlemedeki gibi "Henüz yapmayan N öğrenci" gösterilir; isim listesi için BACKEND kartı
      önerisi RAPOR'da)*
- [x] Öğrenci yönetimi: e-postayla ekle (başka sınıftaki öğrenciye **409 açık Türkçe hata** —
      sessiz devralma kapalı, mevcut kural); çıkarma Radix Dialog
- [x] null≠0: hiç çözmemiş öğrencide "ölçüm yok"; triaj boşsa pozitif boş durum; sınıf boşsa
      kod-paylaşım odaklı boş durum; sayı uydurulmaz (önizlemedeki tüm değerler TEMSİLÎYDİ)
- [x] Ambiyans sakin (süzülen yaprak YOK — yoğun veri yüzeyi); stagger ≤0.3s;
      `prefers-reduced-motion`'da statik
- [x] `tsc --noEmit` sıfır hata + `bun run build` yeşil → çıktılar RAPOR'da

## Kısıtlar / Kapsam Dışı
- Diğer öğretmen ekranları (Isı Haritası/Röntgen/Atölye/Karşılaştırma) bu kartın DIŞI.
- Yeni backend ucu istenmez; sınıfa duyuru/sınıf hedefi GELECEK — yer açılmaz.
- `lib/sinif.tsx` (SinifSaglayici) davranışı değişmez; `components/*` ortakları dokunulmaz.

## Başlangıç Durumu
- Git rev: `5c2610e`; kirli ağaç ~58 kayıt (onaylı işler — kullanıcı commit'i bekleniyor).
  İlk adım: `git diff --stat` fotoğrafı RAPOR'a.

## Onay Kayıtları
- Paralı koşu: GEREKMEZ ($0).

## RAPOR

### Yapılan
`SinifPanosu.tsx` onaylı önizlemeye (`docs/design/onizleme/sinif-panosu.html`) göre inline FİDAN
deseniyle (GOREV-007 kalıbı: `sp-*` sınıflı `<style>` bloğu + CSS tema değişkenleri) SIFIRDAN
yazıldı; eski COASTAL bileşen bağımlılıkları (`components/sinif`, `rontgen`, `GlowBorder`,
`StatTile`…) ekrandan çıkarıldı (bileşen dosyalarına DOKUNULMADI — beyan dışı).

- **Üst şerit:** kod kartı (kopyala → pano + toast) · 3 KPI (bu hafta çözülen / aktif N/M /
  ort. doğruluk — null'da "—" + "ölçüm yok") · 84 günlük aktivite (ozet.trend → 42 adet 2 günlük
  kova; hiç çözüm yoksa kart ÇİZİLMEZ).
- **İlgi Bekleyenler:** motorun `risk='yuksek'` işareti + pasiflik (≥7 gün / 30+ gün / hiç
  başlamadı). Gerekçeler GERÇEK alanlardan (açık yanılgı sayısı, doğruluk, ustalık, gün sayısı);
  rozetler KELİMELİ; "Röntgeni aç →" köprüsü; boşsa pozitif boş durum. Önizlemedeki "düşüş
  eğilimi" kategorisi eklenmedi: öğrenci başına trend verisi mevcut uçlarda yok — uydurulmadı.
- **Zayıf kazanımlar ilk 5:** `/teacher/sinif/zayif-kazanimlar?limit=5` (N+1'siz RPC;
  `v_mastery_rollup` YOK). `K/N öğrenci` etiketi; seçim `aria-pressed`; sayfanın TEK birincil
  butonu "Seçili kazanımdan ödev derle" → `/sinif/odev?kazanim=…&ders=…`; seçili kazanımın
  havuzu 0/0 ise buton kapalı + açıklama.
- **Öğrenci tablosu (MAT yüzey):** arama `?q=` · `?filtre=pasif|dusuk` · `?sirala=` + `?yon=` —
  hepsi `setParams(p,{replace:true})`; null değerler sıralamada HER yönde sona. Satır → Röntgen
  (klavyeyle de: tabIndex+Enter). CSV istemcide (görünümdeki liste; `;` ayraç, BOM'lu UTF-8;
  null → "ölçüm yok"). Satırdaki "Çıkar" → Radix Dialog ("verisi silinmez, yalnız sınıf bağı
  kalkar") → dönen durum + `reload()` (iyimser güncelleme yok).
- **Ödev takibi:** `/teacher/odevler` → `status==='active'` olanların tamamlanma çubukları
  (`gonderim.toplam/ogrenciSayisi`) + "Henüz yapmayan N öğrenci" (`gonderim.bekleyen`) + son
  tarih; aktif ödev yoksa panel GİZLİ; uç hatasında dürüst hata + tekrar dene.
- **Öğrenci yönetimi:** e-postayla ekle; 409 `baska_sinifta` Türkçe tam cümlesi KALICI inline
  kutuda (toast gibi kaybolmaz) — sessiz devralma kapalı kural aynen korundu; "zaten sınıfında"
  bilgi toast'ı korundu.
- **Boş sınıf:** kod-paylaşım odaklı boş durum (tek birincil: "Kodu kopyala") + e-postayla ekleme.
- **FİDAN uyumu:** iki tema CSS değişkenlerinden; cam yüzeyler üst şerit + orta paneller (5),
  tablo ve alt paneller MAT (yoğun liste kuralı); kalıcı ışıltı/canlı nokta YOK; Reveal stagger
  0→0.28s + çubuk animasyonları yalnız `prefers-reduced-motion: no-preference` içinde; tık
  hedefleri ≥44px; rozet/durumlar daima kelimeli.

### Değişen dosyalar (`git diff --stat` — yalnız beyandaki dosya)
```
frontend-v2/src/screens/sinif/SinifPanosu.tsx | 1021 ++++++++++++++++++++-----
1 file changed, 841 insertions(+), 180 deletions(-)
```
Başlangıç fotoğrafı (iş öncesi, rev 5c2610e üzeri kirli ağaç): `53 files changed, 1905
insertions(+), 1568 deletions(-)` — SinifPanosu.tsx temizdi. İş sonrası genel toplam 57 dosyaya
çıktı; fark PARALEL ajanların eşzamanlı işidir (ör. `learnup-brain/src/scripts/eval.ts`) — bu
kartın dokunduğu tek dosya yukarıdaki.

### Koşulan kapılar + HAM çıktı
`cd frontend-v2; ..\learnup-brain\node_modules\.bin\tsc --noEmit -p tsconfig.json`
```
tsc exit: 0        (hata çıktısı YOK — sıfır hata)
```
`bun run build`
```
dist/assets/SinifPanosu-B0rEmCUd.js                    26.92 kB │ gzip:   8.38 kB │ map:    66.16 kB
✓ built in 1.57s
(!) Some chunks are larger than 500 kB after minification.  ← bilinen vendor-three/katex uyarısı, bu karttan bağımsız
build exit: 0
```

### Gerçekleşen maliyet
$0 — paralı LLM koşusu yapılmadı.

### Açık riskler
1. **"Henüz yapmayanlar" isim listesi yok:** `/teacher/odevler` ödev başına yalnız SAYI veriyor
   (`gonderim.bekleyen`); isimleri veren uç yok. Ekran sayıyı gösteriyor (önizlemedeki metinle
   aynı); "listeyi gör" köprüsü koyulMADI — gidecek yüzey yok, ölü köprü olurdu.
2. **"Düşüş eğilimi" triaj kategorisi yok:** öğrenci başına trend ucu yok; `risk='orta'` tabloda
   rozetle görünüyor ama triaj kuyruğuna alınmadı (gerekçe uydurmak gerekirdi).
3. Eski panodaki çoklu-seçim → Karşılaştırma kısayolu (SecimCubugu) onaylı önizlemede olmadığı
   için kalktı; Karşılaştırma ekranı nav'dan erişilebilir.
4. `components/sinif.tsx` bileşenlerinin çoğu artık yalnız eski panodan kullanılıyordu — muhtemel
   ölü kod; beyan dışı olduğundan dokunulmadı.
5. "Düşük doğruluk" filtre eşiği %50 bir UI kararı (sunucu eşiği yok) — çipin `title`'ında açık.

### Sonraki adım önerisi
- **BACKEND kartı:** ödev başına gönderim/eksik listesi ucu (ör. `GET /teacher/odev/:id/gonderimler`)
  → "henüz yapmayanlar" İSİMLE listelenebilir; istenirse öğrenci başına mini-trend alanı roster'a.
- **ORKESTRATÖR:** `components/sinif.tsx` ölü bileşen temizliği için ayrı kart; sıradaki P2
  ekranlar (Isı Haritası / Röntgen / Atölye / Karşılaştırma) FİDAN kartları.

## Günlük
- 2026-07-23 · ORKESTRATÖR · kart açıldı (BAŞLATILABİLİR — önizleme onayı "sınıf panosunuda onaylıyorum" 2026-07-23; aktif kartlarla dosya kesişimi YOK)
- 2026-07-23 · FRONTEND · alindi
- 2026-07-23 · FRONTEND · tamamlandi (tsc 0 hata + build yeşil; tek dosya: SinifPanosu.tsx)
- 2026-07-23 · ORKESTRATÖR · onaylandi → arsiv/ (DENETİM: grep — v_mastery_rollup SIFIR [yalnız KULLANILMAZ yorumları], veri yalnız mevcut uçlardan [zayif-kazanimlar RPC + /teacher/odevler + SinifSaglayici]; diff yalnız beyanlı dosya; kapı çıktıları ham. Dürüst sapmalar KABUL: "düşüş eğilimi" kategorisi trend ucu olmadığından atlandı [uydurmamak doğru], yapmayan İSİM listesi yerine gerçek sayı + ölü köprü koyulmaması isabetli. BACKLOG: ödev gönderim listesi ucu [BACKEND], components/sinif ölü kod temizliği. 4 ölçüt sağlandı.)
