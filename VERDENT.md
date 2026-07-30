# VERDENT.md — LearnUp Ajan Rehberi

> Bu dosya Verdent AI ajanlarının projeyi doğru anlaması için yazıldı.
> **Derin mimari gerekçeler için tek kaynak:** [`YKS-BEYIN-SISTEM-MIMARISI.md`](YKS-BEYIN-SISTEM-MIMARISI.md) (17 bölüm).
> Bu dosya onun operasyonel özetidir — çelişki olursa mimari dokümanı kazanır.

---

## 0. Proje nedir

LearnUp bir **YKS (Türkiye üniversite sınavı) hazırlık platformu**. Öğrenciye tek bir persona
("Kaptan") üzerinden konuşan, arkada görünmez uzman ajanlar çalıştıran, kendi soru havuzunu
LLM ile üretip **kod kapılarıyla denetleyen** bir sistem.

**Ürün dili Türkçe'dir.** Kod yorumları, commit mesajları, hata mesajları, değişken adlarının
alan-özgü kısmı ve tüm dokümantasyon Türkçe yazılır. İngilizce yalnız framework/kütüphane
sözleşmelerinde kalır (`useEffect`, `router`, `status`, `embedding` vb.).

### İki soru dünyası — birbirine karışmaz

| Dünya | Tablolar | Şık sayısı | Kim okur |
|---|---|---|---|
| **Beyin** | `yks_questions` (ÖSYM çıkmış) · `yks_ai_questions` (AI üretimi) · `yks_knowledge` · `yks_exemplars` | **5** | RAG, ajanlar, yönetici iç görünümleri (2026-07-22 telif kararı: kullanıcı yüzüne yayın YOK) |
| **App** | `questions` · adaptif motor · gamification · bahçe | **4** | Öğrencinin günlük çözme akışı |

Kaynak ayrımı bir **ürün kuralıdır ve DB'de kilitlidir**: `question_source` enum'u
(`osym_cikmis · ai_generated · ogretmen`) + insert sonrası değiştirilemezlik trigger'ı.
Adaptif montaj **her zaman** `source_type='ai_generated' AND verified` okur. Çıkmış soru adaptif
havuza **asla** sızmaz.

---

## 1. Tech Stack & Frameworks

### Backend — `learnup-brain/` (tek merkezî servis)

| Katman | Teknoloji | Not |
|---|---|---|
| Runtime | **Bun** ≥1.1 | Node değil. TS'i doğrudan çalıştırır, `.env`'i otomatik yükler |
| HTTP | **Express 4** | `helmet` + `cors` + `express-rate-limit` + `pino-http` |
| Dil | **TypeScript 5.6**, ESM / **NodeNext**, `strict: true` | Relative import'larda **`.js` uzantısı zorunlu** |
| Doğrulama | **zod 3** | Env, LLM çıktıları, istek gövdeleri |
| LLM | **OpenRouter** üzerinden `openai` SDK · **DeepSeek** ailesi | Anthropic/Voyage/Google SDK'ları **söküldü** |
| Embeddings | `text-embedding-3-small` **@768** | `dimensions: 768` parametresi **zorunlu** (native 1536d) |
| Veri | **Supabase** (Postgres + `pgvector vector(768)` + `ltree`) | **service-role** anahtarı → RLS tamamen bypass |
| Auth | **Bearer JWT**, `jose` ile **lokal** JWKS/ES256 doğrulama | Ağ round-trip'i yok |
| Hot-path | **Redis Streams** (`ioredis`) | Atılabilir. Çökerse API tam servis verir |
| Log | **pino** | |
| Matematik | **KaTeX** | Sunucu tarafı LaTeX doğrulama (`utils/latex.ts`) |

### Frontend — `frontend-v2/` (güncel arayüz)

