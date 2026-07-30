# EKRAN HARİTASI — İçerik Spesifikasyonu (tasarım öncesi)

> FİDAN tasarım sürecinin **0. adımı** ([TASARIM-DILI §10](TASARIM-DILI.md)): her ekranın NE
> içereceği burada netleşir, önizleme ondan sonra çizilir. Her madde MEVCUT backend yüzeyine
> dayanır (uç yoksa "GELECEK" etiketi taşır — tasarım ona yer açmaz). Dürüstlük sözleşmesi
> her ekranda geçerli: veri yoksa panel gizlenir/boş durum gösterilir, sayı uydurulmaz.

**Ortak kabuk (her rol):** 62px üst bar — logo · rol sekmeleri (yaprak vurgulu aktif) · tema
düğmesi (Gün Işığı ⇄ Gece Ormanı) · bildirim zili (yalnız öğrenci — Koç dürtmeleri) · profil
menüsü · ⌘K palet (gezinme+tema, mutasyonsuz). Arka planda Işık Huzmesi. Her ekran: piksel-hizalı
iskelet + boş durum + hata sınırı; yetki reddi açık "erişimin yok" ekranı.

---

## ÖĞRENCİ (6 sekme + odak modu + giriş — Çıkmış Sorular 2026-07-22 telif kararıyla kaldırıldı)

### 0. Tanıtım Sayfası (kimliksiz ilk karşılaşma) — P1 [YENİ — kullanıcı isteği 2026-07-22]
- **Amaç:** ürünü hiç tanımayan ziyaretçinin ilk gördüğü sayfa; kayıt/girişe götürür.
  Rota önerisi: kimliksiz kök `/` → tanıtım; "Giriş yap" → mevcut giriş ekranı (uygulama kartında netleşir).
- **Hero (kullanıcı kararı 2026-07-22):** SORULARIN reklamı — "ÖSYM formatına en yakın sorular"
  vurgusu (biçim iddiası; resmî bağ iması yok) + değer önerisi + ana CTA "Ücretsiz başla" +
  ikincil "Giriş yap"; FİDAN orman sahnesi + temsilî arayüz vinyetleri. Fidan sloganı kapanış bandında.
- **Özellik vitrini (yalnız MEVCUT özellikler — olmayan vaat edilmez):** kişisel çalışma planı ·
  analizler (ustalık haritası/trend/tuzaklar) · Koç (verini gören AI rehber) · aralıklı tekrar ·
  doğrulanmış AI soru havuzu (çift geçişli doğrulama) · oyunlaştırma (seri fidanı, lig, rozet, 3D bahçe).
- **Nasıl çalışır (3 adım):** kaydol + tanışma sınavı → planın kurulur → çöz-izle-büyü.
- **Öğretmen bölümü:** sınıf panosu, kazanım ısı haritası, öğrenci analizi, ödev atölyesi; sınıf koduyla bağlama.
- **KATI KURALLAR:** uydurma sosyal kanıt YASAK (sahte kullanıcı sayısı/yorum/başarı istatistiği);
  **çıkmış soru YAYINI/erişimi VAADİ YASAK** (2026-07-22 telif kararı) — "ÖSYM formatında /
  formatına en yakın" BİÇİM iddiası serbesttir (resmî bağ/onay iması olmadan; kullanıcı kararı
  2026-07-22); rakam kullanılacaksa gerçek ürün gerçeği olmalı. CTA tekrarı serbest (hero +
  kapanış — AYNI eylem, tek-birincil ihlali değil).

### 1. Giriş (kimliksiz kök) — P0
- **Sol panel:** Giriş/Kayıt sekmeli form (e-posta+şifre; kayıtta ad + opsiyonel öğretmen sınıf
  kodu → otomatik katılım). **Sınıf düzeyi SORULMAZ** (kullanıcı kararı 2026-07-22 — YKS'ye özel
  uygulama, düzeyi kullanan mantık yok; "sınıf kodu" bundan ayrıdır ve kalır). İsteğe bağlı
  gelecek fikri: tek tık "hedef sınav yılı" seçimi (geri sayımı kişiselleştirir).
- **Öğretmen başvurusu (kullanıcı kararı 2026-07-23):** kayıtta "Öğretmen olarak başvur" seçeneği —
  hesap ÖĞRENCİ olarak açılır + başvuru kaydı düşer; rol YALNIZ yönetici onayıyla öğretmene döner
  (0019 güvenliği: istemci rol yazamaz). Onay bekleyene samimi bilgi durumu. (GOREV-027/028)
