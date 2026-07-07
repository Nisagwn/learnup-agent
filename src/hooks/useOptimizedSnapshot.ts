import { useEffect, useRef, useState } from 'react';
import { doc, onSnapshot, Firestore, DocumentData } from 'firebase/firestore';

interface UseOptimizedSnapshotOptions {
  db: Firestore;
  collectionPath: string;
  docId: string;
  /** 1. Only listen when necessary (e.g., set to true only when a modal is open) */
  shouldListen?: boolean; 
  /** Callback triggered ONLY when the status field actually changes */
  onStatusChange?: (newStatus: string, docData: DocumentData) => void;
}

/**
 * An optimized Firestore snapshot listener designed to drastically reduce reads
 * and prevent infinite callback loops.
 * 
 * Requirements met:
 * - Only listen when necessary
 * - Automatically unsubscribe when component unmounts
 * - Avoid re-subscribing on every render
 * - Prevent triggering logic multiple times for the same data
 * - Only react when specific fields change (like status)
 * - Use React + TypeScript
 */
export const useOptimizedSnapshot = ({
  db,
  collectionPath,
  docId,
  shouldListen = true,
  onStatusChange
}: UseOptimizedSnapshotOptions) => {
  const [data, setData] = useState<DocumentData | null>(null);
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
    if (!shouldListen || !docId) {
      return;
    }

    setLoading(true);
    const docRef = doc(db, collectionPath, docId);

    // Set up the listener
    const unsubscribe = onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        const docData = snapshot.data();
        setData({ id: snapshot.id, ...docData });

        // 5. Only react when specific fields change (like status)
        const currentStatus = docData.status;
        
        // If the status exists and it is strictly DIFFERENT from the last time we saw it:
        if (currentStatus && currentStatus !== previousStatusRef.current) {
          
          // Instantly update the ref to prevent double-firing
          previousStatusRef.current = currentStatus;
          
          // Trigger the logic
          if (onStatusChangeRef.current) {
            onStatusChangeRef.current(currentStatus, docData);
          }
        }
      } else {
        setData(null);
      }
      setLoading(false);
    }, (error) => {
      console.error("Firestore optimized listener error:", error);
      setLoading(false);
    });

    // 2. Automatically unsubscribe when component unmounts OR when shouldListen becomes false
    return () => {
      unsubscribe();
    };

    // 3. Avoid re-subscribing on every render:
    // We strictly limit dependencies. `onStatusChange` is purposefully missing here.
  }, [db, collectionPath, docId, shouldListen]); 

  return { data, loading };
};
