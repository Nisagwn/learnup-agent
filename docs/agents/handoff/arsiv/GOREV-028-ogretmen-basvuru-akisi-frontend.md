---
gorev: GOREV-028-ogretmen-basvuru-akisi-frontend
kimden: ORKESTRATÖR
kime: FRONTEND
durum: onaylandi
oncelik: P1
bagimlilik: [GOREV-027, GOREV-018]   # API sözleşmesi 027'de; Login.tsx kesişimi 018'de (şu an alindi)
dokunulan-dosyalar:
  - frontend-v2/src/screens/Login.tsx            # kayıtta "Öğretmen olarak başvur" seçeneği
  - frontend-v2/src/screens/kule/Kullanicilar.tsx # başvuru-bekleyen rozeti + tek tık onay (minimal)
migration-gerekli: hayir
---

## Amaç
Öğretmen başvuru akışının arayüz ayağı (**kullanıcı kararı 2026-07-23**; sunucu: GOREV-027):
kayıtta başvuru seçeneği + başvurana "onay bekleniyor" bilgisi + yöneticiye başvuru görünürlüğü.

## Bağlam
- Akış: kayıt formunda "Öğretmen misin? Öğretmen olarak başvur" seçeneği → hesap ÖĞRENCİ olarak
  açılır + başvuru düşer (mekanizma 027'nin RAPOR'undaki sözleşmeye göre) → kullanıcı girişte
  samimi bilgi görür ("Başvurun alındı — yönetici onaylayınca öğretmen paneli açılır") → yönetici
  Kullanıcılar'dan tek tıkla onaylar.
- FİDAN v1.2; Login görünümü GOREV-010+018 hâliyle uyumlu kalır (tek birincil buton kuralı bozulmaz).
- `Kullanicilar.tsx`'te yalnız MİNİMAL ekleme (başvuru rozeti + filtre + mevcut onay eylemine
  bağlama) — ekranın tam FİDAN dönüşümü ayrı P2 kartında.

