const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const Groq = require("groq-sdk");
const admin = require("firebase-admin");
const cors = require("cors")({ origin: true });
const { GEN_MODES, buildModePromptConfig } = require("./lib/aiModes");

admin.initializeApp();
const db = admin.firestore();

const SEED_MAX = 1_000_000;

// AI model seçimi: SORU ÜRETİMİ güçlü modelle (kalite), kısa sohbet/ipucu hızlı/ucuz modelle.
const GEN_MODEL = "llama-3.3-70b-versatile"; // çoktan seçmeli soru üretimi
const CHAT_MODEL = "llama-3.1-8b-instant";   // sohbet asistanı + dinamik ipucu

// ─── SORU HAVUZU YARDIMCILARI (AI üretim + few-shot örnekleme) ────────────────
// AI few-shot için onaylı havuzdan örnek sorular çeker (verified:true).
// Salt-okunur; orderBy yok → ek index gerektirmez. Üretim hattını asla bloklamaz.
async function fetchSampleQuestions({ subject, topic = null, limit = 5 }) {
  try {
    // grade kasıtlı olarak sorguya eklenmez — few-shot örnekleri stil/kazanım içindir,
    // ek bir composite index (category+topic+verified+grade) gerektirmemek için.
    let ref = db.collection("questions").where("category", "==", subject).where("verified", "==", true);
    if (topic) ref = ref.where("topic", "==", topic);
    const snap = await ref.limit(limit * 4).get();
    let list = snap.docs.map((d) => {
      const x = d.data();
      return {
        question_text: x.text || x.question_text || "",
        options: Array.isArray(x.options) ? x.options : [],
        correct_answer: x.correctAnswer || x.correct_answer || null,
        explanation: x.explanation || "",
      };
    });
    list = list.filter((q) => Array.isArray(q.options) && q.options.length >= 4);
    // rastgele örnekle
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list.slice(0, limit);
  } catch (err) {
    logger.warn("fetchSampleQuestions başarısız:", err.message || err);
    return [];
  }
}

// Ayrıştırılmış AI sorularını `questions` koleksiyonuna yazar (verified:false).
// Dönen: kaydedilen { id, ...doc } listesi.
async function saveAIQuestions(parsedList, meta = {}) {
  const { subject, topic, subTopic, grade, difficulty = "medium", mode = GEN_MODES.STRICT_CURRICULUM, teacherId = null } = meta;
  const diffStr = typeof difficulty === "number"
    ? (difficulty === 1 ? "easy" : difficulty === 3 ? "hard" : "medium")
    : difficulty;
  const saved = [];
  for (const g of parsedList) {
    const docToSave = {
      category: subject,
      subject,
      topic: topic || subject,
      sub_topic: subTopic || topic || subject,
      difficulty: diffStr,
      text: g.question_text,
      question_text: g.question_text,
      options: g.options,
      correctAnswer: g.correct_answer,
      correct_answer: g.correct_answer,
      explanation: g.explanation || "",
      grade: String(grade || "10"),
      is_ai_generated: true,
      isAI: true,
      verified: false,
      gen_mode: mode,
      teacherId: teacherId || null,
      random_seed: Math.floor(Math.random() * SEED_MAX),
      createdAt: Date.now(),
    };
    const ref = await db.collection("questions").add(docToSave);
    saved.push({ id: ref.id, ...docToSave });
  }
  return saved;
}

// Bir öğrencinin SRS kartlarından henüz tekrar-ustalaşılmamış (consecutiveCorrect=0)
// yanlışlarını few-shot örneği olarak çeker. Snapshot'lı olduğundan soru silinse bile çalışır.
async function fetchStudentWrongSamples(studentId, subject, { limit = 5 } = {}) {
  try {
    const snap = await db
      .collection("users").doc(studentId).collection("srs_cards")
      .where("subject", "==", subject)
      .where("consecutiveCorrect", "==", 0)
      .orderBy("lastReviewedAt", "desc")
      .limit(limit)
      .get();
    return snap.docs
      .map((d) => d.data())
      .filter((c) => c.snapshot && c.snapshot.question)
      .map((c) => ({
        question_text: c.snapshot.question,
        options: Array.isArray(c.snapshot.choices) ? c.snapshot.choices : [],
        correct_answer: c.snapshot.answer ?? null,
        explanation: "",
      }));
  } catch (err) {
    logger.warn("fetchStudentWrongSamples başarısız:", err.message || err);
    return [];
  }
}

// Onaylı havuzdan derive few-shot örnekleriyle tamamlama (fetchSampleQuestions sarmalı).
async function fetchSamplesForDerive({ subject, topic = null, grade = null, limit = 5 }) {
  return fetchSampleQuestions({ subject, topic, grade, limit });
}

// ─── RATE LIMIT: Kullanıcı başına 2 saniyelik bekleme ────────────────────────
const lastCallMap = new Map();
const RATE_LIMIT_MS = 2000;

function isRateLimited(key) {
  const now = Date.now();
  const last = lastCallMap.get(key) || 0;
  if (now - last < RATE_LIMIT_MS) return true;
  lastCallMap.set(key, now);
  return false;
}

// ─── AI ÇIKTI AYRIŞTIRICI ────────────────────────────────────────────────────
// AI'nin satır-etiketli ([SORU]/[A]..[D]/[DOGRU]/[ACIKLAMA]) çıktısını ayrıştırır.
// JSON kullanılmaz; LaTeX ters-bölüleri ($\frac, \Delta) olduğu gibi korunur.
// "Tek doğru cevap" güvencesi: yalnızca 4 FARKLI şıkkı ve geçerli tek doğru
// cevabı olan sorular döndürülür; belirsiz/eksik sorular elenir.
function parseTaggedQuestions(text) {
  const tagMap = { SORU: 'q', A: 'a', B: 'b', C: 'c', D: 'd', DOGRU: 'correct', ACIKLAMA: 'exp' };
  const blocks = [];
  let cur = null;
  let lastKey = null;
  for (const line of String(text || '').split(/\r?\n/)) {
    const m = line.match(/^\s*\[\s*(SORU|A|B|C|D|DOGRU|ACIKLAMA)\b[^\]]*\]\s*(.*)$/i);
    if (m) {
      const key = tagMap[m[1].toUpperCase()];
      if (key === 'q') {
        if (cur && cur.q) blocks.push(cur);
        cur = { q: '', a: '', b: '', c: '', d: '', correct: '', exp: '' };
      }
      if (cur) { cur[key] = m[2].trim(); lastKey = key; }
    } else if (cur && lastKey && line.trim()) {
      // Satır kaymış devam metni — son alana ekle
      cur[lastKey] += ' ' + line.trim();
    }
  }
  if (cur && cur.q) blocks.push(cur);

  const letterIdx = { A: 0, B: 1, C: 2, D: 3 };
  return blocks
    .map((c) => {
      const options = [c.a, c.b, c.c, c.d].map((o) => (o || '').trim());
      if (!c.q.trim() || options.some((o) => !o)) return null;
      // Tek doğru cevap güvencesi: 4 şık birbirinden farklı olmalı
      if (new Set(options).size !== 4) return null;
      const idx = letterIdx[(c.correct || '').trim().toUpperCase().charAt(0)];
      if (idx == null) return null;
      return {
        question_text: c.q.trim(),
        options,
        correct_answer: options[idx],
        explanation: (c.exp || '').trim(),
      };
    })
    .filter(Boolean);
}

