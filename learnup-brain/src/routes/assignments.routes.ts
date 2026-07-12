import { Router } from 'express'
import { supabase } from '../clients/supabase.js'

/** Ödevler — otoriter (backend) puanlama. record-answer ÇAĞRILMAZ (çift sayım yok).
 *  (Edge: submit-assignment, submit-targeted-assignment) */
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
    const body = req.body ?? {}
    const targetedAssignmentId = body?.targetedAssignmentId
    const answers: Array<{ questionId: string; selectedIndex: number }> = Array.isArray(body?.answers) ? body.answers : []
    if (!targetedAssignmentId) {
      res.status(400).json({ error: 'targetedAssignmentId gerekli.' })
      return
    }

    const { data: ta, error: tErr } = await supabase
      .from('targeted_assignments')
      .select('*')
      .eq('id', targetedAssignmentId)
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
    if (uErr) {
      res.status(500).json({ error: uErr.message || 'Gönderim kaydedilemedi.' })
      return
    }

    res.json({ autoScore: correctCount, maxScore })
  } catch (err) {
    next(err)
  }
})
