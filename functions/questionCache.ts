import * as admin from "firebase-admin";

export interface QuestionData {
  question: string;
  difficulty: string;
  options: string[];
  answer: string;
  [key: string]: any;
}

/**
 * Gets a question from cache or generates a new one.
 *
 * Requirements met:
 * - Cache generated questions based on (level + topic).
 * - If same request comes within 5 minutes, return cached result.
 * - Otherwise call the AI API (via the provided callback).
 * - Store timestamp with cached data.
 * - Use TypeScript.
 *
 * @param topic - The topic of the question.
 * @param level - The student's level.
 * @param generateFn - A callback function that calls the AI API.
 * @param db - The Firestore database instance. Defaults to admin.firestore().
 * @returns The generated or cached question.
 */
export const getCachedQuestion = async (
  topic: string,
  level: string,
  generateFn: () => Promise<QuestionData>,
  db: admin.firestore.Firestore = admin.firestore()
): Promise<QuestionData> => {
  // Create a predictable document ID based on topic and level
  const cacheKey = `${level}_${topic}`.toLowerCase().replace(/[^a-z0-9]/g, "_");
  const cacheRef = db.collection("question_cache").doc(cacheKey);
  const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes window

  const doc = await cacheRef.get();
  const now = Date.now();

  // 1. Check if we have a valid, unexpired cached version
  if (doc.exists) {
    const data = doc.data();
    if (data && data.timestamp) {
      const timeSinceCached = now - data.timestamp;

      if (timeSinceCached < CACHE_TTL_MS && data.questionData) {
        console.log(`[Cache Hit] Returning cached question for ${level} - ${topic}`);
        return data.questionData as QuestionData;
      }
    }
  }

  console.log(`[Cache Miss] Generating new question for ${level} - ${topic}`);
  
  // 2. Cache missed or expired, call the AI API
  const newQuestion = await generateFn();

  // 3. Store the new question and timestamp back into Firestore
  await cacheRef.set({
    level,
    topic,
    questionData: newQuestion,
    timestamp: now,
  });

  return newQuestion;
};