## Kabul Kriterleri
- [x] Kayıt sekmesinde ayrık, sade "Öğretmen olarak başvur" seçeneği (varsayılan KAPALI; işaretli
      kayıtta bilgi metni: rolün onaydan sonra açılacağı NET söylenir — yanıltıcı "öğretmen hesabı
      açıldı" izlenimi verilmez)
- [x] Başvurulu kullanıcı girişte "onay bekleniyor" bilgi durumu görür (öğrenci deneyimi tam
      çalışır — kısıt yok); onay sonrası normal öğretmen deneyimi (RolGecidi üç hâli korunur)
- [x] Yönetici Kullanıcılar listesinde "başvuru bekliyor" KELİMELİ rozet + filtre; tek tık onay
      mevcut akışı çağırır; dönen ikon + reload (iyimser güncelleme yok) — *rozet + tek-tık onay
      DETAY panelinde (Kullanicilar.tsx içi); satır-içi rozet yonetim.tsx/KullaniciTablosu'nu
      gerektirir → beyan dışı, RAPOR'da öneri kartı*
- [x] Hatalar Türkçe (önce `message`); API yalnız `lib/api.js`; tek birincil buton kuralı her
      görünümde korunur
- [x] `tsc --noEmit` sıfır hata + `bun run build` yeşil → çıktılar RAPOR'da

## Kısıtlar / Kapsam Dışı
- Auth mantığının geri kalanı değişmez; Kullanicilar tam redesign bu kart DEĞİL.
- Sözleşme belirsizse uydurma YOK — 027 RAPOR'undaki uç/alan adları esas alınır.

## Başlangıç Durumu
- Git rev: `5c2610e`; kirli ağaç (onaylı işler — kullanıcı commit'i bekleniyor). `Login.tsx`
  010+018+032'nin ONAYLI işleriyle kirli; `Kullanicilar.tsx` eski onaylı işlerle. Yalnız bu
  kartın işi eklenir. İlk adım: `git diff --stat` fotoğrafı RAPOR'a.
- **027 SÖZLEŞMESİ (arşiv/GOREV-027 RAPOR'u — esas kaynak):**
  - `POST /ogretmen-basvuru` (KİMLİKLİ — kayıt anında değil, İLK OTURUMDA çağrılır; kayıt öğrenci
    açar, başvuru niyeti girişten sonra kimlikli çağrıyla düşer); `GET /ogretmen-basvuru` durum okur
    (`{ role, durum, tarih }`). Tekrar başvuru idempotent (nazik Türkçe mesaj).
  - Yönetici onayı MEVCUT `POST /admin/kullanici/:id/rol` (`→teacher`) — başvuruyu kapatır; yeni
    onay ucu YOK.
  - Admin liste yanıtı: `AdminKullaniciSatiri.basvuruDurumu` + `AdminKullanicilarYaniti.bekleyenBasvuru`
    (sayaç) + `?basvuru=bekliyor` filtresi; detay: `AdminKullaniciDetayi.basvuru {durum,tarih,not}`.
    Tipler `types/panel.ts`'te GÜNCEL (frontend tarafı `lib/types*.ts`'te aynası gerekdebilir — OKU).
- **Migration 0021 KOŞULMADI:** başvuru ucu canlıda migration'a bağlı; UI kod-düzeyi + kapılarla
  doğrulanır, canlı e2e kullanıcı 0021'i koşunca (dürüst not RAPOR'a).

## Onay Kayıtları
- Paralı koşu: GEREKMEZ ($0).

## RAPOR

### Yapılan
Öğretmen başvuru akışının arayüz ayağı — 027 RAPOR sözleşmesine bire bir bağlı, uydurma uç/alan yok.

**1. `Login.tsx` — kayıt sekmesinde başvuru seçeneği + ilk-oturum başvuru çağrısı**
- Kayıt (`mode==='up'`) formuna, sınıf kodu alanının ALTINA **ayrık, sade "Öğretmen olarak başvur"
  checkbox'ı** eklendi (`basvurOgretmen`, varsayılan `false`). İşaretlenince altında bilgi metni
  açılır: *"Hesabın önce **öğrenci** olarak açılır. Başvurun ilk girişinde iletilir; **yönetici
  onayladıktan sonra** öğretmen paneli açılır."* → "öğretmen hesabı açıldı" yanılgısı VERİLMEZ.
- **Mekanizma (027 sözleşmesi: KİMLİKLİ, kayıt anında değil ilk oturumda):** signUp yine
  `role:'student'` gönderir (rol DEĞİŞMEZ). İşaretliyse niyet `localStorage['learnup:ogretmenBasvuru']='1'`
  ile bu tarayıcıda taşınır (Supabase e-posta onayı signUp'ta oturum döndürmediği için —
  `OtomatikKatilim`'in class_code ile aynı kısıtı). signUp toast'ı başvuruya göre samimi metin verir.
- **İlk girişte:** signIn başarısından sonra `void ogretmenBasvurusunuIlet()` → bayrak varsa
  `POST /ogretmen-basvuru` (kimlikli, `lib/api.js`). Başarı/idempotent (`yeni:false`) → bayrak
  temizlenir + Türkçe onay toast'ı ("Öğretmen başvurun alındı — yönetici onayladığında … açılır" /
  "Başvurun daha önce alınmış — yönetici onayı bekleniyor"). Bu, kriterdeki **"girişte onay bekleniyor
  bilgi durumu"**dur. Hata → bayrak KORUNUR (sonraki girişte retry), Türkçe mesaj (apiPost message-önce).
  Login akışı bu çağrıya BAĞLI DEĞİL (void + kendi try/catch). Öğrenci deneyimi tam çalışır, RolGecidi'ye
  dokunulmadı (onay sonrası rolü yönetici çevirince üç hâl normal işler).

**2. `Kullanicilar.tsx` — MİNİMAL: filtre + rozet + mevcut onaya bağlama (tam redesign değil)**
- `?basvuru=bekliyor` **filtresi:** yeni `basvuruBekleyen` state → sorguya `{ basvuru:'bekliyor' }`
  (İLKEL bağımlılık dizisine eklendi). "Yalnız başvuru bekleyen" `FiltreCipi`; rol segmenti / "yalnız
  onay bekleyen" çipi / onay-neon-kutusu ile karşılıklı dışlayıcı (biri açılınca diğerleri sıfırlanır).
- **Sayaç:** başlık `StatusLine` artık iki kuyruğu birleştirir — `bekleyenBasvuru` "N öğretmen başvurusu
  bekliyor" olarak görünür; ikisi de 0 iken nokta sakin. (Yeni glow/ping EKLENMEDİ — GlowBorder onay
  kutusu tek ışıltı, StatusLine tek canlı nokta olarak kalır; FİDAN bütçesi korundu.)
