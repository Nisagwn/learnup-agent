---
gorev: GOREV-044-sifir-soruluk-odev-durustlugu
kimden: ORKESTRATÖR
kime: FRONTEND
durum: onaylandi
oncelik: P1
bagimlilik: []
dokunulan-dosyalar:
  - frontend-v2/src/screens/Odevler.tsx
migration-gerekli: hayir
---

## Amaç
Telif temizliğinden (GOREV-029) **0 soruya düşen ödev kaplarının** öğrenci tarafındaki dürüstlük
açığını kapatmak: sıfır-soru bir ödev artık ne listede çözülebilirmiş gibi görünecek ne de
açılınca boş/ölü bir ekrana düşürecek — açıkça "şu an soru yok" diyecek.

## Bağlam
- **KÖK NEDEN (bizim işimizin sonucu):** GOREV-029, çıkmış-kaynaklı 34 kopyayı ödevlerden söktü;
  11 kap (6 sınıf ödevi + 5 hedefli set, hepsi Matematik) **0 soruya** düştü (silinmedi —
  `question_ids` çözüldü, `verified=false`). Bu kaplar hâlâ öğrencinin panosunda.
- **Backend `soruSayisi` CANLI ve DOĞRU:** `learnup-brain/src/routes/assignments.routes.ts`
  (GET `/assignments`) her satırda `Array.isArray(a.question_ids) ? a.question_ids.length : 0`
  hesaplıyor (satır ~96 sınıf, ~107 hedefli). Yani 0-soruluk kap `soruSayisi: 0` döner — bayat
  önbellek yok. **Backend değişikliği İSTENMEZ; bu kart saf frontend.**
- **Mevcut açık (frontend-v2/src/screens/Odevler.tsx):**
  1. Liste: `soruSayisi === 0` bir bekleyen ödev "0 soru" alt bilgisiyle çizilir ve yine **"Çöz"
     butonu** sunar — çözülemez bir kabı çözülebilirmiş gibi gösterir.
  2. `OdevCoz`: "Çöz"e basılınca `/questions` boş `qs` döner; `qs.length === 0` iken gönderim
     şeridi (`{!inceleme && qs.length > 0 && …}`) hiç çizilmez, soru listesi de boştur → başlıkta
     "SORU 0/0" ile **açıklamasız boş, çıkışı belirsiz ekran** (ölü uç).
- Anayasa: **null ≠ 0** (YKS-BEYIN-SISTEM-MIMARISI §dürüstlük). FİDAN §9.7 boş-durum: koyu buton yok,
  samimi metin. `BosDurum`/`OlcumYok` felsefesi (asla 0 çizme) burada da geçerli.
- Ekranda zaten dürüst boş-durum deseni var (Odevler.tsx `bos` dalı: 🌱 + "Henüz ödevin yok").

## Kabul Kriterleri
- [ ] **Liste — sıfır-soru kabı çözülebilir gösterilmez:** `soruSayisi === 0` olan bekleyen sınıf
      ödevi VE hedefli set için birincil "Çöz/Çözmeye başla" eylemi SUNULMAZ (buton yok ya da
      `disabled` + görünür gerekçe). Yerine dürüst bir rozet/not: örn. "şu an soru yok" (kelimeli,
      salt renk değil — §14). Kap yine listede görünür (gizlenmez — öğrenci varlığını bilmeli),
      ama yanıltıcı eylem yok.
- [ ] **`birincil` seçimi sıfır-soru kabını atlar:** en acil "Çözmeye başla" hedefi seçilirken
      `soruSayisi === 0` kaplar aday DEĞİL (aksi halde birincil eylem çözülemez ödeve giderdi).
      Hiç çözülebilir bekleyen yoksa birincil = null.
