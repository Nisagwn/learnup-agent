
# Sistem Tasarımı Kavramlarının LearnUp Kod Tabanındaki Karşılıkları

Bu belge, klasik dağıtık sistem tasarımı kavramlarının bu projede **nerede** ve **nasıl**
uygulandığını gösterir. Her başlıkta gerçek dosya/satır referansı verilmiştir; kavramın
karşılığı yoksa ya da kısmiyse bu açıkça belirtilmiştir.

Referans biçimi: `dosya:satır — fonksiyon()`

---

## Mimari özet (bağlam)

```
Tarayıcı (React SPA)
      │  REST/JSON (istek)  ·  SSE (sohbet, push)  ·  polling (görev durumu)
      │  Bearer JWT
      ▼
   nginx :3000  ── statik SPA + /api ters vekil + IP rate limit + failover
      │  least_conn
      ├──────────────┐
      ▼              ▼
   brain :8080    brain2 :8080        ← Bun + Express, STATELESS, aynı imaj
      │              │
      └──────┬───────┘
             ▼
        Redis (db1: cache/kuyruk/sayaç/kilit · db2: oturum defteri)
             ▲
             │  XREADGROUP (consumer group 'atolye')
        ┌────┴────┐
     worker   worker2      ← ajan görevleri paylaşılır; zamanlayıcı leader-lock'ta
        └────┬────┘
             ▼
   Supabase (Postgres + pgvector + Auth)   ·   OpenRouter (LLM + embeddings)
```

**Temel ilke:** *Postgres = hakikat, Redis = hot-path.* Redis'in yokluğu sistemi
**yavaşlatır, kilitlemez.** Aşağıdaki kavramların çoğu bu tek cümleden türer.

