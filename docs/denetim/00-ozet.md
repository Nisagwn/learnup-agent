# Mantık Hatası Denetimi — Birleşik Özet

**Tarih:** 2026-08-10 · **Dal:** `ci`
**Kapsam:** `frontend-v2/src/**` (13 ekran + `kule/` + `sinif/`, 28 bileşen, 22 lib dosyası) · `learnup-brain/src/routes/**` (24 route + middleware + `app.ts`) · `learnup-brain/src/{agents,lib,workers,clients,config,jobs}`
**Yöntem:** Üç bağımsız denetim; her bulgu dosyada okunarak doğrulandı, tetiklenemeyen şüpheler elendi. Kod değiştirilmedi.

**Toplam 84 bulgu** — 6 KRİTİK · 20 YÜKSEK · 33 ORTA · 25 DÜŞÜK
Detaylar: [01-frontend.md](01-frontend.md) · [02-backend.md](02-backend.md) · [03-cekirdek.md](03-cekirdek.md)

---

## DURUM (2026-08-11) — dört faz uygulandı

P0–P3'ün tamamı koda işlendi. Her fazın sonunda: beyin `typecheck` + `lint` (0 hata) +
166/166 test, arayüz `typecheck` + `vite build` — hepsi yeşil.

**Uygulanmayan tek şey migration'dır:** `migrations/0036_gonderim_tekilligi.sql` yazıldı ama
Supabase'e BASILMADI. İçinde iki kısıt var (`assignment_submissions` tekilliği, `class_code`
benzersizliği) ve ikisi de önce mevcut çakışmaları ayıklıyor — basmadan önce okunmalı.
Kod o kısıt olmadan da doğru çalışır; kısıt yalnız eşzamanlı gönderim yarışını kapatır
(`23505` → 409 yolu kodda hazır).

### Denetimde HATALI çıkan bulgular (düzeltilmedi, çünkü hata yoktu)

Her düzeltme öncesi bulgu koda karşı doğrulandı; üçü tutmadı:

1. **backend #21** — `/practice/review` `count`'u zaten `questions.length` döndürüyordu ve
   elenen bakiye `vadeliKart`ta ayrıca veriliyordu.
2. **frontend #15 (ikinci yarı)** — `havuz-moderasyon.tsx`'te dört filtre de zaten
   `setSayfa(0)` çağırıyor. Sayfa sıfırlama hatası yalnız `OdevAtolyesi.tsx`'te vardı.
3. **frontend #14 (kısmen)** — tekrar kartının sayısı zaten servis edilebilir set boyutundan
   geliyordu.

### Denetimin KAÇIRDIĞI bulgu (düzeltildi)

**`frontend-v2/src/screens/sinif/` altındaki 4 öğretmen ekranı çift kodlanmıştı** — UTF-8
baytları CP1252 sanılıp yeniden UTF-8'e yazılmış (mojibake). Öğretmen ekranda
`Ã–dev yayÄ±nlandÄ±` görüyordu; 329 bozuk dizi, 2112 koşu. Dosyalar KARIŞIKTI (bir kısmı
temiz Türkçe), o yüzden tüm-dosya dönüşümü yerine yalnız (a) bozulma imzası taşıyan,
(b) CP1252 baytına haritalanabilen, (c) geçerli UTF-8'e çözülen koşular onarıldı; ASCII
iskeletin değişmediği her dosyada ayrıca doğrulandı. Kalıntı: 0.

### Faz sırasında ortaya çıkan yan bulgular (düzeltildi)

- Arayüzde CI **typecheck koşmuyor** (yalnız `vite build`), bu yüzden 9 gerçek tip hatası
  yıllardır görünmezdi: `Coz.tsx`'te `CozKaynak` uyuşmazlığı ve `Kaptan.tsx`'te hiç
  doldurulmayan `msg.tools` ölü dalı (araç rozeti asla çizilemiyordu). Öneri: CI'a
  `arayuz → typecheck` adımı eklensin.