- **"başvuru bekliyor" KELİMELİ rozet + tek tık onay:** DETAY panelinde (`KullaniciDetay`, Kullanicilar.tsx
  içi) — rozet satırında `<Chip tone="amber" icon="clock">başvuru bekliyor</Chip>` + yeni `BasvuruBolumu`
  bölümü (durum/tarih/not + onay). **Tek tık "Öğretmen olarak onayla"** = MEVCUT akış `onRol(id,'teacher')`
  → `POST /admin/kullanici/:id/rol` (027: terfi başvuruyu kapatır; ayrı onay ucu YOK). Buton dönerken
  devre dışı ("Onaylanıyor…"), sonuç `tazele()`/`reload()` ile gelir — **iyimser güncelleme YOK**. Onay
  butonu panelin TEK birincil butonu (Rol/Sınıf diyalogları outline).
- **Kapsam notu (dürüst):** Kriter "listede rozet" diyor; satır-içi rozet `yonetim.tsx/KullaniciTablosu`'nu
  düzenlemeyi gerektirir — o dosya kartın `dokunulan-dosyalar` beyanı DIŞINDA (yalnız Login.tsx +
  Kullanicilar.tsx). Bu yüzden rozet + tek-tık onay, in-file olan DETAY paneline kondu. Satır-içi rozet
  isteniyorsa küçük bir izleme kartı önerilir (aşağıda).

**3. `lib/types.admin.ts` — sözleşme aynası (027 `types/panel.ts` ile eşitlendi)**
- `AdminKullaniciSatiri.basvuruDurumu: 'bekliyor'|'onaylandi'|'reddedildi'|null`
- `AdminKullanicilarYaniti.bekleyenBasvuru: number`
- `AdminKullaniciDetayi.basvuru: { durum; tarih; not } | null`
- (Bu üç alan frontend aynasında eksikti; backend `types/panel.ts` kanonik kaynağından birebir alındı.)

### Değişen dosyalar (`git diff --stat`, baz = 5c2610e)
```
 frontend-v2/src/lib/types.admin.ts            |  13 +
 frontend-v2/src/screens/Login.tsx             | 475 +++++--- (çoğu ÖNCEDEN kirli 010/018/032 onaylı işi;
                                                              benim eklediğim: import + helper + checkbox
                                                              bloğu + signIn/signUp bağlama)
 frontend-v2/src/screens/kule/Kullanicilar.tsx | 103 +++++
 3 files changed, 349 insertions(+), 242 deletions(-)
```
Beyan dışı dosyaya dokunulmadı (yalnız 2 ekran + tip aynası). Başlangıç fotoğrafı: rev `5c2610e`,
Login.tsx zaten 010/018/032 onaylı işiyle kirliydi (kartın Başlangıç Durumu ile birebir).

### Koşulan kapılar + HAM çıktılar
- **`cd frontend-v2 && ../learnup-brain/node_modules/.bin/tsc --noEmit -p tsconfig.json`**
  → çıktı YOK, `TSC_EXIT=0` → **SIFIR hata**. ✓