/**
 * getAIResponse — Chatbot mesajlarını işler.
 * Model: llama-3.1-8b-instant
 */
exports.getAIResponse = onRequest(
  { maxInstances: 10, cors: true, secrets: ["GROQ_API_KEY"] },
  (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") return res.status(204).send("");
    cors(req, res, async () => {
      if (req.method === "OPTIONS") {
        res.set("Access-Control-Allow-Origin", "*");
        res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
        return res.status(204).send("");
      }

      if (req.method !== "POST") {
        return res.status(405).json({ error: "Method Not Allowed" });
      }

      try {
        const { history, userMessage } = req.body;

        if (!userMessage) {
          return res.status(400).json({ error: "userMessage eksik." });
        }

        // Rate limit kontrolü
        const rateLimitKey = (req.body && req.body.userId) || req.ip || "anonymous";
        if (isRateLimited(rateLimitKey)) {
          logger.warn(`[RATE_LIMIT] ${rateLimitKey} çok hızlı istek gönderdi.`);
          return res.status(429).json({
            error: "Çok hızlı istek. 2 saniye bekleyin.",
            retryAfterMs: RATE_LIMIT_MS,
          });
        }

        // API anahtarını al
        let apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) {
          logger.error("GROQ_API_KEY bulunamadı!");
          return res.status(500).json({ error: "Sunucu yapılandırma hatası (GROQ_API_KEY eksik)." });
        }

        logger.info(`[GROQ] llama-3.1-8b-instant | key: ${apiKey.substring(0, 8)}...`);

        const groq = new Groq({ apiKey });

        const messages = [
          {
            role: "system",
            content: "Sen LearnUp platformunun asistanısın. Lise müfredatına hakimsin ve öğrencilere Türkçe, destekleyici ve kısa cevaplar verirsin."
          }
        ];

        if (history && Array.isArray(history)) {
          const recentHistory = history.slice(-4);
          recentHistory.forEach(item => {
            const role = item.role === "model" || item.role === "assistant" ? "assistant" : "user";
            const content = (item.parts && item.parts[0] && item.parts[0].text) || item.content || item.text || "";
            if (content) {
              messages.push({ role, content });
            }
          });
        }

        messages.push({ role: "user", content: userMessage });

        const chatCompletion = await groq.chat.completions.create({
          messages: messages,
          model: CHAT_MODEL,
          temperature: 0.5,
          max_tokens: 1024,
        });

        const replyText = chatCompletion.choices[0]?.message?.content || "Cevap üretilemedi.";

        logger.info("[GROQ] Başarılı yanıt.");
        return res.status(200).json({ reply: replyText });

      } catch (fnError) {
        logger.error("[GROQ] Hata:", fnError.message || fnError);
        
        const debugInfo = {
          attemptedModel: CHAT_MODEL,
          errorMessage: fnError.message || null,
          errorStatus: fnError.status || fnError.code || null,
        };

        return res.status(500).json({ 
          error: fnError.message || "Sunucu hatası.", 
          debug: debugInfo 
        });
      }
    });
  }
);

/**
 * submitAnswer — Soru çözüm sonuçlarını kaydeder ve bir sonraki adaptif soruyu belirler.
 * Final Hibrit Veri Şeması (quiz_sessions ve last_30_ids) ile çalışır.
 */
