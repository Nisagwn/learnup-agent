import { Router } from 'express'
import { supabase } from '../clients/supabase.js'
import { logger } from '../utils/logger.js'
import {
  llmChat, CHAT_MODEL, GEN_MODEL, GEN_MODES, buildModePromptConfig, parseTaggedQuestions,
} from '../lib/questions-ai.js'
import { processAnswer } from '../lib/answers.js'
import { resolveKazanimByTopic } from '../lib/curriculum.js'
import { buildMicroTest } from '../lib/test-modes.js'
import { poolTopics } from './aiquestions.routes.js'

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

/**
 * GET /api/practice/suggest — "Koç seçsin": bugün çalışılacak kazanımı öner.
 *
 * Kural: pratik YALNIZ havuzdan okur (canlı üretim yok) → öneri de havuzda sorusu olan
 * kazanımlardan olmalı, yoksa öğrenci boş sete düşer. İki katman:
 *   1) EN ZAYIF ∩ HAVUZ: weak_kazanimlar (mastery) ile havuz konularını kesiştir.
 *   2) YEDEK (yeni öğrenci — mastery henüz yok, attempts<3): havuzun EN DOLU konusu.
 * Öneri yoksa (havuz tümüyle boş) reason='empty' döner → istemci "havuzu doldur" der.
 */
practiceRouter.get('/suggest', async (req, res, next) => {
  try {
    const userId = req.userId!
    const topics = await poolTopics()
    if (!topics.length) {
      res.json({ kazanim: null, reason: 'empty' })
      return
    }
    const havuzda = new Set(topics.map((t) => t.kazanimId))

    // 1) Zayıf ∩ havuz
    const { data: zayif } = await supabase.rpc('weak_kazanimlar', { p_user_id: userId, p_limit: 20 })
    const eslesen = (zayif ?? []).find((z: any) => havuzda.has(Number(z.kazanim_id)))
    const t = eslesen ? topics.find((x) => x.kazanimId === Number(eslesen.kazanim_id)) : null
    if (eslesen && t) {
      res.json({
        kazanim: { kazanimId: t.kazanimId, code: t.code, title: t.title, subject: t.subject, count: t.count },
        reason: 'weak',
        wrongRate: Number(eslesen.wrong_rate) || null,
      })
      return
    }

    // 2) Yedek: havuzun en dolu konusu (poolTopics zaten adete göre sıralı)
    const y = topics[0]
    res.json({
      kazanim: { kazanimId: y.kazanimId, code: y.code, title: y.title, subject: y.subject, count: y.count },
      reason: 'fallback',
    })
  } catch (err) {
    next(err)
  }
})

/**
 * GET /api/practice/review — SRS vadesi gelen kartlardan Çöz'e hazır tekrar seti.
 * Leitner kutuları applySrsAnswer ile ilerliyor ama vade hiçbir yerde GÖRÜNMÜYORDU.
 * Sorular yks tablolarından YALNIZ verified=true çekilir — cevaplanabilir_sorular
 * view'inde verified kolonu YOK (0013), oradan servis etmek denetimsiz soru sızdırırdı.
 */
