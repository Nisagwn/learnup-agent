# LearnUp — Sistem Mimarisi & İşletme Kılavuzu

> **Tek doküman.** Daha önce altı ayrı `.md` vardı (`THE-LEARNUP-MASTER-PLAN`, `MIGRATION-MAP`,
> `ARCHITECTURE_UNIFIED_DATA`, `learnup-brain/KILAVUZ`, `learnup-brain/README`,
> `learnup-brain/BUN`); hepsi buraya toplandı ve **koda karşı doğrulandı**. Eskimiş
> varsayımlar (Next.js, `user_activities`, `yks_style_exemplars`, HS256 JWT) düzeltilerek
> alındı — silinmedi, **yanlış oldukları için değiştirildi**.
>
> **Tasarım mantrası:** *Deterministik çekirdek, LLM kenarlar, tek ses.* Matematik olabilen
> her şey matematiktir. LLM yalnız üç yerde harcanır: **dil** (Kaptan), **teşhis**
> (Atlas/Nabız), **damıtma** (Kâtip).
>
> **Dürüstlük sözleşmesi (bu sistemin en önemli kuralı):** `null` = "ölçülmedi", `0` = "ölçüldü,
> sıfır çıktı". İkisi asla karıştırılmaz. Veri yoksa panel kendini gizler — yer tutucu sayı
> **uydurulmaz**. Denetlenmemiş bir hattı "sıfır sorunlu" göstermek, bu sistemin önlemek için
> var olduğu şeydir.

---

## İçindekiler