- Kayıt geçiş bağlantısı düz **"Hemen oluştur"** ("fidanını dik" metni kaldırıldı — kullanıcı
  kararı 2026-07-23; GOREV-018).
- **Sağ/arka plan:** FİDAN sahnesi — gün ışığında orman kenarı + uzakta göl (3D veya illüstrasyon).
- Durumlar: hata toast (önce Türkçe mesaj), gönderirken devre dışı buton.

### 2. Bugün `/` — P0 (ana pano)
- **Selamlama şeridi:** saat dilimine göre selam + tarih; sınava kalan gün (varsa hedef tarih).
- **KPI şeridi (4):** bugün çözülen · doğruluk · süre · seri (mini Streak Fidanı).
- **Günlük hedef kartı:** ilerleme çubuğu (daily_goal) + birincil CTA "Soru Çöz".
- **Bugünün Planı:** plan bloklarından bugüne düşenler (kazanım adı + soru sayısı + "Başlat");
  plan yoksa boş durum: "Plan, soru havuzu dolunca burada belirir."
- **Tanışma sınavı daveti:** ustalık verisi olmayan yeni kullanıcıya (10 soruluk yerleştirme).
- **Ödev hatırlatması:** teacher_id'li öğrencide bekleyen ödev varsa tek satır kart.
- **Analiz özeti:** ders bazlı mini ısı şeridi → "Analizler"e köprü.

### 3. Soru Çöz `/coz` — P0 (odak modu, nav'sız; temayı izler)
- **Üst ince şerit:** çık (onay diyaloğu) · ilerleme n/N · süre sayacı.
- **Soru kartı:** KaTeX gövde; 4 şık (AI havuzu). Şık durumları: nötr → seçili → doğru/yanlış
  (kelime + renk + ikon). *5 şık + kehribar ÖSYM görünümü 2026-07-22 telif kararıyla RAFTA —
  çıkmışlar arayüzden kaldırıldı.*
- **Pratikte anlık geri bildirim:** doğru/yanlış + kısa açıklama; testte sona kadar sessiz.
- **Sonuç ekranı:** Büyüme Halkası skor · doğru/yanlış dökümü (kazanım bazlı) · XP+coin ·
  yaprak konfeti · "Analizin hazır" CTA · seri güncellemesi.

