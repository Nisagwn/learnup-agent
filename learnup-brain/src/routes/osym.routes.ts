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
    // Sınav etiketi filtresi (TYT/AYT provası) — matrix ucundaki label değerleriyle aynı küme
    const label = typeof req.query.label === 'string' && req.query.label ? req.query.label : null
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20))
    const offset = Math.max(0, Number(req.query.offset) || 0)

    // ⚠️ `verified` FİLTRESİ ZORUNLU — eskiden YOKTU ve şunu yapıyordu: PDF→metin dönüşümünde
    // şeklini yitirmiş 32 soru (ÖLÇÜLDÜ; Matematik'te %6) öğrenciye ÇÖZÜLEMEZ hâlde gidiyordu:
    // "…grafiği aşağıda verilmiştir. y 7 6 y = f(x) 5 4 3 2 1 x O 1 2 3 4 5". Öğrenci çözemez,
    // rastgele işaretler ve sistem bunu "kavram yanılgısı" diye kaydeder → teşhis verisi kirlenir.
    // Çıkmış sorularda verified'ın anlamı "insan yazımı, resmî" DEĞİL; "servis edilebilir".
    let q = supabase
      .from('yks_questions')
      .select('id, subject, kazanim_id, question_text, options, correct_option, solution, difficulty, exam_year, exam_label, source_type', { count: 'exact' })
      .eq('source_type', 'osym_cikmis')
      .eq('verified', true)
      .order('exam_year', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)
    if (subject) q = q.eq('subject', subject)
    if (year) q = q.eq('exam_year', year)
    if (label) q = q.eq('exam_label', label)

    const { data, error, count } = await q
    if (error) throw error
    res.json({ questions: data ?? [], total: count ?? 0, limit, offset })
  } catch (err) {
    next(err)
  }
})

/** GET /api/v1/questions/osym/matrix — ders×yıl×etiket sayım matrisi (Arşiv'in zengin
 *  ızgarası). Kişisel veri yok → 10 dk modül-içi cache; fetchAll (1000 tavanı dersi). */
let matrisCache: { zaman: number; veri: unknown } | null = null

osymRouter.get('/matrix', async (_req, res, next) => {
  try {
    if (matrisCache && Date.now() - matrisCache.zaman < 10 * 60_000) {
      res.json(matrisCache.veri)
      return
    }
    const data = await fetchAll<{ subject: string; exam_year: number | null; exam_label: string | null }>(() =>
      supabase
        .from('yks_questions')
        .select('subject, exam_year, exam_label')
        .eq('source_type', 'osym_cikmis')
        .eq('verified', true),
    )
    const hucre = new Map<string, { subject: string; year: number | null; label: string | null; count: number }>()
    const dersler = new Map<string, number>()
    const yillar = new Map<number, number>()
    for (const r of data) {
      const key = `${r.subject}|${r.exam_year ?? ''}|${r.exam_label ?? ''}`
      const cur = hucre.get(key)
      if (cur) cur.count += 1
      else hucre.set(key, { subject: r.subject, year: r.exam_year, label: r.exam_label, count: 1 })
      dersler.set(r.subject, (dersler.get(r.subject) ?? 0) + 1)
      if (r.exam_year != null) yillar.set(r.exam_year, (yillar.get(r.exam_year) ?? 0) + 1)
    }
    const veri = {
      toplam: data.length,
      cells: [...hucre.values()],
      subjects: [...dersler.entries()].map(([subject, count]) => ({ subject, count })).sort((a, b) => b.count - a.count),
      years: [...yillar.entries()].map(([year, count]) => ({ year, count })).sort((a, b) => b.year - a.year),
    }
    matrisCache = { zaman: Date.now(), veri }
    res.json(veri)
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