- [ ] **`OdevCoz` boş-durum:** sorular yüklendikten sonra (`!loading && !error`) `qs.length === 0`
      iken ölü ekran yerine dürüst boş-durum: kısa açıklama ("Bu ödevde şu an soru yok — öğretmenin
      güncelleyecek" gibi) + "Panoya dön" butonu. Gönderim şeridi/onay modalı bu durumda çıkmaz.
- [ ] **Davranış AYNEN korunur (soru VARSA):** tek-gönderim + Radix onay + cevapsız yükleme +
      otoriter skor akışı hiç değişmez; yalnız `qs.length === 0` yolu eklenir.
- [ ] **null ≠ 0:** `soruSayisi` yalnızca kaynaktan; hiçbir yerde eksik veri 0'a çevrilmez, uydurma
      soru/rozet yok. `bos` (hiç ödev yok) dalı bozulmaz.
- [ ] `cd frontend-v2 && ../learnup-brain/node_modules/.bin/tsc --noEmit -p tsconfig.json` sıfır
      hata + `bun run build` yeşil → HAM çıktılar RAPOR'a. **$0.**

## Kısıtlar / Kapsam Dışı
- **Yalnız `frontend-v2/src/screens/Odevler.tsx`** (tek dosya). Veri wiring (`apiGet('/assignments')`,
  `/questions`, submit uçları) DEĞİŞMEZ.
- `components/ui.tsx` / `cekirdek.tsx` / `fx.tsx` DOKUNULMAZ (yalnız import).
- **Backend/migration İSTENMEZ** — `soruSayisi` canlı doğru. Kapları silme/geri-doldurma bu kartın
  işi DEĞİL (içerik hattı ayrı iş).
- **Öğretmen tarafı (OdevAtolyesi) bu kartta YOK** — öğretmene "bu set boş" uyarısı ayrı bir
  fırsat kartı (RAPOR'un sonraki-adım'ına yaz). Bu kart akut öğrenci ölü-ucunu kapatır.
- Yeni endpoint/istek eklenmez; mevcut yanıt alanlarıyla çözülür.

## Başlangıç Durumu
- Git rev: `5c2610e`. Çalışma ağacı **çok kirli** — tüm FİDAN dalgası + telif + eval + öğretmen
  kaydı + tek-frontend işleri commit'lenmemiş durumda (kullanıcı commit'leyecek). Bu kart yalnız
  `Odevler.tsx`'e dokunur; o dosya GOREV-022 (FİDAN taşıma) onaylı işiyle zaten kirli — **onun
  yapısını koru**, üstüne 0-soru yolunu ekle. İlk adım: `git diff --stat -- frontend-v2/src/screens/Odevler.tsx`
  çıktısını RAPOR'a; beyan dışı hiçbir kirli dosyaya dokunma, `git checkout --` YASAK.

## Onay Kayıtları
- Paralı koşu: GEREKMEZ ($0).

## RAPOR
<!-- YALNIZ FRONTEND ajanı doldurur. -->
### Yapılan
Tek dosya (`frontend-v2/src/screens/Odevler.tsx`) — `soruSayisi === 0` kaplarının öğrenci
dürüstlük açığı kapatıldı; veri wiring, submit uçları, tek-gönderim + Radix onay + otoriter skor
akışı AYNEN. `soruSayisi` yalnız kaynaktan (types: `number`, non-null); eksik veri 0'a çevrilmedi,
`bos` (hiç ödev yok) dalı bozulmadı.
- **`birincil` seçimi çözülebilir-önce:** `bekleyen.find(a => a.soruSayisi > 0)` → yoksa
  `bekleyenHedefli.find(t => t.soruSayisi > 0)` → yoksa `null`. Böylece en acil "Çözmeye başla"
  hedefi asla 0-soruluk kaba gitmez. (eski hâl: koşulsuz `bekleyen[0]`.)