- `lib/answers.ts` yanıt sözleşmesi genişledi (`isCorrect`, `correctOption`, `solution`,
  `dogrulandi`, `tekrar`). Bu, cevap kâhinini kapatmanın ön koşuluydu: anlık geri bildirim
  ürün vaadi olduğu için alanı sadece kaldırmak yetmiyordu, cevaptan SONRA sunucudan
  dönmesi gerekiyordu.
- `todayISO()` Faz 2'den Faz 1'e çekildi: tekrar kapısının gün sınırı ona dayanıyor.

---

## 1. Sistemik temalar

Bulguların çoğu tek tek hata değil; aynı kararın bazı yerlerde uygulanıp bazılarında unutulmasından doğuyor. Beş tema, kritik bulguların tamamını açıklıyor.

### T1 — Puan ekonomisi hiçbir katmanda korunmuyor (KRİTİK)
Üç ayrı zafiyet aynı sonuca çıkıyor: XP / lig / rozet / bahçe coin'i sınırsız üretilebiliyor.

| Katman | Bulgu | Ne yapıyor |
|---|---|---|
| Backend | `practice.routes.ts:17-39` | Soruyla birlikte `correctAnswer` + `explanation` gönderiyor |
| Backend / lib | `answers.routes.ts:12`, `lib/answers.ts:124` | Aynı soru sonsuz kez cevaplanıp her seferinde XP yazdırılabiliyor; `attemptNumber` istemciden |
| Backend | `assignments.routes.ts:258-304` | `/targeted/submit` tek gönderim kuralı yok; `autoScore` geri okunarak doğru cevap türetiliyor |
| Backend | `assignments.routes.ts:207-215` | `/submit` tekilliği TOCTOU; DB'de `unique(assignment_id, student_id)` yok |
| Frontend | `Coz.tsx:309-315` | "Tekrar çöz" aynı soruları yeniden puanlatıyor |

Aynı repoda `assignments.routes.ts:56` `sorulariSoy()` cevabı **kasten** soyuyor ve `/submit` tek-gönderim kilidini "cevap kâhinini kapatmak" yorumuyla kuruyor — yani kural biliniyor, kardeş uçlarda uygulanmamış.

### T2 — "Bugün" üç farklı zaman diliminde hesaplanıyor (YÜKSEK)
`docker-compose.yml`'de hiçbir servise `TZ` verilmemiş → konteyner UTC.

- `lib/gamification.ts:83` `todayISO()` → **sunucu yereli (UTC)**: seri, günlük görevler, `user_logs`
- `lib/rontgen.ts:175`, `teacher.routes.ts:200`, `atolye.worker.ts:139` → **Europe/Istanbul**: trend, röntgen, gece işleri
- `Bugun.tsx:84`, `Harita.tsx:173`, `Ben.tsx:52` → **tarayıcı yereli**; `SinifPanosu.tsx:316` → Europe/Istanbul

Sonuç: TSİ 00:00–03:00 arası çözülen sorular "dün"e yazılıyor, gece çalışan öğrencinin serisi kopuyor, "bugün tamamlandı" rozeti çıkmıyor, öğrenci boşuna dondurma hakkı harcıyor (`Ben.tsx:516`), denetim defteri tarih filtresi ±3 saat kayıyor (`admin-yonetim.routes.ts:878`). Aynı ekranda iki stat aynı günü farklı sayıyor (`Harita.tsx:85` öğlen çıpası + `f >= 0`).

**Tek düzeltme:** `Europe/Istanbul` gün anahtarı üreten tek bir yardımcı + `TZ=Europe/Istanbul` (ancak `atolye.worker.ts:139` bu değişimde ters yönde kırılır — birlikte ele alınmalı).

