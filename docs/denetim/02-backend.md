# Backend HTTP Katmanı — Mantık Hatası Denetimi

**Kapsam:** `learnup-brain/src/routes/*` (24 dosya), `learnup-brain/src/middleware/*`, `learnup-brain/src/app.ts`
**Yöntem:** Tüm dosyalar okundu; şema doğrulaması için `learnup-brain/migrations/*.sql` ve iş mantığı için `src/lib/{answers,yetki,gamification,odev-derle,oturum}.ts` çapraz kontrol edildi.
**Toplam bulgu:** 29 (KRİTİK 3 · YÜKSEK 7 · ORTA 10 · DÜŞÜK 9)

**Denetim sonucu TEMİZ çıkan alanlar (bilerek raporlanmadı):** kimlik zinciri (`requireAuth → oturumKapisi → requireAktifHesap`) her `/api` router'ına tek sabitten takılı; `/teacher/*` kapsam kapısı (`requireOgretmenKapsami` + `assertTeacherOwnsStudent`) tutarlı; `admin-yonetim.routes.ts` mutasyonlarının hepsi denetim izi + önbellek düşürme + kendi-rolün/son-yönetici korumalarına sahip; `garden` ve `gamification/quests/claim` yarış koşulları atomik RPC'lere taşınmış; `chat`, `agents`, `oturum` uçlarında `user_id` kapsaması eksiksiz.

---

## KRİTİK

### 1. Sıradaki sorunun DOĞRU CEVABI istemciye gönderiliyor (cevap kâhini)
`learnup-brain/src/routes/practice.routes.ts:17-39, 280`

**Şiddet:** KRİTİK

**Senaryo:** `shapeQuestion()` DB satırını `...q` ile olduğu gibi yayıyor ve üstüne açıkça `correctAnswer` + `correct_answer` + `explanation` alanlarını ekliyor. `POST /api/v1/practice/next` yanıtındaki `nextQuestion` bu gövdedir — yani öğrenci daha soruyu cevaplamadan doğru şıkkı görüyor. Aynı dosyada denetimli hattan gelen soru için de aynısı yapılıyor (satır 231-240: `correct_answer: q.siklar[q.dogru]`).

**Sonuç:** Tüm sunucu-taraflı cevap doğrulaması (`lib/answers.ts` `dogrulukKontrol`, "istemcinin iddiası bağlayıcı değil" kararı) anlamsızlaşır: istemci doğru cevabı okuyup `POST /api/v1/answers`'a gönderir, XP/coin/seri/lig tablosu tamamen sahte olur. `assignments.routes.ts:56-65`'teki `sorulariSoy()` fonksiyonu (cevabı KASTEN soyan) bu ucun bozuk olduğunu kanıtlıyor — aynı disiplin burada uygulanmamış.

**Düzeltme:** `shapeQuestion`'dan `...q` yayılımını kaldırıp `correct_answer`/`correctAnswer`/`explanation` alanlarını beyaz-liste dışına çıkar (`sorulariSoy` deseni).

---

### 2. `POST /answers` ve `/practice/record` tekrar (replay) korumasız — sınırsız XP
`learnup-brain/src/routes/answers.routes.ts:12-18`, `learnup-brain/src/routes/practice.routes.ts:291-297` (motor: `src/lib/answers.ts:120-127`)

**Şiddet:** KRİTİK

**Senaryo:** `processAnswer` doğruluğu sunucuda hesaplıyor (iyi), ama AYNI `questionId` için kaç kez cevap gönderildiğini hiç kontrol etmiyor. `attemptNumber` da doğrudan istemciden geliyor ve `xpForAnswer`'a besleniyor. Bir kullanıcı doğru şıkkı bir kez öğrendikten sonra (5 şık için en fazla 5 deneme, ya da Bulgu #1 ile sıfır deneme):
```
for(;;) POST /api/v1/answers {"questionId":"<X>","selectedOption":"C","attemptNumber":1}
```
her istekte XP + `league_entries.weekly_xp` + `totalSolved` + rozet ilerlemesi yazılır. `srs_cards` için `last_attempt_id` kontrolü var ama `attemptId` istemciden geldiği ve `null` olduğunda koşul zaten `true` döndüğü için (satır ~166: `|| attemptId == null`) o da korumuyor.

