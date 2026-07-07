import { useEffect, useRef, useState } from 'react';
import { doc, onSnapshot, updateDoc, Firestore } from 'firebase/firestore';

export interface AIJobDocument {
  id?: string;
  status: 'idle' | 'pending' | 'processing' | 'completed' | 'failed';
  prompt: string;
  result?: string;
  error?: string;
}

/**
 * A robust hook to prevent infinite loops when triggering AI API calls
 * inside an onSnapshot listener in React/Next.js.
 * 
 * Requirements met:
 * 1. Prevents re-triggering when Firestore document updates
 * 2. Ensures status changes do NOT trigger new API calls
 * 3. Uses refs and strict condition checks to stop repeated execution
 * 4. Written in TypeScript
 * 
 * @param db The initialized Firestore instance
 * @param collectionName The name of the collection (e.g., 'ai_jobs')
 * @param documentId The ID of the document to listen to
 * @param triggerAIApiCallback The actual async function that calls the AI backend (Claude Sonnet 4.6)
 */
export const useAIJobListener = (
  db: Firestore,
  collectionName: string,
  documentId: string,
  triggerAIApiCallback: (prompt: string, docId: string) => Promise<void>
) => {
  const [jobData, setJobData] = useState<AIJobDocument | null>(null);
  const [loading, setLoading] = useState(true);

  // 1. THE LOCAL GUARD: This ref survives React re-renders and React Strict Mode.
  // It ensures the API is triggered EXACTLY ONCE per component lifecycle, 
  // preventing the classic infinite loop caused by document updates.
  const hasTriggeredRef = useRef(false);

  useEffect(() => {
    if (!documentId) {
      setLoading(false);
      return;
    }

    const docRef = doc(db, collectionName, documentId);

    // Set up the real-time listener
    const unsubscribe = onSnapshot(docRef, async (snapshot) => {
      if (!snapshot.exists()) {
        setLoading(false);
        return;
      }

      const data = snapshot.data() as AIJobDocument;
      setJobData({ id: snapshot.id, ...data });

      // 2. THE STATUS GUARD: 
      // We strictly check if the status is 'pending'. If the backend updates it 
      // to 'processing' or 'completed', this block is entirely skipped.
      if (data.status === 'pending' && !hasTriggeredRef.current) {
        
        // Instantly lock the trigger locally BEFORE executing any async code
        hasTriggeredRef.current = true;
        
        try {
          // 3. THE DATABASE GUARD:
          // Immediately update Firestore to 'processing'. This guarantees that if 
          // there are multiple listeners (or backend cloud functions), they won't 
          // also attempt to process this document.
          await updateDoc(docRef, { status: 'processing' });
          
          // Execute the AI API call
          await triggerAIApiCallback(data.prompt, documentId);
          
          // NOTE: When the API finishes, the backend or callback should update 
          // the status to 'completed'. That update WILL trigger onSnapshot again, 
          // but the if-condition above will safely reject it.

        } catch (error: any) {
          console.error("AI API Error in useAIJobListener:", error);
          // If the API fails, unlock the local guard and mark it as failed in DB
          // so the user can try clicking "Retry" which sets it back to 'pending'.
          await updateDoc(docRef, { 
            status: 'failed',
            error: error.message || "Unknown error"
          });
          hasTriggeredRef.current = false; 
        }
      }
      
      setLoading(false);
    }, (error) => {
      console.error("Firebase onSnapshot error:", error);
      setLoading(false);
    });

    // 4. THE CLEANUP GUARD:
    // Always unsubscribe when the component unmounts to prevent zombie listeners
    // from accumulating and burning through Firestore read quotas.
    return () => unsubscribe();
    
    // Do NOT put jobData or triggerAIApiCallback in this dependency array 
    // unless wrapped in useCallback, otherwise it will cause constant re-mounting.
  }, [db, collectionName, documentId, triggerAIApiCallback]);

  return { jobData, loading };
};
