---
gorev: GOREV-014-koc-ekrani-fidan
kimden: ORKESTRATÖR
kime: FRONTEND
durum: onaylandi
oncelik: P1
bagimlilik: [GOREV-006, GOREV-007]   # ikisi de ✅ — BAŞLATILABİLİR; inline FİDAN deseni (007 emsali)
dokunulan-dosyalar:
  - frontend-v2/src/screens/Kaptan.tsx   # ekran kod adı değişmez; görünen ad "Koç"
migration-gerekli: hayir
---

## Amaç
Koç sohbet ekranını **kullanıcı onaylı önizlemeyle** hizalamak:
`docs/design/onizleme/koc.html` (2026-07-22 onayı — kaynak referans BUDUR).

## Bağlam
- Tasarım: TASARIM-DILI v1.2. İçerik: EKRAN-HARITASI §6. **Inline FİDAN deseni** (ui.tsx'e yazılmaz).
- **Mevcut davranış KORUNUR** (Kaptan.tsx'te hepsi hazır — bu kart yalnız sunumu taşır):
  - Süreklilik: açılışta `GET /chat/history` son oturumu yükler; "yeni sohbet" temiz sessionId.
  - Akış: `streamChat` (SSE, `lib/api.js`); **akış sırasında ham metin, bitince MathMarkdown**
    (KaTeX titreme önlemi — bu incelik bozulmaz).
  - Araç çipleri (`Tool {label, done}`): önizlemedeki **"Verilerine bakıyor" etiketi bu GERÇEK
    araç olaylarından** beslenir; araç yoksa etiket hiç görünmez.
  - **Bağlam-duyarlı öneri çipleri korunur:** `/practice/suggest`'ten zayıf konu adı enjekte eden
    mevcut dinamik mantık, önizlemedeki üç sabit çipten İYİDİR — sabitlenmez, yalnız FİDAN kesikli
    çip stiline taşınır.
- **Soru bağlamı çipi (zenginleştirme [HAZIR]):** nav state ile soru bağlamı gelirse toprak-tonlu
  çip + istemin başına bağlam eklenir. GÖNDEREN uç (sonuç ekranındaki "Bu soruyu açıkla" köprüsü)
  bu kartın DIŞI — `Coz.tsx` GOREV-008'de aktif olabilir; köprü ayrı küçük işle bağlanır (RAPOR'a not).

## Kabul Kriterleri
- [x] Görünüm iki temada da önizlemeyle eşleşir: başlık (FİDAN koç avatarı + tanım + geçmiş notu) ·
      balonlar (koç solda cam, ben sağda yeşil ton) · araç etiketi (yalnız gerçek araç olayında,
      nabızlı nokta) · yazıyor üç-nokta göstergesi (`aria-label`lı) · öneri çipleri (dinamik mantık
      korunarak kesikli stil) · giriş satırı (odakta yeşil halka; sayfanın **TEK birincil "Gönder"**)
- [x] Akış davranışı korunur: gönderirken giriş+buton devre dışı; akış kesilirse balonda samimi
      Türkçe hata (**önce `message`**); MathMarkdown bitişte; oto-kaydırma korunur
- [x] Geçmiş boşsa karşılama görünümü (mevcut `HOSGELDIN` FİDAN diliyle) — sahte konuşma
      render edilmez (null≠0)
- [x] Dürtmeler/bildirimler bu ekranda YOK (kabuk zilinde — EKRAN-HARITASI §6)
- [x] Denizcilik görseli `Captain` bu ekrandan çıkar → FİDAN koç avatarı (dosya silinmez,
      kullanım kalkar; ürün personası görünen adıyla "Koç")
- [x] `prefers-reduced-motion`: yazıyor noktaları, etiket nabzı, balon giriş animasyonları statik
- [x] `tsc --noEmit` sıfır hata + `bun run build` yeşil → çıktılar RAPOR'da (TSC_EXIT=0, BUILD_EXIT=0)

## Kısıtlar / Kapsam Dışı
- `streamChat`/`lib/api.js`, `MathMarkdown.tsx` dokunulmaz; yeni backend ucu istenmez.
- `/chat` SSE + compression kuralları backend bölgesi — bu kartın dışı.
- `components/ui.tsx`, `cekirdek.tsx`, `fx.tsx` dokunulmaz (inline FİDAN).

## Başlangıç Durumu
- Git rev: `5c2610e` (branch `feat/yks-brain`); kirli ağaç ~57 kayıt — onaylı işler (kullanıcı
  commit'i hâlâ bekleniyor). `Kaptan.tsx` GOREV-002'den kirli — yalnız bu kartın işi eklenir.
  İlk adım: `git diff --stat` fotoğrafı RAPOR'a.

## Onay Kayıtları
- Paralı koşu: GEREKMEZ ($0 — geliştirmede SSE tetiklenmesi gerekmiyor; manuel duman testi
  kullanıcı oturumunda).

## RAPOR

### Yapılan
Koç ekranı onaylı önizleme `docs/design/onizleme/koc.html` ile hizalandı — **inline FİDAN deseni**
(GOREV-007 emsali; `ui.tsx`/`cekirdek`/`fx` dokunulmadı). **Davranış katmanı aynen KORUNDU**, yalnız
sunum taşındı:

- **Başlık:** `Captain` görseli ekrandan çıktı (dosya duruyor, kullanım kalktı) → FİDAN koç avatarı
  (adaçayı→yaprak gradyan + 🌿 + statik durum noktası) · "Koç" (Outfit) · tanım satırı "Çalışma
  verilerini görebilen kişisel rehberin" · **geçmiş notu** ("↑ yukarı kaydır: eski mesajlar" — yalnız
  history gerçekten yüklendiyse görünür, dürüst) · "yeni sohbet" hayalet buton 44px'e büyütüldü.
- **Balonlar:** koç solda mat/cam yüzey (`--mat` + `--cam-kenar`, sol-üst 6px), ben sağda yeşil ton
  (`#DDEBE0` açık / `#23402C` koyu — önizlemenin `--balon-ben` değerleri, iki tema `.dark` ile).
  **Akış sırasında ham metin + yanıp sönen imleç, bitişte MathMarkdown** inceliği bozulmadı (imleç
  JS interval'den motion-safe CSS'e taşındı — davranış aynı, reduced-motion'da statik).
- **Araç etiketi:** gerçek `tool` SSE olaylarından beslenen `Tool {label,done}` mantığı aynen durur;
  görünüm FİDAN `arac-etiketi` (v1 zemin + vurgu metin + **nabızlı yaprak nokta**; bitince kelime+✓
  ikon — "asla yalnız renk"). Araç yoksa etiket HİÇ render edilmez.
- **Yazıyor göstergesi:** akış başladı + henüz token yok → balonda üç-nokta (`role="status"`,
  `aria-label="Koç yazıyor"`, zıplama motion-safe).
- **Öneri çipleri:** `/practice/suggest` zayıf-konu enjeksiyonlu DİNAMİK mantık aynen korundu
  (sabitlenmedi) — yalnız kesikli adaçayı FİDAN çip stiline taşındı.
- **Giriş satırı:** çökük `--ic` kutu, odakta yeşil halka (yaprak kenar + 3px yumuşak halka);
  placeholder "Koç'a yaz… (matematik yazımı desteklenir)"; **sayfanın TEK birincil eylemi "Gönder"**
  (`--cta` dolgu, ≥44px) — gönderirken giriş + Gönder + çipler devre dışı (giriş `disabled`'ı bu
  kartla EKLENDİ, kriter gereği).
- **Karşılama (geçmiş boş):** HOSGELDIN artık sahte ilk balon değil — geçmiş boşsa ortalanmış
  karşılama görünümü (🌿 + "Merhaba, ben Koç!" + mevcut metnin FİDAN birleşimi) + 4 hızlı eylem
  kesikli kartı. Geçmiş varsa yalnız GERÇEK konuşma render edilir (null≠0).
- **Soru bağlamı çipi [HAZIR köprü]:** `nav('/kaptan', { state: { soruBaglami: { ozet, istem } } })`
  sözleşmesi alıcı tarafta kuruldu — bağlam gelirse giriş alanında toprak-tonlu çip (× ile
  kaldırılabilir, `aria-label`lı) ve İLK istemin başına `istem` eklenir; gönderilen kullanıcı
  balonuna çip iliştirilir. Bağlam yoksa çip hiç render edilmez. **GÖNDEREN uç bu kartın dışı** —
  `Coz.tsx` sonuç ekranındaki "Bu soruyu açıkla" köprüsü ayrı küçük iş (aşağıda öneri).
- **Hata dili:** akış `error` olayında önce `data.message` sonra `data.error` (lib/api.js sırası);
  balon metni samimi — "Bağlantı koptu — son mesajını yeniden gönderebilirsin." (kısmi metin
  geldiyse metin korunur, altına not düşülür). Ağ hatasında "Koç'a şu an ulaşılamadı (…)".
- **Hareket:** balon girişleri `useReducedMotion` kapılı framer-motion (≤0.3s); üç-nokta, araç nabzı,
  imleç yanıp sönmesi yalnız `@media (prefers-reduced-motion: no-preference)` bloğunda — azaltmada
  hepsi statik. Oto-kaydırma azaltmada `smooth`→`auto`.
- **Bütçeler:** bulanık yüzey 2 (başlık + giriş bandı; balonlar mat) ≤3 · kalıcı ışıltı 0 ·
  kehribar yok · dürtme/bildirim yok (kabuk zilinde).
- **Süreklilik:** `GET /chat/history` son oturum yükleme + `sessionId` devralma + "yeni sohbet"
  temiz oturum + abort temizliği aynen korundu; `streamChat`/`lib/api.js`/`MathMarkdown` dokunulmadı.

### Değişen dosyalar (`git diff --stat` — bu kart)
```
 frontend-v2/src/screens/Kaptan.tsx | 324 +++++++++++++++++++++++--------------
 1 file changed, 204 insertions(+), 120 deletions(-)
```
Başlangıç fotoğrafı: kirli ağaç 54 dosya (+1904/−1574, diğer onaylı kartların bekleyen işi);
`Kaptan.tsx` başlangıçta GOREV-002'den 2+/2− kirliydi — bu kart yalnız kendi işini ekledi, beyan
dışı dosyaya dokunulmadı.

### Koşulan kapılar + çıktıları (HAM)
- `../learnup-brain/node_modules/.bin/tsc --noEmit -p tsconfig.json` → **`TSC_EXIT=0`** (sıfır hata, çıktı boş)
- `bun run build` → **`BUILD_EXIT=0`** · `✓ built in 1.54s`
  ```
  dist/assets/Kaptan-BSX2Xp8w.js    13.93 kB │ gzip: 4.73 kB
  ```
  (">500 kB" three.js uyarısı hata değil — GOREV-005'te belgelendi.)

### Gerçekleşen maliyet
**$0** — SSE sohbeti geliştirmede TETİKLENMEDİ (kart kuralı); yalnız kod + tsc/build.

### Açık riskler
1. **Duman testi kullanıcı oturumunda:** SSE akışı, araç olayları ve history geliştirmede
   tetiklenmediği için akış davranışı kod-inceleme düzeyinde doğrulandı (mantık birebir korunarak
   taşındı) — canlı doğrulama kullanıcının manuel testinde.
2. **Öneri çipi tık hedefi ~34px** (önizlemedeki 6px/13px pedin biraz üstü, 7px/14px): FİDAN §15
   "≥44px" ile önizleme çip ölçüsü çelişiyor — onaylı önizlemeye sadık kalındı; büyütme istenirse
   TASARIM-DILI kararı gerekir. Birincil "Gönder" ve yeni-sohbet butonu ≥44px.
3. **"Yukarı kaydır: eski mesajlar" notu** yüklü SON OTURUM içinde kaydırmayı anlatır — sayfalı
   "daha eski oturumları getir" ucu yok (history tek oturum döner); sonsuz kaydırma istenirse
   BACKEND ucu gerekir.
4. **Gün ayracı ("Bugün") atlandı:** önizlemede var ama `Msg` modeli `created_at` taşımıyor ve
   kabul kriterlerinde yok — tarih uydurulmadı (null≠0).
5. `location.state` sayfa yenilemede kalıcıdır — yenilemede bağlam çipi yeniden görünür (× ile
   kaldırılabilir); zararsız, istenirse köprü işinde `replace: true` ile temizlenir.

### Sonraki adım önerisi
- **FRONTEND (küçük iş):** `Coz.tsx` sonuç ekranına "Bu soruyu açıkla" köprüsü —
  `nav('/kaptan', { state: { soruBaglami: { ozet: 'az önce çözdüğün <Ders> sorusu', istem: '<soru + şıklar + öğrencinin cevabı>' } } })`
  sözleşmesi bu kartla alıcı tarafta HAZIR.
- **BACKEND (istenirse):** sayfalı sohbet geçmişi ucu (eski oturumları yukarı kaydırınca yükleme).
- Nav/⌘K'daki Koç ikonu hâlâ `anchor` (denizcilik) — kabuk/nav FİDAN kartında `chat`/`sprout`a dönmeli.

## Günlük
- 2026-07-22 · ORKESTRATÖR · kart açıldı (BAŞLATILABİLİR — önizleme onayı "onaylıyorum" 2026-07-22; 006+007 ✅; 008/009/011/013 ile dosya kesişimi YOK, paralel çalışabilir)
- 2026-07-23 · FRONTEND · alindi
- 2026-07-23 · FRONTEND · tamamlandi (Kaptan.tsx inline FİDAN — önizleme hizası + davranış korundu [history/SSE ham-metin→KaTeX/gerçek araç çipleri/dinamik öneri çipleri]; Captain kullanım dışı; soru-bağlamı alıcı köprüsü hazır; tsc SIFIR + build YEŞİL; $0)
- 2026-07-23 · ORKESTRATÖR · onaylandi → arsiv/ (DENETİM: grep — Captain importu SIFIR, streamChat/MathMarkdown/history/dinamik-çip wiring'i yerinde; diff yalnız beyanlı dosya; kapı çıktıları ham. KABUL EDİLEN SAPMALAR: çip tık hedefi ~34px [önizlemeye sadakat > §15; TASARIM-DILI kararı backlog], gün ayracı atlandı [created_at yok — null≠0 doğru]. BACKLOG'A: Coz→Koç "Bu soruyu açıkla" gönderen köprüsü [alıcı sözleşme hazır], nav/⌘K çapa ikonu FİDAN'a [kabuk temizliği devamı], sayfalı geçmiş ucu [BACKEND, istenirse]. Tam-ağaç konsolide kapı dalga sonunda. 4 ölçüt sağlandı.)
