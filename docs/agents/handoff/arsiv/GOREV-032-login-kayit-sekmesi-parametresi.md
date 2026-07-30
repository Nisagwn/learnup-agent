---
gorev: GOREV-032-login-kayit-sekmesi-parametresi
kimden: ORKESTRATÖR
kime: FRONTEND
durum: onaylandi
oncelik: P1   # kullanıcı talebinin tamamlayıcısı: "butonla giriş ya da kaydola geçilmeli"
bagimlilik: [GOREV-023]   # ✅ arşivde — ?sekme=kayit URL'leri hazır
dokunulan-dosyalar:
  - frontend-v2/src/screens/Login.tsx
migration-gerekli: hayir
---

## Amaç
Tanıtım sayfasındaki "Ücretsiz başla" niyetinin tamamlanması: `/giris?sekme=kayit` ile gelen
kullanıcıya Giriş ekranı **kayıt sekmesi açık** başlar. (GOREV-023 RAPOR notu — Login param
desteği yoktu; URL'ler zaten `?sekme=kayit` taşıyor.)

## Kabul Kriterleri
- [x] `useSearchParams` ile `sekme=kayit` okunur → başlangıç modu kayıt; parametre yok/başka
      değer → mevcut davranış (giriş sekmesi). Sekme değiştirme/auth mantığı DEĞİŞMEZ
- [x] Kimlikli kullanıcının `/giris` → `/` redirecti etkilenmez (App.tsx dokunulmaz)
- [x] `tsc --noEmit` sıfır hata + `bun run build` yeşil → HAM çıktılar RAPOR'da; **$0**

## Kısıtlar / Kapsam Dışı
- Yalnız başlangıç-modu seçimi; Supabase akışı, hata eşlemesi, görsel değişiklik YOK.

## Başlangıç Durumu
- Git rev: `5c2610e`; kirli ağaç (onaylı işler). `Login.tsx` 018'in ONAYLI işiyle kirli —
  yalnız bu kartın işi eklenir.

## Onay Kayıtları
- Paralı koşu: GEREKMEZ ($0).

## RAPOR

### Yapılan
`Login.tsx` iki dokunuş (toplam +7 satır, davranışın geri kalanı DEĞİŞMEDİ):
1. `import { useSearchParams } from 'react-router-dom'` eklendi (Login her zaman Router
   içinde render edilir — App.tsx kimliksiz `*` rotası).
2. Başlangıç modu parametreden:
   `const [mode, setMode] = useState<'in' | 'up'>(params.get('sekme') === 'kayit' ? 'up' : 'in')`
   — yalnız İLK mount'ta okunur (useState başlangıç değeri); parametre yok/başka değer → `'in'`
   (mevcut davranış). Sekme butonları, `setMode`, Supabase akışı, hata eşlemesi, görsel: DOKUNULMADI.

Akış notu: Tanıtım → "Ücretsiz başla" → `/giris?sekme=kayit` rota geçişi `index`→`*` eşleşme
değişimi olduğundan Login YENİDEN mount olur → başlangıç değeri her CTA tıklamasında taze okunur
(bayat-mount riski yok). Kimlikli `/giris` → `/` redirecti App.tsx'te ve App.tsx'e DOKUNULMADI.

### Değişen dosyalar (beyanla birebir)
```
 frontend-v2/src/screens/Login.tsx | 411 ++++++++++++++++----------------------
 1 file changed, 176 insertions(+), 235 deletions(-)   (kümülatif: 010+018 onaylı işleri + bu kartın +7 satırı)
```
+ kart dosyası. Başka dosyaya yazılmadı.

### Koşulan kapılar + ham çıktı (KENDİ oturumumda, düzenleme SONRASI)
- `../learnup-brain/node_modules/.bin/tsc --noEmit -p tsconfig.json` → `TSC_EXIT=0` ✓ (sıfır hata)
- `bun run build` → `✓ built in 1.62s` · `BUILD_EXIT=0` ✓ (tek uyarı önceden mevcut chunk-boyut
  uyarısı — vendor-three 897 kB vb.)

### Gerçekleşen maliyet
**$0**.

### Açık riskler
- Tarayıcı smoke turu koşulmadı (araç yok) — kod-düzeyi doğrulama + kapılar; GOREV-023 için
  önerilen QA ekran turuna tek maddedir ("Ücretsiz başla → kayıt sekmesi açık").
- Kenar durum (bilinçli, zararsız): kimliksiz derin bağlantı da Login'i render eder (`*` rotası) —
  `/rota?sekme=kayit` gibi bir URL kayıt sekmesiyle açılır; ürün akışında bu URL üretilmiyor.

### Sonraki adım önerisi
- Yok (kart tek amaçlıydı). GOREV-033'e geçiliyor (zincir).

## Günlük
- 2026-07-23 · ORKESTRATÖR · kart açıldı (kaynak: GOREV-023 RAPOR notu + kullanıcı talebi "butonla giriş ya da kaydola geçilmeli"; 023'ü bitiren ajana zincirlendi)
- 2026-07-23 · FRONTEND · alindi
- 2026-07-23 · FRONTEND · tamamlandi (useSearchParams ile `sekme=kayit` → başlangıç modu kayıt, +7 satır; auth/görsel/sekme mantığı değişmedi; App.tsx dokunulmadı. Kapılar: tsc EXIT=0 · build EXIT=0 "✓ built in 1.62s". Maliyet $0.)
- 2026-07-23 · ORKESTRATÖR · onaylandi + arşiv. Denetim kanıtı: Login.tsx:44-45 useSearchParams + `sekme=kayit`→'up' başlangıç modu bizzat okundu (yalnız ilk mount, fallback mevcut davranış, NEDEN yorumu yerinde); App.tsx dokunulmamış; tsc 0 + build yeşil; $0. Kenar durum (kimliksiz derin bağlantıda parametre) zararsız — ürün URL üretmiyor, kabul.
