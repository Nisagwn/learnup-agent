---
gorev: GOREV-012-qa-bugun-giris-incelemesi
kimden: ORKESTRATÖR
kime: QA
durum: onaylandi
oncelik: P1
bagimlilik: [GOREV-007, GOREV-010]   # ikisi de ✅ arşivde — BAŞLATILABİLİR
dokunulan-dosyalar: []   # salt inceleme — kusur DÜZELTİLMEZ, RAPOR'lanır (gerekirse yalnız learnup-brain/**/*.test.ts)
migration-gerekli: hayir
---

## Amaç
FİDAN'ın ilk iki ekran kartını (**GOREV-007 Bugün** + **GOREV-010 Giriş** — `arsiv/`'de) bağımsız
incelemek: kapıları KENDİ oturumunda koşmak, desen/dil/mock taramalarını uygulamak, bulguları
kanıtlarıyla RAPOR'lamak. (Geliştiren ajanın ve ORKESTRATÖR'ün "yeşil" demesi kanıt değildir.)

## Bağlam
- İncelenecek diff kapsamı (iki kartın onaylı beyanı): `Bugun.tsx` · `PlanYolu.tsx` (YENİ) ·
  `OdakZamanlayici.tsx` (YENİ) · `Ambiyans.tsx` · `fx.tsx` · `index.html` · `Login.tsx` ·
  `GirisSahnesi.tsx` (YENİ).
- Arşivdeki iki kartın RAPOR bölümleri = doğrulanacak beyanlar (dürüst devirler dahil: ödev kartı
  atlandı, lig sadeleşti, plan "tamam ✓" yok — bunlar bilinçli null≠0 kararları, bulgu DEĞİL;
  tersine bu ekranlarda sahte tamamlanma/sayı bulunursa bulgudur).

## Kabul Kriterleri
- [x] **Kapı seti TAM ve KENDİ oturumunda** (qa.md §Katı-2): backend 4 komut + frontend elle tsc;
      ham çıktılar (son satırlar) RAPOR'da; `bun run eval` BAYRAKSIZ ($0), `--hakem` YASAK
- [x] **ZORUNLU mock/uydurma veri taraması** (qa.md desen listesi — FİDAN ekran kartı): 8 dosyada
      gömülü örnek sayı, sahte liste, önizleme HTML'inden kopyalanmış temsilî değer var mı; her
      görünen sayının kaynağı (uç yanıtı / gerçek yerel durum) izlenir. Bulgu = doğrudan iade sebebi.
- [x] Desen taramaları: bileşen içinde çıplak `fetch` · `useAsync` nesne deps · `RolGecidi` üç hâli ·
      API yalnız `lib/api.js`
- [x] Dil denetimi: 8 dosyada ve görünen metinlerde denizcilik terimi kalıntısı; hata mesajları
      Türkçe samimi cümle (önce `message`)
- [x] `prefers-reduced-motion` iddiaları örneklemle doğrulanır: PlanYolu nabız · GirisSahnesi sahne
      animasyonları · Ambiyans yaprakları · OdakZamanlayici göstergesi
- [x] Bilinen not doğrulanır: `App.tsx:27` bayat tsparticles yorumu (ORKESTRATÖR ön tespiti) —
      bulgu listesine girer
- [x] Bulgular önem sırasıyla RAPOR'da (dosya + gerekçe + kanıt satırı + kural referansı);
      temizse "bulgu yok" AÇIKÇA yazılır — yumuşatma yok

## Kısıtlar / Kapsam Dışı
- Üretim kodu/config/doküman YAZILMAZ; kusur düzeltilmez (düzeltme kartını ORKESTRATÖR açar).
- Güvenlik regresyon listesi bu turda kapsam dışı (backend'e dokunulmadı) — ancak backend kapıları
  yine TAM koşulur (regresyon sigortası).
- `git checkout --` / `restore` / commit YASAK (kirli ağaç onaylı iş taşıyor).

## Başlangıç Durumu
- Git rev: `5c2610e` (branch `feat/yks-brain`); kirli ağaç ~57 kayıt — TAMAMI onaylı iş (002–010)
  + docs/önizlemeler; kullanıcı commit'i bekleniyor. İnceleme SALT OKUMA + kapı koşularıdır.

## Onay Kayıtları
- Paralı koşu: GEREKMEZ ($0 — eval bayraksız).

## RAPOR
### Özet
Bağımsız inceleme (yazar≠denetçi ilkesi): 8 dosya taze gözle okundu, kapı seti **KENDİ oturumumda**
koşuldu, her bulgu dosya+satır+kanıtla doğrulandı. **En kritik sonuç: zorunlu mock/uydurma veri
taraması (A) TEMİZ** — Bugün/Giriş'te görünen HER sayı gerçek kaynağa (uç yanıtı / localStorage sayacı /
saf tarih hesabı) izlendi; uydurma "24/30", "%78", sahte seri/XP/coin/ustalık değeri YOK. Çıplak `fetch`
YOK, `useAsync` nesne-deps YOK, görünen Türkçe metinde denizcilik terimi YOK. Ancak birkaç
`prefers-reduced-motion` boşluğu + kabuk/kimlik düzeyinde COASTAL kalıntısı (favicon çapası, App marka
çapası, App.tsx:27 bayat yorum) ve **bir kapı KIRMIZI (eval drift — 007/010 dışı)** tespit edildi.

