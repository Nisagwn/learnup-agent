# LearnUp "Beyin" Mikroservisi (`learnup-brain`)

YKS adaptif eğitim platformunun **bağımsız** yapay zekâ backend'i. Chatbot akışı, çok-ajanlı orkestrasyon, **OpenRouter (DeepSeek)** entegrasyonu ve **Supabase pgvector** tabanlı Semantik Arama (RAG) bu tek Node.js servisinde döner.

> **Bağımsızlık ilkesi:** Hiçbir Edge Function / Firebase Cloud Function kullanılmaz. Tüm mantık burada. Supabase yalnızca **akıllı veri + hafıza deposu** (Postgres + pgvector + JWT kaynağı).

## Teknoloji yığını
- **Runtime:** Node.js 20+ · **Express** · **TypeScript** (ESM / NodeNext)
- **LLM:** OpenRouter üzerinden `openai` SDK · **DeepSeek** modelleri
- **Embeddings:** OpenAI `text-embedding-3-small` **@768** (doğrudan OpenAI — OpenRouter'da değil)
- **Veri:** Supabase (Postgres + pgvector `vector(768)` + ltree) — service-role
- **Hot-path:** Redis **Streams** (ajan orkestrasyonu; ileri faz)
- **Auth:** Bearer JWT'nin **lokal** doğrulaması (`SUPABASE_JWT_SECRET`, HS256 — ağ round-trip'i yok)

## Kurulum
```bash
cd learnup-brain
npm install
cp .env.example .env      # değerleri doldur (SUPABASE_*, OPENROUTER_API_KEY, OPENAI_API_KEY, SUPABASE_JWT_SECRET)
npm run typecheck         # bu fazda: sıfır hata beklenir
```

## Script'ler
| Komut | İş |
|---|---|
| `npm run dev` | API'yi izleme modunda çalıştır (`tsx watch src/server.ts`) — *server.ts ileri fazda* |
| `npm run dev:worker` | Ritim worker (Redis Streams) — *ileri faz* |
| `npm run build` | `tsc` ile `dist/`'e derle |
| `npm start` | Derlenmiş API'yi çalıştır |
| `npm run typecheck` | Tip denetimi (emit yok) |
| `npm run lint` | ESLint |

## Ortam değişkenleri
Tümü `src/config/env.ts` içinde **zod** ile doğrulanır (eksikse process başlangıçta durur). Bkz. `.env.example`.
`SUPABASE_SERVICE_ROLE_KEY` ve `SUPABASE_JWT_SECRET` **sırdır** — yalnız sunucuda, asla istemciye sızmaz.

## Klasör yapısı (hedef)
```
src/
  server.ts · app.ts
  config/env.ts            ✅ (bu faz)
  clients/{openrouter,openai,supabase,redis}.ts
  lib/{models,rag,generation,curriculum,test-modes}.ts
  agents/{pusula,ritim,kaptan,tools}.ts
  routes/*.routes.ts
  middleware/{auth,rateLimit,error}.ts
  workers/atolye.worker.ts
```

## Scaffold ilerlemesi
- [x] **Faz 1** — kök yapılandırma (`package.json`, `tsconfig.json`, `.env.example`, `.gitignore`, `eslint.config.js`) + `src/config/env.ts`
- [ ] **Faz 2** — `src/clients/*` (OpenRouter chat · OpenAI embeddings · Supabase service-role · Redis)
- [ ] **Faz 3** — `src/middleware/*` (lokal JWT auth · SSE-dostu rate-limit · error handler)
- [ ] **Faz 4** — `src/lib/*` (RAG + generation + Context Injection; master doküman §11'den taşınır)
- [ ] **Faz 5** — `src/agents/*` · `src/routes/*` · `src/app.ts` · `src/server.ts`

Mimari referans: repo kökündeki **`YKS-BEYIN-SISTEM-MIMARISI.md`**.
