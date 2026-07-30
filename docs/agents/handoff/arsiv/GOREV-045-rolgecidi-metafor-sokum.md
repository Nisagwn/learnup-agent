---
gorev: GOREV-045-rolgecidi-metafor-sokum
kimden: ORKESTRATÖR
kime: FRONTEND
durum: onaylandi
oncelik: P2
bagimlilik: []
dokunulan-dosyalar:
  - frontend-v2/src/components/RolGecidi.tsx
  - frontend-v2/src/components/Lighthouse.tsx   # SİLİNECEK (son tüketici RolGecidi)
  - frontend-v2/src/components/Login3D.tsx       # SİLİNECEK (ölü kod — sıfır import)
migration-gerekli: hayir
---

## Amaç
FİDAN geçişinin paylaşılan-bileşen kalıntısını kapatmak: `RolGecidi`/`YetkiYok` içindeki **kıyı
feneri (Lighthouse) metaforunu ve slate legacy token'larını sökmek**, yerine FİDAN filiz görseli +
tema değişkenleri koymak; artık kimsenin kullanmadığı `Lighthouse.tsx` ve ölü `Login3D.tsx`
dosyalarını silmek.

## Bağlam
- **Düz isimlendirme kuralı (kullanıcı 3 kez reddetti):** metaforlu/şirin ad ASLA. `Lighthouse`
  ("kıyı feneri") + `yakamoz` turkuazı saf COASTAL metafor — FİDAN'a aykırı.
- **`frontend-v2/src/components/RolGecidi.tsx` FİDAN'lanmamış:**
  - `import { Lighthouse } from './Lighthouse'` → `YetkiYok`'ta `<Lighthouse size={84} />` (satır ~50).
  - `text-slate-800 dark:text-slate-100`, `text-slate-500 dark:text-slate-400` — legacy slate
    token (FİDAN `--metin1/2/3` değil).
  - `glass` sınıfı + `GlowButton` (components/ui.tsx COASTAL primitifi).
- **`Lighthouse.tsx`** tam bir kıyı feneri SVG'si: yakamoz `#2DD4BF`, kaya/su çizgileri, dönen
  huzme, `useTheme` slate renkleri. Yalnız RolGecidi/`YetkiYok`'ta canlı (grep teyitli). Silinince
  başka tüketici yok.
- **`Login3D.tsx` ÖLÜ:** hiçbir dosya import etmiyor (grep `import … Login3D` → 0; yalnız yorumlarda
  "emekli" olarak anılıyor). Güvenle silinir.
- **Hazır FİDAN filiz deseni — YENİDEN KULLAN:** `frontend-v2/src/screens/sinif/OdevAtolyesi.tsx`
  (~satır 665) boş-durum filiz SVG'si `--vurgu`/`--adacayi`/`--yaprak` ile. Aynı dil YetkiYok'a.
- **KRİTİK — ÜÇ HÂL korunur:** `RolGecidi`'de `profilYukleniyor` iken YÖNLENDİRME YOK
  (`PanoIskeleti` döner). Bu panelin en kritik detayı — asla ikiye indirme (docstring'deki gerekçe
  aynen kalsın). `PanoIskeleti`/`Sayfa` yapısı ve export imzaları DEĞİŞMEZ.
- Ekran dalgası paylaşılan `components/ui.tsx` primitiflerinden kaçınıp inline `xx-*` stil bloğu
  kurdu (örn. `oa-*`, `sh-*`); YetkiYok da aynı deseni izleyebilir (küçük inline `rg-*` blok) ya da
  yalnız token'ları FİDAN'a çevirip yapıyı sadeleştirir — SEÇİM SENDE, ölçüt: sabit slate/coastal
  renk kalmamalı, iki tema da CSS değişkenlerinden dönmeli.

## Kabul Kriterleri
- [ ] `YetkiYok`'ta `Lighthouse` YOK; yerine FİDAN filiz görseli (`--vurgu`/`--adacayi`/`--yaprak`
      tonlu SVG, OdevAtolyesi deseniyle uyumlu). Metafor/yakamoz turkuazı sıfır.