### Koşulan kapılar + ham çıktı (son satırlar) — KENDİ oturumumda
**Backend (learnup-brain):**
- `bun run typecheck` → `TYPECHECK_EXIT=0` ✓
- `bun run lint` (eslint kurulu) → `✖ 10 problems (0 errors, 10 warnings)` · `LINT_EXIT=0` ✓ (yalnız kullanılmayan-değişken uyarıları)
- `bun test src` → `107 pass · 0 fail · 334 expect() · [440ms]` · `TEST_EXIT=0` ✓ (Redis ECONNREFUSED beklenen — "hot-path Redis olmadan sürer"; test yeşil)
- `bun run eval` (BAYRAKSIZ, $0, `--hakem` KAPALI) → **`SONUÇ: KIRMIZI — 2 ihlal` · `EVAL_EXIT=1`** ⛔
  - `✗ KÖTÜLEŞME — kuşatma ihlal oranı: 0.000 → 0.133` (baseline 2026-07-20T10-36-00)
  - `✗ KÖTÜLEŞME — NN kopya adedi: 0.000 → 2.000`
  - (2a altın-set kapıları + 2c sızıntı/görsel drift YEŞİL; kırmızı olan yalnız bu iki drift satırı)

**Frontend (frontend-v2 — Coz.tsx'e DOKUNULMADAN, kararlı ağaç fotoğrafı):**
- `../learnup-brain/node_modules/.bin/tsc --noEmit -p tsconfig.json` → `FRONTEND_TSC_EXIT=0` ✓

### Bulgular (önem sırası)

⛔ **[KAPI-KIRMIZI] eval drift — kuşatma + NN kopya** (learnup-brain; neden 007/010 DIŞI) · qa.md §Katı-5
`bun run eval` KIRMIZI (yukarıda). İki drift ihlali de **soru havuzu / veri hattı** kaynaklı; GOREV-007/010
YALNIZ frontend dosyalarına dokundu → bu drift onların regresyonu DEĞİL (kirli ağaçtaki backend işleri +
havuz değişikliğinden gelir). **Baseline'ı sıfırlamak QA'nın kararı değil (qa.md §Katı-5).** → ORKESTRATÖR'e
taşınır; ilgili backend/veri kartında gerekçe incelenip baseline kararı verilir. QA düzeltmez.

🟠 **[MED] index.html:12 — favicon hâlâ COASTAL çapa (sky→cyan)** · FİDAN §6/§11, frontend.md-11
`stop-color='%230284C7' … '%2306B6D4' … circle cx='16' cy='9' … path d='M8.5 17.5a7.5 7.5 0 0 0 15 0'` —
çapa (anchor) + eski mavi; tarayıcı sekmesinde görünür kimlik. theme-color (satır 7-8) DOĞRU FİDAN
(#F4F7F4 / #0C120E) — o kısım temiz. İncelenen dosya; GOREV-007 theme-color'ı düzeltti, favicon'u atladı.

🟠 **[MED] fx.tsx:93-101 — `BreathingGlow` reduced-motion GATESİZ** · FİDAN §9.8, frontend.md-13
`animate={{ scale:[1,1.3,1], opacity:[0.3,0.7,0.3] }} transition={{ duration:5, repeat:Infinity }}` —
`useReducedMotion()` YOK, `motion-safe:` YOK (karşılaştır: aynı dosyada `Reveal` :49 gateli). Ek: `bg-sky-400/25`
COASTAL renk. Bugün/Giriş'te kullanılmaz (ajan kartlarında) ama incelenen dosyada ve gatesiz.

🟠 **[MED] Bugun.tsx:266 — plan iskeleti `animate-pulse` gatesiz** · FİDAN §9.8
`<div className="mt-4 h-24 animate-pulse rounded-xl" …/>` — `motion-safe:animate-pulse` değil; Tailwind v4
animasyonu varsayılan gate'lemez → `prefers-reduced-motion: reduce`'te de nabız atar. Aynı ekranda `HedefHalka`
JS-gateli (Bugun.tsx:391), bu iskelet gatesiz — tutarsız.

🟡 **[LOW] App.tsx:27 — bayat tsparticles yorumu (ORKESTRATÖR ön tespiti DOĞRULANDI)** · V§3.4 (yorum doğruluğu)
`// Ambiyans partikülleri — tsparticles kendi chunk'ında; …` — Ambiyans.tsx artık saf inline SVG (YAPRAKLAR
dizisi), tsparticles SIFIR. Yorum yanlış. App.tsx GOREV-007 beyanı DIŞINDAYDI → 007 dürüstçe dokunmadı; yorum
bu yüzden kaldı. App/kabuk temizlik kartına.

🟡 **[LOW] OdakZamanlayici.tsx:77 — halka transition gatesiz** · FİDAN §9.8 (kenar durum)
`style={{ transition: 'stroke-dashoffset 0.9s linear' }}` — @keyframes değil transition (E'nin kenarı) ama
reduced-motion'da her saniye hareket eder; HedefHalka'nın eşi (Bugun.tsx:391) `azalt ? undefined : …` ile gateli. Tutarsız.

🟡 **[LOW] fx.tsx:83 GlowBorder + index.css:201 text-glow — COASTAL sky conic/glow** · FİDAN §2 (D)
`conic-gradient(…, rgba(56,189,248,.75)…)` + `.dark .text-glow{ text-shadow:0 0 12px rgb(56 189 248/.45) }` hâlâ mavi.
Bugün/Giriş dışı ama fx.tsx incelenen dosyada — renk borcu.

🟡 **[LOW] index.html:38-40 — global `@keyframes` pulse/ping/flicker gate dışı** · FİDAN §9.8
Tanımlar tek başına animasyon değil ama gatesiz utility'ler (`animate-pulse`, PingDot ping) tüketiyor → efektif hareket gate dışı.

🟡 **[LOW] Login.tsx:55 — hata yapısı DOĞRU ama yaygın durumda ham Supabase (İngilizce) mesajı** · V§3.3, qa.md-Dil
`setHata((err as Error)?.message || 'Bilgileri kontrol edip tekrar dene.')` — message-önce ✓, kod sızmıyor ✓, nötr
fallback ✓ (sınıf varlığı sızmaz). Ancak yaygın hata ("Invalid login credentials") Supabase'ten İngilizce gelir →
"Türkçe samimi cümle" yalnız fallback'te garanti. Öneri (düzeltme ORKESTRATÖR kartı): Supabase kod→TR eşlemesi.

### Bulgu DEĞİL (kart Bağlam'ında bilinçli null≠0 / kapsam-dışı kabuk)
- **Bugun.tsx:346 "Sıralama → canlı" çipi:** rank `/gamification/daily` payload'unda yok (lig sadeleşti — 007
  RAPOR'unda açıklı). Sahte rank ("#3") UYDURULMAMIŞ — kelimeli "canlı" çip. Kart Bağlam'ı bunu bulgu-değil sayıyor. Kabul.
- **Kabuk COASTAL borcu (kapsam dışı):** App.tsx:273-278 marka çapası + sky→cyan "LearnUp"; App.tsx spinner/route
  geçişi gatesiz; nav pill'leri; Splash `bg-shore-50 dark:bg-ocean-900`. App.tsx GOREV-007/010 beyanında DEĞİL —
  bunlar kabuk kartının işi, 007/010 regresyonu değil. Bilgi olarak not.

### Temiz (açıkça — yumuşatma yok)
- **A mock/uydurma veri: TEMİZ.** Her sayı gerçek kaynakta: bugünCözülen←rontgen.trend; doğruluk←G.correct/total
  (0→"—"); odakDk←localStorage `bugunkuOdakDk()`; seri←G.streak.count; hero←canlı+localStorage `gunlukHedef()`;
  weeklyXP←G.league; tekrar←review.count; `yksGun()` saf tarih; timer gerçek geri sayım; PlanYolu duraklar←oneri/konular
  API. `CanliSayi` yalnız gerçek değeri sayar. Uydurma sabit sayı / sahte liste YOK.
- **B çıplak fetch: TEMİZ** — Bugun/Login'de `fetch(` yok; yalnız apiGet/apiPost + signIn/signUp.
- **C useAsync nesne-deps: TEMİZ** — 5 çağrı da `[]` (run-once); Bugun.tsx:77'deki `{}` POST gövdesi, dep değil.
- **D görünen metin (Bugün/Giriş): TEMİZ** — deniz/gemi/fener/liman/çıpa/yakamoz görünen hiçbir Türkçe metinde yok;
  "göl" tatlısu/doğa (denizcilik değil). Kalıntı yalnız ikon/CSS/yorum/id'de (yukarıda flaglendi).
- **E ekran-içi `@keyframes`: gateli** — bg-fidan/salla, py-dalga, oz-tik, amb-yprk, gs-*, lg-belir hepsi
  `@media (prefers-reduced-motion: no-preference)` altında; HedefHalka + Reveal `useReducedMotion` ile JS-gateli.
  (Gatesiz istisnalar yukarıda F: fx.tsx BreathingGlow, Bugun:266, Odak:77, index.html keyframe'leri.)
- **RolGecidi üç hâli:** App.tsx AnaKapi (132-138) `profilYukleniyor→PanoIskeleti` (redirect YOK) invaryantı korunuyor;
  RolGecidi.tsx 007/010 diff'inde değil (dokunulmadı).

### Gerçekleşen maliyet
**$0** — yalnız kapı koşuları + salt-okuma inceleme; `bun run eval` bayraksız (`--hakem` KAPALI).

### Açık riskler
- eval KIRMIZI durumu commit öncesi çözülmeli; frontend kartlarını bloklamaz ama havuz kalite regresyonudur.
- Kabuk (App.tsx) COASTAL kaldığı sürece Bugün/Giriş'in FİDAN gövdesi mavi çapa marka + sky nav ile çelişir (görsel tutarsızlık).

### Sonraki adım önerisi (düzeltme kartları ORKESTRATÖR'ün — QA düzeltmez)
1. **App/kabuk FİDAN kartı:** App.tsx marka çapası+sky/cyan→FİDAN; favicon çapası→filiz; App.tsx:27 bayat yorum;
   Splash/route geçişi reduced-motion gate; nav/Splash `bg-shore/ocean`→FİDAN.
2. **fx.tsx temizlik:** BreathingGlow reduced-motion gate + `bg-sky`→FİDAN; GlowBorder conic + text-glow sky→FİDAN.
3. **Bugun.tsx:266** `animate-pulse`→`motion-safe:animate-pulse`; **OdakZamanlayici.tsx:77** transition'ı azalt-gateli.
4. **eval drift (ACİL, backend/veri):** kuşatma 0→0.133 + NN kopya 0→2 ihlali incelensin; baseline kararı ORKESTRATÖR'de.
5. **Login hata TR:** Supabase kod→Türkçe eşlemesi (opsiyonel iyileştirme).

### İnceleme yöntemi (şeffaflık)
Taze-göz taraması bağımsız denetçi alt-ajanına yaptırıldı (yazar≠denetçi; 007/010'u FRONTEND rolüm yazmıştı);
her bulgu QA olarak ilgili dosya+satırdan **kendi gözümle** doğrulandı (favicon/fx/Login/Bugun aralıkları okundu).
Kapılar bağımsız denetçiden AYRI, kendi oturumumda koşuldu.

## Günlük
- 2026-07-22 · ORKESTRATÖR · kart açıldı (BAŞLATILABİLİR — 007+010 onaylı/arşivde; FİDAN döneminin ilk zorunlu mock taraması bu kartla koşulacak)
- 2026-07-22 · QA · alindi
- 2026-07-22 · QA · tamamlandi (kapı seti kendi oturumumda koşuldu — backend typecheck/lint/test YEŞİL, **eval KIRMIZI** 2 drift [007/010 dışı → ORKESTRATÖR'e]; frontend tsc YEŞİL. Mock taraması TEMİZ [A]; çıplak fetch/useAsync-deps TEMİZ [B/C]; görünen metin denizcilik-temiz [D]. Bulgular: favicon çapası [MED], BreathingGlow+Bugun:266 RM-gatesiz [MED], App.tsx:27 bayat yorum DOĞRULANDI [LOW] + 4 LOW. Düzeltmeler ilgili kartlara.)
- 2026-07-22 · ORKESTRATÖR · onaylandi → arsiv/ (DENETİM: git status beyanla birebir — QA hiçbir dosyaya yazmamış [dokunulan-dosyalar boş]; kapı çıktıları ham; KIRMIZI dürüstçe raporlanıp baseline'a dokunulmamış [§Katı-5 tam uyum]; mock taraması metodolojisi sağlam. AKSİYONLAR: eval drift → GOREV-017 [EVAL-LLMOPS, P0]; kabuk/görsel borç bulguları → GOREV-018 [bagimlilik 015]; Bugun.tsx:266 motion-gate → GOREV-013 kriterine eklendi; Login TR eşlemesi → 018'e. 4 onay ölçütü sağlandı.)