| Katman | Teknoloji |
|---|---|
| Build | **Vite 8** + `@vitejs/plugin-react` — **Next.js DEĞİL** |
| UI | **React 19** + `react-router-dom` 7 |
| Stil | **Tailwind v4 CSS-first** — `tailwind.config.js` **YOK**, tüm tema `src/index.css` `@theme{}` içinde |
| Animasyon | `framer-motion` 12 · `lottie-react` · `canvas-confetti` · `@number-flow/react` |
| Bileşen | Radix (`dialog`, `dropdown-menu`, `tooltip`) · `cmdk` (⌘K) · `sonner` (toast) · `vaul` (drawer) |
| Grafik | `recharts` 3 |
| 3B | `@react-three/fiber` + `drei` + `three` · `@tsparticles/*` |
| Matematik | `katex` + `remark-math` + `rehype-katex` (`components/MathMarkdown.tsx`) |
| Veri | `@supabase/supabase-js` (yalnız auth + oturum) → JWT → `learnup-brain` |

### Diğer

- **`frontend/`** — eski Firebase/Firestore arayüzü. **Bakım modunda, yeni iş buraya yazılmaz.**
- **`supabase/functions/`** — 16 Deno Edge Function. **Emekli**; hepsi `learnup-brain` route'una taşındı. Referans olarak duruyor.
- **Deploy** — Tek VPS, Docker Compose: `brain` (api) + `worker` + `redis:7-alpine` (AOF açık) + Caddy TLS. Supabase hosted.

---

## 2. Project Structure

```
learnup-agent/
├── YKS-BEYIN-SISTEM-MIMARISI.md   ← MİMARİ TEK KAYNAK (17 bölüm) — önce burayı oku
├── VERDENT.md                      ← bu dosya
├── docker-compose.yml              ← brain + worker + redis
├── .env.example                    ← her değişkenin ölçülmüş gerekçesiyle birlikte
│
├── learnup-brain/                  ★ TEK MERKEZÎ BACKEND — yeni işin %90'ı burada
│   ├── src/
│   │   ├── server.ts               HTTP giriş noktası (keepAliveTimeout=65s, requestTimeout=0)
│   │   ├── app.ts                  Express kurulumu: router mount + middleware zinciri
│   │   ├── config/env.ts           zod ile fail-fast env doğrulama — env'e TEK erişim noktası
│   │   ├── clients/                dış servis istemcileri: openrouter · supabase · redis
│   │   ├── middleware/             auth (JWKS) · requireRole · rateLimit · error
│   │   ├── routes/                 HTTP yüzeyi — 23 router (aşağıda)
│   │   ├── agents/                 kaptan · atlas · pusula · nabiz · katip · bus · tools
│   │   ├── persona/                ★ KURAL KİTABI — LLM'e söylenen her şey (charter'lar)
│   │   ├── lib/                    iş mantığı (aşağıda)
│   │   ├── jobs/topup-planner.ts   havuz doldurma planlayıcısı
│   │   ├── workers/atolye.worker.ts  ★ İKİNCİ SÜREÇ — lb:tasks consumer'ı + zamanlayıcı
│   │   ├── utils/                  benzerlik · latex · shufflers · soru-saglik · concurrency · logger
│   │   ├── types/panel.ts          panel DTO tipleri
│   │   └── scripts/                elle çalıştırılan CLI'lar (ingest, üretim, eval, A/B)
│   ├── migrations/                 0001–0020 — beyin şeması (idempotent SQL)
│   ├── data/                       ara çıktılar (.jsonl/.json) — DB'ye yazmadan önceki durak
│   └── eval-sonuclari/             regresyon koşu çıktıları
│
├── frontend-v2/                    ★ GÜNCEL ARAYÜZ (Vite :5174)
│   ├── src/
│   │   ├── main.tsx · App.tsx      giriş + router
│   │   ├── index.css               ★ TÜM TEMA — @theme{} bloğu (Tailwind v4 config'i budur)
│   │   ├── lib/
│   │   │   ├── api.js              ★ apiGet/apiPost/apiDelete/streamChat — TEK backend kapısı
│   │   │   ├── supabase.js         yalnız auth istemcisi
│   │   │   ├── auth.tsx            oturum + profil context'i
│   │   │   ├── rol.ts · sinif.tsx  RBAC yardımcıları + sınıf context'i
│   │   │   ├── useAsync.ts         ★ standart veri yükleme hook'u (loading/error/data + reload)
│   │   │   ├── theme.tsx           tema sağlayıcısı (FİDAN: Gün Işığı/Gece Ormanı'na geçiş sürüyor)
│   │   │   ├── layout.tsx · nav.ts · responsive.ts
│   │   │   ├── types.ts · types.teacher.ts · types.admin.ts
│   │   │   └── katalog · rozetler · avatars · format · cn · sorgu · ses · latex
│   │   ├── components/
│   │   │   ├── ui.tsx              ★ TASARIM SİSTEMİ: GlassCard, GlowButton, Chip, Badge,
│   │   │   │                         SectionLabel, PingDot, StatusLine, Skeleton, SegmentGecis
│   │   │   ├── RolGecidi.tsx       ★ üç hâlli rol kapısı (aşağıda — kritik)
│   │   │   ├── MathMarkdown.tsx    LaTeX render
│   │   │   ├── cekirdek/fx/kule/sinif/rontgen/yonetim.tsx  alan bileşenleri
│   │   │   └── Bahce3D · Login3D · Lighthouse · Ambiyans · CommandPalette · Onboarding
│   │   ├── screens/                ROL BAŞINA ekranlar
│   │   │   ├── (öğrenci) Bugun · Harita · Rota · Kaptan · Arsiv · Bahce · Ben
│   │   │   ├── sinif/  (öğretmen) SinifPanosu · SinifIsi · OdevAtolyesi · Karsilastir · OgrenciRontgeni
│   │   │   └── kule/   (yönetici) Kule · Kullanicilar · SoruHavuzu · OzgunlukBariyeri
│   │   └── assets/                 avatar png'leri + lottie json'ları
│   └── vite.config.js              :5174 · '/api' → localhost:8080 proxy
│
├── frontend/                       ⚠️ ESKİ Firebase arayüzü — BAKIM MODU, yeni iş yazma
└── supabase/
    ├── migrations/                 0001–0003 — app şeması
    └── functions/                  ⚠️ EMEKLİ Edge Function'lar (referans)
```