1. [Ne bu — iki dünya](#1)
2. [Kilitli kararlar](#2)
3. [Teknoloji yığını](#3)
4. [Katman modeli ve ajan kadrosu](#4)
5. [Bellek mimarisi](#5)
6. [Veri katmanı](#6)
7. [RAG ve üretim hattı](#7)
8. [Müfredat (ltree) ve test modları](#8)
9. [**Roller ve yetkiler (RBAC)**](#9)
10. [**Öğretmen paneli**](#10)
11. [**Yönetici paneli (Kule)**](#11)
12. [API yüzeyi](#12)
13. [Migration tarihçesi](#13)
14. [Frontend — FİDAN](#14)
15. [İşletme kılavuzu](#15)
16. [Altyapı, arıza modları, deploy](#16)
17. [Açık işler](#17)

---

<a name="1"></a>
## 1. Ne bu — iki dünya

LearnUp bir YKS hazırlık platformu. Kod tabanında **birbirine karışmayan iki soru dünyası** var:

| Dünya | Tablolar | Şık | Kim okur |
|---|---|---|---|
| **Beyin** | `yks_questions` (ÖSYM çıkmış) · `yks_ai_questions` (AI üretimi) · `yks_knowledge` · `yks_exemplars` | 5 | RAG, ajanlar, yönetici iç görünümleri (2026-07-22 telif kararı: kullanıcı yüzüne yayın YOK) |
| **App** | `questions` · adaptif motor · gamification · bahçe | 4 | Öğrencinin günlük çözme akışı, ödevler |

**Kaynak ayrımı bir ürün kuralıdır, DB'de kilitlidir.** `question_source` enum'u
(`osym_cikmis · ai_generated · ogretmen`) + insert sonrası **değiştirilemezlik trigger'ı**
(0004). Adaptif montaj her zaman `source_type='ai_generated' AND verified` okur — çıkmış soru
adaptif havuza **asla** sızmaz. **2026-07-22 telif kararı:** ÖSYM çıkmış soruları kullanıcı
arayüzünde YAYINLANMAZ (6114 sayılı ÖSYM Kanunu / telif riski — kullanıcı kararı, "3. yol"):
çıkmışlar yalnız RAG/üretim kaynağı ve yönetici iç operasyonudur; "Çıkmış Sorular" ekranı ile
kehribar "ÖSYM ÇIKMIŞ SORU" mührü (FİDAN öncesi adı "brass") rafa kaldırıldı, lisans alınırsa
döner (kaldırma: GOREV-015 frontend + GOREV-016 backend). `yks_exemplars` çıkmışların
*üslup/few-shot kaynağıdır*: AI sorular çıkmışlardan beslenir ama onlarla karışmaz.

### Depolar

| Dizin | Ne |
|---|---|
| `learnup-brain/` | Tek merkezî backend. Express + Bun + TypeScript (ESM). 16 eski Edge Function route olarak içeride; Deno Edge Functions **emekli**. |
| `frontend-v2/` | Güncel arayüz. Vite + React 19 + Tailwind v4. **Next.js DEĞİL.** |
| `frontend/` | Eski Firebase/Firestore arayüzü. Bakım modunda; yeni iş buraya yazılmaz. |
| `supabase/migrations/` | App şeması (0001–0003) |
| `learnup-brain/migrations/` | Beyin şeması (0001–0020) |

---

<a name="2"></a>
## 2. Kilitli kararlar

| # | Karar |
|---|---|
| 1 | **Tek merkezî Bun backend** (`learnup-brain`); Edge Functions emekli |
| 2 | Ücretsiz OpenRouter modelleriyle çalışır (`:free` slug + paralı fallback) |
| 3 | **Tek persona:** öğrenci yalnız **Kaptan** ile konuşur; uzmanlar görünmez |
| 4 | Ölçek hedefi rafta — ileride ölçek = replika + config, kod değil |
| 5 | Postgres = tek hakikat · Redis = atılabilir hızlandırıcı · LLM = bütçeli kıt kaynak |
| 6 | **Kaynak ayrımı** DB düzeyinde enum + trigger ile kilitli (§1) |
| 7 | **Rol `profiles`'tan okunur, JWT'den DEĞİL** (§9 — gerekçe orada) |
| 8 | Gamification (`lib/gamification.ts`) %100 deterministik; **asla ajan olmaz** |

---

<a name="3"></a>
## 3. Teknoloji yığını

**Backend (`learnup-brain`)**
- Runtime **Bun** · Express · TypeScript (ESM/NodeNext). Bun TS'i doğrudan çalıştırır, `.env`'i otomatik yükler.
- LLM: OpenRouter üzerinden `openai` SDK · **DeepSeek** ailesi
- Embeddings: OpenAI `text-embedding-3-small` **@768** — doğrudan OpenAI endpoint'ine (OpenRouter `/embeddings` sunmaz), `dimensions: 768` parametresi **zorunlu** (native 1536d'dir)
- Veri: Supabase (Postgres + pgvector `vector(768)` + ltree) — **service-role** anahtarıyla → **RLS tamamen bypass**. Bu yüzden yetki denetimi tamamen uygulama katmanındadır (§9).
- Auth: Bearer JWT **lokal** doğrulama (JWKS/ES256, ağ round-trip'i yok)
- Hot-path: Redis **Streams**

**Frontend (`frontend-v2`)**
- Vite + React 19 + strict TS + react-router-dom 7
- Tailwind v4 **CSS-first** — `tailwind.config.js` YOK, tüm tema `src/index.css` `@theme{}` içinde
- framer-motion · recharts 3 · cmdk · sonner · Radix

> **Bağımlılık kararı:** Anthropic, Voyage ve doğrudan Google SDK bağımlılıkları kaldırıldı.
> Tüm LLM trafiği tek `openai` paketi üzerinden konuşur.

---

<a name="4"></a>
## 4. Katman modeli ve ajan kadrosu

```
┌─ SİNYAL (algı) ─────────────────────────────────────────────────┐
│  Saf fonksiyonlar, cevap-başına, sıfır LLM: gecikme z-skoru,     │
│  hata serisi, tuzak isabeti, yorgunluk işaretleri                │
└───────────────┬──────────────────────────────────────────────────┘
                ▼
┌─ BİLİŞ (4 görünmez beyin) ──────────────────────────────────────┐
│  ATLAS          PUSULA         NABIZ           KÂTİP             │
│  bilişsel harita strateji      duygu/motivasyon hafıza yazıcısı  │
│  + yanılgı teşhisi + taktik    + yük tavanı    + damıtma         │
│         her biri Koç Masası'na TEK kompakt brief yazar           │
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

### 4.1 KAPTAN — yüz
Öğrenci-yüzlü **her** cümle. Hesaplamaz; masayı okur, konuşur. SSE ile `chat_messages`'a yazar.
Persona sözleşmesi `src/persona/kaptan.charter.ts` (tek export); `speakAsKaptan()` chat dışındaki
öğrenci-yüzlü metnin **tek** üreticisi. Uzmanlar asla kendi cümlesini kurmaz.

Yasaklar: cevabı doğrudan verme, tıbbi/psikolojik teşhis dili, boş motivasyon klişesi.

### 4.2 ATLAS — bilişsel haritacı
Kazanım düzeyinde ustalık + **kavram yanılgısı teşhisi ve kapanış takibi**. Yeni graf deposu yok:
`curriculum_nodes` (ltree) topoloji, `user_mastery` öğrenci overlay'i, `prereq_paths` önkoşul kenarları.

**Deterministik çekirdek — BKT-lite** (`lib/mastery.ts`, cevap akışında sync, LLM yok):
```
expected = m·(1−SLIP) + (1−m)·GUESS       # GUESS=0.2 (5 şık), SLIP=0.1
m'       = clamp(0.01, 0.99, m + K·(outcome − expected))   # K=0.15; yerleştirmede 0.3
m_eff    = m · exp(−gün / (7·(1+stability)))               # OKUMA anında çürüme
```
Doğru-ama-2×-yavaş cevap yarım kredi (`outcome = 0.5`) alır.

> ⚠️ **Çürüme formülünün ÜÇ kopyası var:** TS `effectiveMastery()` (`lib/mastery.ts:36`),
> `weak_kazanimlar` RPC (0005), ve 0016'nın üç sınıf RPC'si. Üçü bayt-bayt aynı olmak
> **zorunda**; sapma sessizce farklı sayılar üretir. Canlı veride ~5e-7 uyum doğrulandı.

**Yanılgı adli analizi** (`diagnose` görevi): kanıt paketi topla (aynı `(kazanim, selected_option)`
tuzağının son 3+ isabeti) → r1 soruları **sıfırdan çözer**, yanlış şıkkı hangi zihinsel adımın
üreteceğini geriye izler → taksonomiye bağlar:

```json
{
  "misconception_id": "ic_turev_ihmal",
  "taxonomy": "prosedur_atlama",
  "evidence": "3 soruda da dış fonksiyon türetilmiş, iç türev çarpanı yok",
  "confidence": 0.85,
  "prereq_hypothesis": "matematik.fonksiyonlar.bileske",
  "remediation": { "review_kazanim": "bileske_fonksiyon", "then_microset": {...} },
  "student_facing_hint": "İçteki fonksiyonun türevini çarpmayı unutuyorsun"
}
```
Taksonomi: `islem_hatasi | kavram_karismasi | prosedur_atlama | temsil_hatasi | onkosul_bosluk`.

**Kapanış doğrulaması:** remediation sonrası aynı tuzak tipinde 3 soru izlenir → 3/3 temizse
`resolved` (tarihçesiyle saklanır, Kaptan "geçen hafta kırdığın tuzak" diyebilir), değilse
`persists` + bir kademe derin remediation.

### 4.3 PUSULA — stratejist
*Sınav gününe kadar saat başına beklenen net kazancını maksimize et.* **LLM'siz optimizer**
(`lib/planner.ts`):
```
skor(kazanım) = blueprint_ağırlığı × (1 − m_eff) × aciliyet(sınava_gün) × srs_vade_katsayısı
```
Greedy blok seçimi + serpiştirme (her blok: 1 zayıf kazanım + 1 SRS tekrarı + 1 komşu konu;
hedef %70–80 başarı = arzu edilen zorluk) + Nabız yük tavanı. Sonra **tek** LLM çağrısı planı
Kaptan'ın anlatacağı brief'e dönüştürür.

### 4.4 NABIZ — empati nöbetçisi
Heuristik-önce (`agents/nabiz.ts` — planlanan `lib/affect.ts` açılmadı, mantık ajanın içinde):
hata serisi ≥4, gecikme z>2 (yorgunluk) veya z<−2 + hatalar (acele), rage-quit (<30 sn), gece
yarısı çalışması, seri kırılma günü. Kural ateşlenince LLM sınıflar:
`{state: motive|nötr|hüsran|kaygı|tükenmiş, evidence, coaching_stance, load_cap}` — çıktı
`AffectSemasi` (zod) ile doğrulanır, uymayan sınıflama **nötr'e düşer**.

### 4.5 KÂTİP — hafıza yazıcısı
Oturum-sonu: istatistik (deterministik) + sohbet dökümü (LLM) → ≤5 maddelik özet →
`session_summaries` + 768d embedding. Gece: son 7 günün özetlerini `semantic`'e katlar; kalıcıları
terfi ettirir, bayatları emekli eder, çelişkileri revize eder. Her brief ≤300 token, masa ≤1200.

### 4.6 Kural kitabı — `src/persona/`

Bu klasör LLM'e söylediğimiz **her şeyin** tek kaynağıdır. Bir ajanın davranışını değiştirmek
istiyorsan kodu değil, buradaki charter'ı düzenlersin.

> ⚠️ **Temel ilke: dilek ≠ sözleşme.** Prompt'a bir kural yazmak, o kuralın uygulanacağı anlamına
> **gelmez.** Bu proje bunu pahalı öğrendi: `OSYM_YAZAR_SYSTEM` içinde *"Doğru cevabı her soruda
> A'ya koyma — harfi DENGELİ dağıt"* satırı vardı. Model bunu okudu ve **8 sorunun 6'sında yine
> A'ya koydu** (ölçüldü). Sorunu prompt çözmedi, `generation.siklariDuzenle` çözdü — şık harfini
> **deterministik kodun** belirlediği bir fonksiyon.
>
> **Zorlanabilir her kural KODDA zorlanır. Prompt yalnız modele niyeti anlatır.**

| Kural | Prompt der ki | GERÇEK zorlayıcı | Garanti? |
|---|---|---|---|
| 5 şık, tek doğru | `osym.charter` | `parseTagged` — uymayan soru **düşürülür** | ✅ Kod |
| Doğru cevap A'ya yığılmasın (metinsel) | `osym.charter` | `siklariDuzenle` → Fisher–Yates | ✅ Kod |
| Doğru cevap A'ya yığılmasın (sayısal) | `osym.charter` | Yok — sayısal şıklar ÖSYM kuralı gereği artan sıralanır | ⚠️ Kısmi |
| Soru müfredata bağlı | `osym.charter` | Bağımsız denetçi (`curriculumBound`) + `isAccepted` | ✅ Kapı |
| Soru iç tutarlı | `osym.charter` | Denetçi (`internallyConsistent`) | ✅ Kapı |
| İşaretlenen cevap doğru | `osym.charter` | Denetçi soruyu **sıfırdan çözer** (`matchesMarked`) | ✅ Kapı |
| Taksonomi dışına çıkma | `atlas.charter` | `TeshisSemasi` (zod) — uymayan teşhis **yazılmaz** | ✅ Kod |
| Duygu listesi dışına çıkma | `nabiz.charter` | `AffectSemasi` (zod) — uymayan sınıflama **nötr'e düşer** | ✅ Kod |
| Nudge cümlesini uzman kurmaz | `nabiz.charter` | `speakAsKaptan` — tek çıkış noktası | ✅ Mimari |
| Planı LLM kurmaz | `pusula.charter` | `planner.buildPlan` — deterministik optimizer | ✅ Mimari |
| **Teşhis dili yok** | `ortak.TESHIS_DILI_YOK` | **Yok** | ❌ Yalnız rica |
| **Cevabı doğrudan verme** | `ortak.OGRENCI_YUZLU` | **Yok** | ❌ Yalnız rica |
| Uydurma yok (sayı/kaynak) | `ortak.ORTAK_KURALLAR` | Kısmen: RAG zemini + denetçi | ⚠️ Kısmi |

Son üç satır **dürüstlük içindir**: bunlar garanti değil. "Kaptan cevabı direkt verdi" şikâyeti
gelirse sebebi bu tabloda yazılı.

**Dosyalar:** `ortak.ts` (paylaşılan değişmezler — tek kaynak) · `kaptan.charter.ts` +
`voice.ts` (öğrenciyle konuşan tek yüzey) · `atlas` / `nabiz` / `pusula` / `katip` /
`osym.charter.ts` (öğrenciyle konuşmaz). **RİTİM'in charter'ı yoktur** — LLM prompt'u yok, o bir
görev dağıtıcısı; simetri olsun diye sahte charter açılmadı.

**Enum'lar neden persona'da?** `TAKSONOMI` ve `DUYGU_DURUMLARI` üç yerde birden yaşıyordu (TS
union, prompt içindeki şema dizesi, doğrulayıcı yok) ve `as` cast'i modelin uydurduğu değeri
sessizce DB'ye geçiriyordu. Artık **tip de, prompt metni de, zod doğrulayıcısı da aynı objeden
türer** — kayma imkânsız.

**Charter değiştirirken:** (1) davranış değişimini `gen-smoke.ts` / `sik-dagilim.ts` ile **ölç**,
yaramadıysa kod tarafına geç. (2) Ortak kuralı **tek yerde** değiştir — `ortak.ts`'ten kopyalayıp
bir charter'a yapıştırma; kayma tam olarak böyle başlar. (3) Şema alanı eklediysen zod'u da
güncelle, yoksa model o alanı doldurur ve sen görmezsin.

---

<a name="5"></a>
## 5. Bellek mimarisi

| Katman | İçerik | Depo | Ömür |
|---|---|---|---|
| **Working** | sinyal penceresi, sohbet penceresi, affect, masa | Redis (`lb:*`) | dk–48h; **tamamı PG'den yeniden kurulabilir** |
| **Episodic** | `user_logs`, `chat_messages`, `session_summaries` | Postgres | özet sonrası ham sohbet >30g budanabilir |
| **Semantic** | `user_mastery`, `student_memory`, `roadmaps` | Postgres | Kâtip küratörlüğünde |

**Redis anahtarları:** `lb:desk:{uid}` (48h) · `lb:signals:{uid}` (24h) · `lb:chatwin:{uid}` (24h)
· `lb:affect:{uid}` (24h) · `lb:ctx:{uid}` (24h) · `lb:emb:{sha256}` (30g) · `lb:llm:*` (≤48h) ·
`lb:tasks` / `lb:events:{taskId}` · `yetki:kimlik:{uid}` (60 sn, §9).

**Neden Streams, pub/sub değil?** Pub/sub fire-and-forget — dinleyen yoksa mesaj gider. Görev ve
durum raporları kaybolmamalı. Streams kalıcı log + consumer-group + `XACK` (at-least-once) + replay.

### Kaptan'ın dört halkalı bağlamı (`composeChatContext`)
```
[1] Charter + Koç Masası          (stabil prefix → sağlayıcı-taraf otomatik cache)
[2] Semantik gerçekler            (hedef, kısıtlar, kişisel bağlam)
[3] Oturum-içi pencere            (son 12 tur ham + öncesi Kâtip ara özeti)
[4] Episodik anı çağırma          (match_session_memories — pgvector)
```
Halka 4 örneği: *"Geçen salı zincir kuralında iç türevi unutuyordun — bugün o tuzağı kırmışsın."*
Disiplin: interaktif prompt ≤4k token.

---

<a name="6"></a>
## 6. Veri katmanı

### Ana tablolar

| Tablo | Rolü | Kritik kolonlar |
|---|---|---|
| `curriculum_nodes` | Müfredat ağacı | `parent_id`, `code`, **`path ltree`**, `osym_weight`, `prereq_paths ltree[]` |
| `yks_knowledge` | Grounding korpusu (MEB) | `content`, **`embedding vector(768)`**, `kazanim_id`, `path` |
| `yks_exemplars` | Üslup korpusu (ÖSYM) | `options jsonb`, `correct_option`, `solution`, `embedding`, `difficulty`, `exam_year/label` |
| `yks_questions` | ÖSYM çıkmış havuzu | `source_type='osym_cikmis'`, `exam_year`, `exam_label` |
| `yks_ai_questions` | AI üretimi havuz (0013'te ayrıldı) | `verified`, `quality`, `difficulty`, `kazanim_id` |
| `questions` | App soruları (4 şık) | `options` **dizi**, `correct_answer` **metin**, `kaynak_soru_id` (0018) |
| `user_logs` | **Kanonik telemetri** | `student_id`, `kazanim_id`, `is_correct`, `selected_option`, `duration_ms`, `teacher_id` |
| `user_mastery` | Bilişsel graf | `mastery`, `stability`, `attempts`, `srs_box`, `misconceptions jsonb` |
| `student_memory` | Koç Masası | `semantic jsonb`, `briefs jsonb` |
| `session_summaries` | Anı endeksi | `summary`, `embedding vector(768)` |
| `agent_tasks` | Görev defteri | `kind`, `status`, `attempts`, `locked_by`, `locked_at` |
| `profiles` | Kullanıcı + rol + sınıf | `role`, `is_approved`, `teacher_id`, `teacher_ids jsonb`, `class_code` |
| `yonetim_denetim` | **Yönetici eylem defteri** (0020) | append-only, §11 |

> ⚠️ Eski dokümanlardaki `user_activities`, `yks_style_exemplars`, `study_roadmaps` isimleri
> **yanlıştır**; kanonik isimler yukarıdakilerdir. İki cevap tablosu (çatallı telemetri) bilinçli
> olarak yasaklandı: `user_logs` tektir.

### Retrieval RPC'leri (imza `vector(768)`)

| RPC | İş |
|---|---|
| `match_yks_knowledge(query_embedding, filter_subject, filter_paths[], match_count)` | ltree ön-ekli + vektör sıralı grounding |
| `match_yks_exemplars(...)` | Simetrik; **zorluğu tutan örnek önce** (0017) |
| `weak_kazanimlar(user_id, ...)` | Kronik zayıf kazanımlar (çürüme-farkındalıklı) |
| `distractor_traps(user_id, limit)` | En sık düşülen çeldiriciler |
| `match_session_memories(user_id, query_embedding, count)` | Kaptan'ın anı çağırması |
| `record_answer(...)` | **Atomik** cevap kaydı: user_logs + srs_cards + gamification |
| `sinif_ozeti / sinif_isi_haritasi / sinif_zayif_kazanimlar` | Sınıf analitiği (0016), §10 |

### PostgREST tuzağı — `fetchAll` şart

PostgREST **1000 satırda sessizce keser**. Sınırsız bir küme okuyan her yer `src/lib/pg.ts`
içindeki `fetchAll()` kullanmak zorunda. 1200 kişilik bir mevcut sessizce 1000'e düşerse her
sınıf ortalaması bozulur ve kimse fark etmez.

---

<a name="7"></a>
## 7. RAG ve üretim hattı

### İki korpus, iki strateji
- **`yks_knowledge`** (MEB) → olgusal sınır + kazanım kapsamı
- **`yks_exemplars`** (ÖSYM) → üslup few-shot + çeldirici desenleri. **1 soru = 1 chunk** (atomik).

### Dinamik Context Injection
```
Prompt = [System (ÖSYM felsefesi + çeldirici taksonomisi)]   ← stabil, en başta (prefix cache)
       + [ÖĞRENCİ BAĞLAMI]        ← weak_kazanimlar + distractor_traps + Redis ctx
       + [BİLGİ BAĞLAMI]          ← match_yks_knowledge
       + [STİL ÖRNEKLERİ]         ← match_yks_exemplars
       + [GÖREV]
```
`cache_control` yok; stabil blokları başa koymak DeepSeek'in **otomatik prefix cache**'ini
tetikleyebilir. Garanti değil → Context Injection **kompakt** tutulur (özet brief, ham log değil).

### Çift geçişli doğrulama (`generateVerifiedSet`)
```
GENERATE (temperature=CREATIVE) ─▶ N+2 aday
   │ her aday:
KOD KAPILARI: LaTeX/KaTeX · çeldirici kuşatması · şık uzunluk sızıntısı ·
              gövde uzunluğu · Jaccard 4-gram özgünlük bariyeri
VERIFY (r1, BAĞIMSIZ bağlam): soruyu SIFIRDAN çöz → işaret eşleşiyor mu?
              tek doğru mu? RAG olgu denetimi? zorluk + üslup skoru (1–5)
   └─▶ ACCEPT | REPAIR | REJECT
REPAIR (≤1 tur) → yeniden doğrula
TOP-UP: kabul < hedef ise başa dön (≤3 tur)
```
Yalnız tüm kapıları geçen soru `verified:true` ile `yks_ai_questions`'a yazılır.

**Havuz-önce yasası:** pratik/test servisi **0 LLM** — doğrulanmış havuzdan, kullanıcının
görmediklerinden. Canlı üretim yalnız havuz boşsa son çare. Gece demirhanesi
(`topup-planner`, 02:00–06:00 TSİ) ince hücreleri doldurur.

> ⚠️ **Elenen aday hiçbir yere yazılmıyor** — `generateVerifiedSet` içinde **9 ayrı `return null`**,
> sıfır kalıcılık. Eval anlıkları tanım gereği yalnız *havuza girmiş* soruları ölçer. Bu yüzden
> "hangi kapı kaçını eledi" sorusu bugün **cevapsızdır** ve cevabı hayatta kalanlardan türetmek
> uydurma olur. Çözüm §17'de (A5).

---

<a name="8"></a>
## 8. Müfredat (ltree) ve test modları

`curriculum_nodes` self-ref + materialized path (`matematik.turev.turev_kurallari.teget_egimi`).
`path <@ 'matematik.turev'` → tüm alt ağaç tek sorguda.

| Mod | Kim başlatır | Kapsam | Süre |
|---|---|---|---|
| **Mikro** | Öğrenci | Tek kazanım | — |
| **Mezo** | Pusula | `weak_kazanimlar` → N alt ağaç, sarmal | — |
| **Makro** | Öğrenci/zamanlı | `osym_blueprint` ders dağılımı | 165/180 dk |

`buildMicro/Meso/MacroTest` (`lib/test-modes.ts`) · `assembleSegment` (havuz → AI top-up).

---

<a name="9"></a>
## 9. Roller ve yetkiler (RBAC)

### Rol nereden gelir

Tek kaynak: **`profiles.role`** — `student | teacher | admin` (0016 CHECK'i).

> ⚠️ **Rol JWT'den OKUNMAZ.** İki gerekçe:
> 1. `handle_new_user()` rolü `raw_user_meta_data`'dan alıyordu ve o alan **istemci
>    yazılabilir**. 0016 bunu beyaz listeyle sertleştirdi, ama JWT'ye rol koymak aynı güven
>    zincirini geri getirirdi.
> 2. `is_approved` iptal edildiğinde etki **saniyeler** içinde geçmeli. JWT'ye yazılsaydı token
>    yenilenene kadar (~1 sa) yetkisi alınmış öğretmen bütün sınıfı görmeye devam ederdi.
>
> Bedeli: istek başına bir `profiles` okuması. `kimlikAl()` iki kademeli önbellekle
> (süreç-içi Map 60 sn + FIFO tavan 5000 → Redis 60 sn) bunu kullanıcı başına ~dakikada bire
> indirir. **Redis yoksa DB'ye düşer, asla "izin ver"e düşmez.**

### Üç kapı — `src/middleware/`

```
requireAktifHesap        → askiya_alindi === false            (0025, TÜM /api/v1 yollarında)
requireRole('admin')     → role==='admin'
requireOgretmenKapsami   → teacher: kapsam = kendisi
                           admin  : kapsam = ?ogretmenId (ZORUNLU) + adminVekili=true
```

> ⚠️ **ASKI KAPISI HER YOLA TAKILIR** (`app.ts` → `kimlikli = [requireAuth, requireAktifHesap]`).
> Rol kapısına gömülseydi askıdaki bir **öğrenci** soru çözmeye, ödev göndermeye ve sohbet
> etmeye devam ederdi — rol kapısı öğrenci yollarında yok. **Rol muafiyeti yoktur:** askıdaki
> yönetici de dışarıda kalır; "son yönetici askıya alınamaz" koruması **uçtadır**, kapıda değil.

> ⚠️ **YÖNETİCİ ARTIK SINIF YÜZEYİNE GİREBİLİR — AMA KAPSAM SEÇEREK** (0025 ile değişti).
> Eskiden `/teacher/*` admin'e kapalıydı çünkü kapsam `req.userId`'den türüyordu ve admin
> **sessizce boş sınıf** görürdü. Artık kapsam açık bir parametre: `?ogretmenId=<uuid>`.
> Yönetici parametresiz girerse **400 `ogretmen_secilmedi`** alır — sessiz boş sınıf ASLA.
> Kapsamlı girdiğinde `adminVekili=true` işaretlenir ve **her yazma** (ödev, öğrenci
> ekleme/çıkarma) denetim defterine `ogretmen_adina_*` olarak, hedefi o öğretmen olacak
> şekilde işlenir. Öğretmenin **kendi** yazması izlenmez: olağan iş akışını deftere doldurmak
> yönetim eylemlerini görünmez kılardı.

### Yetki matrisi

| Yüzey | Öğrenci | Öğretmen | Admin |
|---|---|---|---|
| `/mastery`, `/answers`, `/practice`, `/garden`… (kendi verisi) | ✅ | ✅ (boş) | ✅ (boş) |
| `/sinif/*` — katıl / ayrıl | ✅ | ⛔ `ogrenci_degil` | ⛔ `ogrenci_degil` |
| `/teacher/*` — okuma | ⛔ 403 | ✅ kendi sınıfı | ✅ **`?ogretmenId` ile** |
| `/teacher/*` — yazma (ödev · öğrenci) | ⛔ 403 | ✅ izsiz | ✅ **izli** (`ogretmen_adina_*`) |
| `/admin/*` — kullanıcı, havuz, ops, denetim | ⛔ 403 | ⛔ 403 | ✅ |
| Askıdaki hesap (`askiya_alindi`) | ⛔ 403 | ⛔ 403 | ⛔ 403 |

### Yöneticinin yazma yetkileri (0025)

| Alan | Uçlar | Not |
|---|---|---|
| Hesap yaşam döngüsü | `POST /admin/kullanici` (davet) · `PATCH /admin/kullanici/:id` · `POST …/sifre-sifirla` · `POST …/aski` · `POST /admin/basvuru/:id/reddet` | **Kalıcı silme YOK** — askı geri alınabilir, silme değil |
| Rol & sınıf | `POST …/rol` · `POST …/sinif` · `POST /admin/ogretmen/:id/onay` | Kendi rolünü değiştiremez; son yönetici düşürülemez/askıya alınamaz |
| Havuz moderasyonu | `GET/PATCH /admin/havuz/soru*` · `POST …/dogrulama` · `POST …/karantina` · `POST /admin/havuz/uretim` | Metin düzenleme YOK (bkz. §11) |
| Ops | `PUT /admin/ozgunluk/esik` · `POST /admin/eval/kosum` · `POST /admin/onbellek/dus` · `POST /admin/gorev/:id/{yeniden,iptal}` | Hepsi izli |

> 🔒 **Şifre sıfırlama ≠ hesaba girme.** Uç `resetPasswordForEmail` kullanır, `admin.generateLink`
> **değil**: generateLink kurtarma URL'ini çağırana döndürür ve o URL yöneticinin eline geçerse
> hesabı devralmaya yeter. Bağlantı yalnız kullanıcının e-posta kutusuna gider.

### İki katmanlı savunma: RLS satırı, GRANT kolonu

> 🚨 **0019 — kanıtlanmış ayrıcalık yükseltme açığı, kapatıldı.**
> `profiles_update` politikası **satırı** kısıtlıyordu ("yalnız kendi satırın") ama **kolonu**
> kısıtlamıyordu — Postgres'te RLS politikası kolon bazlı değildir. Sonuç: giriş yapmış herhangi
> bir öğrenci tarayıcı konsolundan tek satırla kendini yönetici yapabiliyordu:
> ```js
> supabase.from('profiles').update({ role: 'admin' }).eq('id', myId)   // KABUL EDİLİYORDU
> ```
> `requireRole` rolü `profiles`'tan okuduğu için **tüm RBAC bu açıkla geçersizdi.** 0019
> blanket UPDATE'i geri alıp kolon bazlı GRANT verdi. Canlıda doğrulandı: aynı istek artık
> **403 / 42501** ile reddediliyor.

İstemcinin yazabildiği kolonlar: `name · avatar · grade · student_class · school · branch · bio ·
daily_goal · notifications_enabled · teacher_notif_prefs · total_chat_messages ·
last_goal_reached_date · last_solved_question · updated_at`

**Yalnız service_role:** `role · is_approved · teacher_id · teacher_ids · class_code · students ·
stats* · mastery* · gamification · level_data · unlocked_badges · email · created_at`

### Sahiplik denetimi — `src/lib/yetki.ts`

Middleware **değil**: `studentId` route parametresinden gelir ve denetimin kullanım noktasında
görünür kalması gerekir.

- `assertTeacherOwnsStudent(teacherId, studentId)` → geçer: `role='student'` **ve**
  (`teacher_id` eşleşir **veya** `teacher_ids` içerir). Geçmezse **404, 403 DEĞİL** — 403,
  uuid'nin gerçek bir öğrenciye ait olduğunu doğrular ve ucu numaralandırma kehanetine çevirirdi.
  Ayrım sunucuda `warn` ile loglanır.
- `sinifOgrencileri(teacherId)` → **`fetchAll` ile** (§6 tuzağı).
- Önbellek: pozitif 60 sn, **negatif 10 sn** (uzun negatif, yeni kaydolan öğrenciyi bozuk gösterir).
- `sinifiUnut(teacherId)` kayıt/çıkarma sonrası **zorunlu** — bunsuz yeni öğrenci 60 sn görünmez
  ve öğretmen "katılım çalışmıyor" sanır.

### Sınıf modeli

**Ayrı `classes` tablosu YOK.** Sınıf = `profiles.class_code` (öğretmen kaydında üretilen 6 haneli
büyük harf hex); üyelik = `profiles.teacher_id` (tekil) veya `teacher_ids jsonb` (çoklu).
Gerekçe: her join zaten indeksli, `user_logs.teacher_id` yazma anında denormalize, ve sınıf bugün
öğretmenle 1:1 — tablo "öğretmen başına tam bir satır" olurdu. Dürüst sınır API'de görünür:
bir öğretmenin bir sınıfı vardır, `classId` path parametresi yoktur.

### Kayıt akışı

| Yol | Uç | Kural |
|---|---|---|
| Öğrenci kodu girer | `POST /sinif/katil` | Kod yanlış da olsa öğretmen onaysız da olsa **aynı mesaj** — hangi kodların gerçek olduğu sızmasın |
| Öğretmen e-posta ile ekler | `POST /teacher/ogrenci` | **Başka sınıftaki öğrenci 409 ile reddedilir** ↓ |
| Yönetici taşır | `POST /admin/kullanici/:id/sinif` | İzli, §11 |

> ⚠️ **Sessiz devralma kapatıldı.** Önceden `POST /teacher/ogrenci` `teacher_id`'yi koşulsuz
> üzerine yazıyordu: öğretmen A, e-postasını bilerek öğretmen B'nin öğrencisini alabiliyordu.
> Ne B haberdar oluyordu ne de öğrenciye soruluyordu — B'nin sınıf ortalaması ve ısı haritası
> sebepsiz değişiyordu. Devir meşru olabilir, ama kararı **devralan öğretmen veremez**: ya
> öğrenci kendisi katılır ya yönetici taşır.

---

<a name="10"></a>
## 10. Öğretmen paneli

**Görür:** sınıf özeti + 84 günlük trend · mevcut listesi · kazanım ısı haritası · motorun
işaretlediği zayıf kazanımlar · **öğrencinin tam bilişsel röntgeni** · cevap logları · ödev
geçmişi · soru havuzu.

**Yapar:** havuzdan ödev derler · hedefli set gönderir · e-postayla öğrenci ekler · sınıftan çıkarır.

### Teşhis dili öğretmende AÇIK

`TESHIS_DILI_YOK` teşhis dilini **öğrenciye** yasaklıyor. Öğretmen kuralın muhatabı değil
**koçudur** → `rontgenGovdesi(userId, { teshisGoster })`. `misconceptions` anahtarı yalnız
`teshisGoster: true` iken **eklenir**; öğrenci ucunun yanlışlıkla taksonomi sızdırması
yapısal olarak imkânsızdır.

### Sınıf analitiği RPC'leri (0016) — N+1 katilleri

| RPC | Kapattığı N+1 |
|---|---|
| `sinif_ozeti(teacher_id, days)` | roster + öğrenci başına 3 sorgu = `1+3N` → **1** |
| `sinif_isi_haritasi(...)` | 30 öğrenci × ~900 düğüm = 27k satır → **1** |
| `sinif_zayif_kazanimlar(...)` | öğrenci başına `weak_kazanimlar` → **1** |

> ⚠️ **`v_mastery_rollup` KULLANILMAZ** — `avg(mastery)` ham, çürütülmemiş değerdir (0014 bunu
> zaten kusur olarak yazıyor). Öğrenciye gösterilmesi engellenen şişik sayıyı öğretmene
> göstermek aynı yalandır, üstelik daha zararlıdır: **öğretmen ona bakıp müdahale etmez.**

> ⚠️ **Isı haritası iki katmanlı ortalama alır** (önce öğrenci-içi, sonra öğrenciler arası).
> Tek katmanlı `avg(m_eff)`, 40 düğüme dokunmuş öğrenciyi 2 düğüme dokunmuşun 20 katı
> ağırlıklandırır — "sınıf ortalaması" o zaman sınıfın değil, en çalışkanın haritası olur.

> ⚠️ **Zayıf kazanımlar yaygınlığa göre sıralanır**, şiddete göre değil. Sınıf müdahalesi
> yaygınlığı hedefler; bireysel şiddet zaten öğrenci röntgeninde.

### Ödev derleme — iki şekil arasındaki sessiz kırılma

```
havuz     : options = {"A":"…","B":"…"}   correct_option = 'C'    (HARF)
questions : options = ["…","…"]           correct_answer = "…"    (METİN)
```
Havuz uuid'lerini doğrudan `question_ids`'e yazmak öğrenciye **sıfır soru** gösterirdi, hatasız.
`lib/odev-derle.ts` dönüşümü yapar; doğru şıkkın metni çözülemeyen soruyu **atlar** (aksi hâlde
"her zaman yanlış" olurdu) ve ayrıca sayar.

**Geniş havuza hazır:** `havuzdanSec()` `order by random()` yerine rastgele pencere örneklemesi
kullanır (`pencere = min(toplam, max(adet*5, 50))` + Fisher–Yates) — ölçekte tam tarama yapmaz.
Kazanım başına kota + `kaynak_soru_id` (0018) ile tekrar gönderim dışlaması.

`POST /teacher/odev` **LLM ÇAĞIRMAZ** — mevcut havuzdan derler. `generateVerifiedSet`'e bağlamak,
öğretmenin tıklamasının arkasına 97–199 sn'lik senkron LLM zinciri koymak olurdu. Havuz yetmezse
**soru uydurulmaz**, eksik görünür olur.

---

<a name="11"></a>
## 11. Yönetici paneli (Kule)

Motor dairesi + kullanıcı yönetimi. **Yedi ekran** (0025'te 4→7):

| Ekran | Yol | Ne yapar |
|---|---|---|
| Yönetim | `/kule` | Sistem sağlığı: havuz · eval · ajan görevleri |
| Kullanıcılar | `/kule/kullanicilar` | Hesap aç · rol · onay · sınıf · künye · şifre · **askı** · başvuru reddi |
| **Sınıflar** | `/kule/siniflar` | Öğretmen seç → sınıfını **onun gözüyle** aç (`?ogretmenId`) |
| Soru Havuzu | `/kule/havuz` | Özet + **Sorular** sekmesi (moderasyon çekmecesi) |
| Özgünlük | `/kule/ozgunluk` | Bariyerin ölçümü ve ispat tablosu (salt-okunur) |
| **Denetim** | `/kule/denetim` | Filtreli defter + CSV |
| **Ayarlar** | `/kule/ayarlar` | Kendi künyesi · şifre · **eşik editörü** · ops düğmeleri |

> ⚠️ **Eşik AYARLAR'da, Özgünlük ekranında değil.** O ekran bariyeri *açıklar*, burası
> *değiştirir*. Ayırmak "okurken yanlışlıkla değiştirme" riskini kaldırır.

> ⚠️ **Sınıf sekmesi navda YOK.** Yönetici sınıfa Sınıflar ekranından, kapsam seçerek girer;
> içeride gezinme **vekil şeridinden** sürer (üst nav yöneticide Kule sekmelerini gösterir).
> Kapsamsız `/sinif` isteği "önce bir sınıf seç" ekranıyla karşılanır — beş panel dolusu
> hata toast'ı değil.

### Okuyan uçlar

| Uç | Önbellek | Gerekçe |
|---|---|---|
| `/admin/havuz`, `/admin/eval`, `/admin/ozgunluk` | 10 dk | Kişisel veri yok, her admin için aynı |
| `/admin/gorevler` | **yok** | Ops sağlığı. Önbellekli "takılan yok" panelsizlikten kötüdür |
| `/admin/kullanicilar`, `/admin/denetim` | **yok** | Onay ve denetim anında yansımalı |
| **tüm `/teacher/*`** | **yanıt önbelleği YOK** | Anahtarsız modül önbelleği **öğretmenler arası veri sızıntısıdır** — 0014'ün kapatmak için yazıldığı hatanın aynısı |

### Yazan uçlar — üç ortak disiplin (`admin-yonetim.routes.ts`)

1. **Her mutasyon denetlenir.** `yonetim_denetim`e yazılır; yazılamazsa yanıt
   `denetimYazildi: false` döner ve **ekranda uyarı çıkar**. Sessizce izsiz kalan bir yetki,
   yetki değil açıktır.
2. **Her mutasyon önbellek düşürür** (`kimligiUnut` / `sinifiUnut`) — yoksa yetki katmanı
   60 saniye eski gerçeği söyler.
3. **Kendini yetkisizleştiremezsin.** Bu panelin onarılamaz TEK hatası budur; kurtarmak elle
   SQL gerektirir. İki kapı: kendi **rolünü** değiştiremez, kendi hesabını **askıya alamaz**.
   Üçüncüsü sistem çapında: **son (askıda olmayan) yönetici** düşürülemez ve askıya alınamaz.

| Uç | Notlar |
|---|---|
| `POST /admin/ogretmen/:id/onay` | Onay **verme** tek tık; **kaldırma** diyalogdan geçer (öğretmen 60 sn'de sınıfını kaybeder) |
| `POST /admin/kullanici/:id/rol` | ↓ üç yan etki |
| `POST /admin/kullanici/:id/sinif` | Öğrenciyi taşı/çıkar. Onaysız öğretmene atama reddedilir — o sınıf hiçbir panelde görünmez |
| `POST /admin/kullanici` | **Davetle** hesap açar (`inviteUserByEmail`). Şifreyi yönetici belirlemez; SMTP yoksa 502 + `davetGonderildi:false` — "hesap açıldı" DEMEZ |
| `PATCH /admin/kullanici/:id` | Yalnız künye (`name · school · grade · student_class`). Rol/onay/sınıf **buradan yazılamaz** — her birinin kendi kapısı ve koruması var |
| `POST /admin/kullanici/:id/aski` | Hesabı durdurur. **Gerekçe zorunlu** · `kimligiUnut` zorunlu (yoksa askı 60 sn hiçbir şey yapmaz) |
| `POST /admin/basvuru/:id/reddet` | Onayın karşılığı: kuyruğu kapatır, **role dokunmaz** |
| `POST /admin/gorev/:id/yeniden` | ↓ `attempts` tuzağı |
| `POST /admin/gorev/:id/iptal` | Tersi: FAILED'a çeker **ve `attempts=3`** yapar — yoksa bekçi görevi yeniden toplardı |

**Rol değişiminin yan etkileri (hepsi zorunlu):**
- `teacher →` başka rol: **sınıfı boşalır.** Yapılmasaydı öğrenciler artık öğretmen olmayan bir
  id'ye bağlı kalır — hiçbir panelde görünmez, kimse ödev atayamaz, **sessizce kaybolurlar.**
- `→ teacher`: sınıf kodu üretilir + `is_approved = true` (yönetici elle terfi ettiriyor;
  ikinci tıklama beklemek yeni öğretmeni sebepsiz 403'te bırakırdı)
- `→ student dışı`: kendi `teacher_id`'si de kopar (öğretmenin bir sınıfta "öğrenci" olarak
  durması `GET /sinif` ile `sinif_mevcudu`'nu çelişkiye düşürürdü)
- `son_yonetici` koruması: pratikte erişilemez (tek yönetici varsa o sensindir ve `kendi_rolun`
  kapısına takılırsın) ama kural açık yazılı durur

> ⚠️ **`attempts` sıfırlanmadan görev yeniden kuyruklanamaz.** Bekçi
> ([atolye.worker.ts:66](learnup-brain/src/workers/atolye.worker.ts#L66)) `attempts >= 3` olan her
> PENDING görevi anında FAILED'a çeviriyor — sıfırlanmasaydı uç görünürde çalışır, görev 5 dakika
> içinde sessizce geri düşerdi. Yanıttaki `akisaItildi: false` ise görev kaybolmaz, **gecikir**
> (bekçi 5 dk içinde toplar) — bunu söylemek yöneticinin arka arkaya tıklamasını engeller.

### Denetim defteri — `yonetim_denetim` (0020)

**Append-only.** `UPDATE`/`DELETE` satır tetikleyicisiyle, **`TRUNCATE` statement
tetikleyicisiyle** engellenir.

> ⚠️ Satır düzeyi tetikleyici TRUNCATE'te **çalışmaz**. İlk sürümde bu açıktı: kilit yerindeyken
> bile `truncate yonetim_denetim` bütün defteri silerdi. Doğrulama sırasında yakalandı, ikinci
> tetikleyiciyle kapatıldı.

Alanlar: `admin_id · eylem · hedef_id · hedef_tur · detay jsonb · created_at`.
`hedef_tur`: `kullanici · gorev · ogretmen · soru · sistem`.
RLS açık + politika yok → `authenticated` hiçbir satır göremez; okuma yalnız
`GET /admin/denetim` üzerinden, `requireRole('admin')` kapısının ardından. Kanonik eylem
listesi **kodda**: `lib/denetim.ts → DenetimEylemi` (DB'de CHECK yok; yeni yetki eklemek
migration beklemesin diye 0020 böyle bıraktı).

| Grup | Eylemler |
|---|---|
| 0020 | `ogretmen_onay · rol_degis · sinif_ata · gorev_yeniden` |
| Hesap (0025) | `hesap_olustur · profil_duzelt · sifre_sifirla · hesap_askiya · hesap_geri_al · basvuru_reddet` |
| Havuz (0025) | `soru_dogrulama · soru_karantina · soru_etiket · uretim_tetik` |
| Ops (0025) | `esik_degis · eval_tetik · onbellek_dus · gorev_iptal` |
| Vekil (0025) | `ogretmen_adina_odev · ogretmen_adina_ogrenci` |

Ekran: **`/kule/denetim`** — eylem · yönetici · hedef · tarih filtreleri, sayfalama, CSV
(yalnız görünen sayfa; bu ekranda açıkça yazılır).

### Havuz moderasyonu (0025) — `admin-havuz.routes.ts`

> ⚠️ **METİN DÜZENLEME YOK.** `PATCH /admin/havuz/soru/:id` yalnız `difficulty` + `kazanim_id`
> yazar. Soru gövdesini elle değiştirmek iki şeyi birden bozar: `content_hash` dedup'u (aynı
> soru yeniden üretilip ikinci kez havuza girer) ve eval ölçümü (hattın ürettiği metin ile
> ölçülen metin ayrışır). **Bozuk soru düzeltilmez, karantinaya alınır.**

> ⚠️ **`karantina` ≠ `verified=false`.** `verified` doğrulama hattının kararıdır ve kalite
> metriğinin paydasıdır; `karantina` insan müdahalesidir. Aynı kolona bindirmek "hattımız
> kötüleşti" diye okunacak sahte bir kalite düşüşü üretirdi. **Servis eden her sorgu ikisini
> de dışlar** (`test-modes · odev-derle · practice · aiquestions · teacher/soru-havuzu ·
> topup-planner`); panel ikisini **ayrı** sayar.

Üretim tetikleme mevcut güvenli yolu kullanır: `forge_topup` görevi (`agents/ritim.ts`) —
istemci yalnız *hangi kazanım* der, ders/konu/başlık `curriculum_nodes`'tan türer, tavan 10.

### Özgünlük eşikleri — koddan DB'ye (0025)

`ozgunluk_esikleri` tablosu + `PUT /admin/ozgunluk/esik`. `utils/benzerlik.ts`'teki tablo
**fallback olarak kalır**: DB boş/erişilemezse üretim koddaki değerlerle sürer — eşiksiz
üretim = bariyersiz üretim. `ozgunlukEsigi()` **senkron kalır** (üretimin sıcak yolunda,
aday başına çağrılıyor); tazeleme `lib/ozgunluk-esik.ts` üzerinden 60 sn önbellekle
arka planda yapılır ve `generateVerifiedSet` girişinde tetiklenir. Panel `kaynakDB: false`
gördüğünde bunu **ekranda söyler** — yönetici yürürlükte olmayan bir eşiği düzenlediğini sanmasın.

### Eval anlıkları — dosyadan DB'ye (0025)

> 🚨 **Sessiz veri kaybı, kapatıldı.** Anlıklar `learnup-brain/eval-sonuclari/*.json`
> dosyalarındaydı; o dizin için **Docker volume yok** ve brain imajı kaynağı COPY ediyor →
> panelin gösterdiği ölçüm geçmişi imaja gömülüydü ve her `up --build` ile sıfırlanıyordu.

`eval_anliklari` tablosu asıl kaynak; dosyalar yalnız yedek (`lib/eval-anlik.ts` önce DB'ye
bakar). `POST /admin/eval/kosum` → `eval` görev türü (`bus.ts` + `ritim.ts`) → `lib/eval-olc.ts`
ölçümü koşar ve tabloya yazar. **Senkron koşmaz** (binlerce soru, O(n²) NN benzerliği) ve
aynı anda ikinci koşum 409 ile reddedilir.

**`/uretim-hatti` kasten YOK** — §17.

---

<a name="12"></a>
## 12. API yüzeyi

Tüm route'lar hem `/api` hem `/api/v1` altında mount edilir (`app.ts`).

```
/chat                 SSE — compression YOK, chatLimiter
/tests /agents /questions /ai       llmLimiter
/telemetry /question-state /answers /questions/osym /questions/ai
/practice /mastery /assignments /gamification /garden /account   standardLimiter
/sinif                kimlikli  (rol kontrolü handler içinde)
/teacher              kimlikli → standardLimiter → requireOgretmenKapsami
/admin                kimlikli → standardLimiter → requireRole('admin')
```
`kimlikli = [requireAuth, requireAktifHesap]` — **tek sabitte** tanımlı (0025). Yeni bir router
eklerken kapılardan birinin sessizce unutulması bu sayede imkânsız.
`standardLimiter` **rol kapısından önce** — rol yoklayan döngü de sınırlansın.

**Öğretmen (13):** `GET /ozet · /sinif · /sinif/isi-haritasi · /sinif/zayif-kazanimlar ·
/ogrenci/:id · /ogrenci/:id/rontgen · /ogrenci/:id/loglar · /odevler · /soru-havuzu` ·
`POST /odev · /hedefli-odev · /ogrenci` · `DELETE /ogrenci/:id`
→ hepsi yöneticide **`?ogretmenId` ile** çalışır (0025).

**Yönetici (25):**
`GET /havuz · /eval · /ozgunluk · /gorevler · /kullanicilar · /kullanici/:id · /denetim ·
/havuz/sorular · /havuz/soru/:id`
`POST /ogretmen/:id/onay · /kullanici · /kullanici/:id/rol · /kullanici/:id/sinif ·
/kullanici/:id/sifre-sifirla · /kullanici/:id/aski · /basvuru/:id/reddet ·
/havuz/soru/:id/dogrulama · /havuz/soru/:id/karantina · /havuz/uretim · /eval/kosum ·
/onbellek/dus · /gorev/:id/yeniden · /gorev/:id/iptal`
`PATCH /kullanici/:id · /havuz/soru/:id` · `PUT /ozgunluk/esik`

**Sınıf (3):** `GET /sinif` · `POST /sinif/katil · /sinif/ayril`

### Hata sözleşmesi
`HttpHatasi(status, code, message)` → gövde `{ error, message }`. `middleware/error.ts` yalnız
**kasıtlı** hataların mesajını dışarı verir; 4xx `warn`, 5xx `error` loglanır. Ham `err.message`
sızdırılmaz — Postgres hataları tablo/kolon adı taşır.

---

<a name="13"></a>
## 13. Migration tarihçesi

Supabase Dashboard → SQL Editor → dosya içeriğini yapıştır → RUN. **Hepsi idempotent.**

| # | Dosya | Ne yapar |
|---|---|---|
| 0001 | `init` | Beyin çekirdeği: 9 tablo (curriculum ltree, yks_questions, knowledge/exemplars 768d, question_states, roadmaps, agent_tasks, chat_messages, osym_blueprint) + RLS |
| 0003 | `functions` | Retrieval RPC'lerinin `public.`-nitelikli kanonik kopyası + HNSW/GiST indeksler |
| 0004 | `unification` | Birleşme + **kaynak ayrımı** (enum + değişmezlik trigger'ı) + **`record_answer` atomik RPC** + agent_tasks kilit kolonları + Realtime + md5 dedup |
| 0005 | `agents` | Ajan katmanı: `user_mastery` · `student_memory` · `session_summaries` (+768d) · `nudges` · `prereq_paths` · `weak_kazanimlar` rewrite · `match_session_memories` · `v_mastery_rollup` |
| 0006 | `cleanup` | Eski `user_activities` artığını siler. **Yalnız 0004+0005'ten sonra** |
| 0007 | `curriculum_code_unique` | `(subject, code)` UNIQUE |
| 0008 | `yks_knowledge_unique` | `(subject, kazanim_code)` UNIQUE + mükerrer temizliği |
| 0009 | `sorular` | ÖSYM çıkmış sorular (2018–2025) şema hazırlığı |
| 0010 | `osym_kunye` | 0009'un fazlalığı: `yks_questions.source` kaldırılır |
| 0011 | `atomik_ekonomi` | Coin · envanter · bahçe · görev ödülü atomik |
| 0012 | `brief_atomik` | Ajan brief'leri atomik yazılır |
| 0013 | `ai_ayrik_tablo` | AI soruları kendi tablosuna: `yks_ai_questions` |
| 0014 | `mastery_rollup_guvenlik` | `v_mastery_rollup` RLS baypasını kapatır |
| 0015 | `exemplar_kunye` | TYT/AYT çapası + kazanım bağlantısı |
| 0016 | `rol_ve_panel` | **`admin` rolü** + `handle_new_user()` beyaz listesi + onay geri-doldurması + 2 indeks + 4 sınıf RPC'si |
| 0017 | `zorluk_eslesmeli_ornek` | `match_yks_exemplars` zorluğu tutan örneği öne alır |
| 0018 | `odev_kaynak_izi` | `questions.kaynak_soru_id` — tekrar gönderim dışlaması |
| 0019 | `profil_kolon_yetkisi` | 🚨 **Ayrıcalık yükseltme açığını kapatır** (§9) |
| 0020 | `yonetim_denetim` | Yönetici eylem defteri, append-only (§11) |
| 0021 | `ogretmen_basvuru` | Başvuru kolonları + kayıt kapısı sertleştirmesi |
| 0022 | `zorluk_siralama_nulls_last` | Etiketsiz zorluk sıralamada sona |
| 0023 | `isi_ogrenci_kirilimi` | Isı haritası hücresinde öğrenci kırılımı |
| 0024 | `acik_ogretmen_kaydi` | Kayıtta "Öğretmenim" — yönetici onayı kaldırıldı |
| 0025 | `yonetici_yetki` | **Yönetici yetki genişletmesi:** `profiles` askı kolonları · `ozgunluk_esikleri` · `yks_ai_questions.karantina` · `eval_anliklari` (§9, §11) |

**0025'in üç dürüstlük ayrıntısı:**
- Askı kolonları 0019 GRANT beyaz listesine **eklenmez** — aksi hâlde askıdaki kullanıcı
  tarayıcı konsolundan kendi askısını kaldırırdı (0019'un kapattığı açığın aynısı).
- `karantina` ayrı kolon: `verified`'a bindirilseydi insan müdahalesi hattın kalite
  metriğini kirletir, sahte bir kalite düşüşü olarak okunurdu.
- `ozgunluk_esikleri` **seed'i `on conflict do nothing`** — yeniden koşum, yöneticinin
  panelden değiştirdiği eşiği kod varsayılanına geri çevirmez.

**0016'nın hayat kurtaran ayrıntısı:** `is_approved` `default false` ve kod hiçbir yerde `true`
yapmıyordu. Geri-doldurma olmadan onay kapısı **deploy günü her öğretmeni kilitlerdi**.

**İlk yönetici elle verilir:**
`update public.profiles set role='admin' where email='…';`
`ADMIN_BOOTSTRAP_EMAIL` gibi env-güdümlü otomatik terfi **eklenmeyecek** — yanlış yapılandırılmış
bir deploy'u bekleyen ayrıcalık yükseltmesidir.

---

<a name="14"></a>
## 14. Frontend — FİDAN

> **2026-07-21:** COASTAL/denizcilik tasarım dili emekli edildi — kullanıcı kararı: "sıkıcı ve
> soğuk kaldı". Yerine **FİDAN**: organik doğa, **AÇIK tema varsayılan** (Gün Işığı), koyu
> (Gece Ormanı) tercihe bağlı, arayüz metinleri düz işlevsel. Görsel dilin TEK kaynağı
> [`docs/design/TASARIM-DILI.md`](docs/design/TASARIM-DILI.md) — palet/tipografi/bütçe buraya
> kopyalanmaz. Dönüşüm kart-bazlıdır (`docs/agents/handoff/`): metin dönüşümü GOREV-002,
> rozet adları GOREV-003/004, görsel sahneler sonraki kartlar — kodda geçici COASTAL kalıntısı
> olabilir, hedef her zaman FİDAN'dır.

İki tema: **Gün Işığı** (açık — VARSAYILAN) / **Gece Ormanı** (koyu — tercihe bağlı).
Değişkenler: `--data-hue`, `--heat-zero`, `--page-bg`.

**İmza yerleşim:** `lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]`
**Sarmalayıcı:** `mx-auto max-w-7xl px-[clamp(16px,3.5vw,44px)] pb-20 pt-9`

### Bütçeler (aşılmaz — kanonik liste TASARIM-DILI §9)
- Görünüm başına **≤3 bulanık yüzey** — ferahlık camdan değil, katmanlı mat yüzeylerden
- Sayfa başına **1 ışıltı vurgusu** — bakılması gereken tek sayıya gider
- Sayfa başına **1 canlı nokta** — zaten `ProfileMenu` tarafından harcandı → yeni ekran `StatusLine` kullanır
- **Kehribar yalnız ÖSYM mührünün kimliğidir** (eski "brass") — 2026-07-22 telif kararıyla RAFTA:
  şu an hiçbir ekranda kullanılmaz
- **Denizcilik terimi kullanıcı metnine giremez** — adlar düz işlevseldir (TASARIM-DILI §6)

### Reveal kadansı
başlık `0` → KPI `0.04` → sol `0.10/0.16/0.20` → sağ `0.14/0.18/0.22/0.26`.
Sol ve sağ iç içe geçer (göz çapraz okur). **`0.3` aşılmaz** — ötesi koreografi değil gecikme.

### Ekranlar

| Rol | Nav | Ekranlar |
|---|---|---|
| Öğrenci | 6 sekme | Bugün · Harita · Rota · Kaptan · Bahçe · Ben — *Arşiv 2026-07-22 telif kararıyla kaldırıldı (dosya ölü)* |
| Öğretmen | 5 sekme | SinifPanosu · SinifIsi · OdevAtolyesi · Karsilastir · Ben |
| Yönetici | 4 sekme | Kule · Kullanicilar · SoruHavuzu · OzgunlukBariyeri |

> Tablodaki adlar **bileşen/kod adlarıdır** ve değişmez. Kullanıcıya görünen nav **etiketleri**
> FİDAN §6 tablosuna göredir: Analizler · Çalışma Planı · Koç · Profilim ·
> Yönetim · Özgünlük Denetimi (dönüşüm: GOREV-002; Çıkmış Sorular 2026-07-22'de kaldırıldı).

**Nav eklemeli değil, kapsamlı.** Öğretmen `/harita`, `/bahce`, `/rota` görmez — bunlar öğretmen
hesabında **verisi olmayan** kişisel ekranlar. Üç rolü birleştirmek 16 sekmelik bir nav üretirdi.

`/ben` rol duyarlı: rütbe halkası, lig, günlük görevler, rozet galerisi yalnız öğrencide;
öğretmen/yöneticide yalnız avatar + Hesap kalır.

### `RolGecidi` — üç hâl, ikisi değil

```
profilYukleniyor → <PanoIskeleti/>     ← ASLA yönlendirme yok
reddedildi       → <YetkiYok/>          ← sessiz redirect değil
geçti            → <Outlet/>            (gerekirse SinifSaglayici ile sarılı)
```

> ⚠️ **Bekleme hâlinin varlığı bu panelin en kritik detayı.** `auth.tsx`'teki `loading` yalnız
> **oturumu** kapsıyor; `profile` ikinci bir effect'te geliyor ve o pencerede `null`. `profile.role`
> okuyan naif bir kapı **her sert yenilemede "yetkiniz yok" diye yanıp söner.** Çözüm:
> `profilYukleniyor` bayrağı.

### Diğer disiplinler
- **Asla yalnız renk:** her risk satırı kelimeli rozet taşır ("yüksek risk"), her seçim ikon taşır
- **İyimser güncelleme yok:** öğretmen/yönetici mutasyonları sunucu hakikatini değiştirir → dönen ikon + devre dışı buton → `reload()`
- **Yıkıcı eylem = Radix `Dialog`**, asla `window.confirm`
- **Drill-down state URL'de:** `?ders=` `?ogrenci=a,b,c` — "şu Kimya sütununa bak" öğretmenin gerçekten attığı mesaj. `setParams(p, {replace: true})` — onsuz on filtre tıklaması on geri tuşu demek
- **`useAsync` bağımlılıkları İLKEL geçilir** (`[ders, sirala]`, asla `[filtreler]`) — nesne = sonsuz refetch
- **⌘K mutasyon içermez.** Bulanık aramanın arkasındaki yıkıcı eylem ayak kurşunudur; palet gezinme + tema ile sınırlı

---

<a name="15"></a>
## 15. İşletme kılavuzu

### Kurulum
```bash
# Bun (Windows PowerShell):  irm bun.sh/install.ps1 | iex
cd learnup-brain && bun install
cp .env.example .env          # SUPABASE_*, OPENROUTER_API_KEY, OPENAI_API_KEY
bun run typecheck             # sıfır hata beklenir
bun run start                 # API :8080
```
```bash
cd frontend-v2 && bun install && bun run dev     # :5174
```
> ⚠️ `frontend-v2`'de **typescript ve eslint kurulu değil** — `bun run lint` çalışmaz ve
> `vite build` tipleri **denetlemez**, yalnız soyar. Tip denetimi için:
> `../learnup-brain/node_modules/.bin/tsc --noEmit -p tsconfig.json`

### Soru üretim hattı
```
çıkmış sorular (ÖSYM)
   │  etiketle              ($0, ücretsiz model, ~1000 istek/gün kotası)
   ▼
data/etiketler-cikmis.jsonl        ← önce DOSYAYA, asla doğrudan DB'ye
   │  etiket-yaz --evet             (yalnız difficulty kolonu)
   ▼
yks_questions + yks_exemplars
   │  havuz-doldur                  (yazar LLM → kod kapıları → bedava denetçi)
   ▼
yks_ai_questions
   │  eval                          ($0 — "bozdum mu?" kapısı)
   ▼
öğrenciye servis
```

| Komut | İş | Maliyet |
|---|---|---|
| `bun run eval` | Altın-set regresyonu + yapısal karşılaştırma + drift. İhlalde exit 1 | $0 |
| `bun run eval --hakem --evet` | + LLM'li hakem tutarlılık sınavı | ~$0.01 |
| `bun run etiketle` | Zorluk etiketi (checkpoint'li, kaldığı yerden sürer) | $0 |
| `bun run etiket-yaz` / `--evet` | Kuru koşu / DB'ye yaz | $0 |
| `bun src/scripts/havuz-doldur.ts --hedef N [--only mat]` | Havuzu N doğrulanmış soruya tamamla | yazar modeline bağlı |
| `bun src/scripts/ab-uretim.ts --etiket X --hedef N --tavan USD` | Tek yazar modelle üretim kolu, sert dolar tavanlı | tavan kadar |
| `bun src/scripts/ab-karsilastir.ts kol1 kol2` | İki kolun tablosu + tam metinler | $0 |
| `bun src/scripts/denetci-sinav.ts` | Denetçi adayı modelin sınavı (8 vaka) | $0 |

### Model rolleri
**Tek kaynak `src/lib/model-router.ts` CHAINS** — `.env` override'ı BAYATLAR, kullanma.

- **Yazar (generate):** `deepseek-v4-pro` — soru başına ~$0.025 (maliyetin ~%80'i düşünme token'ı).
  Ücretsiz alternatif `gemma-4-26b:free` — kabul kalitesi eşdeğer (hakem 4.43 vs 4.2) ama yavaş
  ve zor kademesinde ayrıştırma kayıplı.
- **Denetçi (verify):** `nemotron-3-ultra-550b:free` — sınavla doğrulandı (7/8; çekirdek 8/8).
- **Yazar ≠ denetçi, AYRI model ailesinden olmalı** — kendini denetleyen model cömerttir (ölçüldü).

**Yönlendirici:** `route(role) → [birincil :free, alternatif :free, PAID]`. Dakika penceresi
(`INCR lb:llm:win:{dk}`, 18'de kes), günlük sayaç (1000/gün), devre kesici
(`lb:llm:cb:{slug}`, 429/5xx'te 30 sn→5 dk üstel soğuma). **Zincir daima paid slug'da biter** —
öğrenci sohbet ortasında asla hata görmez.

### Sabit kurallar
1. **Harcama onayı:** paralı koşu öncesi tahmini maliyet söylenir, onay alınır. Sert tavan
   (`--tavan` / `maliyetTavani()`) — aşacak çağrı **hiç gönderilmez**.
2. **DB'ye yazım iki aşamalı:** önce dosyaya, incelenip onaylanınca DB'ye.
3. **Zamanlanmış görev yok:** her koşu elle başlatılır.
4. **Eşikler ölçümden türetilir** (yüzdelik + yanlış-alarm tablosu), asla uydurulmaz; gerekçe
   eşiğin yanına yorum olarak yazılır.
5. **Commit'i kullanıcı atar.**

### Özgünlük eşikleri (Jaccard 4-gram, `utils/benzerlik.ts`)
Matematik 0.75 · Türkçe 0.85 · Biyoloji 0.70 · Kimya 0.56 · Türk Dili ve Edebiyatı 0.43 · taban 0.35

---

<a name="16"></a>
## 16. Altyapı, arıza modları, deploy

### İki süreç, nokta

| Süreç | Giriş | Rol |
|---|---|---|
| **api** | `src/server.ts` | HTTP + SSE. Stateless. `keepAliveTimeout=65s`, `requestTimeout=0` |
| **worker** | `src/workers/atolye.worker.ts` | `lb:tasks` consumer'ı + gömülü zamanlayıcı |

Görev kinds: `forge_topup · plan · diagnose · affect · compact · nudge · closure_check`.

**Bekçi (janitor), 5 dk:** bayat `RUNNING` → `PENDING` + re-XADD; `attempts≥3` → `FAILED`.
`RUNNING_BAYAT_MS = 15 dk` — **en uzun görevden uzun olmak zorunda.** Eskiden 2 dk idi ve worker A
hâlâ üretirken bekçi görevi "takılmış" sanıp yeniden kuyruğa atıyordu; worker B aynı işi baştan
yapıyordu → **LLM faturası iki katına çıkıyordu.**

**Idempotency:** `agent_tasks` + CAS-claim (`UPDATE ... WHERE status='PENDING' OR (RUNNING AND
locked_at < eşik) RETURNING`); CAS kaybeden teslimat sessizce ACK. Üretim insert'lerinde
`md5(question_text)` partial-unique dedup.

### Arıza modları

| Arıza | Davranış |
|---|---|
| Free LLM 429/kota | Kesici → sonraki slug → paid. Pratik etkilenmez (havuz) |
| Tüm LLM'ler çökük | Chat kibar Türkçe hata; pratik/test/gamification/bahçe tam çalışır |
| **Redis çökük** | API tam servis; ajanlar in-process; **veri kaybı yok** (PG-önce). Yetki DB'ye düşer, "izin ver"e değil |
| Supabase çökük | 503 — tek hakikat deposu |
| Worker crash | ≤5 dk'da bekçi görevi geri kuyruğa alır; CAS + dedup çift işi önler |

**Sıfır bellek kaybı iddiasının tamamı:** Postgres hiç yazılmamazlık etmez; Redis'teki her şey
ya cache ya sinyaldir.

### Deploy
Tek VPS (~$5–15/ay): Docker Compose — `api` (bun) + `worker` (bun) + `redis:8-alpine` (AOF açık)
+ Caddy TLS. Supabase hosted.

---

<a name="17"></a>
## 17. Açık işler

### A5 — Üretim telemetrisi (onay bekliyor)

**Sorun:** `generateVerifiedSet` içinde 9 ayrı `return null`, sıfır kalıcılık. Eval anlıkları
tanım gereği yalnız havuza girmiş soruları ölçer. "Kaç aday üretildi, hangi kapı kaçını eledi,
kaç onarım tuttu" bugün cevapsız.

**Plan:**
- Yeni `uretim_telemetri` tablosu (**0021**). Tane: **tur başına bir satır** (aday başına değil —
  tur ≤3, huni tur düzeyinde zaten tam; aday başına satır yazımı ~5× artırır, bilgi eklemez)
- `eleme jsonb` anahtarları `return null` noktalarıyla birebir: `plan · latex · kusatma ·
  uzunluk_sizinti · kok_uzunlugu · ozgunluk · hakem_ret · hakem_onarim_ret · hata`
- `onarim jsonb`: `latex · kusatma · uzunluk · hakem`
- `generation.ts`'e **3 dokunuş**: koşum id'si, tur başına 13 sayaç, tur sonunda **ateşle-ve-unut**
  yazım (`await` yok, `throw` yok — doğrulanmış, parası ödenmiş sorular telemetri yüzünden düşmez)
- Sıfır-aday dalı da yazar, `aday: 0` ile. O bir **arıza**, eleme değil — sayaçlara karıştırılmaz
- Sonra `/admin/uretim-hatti` + Kule'de `UretimHunisi`: **Sankey değil** (recharts 3'te yok,
  `d3-sankey` tek grafik için yeni bağımlılık), orantılı `Meter` satırları + `−N (%x)` düşüş satırı

**Neden bekliyor:** `generation.ts` havuz üretim hattının kalbi ve havuz doldurma **ayrı bir iş
kolu**. Ayrıca huni boş tabloya karşı anlamsız; boş yayınlamak birinin onu eval JSON'undan
"doldurmasını" davet eder — bu tasarımın önlemek için var olduğu uydurmanın ta kendisi.

### Bilinen açık konular
- Zorluk dağılımı kolaya çarpık (hakem muhafazakâr); etiketleme bitince eval'in ÖSYM-dağılım
  karşılaştırmasıyla ele alınacak
- Gemma zor kademesinde ayrıştırma kaybı — ham çıktılar `data/uretim-hata/`'ya düşüyor
- Havuzda 1 bilinen ikiz çift (v4-pro uzaklık soruları, 0.620); parti-içi süzgeç yenilerini
  engelliyor, mevcut çiftin biri temizlenmeli
- **Havuz kapsaması:** 268/907 kazanımda (%29,5) soru var; Türk Dili ve Edebiyatı 8/244 (%3,3).
  Triaj kuyruğu çoğu satırda "havuz boş" diyor — panel gerçeği doğru raporluyor
- `school` alanı kayıtta `handle_new_user()` tarafından yazılmıyor. 0019 beyaz listesinde olduğu
  için giriş sonrası istemci yazımı uygulanabilir bir çözüm
- `teacher_ids` (çoklu öğretmen) **okunuyor ama hiçbir yerde yazılmıyor** — kayıt akışı yalnız
  `teacher_id` yazar

---

*Her LLM kuruşu ya öğrenciye dokunan bir cümleye, ya bir yanılgının teşhisine, ya da bir anının
damıtılmasına gider — başka hiçbir şeye.*
