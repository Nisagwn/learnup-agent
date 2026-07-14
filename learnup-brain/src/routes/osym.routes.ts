import { Router } from 'express'
import { supabase } from '../clients/supabase.js'
import { fetchAll } from '../lib/pg.js'

/**
 * GET /api/v1/questions/osym — ÇIKMIŞ SORULAR servisi (ürün kuralı #6).
 * Yalnız source_type='osym_cikmis' döner; adaptif havuzla ASLA karışmaz.
 * Frontend her satırdaki source_type='osym_cikmis' üzerinden "ÖSYM ÇIKMIŞ SORU"
 * rozetini basar. Query: ?subject=&year=&limit=&offset=
 */
export const osymRouter = Router()

osymRouter.get('/', async (req, res, next) => {
  try {
    const subject = typeof req.query.subject === 'string' && req.query.subject ? req.query.subject : null
    const year = Number(req.query.year) || null
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20))
    const offset = Math.max(0, Number(req.query.offset) || 0)

    let q = supabase
      .from('yks_questions')
      .select('id, subject, kazanim_id, question_text, options, correct_option, solution, difficulty, exam_year, exam_label, source_type', { count: 'exact' })
      .eq('source_type', 'osym_cikmis')
      .order('exam_year', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)
    if (subject) q = q.eq('subject', subject)
    if (year) q = q.eq('exam_year', year)

    const { data, error, count } = await q
    if (error) throw error
    res.json({ questions: data ?? [], total: count ?? 0, limit, offset })
  } catch (err) {
    next(err)
  }
})

/** GET /api/v1/questions/osym/years — mevcut yıl/etiket envanteri (filtre UI'ı için).
 *
 * ⚠️ Burada satırları çekip JS'te saymak zorundayız (PostgREST group-by sunmuyor) — ama
 * DÜZ `.select()` PostgREST'in 1000 satır tavanına takılır. Ölçüldü: 1730 çıkmış sorunun
 * 1000'i geliyordu, 730'u SESSİZCE düşüyordu → filtre UI'ındaki her sayı yanlıştı. Hata da
 * uyarı da yoktu. fetchAll sayfalayarak gerçekten hepsini getirir. */
osymRouter.get('/years', async (_req, res, next) => {
  try {
    const data = await fetchAll<{ exam_year: number; exam_label: string | null }>(() =>
      supabase
        .from('yks_questions')
        .select('exam_year, exam_label')
        .eq('source_type', 'osym_cikmis')
        .not('exam_year', 'is', null),
    )
    const seen = new Map<string, { exam_year: number; exam_label: string | null; count: number }>()
    for (const r of data) {
      const key = `${r.exam_year}|${r.exam_label ?? ''}`
      const cur = seen.get(key)
      if (cur) cur.count += 1
      else seen.set(key, { exam_year: r.exam_year, exam_label: r.exam_label, count: 1 })
    }
    res.json({ years: [...seen.values()].sort((a, b) => b.exam_year - a.exam_year) })
  } catch (err) {
    next(err)
  }
})
