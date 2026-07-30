# 🌿 LearnUp Tasarım Dili — FİDAN (v1.2 — "Soft Doğa" revizyonu)

> Organik Doğa & Tech · **AÇIK TEMA ÖNCELİKLİ** · FRONTEND ajanının kaynak gerçeği.
> **Yürürlük: ONAYLANDI (2026-07-21) — FİDAN yürürlüktedir; COASTAL emeklidir.** `VERDENT.md`
> §3.6 ve `YKS-BEYIN-SISTEM-MIMARISI.md` §14 buraya işaret eder. Bir bütçe/kural değişikliği
> önce buraya yazılır (kart + onay), sonra koda.
>
> **v1.2 (2026-07-22, kullanıcı direktifi):** palet yumuşadı (adaçayı/keten zemin + derin orman
> yeşili vurgu), **buzlu cam kart standart oldu** (mat-öncelik kuralı kalktı), buton/rozet radius
> 12'ye indi, günlük hedef halkaya döndü, ısı matrisi tek-renk 4 tona sakinleşti, "her ekranda
> TEK birincil eylem" kuralı eklendi. v1.1 zümrüt paleti geçersizdir.

## 1. Vizyon ve His

**Ad: FİDAN** — öğrenme = büyüme. "Bahçem" oyunlaştırması temanın merkezi; denizcilik konsepti
(güverte/fener/yakamoz/kaptan köşkü) **tamamen söküldü**.

- **His:** Hay Day'in sıcak, davetkâr doğallığı + Brilliant/Duolingo'nun enerjik öğrenme havası +
  premium sakinlik. Gün ışığının süzüldüğü **aydınlık, ferah, canlı** bir orman; gözü yormayan,
  nefes aldıran, "yaşayan" bir arayüz.
- **İki tema:** **Gün Işığı** (açık — VARSAYILAN): aydınlık orman, krem/akçaağaç sıcaklığı, taze
  orman tabanı. **Gece Ormanı** (koyu — tercihe bağlı ikincil): ay ışığında derin orman.
  Kasvetli/karanlık yüzeyler varsayılanda YOKTUR.
- **Su esintisi:** doğanın kenarında sakin bir göl — `su` turkuazı yalnız bilgi/analitik
  vurgularında, az ve sakin.
- **Moodboard:** orman kanopisi · filiz · yaş halkaları · kehribar (ağaç reçinesi) · akçaağaç ·
  bal/amber ışık · yosun · sabah çayırı.

## 2. Renk Sistemi (tasarım token'ları; VARSAYILAN mod = Gün Işığı)

### ☀️ Gün Işığı (AÇIK — varsayılan) — v1.2 Soft Doğa