- [ ] RolGecidi/YetkiYok'ta `slate-*` legacy token YOK — metin/renk FİDAN değişkenlerinden
      (`--metin1/2/3` vb. veya eşdeğer FİDAN sınıfı). İki tema da otomatik döner (sabit renk yok).
- [ ] `Lighthouse.tsx` **silindi**; repoda `Lighthouse`'a hiçbir canlı import kalmadı
      (`grep -rn "Lighthouse" frontend-v2/src` → yalnız yorum, sıfır import).
- [ ] `Login3D.tsx` **silindi**; silmeden önce sıfır-import teyidi RAPOR'da
      (`grep -rn "Login3D" frontend-v2/src` → yalnız yorum). Canlı import bulunursa SİLME, RAPORla.
- [ ] **ÜÇ HÂL korunur:** `profilYukleniyor` → `PanoIskeleti` (yönlendirme yok); reddedilen rol →
      `YetkiYok` (sessiz redirect DEĞİL); izinli → `Outlet`. Export imzaları (`Sayfa`,
      `PanoIskeleti`, `YetkiYok`, `RolGecidi`) ve `saglayici==='sinif'` yolu değişmez.
- [ ] `cd frontend-v2 && ../learnup-brain/node_modules/.bin/tsc --noEmit -p tsconfig.json` sıfır
      hata + `bun run build` yeşil → HAM çıktılar RAPOR'a. **$0.**

## Kısıtlar / Kapsam Dışı
- **`components/ui.tsx` (GlassCard/GlowButton/Chip/Skeleton primitifleri) RETOKENLENMEZ** bu kartta
  — o paylaşılan primitif göçü ayrı, geniş bir kart (tüm tüketicilerin denetimini ister). Bu kart
  yalnız RolGecidi'yi FİDAN'a çeker + iki ölü/metafor dosyayı siler. `GlowButton`/`Skeleton` kullanmaya
  devam edebilirsin (COASTAL değiller — nötr primitif) ya da inline FİDAN eşdeğeriyle
  değiştirebilirsin; ama `components/ui.tsx` İÇİNİ değiştirme.
- `index.css` token söküම bu kartta YOK (ayrı riskli kart — 79 kalıntı denetimi ister).
- `Ambiyans`/`GirisSahnesi` adları KORUNUR — bunlar işlevsel/nötr Türkçe adlar, metafor değil.
- Başka ekrana/route'a dokunma; yalnız beyan edilen 3 dosya (biri değişir, ikisi silinir).

