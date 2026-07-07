import * as admin from "firebase-admin";
import { HttpsError } from "firebase-functions/v2/https";

/**
 * Enforces a cooldown period between requests for a user.
 *
 * Requirements met:
 * - Each user must wait at least 3 seconds between requests
 * - Store last request timestamp in Firestore
 * - If user sends request too soon, return error "Please wait before sending another request"
 * - Use TypeScript
 *
 * @param userId - The ID of the user making the request.
 * @param db - The Firestore database instance. Defaults to admin.firestore().
 * @throws {HttpsError} If the user sends a request before the cooldown expires.
 */
export const checkCooldown = async (
  userId: string,
  db: admin.firestore.Firestore = admin.firestore()
): Promise<void> => {
  if (!userId) {
    throw new HttpsError(
      "unauthenticated",
      "User ID is required to check cooldown."
    );
  }

  const cooldownRef = db.collection("cooldowns").doc(userId);
  const COOLDOWN_MS = 3000; // 3 seconds

  await db.runTransaction(async (transaction) => {
    const doc = await transaction.get(cooldownRef);
    const now = Date.now();

    if (doc.exists) {
      const data = doc.data();
      if (data && data.lastRequestTime) {
        const timeSinceLastRequest = now - data.lastRequestTime;

        // If the time since last request is less than the cooldown period, throw error
        if (timeSinceLastRequest < COOLDOWN_MS) {
          throw new HttpsError(
            "resource-exhausted",
            "Please wait before sending another request"
          );
        }
      }
    }

    // Set or update the last request time
    transaction.set(cooldownRef, { lastRequestTime: now }, { merge: true });
  });
};
