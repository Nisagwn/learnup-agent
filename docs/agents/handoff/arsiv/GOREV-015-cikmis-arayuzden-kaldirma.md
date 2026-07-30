---
gorev: GOREV-015-cikmis-arayuzden-kaldirma
kimden: ORKESTRATÖR
kime: FRONTEND
durum: onaylandi
oncelik: P0   # telif riski — hukuki maruziyeti kapatan iş her ekran işinden önceliklidir
bagimlilik: []   # tema bağımsız — BAŞLATILABİLİR
dokunulan-dosyalar:
  - frontend-v2/src/App.tsx                        # /arsiv rotası kalkar
  - frontend-v2/src/lib/nav.ts                     # nav girdisi kalkar (öğrenci 6 sekme)
  - frontend-v2/src/components/CommandPalette.tsx  # ⌘K girdisi kalkar (varsa)
migration-gerekli: hayir
---

## Amaç
**2026-07-22 telif kararı ("3. yol"):** ÖSYM çıkmış soruları kullanıcı arayüzünde YAYINLANMAZ.
Öğrenci yüzündeki TÜM giriş noktaları (nav, rota, ⌘K, ekran köprüleri) kaldırılır.

## Bağlam
- Karar kaydı: `EKRAN-HARITASI.md` §7 + `YKS-BEYIN-SISTEM-MIMARISI.md` §1/§14 + `TASARIM-DILI.md`
  (kehribar RAFTA) — hepsi güncellendi; çelişki görürsen hiyerarşi MİMARİ > VERDENT > dokümanlar.
- `Arsiv.tsx` ve ilgili görsel bileşenler **SİLİNMEZ** — kullanım kalkar (Login3D emsali; ÖSYM
  lisansı alınırsa raftan iner). Sunucu uçlarının kapatılması GOREV-016 (BACKEND, bu karta bağımlı).
- `Coz.tsx`'teki ÖSYM görünümü (GOREV-008'de inşa edildi) ÖLÜ KOD olarak kalır — bu kart Coz.tsx'e
  DOKUNMAZ; giriş noktaları kalkınca `kaynak==='osym'` yolu tetiklenemez olur.

## Kabul Kriterleri
- [x] **Envanter:** `arsiv`/`osym`/çıkmış giriş noktaları grep ile çıkarılır (rota tanımı, nav
      girdisi, ⌘K komutu, ekran köprüleri — ör. başka ekrandan `/arsiv`e veya `source:'osym'`la
      `/coz`a götüren her link) ve **TÜMÜ kaldırılır**; envanter listesi RAPOR'a
- [x] `/arsiv` rotası kalkar → adres çubuğundan gidilirse NotFound; öğrenci nav'ı **6 sekme**
- [x] `Arsiv.tsx` (+yalnız onun kullandığı görseller) dosya olarak KORUNUR, hiçbir import kalmaz;
      build çıktısında **Arsiv chunk'ı üretilmez** (lazy import kalktığı için) — build listesiyle kanıtlanır
- [x] Öğrenciye görünen hiçbir metinde "Çıkmış Sorular / ÖSYM sorusu" vaadi kalmaz (grep kanıtı)
- [x] `tsc --noEmit` sıfır hata + `bun run build` yeşil → çıktılar RAPOR'da

## Kısıtlar / Kapsam Dışı
- `Coz.tsx` dokunulmaz (ölü ÖSYM yolu bilinçli kalır); `Arsiv.tsx` içeriği değiştirilmez (yalnız
  kullanım kalkar). Backend uçları GOREV-016'nın işi.
- DB/RAG/scriptlere dokunulmaz — çıkmışlar üretim hattının kaynağı olarak YAŞAMAYA DEVAM EDER.