### T3 — İstemciden gelen veri, sunucunun bilmesi gereken veri yerine kullanılıyor (YÜKSEK)
- `answers.routes.ts:14` — `kazanimId`/`subject`/`difficulty` gövdeden: öğrenci doğrularını zor kazanıma, yanlışlarını başka kazanıma yazdırabiliyor → **öğretmenin bütün teşhis yüzeyi** (`user_mastery`, zayıf kazanımlar, sınıf ısı haritası, hedefli ödev derlemesi) istemci tarafından şekillendirilebiliyor
- `questions.routes.ts:259` — `meta.teacherId` gövdeden, rol kapısı yok → başka öğretmen adına sınırsız soru yazımı
- `assignments.routes.ts:222` — `maxScore = answers.length` → 20 soruluk ödevde 1 cevap gönderen %100 görünüyor
- `generation.ts:911` + `questions.routes.ts:17` — `skipVerification`/`costOptimized` istemciden kabul ediliyor, hakem hiç çağrılmadan **sahte ACCEPT** üretilip ortak havuza `verified:true` yazılıyor

### T4 — Yetki/sahiplik iki farklı tanımla yürüyor (YÜKSEK)
`lib/yetki.ts:183` sahipliği `teacher_id === X **VEYA** teacher_ids içeriyor` sayıyor; silme yolları yalnız `teacher_id`'yi null'lıyor (`teacher.routes.ts:1088`, `admin-yonetim.routes.ts:276`) → **bir öğretmen başka öğretmenin sınıfından öğrenci düşürebiliyor**. `questions.routes.ts:175` rol kapısını elle kuruyor ve `is_approved`'a bakmıyor → onayı iptal edilmiş öğretmen öğrenci verisi çekmeye devam ediyor.

### T5 — Sessiz başarısızlık: hata var, kullanıcı ve log görmüyor (ORTA)
- `practice.routes.ts:178` — supabase-js reject etmez; `catch` bloğu **ölü kod**, `user_answers` insert'i sessizce düşüyor (ampirik zorluk ölçümü bu veriye dayanıyor)
- `agents/bus.ts:70-90` — Redis yokken in-process kuyruk **hiçbir işi çalıştırmıyor**; `agent_tasks` sonsuza dek `PENDING`
- `Coz.tsx:545` — havuz tükenince yazılan hata metni ekranda hiç görünmüyor, aynı soru yeniden soruluyor
- `Konular.tsx:107` — talep POST'u `.catch(() => {})` ile yutuluyor, arayüz "istendi" diyor
- `planner.ts:35` — Supabase hatası yutulup **boş plan** öğrencinin sağlam planının üzerine yazılıyor
- `chat.routes.ts:33` — RPC'nin her hatası boş listeye çevriliyor

---

## 2. Öncelik sırası

### P0 — Üretimde açık, veri bütünlüğünü bozuyor
1. `practice.routes.ts:17-39` — `shapeQuestion`'dan `correct_answer`/`correctAnswer`/`explanation` çıkar (`sorulariSoy` deseni)
2. `lib/answers.ts:124` + `record_answer` RPC — `(user_id, question_id)` idempotency; ikinci kez XP verme
3. `assignments.routes.ts:258-304` — `/targeted/submit`'e tek gönderim kilidi (`.eq('status','pending')`, 0 satır → 409)
4. `generation.ts:911` + `questions.routes.ts:17-18` — `skipVerification`/`costOptimized` alanlarını şemadan kaldır; hakem atlanırsa `verified:false`
5. `questions.routes.ts:241` — `requireRole('teacher','admin')`, `meta.teacherId`'yi yok say, `.max(50)`
6. `Odevler.tsx:402` — boş bırakılan soru `selectedIndex: -1` gidiyor, zod `.min(0)` reddediyor → **öğrenci ödevi hiç gönderemiyor**; boşları paketten çıkar

