---
gorev: GOREV-035-kazanim-isi-haritasi-fidan
kimden: ORKESTRATÖR
kime: FRONTEND
durum: onaylandi
oncelik: P2
bagimlilik: []   # BAŞLATILABİLİR — aktif kartlarla dosya kesişimi YOK
dokunulan-dosyalar:
  - frontend-v2/src/screens/sinif/SinifIsi.tsx
migration-gerekli: hayir
---

## Amaç
Kazanım Isı Haritası ekranını **kullanıcı onaylı önizlemeyle** hizalamak:
`docs/design/onizleme/kazanim-isi-haritasi.html` (2026-07-23 onayı "hepsını onaylıyorm" —
kaynak referans BUDUR).

## Bağlam
- Tasarım: TASARIM-DILI v1.2 (inline FİDAN — Bugun/Bahce `bh-*` kalıbının `si-*` karşılığı).
  İçerik: EKRAN-HARITASI §12.
- **MOCK YASAK (kullanıcı teyidi 2026-07-23):** tüm veri GERÇEK uçlardan —
  `GET /teacher/sinif/isi-haritasi` (mevcut; OdevAtolyesi de kullanıyor) +
  gerekiyorsa `GET /teacher/sinif/zayif-kazanimlar` (mevcut). İlk iş ENVANTER: yanıt şeması
  önizlemedeki hangi parçayı karşılıyor (konu→kazanım hücreleri, iki katmanlı ortalama,
  seçili-kazanım paneli: öğrenci dağılım bantları + en zayıf öğrenciler)? **Karşılamayan parça
  UYDURULMAZ — panel/parça gizlenir + RAPOR'a eksik-veri notu ve BACKEND kartı önerisi.**

## Kabul Kriterleri
- [x] Görünüm iki temada da önizlemeyle eşleşir (uçların verdiği ölçüde): ders filtre çipleri
      **URL'de** (`?ders=`, replace:true) · konu blokları + kazanım hücreleri (4-ton `--v1..v4`,
      "ölçüm yok" kesikli — null≠0) · hücre tıkla → sağda yapışkan seçili-kazanım paneli ·
      panelde tek birincil **"Bu kazanımdan ödev derle"** → `/sinif/odev?kazanim=&ders=`
      (mevcut derin-bağlantı sözleşmesi) — *uç sapmaları RAPOR/ENVANTER'de: granül ders→ünite;
      "ölçüm yok" hücresi uç veri vermediği için GİZLENDİ, uydurulmadı*
- [x] Dağılım bantları KELİMELİ (başlangıç/gelişiyor/oturuyor/güçlü) — asla yalnız renk;
      "en zayıf öğrenciler" satırından Röntgen'e geçiş (`/sinif/ogrenci/:id`) — *uç yalnız
      zayıf/toplam verdiği için 2 dürüst kelimeli bant; öğrenci kırılımı uçta YOK → satırlar
      gizlendi, BACKEND kartı önerildi (RAPOR)*
- [x] Veri yoksa dürüst boş durum ("Sınıf henüz ölçüm üretmedi…"); kısmî veri kısmî gösterilir
- [x] Hareket-azalt: hücre hover büyümesi + kart girişleri gateli; çip/tık hedefleri ≥44px
- [x] `tsc --noEmit` sıfır hata + `bun run build` yeşil → HAM çıktılar RAPOR'da; **$0**

## Kısıtlar / Kapsam Dışı
- Yeni backend ucu İSTENMEZ (eksik → RAPOR + kart önerisi). `components/ui.tsx`/`cekirdek.tsx`/
  `rontgen.tsx` dokunulmaz. `lib/types.teacher.ts` yalnız OKUNUR (tip ekleme gerekirse ekran-içi).

