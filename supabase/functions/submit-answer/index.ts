// submit-answer — Adaptif motorun portu (functions/index.js exports.submitAnswer).
// Cevabı analitik olarak kaydeder ve SIRADAKI adaptif soruyu döndürür.
// Firestore→Supabase: users→profiles, quiz_sessions doc(id=userId)→quiz_sessions tablosu
// (user_id PK, current_difficulty, last_30_ids), questions koleksiyonu→questions tablosu (snake_case).
// XP/seri/görev/rozet gamification'ı AYRI record-answer fonksiyonu yazar; burada tekrarlanmaz.
import { preflight, json, getAdmin, resolveUserId } from '../_shared/http.ts';
import {
  llmChat, CHAT_MODEL, GEN_MODEL, GEN_MODES, buildModePromptConfig, parseTaggedQuestions,
} from '../_shared/ai.ts';

// DB satırını (snake_case) client'ın beklediği çift-şemalı biçime indirger.
// normalizeQuestion (src/utils) text|question_text, options, correctAnswer|correct_answer,
// isAI|is_ai_generated okur — her ikisini de veriyoruz.
function shapeQuestion(q: any) {
  if (!q) return null;
  const options = Array.isArray(q.options) ? q.options : Object.values(q.options || {});
  const questionText = q.question_text ?? q.text ?? '';
  const correct = q.correct_answer ?? q.correctAnswer ?? null;
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
  };
}

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);
  try {
    const admin = getAdmin();
    const userId = await resolveUserId(req, admin);
    if (!userId) return json({ error: 'userId gerekli.' }, 401);

    const body = await req.json().catch(() => ({} as any));
    const {
      subject: reqSubject = null,
      topic: reqTopic = null,
      sub_topic: reqSubTopic = null,
      isCorrect = null,
      givenAnswer = null,
      duration = null,
      questionId = null,
      questionText = null,
    } = body || {};

    // Parametre normalizasyonu (orijinaldeki mantık)
    const subject = reqSubject || reqTopic || 'Matematik';
    const topic = reqTopic || subject;
    const sub_topic = reqSubTopic || body?.concept_tag || body?.conceptTag || 'Genel';
    const durationValue = Number(duration) || 15;
    const solvedFromClient: string[] = Array.isArray(body?.solvedQuestionIds)
      ? body.solvedQuestionIds.map((x: any) => String(x))
      : [];

    // ─── QUIZ SESSION: son 30 soru ID listesi + mevcut zorluk ───
    const { data: sessionRow } = await admin
      .from('quiz_sessions').select('*').eq('user_id', userId).maybeSingle();
    const sessionData: any = sessionRow || { user_id: userId, current_difficulty: 2, last_30_ids: [] };
    let last30Ids: string[] = Array.isArray(sessionData.last_30_ids)
      ? sessionData.last_30_ids.map((x: any) => String(x)) : [];

    // Mevcut zorluk (1,2,3) — body.difficulty > session > 2
    const difficultyNum = Number(body?.difficulty) || Number(sessionData.current_difficulty) || 2;

    const answered = isCorrect !== null && isCorrect !== undefined;

    // Son 30 soru ID listesini güncelle (anti-tekrar penceresi)
    if (questionId) {
      last30Ids = Array.from(new Set([...last30Ids, String(questionId)]));
      if (last30Ids.length > 30) last30Ids.shift();
    }
    // Filtrelemede client'ın çözdüğü id'leri de dışla
    const excludeIds = new Set<string>([...last30Ids, ...solvedFromClient]);

    // ─── PEDAGOJİK İPUCU (yanlış cevapta) ───
    let pedagogicalHint: string | null = null;
    if (isCorrect === false && questionText) {
      try {
        const hintPrompt = `Öğrenci şu soruyu yanlış cevapladı:
Soru: ${questionText}
Seçtiği Yanlış Cevap: ${givenAnswer || 'Belirtilmedi'}

Lütfen öğrenciyi motive edecek ve bu hatasındaki konsept eksiğini anlamasını sağlayacak tam 2 cümlelik pedagojik bir ipucu (hint / çözüm tüyosu) üret.`;
        pedagogicalHint = (await llmChat(
          [{ role: 'user', content: hintPrompt }],
          { model: CHAT_MODEL, temperature: 0.6, max_tokens: 150 },
        )).trim();
      } catch (hintErr) {
        console.warn('Pedagojik ipucu üretilemedi:', hintErr);
      }
    }

    // ─── Analitik kaydı (user_answers) — izole; hata akışı 500'lemez ───
    if (answered) {
      try {
        await admin.from('user_answers').insert({
          user_id: userId,
          question_id: questionId ? String(questionId) : null,
          subject,
          sub_topic: sub_topic || null,
          is_correct: isCorrect === true,
          given_answer: givenAnswer || null,
          skipped: false,
          duration: durationValue,
        });
      } catch (aErr) {
        console.warn('user_answers kaydı başarısız:', aErr);
      }
    }

    // ─── Sıradaki sorunun zorluğu — adaptif tier (1↔3) ───
    // NOT (port sapması): profiles'ta ardışık-doğru seri kolonu yok; orijinaldeki
    // "3 doğruda yüksel" davranışı, kalıcı seri olmadan cevap-başına adaptasyona
    // sadeleştirildi (doğruda +1, yanlışta -1). Tier aralığı [1,3] korunur.
    let nextDifficultyNum = difficultyNum;
    if (isCorrect === true) nextDifficultyNum = Math.min(3, difficultyNum + 1);
    else if (isCorrect === false) nextDifficultyNum = Math.max(1, difficultyNum - 1);

    // ─── SONRAKİ SORU SEÇİMİ ───
    const pick = (rows: any[] | null) => {
      const list = (rows || []).filter((q) => !excludeIds.has(String(q.id)));
      return list.length ? list[Math.floor(Math.random() * list.length)] : null;
    };

    let newQuestion: any = null;

    // 1. sub_topic eşleşmeli havuz (difficulty filtresi YOK — seed difficulty string)
    if (!newQuestion && sub_topic) {
      const { data } = await admin.from('questions')
        .select('*').eq('category', subject).eq('sub_topic', sub_topic).limit(10);
      newQuestion = pick(data);
    }
    // 2. konu (topic) eşleşmeli havuz
    if (!newQuestion) {
      const { data } = await admin.from('questions')
        .select('*').eq('category', subject).eq('topic', topic).limit(10);
      newQuestion = pick(data);
    }
    // 3. ders (category) genel havuzu
    if (!newQuestion) {
      const { data } = await admin.from('questions')
        .select('*').eq('category', subject).limit(10);
      newQuestion = pick(data);
    }

    // 4. Havuz boşsa Groq ile üret + questions'a kaydet (verified:false)
    if (!newQuestion) {
      try {
        const diffLabel = nextDifficultyNum === 1 ? 'kolay' : (nextDifficultyNum === 3 ? 'zor' : 'orta');
        const diffStr = nextDifficultyNum === 1 ? 'easy' : (nextDifficultyNum === 3 ? 'hard' : 'medium');
        const cfg = buildModePromptConfig(GEN_MODES.STRICT_CURRICULUM, {
          subject, topic, grade: '10', difficulty: diffLabel, count: 1,
        });
        const generatedText = await llmChat(
          [{ role: 'system', content: cfg.system }, { role: 'user', content: cfg.prompt }],
          { model: GEN_MODEL, temperature: cfg.temperature, max_tokens: 700 },
        );
        const parsed = parseTaggedQuestions(generatedText);
        if (parsed.length > 0) {
          const g = parsed[0];
          const row = {
            category: subject,
            subject,
            subject_tr: subject,
            topic: topic || subject,
            sub_topic: sub_topic || topic || subject,
            question_text: g.question_text,
            options: g.options,
            correct_answer: g.correct_answer,
            explanation: g.explanation || '',
            difficulty: diffStr,
            grade: '10',
            verified: false,
            is_ai_generated: true,
            gen_mode: GEN_MODES.STRICT_CURRICULUM,
            random_seed: Math.floor(Math.random() * 1e6),
            teacher_id: null,
          };
          const { data: saved, error: insErr } = await admin
            .from('questions').insert(row).select('*').single();
          if (insErr) console.warn('Üretilen soru kaydedilemedi:', insErr.message);
          else newQuestion = saved;
        }
      } catch (genErr) {
        console.warn('Groq soru üretimi başarısız:', genErr);
      }
    }

    // ─── Session'ı güncelle (7 gün TTL) ───
    try {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      await admin.from('quiz_sessions').upsert({
        user_id: userId,
        current_difficulty: nextDifficultyNum,
        last_30_ids: last30Ids,
        expires_at: expiresAt,
      }, { onConflict: 'user_id' });
    } catch (sErr) {
      console.warn('quiz_sessions güncellenemedi:', sErr);
    }

    return json({
      success: true,
      stats: {
        currentLevel: nextDifficultyNum,
        correctStreak: isCorrect === true ? 1 : 0,
        wrongStreak: isCorrect === false ? 1 : 0,
      },
      nextQuestion: shapeQuestion(newQuestion),
      pedagogicalHint,
      mastery: { topic, value: null, levelUp: false, levelName: null },
    });
  } catch (err: any) {
    return json({ error: err?.message || 'Sunucu hatası.' }, 500);
  }
});
