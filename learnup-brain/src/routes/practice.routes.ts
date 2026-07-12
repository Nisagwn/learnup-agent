import { Router } from 'express'
import { supabase } from '../clients/supabase.js'
import { logger } from '../utils/logger.js'
import {
  llmChat, CHAT_MODEL, GEN_MODEL, GEN_MODES, buildModePromptConfig, parseTaggedQuestions,
} from '../lib/questions-ai.js'
import { processAnswer } from '../lib/answers.js'

/** Adaptif pratik motoru + otoriter gamification yazımı.
 *  (Edge: submit-answer [adaptif sıradaki soru], record-answer [XP/seri/görev/rozet/SRS]) */
export const practiceRouter = Router()

// DB satırını (snake_case) client'ın beklediği çift-şemalı biçime indirger.
function shapeQuestion(q: any) {
  if (!q) return null
  const options = Array.isArray(q.options) ? q.options : Object.values(q.options || {})
  const questionText = q.question_text ?? q.text ?? ''
  const correct = q.correct_answer ?? q.correctAnswer ?? null
  return {
    ...q,
    id: q.id,
    text: questionText,
    question_text: questionText,
    options,
    correctAnswer: correct,
    correct_answer: correct,
    isAI: !!(q.is_ai_generated ?? q.isAI),
    is_ai_generated: !!(q.is_ai_generated ?? q.isAI),
    category: q.category ?? q.subject ?? null,
    subject: q.subject ?? q.category ?? null,
    topic: q.topic ?? null,
    sub_topic: q.sub_topic ?? null,
    difficulty: q.difficulty ?? null,
    explanation: q.explanation ?? '',
  }
}