| Token | Değer | Kullanım |
|---|---|---|
| `zemin/gradyan` | `#F4F7F4 → #E8EFE9` (160°) | Sayfa arka planı — yumuşak adaçayı/keten gradyanı |
| `cam/dolgu` | `rgba(255,255,255,0.78)` | **STANDART KART: buzlu cam** — `backdrop-filter: blur(16px)` |
| `cam/kenar` | `rgba(46,79,58,0.08)` | Cam kart kenarı (1px) |
| `zemin/mat` | `#FBFDFB` | Mat ikiz — kaydırılan yoğun listelerde (blur'suz, perf) |
| `zemin/ic` | `#EDF2ED` | Çökük iç yüzey: girişler, çubuk rayları, iç bloklar |
| `cizgi` | `rgba(34,76,56,0.06)` | Hairline — yok denecek kadar yumuşak |
| `metin/1` | `#183121` | Başlıklar (koyu doğal yeşil) |
| `metin/2` | `#4A5D4E` | Gövde metni |
| `metin/3` | `#7C8F80` | Silik metin, placeholder |
| `orman/700` | `#1E4620` | **Baskın CTA dolgusu** — ekranın TEK birincil eylemi (üzeri beyaz) |
| `orman/600` | `#2A5A3B` | Birincil vurgu, link, ikincil-outline metni/kenarı |
| `adacayi` | `#84A98C` | İkincil vurgu, seçili durum, halka gradyan başı |
| `canliyaprak` | `#4FA56F` | Halka gradyan ucu, başarı vurgusu |
| `topraksari` | `#D4A373` | Sıcak toprak/yaprak altını — streak, ödül, odak |
| `kehribar` | `#B8863B` | **REZERVE — RAFTA** (2026-07-22 telif kararı: çıkmışlar arayüzde yayınlanmaz; lisans alınırsa ÖSYM kimliği döner) |
| `durum/dogru` | `#2E8B57` | Doğru (kelime+ikonla) |
| `durum/yanlis` | `#D9534F` | Yanlış |
| `durum/uyari` | `#C77E2E` | Uyarı |
| `durum/bilgi` | `#6FA8B5` | Bilgi (yumuşak su) |
| `veri/1..4` | `#DCE9DE · #BBD3C0 · #9BBEA3 · #6FA57F` | Isı matrisi — TEK renk (adaçayı) 4 doygunluk tonu |
| `veri/sifir` | `#EFF3EF` | "Ölçüm yok" hücresi |
| `golge/kart` | `0 8px 32px rgba(24,49,33,0.04)` | Kart gölgesi — toprak tonlu, çok hafif |
| `golge/parilti` | `0 0 20px rgba(79,165,111,0.25)` | Botanik parıltı — yalnız birincil hover + tamamlanma anı |

### 🌙 Gece Ormanı (KOYU — tercihe bağlı ikincil) — v1.2 türetilmiş

| Token | Değer | Token | Değer |
|---|---|---|---|
| `zemin/gradyan` | `#0C120E → #101A13` | `orman/700` (CTA) | `#2E6B47` (üzeri beyaz) |
| `cam/dolgu` | `rgba(16,26,19,0.72)` + blur 16 | `orman/600` (vurgu) | `#7FC79C` |
| `cam/kenar` | `rgba(167,199,172,0.08)` | `adacayi` | `#8FB49A` |
| `zemin/mat` | `#121C15` | `canliyaprak` | `#5CB781` |
| `zemin/ic` | `#18251B` | `topraksari` | `#D4A373` |
| `cizgi` | `rgba(200,230,205,0.05)` | `kehribar` | `#D9B267` |
| `metin/1..3` | `#E6EFE7 · #A9BCA9 · #74887A` | `durum` | doğru `#58C08A` · yanlış `#E37A72` · uyarı `#D8A45B` · bilgi `#7FB6C4` |
| `veri/1..4` | `#1B2A20 · #24402E · #2F5A3D · #3F7A52` | `veri/sifir` | `#141F17` |
| `golge/kart` | `0 10px 36px rgba(0,0,0,0.5)` | `golge/parilti` | `0 0 20px rgba(92,183,129,0.28)` |

### Ders renkleri (açık / koyu)

| Ders | Açık | Koyu | Ders | Açık | Koyu |
|---|---|---|---|---|---|
| Matematik | `#B45309` | `#F5A524` | Biyoloji | `#4D7C0F` | `#A3E635` |
| Geometri | `#7C3AED` | `#A78BFA` | Türkçe | `#BE185D` | `#F472B6` |
| Fizik | `#2563EB` | `#60A5FA` | Tarih | `#C2410C` | `#E07856` |
| Kimya | `#0F766E` | `#2DD4BF` | | | |

**Kurallar:** Kehribar başka hiçbir yerde kullanılmaz. Ders rengi yalnız etiket/çip/grafik
serisinde — gövde metni asla ders rengi giymez; çiplerde yumuşak dolgu (%12 karışım) + renkli
metin kullanılır, blok dolgu değil. Isı matrisi çok renkli OLMAZ — yalnız `veri/1..4` adaçayı tonları.

## 3. Tipografi (metin stilleri)

| Stil | Font | Ağırlık/Boyut | Not |
|---|---|---|---|
| `Baslik/1` | **Outfit** | 800 · 28–36px · -%2 tracking | Sayfa başlığı (clamp) |
| `Baslik/2` | Outfit | 700 · 22px | Bölüm başlığı |
| `Baslik/3` | Outfit | 600 · 18px | Kart başlığı |
| `Govde` | **Inter** | 400/500 · 15.5–16px · 1.6 satır | Ana metin |
| `Kucuk` | Inter | 400 · 13px | Yardımcı metin |
| `Etiket` | **JetBrains Mono** | 500 · 12px · BÜYÜK HARF · +%8 tracking | Bölüm etiketi, istatistik künyesi |
| `Sayi` | Outfit | 700 · 24–40px | KPI sayıları (NumberFlow) |

Space Grotesk emekli. Matematik içeriği KaTeX'in kendi fontunda kalır.

## 4. Şekil, Boşluk, Derinlik (v1.2)

- **Radius (standart):** kart `20` · modal `24` · **buton, rozet, çip, giriş `12`** · iç blok `12–14`.
  (v1.1'in pill çipleri ve "organik tek köşe 32" varyantı KALKTI — tutarlı bileşen dili.)
- **Boşluk:** 4px taban. **Kart içi 20–24 (tüm modüllerde sabit)** · kartlar arası `16–20` ·
  bölümler arası `32` · sayfa kenarı `clamp(16→44)`. Liste satırı ≥44px.
- **Yerleşim:** imza grid korunur — masaüstü içerik `1.9fr / 1fr`, maks 1152px.
- **STANDART KART = BUZLU CAM:** `cam/dolgu` + `backdrop-filter: blur(16px)` + 1px `cam/kenar` +
  `golge/kart`. Kaydırılan yoğun listelerde (tablo/roster) **mat ikiz** (`zemin/mat`, blur'suz) zorunlu.
- **Gölge:** yalnız `golge/kart` (toprak tonlu, çok hafif). `golge/parilti` dekor değildir —
  yalnız birincil buton hover'ı ve hedef/halka tamamlanma anında.
- **İlerleme Halkası (günlük hedef):** 120px çap · 8px kalınlık · yuvarlatılmış uçlar ·
  `adacayi → canliyaprak` gradyanı; tamamlanınca kısa filiz parıltısı (hareket-azalt uyumlu).

## 5. İmza Görsel Öğeler

1. **Işık Huzmesi** — sayfanın üstünden süzülen 1–2 silik, sıcak (gunisigi @ %5–8) radial güneş
   lekesi; açık temada ana ambiyans. Gece Ormanı'nda ateşböceği partikülleri (yalnız masaüstü,
   hareket-azalt uyumlu). Eski Yakamoz'un yerini alır.
2. **Büyüme Halkası** — dairesel ilerleme = ağaç yaş halkası; dolum `filiz`.
3. **Streak Fidanı** — seri: 5 kademe büyüyen bitki (tohum → filiz → fidan → genç ağaç → ulu
   ağaç). Eski Fener/Lighthouse görselinin yerini alır.
4. **Yaprak nav vurgusu** — aktif sekme altında `filiz` vurgu çizgisi (layoutId animasyonu korunur).
5. **Yaprak konfeti** — kutlama renkleri `filiz + gunisigi + ahsap`; Lottie'ler aynı palete boyanır.
6. **Login sahnesi** — gün ışığında orman kenarı + uzakta sakin göl (su esintisi), kelebek/ateşböceği
   detayı. Deniz+fener sahnesinin yerini alır.
7. **Kehribar mührü — RAFTA** (2026-07-22 telif kararı): ÖSYM çıkmış soru rozeti arayüzden
   kaldırıldı; lisans alınırsa bu imza öğesi raftan iner.
8. **Mikro animasyonlar (v1.2, kullanıcı isteğiyle zenginleştirildi):** kart girişleri yumuşak
   yüksel+belir (stagger, kadans ≤0.3s); ilerleme halkası yüklenirken dolarak canlanır (~0.9s);
   KPI sayıları kısa sayaçla gelir; kart hover'da hafif yükselme; halka/hedef tamamlanınca filiz
   parıltısı; birincil buton hover'ında botanik parıltı. Hepsi hareket-azalt uyumlu.
9. **Ambiyans katmanı (v1.2):** arka planda ağır çekim süzülen yapraklar + nefes alan güneş
   lekeleri — yalnız masaüstü, düşük opaklık (≤%50), hareket-azalt kapatır. İçeriğin önüne
   geçmez; sayı/metin üstüne yaprak düşmez (pointer-events yok, z-index içerik altı).
9. **Bahçem yönü (v1.2):** yumuşak zemine entegre, şeffaf cam saksıda minimalist kristal/filiz
   efekti — ayrı Bahçem önizlemesinde detaylanacak.

## 6. Metin Dili — Eski → Yeni

**Kural: her başlık işlevini söyler.** Metafor yalnız Bahçem/oyunlaştırma alanında serbest.

| Eski (arayüzde görünen) | Yeni |
|---|---|
| Harita / "Bilişsel Röntgen" (öğrenci) | **Analizler** |
| Rota | **Çalışma Planı** |
| Kaptan (sohbet sekmesi) | **Koç** |
| Arşiv | ~~Çıkmış Sorular~~ — ekran KALDIRILDI (2026-07-22 telif kararı) |
| Ben | **Profilim** |
| Kule (yönetici) | **Yönetim** |
| Özgünlük Bariyeri | **Özgünlük Denetimi** |
| "Günün güvertesi" | "Bugünün özeti" |
| "Beklenmedik bir dalga vurdu" | "Bir şeyler ters gitti" |
| 404 "sisli deniz" | "Aradığın sayfa bulunamadı" |
| "Gece vardiyası" | "Koyu tema" |
| Pusula (Çalışma Planı'nda görünen persona) | **Plan dili / "Planlayıcı"** — nötrlendi; backend iç adı (`/agents/pusula`, charter) korunur (GOREV-002 kararı) |
| Öğrenci Röntgeni (öğretmen yüzeyi) | **Kalır** — teşhis dili öğretmene açık; öğrenci tarafı "röntgen" metinleri **Analiz**'e döner (§6 ayrımı) |
| Bugün · Bahçem · Sınıf Panosu · Kazanım Isı Haritası · Öğrenci Röntgeni · Ödev Atölyesi · Soru Havuzu · Kullanıcılar | Aynen kalır |

Not: kod içi adlar (`kaptan.charter.ts` vb.) ürün mimarisinin parçasıdır — bu dönüşümün kapsamı
dışında; öncelik kullanıcıya görünen metinlerdir.

Not (rozet/rütbe adları — GOREV-004): Rozet/rütbe adları **düz işlevseldir** — metafor yok
(kullanıcı kararı 2026-07-21). Örn. rozetler `3 Gün Seri` · `500 Soru` · `%80 Ustalık` · `Seviye 8`;
rütbe merdiveni `Seviye 1`…`Seviye 8` (askeri adlar kalktı). **Bahçem serbest bölgesi yalnız
bahçe/eşya içeriği için geçerlidir, başarı adları için değil** — bahçe rozetleri de düz adlanır
(`Bahçıvan`→`Özel Ağaç`, `Anka`→`Efsanevi Ağaç`). `id`'ler değişmez (sunucu `BADGE_CATALOG` aynası).

## 7. Bileşen Kütüphanesi

Her bileşen: varyant + durum (varsayılan/hover/basılı/devre dışı) + iki tema modunda.

| Bileşen | Varyantlar | Not |
|---|---|---|
| Buton | birincil (filiz) / ikincil (yaprak) / hayalet / tehlike · sm-md-lg | radius 14 |
| Kart | standart / organik (tek köşe 32) / istatistik (KPI) | KPI: Etiket + Sayi + trend |
| Çip & FiltreÇipi | ders renkli / nötr / seçili | pill; `aria-pressed` |
| Rozet | doğru/yanlış/uyarı/bilgi/risk | **her zaman kelime + renk** |
| GirişAlanı | metin/arama/açılır | odakta 2px filiz halkası |
| SegmentGeçiş | 2–4 segment | kayan yaprak vurgusu |
| İlerleme | bar / Büyüme Halkası | dolum `filiz` |
| IsıHücresi | 0–1 skala | `veri/ton` color-mix; sıfır = `veri/sifir` |
| StreakFidanı | 5 kademe | Profilim + Bugün |
| NavBar (62px) | öğrenci 7 / öğretmen 5 / yönetici 4 sekme | roller kapsamlı |
| Dialog / Drawer / Toast / Tooltip | — | yıkıcı eylem daima Dialog |
| BoşDurum | görsel + başlık + açıklama + CTA | filiz illüstrasyonu; **sayı uydurulmaz** |
| İskelet | kart/liste/pano | gerçek düzenle piksel-hizalı |
| SoruKartı | pratik (4 şık) — ÖSYM varyantı RAFTA (telif 2026-07-22) | KaTeX alanı; şık durumları |
| KomutPaleti (⌘K) | — | yalnız gezinme + tema; mutasyon yok |

## 8. Ekran Envanteri ve Frame Planı (masaüstü 1440, mobil 390)

- **P0:** Temeller (token showcase) · Bileşenler · Login · **Bugün** · **Soru Çöz** (odak modu,
  nav'sız — temayı izler) · **Analizler**
- **P1:** Çalışma Planı · Koç (SSE sohbet) · Profilim (rozet/lig/streak fidanı) ·
  Bahçem (3D + market) — *Çıkmış Sorular 2026-07-22 telif kararıyla plandan çıkarıldı*
- **P2:** Öğretmen (Sınıf Panosu · Kazanım Isı Haritası · Öğrenci Röntgeni · Ödev Atölyesi ·
  Öğrenci Karşılaştırma) · Yönetici (Yönetim · Kullanıcılar · Soru Havuzu · Özgünlük Denetimi) ·
  Ödevler · mobil varyantlar

## 9. FİDAN Anayasası (aşılmaz kurallar — v1.2)

1. **Her ekranda TEK birincil eylem** — yalnız o `orman/700` dolgulu; diğer eylemler outline/soft.
2. **Standart kart buzlu camdır** (blur 16). Perf sınırı: kaydırılan yoğun listelerde mat ikiz
   zorunlu; görünüm başına büyük cam yüzey ≤8.
3. `golge/parilti` yalnız birincil hover + tamamlanma anı — kalıcı neon/ışıltı yok.
4. Sayfa başına 1 canlı nokta — profil menüsü harcadı; yeni ekranlar durum satırı kullanır.
5. **Kehribar yalnız ÖSYM** — ve ÖSYM kimliği 2026-07-22 telif kararıyla RAFTA: kehribar şu an
   HİÇBİR ekranda kullanılmaz (lisans alınırsa döner).
6. **Asla yalnız renk** — her durum kelime/ikon taşır.
7. **null ≠ 0** — ölçülmemiş veri için panel gizlenir/BoşDurum; yer tutucu sayı uydurulmaz.
   Boş durum metni samimi ve motive edicidir: "Henüz soru çözmedin — ilk adımı at, fidanını büyüt."
8. Giriş animasyonu kadansı ≤0.3s; hareket-azalt her zaman desteklenir.
9. **Odak modu (Soru Çöz) temayı izler** — eski "her zaman koyu" kuralı KALKTI.
10. Tık hedefi ≥44px; gövde kontrastı hedef ≥4.5:1, büyük başlık ≥3:1 (uygulamada ölçülerek
    doğrulanır — teyitsiz "sağlandı" denmez).

## 10. Tasarım Üretim Süreci (Figma KULLANILMIYOR — 2026-07-22 kullanıcı kararı)

Ekran tasarımlarını **ORKESTRATÖR üretir**, Figma'ya gerek yok. Akış:

0. **İçerik netleşmesi:** ekranın ne içereceği [`EKRAN-HARITASI.md`](EKRAN-HARITASI.md)'de
   tanımlı ve kullanıcı onaylı olmalı — önizleme ancak ondan sonra çizilir.
1. ORKESTRATÖR ekranın **statik HTML önizlemesini** hazırlar — bu dokümanın token'ları,
   bütçeleri ve bileşen envanteriyle birebir; iki tema modunu da gösterir.
2. **Kullanıcı önizlemeyi onaylar** (revizyon isterse önizleme güncellenir — kod yazılmaz).
3. Onaylı önizleme, FRONTEND kartına referans olarak eklenir; **FRONTEND koda taşır**
   (üç tema katmanı senkron: `index.css @theme` + `src/ui.tsx` token nesneleri + utility'ler).
4. Önizleme sırası: §8'deki P0 → P1 → P2.

**Token adlandırma:** `grup/ad` biçimi korunur (`zemin/0`, `filiz/500`…) — CSS değişkenlerine
birebir eşlenir. Bileşen adları Türkçe (`Buton/Birincil/MD`).

## 11. Koda Eşleme (uygulama fazı — FRONTEND ajanı)

| Tasarım token'ı | CSS değişkeni / yer |
|---|---|
| `zemin/gradyan` başı | `--page-bg` (açık `#F4F7F4` · koyu `#0C120E`) |
| `veri/4` | `--data-hue` |
| `veri/sifir` | `--heat-zero` |
| `cam/dolgu`+`cam/kenar` / `zemin/mat` | `.glass` / `.glass-solid` |
| `cizgi` | hairline değişkeni |
| tema modu | `index.html` FOUC scripti — varsayılan AÇIK; `theme-color` metaları **`#F4F7F4` / `#0C120E`** (v1.2 — eski `#F4F8F5`/`#0B120D` değerleri v1.1 kalıntısıdır) |

Tema kodda ÜÇ katmanda yaşar ve üçü senkron taşınır: (a) `frontend-v2/src/index.css` `@theme{}` +
`:root`/`.dark`, (b) `frontend-v2/src/ui.tsx` JS token nesneleri (legacy inline-stil ekranlar),
(c) bileşenlere dağılmış utility sınıfları. İki paralel primitif kütüphanesi (`src/ui.tsx` legacy
vs `src/components/ui.tsx`) dönüşüm sırasında birleştirme adayıdır.