practiceRouter.get('/review', async (req, res, next) => {
  try {
    const userId = req.userId!
    const simdi = new Date().toISOString()
    const { data: due, error } = await supabase
      .from('srs_cards')
      .select('question_id, next_review_at')
      .eq('user_id', userId)
      .not('next_review_at', 'is', null)
      .lte('next_review_at', simdi)
      .order('next_review_at', { ascending: true })
      .limit(30)
    if (error) throw error
    const kartlar = due ?? []
    if (!kartlar.length) {
      res.json({ count: 0, questions: [] })
      return
    }
    const ids = [...new Set(kartlar.map((k) => String(k.question_id)))]
    const SECIM = 'id, subject, kazanim_id, question_text, options, correct_option, solution, difficulty'
    const [ai, osym] = await Promise.all([
      supabase.from('yks_ai_questions').select(SECIM).in('id', ids).eq('verified', true),
      supabase.from('yks_questions').select(SECIM + ', exam_year, exam_label, source_type').in('id', ids).eq('verified', true),
    ])
    const byId = new Map<string, unknown>()
    for (const q of [...(ai.data ?? []), ...(osym.data ?? [])]) byId.set(String((q as { id: string }).id), q)
    // Vade sırası korunur; eski `questions` (öğretmen) havuzuna ait kartlar sessizce atlanır
    const questions = ids.map((id) => byId.get(id)).filter(Boolean).slice(0, 10)
    res.json({ count: kartlar.length, questions })
  } catch (err) {
    next(err)
  }
})

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

    const diffLabel = nextDifficultyNum === 1 ? 'kolay' : nextDifficultyNum === 3 ? 'zor' : 'orta'
    let newQuestion: any = null

    // ═══════════════════════════════════════════════════════════════════════
    // HAT BİRLEŞTİRME — bu akış ESKİ, DENETİMSİZ hattı kullanıyordu:
    //   · `questions` tablosundan `verified` filtresi OLMADAN okuyordu,
    //   · havuz boşsa tek llmChat çağrısıyla üretip ÖĞRENCİYE DOĞRUDAN veriyordu:
    //     müfredat grounding'i YOK, çıkmış soru örneği YOK, bağımsız doğrulama YOK.
    // Yani 907 kazanımlık müfredat, 1730 çıkmış soru ve beş kapılı denetçi — hiçbiri
    // öğrencinin gerçekte gördüğü sorulara dokunmuyordu.
    //
    // Artık: serbest metin konu → kazanım (eşikli). Çözülürse DENETİMLİ hat (assembleSegment:
    // havuzdan oku, eksiği grounded+doğrulanmış üret, havuza yaz). Çözülemezse eski hatta
    // düşeriz — ama o zaman bile denetimsiz soruyu öğrenciye VERMEYİZ (aşağı bak).
    // ═══════════════════════════════════════════════════════════════════════
    const eslesme = await resolveKazanimByTopic(subject, sub_topic !== 'Genel' ? sub_topic : topic)
      .catch((err) => { logger.warn({ err }, 'kazanım çözümlenemedi'); return null })

    if (eslesme) {
      try {
        const set = await buildMicroTest({
          userId, kazanimId: eslesme.node.id, difficulty: diffLabel, count: 1,
        })
        const q = set.find((x) => !excludeIds.has(String(x.id ?? '')))
        if (q) {
          newQuestion = {
            id: q.id ?? null,
            question_text: q.soru,
            options: ['A', 'B', 'C', 'D', 'E'].map((L) => q.siklar[L as 'A']),
            correct_answer: q.siklar[q.dogru as 'A'],
            explanation: q.cozum ?? '',
            category: subject, subject, topic, sub_topic,
            difficulty: diffLabel, is_ai_generated: true,
            kazanim_id: eslesme.node.id, kazanim: eslesme.node.code,
          }
          logger.info({ kazanim: eslesme.node.code, sim: eslesme.similarity.toFixed(3) },
            'pratik: denetimli hattan soru')
        }
      } catch (err) {
        logger.warn({ err, kazanim: eslesme.node.code }, 'denetimli hat başarısız — eski havuza düşülüyor')
      }
    }

    // ── Yedek: eski `questions` havuzu — ama YALNIZ DENETLENMİŞ satırlar ──
    // Denetimsiz AI çıktısını öğrenciye vermek, yanlış cevaplı soru göstermek demektir.
    // Öğretmen soruları (source_type='ogretmen') ve doğrulanmış olanlar geçerlidir.
    const havuzdanSec = async (filtre: (q: any) => any): Promise<any> => {
      const { data } = await filtre(
        supabase.from('questions').select('*').eq('category', subject).eq('verified', true),
      ).limit(10)
      return pick(data)
    }
    if (!newQuestion && sub_topic) newQuestion = await havuzdanSec((q: any) => q.eq('sub_topic', sub_topic))
    if (!newQuestion) newQuestion = await havuzdanSec((q: any) => q.eq('topic', topic))
    if (!newQuestion) newQuestion = await havuzdanSec((q: any) => q)

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
