# YKS "Beyin" Servisi — Sistem Mimarisi & Araç Envanteri (Master Doküman)

> **Amaç:** YKS soru-üretim ve çok-ajanlı öğretim çekirdeğinin **üretime hazır** sistem mimarisi, veri akışları, veritabanı şemaları ve kod blueprint'leri.
> **Stack (nihai karar):** Next.js (App Router) · Supabase (PostgreSQL + pgvector + ltree + Realtime) · Redis (ioredis, **Streams**) · **OpenRouter** üzerinden **OpenAI-uyumlu `openai` SDK** · **DeepSeek** modelleri · Embeddings = **OpenAI `text-embedding-3-small` (768d)**.
> **Bağımlılık kararı:** Anthropic, Voyage ve doğrudan Google SDK bağımlılıkları **kaldırıldı**. Tüm LLM trafiği tek `openai` npm paketi üzerinden konuşur.
> **Kapsam:** Yalnızca yeni "beyin" servisi. Bu doküman tasarım/mimari referansıdır — kod bloklarını *blueprint* olarak içerir.

---

## ⚠️ Migrasyon Bayrakları (önce oku — üretimde kırılmaması için)

Bu üç nokta sessizce uygulanırsa çalışmaz; kararları netleştir:

| # | Konu | Gerçek | Bu dokümandaki çözüm |
|---|---|---|---|
| **F1** | **Embedding boyutu** | `text-embedding-3-small` **native 1536d**'dir. `dimensions` parametresi verilmezse 1536 döner. | Embeddings çağrısına **`dimensions: 768`** ver (Matryoshka kısaltma). Ayrıca app-level **drift-guard** (`EMBED_DIM=768` sabiti + `vec.length` assertion) — bkz. §11.2, §12. |
| **F2** | **OpenRouter embeddings sunmaz** | OpenRouter bir **chat/completions** router'ıdır; `/embeddings` endpoint'i güvenilir değildir. | Embeddings **doğrudan OpenAI endpoint'ine** gider (aynı `openai` paketi, **ikinci client**, farklı `baseURL`+key). LLM trafiği OpenRouter'da kalır. |
| **F3** | **`deepseek/deepseek-flash` yok** | "flash" Google adlandırmasıdır; DeepSeek slug'ları `deepseek/deepseek-chat` (V3) ve `deepseek/deepseek-r1` (reasoner). | Rol dağılımınız korunur; `MODELS.GENERATE` slug'ını canlı OpenRouter kataloğuyla **doğrula**. Doğrulama (verify) adımı için **`deepseek-r1` (reasoner)** önerilir. |

