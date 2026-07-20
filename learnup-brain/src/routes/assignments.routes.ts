import { Router } from 'express'
import { supabase } from '../clients/supabase.js'

/** Ödevler — otoriter (backend) puanlama. record-answer ÇAĞRILMAZ (çift sayım yok).
 *  (Edge: submit-assignment, submit-targeted-assignment)
 *
 * ⚠️ YETKİ SINIRI: bu servis SERVICE-ROLE anahtarı kullanır → RLS BAYPAS EDİLİR.
 * Postgres artık kimseyi korumuyor; her sorgunun JWT'den gelen req.userId'ye kapsanması
 * ZORUNLU. Gövdeden gelen bir id'yi sahiplik kontrolü olmadan kullanmak = doğrudan IDOR.
 */
export const assignmentsRouter = Router()

/** answers[i] = { questionId, selectedIndex }; seçilen metin correct_answer ile eşleşirse doğru. */
function scoreAnswers(
  answers: Array<{ questionId: string; selectedIndex: number }>,
  byId: Map<string, any>,
): number {
  let correctCount = 0
  for (const ans of answers) {
    const q = byId.get(String(ans?.questionId))
    if (!q) continue
    const opts = Array.isArray(q.options) ? q.options : []
    const idx = Number(ans?.selectedIndex)
    if (!Number.isInteger(idx) || idx < 0 || idx >= opts.length) continue // boş/geçersiz
    if (String(opts[idx]) === String(q.correct_answer)) correctCount += 1
  }
  return correctCount
}

async function loadQuestionsById(questionIds: string[]): Promise<Map<string, any>> {
  if (questionIds.length === 0) return new Map()
  const { data } = await supabase.from('questions').select('id, options, correct_answer').in('id', questionIds)
  return new Map((data || []).map((r: any) => [String(r.id), r]))
}

/** Soru satırını İSTEMCİYE GÜVENLİ hâle soy: correct_answer/explanation ASLA gitmez
 *  (cevap kâhini — puanlama yalnız sunucuda; submit uçları zaten tek-gönderimli). */
function sorulariSoy(rows: any[]): any[] {
  return rows.map((q: any) => ({
    id: q.id,
    question_text: q.question_text ?? q.text ?? '',
    options: Array.isArray(q.options) ? q.options : Object.values(q.options ?? {}),
    subject: q.category ?? q.subject ?? null,
    topic: q.topic ?? null,
    difficulty: q.difficulty ?? null,
  }))
}

/** GET /api/v1/assignments — öğrencinin ödev panosu: sınıf ödevleri (öğretmen üzerinden,
 *  submit ile AYNI sahiplik kuralı) + hedefli setler (student_id=ben) + gönderim durumu. */
assignmentsRouter.get('/', async (req, res, next) => {
  try {
    const userId = req.userId!
    const { data: profil } = await supabase
      .from('profiles').select('teacher_id').eq('id', userId).single()
    const teacherId = (profil as any)?.teacher_id ?? null

    const [sinif, hedefli, gonderim] = await Promise.all([
      teacherId
        ? supabase.from('assignments').select('*').eq('teacher_id', teacherId)
            .order('created_at', { ascending: false }).limit(50)
        : Promise.resolve({ data: [] as any[], error: null }),
      supabase.from('targeted_assignments').select('*').eq('student_id', userId)
        .order('created_at', { ascending: false }).limit(50),
      supabase.from('assignment_submissions').select('*').eq('student_id', userId).limit(200),
    ])

    const subBy = new Map((gonderim.data ?? []).map((s: any) => [String(s.assignment_id), s]))
    res.json({
      teacherId,
      assignments: ((sinif.data as any[]) ?? []).map((a: any) => {
        const s = subBy.get(String(a.id))
        return {
          id: a.id,
          title: a.title ?? a.name ?? 'Ödev',
          createdAt: a.created_at ?? null,
          dueDate: a.due_date ?? null,
          soruSayisi: Array.isArray(a.question_ids) ? a.question_ids.length : 0,
          submission: s
            ? { score: s.score ?? null, maxScore: s.max_score ?? null, submittedAt: s.created_at ?? null }
            : null,
        }
      }),
      targeted: ((hedefli.data as any[]) ?? []).map((t: any) => ({
        id: t.id,
        title: t.title ?? 'Hedefli Set',
        createdAt: t.created_at ?? null,
        status: t.status ?? 'pending',
        soruSayisi: Array.isArray(t.question_ids) ? t.question_ids.length : 0,
        score: t.score ?? null,
        maxScore: t.max_score ?? null,
        completedAt: t.completed_at ?? null,
      })),
    })
  } catch (err) {
    next(err)
  }
})