**Sonuç:** Lig tablosu, rozetler, seri ve `garden` coin ekonomisi tamamen manipüle edilebilir. `standardLimiter` 60/dk → dakikada 60 cevap, günde 86 bin.

**Düzeltme:** `record_answer` RPC'sine `(user_id, question_id, attempt_number)` üzerinde idempotency anahtarı ekle ve daha önce XP verilmiş bir soru-deneme çifti için `xpGained = 0` döndür.

---

### 3. `POST /assignments/targeted/submit` — tek gönderim kuralı yok, puan geri okunabiliyor
`learnup-brain/src/routes/assignments.routes.ts:258-304`

**Şiddet:** KRİTİK

**Senaryo:** Kardeş uç `POST /submit` (satır 205-215) "CEVAP KÂHİNİ KAPANIYOR" yorumuyla açıkça tek-gönderim kontrolü yapıyor. Hedefli sette bu kontrol **hiç yok**: `.eq('student_id', userId)` sahiplik doğru, ama öğrenci aynı seti sonsuz kez gönderebilir ve her seferinde yanıtta `autoScore` alır. Sorunun 5 şıkkını sırayla deneyip `autoScore`'un arttığı yeri gözleyerek doğru cevap birer birer türetilir; `status:'completed'` ve `completed_at` her seferinde yeniden yazılır.

**Sonuç:** Hedefli ödev puanı anlamsız (istenen puan elde edilebilir), öğretmen paneli (`/teacher/odevler`, `/teacher/ogrenci/:id`) yanlış başarı gösterir.

**Düzeltme:** `/submit`'teki gibi mevcut gönderim kontrolü ekle — ya `status !== 'completed'` şartını UPDATE'e koy (`.eq('status','pending')`) ve 0 satır etkilenirse 409 dön.

---

## YÜKSEK

### 4. Ödev puanı istemcinin gönderdiği cevap sayısına bölünüyor (`maxScore = answers.length`)
`learnup-brain/src/routes/assignments.routes.ts:222` ve `:281`

**Şiddet:** YÜKSEK

**Senaryo:** `const maxScore = answers.length || questionIds.length || 0`. 20 soruluk bir ödevde öğrenci yalnız bildiği 1 soruyu göndersin:
```json
{"assignmentId":"…","answers":[{"questionId":"<bildiği>","selectedIndex":2}]}
```
→ `correctCount = 1`, `maxScore = 1` → panelde **%100**.

**Sonuç:** Ödev başarı yüzdeleri, `/teacher/odevler` `ortalamaYuzde` ve öğrenci risk sınıflandırması sistematik olarak yanlış. Öğretmenin gördüğü tek somut ölçüt bu.

**Düzeltme:** `maxScore`'u daima `questionIds.length` yap (ödevin kendi soru sayısı), istemci gövdesinden türetme.

### 5. Ödev son tarihi (`due_date`) ve durumu (`status`) hiçbir gönderimde kontrol edilmiyor
`learnup-brain/src/routes/assignments.routes.ts:175-255` ve `:258-304`

**Şiddet:** YÜKSEK

**Senaryo:** `due_date` yazılıyor (`teacher.routes.ts:846`), listeleniyor (`assignments.routes.ts:95`), ama `POST /submit` ne `due_date`'e ne `assignment.status`'a bakıyor. Son tarihi 3 ay geçmiş ya da `status='archived'` bir ödev bugün gönderilebilir.

**Sonuç:** Son tarih özelliği görünürde var, fiilen yok — öğretmen ödev penceresini kapatamıyor.

**Düzeltme:** `/submit` başında `assignment.due_date && new Date(assignment.due_date) < new Date()` → 409, ve `assignment.status !== 'active'` → 409.

### 6. `POST /questions/save` — rol kapısı yok + `teacher_id` istemciden geliyor
`learnup-brain/src/routes/questions.routes.ts:241-272` (özellikle `:252` ve `:259`)

**Şiddet:** YÜKSEK

