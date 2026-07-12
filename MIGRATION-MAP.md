# LearnUp — Full Migration Haritası (Edge Functions → `learnup-brain`)

Supabase Edge Functions (Deno) **kapanıyor**; tüm mantık `learnup-brain` (Express + Bun) backend'ine taşınıyor.
16 fonksiyon + `_shared/` → route + lib. **Ajanlar (Kaptan/Pusula/Ritim) izole, dokunulmaz.**

## İki dünya (çakışma yok)
- **Beyin** — `yks_questions`, `yks_knowledge`, RAG, ajanlar. 5-şıklı ÖSYM.
- **App** — `questions`, adaptif motor, gamification/bahçe. 4-şıklı. *(Bu migration App dünyasını taşır.)*

## Shared → mevcut altyapıya bağlanır
| Edge shared | Backend karşılığı |
|---|---|
| `_shared/http.ts` (cors, getAdmin, resolveUserId, isRateLimited) | `cors()`, `supabase` (service-role), **`requireAuth`** (lokal JWKS/ES256), `standardLimiter` |
| `_shared/logic.ts` (gamification/SRS/görev/rozet/lig) | `src/lib/gamification.ts` (birebir port) |
| `_shared/ai.ts` (4-şık üretim + parse + modlar) | `src/lib/questions-ai.ts` (llmChat → openrouter client) |

## Eşleme Tablosu (hepsi POST)
| # | Edge Function | Endpoint | Port hedefi | Tablolar |
|---|---|---|---|---|
| 1 | generate-questions | `/api/questions/generate` | questions + questions-ai | questions |
| 2 | generate-targeted-set | `/api/questions/targeted` | questions + questions-ai | srs_cards, questions, targeted_assignments |
| 3 | save-ai-questions | `/api/questions/save` | questions | questions |
| 4 | get-ai-response | `/api/ai/respond` | ai (non-stream) | — |
| 5 | submit-answer | `/api/practice/next` | practice + questions-ai | quiz_sessions, user_answers, questions |
| 6 | record-answer | `/api/practice/record` | practice + gamification | profiles, user_logs, srs_cards, league_entries |
| 7 | submit-assignment | `/api/assignments/submit` | assignments | assignments, questions, assignment_submissions |
| 8 | submit-targeted-assignment | `/api/assignments/targeted/submit` | assignments | targeted_assignments, questions |
| 9 | ensure-daily-state | `/api/gamification/daily` | gamification | profiles, league_entries |
| 10 | claim-quest-reward | `/api/gamification/quests/claim` | gamification | profiles, league_entries |
| 11 | use-streak-freeze | `/api/gamification/streak/freeze` | gamification | profiles |
| 12 | purchase-garden-item | `/api/garden/purchase` | garden + market-catalog | profiles, inventory |
| 13 | plant-seed | `/api/garden/plant` | garden | inventory, garden |
| 14 | move-plant | `/api/garden/move` | garden | garden |
| 15 | remove-plant | `/api/garden/remove` | garden | garden, inventory |
| 16 | delete-account | `/api/account/delete` | account | auth.admin.deleteUser (cascade) |

> İstek/yanıt gövdeleri **birebir korunur** → frontend yalnız `supabase.functions.invoke(...)` → `fetch('/api/...')` geçişi yapar.

## Yeni dosyalar
```
src/lib/  gamification.ts · questions-ai.ts · market-catalog.ts
src/routes/  questions · practice · assignments · gamification · garden · ai · account (.routes.ts)
```

## Entegrasyon / güvenlik
- Ajan dosyaları (`agents/*`, `workers/*`, `bus.ts`, `tools.ts`) **değişmez**.
- Paylaşılan: `openrouter`, `supabase`, `requireAuth`, `standardLimiter`, `errorHandler`, `logger`.
- Örtüşme: basit sohbet `get-ai-response` → `/api/ai/respond`; Kaptan SSE **`/api/chat`**'te kalır.
- Auth yükseltmesi: edge'in `admin.auth.getUser` round-trip'i → lokal JWKS `requireAuth`.
- Tüm 12 app tablosu **mevcut** (gerçek-select ile doğrulandı) → yeni şema gerekmez.

## Fazlar
- **A:** `lib/` port (gamification, questions-ai, market-catalog).
- **B:** route'lar (account/garden/gamification → assignments/practice → questions/ai).
- **C:** `app.ts` mount + typecheck + smoke.