/** GET /api/v1/assignments/:id/questions — sınıf ödevinin soruları (cevapsız).
 *  Sahiplik: submit ile birebir aynı kural (öğretmenim ≠ ödevin öğretmeni → 403). */
assignmentsRouter.get('/:id/questions', async (req, res, next) => {
  try {
    const userId = req.userId!
    const { data: assignment } = await supabase
      .from('assignments').select('id, teacher_id, question_ids, title').eq('id', req.params.id).maybeSingle()
    if (!assignment) {
      res.status(404).json({ error: 'Ödev bulunamadı.' })
      return
    }
    const { data: profil } = await supabase.from('profiles').select('teacher_id').eq('id', userId).single()
    if (!(profil as any)?.teacher_id || (profil as any).teacher_id !== (assignment as any).teacher_id) {
      res.status(403).json({ error: 'Bu ödev size atanmamış.' })
      return
    }
    const ids = Array.isArray((assignment as any).question_ids)
      ? (assignment as any).question_ids.map((x: any) => String(x)) : []
    const { data: sorular } = ids.length
      ? await supabase.from('questions').select('*').in('id', ids)
      : { data: [] as any[] }
    // Ödevdeki sıra korunur
    const byId = new Map(((sorular as any[]) ?? []).map((q: any) => [String(q.id), q]))
    const sirali = ids.map((id: string) => byId.get(id)).filter(Boolean)
    res.json({ id: (assignment as any).id, title: (assignment as any).title ?? 'Ödev', questions: sorulariSoy(sirali) })
  } catch (err) {
    next(err)
  }
})

/** GET /api/v1/assignments/targeted/:id/questions — hedefli setin soruları (cevapsız). */
assignmentsRouter.get('/targeted/:id/questions', async (req, res, next) => {
  try {
    const userId = req.userId!
    const { data: ta } = await supabase
      .from('targeted_assignments').select('id, student_id, question_ids, title')
      .eq('id', req.params.id).eq('student_id', userId).maybeSingle()
    if (!ta) {
      res.status(404).json({ error: 'Hedefli set bulunamadı.' })
      return
    }
    const ids = Array.isArray((ta as any).question_ids)
      ? (ta as any).question_ids.map((x: any) => String(x)) : []
    const { data: sorular } = ids.length
      ? await supabase.from('questions').select('*').in('id', ids)
      : { data: [] as any[] }
    const byId = new Map(((sorular as any[]) ?? []).map((q: any) => [String(q.id), q]))
    const sirali = ids.map((id: string) => byId.get(id)).filter(Boolean)
    res.json({ id: (ta as any).id, title: (ta as any).title ?? 'Hedefli Set', questions: sorulariSoy(sirali) })
  } catch (err) {
    next(err)
  }
})