**Senaryo:** Uç `app.ts:126`'da yalnız `kimlikli + llmLimiter` ile mount edilmiş — **hiçbir rol kontrolü yok**. `const teacherId = meta?.teacherId || userId` satırı, gövdedeki `meta.teacherId`'yi (şemada sadece `z.string().uuid()`, sahiplik doğrulaması yok) doğrudan `questions.teacher_id`'ye yazıyor. Herhangi bir öğrenci:
```json
{"questions":[{...}, ... 5000 adet], "meta":{"teacherId":"<kurban öğretmenin uuid'si>"}}
```
gönderip paylaşılan `questions` tablosuna, başka bir öğretmenin adına, sınırsız satır yazabilir (`SaveSchema` `.min(1)` var, **`.max()` yok**; tek sınır 1MB gövde).

**Sonuç:** Havuz kirlenmesi + atıf sahteciliği (öğretmenin "kendi soruları" listesi zehirlenir) + depolama şişmesi. Aynı sorunun küçük hâli `/generate?persist=true` (satır 150-155): öğrenci `teacherId: userId` ile havuza yazıyor.

**Düzeltme:** Ucu `requireRole('teacher','admin')` arkasına al, `meta.teacherId`'yi yok say (daima `req.userId`), `questions` dizisine `.max(50)` koy.

### 7. `POST /answers` — `kazanimId`, `subject`, `difficulty` istemciden geliyor, doğrulanmıyor
`learnup-brain/src/routes/answers.routes.ts:14` (motor: `src/lib/answers.ts:99-118, 246-256`)

**Şiddet:** YÜKSEK

**Senaryo:** `dogrulukKontrol` cevabın doğruluğunu DB'den çözüyor, ama sorunun **hangi kazanıma ait olduğunu** DB'den okumuyor: `kazanimId` gövdeden alınıp doğrudan `updateMastery({ userId, kazanimId, correct })` ve `user_logs.kazanim_id`'ye yazılıyor. Öğrenci, kolay bir sorunun doğru cevabını gönderirken `kazanimId`'yi istediği (zor) kazanımla etiketleyebilir; ya da tersine yanlışlarını başka bir kazanıma yükleyebilir.

**Sonuç:** `user_mastery`, `weak_kazanimlar`, `sinif_isi_haritasi` ve `/teacher/sinif/zayif-kazanimlar` — yani öğretmenin bütün teşhis yüzeyi — istemci tarafından şekillendirilebilir. Hedefli ödev derlemesi (`/teacher/hedefli-odev`) bu veriden besleniyor.

**Düzeltme:** `questionId` çözülebiliyorsa `kazanim_id`/`subject`/`difficulty`'yi soru satırından oku; istemci değerini yalnız soru bulunamadığında (efemer) kullan.

### 8. `POST /questions/targeted` — öğretmen onayı kontrol edilmiyor, `teacher_ids` üyeliği yok sayılıyor
`learnup-brain/src/routes/questions.routes.ts:175-192`

**Şiddet:** YÜKSEK

**Senaryo:** Uç kendi rol kapısını elle kuruyor: `ogretmen?.role !== 'teacher'` → 403. Ancak `is_approved` **kontrol edilmiyor**. Yönetici bir öğretmenin onayını iptal ettiğinde (`POST /admin/ogretmen/:id/onay {onayli:false}`) o hesap `/teacher/*`'tan atılır (`requireRole` satır 54-56) ama bu uçtan öğrencinin SRS yanlış-cevap geçmişini (soru metni, şıklar, doğru cevap) çekmeye ve ona ödev iliştirmeye devam eder. Ayrıca sahiplik `ogrenci?.teacher_id !== teacherId` ile kuruluyor; kanonik `assertTeacherOwnsStudent` (`lib/yetki.ts:183`) `teacher_ids` çoklu üyeliğini de sayıyor — iki farklı sahiplik tanımı.

**Sonuç:** Onayı geri alınmış öğretmen için kalıcı veri erişimi penceresi; sahiplik kuralı iki yerde ayrışmış.

**Düzeltme:** `kimlikAl()` + `assertTeacherOwnsStudent()` kullan (dosyada zaten var olan kanonik yol), elle yazılmış iki sorguyu sil.

### 9. `DELETE /teacher/ogrenci/:studentId` — `teacher_ids` üyeliğinde yanlış satırı boşaltıyor
`learnup-brain/src/routes/teacher.routes.ts:1088-1113` (ayrıca `admin-yonetim.routes.ts:276-285`)

**Şiddet:** YÜKSEK

