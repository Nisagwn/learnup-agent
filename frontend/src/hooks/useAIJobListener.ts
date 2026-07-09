import { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';

export interface AIJobDocument {
  id?: string;
  status: 'idle' | 'pending' | 'processing' | 'completed' | 'failed';
  prompt: string;
  result?: string;
  error?: string;
}

/**
 * A robust hook to prevent infinite loops when triggering AI API calls
 * inside a Supabase realtime listener in React.
 *
 * Requirements met:
 * 1. Prevents re-triggering when the row updates
 * 2. Ensures status changes do NOT trigger new API calls
 * 3. Uses refs and strict condition checks to stop repeated execution
 * 4. Written in TypeScript
 *
 * @param tableName The name of the table (e.g. 'ai_jobs')
 * @param documentId The id of the row to listen to
 * @param triggerAIApiCallback The actual async function that calls the AI backend (Claude Sonnet 4.6)
 */
export const useAIJobListener = (
  tableName: string,
  documentId: string,
  triggerAIApiCallback: (prompt: string, docId: string) => Promise<void>
) => {
  const [jobData, setJobData] = useState<AIJobDocument | null>(null);
  const [loading, setLoading] = useState(true);

  // 1. THE LOCAL GUARD: This ref survives React re-renders and React Strict Mode.
  // It ensures the API is triggered EXACTLY ONCE per component lifecycle,
  // preventing the classic infinite loop caused by row updates.
  const hasTriggeredRef = useRef(false);

  useEffect(() => {
    if (!documentId) {
      setLoading(false);
      return;
    }

    // Shared handler for both the initial fetch and realtime updates.
    const handleRow = async (data: AIJobDocument | null) => {
      if (!data) {
        setLoading(false);
        return;
      }

      setJobData({ id: documentId, ...data });

      // 2. THE STATUS GUARD:
      // We strictly check if the status is 'pending'. If the backend updates it
      // to 'processing' or 'completed', this block is entirely skipped.
      if (data.status === 'pending' && !hasTriggeredRef.current) {
        // Instantly lock the trigger locally BEFORE executing any async code
        hasTriggeredRef.current = true;

        try {
          // 3. THE DATABASE GUARD:
          // Immediately update the row to 'processing'. This guarantees that if
          // there are multiple listeners (or backend edge functions), they won't
          // also attempt to process this row.
          await supabase.from(tableName).update({ status: 'processing' }).eq('id', documentId);

          // Execute the AI API call
          await triggerAIApiCallback(data.prompt, documentId);

          // NOTE: When the API finishes, the backend or callback should update
          // the status to 'completed'. That update WILL trigger the listener again,
          // but the if-condition above will safely reject it.
        } catch (error: any) {
          console.error('AI API Error in useAIJobListener:', error);
          // If the API fails, unlock the local guard and mark it as failed in DB
          // so the user can try clicking "Retry" which sets it back to 'pending'.
          await supabase.from(tableName).update({
            status: 'failed',
            error: error.message || 'Unknown error',
          }).eq('id', documentId);
          hasTriggeredRef.current = false;
        }
      }

      setLoading(false);
    };

    // Initial one-time read (realtime only delivers subsequent changes).
    supabase
      .from(tableName)
      .select('*')
      .eq('id', documentId)
      .single()
      .then(({ data, error }) => {
        if (error) {
          console.error('Supabase initial fetch error:', error);
          setLoading(false);
          return;
        }
        handleRow(data as AIJobDocument | null);
      });

    // Set up the real-time listener
    const channel = supabase
      .channel(`ai-job-${documentId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: tableName, filter: `id=eq.${documentId}` },
        (payload) => { handleRow((payload.new as AIJobDocument) ?? null); }
      )
      .subscribe();

    // 4. THE CLEANUP GUARD:
    // Always remove the channel when the component unmounts to prevent zombie
    // listeners from accumulating.
    return () => { supabase.removeChannel(channel); };

    // Do NOT put jobData or triggerAIApiCallback in this dependency array
    // unless wrapped in useCallback, otherwise it will cause constant re-mounting.
  }, [tableName, documentId, triggerAIApiCallback]);

  return { jobData, loading };
};
