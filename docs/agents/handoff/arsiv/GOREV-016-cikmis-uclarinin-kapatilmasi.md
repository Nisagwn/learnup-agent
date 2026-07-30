---
gorev: GOREV-016-cikmis-uclarinin-kapatilmasi
kimden: ORKESTRATÖR
kime: BACKEND
durum: onaylandi
oncelik: P0   # telif riski — UI'sız API erişimi de "yayın"dır
bagimlilik: [GOREV-015]   # önce UI giriş noktaları kalkar (aksi hâlde ekranlar hata döker)
dokunulan-dosyalar:
  - learnup-brain/src/routes/questions.routes.ts   # /questions/osym/* (kesin liste envanterle netleşir)
migration-gerekli: hayir
---

## Amaç
Telif kararının sunucu tarafı: **öğrenci/öğretmen rollerine ÖSYM çıkmış sorusu SERVE eden tüm
uçlar kapatılır.** Çıkmışlar DB'de yaşamaya devam eder — RAG/üretim hattı ve (gerekliyse) yönetici
iç operasyonu dışında kimse okuyamaz.

## Bağlam
- Karar kaydı: `EKRAN-HARITASI.md` §7 + `YKS-BEYIN-SISTEM-MIMARISI.md` §1 (2026-07-22).
- UI giriş noktaları GOREV-015'te kalkıyor; bu kart API katmanını kapatır (token'ı olan bir
  kullanıcı UI olmadan da uçları çağırabilir — yayın sayılır).
- **DOKUNULMAZ:** `cevaplanabilir_sorular` VIEW'ı ve iç cevap-doğrulama mekanizması; ingest/
  etiketleme scriptleri; `yks_exemplars` RAG beslemesi; model-router bölgesi. DB'den veri SİLİNMEZ.

## Kabul Kriterleri
- [x] **Envanter:** çıkmış soru servis eden uçların TAM listesi RAPOR'a (`/questions/osym/*` +
      matrix + varsa practice/assignments içinden osym kaynağına ulaşan yollar) — grep + route
      taraması kanıtıyla
