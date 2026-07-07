import * as admin from 'firebase-admin';

export interface JobGuardOptions<T> {
  db: admin.firestore.Firestore;
  collectionPath: string;
  jobId: string;
  /** The async function to execute if the job is successfully acquired */
  processFn: () => Promise<T>;
}

export enum JobStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  DONE = 'done',
  FAILED = 'failed'
}

/**
 * A robust guard system to process a job exactly once, preventing duplicate
 * AI API calls even if the Cloud Function is triggered multiple times simultaneously.
 * 
 * Requirements met:
 * - Each job should only be processed once
 * - Use Firestore field "status"
 * - If already processed, skip execution
 * - Prevent duplicate API calls
 * - Use TypeScript
 */
export const processAIJobOnce = async <T>({
  db,
  collectionPath,
  jobId,
  processFn
}: JobGuardOptions<T>): Promise<T | null> => {
  const jobRef = db.collection(collectionPath).doc(jobId);

  // 1. Transaction to safely acquire the lock EXACTLY ONCE
  // Transactions prevent race conditions even if 5 Cloud Functions start at the exact same millisecond.
  const acquiredLock = await db.runTransaction(async (transaction) => {
    const doc = await transaction.get(jobRef);
    
    if (!doc.exists) {
      throw new Error(`Job ${jobId} does not exist in ${collectionPath}`);
    }
    
    const data = doc.data();
    const currentStatus = data?.status;

    // GUARD: If it's not strictly 'pending', another instance already picked it up or it finished.
    // We skip execution completely.
    if (currentStatus !== JobStatus.PENDING) {
      console.log(`[JobGuard] Job ${jobId} is currently '${currentStatus}'. Skipping duplicate execution.`);
      return false; 
    }

    // Acquired the lock! Immediately update status to PROCESSING.
    transaction.update(jobRef, { status: JobStatus.PROCESSING, startedAt: Date.now() });
    return true;
  });

  // 2. If we didn't acquire the lock, simply return null. (Execution is successfully skipped)
  if (!acquiredLock) {
    return null;
  }

  // 3. We have the lock. Now execute the expensive AI API call.
  try {
    const result = await processFn();
    
    // 4. Update the job to DONE
    await jobRef.update({ 
      status: JobStatus.DONE, 
      completedAt: Date.now(),
      // Optionally store the result in the document if it's an object/string
      ...(result !== undefined && typeof result !== 'function' ? { result } : {})
    });
    
    return result;

  } catch (error: any) {
    console.error(`[JobGuard] Job ${jobId} failed during processing:`, error);
    
    // 5. If the API fails, update to FAILED so it can be retried by the user later
    await jobRef.update({ 
      status: JobStatus.FAILED, 
      failedAt: Date.now(),
      error: error.message || 'Unknown error'
    });
    
    throw error;
  }
};