**Ayrıca değişen mimari varsayımlar (OpenAI-uyumlu API):**
- **`temperature` / `top_p` GERİ GELDİ.** OpenAI-uyumlu API bunları destekler → eski "STRICT / DERIVE / CREATIVE" sıcaklık-katmanlı motoru **yeniden kullanılabilir** (Claude'da yasaktı).
- **`cache_control` YOK.** Anthropic'e özgü prompt caching kalktı. DeepSeek **otomatik context caching** yapar (sunucu-taraf, prefix-tabanlı, disk cache) → **stabil bağlamı prompt'un başına koy** ki otomatik cache isabet etsin. Ama OpenRouter üzerinden bu **garanti değil** → maliyet kaldıracını cache'e değil, **model seçimi + context injection'ın kompaktlığına** dayandır.
- **`thinking:{adaptive}` YOK.** Muhakeme gereken adımlar (doğrulama) için **reasoning modeli** (`deepseek-r1`) kullan; `reasoning_content` alanını oku.
- **Yapısal çıktı:** `response_format:{type:"json_object"}` (JSON mode) + uygulama-tarafı şema doğrulaması. `json_schema` desteği modele göre kısmi.

---

## İçindekiler
1. [Genel Bakış — Grounded Generation + Context Injection](#1)
2. [Teknoloji Yığını & Araç Envanteri](#2)
3. [Bileşen Mimarisi (Katmanlar)](#3)
4. [Veri Katmanı — Supabase & Redis (vector(768))](#4)
5. [RAG & Üretim Pipeline + Dinamik Context Injection](#5)
6. [Müfredat Hiyerarşisi (ltree) & Test Modları](#6)
7. [Çok-Ajanlı Orkestrasyon (Pusula ↔ Ritim)](#7)
8. [Komuta Merkezi Chatbot (Kaptan)](#8)
9. [Model & Maliyet + OpenRouter/DeepSeek API Notları](#9)
10. [API Yüzeyi (Route Map)](#10)
11. [Kod Blueprint'leri (clients · rag · generation + Context Injection)](#11)
12. [Veritabanı Migrasyonu (0001_extensions.sql) + Drift-Guard](#12)
13. [Dağıtım Topolojisi & Kod Yerleşimi](#13)
14. [Uygulama Sırası (Build Order)](#14)

---

<a name="1"></a>
## 1. Genel Bakış — Grounded Generation + Context Injection

"Beyin", ÖSYM (TYT-AYT) üslubunda **müfredat-sınırlı, tek-cevaplı, doğrulanmış** sorular üreten ve öğrenciyi çok-ajanlı yönlendiren **ayrı bir servistir**. Fine-tuning ve operasyonel eğitim yükü yerine, **her istekte modelin önüne geçmiş verileri seren** iki mekanizma kullanılır:

1. **RAG (yapısal):** müfredat/olgu sınırı için metadata-filtreli + Contextual Retrieval + rerank.
2. **Dinamik Context Injection:** öğrencinin `user_activities` (Supabase) + gün-içi durum (Redis) geçmişi her prompt'a **kompakt biçimde gömülür** → model "sıfır beyinle" başlamaz (bkz. §5.3, §11.3).

| Problem | Yanlış | Doğru (bu mimari) |
|---|---|---|
| **Olgusal/müfredat sınırı** | "Benzer soru çek" | **Yapısal RAG**: metadata-filtreli + Contextual Retrieval + rerank |
| **Üslup/pedagoji** (ÖSYM dili, çeldirici) | RAG *değil* | **Exemplar-conditioning** + System Instructions'a kazınmış çeldirici taksonomisi |
| **Doğrulama** | Tek-atış üretim | **Çift-geçişli** bağımsız denetçi (reasoner) + RAG-temelli olgu denetimi |
| **Kişiselleştirme** | Genel prompt | **Context Injection** — öğrenci geçmişi prompt'a gömülür |

### En üst seviye akış

```
┌──────────┐   HTTPS/SSE   ┌─────────────────────────────────────────────┐
│  İstemci │◀─────────────▶│            Next.js (App Router)              │
└──────────┘   Realtime    │   /api/tests · /api/chat · /api/telemetry    │
      ▲          ▲          └───┬────────────┬──────────┬────────────┬─────┘
      │          │              │            │          │            │
      │          │        ┌─────▼─────┐ ┌────▼─────┐ ┌──▼──────┐ ┌───▼────┐
      │          │        │OpenRouter │ │  OpenAI  │ │Supabase │ │ Redis  │
      │          │        │ (openai   │ │ embed    │ │Postgres │ │Streams │
      │          │        │  SDK)     │ │3-small   │ │+pgvector│ │ + JSON │
      │          │        │ DeepSeek  │ │768d      │ │+ltree   │ │        │
      │          │        └───────────┘ └──────────┘ └────┬────┘ └───┬────┘
      │          └───────── Supabase Realtime (Postgres CDC) ◀────────┘
      └──────────────────── "Pusula planlıyor… Ritim çalışıyor…"
```

**Değişmez ayrım:** **Postgres = Hakikat · Redis = Hot-Path.** Postgres kalıcı hakikat (soru havuzu, telemetri, görev defteri); Redis olay veriyolu + çalışma belleği; Realtime istemciye push. (Bu motto ve Streams/CDC katmanı **aynen korundu**.)

---

<a name="2"></a>
## 2. Teknoloji Yığını & Araç Envanteri

| Araç | Sürüm/Model | Rolü (nerede) | Neden | Reddedilen / kaldırılan |
|---|---|---|---|---|
| **Next.js** | App Router | API host + orkestrasyon | Hafif backend, SSE, serverless | Express standalone |
| **`openai` npm** | v4+ | **Tüm LLM trafiği** (OpenAI-uyumlu) | Tek SDK ile OpenRouter + OpenAI embed | Anthropic/Voyage/Google SDK'ları **kaldırıldı** |
| **OpenRouter** | `/api/v1` | Chat/completions router → DeepSeek | Tek endpoint'ten çoklu model, `defaultHeaders` ile attribution | Doğrudan model API'leri |
| **DeepSeek** | `deepseek-chat` (V3) · `deepseek-r1` (reasoner) | Üretim · **bağımsız denetçi** · Kaptan chatbot | Güçlü muhakeme + uygun maliyet; OpenAI-uyumlu | Claude / Gemini |
| **OpenAI Embeddings** | `text-embedding-3-small` **@ 768d** | RAG embedding (korpuslar, dedup) | OpenAI/DeepSeek vektör uyumu; `dimensions:768` ile kısalt | Voyage `voyage-3.5` (**kaldırıldı**) |
| **Supabase / Postgres** | 15+ | Kalıcı hakikat + Realtime + RLS + Auth | Tek üründe pgvector + CDC | PG + harici vektör DB |
| **pgvector** | HNSW `m=16, ef_construction=64` | Vektör benzerliği — **`vector(768)`** | Postgres içinde metadata JOIN ücretsiz | ivfflat / harici DB |
| **ltree** | Postgres eklentisi | Müfredat ağacı + hiyerarşik filtre | Alt-ağaç tek sorguda (`path <@`) | recursive CTE |
| **Redis (ioredis)** | **Streams** + JSON | Olay veriyolu, çalışma belleği, hot-path | Kalıcı + consumer-group + XACK + replay | pub/sub (mesaj kaybolur) |
| **Supabase Realtime** | Postgres CDC/WS | İstemciye anlık durum push'u | Polling'siz; `version` tetikler | istemci polling |
| **Mathpix / Doc AI** | — | Ingestion OCR + matematik (LaTeX) | ÖSYM PDF'leri matematik-yoğun | düz Tesseract |
| **BullMQ / Inngest** (ops.) | Redis üzeri | Dayanıklı arka-plan job'ları (Makro) | Serverless timeout'a takılmadan | el-yazımı do-loop |

### Karar özeti (sabit)
- **LLM erişimi = OpenRouter + `openai` SDK** · **Üretim = `deepseek-chat`** (slug'ı doğrula) · **Doğrulama & Kaptan = `deepseek-chat`/`deepseek-r1`**.
- **Embedder = OpenAI `text-embedding-3-small` @ `dimensions:768`** (doğrudan OpenAI endpoint'i).
- **Vektör boyutu = 768** her yerde (kolon, RPC, drift-guard).
- **Şıklar = 5'li (A–E)** · **Hiyerarşi = ltree** · **Haberleşme = Redis Streams**.

---

<a name="3"></a>
## 3. Bileşen Mimarisi (Katmanlar)

| Katman | Sorumluluk | Araçlar |
|---|---|---|
| **(a) Ingestion** (offline batch) | Ham PDF → yapısal embedlenmiş chunk | Mathpix · `deepseek-chat` (contextual önek) · OpenAI embed |
| **(b) Veri** | Kalıcı hakikat + hot-path | Supabase (Postgres/pgvector/ltree) · Redis (Streams/JSON) |
| **(c) Üretim & Doğrulama** | generateVerifiedSet do-loop | OpenRouter/DeepSeek · Supabase RPC |
| **(d) Orkestrasyon** | Gerçek-zamanlı görev dağıtımı & steer | Redis Streams · `agent_tasks` |
| **(e) API** | İstemci ↔ beyin sözleşmesi | Next.js route handlers · SSE |
| **(f) Realtime** | İstemciye anlık durum | Supabase Realtime (CDC) |

> **Not:** Contextual önek üretimi (ingestion) artık Haiku yerine **`deepseek-chat`** ile yapılır (ucuz, hızlı kısa çıktı).

---

<a name="4"></a>
## 4. Veri Katmanı — Supabase & Redis

### 4a. Supabase tablo envanteri (embedding kolonları **vector(768)**)

| Tablo | Rolü | Kritik kolonlar |
|---|---|---|
| `curriculum_nodes` | Müfredat ağacı | `parent_id`, `code` (MEB), **`path ltree`**, `osym_weight` |
| `yks_knowledge_base` | Grounding korpusu (MEB) | `content`, `context`, **`embedding vector(768)`**, `kazanim_id`, `path` |
| `yks_style_exemplars` | Üslup korpusu (ÖSYM) | `options jsonb` (A–E), `correct_option`, `solution`, **`embedding vector(768)`**, `distractor_patterns`, `path` |
| `yks_questions` | Üretilmiş + **verified** havuz | `path`, `options jsonb` (5 şık), `distractor_logic`, `verified`, **`embedding vector(768)`** |
| `user_activities` | Telemetri (Context Injection kaynağı) | `event_type`, `test_mode`, `attempt_id`, `kazanim_id`, `is_correct`, **`selected_option`**, aylık partition |
| `agent_tasks` | Kalıcı görev defteri | `agent_role`, `status`, `input/output jsonb`, `attempts` |
| `study_roadmaps` | Plan (Pusula sahibi, Kaptan değiştirir) | `phases jsonb`, `daily_plan`, **`version int`** (Realtime tetikler) |
| `chat_messages` | Sunucu-taraf sohbet | `role`, `content`, `tool_calls jsonb` |
| `user_question_states` | Canvas (öğrenci çizim) | `strokes/notes jsonb` (normalize 0-1), `canvas_meta` |

> **Migrasyon:** eski `vector(1024)` kolonlarının tamamı → **`vector(768)`**. HNSW index tipi aynı, sadece boyut değişir. Tam DDL ve drift-guard için **§12**.

### 4b. Retrieval RPC'leri (imza **vector(768)**)

| RPC | İş |
|---|---|
| `match_yks_knowledge(query_embedding vector(768), filter_subject, filter_paths[], match_count)` | ltree ön-ekli + vektör sıralı grounding retrieval — tek RPC üç modu karşılar |
| `match_yks_exemplars(...)` | Simetrik: subject + paths + difficulty → altın soru few-shot |
| `weak_kazanimlar(user_id, min, limit)` | Kronik zayıf kazanım alt-ağaçları (Context Injection + Mezo) |
| `distractor_traps(user_id, limit)` | En sık düşülen çeldiriciler (`selected_option` sayesinde) |

### 4c. RLS
- Korpuslar / telemetri / havuz / görev defteri: **yalnız servis-rolü** yazar; istemci kendi/verili satırları okur.
- `user_question_states`: **istisna** — öğrenci `auth.uid()=user_id` ile yazar+okur.

### 4d. Redis anahtar şeması (**aynen korundu**)

| Anahtar | Tip | Rol |
|---|---|---|
| `agent:tasks` | Stream | Görev kuyruğu (consumer-group per rol) |
| `agent:events:{taskId}` | Stream | Durum↑ (orchestrator XREAD) |
| `agent:control:{taskId}` | Stream | Steer↓ (worker XREAD) |
| `agent:control:pusula:{userId}` | Stream | Kaptan → Pusula "yeniden planla" |
| `telemetry:{userId}` | Stream | Anlık öğrenci sinyalleri (worker canlı okur) |
| `task:{taskId}` | JSON/Hash | Çalışma belleği (blackboard) |
| `user:{userId}:context` | JSON | Gün-içi durum — Context Injection'a girer |
| `task:{taskId}:memory` | LIST | Döngüsel gözlem tamponu (RPUSH+LTRIM 0 49) |

**Neden Streams, pub/sub değil?** Pub/sub fire-and-forget → dinleyen yoksa mesaj gider. Ajan görevleri + durum raporları kaybolmamalı. Streams: kalıcı log + consumer-group + `XACK` (at-least-once) + replay.

---

<a name="5"></a>
## 5. RAG & Üretim Pipeline + Dinamik Context Injection

### 5a. İki korpus, iki strateji
- **Korpus A — `yks_knowledge_base`:** MEB → olgusal sınır + kazanım kapsamı.
- **Korpus B — `yks_style_exemplars`:** ÖSYM geçmiş sorular + çözüm → üslup few-shot + çeldirici desenleri. **1 soru = 1 chunk** (atomik).

### 5b. Ingestion pipeline (offline batch)

```
PDF ─▶ OCR/Mathpix ─▶ Yapısal chunking ─▶ Contextual önek ─▶ embed ─▶ Supabase
     (LaTeX korunur) (kazanım-çıpalı,    (deepseek-chat:  (OpenAI 3-small,  (kazanim_id
                      parent-child)       "Bu chunk 11.sınıf dimensions:768)  + path ile)
                                          Fizik…")
```

### 5c. **Dinamik Context Injection** (modelin her istekte sıfır beyinle başlamasını engeller)
Retrieval'a ek olarak, her üretim/chat isteğinde öğrenci geçmişi **kompakt bir bağlam bloğuna** derlenip prompt'a gömülür:

```
Girdi: userId + {kazanım, konu, zorluk}
─ Supabase: weak_kazanimlar(userId) + distractor_traps(userId) + son N answer
─ Redis:    user:{userId}:context  (energy, prefer, overrides)
────────────────────────────────────────────────────────────
buildStudentContext() → "ÖĞRENCİ BAĞLAMI" bloğu (bkz. §11.3)
+ Q1 grounding (match_yks_knowledge) + Q2 exemplar (match_yks_exemplars)
────────────────────────────────────────────────────────────
Prompt = [System Instructions (ÖSYM felsefesi + çeldirici taksonomisi)]
       + [ÖĞRENCİ BAĞLAMI]  ← Context Injection
       + [BİLGİ BAĞLAMI (grounding)] + [STİL ÖRNEKLERİ] + [GÖREV]
```

> **Caching notu (F-değişiklik):** `cache_control` yok. Stabil blokları (System Instructions + çeldirici taksonomisi) **prompt'un en başına** koy → DeepSeek'in **otomatik prefix cache**'i (sunucu-taraf) isabet edebilsin. OpenRouter üzerinden garanti değil; maliyet için Context Injection'ı **kompakt** tut (özetlenmiş brief, ham log değil).

### 5d. Çift-geçişli doğrulama do-loop

```
GENERATE (deepseek-chat, temperature=CREATIVE) ─▶ N+2 aday (tagged format)
   │  her aday için:
VERIFY (deepseek-r1 reasoner, temperature=STRICT, BAĞIMSIZ bağlam):
   1) Soruyu SIFIRDAN çöz (reasoning_content) → işaretle eşleşiyor mu?
   2) Tek doğru mu?  3) RAG olgu denetimi (knowledge_base yeniden sorgu)
   4) Zorluk + ÖSYM-üslup skoru (1-5)
   └─▶ verdict (JSON mode): ACCEPT | REPAIR | REJECT
REPAIR (≤1 tur) → yeniden doğrula
TOP-UP: kabul < hedef ise başa dön (≤3 tur)
```

Yalnızca tüm kapıları geçen sorular `verified:true` → `yks_questions`. **Sıcaklık geri geldi** → STRICT/DERIVE/CREATIVE katmanları yeniden kullanılabilir (§9).

---

<a name="6"></a>
## 6. Müfredat Hiyerarşisi (ltree) & Test Modları

`curriculum_nodes` self-ref + ltree materialized path (`matematik.turev.turev_kurallari.teget_egimi`). `path <@ 'matematik.turev'` → tüm alt-ağaç tek sorguda. Üç mod ortak **`Segment`** atomu üzerinden `generateVerifiedSet`'i besler.

| Mod | Kim başlatır | Kapsam | `filter_paths` | Süre |
|---|---|---|---|---|
| **Mikro** | Öğrenci | Tek kazanım | `[tek_path]` | — |
| **Mezo** | Ajan (Pusula) | `weak_kazanimlar` → N alt-ağaç, sarmal | `[path1, path2, …]` | — |
| **Makro** | Öğrenci/zamanlı | `osym_blueprint` ders dağılımı | ders alt-ağaçları | 165/180 dk |

`buildMicro/Meso/MacroTest` (`lib/test-modes.ts`) · `assembleSegment` (havuz → AI top-up). Canvas: normalize 0-1 vektör path (raster değil), "Hatalı Sorularım"da replay.

---

<a name="7"></a>
## 7. Çok-Ajanlı Orkestrasyon (Pusula ↔ Ritim)

| Ajan | Rol | Model |
|---|---|---|
| **Pusula** | Orchestrator — yol haritası kurar, oturum devreder | `deepseek-chat` |
| **Ritim** | Worker — oturumu yürütür, telemetriye uyum, durum yayınlar | `deepseek-chat` (+ mikro-karar) |
| **Kaptan** | Chatbot — planı değiştirir, human-in-the-loop | `deepseek-chat` |
| **Denetçi** | Bağımsız doğrulama (do-loop) | **`deepseek-r1`** (reasoner) |

### Delegasyon akışı (Redis Streams, gerçek-zamanlı — **aynen korundu**)

```
Pusula                                        Ritim
  │ delegate_session (tool call)
  ├─ INSERT agent_tasks(PENDING) ────────────▶ Postgres (defter)
  ├─ XADD agent:tasks ───────────────────────▶ [görev↓]
  │                                   XREADGROUP◀── (group 'ritim') → RUNNING
  │      [telemetry:{uid}] ◀─── öğrenci cevabı (/api/telemetry)
  │                                            │ do-loop: XREAD telemetry → zorluk/ipucu uyum
  │  XREAD agent:events ◀─ XADD ───────────────┤ XADD events {progress}         [durum↑]
  ├─ XADD agent:control ──────────────────────▶ XREAD control → steer            [steer↓]
  │  XREAD {completed} ◀─ XADD ─────────────────  XADD {completed,gatePassed} → COMPLETED
  └─ tool_result = {gatePassed} → modele geri besle
```

> **Tool-use deseni:** Anthropic'in `tool_use` bloğu yerine artık **OpenAI-uyumlu `tools` + `tool_calls`** kullanılır (`chat.completions.create({ tools, tool_choice })`, `finish_reason === "tool_calls"` → `message.tool_calls` işle → `role:"tool"` sonucu geri besle). Manuel tool-loop mantığı aynıdır.

---

<a name="8"></a>
## 8. Komuta Merkezi Chatbot (Kaptan)

**Model:** `deepseek-chat` (uzun bağlam hafızalı). Pusula ile **paylaşılan tool registry**.

**Bellek hidrasyonu (Context Injection):** `deepseek-chat`, son 30 gün `user_activities`'i kompakt öğrenci brief'ine özetler (`weak_kazanimlar` + `distractor_traps`), Redis `user:{uid}:context`'i ekler → system'e gömülür. `cache_control` olmadığından brief **kısa** tutulur ve stabil bloklar prefix'e alınır.

| Araç | İş | Yazdığı yer |
|---|---|---|
| `get_student_memory` / `drill_memory` | 30-gün brief / derin analiz | read |
| `launch_practice` | Ritim'e oturum devret | `agent:tasks` |
| `modify_roadmap` | Fazı ertele/değiştir | `study_roadmaps` + Realtime |
| `set_daily_context` | Günlük durum | Redis `user:{uid}:context` |
| `signal_pusula` | "Yeniden planla" | `agent:control:pusula:{uid}` |

**Sunum:** Plan **sayfada canlı** çizilir — `study_roadmaps.version` artınca Supabase Realtime push eder. (PDF değil; PDF yalnızca opsiyonel dışa-aktarım.) **SSE** ile istemciye canlı yazım. **Guardrail:** yıkıcı değişiklik onay ister; `signal_pusula` idempotent.

---

<a name="9"></a>
## 9. Model & Maliyet + OpenRouter/DeepSeek API Notları

### 9a. Model katmanlaması (OpenRouter slug'ları)

| Katman | Model | Kullanım |
|---|---|---|
| **Fast/Util** | `deepseek/deepseek-chat` | Contextual önek, sınıflama, bellek brief |
| **Generate** | `deepseek/deepseek-chat` *(veya doğrulanmış hızlı slug)* | Soru üretimi |
| **Verify** | `deepseek/deepseek-r1` (reasoner) | Bağımsız doğrulama — muhakeme kritik |
| **Embed** | `text-embedding-3-small` @768 *(doğrudan OpenAI)* | RAG vektör |

### 9b. OpenAI-uyumlu API kısıt/olanakları (Claude'dan farklar)
- **`temperature` / `top_p` VAR** → STRICT≈0.2 / DERIVE≈0.5 / CREATIVE≈0.8 sıcaklık motoru geri gelir.
- **`cache_control` YOK** → stabil prefix + kompakt Context Injection; DeepSeek otomatik cache'e *bel bağlama*.
- **Reasoning** → `deepseek-r1`; yanıt `choices[0].message.reasoning_content` (DeepSeek) / OpenRouter `reasoning` alanı.
- **JSON çıktı** → `response_format:{type:"json_object"}` + prompt'ta "JSON döndür" + uygulama-tarafı (Zod) doğrulama. `json_schema` desteği modele göre kısmi.
- **Streaming** → `stream:true` (uzun çıktı/`max_tokens` yüksekse zorunlu); chunk'ları biriktir.
- **OpenRouter headers** → `defaultHeaders: { "HTTP-Referer", "X-Title" }` (attribution/rank).
- **Embeddings** → OpenRouter'da **yok**; doğrudan OpenAI (`dimensions:768` zorunlu).

### 9c. Guardrail'ler
- Her do-loop'a tur/token bütçesi; `agent_tasks.attempts` retry sınırı.
- Doğrulama kapısını geçmeyen soru **havuza yazılmaz**.
- Stream `XACK` at-least-once → yan-etkiler idempotent (task.id dedup).

---

<a name="10"></a>
## 10. API Yüzeyi (Route Map)

| Route | Metod | İş |
|---|---|---|
| `/api/tests/generate` | POST | mode: micro/meso/macro → build*Test → assembleSegment |
| `/api/question-state` | GET·POST | Canvas replay / upsert (debounce'lı) |
| `/api/telemetry` | POST | Hot-path (Redis stream) + durable (Supabase); `testMode, attemptId, kazanimId, selectedOption` |
| `/api/chat` | POST·SSE | Kaptan: hydrateMemory → tool-loop → chat_messages |
| `/api/agents/dispatch` | POST | runPusula (arka plan / BullMQ·Inngest) |

---

<a name="11"></a>
## 11. Kod Blueprint'leri

> `openai` npm paketi (v4+) ile. **İki client:** OpenRouter (chat) + OpenAI (embed).

### 11.1 `lib/clients.ts`
```ts
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'
import Redis from 'ioredis'

// (1) LLM trafiği → OpenRouter (OpenAI-uyumlu)
export const openrouter = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY!,
  defaultHeaders: {
    'HTTP-Referer': process.env.APP_URL ?? 'https://learnup.app', // OpenRouter attribution
    'X-Title': 'LearnUp YKS Beyin',
  },
})

// (2) Embeddings → doğrudan OpenAI (OpenRouter embeddings sunmaz — bkz. F2)
export const openaiEmbed = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,     // default baseURL = api.openai.com
})

export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
export const redis         = new Redis(process.env.REDIS_URL!) // komut/XADD
export const redisBlocking = new Redis(process.env.REDIS_URL!) // BLOCK'lu XREAD ayrı bağlantı

// Tek kaynak-hakikat model + boyut sabitleri
export const MODELS = {
  GENERATE: 'deepseek/deepseek-chat',   // slug'ı OpenRouter kataloğuyla DOĞRULA (F3)
  VERIFY:   'deepseek/deepseek-r1',     // reasoner — bağımsız doğrulama
  FAST:     'deepseek/deepseek-chat',   // contextual önek, sınıflama, brief
} as const

export const EMBED_MODEL = 'text-embedding-3-small' as const
export const EMBED_DIM = 768 as const   // drift-guard tek-kaynağı (F1)

// Sıcaklık katmanları geri geldi (OpenAI-uyumlu API)
export const TEMP = { STRICT: 0.2, DERIVE: 0.5, CREATIVE: 0.8 } as const
```

### 11.2 `lib/rag.ts` — embedding (768 + drift-guard) + filtreli retrieval
```ts
import { openaiEmbed, supabase, EMBED_MODEL, EMBED_DIM } from './clients'

// Drift-guard: dimensions:768 verilmezse 1536 döner (F1). Uzunluğu SERT doğrula.
export async function embed(texts: string[]): Promise<number[][]> {
  const r = await openaiEmbed.embeddings.create({
    model: EMBED_MODEL,
    input: texts,
    dimensions: EMBED_DIM,               // ← 768'e kısalt (zorunlu)
  })
  const vecs = r.data.map(d => d.embedding)
  for (const v of vecs) {
    if (v.length !== EMBED_DIM) {         // fail-fast: DB insert'ten ÖNCE yakala
      throw new Error(`EMBED_DIM drift: beklenen ${EMBED_DIM}, gelen ${v.length}`)
    }
  }
  return vecs
}

export type GroundingChunk = { id: number; content: string; context: string | null; kazanim_code: string | null; similarity: number }

export async function retrieveGrounding(p: { subject: string; paths: string[]; query: string; k?: number }) {
  const [qe] = await embed([p.query])
  const { data, error } = await supabase.rpc('match_yks_knowledge', {
    query_embedding: qe,                  // vector(768)
    filter_subject: p.subject,
    filter_paths: p.paths,                // ltree ön-ekleri (mode'a göre 1..N)
    match_count: p.k ?? 8,
  })
  if (error) throw error
  return data as GroundingChunk[]
}

export type Exemplar = { question_text: string; options: Record<string, string>; correct_option: string; solution: string }
export async function retrieveExemplars(p: { subject: string; topic: string; difficulty: string; query: string; k?: number }) {
  const [qe] = await embed([p.query])
  const { data, error } = await supabase.rpc('match_yks_exemplars', {
    query_embedding: qe, filter_subject: p.subject, filter_topic: p.topic,
    filter_difficulty: p.difficulty, match_count: p.k ?? 4,
  })
  if (error) throw error
  return data as Exemplar[]
}
```

### 11.3 `lib/generation.ts` — Context Injection + üretim + bağımsız doğrulama

**(a) Dinamik Context Injection — modelin "sıfır beyinle" başlamasını engeller**
```ts
import { openrouter, supabase, redis, MODELS, TEMP } from './clients'
import { retrieveGrounding, retrieveExemplars, type GroundingChunk, type Exemplar } from './rag'

// Supabase (user_activities RPC'leri) + Redis'ten öğrenci geçmişini toplayıp
// kompakt "ÖĞRENCİ BAĞLAMI" bloğuna derler → prompt'a gömülür.
export async function buildStudentContext(userId: string): Promise<string> {
  const [weak, traps, ctxRaw] = await Promise.all([
    supabase.rpc('weak_kazanimlar', { p_user_id: userId, p_limit: 4 }),
    supabase.rpc('distractor_traps', { p_user_id: userId, p_limit: 5 }),
    redis.get(`user:${userId}:context`),           // gün-içi durum (energy/prefer)
  ])
  const daily = ctxRaw ? JSON.parse(ctxRaw) : {}
  const weakLines = (weak.data ?? []).map((w: any) =>
    `- ${w.subject}/${w.title}: hata oranı %${Math.round(w.wrong_rate * 100)}`).join('\n')
  const trapLines = (traps.data ?? []).map((t: any) =>
    `- kazanım#${t.kazanim_id} en sık YANLIŞ seçilen şık: ${t.selected_option} (${t.miss_count}×)`).join('\n')

  // KOMPAKT tut: cache_control yok, uzun bağlam maliyeti artırır (§5c notu)
  return [
    '### ÖĞRENCİ BAĞLAMI (kişiselleştirme için — soruyu buna göre hedefle)',
    weakLines ? `Zayıf kazanımlar:\n${weakLines}` : 'Zayıf kazanım verisi yok.',
    trapLines ? `Sık düşülen çeldiriciler:\n${trapLines}` : '',
    daily.energy ? `Günlük durum: enerji=${daily.energy}, tercih=${daily.prefer ?? '-'}` : '',
  ].filter(Boolean).join('\n')
}
```

**(b) System Instructions (ÖSYM felsefesi + çeldirici taksonomisi) + üretim**
```ts
const OSYM_SYSTEM = `Sen ÖSYM (TYT-AYT) üslubunda soru yazan uzman bir ölçme-değerlendirme editörüsün.
KURALLAR:
- SADECE verilen "BİLGİ BAĞLAMI" ve belirtilen kazanımla sınırlı kal; müfredat dışına ASLA çıkma.
- ÖSYM formatı: 5 şık (A-E), TEK doğru.
- Her çeldirici SPESİFİK bir yanılgıyı hedefler: işlem hatası | kavram yanılgısı | birim/işaret | eksik-adım | yakın-değer tuzağı. Rastgele yanlış ÜRETME.
- "STİL ÖRNEKLERİ"nin dilini/kurgusunu taklit et; KOPYALAMA — sıfırdan özgün üret.
- "ÖĞRENCİ BAĞLAMI" varsa: öğrencinin zayıf kazanımını ve sık düştüğü çeldirici tipini hedefle.
- Ezber değil; muhakeme/uygulama sorusu.
ÇIKTI SÖZLEŞMESİ (LaTeX korunur):
[SORU]/[A]/[B]/[C]/[D]/[E]/[DOGRU]/[COZUM]/[KAZANIM]/[ZORLUK]/[CELDIRICI_MANTIK]`

export type TaggedQuestion = { soru: string; siklar: Record<'A'|'B'|'C'|'D'|'E', string>; dogru: string; cozum: string; kazanim: string; zorluk: string }

export async function generateQuestions(a: {
  userId: string; subject: string; kazanim: string; topic: string; difficulty: string; count: number
  grounding: GroundingChunk[]; exemplars: Exemplar[]
}): Promise<TaggedQuestion[]> {
  const studentCtx = await buildStudentContext(a.userId)                 // ← Context Injection
  const grounding = a.grounding.map((g, i) => `[BAĞLAM ${i+1}] ${g.context ?? ''}\n${g.content}`).join('\n\n')
  const style = a.exemplars.map((e, i) => `[ÖRNEK ${i+1}] ${e.question_text}\nŞıklar: ${JSON.stringify(e.options)}\nDoğru: ${e.correct_option}\nÇözüm: ${e.solution}`).join('\n\n')

  const res = await openrouter.chat.completions.create({
    model: MODELS.GENERATE,
    temperature: TEMP.CREATIVE,                                          // sıcaklık geri geldi
    max_tokens: 8000,
    messages: [
      { role: 'system', content: OSYM_SYSTEM },                         // stabil → prefix (auto-cache adayı)
      { role: 'user', content:
        `${studentCtx}\n\n### STİL ÖRNEKLERİ (${a.subject}/${a.topic}/${a.difficulty})\n${style}\n\n` +
        `### BİLGİ BAĞLAMI (kazanım ${a.kazanim})\n${grounding}\n\n` +
        `### GÖREV\nBu kazanım/bağlamla SINIRLI, ${a.difficulty} zorlukta ${a.count} özgün ÖSYM sorusu üret. Çıktı sözleşmesine birebir uy.` },
    ],
  })
  return parseTagged(res.choices[0].message.content ?? '')
}
```

**(c) Bağımsız doğrulama (reasoner + JSON mode)**
```ts
export async function verifyQuestion(q: TaggedQuestion, grounding: GroundingChunk[]) {
  const render = `[SORU] ${q.soru}\n` + (['A','B','C','D','E'] as const).map(l => `[${l}] ${q.siklar[l]}`).join('\n') + `\n[İŞARETLİ] ${q.dogru}`
  const evidence = grounding.map(g => g.content).join('\n---\n')
  const res = await openrouter.chat.completions.create({
    model: MODELS.VERIFY,                                               // deepseek-r1 (reasoner)
    temperature: TEMP.STRICT,
    response_format: { type: 'json_object' },                          // JSON mode
    messages: [
      { role: 'system', content: 'Sen titiz, BAĞIMSIZ bir sınav denetçisisin. Soruyu sıfırdan kendin çöz; üreticinin işaretine güvenme. Sadece geçerli JSON döndür.' },
      { role: 'user', content:
        `SORU:\n${render}\n\nMÜFREDAT KANITI:\n${evidence}\n\n` +
        `Şu şemada JSON döndür: {"solvedAnswer":"A-E","matchesMarked":bool,"singleCorrect":bool,"curriculumBound":bool,"osymStyleScore":1-5,"verdict":"ACCEPT|REPAIR|REJECT","critique":"..."}` },
    ],
  })
  return JSON.parse(res.choices[0].message.content ?? '{}') as {
    solvedAnswer: string; matchesMarked: boolean; singleCorrect: boolean;
    curriculumBound: boolean; osymStyleScore: number; verdict: 'ACCEPT'|'REPAIR'|'REJECT'; critique: string
  }
}
// parseTagged / repairQuestion / generateVerifiedSet: do-loop mantığı §5d'deki gibi
// (GENERATE→VERIFY→REPAIR→TOP-UP); yalnız verdict=ACCEPT & osymStyleScore>=4 havuza yazılır.
```

---

<a name="12"></a>
## 12. Veritabanı Migrasyonu (`0001_extensions.sql`) + Drift-Guard

```sql
-- 0001_extensions.sql
create extension if not exists vector;
create extension if not exists ltree;

-- ── EMBEDDING BOYUTU: tüm vektör kolonları vector(768) ──────────────
-- (text-embedding-3-small @ dimensions:768 — bkz. F1)

-- Grounding korpusu
alter table yks_knowledge_base  alter column embedding type vector(768);
-- Üslup korpusu
alter table yks_style_exemplars alter column embedding type vector(768);
-- Üretilmiş havuz (dedup)
alter table yks_questions       alter column embedding type vector(768);

-- HNSW index (tip aynı, boyut 768) — mevcut index'leri düşürüp yeniden kur:
drop index if exists yks_kb_vec;   create index yks_kb_vec on yks_knowledge_base using hnsw (embedding vector_cosine_ops) with (m=16, ef_construction=64);
drop index if exists yks_ex_vec;   create index yks_ex_vec on yks_style_exemplars using hnsw (embedding vector_cosine_ops) with (m=16, ef_construction=64);

-- ── DRIFT-GUARD (sertleştirilmiş) ───────────────────────────────────
-- 1) Kolon tipi vector(768) zaten insert-anında boyutu ZORLAR (yanlış boyut → hata).
-- 2) Ek güvence: yanlışlıkla NULL/0-boyut embedding'i reddet.
alter table yks_knowledge_base  add constraint kb_dim_768 check (embedding is null or vector_dims(embedding) = 768);
alter table yks_style_exemplars add constraint ex_dim_768 check (embedding is null or vector_dims(embedding) = 768);
alter table yks_questions       add constraint yq_dim_768 check (embedding is null or vector_dims(embedding) = 768);

-- 3) RPC imzaları vector(768)'e güncellenir:
--    match_yks_knowledge(query_embedding vector(768), ...)  ← 1024 değil
--    match_yks_exemplars(query_embedding vector(768), ...)
```

**Uygulama-tarafı drift-guard (üç kademe):**
1. **Sabit tek-kaynak:** `EMBED_DIM = 768` (`lib/clients.ts`) — model+boyut birlikte değişir.
2. **Fail-fast assertion:** `embed()` içinde `v.length !== EMBED_DIM → throw` (DB'ye gitmeden yakalar — §11.2).
3. **DB check + kolon tipi:** yukarıdaki `check (vector_dims = 768)` + `vector(768)` tipi.

> Boyutu değiştirmek isteyen biri **üç yeri birden** güncellemek zorunda kalır → sessiz drift imkânsız.

---

<a name="13"></a>
## 13. Dağıtım Topolojisi & Kod Yerleşimi

- **Next.js serverless route'lar** (`/api/*`): kısa istekler (telemetry, question-state, test tetikleme, chat SSE).
- **Uzun-yaşayan worker** (ayrı process): **Ritim loop** (`XREADGROUP` bloklu) + Makro üretim → **BullMQ/Inngest**; `runPusula` buraya devredilir (edge timeout'a takılma).
- **Ingestion:** offline batch (request-path değil).
- **Realtime:** Supabase yönetir (istemci subscribe).

```
lib/
  clients.ts     # openrouter + openaiEmbed + supabase + redis + MODELS + EMBED_DIM + TEMP
  rag.ts         # embed(768+drift-guard) · retrieveGrounding · retrieveExemplars
  generation.ts  # OSYM_SYSTEM · buildStudentContext (Context Injection) · generate · verify · do-loop
  curriculum.ts  # resolveKazanim · getWeakPaths · osymBlueprint
  test-modes.ts  # buildMicro/Meso/MacroTest · assembleSegment
  canvas.ts      # question-state save/load
  agents/{ orchestrator.ts(Pusula) · worker.ts(Ritim) · chatbot.ts(Kaptan) }
```

**Ortam değişkenleri:** `OPENROUTER_API_KEY` · `OPENAI_API_KEY` (embeddings) · `SUPABASE_URL` · `SUPABASE_SERVICE_ROLE_KEY` · `REDIS_URL` · `APP_URL` (HTTP-Referer) · (ops.) `MATHPIX_APP_ID/KEY`.

---

<a name="14"></a>
## 14. Uygulama Sırası (Build Order)

1. **Kararlar sabit:** OpenRouter+DeepSeek · `openai` SDK · embed `text-embedding-3-small@768` · 5 şık · ltree.
2. **Migrasyon `0001_extensions.sql`:** vektör kolonları → `vector(768)`, HNSW yeniden kur, RPC imzaları güncelle, **drift-guard** ekle (§12).
3. **`lib/clients.ts` + `lib/rag.ts`:** iki OpenAI client + `embed()` drift-guard'ı doğrula (768 geliyor mu?).
4. **`curriculum_nodes` seed** + `osym_blueprint`.
5. **Ingestion pilotu** (1 ders/1 kazanım): PDF→OCR→chunk→contextual(`deepseek-chat`)→embed(768)→Supabase.
6. **`generateVerifiedSet` (Mikro) uçtan uca** — Context Injection + `deepseek-chat` üret / `deepseek-r1` doğrula → `yks_questions`.
7. **Meso/Makro + assembleSegment** (havuz → AI top-up).
8. **Redis Streams delegasyon** (Pusula↔Ritim) + `/api/telemetry`.
9. **Canvas** + `/api/question-state`.
10. **Kaptan chatbot** (`deepseek-chat`): hydrateMemory + tool-loop + `/api/chat` SSE.
11. **Supabase Realtime** canlı durum (yol haritası + ajan).

---

### Ek: Doğrulama & açık uçlar
- **F3 (kritik):** `MODELS.GENERATE` slug'ını (`deepseek/deepseek-chat` mi, başka mı?) canlı OpenRouter kataloğuyla doğrula; `deepseek/deepseek-flash` mevcut değilse `deepseek-chat`'te kal.
- **F2:** OpenRouter ileride embeddings sunarsa `openaiEmbed`'i tek client'a indirebilirsin; şimdilik ikinci client zorunlu.
- **Caching:** DeepSeek otomatik cache'i sunucu-taraftır; OpenRouter üzerinden isabet garanti değil — maliyet ölçümünü canlı yap, Context Injection'ı kompakt tut.
- `Postgres = Hakikat · Redis = Hot-Path`, Redis Streams worker'ları ve Supabase CDC katmanı **aynen korunmuştur**.
