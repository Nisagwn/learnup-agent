# Çekirdek Katman Denetim Raporu (route dışı)

Kapsam: `learnup-brain/src/{agents,lib,workers,clients,config,persona,types,jobs}`
Yöntem: dosyalar birebir okundu; her bulgu için tetikleme yolu izlendi. Tetiklenemeyen şüpheler rapora alınmadı.
Toplam: **27 bulgu** — 2 KRİTİK · 5 YÜKSEK · 12 ORTA · 8 DÜŞÜK

---

## KRİTİK

### K1 — `costOptimized`/`skipVerification` denetimi tamamen atlayıp SAHTE bir ACCEPT hükmü uyduruyor; sonuç ortak havuza `verified:true` yazılıyor
**Dosya:** `learnup-brain/src/lib/generation.ts:911`, `:951-964` (+ `learnup-brain/src/routes/questions.routes.ts:17-18,105,117` — tetikleyici uç)
**Şiddet:** KRİTİK

**Senaryo:** `denetle` içinde `const skipRepair = strategy.skipVerification || strategy.costOptimized`. Bu bayrak açıkken 951. satırdaki dal `verifyQuestion` çağrısını hiç yapmadan elle kurulmuş bir Verdict üretiyor:
```ts
matchesMarked: true, singleCorrect: true, curriculumBound: true,
internallyConsistent: true, osymStyleScore: 4, verdict: 'ACCEPT'
```
Sonra `assembleSegment` (`lib/test-modes.ts:102-118`) bu soruları `verified: true, quality: q.quality` ile `yks_ai_questions`'a yazıyor; aynı tablo `assembleSegment`/`assembleBySubjectFromPool` üzerinden **tüm öğrencilere** servis ediliyor.

Tetikleme yolu HTTP'den açık: `POST /api/v1/questions/generate` gövdesinde `costOptimized`/`skipVerification` zod şemasında kabul ediliyor (`questions.routes.ts:17-18`) ve doğrudan `buildMicroTest({... options})`'a geçiriliyor. Uç `app.ts:126`'da yalnız `kimlikli` ile mount edilmiş — rol kapısı yok. Yani **herhangi bir öğrenci hesabı** `{"subject":"...","topic":"...","skipVerification":true}` göndererek doğru cevabı hiç kontrol edilmemiş soruyu ortak havuza bastırabilir.

`agents/ritim.ts:46-55` bu sınıfın kapatıldığını yazıyor — kapatılan yalnız `/agents/dispatch`'ti; `/questions/generate` aynı deliği açık bırakıyor. Ayrıca `costOptimized` adı "ucuz üret" ima ediyor ama fiilen `skipVerification` ile aynı: hakem hiç çağrılmıyor.

**Sonuç:** Havuz zehirlenmesi — yanlış cevap anahtarlı sorular "doğrulanmış" damgasıyla tüm öğrencilere servis edilir; `answers.ts` doğruluğu bu satırdan okuduğu için öğrenci doğru cevabı işaretlediğinde yanlış sayılır.
**Öneri:** `GenerateSchema`'dan iki alanı kaldır (ritim.ts'teki karar bu uca da uygulansın) ve `skipRepair`'i yalnız onarımı atlamaya indir; hakem atlanan yolda `verified:false` yaz.

---

