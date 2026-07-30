---
gorev: GOREV-002-arayuz-metin-donusumu
kimden: ORKESTRATÖR
kime: FRONTEND
durum: onaylandi
oncelik: P1
bagimlilik: []          # GOREV-001 onaylandı ve arşivde — envanter girdi olarak hazır
dokunulan-dosyalar:
  - frontend-v2/src/lib/nav.ts
  - frontend-v2/src/App.tsx
  - frontend-v2/src/screens/kule/Kule.tsx
  - frontend-v2/src/screens/Ben.tsx
  - frontend-v2/src/components/CommandPalette.tsx
  - frontend-v2/src/components/RolGecidi.tsx
  - frontend-v2/src/components/ErrorBoundary.tsx
  - frontend-v2/src/screens/NotFound.tsx
  - frontend-v2/src/screens/Login.tsx
  - frontend-v2/src/screens/Bugun.tsx
  - frontend-v2/src/screens/Kaptan.tsx
  - frontend-v2/src/components/Onboarding.tsx
  - frontend-v2/src/screens/Harita.tsx
  - frontend-v2/src/screens/Coz.tsx
  - frontend-v2/src/screens/Rota.tsx
  - frontend-v2/src/screens/Arsiv.tsx
  - frontend-v2/src/lib/format.ts
  - docs/design/TASARIM-DILI.md
migration-gerekli: hayir
---

## Amaç
GOREV-001 envanterinin A bölümündeki 41 kullanıcı-görünür denizcilik/metafor metnini düz işlevsel
FİDAN diline dönüştürmek (salt metin — görsel/rozet dönüşümü bu kartın DIŞINDA).

## Bağlam
- **Girdi:** `docs/agents/handoff/arsiv/GOREV-001-arayuz-metin-envanteri.md` — A bölümü tablosu
  (A1–A41, dosya-satır konumlu, önerilen metinlerle) + B bölümü (Pusula) + E bölümü (kapsam dışı).
- `docs/design/TASARIM-DILI.md` §6 (metin tablosu) + §9.
- **ORKESTRATÖR kararları (GOREV-001 Günlük, 2026-07-21):**
  1. **Pusula → Seçenek B (nötrle):** Rota.tsx'teki tüm "Pusula" persona geçişleri işlevsel plan
     diline döner (B tablosundaki Seçenek B sütunu). Backend iç adı (`/agents/pusula` ucu,
     charter) DOKUNULMAZ — yalnız görünür metin.
  2. **Röntgen ayrımı:** öğrenci tarafı (A25, A36, A38–A41) Analiz diline geçer; öğretmen yüzeyi
     ("Öğrenci Röntgeni" nav/başlık + `OgrenciRontgeni.tsx` metinleri) AYNEN KALIR — dokunma.
  3. Rozet/rütbe adları (C bölümü) bu kartta DEĞİŞMEZ — kullanıcı onayı sonrası ayrı kart çifti.