- **Liste — sınıf ödevi satırı (`bekleyen.map`):** `soruYok = a.soruSayisi === 0` iken "Çöz/Çözmeye
  başla" butonu SUNULMAZ (yerine kelimeli not `öğretmenin güncelleyecek`), aciliyet çerçevesi
  (`acil/gecti`) ve aciliyet rozeti bastırılır; rozet = `⏳ şu an soru yok` (kelime + ikon, §14).
  Kap listede GÖRÜNÜR kalır; `alt` satırı hâlâ dürüst "0 soru" gösterir. `acil/gecti` hesabı
  eskisi gibi `kalan`'a referans kalır (TS aliased-condition narrowing korunur; `sayacMetni(kalan)`
  tip hatası vermez).
- **Liste — hedefli set satırı (`bekleyenHedefli.map`):** aynı `soruYok` deseni; rozet
  `sana özel` → `⏳ şu an soru yok`, buton → not. `🎯` + kesikli çerçeve (sana-özel işareti) kalır.
- **`OdevCoz` boş-durum:** `!loading && !error && qs.length === 0` için ölü ekran yerine dürüst
  boş-durum kartı (🌱 + "Bu ödevde şu an soru yok" + "Panona dönebilirsin" + "Panoya dön" butonu,
  `onKapat(false)` — submit olmadığı için reload yok). Gönderim şeridi ve Radix onay modalı zaten
  `!inceleme && qs.length > 0` ile kapalı olduğundan bu yolda ÇIKMAZ (dokunulmadı).
- **Stil:** `OdevStil` içinde iki kural eklendi — `.od-rozet.bos` (`var(--v1)`/`var(--metin2)`,
  notr ile aynı sakin ton) ve `.od-notyok` (`var(--metin3)`, sağa yaslı kelimeli not). Yeni sabit
  renk gömülmedi; yalnız var olan FİDAN token'ları. `ui.tsx/cekirdek.tsx/fx.tsx` YALNIZ import.

### Değişen dosyalar
- `frontend-v2/src/screens/Odevler.tsx` (tek kod dosyası; beyanla eşleşir)
- `docs/agents/handoff/GOREV-044-sifir-soruluk-odev-durustlugu.md` (durum + Günlük + bu RAPOR)

`git diff --stat -- frontend-v2/src/screens/Odevler.tsx`:
- İlk adımda (değişiklikten ÖNCE, GOREV-022 kirli tabanı): `503 insertions(+), 149 deletions(-)`
- Bu kart sonrası: `540 insertions(+), 149 deletions(-)` (bu kartın net katkısı ~37 satır)