## Başlangıç Durumu
- Git rev: `5c2610e` (branch `feat/yks-brain`); kirli ağaç ~57 kayıt — onaylı işler (kullanıcı
  commit'i hâlâ bekleniyor). `App.tsx`/`nav.ts`/`CommandPalette.tsx` GOREV-002'den kirli — yalnız
  bu kartın işi eklenir. İlk adım: `git diff --stat` fotoğrafı RAPOR'a.

## Onay Kayıtları
- Paralı koşu: GEREKMEZ ($0).

## RAPOR
### Yapılan
**2026-07-22 telif kararı ("3. yol"):** ÖSYM çıkmış soruları kullanıcı arayüzünde YAYINLANMAZ. Öğrenci-yüzü
TÜM giriş noktaları kaldırıldı (envanter-önce; frontend.md-16). `Arsiv.tsx` + `Coz.tsx` ÖSYM yolu DOSYA olarak
korundu (Login3D emsali — lisans gelirse raftan iner); yalnız KULLANIM kalktı.

**Envanter (grep `arsiv|osym|Çıkmış` → frontend-v2/src) — kaldırılan öğrenci giriş noktaları:**

| # | Yer | Ne | Eylem |
|---|---|---|---|
| 1 | `App.tsx:35` | `const Arsiv = lazy(import('./screens/Arsiv'))` | SÖKÜLDÜ (chunk üretilmesin) |
| 2 | `App.tsx:84` | `<Route path="arsiv" element={<Arsiv/>} />` | SÖKÜLDÜ (→ NotFound) |
| 3 | `nav.ts:21` | `NAV_OGRENCI` `{ /arsiv, 'Çıkmış Sorular' }` | SÖKÜLDÜ (öğrenci **7→6 sekme**) |
| 4 | `nav.ts:70` | `BASLIKLAR` `'/arsiv': 'Çıkmış Sorular'` | SÖKÜLDÜ (sekme başlığı eşlemesi) |
| 5 | `nav.ts:13-14` | Bayat yorum ("Çıkmış Sorular yalnız çıkmışları listeler…") | GÜNCELLENDİ (telif notu) |
| 6 | `CommandPalette.tsx:22` | `SAYFALAR` ⌘K `{ /arsiv, 'Çıkmış Sorular' }` | SÖKÜLDÜ |

**Ekstra düzeltme (aynı beyanlı dosya — regresyon önleme):** `App.tsx` Ödevler sekmesi `taban.slice(0,6)/slice(6)`
ile ekleniyordu; indeks 7-sekmelik navı varsayıyordu → taban 6'ya inince Ödevler Profil'in ARDINA kayardı.
`slice(0,-1)/slice(-1)` (Profil hep son) ile **uzunluktan bağımsız** hâle getirildi → Ödevler yine Profil'den önce.

**Ekran köprüsü taraması:** öğrenci ekranlarında (Bugün/Plan/Analiz/Profil/Bahçem/Koç) `/arsiv` veya
`source:'osym'` köprüsü YOK. `source:'osym'` üreten tek yer `Arsiv.tsx:85-87,160` (artık erişilemez).

### KAPSAM DIŞI bırakılanlar (bilinçli — gerekçeli)
- **`Coz.tsx` DOKUNULMADI** (kart kısıtı): osym render yolu + `cikis()`'teki `nav('/arsiv')` (Coz.tsx:231) ÖLÜ KOD
  olarak kalır — hiçbir giriş `source:'osym'`i tetikleyemez. `Coz.tsx:19` "çıkmış sorular" bir KOD YORUMU (görünmez).
- **`Arsiv.tsx` DOSYA KORUNDU** (kart kısıtı): satır 101/175 "Çıkmış Sorular" metni artık render EDİLMEZ (rota/import
  yok) — grep'te görünür ama öğrenciye ulaşmaz.
- **Admin/öğretmen ÖSYM referansları KALDI** (öğrenci giriş noktası DEĞİL + beyan dışı): `kule/SoruHavuzu`+`Kule`
  (havuz hacmi — üretim şeffaflığı), `sinif/OdevAtolyesi` (öğretmen kaynak filtresi 'osym'), `rontgen.tsx`
  (AI↔ÖSYM kalibrasyon grafiği — "çıkmış soru vaadi" değil, AI kalite göstergesi).

### Değişen dosyalar (beyanla birebir — 3 kod dosyası)
```
 frontend-v2/src/App.tsx                       | 19 +++++-------
 frontend-v2/src/components/CommandPalette.tsx |  3 +--
 frontend-v2/src/lib/nav.ts                    | 17 +++++-------
 3 dosya · +19 −20
```
Not: `git status` frontend-v2'de ~35 kirli kayıt gösterir — TAMAMI önceki ONAYLI kartların işi (002–012;
kullanıcı commit'i bekleniyor — kartın Başlangıç Durumu'nda belirtilmiş). BU kartın diff'i yalnız yukarıdaki
**3 dosyada**; beyan dışı hiçbir dosyaya dokunulmadı.