### K2 — Redis yokken in-process görev kuyruğu hiçbir işi çalıştırmıyor (belgelenen "zarif düşüş" ölü)
**Dosya:** `learnup-brain/src/agents/bus.ts:70-90` (`pumpInproc`) + `:226-228` (`publishEvent` → `requireRedis()`)
**Şiddet:** KRİTİK (Redis'siz kurulumda), aksi hâlde uyuyan hata

**Senaryo:** `enqueueTask` Redis yoksa (`bus.ts:125`) görevi `inprocQueue`'ya koyup `pumpInproc()` çağırıyor. `pumpInproc`'un ilk satırı `await publishEvent(task.id, { status: 'RUNNING' })`. `publishEvent` ise `const r = requireRedis()` ile başlıyor ve `requireRedis` Redis null iken **fırlatıyor** (`clients/redis.ts:167-172`). Yani:
- handler (`inprocHandler!(task)`) hiç çalışmaz,
- catch bloğundaki `publishEvent(FAILED)` de aynı sebeple fırlar ve `.catch(()=>{})` ile yutulur,
- `agent_tasks` satırı sonsuza kadar `PENDING` kalır (bekçi de yok, çünkü worker Redis olmadan `process.exit(1)` yapıyor — `workers/atolye.worker.ts:204-207`).

`server.ts:33` `setInprocHandler(handleTask)` çağırdığı için yol gerçekten canlı; tek koşul `REDIS_URL` tanımsız olması.

**Sonuç:** Redis'siz ortamda plan/teşhis/compact/affect görevlerinin **hiçbiri** çalışmaz, üstelik hata da görünmez — sistem "kuyruğa alındı" der ve orada biter.
**Öneri:** `pumpInproc` içindeki olay yayınlarını `if (redis)` ile koru ya da `publishEvent`'i Redis yokken yalnız Postgres'e yazacak şekilde `requireRedis()`'ten kurtar.

---

## YÜKSEK

### Y1 — `routedStream` maliyet tavanını hiç kontrol etmiyor ve harcamayı sayaca eklemiyor
**Dosya:** `learnup-brain/src/lib/model-router.ts:794-834`
**Şiddet:** YÜKSEK

**Senaryo:** `routedChat` içinde paralı slug öncesi `if (role !== 'verify' && !isFree(slug) && harcananUsd >= maliyetTavaniUsd) throw` kapısı var (`:708`) ve dönüşte `maliyetEkle(...)` çağrılıyor (`:749`). `routedStream`'de **ikisi de yok**: yalnız `KREDISIZ` kapısı var (`:805`). Kaptan sohbeti (`agents/kaptan.ts:113`) bu yoldan geçiyor ve zinciri paralı `deepseek-v4-flash`/`v3.2` ile başlıyor.

**Sonuç:** (a) `maliyetTavani(0.20)` kuran bir script/koşu sohbet trafiğini hiç durduramaz; (b) `maliyetHarcanan()` akış harcamalarını hiç saymadığı için "bu koşu ne harcadı" raporu sistematik olarak eksik — tavan kararları eksik veriyle veriliyor.
**Öneri:** `routedStream`'e aynı tavan kapısını ekle ve akış bitiminde `usage` chunk'ından `maliyetEkle` çağır.

### Y2 — Ücretsiz uçta 3 kez deneniyor ama bütçe payı 1 kez düşülüyor
**Dosya:** `learnup-brain/src/lib/model-router.ts:716` ve `:731-741`
**Şiddet:** YÜKSEK

**Senaryo:** `if (isFree(slug)) await freeBudgetTuket(provider)` çağrısı döngüden **önce** bir kez yapılıyor; hemen ardından `const dene = isFree(slug) ? 3 : 1` ile aynı slug'a 3 gerçek HTTP çağrısı gidebiliyor (200+boş gövde vakası). Dakika sayacı (`MINUTE_CAP`) ve gün sayacı (`DAY_CAP_BASE`) bu çağrıların yalnız 1/3'ünü görüyor.

**Sonuç:** Sayaç sağlayıcıdan önce durmuyor — `google` için 20/gün tavanı fiilen 60 isteğe kadar açılıyor. Dosyanın kendi yorumunun (`:320-336`) önlemek için yazıldığı arıza aynen yaşanıyor: 429 dalgası → kesici üstel açılır → hat dakikalarca ölür.
**Öneri:** `freeBudgetTuket`'i deneme döngüsünün İÇİNE, her `create()` çağrısından hemen önceye taşı.

### Y3 — `delegateAndAwait` hot-profil bağlantıyı `duplicate()` edip hazır olmadan komut gönderiyor
**Dosya:** `learnup-brain/src/agents/bus.ts:253,260` (kullanım: `agents/tools.ts:391`)
**Şiddet:** YÜKSEK

**Senaryo:** `requireRedis().duplicate()` ile açılan yeni soket, `hot` profilinin `enableOfflineQueue:false` ayarını miras alır (`clients/redis.ts:46`). Hemen sonraki `sub.call('XREAD', 'BLOCK', ...)` soket daha `ready` olmadan gönderilir → ioredis komutu anında reddeder ("Stream isn't writeable"). Bu, `clients/redis.ts:143-148`'in worker açılışı için `redisReady()` yazarak çözdüğü arızanın birebir aynısı; burada `redisReady` beklenmemiş.

**Sonuç:** Pusula'nın `delegate_session` aracı çağrıldığı anda hata fırlatır; hata `runPusulaTool`'da yakalanmadığı için tool sonucu yerine exception döner.
**Öneri:** `duplicate()` sonrası `await sub.connect()`/hazır beklemesi ekle ya da bu soketi `enableOfflineQueue:true` ile aç.

### Y4 — Aynı soru sınırsız kez cevaplanıp sınırsız XP üretebiliyor
**Dosya:** `learnup-brain/src/lib/answers.ts:124-144`
**Şiddet:** YÜKSEK

**Senaryo:** `dogrulukKontrol` istemcinin `isCorrect` iddiasını yok sayıyor (doğru düzeltme) ama **tekrar** kontrolü hiçbir yerde yok: aynı `questionId` + doğru şık ile POST tekrarlandığında her seferinde `dogrulandi=true` → `xpForAnswer` 15 XP → `g.xp`, `g.league.weeklyXP`, `user_logs` ve rozet/seviye sayaçları artıyor. İstemci doğru şıkkı zaten cevap ekranında görüyor.

**Sonuç:** Yorumun kapattığını söylediği sınırsız-XP döngüsü (`answers.ts:41-45`) hâlâ açık; lider tablosu ve coin ekonomisi manipüle edilebilir.
**Öneri:** (user_id, question_id) başına ilk cevaba XP ver — `user_logs`'ta varlık kontrolü veya kısmi unique indeks.

### Y5 — `rosterCache` tavansız büyüyor (kimlik önbelleğinde konan sınır burada yok)
**Dosya:** `learnup-brain/src/lib/yetki.ts:225,243,260`
**Şiddet:** YÜKSEK

**Senaryo:** `kimlikCache` için `KIMLIK_TAVAN = 5_000` + FIFO tahliye var (`:66-79`) ve dosya bunu açıkça "sınırsız Map uzun ömürlü Bun sürecinde SIZINTIDIR" diye gerekçelendiriyor. `rosterCache` aynı ömürde ama **hiçbir tavanı yok**: her `sinifOgrencileri(teacherId)` çağrısı yeni bir öğretmen anahtarı ekliyor ve girdi hiç silinmiyor (`sonKullanma` yalnız okuma anında kontrol ediliyor, kayıt kalıyor). Değer de küçük değil — 1000+ öğrenci id'si taşıyan diziler.

**Sonuç:** Uzun süre ayakta kalan brain sürecinde bellek sızıntısı; süresi dolmuş yüzlerce mevcut listesi RAM'de tutulur.
**Öneri:** `cacheYaz`'daki FIFO tahliye kalıbını `rosterCache` için de uygula.

---

## ORTA

### O1 — Yeni öğrenciye 7 günlük plan yerine tek boş gün üretiliyor
**Dosya:** `learnup-brain/src/lib/planner.ts:124`
**Şiddet:** ORTA

**Senaryo:** Döngü sonunda `if (queue.length === 0) break`. Hiç `user_mastery` satırı olmayan (tanışma testini yeni bitirmemiş) öğrencide `scored` boş → `queue` daha ilk turdan boş → `d=0` günü (bloksuz veya yalnız SRS bloklu) `days`'e eklenir ve döngü kırılır.
**Sonuç:** `roadmaps.steps` tek günlük, çoğu zaman `blocks: []` bir planla üzerine yazılır; Pusula brief'i "planlanmış blok yok" der, Kaptan'ın masasına boş rota gider.
**Öneri:** `break`'i "queue boş VE bugünün blokları da boş" koşuluna bağla ya da 7 günü daima üret.

### O2 — Sınav tarihi geçmiş/bugünse aciliyet EN DÜŞÜK seviyeye düşüyor
**Dosya:** `learnup-brain/src/lib/planner.ts:164-178` + `:60-61`
**Şiddet:** ORTA

**Senaryo:** `parseExamDays` yalnız `days > 0` iken değer döndürüyor; sınav bugün veya geçmişse `null` döner → `examDays = 200` varsayılır → `urgency = 1 + (180-200)/180 ≈ 0.89` (mümkün olan en düşük değere yakın).
**Sonuç:** Sınava 0 gün kalan öğrenci, sınava 200 gün kalan öğrenciyle aynı — hatta ondan daha düşük — aciliyet katsayısı alır. Aciliyet mantığı sınır koşulunda ters çalışıyor.
**Öneri:** `days <= 0` durumunda 1 döndür (maksimum aciliyet), `null`'ı yalnız "veri yok" için sakla.

### O3 — "Gece geç saat" heuristiği sunucu saatiyle (UTC) hesaplanıyor
**Dosya:** `learnup-brain/src/lib/signals.ts:92,100`
**Şiddet:** ORTA

**Senaryo:** `new Date(t).getHours()` konteynerin yerel saatini kullanır; `docker-compose.yml`'de hiçbir servise `TZ` verilmemiş → UTC. Kural `hour >= 23 || hour < 5` yazıyor, fiilen **02:00–08:00 TSİ** aralığını kapsıyor. Aynı dosyadaki `lib/rontgen.ts:174-175` ise doğru yolu kullanıyor (`toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' })`) — yani tutarsızlık kod içinde de görünür.
**Sonuç:** Nabız'ın `lateNight && wrongRatio > 0.5` kuralı gerçek gece saatlerinde (23:00–02:00 TSİ) hiç ateşlenmez, sabah 05:00–08:00'de gereksiz ateşlenir.
**Öneri:** Saat çıkarımını `Europe/Istanbul` ile yap (rontgen.ts kalıbı).

### O4 — Gün/seri hesabı da sunucu yerel gününe bağlı
**Dosya:** `learnup-brain/src/lib/gamification.ts:83-88` (`todayISO`), kullanım `learnup-brain/src/lib/answers.ts:117`
**Şiddet:** ORTA

**Senaryo:** `todayISO()` UTC gününü üretir. TSİ 00:00–03:00 arası çözülen sorular "dün"e sayılır.
**Sonuç:** Gece çalışan öğrencinin serisi (`applyStreak`) ve günlük görevleri (`generateDailyQuests`) yanlış güne düşer; seri 03:00'te sıfırlanır. Ayrıca `getWeekId` ile lig haftası ve `todayISO` farklı gün sınırları kullanır.
**Öneri:** Tek bir "öğrenci günü" yardımcı fonksiyonu (Europe/Istanbul) tanımlayıp her iki yerde kullan.

### O5 — Havuzdan servis her zaman aynı ilk N soruyu döndürüyor
**Dosya:** `learnup-brain/src/lib/test-modes.ts:64-76` ve `:210-221`
**Şiddet:** ORTA

**Senaryo:** Kod yorumunda "`.order()` yoktu: her öğrenci hep aynı ilk N satırı alıyordu" deniyor ve çözüm olarak `.order('quality', { ascending: false }).limit(seg.count)` eklenmiş. Ama deterministik sıralama + sabit limit, tam olarak aynı davranışı korur: aynı kazanım/zorluk için **her öğrenci ve her tekrar** aynı soruları alır. `assembleBySubjectFromPool` (makro) ise hiç sıralamıyor ve `limit(count)` ile yine sabit prefix döndürüyor. Daha önce çözülen soruları dışlayan bir filtre de yok.
**Sonuç:** Öğrenci aynı mikro testi ikinci kez açtığında birebir aynı 5 soruyu görür; makro deneme her koşuda aynıdır. Havuzun geri kalanı hiç servis edilmez.
**Öneri:** Rastgele/round-robin seçim (ör. `quality` ile daralt, sonra karıştır) ve `user_logs`'tan çözülmüşleri dışla.

### O6 — Oku-değiştir-yaz yarışları: gamification, mastery, misconceptions
**Dosya:** `learnup-brain/src/lib/answers.ts:109-232`, `learnup-brain/src/lib/mastery.ts:58-101`, `learnup-brain/src/agents/atlas.ts:199-206`
**Şiddet:** ORTA

**Senaryo:** Üç yerde de "satırı oku → bellekte değiştir → tüm objeyi geri yaz" var. Hızlı ard arda gelen iki cevap (istemci paralel POST) veya aynı anda çalışan `diagnose` + `closure_check` görevleri aynı taban değeri okuyup birbirini ezer. `record_answer` RPC'si yazımı atomik yapıyor ama okuma-hesap TypeScript tarafında kaldığı için yarış kapanmıyor.
**Sonuç:** Kaybolan XP/attempts artışları, kaybolan yanılgı kayıtları — `katip.upsertBrief`'te aynı sınıf hatanın (`katip.ts:212-216`) DB tarafına taşınarak çözüldüğü belgeleniyor; bu üç yol o dersi almamış.
**Öneri:** Artışları SQL tarafında (`+ 1`, `jsonb_set`) yapan RPC'lere taşı.

### O7 — `compactSweep`: sabit yorumla çelişen eşik ve sessiz görev kaybı
**Dosya:** `learnup-brain/src/agents/katip.ts:21,51-59`
**Şiddet:** ORTA

**Senaryo:** İki ayrı kusur:
1. `IDLE_MAX_MS = 60 * 60_000` "bu kadar eskiyse pencere kaçmış — yine de özetle" diye tanımlanmış ama tek kullanımı `if (idle > IDLE_MAX_MS * 24) continue` (yani 60 saat). Sabitin adı/yorumu ile davranışı uyuşmuyor; `IDLE_MAX_MS` fiilen hiçbir yerde tanımlandığı anlamda kullanılmıyor.
2. `SREM` kullanıcıyı kümeden **karar verilmeden önce** çıkarıyor. `lastSeenAt` null dönerse (Redis `lb:lastseen:*` TTL'i 24 saat, oturum daha uzun sessiz kaldıysa düşmüş olur) `idle = Infinity` → `continue`. Kullanıcı kümeden silinmiştir ama compact görevi hiç kuyruğa girmez. Aynı şekilde `enqueueTask` hata alırsa (catch'le yutuluyor) kullanıcı kümede olmadığı için bir daha denenmez.
**Sonuç:** Bir kısım oturum hiç özetlenmez → Kaptan'ın anı endeksi ve masası eksik kalır, sebebi de log'da "hata" olarak görünmez.
**Öneri:** SREM'i enqueue başarısından sonraya al (veya başarısızlıkta `SADD` ile geri koy) ve `IDLE_MAX_MS * 24` ifadesini niyetle uyumlu hâle getir.

### O8 — Sohbet tool-loop'u içinde tam üretim zinciri: dakikalarca asılı SSE + kontrolsüz maliyet
**Dosya:** `learnup-brain/src/agents/tools.ts:232-251` (`generate_practice`), çağıran `learnup-brain/src/agents/kaptan.ts:111,154`
**Şiddet:** ORTA

**Senaryo:** `generate_practice` → `buildMicroTest` → `assembleSegment` → havuz boşsa `generateVerifiedSet` (3 tura kadar; her tur 1 üretim + aday başına doğrulama). Üretim rolü timeout'ları 120–300 sn, verify 240 sn (`model-router.ts:303`). Tool çağrısının kendi timeout'u YOK ve tool-loop 6 tur dönebiliyor (`kaptan.ts:111`), her turda 10 soruya kadar.
**Sonuç:** Tek bir sohbet mesajı SSE akışını dakikalarca (teorik olarak on dakikanın üzerinde) askıda bırakabilir; `count` kelepçesi konmuş ama tur × araç çağrısı çarpanı kelepçesiz.
**Öneri:** Tool çağrılarına sert bir süre tavanı koy; havuz boşken üretimi senkron yapmak yerine kuyruğa al (`request_plan_update` kalıbı).

### O9 — `buildStudentContext` bozuk Redis kaydında fırlatıyor
**Dosya:** `learnup-brain/src/lib/generation.ts:63,72`
**Şiddet:** ORTA

**Senaryo:** `redis.get(...).catch(() => null)` yalnız Redis hatasını yutuyor; hemen altındaki `JSON.parse(ctxRaw)` korumasız. `user:<userId>:context` anahtarına JSON olmayan bir değer yazılırsa (şema değişimi, yarım yazım, başka bir yazıcı) parse fırlatır.
**Sonuç:** O kullanıcı için `generateQuestions`, `generateVerifiedSet`, `composeDesk` fallback'i ve `get_student_snapshot` aracının tamamı 500 verir — tek bir bozuk cache satırı kullanıcıyı üretimden ve sohbet bağlamından tümüyle keser. Dosyanın kendi kuralı ("Redis yüzünden üretim DURMAZ") ihlal ediliyor.
**Öneri:** `JSON.parse`'ı try/catch'e al, hatada `{}` kullan (aynı kalıp `rag.ts`, `desk.ts`, `yetki.ts`'te zaten var).

### O10 — Konu→kazanım eşlemesinde negatif sonuç önbelleklenmiyor; anahtar uzayı istemci metniyle belirleniyor
**Dosya:** `learnup-brain/src/lib/curriculum.ts:45-47,75,86`
**Şiddet:** ORTA

**Senaryo:** `cacheKey(subject, topic)` ham istemci metnini anahtara gömüyor (uzunluk/normalizasyon sınırı yok). Eşik altı kalan (`similarity < KONU_ESIK`) sonuç `null` dönüyor ve **hiç yazılmıyor** → aynı konu için her istek yeniden `embed()` çağırıyor. `embed` kendi kalıcı önbelleğine sahip olduğu için tekrar eden metinler ücretsiz, ama farklı serbest metinler her seferinde ücretli embedding üretiyor.
**Sonuç:** İstemci kontrollü ücretli embedding çağrısı + `lb:konu:*` anahtar uzayının sınırsız büyümesi.
**Öneri:** Negatif sonucu da kısa TTL ile önbellekle; anahtarda `topic`'i normalize edip hash'le.

### O11 — `esikleriTazele(true)` uçuştaki tazelemeye takılıp hiçbir şey yapmayabiliyor
**Dosya:** `learnup-brain/src/lib/ozgunluk-esik.ts:28-31`, çağıran `:82`
**Şiddet:** ORTA

**Senaryo:** `if (ucusta) return ucusta` kontrolü `zorla` bayrağından **sonra** geliyor ama bayrağı gözetmiyor. Yönetici paneli eşik yazıp `esikleriTazele(true)` çağırdığında, o an arka planda bir üretim çağrısının başlattığı (yazımdan ÖNCE okumuş) tazeleme uçuştaysa, forced çağrı o eski promise'i döndürür ve yeni değeri okumaz.
**Sonuç:** Panelden yapılan eşik değişimi 60 saniyeye kadar yürürlüğe girmez; yönetici "kaydedildi" görür ama üretim eski eşikle sürer — yorumun açıkça engellemek istediği durum.
**Öneri:** `zorla` iken uçuştaki promise'i beklemek yerine yeni bir tazeleme kur (veya `ucusta`'yı bekleyip ardından yeniden çalıştır).

### O12 — `partiIkizSuz` ve özgünlük kapısı kabul edilen soruları turlar arası taşıyor, ama `denetle` içindeki havuz evreni turlar boyunca donuk
**Dosya:** `learnup-brain/src/lib/generation.ts:766-803`, `:1024`
**Şiddet:** ORTA

**Senaryo:** `ozgunlukKumeleri` (stil örnekleri + havuz) döngü DIŞINDA bir kez kuruluyor. `partiIkizSuz` kardeşleri ve `accepted`'ı karşılaştırıyor ama `denetle`'nin özgünlük kapısı bu turda kabul edilmiş soruları görmüyor; ayrıca `assembleSegment`/`handleTopup` aynı anda çalışırsa başka bir sürecin az önce yazdığı sorular da evrende yok.
**Sonuç:** 3 tur boyunca havuz güncellenmediği için ikinci/üçüncü turda üretilen sorular birinci turun havuza yazılmış kopyaları olabilir; `content_hash` yalnız birebir aynı metni yakalar.
**Öneri:** `essiz` süzgecinden geçen adayları `ozgunlukKumeleri`'ne ekleyerek turlar arasında büyüt.

---

## DÜŞÜK

### D1 — `resolveGenerationRole`'ün ilk dalı ölü kod
**Dosya:** `learnup-brain/src/lib/generation.ts:324-327` · **Şiddet:** DÜŞÜK
`if (costOptimized && difficulty !== 'zor') return 'generateFree'` satırından sonraki `return difficulty === 'zor' ? 'generate' : 'generateFree'` zaten aynı sonucu verir. `costOptimized` rol seçimini hiçbir koşulda değiştirmiyor — parametre yanıltıcı.
**Öneri:** Dalı kaldır veya `costOptimized` için gerçekten farklı bir rol seç.

### D2 — `resetBreaker` Redis'teki kesici anahtarını silmiyor
**Dosya:** `learnup-brain/src/lib/model-router.ts:459-463` · **Şiddet:** DÜŞÜK
Bellekten hem `cbKey` hem `cbCountKey` siliniyor, Redis'ten yalnız `cbCountKey`. `cbKey`'in TTL'i olduğu için pratik etkisi yok ama iki katman arasında kalıcı asimetri var; ileride TTL'siz bir kesici konursa sessizce takılı kalır.

### D3 — Gece penceresinin gün anahtarı `toLocaleString` gidiş-dönüşüne bağlı
**Dosya:** `learnup-brain/src/workers/atolye.worker.ts:139-141` · **Şiddet:** DÜŞÜK
`new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }))` sonucunda `getHours()` her TZ'de doğru çalışır ama `toISOString().slice(0,10)` yalnız konteyner TZ'si UTC iken doğru gün verir. Bugün `docker-compose.yml`'de TZ verilmediği için sorun yok; `TZ=Europe/Istanbul` eklenirse 02:00–02:59 penceresi bir önceki günün kilidini görür ve gece işleri o saat diliminde atlanır.
**Öneri:** Gün anahtarını `toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' })` ile üret (rontgen.ts kalıbı).

