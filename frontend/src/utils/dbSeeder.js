import { supabase } from "../supabase";
import questionsData from "../data/questions.json";

export const seedQuestions = async () => {
  try {
    console.log("Yükleme işlemi başlatıldı...");

    // questions.json'daki her kaydı Supabase 'questions' tablosu kolonlarına eşle.
    const rows = questionsData.map((item) => ({
      question_text: item.question,
      options: item.choices,
      // ÖNEMLİ: Sayısal indeksi (0,1,2,3) gerçek şık metnine çeviriyoruz
      correct_answer:
        item.choices && item.answer !== undefined ? item.choices[item.answer] : item.correctAnswer,
      category: item.subject,
      difficulty: item.metadata?.difficulty || "medium",
      grade: item.metadata?.grade || "9",
      // created_at kolonu DB'de default now() taşır → alanı atlıyoruz.
    }));

    const { error } = await supabase.from("questions").insert(rows);
    if (error) throw error;

    alert("Tebrikler! Tüm sorular Supabase'e başarıyla kaydedildi. 🚀");
  } catch (error) {
    console.error("Veri kaydedilirken hata oluştu: ", error);
    alert("Bir hata oluştu, konsolu kontrol et!");
  }
};