### 4. Analizler `/harita` — P0
- **Filtre:** ders + dönem (URL'de, paylaşılabilir).
- **Ustalık Matrisi:** ders × konu ağacı ısı hücreleri (tek ton `veri/ton`), ltree drill-down.
- **Trend paneli:** zaman içinde doğruluk/çözüm hacmi.
- **Takvim ısısı:** çalışılan günler.
- **Öncelik listesi:** motorun önerdiği zayıf kazanımlar → "Bu konudan çöz" CTA. Dil motive edici;
  **teşhis/taksonomi dili ASLA öğrenciye gösterilmez** (ürün kuralı).
- **Tuzak paneli:** sık düşülen çeldiriciler, öğrenci-yüzlü ipucu diliyle ("İç türevi unutuyorsun").
- **Hız paneli:** kazanım bazlı süre karşılaştırması.
- **Kapsama kartı:** dokunulan kazanım sayısı / toplam.

### 5. Çalışma Planı `/rota` — P1
- **Özet şerit:** sınava kalan gün · bu haftanın hedefi · SRS'te vadesi gelen tekrar sayısı.
- **Haftalık plan blokları (gün gün):** her blok = 1 zayıf kazanım + 1 SRS tekrarı + 1 komşu konu;
  blok kartında kazanımlar + tahmini süre + "Başlat".
- **"Planı güncelle":** asenkron optimizer tetiği — dönen durum göstergesi ("Plan hazırlanıyor…"),
  iyimser güncelleme yok.
- **Plan gerekçesi satırı:** planlayıcının kısa anlatımı (tek LLM anlatım çağrısının çıktısı).

### 6. Koç `/kaptan` — P1
- **Sohbet:** SSE akışlı balonlar · yazıyor göstergesi · araç durumu etiketi ("Verilerine bakıyor").
- **Hızlı çipler:** "Bugün ne çalışayım?" · "Zayıf konularım" · "Bir soru açıkla" (mevcut akışları tetikler).
- **Geçmiş:** kaydırınca eski mesajlar (history ucu). Kod bloğu/KaTeX render desteği.
- Dürtmeler kabuktaki zilde yaşar (bu ekranda tekrar edilmez).

### 7. Çıkmış Sorular `/arsiv` — KALDIRILDI (2026-07-22 telif kararı)
- **Kullanıcı kararı ("3. yol"):** ÖSYM çıkmış soruları arayüzde YAYINLANMAZ — 6114 sayılı Kanun /
  telif riski. Çıkmışlar yalnız RAG/üretim kaynağı (`yks_exemplars` üslup beslemesi) ve yönetici
  İÇ operasyonu olarak kalır; öğrenciye sadece özgün üretilmiş sorular gösterilir.
- Ekran nav'dan ve rotalardan çıkar (**GOREV-015**); kullanıcıya çıkmış servis eden uçlar kapanır
  (**GOREV-016**). Onaylı önizleme (`onizleme/cikmis-sorular.html`) RAFTA — ÖSYM lisansı alınırsa
  raftan iner.

### 8. Bahçem `/bahce` — P1 (metafor serbest İÇERİK bölgesi)
- **3D bahçe sahnesi** (mevcut three.js — FİDAN ile doğal uyumlu) + yerleştir/taşı/kaldır.
- **Coin bakiyesi + market:** katalog kartları (fiyat, sahiplik durumu), satın alma atomik.
- **Envanter çekmecesi**; mobilde alt drawer.
- İçerik adları (bitki/eşya) serbest; **başarı adları düz kalır** (§6 notu).

### 9. Ödevler `/odevler` — P1 (yalnız teacher_id'li öğrencide görünür)
- **Aktif ödevler:** kart listesi — başlık, soru sayısı, son tarih, durum rozeti (kelimeli).
- **Hedefli setler:** öğretmenin kişiye özel gönderdikleri, ayrı vurgu.
- **Geçmiş:** tamamlananlar + skor; detayda soru dökümü.
- Çözme akışı Soru Çöz kabuğunu kullanır.

### 10. Profilim `/ben` — P1
- **Hero:** avatar (12 seçenek) · ad · Seviye halkası (Büyüme Halkası, "Seviye N") · lig rozeti.
- **Streak Fidanı kartı:** 5 kademeli bitki + seri sayısı + dondurma hakkı + sonraki hedef.
- **Günlük görevler:** quest kartları + "ödülü al".
- **Rozet galerisi:** 14 rozet (kilitli soluk + koşul metni; açık renkli).
- **Sınıf kartı:** koda katıl / ayrıl (tek mesaj kuralı).
- **Ayarlar:** tema (varsayılan Gün Işığı) · ses · bildirimler · günlük hedef.

---

## ÖĞRETMEN `/sinif/*` (5 sekme; paylaşılan sınıf verisi tek yerden)

### 11. Sınıf Panosu `/sinif` — P2
- **Üst şerit:** sınıf kodu kartı (kopyala) · mevcut sayısı · 84 günlük aktivite trendi.
- **Triaj kuyruğu:** motorun işaretlediği öğrenciler — risk rozeti HER ZAMAN kelimeli
  ("yüksek risk"); satırdan Röntgen'e geçiş. Havuz/veri yoksa dürüst boş durum.
- **Mevcut listesi:** öğrenci satırları (son aktivite, doğruluk, çözüm hacmi) + arama/sıralama (URL).
- **Sınıf zayıf kazanımları:** yaygınlığa göre ilk N → "Bu kazanımdan ödev derle" köprüsü.
- **Öğrenci yönetimi:** e-postayla ekle (başka sınıftaysa 409 açıklaması) · çıkar (Dialog).

### 12. Kazanım Isı Haritası `/sinif/isi` — P2 (tam genişlik)
- **Matris:** ders × kazanım, iki katmanlı ortalama; tek ton; ölçülmeyen hücre "ölçüm yok".
- **Filtre/drill:** ders seçimi URL'de; hücre → o kazanımda öğrenci dağılımı paneli.
- **Kısayol:** seçili kazanımdan Ödev Atölyesi'ne geçiş.

### 13. Öğrenci Röntgeni `/sinif/ogrenci/:id` — P2
- **Başlık kartı:** öğrenci adı · seviye · son aktivite · doğruluk özeti.
- **Analiz panelleri (öğretmen görünümü):** ustalık matrisi + trend + hız + kapsama; **teşhis dili
  AÇIK** — kavram yanılgısı taksonomisi ve kanıtı burada görünür (öğrenciye asla).
- **Cevap logları:** sayfalı tablo (tarih, kazanım, sonuç, süre, seçilen şık).
- **Ödev geçmişi** + **"Hedefli ödev gönder"** CTA (zayıf kazanım önerileriyle).

### 14. Ödev Atölyesi `/sinif/odev` — P2
- **Derleme formu:** ders → kazanım(lar) → zorluk → adet; havuzdan önizleme. **LLM yok** —
  havuz yetmezse eksik sayı AÇIKÇA gösterilir, soru uydurulmaz.
- **Hedefli ödev:** öğrenci seç → motorun zayıf kazanım önerileri → set gönder.
- **Atama:** son tarih + hedef (tüm sınıf / seçili öğrenciler); mutasyonda dönen ikon + reload.
- **Geçmiş ödevler:** durum + tamamlanma oranı.

### 15. Öğrenci Karşılaştırma `/sinif/karsilastir` — P2
- **Seçici:** en fazla 4 öğrenci (URL'de `?ogrenci=a,b,c`).
- **Yan yana panel:** ustalık, doğruluk trendi, hız, kapsama — seri ayrımı asla yalnız renkle değil.
- Ölçüm olmayan sütun "ölçüm yok" der.

---

## YÖNETİCİ `/kule/*` (4 sekme)

### 16. Yönetim `/kule` — P2 (sistem sağlığı)
- **Görev kuyruğu:** bekleyen/çalışan/başarısız görevler (tür bazlı); takılan görev "yeniden
  kuyruğa" (attempts kuralı diyalogda açıklanır; gecikme dürüstçe söylenir). Önbelleksiz.
- **Eval durumu:** son koşu skorları/trend; anlık yoksa "ölçüm yok" — asla 0 çizilmez.
- **Servis sağlığı:** API/worker/Redis durum satırları (kelimeli).

### 17. Kullanıcılar `/kule/kullanicilar` — P2
- **Tablo:** rol filtresi + arama; satırda rol, onay durumu, sınıf.
- **Öğretmen onayı:** verme tek tık; kaldırma Dialog (60 sn'de sınıf erişimi düşer uyarısı).
  *(2026-07-23: kayıt-zamanlı öğretmen BAŞVURULARI da burada listelenir — "başvuru bekliyor"
  kelimeli rozet + filtre; GOREV-027/028.)*
- **Rol değiştir:** yan etkiler diyalogda sayılır (sınıf boşalması vb.); **kendi rolün kilitli**.
- **Sınıf taşı/çıkar** (izli) · **Denetim defteri:** append-only liste; `denetimYazildi:false`
  dönerse ekranda uyarı.

### 18. Soru Havuzu `/kule/havuz` — P2
- *(2026-07-22 telif notu: bu panel yönetici İÇ operasyonudur; çıkmış içerik burada görünse bile
  hiçbir öğrenci/öğretmen yüzüne yayın yapılmaz.)*
- **Kapsama:** ders bazlı doğrulanmış soru / kazanım dağılımı (bugünkü gerçek neyse o —
  örn. TDE %3,3 dürüstçe görünür).
- **Kalite histogramı + zorluk dağılımı.**
- **Havuz gezgini:** facet filtreleri (ders/zorluk/kalite) + soru önizleme (salt-okunur).

### 19. Özgünlük Denetimi `/kule/ozgunluk` — P2
- **Eşik tablosu:** ders bazlı Jaccard eşikleri + "eşik ölçümden türetilir" anlatısı.
- **Yakın-ikiz listesi:** bilinen benzer çiftler + benzerlik skoru.

---

## Ortak küçük ekranlar
- **404:** "Aradığın sayfa bulunamadı" + orman/çayır vinyeti + "Ana sayfaya dön".
- **Erişim yok:** açık ret ekranı (rol kapısı) — asla sessiz yönlendirme.
- **Hata sınırı:** "Bir şeyler ters gitti" + yenile önerisi (kabuk ayakta kalır).

## Önizleme sırası (TASARIM-DILI §10 akışıyla)
1. **P0:** Bugün → Soru Çöz (+sonuç) → Analizler → Giriş
2. **P1:** Profilim → Çalışma Planı → Koç → Ödevler → Bahçem *(Çıkmış Sorular 2026-07-22'de kaldırıldı)*
3. **P2:** Öğretmen 5 ekran → Yönetici 4 ekran → mobil varyantlar

## Zenginleştirmeler — benzer uygulama analizinden işlevsel eklemeler (2026-07-22)

> Kaynak desenler: YKS takip uygulamaları (deneme analizi, net grafiği, hata defteri, soru sayacı)
> + global çalışma uygulamaları (Anki-tarzı aralıklı tekrar, Forest-tarzı odak zamanlayıcısı,
> Duolingo-tarzı seri/lig). Etiketler: **[HAZIR]** mevcut uç/veriyle yalnız arayüz işi ·
> **[FRONTEND]** sunucu istemez · **[GELECEK]** backend kartı ister (tasarım yer ayırmaz).

**Bugün:**
- "Kaldığın yerden devam" kartı — yarım kalan test/ödev tek tıkla sürer **[HAZIR]**
- **Bugünün Tekrarı** kartı — SRS'te vadesi gelen kazanım sayısı + "10 soruluk tekrar" CTA
  (aralıklı tekrar motoru zaten var, arayüzde ilk kez görünür olacak) **[HAZIR]**
- **Odak Zamanlayıcısı** — 25/5 pomodoro; gün özetinde tamamlanan odak seansı sayısı **[FRONTEND]**
  (odak seansına bahçe ödülü bağlamak → GELECEK)
- Lig mini kartı — haftalık sıralamadaki yerin + küme düşme/çıkma çizgisi **[HAZIR]**

**Soru Çöz:**
- **Yanlışlarım modu** (hata defteri döngüsü) — yanlış çözdüklerini yeniden çöz; düzelttiğin soru
  listede "düzeldi" işareti alır **[HAZIR — tekrar ucu mevcut]**
- Süre modu: serbest / ÖSYM temposu (soru başına hedef süre göstergesi) **[FRONTEND]**
- Klavye kısayolları (A–E, Enter) + tam klavye gezinimi **[FRONTEND]**
- Soruyu işaretle → sonuç ekranında "işaretlediklerim" sekmesi **[FRONTEND + soru-durumu ucu]**

**Analizler:**
- **Hedef Net Simülatörü** — hedef netini gir; mevcut doğruluk verinden ders bazlı "tahmini net"
  ve aradaki farkı kapatacak kazanım önerileri (her sayı "tahmini" etiketli — uydurma yok) **[FRONTEND]**
- **Haftalık gelişim raporu** — bu hafta vs geçen hafta: soru/doğruluk/süre + "en çok geliştiğin
  3 kazanım" pozitif paneli **[HAZIR — cevap logları]**

**Çalışma Planı:**
- Sınav geri sayımı hedef tarihi (kullanıcı belirler, plan aciliyeti buna bakar) **[FRONTEND]**

**Koç:**
- "Bu soruyu açıkla" köprüsü — sonuç ekranındaki her sorudan tek tıkla, soru bağlamı yüklü
  Koç sohbetine **[HAZIR — sohbet ucu + bağlam]**

**Çıkmış Sorular:** *Gerçek Sınav Modu* — **İPTAL** (2026-07-22 telif kararı: ekranla birlikte kalktı).

**Profilim:** Haftalık özet kartı (toplam soru/süre/doğruluk + seri) **[HAZIR]**
**Ödevler:** Son teslim tarihi yaklaşanlarda sayaçlı vurgu **[FRONTEND]**

**Öğretmen — Sınıf Panosu:**
- Haftalık sınıf rapor şeridi (bu hafta çözülen, aktif öğrenci, ort. doğruluk) **[HAZIR]**
- **Pasif öğrenci filtresi** — "son 7 gündür soru çözmeyenler" tek tık görünümü (roster son-aktivite
  verisinden); satırdan Röntgen'e **[HAZIR]**
- **Ödev tamamlanma takibi** — pano üstünde aktif ödevlerin tamamlanma çubuğu + "henüz yapmayanlar"
  listesi (ödev geçmişi ucundan) **[HAZIR]**
- Sınıf listesi CSV dışa aktarımı (görüşme/idare için; istemci tarafı) **[FRONTEND]**

**Öğretmen — Ödev Atölyesi:**
- *Çıkmış sorulardan ödev derleme* — **İPTAL** (2026-07-22 telif kararı: çıkmışlar hiçbir
  kullanıcı yüzüne servis edilmez)
- **"Geçmiş ödevi kopyala"** — eski bir ödevi şablon olarak yükle, düzenle, yeniden ata
  (aynı derleme ucu; tekrar-gönderim dışlaması `kaynak_soru_id` ile zaten çalışıyor) **[HAZIR]**
- Ödev son tarihlerinin küçük takvim görünümü **[FRONTEND]**

**Öğretmen — Öğrenci Röntgeni & Karşılaştırma:**
- "Özet raporu kopyala" — veli/öğrenci görüşmesi için sade Türkçe özet metni panoya
  (şablondan, LLM'siz) **[FRONTEND]**
- Röntgen panellerinde **sınıf ortalaması referans çizgisi** ("sınıfa göre nerede" — sınıf özeti
  verisi zaten çekiliyor) **[HAZIR]**
- Karşılaştırmaya **"sınıf ortalaması" sanal sütunu** (4 öğrenci + referans) **[HAZIR]**

**Yönetici — Yönetim (pano):**
- **Onay bekleyen öğretmen rozeti** — nav'da sayı + panoda "N öğretmen onay bekliyor" kartı,
  tek tık Kullanıcılar'a (kullanıcı listesi verisinden) **[HAZIR]**
- Görev kuyruğunda **tür/durum filtreleri + başarısız görevin hata özeti** satır içinde
  (agent_tasks alanları mevcut) **[HAZIR]**
- **Havuz boşluk uyarı kartı** — kapsama verisinden "kritik boş kazanım" sayısı + en boş 5 ders;
  "havuz doldurma komutunu kopyala" düğmesi (komut panoya — koşmayı kullanıcı yapar) **[HAZIR + FRONTEND]**

**Yönetici — Kullanıcılar:**
- **Rol değişim sihirbazı** — Dialog'da yan etkiler onay kutulu adımlarla ("sınıfı boşalacak:
  N öğrenci etkilenir") — mevcut yan-etki kuralları görselleşir **[FRONTEND]**
- **Kullanıcı detay çekmecesi** — satırdan açılır: öğrenci/öğretmen özeti (adminin sınıf verisine
  tek meşru penceresi olan detay ucu) **[HAZIR]**
- Denetim defterinde eylem türü / yönetici / tarih filtreleri **[FRONTEND — liste mevcut]**
- Kullanıcı listesi CSV dışa aktarımı **[FRONTEND]**

**Yönetici — Soru Havuzu & Özgünlük:**
- Kapsama tablosunda **"en kritik 10 boşluk"** sıralı listesi (ders × kazanım, soru sayısıyla) **[HAZIR]**
- Özgünlükte **ikiz çift yan yana karşılaştırma** görünümü (iki soru metni + benzerlik skoru) **[HAZIR]**

## GELECEK (backend işi ister — tasarım yer AYIRMAZ, backlog)
- **ÖSYM lisansı:** yazılı izin alınırsa Çıkmış Sorular ekranı raftan iner (onaylı önizleme +
  kehribar kimlik hazır bekliyor); o güne dek çıkmışlar arayüzde yayınlanmaz (2026-07-22 kararı).
- **Deneme Günlüğü + Net Grafiği** — deneme sonuç girişi (ders bazlı D/Y/B) → net trendi +
  kazanım işaretleme. YKS pazarının çekirdek özelliği; yeni tablo + uçlar ister. **En güçlü aday.**
- Hata türü etiketleme (bilgi eksiği / dikkatsizlik / süre) — hata defterinin etiket katmanı.
- Fotoğrafla soru sorma (Koç'a görsel) — vision modeli yok.
- Odak seansına bahçe/coin ödülü — ödül ucu ister.
- Yönetim'e LLM maliyet paneli — sayaçlar Redis'te, admin ucu yok.
- Üretim hunisi paneli: `uretim_telemetri` (migration 0021 / A5) beklemede.
- Rozet ikon seti yenileme (çapa vb. → işlevsel/doğa ikonları) — görsel kart olarak planlanacak.
- **Öğretmen: sınıfa duyuru/hatırlatma** — öğretmenin tetiklediği bildirim (dürtme sistemi bugün
  yalnız motor-tetikli; öğretmen tetiği yeni uç ister).
- **Öğretmen: ödev hatırlatması gönder** ("henüz yapmayanlara hatırlat" düğmesi) — aynı bildirim
  altyapısına bağlı.
- **Öğretmen: sınıf hedefi** (haftalık soru/doğruluk hedefi belirleme + pano takibi) — saklama ister.
- Deneme Günlüğü backend'i gelirse: öğrencide net grafiği, öğretmende sınıf deneme karşılaştırması,
  yönetimde deneme kapsama istatistiği birlikte tasarlanır.