### D4 — `getCatalogItem` prototip zincirindeki anahtarları ürün sanıyor
**Dosya:** `learnup-brain/src/lib/market-catalog.ts:53-54` · **Şiddet:** DÜŞÜK
`itemId in DECOR` prototip zincirine bakar: `'constructor'`, `'toString'`, `'valueOf'` için `true` döner ve `price` alanına bir fonksiyon konur. İstemci `POST /api/v1/garden/buy {"itemId":"toString"}` gönderdiğinde `getCatalogItem` null yerine bozuk bir kayıt döndürür; `satin_al` RPC'sine `p_price` JSON'da hiç gitmez → PostgREST hatası → 500.
**Öneri:** `Object.hasOwn(DECOR, itemId)` kullan.

### D5 — Küçük liglerde kimse düşmüyor
**Dosya:** `learnup-brain/src/lib/gamification.ts:267-275` · **Şiddet:** DÜŞÜK
`idx < PROMOTE_COUNT (7)` dalı `else if (idx >= sorted.length - RELEGATE_COUNT)` dalından önce geliyor. 12'den az üyeli bir ligde alt sıralardaki oyuncular da `idx < 7` koşulunu sağlar → hepsi terfi eder, düşme hiç gerçekleşmez.
**Öneri:** Lig boyutu eşiği ekle veya iki koşulu çakışmayacak şekilde ayır.