exports.submitAnswer = onRequest(
  { maxInstances: 10, cors: true, secrets: ["GROQ_API_KEY"] },
  (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") return res.status(204).send("");
    cors(req, res, async () => {
      if (req.method === "OPTIONS") {
        res.set("Access-Control-Allow-Origin", "*");
        res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
        return res.status(204).send("");
      }

      if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

      let userId = null;

      try {
        const { 
          subject: reqSubject, 
          topic: reqTopic, 
          sub_topic: reqSubTopic, 
          isCorrect, 
          givenAnswer, 
          duration, 
          questionId, 
          questionText = null 
        } = req.body;

        // Parametre normalizasyonu
        const subject = reqSubject || reqTopic || "Matematik";
        const topic = reqTopic || subject;
        const sub_topic = reqSubTopic || req.body.concept_tag || req.body.conceptTag || "Genel";
        const durationValue = Number(duration) || 15;

        // Token doğrulama
        const authHeader = (req.get('Authorization') || req.get('authorization') || '').toString();
        if (authHeader && authHeader.startsWith('Bearer ')) {
          const idToken = authHeader.split(' ')[1];
          try {
            const decoded = await admin.auth().verifyIdToken(idToken);
            userId = decoded.uid;
            logger.info(`Verified ID token for uid=${userId}`);
          } catch (err) {
            logger.warn(`Failed to verify ID token: ${err.message || err}`);
          }
        }

        if (!userId && req.body && req.body.userId) {
          userId = req.body.userId;
        }

        if (!userId) {
          return res.status(400).json({ error: "Eksik parametre: userId gerekli." });
        }

        // ─── QUIZ SESSION: Son 30 soru ID listesi yükle ───
        const sessionRef = db.collection('quiz_sessions').doc(userId);
        const sessionDoc = await sessionRef.get();
        let sessionData = sessionDoc.exists ? sessionDoc.data() : { user_id: userId, current_difficulty: 2, last_30_ids: [] };
        let last30Ids = sessionData.last_30_ids || [];

        // Kullanıcıyı yükle
        const userRef = db.collection('users').doc(userId);
        const userDoc = await userRef.get();
        const userData = userDoc.exists ? userDoc.data() : {};

        // Mevcut zorluk seviyesi (1, 2, 3)
        const difficultyNum = Number(req.body.difficulty) || (userData.level_data?.current_level) || 2;

        let xpDelta = 0;
        if (isCorrect !== null && isCorrect !== undefined) {
          if (isCorrect) {
            if (difficultyNum === 1) xpDelta = 2;
            else if (difficultyNum === 2) xpDelta = 5;
            else if (difficultyNum === 3) xpDelta = 10;
          } else {
            xpDelta = -3;
          }
        }

        // 1. Mastery Scores Map güncelleme
        const subjectKey = subject.toLowerCase().trim();
        const masteryScores = userData.mastery_scores || {};
        const subjectMastery = masteryScores[subjectKey] || { score: 0, solved_count: 0, avg_speed: 0 };

        const priorScore = typeof subjectMastery.score === 'number' ? subjectMastery.score : 0;
        const newScore = Math.max(0, Math.min(100, priorScore + xpDelta));
        const newSolvedCount = (subjectMastery.solved_count || 0) + (isCorrect !== null ? 1 : 0);
        const newAvgSpeed = subjectMastery.solved_count === 0 
          ? durationValue 
          : Math.round((((subjectMastery.avg_speed || 0) * subjectMastery.solved_count) + durationValue) / newSolvedCount);

        masteryScores[subjectKey] = {
          score: newScore,
          solved_count: newSolvedCount,
          avg_speed: newAvgSpeed
        };

        // 2. Learning Profile (streak ve weak topics) güncelleme
        const learningProfile = userData.learning_profile || { weak_topics: [], streak: 0 };
        let newStreak = learningProfile.streak || 0;
        let weakTopics = learningProfile.weak_topics || [];

        if (isCorrect !== null && isCorrect !== undefined) {
          if (isCorrect) {
            newStreak += 1;
          } else {
            newStreak = 0;
            if (sub_topic) weakTopics = Array.from(new Set([...weakTopics, sub_topic]));
          }
        }

        const updatedLearningProfile = {
          weak_topics: weakTopics,
          streak: newStreak
        };

        // 3. Level Data güncelleme (Her 100 toplam puan dolduğunda level atlanır)
        const totalMasterySum = Object.values(masteryScores).reduce((sum, item) => sum + (item.score || 0), 0);
        const overallLevel = Math.floor(totalMasterySum / 100) + 1;
        
        const getLevelTitle = (lvl) => {
          if (lvl <= 1) return "Çırak";
          if (lvl === 2) return "Gezgin";
          if (lvl === 3) return "Kaşif";
          return "Üstat";
        };

        const updatedLevelData = {
          current_level: overallLevel,
          title: getLevelTitle(overallLevel)
        };

        // Son 30 soru ID listesini güncelle
        if (questionId) {
          last30Ids = Array.from(new Set([...last30Ids, questionId]));
          if (last30Ids.length > 30) last30Ids.shift();
        }

        const apiKey = process.env.GROQ_API_KEY;
        const groq = apiKey ? new Groq({ apiKey }) : null;

        // ─── PEDAGOJİK İPUCU (Hata Durumunda) ───
        let pedagogicalHint = null;
        if (isCorrect === false && questionText && groq) {
          try {
            const hintPrompt = `Öğrenci şu soruyu yanlış cevapladı:
Soru: ${questionText}
Seçtiği Yanlış Cevap: ${givenAnswer || "Belirtilmedi"}

Lütfen öğrenciyi motive edecek ve bu hatasındaki konsept eksiğini anlamasını sağlayacak tam 2 cümlelik pedagojik bir ipucu (hint / çözüm tüyosu) üret.`;
            
            const hintCompletion = await groq.chat.completions.create({
              messages: [{ role: "user", content: hintPrompt }],
              model: CHAT_MODEL,
              temperature: 0.6,
              max_tokens: 150
            });
            pedagogicalHint = (hintCompletion.choices[0]?.message?.content || "").trim();
          } catch (err) {
            logger.error("Pedagogical hint generation failed:", err);
          }
        }

        // Veritabanı dökümanını kaydet (users koleksiyonunda artık büyük diziler tutulmuyor!)
        if (isCorrect !== null && isCorrect !== undefined) {
          // NOT: users.stats (correctAnswers/totalSolved) artik yalnizca frontend
          // tarafindan atomik increment ile yaziliyor. Burada tekrar yazilirsa
          // ayni cevap iki kez sayilir.
          await userRef.set({
            mastery_scores: masteryScores,
            learning_profile: updatedLearningProfile,
            level_data: updatedLevelData,
            // Geriye dönük uyumluluk
            mastery: Object.keys(masteryScores).reduce((acc, k) => ({ ...acc, [k]: masteryScores[k].score }), {}),
          }, { merge: true });

          // ─── user_answers Koleksiyonuna Analitik Kaydı ───
          await db.collection('user_answers').add({
            user_id: userId,
            question_id: questionId || null,
            is_correct: isCorrect,
            given_answer: givenAnswer || null,
            duration: durationValue,
            sub_topic: sub_topic || null,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
          });

          // ─── Kullanıcı özet (stats_summary) güncellemesi — cache amaçlı ───
          try {
            const nowDate = new Date();
            const monthKey = `${nowDate.getFullYear()}-${nowDate.getMonth()}`; // 0-based month index
            const dayIso = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate()).toISOString().slice(0,10);

            const summaryUpdates = {};
            summaryUpdates['stats_summary.totalSolved'] = admin.firestore.FieldValue.increment(1);
            if (isCorrect === true) summaryUpdates['stats_summary.correctAnswers'] = admin.firestore.FieldValue.increment(1);
            else if (isCorrect === false) summaryUpdates['stats_summary.wrongAnswers'] = admin.firestore.FieldValue.increment(1);
            else summaryUpdates['stats_summary.skippedAnswers'] = admin.firestore.FieldValue.increment(1);

            // Monthly / weekly buckets
            summaryUpdates[`stats_summary.monthly.${monthKey}.total`] = admin.firestore.FieldValue.increment(1);
            if (isCorrect === true) summaryUpdates[`stats_summary.monthly.${monthKey}.correct`] = admin.firestore.FieldValue.increment(1);

            summaryUpdates[`stats_summary.weekly.${dayIso}.total`] = admin.firestore.FieldValue.increment(1);
            if (isCorrect === true) summaryUpdates[`stats_summary.weekly.${dayIso}.correct`] = admin.firestore.FieldValue.increment(1);
            if (isCorrect === false) summaryUpdates[`stats_summary.weekly.${dayIso}.wrong`] = admin.firestore.FieldValue.increment(1);
            if (isCorrect === null || isCorrect === undefined) summaryUpdates[`stats_summary.weekly.${dayIso}.skipped`] = admin.firestore.FieldValue.increment(1);

            // Subject-level quick aggregations
            const subjKey = subjectKey || subject.toLowerCase().trim();
            if (subjKey) {
              summaryUpdates[`stats_summary.subjects.${subjKey}.total`] = admin.firestore.FieldValue.increment(1);
              if (isCorrect === true) summaryUpdates[`stats_summary.subjects.${subjKey}.correct`] = admin.firestore.FieldValue.increment(1);
            }

            await userRef.set(summaryUpdates, { merge: true });
          } catch (summaryErr) {
            logger.warn('stats_summary güncellemesi başarısız:', summaryErr.message || summaryErr);
          }

          // ─── quiz_sessions Koleksiyonu Güncelleme (7 gün TTL) ───
          const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
          await sessionRef.set({
            user_id: userId,
            current_difficulty: Number(userData.level_data?.current_level) || 2,
            last_30_ids: last30Ids,
            expires_at: admin.firestore.Timestamp.fromDate(expiresAt)
          }, { merge: true });
        }

        // Sonraki sorunun zorluğunu belirleme (3 doğruda zorluğu artır, yanlışta düşür)
        let nextDifficultyNum = difficultyNum;
        if (isCorrect) {
          if (newStreak >= 3) {
            nextDifficultyNum = Math.min(3, difficultyNum + 1);
          }
        } else if (isCorrect === false) {
          nextDifficultyNum = Math.max(1, difficultyNum - 1);
        }

        let newQuestion = null;

        // 1. ADIM: sub_topic eşleşmeli çözülmemiş soru ara
        if (sub_topic) {
          // Seed sorulari 'category' alaniyla kaydediliyor (bkz. dbSeeder.js).
          const subSnapshot = await db.collection('questions')
            .where('category', '==', subject)
            .where('sub_topic', '==', sub_topic)
            .limit(10)
            .get();
          if (!subSnapshot.empty) {
            const list = subSnapshot.docs
              .map(d => ({ id: d.id, ...d.data() }))
              .filter(q => !last30Ids.includes(q.id));
            if (list.length > 0) {
              newQuestion = list[Math.floor(Math.random() * list.length)];
              logger.info(`Alt başlık eşleşmeli soru seçildi: ${newQuestion.id}`);
            }
          }
        }

        // 2. ADIM: Konu ve zorluğa göre soru ara
        if (!newQuestion) {
          // difficulty filtresi kaldirildi: seed sorularinda difficulty string
          // ('medium'), nextDifficultyNum ise sayisal -> hicbir zaman eslesmiyordu.
          const mainSnapshot = await db.collection('questions')
            .where('category', '==', subject)
            .where('topic', '==', topic)
            .limit(10)
            .get();
          if (!mainSnapshot.empty) {
            const list = mainSnapshot.docs
              .map(d => ({ id: d.id, ...d.data() }))
              .filter(q => !last30Ids.includes(q.id));
            if (list.length > 0) {
              newQuestion = list[Math.floor(Math.random() * list.length)];
              logger.info(`Konu ve zorluk eşleşmeli soru seçildi: ${newQuestion.id}`);
            }
          }
        }

        // 3. ADIM: Ders bazlı genel havuzdan soru ara
        if (!newQuestion) {
          const generalSnapshot = await db.collection('questions')
            .where('category', '==', subject)
            .limit(10)
            .get();
          if (!generalSnapshot.empty) {
            const list = generalSnapshot.docs
              .map(d => ({ id: d.id, ...d.data() }))
              .filter(q => !last30Ids.includes(q.id));
            if (list.length > 0) {
              newQuestion = list[Math.floor(Math.random() * list.length)];
              logger.info(`Ders genel havuzundan soru seçildi: ${newQuestion.id}`);
            }
          }
        }

        // 4. ADIM: Soru bulunamadıysa Groq ile üret ve veritabanına kaydet
        // (JSON yerine satır-etiketli format — LaTeX ters-bölüleri bozulmaz)
        if (!newQuestion && groq) {
          // Adaptif sıcak yol STRICT modda kalır (T=0.3 — müfredat güvenli + token tasarrufu).
          const diffLabel = nextDifficultyNum === 1 ? 'kolay' : (nextDifficultyNum === 3 ? 'zor' : 'orta');
          const cfg = buildModePromptConfig(GEN_MODES.STRICT_CURRICULUM, {
            subject, topic, grade: '10', difficulty: diffLabel, count: 1,
          });

          try {
            logger.info(`[GROQ] Generating new question for ${subject} - ${topic}`);
            const chatCompletion = await groq.chat.completions.create({
              messages: [
                { role: "system", content: cfg.system },
                { role: "user", content: cfg.prompt }
              ],
              model: GEN_MODEL,
              temperature: cfg.temperature,
              max_tokens: 700,
            });

            const generatedText = chatCompletion.choices[0]?.message?.content || "";
            // 4 farklı şık + tek doğru cevap garantili sorular
            const list = parseTaggedQuestions(generatedText);

            if (list.length > 0) {
              const saved = await saveAIQuestions([list[0]], {
                subject, topic, subTopic: sub_topic || topic,
                grade: '10', difficulty: nextDifficultyNum, mode: GEN_MODES.STRICT_CURRICULUM, teacherId: null,
              });
              newQuestion = saved[0];
              logger.info(`Yeni soru üretildi ve havuza eklendi. ID: ${newQuestion.id}`);
            }
          } catch (genErr) {
            logger.error("Groq soru üretimi başarısız oldu:", genErr);
          }
        }

        // Geriye dönük uyumluluk dönüşümü
        if (newQuestion) {
          newQuestion.text = newQuestion.text || newQuestion.question_text || '';
          newQuestion.options = Array.isArray(newQuestion.options)
            ? newQuestion.options
            : Object.values(newQuestion.options || {});
          newQuestion.correctAnswer = newQuestion.correctAnswer || newQuestion.correct_answer || null;
          // difficulty yalnizca sayisalsa string'e cevrilir; seed sorularinin
          // string difficulty'si ('hard' vb.) korunur.
          if (typeof newQuestion.difficulty === 'number') {
            newQuestion.difficulty = newQuestion.difficulty === 1 ? 'easy' : (newQuestion.difficulty === 3 ? 'hard' : 'medium');
          }
          newQuestion.category = newQuestion.category || newQuestion.subject;
        }

        return res.status(200).json({ 
          success: true,
          stats: {
            currentLevel: nextDifficultyNum,
            correctStreak: newStreak,
            wrongStreak: isCorrect === false ? 1 : 0
          }, 
          nextQuestion: newQuestion,
          pedagogicalHint: pedagogicalHint,
          mastery: {
            topic,
            value: newScore,
            levelUp: overallLevel > (userData.level_data?.current_level || 1),
            levelName: getLevelTitle(overallLevel)
          }
        });

      } catch (error) {
        logger.error("submitAnswer Error:", error);
        return res.status(500).json({ error: error.message || "Bilinmeyen bir hata oluştu." });
      }
    });
  }
);

