import { db } from "../firebase"; // Projedeki doğru firebase dosyası yolu
import { collection, addDoc } from "firebase/firestore";
import questionsData from "../data/questions.json";

export const seedQuestions = async () => {
  try {
    console.log("Yükleme işlemi başlatıldı...");
    
    for (const item of questionsData) {
      await addDoc(collection(db, "questions"), {
        text: item.question,
        options: item.choices,
        // ÖNEMLİ: Sayısal indeksi (0,1,2,3) gerçek şık metnine çeviriyoruz
        correctAnswer: item.choices && item.answer !== undefined ? item.choices[item.answer] : item.correctAnswer, 
        category: item.subject,
        difficulty: item.metadata?.difficulty || "medium",
        grade: item.metadata?.grade || "9",
        // Analiz motoru için ekstra istatistik
        correctnessRatio: item.metadata?.correctness_ratio || 0,
        createdAt: new Date()
      });
    }

    alert("Tebrikler! Tüm sorular Firestore'a başarıyla kaydedildi. 🚀");
  } catch (error) {
    console.error("Veri kaydedilirken hata oluştu: ", error);
    alert("Bir hata oluştu, konsolu kontrol et!");
  }
};