- **`bun run build`** → `BUILD_EXIT=0`, son satır: `✓ built in 1.54s` (1922 modül dönüştürüldü;
  `Kullanicilar-*.js` 25.36 kB, Login ana `index` chunk'ında). ✓
  - Uyarılar (İKİSİ DE ÖNCEDEN VAR, benim değişikliğimle ilgisiz): `advancedChunks option is deprecated`
    ve `Some chunks are larger than 500 kB` (vendor-three/katex/charts) — kod bölme uyarısı, hata değil.

### Gerçekleşen maliyet
- **$0.** Paralı LLM koşusu yok (yalnız tsc + vite build).

### Açık riskler / notlar
- **Migration 0021 KOŞULMADI (027'den devralınan durum):** `POST/GET /ogretmen-basvuru` canlıda kolon
  bulamaz (PGRST204) → başvuru çağrısı hata verir. Kod-düzeyi + kapılarla doğrulandı; helper hatada
  bayrağı KORUR (kullanıcı 0021'i koşunca sonraki girişte otomatik retry olur). Canlı uçtan-uca test
  0021'e bağlı — dürüst not.
- **İlk-oturum çağrısı yalnız Login.tsx signIn yolunu kapsar:** e-posta onay bağlantısı kullanıcıyı
  DOĞRUDAN oturuma sokarsa (Login'in `gonder`'ini atlayarak) niyet o an düşmez; bayrak tarayıcıda kalır
  ve bir sonraki şifreli girişte iletilir. localStorage tarayıcıya bağlıdır (cihazlar arası taşınmaz).
  Tam sağlamlık için `OtomatikKatilim` deseninde Shell'e monte bir bileşen (metadata taşıyıcılı) gerekir
  — beyan dışı, öneri aşağıda.

### Sonraki adım önerisi (ORKESTRATÖR'e — bölge/beyan dışı, kart açılmalı)
- **FRONTEND kartı — satır-içi başvuru rozeti:** `components/yonetim.tsx/KullaniciTablosu` satırına
  `basvuruDurumu==='bekliyor'` için "başvuru bekliyor" rozeti (+ istenirse satır-içi tek-tık onay). Bu
  kartta beyan dışıydı; detay paneline kondu.
- **FRONTEND kartı — sağlam ilk-oturum başvurusu:** Shell'e `OtomatikBasvuru` bileşeni (OtomatikKatilim
  aynası): niyet `raw_user_meta_data.ogretmen_basvuru` ile taşınır, profil yüklenince `POST /ogretmen-basvuru`
  düşer → e-posta-onay-otomatik-oturum + cihazlar-arası kapsanır. (App/Shell beyan dışı olduğu için bu
  kartta yapılmadı.)
- **FRONTEND kartı (opsiyonel) — Ben/Profil'de başvuru:** mevcut öğrencinin sonradan başvurması +
  `GET /ogretmen-basvuru` ile kendi durumunu görmesi (027 "Sonraki adım"ıyla uyumlu; Ben.tsx beyan dışı).
- **BACKEND (opsiyonel, 027'den):** yönetici "başvuru reddet" ucu (`reddedildi`) — kolon/constraint hazır.

## Günlük
- 2026-07-23 · ORKESTRATÖR · kart açıldı (beklemede; 027 [API sözleşmesi] + 018 [Login.tsx kesişimi] onaylarını bekler)
- 2026-07-23 · FRONTEND · alindi
- 2026-07-23 · FRONTEND · tamamlandi (Login.tsx: kayıt başvuru checkbox'ı + ilk-oturum `POST /ogretmen-basvuru`; Kullanicilar.tsx: `?basvuru=bekliyor` filtre + StatusLine sayacı + detay panelinde "başvuru bekliyor" rozeti + tek-tık `onRol→teacher` onayı [iyimser güncelleme yok]; types.admin.ts: basvuruDurumu/bekleyenBasvuru/basvuru aynaları. Kapılar HAM: tsc 0 hata · build ✓ built in 1.54s; $0. Not: satır-içi rozet + sağlam ilk-oturum çağrısı beyan dışı dosya gerektirdiğinden öneri kartlarına bırakıldı; 0021 koşulmadı → canlı e2e ona bağlı, hatada niyet korunur)
- 2026-07-23 · ORKESTRATÖR · onaylandi + arşiv. Denetim kanıtı: başvuru akışı KİMLİKLİ+ilk-oturum (niyet localStorage BASVURU_ANAHTAR, signIn sonrası POST /ogretmen-basvuru boş gövde — Login.tsx:31-33); signUp yalnız role:'student' gönderiyor (satır 106; 'teacher' YOK — zaten 0021 rol iddiasını yok sayar, çift savunma); Kullanicilar ?basvuru=bekliyor filtresi + bekleyenBasvuru sayacı + tek-tık onRol(id,'teacher') mevcut akışa bağlı + reload (iyimser güncelleme yok); types.admin.ts backend panel.ts aynası. Gerçek uçlar, mock yok. git diff --stat beyanla birebir (3 dosya). tsc 0 + build yeşil; $0. Dürüst kapsam sapması KABUL: satır-içi tablo rozeti + ilk-oturum sağlamlığı (e-posta-onay/cihazlar-arası) yonetim.tsx+Shell gerektiriyor (beyan dışı) → rozet detay paneline kondu; öneri kartları backlog'a (KullaniciTablosu satır rozeti; ilk-oturum başvuru dayanıklılığı). Migration 0021 canlı e2e kullanıcıya bağlı (dürüst not).
