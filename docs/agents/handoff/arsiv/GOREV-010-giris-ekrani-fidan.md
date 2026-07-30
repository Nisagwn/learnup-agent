---
gorev: GOREV-010-giris-ekrani-fidan
kimden: ORKESTRATÖR
kime: FRONTEND
durum: onaylandi
oncelik: P1
bagimlilik: [GOREV-006]   # tema token'ları yeterli; ekran kendi sahnesini taşır
dokunulan-dosyalar:
  - frontend-v2/src/screens/Login.tsx
  - frontend-v2/src/components/GirisSahnesi.tsx   # YENİ — SVG orman+göl sahnesi (iki tema)
migration-gerekli: hayir
---

## Amaç
Giriş ekranını **kullanıcı onaylı önizlemeyle** hizalamak:
`docs/design/onizleme/giris.html` (2026-07-22 onayı — kaynak referans BUDUR).

## Bağlam
- Tasarım: TASARIM-DILI v1.2. İçerik: EKRAN-HARITASI §1 (güncel — sınıf düzeyi kararı dahil).
- Mevcut `Login3D.tsx` (three.js deniz+fener) bu ekranda EMEKLİYE ayrılır: yerine hafif SVG
  sahne (`GirisSahnesi.tsx` — önizlemedeki katmanlı orman+göl; gündüz kelebek / gece ay+ateşböceği).
  three.js bağımlılığı Bahçem için kalır; Login chunk'ından çıkması bonus performanstır.
- Auth akışı (Supabase signIn/signUp, otomatik sınıf katılımı) DEĞİŞMEZ — yalnız görünüm + form alanları.

## Kabul Kriterleri
- [x] Görünüm iki temada da önizlemeyle eşleşir: tam ekran katmanlı SVG sahne (tepeler, ağaçlar,
      göl + yansıma; gündüz: güneş+kelebek, gece: ay+yansıması+yanıp sönen ateşböcekleri; süzülen
      1-2 yaprak) · cam form kartı · slogan tarafı ("Her soru, fidanını büyütür.")
