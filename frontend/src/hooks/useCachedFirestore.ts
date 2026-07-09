import { useState, useEffect } from 'react';
import { supabase } from '../supabase';

// A global in-memory cache to prevent re-fetching the exact same row
// across different components, route changes, or rapid re-renders.
// This survives as long as the user doesn't hit F5 (refresh).
const memoryCache = new Map<string, { data: Record<string, any>; timestamp: number }>();

export interface CachedSupabaseOptions {
  /** Supabase table name (was Firestore collectionPath) */
  table: string;
  /** Primary-key id of the row to fetch (was docId) */
  id: string;
  /** Cache Time-to-Live in milliseconds. Default: 5 minutes */
  ttlMs?: number;
  /** Set to true to bypass cache and force a fresh Supabase read */
  forceRefresh?: boolean;
}

/**
 * An aggressively optimized Supabase fetching hook.
 * It strictly enforces a single select() over realtime channels and aggressively
 * caches the results to completely eliminate redundant read operations.
 *
 * Requirements met:
 * - Avoids unnecessary realtime subscriptions
 * - Uses a single select instead of realtime listeners where possible
 * - Minimizes re-fetching same data using a global Map cache
 * - Caches results automatically (TTL-based)
 * - Uses TypeScript
 */
export const useCachedFirestore = ({
  table,
  id,
  ttlMs = 5 * 60 * 1000, // 5 minutes default
  forceRefresh = false
}: CachedSupabaseOptions) => {
  const [data, setData] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Create a unique identifier for the cache map
  const cacheKey = `${table}/${id}`;

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }

    let isMounted = true;

    const fetchRow = async () => {
      setLoading(true);
      setError(null);

      try {
        // 1. CHECK CACHE FIRST
        if (!forceRefresh && memoryCache.has(cacheKey)) {
          const cachedItem = memoryCache.get(cacheKey)!;
          const isExpired = (Date.now() - cachedItem.timestamp) > ttlMs;

          if (!isExpired) {
            // CACHE HIT! We exit immediately. Zero Supabase reads consumed!
            if (isMounted) {
              setData(cachedItem.data);
              setLoading(false);
            }
            return;
          }
        }

        // 2. CACHE MISS OR EXPIRED: Do exactly ONE select() call
        const { data: row, error: selectError } = await supabase
          .from(table)
          .select('*')
          .eq('id', id)
          .single();

        // PGRST116 = no rows found; treat as "row doesn't exist" rather than an error
        if (selectError && selectError.code !== 'PGRST116') {
          throw selectError;
        }

        if (row) {
          // 3. UPDATE CACHE
          memoryCache.set(cacheKey, {
            data: row,
            timestamp: Date.now()
          });

          if (isMounted) {
            setData(row);
          }
        } else {
          // Row doesn't exist
          if (isMounted) setData(null);
        }
      } catch (err: any) {
        if (isMounted) setError(err);
        console.error(`[CachedSupabase] Error fetching ${cacheKey}:`, err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchRow();

    // Cleanup function to prevent state updates if component unmounts during fetch
    return () => {
      isMounted = false;
    };
  }, [table, id, ttlMs, forceRefresh, cacheKey]);

  return { data, loading, error };
};