## Başlangıç Durumu
- Git rev: `5c2610e`; kirli ağaç (onaylı işler — kullanıcı commit'i bekleniyor). `SinifIsi.tsx`
  eski onaylı işlerle kirli olabilir — yalnız bu kartın işi eklenir. İlk adım: `git diff --stat`
  fotoğrafı RAPOR'a.

## Onay Kayıtları
- Paralı koşu: GEREKMEZ ($0).

## RAPOR

### Yapılan
`SinifIsi.tsx` sıfırdan FİDAN v1.2 inline desenle (`si-*` scoped `<style>` bloğu, tüm renkler
`index.css` CSS değişkenlerinden: `--cam/--cam-kenar/--v0..v4/--metin1..3/--cta/--vurgu/
--yaprak/--adacayi/--golge/--parilti/--font-*`) onaylı önizlemeye taşındı. MOCK YOK — iki
gerçek uç: `GET /teacher/sinif/isi-haritasi` (matris) + `GET /teacher/sinif/zayif-kazanimlar
?limit=100` (panel kazanım köprüsü). Ambiyans yaprakları ekranda kapalı (`.amb-yprk{display:none}`,
önizleme "sakin ambiyans" notu — Bahce kalıbıyla aynı).

- **Yerleşim:** önizlemenin 1.75fr/1fr ızgarası; ≤1020px'te panel matris altına iner, sticky
  kalkar. Panel sticky, `top: NAV_H+24` (grid item üzerinde — `align-self:start`).
- **Filtre/drill URL'de:** `?ders=` + `?unite=` (`useSorgu`, replace:true, varsayılan silinir).
  Harita TEK istekte filtresiz çekilir, ders süzgeci İSTEMCİDE: `subject` paramlı istek yalnız
  seçili dersin `subjects` listesini döndürdüğünden çipler kaybolurdu (eski ekranın davranış
  hatası); veri ölçeği küçük (~40 hücre).
- **Matris:** ders blokları (başlıkta ders ort. — görünen hücrelerin düz ortalaması, türetim;
  ölçüm uydurulmaz) → ünite hücreleri "%NN · M öğr." (asla yalnız renk). 4 ton skalası backend
  eşiğinden kurulur: `v1 = esik.zayif altı`, kalan aralık 3 eşit bant (esik TEK kaynak, tip
  yorumundaki talimat).
- **Panel:** başlık + ders çipi ("... · sınıf ort. %N · M öğrenci ölçüldü") · 2 kelimeli dağılım
  bandı (zayıf—eşik altı / eşik üstü; etiket+çubuk+adet) · "Sınıf zayıf listesinde bu üniteden
  kazanımlar" (zayıf ucunun ltree önek kesişimi; satırda kod · %yanlış · zayıf öğrenci ·
  havuzda N soru) · TEK birincil **"Bu kazanımdan ödev derle"** → `/sinif/odev?kazanim=&ders=`
  (OdevAtolyesi ön-dolgu sözleşmesi doğrulandı: `params.get('kazanim'/'ders')`).
  `havuzdaSoru.ai === 0` ise buton devre dışı + dürüst not (telif kararı: atölye yalnız AI havuzu).
  Üniteye düşen zayıf kazanım yoksa birincil buton YOK; soluk "Ödev Atölyesi'ni bu dersle aç"
  (`?ders=`) verilir.
- **Dürüstlük:** boş sınıf → "Sınıf henüz ölçüm üretmedi." + "sahte hücre çizilmez"; ders süzgeci
  boş dönerse ders-adlı dürüst boş durum; matris dipnotu "çürüme uygulanmış · N öğrenci · zayıf
  eşiği %E". null≠0 her dalda korunur.
