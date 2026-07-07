import { useState, useEffect } from 'react';
import { doc, getDoc, Firestore, DocumentData } from 'firebase/firestore';

// A global in-memory cache to prevent re-fetching the exact same document 
// across different components, route changes, or rapid re-renders.
// This survives as long as the user doesn't hit F5 (refresh).
const memoryCache = new Map<string, { data: DocumentData; timestamp: number }>();

export interface CachedFirestoreOptions {
  db: Firestore;
  collectionPath: string;
  docId: string;
  /** Cache Time-to-Live in milliseconds. Default: 5 minutes */
  ttlMs?: number;
  /** Set to true to bypass cache and force a fresh Firestore read */
  forceRefresh?: boolean;
}

/**
 * An aggressively optimized Firestore fetching hook.
 * It strictly enforces getDoc() over onSnapshot() and aggressively caches 
 * the results to completely eliminate redundant read operations.
 * 
 * Requirements met:
 * - Avoids unnecessary onSnapshot listeners
 * - Uses getDoc instead of real-time listeners where possible
 * - Minimizes re-fetching same data using a global Map cache
 * - Caches results automatically (TTL-based)
 * - Uses TypeScript
 */
export const useCachedFirestore = ({
  db,
  collectionPath,
  docId,
  ttlMs = 5 * 60 * 1000, // 5 minutes default
  forceRefresh = false
}: CachedFirestoreOptions) => {
  const [data, setData] = useState<DocumentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Create a unique identifier for the cache map
  const cacheKey = `${collectionPath}/${docId}`;

  useEffect(() => {
    if (!docId) {
      setLoading(false);
      return;
    }

    let isMounted = true;

    const fetchDocument = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // 1. CHECK CACHE FIRST
        if (!forceRefresh && memoryCache.has(cacheKey)) {
          const cachedItem = memoryCache.get(cacheKey)!;
          const isExpired = (Date.now() - cachedItem.timestamp) > ttlMs;

          if (!isExpired) {
            // CACHE HIT! We exit immediately. Zero Firestore reads consumed!
            if (isMounted) {
              setData(cachedItem.data);
              setLoading(false);
            }
            return; 
          }
        }

        // 2. CACHE MISS OR EXPIRED: Do exactly ONE getDoc() call
        const docRef = doc(db, collectionPath, docId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const docData = { id: docSnap.id, ...docSnap.data() };
          
          // 3. UPDATE CACHE
          memoryCache.set(cacheKey, {
            data: docData,
            timestamp: Date.now()
          });

          if (isMounted) {
            setData(docData);
          }
        } else {
          // Document doesn't exist
          if (isMounted) setData(null);
        }
      } catch (err: any) {
        if (isMounted) setError(err);
        console.error(`[CachedFirestore] Error fetching ${cacheKey}:`, err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchDocument();

    // Cleanup function to prevent state updates if component unmounts during fetch
    return () => {
      isMounted = false;
    };
  }, [db, collectionPath, docId, ttlMs, forceRefresh, cacheKey]);

  return { data, loading, error };
};
