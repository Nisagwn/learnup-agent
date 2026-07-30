---
gorev: GOREV-005-vite-build-onarimi
kimden: ORKESTRATÖR
kime: FRONTEND
durum: onaylandi
oncelik: P0
bagimlilik: []
dokunulan-dosyalar:
  - frontend-v2/vite.config.js
migration-gerekli: hayir
---

## Amaç
`bun run build` kapısını yeniden yeşile almak: `vite.config.js` içindeki `manualChunks`
Object biçimini Vite 8/rolldown'ın beklediği Function biçimine çevirmek. **Bu düzeltilene kadar
hiçbir frontend kartı build kapısını geçemez.**

## Bağlam
- GOREV-002 RAPOR bulgusu: build "2160 modül derlendi ✓" sonrası yalnız chunking config'inde
  düşüyor. `manualChunks` Object olarak tanımlı; Vite 8 (rolldown) Function bekliyor.
  Commit `5c2610e`'de `manualChunks` yok — oturum-öncesi izlenmeyen/kirli bir ekleme.
- Bölge notu: `vite.config.js` bu kartla FRONTEND bölgesine alındı (AGENTS.md kadro tablosu
  2026-07-22'de `frontend-v2/**` olarak genişletildi).
- Mevcut chunk niyeti korunmalı: `vendor-three`, `vendor-katex`, `vendor-charts`,
  `vendor-motion` ayrımı (VERDENT §1 frontend tablosundaki manuel chunk kararı).

## Kabul Kriterleri
- [x] `manualChunks` Function biçiminde; vendor ayrımı (three/katex/charts/motion) davranışsal
      olarak eşdeğer — dört chunk adı build çıktısında görünüyor (vendor-three/katex/charts/motion)
- [x] `cd frontend-v2 && bun run build` BAŞARILI → son satırlar (chunk listesi dahil) RAPOR'da (BUILD_EXIT=0, ✓ built in 2.32s)
- [x] `../learnup-brain/node_modules/.bin/tsc --noEmit -p tsconfig.json` sıfır hata → çıktı RAPOR'da (TSC_EXIT=0)
- [x] `vite.config.js`'te bu düzeltme dışında hiçbir değişiklik yok (sourcemap/proxy/port korundu;
      oturum-öncesi kirli kısım AYNEN — `git diff` karşılaştırması RAPOR'da)

## Kısıtlar / Kapsam Dışı
- Yalnız `manualChunks` düzeltmesi — proxy, port, sourcemap vb. ayarlara dokunulmaz.
- Yeni bağımlılık eklenmez.

## Başlangıç Durumu
- Git rev: `5c2610e` (branch: `feat/yks-brain`); kullanıcı henüz commit atmadı.
- `frontend-v2/vite.config.js` oturum-öncesi KİRLİ (M) — bu kart o dosyada değişikliğe AÇIKÇA
  yetkilidir; mevcut diff'in manualChunks dışındaki kısmı korunur. İlk adım:
  `git diff frontend-v2/vite.config.js` fotoğrafını RAPOR'a almak.

## Onay Kayıtları
- Paralı koşu: GEREKMEZ ($0).

## RAPOR

### Yapılan
`frontend-v2/vite.config.js` içindeki `build.rollupOptions.output.manualChunks` **Object** biçimi,
Vite 8/rolldown'ın beklediği **Function** biçimine çevrildi. Fonksiyon modül `id`'sine göre eşleştirir
ve dört vendor chunk'ını (three / katex / charts / motion) davranışsal olarak korur. `sourcemap: true`,
`server.proxy` (port 5174, `/api`→:8080) ve dosyadaki diğer oturum-öncesi kısımlar AYNEN korundu —
yalnız `manualChunks` değişti.

**Object → Function eşlemesi (davranışsal eşdeğerlik):**
| Eski Object anahtarı | Yeni Function eşleşmesi (regex, `id` üzerinde) |
|---|---|
| `'vendor-three': ['three','@react-three/fiber','@react-three/drei']` | `node_modules/(three\|@react-three)/` |
| `'vendor-katex': ['katex','react-markdown','remark-math','rehype-katex']` | `node_modules/(katex\|react-markdown\|remark-math\|rehype-katex)/` |
| `'vendor-charts': ['recharts']` | `node_modules/recharts/` |
| `'vendor-motion': ['framer-motion']` | `node_modules/framer-motion/` |

Windows/POSIX ayracı için `[/\\]` kullanıldı; `node_modules` dışı modüller `undefined` döner
(Vite varsayılan chunk'lamasına bırakılır).

### Değişen dosyalar
- **Yalnız `frontend-v2/vite.config.js`** (beyanla birebir). `git diff` (vs HEAD `5c2610e`):
```
   export default defineConfig({
     plugins: [react()],
+  build: {
+    sourcemap: true,                         ← oturum-öncesi, korundu
+    rollupOptions: {
+      output: {
+        manualChunks(id) {                   ← DÜZELTME: Object → Function
+          if (!id.includes('node_modules')) return undefined
+          if (/node_modules[/\\](three|@react-three)[/\\]/.test(id)) return 'vendor-three'
+          if (/node_modules[/\\](katex|react-markdown|remark-math|rehype-katex)[/\\]/.test(id)) return 'vendor-katex'
+          if (/node_modules[/\\]recharts[/\\]/.test(id)) return 'vendor-charts'
+          if (/node_modules[/\\]framer-motion[/\\]/.test(id)) return 'vendor-motion'
+          return undefined
+        },
+      },
+    },
+  },
     server: { port: 5174, proxy: { '/api': … } }   ← değişmedi
```
- Not: `git status`'ta görünen diğer `frontend-v2/**` (App.tsx, nav.ts, Ben.tsx…) girdileri
  **GOREV-002'nin** (metin dönüşümü, ayrı kart) çalışmasıdır + oturum-öncesi kirli dosyalardır;
  bu kart onlara DOKUNMADI. GOREV-005'in tek farkı `vite.config.js`.

### Koşulan kapılar + çıktıları
**1) `cd frontend-v2 && bun run build` → BAŞARILI ✓** (dört vendor chunk çıktıda görünüyor):
```
dist/assets/vendor-motion-CW15NH_x.js   125.48 kB │ gzip:  40.91 kB
dist/assets/vendor-katex-6PU0_Lif.js    390.36 kB │ gzip: 118.02 kB
dist/assets/vendor-charts-CW-yi4Q8.js   405.47 kB │ gzip: 115.11 kB
dist/assets/vendor-three-CX4HGfXI.js    900.77 kB │ gzip: 240.29 kB
✓ built in 2.32s
BUILD_EXIT=0
```
(Uyarı: "Some chunks are larger than 500 kB" — bilgilendirme uyarısı, HATA değil; three.js
gerçekten büyük. Chunk boyut stratejisi bu kartın kapsamı dışında.)

**2) `../learnup-brain/node_modules/.bin/tsc --noEmit -p tsconfig.json` → SIFIR HATA ✓**
```
TSC_EXIT=0
```