## Kabul Kriterleri
- [x] A1–A41 satırlarının tamamı uygulandı (önerilen metinler; A1/A38 "Analizler" birleştirildi, +1 envanter-dışı deyim yakalandı — RAPOR'da not)
- [x] B tablosu Seçenek B ile uygulandı (Rota.tsx 7 geçiş + :335 "tam yol ileri" idiomu)
- [x] `OgrenciRontgeni.tsx` ve `rozetler.ts`/RUTBE dizisi DEĞİŞMEDİ (git diff --stat'ta yok — doğrulandı)
- [x] Düşük öncelikli tutarlılıklar uygulandı: A5 ("Analiz"→"Analizler" nav), Arsiv.tsx:175
      ("Arşiv yüklenemedi"→"Çıkmış sorular yüklenemedi")
- [x] `format.ts` içindeki çağrılmayan `vardiya()` ölü kodu kaldırıldı (E bölümü temizlik önerisi)
- [x] `docs/design/TASARIM-DILI.md` §6 tablosuna iki satır eklendi: "Pusula (görünür) → plan dili
      (nötr)" ve "Öğrenci Röntgeni (öğretmen) → kalır" gerekçe notuyla — doküman kodla senkron
- [x] `cd frontend-v2 && ../learnup-brain/node_modules/.bin/tsc --noEmit -p tsconfig.json` SIFIR hata → çıktı RAPOR'da (TSC_EXIT=0)
- [ ] ⛔ `bun run build` başarılı → **BLOKE:** oturum-öncesi + bölge-dışı `vite.config.js` `manualChunks`
      Object→Function bug'ı (vite v8/rolldown). Metin değişikliğiyle İLGİSİZ — 2160 modül derlendi, tsc
      yeşil. `vite.config.js` yazma-bölgem + kart beyanı DIŞINDA → §5 gereği düzeltilemedi. Ayrı config
      kartı önerildi (RAPOR "Sonraki adım"). ORKESTRATÖR kararı gerek.

## Kısıtlar / Kapsam Dışı
- Görsel sahneler (D bölümü: Login3D, Lighthouse, YakamozBackdrop, VoyageStreak…) bu kartta DEĞİŞMEZ.
- Rozet/rütbe adları (C) ve kod-içi adlar/route'lar/tipler (E) DEĞİŞMEZ.
- Tema/renk katmanına dokunulmaz — bu kart yalnız METİN.
- Oturum-öncesi kirli dosyalara (Başlangıç Durumu listesi) beyan dışında dokunulmaz; `App.tsx`,
  `Ben.tsx` vb. zaten kirli — yalnız envanterdeki satırlar değiştirilir, mevcut değişiklikler korunur.

## Başlangıç Durumu
- Git rev: `5c2610e` (branch: `feat/yks-brain`) — GOREV-001 ile aynı; kullanıcı henüz commit atmadı.
- Kirli ağaç: 30 kayıt (GOREV-001 Başlangıç Durumu'ndaki listeyle aynı + büyüyen `docs/`).
  Bu kartın beyanındaki 17 kaynak dosyadan bazıları (App.tsx, sinif.tsx vb.) zaten kirli —
  yalnız envanter satırları değiştirilir. Ajanın ilk adımı: `git diff --stat` alıp mevcut
  değişikliklerin fotoğrafını RAPOR'a not etmek.

## Onay Kayıtları
- Paralı koşu: GEREKMEZ ($0 — yalnız düzenleme + tsc/build).

## RAPOR

### Yapılan
GOREV-001 envanterinin **A1–A41** kullanıcı-görünür geçişi + **B tablosu (Seçenek B)** + düşük
öncelikli tutarlılıklar + `vardiya()` ölü kod temizliği + TASARIM-DILI §6 doküman senkronu
uygulandı. Salt metin — tema/renk/görsel katmanına dokunulmadı.

**Uygulama notları (kart "daha iyi Türkçe bulursan not düş" izniyle):**
1. **Analiz/Analizler birleştirildi:** A1 ve A38'de "Analiz" yerine **"Analizler"** kullanıldı; böylece
   ekran adı her yüzeyde tutarlı (nav sekmesi A5 + sayfa başlığı A1 + ekran H1 A38 = "Analizler",
   §6 kanonik çoğul). Cümle içi feature adı ("Analiz'de…", "Analize git", Onboarding) tekil kaldı —
   doğal TR kullanımı (nav "Ayarlar" / cümlede "ayar" gibi).
2. **A28 "Fener" butonu → "Kutlama"** (streak kutlama ekranını açan buton; nötr işlevsel ad).
3. **B tablosu:** 7 satır + 1 ek. Rota.tsx'te Pusula persona metinleri "Plan/Planlayıcı" diline
   nötrlendi; backend `/agents/pusula` ucu, `pusulaOzeti` değişkeni, `<Captain/>` bileşeni ve
   `icon="compass"` DOKUNULMADI (kod/görsel — kapsam dışı).
4. **⚠️ Envanter DIŞI 1 bulgu düzeltildi:** [Rota.tsx:335](../../../frontend-v2/src/screens/Rota.tsx#L335)
   `"…tam yol ileri!"` — denizcilik deyimi (full speed ahead), GOREV-001 A-tablosunun **kaçırdığı**
   bir geçiş. Kullanıcının "gemicilik temasından vazgeçtik" hatırlatması doğrultusunda `"…böyle
   devam!"` yapıldı. (Envanter tam değilmiş — aşağıda "Açık riskler"e not düşüldü.)

**Satır-satır eşleme (A#/B → dosya):**
- A1–A5 → [nav.ts](../../../frontend-v2/src/lib/nav.ts) (label 'Analizler', 'Yönetim'; başlıklar 'Analizler', 'Yönetim — Sistem Sağlığı', 'Özgünlük Denetimi')
- A6 → Kule.tsx (`ad="Yönetim"`) · A7,A8,A11 → App.tsx (title 'YKS Hazırlık', tema tooltip 'Koyu/Açık tema', fallback 'Öğrenci')
- A9,A26,A27,A28,A29,A30,A31,A11 → Ben.tsx (tema etiketi, avatar 'panoda', 'Günlük Seri', 'Kutlama', 'Sonraki hedefe', 'gün sürdü', 'Serin hiç kırılmadı.', 'Öğrenci')
- A10 → CommandPalette.tsx · A12 → RolGecidi.tsx ('Bu sayfaya erişimin yok') · A13,A14 → ErrorBoundary.tsx
- A15,A16,A17 → NotFound.tsx · A18 → Login.tsx ('Giriş yap'/'Hesap oluştur')
- A11,A19–A25 → Bugun.tsx · A32,A33 → Kaptan.tsx ('ben Koç', 'Verilerine bakıyor')
- A34–A37 → Onboarding.tsx · A38,A39,A40 → Harita.tsx · A41 → Coz.tsx ('Analizin hazır')
- B (7+1) → Rota.tsx · A5-tutarlılık → nav.ts · Arsiv:175 → Arsiv.tsx ('Çıkmış sorular yüklenemedi')
- vardiya() → format.ts (silindi) · §6 iki satır → TASARIM-DILI.md

**Doğrulama:** Düzenleme sonrası `frontend-v2/src/**/*.tsx` üzerinde denizcilik terim taraması
yapıldı — **kalan HİÇBİR geçiş kullanıcı-görünür metin değil**; hepsi (a) kod adları (`YakamozBackdrop`,
`VoyageStreak`, `Fener`/`setFener`/`onFener` bileşen/değişken adları), (b) yorum satırları, ya da
(c) D-bölümü görsel bileşenleri (Login3D, Lighthouse, Ambiyans, BantDalgalar, SisliDeniz). Üçü de bu
kartın kapsamı dışında.

### Değişen dosyalar
17 kaynak dosya + `docs/design/TASARIM-DILI.md` (beyanla birebir). `git diff --stat`:
```
 frontend-v2/src/App.tsx                       | 17 +++++++-------  (A7,A8,A11)
 frontend-v2/src/components/CommandPalette.tsx |  2 +-             (A10)
 frontend-v2/src/components/ErrorBoundary.tsx  |  4 ++--           (A13,A14)
 frontend-v2/src/components/Onboarding.tsx     |  8 ++++----       (A34–A37)
 frontend-v2/src/components/RolGecidi.tsx      |  2 +-             (A12)
 frontend-v2/src/lib/format.ts                 |  5 -----         (vardiya() silindi)
 frontend-v2/src/lib/nav.ts                    | 10 +++++-----     (A1–A5)
 frontend-v2/src/screens/Arsiv.tsx             |  2 +-             (:175)
 frontend-v2/src/screens/Ben.tsx               | 16 ++++++--------  (A9,A11,A26–A31)
 frontend-v2/src/screens/Bugun.tsx             | 16 ++++++--------  (A11,A19–A25)
 frontend-v2/src/screens/Coz.tsx               |  2 +-             (A41)
 frontend-v2/src/screens/Harita.tsx            |  8 ++++----       (A38–A40)
 frontend-v2/src/screens/Kaptan.tsx            |  4 ++--           (A32,A33)
 frontend-v2/src/screens/Login.tsx             |  2 +-             (A18)
 frontend-v2/src/screens/NotFound.tsx          |  7 +++----        (A15–A17)
 frontend-v2/src/screens/Rota.tsx              | 20 +++++++--------  (B + :335 idiom)
 frontend-v2/src/screens/kule/Kule.tsx         |  2 +-             (A6)
 17 files changed, 62 insertions(+), 65 deletions(-)
```
`docs/design/TASARIM-DILI.md` `docs/` (izlenmeyen) altında olduğundan diff --stat'ta görünmez; §6
tablosuna 2 satır eklendi. **Beyan dışı hiçbir dosyaya dokunulmadı** — oturum-öncesi kirli dosyalar
(MathMarkdown, api.js, auth.tsx, latex.*, sinif.tsx, useAsync.ts, main.tsx, **vite.config.js**) ve
learnup-brain/** aynen korundu (§5: restore/checkout yasağına uyuldu).

### Koşulan kapılar + çıktıları
**1) `tsc --noEmit -p tsconfig.json` → SIFIR HATA ✓**
```
TSC_EXIT=0
```

**2) `bun run build` → BAŞARISIZ — ANCAK oturum-öncesi + bölge-dışı config hatası (metin değişikliğiyle İLGİSİZ):**
```
vite v8.1.4 building client environment for production...
Warning: Invalid output options — "manualChunks". Invalid type: Expected Function but received Object.
transforming...✓ 2160 modules transformed.       ← TÜM modüller (düzenlediklerim dahil) derlendi
✗ Build failed in 1.58s
error during build: TypeError: manualChunks is not a function
    at .../rolldown/.../rolldown-build-*.mjs
BUILD_EXIT=1
```
**Kanıt — bu benim işim DEĞİL, oturum-öncesi bir config bug'ı:**
- `git show HEAD:frontend-v2/vite.config.js | grep manualChunks` → **BOŞ** (commit'te manualChunks yok).
- `git diff --stat frontend-v2/vite.config.js` → `14 insertions` (izlenmeyen/**oturum-öncesi** ekleme,
  Başlangıç Durumu kirli ağacının parçası). Bu ekleme `manualChunks`'ı **Object** olarak tanımlıyor;
  vite v8/rolldown ise **Function** bekliyor → build config aşamasında patlıyor.
- Build **"2160 modules transformed ✓"** dedikten SONRA yalnız chunking config'inde düştü → kaynak
  modüllerim (metin düzenlemeleri) sorunsuz derlendi; hata izole olarak `vite.config.js`'te.
- `vite.config.js` **benim yazma-bölgemin DIŞINDA** (`frontend-v2/src/**` değil, repo-kökü config) ve
  **kartın `dokunulan-dosyalar` beyanında yok** ve **oturum-öncesi kirli** → §5 + frontend.md gereği
  **düzeltmem yasak.** Bu kartta build yeşile çekilemez.

### Gerçekleşen maliyet
**$0** — yalnız Edit/Grep/Read + tsc/build. Paralı LLM çağrısı yok.

### Açık riskler
1. **⛔ Build kapısı BLOKE (kabul kriteri #8 karşılanamadı):** oturum-öncesi + bölge-dışı
   `vite.config.js` `manualChunks` Object→Function hatası. Metin dönüşümüyle ilgisiz; tsc yeşil,
   2160 modül derlendi. **Ayrı config kartı gerekiyor** (aşağıda öneri). Bu kart onaya çıkmadan önce
   ORKESTRATÖR kararı gerek: (a) config kartını açıp build'i yeşilletmek, veya (b) salt-metin kart
   için tsc-yeşil'i yeterli saymak.
2. **Envanter (GOREV-001 A-tablosu) tam değilmiş:** en az 1 kullanıcı-görünür deyim ("tam yol ileri!")
   A-listesinde yoktu; bu kartta yakalanıp düzeltildi. Başka kaçmış mikrometin olabilir — tarama
   `.tsx` metin düğümlerini kapsadı, ama dinamik/şablon string'lerde nadir bir geçiş kalmış olabilir.
3. **Metin↔görsel uyumsuzluğu (D-bölümü, bilinçli ertelendi):** metin nötrlendi ama görsel sahneler
   hâlâ denizcilik — VoyageStreak (gemi + deniz feneri SVG), DenizSahnesi/Login3D, SisliDeniz (404),
   YakamozBackdrop, Lighthouse. "Metin plan/seri diyor, görselde gemi yüzüyor" geçici tutarsızlığı.
4. **İkonlar hâlâ denizcilik çağrışımlı:** nav `anchor` (Koç, Yönetim), `route` (Plan), `waves`
   (Sınıf/Kullanıcılar), `compass` (Rota boş durum + eski 404 butonu). İkon = görsel katman; bu kart
   yalnız metin. Ayrı gözden geçirme.
5. **"Öğrenci Röntgeni" bilinçli kaldı** (§6 ayrımı, ORKESTRATÖR kararı): öğretmen yüzeyi "röntgen"
   der, öğrenci yüzeyi "Analiz". Kasıtlı terminoloji farkı — kullanıcıya iki ayrı bağlam.

### Sonraki adım önerisi
- **🔧 FRONTEND config kartı (ACİL — build'i açar):** `frontend-v2/vite.config.js` `manualChunks`
  Object → Function (rolldown/vite v8 uyumu) ya da `output.manualChunks` yerine `advancedChunks`.
  Küçük ama build'i tamamen bloke ediyor; benim yazma-bölgem (`src/**`) ve bu kartın beyanı DIŞINDA
  olduğu için burada yapılamadı. **Not:** bu düzeltilmeden GOREV-002 dahil hiçbir frontend kartı
  `bun run build` kapısını geçemez.
- **Görsel kartlar (D-bölümü):** Streak Fidanı (§5.3), Işık Huzmesi (§5.1), orman login/göl (§5.6),
  404 orman vinyeti — metin↔görsel uyumsuzluğunu kapatır.
- **İkon seti gözden geçirme:** anchor/route/waves/compass → doğa/işlevsel ikonlar.
- **Rozet/rütbe (C-bölümü):** zaten GOREV-003 (BACKEND) + GOREV-004 (FRONTEND ayna) çiftinde planlı —
  ORKESTRATÖR kararıyla düz işlevsel adlar ("7 Gün Seri", "100 Soru", "Seviye 8").

## Günlük
- 2026-07-21 · ORKESTRATÖR · kart açıldı (beklemede)
- 2026-07-21 · FRONTEND · alindi
- 2026-07-22 · FRONTEND · tamamlandi (A1–A41 + B Seçenek B + tutarlılıklar + vardiya() temizliği + TASARIM-DILI §6 senkronu; tsc SIFIR hata; build BLOKE — oturum-öncesi vite.config.js manualChunks bug'ı, bölge dışı, dokunulmadı; envanter-dışı "tam yol ileri!" de yakalandı)
- 2026-07-22 · ORKESTRATÖR · onaylandi. Bağımsız doğrulama: yasaklı dosyalar (rozetler.ts, OgrenciRontgeni.tsx) değişmemiş; değişen liste beyanla birebir; Grep'te kalan denizcilik geçişleri yalnız kod adı/yorum. Kriter #8 (build) FERAGAT-gerekçeli: engel oturum-öncesi, bölge-dışı vite.config.js bug'ı; tsc yeşil + "2160 modül derlendi" kanıtı bu kartın işini doğruluyor. Build yeşili GOREV-005'in (P0) kabul kriteridir — sahte yeşil gösterilmedi, doğru davranış.
- 2026-07-22 · ORKESTRATÖR · not: GOREV-005 onaylandı, build YEŞİL — feragat edilen #8 kriteri fiilen de sağlandı (bu kartın metin değişiklikleri dahil tam build geçiyor).
- 2026-07-21 · FRONTEND · tamamlandi (A1–A41 + B-Seçenek B + A5/Arsiv tutarlılık + vardiya() temizliği + §6 doküman senkronu; +1 envanter-dışı deyim "tam yol ileri"→"böyle devam". tsc SIFIR hata. **UYARI: `bun run build` BLOKE — oturum-öncesi + bölge-dışı vite.config.js manualChunks Object→Function bug'ı; metinle ilgisiz, 2160 modül derlendi. Kabul kriteri #8 bu kartta karşılanamaz → ayrı config kartı önerildi.**)
