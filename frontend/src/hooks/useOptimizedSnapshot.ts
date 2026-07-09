import { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';

interface UseOptimizedSnapshotOptions {
  /** Supabase table name (was Firestore collectionPath) */
  table: string;
  /** Primary-key id of the row to watch (was docId) */
  id: string;
  /** 1. Only listen when necessary (e.g., set to true only when a modal is open) */
  shouldListen?: boolean;
  /** Callback triggered ONLY when the status field actually changes */
  onStatusChange?: (newStatus: string, rowData: Record<string, any>) => void;
}

/**
 * An optimized Supabase realtime listener designed to drastically reduce reads
 * and prevent infinite callback loops.
 *
 * Requirements met:
 * - Only listen when necessary
 * - Automatically unsubscribe (removeChannel) when component unmounts
 * - Avoid re-subscribing on every render
 * - Prevent triggering logic multiple times for the same data
 * - Only react when specific fields change (like status)
 * - Use React + TypeScript
 */
export const useOptimizedSnapshot = ({
  table,
  id,
  shouldListen = true,
  onStatusChange
}: UseOptimizedSnapshotOptions) => {
  const [data, setData] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(false);

  // 4. Prevent triggering logic multiple times for the same data
  // We store the last processed status. This survives re-renders.
  const previousStatusRef = useRef<string | null>(null);

  // We use a ref for the callback to guarantee we NEVER re-subscribe
  // just because the parent component passed a new function reference.
  const onStatusChangeRef = useRef(onStatusChange);
  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => {
    // If we shouldn't listen, do not set up the listener at all.
    if (!shouldListen || !id) {
      return;
    }

    setLoading(true);

    // Shared handler for both the initial select and realtime payloads.
    const handleRow = (rowData: Record<string, any> | null) => {
      if (rowData) {
        setData(rowData);

        // 5. Only react when specific fields change (like status)
        const currentStatus = rowData.status;

        // If the status exists and it is strictly DIFFERENT from the last time we saw it:
        if (currentStatus && currentStatus !== previousStatusRef.current) {
          // Instantly update the ref to prevent double-firing
          previousStatusRef.current = currentStatus;

          // Trigger the logic
          if (onStatusChangeRef.current) {
            onStatusChangeRef.current(currentStatus, rowData);
          }
        }
      } else {
        setData(null);
      }
      setLoading(false);
    };

    // Initial one-time read so we have data before any change arrives.
    supabase
      .from(table)
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data: row, error }) => {
        if (error && error.code !== 'PGRST116') {
          console.error('Supabase optimized listener initial read error:', error);
        }
        handleRow(row ?? null);
      });

    // Set up the realtime listener (postgres_changes) filtered to this row.
    const channel = supabase
      .channel(`optimized-snapshot:${table}:${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `id=eq.${id}` },
        (payload) => {
          // DELETE → payload.new is empty; fall back to null.
          const next = (payload.new && Object.keys(payload.new).length > 0)
            ? (payload.new as Record<string, any>)
            : null;
          handleRow(next);
        }
      )
      .subscribe();

    // 2. Automatically unsubscribe when component unmounts OR when shouldListen becomes false
    return () => {
      supabase.removeChannel(channel);
    };

    // 3. Avoid re-subscribing on every render:
    // We strictly limit dependencies. `onStatusChange` is purposefully missing here.
  }, [table, id, shouldListen]);

  return { data, loading };
};