### Koşulan kapılar + çıktıları
- **`../learnup-brain/node_modules/.bin/tsc --noEmit -p tsconfig.json` → SIFIR HATA ✓** `TSC_EXIT=0`
- **`bun run build` → BAŞARILI ✓** `BUILD_EXIT=0` · `✓ built in 1.53s`
- **Arsiv chunk KANITI (kriter #3):** build çıktısında `grep -i arsiv` → **eşleşme YOK** → `Arsiv-*.js` chunk'ı
  ÜRETİLMEDİ (lazy import kalktı; dosya korundu ama ağaçta ölü → rolldown dahil etmez). ✓
- **Kriter #4 grep kanıtı:** `to: '/arsiv' | label/ad: 'Çıkmış' | '/arsiv':` → **0 eşleşme** (tüm nav/⌘K/başlık
  girdisi gitti). Kalan "Çıkmış Sorular" yalnız Arsiv.tsx (erişilemez) + Coz.tsx:19 (kod yorumu).

### Gerçekleşen maliyet
**$0** — yalnız kod + tsc/build.

### Açık riskler
1. **Öğretmen ÖSYM ataması (öğrenci dolaylı maruziyeti):** `sinif/OdevAtolyesi.tsx` öğretmenin `kaynak:'osym'`
   soruları ödev olarak göndermesine izin veriyor → öğrenci `/odevler`de çıkmış ÖSYM görebilir. Bu kartın beyanı
   dışı (öğretmen yüzeyi). **Telif kapanışı için ayrı kart gerekir** (aşağıda).
2. **Coz.tsx ölü `nav('/arsiv')`:** osym yolu tetiklenemez; tetiklense /arsiv NotFound'a giderdi — pratikte
   erişilemez, kart Coz.tsx'e dokunmayı yasaklıyor. GOREV-016 sonrası temizlikte sadeleşir.
3. **Arsiv.tsx COASTAL:** raf dosyası; FİDAN'a taşınmadı (kullanım yok). Lisans gelirse raftan inerken FİDAN kartı açılır.

### Sonraki adım önerisi
- **GOREV-016 (BACKEND, bu karta bağlı):** `/questions/osym*` sunucu uçlarının kapatılması (arayüz artık çağırmıyor
  ama uç açık kalırsa doğrudan istek riski sürer).
- **Öğretmen ÖSYM ataması kartı (FRONTEND+BACKEND):** telif kapanışı için `OdevAtolyesi` kaynak seçeneğinden 'osym'
  kaldırılmalı + backend ödev derlemesinde osym kaynağı reddedilmeli (Risk #1).
- (Temizlik) GOREV-016 sonrası Coz.tsx ölü osym yolu + Arsiv.tsx raf durumu gözden geçirilebilir.

## Günlük
- 2026-07-22 · ORKESTRATÖR · kart açıldı (BAŞLATILABİLİR — P0 telif kararı; aktif kartlarla [009/011/012/013/014] dosya kesişimi YOK, paralel çalışabilir)
- 2026-07-22 · FRONTEND · alindi
- 2026-07-22 · FRONTEND · tamamlandi (öğrenci-yüzü çıkmış/ÖSYM giriş noktaları söküldü: App.tsx lazy import+rota · nav.ts girdi+başlık+yorum [öğrenci 7→6 sekme] · CommandPalette ⌘K girdisi + Ödevler nav-sıra düzeltmesi. Arsiv.tsx/Coz.tsx DOKUNULMADI [ölü/raf]. tsc SIFIR + build YEŞİL, **Arsiv chunk üretilmedi**. Açık risk: öğretmen OdevAtolyesi 'osym' ataması [ayrı kart] + GOREV-016 sunucu ucu.)
- 2026-07-22 · ORKESTRATÖR · onaylandi → arsiv/ (BAĞIMSIZ DENETİM: kendi oturumumda TSC_EXIT=0 + build YEŞİL; build çıktısında Arsiv chunk YOK [grep kanıtı]; kaynak grep'i beyanla birebir — kalan /arsiv referansları yalnız ölü Arsiv.tsx + Coz.tsx ölü yolu + admin kod yorumu. Ödevler nav-sıra düzeltmesi [slice(0,-1)] beyanlı dosyada isabetli regresyon önlemi — kabul. AKSİYONLAR: Açık risk #1 [öğretmen osym ataması] → GOREV-025 açıldı [UI tarafı, P0]; sunucu tarafı GOREV-016'da zaten kriter. GOREV-016 + GOREV-018 SERBEST bırakıldı. 4 onay ölçütü sağlandı.)