### `learnup-brain/src/lib/` — iş mantığı haritası

| Dosya | Sorumluluk |
|---|---|
| `mastery.ts` | **BKT-lite** ustalık motoru + çürüme formülü (`effectiveMastery`) |
| `planner.ts` | PUSULA'nın **LLM'siz** greedy plan optimizer'ı |
| `generation.ts` | Soru üretimi + `siklariDuzenle` (şık karıştırma) + `parseTagged` |
| `questions-ai.ts` | AI havuz sorgulama/servis |
| `rag.ts` | İki korpuslu retrieval (knowledge + exemplars) |
| `model-router.ts` | ★ **Model zincirlerinin TEK KAYNAĞI** (`CHAINS`) + devre kesici + bütçe kapısı |
| `yetki.ts` | Sahiplik denetimi (öğretmen↔öğrenci, sınıf kapsamı) |
| `denetim.ts` | `yonetim_denetim` append-only defteri |
| `pg.ts` | ★ `fetchAll()` — PostgREST 1000-satır tuzağının panzehiri |
| `gamification.ts` | %100 deterministik puan/rozet/seri — **asla ajan olmaz** |
| `signals.ts` | Saf sinyal fonksiyonları (gecikme z-skoru, hata serisi, yorgunluk) |
| `hata.ts` | `HttpHatasi` + `yetkisiz/bulunamadi/gecersizIstek` fabrikaları |
| `curriculum.ts` · `mastery.ts` · `answers.ts` · `desk.ts` · `canvas.ts` · `odev-derle.ts` · `rontgen.ts` · `test-modes.ts` · `market-catalog.ts` · `eval-anlik.ts` | alan modülleri |

### Ajan mimarisi — 4 katman

```
SİNYAL (algı)      saf fonksiyonlar, sıfır LLM, cevap-başına
   ▼
BİLİŞ (görünmez)   ATLAS (bilişsel harita + yanılgı teşhisi) · PUSULA (strateji)
                   NABIZ (duygu + yük tavanı) · KÂTİP (hafıza damıtma)
                   → her biri Koç Masası'na TEK kompakt brief yazar (≤300 token, masa ≤1200)
   ▼
SES (tek persona)  KAPTAN — öğrenciye dokunan HER kelimeyi o söyler
   ▼
ATÖLYE (worker)    forge_topup · plan · diagnose · affect · compact · nudge · closure_check
```

---

## 3. Coding Standards & Rules

### 3.1 Değişmez ilke — **dilek ≠ sözleşme**

