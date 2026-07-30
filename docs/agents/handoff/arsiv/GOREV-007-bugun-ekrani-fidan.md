---
gorev: GOREV-007-bugun-ekrani-fidan
kimden: ORKESTRATÖR
kime: FRONTEND
durum: onaylandi
oncelik: P1
bagimlilik: [GOREV-006]   # tema temelleri (v1.2 token katmanları) inmeden ekran işi başlamaz
dokunulan-dosyalar:
  - frontend-v2/src/screens/Bugun.tsx
  - frontend-v2/src/components/ui.tsx
  - frontend-v2/src/components/cekirdek.tsx
  - frontend-v2/src/components/fx.tsx
  - frontend-v2/src/components/Ambiyans.tsx
  - frontend-v2/src/components/PlanYolu.tsx      # YENİ — plan yol görünümü
  - frontend-v2/src/components/OdakZamanlayici.tsx  # YENİ — frontend-only pomodoro
  - frontend-v2/index.html                          # yalnız theme-color 2-hex düzeltmesi
migration-gerekli: hayir
---

## Amaç
Bugün ekranını **kullanıcı onaylı v4 önizlemesiyle** birebir hizalamak:
`docs/design/onizleme/bugun.html` (2026-07-22 onayı — kaynak referans BUDUR).

## Bağlam
- Tasarım kuralları: `docs/design/TASARIM-DILI.md` v1.2 (cam kart, tek birincil eylem, yol
  görünümü animasyonları §5.8-9). İçerik sözleşmesi: `docs/design/EKRAN-HARITASI.md` §2.
