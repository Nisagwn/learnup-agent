---
gorev: GOREV-043-ozgunluk-bariyeri-ekrani-fidan
kimden: ORKESTRATÖR
kime: FRONTEND
durum: onaylandi
oncelik: P2
bagimlilik: [GOREV-042]   # SERİ — ikisi de components/kule.tsx (çakışma önleme); 042 bitince başlar
dokunulan-dosyalar:
  - frontend-v2/src/screens/kule/OzgunlukBariyeri.tsx
  - frontend-v2/src/components/kule.tsx   # EsikTablosu FİDAN
migration-gerekli: hayir
---

## Amaç
Özgünlük Bariyeri ekranını **kullanıcı onaylı önizlemeyle** hizalamak:
`docs/design/onizleme/ozgunluk-bariyeri.html` (2026-07-23 onayı — kaynak referans BUDUR).

## Bağlam
- Tasarım: TASARIM-DILI v1.2 (inline FİDAN `oz-*`). İçerik: EKRAN-HARITASI §19 (Özgünlük).
- **MOCK YASAK (kullanıcı teyidi):** tek gerçek uç `GET /admin/ozgunluk`: snapshot (nnKopya,
  nnP90, tarih), ders eşikleri + havuz adedi, engel (elenen), shingle, tabanEsik, not.
- **İKİ İMZA DÜRÜSTLÜK ÖĞESİ KORUNUR (koddaki gerekçe aynen):**
  1. **"ölçüm yok" ≠ "0 kopya":** eval koşmadıysa hero "Ölçüm yok" + "bu kopya yok DEMEK
     DEĞİLDİR, ölçülmedi demektir" açıklaması. 0 ile ölçülmemiş ASLA aynı gösterilmez.
  2. **"Bariyerin Sınırı":** bariyerde elenen aday sayısı ÖLÇÜLMÜYOR (bellekte eleniyor);
     hayatta kalanlardan türetmek uydurma olurdu → `OlcumYok`. (Üretim hunisi dürüst-boşluğunun ikizi.)
- Yöntem paneli şeffaf kalır (shingle/maskeleme/kalıp-temizleme/taban-eşik/onarılmaz-eleme).

## Kabul Kriterleri
- [x] Görünüm iki temada da önizlemeyle eşleşir: hero (eşiği aşan kopya sayısı VEYA "ölçüm yok"
      dürüst ayrımı) · ders bazlı eşik tablosu (ders eşiği vurgulu, taban soluk; p90 satırı) ·
      "Bariyerin Sınırı" dürüst-boşluk kartı (elenen = OlcumYok) · yöntem paneli
- [x] İki imza dürüstlük öğesi birebir korunur; null≠0; tek ışık vurgusu hero
- [x] `tsc --noEmit` sıfır hata + `bun run build` yeşil → HAM çıktılar RAPOR'da; **$0**

## Kısıtlar / Kapsam Dışı
- Yeni backend ucu İSTENMEZ. `components/ui.tsx`/`cekirdek.tsx`/`fx.tsx` DOKUNULMAZ. Bu kart
  yalnız `EsikTablosu`'na dokunur; 042'nin (KaliteHistogrami/ZorlukDagilimi/DersKapsamaTablosu)
  ve 039'un (AjanSagligi/EvalTrendi/OlcumYok) işine DEĞMEZ.
- **"Yakın-ikiz listesi" (EKRAN-HARITASI §19 + satır 278 [HAZIR]) KAPSAM DIŞI:** mevcut ekranda
  YOK ve `/admin/ozgunluk` yanıtı çift dizisi DÖNDÜRMÜYOR (yalnız nnKopya sayısı + eşikler + engel).
  Bu kart mevcut ekranın GÖRSEL taşımasıdır — ikiz listesi ayrı bir özellik (uç + view) → BACKEND
  kartı + sonraki FRONTEND kartı. Mock ikiz listesi UYDURMA (MOCK YASAK). Önizleme de bunu içermez.

