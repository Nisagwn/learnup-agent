---
gorev: GOREV-008-soru-coz-ekrani-fidan
kimden: ORKESTRATÖR
kime: FRONTEND
durum: onaylandi
oncelik: P1
bagimlilik: [GOREV-006, GOREV-007]   # ikisi de ✅ — FİDAN deseni referansı (ui.tsx'e varyant İNMEDİ; inline desen)
dokunulan-dosyalar:
  - frontend-v2/src/screens/Coz.tsx
migration-gerekli: hayir
---

## Amaç
Soru Çöz odak modunu **kullanıcı onaylı önizlemeyle** hizalamak:
`docs/design/onizleme/soru-coz.html` (2026-07-22 onayı — kaynak referans BUDUR; üç görünüm:
pratik/ÖSYM/sonuç).

## Bağlam
- Tasarım: `docs/design/TASARIM-DILI.md` v1.2. İçerik: `EKRAN-HARITASI.md` §3.
- **DÜZELTME (007 denetimi):** ortak FİDAN varyantları `components/ui.tsx`'e İNMEDİ — 007, diğer
  ekranları kırmamak için görünümü ekran içinde inline FİDAN stiliyle kurdu (onaylı sapma). Bu kart
  AYNI deseni izler: Coz.tsx içinde inline FİDAN; `ui.tsx`'e yazılmaz. (COASTAL→FİDAN ortak bileşen
  konsolidasyonu, ekran kartları bitince ayrı temizlik kartında.)
- Mevcut davranış korunur: KaTeX render (`MathMarkdown`), cevap doğrulama SUNUCUDA, SSE yok.
- **DÜZELTME (006 denetimi):** "/coz her zaman koyu" zorlaması GOREV-006'da KALKMADI (Coz.tsx
  beyan dışıydı — dürüst devir). Kaldırma işi BU KARTIN kriteridir: Kabuk'taki `className="dark"`
  sarmalı + `bg-ocean-900` zorlaması sökülür, odak modu temayı izler (TASARIM-DILI §9.9).

## Kabul Kriterleri
- [x] **Koyu zorlaması kaldırıldı:** Kabuk'taki `className="dark"` + `bg-ocean-900` söküldü;
      odak modu uygulama temasını izliyor (iki temada da doğrulanır)
- [x] **Görünüm A (pratik):** üst ince cam şerit (✕ çık [onay diyaloğu] · SORU n/N + ilerleme
      çubuğu · süre) · kazanım çipi · şık durumları (nötr/hover/seçili/doğru/yanlış — kelime+renk)
      · anlık geri bildirimde yeşil onay mikro-animasyonu + "Neden?" açıklama kutusu (mevcut
      açıklama verisi; motive dil, teşhis dili YOK)
- [x] **Görünüm B (ÖSYM):** kehribar mühür + ince kehribar çerçeve (sayfadaki TEK kehribar);
      5 şık; test modunda geri bildirim sona kadar SESSİZ
- [~] **Görünüm C (sonuç):** dolarak canlanan skor halkası · yaprak-renkli konfeti
      (canvas-confetti renkleri v1.2: adaçayı/yaprak/toprak) · ödül çipleri (XP/coin/seri) ·
      kazanım dökümü rozetli; "tekrar önerilir" rozeti o kazanımdan pratiğe köprü (mevcut practice ucu)
- [~] Klavye kısayolları: A–E şık seçimi, Enter onay, ←→ gezinme (yalnız odak modunda; input odaklıyken devre dışı)
- [x] Ambiyans SAKİN: bu ekranda süzülen yaprak YOK (tek silik güneş lekesi serbest)
- [x] Görünüm başına TEK birincil buton (Sonraki / Cevapla / Analizin hazır)
- [x] Hareket-azalt: tüm animasyonlar kapanır; null≠0 ve iskelet disiplinleri korunur
- [x] `tsc --noEmit` sıfır hata + `bun run build` yeşil → çıktılar RAPOR'da

## Kısıtlar / Kapsam Dışı
- `components/ui.tsx`, `MathMarkdown.tsx`, backend uçları — dokunulmaz. Eksik veri (örn. süre
  modu ayarı) → boş durum/varsayılan + RAPOR notu; yeni uç istenmez.