// POST /api/practice/next — cevabı analitik kaydeder ve SIRADAKI adaptif soruyu döndürür.
practiceRouter.post('/next', async (req, res, next) => {
  try {
    const userId = req.userId!
    const body = req.body ?? {}
    const {
      subject: reqSubject = null, topic: reqTopic = null, sub_topic: reqSubTopic = null,
      isCorrect = null, givenAnswer = null, duration = null, questionId = null, questionText = null,
    } = body

    const subject = reqSubject || reqTopic || 'Matematik'
    const topic = reqTopic || subject
    const sub_topic = reqSubTopic || body?.concept_tag || body?.conceptTag || 'Genel'
    const durationValue = Number(duration) || 15
    const solvedFromClient: string[] = Array.isArray(body?.solvedQuestionIds)
      ? body.solvedQuestionIds.map((x: any) => String(x))
      : []

    // Quiz session: son 30 soru id + mevcut zorluk
    const { data: sessionRow } = await supabase.from('quiz_sessions').select('*').eq('user_id', userId).maybeSingle()
    const sessionData: any = sessionRow || { user_id: userId, current_difficulty: 2, last_30_ids: [] }
    let last30Ids: string[] = Array.isArray(sessionData.last_30_ids)
      ? sessionData.last_30_ids.map((x: any) => String(x))
      : []
    const difficultyNum = Number(body?.difficulty) || Number(sessionData.current_difficulty) || 2
    const answered = isCorrect !== null && isCorrect !== undefined

    if (questionId) {
      last30Ids = Array.from(new Set([...last30Ids, String(questionId)]))
      if (last30Ids.length > 30) last30Ids.shift()
    }
    const excludeIds = new Set<string>([...last30Ids, ...solvedFromClient])

    // Pedagojik ipucu (yanlış cevapta)
    let pedagogicalHint: string | null = null
    if (isCorrect === false && questionText) {
      try {
        const hintPrompt = `Öğrenci şu soruyu yanlış cevapladı:
Soru: ${questionText}
Seçtiği Yanlış Cevap: ${givenAnswer || 'Belirtilmedi'}

Lütfen öğrenciyi motive edecek ve bu hatasındaki konsept eksiğini anlamasını sağlayacak tam 2 cümlelik pedagojik bir ipucu üret.`
        pedagogicalHint = (await llmChat([{ role: 'user', content: hintPrompt }], {
          model: CHAT_MODEL, temperature: 0.6, max_tokens: 150,
        })).trim()
      } catch (hintErr) {
        logger.warn({ err: hintErr }, 'Pedagojik ipucu üretilemedi')
      }
    }

    // Analitik kaydı (user_answers) — izole
    if (answered) {
      try {
        await supabase.from('user_answers').insert({
          user_id: userId,
          question_id: questionId ? String(questionId) : null,
          subject,
          sub_topic: sub_topic || null,
          is_correct: isCorrect === true,
          given_answer: givenAnswer || null,
          skipped: false,
          duration: durationValue,
        })
      } catch (aErr) {
        logger.warn({ err: aErr }, 'user_answers kaydı başarısız')
      }
    }

    // Sıradaki zorluk — adaptif tier [1,3]
    let nextDifficultyNum = difficultyNum
    if (isCorrect === true) nextDifficultyNum = Math.min(3, difficultyNum + 1)
    else if (isCorrect === false) nextDifficultyNum = Math.max(1, difficultyNum - 1)

    // Sonraki soru seçimi (havuz → yoksa üret)
    const pick = (rows: any[] | null) => {
      const list = (rows || []).filter((q) => !excludeIds.has(String(q.id)))
      return list.length ? list[Math.floor(Math.random() * list.length)] : null
    }

    let newQuestion: any = null
    if (!newQuestion && sub_topic) {
      const { data } = await supabase.from('questions').select('*').eq('category', subject).eq('sub_topic', sub_topic).limit(10)
      newQuestion = pick(data)
    }
    if (!newQuestion) {
      const { data } = await supabase.from('questions').select('*').eq('category', subject).eq('topic', topic).limit(10)
      newQuestion = pick(data)
    }
    if (!newQuestion) {
      const { data } = await supabase.from('questions').select('*').eq('category', subject).limit(10)
      newQuestion = pick(data)
    }
    if (!newQuestion) {
      try {
        const diffLabel = nextDifficultyNum === 1 ? 'kolay' : nextDifficultyNum === 3 ? 'zor' : 'orta'
        const diffStr = nextDifficultyNum === 1 ? 'easy' : nextDifficultyNum === 3 ? 'hard' : 'medium'
        const cfg = buildModePromptConfig(GEN_MODES.STRICT_CURRICULUM, { subject, topic, grade: '10', difficulty: diffLabel, count: 1 })
        const generatedText = await llmChat([{ role: 'system', content: cfg.system }, { role: 'user', content: cfg.prompt }], {
          model: GEN_MODEL, temperature: cfg.temperature, max_tokens: 700,
        })
        const parsed = parseTaggedQuestions(generatedText)
        if (parsed.length > 0) {
          const gq = parsed[0]
          const row = {
            category: subject, subject, subject_tr: subject,
            topic: topic || subject, sub_topic: sub_topic || topic || subject,
            question_text: gq.question_text, options: gq.options, correct_answer: gq.correct_answer,
            explanation: gq.explanation || '', difficulty: diffStr, grade: '10',
            verified: false, is_ai_generated: true, gen_mode: GEN_MODES.STRICT_CURRICULUM,
            random_seed: Math.floor(Math.random() * 1e6), teacher_id: null,
          }
          const { data: saved, error: insErr } = await supabase.from('questions').insert(row).select('*').single()
          if (insErr) logger.warn({ err: insErr }, 'Üretilen soru kaydedilemedi')
          else newQuestion = saved
        }
      } catch (genErr) {
        logger.warn({ err: genErr }, 'Soru üretimi başarısız')
      }
    }

    // Session güncelle (7 gün TTL)
    try {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      await supabase.from('quiz_sessions').upsert(
        { user_id: userId, current_difficulty: nextDifficultyNum, last_30_ids: last30Ids, expires_at: expiresAt },
        { onConflict: 'user_id' },
      )
    } catch (sErr) {
      logger.warn({ err: sErr }, 'quiz_sessions güncellenemedi')
    }

    res.json({
      success: true,
      stats: {
        currentLevel: nextDifficultyNum,
        correctStreak: isCorrect === true ? 1 : 0,
        wrongStreak: isCorrect === false ? 1 : 0,
      },
      nextQuestion: shapeQuestion(newQuestion),
      pedagogicalHint,
      mastery: { topic, value: null, levelUp: false, levelName: null },
    })
  } catch (err) {
    next(err)
  }
})

// POST /api/practice/record — birleşik cevap motoruna delege (lib/answers.ts).
// Aynı hesap, artık atomik record_answer RPC + sinyal + mastery ile. Yanıt sözleşmesi birebir.
practiceRouter.post('/record', async (req, res, next) => {
  try {
    res.json(await processAnswer(req.userId!, req.body ?? {}))
  } catch (err) {
    next(err)
  }
})