**İkinci ilke (§12'de öğrenildi):** *hiçbir süreç, düşürülebilir olması gereken bir durumu
kendi belleğinde tutmaz.* Dört uygulama sürecinin (2 brain + 2 worker) hepsi eşdeğerdir;
hangisinin isteği aldığı sonucu değiştirmez.

---

## Özet tablo

| # | Kavram | Durum | Ana dosya |
|---|---|---|---|
| 1 | Yatay ölçeklendirme | Var (API + worker) | `docker-compose.yml` |
| 2 | Load balancing | Var | `deploy/nginx/default.conf` |
| 3 | Failover / redundancy | Var (3 ayrı katmanda) | `default.conf`, `model-router.ts`, `atolye.worker.ts` |
| 4 | Circuit breaker | Var (2 katman) | `lib/model-router.ts` |
| 5 | Rate limiting | Var (3 katman) | `middleware/rateLimit.ts` |
| 6 | Message queue | Var | `agents/bus.ts` |
| 7 | Leader election | Var (lease tabanlı, iki kilit) | `workers/atolye.worker.ts` |
| 8 | Caching | Var (8 ayrı önbellek) | `desk.ts`, `rag.ts`, `yetki.ts`, `panel-onbellek.ts` |
| 9 | Eventual consistency | Var | `agents/bus.ts`, `lib/answers.ts` |
| 10 | Graceful degradation / fail-open | Var (projenin omurgası) | `clients/redis.ts` |
| 11 | Polling | Var (long-poll + zamanlayıcı + istemci) | `atolye.worker.ts`, `useAgentTaskStatus.ts` |

---

## 1. Yatay Ölçeklendirme (Horizontal Scaling)

**Durum: VAR** — her iki katmanda (API ve worker)

**Referanslar**
- `docker-compose.yml:47` — `brain` · `docker-compose.yml:76` — `brain2`
- `docker-compose.yml:114` — `worker` · `docker-compose.yml:136` — `worker2`
- `docker-compose.yml:65,69` ve `:84,88` — her iki brain **aynı** Redis DB'lerine bağlanır
- `docker-compose.yml:121,143` — her iki worker **aynı** Redis DB'sine (db 1) bağlanır
- `learnup-brain/src/lib/oturum.ts:1-25` — API'de yapışkan oturum neden gerekmiyor
- `learnup-brain/src/agents/bus.ts:169` — `consumerName()` → `w-<hostname>-<pid>`
- `learnup-brain/src/workers/atolye.worker.ts:107` — `GECE_KILIDI` (gün kilidi)

**Açıklama**

Dört uygulama sürecinin dördü de aynı imajdan (`learnup-brain`) kalkar; ikisi API komutuyla
(`src/server.ts`), ikisi worker komutuyla (`src/workers/atolye.worker.ts`). Aralarında hiçbir
doğrudan bağ yoktur. Yatay ölçeklendirmeyi mümkün kılan şey süreçlerin **durum tutmaması**:
oturum defteri, LLM bütçe sayaçları, sohbet penceresi, önbellekler ve görev kuyruğu hepsi
ortak Redis'te; kalıcı veri Supabase'de.

**API katmanı.** `oturum.ts` kararı açıkça gerekçelendirir: oturum defteri süreç belleğinde
olsaydı brain'de sonlandırılan bir oturum brain2'de yaşamaya devam ederdi. Ortak depoda
olduğu için **yapışkan oturum (`ip_hash`) gerekmez** — load balancer yükü serbestçe dağıtır.

**Worker katmanı.** İki worker aynı Redis consumer group'undan (`lb:tasks` / grup `atolye`)
tüketir. Paylaşım Redis'in kendi garantisidir: `XREADGROUP ... '>'` bir kaydı grup içinde
**yalnız bir** consumer'a teslim eder. Consumer kimliği `w-<hostname>-<pid>`'dir ve Docker
her container'a farklı hostname verdiği için çakışma olmaz.

> **Ölçeklendirme öncesi yapılan üç kontrol (2026-08-09).** Aşağıdaki denetimden geçmeden
> ikinci worker eklenmedi; ikisi temizdi, biri gerçek bir hata çıkardı ve düzeltildi.
>
> | # | Kontrol | Sonuç |
> |---|---|---|
> | 1 | Zamanlanmış işler leader-lock'la duplikasyondan korunuyor mu? | ❌ **Kısmen** — düzeltildi |
> | 2 | Görev tüketimi gerçekten consumer group üzerinden mi? | ✅ Evet (bir istisna düzeltildi) |
> | 3 | Redis bağlantı limiti iki worker'ı kaldırır mı? | ✅ Evet, rahatça |
>
> **Kontrol 1 — bulunan hata.** Tur kilidi (`lb:lock:scheduler`) *tur başına* doğru çalışıyordu
> ama **günlük tekrarı korumuyordu.** Kilit TTL'i 90 sn, zamanlayıcı aralığı ise 300 sn
> (`tick % 5` × 60 sn) — yani kilit her turda çoktan düşmüş olur ve liderlik turlar arasında
> serbestçe el değiştirir. Günde bir kez garantisini veren `lastForgeDay` ise süreç-yerel bir
> `let`'ti:
> ```
> 02:00 turu → worker A kazanır → gece işleri koşar, A.lastForgeDay = bugün
> 02:05 turu → worker B kazanır → B.lastForgeDay BOŞ → gece işleri TEKRAR koşar
> ```
> 4 saatlik gece penceresinde her worker bir kez kazandığı için iş **worker sayısı kadar**
> tekrarlardı. Bedeli teorik değil: `runNightlyFold` aktif kullanıcı başına bir LLM çağrısı
> yapar (200 kullanıcıya kadar) ve `student_memory.semantic`'i zaten katlanmış veri üzerine
> ikinci kez katlar. (`runNightlyForge` `NIGHTLY_FORGE=off` ile kapalı, katlama değil.)
> → **Düzeltme:** gün kilidi Redis'e taşındı — `SET lb:lock:gece:<gün> NX EX 86400`
> (`atolye.worker.ts:107`). Ayrıca tick'e süreç-içi yeniden-giriş kilidi eklendi: gece işleri
> dakikalarca sürerken bir sonraki tick aynı süreçte üst üste binmesin.
>
> **Kontrol 2 — bir istisna.** `XREADGROUP` + `ensureConsumerGroup` (BUSYGROUP'ta idempotent)
> + Postgres CAS-claim üçlüsü sağlamdı. Ama `compactSweep` (`katip.ts:31`) `SMEMBERS → SREM →
> enqueue` sırası izliyor ve `SREM`'in dönüşünü atıyordu: iki tarama üst üste binerse ikisi de
> aynı kullanıcıyı görüp iki compact + iki affect görevi basardı.
> → **Düzeltme:** `SREM`'in dönüşü artık sahiplik kanıtı sayılıyor (`!== 1` → atla). `SREM`
> atomiktir; kümenin kendisi kilit görevi görür, ek kilit gerekmez.
>
> **Kontrol 3 — sorun yok.** `redis:7-alpine` varsayılan `maxclients` = 10000 ve compose bunu
> ezmiyor. Süreç başına en fazla 4 bağlantı (`redis`, `redisBlocking`, `redisLimiter`,
> `redisSession`) → 2 brain + 2 worker ≈ 16 bağlantı. Üç mertebe pay var.

> **Ayrıca çözülmüş (2026-08-09):** Üç süreç-içi önbellek node'lar arasında paylaşılmıyordu ve
> `brain2` `backup`'tan aktif yük paylaşımına geçince gerçek arızaya dönüşüyordu. Üçü de
> ortak depoya taşındı ya da penceresi daraltıldı — ayrıntı §8 ve §12'de.

---

## 2. Load Balancing

**Durum: VAR**

**Referanslar**
- `deploy/nginx/default.conf:19-23` — `upstream brain_up` bloğu
- `deploy/nginx/default.conf:20` — `least_conn;`
- `deploy/nginx/default.conf:64` — `proxy_pass http://brain_up$request_uri;`

**Açıklama**

nginx, `/api/` altındaki tüm istekleri iki brain node'u arasında dağıtır. Algoritma olarak
**round-robin değil `least_conn` (en az bağlantı)** seçilmiştir ve bu bilinçli bir karardır:
`/api/chat` bir SSE (Server-Sent Events) akışıdır ve dakikalarca açık kalabilir
(`proxy_read_timeout 600s`). Round-robin *istek sayar*, açık bağlantıyı değil — uzun akışlar
tek bir node'da birikirdi. `least_conn` aktif bağlantıya baktığı için SSE yükünü doğru dağıtır.

`proxy_pass`'te `$request_uri` kullanımı da kritiktir: sondaki slash'lı biçim
(`proxy_pass http://brain_up/`) nginx'in `/api/` önekini silmesine yol açar ve Express
router'ları `/api` altına mount edildiği için (`app.ts:103`) her istek 404 dönerdi.

---

## 3. Failover / Redundancy

**Durum: VAR** — üç ayrı katmanda, birbirinden bağımsız

### 3a. Altyapı katmanı (nginx)
- `deploy/nginx/default.conf:21-22` — `max_fails=3 fail_timeout=10s` (pasif sağlık kontrolü)
- `deploy/nginx/default.conf:75-76` — `proxy_next_upstream error timeout ... http_500 http_502 http_503 http_504`

Bir node bağlantı hatası verir, timeout'a düşer ya da 5xx döndürürse nginx isteği diğer
node'a yönlendirir. `max_fails=3` sonrası o node 10 saniye boyunca havuzdan çıkarılır.
Not: `non_idempotent` parametresi **verilmemiştir**, yani nginx gövdesi gönderilmiş POST
isteklerini tekrar denemez — bu sayede `/answers` çift yazılmaz, `/questions/generate` çift
LLM faturası üretmez.

> **Failover'ın ulaşamadığı yer:** SSE akışları. `proxy_buffering off` ile yanıt başlıkları
> istemciye gitmiştir; nginx artık başka node'a geçemez. Bu her SSE mimarisinin doğal sonucudur.
> Karşılığı uygulama katmanında verildi — §12c.

### 3b. Dış servis katmanı (LLM zinciri)
- `learnup-brain/src/lib/model-router.ts:78` — `CHAINS` tanımı
- `learnup-brain/src/lib/model-router.ts:687` — `routedChat()` zincir döngüsü

Her LLM rolü (`chat`, `generate`, `verify`, `fast`…) için sıralı bir model zinciri vardır:
`[ücretsiz birincil, ücretsiz alternatif, …, PARALI]`. Bir model 429/5xx/timeout verirse
zincirde bir sonrakine geçilir. **Zincir daima paralı bir modelle biter** — tasarım kuralı
şudur: öğrenci sohbetin ortasında asla "servis kullanılamıyor" görmez.

### 3c. Görev katmanı (bekçi / janitor)
- `learnup-brain/src/workers/atolye.worker.ts:47` — `janitor()`
- `learnup-brain/src/workers/atolye.worker.ts:44-45` — `RUNNING_BAYAT_MS` / `PENDING_BAYAT_MS`

Worker bir görevi işlerken çökerse görev `RUNNING` durumunda asılı kalır. Bekçi her 5
dakikada bir bayat kayıtları tarar: 15 dakikadan uzun `RUNNING` ya da 2 dakikadan uzun
`PENDING` görevleri `PENDING`'e döndürüp yeniden kuyruğa atar. 3 denemeden sonra `FAILED`
işaretlenir — sonsuz döngü yok.

### 3d. Veri dayanıklılığı
- `docker-compose.yml:107-108` — `redis-server --appendonly yes` + `redis-data` named volume
- `learnup-brain/src/routes/health.routes.ts:7` — liveness (`/health`)
- `learnup-brain/src/routes/health.routes.ts:20` — readiness (`/health/ready`, bağımlılık durumu)

---

## 4. Circuit Breaker (Devre Kesici)

**Durum: VAR** — iki katmanda

### 4a. Uygulama katmanı (LLM sağlayıcıları) — asıl uygulama
- `learnup-brain/src/lib/model-router.ts:367` — `cbKey()` → `lb:llm:cb:<slug>`
- `learnup-brain/src/lib/model-router.ts:368` — `cbCountKey()` → ardışık arıza sayacı
- `learnup-brain/src/lib/model-router.ts:441` — `breakerOpen()` — devre açık mı?
- `learnup-brain/src/lib/model-router.ts:451` — `tripBreaker()` — devreyi aç
- `learnup-brain/src/lib/model-router.ts:459` — `resetBreaker()` — başarıda sıfırla
- `learnup-brain/src/lib/model-router.ts:494` — `isRetryable()` — hangi hata devreyi açar

**Açıklama**

Klasik circuit breaker deseninin ders kitabı uygulaması. Bir model slug'ı 429 (kota),
5xx, ağ hatası ya da timeout verdiğinde `tripBreaker()` çağrılır ve o slug Redis'te
**üstel geri çekilme (exponential backoff)** ile devre dışı bırakılır:

```
cooldown = min(300, 30 × 2^(ardışık_arıza - 1))   →  30s, 60s, 120s, 240s, 300s (tavan)
```

Devre açıkken `breakerOpen()` `true` döner ve zincir o slug'ı **hiç denemeden** atlar —
yani sağlayıcıya boşuna istek gitmez, kullanıcı boşuna beklemez. İlk başarılı çağrıda
`resetBreaker()` sayacı sıfırlar (yarı-açık → kapalı geçişi).

Ayrım önemli: `isSkippable()` (`model-router.ts:532`) kalıcı arızaları (400/402/404 — model
kaldırılmış, kredi yok) ayrı ele alır ve devre **açmadan** zincirde ilerler. Geçici arıza ile
kalıcı arızayı ayırmamak, kalkmış bir modelin devresini 5 dakika boyunca beklemek demek olurdu.

### 4b. Altyapı katmanı (nginx)
- `deploy/nginx/default.conf:21-22` — `max_fails` / `fail_timeout`

nginx'in pasif sağlık kontrolü de bir devre kesicidir: 3 arıza sonrası node 10 saniye
havuzdan çıkar.

---

## 5. Rate Limiting

**Durum: VAR** — üç katmanda, farklı anahtarlarla

| Katman | Anahtar | Limit | Dosya |
|---|---|---|---|
| nginx | IP adresi | 60 istek/dk, burst 10 | `default.conf:7,57` |
| Express (standart) | userId | 60/dk | `rateLimit.ts:53` |
| Express (LLM) | userId | 10/dk | `rateLimit.ts:71` |
| Express (chat/SSE) | userId | 20/dk | `rateLimit.ts:85` |
| Sağlayıcı kotası | provider | dakika + gün penceresi | `model-router.ts:315,337` |

**Referanslar**
- `deploy/nginx/default.conf:7` — `limit_req_zone $binary_remote_addr ... rate=60r/m`
- `learnup-brain/src/middleware/rateLimit.ts:8` — `kullaniciAnahtari()`
- `learnup-brain/src/middleware/rateLimit.ts:17` — `buildStore()` (Redis, prefix `lb:rl:`)
- `learnup-brain/src/lib/model-router.ts:315` — `MINUTE_CAP`
- `learnup-brain/src/lib/model-router.ts:337` — `DAY_CAP_BASE`
- `learnup-brain/src/lib/model-router.ts:343` — `PRIORITY_FACTOR`

**Açıklama**

En öğretici kısım **anahtar seçimi**. `rateLimit.ts:41-49`'daki yorum, eski hâlin iki yönlü
bozuk olduğunu belgeliyor: varsayılan `req.ip` anahtarıyla (a) proxy havuzu olan tek bir hesap
sınırsız ücretli LLM çağrısı yapabiliyordu, (b) ters vekil arkasında herkesin IP'si nginx'in
IP'si göründüğü için tüm öğrenciler tek bir 60/dk kovasına düşüyordu. Anahtarın doğrulanmış
JWT'nin `userId`'si olması hem adil hem sahtelenemez.

İkinci öğretici nokta: `llmLimiter`'ın 10/dk olması bir **hız** sınırı değil **fatura**
sınırıdır. Tek bir `/questions/generate` isteği, havuz boşsa onlarca LLM çağrısı zinciri
tetikleyebilir (üret → aday başına doğrula → onar → yeniden doğrula, 3 tura kadar).

Üçüncü katman (`model-router`) sağlayıcı tarafını korur: her sağlayıcı için dakika penceresi
ve günlük kota tutulur, ayrıca **öncelik faktörü** vardır — `P0` (interaktif sohbet) kotanın
%100'ünü, `P2` (gece batch işleri) yalnız %85'ini kullanabilir. Yani arka plan işleri
öğrencinin kotasını yiyemez.

> Store Redis'te (`lb:rl:` öneki) olduğu için sayım **dağıtıktır**: brain ve brain2 aynı
> kovayı paylaşır, limit node sayısıyla çarpılmaz.

---

## 6. Message Queue (Mesaj Kuyruğu)

**Durum: VAR** — Redis Streams + Postgres kalıcılığı

**Referanslar**
- `learnup-brain/src/agents/bus.ts:93` — `enqueueTask()` (üretici)
- `learnup-brain/src/agents/bus.ts:121` — `XADD ... MAXLEN ~ 10000`
- `learnup-brain/src/agents/bus.ts:171` — `ensureConsumerGroup()` (`XGROUP CREATE`)
- `learnup-brain/src/agents/bus.ts:182` — `readTasks()` (`XREADGROUP ... BLOCK`)
- `learnup-brain/src/agents/bus.ts:221` — `ackTask()` (`XACK`)
- `learnup-brain/src/agents/bus.ts:146` — `claimTask()` (CAS kilidi)
- `learnup-brain/src/workers/atolye.worker.ts:114` — `processDelivered()`
- `learnup-brain/src/agents/ritim.ts:19-36` — görev türü → işleyici dağıtımı

**Açıklama**

Kuyruk **çift yazımlıdır** ve bu tasarımın kalbi:

1. `enqueueTask()` önce Postgres'e `agent_tasks` satırı yazar (`status: PENDING`) — **hakikat**
2. Sonra Redis Stream'e `XADD` yapar — yalnız **hızlı teslim sinyali**

`XADD` başarısız olursa hata **yutulur**, istek 500'e düşmez: görev PG'de `PENDING` durur ve
bekçi (§3c) onu toparlar. Yani mesaj kaybı yapısal olarak imkânsız; kaybedilebilecek tek şey
gecikmedir.

Tüketim tarafı `XREADGROUP` ile consumer group üzerinden yapılır (at-least-once teslimat).
Aynı görevin iki kez işlenmemesi için `claimTask()` Postgres üzerinde bir **CAS
(compare-and-set)** işlemi yapar: satır ancak `PENDING` ise ya da bayat `RUNNING` ise
`RUNNING`'e çevrilebilir, ve bu atomik `UPDATE ... WHERE` tek sorguda olur. Yarışı kaybeden
worker `false` alır ve görevi atlar.

`MAXLEN ~ 10000` stream'in sınırsız büyümesini engeller (yaklaşık kırpma — performans için).

**Görev türleri** (`bus.ts:22-27`): `forge_topup` (soru üretimi), `plan`, `diagnose`,
`affect`, `compact`, `nudge`, `closure_check`, `eval`.

---

## 7. Leader Election (Lider Seçimi)

**Durum: VAR** — lease (kira) tabanlı, Redis kilidi

**Referanslar**
- `learnup-brain/src/workers/atolye.worker.ts:27` — `SCHEDULER_LOCK` (tur kilidi)
- `learnup-brain/src/workers/atolye.worker.ts:107` — `GECE_KILIDI` (gün kilidi)
- `learnup-brain/src/workers/atolye.worker.ts:117` — `zamanlayiciCalisiyor` (süreç-içi yeniden-giriş)
- `learnup-brain/src/workers/atolye.worker.ts:119-159` — `schedulerTick()` kilit mantığı

**Açıklama**

Görevler N worker arasında paylaştırılabilir, ama **zamanlanmış işler paylaştırılamaz**:
bekçi taraması ya da gece katlaması her worker'da ayrı ayrı çalışsaydı aynı iş N kez
yapılırdı (LLM faturası N katına çıkardı).

Çözüm klasik lease tabanlı lider seçimidir — ama **iki farklı kilit** gerekiyor, çünkü iki
farklı zaman ölçeği var:

### Tur kilidi — "bu turu kim koşuyor?"

```js
const ok = await redis.set(SCHEDULER_LOCK, CONSUMER, 'PX', 90_000, 'NX')  // atomik
const holder = ok ? CONSUMER : await redis.get(SCHEDULER_LOCK)
if (holder !== CONSUMER) return          // lider değilim → bu turu atla
await redis.set(SCHEDULER_LOCK, CONSUMER, 'PX', 90_000)   // liderim → kirayı yenile
```

`SET ... NX` (yoksa yaz) atomiktir, yani kilidi tam olarak bir worker kazanır. `PX 90000`
kilidin 90 saniyelik bir **kira** olmasını sağlar: lider çökerse kilit kendiliğinden düşer,
manuel temizliğe gerek kalmaz.

### Gün kilidi — "bu geceyi kim üstlendi?"

```js
const kazandi = (await redis.set(GECE_KILIDI(day), CONSUMER, 'EX', 86_400, 'NX')) !== null
if (!kazandi) return   // gece işlerini başka worker üstlendi
```

**İkinci kilit neden şart:** tur kilidinin TTL'i (90 sn) zamanlayıcı aralığından (300 sn)
kısadır — yani liderlik her turda yeniden yarışılır ve turlar arasında el değiştirir. Bu tur
başına doğrudur ama "günde bir kez" garantisi **vermez**. O garantiyi eskiden süreç-yerel bir
`lastForgeDay` bayrağı veriyordu; ikinci worker eklenince her worker gece penceresinde bir kez
kazanıp işi tekrarlıyordu (§1'deki Kontrol 1). Gün kilidi bu garantiyi ortak depoya taşır.

Kilit **bilerek serbest bırakılmaz** (24 saat yaşar): kazanan worker gece işlerinin ortasında
ölürse o gece iş yapılmamış olur. Takas bilinçli — katlama ertelenebilir bir bakım işidir,
iki kez koşmak ise geri alınamaz LLM harcaması ve bozulmuş hafızadır.

### Üçüncü katman: süreç-içi yeniden-giriş

`void schedulerTick()` ateşle-unut çağrılır. Gece işleri dakikalarca sürebilir ve 300 sn'lik
tick bu sırada bir kez daha ateşler → **aynı süreçte** iki tarama üst üste biner. Bu Redis'e
gitmeye değmeyecek kadar yerel bir sorundur; basit bir `boolean` bayrak çözer.

> **Not:** Bu, Raft/Paxos gibi konsensüs algoritmalarıyla karıştırılmamalı. Tek Redis
> instance'ına dayanan basit bir dağıtık kilittir; Redis'in kendisi tek arıza noktasıdır.
> Bu ölçek için yeterli ve bilinçli bir tercih.
>
> **Genelleştirilebilir ders:** "Bir lider kilidi koydum" demek yetmez — **kilidin ömrü ile
> korunan işin periyodu uyuşmalıdır.** 90 saniyelik bir kilit, günde bir çalışması gereken bir
> işi koruyamaz. Tek worker varken bu fark görünmezdi.

---

## 8. Caching (Önbellekleme)

**Durum: VAR** — sekiz ayrı önbellek, farklı ömür ve stratejilerle

| # | Önbellek | Nerede | TTL | Dosya |
|---|---|---|---|---|
| 1 | Koç Masası | Redis | 48 saat | `lib/desk.ts:13,23` |
| 2 | Sohbet penceresi | Redis | son 12 tur | `lib/desk.ts:14,61` |
| 3 | Embedding | Redis | **TTL yok** | `lib/rag.ts:63,94` |
| 4 | Rol/kimlik | Süreç (L1) → Redis (L2) → DB | 5 sn / 60 sn | `lib/yetki.ts:64,91` |
| 5 | Sınıf mevcudu | Süreç (L1) → Redis (L2) → DB | 5 sn / 60 sn | `lib/yetki.ts:223,233` |
| 6 | Yönetim paneli | **Redis** | 10 dk | `lib/panel-onbellek.ts:31,35` |
| 7 | JWT | Tarayıcı belleği | 60 sn | `frontend-v2/src/lib/api.js:9` |
| 8 | Statik dosyalar | Tarayıcı | 1 yıl, `immutable` | `default.conf:50-54` |

**Açıklama — öne çıkan üç örnek**

**Cache-aside deseni (Koç Masası).** `composeDesk()` (`desk.ts:23`) önce Redis'e bakar; miss
olursa Postgres'ten derler, sonuca yazar ve döndürür. `invalidateDesk()` (`desk.ts:56`)
uzmanlar yeni bir brief yazdığında önbelleği düşürür. Klasik cache-aside + explicit
invalidation.

**Çok katmanlı önbellek (L1/L2/L3).** `kimlikAl()` (`yetki.ts:91`) üç katman kullanır:
L1 süreç-içi `Map` (5 sn) → L2 Redis (60 sn) → L3 Postgres. Kritik ayrıntı: bu zincir
**asla "izin ver"e düşmez** — Redis erişilemezse DB'ye gidilir, yetki varsayılmaz.

İki TTL'in farklı olması bilinçlidir (`yetki.ts:64-65`): L2 ortak katmandır ve DB yükünü asıl
o emer; L1 yalnız burst emicidir ve **süreç-yerel** olduğu için uzun tutulamaz — ayrıntı §12'de.

**TTL'siz önbellek (embedding).** `rag.ts:63`'teki `embedKey()` anahtarı metnin SHA-1
özeti + model adı + boyuttan üretir. Metin değişirse anahtar değişir, model değişirse anahtar
değişir — yani bayatlayabilecek bir şey yoktur, TTL vermek yalnız aynı vektörü tekrar satın
almak olurdu. Bu, doğrudan maliyet tasarrufu için kurulmuş bir önbellek: aynı üretim hücresi
için aynı embedding bir kez ödenir.

**Ortak depo vs. süreç-içi.** 1-6 arası önbelleklerin **düşürülebilir** olması gerekir ve
düşürme bütün node'lar için geçerli olmalıdır. Bu yüzden hepsinin *hakikat* katmanı Redis'tir;
süreç-içi `Map` yalnız 5 saniyelik burst emici olarak kalır. Bu ayrım baştan böyle değildi —
nasıl ve neden değiştiği §12'de.

---

## 9. Eventual Consistency (Nihai Tutarlılık)

**Durum: VAR** — bilinçli olarak, birkaç noktada

**Referanslar**
- `learnup-brain/src/agents/bus.ts:113-128` — PG yazımı → Redis sinyali (senkron değil)
- `learnup-brain/src/lib/answers.ts:235-254` — cevap sonrası yan etkiler
- `learnup-brain/src/lib/yetki.ts:64-65` — L1 5 sn / L2 60 sn rol önbelleği
- `learnup-brain/src/lib/oturum.ts:49` — `DOKUNMA_ARALIGI_MS` (60 sn yazma kısması)
- `learnup-brain/src/agents/kaptan.ts:72,127` — sohbet turunun iki aşamalı yazımı

**Açıklama**

**Kuyruk yazımı.** `enqueueTask()` Postgres'e yazdıktan sonra Redis sinyalini gönderir; ikisi
tek bir transaction değildir. Sinyal düşerse görev anında görünmez ama **kaybolmaz** — bekçi
en geç 2 dakika içinde onu kuyruğa alır. Yani sistem "hemen tutarlı" değil, "nihayetinde
tutarlı"dır ve bu takas açıkça belgelenmiştir.

**Cevap sonrası yan etkiler.** `processAnswer()` öğrenciye yanıtı döndürmeden önce yalnız
kritik yazımı (atomik `record_answer` RPC) bekler. Sinyal penceresi, mastery güncellemesi,
Kâtip işaretlemesi ve Atlas teşhis tetiği (`answers.ts:235-254`) izole çağrılardır — biri
düşse öğrencinin cevabı kaydedilmiş olur. Bilişsel harita bir kaç saniye geriden gelir.

**Rol/askı yayılımı.** Bir hesap askıya alındığında `kimligiUnut()` ortak L2'yi (Redis) siler,
yani düşürme bütün node'lar için anında geçerlidir. Kalan tek gecikme diğer node'un 5 saniyelik
L1 penceresidir. Acil durumda o da beklenmez: oturum kesimi (`oturum:v1:kesim:<userId>`,
Redis db2) her istekte kısılmadan okunur — yönetici hesabı anında dışarı atabilir.

**"Son görülme" damgası.** Oturum kaydına her istekte yazmak yerine 60 saniyede bir yazılır.
Ama **iptal kontrolü kısılmaz** — kısılsaydı "çıkış yaptım ama hâlâ içerideyim" penceresi
60 saniye olurdu. Hangi verinin nihai tutarlı olabileceği, hangisinin olamayacağı ayrımı.

**Sohbet turunun iki aşamalı yazımı.** Kullanıcı mesajı akış **başlamadan** yazılır
(`kaptan.ts:72`), asistan yanıtı ise tur bitiminde (`kaptan.ts:127`, `finally`). Aradaki
pencerede `chat_messages` "yarım" bir tur içerir: soru var, cevap yok. Bu bilinçli bir
tutarsızlıktır — alternatifi, akış koptuğunda soruyu da kaybetmekti (§12).

---

## 10. Graceful Degradation / Fail-Open

**Durum: VAR** — projenin en belirgin mimari teması

**Referanslar**
- `learnup-brain/src/clients/redis.ts:109` — `redisTry()` (hot-path sarmalayıcı)
- `learnup-brain/src/clients/redis.ts:122` — `redisSessionTry()`
- `learnup-brain/src/clients/redis.ts:45-50` — üç bağlantı profili (`hot` / `worker` / `limiter`)
- `learnup-brain/src/middleware/rateLimit.ts:35` — `passOnStoreError: true`
- `learnup-brain/src/middleware/oturum.ts:16-20,40` — fail-open oturum kapısı
- `learnup-brain/src/lib/model-router.ts:346` — `memCounters` (in-memory yedek sayaç)
- `learnup-brain/src/agents/bus.ts:66` — `setInprocHandler()` (Redis'siz kuyruk)
- `learnup-brain/src/routes/health.routes.ts:20` — kısmi bozulmayı raporlayan readiness

**Açıklama**

Kural tek cümlede: **"Redis'in yokluğu ÖZELLİK KAYBI'dır, HATA değil."**

Bu kural her katmanda ayrı ayrı uygulanmış:

| Redis düşerse | Ne olur |
|---|---|
| Rate limiter | Limit uygulanmaz, istek geçer (`passOnStoreError`) |
| Oturum kapısı | Salt-JWT ile geçilir; iptal uygulanamaz ama kimlik doğrulama durur |
| Koç Masası | Cache soğuk sayılır, Postgres'ten derlenir |
| LLM bütçesi | Süreç-içi yaklaşık sayaca düşer |
| Görev kuyruğu | Görev PG'de `PENDING` kalır, in-process kuyruk (eşzamanlılık 2) devreye girer |
| Rol/yetki | DB'ye düşülür — **asla "izin ver"e değil** |

En öğretici ayrıntı **bağlantı profilleri** (`redis.ts:45-50`). Aynı ayar her yerde doğru
değildir:

- **`hot`** (istek yolu): `enableOfflineQueue: false`. Ölçülmüş bir arıza: bu ayar olmadan
  Redis kapalıyken `redis.get()` **hiç çözülmüyordu** — promise sonsuza asılı kalıyor, soru
  üretimi ve sohbet tamamen donuyordu. Yani "yavaşlatmalı, kilitlememeli" kuralı ihlal
  ediliyordu. Şimdi komut anında reddedilir, çağıran `.catch()` ile devam eder.
- **`worker`**: `maxRetriesPerRequest: null` + çevrimdışı kuyruk açık. Worker'ın işi zaten
  beklemek.
- **`limiter`**: ikisinin ortası + `commandTimeout: 1000`. Sebep: `rate-limit-redis` kurulur
  kurulmaz `SCRIPT LOAD` gönderir ve `hot` profiliyle bu reddediş yakalanmayıp süreci
  açılışta öldürüyordu.

Fail-open'ın **görünmez kalmaması** da tasarlanmış: `/health/ready` (`health.routes.ts:20`)
oturum deposunu ayrı satırda raporlar ve 503 üretmez — çünkü o pencerede API çalışmaya devam
eder, ama "çıkış yaptırılan cihazlar hâlâ içeride" bilgisi operasyona görünür kalır.

---

## 11. Polling

**Durum: VAR** — üç farklı biçimde: long-polling, zamanlayıcı taraması ve istemci polling'i

**Referanslar**
- `learnup-brain/src/workers/atolye.worker.ts:179-186` — ana tüketim döngüsü (long-poll)
- `learnup-brain/src/workers/atolye.worker.ts:170-175` — `setInterval` 60 sn zamanlayıcı tick
- `learnup-brain/src/agents/bus.ts:247` — `delegateAndAwait()` (`XREAD BLOCK` döngüsü)
- `learnup-brain/src/agents/katip.ts:31` — `compactSweep()` (Redis küme taraması)
- `learnup-brain/src/routes/agents.routes.ts:127` — `agentsStatusRouter` (yoklama ucu)
- `learnup-brain/src/app.ts:112-113` — yoklama ucunun `standardLimiter`'a ayrılması
- `frontend-v2/src/lib/useAgentTaskStatus.ts:82` — `useAgentTaskStatus()` hook'u
- `frontend-v2/src/screens/kule/Ayarlar.tsx:352` — hook'un bağlandığı yer (eval tetiği)

**Açıklama**

**Long-polling (var).** Worker'ın ana döngüsü boş beklemeyle CPU yakmaz:
`readTasks(CONSUMER, 10, 5000)` `XREADGROUP ... BLOCK 5000` çağırır — görev yoksa Redis
soketi 5 saniye bloklar, görev gelirse anında döner. Aynı desen `delegateAndAwait()`'te
(`bus.ts:247`) `XREAD BLOCK` ile tekrarlanır: Pusula bir görevi delege edip terminal olayı
(`COMPLETED`/`FAILED`) beklerken meşgul döngü kurmaz, 60 saniyelik bir zaman aşımıyla bloklu
okur. Bu, "busy polling"in doğru alternatifidir.

**Zamanlayıcı polling (var).** `setInterval(..., 60_000)` her dakika tetiklenir; bekçi kendi
5 dakikalık ritmini bir tick sayacıyla tutar (`tick % 5 === 0`). `compactSweep()` de Redis'teki
aktif kullanıcı kümesini tarayarak sessizleşenleri bulur.

**İstemci polling (2026-08-09'da eklendi).** `GET /agents/status/:taskId` ucu vardı ama hiçbir
yerden çağrılmıyordu: arka plana atılan görevler `202 Accepted` + `taskId` döndürüyor, sonra
iz kayboluyordu. Yönetici "Eval ölçümünü koştur"a basınca ekranda yalnız kesik bir kimlik
görüyordu (`eval görevi kuyruğa alındı: 3f2a1b9c…`) — görevin koştuğunu, bittiğini ya da
patladığını hiçbir yerden öğrenemiyordu.

Eklenen üç parça:

1. **`useAgentTaskStatus(taskId)` hook'u** (`frontend-v2/src/lib/useAgentTaskStatus.ts`) —
   3 saniyede bir yoklar, `COMPLETED`/`FAILED`'de durur, 2 dakikada `zaman_asimi`'na düşer
   (sonsuz yoklama yok), unmount'ta `clearInterval` + `AbortController.abort()` ile temizlenir.
2. **Bağlantı noktası** (`Ayarlar.tsx:352`) — eval tetiği artık dönen `taskId`'yi hook'a
   veriyor ve durumu insan diline çevirip gösteriyor (bekliyor / işleniyor / tamamlandı / hata).
3. **Yoklama ucunun ayrı limiter'a taşınması** (`app.ts:112`) — aşağıda.

> **Bu iş bir rate limit çelişkisi ortaya çıkardı.** `/agents/*` app.ts'te `llmLimiter` ile
> mount ediliyordu (**10 istek/dk/kullanıcı**), çünkü oradaki uçların çoğu LLM zinciri
> tetikler ve orada sınır hız değil faturadır (§5). Ama `GET /agents/status/:taskId` tek bir
> `maybeSingle()` SELECT'tir — sıfır LLM. Yoklama için tasarlanmış bir ucu 10/dk kovasına
> koymak onu **kullanılamaz** kılıyordu: 3 sn'de bir yoklama = 20 istek/dk → istemci daha ilk
> yarım dakikada 429 alırdı. Uç ayrı bir router'a (`agentsStatusRouter`) alındı ve `/agents`'tan
> **önce** `standardLimiter` (60/dk) ile mount edildi — Express sıralı eşleştiği için aynı
> desen `/questions/ai` → `/questions`'ta zaten kullanılıyor. Kullanıcı kapsamı
> (`.eq('user_id', req.userId!)`) aynen korundu.
>
> **Ders:** rate limit sınıfları uç türüne göre değil, **ucun maliyetine** göre seçilmeli.
> "Bu yol altındaki her şey pahalı" varsayımı, altına düşen ucuz bir ucu sessizce ölü hale
> getirebiliyor.

Yoklamanın **her yere yayılmaması** da kasıtlı: kullanıcıya anlık geri bildirim gereken tek
akış sohbettir ve o **SSE ile push** edilir (`chat.routes.ts:52`). Yoklama yalnız dakikalar
süren, üç durum geçişi olan (PENDING → RUNNING → COMPLETED) görevler için kullanılıyor —
böyle bir akış için kalıcı bağlantı açmak, onu iki brain node'undan birine yapıştırmak ve
yeniden bağlanma mantığı yazmak, birkaç saniyede bir tek SELECT'ten çok daha pahalı olurdu.

`202 Accepted` + `taskId` döndüren **iki uç daha** var ve ikisinin de hâlâ frontend çağrısı
yok: `POST /admin/havuz/uretim` (yanıt tipi `types.admin.ts:407`'de tanımlı ama kullanılmıyor)
ve `POST /agents/dispatch`. Hook yeniden kullanılabilir; nereye bağlanacakları
`useAgentTaskStatus.ts` başındaki blokta not edildi — **varsayımla ekran uydurulmadı.**

Frontend'deki diğer `setInterval` kullanımları hâlâ UI sayaçlarıdır
(`OdakZamanlayici.tsx:41`, `Coz.tsx:103`), ağ polling'i değil.

---

## 12. Tek node varsayımının sökülmesi (2026-08-09 çalışması)

Bu bölüm bir kavram değil, yukarıdaki kavramların **birbirini nasıl etkilediğinin** somut
örneği — sunumda "mimari kararların bedeli olur" başlığı altında anlatılabilir.

### Sorun nasıl doğdu

`brain2` başlangıçta nginx'te `backup` olarak tanımlıydı: yalnız `brain` düştüğünde devreye
giriyordu. `worker` ise tek instance'tı. Yani pratikte **her katmanda her zaman tek süreç
çalışıyordu.** Gerçek yük paylaşımına geçmek (§2) tek satırlık bir nginx değişikliğidir —
ama kodda "tek süreç var" varsayımına dayanan her yeri birden bozar.

Çalışma üç dalgada ilerledi; her dalga bir öncekinin açtığı yeni yüzeyde yeni bir sorun
ortaya çıkardı:

| Dalga | Ne yapıldı | Ortaya çıkan sorun |
|---|---|---|
| **A** — API yük paylaşımı | `brain2` `backup` → aktif (`least_conn`) | Süreç-içi önbellekler düşürülemiyor (12a, 12b); SSE turu kayboluyor (12c) |
| **B** — Worker ölçeklendirme | `worker2` eklendi | Gece işleri worker sayısı kadar tekrarlıyor (12d) |
| **C** — İstemci polling | `useAgentTaskStatus` hook'u | Yoklama ucu yanlış rate limit sınıfında (12e) |

Ortak örüntü: **her sorun, tek süreç varken görünmez olan bir varsayımdı.** Hiçbiri yeni
yazılan kodda değildi; hepsi çalışan koddaydı ve doğruydu — tek süreç olduğu sürece.

### 12a. Süreç-içi önbelleklerin düşürülememesi

**Sorun.** `panel-onbellek.ts` (10 dk) ve `yetki.ts`'teki iki önbellek (`kimlikCache`,
`rosterCache`) süreç-içi `Map`'ti. Düşürme fonksiyonları (`onbellegiDus`, `kimligiUnut`,
`sinifiUnut`) **yalnız isteği alan node'u** temizliyordu. Gerçek akış:

```
öğrenci sınıfa katılır  → istek brain'e düşer   → brain'in Map'i temizlenir
öğretmen listeyi açar   → istek brain2'ye düşer → brain2 ESKİ listeyi döndürür
```

En kötüsü **aralıklı** olması: `least_conn` istekleri gezdirdiği için bazen doğru, bazen eski
cevap gelir. `rosterCache` özellikle ciddiydi çünkü kodun kendi yorumu bu hatayı "kayıt
akışının en sinsi hatası — yazma başarılı, geri bildirim yanlış" diye tarif ediyordu; düzeltme
tek node varsayımı üstüne kurulmuştu.

**Çözüm.**

| Önbellek | Önce | Sonra |
|---|---|---|
| Yönetim paneli | Süreç-içi Map, 10 dk | **Redis**, 10 dk (`panel-onbellek.ts:31-35`) |
| Sınıf mevcudu | Süreç-içi Map, 60 sn | **L1 5 sn → L2 Redis 60 sn** (`yetki.ts:223-233`) |
| Rol/kimlik | L1 60 sn → L2 Redis | **L1 5 sn** → L2 Redis (`yetki.ts:64-65`) |

İlke: *düşürülebilir olması gereken her önbelleğin hakikati ortak depoda olmalı.* Süreç-içi
katman yalnız birkaç saniyelik burst emici olarak kalabilir — çünkü onu düşürmenin garantisi
yoktur, sadece beklemenin garantisi vardır.

`sinifiUnut()` bu yüzden **asenkron oldu** (`yetki.ts:278`) ve 9 çağrı yerine `await` eklendi
(`sinif.routes.ts`, `teacher.routes.ts`, `admin-yonetim.routes.ts`). Redis silmesini
beklemeden yanıt dönmek, düşürmeyi yine yarım bırakırdı.

### 12b. Ops düğmesinin de tek node'u temizlemesi

**Sorun.** `POST /admin/onbellek/dus` "panelde eski sayı görünüyor" şikâyetinin tek tıklık
cevabıydı — ama o da bir HTTP isteğidir ve tek bir node'a düşer. Kaçış yolunun kendisi aynı
hatadan muzdaripti.

**Çözüm.** Uç artık ortak depoyu temizliyor (`admin.routes.ts:308`). Yanıt hâlâ katman katman
sayı döndürüyor, çünkü süreç-içi L1 kalıntısı bilinçli olarak yerinde: yönetici neyin tam,
neyin kısmî düştüğünü ekranda görüyor.

**Yan düzeltme:** aynı uçta `KEYS yetki:kimlik:*` kullanılıyordu. `KEYS` tüm anahtar uzayını
tek seferde tarar ve **Redis tek iş parçacıklıdır** — o süre boyunca oturum kapısı ve rate
limit dahil her istek bloklanır. `SCAN` imleçli ilerler, blok üretmez. Aynı düzeltme
`panel-onbellek.ts:59`'da da uygulandı.

### 12c. SSE turunun kaybolması

**Sorun.** Sohbet turu tek bir `persistTurn` ile **tur sonunda** yazılıyordu. Akış ortasında
node ölürse hiçbir şey yazılmıyordu ve §3'te anlatıldığı gibi nginx bunu kurtaramaz: yanıt
başlıkları çoktan gitmiştir, `proxy_next_upstream` devreye giremez. Öğrenci sayfayı
yenilediğinde **kendi yazdığı mesajı bile göremiyordu** — sistem soruyu hiç duymamış gibi
davranıyordu.

**Çözüm.** Yazım ikiye bölündü (`kaptan.ts:40-147`):

```
composeChatContext()            ← bağlam penceresi alınır (mesaj eklenmeden)
persistKullaniciMesaji()        ← AKIŞ BAŞLAMADAN yazılır   (kaptan.ts:72)
  ↓ token akışı + tool-loop
finally { persistAsistanMesaji() }  ← üç çıkış yolunun da toplayıcısı (kaptan.ts:127)
```

`finally` bloğu üç durumu birden yakalar: (1) düz yanıt tamamlandı, (2) tur limiti doldu,
(3) **akış ortasında hata / istemci koptu**. Üçüncüsü eskiden hiç yazmıyordu; artık yarım
kalan yanıt da kaydediliyor.

Sıralama önemli: `composeChatContext` kullanıcı mesajı yazılmadan **önce** çağrılır, yoksa
bağlam penceresi mesajı çift sayardı.

**Kalan sınır — dürüst olmak gerekirse:** node'un tam o anda ölmesi hâlâ asistan yanıtını
kaybettirir, çünkü `finally` de çalışmaz. Kazanılan şey, sorunun kaybolmaması: öğrenci
mesajını görür ve tekrar deneyebilir. Tam çözüm token'ları akarken artımlı yazmak olurdu;
her token için bir DB yazımı, kurtardığı şeye değmez.

### 12d. Gece işlerinin worker sayısı kadar tekrarlaması

**Sorun.** `worker2` eklenmeden önce üç kontrol yapıldı (§1). İkisi temizdi; leader lock
kontrolü **gerçek bir hata** çıkardı. Kilit *tur başına* doğru çalışıyordu ama **günlük
tekrarı korumuyordu**, çünkü iki sayı uyuşmuyordu:

| | Değer |
|---|---|
| Tur kilidi TTL | `PX 90_000` = **90 sn** |
| Zamanlayıcı aralığı | `tick % 5` × 60 sn = **300 sn** |

90 < 300 → kilit her turda çoktan düşmüş oluyor, liderlik turlar arasında serbestçe el
değiştiriyor. "Günde bir kez" garantisini veren `lastForgeDay` ise süreç-yerel bir `let`'ti:

```
02:00 turu → worker A kazanır → gece işleri koşar, A.lastForgeDay = bugün
02:05 turu → worker B kazanır → B.lastForgeDay BOŞ → gece işleri TEKRAR koşar
```

4 saatlik gece penceresinde her worker bir kez kazandığı için iş worker sayısı kadar
tekrarlardı. Bedeli teorik değil: `runNightlyFold` aktif kullanıcı başına bir LLM çağrısı
yapar (200 kullanıcıya kadar) ve `student_memory.semantic`'i zaten katlanmış veri üzerine
ikinci kez katlar. (`runNightlyForge` `NIGHTLY_FORGE=off` ile kapalı — katlama değil.)

**Çözüm.** Gün kilidi ortak depoya taşındı: `SET lb:lock:gece:<gün> NX EX 86400`
(`atolye.worker.ts:107`). Kilit **bilerek serbest bırakılmıyor** — kazanan worker gece
işlerinin ortasında ölürse o gece iş yapılmamış olur. Takas bilinçli: katlama ertelenebilir
bir bakım işidir, iki kez koşmak geri alınamaz LLM harcaması ve bozulmuş hafızadır.

Ayrıca iki koruma daha eklendi:
- **Süreç-içi yeniden-giriş kilidi** (`atolye.worker.ts:117`) — `void schedulerTick()`
  ateşle-unut çağrılır; gece işleri dakikalarca sürerken bir sonraki tick aynı süreçte üst
  üste biniyordu. Bu tek worker'da da vardı, sadece görünmüyordu.
- **`compactSweep`'te atomik sahiplik** (`katip.ts`) — `SMEMBERS → SREM → enqueue` sırasında
  `SREM`'in dönüşü atılıyordu; iki tarama üst üste binerse ikisi de aynı kullanıcıyı görüp
  iki compact + iki affect görevi basardı. `SREM` atomiktir ve yalnız üyeyi gerçekten
  kaldırana `1` döner → dönüş artık sahiplik kanıtı. Kümenin kendisi kilit görevi görüyor.

> **Genelleştirilebilir ders:** "Bir lider kilidi koydum" demek yetmez — **kilidin ömrü ile
> korunan işin periyodu uyuşmalıdır.** 90 saniyelik bir kilit, günde bir çalışması gereken
> bir işi koruyamaz. Tek worker varken bu fark hiç ortaya çıkmıyordu.

### 12e. Yoklama ucunun yanlış rate limit sınıfında olması

**Sorun.** `GET /agents/status/:taskId` ucu vardı ama frontend'de hiçbir çağıranı yoktu:
arka plana atılan görevler `202 Accepted` + `taskId` döndürüyor, sonra iz kayboluyordu.
Yönetici "Eval ölçümünü koştur"a basınca ekranda yalnız kesik bir kimlik görüyordu
(`eval görevi kuyruğa alındı: 3f2a1b9c…`) — görevin koştuğunu, bittiğini ya da patladığını
hiçbir yerden öğrenemiyordu.

Hook yazılınca ikinci bir sorun çıktı: **`/agents/*` `llmLimiter` ile mount ediliyordu
(10 istek/dk/kullanıcı).** Bu doğru bir karardı — o yol altındaki uçların çoğu LLM zinciri
tetikler ve orada sınır hız değil faturadır (§5). Ama `status` ucu tek bir `maybeSingle()`
SELECT'tir, sıfır LLM. Yoklama için tasarlanmış bir ucu 10/dk kovasına koymak onu
**kullanılamaz** kılıyordu: 3 sn'de bir yoklama = 20 istek/dk → istemci daha ilk yarım
dakikada 429 alırdı.

**Çözüm — üç parça:**

| Parça | Dosya |
|---|---|
| `useAgentTaskStatus(taskId)` hook'u | `frontend-v2/src/lib/useAgentTaskStatus.ts:82` |
| Eval tetiğine bağlanması + durum göstergesi | `frontend-v2/src/screens/kule/Ayarlar.tsx:352` |
| Ucun ayrı router'a alınıp `standardLimiter`'a taşınması | `agents.routes.ts:127`, `app.ts:112` |

Uç `agentsStatusRouter`'a alındı ve `/agents`'tan **önce** mount edildi — Express sıralı
eşleştiği için aynı desen `/questions/ai` → `/questions`'ta zaten kullanılıyor. Kullanıcı
kapsamı (`.eq('user_id', req.userId!)`) aynen korundu: yoklama ucu olması IDOR kapısını
gevşetmez.

Hook'un iki tasarım kararı ayrıca not edilmeli:
- **`zaman_asimi` ≠ başarısız.** 2 dakika sonra yoklama durur ama bu "görev patladı" demek
  değildir — görev arka planda sürüyor olabilir, yalnız o ekran beklemeyi bıraktı. Metin de
  bunu söyler. Sonsuz yoklama, ölmüş bir worker'ı sonsuza kadar sorgulamak olurdu.
- **Tek hata yoklamayı öldürmez, 404 hariç.** Görev yazıldıktan hemen sonra yoklanırsa ya da
  istek diğer brain node'una düşerse geçici hata görülebilir; sonraki tur düzelir. 404 ise
  kalıcıdır (görev yok ya da başkasının) → orada durulur.

> **Genelleştirilebilir ders:** rate limit sınıfı **uç türüne göre değil, ucun maliyetine
> göre** seçilmeli. "Bu yol altındaki her şey pahalı" varsayımı, altına düşen ucuz bir ucu
> sessizce ölü hale getirebiliyor — uç çalışıyordu, sadece kullanılamıyordu.

**Kod eklenmeyen yerler (bilinçli).** `202 Accepted` + `taskId` döndüren iki uç daha var ve
ikisinin de hâlâ frontend çağrısı yok: `POST /admin/havuz/uretim` (yanıt tipi
`types.admin.ts:407`'de tanımlı ama kullanılmıyor — arayüz planlanmış, yapılmamış) ve
`POST /agents/dispatch`. Hook yeniden kullanılabilir; nereye bağlanacakları
`useAgentTaskStatus.ts` başındaki blokta not edildi. **Varsayımla ekran uydurulmadı** —
özellikle `/agents/dispatch` bağlantısı `Rota.tsx`'i senkrondan asenkrona çevirmek demek
olurdu ve bu bir davranış değişikliğidir.

### Değişikliğin özeti

**Dalga A — API yük paylaşımı (12a, 12b, 12c)**

| Dosya | Ne değişti |
|---|---|
| `deploy/nginx/default.conf` | `brain2` `backup` → aktif; `least_conn`; gzip/statik cache/50M body devralındı; ölü `/ws/` bloğu kaldırıldı |
| `lib/panel-onbellek.ts` | Süreç-içi Map → Redis; `onbellegiDus` asenkron; KEYS yerine SCAN |
| `lib/yetki.ts` | L1 TTL 60 sn → 5 sn; `rosterCache`'e Redis L2; `sinifiUnut` asenkron |
| `agents/kaptan.ts` | `persistTurn` → `persistKullaniciMesaji` (erken) + `persistAsistanMesaji` (`finally`) |
| `routes/admin.routes.ts` | Ops ucu ortak depoyu temizler; KEYS → SCAN |
| `routes/admin-havuz.routes.ts` | 3 × `await onbellegiDus()` |
| `routes/sinif.routes.ts`, `teacher.routes.ts`, `admin-yonetim.routes.ts` | 9 × `await sinifiUnut()` |

**Dalga B — Worker ölçeklendirme (12d)**

| Dosya | Ne değişti |
|---|---|
| `docker-compose.yml` | `worker2` servisi eklendi (worker ile birebir aynı; aynı Redis db 1) |
| `workers/atolye.worker.ts` | `lastForgeDay` → Redis gün kilidi (`GECE_KILIDI`); süreç-içi yeniden-giriş kilidi |
| `agents/katip.ts` | `compactSweep`: `SREM` dönüşü sahiplik kanıtı |

**Dalga C — İstemci polling (12e)**

| Dosya | Ne değişti |
|---|---|
| `frontend-v2/src/lib/useAgentTaskStatus.ts` | **Yeni** — yoklama hook'u (3 sn / 2 dk tavan / unmount temizliği) |
| `frontend-v2/src/screens/kule/Ayarlar.tsx` | Eval tetiği hook'a bağlandı + durum göstergesi |
| `routes/agents.routes.ts` | `agentsStatusRouter` ayrı router olarak dışa açıldı |
| `app.ts` | Yoklama ucu `/agents`'tan önce, `standardLimiter` ile mount edildi |

### Doğrulama

| Kontrol | Sonuç |
|---|---|
| `tsc --noEmit` (backend) | Temiz |
| `eslint src` (backend) | 0 hata (11 uyarı — hepsi dokunulmayan dosyalarda, önceden vardı) |
| `bun test src` | 158/158 geçti |
| `vite build` (frontend) | Başarılı |
| `docker-compose.yml` YAML | Parse edildi; 7 servis; `worker`/`worker2` alanları birebir eşit |

**Yapılamayan doğrulama — dürüstlük payı.** Docker Desktop kapalı olduğu için hiçbir şey
canlı ayağa kaldırılmadı: `nginx -t`, iki worker'ın gerçekten iş paylaştığı, gün kilidinin
tek koşum bıraktığı ve yoklamanın 429 almadığı **ölçülmedi**. Ayağa kalkınca sırasıyla:

```bash
docker compose up -d
docker compose exec nginx nginx -t                    # config sözdizimi
docker compose logs worker worker2 | grep "gece işleri"  # tek satır çıkmalı
docker compose logs brain brain2 | wc -l              # yük gerçekten paylaşılıyor mu
```

Ayrıca frontend'de `typescript` ve `eslint` **kurulu değil** (`npm run lint` de çalışmıyor);
tek doğrulama yolu `vite build`. Tip hatası yakalayan bir kapı yok — ayrı bir iş olarak
kurulması gerekir.

---

## Sunumda vurgulanabilecek tasarım kararları

### Mevcut mimariden üç karar

**1. "Postgres = hakikat, Redis = hot-path" ayrımı tutarlı biçimde uygulanmış.**
Kuyruk çift yazımlı (§6), önbellekler cache-aside (§8), Redis arızası fail-open (§10).
Tek bir ilkenin on ayrı yerde aynı şekilde uygulanması, mimarinin en güçlü yanı.

**2. Rate limiting anahtarının IP'den userId'ye taşınması.**
Küçük bir değişiklik gibi görünür ama iki ayrı ciddi açığı birden kapatır (§5) — ve ters
vekil arkasında `req.ip`'nin ne anlama geldiğini bilmeyi gerektirir. Somut bir "neden"
anlatısı olduğu için sunumda iyi durur.

**3. Aynı Redis'e üç farklı bağlantı profili.**
"Bir bağlantı havuzu kurdum" değil, "istek yolu ile worker'ın dayanıklılık ihtiyacı zıttır"
tespiti (§10). Ölçülmüş arızalara dayanıyor: `enableOfflineQueue` ayarı yüzünden sohbetin
tamamen donması, `SCRIPT LOAD` yüzünden sürecin açılışta ölmesi.

### En güçlü tek konu: §12

**"Load balancer'a ikinci node eklemek tek satır"** diye başla, sonra o tek satırın kodda
kaç yeri birden bozduğunu göster. Anlatı doğal olarak üç perdeye bölünüyor ve her perde bir
sistem tasarımı kavramını somutluyor:

| Perde | Kavram | Görünen hata |
|---|---|---|
| A · `brain2` aktif | Caching, eventual consistency | Yönetici düğmeye basıyor, panelde sayı değişmiyor — **bazen** |
| B · `worker2` eklendi | Leader election | Gece işleri iki kez koşuyor, LLM faturası iki katına çıkıyor |
| C · Yoklama eklendi | Rate limiting | Uç çalışıyor ama 429 veriyor; kullanılamıyor |

Anlatının can alıcı noktası şu: **hiçbiri yeni yazılan kodda değildi.** Üçü de çalışan,
doğru yazılmış, hatta yorumlarında gerekçesi belgelenmiş koddu — tek süreç olduğu sürece
doğruydular. Yatay ölçeklendirmenin gerçek maliyeti altyapıda değil, **durum yönetiminde.**

Sunumda üç cümlelik ders olarak toplanabilir:

1. **Düşürülebilir olması gereken önbellek ortak depoda olmalı.** Süreç-yerel bir cache
   ancak birkaç saniyelik burst emici olabilir — çünkü onu düşürmenin garantisi yoktur,
   yalnız beklemenin garantisi vardır. (12a)
2. **Kilidin ömrü, korunan işin periyoduyla uyuşmalı.** 90 saniyelik bir lider kilidi, günde
   bir çalışması gereken bir işi koruyamaz. (12d)
3. **Rate limit sınıfı ucun türüne göre değil, maliyetine göre seçilmeli.** "Bu yol altındaki
   her şey pahalı" varsayımı, altına düşen ucuz bir ucu sessizce ölü hale getirir. (12e)

---

## Kavram bazlı hızlı referans

```
Yatay ölçeklendirme   docker-compose.yml:47,76,114,136 · lib/oturum.ts:1-25 · agents/bus.ts:169
Load balancing        deploy/nginx/default.conf:19-23,64
Failover              default.conf:21,75 · model-router.ts:78,687 · atolye.worker.ts:47
Circuit breaker       model-router.ts:441,451,459,494,532
Rate limiting         default.conf:7,57 · rateLimit.ts:8,53,71,85 · model-router.ts:315,337,343
                      app.ts:112-113 (yoklama ucunun limiter ayrımı)
Message queue         agents/bus.ts:93,146,171,182,221 · atolye.worker.ts:114
Leader election       atolye.worker.ts:27,107,117,119-159
Caching               desk.ts:13,23,56 · rag.ts:63,94 · yetki.ts:64,91,223,233 · panel-onbellek.ts:31,35
Eventual consistency  bus.ts:113-128 · answers.ts:235-254 · yetki.ts:64-65 · kaptan.ts:72,127
Graceful degradation  clients/redis.ts:45-50,109,122 · rateLimit.ts:35 · oturum.ts:16-20
Polling               atolye.worker.ts:170,179 · bus.ts:247 · agents.routes.ts:127
                      useAgentTaskStatus.ts:82 · Ayarlar.tsx:352 · app.ts:112
Çok-node düzeltmeleri
  · Dalga A (önbellek)  panel-onbellek.ts:31,59 · yetki.ts:64,223,278 · admin.routes.ts:308
  · Dalga A (SSE)       kaptan.ts:72,127,149,168
  · Dalga B (worker2)   docker-compose.yml:136 · atolye.worker.ts:107,117 · katip.ts (SREM)
  · Dalga C (polling)   useAgentTaskStatus.ts:82 · Ayarlar.tsx:352 · app.ts:112
```

> **Satır numaraları hakkında:** hepsi 2026-08-09'da çalıştırılarak doğrulandı, ama kod
> değiştikçe kayarlar. Sunumdan önce özellikle sık dokunulan dosyalarda (`model-router.ts`,
> `atolye.worker.ts`) bir kez daha bakmakta fayda var.