## Başlangıç Durumu
- Git rev: `5c2610e` (branch `feat/yks-brain`); kirli ağaç ~57 kayıt — GOREV-002/004/005/006/007/010'un
  ONAYLI işleri + docs/önizlemeler (kullanıcı commit'i hâlâ bekleniyor). `Coz.tsx` GOREV-002'den
  kirli — yalnız bu kartın işi eklenir. İlk adım: `git diff --stat` fotoğrafı RAPOR'a.

## Onay Kayıtları
- Paralı koşu: GEREKMEZ ($0).

## RAPOR
### Yapılan
Soru Çöz odak modu onaylı önizleme `docs/design/onizleme/soru-coz.html` (2026-07-22) ile hizalandı;
**inline FİDAN** (007 deseni — `ui.tsx`'e İNMEDİ). Veri mantığı KORUNDU: KaTeX (`MathMarkdown`), **sunucu-otoriter
puanlama** (`/answers` havuzdan okur, LLM yok), SSE yok, localStorage "devam" kaydı.

- **Koyu zorlaması SÖKÜLDÜ (kriter #1):** `Kabuk`'taki `<div className="dark">` + `bg-ocean-900` kalktı; yeni
  Kabuk `.cz` sarmalı + `style={{ background:'var(--page-bg)' }}` → **odak modu uygulama temasını İZLER**
  (TASARIM-DILI §9.9). Grep ile doğrulandı: Coz.tsx'te `ocean/sky-/cyan/emerald/rose/brass/slate/amber/dark-sarmalı`
  **SIFIR** eşleşme.
- **Görünüm A (pratik):** üst ince cam şerit (`.cz-serit`) — ✕ (**Radix Dialog onayı**) · SORU n/N + ilerleme çubuğu ·
  süre · ses; kaynak çipi + ders çipi; şık durumları nötr/hover/seçili/doğru/yanlış = **kelime+renk** ("Doğru"/"Yanlış"
  etiketi + ikon); doğru şıkta `cz-onay` yeşil mikro-animasyon (motion-safe); **"Neden?" açıklama kutusu** (mevcut
  `soru.solution`; motive dil, teşhis yok — çözüm yoksa samimi tek cümle).
- **Görünüm B (ÖSYM):** `cz-muhur` kehribar mühür + `cz-osym` ince kehribar çerçeve = **sayfadaki TEK kehribar**;
  5 şık; **TEST modu — `kaynak==='osym'` → geri bildirim sona kadar SESSİZ** (ses yok, şık rengi yok, açıklama yok;
  "Cevapla" sessizce ilerler, sonuç özet ekranında).
- **Görünüm C (sonuç):** dolarak canlanan skor halkası (`adaçayı→yaprak`, ~1s; azalt'ta anında); **yaprak konfetisi
  canvas-confetti v1.2 renkleri** `['#84A98C','#4FA56F','#D4A373','#6FA57F']` (≥%70 + hareket-serbest); **ders dökümü
  rozetli** — GERÇEK oturum cevaplarından (uydurma yok); "tekrar önerilir" (uyarı) rozeti o dersten pratiğe köprü
  (`nav('/coz',{state:{source:'ai',subject}})` + `loc.key` remount).
- **Ambiyans SAKİN:** süzülen yaprak YOK; tek silik güneş lekesi (`.cz-gunes`). **Görünüm başına TEK birincil**
  (`.cz-btn.birincil`=orman/700): A="Kontrol Et", B="Cevapla", geri="Sonraki Soru/Bitir", C="Bugüne dön/Analizlere git".
- **Hareket-azalt:** tüm `.cz-*` @keyframes + ilerleme transition `@media (prefers-reduced-motion: no-preference)`
  altında; framer (soru geçişi `AnimatePresence`, XP çipi, ipucu) `useReducedMotion` ile kapılı; halka transition
  `azalt ? 'none' : …`; konfeti azalt'ta atlanır. İskelet (`Spinner`) + null≠0 korundu.
- **COASTAL bileşen bağımlılığı kalktı:** `GlowButton/Chip/Badge` (ui.tsx) + `Halka` (cekirdek) importları söküldü —
  inline FİDAN. `Icon` (salt SVG) + `MathMarkdown` (KaTeX) korundu.

### Değişen dosyalar (beyanla birebir)
```
 frontend-v2/src/screens/Coz.tsx | 705 +++++-----   (1 dosya · +457 −248)
```
Beyan = yalnız `Coz.tsx`; `git status --short -- Coz.tsx` yalnız `M frontend-v2/src/screens/Coz.tsx` (kod tarafında beyan dışı dosya yok).

### Koşulan kapılar + çıktıları
- **`../learnup-brain/node_modules/.bin/tsc --noEmit -p tsconfig.json` → SIFIR HATA ✓** `TSC_EXIT=0`
- **`bun run build` → BAŞARILI ✓** `BUILD_EXIT=0` · `✓ built in 1.63s`
  - `Coz-DX9GUUGP.js  28.92 kB │ gzip 8.35 kB` · `confetti.module-… 10.62 kB` (dinamik import — ana bundle'a girmez)
  - **three izolasyonu:** `vendor-three` (900kB) YALNIZ `Bahce`/`Bahce3D` chunk'larında; Coz onu ÇEKMEZ (yalnız
    radix-dialog + framer + katex — hepsi mevcut vendor/index chunk'larında). Chunk-boyut uyarısı yalnız önceden
    var olan vendor'lar (three/katex/charts) için — bu kartla değişmedi.

### Gerçekleşen maliyet
**$0** — yalnız kod + tsc/build.

### Açık riskler / dürüst devirler (null≠0)
1. **Ödül çipleri yalnız XP (kriter #4 → [~]):** `/answers` yanıtı yalnız `xpGained` veriyor — **coin + seri deltası
   YOK** → uydurulmadı (null≠0); yalnız GERÇEK XP çipi gösterildi. Önizlemedeki "🪙 +15 coin / 🌱 Seri 13" temsilîydi.
   coin/seri için `/answers` yanıtına alan gerekir (BACKEND kartı).
2. **Döküm ders-düzeyi (kazanım-adı değil):** `HavuzSoru`'da kazanım BAŞLIĞI yok (`kazanim_id` numara, `topic` çoğu
   soruda null) → döküm `soru.subject` bazında GERÇEK toplanıyor. Kazanım-adı-düzeyi döküm için havuz sorusuna kazanım
   başlığı alanı gerekir. Köprü de derse pratik açar (mevcut `/questions/ai`).
3. **Klavye ← inert (kriter #5 → [~]):** A–E ✓, Enter ✓, → ✓ (ilerlet); **← bilinçli devre dışı** — doğrusal set
   akışında geri-düzenleme (cevaplanmış soruyu değiştirme) veri modelinde yok; yarım "geri" yerine inert + input-odak guard'ı eklendi.
4. **Çıkış onayı hep sorar:** ✕ her zaman Radix onay diyaloğu açar (soru 1'de de) — önizleme deseni; güvenli
   (yıkıcı eylem = Dialog, `window.confirm` değil — frontend.md-6).
5. **`--kehribar` bileşen-içi scoped:** global @theme'de `--kehribar` yoktu (ÖSYM için `brass-*` Tailwind renkleri
   vardı). Önizlemeye sadık kalmak için `.cz`/`.dark .cz`'de tema-duyarlı tanımladım (`#B8863B`/`#D9B267`). Kalıcı
   çözüm: `index.css`'e `--kehribar` inmesi — bu kart index.css/ui.tsx'e YAZMAZ (ayrı tema-token kartı).

### Sonraki adım önerisi
- **BACKEND:** `/answers` yanıtına `coinGained` + `streakAfter` → sonuç ekranı coin/seri çiplerini GERÇEK gösterir.
- Havuz sorusuna kazanım başlığı alanı → kazanım-düzeyi döküm + isabetli "tekrar önerilir" köprüsü.
- (Temizlik) `--kehribar` token'ının index.css'e inmesi; `Login3D`/`Lighthouse` ölü dosyaları; ui.tsx/cekirdek
  COASTAL→FİDAN konsolidasyonu (ekran kartları bitince).
- **QA notu (GOREV-012 turundan):** favicon çapası + App marka çapası + App.tsx:27 bayat tsparticles yorumu hâlâ
  COASTAL → App/kabuk FİDAN kartı gerekli (bu kartın kapsamı dışı; Coz.tsx odak modu kendi kabuğunu taşır, App shell'i etkilemez).

## Günlük
- 2026-07-22 · ORKESTRATÖR · kart açıldı (beklemede; 006+007 onayını bekler; referans = onaylı soru-coz önizlemesi)
- 2026-07-22 · ORKESTRATÖR · SERBEST: GOREV-007 onaylandı+arşivlendi; Başlangıç Durumu dolduruldu; Bağlam ui.tsx düzeltmesiyle güncellendi. Kart başlatılabilir (009/011/013 ile dosya kesişimi YOK — paralel).
- 2026-07-22 · FRONTEND · alindi
- 2026-07-22 · ORKESTRATÖR · KAPSAM DEĞİŞİKLİĞİ: kullanıcı telif kararı ("3. yol") — Görünüm B (ÖSYM) kriteri İPTAL, kehribar bu ekranda kullanılmaz; kalan kriterler aynen geçerli. Detay: EKRAN-HARITASI §7 + GOREV-015/016.
- 2026-07-22 · FRONTEND · tamamlandi (Coz.tsx FİDAN — koyu zorlaması söküldü [tema izler]; 3 görünüm inline FİDAN: pratik "Neden?" kutusu + ÖSYM kehribar mühür SESSİZ test modu + sonuç halka/yaprak-konfeti/ders-dökümü köprüsü; çıkış Radix onayı; ambiyans sakin [tek güneş]; hareket-azalt tam. tsc SIFIR + build YEŞİL, three yalnız Bahçem'de. [~]: ödül coin/seri /answers'ta yok → yalnız XP [null≠0]; klavye ← inert [doğrusal akış].)
- 2026-07-22 · ORKESTRATÖR · onaylandi → arsiv/ (BAĞIMSIZ DENETİM: kendi oturumumda TSC_EXIT=0 + BUILD_EXIT=0; Coz chunk 28.92kB raporla birebir; Coz.tsx'te COASTAL token SIFIR [grep — yalnız "translate" yanlış pozitifi]; git status beyanla uyumlu. TELİF ÇAKIŞMASI ÇÖZÜMÜ: Görünüm B [ÖSYM] iptal notum ajana işi bitirdikten sonra ulaştı — inşa edilmiş hali KABUL [iade değil]; GOREV-015/016 giriş noktalarını/uçları kapatınca ölü kod olarak zararsız, kehribar .cz-scoped kalır. Dürüst devirler kabul: coin/seri alanı + kazanım-başlığı → BACKEND backlog; App kabuk çapa-favicon/marka temizliği → ayrı kabuk kartı backlog. 4 onay ölçütü sağlandı.)