> **Zorlanabilir her kural KODDA zorlanır. Prompt yalnız modele niyeti anlatır.**

Bu proje bunu pahalı öğrendi: charter'da *"doğru cevabı A'ya yığma"* yazıyordu; model 8 sorunun
6'sında yine A'ya koydu (ölçüldü). Sorunu prompt çözmedi — `generation.siklariDuzenle`
(Fisher–Yates) çözdü.

**Verdent için kural:** bir davranışı garanti etmen isteniyorsa çözümün prompt düzenlemesi
**olamaz**. Zod şeması, parse kapısı, deterministik fonksiyon veya DB constraint'i yaz.

### 3.2 TypeScript

- `strict: true`, her iki pakette. **`tsc --noEmit` sıfır hata vermeden iş bitmiş sayılmaz.**
- Backend ESM/NodeNext: **relative import'larda `.js` uzantısı zorunlu** — `./config/env.js`.
- `any` backend'de LLM yanıt tipleri için serbest (eslint kuralı kapalı), **ama sınırda kalmalı**:
  dış veri her zaman **zod ile parse edilip** tiplenmiş şekilde içeri girer.
- Kullanılmayan değişken `_` ile başlar (`argsIgnorePattern: '^_'`).
- Dış dünyadan gelen her şey (env, LLM çıktısı, istek gövdesi) **zod'dan geçer**. LLM çıktısı
  şemaya uymuyorsa **atılır veya güvenli varsayılana düşer** (örn. duygu sınıflaması → `nötr`).

### 3.3 İsimlendirme

| Ne | Kural | Örnek |
|---|---|---|
| Alan-özgü fonksiyon/dosya | **Türkçe**, camelCase / kebab-case | `siklariDuzenle`, `benzerlik.ts`, `havuz-doldur.ts` |
| Sınıf / tip | **Türkçe**, PascalCase | `HttpHatasi`, `TeshisSemasi`, `AffectSemasi` |
| React bileşeni | **Türkçe**, PascalCase | `RolGecidi`, `SegmentGecis`, `SinifPanosu` |
| Framework sözleşmesi | İngilizce kalır | `useEffect`, `router`, `req/res`, `status` |
| DB kolonu | mevcut şemayla tutarlı, `snake_case` | `kazanim_id`, `is_correct`, `selected_option` |
| Hata `code` | **makine için** — `snake_case`, İngilizce/Türkçe karışık ama sabit | `missing_bearer`, `cok_fazla_uretim` |
| Hata `message` | **insan için** — tam Türkçe cümle | `"Bu öğrenci senin sınıfında değil."` |

### 3.4 Yorumlar

Bu kod tabanında yorum **ne yaptığını değil, NEDEN öyle olduğunu** anlatır — çoğu bir arızanın
mezar taşıdır ve **ölçülmüş sayı içerir**. Bu üslubu koru:

```ts
// RUNNING_BAYAT_MS = 15 dk — en uzun görevden uzun olmak ZORUNDA. Eskiden 2 dk idi;
// worker A hâlâ üretirken bekçi görevi "takılmış" sanıp yeniden kuyruğa atıyordu →
// worker B aynı işi baştan yapıyordu → LLM faturası iki katına çıkıyordu.
```

Eşik değeri yazıyorsan **gerekçesini yanına yaz**. Eşikler ölçümden türetilir (yüzdelik +
yanlış-alarm tablosu), **asla uydurulmaz**.

### 3.5 Backend disiplinleri

1. **Yetki tamamen uygulama katmanında.** Service-role anahtarı RLS'i **tamamen bypass eder** —
   Postgres seni korumaz. Her sorguda kapsamı sen daraltacaksın.
2. **Rol `profiles` tablosundan okunur, JWT'den DEĞİL.** (Kilitli karar.)
3. **Sahiplik ihlalinde 404 dön, 403 DEĞİL** — 403, uuid'nin gerçek bir kayda ait olduğunu
   doğrular ve ucu numaralandırma kehanetine çevirir. Sunucuda `warn` ile logla.
4. **Ham `err.message` sızdırma** — Postgres hataları tablo/kolon adı taşır. Yalnız `HttpHatasi`
   mesajları dışarı çıkar.