// POST /api/assignments/submit — küratörlü ödev gönderimi.
assignmentsRouter.post('/submit', async (req, res, next) => {
  try {
    const userId = req.userId!
    const body = req.body ?? {}
    const assignmentId = body?.assignmentId
    const answers: Array<{ questionId: string; selectedIndex: number }> = Array.isArray(body?.answers) ? body.answers : []
    if (!assignmentId) {
      res.status(400).json({ error: 'assignmentId gerekli.' })
      return
    }

    const { data: assignment, error: aErr } = await supabase
      .from('assignments')
      .select('*')
      .eq('id', assignmentId)
      .single()
    if (aErr || !assignment) {
      res.status(404).json({ error: 'Ödev bulunamadı.' })
      return
    }

    // SAHİPLİK: assignments'ta öğrenci kolonu YOK (yalnız teacher_id) → ödev sınıf geneli.
    // Bağ, öğrencinin KENDİ öğretmeni üzerinden kurulur: ödevi ancak o öğretmenin öğrencisi
    // gönderebilir. Bu kontrol olmadan herhangi bir kullanıcı, hiç atanmadığı bir ödeve
    // gönderim yapabiliyordu.
    const { data: profil } = await supabase
      .from('profiles')
      .select('teacher_id')
      .eq('id', userId)
      .single()
    if (!profil?.teacher_id || profil.teacher_id !== assignment.teacher_id) {
      res.status(403).json({ error: 'Bu ödev size atanmamış.' })
      return
    }

    // CEVAP KÂHİNİ KAPANIYOR: yanıt gövdesi correctCount döndürüyor. Tekrar tekrar gönderip
    // selectedIndex değiştirerek doğru cevaplar puandan geri okunabiliyordu. Tek gönderim.
    const { count: oncekiler } = await supabase
      .from('assignment_submissions')
      .select('*', { count: 'exact', head: true })
      .eq('assignment_id', assignmentId)
      .eq('student_id', userId)
    if ((oncekiler ?? 0) > 0) {
      res.status(409).json({ error: 'Bu ödevi zaten gönderdiniz.' })
      return
    }

    const questionIds: string[] = Array.isArray(assignment.question_ids)
      ? assignment.question_ids.map((x: any) => String(x))
      : []
    const byId = await loadQuestionsById(questionIds)
    const correctCount = scoreAnswers(answers, byId)
    const maxScore = answers.length || questionIds.length || 0

    const { data: inserted, error: iErr } = await supabase
      .from('assignment_submissions')
      .insert({
        assignment_id: assignmentId,
        student_id: userId,
        teacher_id: assignment.teacher_id || null,
        status: 'submitted',
        answers,
        auto_score: correctCount,
        score: correctCount,
        max_score: maxScore,
        correct_count: correctCount,
      })
      .select('*')
      .single()
    if (iErr) {
      res.status(500).json({ error: iErr.message || 'Gönderim kaydedilemedi.' })
      return
    }

    res.json({
      success: true,
      autoScore: correctCount,
      score: correctCount,
      maxScore,
      correctCount,
      submissionId: inserted?.id ?? null,
    })
  } catch (err) {
    next(err)
  }
})

// POST /api/assignments/targeted/submit — hedefli set gönderimi (targeted_assignments → completed).
assignmentsRouter.post('/targeted/submit', async (req, res, next) => {
  try {
    const userId = req.userId!
    const body = req.body ?? {}
    const targetedAssignmentId = body?.targetedAssignmentId
    const answers: Array<{ questionId: string; selectedIndex: number }> = Array.isArray(body?.answers) ? body.answers : []
    if (!targetedAssignmentId) {
      res.status(400).json({ error: 'targetedAssignmentId gerekli.' })
      return
    }

    // SAHİPLİK: set BANA mı atanmış? (student_id, targeted_assignments'ta NOT NULL)
    // Bu filtre olmadan herhangi bir öğrenci, herhangi bir kurbanın setini sıfırlayıp
    // "completed" işaretleyebiliyordu — cevaplarını da ezerek.
    const { data: ta, error: tErr } = await supabase
      .from('targeted_assignments')
      .select('*')
      .eq('id', targetedAssignmentId)
      .eq('student_id', userId)
      .single()
    if (tErr || !ta) {
      res.status(404).json({ error: 'Hedefli set bulunamadı.' })
      return
    }

    const questionIds: string[] = Array.isArray(ta.question_ids) ? ta.question_ids.map((x: any) => String(x)) : []
    const byId = await loadQuestionsById(questionIds)
    const correctCount = scoreAnswers(answers, byId)
    const maxScore = answers.length || questionIds.length || 0

    const { error: uErr } = await supabase
      .from('targeted_assignments')
      .update({
        answers,
        auto_score: correctCount,
        score: correctCount,
        max_score: maxScore,
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', targetedAssignmentId)
      .eq('student_id', userId) // SELECT'te kontrol ettik; UPDATE'te de TEKRAR (TOCTOU kapanır)
    if (uErr) {
      res.status(500).json({ error: uErr.message || 'Gönderim kaydedilemedi.' })
      return
    }

    res.json({ autoScore: correctCount, maxScore })
  } catch (err) {
    next(err)
  }
})
