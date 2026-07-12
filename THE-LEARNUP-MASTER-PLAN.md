# THE LEARNUP MASTER PLAN
### Tek Persona, Çok Beyin — Premium Kalite Odaklı Ajan Mimarisi

> **Vizyon:** Mevcut kullanıcı tabanında **olabilecek en akıllı, en kaliteli, en premium** adaptif YKS koçu. Ölçek makineleri değil, zeka kalitesi. Sade ama taş gibi sağlam altyapı.
>
> **Statü:** Bu doküman `YKS-BEYIN-SISTEM-MIMARISI.md`'nin ajan/orkestrasyon bölümlerini (§7–8) **supersede eder**. Veri katmanı (§4), RAG (§5) ve model notları (§9) geçerliliğini korur.
>
> **Tasarım mantrası:** *Deterministik çekirdek, LLM kenarlar, tek ses.* Matematik olabilen her şey matematiktir. LLM yalnız üç yerde harcanır: **dil** (Kaptan), **teşhis** (Atlas/Nabız), **damıtma** (Kâtip). Ve kalite bütçesi küçük kullanıcı tabanının lüksüdür: kişi başına *daha çok* zeka, sistem genelinde *daha az* israf.

---

## 0. Kilitli Kararlar

| # | Karar |
|---|---|
| 1 | **Tek merkezi Bun backend** (`learnup-brain`) — 16 eski Edge Function route olarak içeride; Deno Edge Functions emekli |
| 2 | **Ücretsiz OpenRouter modelleriyle** çalışır (`:free` slug + paid fallback); ilk aksiyon: $10 tek seferlik yükleme → 1000 istek/gün |
| 3 | **Tek persona:** öğrenci yalnız **Kaptan** ile konuşur; uzmanlar görünmez |
| 4 | **Ölçek hedefi rafta** — mimari mevcut tabanda maksimum kaliteye optimize; ileride ölçek = replika + config, kod değil |
| 5 | Postgres (Supabase) = tek hakikat · Redis = atılabilir hızlandırıcı · LLM = bütçeli kıt kaynak |
| 6 | **Kaynak ayrımı ürün kuralı:** Gerçek ÖSYM çıkmış sorular ↔ AI üretimi sorular **DB düzeyinde `source_type` enum'uyla** kesin ayrılır. Çıkmış sorular arayüzde **"ÖSYM ÇIKMIŞ SORU"** etiketiyle özel gösterilir; adaptif testler **yalnız** `ai_generated` (çıkmışlardan beslenerek üretilmiş + doğrulanmış) soru servis eder. `source_type` insert sonrası **değiştirilemez** (trigger korumalı) |

---

## 1. Katman Modeli

```
┌─ SİNYAL (algı) ─────────────────────────────────────────────────┐
│  Saf fonksiyonlar, cevap-başına, sıfır LLM: gecikme z-skoru,     │
│  hata serisi, tuzak isabeti, yorgunluk işaretleri                 │
└───────────────┬──────────────────────────────────────────────────┘
                ▼
┌─ BİLİŞ (4 görünmez beyin) ──────────────────────────────────────┐
│  ATLAS          PUSULA         NABIZ          KÂTİP              │
│  bilişsel harita strateji       duygu/motivasyon hafıza yazıcısı  │
│  + yanılgı teşhisi + taktik     + yük tavanı    + damıtma         │
│         her biri Koç Masası'na TEK kompakt brief yazar            │
└───────────────┬──────────────────────────────────────────────────┘
                ▼
┌─ SES (tek persona) ─────────────────────────────────────────────┐
│  KAPTAN — masayı okur, öğrenciye dokunan HER kelimeyi o söyler   │
└───────────────┬──────────────────────────────────────────────────┘
                ▼
┌─ ATÖLYE (kas — worker süreci) ──────────────────────────────────┐
│  Tüm async işler: soru demirhanesi, teşhis, plan, damıtma, nudge │
└──────────────────────────────────────────────────────────────────┘
```

**Ajan-olmayanlar (bilinçli):** Gamification (`lib/gamification.ts` — XP/seri/görev/rozet/lig) %100 deterministik kalır, **asla** ajan olmaz. Sinyal katmanı saf fonksiyondur. Atölye bir roldür, zeka değil.

---

## 2. Ajan Kadrosu

### 2.1 KAPTAN — Yüz (ses katmanı)

| Alan | Değer |
|---|---|
| **Tek sorumluluk** | Öğrenci-yüzlü her cümle: chat (SSE), nudge metinleri, plan anlatımı. **Hesaplamaz — masayı okur, konuşur.** |
| **Girdi** | Koç Masası (4 brief), sohbet penceresi + katmanlı hafıza (§4.3), bugünün roadmap adımı |
| **Çıktı** | SSE token'ları → `chat_messages`; nudge → `nudges` → `notifications` |
| **Model** | `deepseek/deepseek-chat-v3-0324:free` → fallback `meta-llama/llama-3.3-70b-instruct:free` → paid `deepseek/deepseek-chat` |
| **Tetik** | On-demand (chat), nudge render |
| **Araçlar** | `get_student_snapshot`, `generate_practice`, `save_to_canvas`, `load_from_canvas` (mevcut) + `request_plan_update`, `recall_memory` (yeni) |

