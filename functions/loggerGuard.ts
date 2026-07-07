import * as logger from "firebase-functions/logger";

// A global in-memory set to track active requests in the same container.
// If the exact same requestId enters while it's already in this set, 
// we immediately know we have a concurrent duplicate trigger issue.
const activeRequests = new Set<string>();

export interface AILoggerOptions<T> {
  userId: string;
  /** A unique identifier for the specific request, job, or prompt */
  requestId: string; 
  /** The async function containing the AI API call */
  executeFn: () => Promise<T>;
}

/**
 * A detailed debugging wrapper to track AI API execution and aggressively 
 * detect excessive or duplicate calls.
 * 
 * Requirements met:
 * - Log when AI request starts and ends
 * - Log userId and timestamp
 * - Detect if multiple calls happen for same request
 * - Print warnings if duplicate execution detected
 * - Use TypeScript
 */
export const executeWithAILogging = async <T>({
  userId,
  requestId,
  executeFn
}: AILoggerOptions<T>): Promise<T> => {
  const timestamp = new Date().toISOString();

  // 1. Detect duplicate execution
  if (activeRequests.has(requestId)) {
    // If the Set already has this ID, another async process in this exact 
    // container is currently executing the SAME request. This is a red flag.
    logger.warn(
      `🚨 [DUPLICATE DETECTED] 🚨 Multiple simultaneous calls detected!\n` +
      `RequestID: ${requestId}\n` +
      `User: ${userId}\n` +
      `Time: ${timestamp}\n` +
      `Check your frontend React useEffects or verify if Firestore onUpdate is triggering twice!`
    );
  }

  // Register this request as actively running
  activeRequests.add(requestId);

  // 2. Log Start
  logger.info(`🟢 [AI START] User: ${userId} | RequestID: ${requestId} | Time: ${timestamp}`);
  
  const startTime = Date.now();

  try {
    // Execute the actual AI function
    const result = await executeFn();
    
    // 3. Log Success and Duration
    const duration = Date.now() - startTime;
    logger.info(`✅ [AI SUCCESS] User: ${userId} | RequestID: ${requestId} | Duration: ${duration}ms`);
    
    return result;

  } catch (error: any) {
    // 4. Log Failure and Duration
    const duration = Date.now() - startTime;
    logger.error(`❌ [AI FAILED] User: ${userId} | RequestID: ${requestId} | Duration: ${duration}ms | Error: ${error.message || error}`);
    
    throw error;
  } finally {
    // Clean up the tracking set so subsequent valid retries aren't flagged as duplicates
    activeRequests.delete(requestId);
  }
};