**Senaryo:** `assertTeacherOwnsStudent` sahipliği `teacher_id === teacherId **VEYA** teacher_ids içerir` olarak kabul ediyor (`lib/yetki.ts:183-184`), ama silme işlemi yalnız `teacher_id`'yi null'lıyor. Öğrencinin `teacher_id = B` ve `teacher_ids = ["A"]` olduğu bir kayıtta öğretmen A çıkarma yaptığında:
- A'nın kendi üyeliği (`teacher_ids`) **kalır** → öğrenci `sinif_mevcudu(A)`'da hâlâ görünür,
- **B'nin** `teacher_id` bağı silinir → öğrenci B'nin sınıfından düşer.
Yanıt yine `{cikarildi:true}` döner. Aynı eksik `admin-yonetim.routes.ts` rol düşürmede de var: öğretmenlikten çıkarılan hesabın `teacher_ids` üyeleri sahipsiz kalır (satır 277-279 yalnız `.eq('teacher_id', id)`).

**Sonuç:** Bir öğretmen başka bir öğretmenin sınıfından öğrenci düşürebilir; çıkarma işlemi sessizce yanlış sonuç raporlar.

**Düzeltme:** Sahiplik kanonik ise silme de kanonik olsun — `teacher_ids`'ten de çıkaran tek bir RPC yaz (`sinif_mevcudu`'nun tersi), ya da `teacher_ids` desteğini `assertTeacherOwnsStudent`'tan kaldır.

### 10. Ödev gönderim tekilliği TOCTOU — eşzamanlı iki istek ikisi de geçer
`learnup-brain/src/routes/assignments.routes.ts:207-215`

**Şiddet:** YÜKSEK

**Senaryo:** `select count → 0 mı? → insert` sırası atomik değil ve `migrations/*.sql`'de `assignment_submissions(assignment_id, student_id)` üzerinde UNIQUE kısıt **yok** (tablo migration setinde hiç tanımlı değil; legacy şema). İki sekmeden aynı anda gönderim: ikisi de `oncekiler = 0` okur, ikisi de insert eder. Sonra farklı `selectedIndex`'lerle tekrarlanırsa Bulgu #3'ün aynısı burada da açılır.

**Sonuç:** "Tek gönderim" garantisi — ki yorumda cevap kâhinini kapatmanın TEK dayanağı olarak yazılmış — yarışta çöker.

**Düzeltme:** `assignment_submissions`'a `unique (assignment_id, student_id)` ekle ve `23505` hatasını 409'a çevir.

---

## ORTA

### 11. `profiles.gamification` üç ayrı yerde oku-değiştir-yaz ediliyor → kayıp güncelleme
`learnup-brain/src/routes/gamification.routes.ts:54-82` (`/daily`) ve `:156-201` (`/streak/freeze`)

**Şiddet:** ORTA

**Senaryo:** `/daily` ve `/streak/freeze` profili okuyup `ensureGamification` ile üretilen `g`'yi tümüyle geri yazıyor (`update({ gamification: g })`). `processAnswer` ise aynı JSONB'yi atomik `record_answer` RPC'siyle yazıyor. Öğrenci soru çözerken (arka planda `/answers`) aynı saniyede sayfa açılışı `/daily`'yi tetiklerse, `/daily`'nin elindeki eski `g` kazanılan XP'yi ezer.

**Sonuç:** Rastgele XP/seri kaybı — kullanıcı için "puanım kayboldu", yeniden üretilemez bir şikâyet. `quests/claim` bu sorunu RPC'ye taşıyarak çözmüş, diğer iki uç geride kalmış.

**Düzeltme:** `/daily` ve `/streak/freeze`'i de satırı `for update` ile kilitleyen bir RPC'ye taşı.

### 12. "Bugün" tanımı iki farklı zaman diliminde — seri ve günlük görevler 03:00'te dönüyor
`learnup-brain/src/lib/gamification.ts:83-88` (`todayISO`) ↔ `learnup-brain/src/routes/teacher.routes.ts:200`, `src/lib/rontgen.ts:175`

**Şiddet:** ORTA