**Örnek karar:** Öğrenci "bugün ne çalışsam?" yazar → Kaptan **masadaki `pusula_brief`'ten, sıfır tool çağrısıyla** cevaplar: *"Planında türev-zincir kuralı var; dün 3 kez aynı tuzağa düşmüşsün — 5 soruluk ısınma hazırlayayım mı?"* Öğrenci evet derse `generate_practice` (havuzdan, 0 üretim çağrısı).

**Persona sözleşmesi** (`src/persona/kaptan.charter.ts`, tek export):
- Ses: samimi ama net, kısa, eyleme dönük, asla suçlayıcı, emoji ölçülü.
- Brief metabolizması: **Nabız tonu belirler, Atlas içeriği belirler, Pusula önceliği belirler, Kâtip geçmişi hatırlatır.**
- Yasaklar: cevabı doğrudan verme (koçluk yap), tıbbi/psikolojik teşhis dili, boş motivasyon klişesi.
- `speakAsKaptan(userId, intent, payload)` (`src/persona/voice.ts`): chat dışında öğrenci-yüzlü metnin **tek** üreticisi. Uzmanlar asla kendi cümlesini kurmaz.

### 2.2 ATLAS — Bilişsel Haritacı (kalite yatırımının merkezi)

| Alan | Değer |
|---|---|
| **Tek sorumluluk** | Öğrenci başına bilgi grafiği: kazanım-düzeyi ustalık + **kavram yanılgısı (misconception) teşhisi ve kapanış takibi** |
| **Graf** | Yeni graf deposu YOK: `curriculum_nodes` (ltree) = topoloji; yeni **`user_mastery`** = öğrenci overlay'i; `prereq_paths ltree[]` = önkoşul kenarları |
| **Girdi** | `user_logs` (kanonik telemetri), `distractor_traps` RPC, `retrieveGrounding` (RAG), soru çözümleri |
| **Çıktı** | `user_mastery` (mastery + misconceptions jsonb), `student_memory.briefs.atlas`, Pusula'ya `plan` görevi |
| **Model** | Teşhis: `deepseek/deepseek-r1:free` (muhakeme şart) → paid r1. Ustalık matematiği: **LLM yok** |
| **Tetik** | Cevap-başına (sync, saf matematik) · tuzak eşiği (2. isabet — kalite modunda erken teşhis) · haftalık tarama |

**Deterministik çekirdek — BKT-lite** (`lib/mastery.ts`, `record-answer` akışında sync):
```
expected = m·(1−slip) + (1−m)·guess        # guess=0.2 (5 şık), slip=0.1
m'       = m + K·(outcome − expected)       # K=0.15; yerleştirmede K=0.3
m_eff    = m·exp(−days/(7·(1+stability)))   # okuma anında tembel zaman-çürümesi
```
Doğru-ama-2×-yavaş cevap yarım kredi alır. `weak_kazanimlar` RPC aynı imzayla `user_mastery`'den (çürüme-farkındalıklı) yeniden yazılır.

