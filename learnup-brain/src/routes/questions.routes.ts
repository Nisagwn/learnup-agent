import { Router } from 'express'
import { z } from 'zod'
import { supabase } from '../clients/supabase.js'
import { llmChat, GEN_MODEL, GEN_MODES, buildModePromptConfig, parseTaggedQuestions } from '../lib/questions-ai.js'
import { resolveKazanimByTopic } from '../lib/curriculum.js'
import { buildMicroTest } from '../lib/test-modes.js'
import { assertTeacherOwnsStudent } from '../lib/yetki.js'
import { validateBody } from '../middleware/validate.js'

const GenerateSchema = z.object({
  subject: z.string().min(1),
  topic: z.string().min(1),
  grade: z.union([z.string(), z.number()]).optional(),
  count: z.number().int().min(1).max(10).optional().default(5),
  difficulty: z.enum(['kolay', 'orta', 'zor']).optional().default('orta'),
  mode: z.string().optional(),
  persist: z.boolean().optional(),
  // ⚠️ costOptimized / skipVerification BİLEREK KALDIRILDI.
  // Bu iki bayrak `lib/generation.ts` denetle() içinde `skipRepair`'i açıyor ve hakem
  // (verifyQuestion) HİÇ ÇAĞRILMADAN elle kurulmuş bir `verdict:'ACCEPT'` üretiliyordu;
  // sonuç `assembleSegment` üzerinden ortak havuza `verified:true` olarak yazılıyordu.
  // Yani istemci, cevap anahtarı hiç kontrol edilmemiş bir soruyu "doğrulanmış" damgasıyla
  // TÜM öğrencilere servis ettirebiliyordu. Doğrulama atlama kararı istemcinin değildir.
})

const TargetedSchema = z.object({
  studentId: z.string().uuid(),
  subject: z.string().min(1),
  topic: z.string().optional().nullable(),
  grade: z.union([z.string(), z.number()]).optional().nullable(),
  count: z.number().int().min(1).max(10).optional().default(5),
})

const SaveSchema = z.object({
  // .max(50): tek sınır 1MB gövdeydi — binlerce satır tek istekte havuza basılabiliyordu.
  questions: z.array(z.record(z.unknown())).min(1).max(50),
  meta: z.object({
    subject: z.string().optional(),
    topic: z.string().optional().nullable(),
    subTopic: z.string().optional().nullable(),
    grade: z.union([z.string(), z.number()]).optional().nullable(),
    difficulty: z.string().optional(),
    mode: z.string().optional().nullable(),
    // teacherId ŞEMADAN KALDIRILDI: gövdeden gelen değer doğrudan questions.teacher_id'ye
    // yazılıyordu → çağıran, soruları BAŞKA bir öğretmenin adına kaydedebiliyordu
    // (atıf sahteciliği: kurbanın "kendi soruları" listesi zehirleniyordu).
    // Atıf artık daima oturum sahibidir.
  }).optional(),
})

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

/** ServedQuestion (YKS şeması: A-E anahtarlı) → bu ucun eski yanıt şekli (options dizisi).
 *  Frontend bu şekli bekliyor; hattı değiştirirken sözleşmeyi bozmuyoruz. */
function yksToLegacy(q: { id?: string; soru: string; siklar: Record<string, string>; dogru: string; cozum: string | null }) {
  return {
    id: q.id,
    question_text: q.soru,
    options: ['A', 'B', 'C', 'D', 'E'].map((L) => q.siklar[L]),
    correct_answer: q.siklar[q.dogru],
    explanation: q.cozum ?? '',
  }
}

// POST /api/questions/generate — çoktan seçmeli soru üretir (opsiyonel havuza yazar).
questionsRouter.post('/generate', validateBody(GenerateSchema), async (req, res, next) => {
  try {
    const userId = req.userId!
    const { subject, topic, grade, count, difficulty, mode, persist } =
      ((req as unknown) as { validatedBody: z.infer<typeof GenerateSchema> }).validatedBody
    const qCount = count
    const gradeStr = grade ? String(grade) : '10'

    // ── HAT BİRLEŞTİRME: konu bir kazanıma çözülüyorsa DENETİMLİ hattan üret ──
    // Eski yol tek llmChat çağrısıydı: grounding yok, çıkmış soru örneği yok, doğrulama yok.
    // buildMicroTest havuzu da kullanır (ısınmışsa LLM'e hiç gitmez) ve ürettiğini havuza yazar.
    const eslesme = await resolveKazanimByTopic(subject, topic).catch(() => null)
    if (eslesme) {
      // options YOK: doğrulama hattı her zaman tam çalışır (bkz. GenerateSchema notu).
      const set = await buildMicroTest({
        userId, kazanimId: eslesme.node.id, difficulty, count: qCount,
      })
      if (set.length) {
        res.json({
          success: true,
          questions: set.map(yksToLegacy),
          mode: 'grounded_verified',
          kazanim: eslesme.node.code,
          questionIds: set.map((q) => q.id).filter(Boolean),
        })
        return
      }
      // Denetimli hat hiç soru veremediyse (kapılar hepsini eledi) eskiye düşme — dürüst ol.
      res.status(502).json({ error: 'Doğrulanmış soru üretilemedi. Lütfen tekrar deneyin.' })
      return
    }

    // ── Yedek: konu müfredatta yok (öğretmenin serbest konusu) → eski hat, verified:false ──
    let samples: any[] = []
    if (String(mode || '').toLowerCase() === GEN_MODES.ANALYZE_AND_DERIVE) {
      samples = await fetchSampleQuestions(subject, 5)
    }
    const cfg = buildModePromptConfig(mode ?? '', { subject, topic, grade: gradeStr, difficulty, count: qCount, samples })
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
        subject, topic, subTopic: topic, grade: gradeStr, difficulty, mode: cfg.mode, teacherId: userId,
      })
      questionIds = saved.map((s: any) => s.id)
    }
    res.json({ success: true, questions, mode: cfg.mode, questionIds })
  } catch (err) {
    next(err)
  }
})

