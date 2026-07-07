const admin = require('firebase-admin');
const path = require('path');
const serviceAccount = require('./serviceAccountKey(3).json');

// DOSYA YOLUNU KONTROL EDİYORUZ
const questionsPath = path.join(__dirname, 'src', 'data', 'questions.json');
const questions = require(questionsPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

async function uploadData() {
  console.log(`📂 Okunan Dosya: ${questionsPath}`);
  console.log(`📊 Dosyada Tespit Edilen Soru Sayısı: ${questions.length}`);

  const batch = db.batch();
  const collectionRef = db.collection('questions');

  let count = 0;

  for (const q of questions) {
    const options = q.choices || [];
    const ansIndex = q.answer;
    const ansText = options[ansIndex] || "Bilinmiyor";

    const docRef = collectionRef.doc();
    batch.set(docRef, {
      text: q.question || "",
      options: options,
      correctAnswer: String(ansText), // Metin olarak zorla
      correctAnswerIndex: Number(ansIndex), // Sayı olarak zorla
      category: q.subject || "Genel",
      difficulty: q.metadata?.difficulty || "medium",
      grade: q.metadata?.grade || "10",
      createdAt: (admin.firestore && admin.firestore.FieldValue && admin.firestore.FieldValue.serverTimestamp) ? admin.firestore.FieldValue.serverTimestamp() : Date.now()
    });
    count++;
  }

  try {
    await batch.commit();
    console.log(`\n✅ BAŞARILI! Toplam ${count} soru yüklendi.`);
  } catch (error) {
    console.error("❌ Kritik Hata:", error);
  }
  process.exit();
}

uploadData();