import { Router } from 'express'
import { supabase } from '../clients/supabase.js'
import { llmChat, GEN_MODEL, GEN_MODES, buildModePromptConfig, parseTaggedQuestions } from '../lib/questions-ai.js'

/** AI soru üretimi + kaydı (4-şıklı app dünyası).
 *  (Edge: generate-questions, generate-targeted-set, save-ai-questions) */
export const questionsRouter = Router()

async function fetchSampleQuestions(subject: string, limit: number): Promise<any[]> {
  const { data } = await supabase
    .from('questions')
    .select('question_text,options,correct_answer,explanation')
    .eq('verified', true)
    .eq('category', subject)
    .limit(limit)
  return data || []
}

async function saveAIQuestions(questions: any[], meta: any): Promise<any[]> {
  const rows = questions.map((q) => ({
    teacher_id: meta.teacherId || null,
    category: meta.subject, subject: meta.subject, subject_tr: meta.subject,
    topic: meta.topic, sub_topic: meta.subTopic || meta.topic,
    question_text: q.question_text, options: q.options, correct_answer: q.correct_answer,
    explanation: q.explanation, difficulty: meta.difficulty, grade: String(meta.grade),
    verified: false, is_ai_generated: true, gen_mode: meta.mode,
    random_seed: Math.floor(Math.random() * 1_000_000),
  }))
  const { data } = await supabase.from('questions').insert(rows).select('id')
  return data || []
}

async function fetchStudentWrongSamples(studentId: string, subject: string, limit: number): Promise<any[]> {
  const { data } = await supabase
    .from('srs_cards')
    .select('snapshot,subject')
    .eq('user_id', studentId)
    .eq('subject', subject)
    .eq('consecutive_correct', 0)
    .not('snapshot', 'is', null)
    .limit(limit)
  return (data || [])
    .filter((c: any) => c.snapshot && Array.isArray(c.snapshot.choices) && c.snapshot.choices.length >= 4)
    .map((c: any) => ({
      question_text: c.snapshot.question,
      options: c.snapshot.choices,
      correct_answer: c.snapshot.answer,
      explanation: '',
    }))
}

// POST /api/questions/generate — çoktan seçmeli soru üretir (opsiyonel havuza yazar).
questionsRouter.post('/generate', async (req, res, next) => {
  try {
    const userId = req.userId!
    const { subject, topic, grade, count, difficulty, mode, persist } = req.body ?? {}
    if (!subject || !topic) {
      res.status(400).json({ error: 'subject ve topic gerekli.' })
      return
    }
    const qCount = Math.min(10, Math.max(1, Number(count) || 5))
    const gradeStr = grade ? String(grade) : '10'
    const diffStr = difficulty || 'orta'

    let samples: any[] = []
    if (String(mode || '').toLowerCase() === GEN_MODES.ANALYZE_AND_DERIVE) {
      samples = await fetchSampleQuestions(subject, 5)
    }
    const cfg = buildModePromptConfig(mode, { subject, topic, grade: gradeStr, difficulty: diffStr, count: qCount, samples })
    const text = await llmChat([{ role: 'system', content: cfg.system }, { role: 'user', content: cfg.prompt }], {
      model: GEN_MODEL, temperature: cfg.temperature, max_tokens: 2048,
    })
    const questions = parseTaggedQuestions(text)
    if (questions.length === 0) {
      res.status(502).json({ error: 'Soru üretilemedi. Lütfen tekrar deneyin.' })
      return
    }

    let questionIds: string[] | undefined
    if (persist) {
      const saved = await saveAIQuestions(questions, {
        subject, topic, subTopic: topic, grade: gradeStr, difficulty: diffStr, mode: cfg.mode, teacherId: userId,
      })
      questionIds = saved.map((s: any) => s.id)
    }
    res.json({ success: true, questions, mode: cfg.mode, questionIds })
  } catch (err) {
    next(err)
  }
})