### Koşulan kapılar + çıktıları
```
$ cd frontend-v2 && ../learnup-brain/node_modules/.bin/tsc --noEmit -p tsconfig.json; echo "TSC_EXIT=$?"
TSC_EXIT=0
```
```
$ cd frontend-v2 && bun run build; echo "BUILD_EXIT=$?"
$ vite build
vite v8.1.4 building client environment for production...
 WARN  advancedChunks option is deprecated, please use codeSplitting instead.
transforming...✓ 1921 modules transformed.
...
dist/assets/Odevler-Cb7YBj5Y.js                        23.27 kB │ gzip:   6.71 kB │ map:    49.32 kB
...
✓ built in 1.56s
(!) Some chunks are larger than 500 kB after minification. Consider: ...
BUILD_EXIT=0
```
Not: `advancedChunks deprecated` ve `chunk > 500kB` uyarıları ÖNCEDEN vardı (vite config +
three/katex/charts vendor'ları); bu kartla ilgisiz. `Odevler` chunk'ı temiz derlendi.

### Gerçekleşen maliyet
$0 — LLM koşusu yok, saf frontend.

### Açık riskler
- **İçerik boşluğu kök nedende duruyor:** 11 kap (6 sınıf + 5 hedefli, Matematik) hâlâ 0 soru.
  Bu kart yalnız ÖĞRENCİ ölü-ucunu dürüstçe kapatır; kapları geri-doldurma/silme içerik hattının
  ayrı işi (kapsam dışı, bilinçli).
- **Öğretmen tarafı (OdevAtolyesi) uyarısız:** öğretmen hâlâ boş bir set gönderdiğini/oluştuğunu
  panelinde görmüyor — aşağıdaki sonraki-adım.
- **Bilgi şeridi (`aktifVar`):** yalnızca 0-soruluk kaplar bekliyorsa "tek gönderim" bilgi şeridi
  hâlâ çizilir (genel mekanik açıklaması, yanıltıcı değil; kapsam dışı bırakıldı). İstenirse ayrı
  minik iyileştirme.

### Sonraki adım önerisi
- **FRONTEND kartı — OdevAtolyesi (öğretmen) 0-soru uyarısı:** öğretmene "bu set boş / 0 soru"
  kelimeli uyarısı + yayın/gönderim yolunda dürüst engel/işaret (`frontend-v2/src/screens/sinif/
  OdevAtolyesi.tsx`). Bu kart akut öğrenci ölü-ucunu kapattı; öğretmen görünürlüğü hâlâ açık.
- **İçerik hattı (BACKEND/veri):** 0-soruya düşen 11 kabın geri-doldurulması veya arşivlenmesi
  ayrı iş — telif-güvenli RAG havuzundan yeniden ilişkilendirme ya da kapların pasifleştirilmesi.

## Günlük
- 2026-07-23 · ORKESTRATÖR · kart açıldı (beklemede; GOREV-045 ile paralel — kesişen dosya yok)
- 2026-07-23 · ORKESTRATÖR · iptal → arşiv. GEREKÇE: kullanıcı "görsel olarak karışma şimdilik, ilerde görsellik için detaylı bir iş yapacağız" dedi. Bu kart görünür UI (boş-durum metni + buton gizleme) ekliyor → görsel dalgaya devrolur. **NOT: altta yatan 0-soruluk ölü-uç GERÇEK BİR İŞLEVSEL DÜRÜSTLÜK HATASI (kozmetik değil)** — görsel turda ÖNCELİKLE ele alınmalı; analiz bu kartta korunuyor. Backend `soruSayisi` canlı doğru olduğundan düzeltme saf frontend.
- 2026-07-23 · ORKESTRATÖR · yeniden açıldı (iptal → beklemede). GEREKÇE: kullanıcı görsel yasağından vazgeçti ("vazgeçtim yap") → görsel iş onaylandı; kart FRONTEND'e fırlatılıyor.
- 2026-07-23 · FRONTEND · alindi
- 2026-07-23 · FRONTEND · tamamlandi (Odevler.tsx: 0-soruluk kaplar liste + çözüm ekranında dürüst; birincil eylem çözülemez kabı atlar; boş-durum kartı; tsc/build yeşil, $0)
- 2026-07-23 · ORKESTRATÖR · onaylandi + arşiv. Bağımsız denetim: (1) liste — `soruYok` (soruSayisi===0) satırında "Çöz" butonu YOK, yerine `od-notyok` "öğretmenin güncelleyecek" notu + `od-rozet.bos` "şu an soru yok"; aciliyet çerçevesi de temizleniyor (cerceve undefined); hem sınıf ödevi hem hedefli set kapsandı. (2) `birincil` = `bekleyen.find(soruSayisi>0)` / `bekleyenHedefli.find(soruSayisi>0)` → 0-soru kaplar aday değil, hiç çözülebilir yoksa null. (3) OdevCoz `qs.length===0` dalı loading/error'dan SONRA (satır 489) — 🌱 + "Bu ödevde şu an soru yok" + "Panoya dön" (onKapat(false)); gönderim şeridi/modal `qs.length>0` ile kapalı kalıyor. (4) soru-var akışı else dalında AYNEN (tek-gönderim + Radix onay değişmedi). (5) null≠0: soruSayisi yalnız kaynaktan, `bos` dalı sağlam; yeni stiller (od-rozet.bos/od-notyok) FİDAN değişkenli. Yalnız Odevler.tsx (M). KONSOLİDE KAPI (044+045 birlikte): TSC=0, BUILD=0 (Odevler chunk 23.27kB temiz, 1921 modül, hata yok). $0.
