import * as admin from "firebase-admin";
import { HttpsError } from "firebase-functions/v2/https";
import * as crypto from "crypto";

/**
 * Ensures only 1 active AI request per user at a time using a Firestore-based lock.
 *
 * Requirements met:
 * - Only allow 1 active AI request per user at a time.
 * - If another request comes while processing, reject it (throw HttpsError).
 * - Use Firestore to track active jobs.
 * - Use TypeScript.
 *
 * @param userId - The ID of the user.
 * @param taskFn - The async function containing the AI logic.
 * @param db - The Firestore instance. Defaults to admin.firestore().
 * @returns The result of the taskFn.
 */
export const runExclusiveAITask = async <T>(
  userId: string,
  taskFn: () => Promise<T>,
  db: admin.firestore.Firestore = admin.firestore()
): Promise<T> => {
  if (!userId) {
    throw new HttpsError(
      "unauthenticated",
      "User ID is required to acquire an AI lock."
    );
  }

  const lockRef = db.collection("active_ai_jobs").doc(userId);
  const LOCK_TIMEOUT_MS = 60000; // 1 minute max lock duration to prevent permanently stuck locks
  const jobId = crypto.randomUUID(); // Unique ID for this specific execution

  // 1. Acquire the lock using a transaction
  await db.runTransaction(async (transaction) => {
    const doc = await transaction.get(lockRef);
    const now = Date.now();

    if (doc.exists) {
      const data = doc.data();
      // If a lock exists and hasn't timed out yet, reject the new request
      if (data && data.isProcessing && data.expiresAt > now) {
        throw new HttpsError(
          "resource-exhausted",
          "You already have an active AI request processing. Please wait for it to finish."
        );
      }
    }

    // Set the lock for this job
    transaction.set(lockRef, {
      jobId,
      isProcessing: true,
      expiresAt: now + LOCK_TIMEOUT_MS,
      startedAt: now,
    });
  });

  // 2. Execute the actual AI task
  try {
    return await taskFn();
  } finally {
    // 3. Release the lock safely
    // We use a transaction to ensure we only delete the lock if it still belongs to our jobId
    // This prevents race conditions where our task took longer than LOCK_TIMEOUT_MS and someone else took over.
    try {
      await db.runTransaction(async (transaction) => {
        const doc = await transaction.get(lockRef);
        if (doc.exists && doc.data()?.jobId === jobId) {
          transaction.delete(lockRef);
        }
      });
    } catch (cleanupError) {
      console.error(`Failed to release AI task lock for user: ${userId}`, cleanupError);
    }
  }
};