- Veri kaynakları (hepsi MEVCUT): KPI + hedef → mevcut Bugün verileri; plan blokları → plan/rota
  verisi (yol durumları tamamlandı/aktif/bekliyor plan verisinden TÜRETİLİR); Bugünün Tekrarı →
  `practice /review` ucu (SRS vadesi); lig → gamification league; ödev → assignments (yalnız
  `teacher_id`'li kullanıcıda render). Odak Zamanlayıcısı frontend-only (localStorage seans sayacı).

## Kabul Kriterleri
- [~] Görünüm iki temada da v4 önizlemeyle eşleşir: selam+çipler · 4 KPI (sayaç animasyonu) ·
      hedef HALKASI hero (gradyan, dolum, TEK birincil "Soru Çöz") · **Plan YOL görünümü** ·
      tek-renk 4-ton ustalık şeridi + "ölçüm yok" · Bugünün Tekrarı · Odak Zamanlayıcısı · lig mini
      — **UYGULANDI; iki istisna RAPOR'da:** ödev hatırlatması (assignments ucu yok → atlandı) ve
      lig ilerleme çubuğu (rank/eşik verisi yok → tier+XP gösterildi). Plan "tamam ✓" durağı blok
      verisi olmadığından yok (aktif+bekle+hedef).
- [x] Ambiyans: süzülen yapraklar (masaüstü ≥900px, `@media` motion-safe) + güneş lekeleri
      (`YakamozBackdrop`→Işık Huzmesi); `Ambiyans`/`fx` FİDAN'a çevrildi (tsparticles söküldü)
- [x] Kart giriş stagger'ı ≤0.3s (`Reveal`); hover yükselmesi; `prefers-reduced-motion`'da statik
- [x] null≠0: plan yoksa "Plan, soru havuzu dolunca belirir"; tekrar/lig/hata yoksa panel gizlenir;
      accuracy verisi yoksa "—"; sayı uydurulmadı
- [x] `useAsync` deps ilkel (`[]`); API yalnız `lib/api.js`; iskelet yeni yerleşimle hizalı
- [x] `index.html` theme-color + FOUC zemin hex'leri v1.2'ye çekildi: `#F4F8F5→#F4F7F4`, `#0B120D→#0C120E`
- [x] `tsc --noEmit` sıfır hata + `bun run build` yeşil → çıktılar RAPOR'da (TSC_EXIT=0, BUILD_EXIT=0)

## Kısıtlar / Kapsam Dışı
- Diğer ekranlara dokunulmaz; rozet ikon seti ve 3D sahneler bu kartta değişmez.
- Yeni veri kütüphanesi eklenmez; yeni backend ucu istenmez (eksik veri → boş durum + RAPOR notu).
- Sayfada `orman/700` dolgulu TEK buton: "Soru Çöz".

## Başlangıç Durumu
- Git rev: `5c2610e` (branch: `feat/yks-brain`); kirli ağaç 52 kayıt — GOREV-002/004/005/006'nın
  ONAYLI işleri + docs/ + önizlemeler (kullanıcı commit'i hâlâ bekleniyor). Beyandaki dosyalardan
  `Bugun.tsx`, `ui.tsx` (components), `cekirdek.tsx`, `fx.tsx`, `Ambiyans.tsx`, `index.html`
  kirli — yalnız bu kartın işi eklenir, mevcut onaylı değişiklikler korunur. İlk adım:
  `git diff --stat` fotoğrafı RAPOR'a.

## Onay Kayıtları
- Paralı koşu: GEREKMEZ ($0).

## RAPOR

### Yapılan
Bugün ekranı onaylı v4 önizleme `docs/design/onizleme/bugun.html` ile hizalandı. **Veri wiring
KORUNDU** (5 `useAsync`: `/gamification/daily`, `/practice/suggest`, `/questions/ai/topics`,
`/mastery/rontgen`, `/practice/review`) — yalnız sunum FİDAN'a taşındı.

- **`Bugun.tsx` (v4 yeniden yerleşim):** selam+ad başlık · **YKS'ye N gün** çipi (saf tarih hesabı) +
  seri çipinde sallanan mini fidan · **4 KPI** (`CanliSayi` sayaç animasyonu): Bugün Çözülen ·
  Doğruluk · Çalışma Süresi · Seri · **günlük hedef HERO** (adaçayı→yaprak gradyan halka, mount'ta
  0.9s dolar, **TEK birincil "Soru Çöz"** + opsiyonel "Yarım kalan teste devam") · **Plan YOL
  görünümü** (`PlanYolu`) · tek-renk 4-ton **ustalık ısı şeridi** (+ "ölçüm yok" hücresi) · Bugünün
  Tekrarı · **Odak Zamanlayıcısı** · Lig. Kartlar cam (`--cam`/blur16), stagger `Reveal` (≤0.3s),
  hover yükselmesi; tüm animasyonlar hareket-azalt uyumlu.
- **`PlanYolu.tsx` (YENİ):** yol görünümü — aktif durak nabız halkalı "Buradan devam", bekleyenler
  kesikli, yolun sonu günlük hedef bayrağı; mobilde dikey. Durum plan verisinden türetilir.
- **`OdakZamanlayici.tsx` (YENİ):** FRONTEND-ONLY 25 dk pomodoro (localStorage seans + süre sayacı);
  `bugunkuOdakDk()` "Çalışma Süresi" KPI'sını besler. Nabız noktası motion-safe.
- **`Ambiyans.tsx` → FİDAN:** tsparticles yakamoz partikülleri söküldü; yerine **süzülen 5 yaprak**
  (masaüstü ≥900px, `@media` motion-safe). tsparticles artık ambiyans chunk'ında yok (1.44kB).
- **`fx.tsx` `YakamozBackdrop` → Işık Huzmesi:** sky/cyan bloblar → **bal/toprak + adaçayı** sıcak
  ışık lekeleri (fonksiyon adı App.tsx importu için korundu).
- **`index.html`:** theme-color + FOUC zemin hex'leri **`#F4F8F5→#F4F7F4`, `#0B120D→#0C120E`** (v1.2
  zemin gradyan başı; §11 bayat değer düzeltmesi).

### Değişen dosyalar
```
 frontend-v2/index.html                  |  14 +-      (theme-color 2 hex)
 frontend-v2/src/components/Ambiyans.tsx |  84 +-      (tsparticles → yaprak)
 frontend-v2/src/components/fx.tsx       |  15 +-      (YakamozBackdrop FİDAN)
 frontend-v2/src/screens/Bugun.tsx       | 672 +-      (v4 yeniden yerleşim)
?? frontend-v2/src/components/PlanYolu.tsx         (YENİ)
?? frontend-v2/src/components/OdakZamanlayici.tsx  (YENİ)
```
**Beyanda olup DOKUNULMAYAN:** `components/ui.tsx` ve `components/cekirdek.tsx` — Bugün'ü paylaşılan
bileşenleri (GlowButton/SectionLabel/Halka) COASTAL renkleriyle çağırmak yerine **inline FİDAN
stilleriyle** kurdum; böylece diğer ekranları (aynı bileşenleri kullanan) etkilemeden Bugün
FİDAN oldu. `cekirdek`'ten yalnız `CanliSayi` (değişmeden) kullanıldı. git diff bu ikisini içermez
(beyanın alt kümesi — beyan dışı dosya yok).

### Koşulan kapılar + çıktıları
- **`tsc --noEmit` → SIFIR HATA ✓** `TSC_EXIT=0`
- **`bun run build` → BAŞARILI ✓** `BUILD_EXIT=0` · `✓ built in 1.52s`
  ```
  dist/assets/Bugun-DWu6yPQo.js       23.77 kB │ gzip: 7.09 kB
  dist/assets/Ambiyans-BfFCpkbk.js     1.44 kB │ gzip: 0.72 kB   (tsparticles düştü)
  ```
  (">500kB" three.js uyarısı — hata değil; GOREV-005'te belgelendi.)

### Gerçekleşen maliyet
**$0** — yalnız kod + tsc/build.

### Açık riskler (eksik veri → boş durum + not; Kısıtlar gereği yeni uç istenmedi)
1. **Ödev hatırlatması ATLANDI:** önizlemedeki "Ödevin var" kartı `assignments` ucu gerektirir; mevcut
   Bugün wiring'inde yok ve endpoint'i güvenle varsayamadım → **render edilmedi** (eksik veri → boş).
   Ayrı wiring: `teacher_id`'li öğrencide `/assignments/...` → sonraki adım.
2. **Lig kartı sadeleşti:** backend `league` yalnız `tier` + `weeklyXP` veriyor; önizlemenin
   "Sıralaman 4/30 · 120 XP kaldı" **rank + yükselme-eşiği verisi YOK** → tier adı + haftalık XP
   gösterildi ("canlı" rozetiyle). Rank/eşik gelirse ilerleme çubuğu eklenir (BACKEND).
3. **Plan "tamamlandı" durağı yok:** blok-düzey tamamlanma verisi yok (odak=`/practice/suggest`
   tekil öneri, `/rota` blok-durumu bu ekranda çekilmiyor) → yol **aktif + bekleyen + hedef**
   gösteriyor; "tamam ✓" durağı için `/rota` blok durumu gerek (null≠0: sahte tamamlanma yok).
4. **KPI trend okları (▲) atlandı:** gün-gün delta kaynağı yok → sayı uydurulmadı.
5. **"Çalışma Süresi" KPI'sı Odak Zamanlayıcısı localStorage'ından** (frontend seans süresi); soru
   çözerken geçen süreyi İÇERMEZ (backend süre takibi yok). Odak kullanılmadıysa 0 dk (ölçülmüş 0).
6. **BİLİNEN GEÇİCİ DURUM:** `Ambiyans`/`YakamozBackdrop` shell seviyesinde → FİDAN ambiyans TÜM
   ekranlarda görünür (istenen), ama diğer ekranların KART içerikleri hâlâ COASTAL utility.
   `fx.tsx` `GlowBorder`/`BreathingGlow` hâlâ sky (ajan ikonları — Koç/Bahçem kartlarında dönecek).
7. Ders çip renkleri `ui.tsx SUBJECTS`'ten (tek renk, iki temada okunur) — TASARIM §2 açık/koyu ders
   tablosuyla birebir değil; ders-renk temizliği ayrı iş.

### Sonraki adım önerisi
- **BACKEND:** lig rank/yükselme-eşiği verisi (lig kartı ilerleme çubuğu için); istenirse günlük
  çözüm/çalışma-süresi tarihçesi (KPI trend okları için).
- **FRONTEND:** ödev hatırlatması wiring'i (assignments); plan "tamam" durağı için `/rota` blok
  durumu; diğer P0/P1 ekran kartları (Analizler, Çöz, Çalışma Planı…) utility→FİDAN.
- Ölü görsel dosyalar (`Lighthouse`/`Login3D`) + `fx` GlowBorder/BreathingGlow FİDAN'a (temizlik).

## Günlük
- 2026-07-22 · ORKESTRATÖR · kart açıldı (beklemede; GOREV-006 onayını bekler; referans = onaylı v4 önizleme)
- 2026-07-22 · ORKESTRATÖR · SERBEST: GOREV-006 onaylandı+arşivlendi. Beyana index.html eklendi (theme-color v1.2 düzeltmesi), Başlangıç Durumu dolduruldu. Kart başlatılabilir.
- 2026-07-22 · FRONTEND · alindi
- 2026-07-22 · FRONTEND · tamamlandi (Bugun v4 yeniden yerleşim + PlanYolu/OdakZamanlayici yeni + Ambiyans/fx FİDAN + index.html theme-color v1.2; veri wiring korundu; tsc SIFIR + build YEŞİL. Ödev/lig-rank/plan-tamam eksik veri → boş durum + not; ui.tsx/cekirdek.tsx beyanda ama dokunulmadı [inline FİDAN, diğer ekranlar kırılmasın].)
- 2026-07-22 · ORKESTRATÖR · onaylandi → arsiv/ (BAĞIMSIZ DENETİM: kendi oturumumda TSC_EXIT=0 + BUILD_EXIT=0; Bugun chunk 23.77kB raporla birebir; tsparticles kodda SIFIR [yalnız App.tsx:27 bayat yorum — QA/temizlik notu]; index.html theme-color hex'leri v1.2 doğrulandı; git status beyanla uyumlu, ui.tsx/cekirdek.tsx alt-küme sapması KABUL [gerekçe sağlam: diğer ekranlar kırılmasın]. Dürüst devirler kabul: ödev wiring'i → Ödevler ekran kartına, lig rank/eşik + KPI trend → BACKEND backlog, plan "tamam ✓" durağı → GOREV-013 bağlamına not. Mock taraması spot-temiz; tam tarama GOREV-012 QA'da. 4 onay ölçütü sağlandı.)
