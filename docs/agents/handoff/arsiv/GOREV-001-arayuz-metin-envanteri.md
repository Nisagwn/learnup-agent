---
gorev: GOREV-001-arayuz-metin-envanteri
kimden: ORKESTRATÖR
kime: FRONTEND
durum: onaylandi
oncelik: P1
bagimlilik: []
dokunulan-dosyalar: []      # SALT-OKUMA görevi — hiçbir kaynak dosyaya yazılmaz
migration-gerekli: hayir
---

## Amaç
FİDAN metin dönüşümünün girdisi olacak eksiksiz envanter: `frontend-v2` içinde kullanıcıya
görünen TÜM denizcilik/metafor metinlerinin dosya-konumlu listesi + önerilen düz işlevsel karşılıkları.

## Bağlam
- `docs/design/TASARIM-DILI.md` §6 (eski→yeni tablo — çekirdek liste; envanter bunu TAMAMLAR)
- Bilinen örnekler: `frontend-v2/src/components/RolGecidi.tsx` ("Bu güverte sana kapalı"),
  `components/Lighthouse.tsx`, `components/ErrorBoundary.tsx` ("beklenmedik bir dalga"),
  `screens/NotFound.tsx` ("sisli deniz"), `lib/theme.tsx` (Kıyı/Okyanus), `lib/nav.ts`
  (sekme adları), `lib/format.ts` (selam/vardiya metinleri), `components/Ambiyans.tsx`
- Aranacak terim aileleri (Grep, case-insensitive): güverte, fener, yakamoz, kaptan, okyanus,
  kıyı, deniz, dalga, liman, rota, pusula, vardiya, sis, çapa, yelken, rüzgar, marina, mürettebat
- DİKKAT: "Kaptan"/"Rota"/"Pusula" ürün-ajan adları backend'de kalır; envanter yalnız
  KULLANICIYA GÖRÜNEN frontend metinlerini kapsar.

## Kabul Kriterleri
- [x] RAPOR'da tablo: dosya yolu · mevcut metin · önerilen yeni metin · not (nav/başlık/hata/mikrometin) — Bölüm A (41 satır)
- [x] `frontend-v2/src` altında yukarıdaki terim ailelerinin TÜM kullanıcı-görünür geçişleri tarandı
      (kod içi değişken/yorum adları ayrı kısa listede, "dönüşüm kapsamı dışı" notuyla) — Bölüm E
- [x] Bahçem/oyunlaştırma metinleri "metafor serbest bölgesi" olarak ayrı işaretlendi — Bölüm C
- [x] Hiçbir kaynak dosya değiştirilmedi (`git status` farkı yalnız bu kart) — RAPOR "Koşulan kapılar"

## Kısıtlar / Kapsam Dışı
- Bu kartta KOD DEĞİŞİKLİĞİ YOK — yalnız envanter. Dönüşümün kendisi sonraki kartların işi.
- `frontend/` (eski arayüz, bakım modu) kapsam dışı.

## Başlangıç Durumu
- Git rev: `5c2610e` (branch: `feat/yks-brain`)
- Kirli çalışma ağacı: 30 kayıt (25 M + 1 D + 4 yeni: `VERDENT.md`, `docs/`,
  `frontend-v2/src/lib/latex.ts`, `learnup-brain/src/middleware/validate.ts`,
  `learnup-brain/src/scripts/_tmp-cetvel-eslesme.ts`). Bu görev salt-okuma olduğundan engel
  değil; yine de kullanıcının commit atması önerilir.

## Onay Kayıtları
- Paralı koşu: GEREKMEZ ($0 — yalnız Grep/Read).

## RAPOR

### Yapılan
`frontend-v2/src` altında, kartta listelenen 18 denizcilik terim ailesi + FİDAN §6'daki
metafor terimleri (Röntgen, Rota, Pusula, güverte, sefer, rütbeler) case-insensitive Grep ile
tarandı; her geçiş dosya-satır konumuyla okunup **kullanıcıya görünür / görsel / kod-içi** diye
sınıflandırıldı. Aşağıdaki envanter §6 tablosunu TAMAMLAR (§6 çekirdek liste; burası dosya-konumlu tam döküm).

