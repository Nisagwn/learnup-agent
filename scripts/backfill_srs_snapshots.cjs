/**
 * Backfill — SRS kartlarını geçmiş yanlış cevaplardan oluştur
 *
 * Her yanlış cevap için `users/{uid}/srs_cards/{questionId}` kartını, sorunun
 * anlık görüntüsüyle (snapshot) doldurur. Böylece "Yanlışlarım" destesi geçmişten seedlenir
 * ve soru havuzdan silinse bile metin korunur.
 *
 * Kaynak: `user_answers` (where is_correct == false). question_id ile `questions`'tan
 * snapshot çekilir (memoize'li). Aynı (uid, qid) için en yeni yanlış kullanılır.
 *
 * Kullanım:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8088 node scripts/backfill_srs_snapshots.cjs
 *   node scripts/backfill_srs_snapshots.cjs   # üretim
 *
 * Idempotent: kart zaten varsa (öğrenci o sırada ilerletmiş olabilir) yazmaz.
 */
const admin = require('firebase-admin');
const path = require('path');

if (process.env.FIRESTORE_EMULATOR_HOST) {
  admin.initializeApp({ projectId: 'learnup-3cdb7' });
  console.log(`🧪 Emülatör modu: ${process.env.FIRESTORE_EMULATOR_HOST}`);
} else {
  const serviceAccount = require(path.resolve(__dirname, '..', 'serviceAccountKey(3).json'));
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  console.log('🚀 Üretim modu (service account)');
}

const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

function tsMillis(t) {
  if (!t) return 0;
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (typeof t === 'number') return t;
  return 0;
}

async function backfill() {
  const snap = await db.collection('user_answers').where('is_correct', '==', false).get();
  console.log(`📊 Yanlış cevap kaydı: ${snap.size}`);

  // (uid::qid) → en yeni yanlış kaydı
  const latest = new Map();
  for (const doc of snap.docs) {
    const a = doc.data();
    if (!a.user_id || !a.question_id) continue;
    const key = `${a.user_id}::${a.question_id}`;
    const ms = tsMillis(a.timestamp);
    const prev = latest.get(key);
    if (!prev || ms > prev.ms) latest.set(key, { uid: a.user_id, qid: a.question_id, ms, sub_topic: a.sub_topic || null });
  }
  console.log(`🔑 Benzersiz (öğrenci, soru) çifti: ${latest.size}`);

  const questionCache = new Map();
  async function getQuestion(qid) {
    if (questionCache.has(qid)) return questionCache.get(qid);
    const qs = await db.collection('questions').doc(qid).get();
    const data = qs.exists ? qs.data() : null;
    questionCache.set(qid, data);
    return data;
  }

  let batch = db.batch();
  let inBatch = 0;
  let written = 0;
  let skippedExisting = 0;
  let skippedMissingQ = 0;

  for (const { uid, qid, ms, sub_topic } of latest.values()) {
    const cardRef = db.collection('users').doc(uid).collection('srs_cards').doc(qid);
    const existing = await cardRef.get();
    if (existing.exists) { skippedExisting++; continue; }

    const q = await getQuestion(qid);
    if (!q) { skippedMissingQ++; continue; }

    const choices = Array.isArray(q.options) ? q.options : Array.isArray(q.choices) ? q.choices : [];
    const card = {
      questionId: qid,
      box: 0,
      consecutiveCorrect: 0,
      totalAttempts: 1,
      nextReviewAt: admin.firestore.Timestamp.fromMillis(ms || Date.now()),
      lastReviewedAt: admin.firestore.Timestamp.fromMillis(ms || Date.now()),
      subject: q.category || q.subject || null,
      topic: q.topic || null,
      sub_topic: sub_topic || q.sub_topic || q.topic || null,
      snapshot: {
        question: q.text || q.question_text || '',
        choices,
        answer: q.correctAnswer || q.correct_answer || null,
      },
      source: 'backfill',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    batch.set(cardRef, card);
    inBatch++;
    written++;
    if (inBatch >= 450) {
      await batch.commit();
      console.log(`  ✅ ${written} kart yazıldı...`);
      batch = db.batch();
      inBatch = 0;
    }
  }

  if (inBatch > 0) await batch.commit();

  console.log('\n──────── Özet ────────');
  console.log(`✅ Yazılan SRS kartı: ${written}`);
  console.log(`⏭️  Zaten mevcut (atlanan): ${skippedExisting}`);
  console.log(`⚠️  Soru bulunamadı (atlanan): ${skippedMissingQ}`);
  process.exit(0);
}

backfill().catch((err) => {
  console.error('❌ Backfill hatası:', err);
  process.exit(1);
});