### D6 — `janitor` deneme sayacı yükseltilemezse görev sonsuz döngüye girer
**Dosya:** `learnup-brain/src/agents/bus.ts:164`, `learnup-brain/src/workers/atolye.worker.ts:66-73` · **Şiddet:** DÜŞÜK
`claimTask` CAS'ı kazandıktan sonra `attempts`'i AYRI bir update ile artırıyor ve bu update'in hatası kontrol edilmiyor. O yazım düşerse `attempts` 0'da kalır; bekçinin `>= 3 → FAILED` kapısı hiç tetiklenmez ve aynı görev süresiz olarak yeniden kuyruğa atılır (her seferinde LLM faturası).
**Öneri:** `attempts` artışını claim UPDATE'ine dahil et (tek ifade) veya hatasını logla + FAILED yolunu zamana da bağla.

### D7 — `countSrsDue` 100'de doyuyor, plan bunu gerçek sayı sanıyor
**Dosya:** `learnup-brain/src/lib/planner.ts:141-150`, kullanım `:102` · **Şiddet:** DÜŞÜK
`.limit(100)` sonrası `count: (data ?? []).length` en fazla 100 olur. `d < srsDue.count / 5 + 1` ve `Math.min(10, srsDue.count)` bu doymuş sayıyla çalışır.
**Öneri:** `{ count: 'exact', head: true }` ile gerçek sayıyı al (`lib/pg.ts:sayimAl` bunun için var).