- **Erişilebilirlik/hareket:** tüm tık hedefleri `min-height:44px` (çip/hücre/kazanım satırı/CTA);
  hücre+CTA hover kalkışları `@media (prefers-reduced-motion: no-preference)` gateli; kart
  girişleri `Reveal` (useReducedMotion'lı, gecikmeler ≤0.1s); hücre `aria-pressed`+`aria-label`,
  dağılım çubuğu `role="img"` + sözel etiket; odak halkası global `:focus-visible`.
- **Bütçeler:** 2 bulanık yüzey (matris+panel kartı) ≤3 · 1 ışıltı (CTA hover `--parilti`) ·
  canlı nokta 0 (StatusLine bilinçli kullanılmadı — bütçeyi profil menüsü harcadı).

### ENVANTER — uç yanıtı ↔ önizleme parçaları (ilk iş)
`IsiHaritasiYaniti` (panel.ts:76 / types.teacher.ts): `cells[]{subject, unitPath(ltree İLK 2
seviye, ör. "matematik.g11"), unitTitle|null, avgMastery, studentCount, weakStudentCount,
nodeCount, attempts}, subjects[], ogrenciSayisi, esik{zayif}, olcumZamani`.
`SinifZayifYaniti` (panel.ts:101): `kazanimlar[]{kazanimId, code, title, subject, path(TAM
kazanım yolu), avgWrongRate, studentCount, weakStudentCount, attempts, havuzdaSoru{osym,ai}},
esik, olcumZamani`.

| Önizleme parçası | Uç karşılıyor mu | Karar |
|---|---|---|
| Ders filtre çipleri | EVET (`subjects`) | URL `?ders=`, istemci süzgeci |
| Konu blokları → kazanım hücreleri | KISMEN — granül ders→ÜNİTE (RPC ltree ilk 2 seviye; konu/kazanım hücresi yok) | Blok=ders, hücre=ünite; metinler "ünite" der, "kazanım" DEMEZ |
| İki katmanlı ortalama | KISMEN | Blok başlığı ders ort. (hücrelerden türetim), hücrede ünite ort.+öğr. sayısı |
| "Ölçüm yok" kesikli hücre | HAYIR — RPC `p_min_attempts` eleğiyle YALNIZ ölçülen satırları döndürür; ölçümsüz ünite listesi yanıtsız | GİZLENDİ (lejant ögesi dahil) + BACKEND kartı önerisi |
| Seçili panel başlık/çip/ort/öğr | EVET (hücre alanları) | Uygulandı |
| 4'lü dağılım bandı (çok zayıf/gelişiyor/orta/güçlü) | HAYIR — yalnız `weakStudentCount`/`studentCount` | 2 dürüst kelimeli bant (eşik backend'den); 4 bant için BACKEND kartı önerisi |
| "En çok zorlanan N öğrenci" + Röntgen köprüsü | HAYIR — hiçbir uç ünite/kazanım başına öğrenci kırılımı vermiyor | GİZLENDİ + BACKEND kartı önerisi |
| "Bu kazanımdan ödev derle" (`?kazanim=` kazanimId ister) | KISMEN — ünite hücresi kazanimId taşımaz; kazanimId YALNIZ zayıf ucunda | Panelde zayıf ucunun ünite kesişimi listelenir, seçili satır butonu besler |
| "Karşılaştırma'da bu kazanımı aç" | HAYIR — `Karsilastir.tsx` yalnız `?ogrenci=` okur | GİZLENDİ + öneri (ayrı FRONTEND işi olur, kart ORKESTRATÖR'ün) |
| Boş durum | EVET | Uygulandı |

### Değişen dosyalar (`git diff --stat`)
```
 frontend-v2/src/screens/sinif/SinifIsi.tsx | 565 +++++++++++++++++++++++------
 1 file changed, 458 insertions(+), 107 deletions(-)
```
(+ bu kart dosyası — durum/RAPOR/Günlük). Başlangıç fotoğrafı: ağaç kartta beklendiği gibi
kirliydi (önceki onaylı işler, 62 dosya, kullanıcı commit'i bekliyor); `SinifIsi.tsx` dışına
dokunulmadı, beyan dışı kirli dosyalar olduğu gibi bırakıldı.

### Koşulan kapılar + HAM çıktılar
`cd frontend-v2 && ../learnup-brain/node_modules/.bin/tsc --noEmit -p tsconfig.json`
```
(çıktı boş — sıfır hata)
TSC_EXIT=0
```
`bun run build` (son satırlar):
```
dist/assets/SinifIsi-CbihiDo6.js                       15.30 kB │ gzip:   4.71 kB │ map:    34.94 kB
...
dist/assets/vendor-three-DaXCIwPp.js                  897.24 kB │ gzip: 238.76 kB │ map: 3,902.72 kB
✓ built in 1.35s
(!) Some chunks are larger than 500 kB after minification. ... (mevcut uyarı, bu karttan bağımsız)
BUILD_EXIT=0
```

### Gerçekleşen maliyet
**$0** — paralı LLM koşusu yok.

### Açık riskler
- `unitTitle` null ise hücrede ham `unitPath` görünür ("matematik.g11") — backend'in dürüst
  sözleşmesi (uydurma başlık yok); curriculum_nodes eşleşmesi tamamlandıkça kendiliğinden düzelir.
- Zayıf-kazanım ucu en fazla 100 satır döndürür; kalabalık sınıfta bir ünitenin kesişimi
  eksik kalabilir (liste zaten "sınıfın en zayıfları" — panel başlığı bunu aynen söylüyor).
- Ders ort. blok başlığında görünen hücrelerin DÜZ ortalaması (öğrenci-ağırlıklı değil) —
  eski ekranın "Sınıf Ortalaması" kutusuyla aynı türetim; istenirse backend'e taşınmalı.
- Panel içi kazanım seçimi URL'e yazılmıyor (geçici state kararı — `?ders`/`?unite` URL'de).

### Sonraki adım önerisi (BACKEND kartları — ORKESTRATÖR açar)
1. **Isı haritasına ölçümsüz üniteler:** `sinif_isi_haritasi` RPC'si (ya da yanıt) müfredattaki
   ölçümsüz üniteleri `avgMastery: null` ile döndürsün → "ölçüm yok" kesikli hücre + lejant
   ögesi ancak o zaman dürüstçe çizilebilir (null≠0).
2. **Ünite/kazanım başına öğrenci dağılımı:** seçili ünite için 4 kelimeli bant histogramı +
   "en çok zorlanan N öğrenci" (studentId+ad+oran) veren uç → panelin Röntgen köprüsü ve 4'lü
   bantları açılır.
3. (Küçük, FRONTEND) `Karsilastir`'a `?kazanim=` derin-bağlantısı eklenirse paneldeki
   "Karşılaştırma'da aç" köprüsü de açılabilir.

## Günlük
- 2026-07-23 · ORKESTRATÖR · kart açıldı (önizleme onayı 2026-07-23; 036/037 ile dosya kesişimi YOK — paralel; YENİ frontend ajanına atandı)
- 2026-07-23 · FRONTEND · alindi
- 2026-07-23 · FRONTEND · tamamlandi (envanter + FİDAN si-* taşıma; tsc 0 hata, build yeşil, $0; eksik-veri parçaları gizlendi, 2 BACKEND kartı önerildi)
- 2026-07-23 · ORKESTRATÖR · onaylandi + arşiv. Denetim kanıtı: iki GERÇEK uç (/teacher/sinif/isi-haritasi + /zayif-kazanimlar); mock yok. Envanter dürüstlüğü ÖRNEK: uç karşılamayan parçalar UYDURULMADAN gizlenmiş — matris granülü ders→ünite (RPC ltree 2 seviye), "ölçüm yok" hücresi çizilemedi (RPC yalnız ölçülen satır), 4'lü bant yerine 2 dürüst bant, "en zorlanan öğrenciler" + "Karşılaştırmada aç" yok (uç/sözleşme yok). URL ?ders=&unite= replace:true; havuzda AI soru yoksa "ödev derle" dürüstçe kapalı; ≥44px; RM gateli. tsc 0 + build yeşil; $0; yalnız SinifIsi.tsx. 2 BACKEND + 1 FRONTEND önerisi backlog'a (öğrenci-kırılımı ucu; konu→kazanım granülü; Karşılaştırma çoklu-seçim köprüsü).