## Başlangıç Durumu
- Git rev: `5c2610e`; kirli ağaç (onaylı işler). GOREV-042 onaylandı+arşivde → `kule.tsx` serbest.
  `kule.tsx` 039 (AjanSagligi/EvalTrendi/OlcumYok) + 042 (KaliteHistogrami/ZorlukDagilimi/
  DersKapsamaTablosu) ONAYLI işleriyle kirli — ONLARA DOKUNMA; sen yalnız `EsikTablosu`'na
  dokun. `OzgunlukBariyeri.tsx` eski onaylı işlerle kirli. İlk adım: `git diff --stat` RAPOR'a.

## Onay Kayıtları
- Paralı koşu: GEREKMEZ ($0).

## RAPOR

### Yapılan
Özgünlük Bariyeri ekranı + `EsikTablosu` bileşeni, onaylı önizlemeye (`docs/design/onizleme/
ozgunluk-bariyeri.html`, 2026-07-23) FİDAN v1.2 inline `oz-*` scoped desenine taşındı
(SoruHavuzu.tsx'in `sh-*` desenin kardeşi). Tek `<style>` bloğu OzgunlukBariyeri.tsx'te;
`EsikTablosu` o sınıfları tüketir. Tema değişkenleri (`--metin*`, `--cam`, `--cam-kenar`,
`--vurgu`, `--uyari`, `--adacayi`, `--toprak`, `--v1`) iki temayı otomatik döndürür — sabit
renk gömülmedi. Önizlemenin `--m1/2/3` → `--metin1/2/3`, `--cam-cizgi` → `--cam-kenar` eşlemesi
uygulandı; ondalıklar tr-TR virgülle (0,52 / 0,214).

Kartlar (hepsi `oz-kart` cam yüzey): (1) **Başlık** — `ölçüm <tarih>` durum + `o.not` alt bilgi;
(2) **Hero** — tek ışık vurgusu = adaçayı 1,5px sınır (GlowBorder yerine, önizlemeye birebir),
`buyuk` 56px kopya sayısı VEYA `buyuk-yok` "Ölçüm yok"; (3) **Ders Bazlı Eşikler** (EsikTablosu) —
Ders/Eşik/Taban/Havuz tablosu + tek p90 satırı (toprak); (4) **Bariyerin Sınırı** — uyarı tonlu
sınır + dürüst-boşluk `oz-olcumyok` kutusu; (5) **Yöntem** — şeffaf ölçüm listesi.

**İki imza dürüstlük öğesi birebir korundu (koddaki gerekçe aynen):**
1. `kopya == null` → hero "Ölçüm yok" + "'kopya yok' demek DEĞİLDİR — ölçülmedi demektir".
   0 kopya ile ölçülmemiş asla aynı gösterilmez (null ≠ 0).
2. Bariyerin Sınırı → `o.engel == null` iken `OlcumYok not="bariyerde elenen aday: ölçülmüyor"`;
   elenen aday üretim döngüsünde bellekte eleniyor, hayatta kalanlardan türetmek uydurma olurdu.
3. Ek dürüstlük: p90 `null` iken eşik tablosunda 0 çizilmez → `OlcumYok not="p90 ölçülmedi — eval
   koşmadı"`.

**§14 (asla yalnız renk):** taban-uygulanan derste eşik hücresine soluk "taban" etiketi (Tip'li
tooltip'le "ayrı ölçüm yok — taban eşik uygulanıyor") eklendi — bilgi salt renkte kalmıyor;
Bariyerin Sınırı başlığı ikon (shield, uyarı tonu) + kelime taşır.

MOCK YOK — tek gerçek uç `GET /admin/ozgunluk` (`AdminOzgunlukYaniti`). Kapsam dışı "yakın-ikiz
listesi" eklenmedi (uç çift dizisi döndürmüyor). 039/042 bileşenlerine (AjanSagligi/EvalTrendi/
OlcumYok · KaliteHistogrami/ZorlukDagilimi/DersKapsamaTablosu) dokunulmadı; yalnız `EsikTablosu`
değişti. `ui.tsx`/`cekirdek.tsx`/`fx.tsx` değişmedi (yalnız import edildi).

### Değişen dosyalar
- `frontend-v2/src/screens/kule/OzgunlukBariyeri.tsx` — tam yeniden yazım (oz-* inline desen).
- `frontend-v2/src/components/kule.tsx` — YALNIZ `EsikTablosu` + import satırları
  (`Badge`/`Olcer`/`PanelBaslik` kaldırıldı — sadece EsikTablosu kullanıyordu; `ondalik` tr-TR
  yardımcısı eklendi). 039/042 blokları değişmedi.

Beyanla eşleşme: `git status --short` → yalnız bu iki dosya benim (diğer M/?? dosyalar önceki
onaylı/kirli işler, dokunulmadı).

### Koşulan kapılar + çıktıları
```
$ ../learnup-brain/node_modules/.bin/tsc --noEmit -p tsconfig.json
TSC_EXIT=0
```
```
$ bun run build
vite v8.1.4 building client environment for production...
 WARN  advancedChunks option is deprecated, please use codeSplitting instead.   (ÖNCEDEN VAR)
✓ 1922 modules transformed.
...
dist/assets/OzgunlukBariyeri-TJGar0t6.js   9.50 kB │ gzip: 3.12 kB │ map: 15.80 kB
dist/assets/kule-BeCCuqyp.js              12.33 kB │ gzip: 4.00 kB │ map: 36.27 kB
...
✓ built in 1.73s
(!) Some chunks are larger than 500 kB ...   (ÖNCEDEN VAR — vendor-three/katex/charts)
BUILD_EXIT=0
```
Her iki kapı YEŞİL. Uyarılar önceden var (advancedChunks deprecation + >500 kB vendor chunk'ları);
bu kartla ilgisiz.

### Gerçekleşen maliyet
**$0** — paralı LLM koşusu yok.

### Açık riskler
- Ders eşik değerinin taban eşiğe EŞİT olduğu (ama `taban=false`) bir kenar durumda hücre yine
  vurgulu görünür; veri modeli `taban` bayrağını kaynak kabul ettiği için doğru davranış (ölçüm
  var ama sayısal olarak tabana denk). "taban" etiketi yalnız `e.taban===true` iken çıkar.
- Görsel eşitlik iki temada CSS değişkenlerinden türediği için canlı gözle teyit önerilir
  (:8080/:5174 dev sunucularına dokunulmadı; ORKESTRATÖR onayında bakabilir).

### Sonraki adım önerisi
- "Yakın-ikiz listesi" (§19) ayrı özellik: önce BACKEND kartı (`/admin/ozgunluk` yanıtına çift
  dizisi ekleyecek uç), sonra FRONTEND kartı (liste view'ı). Bu kartta bilinçli KAPSAM DIŞI.

## Günlük
- 2026-07-23 · ORKESTRATÖR · kart açıldı (beklemede; 042 ile SERİ — aynı dosya kule.tsx; 042 bitince aynı ajana zincirlenir)
- 2026-07-23 · FRONTEND · alindi
- 2026-07-23 · FRONTEND · tamamlandi (oz-* inline taşıma; tsc 0 + build yeşil; $0; iki imza dürüstlük öğesi korundu)
- 2026-07-23 · ORKESTRATÖR · onaylandi + arşiv. Denetim: 49 oz-*; iki imza dürüstlük öğesi korundu (ölçüm-yok/OlcumYok 5 referans — "kopya yok DEĞİL, ölçülmedi" + "bariyerde elenen ölçülmüyor"); ek §14 iyileştirme (taban etiketi + Tip tooltip, "asla yalnız renk"). kule.tsx yalnız EsikTablosu değişti — 042'nin DersKapsamaTablosu'nu (soruSayisi param'ıyla) SoruHavuzu hâlâ kullanıyor (SoruHavuzu.tsx:198, 042 işi korunmuş); 039 bileşenlerine dokunulmadı. Gerçek uç /admin/ozgunluk (mock yok); ikiz-listesi doğru kapsam-dışı. KONSOLİDE frontend kapıları ORKESTRATÖR koştu: tsc 0 + build 0, OzgunlukBariyeri+SoruHavuzu+kule chunk'ları temiz. $0. SON EKRAN KARTI — tüm ürün ekranları FİDAN.