### Gerçekleşen maliyet
**$0** — yalnız Edit + build/tsc. Paralı LLM çağrısı yok.

### Açık riskler
1. **Transitive bağımlılık yerleşimi (küçük fark):** Object biçimi, listelenen paketlerin özel
   alt-bağımlılıklarını da aynı chunk'a çekerdi; Function biçimi yalnız `node_modules/<paket>/`
   eşleşmesini atar. Paylaşılan transitive dep'ler (ör. recharts'ın `d3-*`'ı) Vite'ın varsayılan
   ortak-chunk'ına düşebilir. Dört ağır vendor chunk'ı **oluştu ve beklenen kütüphaneleri içeriyor**
   (three 900kB, charts 405kB, katex 390kB, motion 125kB) → niyet korundu; fark yalnız kenar
   dep'lerin dağılımında, işlevsel etki yok.
2. **>500kB chunk uyarısı** sürüyor (three.js). İstenirse ayrı bir performans kartında
   `build.chunkSizeWarningLimit` ayarı veya three'nin daha ince kod-bölünmesi ele alınabilir.

### Sonraki adım önerisi
- **Build kapısı artık YEŞİL** → GOREV-002 (metin dönüşümü) dahil bekleyen frontend kartları artık
  hem `tsc` hem `bun run build` kapılarını geçebilir. ORKESTRATÖR GOREV-002'yi yeniden değerlendirip
  onaylayabilir (kabul kriteri #8 artık sağlanır).
- İsteğe bağlı performans kartı: three.js chunk boyutu (>500kB) için dinamik import / daha ince bölme.
- Kalıcı hafıza notu ([[build-kapisi-vite-manualchunks]]) güncellendi: build artık çalışıyor.

## Günlük
- 2026-07-22 · ORKESTRATÖR · kart açıldı (beklemede, P0 — build kapısı bloke)
- 2026-07-22 · FRONTEND · alindi
- 2026-07-22 · FRONTEND · tamamlandi (manualChunks Object→Function; `bun run build` YEŞİL — dört vendor chunk çıktıda; tsc SIFIR hata; yalnız vite.config.js değişti, sourcemap/proxy korundu)
- 2026-07-22 · ORKESTRATÖR · onaylandi. Bağımsız doğrulama: build'i kendim koştum — EXIT=0, ✓ built in 1.92s, vendor-three çıktıda; diff yalnız manualChunks. Transitive-dep riski (d3-* dağılımı) makul ve belgelenmiş. Build kapısı AÇIK → GOREV-004 serbest.
