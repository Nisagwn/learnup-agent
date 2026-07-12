# Migration Seti — Çalıştırma Kılavuzu

**THE-LEARNUP-MASTER-PLAN §6 / Faz 0-1.** Hepsi **idempotent** — iki kez çalıştırmak zarar vermez.

> **MEVCUT DURUM (2026-07-11'de uzak DB canlı sorgulandı):** App şeması ✓ ve brain 0001'in
> ESKİ hali ✓ zaten uygulanmış (tüm brain tabloları boş). Bu yüzden senin sıran:
> **yalnız 0004 → 0005 → 0006.** (0001/0003'ü tekrar çalıştırmak zararsız ama gereksiz —
> her şey `if not exists` korumalı, fiilen no-op.)

## Nasıl çalıştırılır

Supabase Dashboard → **SQL Editor** → dosya içeriğini yapıştır → **RUN**. Sırayla:

| Sıra | Dosya | Ne yapar |
|---|---|---|
| 1 | `0001_init.sql` | Beyin çekirdeği: 9 tablo (curriculum ltree, yks_questions, yks_knowledge/exemplars 768d, question_states, roadmaps, agent_tasks, chat_messages, osym_blueprint) + 2 retrieval RPC + RLS |
| 2 | `0003_functions.sql` | Retrieval RPC'lerinin `public.`-nitelikli kanonik kopyası + HNSW/GiST indeksler (42P01 düzeltmesi) |
| 3 | `0004_unification.sql` | **Birleşme + kaynak ayrımı:** `user_logs`'a kazanim_id/selected_option/duration_ms · `distractor_traps` (user_logs) · **`question_source` enum + source_type + değişmezlik trigger'ı** (çıkmış ↔ AI ayrımı) · **`record_answer` atomik RPC** · agent_tasks kilit kolonları + Realtime · md5 dedup · chat_messages.chat_id |
| 4 | `0005_agents.sql` | **Ajan katmanı:** `user_mastery` (bilişsel graf) · `student_memory` (Koç Masası) · `session_summaries` (+768d anı endeksi) · `nudges` · `prereq_paths` · exemplar künyesi · `weak_kazanimlar` (mastery-rewrite) · `match_session_memories` · `v_mastery_rollup` |
| 5 | `0006_cleanup.sql` | Eski brain 0001'in `user_activities` artığını siler (boş — veri kaybı yok). **Yalnız 0004+0005'ten sonra!** |

> **Ön koşul:** Ana uygulama şeması (`supabase/migrations/0001+0002`, istersen `0003_migration_gaps`) zaten uygulanmış olmalı — `profiles`, `user_logs`, `srs_cards`, `league_entries`, `questions`, `chats` tabloları var olmalı (0004 bunlara ALTER/RPC bağlar).

## Her dosyanın sonunda DOĞRULAMA bloğu var
Çalıştırdıktan sonra dosyanın en altındaki yorum satırlarındaki sorguları SQL Editor'de koşturup beklenen satır sayılarını kontrol et.

Hızlı toplu kontrol (hepsinden sonra):
```sql
select proname from pg_proc where pronamespace='public'::regnamespace and proname in
  ('match_yks_knowledge','match_yks_exemplars','weak_kazanimlar','distractor_traps',
   'record_answer','match_session_memories');                       -- 6 satır beklenir
select enum_range(null::public.question_source);                    -- {osym_cikmis,ai_generated,ogretmen}
select tablename from pg_tables where tablename in
  ('user_mastery','student_memory','session_summaries','nudges');   -- 4 satır beklenir
```

## Önemli notlar

- **`user_activities` YOK (bilinçli):** telemetri kanoniği `user_logs`. Eski brain 0001 uzak DB'de çalıştırılmış olduğundan tablo orada mevcut (boş) — `0006_cleanup.sql` siler.
- **Eski RPC'lerle çakışma yok:** uzak DB'deki `weak_kazanimlar`/`distractor_traps` eski (user_activities-okuyan) versiyonlar; 0004/0005'teki `create or replace` **birebir aynı imza + dönüş tipiyle** üzerine yazar (canlı doğrulandı) — Postgres bunu temiz kabul eder.
- **`source_type` değiştirilemez:** `osym_cikmis` ↔ `ai_generated` dönüşümü trigger'la engellenir. Çıkmış soru ingest'i her zaman `insert ... source_type='osym_cikmis', exam_year=..., exam_label=...` ile yapılır.
- **Kod tarafı (Faz 1'de gelecek — migration'lar bunu beklemez):** `telemetry.routes.ts` hâlâ `user_activities`'e insert ediyor (her zaman 404'tü); `/api/v1/answers` + `record_answer` RPC'sine geçişle düzelecek. `buildStudentContext`'in çağırdığı `weak_kazanimlar`/`distractor_traps` aynı imzayla mevcut — veri aktıkça dolacak, o zamana dek boş döner (hata değil).