### P1 — İş kuralı yanlış sonuç üretiyor
7. `assignments.routes.ts:222,281` — `maxScore = questionIds.length`
8. `assignments.routes.ts:175` — `due_date` ve `status` kontrolü (son tarih özelliği fiilen yok)
9. `answers.routes.ts:14` — `kazanimId`/`subject`/`difficulty`'yi soru satırından oku
10. `teacher.routes.ts:1088` — çıkarma `teacher_ids`'ten de düşürsün
11. `questions.routes.ts:175` — `assertTeacherOwnsStudent` + `is_approved` kontrolü
12. `assignment_submissions`'a `unique(assignment_id, student_id)`; `profiles.class_code`'a partial unique index (`sinif.routes.ts:61` bugün 500 üretiyor)
13. T2'nin tamamı — tek gün-anahtarı yardımcısı
14. `agents/bus.ts:70` — `pumpInproc` içindeki `publishEvent`'i `if (redis)` ile koru
15. `model-router.ts:794` — `routedStream`'e maliyet tavanı kapısı + `maliyetEkle`; `:716` `freeBudgetTuket`'i deneme döngüsünün içine al (3 çağrı, 1 bütçe düşümü)
16. `App.tsx:249` — `ErrorBoundary` rota değişiminde sıfırlansın (bir ekran çökünce tüm uygulama kilitleniyor)
17. `Ben.tsx:638` — sınıfa katılma/ayrılma sonrası `refreshProfile()` (Ödevler sekmesi belirmiyor)
18. `Coz.tsx:545,562` — havuz boş / `correct_answer` null dallarında akış kilitleniyor

### P2 — Kullanıcıyı yanıltan, veri kaybettiren
19. `Coz.tsx:87,183` — "yarım kalan teste devam" farklı bir setin ortasına atlıyor
20. `OdevAtolyesi.tsx:278` — hedefli gönderimde elle seçilen sorular yok sayılıyor; `:216` ders değişince seçim korunuyor (Fizik ödevine Matematik soruları)
21. `OgrenciRontgeni.tsx:86` — `tGet` sorgu dizisi çift `?` üretiyor → yöneticide cevap logları 403
22. `planner.ts:124,164` — yeni öğrenciye tek boş gün; sınav bugün/geçmişse aciliyet **en düşük**
23. `test-modes.ts:64` — havuzdan servis her zaman aynı ilk N soruyu döndürüyor, çözülenler dışlanmıyor
24. `gamification.routes.ts:54,156` + `mastery.ts:58` + `atlas.ts:199` — oku-değiştir-yaz yarışları (kaybolan XP)
25. `localStorage` anahtarları kullanıcı başına ayrılmamış ve çıkışta silinmiyor (ortak cihazda A'nın verisi B'ye görünüyor)
26. Filtre değişince sayfa sıfırlanmıyor (`OdevAtolyesi.tsx:214`, `havuz-moderasyon.tsx:124`) → "sonuç yok" yalanı ve geri dönüş düğmesi kalmıyor

### P3 — Sertleştirme / temizlik
27. İç hata mesajı sızıntısı — 6 noktada `next(err)` yerine `error.message` (`account:14`, `questions:264`, `assignments:240,296`, `garden:142`, `chat:204`)
28. `admin.routes.ts:483` — `.or()` filtre enjeksiyonu (bugün admin arkasında, desen kopyalanırsa gerçek atlatma)
29. UUID doğrulaması olmayan yol parametreleri → 500 yerine 400 (`validateParams(IdParam)` zaten mevcut)
30. `yetki.ts:225` `rosterCache` tavansız (bellek sızıntısı) · `market-catalog.ts:53` prototip zinciri · `gamification.ts:267` küçük ligde kimse düşmüyor · `aiquestions.routes.ts:183` havuz büyüyünce URL 414

---

## 3. Denetim sonucu temiz çıkan alanlar

Kasıtlı olarak raporlanmadı, çünkü doğru kurulmuşlar:

- Kimlik zinciri (`requireAuth → oturumKapisi → requireAktifHesap`) her `/api` router'ına tek sabitten takılı
- `/teacher/*` kapsam kapısı (`requireOgretmenKapsami` + `assertTeacherOwnsStudent`) tutarlı
- `admin-yonetim` mutasyonlarında denetim izi + önbellek düşürme + kendi-rolün/son-yönetici korumaları
- `garden` ve `gamification/quests/claim` yarışları atomik RPC'lere taşınmış
- `panel-onbellek.ts` — anahtarlar kullanıcıdan bağımsız, TTL var, SCAN ile düşürme doğru; sızıntı yolu yok
- `jsonCoz`, `mapLimit`, `parseTagged` — sınır durumları savunmalı yazılmış
- `middleware/oturum.ts` ve `rateLimit.ts` fail-open davranışı bilinçli ve belgelenmiş mimari karar