/**
 * generateQuestions — Öğretmen için AI ile çoktan seçmeli soru üretir.
 * Stateless: Firestore'a yazmaz; üretilen sorular client tarafından onaylanıp kaydedilir.
 * Model: GEN_MODEL (llama-3.3-70b-versatile) — kalite için güçlü model.
 */
exports.generateQuestions = onRequest(
  { maxInstances: 10, cors: true, secrets: ["GROQ_API_KEY"] },
  (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") return res.status(204).send("");
    cors(req, res, async () => {
      if (req.method === "OPTIONS") {
        res.set("Access-Control-Allow-Origin", "*");
        res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
        return res.status(204).send("");
      }
      if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

      try {
        const { subject, topic, grade, count, difficulty, mode, persist } = req.body;
        if (!subject || !topic) {
          return res.status(400).json({ error: "subject ve topic alanları gerekli." });
        }

        const rateLimitKey = (req.body && req.body.userId) || req.ip || "anonymous";
        if (isRateLimited(rateLimitKey)) {
          return res.status(429).json({ error: "Çok hızlı istek. 2 saniye bekleyin.", retryAfterMs: RATE_LIMIT_MS });
        }

        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) {
          logger.error("GROQ_API_KEY bulunamadı!");
          return res.status(500).json({ error: "Sunucu yapılandırma hatası (GROQ_API_KEY eksik)." });
        }

        const qCount = Math.min(10, Math.max(1, Number(count) || 5));
        const gradeStr = grade ? String(grade) : "10";
        const diffStr = difficulty || "orta";

        const groq = new Groq({ apiKey });

        // ANALYZE_AND_DERIVE modunda onaylı havuzdan few-shot örnekleri çek.
        // (subject Türkçe gelirse örnek bulunamaz → strict gövdeye düşer, güvenli.)
        let samples = [];
        if (String(mode || '').toLowerCase() === GEN_MODES.ANALYZE_AND_DERIVE) {
          samples = await fetchSampleQuestions({ subject, topic, grade: gradeStr, limit: 5 });
        }

        // Moda göre prompt yapılandırması (strict default). Satır-etiketli format korunur.
        const cfg = buildModePromptConfig(mode, {
          subject, topic, grade: gradeStr, difficulty: diffStr, count: qCount, samples,
        });

        logger.info(`[GROQ] generateQuestions: ${subject} - ${topic} (${qCount} soru, mod=${cfg.mode})`);
        const chatCompletion = await groq.chat.completions.create({
          messages: [
            { role: "system", content: cfg.system },
            { role: "user", content: cfg.prompt }
          ],
          model: GEN_MODEL,
          temperature: cfg.temperature,
          max_tokens: 2048,
        });

        const generatedText = chatCompletion.choices[0]?.message?.content || "";
        // Satır-etiketli metni ayrıştır; yalnızca 4 farklı şık + tek doğru cevap içeren sorular döner
        const questions = parseTaggedQuestions(generatedText);

        if (questions.length === 0) {
          logger.error("generateQuestions ayrıştırma boş döndü. Yanıt başı:", generatedText.slice(0, 300));
          return res.status(502).json({ error: "Soru üretilemedi. Lütfen tekrar deneyin." });
        }

        // persist=true ise sorular doğrudan havuza (verified:false) yazılır;
        // varsayılan false → öğretmen panelinde incele-sonra-ekle UX'i korunur.
        let questionIds;
        if (persist) {
          const teacherId = await resolveUserId(req);
          const saved = await saveAIQuestions(questions, {
            subject, topic, subTopic: topic, grade: gradeStr, difficulty: diffStr, mode: cfg.mode, teacherId,
          });
          questionIds = saved.map((s) => s.id);
        }

        logger.info(`[GROQ] ${questions.length} soru üretildi (mod=${cfg.mode}).`);
        return res.status(200).json({ success: true, questions, mode: cfg.mode, questionIds });

      } catch (fnError) {
        logger.error("[GROQ] generateQuestions Hata:", fnError.message || fnError);
        return res.status(500).json({ error: fnError.message || "Sunucu hatası." });
      }
    });
  }
);

