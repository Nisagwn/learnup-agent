/**
 * Migration — `questions` koleksiyonuna `verified` + eksik alan backfill'i
 *
 * Mevcut sorular `verified` alanı taşımıyor. Yeni soru havuzu okuyucusu few-shot ve
 * öğretmen onay kutusunda `verified`'a güvendiğinden, bu script tüm legacy soruları
 * `verified:true` yapar (görünür kalsınlar). Ayrıca tiered sorguların sessizce dışlamaması
 * için eksik `grade` / `sub_topic` / `random_seed` alanlarını da doldurur.
 *
 * Kullanım:
 *   # Emülatör:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8088 node scripts/migrate_questions_verified.cjs
 *   # Üretim (serviceAccountKey(3).json kök dizinde olmalı):
 *   node scripts/migrate_questions_verified.cjs
 *
 * Idempotent: ikinci çalıştırmada zaten tam olan dökümanlara yazmaz.
 * NOT: Okuyucu kodu (verified filtresi) canlıya çıkmadan ÖNCE çalıştırın.
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

const SEED_MAX = 1_000_000;

async function migrate() {
  const snap = await db.collection('questions').get();
  console.log(`📊 Toplam soru: ${snap.size}`);

  let batch = db.batch();
  let inBatch = 0;
  let updated = 0;
  let skipped = 0;
  let missingGrade = 0;
  let missingSubTopic = 0;
  let missingSeed = 0;

  for (const doc of snap.docs) {
    const d = doc.data();
    const patch = {};

    if (d.verified !== true) patch.verified = true;
    if (d.grade == null || d.grade === '') { patch.grade = '10'; missingGrade++; }
    if (d.sub_topic == null || d.sub_topic === '') {
      const fallback = d.topic || d.category || null;
      if (fallback) { patch.sub_topic = fallback; missingSubTopic++; }
    }
    if (typeof d.random_seed !== 'number') { patch.random_seed = Math.floor(Math.random() * SEED_MAX); missingSeed++; }

    if (Object.keys(patch).length === 0) { skipped++; continue; }

    batch.update(doc.ref, patch);
    inBatch++;
    updated++;
    if (inBatch >= 450) {
      await batch.commit();
      console.log(`  ✅ ${updated} soru güncellendi...`);
      batch = db.batch();
      inBatch = 0;
    }
  }

  if (inBatch > 0) await batch.commit();

  console.log('\n──────── Özet ────────');
  console.log(`✅ Güncellenen: ${updated}`);
  console.log(`⏭️  Zaten tam (atlanan): ${skipped}`);
  console.log(`   • grade eklendi: ${missingGrade}`);
  console.log(`   • sub_topic eklendi: ${missingSubTopic}`);
  console.log(`   • random_seed eklendi: ${missingSeed}`);
  process.exit(0);
}

migrate().catch((err) => {
  console.error('❌ Migration hatası:', err);
  process.exit(1);
});