## Başlangıç Durumu
- Git rev: `5c2610e`. Çalışma ağacı çok kirli (tüm onaylı FİDAN dalgası, commit'lenmedi). Bu kart
  yalnız beyan edilen 3 dosyaya dokunur. `RolGecidi.tsx` git status'ta zaten M (önceki traceler) —
  ÜÇ HÂL yapısını koru. İlk adım: `git diff --stat -- frontend-v2/src/components/RolGecidi.tsx` +
  iki grep (Lighthouse/Login3D import sayımı) RAPOR'a. Beyan dışı kirli dosyaya dokunma;
  `git checkout --` YASAK.

## Onay Kayıtları
- Paralı koşu: GEREKMEZ ($0).

## RAPOR
<!-- YALNIZ FRONTEND ajanı doldurur. -->
### Yapılan
- `RolGecidi.tsx`: `import { Lighthouse } from './Lighthouse'` kaldırıldı; `import { GlowButton, Skeleton }`
  → `import { Skeleton }` (GlowButton düştü, Skeleton `PanoIskeleti`'de kalıyor).
- `YetkiYok`'ta `<Lighthouse size={84}>` YERİNE FİDAN filiz SVG'si (OdevAtolyesi ~665 deseninin birebir
  eşi: `--vurgu` gövde çizgisi + `--adacayi`/`--yaprak` filiz yaprakları), size 72. Metafor/yakamoz sıfır.
- `glass` + `text-slate-800/100` + `text-slate-500/400` legacy token'ları SÖKÜLDÜ; yerine küçük inline
  `rg-*` stil bloğu (ekran dalgasının `oa-*` deseni): `.rg-kart` (`--cam`/`--cam-kenar`/`--golge`),
  `.rg-h2` (`--metin1`), `.rg-alt`/`.rg-alt strong` (`--metin3`/`--metin2`), `.rg-btn` (`--v0`/`--metin2`,
  hover `--adacayi`). İki tema da CSS değişkenlerinden otomatik döner — sabit slate/coastal renk YOK.
- `GlowButton` yerine `rg-btn` (soluk FİDAN düğme) + inline ok SVG'si (`currentColor`, min-height 44px).
- **ÜÇ HÂL korundu:** `profilYukleniyor → PanoIskeleti sutun={2}` (yönlendirme YOK, docstring gerekçesi
  aynen), `!izin → YetkiYok` (sessiz redirect değil), izinli → `Outlet` (`saglayici==='sinif'` → `SinifSaglayici`).
  Export imzaları (`Sayfa`/`PanoIskeleti`/`YetkiYok`/`RolGecidi`) değişmedi.
- `Lighthouse.tsx` ve `Login3D.tsx` silindi. `components/ui.tsx`, `index.css`, `Ambiyans`/`GirisSahnesi`
  dokunulmadı; beyan dışı kirli dosyaya dokunulmadı.

### Değişen dosyalar
- `frontend-v2/src/components/RolGecidi.tsx` — M (Lighthouse→filiz, slate→FİDAN token, glass/GlowButton→rg-*)
- `frontend-v2/src/components/Lighthouse.tsx` — D (silindi; son tüketici RolGecidi swap'landı)
- `frontend-v2/src/components/Login3D.tsx` — D (silindi; ölü kod, sıfır import)

### Koşulan kapılar + çıktıları
İlk adım — `git diff --stat -- frontend-v2/src/components/RolGecidi.tsx` (çalışma başında):
```
 frontend-v2/src/components/RolGecidi.tsx | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)
```
Silme öncesi import sayımı — `grep -rn "Lighthouse" frontend-v2/src`:
```
Lighthouse.tsx:4:export function Lighthouse(...)        # tanım (silinecek)
RolGecidi.tsx:7:import { Lighthouse } from './Lighthouse'   # tek canlı import (swap edildi)
RolGecidi.tsx:50:<Lighthouse size={84} />                # tek kullanım (swap edildi)
OdevAtolyesi.tsx:661: {/* ... (Lighthouse emekli) ... */}   # yalnız yorum
```
`grep -rn "Login3D" frontend-v2/src`:
```
Login.tsx:50: * ... eski three.js `Login3D` bu ekrandan çıkarıldı.   # yorum
Login3D.tsx:12:export default function Login3D(...)                  # tanım (silinecek)
GirisSahnesi.tsx:7: * ... Eski three.js `Login3D` (deniz+fener) ...  # yorum
KureArkaplan.tsx:10: * ... `Bahce3D`/`Login3D` ile aynı desen.       # yorum
```
→ İkisi de sıfır canlı import; güvenle silindi.

Silme sonrası — `grep -rn "Lighthouse\|Login3D" frontend-v2/src` (YALNIZ yorum kaldı):
```
GirisSahnesi.tsx:7: * ... Eski three.js `Login3D` (deniz+fener) yerine hafif SVG.
KureArkaplan.tsx:10: * ... `Bahce3D`/`Login3D` ile aynı desen.
Login.tsx:50: * ... eski three.js `Login3D` bu ekrandan çıkarıldı.
OdevAtolyesi.tsx:661: {/* Sınıf boş — FİDAN filiz görseli (Lighthouse emekli) ... */}
```

`cd frontend-v2 && ../learnup-brain/node_modules/.bin/tsc --noEmit -p tsconfig.json` → **TSC_EXIT=0** (sıfır hata).

`bun run build` → **BUILD_EXIT=0** — `✓ built in 1.65s`. (Yalnız önceden var olan >500kB chunk uyarısı:
vendor-three/katex/charts; bu kartla ilgisiz.)

`git status --short` (yalnız 3 beyan dosya):
```
 D frontend-v2/src/components/Lighthouse.tsx
 D frontend-v2/src/components/Login3D.tsx
 M frontend-v2/src/components/RolGecidi.tsx
```

### Gerçekleşen maliyet
$0 (paralı koşu yok).

### Açık riskler
- Yok. `RolGecidi.tsx` git status'ta zaten M idi (önceki FİDAN dalgası); bu kartın diff'i onun üstüne bindi,
  beyan dışı dosya etkilenmedi.
- `Login3D` silinince `vendor-three` chunk'ının tek tüketicisi olabileceği endişesi geçersiz: `Bahce3D`/
  `KureArkaplan` three'yi kullanmaya devam ediyor, chunk hâlâ derleniyor.

### Sonraki adım önerisi
- `components/ui.tsx` (GlowButton/GlassCard/Chip/Skeleton) COASTAL→FİDAN primitif göçü hâlâ açık — ayrı
  geniş kart (tüm tüketicilerin denetimi). `Skeleton` bu kartta nötr olarak kaldı.
- `index.css` legacy token sökümü (79 kalıntı) ayrı riskli kart olarak duruyor.

## Günlük
- 2026-07-23 · ORKESTRATÖR · kart açıldı (beklemede; GOREV-044 ile paralel — kesişen dosya yok)
- 2026-07-23 · ORKESTRATÖR · iptal → arşiv. GEREKÇE: kullanıcı "görsel olarak karışma şimdilik, ilerde görsellik için detaylı bir iş yapacağız" dedi. Bu kart saf görsel/metafor sökümü (Lighthouse→filiz, slate→FİDAN token) → görsel dalgaya devrolur. Ölü kod tespiti (Login3D sıfır import; Lighthouse yalnız RolGecidi'de) ileride kullanılmak üzere burada korundu.
- 2026-07-23 · ORKESTRATÖR · yeniden açıldı (iptal → beklemede). GEREKÇE: kullanıcı görsel yasağından vazgeçti ("vazgeçtim yap") → görsel iş onaylandı; kart FRONTEND'e fırlatılıyor.
- 2026-07-23 · FRONTEND · alindi
- 2026-07-23 · FRONTEND · tamamlandi (Lighthouse→FİDAN filiz + slate→FİDAN token/rg-* blok; Lighthouse.tsx & Login3D.tsx silindi; üç hâl korundu; TSC=0, BUILD=0; $0)
- 2026-07-23 · ORKESTRATÖR · onaylandi + arşiv. Bağımsız denetim: (1) `Lighthouse.tsx` + `Login3D.tsx` silindi — diskte yok + git `D`; repoda sıfır canlı import (grep yalnız 4 yorum: GirisSahnesi/KureArkaplan/Login/OdevAtolyesi). (2) RolGecidi'de `slate-*`/`glass`/`GlowButton`/`Lighthouse`/`#2DD4BF`/`yakamoz` grep=0; yerine `rg-*` FİDAN token bloğu (--cam/--cam-kenar/--metin1-3/--adacayi) + filiz SVG (--vurgu/--adacayi/--yaprak, OdevAtolyesi deseni). (3) ÜÇ HÂL korundu: `profilYukleniyor→PanoIskeleti sutun={2}` (satır 102, yönlendirme YOK), docstring "ÜÇ HÂL, İKİSİ DEĞİL" aynen; `!izin→YetkiYok` (sessiz redirect değil); izinli→`Outlet`, `saglayici==='sinif'→SinifSaglayici`. Export imzaları (Sayfa/PanoIskeleti/YetkiYok/RolGecidi) sabit. Yalnız 3 beyan dosya (RolGecidi M, Lighthouse D, Login3D D). KONSOLİDE KAPI: TSC=0 (dangling import olsaydı kırılırdı → silmeler temiz), BUILD=0. $0. `ui.tsx`/`index.css`/`Ambiyans`/`GirisSahnesi` bilinçli DOKUNULMADI (kapsam dışı).