/**
 * generateTargetedSet — Öğretmen için bir öğrencinin yanlışlarına göre kişiselleştirilmiş
 * soru seti üretir. Öğrencinin SRS yanlışlarını (snapshot'lı) ANALYZE_AND_DERIVE few-shot'una
 * verir; eksik kalırsa onaylı havuzdan tamamlar. Sonuç targeted_assignments doc'una yazılır.
 * Body: { studentId, subject, topic?, grade?, count? }
 */
exports.generateTargetedSet = onRequest(
  { maxInstances: 10, cors: true, secrets: ["GROQ_API_KEY"] },
  (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") return res.status(204).send("");
    cors(req, res, async () => {
      if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

      try {
        const teacherId = await resolveUserId(req);
        if (!teacherId) return res.status(400).json({ error: "Öğretmen kimliği gerekli." });

        const { studentId, subject, topic = null, grade = null, count } = req.body || {};
        if (!studentId || !subject) {
          return res.status(400).json({ error: "studentId ve subject alanları gerekli." });
        }

        const rateLimitKey = teacherId || req.ip || "anonymous";
        if (isRateLimited(rateLimitKey)) {
          return res.status(429).json({ error: "Çok hızlı istek. 2 saniye bekleyin.", retryAfterMs: RATE_LIMIT_MS });
        }

        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) {
          logger.error("GROQ_API_KEY bulunamadı!");
          return res.status(500).json({ error: "Sunucu yapılandırma hatası (GROQ_API_KEY eksik)." });
        }

        const qCount = Math.min(10, Math.max(1, Number(count) || 5));
        const gradeStr = grade ? String(grade) : "10";

        // 1) Öğrencinin yanlışları → few-shot
        let samples = await fetchStudentWrongSamples(studentId, subject, { limit: qCount });
        const sourceWrongCount = samples.length;
        // 2) Eksik kalırsa onaylı havuzdan tamamla
        let toppedUpCount = 0;
        if (samples.length < qCount) {
          const extra = await fetchSamplesForDerive({ subject, topic, grade: gradeStr, limit: qCount - samples.length });
          toppedUpCount = extra.length;
          samples = samples.concat(extra);
        }

        const cfg = buildModePromptConfig(GEN_MODES.ANALYZE_AND_DERIVE, {
          subject, topic: topic || subject, grade: gradeStr, difficulty: "orta", count: qCount, samples,
        });

        const groq = new Groq({ apiKey });
        logger.info(`[GROQ] generateTargetedSet: öğrenci=${studentId} ders=${subject} (${qCount} soru, ${sourceWrongCount} yanlış kaynaklı)`);
        const chatCompletion = await groq.chat.completions.create({
          messages: [
            { role: "system", content: cfg.system },
            { role: "user", content: cfg.prompt }
          ],
          model: GEN_MODEL,
          temperature: cfg.temperature,
          max_tokens: 2048,
        });

        const parsed = parseTaggedQuestions(chatCompletion.choices[0]?.message?.content || "");
        if (parsed.length === 0) {
          return res.status(502).json({ error: "Hedefli soru üretilemedi. Lütfen tekrar deneyin." });
        }

        const saved = await saveAIQuestions(parsed, {
          subject, topic: topic || subject, subTopic: topic || subject,
          grade: gradeStr, difficulty: "medium", mode: GEN_MODES.ANALYZE_AND_DERIVE, teacherId,
        });
        const questionIds = saved.map((s) => s.id);

        const docRef = await db.collection("targeted_assignments").add({
          teacherId,
          studentId,
          subject,
          topic: topic || null,
          grade: gradeStr,
          mode: GEN_MODES.ANALYZE_AND_DERIVE,
          questionIds,
          sourceWrongCount,
          toppedUpCount,
          status: "draft",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        logger.info(`[GROQ] Hedefli set oluşturuldu: ${docRef.id} (${questionIds.length} soru)`);
        return res.status(200).json({
          success: true,
          assignmentId: docRef.id,
          questionIds,
          sourceWrongCount,
          toppedUpCount,
        });

      } catch (fnError) {
        logger.error("[GROQ] generateTargetedSet Hata:", fnError.message || fnError);
        return res.status(500).json({ error: fnError.message || "Sunucu hatası." });
      }
    });
  }
);

// ════════════════════════════════════════════════════════════════════════════
// OYUNLAŞTIRMA — XP · Seri · Günlük Görevler · Haftalık Lig · Rozetler
// Tek otoriter giriş: recordAnswer. Tüm gamification yazmaları sunucuda yapılır.
// ════════════════════════════════════════════════════════════════════════════
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { xpForAnswer, todayISO, getWeekId, applyStreak } = require("./lib/gamification");
const { generateDailyQuests, applyAnswerToQuests } = require("./lib/quests");
const { resolveTierWeek } = require("./lib/league");
const { evaluateBadges } = require("./lib/badges");
const { applySrsAnswer } = require("./lib/srs");

// levelSystem.js ile aynı eşikler (doğru cevap sayısına göre seviye)
const LEVEL_THRESHOLDS = [0, 5, 15, 30, 60, 100, 150, 200];
function levelFromCorrect(correct) {
  let lvl = 1;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if ((correct || 0) >= LEVEL_THRESHOLDS[i]) lvl = i + 1;
  }
  return lvl;
}