**Yanılgı adli analizi — premium teşhis boru hattı** (`diagnose` görevi, Atölye'de):

1. **Kanıt paketi topla** (deterministik): aynı `(kazanim, selected_option)` tuzağının son 3+ isabeti — soru metinleri, öğrencinin şıkları, süreler, o kazanımın grounding chunk'ları (RAG), önkoşul kazanımların m_eff'leri.
2. **r1 bağımsız teşhis** (1 çağrı, JSON): soruları **sıfırdan çözer**, öğrencinin yanlış şıkkını her soruda hangi zihinsel adımın üreteceğini geriye doğru izler → yanılgı hipotezi.
3. **Taksonomiye bağla** — çıktı şeması:
```json
{
  "misconception_id": "ic_turev_ihmal",
  "taxonomy": "prosedur_atlama",          // islem_hatasi | kavram_karismasi | prosedur_atlama | temsil_hatasi | onkosul_bosluk
  "evidence": "3 soruda da dış fonksiyon türetilmiş, iç türev çarpanı yok",
  "confidence": 0.85,
  "prereq_hypothesis": "matematik.fonksiyonlar.bileske",   // ltree path | null
  "remediation": { "review_kazanim": "bileske_fonksiyon", "then_microset": {"kazanim": "zincir_kurali", "count": 4, "difficulty": "kolay"} },
  "student_facing_hint": "İçteki fonksiyonun türevini çarpmayı unutuyorsun"
}
```
4. **Yaz + yankıla:** `user_mastery.misconceptions[]`'a ekle (status: `open`), `atlas_brief` tazele, Pusula'ya remediation önerisiyle `plan` görevi at.
5. **Kapanış doğrulaması** (kalitenin imzası): remediation seti çözüldükten sonra Atlas aynı tuzak tipinde 3 soruyu izler → 3/3 temiz ise misconception `resolved` (tarihçesiyle saklanır — Kaptan "geçen hafta kırdığın tuzak" diyebilir), değilse `persists` + bir kademe derin remediation (önkoşulun önkoşulu).

**Örnek karar:** *"Zincir kuralında 3× şık-B (iç türev ihmali) + bileşke fonksiyon m_eff 0.38 → taxonomy=prosedur_atlama, confidence 0.85 → Pusula'ya: önce 4 soruluk bileşke tekrarı, zincir kuralını 2 gün ertele. 5 gün sonra kapanış: 3/3 → resolved."*

### 2.3 PUSULA — Stratejist

| Alan | Değer |
|---|---|
| **Tek sorumluluk** | Çalışma planı + ÖSYM sınav taktiği = tek optimizasyon: *sınav gününe kadar saat başına beklenen net kazancını maksimize et* |
| **Girdi** | `user_mastery` (+ `v_mastery_rollup` view), `osym_blueprint`, SRS vadesi gelenler, makro-test pacing telemetrisi, `nabiz_brief` yük tavanı, hedef/sınav tarihi (`student_memory.semantic`) |
| **Çıktı** | `roadmaps.steps` (zengin şema), `briefs.pusula`, ince havuz hücreleri için `forge_topup` görevleri, opsiyonel `nudge` |
| **Model** | Deterministik optimizer (**LLM yok**) + **1** anlatım çağrısı `chat-v3:free` |
| **Tetik** | Gece cron · makro-test bitişi · Atlas remediation sinyali · Kaptan `request_plan_update` |

**Mevcut 8-turlu LLM tool-loop ÖLÜR.** Yerine deterministik optimizer (`lib/planner.ts`):
```
skor(kazanım) = blueprint_ağırlığı × (1 − m_eff) × aciliyet(sınava_gün) × srs_vade_katsayısı
```
Greedy blok seçimi + **serpiştirme** (her blok: 1 zayıf kazanım + 1 SRS tekrarı + 1 komşu-konu; hedef %70-80 başarı = arzu edilen zorluk) + Nabız yük tavanı (yorgun → yalnız mikro bloklar). Sonra **tek** LLM çağrısı planı Kaptan'ın anlatacağı `pusula_brief`'e dönüştürür.

`roadmaps.steps` şeması: `{day, blocks:[{kazanim_id, kind: yeni|tekrar|srs|remediation, count, difficulty}], tactic_notes}`.

**Örnek karar:** *"Sınava 240 gün; TYT Mat 40 soru × m_eff 0.35 → matematik net-kazanç lideri. Bu hafta 3 mat + 2 fizik bloğu. Son deneme: geometri ort. 3.1 dk/soru (hedef 1.6) → taktik notu: '90 saniye kuralı — işaretle, geç'."*

### 2.4 NABIZ — Empati Nöbetçisi

| Alan | Değer |
|---|---|
| **Tek sorumluluk** | Öğrencinin *nasıl hissettiğini* bilmek → koçluk duruşu + bilişsel yük tavanı |
| **Girdi** | Sinyal özellikleri (Redis rolling-20), son oturum `chat_messages`, seri/görev durumu |
| **Çıktı** | `briefs.nabiz` + Redis `lb:affect:{uid}` (TTL 24h), `nudge` görevleri, Pusula'nın `load_cap`'i |
| **Model** | `meta-llama/llama-3.1-8b-instruct:free` (JSON sınıflama) |
| **Tetik** | Oturum-sonu · chat mesajında duygu içeriği (kalite modunda kapı **liberal**: şüphede sınıflandır) |

Heuristik-önce (`lib/affect.ts`): hata serisi ≥4, gecikme z>2 (yorgunluk) veya z<−2 + hatalar (tahmin/acele), rage-quit (<30sn), gece yarısı çalışması, seri kırılma günü. Kural ateşlenince veya chat duygusal içerik taşıyınca LLM sınıflar:
`{state: motive|nötr|hüsran|kaygı|tükenmiş, evidence, coaching_stance, load_cap}`.

**Örnek karar:** *"Son 8 cevapta 6 yanlış, süreler 2.1×, saat 23:40 → tükenmiş → masaya: 'bu akşam yeni konu YOK; ton: şefkatli' + sabah nudge'ı: 'Dün zor bir geceydi — bugün 10 dakikalık garantili galibiyetle başlıyoruz 💪'"*

### 2.5 KÂTİP — Hafıza Yazıcısı (premium hafızanın motoru)

| Alan | Değer |
|---|---|
| **Tek sorumluluk** | Sıkıştırma + hatırlama altyapısı: episodik → semantik damıtma, brief tazeleme, anı endeksi |
| **Girdi** | `chat_messages`, `user_logs` agregatları, eski `session_summaries` |
| **Çıktı** | `session_summaries` (+ **768d embedding** — anı endeksi), `student_memory.semantic`, Redis desk |
| **Model** | FAST `:free` (özet); embedding `openai/text-embedding-3-small@768` (OpenRouter, cache'li) |
| **Tetik** | Oturum-sonu (10 dk debounce) · gece katlama |

- **Oturum-sonu:** istatistik (deterministik) + sohbet dökümü (LLM) → ≤5 maddelik özet → `session_summaries` + embedding.
- **Gece:** son 7 günün özetlerini `semantic`'e katlar — hedef üniversite, program kısıtları, kişisel gerçekler ("sabah insanı", "abisi de YKS'ye girmiş"). Kalıcıları terfi ettirir, bayatları emekli eder, çelişkileri revize eder.
- Her brief ≤300 token; masa toplamı ≤1200.

**Örnek karar:** *"Sohbette 'hedefim Boğaziçi Bilgisayar' geçti → semantic'e terfi. 3 hafta önceki 'fizikten nefret ediyorum' kaydı, doğruluk %48→%71 olduğu için 'gelişen ilişki' olarak revize."*

---

## 3. Tek-Persona Orkestrasyonu

**Sözleşme: uzmanlar brief yazar; yalnız Kaptan kelime yazar.**

1. **Koç Masası:** kalıcı hakikat `student_memory.briefs` jsonb `{atlas, pusula, nabiz, katip}`; sıcak kopya Redis `lb:desk:{uid}` (TTL 48h, her brief yazımında tazelenir). Brief'ler Kaptan *için*, öğrenci *hakkında* kompakt Türkçe markdown.
2. **Ses tutarlılığı mekanizması:** tek system-prompt kaynağı (charter) + tek renderer (`speakAsKaptan` / `streamKaptan`). Uzman çıktıları yapısal (JSON/brief) — asla düzyazı.
3. **Sıfır ön-uçuş:** masa gece hazırlandığı için interaktif sohbet çoğunlukla 0 tool çağrısıyla, tek LLM turuyla akar.
4. Plan bile Kaptan'ın sabah mesajı olarak görünür ("Bugünkü rotamız…") — plan anında bir kez render edilir, cache'lenir.

---

## 4. Bellek Mimarisi

### 4.1 Üç katman

| Katman | İçerik | Depo | Ömür |
|---|---|---|---|
| **Working** | sinyal penceresi, sohbet penceresi, affect, masa, gün-içi bağlam | Redis (`lb:*`) | dk–48h; **tamamı PG'den yeniden kurulabilir** |
| **Episodic** | `user_logs`, `chat_messages`, `session_summaries` | Postgres | özet sonrası ham sohbet >30g budanabilir |
| **Semantic** | `user_mastery` (bilişsel graf), `student_memory` (gerçekler + brief'ler), `roadmaps` | Postgres | Kâtip küratörlüğünde, sınırsız büyümez |

### 4.2 Redis anahtar şeması

| Anahtar | İçerik | TTL |
|---|---|---|
| `lb:desk:{uid}` | Koç Masası (4 brief) | 48h |
| `lb:signals:{uid}` | son-20 cevap özelliği (rolling) | 24h |
| `lb:chatwin:{uid}` | son 12 sohbet turu | 24h |
| `lb:affect:{uid}` | Nabız durumu | 24h |
| `lb:ctx:{uid}` | gün-içi bağlam (mevcut `user:{id}:context`'in yeni adı) | 24h |
| `lb:emb:{sha256}` | embedding cache | 30g |
| `lb:llm:*` | model bütçe sayaçları | ≤48h |
| `lb:tasks`, `lb:events:{taskId}` | görev uyandırma sinyalleri | MAXLEN / 1h |

### 4.3 Kaptan'ın çok-turlu akıllı hafızası (premium odak)

Sohbet bağlamı **dört halkalı** kurulur (`lib/desk.ts → composeChatContext(userId, sessionId)`):

```
[1] Charter + Koç Masası (stabil prefix → sağlayıcı-taraf otomatik cache)
[2] Semantik gerçekler (student_memory.semantic — hedef, kısıtlar, kişisel bağlam)
[3] Oturum-içi tam pencere: son 12 tur ham (lb:chatwin) +
    daha eskisi Kâtip'in oturum-içi ara özeti (uzun sohbette pencere kaymaz, ANLAM kaymaz)
[4] Episodik anı çağırma (recall): kullanıcının mesajı embed edilir →
    match_session_memories(user_id, query_embedding, 3) → ilgili geçmiş-oturum anıları
    ("Geçen salı zincir kuralında iç türevi unutuyordun — bugün o tuzağı kırmışsın 👏")
```

- Halka 4 = `session_summaries.embedding` üzerinde pgvector eşleşmesi; yeni RPC `match_session_memories(p_user_id, query_embedding vector(768), match_count)`. Embedding cache sayesinde marjinal maliyet ≈ 0.
- `recall_memory` aynı zamanda Kaptan'a **tool** olarak da verilir: "hatırlıyor musun, geçen ay ne demiştim?" → Kaptan bilinçli arama yapabilir.
- Thread modeli: `chats` = başlık/oturum defteri, `chat_messages.chat_id` (nullable FK) = mesajlar. Öğrenci eski konuşmaya dönerse Kâtip özeti + o thread'in son turları hydrate edilir.
- Disiplin: interaktif prompt ≤4k token; masa ≤1200; pencere 12 tur.

---

## 5. Altyapı — Sade ama Taş Gibi

### 5.1 Süreç topolojisi: 2 süreç, nokta.

| Süreç | Giriş | Rol |
|---|---|---|
| **api** | `src/server.ts` | HTTP + SSE. Stateless. Express 4 kalır (darboğaz LLM/PG, framework değil). `keepAliveTimeout=65s`, `requestTimeout=0` (SSE reaplenmez) |
| **worker** | `src/workers/atolye.worker.ts` (ritim rename) | `lb:tasks` consumer'ı + **gömülü zamanlayıcı** (node-cron): gece görevleri, kapanış kontrolleri, 5-dk bekçi |

Redis'siz zarif düşüş: `enqueueTask` her koşulda PG'ye `PENDING` yazar; Redis yoksa görev in-process (eşzamanlılık 2) çalışır. **Sıfır bellek kaybı iddiasının tamamı: Postgres hiç yazılmamazlık etmez; Redis'teki her şey ya cache ya sinyaldir.**

### 5.2 Görev omurgası — Streams sinyal, PG hakikat

- Stream `lb:tasks`, group `atolye`, consumer `w-{host}-{pid}`. Görev kinds: `forge_topup · plan · diagnose · affect · compact · nudge · closure_check`.
- **Idempotency (sağlamlık, ölçek değil — kalır):** `agent_tasks` + `attempts/locked_by/locked_at`; worker CAS-claim (`UPDATE ... WHERE status='PENDING' OR (RUNNING AND locked_at < now()-'2 min') RETURNING`); CAS kaybeden teslimat sessizce ACK. Üretim insert'lerinde `md5(question_text)` partial-unique dedup.
- **Bekçi (janitor) — tek basit iş,** 5 dk'da bir (zamanlayıcıda): bayat `RUNNING` → `PENDING` + re-XADD; `attempts≥3` → `FAILED` (log'la, bitir). *Dead-letter stream'i, admin replay route'u, XINFO backpressure, lag ölçümü — YOK. Mevcut tabanda kuyruk derinliği zaten ~sıfır.*

### 5.3 Sıfır-timeout

- **Chat:** SSE + 15 sn heartbeat + `X-Accel-Buffering: no`. Kopan istemcide tamamlanan mesaj yine `chat_messages`'a persist → reconnect refetch.
- **Uzun işler:** `POST /api/v1/agents/dispatch` → 202 + taskId; sonuç **Supabase Realtime on `agent_tasks`** (publication + owner-RLS; frontend'de Supabase client zaten var) + polling fallback `GET /api/v1/agents/tasks/:id`.
- **`delegateAndAwait` terhis:** ajan tool'ları LLM'e anında `{taskId, status:'queued'}` döner; Kaptan "hazırlıyorum, bitince haber vereceğim" der. 60 sn'lik bloklu tur ölür.
- Her OpenRouter çağrısı `AbortSignal.timeout`: 45s üretim · 120s r1 · 20s embed.

### 5.4 Model yönlendirici — `src/lib/model-router.ts` (models.ts'i emer)

```
route(role) → zincir dene: [birincil :free, alternatif :free, PAID]
her deneme: devre-kesici → dakika penceresi → günlük sayaç
```
- Dakika penceresi: `INCR lb:llm:win:{dakika}` — 18'de kes (20/dk'ya 2 tampon).
- Günlük sayaç: `INCR lb:llm:day:{gün}` — 1000/gün ($10 sonrası). Kaba amaç-bölüşümü: **chat/teşhis/damıtma ~600 · gece üretim ~350 · yedek 50.** Mevcut tabanda bu, kişi başına *cömert* bir zeka bütçesidir — kalite modunun anlamı bu.
- Devre-kesici: `lb:llm:cb:{slug}` — 429/5xx'te 30 sn→5 dk üstel soğuma; açıkken zincirde sonraki slug.
- **Zincir daima paid slug'da biter** (~$0.001/chat-turu): öğrenci sohbet ortasında asla hata görmez.
- Prompt prefix disiplini: statik system → RAG → değişken öğrenci bağlamı (sağlayıcı-taraf otomatik cache isabeti).
- **Havuz-önce yasası:** pratik/test servisi **0 LLM** (doğrulanmış `yks_questions`'tan, kullanıcının görmediklerinden). Canlı üretim yalnız havuz boşsa son çare. Gece demirhanesi (`topup-planner`, 02:00–06:00 TSİ) ince hücreleri doldurur — `generateVerifiedSet` (GENERATE→**r1 bağımsız çöz**→REPAIR→TOPUP) aynen; kalite kapısından geçmeyen soru havuza yazılmaz.
- **Kaynak ayrımı yasası (ürün kuralı #6):** adaptif montaj (`assembleSegment`, `buildMicro/Meso/MacroTest`, `practice/next`) **her zaman** `source_type = 'ai_generated' AND verified` filtresiyle okur — çıkmış soru adaptif havuza asla karışmaz. Çıkmış sorular ayrı serviste yaşar: **"Çıkmış Sorular" modu** (`GET /api/v1/questions/osym?subject=&year=`) yalnız `source_type = 'osym_cikmis'` döner; API yanıtındaki her soru objesi `source_type` alanını taşır → frontend `osym_cikmis` gördüğünde **"ÖSYM ÇIKMIŞ SORU"** rozetini basar. Demirhane (forge) yalnız `ai_generated` yazabilir (kolon default + değişmezlik trigger'ı); `yks_exemplars` korpusu çıkmış soruların *üslup/few-shot kaynağı* olmaya devam eder — yani AI sorular tam da istendiği gibi çıkmışlardan beslenir ama asla onlarla karışmaz.

### 5.5 Arıza modları

| Arıza | Davranış |
|---|---|
| Free LLM 429/kota | Kesici → sonraki slug → paid. Pratik etkilenmez (havuz) |
| Tüm LLM'ler çökük | Chat kibar Türkçe hata (SSE `error`); pratik/test/gamification/bahçe tam çalışır; görevler backoff'la bekler |
| Redis çökük | API tam servis; ajanlar in-process; veri kaybı yok (PG-önce) |
| Supabase çökük | 503 — tek hakikat deposu; dönünce bekçi PG'den kuyruk durumunu toparlar |
| Worker crash | ≤5 dk'da bekçi görevi geri kuyruğa alır; CAS + dedup çift işi önler |

### 5.6 Deploy

Tek VPS (~$5-15/ay): Docker Compose — `api` (bun) + `worker` (bun) + `redis:8-alpine` (AOF açık) + Caddy TLS. Supabase hosted. Hepsi bu. *(İleride ölçek gerekirse: api/worker replika + Redis HA + router config — kod değişmez.)*

---

## 6. Veritabanı Hükümleri

**Tek Supabase projesi.** Brain migration'ları (0001+0003, henüz uygulanmadı) üç cerrahi düzeltmeyle uygulanır — 0001 aynen DEĞİL:

| Brain tablosu | App tablosu | Hüküm |
|---|---|---|
| `user_activities` | `user_logs` | **user_activities 0001'den SİLİNİR.** `user_logs` kanonik (frontend bugün yazıyor); `ALTER` ile `duration_ms`, `selected_option` eklenir. Sinyal/mastery/RPC'ler user_logs okur. İki cevap tablosu = çatallı telemetri garantisi — yasak |
| `chat_messages` | `chats` | İkisi de: `chats` = thread başlığı; `chat_messages.chat_id` nullable FK |
| `agent_tasks` | `ai_jobs` | `agent_tasks` kanonik; `ai_jobs` donar |
| `yks_questions` | `questions` | İkisi de (AI-doğrulamalı havuz ↔ legacy içerik); havuz-önce `yks_questions` okur. **Her ikisine de `source_type` enum'u eklenir** (osym_cikmis · ai_generated · ogretmen); gerçek çıkmış sorular `yks_questions`'a `source_type='osym_cikmis'` + `exam_year/exam_label` künyesiyle ingest edilir |

**Migration seti** (Supabase CLI, sıralı):
- `0001_init.sql` *(düzeltilmiş: user_activities çıkarıldı)* + `0003_functions.sql`
- **`0004_unification.sql`:** `user_logs` ALTER'ları · `record_answer(...)` RPC (user_logs + srs_cards + gamification **atomik** — supabase-js transaction yapamaz, çoklu-yazım invariantı RPC'ye iner) · `agent_tasks` kilit kolonları · Realtime publication (`agent_tasks`) · md5 dedup index · `chat_messages.chat_id` · **soru kaynak ayrımı (ürün kuralı #6):**
```sql
-- ── Kaynak ayrımı: çıkmış soru ↔ AI üretimi (ENUM korumalı) ──────────────
create type question_source as enum ('osym_cikmis', 'ai_generated', 'ogretmen');

alter table yks_questions add column source_type question_source not null default 'ai_generated';
alter table questions     add column source_type question_source not null default 'ai_generated';

-- Legacy backfill (app questions): AI üretimi işaretliyse ai_generated, değilse öğretmen içeriği
update questions set source_type =
  case when is_ai_generated then 'ai_generated'::question_source
       else 'ogretmen'::question_source end;

-- Çıkmış soru künyesi (yalnız osym_cikmis satırlarında dolu)
alter table yks_questions
  add column exam_year  smallint,                    -- örn. 2023
  add column exam_label text;                        -- örn. 'TYT' / 'AYT-Matematik'
alter table yks_questions add constraint yq_osym_meta_chk
  check (source_type <> 'osym_cikmis' or (exam_year is not null and exam_label is not null));

-- KORUMA: source_type insert sonrası DEĞİŞTİRİLEMEZ (AI→çıkmış sahteciliği imkânsız)
create or replace function forbid_source_type_change() returns trigger
language plpgsql as $$
begin
  if new.source_type is distinct from old.source_type then
    raise exception 'source_type değiştirilemez (%.% → %)', tg_table_name, old.source_type, new.source_type;
  end if;
  return new;
end $$;
create trigger yq_source_immutable before update on yks_questions
  for each row execute function forbid_source_type_change();
create trigger q_source_immutable  before update on questions
  for each row execute function forbid_source_type_change();

-- Servis indeksleri: iki dünya ayrı yollardan okunur
create index yq_serve_ai   on yks_questions (kazanim_id, difficulty)
  where verified and source_type = 'ai_generated';
create index yq_serve_osym on yks_questions (subject, exam_year desc)
  where source_type = 'osym_cikmis';
```
- **`0005_agents.sql`:**
```sql
create table user_mastery (
  user_id uuid not null, node_id bigint not null references curriculum_nodes(id),
  mastery real not null default 0.25, stability real not null default 0,
  attempts int not null default 0, correct int not null default 0, avg_latency_ms int,
  srs_box smallint not null default 0, srs_due_at timestamptz,
  misconceptions jsonb not null default '[]',   -- [{id, taxonomy, confidence, status: open|resolved|persists, opened_at, closed_at, evidence}]
  updated_at timestamptz not null default now(),
  primary key (user_id, node_id));

create table student_memory (
  user_id uuid primary key, semantic jsonb not null default '{}',
  briefs jsonb not null default '{}', updated_at timestamptz not null default now());

create table session_summaries (
  id bigint generated always as identity primary key, user_id uuid not null,
  session_id text, summary text not null, stats jsonb, affect text,
  embedding vector(768),                        -- Kaptan'ın episodik anı endeksi
  created_at timestamptz not null default now());
create index ss_vec on session_summaries using hnsw (embedding vector_cosine_ops) where embedding is not null;

create table nudges (
  id bigint generated always as identity primary key, user_id uuid not null,
  kind text not null, message text not null, status text not null default 'PENDING',
  created_at timestamptz not null default now());

alter table curriculum_nodes add column if not exists prereq_paths ltree[];

-- Kaynak ayrımının korpus ayağı: yks_exemplars TANIM GEREĞİ çıkmış sorulardır (üslup/few-shot
-- kaynağı). Künye eklenir ki servise kopyalanan her çıkmış soru (yks_questions'ta
-- source_type='osym_cikmis') kaynağına geri izlenebilsin. Soru tablolarındaki source_type
-- enum'u + değişmezlik trigger'ı 0004'te (soru tablosu cerrahisinin yaşadığı yerde) tanımlıdır.
alter table yks_exemplars
  add column if not exists exam_year  smallint,
  add column if not exists exam_label text;

-- + match_session_memories RPC, weak_kazanimlar'ın user_mastery-rewrite'ı, v_mastery_rollup view
```

**Birleşik cevap ucu:** `POST /api/v1/answers` (`answers.routes.ts`) = `record_answer` RPC (kalıcı, atomik) + Sinyal güncelleme (Redis) + oturum-sonu debounce. Bugünkü record-answer/telemetry çift-yazım ihtimali ölür; `telemetry.routes.ts` cutover'da alias, sonra silinir. Tüm yüzey `/api/v1/...`; CORS allowlist.

---

## 7. The Ultimate Master Flow

### 1. Gün — İlk Seyir
1. Kayıt → ilk `POST /api/v1/chat` → masa boş → Kaptan **ONBOARDING** charter'ı: sıcak tanışma + 3 kalibrasyon sorusu (hedef bölüm, sınav bilgisi, günlük süre).
2. **Tanışma testi:** çapraz-ders yerleştirme (havuzdan 15 soru, **0 LLM**). Her cevap: Sinyal → `user_logs` + `updateMastery` (K=0.3 hızlı yakınsama) + gamification (XP, ilk rozet, konfeti — dokunulmadı).
3. Oturum sonu görevleri: `compact` (ilk özet + "hedef: Boğaziçi CS" semantic'e), `affect` (temiz oturum → heuristik yeter, LLM atlanır), `plan` (optimizer taze mastery'de koşar; 1 anlatım çağrısı; 2 `forge_topup` gece kuyruğuna).
4. Ertesi sabah nudge (`speakAsKaptan`): *"Günaydın! Haritanı çıkardım — matematikte köklü sayılar bizi bekliyor. 12 dakikan var mı?"*
   **Onboarding toplam interaktif LLM: ~4-6 çağrı.**

### 30. Gün — Bir Ustanın Salısı
1. **03:40 (gece slotu):** Kâtip dünü katlar; Atlas'ın pazar teşhisi masada (`ic_turev_ihmal`, açık); Pusula optimizer: SRS 9 kart + bileşke remediation 4 soru + zincir kuralı 6 orta + pacing taktiği → masa tazelendi. **1 LLM çağrısı.**
2. **07:30:** Ön-render nudge: *"SRS'de 9 kart olgunlaştı — 6 dakikalık hasat. Sonra dünkü tuzağın rövanşı: zincir kuralı, ama önce kısa bileşke ısınması. Plan 28 dk."*
3. **17:05 — öğrenci yazar: "zincir kuralını yine yapamayacağım galiba":** Nabız kapısı → 1 ucuz sınıflama → kaygı. Kaptan'ın bağlamında **[4 halka]** hazır: Atlas'ın teşhisi (halka 1), hedef (halka 2), bu sohbet (halka 3), **recall: "geçen salı da böyle başlamıştın, 5/6 bitirmiştin"** (halka 4). Cevap: normalize eder, tuzağın *neden* kurulduğunu açıklar (iç türev), `generate_practice(kolay, 3)` → havuzdan → 3/3 → gamification konfetisi → 6 orta soru, 5/6.
4. **17:40:** mastery 0.41→0.58; `closure_check` kuyruğa: sonraki 3 zincir-tuzağı temizse misconception `resolved`. `compact`: *"kaygıyla başladı, tuzağı kırdı — özgüven anı"* (bir sonraki recall'un cevheri).
   **Günün interaktif toplamı: ~5 chat turu + 1 sınıflama.**

---

## 8. Mevcut Koda Hükümler (Reuse / Replace)

| Mevcut | Hüküm | Not |
|---|---|---|
| `lib/generation.ts` → `generateVerifiedSet`, OSYM_SYSTEM, verify/repair | **AYNEN** | Atölye `forge_topup`; router sarmalı eklenir |
| `lib/gamification.ts` | **DOKUNULMAZ** | Deterministik; SRS aralıkları `user_mastery.srs_box`'ın ortak sabiti |
| `agents/bus.ts` | **GENİŞLET** | `lb:` adlandırma, kinds, CAS-claim, in-process fallback |
| `agents/kaptan.ts` `streamKaptan` | **ÇEKİRDEK KORUNUR** | System → charter + `composeChatContext`; `recall_memory` + `request_plan_update` tool'ları |
| `agents/pusula.ts` 8-tur loop | **REPLACE** | → `lib/planner.ts` optimizer + 1 anlatım çağrısı |
| `agents/ritim.ts` + worker | **EVRİM** | → `atolye.worker.ts`; handleTask 7 kind + cron + bekçi |
| `agents/tools.ts` | **GENİŞLET** | Kaptan tool'ları kalır; Pusula tool-loop tanımları silinir |
| `buildStudentContext` | **EVRİM** | → `lib/desk.ts` (`composeDesk` + `composeChatContext`); boş masada fallback |
| `lib/models.ts` | **EMİLİR** | → `model-router.ts` (zincir + sayaç + kesici) |
| `lib/test-modes.ts`, `rag.ts`, `canvas.ts`, `curriculum.ts` | **AYNEN + filtre** | `getWeakPaths` → `user_mastery`; `assembleSegment` ve tüm havuz sorguları `source_type='ai_generated'` filtresi kazanır (çıkmış soru adaptif akışa sızamaz) |
| RPC `weak_kazanimlar` | **İmza aynı, gövde yeni** | `user_mastery` (çürüme-farkındalıklı) |
| RPC `distractor_traps` | **AYNEN** | Atlas'ın tetik kaynağı |
| 16 route seti | **AYNEN** | `record-answer` → `/api/v1/answers`'a evrilir (+3 satır: signals/mastery/debounce) |
| `delegateAndAwait` | **TERHİS** | Async-first: `{taskId, queued}`; sonuç Realtime |

---

## 9. İnşa Yol Haritası (her faz bağımsız yayınlanabilir)

| Faz | İş | Çıktı |
|---|---|---|
| **0** | **İlk aksiyonlar:** OpenRouter'a $10 yükle (1000/gün) · migration'ları CLI ile uygula (0001-düzeltilmiş → 0005) | Uzak DB'de brain şeması canlı |
| **1** | `lib/mastery.ts` + `lib/signals.ts` + `/api/v1/answers` (`record_answer` RPC) + **0004'teki `source_type` yapısı** (enum + değişmezlik trigger'ı + backfill + servis indeksleri) + `GET /api/v1/questions/osym` ucu | Her cevap bilişsel grafı besler; **çıkmış ↔ AI ayrımı DB'de kilitli** |
| **2** | `bus.ts` genişletme + `atolye.worker.ts` + bekçi + `model-router.ts` | Sağlam görev omurgası + bütçeli LLM |
| **3** | Kâtip (`compact` + embedding endeksi) + `lib/desk.ts` + Kaptan charter/hafıza halkaları | **Premium çok-turlu hafıza canlı** |
| **4** | Pusula optimizer (`lib/planner.ts`) + gece demirhanesi | Deterministik plan + dolu havuz |
| **5** | Atlas teşhis boru hattı + `closure_check` | **Yanılgı teşhisi + kapanış takibi canlı** |
| **6** | Nabız (heuristik + sınıflama) + nudge → notifications | Duygu-farkındalıklı koçluk |
| **7** | Frontend cutover: `brainClient.ts`, `supabase.functions.invoke` → `/api/v1`; Edge Functions emekli · **"ÖSYM ÇIKMIŞ SORU" rozeti** (`source_type==='osym_cikmis'` → özel başlık/etiket bileşeni) + "Çıkmış Sorular" bölümü | Tek backend + görünür kaynak ayrımı |

---

*Bu plan; sade altyapı üzerinde maksimum zeka yoğunluğu ilkesiyle yazıldı. Her LLM kuruşu ya öğrenciye dokunan bir cümleye, ya bir yanılgının teşhisine, ya da bir anının damıtılmasına gider — başka hiçbir şeye.*
