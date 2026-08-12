import { Router } from 'express'
import { enqueueTask, type TaskKind } from '../agents/bus.js'
import { runPusula } from '../agents/pusula.js'
import { supabase } from '../clients/supabase.js'

/** Ajan orkestrasyonu — dispatch (async), pusula (senkron), status. */
export const agentsRouter = Router()

/**
 * HTTP'DEN TETİKLENEBİLEN GÖREV TÜRLERİ — BEYAZ LİSTE.
 *
 * ⚠️ Bu uç `kimlikli` ile mount ediliyor (app.ts), yani ROL KONTROLÜ YOK: her öğrenci
 * hesabı buraya yazabilir. Eskiden `kind` doğrudan gövdeden alınıyordu ve `TaskKind`
 * birleşiminin TAMAMI erişilebilirdi — `'eval'` dahil. `eval`, binlerce soru üzerinde
 * O(n²) benzerlik taraması koşan YÖNETİM görevidir (ritim.handleTask → evalKosVeYaz) ve
 * kendi yolu zaten admin arkasında (POST /admin/eval/kosum, requireRole('admin')).
 * Öğrenci hesabından tetiklenebilmesi bedava bir kaynak tüketim kapısıydı.
 *
 * Listeye ekleme yaparken ölçüt: "bu görevi öğrenci KENDİ hesabı için istemekte haklı mı?"
 * Sistem/yönetim görevleri buraya girmez; kendi yetkili uçlarından kuyruğa atılır.
 */
export const HTTP_GOREVLERI = new Set<TaskKind>([
  'topup', 'session', 'forge_topup',   // kendi kazanımı için soru üretimi
  'roadmap', 'plan',                    // kendi yol haritası
  'diagnose', 'closure_check',          // kendi yanılgı teşhisi
  'affect', 'nudge', 'compact',         // kendi durumu / oturum özeti
])

// Görev enqueue (async) — Ritim worker tüketir; taskId hemen döner.
agentsRouter.post('/dispatch', async (req, res, next) => {
  try {
    const body = req.body as { kind?: TaskKind; payload?: Record<string, unknown> }
    const kind: TaskKind = body.kind ?? 'topup'
    if (!HTTP_GOREVLERI.has(kind)) {
      res.status(403).json({ error: `bu görev türü HTTP'den tetiklenemez: ${String(kind)}` })
      return
    }
    const task = await enqueueTask({ userId: req.userId!, kind, payload: body.payload ?? {} })
    res.status(202).json({ taskId: task.id, status: 'PENDING' })
  } catch (err) {
    next(err)
  }
})

// Pusula orkestrasyonu (senkron tool-loop; oturumları Ritim'e delege eder).
agentsRouter.post('/pusula', async (req, res, next) => {
  try {
    const result = await runPusula(req.userId!)
    res.json(result)
  } catch (err) {
    next(err)
  }
})

/** GET /api/v1/agents/roadmap — Pusula'nın yazdığı haftalık plan (roadmaps.steps).
 *  Üretim MEVCUT POST /agents/pusula ile; bu uç yalnız okur. */
agentsRouter.get('/roadmap', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('roadmaps')
      .select('steps, updated_at')
      .eq('user_id', req.userId!)
      .maybeSingle()
    if (error) throw error
    res.json({ steps: data?.steps ?? null, updatedAt: data?.updated_at ?? null })
  } catch (err) {
    next(err)
  }
})

/** GET /api/v1/agents/nudges — Koç'un bekleyen dürtmeleri (zil rozeti).
 *  POST /api/v1/agents/nudges/seen — görüldü işareti (PENDING→SENT, kendi satırları). */
agentsRouter.get('/nudges', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('nudges')
      .select('id, kind, message, created_at')
      .eq('user_id', req.userId!)
      .eq('status', 'PENDING')
      .order('created_at', { ascending: false })
      .limit(10)
    if (error) throw error
    res.json({ nudges: data ?? [] })
  } catch (err) {
    next(err)
  }
})

agentsRouter.post('/nudges/seen', async (req, res, next) => {
  try {
    const ids = Array.isArray((req.body as { ids?: unknown[] })?.ids)
      ? (req.body as { ids: unknown[] }).ids.map(Number).filter(Number.isFinite)
      : []
    if (!ids.length) {
      res.status(400).json({ error: 'ids gerekli' })
      return
    }
    const { error } = await supabase
      .from('nudges')
      .update({ status: 'SENT' })
      .in('id', ids)
      .eq('user_id', req.userId!) // sahiplik: başkasının dürtmesi işaretlenemez
      .eq('status', 'PENDING')
    if (error) throw error
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

/**
 * GÖREV DURUMU (Postgres = hakikat) — AYRI ROUTER, BİLEREK.
 *
 * ⚠️ NEDEN `agentsRouter`'DAN ÇIKARILDI: `/agents/*` app.ts'te `llmLimiter` ile mount edilir
 * (10 istek/dk/kullanıcı) çünkü oradaki uçların çoğu LLM zinciri tetikler — orada sınır hız
 * değil FATURA meselesidir. Ama bu uç TEK BİR `maybeSingle()` SELECT'tir; hiçbir LLM çağrısı
 * yapmaz. Yoklama (polling) için tasarlanmış bir ucu 10/dk kovasına koymak, onu kullanılamaz
 * kılıyordu: 3 saniyede bir yoklama = 20 istek/dk → istemci daha ilk yarım dakikada 429 alır.
 *
 * Express sıralı eşleştiği için app.ts bunu `/agents`'tan ÖNCE mount eder (aynı desen:
 * `/questions/ai` → `/questions`, app.ts §3.5.8). Böylece `/agents/status/:id` standardLimiter'a
 * (60/dk), diğer bütün `/agents/*` uçları llmLimiter'a düşer.
 *
 * ⚠️ KULLANICI KAPSAMI KORUNUR: `.eq('user_id', req.userId!)` — başkasının görev kimliğini
 * bilen biri onun durumunu okuyamaz. Yoklama ucu olması bu kapıyı gevşetmez.
 */
export const agentsStatusRouter = Router()

agentsStatusRouter.get('/:taskId', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('agent_tasks')
      .select('id, status, result, error')
      .eq('id', req.params.taskId)
      .eq('user_id', req.userId!)
      .maybeSingle()
    if (error) throw error
    if (!data) {
      res.status(404).json({ error: 'görev bulunamadı' })
      return
    }
    res.json(data)
  } catch (err) {
    next(err)
  }
})