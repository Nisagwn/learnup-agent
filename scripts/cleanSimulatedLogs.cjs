/**
 * Bakım Script'i — Sahte "simulated_student" Loglarını Temizle
 * 
 * Bu script, geliştirme/test sürecinde "Canlı Bildirim Simüle Et" butonu 
 * ile oluşturulmuş sahte log kayıtlarını Firestore'dan siler.
 * 
 * Kullanım:
 *   node scripts/cleanSimulatedLogs.cjs
 * 
 * DİKKAT: Bu script üretim veritabanını doğrudan değiştirir. 
 * Çalıştırmadan önce yedek almayı düşünün.
 */

const admin = require('firebase-admin');
const path = require('path');

// Service Account Key — projenin kök dizininde olmalı
const serviceAccount = require(path.resolve(__dirname, '..', 'serviceAccountKey(3).json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function cleanSimulatedLogs() {
  console.log('🔍 Sahte "simulated_student" logları aranıyor...\n');

  const snapshot = await db.collection('user_logs')
    .where('studentId', '==', 'simulated_student')
    .get();

  if (snapshot.empty) {
    console.log('✅ Hiç sahte log bulunamadı. Veritabanı temiz!');
    process.exit(0);
  }

  console.log(`⚠️  ${snapshot.size} adet sahte log bulundu.\n`);

  // Toplu silme (500'li batch'ler halinde)
  const batchSize = 500;
  let deleted = 0;

  while (deleted < snapshot.size) {
    const batch = db.batch();
    const slice = snapshot.docs.slice(deleted, deleted + batchSize);
    
    for (const doc of slice) {
      batch.delete(doc.ref);
      console.log(`  🗑️  Siliniyor: ${doc.id} — konu: ${doc.data().subject || 'bilinmiyor'}`);
    }
    
    await batch.commit();
    deleted += slice.length;
  }

  console.log(`\n✅ Toplam ${deleted} sahte log başarıyla silindi.`);
  
  // Ek: questionId'si olmayan logları da raporla (eski format)
  console.log('\n🔍 questionId alanı eksik loglar kontrol ediliyor...');
  
  const allLogs = await db.collection('user_logs').get();
  let missingFields = 0;
  
  for (const doc of allLogs.docs) {
    const data = doc.data();
    if (!data.questionId || !data.studentId) {
      missingFields++;
    }
  }
  
  if (missingFields > 0) {
    console.log(`⚠️  ${missingFields} adet log kaydında questionId veya studentId eksik.`);
    console.log('   Bu kayıtlar eski format. Silmek isterseniz script\'i genişletebilirsiniz.');
  } else {
    console.log('✅ Tüm loglar doğru formatta.');
  }

  process.exit(0);
}

cleanSimulatedLogs().catch(err => {
  console.error('❌ Hata:', err);
  process.exit(1);
});