5. **`fetchAll()` kullan.** PostgREST **1000 satırda sessizce keser**. Sınırsız küme okuyan her
   yer `lib/pg.ts:fetchAll()` kullanmak **zorunda**. 1200 kişilik mevcut sessizce 1000'e düşerse
   her sınıf ortalaması bozulur ve kimse fark etmez.
6. **Rate limit katmanları:** `chatLimiter` (SSE başlatma) · `llmLimiter` (10/dk/kullanıcı — bu
   **hız değil FATURA** meselesi) · `standardLimiter` (mutasyonlar). `standardLimiter`
   **`requireRole`'dan önce** mount edilir ki rol yoklayan döngü de sınırlansın.
7. **`/chat`'te compression YOK** — SSE token akışı buffer'lanmasın.
8. **Yeni route hem `/api` hem `/api/v1` altına** mount edilir (`app.ts` döngüsü). Express sıralı
   eşleştirir: `/questions/osym` **`/questions`'tan önce** gelmeli.
9. **Çürüme formülünün üç kopyası var** (TS `effectiveMastery`, `weak_kazanimlar` RPC, 0016'nın
   üç sınıf RPC'si). Birini değiştiriyorsan **üçünü de** değiştir; sapma sessizce farklı sayı üretir.
10. **Idempotency:** görev alımı CAS-claim ile; üretim insert'lerinde `md5(question_text)`
    partial-unique dedup.
11. **Migration'lar idempotent yazılır** ve elle çalıştırılır (Supabase Dashboard → SQL Editor).
    Yeni migration sıradaki numarayı alır: `learnup-brain/migrations/0021_*.sql`.

### 3.6 Frontend disiplinleri (FİDAN tasarım sistemi)

> **Görsel dilin tek kaynağı [`docs/design/TASARIM-DILI.md`](docs/design/TASARIM-DILI.md).**
> COASTAL/denizcilik dili 2026-07-21'de emekli edildi; palet/tipografi/bütçe buraya
> KOPYALANMAZ (ikinci kaynak = kayma). Dönüşüm kart-bazlı sürüyor (`docs/agents/handoff/`) —
> kodda COASTAL kalıntısı görebilirsin, hedef her zaman FİDAN'dır.

**Tema:** Gün Işığı (açık — **VARSAYILAN**) / Gece Ormanı (koyu — tercihe bağlı). Değişkenler
`--data-hue`, `--heat-zero`, `--page-bg`.

**İmza yerleşim:** `lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]`
**Sarmalayıcı:** `mx-auto max-w-7xl px-[clamp(16px,3.5vw,44px)] pb-20 pt-9`

**Aşılmaz bütçeler (kanonik liste: TASARIM-DILI §9):**
- Görünüm başına **≤3 bulanık yüzey** — ferahlık camdan değil, katmanlı mat yüzeylerden
- Sayfa başına **1 ışıltı vurgusu** — bakılması gereken tek sayıya gider
- Sayfa başına **1 canlı nokta** — zaten `ProfileMenu` harcadı → yeni ekran `StatusLine` kullanır
- **Kehribar yalnız ÖSYM mührünün kimliğidir** (eski "brass") — başka hiçbir yerde kullanılmaz
- **Denizcilik terimi kullanıcı metnine giremez** — adlar düz işlevseldir (TASARIM-DILI §6 tablosu)

**Reveal kadansı:** başlık `0` → KPI `0.04` → sol `0.10/0.16/0.20` → sağ `0.14/0.18/0.22/0.26`.
Sol ve sağ iç içe geçer (göz çapraz okur). **`0.3` aşılmaz** — ötesi koreografi değil gecikme.

**Davranış kuralları:**
- **Asla yalnız renk:** her risk satırı kelimeli rozet taşır ("yüksek risk"), her seçim ikon taşır.
- **İyimser güncelleme YOK:** öğretmen/yönetici mutasyonları sunucu hakikatini değiştirir →
  dönen ikon + devre dışı buton → `reload()`.
- **Yıkıcı eylem = Radix `Dialog`**, asla `window.confirm`.
- **Drill-down state URL'de:** `?ders=`, `?ogrenci=a,b,c`. `setParams(p, { replace: true })` —
  onsuz on filtre tıklaması on geri tuşu demek.
- **`useAsync` bağımlılıkları İLKEL geçilir** (`[ders, sirala]`, asla `[filtreler]`) —
  nesne = sonsuz refetch.
- **⌘K mutasyon içermez.** Bulanık aramanın arkasındaki yıkıcı eylem ayak kurşunudur; palet
  gezinme + tema ile sınırlı.
- **Nav eklemeli değil, kapsamlı.** Öğretmen `/harita`, `/bahce`, `/rota` görmez — bunlar
  öğretmen hesabında **verisi olmayan** kişisel ekranlardır.
- **Backend'e yalnız `lib/api.js` üzerinden gidilir.** Bileşen içinde çıplak `fetch` yazma.
  Hata gösteriminde **önce `message`** (Türkçe), sonra `error` (kod) okunur.

**`RolGecidi` — üç hâl, ikisi değil:**
```
profilYukleniyor → <PanoIskeleti/>    ← ASLA yönlendirme yok
reddedildi       → <YetkiYok/>         ← sessiz redirect değil
geçti            → <Outlet/>
```
`auth.tsx`'teki `loading` yalnız **oturumu** kapsar; `profile` ikinci bir effect'te gelir ve o
pencerede `null`'dur. `profile.role` okuyan naif bir kapı **her sert yenilemede "yetkiniz yok"
diye yanıp söner**. Yeni korumalı ekran eklerken bu üç hâli koru.

### 3.7 İşletme kuralları (ajanların uyması zorunlu)

1. **Harcama onayı:** paralı LLM koşusu öncesi tahmini maliyet söylenir, **onay alınır**. Sert
   tavan (`--tavan` / `maliyetTavani()`) — aşacak çağrı **hiç gönderilmez**.
2. **DB'ye yazım iki aşamalı:** önce dosyaya (`learnup-brain/data/*.jsonl`), incelenip
   onaylandıktan sonra DB'ye.
3. **Zamanlanmış görev yok** — her koşu elle başlatılır. `NIGHTLY_FORGE=off` bilinçli kapalıdır
   (paralı hatta tavan yok).
4. **Eşikler ölçümden türetilir**, gerekçe yanına yorum olarak yazılır.
5. **Commit'i kullanıcı atar.** Ajan `git commit`/`git push` çalıştırmaz.
6. **Model zincirlerinin tek kaynağı `src/lib/model-router.ts` CHAINS.** `.env` override'ı
   **bayatlar** — kullanma. (2026-07-19'da ölü bir slug `.env`'de kaldığı için koddaki düzeltme işlemedi.)
7. **Yazar ≠ denetçi.** Üretim ve doğrulama **ayrı model ailesinden** olmalı; kendini denetleyen
   model cömerttir (v4-pro kendi sorularına %92, başkasınınkine %25 verdi).

---

## 4. Commands

### Kurulum

```powershell
# Bun (Windows PowerShell)
irm bun.sh/install.ps1 | iex
```

```bash
cd learnup-brain && bun install
cp .env.example .env        # SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENROUTER_API_KEY
```
```bash
cd frontend-v2 && bun install
```

### Geliştirme

| Komut | Dizin | İş |
|---|---|---|
| `bun run dev` | `learnup-brain` | API watch modunda — `:8080` |
| `bun run dev:worker` | `learnup-brain` | Atölye worker'ı watch modunda |
| `bun run start` | `learnup-brain` | API (prod) |
| `bun run start:worker` | `learnup-brain` | Worker (prod) |
| `bun run dev` | `frontend-v2` | Vite — `:5174`, `/api` → `:8080` proxy |
| `bun run dev` | `frontend` | Eski arayüz — `:5173` (bakım modu) |
| `docker compose up --build` | kök | brain + worker + redis birlikte |

### Kalite kapıları

| Komut | Dizin | Not |
|---|---|---|
| `bun run typecheck` | `learnup-brain` | **Sıfır hata beklenir.** İş bitiş ölçütü budur |
| `bun run lint` | `learnup-brain` | eslint 9 flat config + typescript-eslint |
| `bun test src` | `learnup-brain` | Bun test — `*.test.ts` (generation, persona, utils) |
| `bun run eval` | `learnup-brain` | Altın-set regresyonu + drift. **İhlalde exit 1** · $0 |
| `bun run eval --hakem --evet` | `learnup-brain` | + LLM'li hakem tutarlılık sınavı · ~$0.01 |
| `bun run build` | `frontend-v2` | ⚠️ **Tipleri DENETLEMEZ**, yalnız soyar |
| `bun run lint` | `frontend-v2` | ⚠️ **ÇALIŞMAZ** — eslint kurulu değil |

> ⚠️ **`frontend-v2`'de typescript ve eslint kurulu değil.** Tip denetimi için:
> ```bash
> cd frontend-v2 && ../learnup-brain/node_modules/.bin/tsc --noEmit -p tsconfig.json
> ```
> Frontend'de iş bitirirken bu komutu **elle çalıştır** — `vite build` seni yakalamaz.

### Veri ve üretim hattı

```
çıkmış sorular (ÖSYM)
   │  bun run etiketle              ($0, ücretsiz model, checkpoint'li)
   ▼
data/etiketler-cikmis.jsonl         ← önce DOSYAYA, asla doğrudan DB'ye
   │  bun run etiket-yaz --evet     (yalnız difficulty kolonu)
   ▼
yks_questions + yks_exemplars
   │  bun src/scripts/havuz-doldur.ts --hedef N
   ▼
yks_ai_questions                    (yazar LLM → kod kapıları → bedava denetçi)
   │  bun run eval                  ($0 — "bozdum mu?" kapısı)
   ▼
öğrenciye servis
```

| Komut | İş | Maliyet |
|---|---|---|
| `bun run seed` | Örnek veri | $0 |
| `bun run etiketle` | Zorluk etiketi (kaldığı yerden sürer) | $0 |
| `bun run etiket-yaz` / `--evet` | Kuru koşu / DB'ye yaz | $0 |
| `bun src/scripts/ingest-all.ts` | Müfredat + soru ingest'i | $0 |
| `bun src/scripts/havuz-doldur.ts --hedef N [--only mat]` | Havuzu N doğrulanmış soruya tamamla | yazar modeline bağlı |
| `bun src/scripts/ab-uretim.ts --etiket X --hedef N --tavan USD` | A/B üretim kolu, **sert dolar tavanlı** | tavan kadar |
| `bun src/scripts/ab-karsilastir.ts kol1 kol2` | İki kolun tablosu + tam metinler | $0 |
| `bun src/scripts/denetci-sinav.ts` | Denetçi adayı modelin sınavı (8 vaka) | $0 |
| `bun src/scripts/rag-smoke.ts` · `gen-smoke.ts` · `agent-smoke.ts` | Duman testleri | düşük |
| `bun src/scripts/bozuk-soru-kapat.ts` | Kusurlu soruları kapat | $0 |

### Migration

Supabase Dashboard → SQL Editor → dosya içeriğini yapıştır → RUN. **Hepsi idempotent.**
Beyin şeması `learnup-brain/migrations/0001–0020`, app şeması `supabase/migrations/0001–0003`.

---

## 5. Verdent ajanı için altın kurallar (özet)

1. **Önce `YKS-BEYIN-SISTEM-MIMARISI.md`'nin ilgili bölümünü oku.** Neredeyse her tuzağın
   gerekçesi orada yazılı ve ölçülmüş.
2. **Yeni backend işi `learnup-brain/` içine yazılır.** `frontend/` bakım modunda,
   `supabase/functions/` emekli.
3. **`frontend-v2` Next.js değil** — Vite + React 19. `tailwind.config.js` arama, yok;
   tema `src/index.css` `@theme{}` içinde.
4. **Türkçe yaz** — kod yorumu, hata mesajı, alan-özgü isimler, dokümantasyon.
5. **Prompt'a kural yazarak davranış garanti etme** — kod kapısı, zod şeması veya DB constraint'i yaz.
6. **Service-role RLS'i bypass eder** — yetkiyi sen kontrol edeceksin, Postgres seni korumaz.
7. **Sınırsız küme okuyorsan `fetchAll()`** — PostgREST 1000'de sessizce keser.
8. **Bitmeden `bun run typecheck`** (backend) / elle `tsc --noEmit` (frontend-v2).
9. **Paralı LLM koşusu öncesi maliyet söyle, onay al.** Tavansız paralı hat açma.
10. **Commit'i kullanıcı atar** — `git commit` / `git push` çalıştırma.