### D8 — `buildPlan` Supabase hatalarını yutup boş planı kalıcılaştırıyor
**Dosya:** `learnup-brain/src/lib/planner.ts:35-46,133-137` · **Şiddet:** DÜŞÜK
`Promise.all` içinde yalnız `{ data }` destructure ediliyor; `error` hiç kontrol edilmiyor. `user_mastery` okuması geçici olarak düşerse `mastery = null` → `scored = []` → boş plan üretilir ve `roadmaps`'e **upsert edilir**, yani öğrencinin mevcut sağlam planının üzerine yazılır.
**Öneri:** Kritik girdilerde `error` varsa fırlat (plan yazma, hatalı girdiyle yapılmasın).

### D9 — `topup-planner` "en boş hücre önce" sıralaması yalnız rastgele bir önek içinde geçerli
**Dosya:** `learnup-brain/src/jobs/topup-planner.ts:56-72` · **Şiddet:** DÜŞÜK
Tarama ilk 18 ince hücre bulununca `break` ediyor, `sort` ondan sonra çalışıyor. Yani "en boş hücreler önce" ifadesi tüm havuz için değil, `nodeIds` sırasına göre rastgele bir önek için doğru.
**Öneri:** Sıralamayı tarama sonrası tüm ince hücreler üzerinde yap veya derinlik ölçümünü tek toplu sorguya çevir.

---

## Kontrol edilip ELENEN şüpheler (rapora alınmadı)

- `freeBudgetOk`/`freeBudgetTuket` arası oku-sonra-artır yarışı — dosyada bilinçli takas olarak ilan edilmiş ve gerçekten servis-ayakta-kalma lehine doğru karar (Y2'deki 3×-çağrı hatası ayrı bir sorundur).
- `panel-onbellek.ts` — anahtarlar kullanıcıdan bağımsız, TTL var, SCAN ile düşürme doğru; kullanıcıya özel veri sızıntısı yolu bulunamadı.
- `jsonCoz` — boş/çitli/kısmi çıktı üç savunmayla ele alınmış, fırlatmıyor.
- `mapLimit` (`utils/concurrency.ts`) — sıra korunuyor, `cap` doğru sınırlanmış, `fn` hatası çağırana yansıyor (kullanıcılar `denetle`'de defansif yazmış).
- `oturum.ts` fail-open davranışı — kodda açıkça gerekçelendirilmiş ve pipeline girdi bazında hata ayrımı doğru yapılmış.
- `parseTagged` `[TASARIM]` bekletme mantığı — sonraki `[SORU]`'ya iliştiriliyor, önceki soruya yapışma yolu kapalı.