// İstek başlığındaki ID token'dan veya gövdedeki userId'den kullanıcıyı çözer.
async function resolveUserId(req) {
  const authHeader = (req.get("Authorization") || req.get("authorization") || "").toString();
  if (authHeader.startsWith("Bearer ")) {
    try {
      const decoded = await admin.auth().verifyIdToken(authHeader.split(" ")[1]);
      return decoded.uid;
    } catch (err) {
      logger.warn(`ID token doğrulanamadı: ${err.message || err}`);
    }
  }
  return (req.body && req.body.userId) || null;
}

function freshGamification() {
  return {
    xp: 0,
    totalSolved: 0,
    correctAnswers: 0,
    subjects: {},
    streak: { count: 0, longest: 0, lastActiveDate: null, freezesAvailable: 0, freezeUsedDates: [] },
    league: { tier: "bronze", weekId: null, weeklyXP: 0 },
    dailyQuests: { date: null, quests: [] },
  };
}

// Ham gamification alanını normalize eder; görev/lig dönemi bayatladıysa yeniler.
function ensureGamification(raw, today, weekId) {
  const base = freshGamification();
  const g = { ...base, ...(raw || {}) };
  g.streak = { ...base.streak, ...(raw && raw.streak) };
  g.league = { ...base.league, ...(raw && raw.league) };
  g.subjects = (raw && raw.subjects) || {};
  if (!g.dailyQuests || g.dailyQuests.date !== today) {
    g.dailyQuests = generateDailyQuests(today);
  }
  if (g.league.weekId !== weekId) {
    g.league = { tier: g.league.tier || "bronze", weekId, weeklyXP: 0 };
  }
  return g;
}

function displayName(userData) {
  return (
    (userData && (userData.name || userData.fullName)) ||
    (userData && userData.email ? userData.email.split("@")[0] : null) ||
    "Öğrenci"
  );
}