// POST /api/questions/targeted — öğrencinin yanlışlarına (SRS) göre kişiselleştirilmiş set.
questionsRouter.post('/targeted', async (req, res, next) => {
  try {
    const teacherId = req.userId!
    const { studentId, subject, topic = null, grade = null, count } = req.body ?? {}
    if (!studentId || !subject) {
      res.status(400).json({ error: 'studentId ve subject gerekli.' })
      return
    }
    const qCount = Math.min(10, Math.max(1, Number(count) || 5))
    const gradeStr = grade ? String(grade) : '10'

    let samples = await fetchStudentWrongSamples(studentId, subject, qCount)
    const sourceWrongCount = samples.length
    let toppedUpCount = 0
    if (samples.length < qCount) {
      const extra = await fetchSampleQuestions(subject, qCount - samples.length)
      toppedUpCount = extra.length
      samples = samples.concat(extra)
    }

    const cfg = buildModePromptConfig(GEN_MODES.ANALYZE_AND_DERIVE, {
      subject, topic: topic || subject, grade: gradeStr, difficulty: 'orta', count: qCount, samples,
    })
    const text = await llmChat([{ role: 'system', content: cfg.system }, { role: 'user', content: cfg.prompt }], {
      model: GEN_MODEL, temperature: cfg.temperature, max_tokens: 2048,
    })
    const parsed = parseTaggedQuestions(text)
    if (parsed.length === 0) {
      res.status(502).json({ error: 'Hedefli soru üretilemedi.' })
      return
    }

    const saved = await saveAIQuestions(parsed, {
      subject, topic: topic || subject, subTopic: topic || subject,
      grade: gradeStr, difficulty: 'orta', mode: GEN_MODES.ANALYZE_AND_DERIVE, teacherId,
    })
    const questionIds = saved.map((s: any) => s.id)

    const { data: ta } = await supabase
      .from('targeted_assignments')
      .insert({
        teacher_id: teacherId, student_id: studentId, subject, topic: topic || null, grade: gradeStr,
        mode: GEN_MODES.ANALYZE_AND_DERIVE, question_ids: questionIds,
        source_wrong_count: sourceWrongCount, topped_up_count: toppedUpCount, status: 'draft',
      })
      .select('id')
      .single()

    res.json({ success: true, assignmentId: ta?.id, questionIds, sourceWrongCount, toppedUpCount })
  } catch (err) {
    next(err)
  }
})

// POST /api/questions/save — AI üretilmiş soruları questions tablosuna yazar (verified:false).
questionsRouter.post('/save', async (req, res, next) => {
  try {
    const userId = req.userId!
    const body = req.body ?? {}
    const questions = Array.isArray(body?.questions) ? body.questions : []
    const meta: any = body?.meta || {}
    if (questions.length === 0) {
      res.json({ savedIds: [] })
      return
    }

    const subject = meta.subject ?? 'Genel'
    const topic = meta.topic ?? null
    const subTopic = meta.subTopic || topic || null
    const grade = meta.grade != null ? String(meta.grade) : null
    const difficulty = meta.difficulty ?? 'medium'
    const mode = meta.mode ?? null
    const teacherId = meta.teacherId || userId

    const rows = questions.map((q: any) => ({
      category: subject, subject, subject_tr: subject, topic, sub_topic: subTopic,
      question_text: q?.question_text ?? '', options: Array.isArray(q?.options) ? q.options : [],
      correct_answer: q?.correct_answer ?? null, explanation: q?.explanation ?? '',
      difficulty, grade, verified: false, is_ai_generated: true, gen_mode: mode,
      random_seed: Math.floor(Math.random() * 1e6), teacher_id: teacherId,
    }))

    const { data, error } = await supabase.from('questions').insert(rows).select('id')
    if (error) {
      res.status(500).json({ error: error.message })
      return
    }
    const savedIds = (data || []).map((r: any) => r.id)
    res.json({ savedIds })
  } catch (err) {
    next(err)
  }
})