**Sınıflandırma ölçütü:** Bir metin JSX metin düğümü, `title`/`aria`/`placeholder`, toast, buton
etiketi, başlık ya da veri-üretilen kullanıcı metniyse → **görünür (dönüşüm hedefi)**. SVG/3D sahne
adı, yorum satırı, değişken/tip/fonksiyon/route adı ya da backend'e giden alan → **kapsam dışı**.

---

### A. Kullanıcıya görünür denizcilik/metafor metni — DÖNÜŞÜM HEDEFİ

| # | Dosya · satır | Mevcut metin | Önerilen yeni metin | Not |
|---|---|---|---|---|
| A1 | [nav.ts:67](../../../frontend-v2/src/lib/nav.ts#L67) | `'/harita': 'Analiz — Bilişsel Röntgen'` | `Analiz` (alt-metafor "Bilişsel Röntgen" düşer) | başlık · §6 Harita/"Bilişsel Röntgen"→Analizler |
| A2 | [nav.ts:81](../../../frontend-v2/src/lib/nav.ts#L81) | `'/kule': 'Kule — Sistem Sağlığı'` | `Yönetim — Sistem Sağlığı` | başlık · §6 Kule→Yönetim |
| A3 | [nav.ts:84](../../../frontend-v2/src/lib/nav.ts#L84) | `'/kule/ozgunluk': 'Özgünlük Bariyeri'` | `Özgünlük Denetimi` | başlık · §6 |
| A4 | [nav.ts:47](../../../frontend-v2/src/lib/nav.ts#L47) | `label: 'Kule'` | `Yönetim` | nav (yönetici sekmesi) · §6 |
| A5 | [nav.ts:18](../../../frontend-v2/src/lib/nav.ts#L18) | `label: 'Analiz'` | `Analizler` (isteğe bağlı) | nav · §6 "Analizler" (tekil/çoğul uyumu — düşük öncelik) |
| A6 | [Kule.tsx:75](../../../frontend-v2/src/screens/kule/Kule.tsx#L75) | `ad="Kule"` | `Yönetim` | ekran başlığı · §6 |
| A7 | [App.tsx:64](../../../frontend-v2/src/App.tsx#L64) | `'LearnUp — YKS Güvertesi'` | `LearnUp — YKS Hazırlık` | `document.title` · güverte |
| A8 | [App.tsx:247](../../../frontend-v2/src/App.tsx#L247) | `theme==='light' ? 'Gece Vardiyası' : 'Güverte'` | `'Koyu tema' : 'Açık tema'` | tema düğmesi `title` · §6 "Gece vardiyası"→"Koyu tema" |
| A9 | [Ben.tsx:277](../../../frontend-v2/src/screens/Ben.tsx#L277) | `theme==='light' ? 'Güverte (açık)' : 'Gece Vardiyası (koyu)'` | `'Açık tema' : 'Koyu tema'` | tema seçici mikrometin · §6 |
| A10 | [CommandPalette.tsx:120](../../../frontend-v2/src/components/CommandPalette.tsx#L120) | `Temayı değiştir — {… 'Gece Vardiyası' : 'Güverte'}` | `… 'Koyu tema' : 'Açık tema'` | ⌘K komut etiketi · §6 |
| A11 | [App.tsx:321](../../../frontend-v2/src/App.tsx#L321) · [Bugun.tsx:68](../../../frontend-v2/src/screens/Bugun.tsx#L68) · [Ben.tsx:59](../../../frontend-v2/src/screens/Ben.tsx#L59) | `\|\| 'Denizci'` (varsayılan ad) | `\|\| 'Öğrenci'` | fallback kullanıcı adı (3 yer) |
| A12 | [RolGecidi.tsx:52](../../../frontend-v2/src/components/RolGecidi.tsx#L52) | `Bu güverte sana kapalı` | `Bu sayfaya erişimin yok` | YetkiYok başlık · güverte |
| A13 | [ErrorBoundary.tsx:29](../../../frontend-v2/src/components/ErrorBoundary.tsx#L29) | `Beklenmedik bir dalga vurdu` | `Bir şeyler ters gitti` | hata başlığı · §6 |
| A14 | [ErrorBoundary.tsx:32](../../../frontend-v2/src/components/ErrorBoundary.tsx#L32) | `…Sayfayı yenilemek genellikle rotayı düzeltir.` | `…Sayfayı yenilemek genellikle sorunu çözer.` | hata mikrometin · "rotayı düzeltir" |
| A15 | [NotFound.tsx:12](../../../frontend-v2/src/screens/NotFound.tsx#L12) | `Rota bulunamadı` | `Sayfa bulunamadı` | 404 başlık · §6 "sisli deniz"→"Aradığın sayfa bulunamadı" |
| A16 | [NotFound.tsx:15](../../../frontend-v2/src/screens/NotFound.tsx#L15) | `Bu koordinatlarda bir liman yok — sis basmış olmalı. Güverteye dönüp rotayı yeniden çizelim.` | `Aradığın sayfa bulunamadı. Ana sayfaya dönebilirsin.` | 404 gövde · liman/sis/güverte/rota |
| A17 | [NotFound.tsx:19](../../../frontend-v2/src/screens/NotFound.tsx#L19) | `Güverteye dön` | `Ana sayfaya dön` | 404 buton · güverte |
| A18 | [Login.tsx:264](../../../frontend-v2/src/screens/Login.tsx#L264) | `mode==='in' ? 'Güverteye çık' : 'Yolculuğa başla'` | `'Giriş yap' : 'Hesap oluştur'` | giriş/kayıt butonu · güverte/yolculuk |
| A19 | [Bugun.tsx:300](../../../frontend-v2/src/screens/Bugun.tsx#L300) | `seri>0 ? 'Fener yanık — seyir sürüyor' : 'Fener sönük — bir blokla yak'` | `'Serin sürüyor' : 'Serini bugün başlat'` | seri mikrometin · Fener→Streak Fidanı (§5.3) |
| A20 | [Bugun.tsx:309](../../../frontend-v2/src/screens/Bugun.tsx#L309) | `{sonrakiMilat(seri)}. gün feneri` | `{…}. gün hedefi` | seri hedef etiketi · fener |
| A21 | [Bugun.tsx:341](../../../frontend-v2/src/screens/Bugun.tsx#L341) | `Hedef tamam — istersen açık denize devam.` | `Hedef tamam — istersen devam et.` | mikrometin · açık deniz |
| A22 | [Bugun.tsx:445](../../../frontend-v2/src/screens/Bugun.tsx#L445) | `Harita soru çözdükçe belirir — her kazanım bir yakamoz karesi.` | `Analiz soru çözdükçe belirir — her kazanım bir kare.` | boş durum · harita/yakamoz |
| A23 | [Bugun.tsx:177](../../../frontend-v2/src/screens/Bugun.tsx#L177) | `Bugünün Rotası` | `Bugünün Planı` | bölüm başlığı · Rota→Çalışma Planı |
| A24 | [Bugun.tsx:202](../../../frontend-v2/src/screens/Bugun.tsx#L202) | `Rota henüz çizilmedi — soru havuzu dolunca bugünün rotası burada belirir.` | `Plan henüz hazır değil — soru havuzu dolunca bugünün planı burada belirir.` | boş durum · rota |
| A25 | [Bugun.tsx:266](../../../frontend-v2/src/screens/Bugun.tsx#L266) | `Tanışma Sınavı — röntgenini 10 soruda çek` | `Tanışma Sınavı — analizini 10 soruda çıkar` | davet başlığı · röntgen |
| A26 | [Ben.tsx:358](../../../frontend-v2/src/screens/Ben.tsx#L358) | `Lider tablosunda ve güvertede seni bu karakter temsil eder.` | `Lider tablosunda ve panoda seni bu karakter temsil eder.` | avatar mikrometin · güverte |
| A27 | [Ben.tsx:674](../../../frontend-v2/src/screens/Ben.tsx#L674) | `{streakDays} Günlük Sefer` | `{streakDays} Günlük Seri` | VoyageStreak başlığı · sefer |
| A28 | [Ben.tsx:679](../../../frontend-v2/src/screens/Ben.tsx#L679) | `Fener` (buton) | `Kutlama` / kaldır | kutlama tetik butonu · fener |
| A29 | [Ben.tsx:757](../../../frontend-v2/src/screens/Ben.tsx#L757) | `Feneri görmene {X} gün kaldı` | `Sonraki hedefe {X} gün kaldı` | mikrometin · fener |
| A30 | [Ben.tsx:754](../../../frontend-v2/src/screens/Ben.tsx#L754) | `{streakDays} gün yol alındı` | `{streakDays} gün sürdü` | mikrometin · "yol alındı" (düşük öncelik) |
| A31 | [Ben.tsx:830](../../../frontend-v2/src/screens/Ben.tsx#L830) | `Fener hiç sönmedi.` | `Serin hiç kırılmadı.` | kutlama ekranı · fener |
| A32 | [Kaptan.tsx:28](../../../frontend-v2/src/screens/Kaptan.tsx#L28) | `Merhaba, ben Kaptan. Bugün nereden başlayalım? …` | `Merhaba, ben Koç. …` | sohbet karşılaması · §6 Kaptan→Koç |
| A33 | [Kaptan.tsx:229](../../../frontend-v2/src/screens/Kaptan.tsx#L229) | `get_student_snapshot: 'Seyir defterine bakıyor'` | `'Verilerine bakıyor'` | araç durum etiketi (görünür) · seyir defteri |
| A34 | [Onboarding.tsx:22](../../../frontend-v2/src/components/Onboarding.tsx#L22) | `Genel Bakış — günün güvertesi` | `Genel Bakış — bugünün özeti` | tur başlığı · §6 "Günün güvertesi"→"Bugünün özeti" |
| A35 | [Onboarding.tsx:23](../../../frontend-v2/src/components/Onboarding.tsx#L23) | `…Her sabah buradan denize açıl.` | `…Her sabah buradan başla.` | tur metni · denize açıl |
| A36 | [Onboarding.tsx:27](../../../frontend-v2/src/components/Onboarding.tsx#L27) | `Analiz — bilişsel röntgenin` | `Analiz — ustalık haritan` | tur başlığı · röntgen |
| A37 | [Onboarding.tsx:32](../../../frontend-v2/src/components/Onboarding.tsx#L32) | `Koç — yanındaki kaptan` | `Koç — yanındaki rehber` | tur başlığı · kaptan |
| A38 | [Harita.tsx:295](../../../frontend-v2/src/screens/Harita.tsx#L295) | `Bilişsel Röntgen` | `Analiz` | ekran başlığı · röntgen |
| A39 | [Harita.tsx:163](../../../frontend-v2/src/screens/Harita.tsx#L163) · [:170](../../../frontend-v2/src/screens/Harita.tsx#L170) | `Röntgen henüz çekilmedi` · `İlk röntgeni çek` | `Analiz henüz hazır değil` · `İlk analizini başlat` | boş durum · röntgen |
| A40 | [Harita.tsx:148](../../../frontend-v2/src/screens/Harita.tsx#L148) | `Röntgen çekilemedi: {…}` | `Analiz yüklenemedi: {…}` | hata · röntgen |
| A41 | [Coz.tsx:641](../../../frontend-v2/src/screens/Coz.tsx#L641) | `'Röntgenin çekildi'` | `'Analizin hazır'` | tamamlanma başlığı · röntgen |

**Röntgen notu (§6 AYRIMI):** §6 tablosunda **öğretmen "Öğrenci Röntgeni" AYNEN KALIR** (kabul
listesinde). Bu yüzden A38–A41 gibi **öğrenci tarafı** "röntgen" metinleri Analiz diline geçer;
[OgrenciRontgeni.tsx:159](../../../frontend-v2/src/screens/sinif/OgrenciRontgeni.tsx#L159) ·
[:174](../../../frontend-v2/src/screens/sinif/OgrenciRontgeni.tsx#L174) ("Bu öğrenci henüz röntgen
çekmedi") **öğretmen** tarafıdır → §6'ya göre dönüşüm **zorunlu değil** (öğrenci diliyle tutarlılık
istenirse ileride gözden geçirilir). Karar ORKESTRATÖR'e bırakıldı.

---

### B. KARAR GEREKTİREN — "Pusula" ürün-ajan adı kullanıcıya görünüyor

Kart DİKKAT'i: *"Pusula/Kaptan/Rota ürün-ajan adları backend'de kalır."* Ama **Çalışma Planı**
ekranında "Pusula" persona adı olarak KULLANICIYA gösteriliyor; §6 bu personayı adlandırmıyor.
Denizcilik konsepti §1'de tamamen söküldüğü için "pusula" (deniz aleti) çelişki yaratıyor. **Bu bir
tasarım kararıdır** — dönüşümden ÖNCE ORKESTRATÖR/tasarım netleştirmeli:

| Dosya · satır | Görünür metin | Seçenek A (persona kalır) | Seçenek B (nötrle) |
|---|---|---|---|
| [Rota.tsx:159](../../../frontend-v2/src/screens/Rota.tsx#L159) | `Pusula · Haftalık Plan` | değişmez | `Haftalık Plan` |
| [Rota.tsx:66](../../../frontend-v2/src/screens/Rota.tsx#L66) | toast `Pusula rotayı optimizer ile kurdu.` | değişmez | `Plan optimizer ile kuruldu.` |
| [Rota.tsx:86](../../../frontend-v2/src/screens/Rota.tsx#L86) | `Pusula optimizer'ı zayıf kazanımdan rotayı kurar` | değişmez | `Planlayıcı zayıf kazanımdan planı kurar` |
| [Rota.tsx:156](../../../frontend-v2/src/screens/Rota.tsx#L156) · [:250](../../../frontend-v2/src/screens/Rota.tsx#L250) | `Pusula çiziyor…` · `Pusula rota çiziyor…` | değişmez | `Plan hazırlanıyor…` |
| [Rota.tsx:246](../../../frontend-v2/src/screens/Rota.tsx#L246) | `Pusula, ustalık haritanı ve SRS vadelerini okuyup…` | değişmez | `Planlayıcı, ustalık haritanı ve SRS vadelerini okuyup…` |
| [Rota.tsx:334](../../../frontend-v2/src/screens/Rota.tsx#L334) | `Soru havuzu dolunca sana özel rota çizeceğim.` | `…özel plan çizeceğim.` | `…özel plan çizeceğim.` |
| [Rota.tsx:333](../../../frontend-v2/src/screens/Rota.tsx#L333) | `…bugün de bir blok çöz, fener sönmesin.` | `…serin sürsün.` | `…serin sürsün.` |

> Not: "rota" sözcüğü (route) her iki seçenekte de "plan"a döner (§6 Rota→Çalışma Planı); ayrık olan
> yalnız **Pusula persona adıdır**.

---

### C. Oyunlaştırma — "metafor serbest bölgesi" (AYRI İŞARETLİ)

Kart gereği ayrı işaretlendi. **Serbest bölge = Bahçem/oyunlaştırma metaforu**; ancak FİDAN §1
denizciliği *tamamen söktü* → serbest bölgede bile **denizcilik** metaforu tema diliyle çelişir.
Aşağıdakiler oyunlaştırma olduğu için dönüşüm **zorunlu değil**, ama denizcilik olanlar için
doğa/büyüme temalı yeniden adlandırma önerilir (nihai karar tasarım):

| Dosya · satır | Mevcut | Tür | Öneri (doğa temalı) |
|---|---|---|---|
| [rozetler.ts:11](../../../frontend-v2/src/lib/rozetler.ts#L11) | `Fener Bekçisi` | rozet (7 gün seri) | `Işık Bekçisi` / `Sabah Yıldızı` |
| [rozetler.ts:13](../../../frontend-v2/src/lib/rozetler.ts#L13) | `Deniz Kurdu` | rozet (100 gün seri) | `Kök Salan` |
| [rozetler.ts:14](../../../frontend-v2/src/lib/rozetler.ts#L14) | `İlk Sefer` | rozet (25 soru) | `İlk Filiz` |
| [rozetler.ts:15](../../../frontend-v2/src/lib/rozetler.ts#L15) | `Açık Deniz` | rozet (100 soru) | `Açık Çayır` |
| [rozetler.ts:16](../../../frontend-v2/src/lib/rozetler.ts#L16) | `Okyanus Aşan` | rozet (500 soru) | `Orman Aşan` |
| [rozetler.ts:19](../../../frontend-v2/src/lib/rozetler.ts#L19) | `Kaptan` | rozet (Rütbe 8) | `Ulu Ağaç` |
| [Ben.tsx:32](../../../frontend-v2/src/screens/Ben.tsx#L32) | `RUTBE = ['Er'…'Kaptan']` | rütbe merdiveni (askeri) | doğa/büyüme kademesi (tohum→ulu ağaç, §5.3 ile hizalı) |

> DİKKAT: rozet `id`'leri (`streak_7` vb.) sunucu `BADGE_CATALOG` ile birebir — **yalnız `ad`
> alanı değişir, `id` ASLA.** Rütbe adları da gamification.ts'te olabilir → BACKEND ile eşgüdüm
> gerekir (API sözleşmesi riski; sonraki adım önerisine yazıldı).

---

### D. Görsel/sahne öğeleri — METİN DEĞİL (görsel dönüşüm, AYRI KART)

Bunlar kullanıcıya görünür ama **metin değil**; §5 (İmza Görsel Öğeler) kapsamında ayrı görsel
kartların işi. Envantere tamlık için eklendi:

| Dosya | Öğe | FİDAN karşılığı |
|---|---|---|
| [Login3D.tsx](../../../frontend-v2/src/components/Login3D.tsx) · [Login.tsx `DenizSahnesi`](../../../frontend-v2/src/screens/Login.tsx#L300) | Deniz + fener + şamandıra login sahnesi | §5.6 orman kenarı + göl |
| [Lighthouse.tsx](../../../frontend-v2/src/components/Lighthouse.tsx) | Kıyı feneri (streak görseli) | §5.3 Streak Fidanı |
| [Ben.tsx `VoyageStreak`](../../../frontend-v2/src/screens/Ben.tsx#L646) · `Fener` kutlaması | Gemi + deniz feneri SVG sahnesi | §5.3 büyüyen bitki + §5.5 yaprak konfeti |
| [fx.tsx `YakamozBackdrop`](../../../frontend-v2/src/components/fx.tsx#L19) | Yakamoz ışık blobları | §5.1 Işık Huzmesi |
| [Ambiyans.tsx](../../../frontend-v2/src/components/Ambiyans.tsx) | Yakamoz planktonu/kabarcık | §5.1 ışık tozu / ateşböceği |
| [Arsiv.tsx `BantDalgalar`](../../../frontend-v2/src/screens/Arsiv.tsx#L288) | Prestij bandı dalga sahnesi | doğa/orman bandı |
| [NotFound.tsx `SisliDeniz`](../../../frontend-v2/src/screens/NotFound.tsx#L27) | Sisli deniz vinyeti | orman/çayır vinyeti |

---

### E. Kod-içi adlar / yorum / route / tip — DÖNÜŞÜM KAPSAMI DIŞI

Kullanıcıya görünmez; kart ve §6 notu gereği **dokunulmaz** (backend sözleşmesi + mimari adlar):

- **Tema token nesneleri & yorumlar:** [ui.tsx `KIYI`/`OKYANUS`](../../../frontend-v2/src/ui.tsx#L37),
  [theme.tsx](../../../frontend-v2/src/lib/theme.tsx#L6), [index.css](../../../frontend-v2/src/index.css#L4)
  ("COASTAL", "Deniz köpüğü camı", "Yakamoz parıltısı" — hepsi **yorum**; token *anahtarları*
  `KIYI/OKYANUS` legacy `ui.tsx`'te JS adı — yeniden adlandırma tema-katmanı işi, metin değil).
- **Route path & lazy adları:** `/rota`, `/kaptan`, `/harita`, `/arsiv`, `/kule` ve
  `Rota`/`Kaptan`/`Harita` bileşen adları ([App.tsx:33-36](../../../frontend-v2/src/App.tsx#L33)) — URL/kod.
- **Tip & union değerleri:** `RontgenNode`/`RontgenYanit` ([types.ts](../../../frontend-v2/src/lib/types.ts)),
  `role: 'kaptan'` union ([Kaptan.tsx:24](../../../frontend-v2/src/screens/Kaptan.tsx#L24)),
  `Pusula planı` tip yorumu ([types.ts:132](../../../frontend-v2/src/lib/types.ts#L132)).
- **Backend uçları:** `apiPost('/agents/pusula')` ([Rota.tsx:63](../../../frontend-v2/src/screens/Rota.tsx#L63)) — backend ajanı, sözleşme.
- **Ölü kod:** [format.ts:11 `vardiya()`](../../../frontend-v2/src/lib/format.ts#L11) "Gece/Sabah/Gündüz
  vardiyası" döndürür ama **hiçbir yerden çağrılmıyor** (grep: yalnız tanım) → kullanıcıya görünmez;
  dönüşüm gereksiz, **temizlik önerisi** (ayrı kart).
- **Diğer literal "arşiv":** [Arsiv.tsx:103](../../../frontend-v2/src/screens/Arsiv.tsx#L103) "Gerçek
  ÖSYM arşivi", [:175](../../../frontend-v2/src/screens/Arsiv.tsx#L175) "Arşiv yüklenemedi" — burada
  "arşiv" = ÖSYM'nin gerçek arşivi (literal, denizcilik değil); nav zaten "Çıkmış Sorular". Tutarlılık
  istenirse :175 "Çıkmış sorular yüklenemedi" yapılabilir (düşük öncelik).

---

### Değişen dosyalar
- Yalnız bu kart: `docs/agents/handoff/GOREV-001-arayuz-metin-envanteri.md` (durum + RAPOR + Günlük).
- **Hiçbir `frontend-v2/src` kaynak dosyasına yazılmadı.**

### Koşulan kapılar + çıktıları
- **tsc / `bun run build`: KOŞULMADI (gerekmez).** Bu kart salt-okuma envanteridir; sıfır kaynak-kod
  değişikliği var, kalite kapıları kod değişikliğini denetler. Bunun yerine Kabul Kriteri 4 doğrulandı:
- `git status --short -- frontend-v2/ docs/agents/handoff/` çıktısı — kaynak farkı YOK, yalnız kart:
  ```
   M frontend-v2/src/App.tsx            ← oturum ÖNCESİ kirli (Başlangıç Durumu'ndaki 30 kayıt)
   M frontend-v2/src/components/MathMarkdown.tsx   ← oturum öncesi
   M frontend-v2/src/lib/api.js                    ← oturum öncesi
   M frontend-v2/src/lib/auth.tsx                  ← oturum öncesi
   D frontend-v2/src/lib/latex.js                  ← oturum öncesi
   M frontend-v2/src/lib/sinif.tsx                 ← oturum öncesi
   M frontend-v2/src/lib/useAsync.ts               ← oturum öncesi
   M frontend-v2/src/main.tsx                      ← oturum öncesi
   M frontend-v2/vite.config.js                    ← oturum öncesi
  ?? docs/agents/handoff/            ← bu kartın bulunduğu (izlenmeyen) dizin
  ?? frontend-v2/src/lib/latex.ts    ← oturum öncesi (yeni)
  ```
  Bu görevde **hiçbir M/D girdisine dokunulmadı** (§5: `git checkout --`/`restore` yasak); listedeki
  değişiklikler kartın Başlangıç Durumu'nda beyan edilen oturum-öncesi kirli ağaçtır.

### Gerçekleşen maliyet
- **$0** — yalnız Grep/Read; paralı LLM çağrısı yapılmadı.

### Açık riskler
1. **Röntgen ayrımı (§6):** öğrenci tarafı Analiz'e geçerken öğretmen "Öğrenci Röntgeni" §6'da kalır →
   iki yüzeyde farklı sözcük tutarsız görünebilir. Karar ORKESTRATÖR/tasarımda (bkz. A-bölümü Röntgen notu).
2. **Pusula persona kararı (B):** dönüşümden önce netleşmezse ekran yarı-metaforlu kalır.
3. **Rozet/rütbe adları (C) BACKEND'e bağlı:** `ROZETLER.ad` sunucu `BADGE_CATALOG` aynası; `id`
   sabit kalmalı, ama görünen `ad` değişikliği backend gamification.ts ile eşgüdüm ister → **API/veri
   sözleşmesi riski**, FRONTEND tek başına karar veremez.
4. **Görsel sahneler (D)** metin dönüşümüyle senkron değişmezse "metin nötr ama görsel hâlâ deniz"
   uyumsuzluğu oluşur.

### Sonraki adım önerisi
- **GOREV-002 (FRONTEND):** A-bölümü düz dönüşümü — nav/başlık/hata/404/tema/login/onboarding/streak
  metinleri (üç tema katmanı senkron; §6 Röntgen ayrımına sadık). Salt metin, düşük risk.
- **BACKEND kartı (ORKESTRATÖR açar):** C-bölümü rozet/rütbe `ad` değişimi için gamification.ts +
  `ROZETLER` aynası eşgüdümü (id'ler sabit). API sözleşmesi değiştiği için ANAYASA §5 gereği ayrı kart.
- **Tasarım/ORKESTRATÖR kararı:** B (Pusula persona) ve Röntgen §6-ayrımı netleştirilsin — GOREV-002
  öncesi girdi.
- **Görsel kartlar (FRONTEND, ayrı):** D-bölümü §5 görselleri (Streak Fidanı, Işık Huzmesi, orman login).
- **Temizlik (düşük öncelik):** `vardiya()` ölü kodu kaldırılabilir.

## Günlük
- 2026-07-21 · ORKESTRATÖR · kart açıldı (beklemede)
- 2026-07-21 · FRONTEND · alindi
- 2026-07-21 · FRONTEND · tamamlandi (envanter: A=41 görünür geçiş · B=Pusula kararı · C=oyunlaştırma · D=görsel · E=kapsam dışı)
- 2026-07-21 · ORKESTRATÖR · onaylandi (4 ölçüt sağlandı; git status ile kaynak-dokunulmazlık doğrulandı). KARARLAR: B→Seçenek B (Pusula UI'da nötrlenir — §6 "başlık işlevini söyler" + Kaptan→Koç simetrisi; backend iç adı/sözleşme dokunulmaz). Röntgen ayrımı→öğrenci tarafı Analiz dili, öğretmen "Öğrenci Röntgeni" + OgrenciRontgeni metinleri KALIR (kullanıcı direktifi + M§10 teşhis dili öğretmene açık). Rozet/rütbe (C) ERTELENDİ — yeni adlar kullanıcı onayına sunulacak, sonra BACKEND+FRONTEND kart çifti. Dönüşüm işi → GOREV-002.
- 2026-07-21 · ORKESTRATÖR · C-bölümü kararı kapandı: kullanıcı doğa-metaforlu önerileri REDDETTİ — rozet/rütbe adları DÜZ İŞLEVSEL olacak ("7 Gün Seri", "100 Soru", "Seviye 8"…). Kart çifti açıldı: GOREV-003 (BACKEND katalog) + GOREV-004 (FRONTEND ayna, bagimlilik: 002+003).