// POST /api/questions/targeted — öğrencinin yanlışlarına (SRS) göre kişiselleştirilmiş set.
questionsRouter.post('/targeted', validateBody(TargetedSchema), async (req, res, next) => {
  try {
    const teacherId = req.userId!
    const { studentId, subject, topic, grade, count } =
      ((req as unknown) as { validatedBody: z.infer<typeof TargetedSchema> }).validatedBody

    // ⚠️ YETKİ: studentId GÖVDEDEN geliyor ve aşağıda o öğrencinin SRS yanlış-cevap
    // geçmişi (soru metni, şıklar, doğru cevap) çekilip LLM'e few-shot olarak veriliyor,
    // türetilen çıktı da çağırana dönüyor. Kontrol olmadan herhangi bir öğrenci
    // {"studentId":"<kurban>"} yollayıp kurbanın özel hata geçmişinden türetilmiş içerik
    // alabiliyor ve ona ödev iliştirebiliyordu (satır ~134: student_id: studentId).
    //
    // ROL kapısı artık mount'ta (app.ts requireRole('teacher','admin')) — orası
    // öğretmenin ONAYINI da doğrular. Buradaki elle yazılmış `role !== 'teacher'`
    // kontrolü `is_approved`'a BAKMIYORDU: onayı yönetici tarafından iptal edilmiş bir
    // öğretmen /teacher/* uçlarından atılıyor ama bu uçtan öğrenci verisi çekmeye
    // devam ediyordu.
    //
    // SAHİPLİK de kanonik yola bağlandı: elle yazılan `ogrenci.teacher_id !== teacherId`
    // kontrolü `teacher_ids` çoklu üyeliğini SAYMIYORDU — aynı sahiplik sorusuna repoda
    // iki farklı cevap veriliyordu. assertTeacherOwnsStudent tek tanımdır (404 döner:
    // "yok" ile "senin değil" ayrımını istemciye sızdırmaz).
    await assertTeacherOwnsStudent(teacherId, studentId)

    const qCount = count
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
questionsRouter.post('/save', validateBody(SaveSchema), async (req, res, next) => {
  try {
    const userId = req.userId!
    const { questions, meta } =
      ((req as unknown) as { validatedBody: z.infer<typeof SaveSchema> }).validatedBody
    const subject = meta?.subject ?? 'Genel'
    const topic = meta?.topic ?? null
    const subTopic = meta?.subTopic || topic || null
    const grade = meta?.grade != null ? String(meta.grade) : null
    const difficulty = meta?.difficulty ?? 'medium'
    const mode = meta?.mode ?? null
    const teacherId = userId   // atıf daima oturum sahibi (bkz. SaveSchema notu)

    const rows = questions.map((q: any) => ({
      category: subject, subject, subject_tr: subject, topic, sub_topic: subTopic,
      question_text: q?.question_text ?? '', options: Array.isArray(q?.options) ? q.options : [],
      correct_answer: q?.correct_answer ?? null, explanation: q?.explanation ?? '',
      difficulty, grade, verified: false, is_ai_generated: true, gen_mode: mode,
      random_seed: Math.floor(Math.random() * 1e6), teacher_id: teacherId,
    }))

    const { data, error } = await supabase.from('questions').insert(rows).select('id')
    // error.message DIŞARI VERİLMEZ: PostgREST hataları tablo/kolon adı taşır (şema keşfi).
    // Merkezî errorHandler bunu zaten kararlaştırmıştı; bu uç onu atlıyordu.
    if (error) throw error
    const savedIds = (data || []).map((r: any) => r.id)
    res.json({ savedIds })
  } catch (err) {
    next(err)
  }
})