- [x] Öğrenci/öğretmen rolüyle bu uçlara istek → **404** (kaynak yok gibi — sahiplik ihlali
      deseniyle tutarlı, M§9; 403 numaralandırma kehaneti yaratır); yönetici İÇ ihtiyacı gerçekten
      varsa uç `requireRole('admin')` arkasında tutulabilir, yoksa tamamen kapanır (tercihi RAPOR'a yaz)
- [x] **Ödev derleme çıkmış kaynak KABUL ETMEZ:** istekte osym kaynağı gelirse Türkçe mesajlı
      açık hata (sessizce AI havuzuna düşülmez); mevcut ödevlerde çıkmış soru varsa etkisi RAPOR'a
- [x] AI soruların çözme/cevap-doğrulama akışı REGRESYONSUZ (test kanıtı)
- [x] `bun run typecheck` + `lint` + `bun test src` sıfır hata; davranış değişti → `bun run eval`
      (BAYRAKSIZ, $0) → çıktılar RAPOR'da

## Kısıtlar / Kapsam Dışı
- Migration YOK (yalnız uygulama katmanı); DB verisi silinmez; RLS/GRANT değişikliği bu kartta yok.
- `/questions/osym` route sıralaması kuralı (V§3.5.8) — uç kapansa da sıralama bozulmaz
  (kalan route'lar için düzen korunur).

## Başlangıç Durumu
- Git rev: `5c2610e` (branch `feat/yks-brain`); kirli ağaç ~58 kayıt — onaylı işler (kullanıcı
  commit'i hâlâ bekleniyor). `questions.routes.ts` önceki onaylı işlerden kirli — yalnız bu kartın
  işi eklenir. UI giriş noktaları GOREV-015'te KALKTI (onaylı) — uçlar artık arayüzden çağrılmıyor.
  İlk adım: `git diff --stat` fotoğrafı RAPOR'a.

## Onay Kayıtları
- Paralı koşu: GEREKMEZ ($0 — eval bayraksız).

## RAPOR

### Envanter (grep `osym|cikmis|yks_questions` × tüm src + route taraması)
Çıkmış soru İÇERİĞİ servis eden yollar (hepsi kapatıldı):
1. `GET /api(/v1)/questions/osym` — tam içerik (soru+şık+cevap+çözüm) → **KAPANDI** (mount kalktı)
2. `GET /api(/v1)/questions/osym/matrix` — ders×yıl×etiket sayımı (tek amacı çıkmış arşiv UI'ı) → **KAPANDI**
3. `GET /api(/v1)/questions/osym/years` — yıl envanteri → **KAPANDI**
4. `GET /teacher/soru-havuzu` — `kaynak∈{osym,karisik}` iken çıkmış `question_text` listeliyordu → çıkmış tarafı **KAPANDI** (yalnız AI listeler; açık `kaynak=osym` → 400 `cikmis_kaynak_kapali`)
5. `POST /teacher/odev` + `POST /teacher/hedefli-odev` → `lib/odev-derle.ts:havuzdanSec` — `osym/karisik` modda `yks_questions`'tan örnekleyip `questions`'a KOPYALIYORDU (ödev = öğrenciye servis) → **KAPANDI** (aşağıda)
6. `GET /practice/review` — SRS kartı çıkmışa işaret ediyorsa içeriği öğrenciye veriyordu → çıkmış okuma **KAPANDI** (eski `questions` havuzu kartları gibi sessizce atlanır)
7. `GET /assignments/:id/questions` (+targeted) — `questions` tablosundaki ESKİ çıkmış KOPYALARI servis etmeye devam ediyor (aşağıda "etki ölçümü"; DB verisi bu kartta silinmez)

İçerik SERVİS ETMEYEN, DOKUNULMAYAN osym okumaları (gerekçeli):
- `GET /admin/panel` — yalnız toplam/ders sayımı, `requireRole('admin')` arkasında → yönetici İÇ envanter ihtiyacını bu karşılıyor; ayrı bir admin çıkmış-listeleme ucu TUTULMADI (**tercih: tam kapatma** — sayım yetiyor, içerik listelemek yeniden-yayın kapısı açardı)
- `GET /questions/ai/kalite` — çıkmışı yalnız İÇ REFERANS olarak ölçer (sızıntı/kuşatma yüzdeleri, ortalama); içerik dönmez → kartın DOKUNULMAZ listesi (iç ölçüm)
- `GET /teacher/sinif/zayif-kazanimlar` — `havuzdaSoru.osym` SAYIMI (içerik değil) → bırakıldı; UI kararı GOREV-025'e not (aşağıda risk)
- `cevaplanabilir_sorular` VIEW + `lib/answers.ts`, ingest/etiketleme scriptleri, `yks_exemplars` RAG, eval — kart gereği DOKUNULMADI
- `lib/test-modes.ts` adaptif montaj — zaten fiziksel olarak yalnız `yks_ai_questions` (0013), değişiklik gerekmedi

### Yapılan
- `app.ts`: `/questions/osym` mount'u + import KALDIRILDI. Yol artık hiçbir router'a eşleşmiyor → `notFound` **404** (kaynak hiç yokmuş gibi; rol fark etmez — admin dahil, çünkü içerik ihtiyacı yok). Ayrı bir "osym→404 handler" bilinçli olarak YOK: kalması yeniden açılma riskiydi. `/questions/ai` → `/questions` sıralaması korundu (V§3.5.8).
- `routes/osym.routes.ts` SİLİNDİ (114 satır).
- `lib/odev-derle.ts`: `havuzdanSec` girişine telif kapısı — `kaynak='osym'` → **400 `cikmis_kaynak_kapali`** Türkçe mesajla ("sessizce AI'ya düşme" yok); `karisik` fiilen `ai` (açık çıkmış talebi değildir, örnekleme artık YALNIZ `yks_ai_questions`); `tablodanOrnekle` tablo parametresi kaldırıldı (çıkmış tablo derleme yüzeyinden parametreyle bile seçilemez); `secilenleriGetir` elle seçimde çıkmış id yakalarsa AÇIK 400 (yakalayamazsa bile çıkmış giremez — yalnız AI tablosu okunur; arıza yönü güvenli).
- `routes/teacher.routes.ts`: `soru-havuzu` tek tabloya indi (sayfalama basitleşti), açık `kaynak=osym` → 400; `havuzSayimi` yalnız AI.
- `routes/practice.routes.ts`: `/review` çıkmış tablo okuması kaldırıldı.
- Test kanıtı: `src/app.test.ts` (rota yüzeyinde 'osym' katmanı YOK → 404 kanıtı + sıralama kuralı; Redis modülü mock — kapalı Redis'in unhandled rejection'ı test sürecine sızmasın) · `src/lib/odev-derle.test.ts` (osym kapısı DB'siz 400/kod/mesaj sözleşmesi). AI çözme/doğrulama regresyonsuz: mevcut 107 test + yeni 3 = **110 pass 0 fail**.
- NOT (404 vs açık hata ayrımı): adanmış `/questions/osym/*` uçları kriter gereği 404 (numaralandırma kehaneti yok); öğretmen derleme/havuz yüzeyinde ise kriter 3'ün açık Türkçe hatası uygulandı — uç meşru ve AI için çalışmaya devam ediyor, sessiz daralma "filtre bozuk" sanılırdı.

### Mevcut ödevlerde çıkmış etkisi (salt-okunur ölçüm, 2026-07-23)
`questions` tablosunda **34** çıkmış kopya; sınıf ödevleri **6/7**'sinde 15 çıkmış soru; hedefli setler **5/5**'inde 19 çıkmış soru. Bunlar `assignments.routes` üzerinden öğrencilere SERVİS EDİLMEYE DEVAM EDİYOR (ödev-değişmezliği + "DB'den veri silinmez" kısıtı gereği bu kartta dokunulmadı) — karar ORKESTRATÖR'e (aşağıda öneri).

### Değişen dosyalar (`git diff --stat`, yalnız bu kartın dosyaları)
```
 learnup-brain/src/app.ts                    |  19 +++--   (önceki onaylı işle birleşik; bu kartın payı mount/import kaldırma)
 learnup-brain/src/lib/odev-derle.ts         |  79 ++++++---------   (önceki onaylı işle birleşik; bu kartın payı telif kapısı + AI-only örnekleme)
 learnup-brain/src/routes/osym.routes.ts     | 114 ------------- (SİLİNDİ)
 learnup-brain/src/routes/practice.routes.ts |  12 +--   (tamamı bu kart)
 learnup-brain/src/routes/teacher.routes.ts  |  55 ++++-------   (önceki onaylı işle birleşik; bu kartın payı soru-havuzu/havuzSayimi)
 + yeni: learnup-brain/src/app.test.ts · learnup-brain/src/lib/odev-derle.test.ts
```
Kart beyanı `questions.routes.ts` "envanterle netleşir" notuyla açılmıştı — envanter sonucu `questions.routes.ts`'te çıkmış servisi YOK (yalnız AI üretimi); gerçek dosya listesi yukarıdaki.

### Koşulan kapılar + HAM çıktılar (son ağaç durumuyla, 2026-07-23 ~10:41)
```
== TYPECHECK ==  $ tsc --noEmit  → OK(0 hata)
== LINT ==       ✖ 9 problems (0 errors, 9 warnings)   ← uyarıların tamamı önceden vardı (kullanılmayan import/değişken; bu kart yeni uyarı eklemedi)
== TEST ==       110 pass · 0 fail · 342 expect() · 5 dosya  → exit 0
== EVAL ==       (bayraksız) snapshot 2026-07-23T07-41-26-751Z.json · kuralHash 20cc09f2bc50
                 baseline 2026-07-22T11-51-35-449Z.json · sızıntı 0.286→0.286 · kuşatma 0.000→0.000
                 görsel 4.000→4.000 · NN kopya 0.000→0.000
                 SONUÇ: YEŞİL — altın set geçti, drift temiz.  → exit 0
```
Dürüstlük notu: ilk kapı seti 10:35-10:39'da yeşildi; 10:39-10:40 arasında `src/scripts/eval.ts` (beyanım DIŞI, eşzamanlı başka oturum — GOREV-020 imzalı) geçici olarak typecheck'i kırdı, o oturum 10:40:04'te tamamlayınca DOKUNMADAN yeniden koştum; yukarıdaki çıktılar son durumun. Redis kapalı — bilinen dereceli mod.

### Gerçekleşen maliyet
$0 — hiçbir LLM çağrısı yapılmadı (eval bayraksız, hakem kapalı; ölçüm scripti salt-okunur DB).

### Açık riskler
1. **Mevcut ödevlerdeki 34 çıkmış kopya hâlâ öğrenciye serviste** (6 sınıf ödevi + 5 hedefli set). Telif riskinin kalan tek yüzeyi bu; karar bu kartın kapsamı dışında (DB verisi silinmez).
2. Frontend hâlâ `kaynak=osym/karisik` gönderebilir (UI GOREV-025'te): `osym` artık açık 400 alır — kullanıcı Türkçe mesaj görür, sessiz kırılma yok; `karisik` çalışır ama yalnız AI getirir.
3. `teacher/sinif/zayif-kazanimlar` yanıtındaki `havuzdaSoru.osym` sayımı duruyor (içerik değil) — öğretmen atayamayacağı stoğu görür; alan sözleşmesi FRONTEND'le paylaşıldığı için tek taraflı kaldırmadım.
4. Eski SRS kartlarından çıkmışa işaret edenler tekrar setinde sessizce atlanır → bazı öğrencilerin vadesi gelen kart sayısı (count) ile dönen soru sayısı ayrışabilir (aynı davranış eski `questions` havuzu kartlarında zaten vardı).

### Sonraki adım önerisi
- **ORKESTRATÖR kararı:** mevcut ödevlerdeki 34 çıkmış kopya için ayrı kart — seçenekler: (a) kopyaları `verified=false`'a çekip ödevlerden düşürmek (ödev-değişmezliğini bozar, gönderilmiş puanlar etkilenmez ama görünüm değişir), (b) yalnız YENİ gönderimlere kapatmak, (c) olduğu gibi bırakmak (telif riski sürer). Ölçüm sayıları yukarıda.
- FRONTEND (GOREV-025): `kaynak` seçiminden osym/karisik'i kaldır; `havuzdaSoru.osym` gösterimini düşür; Arşiv çağrılarının tamamen söküldüğünü doğrula.
- İsteğe bağlı temizlik: `practice.routes.ts`'teki önceden kalan kullanılmayan importlar (lint uyarısı) ayrı ufak kartla süpürülebilir.

## Günlük
- 2026-07-22 · ORKESTRATÖR · kart açıldı (beklemede; GOREV-015 onayını bekler — telif kararının sunucu ayağı)
- 2026-07-22 · ORKESTRATÖR · SERBEST: GOREV-015 onaylandı+arşivlendi; Başlangıç Durumu dolduruldu. Kart başlatılabilir. NOT: 015 raporunun açık riski (öğretmen osym ataması) bu kartın "ödev derleme osym KABUL ETMEZ" kriterinin önemini artırıyor; UI tarafı GOREV-025'te.
- 2026-07-23 · BACKEND · alindi
- 2026-07-23 · BACKEND · oturum kesintisi sonrası devam: disk durumu doğrulandı, yarım iş (practice/review) tamamlandı
- 2026-07-23 · BACKEND · tamamlandi (kapılar yeşil: typecheck 0 hata · lint 0 hata/9 eski uyarı · test 110/110 · eval YEŞİL bayraksız $0)
- 2026-07-23 · ORKESTRATÖR · onaylandi → arsiv/ (DENETİM: osym.routes.ts silinmiş [doğrulandı], yeni test dosyaları yerinde; envanter 7 yol + gerekçeli DOKUNULMADI listesi ikna edici; 404/400 ayrımı isabetli [adanmış uçlar 404, meşru öğretmen yüzeyinde açık Türkçe 400]; admin için TAM KAPATMA tercihi KABUL [sayım /admin/panel'de yeterli — içerik listelemek yeniden-yayın kapısı olurdu]; kapı çıktıları ham, eşzamanlılık dürüstlük notu örnek nitelikte. KARAR [ORKESTRATÖR, 2026-07-23]: mevcut ödevlerdeki 34 çıkmış kopya için seçenek (a) — aktif ödev/setlerden düşürme, GOREV-029 açıldı [iki aşamalı, silme yok, puanlar korunur]. zayif-kazanimlar osym sayımı UI kararı → kabuk/öğretmen temizliğine not. 4 ölçüt sağlandı.)