// Lig sıralama kaydını günceller (haftalık XP otoriter olarak g.league'den yazılır).
// Yalnızca öğrenciler için çağırın — öğretmenler ligde yer almaz.
async function writeLeagueEntry(weekId, userId, name, tier, weeklyXP) {
  await db.collection("league_entries").doc(`${weekId}__${userId}`).set(
    {
      weekId,
      uid: userId,
      name,
      tier,
      weeklyXP,
      role: "student",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

// Kullanıcı dökümanından öğrenci olup olmadığını döndürür (varsayılan: öğrenci).
function isStudent(userData) {
  return (userData && userData.role ? userData.role : "student") === "student";
}

// CORS başlıklarını ayarlayıp OPTIONS'ı yanıtlar; POST değilse 405 döner.
function gameHandler(fn) {
  return (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") return res.status(204).send("");
    cors(req, res, async () => {
      if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });
      try {
        await fn(req, res);
      } catch (err) {
        logger.error("Gamification fonksiyon hatası:", err);
        return res.status(500).json({ error: err.message || "Sunucu hatası." });
      }
    });
  };
}

/**
 * recordAnswer — Her cevaptan sonra çağrılır. Tek elden: log yazar, XP/seri/görev/
 * lig ilerlemesini ve rozetleri günceller, animasyon için delta döndürür.
 */
exports.recordAnswer = onRequest(
  { maxInstances: 20, cors: true },
  gameHandler(async (req, res) => {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(400).json({ error: "userId gerekli." });

    const {
      questionId = null,
      subject = "Genel",
      topic = null,
      subTopic = null,
      isCorrect = null,
      isSkipped = false,
      attemptNumber = 1,
      durationSec = 0,
      snapshot = null,
      attemptId = null,
    } = req.body || {};

    const today = todayISO();
    const weekId = getWeekId();
    const userRef = db.collection("users").doc(userId);
    const userSnap = await userRef.get();
    const userData = userSnap.exists ? userSnap.data() : {};

    const g = ensureGamification(userData.gamification, today, weekId);

    // XP
    const xpGained = xpForAnswer({ isCorrect: isCorrect === true, isSkipped: !!isSkipped, attemptNumber });
    g.xp = (g.xp || 0) + xpGained;

    // Sayaçlar
    g.totalSolved = (g.totalSolved || 0) + 1;
    if (isCorrect === true) g.correctAnswers = (g.correctAnswers || 0) + 1;

    // Ders bazlı sayaç (rozet/ustalık için)
    const subjKey = String(subject).toLowerCase().trim();
    const sub = g.subjects[subjKey] || { solved: 0, correct: 0 };
    sub.solved += 1;
    if (isCorrect === true) sub.correct += 1;
    g.subjects[subjKey] = sub;

    // Seri (tembel değerlendirme)
    const streakResult = applyStreak(g.streak, today);
    g.streak = streakResult.streak;

    // Günlük görevler
    const questResult = applyAnswerToQuests(g.dailyQuests, {
      isCorrect: isCorrect === true,
      isSkipped: !!isSkipped,
      attemptNumber,
      subject,
    });
    g.dailyQuests = questResult.dailyQuests;

    // Lig haftalık XP
    g.league.weeklyXP = (g.league.weeklyXP || 0) + xpGained;

    // Rozet değerlendirme
    const masteryScores = {};
    Object.entries(g.subjects).forEach(([k, v]) => {
      masteryScores[k] = { score: v.solved > 0 ? Math.round((v.correct / v.solved) * 100) : 0 };
    });
    const level = levelFromCorrect(g.correctAnswers);
    const earnedBadges = evaluateBadges({
      streakDays: g.streak.count,
      totalSolved: g.totalSolved,
      correctAnswers: g.correctAnswers,
      level,
      masteryScores,
    });
    const persistedBadges = Object.keys(userData.unlockedBadges || {});
    const newBadges = earnedBadges.filter((id) => !persistedBadges.includes(id));

    // Cevap logu — UserStatsContext ve TeacherDashboard bu koleksiyonu tüketir
    await db.collection("user_logs").add({
      studentId: userId,
      teacherId: userData.teacherId || null,
      subject,
      sub_topic: subTopic || topic || "Genel",
      questionId,
      isCorrect: isCorrect === true,
      isSkipped: !!isSkipped,
      skipped: !!isSkipped,
      timeSpent: Number(durationSec) || 0,
      duration: Number(durationSec) || 0,
      attemptNumber: Number(attemptNumber) || 1,
      xp: xpGained,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    // ─── SRS (Yanlışlarım) — users/{uid}/srs_cards/{questionId} ───────────────
    // İzole: SRS hatası asla gamification yanıtını 500'lemez. Yalnızca terminal
    // (doğru/yanlış) cevaplarda kutuyu ilerletir; boş bırakmada yalnızca snapshot
    // tazelenir. attemptId ile aynı cevabın iki kez işlenmesi engellenir.
    if (questionId && isCorrect !== null && isCorrect !== undefined) {
      try {
        const cardRef = userRef.collection("srs_cards").doc(String(questionId));
        const cardSnap = await cardRef.get();
        const prev = cardSnap.exists ? cardSnap.data() : null;
        if (!prev || prev.lastAttemptId == null || prev.lastAttemptId !== attemptId || attemptId == null) {
          const now = Date.now();
          const next = applySrsAnswer(prev, { isCorrect: isCorrect === true, now });
          const card = {
            questionId: String(questionId),
            box: next.box,
            consecutiveCorrect: next.consecutiveCorrect,
            totalAttempts: next.totalAttempts,
            nextReviewAt: admin.firestore.Timestamp.fromMillis(next.nextReviewAtMs),
            lastReviewedAt: admin.firestore.Timestamp.fromMillis(next.lastReviewedAtMs),
            subject,
            topic: topic || null,
            sub_topic: subTopic || topic || null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          };
          if (attemptId != null) card.lastAttemptId = attemptId;
          // snapshot yalnızca geçerliyse yazılır (4 şık + soru metni) → merge ile korunur
          if (snapshot && snapshot.question && Array.isArray(snapshot.choices) && snapshot.choices.length >= 4) {
            card.snapshot = {
              question: String(snapshot.question),
              choices: snapshot.choices,
              answer: snapshot.answer ?? null,
            };
          }
          await cardRef.set(card, { merge: true });
        }
      } catch (srsErr) {
        logger.warn("SRS kartı güncellenemedi:", srsErr.message || srsErr);
      }
    }

    // Kullanıcı dökümanı (gamification + yeni rozetler)
    const updates = { gamification: g };
    const nowIso = new Date().toISOString();
    newBadges.forEach((id) => {
      updates[`unlockedBadges.${id}`] = nowIso;
    });
    await userRef.set(updates, { merge: true });

    // Lig sıralama kaydı — yalnızca öğrenciler
    if (isStudent(userData)) {
      await writeLeagueEntry(weekId, userId, displayName(userData), g.league.tier, g.league.weeklyXP);
    }

    return res.status(200).json({
      success: true,
      xpGained,
      totalXp: g.xp,
      level,
      streak: {
        count: g.streak.count,
        milestone: streakResult.milestone,
        freezeUsed: streakResult.freezeUsed,
        freezeEarned: streakResult.freezeEarned,
        freezesAvailable: g.streak.freezesAvailable,
      },
      questsCompleted: questResult.completedNow,
      dailyQuests: g.dailyQuests,
      newBadges,
      league: { tier: g.league.tier, weeklyXP: g.league.weeklyXP },
    });
  })
);

/**
 * ensureDailyState — İstemci açılışta çağırır. Bugünün görevlerini ve haftanın
 * lig kaydını yoksa oluşturur, güncel gamification durumunu döndürür.
 */
exports.ensureDailyState = onRequest(
  { maxInstances: 10, cors: true },
  gameHandler(async (req, res) => {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(400).json({ error: "userId gerekli." });

    const today = todayISO();
    const weekId = getWeekId();
    const userRef = db.collection("users").doc(userId);
    const userSnap = await userRef.get();
    const userData = userSnap.exists ? userSnap.data() : {};

    const g = ensureGamification(userData.gamification, today, weekId);
    await userRef.set({ gamification: g }, { merge: true });
    // Lig kaydı yalnızca öğrenciler için — öğretmenler ligde yer almaz
    if (isStudent(userData)) {
      await writeLeagueEntry(weekId, userId, displayName(userData), g.league.tier, g.league.weeklyXP);
    }

    return res.status(200).json({ success: true, gamification: g, weekId });
  })
);

/**
 * claimQuestReward — Tamamlanmış bir günlük görevin ödülünü verir.
 */
exports.claimQuestReward = onRequest(
  { maxInstances: 10, cors: true },
  gameHandler(async (req, res) => {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(400).json({ error: "userId gerekli." });
    const questId = req.body && req.body.questId;
    if (!questId) return res.status(400).json({ error: "questId gerekli." });

    const today = todayISO();
    const weekId = getWeekId();
    const userRef = db.collection("users").doc(userId);
    const userSnap = await userRef.get();
    const userData = userSnap.exists ? userSnap.data() : {};
    const g = ensureGamification(userData.gamification, today, weekId);

    const quest = g.dailyQuests.quests.find((q) => q.id === questId);
    if (!quest) return res.status(404).json({ error: "Görev bulunamadı." });
    if (quest.claimed) return res.status(400).json({ error: "Ödül zaten alındı." });
    if (quest.progress < quest.target) return res.status(400).json({ error: "Görev tamamlanmadı." });

    quest.claimed = true;
    g.xp = (g.xp || 0) + quest.rewardXP;
    g.league.weeklyXP = (g.league.weeklyXP || 0) + quest.rewardXP;

    await userRef.set({ gamification: g }, { merge: true });
    if (isStudent(userData)) {
      await writeLeagueEntry(weekId, userId, displayName(userData), g.league.tier, g.league.weeklyXP);
    }

    return res.status(200).json({
      success: true,
      rewardXP: quest.rewardXP,
      totalXp: g.xp,
      league: { tier: g.league.tier, weeklyXP: g.league.weeklyXP },
    });
  })
);

/**
 * rolloverLeague — Her Pazartesi sabahı çalışır: geçen haftanın lig gruplarını
 * sıralar, terfi/küme düşmeyi uygular ve yeni hafta kayıtlarını oluşturur.
 */
exports.rolloverLeague = onSchedule(
  { schedule: "5 0 * * 1", timeZone: "Europe/Istanbul" },
  async () => {
    const now = new Date();
    const currentWeek = getWeekId(now);
    const lastWeek = getWeekId(new Date(now.getTime() - 3 * 86400000));
    if (lastWeek === currentWeek) {
      logger.info("rolloverLeague: işlenecek tamamlanmış hafta yok.");
      return;
    }

    const snap = await db.collection("league_entries").where("weekId", "==", lastWeek).get();
    if (snap.empty) {
      logger.info(`rolloverLeague: ${lastWeek} için kayıt yok.`);
      return;
    }

    const byTier = {};
    snap.forEach((d) => {
      const e = d.data();
      const tier = e.tier || "bronze";
      (byTier[tier] = byTier[tier] || []).push(e);
    });

    const batch = db.batch();
    Object.keys(byTier).forEach((tier) => {
      const results = resolveTierWeek(byTier[tier], tier);
      results.forEach((r) => {
        const member = byTier[tier].find((e) => e.uid === r.uid);
        batch.set(
          db.collection("users").doc(r.uid),
          { gamification: { league: { tier: r.newTier, weekId: currentWeek, weeklyXP: 0 } } },
          { merge: true }
        );
        batch.set(
          db.collection("league_entries").doc(`${currentWeek}__${r.uid}`),
          {
            weekId: currentWeek,
            uid: r.uid,
            name: (member && member.name) || "Öğrenci",
            tier: r.newTier,
            weeklyXP: 0,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      });
    });

    await batch.commit();
    logger.info(`rolloverLeague: ${lastWeek} → ${currentWeek} tamamlandı (${snap.size} kayıt).`);
  }
);

/**
 * cleanupLeagueEntries — Bayat lig kayıtlarını temizler:
 *   • Öğrenci olmayan (öğretmen vb.) kullanıcıların entry'leri,
 *   • Artık var olmayan kullanıcıların entry'leri.
 *
 * Tek-seferlik bakım fonksiyonu. POST ile çağırılır, auth gerektirir
 * (Bearer token). Yanıt: { scanned, deleted, missing, kept }.
 *
 * Kullanım: deploy sonrası bir kez tetikle:
 *   curl -X POST -H "Authorization: Bearer $ID_TOKEN" \
 *     https://<region>-<project>.cloudfunctions.net/cleanupLeagueEntries
 */
exports.cleanupLeagueEntries = onRequest(
  { maxInstances: 1, cors: true },
  gameHandler(async (req, res) => {
    const callerId = await resolveUserId(req);
    if (!callerId) return res.status(401).json({ error: "Yetki gerekli (Bearer token)." });

    const snap = await db.collection("league_entries").get();
    if (snap.empty) {
      return res.status(200).json({ success: true, scanned: 0, deleted: 0, missing: 0, kept: 0 });
    }

    // uid -> role cache (aynı kullanıcı birden çok haftaya ait entry'ye sahip olabilir)
    const roleCache = new Map();
    const getRole = async (uid) => {
      if (roleCache.has(uid)) return roleCache.get(uid);
      try {
        const u = await db.collection("users").doc(uid).get();
        const role = u.exists ? (u.data().role || "student") : null;
        roleCache.set(uid, role);
        return role;
      } catch {
        roleCache.set(uid, null);
        return null;
      }
    };

    let scanned = 0;
    let deleted = 0;
    let kept = 0;
    let missing = 0;
    let batch = db.batch();
    let inBatch = 0;
    const BATCH_LIMIT = 450; // Firestore 500 sınırının altında güvenli pay

    for (const docSnap of snap.docs) {
      scanned += 1;
      const e = docSnap.data();
      if (!e || !e.uid) {
        // bozuk doküman — sil
        missing += 1;
        batch.delete(docSnap.ref);
        inBatch += 1;
      } else {
        const role = await getRole(e.uid);
        if (role === null) {
          missing += 1;
          batch.delete(docSnap.ref);
          inBatch += 1;
        } else if (role !== "student") {
          deleted += 1;
          batch.delete(docSnap.ref);
          inBatch += 1;
        } else {
          kept += 1;
        }
      }

      if (inBatch >= BATCH_LIMIT) {
        await batch.commit();
        batch = db.batch();
        inBatch = 0;
      }
    }

    if (inBatch > 0) await batch.commit();

    logger.info(
      `cleanupLeagueEntries: caller=${callerId} scanned=${scanned} deleted=${deleted} missing=${missing} kept=${kept}`
    );
    return res.status(200).json({ success: true, scanned, deleted, missing, kept });
  })
);