**Senaryo:** `todayISO()` `date.getFullYear()/getMonth()/getDate()` kullanıyor — yani **sürecin yerel saati**. `docker-compose.yml` ve `learnup-brain/Dockerfile`'da `TZ` ayarlı değil → konteyner UTC. Buna karşılık öğretmen trendi ve röntgen gün anahtarı açıkça `timeZone: 'Europe/Istanbul'` kullanıyor, `atolye.worker.ts:139` da öyle.

**Sonuç:** Türkiye'de 00:00–03:00 arası çözülen sorular bir ÖNCEKİ güne yazılır: seri (`applyStreak`) gece çalışan öğrencide kopar, günlük görevler geç yenilenir, ve öğrencinin gördüğü trend grafiği ile serisi farklı gün sınırları kullanır (aynı ekranda çelişki).

**Düzeltme:** `todayISO()`'yu `toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' })` ile yaz (projedeki diğer iki yerle aynı kural).

### 13. `GET /admin/kullanicilar?q=` — PostgREST `.or()` filtre enjeksiyonu
`learnup-brain/src/routes/admin.routes.ts:483`

**Şiddet:** ORTA

**Senaryo:** `q = q.or(\`name.ilike.%${ara}%,email.ilike.%${ara}%\`)` — `ara` ham istemci girdisi ve `.or()` argümanı PostgREST'e **kaçışsız** gider. `?q=a,role.eq.admin` gönderildiğinde üretilen filtre dizesi `name.ilike.%a,role.eq.admin%,email.ilike.%a,role.eq.admin%` olur ve PostgREST bunu üst düzey virgüllerden bölerek fazladan OR koşulları uygular. `)` ile mantıksal gruplama da bozulabilir.

**Sonuç:** Filtre semantiği istemciye devredilir; bugün admin arkasında olduğu için etkisi sınırlı, ama desen kopyalandığı an (aynı kalıp `lib/yetki.ts:256`'da da var, orada değer UUID doğrulamasından geçtiği için tetiklenemiyor) gerçek bir yetki atlatmaya döner.

**Düzeltme:** `ara` içindeki `,`, `.`, `(`, `)`, `"`, `\` karakterlerini reddet ya da `%` ile birlikte kaçışla; tercihen `websearch`/`ilike` filtrelerini ayrı `.or` yerine iki ayrı sorgu + birleştirmeyle kur.

### 14. `GET /admin/denetim?bitis=YYYY-MM-DD` — gün sonu UTC'ye çakılıyor (±3 saat kayma)
`learnup-brain/src/routes/admin-yonetim.routes.ts:878`

**Şiddet:** ORTA

**Senaryo:** `bitis.length === 10 ? \`${bitis}T23:59:59.999Z\`` — sonuna `Z` konduğu için sınır UTC gece yarısıdır. `baslangic` de `2026-07-31` olarak verildiğinde `2026-07-31T00:00:00Z` = Türkiye saatiyle 03:00 olarak yorumlanır. Yönetici "31 Temmuz" seçtiğinde:
- 31 Temmuz 00:00–03:00 (yerel) arası eylemler **görünmez**,
- 1 Ağustos 00:00–03:00 (yerel) arası eylemler **listeye girer**.

**Sonuç:** Denetim defteri tarih filtresi yalan söyler — bir olay incelemesinde eksik/fazla kayıt. Yorumda "gün sonunu kapsar" iddiası UTC için doğru, Türkiye için değil.

**Düzeltme:** Tarihleri `Europe/Istanbul` ofsetiyle çevir (`${bitis}T23:59:59.999+03:00`, `${baslangic}T00:00:00+03:00`).

### 15. `GET /questions/ai/konular` — tüm havuz id'leri tek `.in()` içine konuyor (URL sınırı)
`learnup-brain/src/routes/aiquestions.routes.ts:161-185` (özellikle `:183`)

**Şiddet:** ORTA

**Senaryo:** Önce `fetchAll` ile `yks_ai_questions`'ın TÜM doğrulanmış satırları çekiliyor, ardından `.in('question_id', [...soruKonu.keys()])` ile o UUID'lerin hepsi tek bir GET sorgu dizesine gömülüyor. Bugün havuz ~240 satır (≈9 KB URL) — çalışıyor. 10 bin soruya çıktığında ≈370 KB URL → PostgREST/nginx `414 Request-URI Too Large` döner.

**Sonuç:** Öğrencinin ana konu listesi ekranı havuz büyüdüğü gün topluca 500'e düşer; hata bugün görünmez olduğu için sürprizle gelir. (Aynı sınıf risk `admin-havuz.routes.ts:94` `ampirikIstatistik` içinde de var.)

**Düzeltme:** Cevapları soru id'siyle değil `kazanim_id` üzerinden (join/RPC) süz, ya da `.in()` listesini 500'lük parçalara böl.

### 16. `POST /admin/kullanici` — davet başarılı, profil yaması başarısız olursa yarım hesap kalır
`learnup-brain/src/routes/admin-yonetim.routes.ts:409-484` (özellikle `:430-469`)

**Şiddet:** ORTA

**Senaryo:** `inviteUserByEmail` auth kullanıcısını yaratır ve `handle_new_user` profili **student** olarak açar. Hemen sonraki `update(yama)` (rol/onay/class_code) başarısız olursa kod 500 fırlatır; geri alma yok. Öğretmen olarak davet edilen kişi bağlantıyı tıklar, öğrenci olarak girer. Ayrıca `select(...).ilike('email')` → `invite` arası TOCTOU var: iki yönetici aynı anda aynı e-postayı davet edebilir.

**Sonuç:** Kısmi yazım; yöneticinin gördüğü hata mesajı ("Hesap açıldı ama rolü yazılamadı") doğru ama telafi yolu yok — hesap yanlış rolde kalır.

**Düzeltme:** Yama başarısız olursa `supabase.auth.admin.deleteUser(yeniId)` ile geri sar, ya da rolü `raw_user_meta_data` üzerinden `handle_new_user`'a taşı (0024 beyaz listesi zaten destekliyor).

### 17. İç hata mesajları istemciye sızıyor (merkezi `errorHandler` politikasının atlanması)
`learnup-brain/src/routes/account.routes.ts:14` · `questions.routes.ts:264` · `assignments.routes.ts:240, 296` · `garden.routes.ts:142` · `chat.routes.ts:204`

**Şiddet:** ORTA

**Senaryo:** `middleware/error.ts:18-20` beklenmeyen hataların `err.message`'ının dışarı çıkmamasını açıkça karar altına almış ("Postgres/PostgREST hataları tablo ve kolon adı taşır → şema keşfine davetiye"). Ancak yukarıdaki altı nokta `next(err)` yerine doğrudan `res.status(5xx).json({ error: error.message })` yazıyor. Örnek: `POST /questions/save` gövdesine tip uyuşmayan bir alan koymak `column "…" of relation "questions" does not exist` benzeri mesajı geri döndürür. `chat.routes.ts:204` aynı şeyi SSE `error` olayında yapıyor.

**Sonuç:** Servis service-role ile çalıştığı ve RLS baypas edildiği için şema keşfi doğrudan saldırı yüzeyi genişletir.

**Düzeltme:** Bu altı noktada `next(err)` kullan; kasıtlı istemci hataları için `HttpHatasi` fırlat.

### 18. `practice/next` içinde yakalanamayan hatalar — supabase-js throw etmez, `catch` bloğu ölü kod
`learnup-brain/src/routes/practice.routes.ts:178-193` ve `:262-271`

**Şiddet:** ORTA

**Senaryo:** `try { await supabase.from('user_answers').insert(...) } catch (aErr) { logger.warn(...) }` — supabase-js sorgu hatalarında **reject etmez**, `{ data, error }` döndürür. `error` hiç okunmadığı için `user_answers` insert'i sessizce başarısız olur ve `catch` bloğu hiçbir zaman çalışmaz. Aynısı `quiz_sessions.upsert` için (satır 265) geçerli.

**Sonuç:** Analitik kaydı ve adaptif oturum durumu sessizce yazılmıyor olabilir — `admin-havuz`'un ampirik zorluk ölçümü (`ampirikIstatistik`, `user_answers`'tan okuyor) ve `/questions/ai/konular` ilerleme yüzdeleri bu veriye dayanıyor. Aynı sınıf hata `telemetry.routes.ts`'te tarif edilen ve düzeltilen arızanın tekrarı.

**Düzeltme:** `const { error } = await …` ile dönüşü kontrol et ve `error` varsa logla; `try/catch`'i kaldır.

### 19. `sinif_code` benzersiz değil — çakışmada sınıfa katılım 500'e düşer
`learnup-brain/src/routes/sinif.routes.ts:61-67`

**Şiddet:** ORTA

**Senaryo:** `.eq('role','teacher').eq('class_code', ham).maybeSingle()`. `migrations/0024_acik_ogretmen_kaydi.sql:48` açıkça yazıyor: *"Kolonda UNIQUE YOK (0001:26, yalnız indeks)"*. Kod üretimi hem `handle_new_user` hem `benzersizSinifKodu` içinde "boşta kod bulunana dek dene" döngüsüyle yapılıyor ama ikisi de TOCTOU — eşzamanlı iki kayıt aynı kodu alabilir. O andan sonra o koda katılmak isteyen HER öğrenci `maybeSingle` çoklu satır hatasıyla `500 kod_okunamadi` alır.

**Sonuç:** İki sınıfın tamamı kayıt olamaz; hata mesajı sebebi göstermez ("Sınıf kodu doğrulanamadı").

**Düzeltme:** `profiles.class_code`'a partial unique index ekle (`where class_code is not null`) — döngüler o zaman gerçekten garanti verir.

### 20. `sonYoneticiMi` — `askiya_alindi` NULL olan yönetici sayılmıyor
`learnup-brain/src/routes/admin-yonetim.routes.ts:103-111`

**Şiddet:** ORTA

**Senaryo:** `.eq('role','admin').eq('askiya_alindi', false)` — Postgres'te `NULL = false` doğru değildir, o satırlar sayımın dışında kalır. 0025 öncesi açılmış ve kolonu NULL kalmış yönetici satırları varsa (`profiles` migration setinde tanımlı değil, alter ile eklenmiş), sistemde 3 aktif yönetici varken sayım 1 döner.

**Sonuç:** Meşru bir rol düşürme/askı işlemi `son_yonetici` diye reddedilir (yanlış-pozitif kilit). Ters yön de mümkündür: koruma gerekliyken devreye girmez.

**Düzeltme:** `.not('askiya_alindi', 'is', true)` kullan (NULL'ı "askıda değil" saysın), ya da kolona `not null default false` ekle.

---

## DÜŞÜK

### 21. `GET /practice/review` — `count` ile dönen soru sayısı uyuşmuyor
`learnup-brain/src/routes/practice.routes.ts:120-121`
**Senaryo:** `count: kartlar.length` (vadesi gelen 30 karta kadar) döndürülürken `questions` en fazla 10'a kırpılıyor; ayrıca AI havuzunda karşılığı olmayan kartlar da eleniyor. **Sonuç:** İstemci "12 tekrar var" der, 3 soru gösterir. **Düzeltme:** `count`'u `questions.length` yap, toplamı ayrı alanda (`vadesiGelen`) ver.

### 22. `practice/next` yedek havuz seçimi deterministik — aynı sorular dönüp duruyor
`learnup-brain/src/routes/practice.routes.ts:252-257`
**Senaryo:** `.select('*')…limit(10)` `ORDER BY` içermiyor; PostgREST'in döndürdüğü ilk 10 satır pratikte sabittir, rastgelelik yalnız o 10 satır arasında. `excludeIds` (son 30) bunları elediğinde `pick` `null` döner ve öğrenciye soru gelmez. **Sonuç:** Yedek hat kısa sürede tükenir. **Düzeltme:** `random_seed` üzerinden rastgele pencere kullan (`lib/odev-derle.ts` `tablodanOrnekle` deseni zaten var).

### 23. `POST /garden/move` — `Number(x)` NaN üretiyor, koordinat sessizce siliniyor
`learnup-brain/src/routes/garden.routes.ts:127-133`
**Senaryo:** `{"plantId":"…","x":"abc"}` → `patch.x = NaN` → `JSON.stringify` NaN'ı `null` yazar → bitkinin x'i null olur ve `success:true` döner. Sınır kontrolü de yok (x = 1e12 kabul edilir). **Düzeltme:** `Number.isFinite` kontrolü + makul aralık (`0..1000`) doğrulaması.

### 24. Süre alanlarında `0` varsayılana düşüyor
`learnup-brain/src/routes/practice.routes.ts:140` (`Number(duration) || 15`)
**Senaryo:** `duration: 0` (anlık cevap) → 15 saniye yazılır. **Sonuç:** Hız temelli ölçümler (tuzak analizi, `duration_ms`) bozulur. **Düzeltme:** `Number.isFinite(n) && n >= 0 ? n : 15`.

### 25. `GET /chat/oturumlar` RPC hatasını tümüyle yutuyor
`learnup-brain/src/routes/chat.routes.ts:33-37`
**Senaryo:** "0035 basılmamışsa boş liste dön" kararı doğru, ama koşul RPC'nin HER hatasını (izin, timeout, SQL hatası) boş listeye çeviriyor. **Sonuç:** Gerçek bir arıza "sohbet geçmişin yok" diye görünür. **Düzeltme:** `tabloYok(error)` benzeri bir dar kontrol uygula (`admin-yonetim.routes.ts:80` deseni), diğer hataları fırlat.

### 26. `POST /agents/nudges/seen` — `ids` dizisi sınırsız
`learnup-brain/src/routes/agents.routes.ts:89-97`
**Senaryo:** `ids.map(Number).filter(Number.isFinite)` üst sınır koymuyor; 1 MB gövdeye ~100 bin sayı sığar ve hepsi tek `.in()` içine gider. **Düzeltme:** `.slice(0, 100)`.

### 27. `POST /telemetry` — `context` boyutu sınırsız, doğrudan Redis'e yazılıyor
`learnup-brain/src/routes/telemetry.routes.ts:44-47`
**Senaryo:** `context`'in yalnız object olduğu kontrol ediliyor; 1 MB'a kadar gövde `user:<id>:context` anahtarına 24 saat TTL ile yazılıyor. 60 istek/dk × kullanıcı sayısı → Redis bellek baskısı. **Düzeltme:** Şema doğrulaması (beklenen alanlar) + serileştirilmiş boyut tavanı (~8 KB).

### 28. `GET /chat/history` — sayfalama yok, en fazla 80 mesaj
`learnup-brain/src/routes/chat.routes.ts:117`
**Senaryo:** `limit(80)` `ascending: true` ile birlikte, uzun sohbetin **en eski** 80 mesajını döndürür — kullanıcının son konuşması görünmez. **Düzeltme:** `ascending: false` + `limit(80)` çekip istemciye ters çevirerek ver, ya da offset parametresi ekle.

### 29. Yol parametrelerinde UUID doğrulaması yok — geçersiz id 500 üretiyor
`learnup-brain/src/routes/admin-havuz.routes.ts:265` · `admin.routes.ts:556` · `admin-yonetim.routes.ts:155, 350, 498` · `questionState.routes.ts:9`
**Senaryo:** `String(req.params.id)` doğrudan `.eq('id', …)`'ye gidiyor; `abc` gibi bir değer Postgres'te `22P02 invalid input syntax for type uuid` üretir. Hatanın okunduğu yerlerde (`soruOku`, `profilOku`) bu 500'e dönüşür — 400 olmalıydı. **Düzeltme:** `validateParams(IdParam)` (zaten `middleware/validate.ts:54`'te var) bu uçlara da uygula.

---

## Ek Not — Doğrulanan ama BULGU OLMAYAN şüpheler

Aşağıdakiler incelendi ve tetiklenemez oldukları görüldüğü için listeye alınmadı:
- `app.ts:112, 124` mount sırası (`/agents/status` → `/agents`, `/questions/ai` → `/questions`) doğru; `aiquestions.routes.ts:553` son-durak 404 handler'ı kota sızmasını kapatıyor.
- `admin.routes.ts:54` `use('/havuz')` ile `:169` `get('/havuz')` çakışması yok — `havuzRouter`'da `/` rotası olmadığı için istek `next()` ile geçiyor.
- `middleware/oturum.ts` ve `rateLimit.ts` fail-open davranışı bilinçli ve belgelenmiş bir mimari karar.
- `teacher.routes.ts` içinde `req.userId` kullanımı yalnız `vekilIzi`'nde (satır 87) — kapsam değişmezi korunuyor.
- `lib/yetki.ts:256` `.or()` içindeki `teacherId` `requireOgretmenKapsami`'nde UUID regex'inden geçiyor → enjeksiyon tetiklenemiyor.
