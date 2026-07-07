import * as admin from "firebase-admin";
import { HttpsError } from "firebase-functions/v2/https";

/**
 * Rate limits a user using Firestore.
 *
 * Requirements met:
 * - Limit each user to max 3 requests per 10 seconds.
 * - Store request timestamps in Firestore under collection "rate_limits".
 * - If limit exceeded, throw error "Too many requests, please wait".
 * - Use userId from request.
 * - Clean old timestamps automatically.
 * - Use TypeScript.
 *
 * @param userId - The ID of the user making the request.
 * @param db - The Firestore database instance. Defaults to admin.firestore().
 * @throws {HttpsError} If the rate limit is exceeded.
 */
export const checkRateLimit = async (
  userId: string,
  db: admin.firestore.Firestore = admin.firestore()
): Promise<void> => {
  if (!userId) {
    throw new HttpsError(
      "unauthenticated",
      "User ID is required for rate limiting."
    );
  }

  const rateLimitRef = db.collection("rate_limits").doc(userId);
  const LIMIT = 3;
  const WINDOW_MS = 10 * 1000; // 10 seconds window

  await db.runTransaction(async (transaction) => {
    const doc = await transaction.get(rateLimitRef);
    const now = Date.now();
    let timestamps: number[] = [];

    if (doc.exists) {
      const data = doc.data();
      if (data && Array.isArray(data.timestamps)) {
        // Clean old timestamps automatically by filtering out those outside the 10-second window
        timestamps = data.timestamps.filter((ts: number) => now - ts < WINDOW_MS);
      }
    }

    // If limit exceeded, throw error
    if (timestamps.length >= LIMIT) {
      throw new HttpsError(
        "resource-exhausted",
        "Too many requests, please wait"
      );
    }

    // Add the current request timestamp
    timestamps.push(now);

    // Save the cleaned and updated array back to Firestore
    transaction.set(rateLimitRef, { timestamps });
  });
};