- [x] **Kayıt formu sadeleşti:** Ad Soyad + e-posta + şifre + opsiyonel sınıf kodu. **Sınıf düzeyi
      KALDIRILDI** (rol seçici + okul da kalktı — student-only; backend'e düzey gönderilmez). Kod
      yanlışsa nötr tek mesaj korunur.
- [x] Giriş/Kayıt sekmeli yapı; odaklı alanda yeşil halka; hata durumu Türkçe samimi mesajla
      (`önce message`, inline kutu); gönderirken devre dışı buton; her sekmede TEK birincil buton
- [x] `Login3D` bu ekrandan çıkarıldı (dosya korundu — kullanım kalktı); Login three içermez
      (grep + build ile doğrulandı — three yalnız Bahçem chunk'larında; Login eager/index, RAPOR'da açıklandı)
- [x] Hareket-azalt: sahne animasyonları (kelebek/ateşböceği/dalga/yaprak) tamamen durur (`@media` kapısı)
- [x] `tsc --noEmit` sıfır hata + `bun run build` yeşil → çıktılar RAPOR'da (TSC_EXIT=0, BUILD_EXIT=0)

## Kısıtlar / Kapsam Dışı
- Auth mantığı, Supabase çağrıları, otomatik katılım akışı değişmez.
- `Bahce3D`/three sahneleri bu kartın dışı.

## Başlangıç Durumu
- Git rev: `5c2610e`; kirli ağaç 52 kayıt (onaylı işler — kullanıcı commit'i bekleniyor).
  `Login.tsx` GOREV-002'den kirli — yalnız bu kartın işi eklenir. İlk adım: `git diff --stat` RAPOR'a.

## Onay Kayıtları
- Paralı koşu: GEREKMEZ ($0).

## RAPOR

### Yapılan
Giriş ekranı onaylı önizleme `docs/design/onizleme/giris.html` (2026-07-22) ile hizalandı.
- **`GirisSahnesi.tsx` (YENİ):** katmanlı SVG orman kenarı + göl sahnesi (tepeler, ağaçlar, göl +
  yansıma). Gündüz: güneş + 2 kelebek; gece: ay + yansıması + 3 yanıp sönen ateşböceği. İki temada
  süzülen 2 yaprak. Renkler `useTheme()` ile gündüz/gece paletinden. **Tüm sahne animasyonları
  `@media (prefers-reduced-motion: no-preference)` altında** → azalt tercihinde sahne tamamen statik.
- **`Login.tsx` (FİDAN'a taşındı):** cam form kartı + sekmeli Giriş/Kayıt + slogan yanı ("Her soru,
  fidanını büyütür."). Girdiler FİDAN (odakta yeşil halka `--yaprak`), hata inline samimi Türkçe
  kutu (**önce `message`**; kod yanlışsa nötr — sınıf varlığı sızdırılmaz), gönderirken buton
  devre dışı, her sekmede **TEK birincil buton** (`--cta` orman). Tema geçiş düğmesi (kabuk dışı).
- **`Login3D` (three.js deniz+fener) çıkarıldı:** artık hiçbir yerden import edilmiyor (dosya
  KORUNDU — yalnız kullanım kalktı). `DenizSahnesi`/`Lighthouse`/`webglVarMi` de söküldü.

**Kayıt sadeleşmesi (kullanıcı kararı 2026-07-22, önizleme kaynak):** kayıt formu = **Ad Soyad +
e-posta + şifre + opsiyonel sınıf kodu**. **Sınıf DÜZEYİ**, **rol seçici** ve **okul alanı KALDIRILDI**
— herkes `role:'student'` kaydolur (YKS'ye özel; öğretmen/yönetici hesapları sağlanır). **Auth mantığı
DEĞİŞMEDİ:** `signIn`/`signUp` çağrıları, `class_code` metadata taşıma, ilk-giriş katılım akışı aynı.

### Değişen dosyalar (beyanla birebir)
```
 frontend-v2/src/screens/Login.tsx        | 150 +++++-------  (389 satır dosyada net −89; sadeleşti)
?? frontend-v2/src/components/GirisSahnesi.tsx  (YENİ)
```

### Koşulan kapılar + çıktıları
- **`tsc --noEmit` → SIFIR HATA ✓** `TSC_EXIT=0`
- **`bun run build` → BAŞARILI ✓** `BUILD_EXIT=0` · `✓ built in 1.52s`
- **Login three içermez (kabul #4) — doğrulandı:** `grep -rn Login3D frontend-v2/src` → yalnız yorum
  satırları + `Login3D.tsx` dosyanın kendisi; **hiçbir import yok** → Login3D ölü, `vendor-three`
  (900kB) YALNIZ Bahçem chunk'larında (`Bahce`, `Bahce3D`). Not: `Login` App.tsx'te **eager** import
  (auth öncesi ekran, zaten öyleydi) → `index` chunk'ında; ayrı "Login lazy chunk" yok ama Login'in
  bağımlılık grafiğinde three YOK (GirisSahnesi yalnız `useTheme` çeker). Kriterin amacı (three
  Login yolundan çıktı) sağlandı.

### Gerçekleşen maliyet
**$0** — yalnız kod + tsc/build.

### Açık riskler
1. **Öğretmen self-kayıt kalktı:** rol seçici sökülünce kayıt hep `role:'student'`. Onaylı önizleme +
   footer ("Öğretmenin verdiği hesapla giriş") bu yönde; öğretmen/yönetici hesapları sağlanır. Ürün
   kararı önizlemede onaylı — ama davranışsal etki: bu ekrandan öğretmen kaydı YAPILAMAZ (bilinçli).
2. **`GirisSahnesi` sahne `<style>` bloğu** bileşen içinde (keyframe'ler); house-style Tailwind'e göre
   sıra dışı ama tam-ekran bespoke sahne + motion-safe kapı için en sadık port. `.gs-*` prefiksli, çakışmaz.
3. Sahne SVG'si dekoratiftir (`aria-hidden`); form erişilebilirliği etkilenmez.

### Sonraki adım önerisi
- Onboarding/e-posta onay ekranları da FİDAN'a taşınabilir (ayrı kart).
- İsteğe bağlı: `Login3D.tsx` + `Lighthouse.tsx` ölü dosyaları temizlik kartında silinebilir.

## Günlük
- 2026-07-22 · ORKESTRATÖR · kart açıldı (beklemede; GOREV-006 ✅ — başlatılabilir, ancak GOREV-007 ile dosya kesişimi YOK, paralel çalışabilir)
- 2026-07-22 · FRONTEND · alindi
- 2026-07-22 · FRONTEND · tamamlandi (GirisSahnesi SVG orman+göl [iki tema, motion-safe] + Login FİDAN cam form; kayıt sadeleşti [rol/düzey/okul kalktı, student-only]; Login3D/three çıkarıldı; tsc SIFIR + build YEŞİL, three yalnız Bahçem'de)
- 2026-07-22 · ORKESTRATÖR · onaylandi → arsiv/ (BAĞIMSIZ DENETİM: kendi oturumumda TSC_EXIT=0 + BUILD_EXIT=0; grep Login3D → sıfır import [yalnız yorum + ölü dosya]; Login.tsx'te denizcilik terimi SIFIR; vendor-three yalnız Bahçem yolunda; git status beyanla birebir. "Login eager/index chunk" açıklaması kabul — kriterin amacı [three Login yolundan çıktı] sağlandı. Öğretmen self-kayıt kalkışı onaylı önizlemeyle uyumlu bilinçli ürün kararı olarak kabul [öğretmen/yönetici hesapları sağlanır]. 4 onay ölçütü sağlandı.)
