import { useEffect, useRef, useState } from 'react';

interface UseSafeFetchOptions<T> {
  /** A boolean to determine if the fetch should actually run right now */
  shouldFetch?: boolean;
  /** A unique identifier for this fetch. If this changes, it will fetch again. */
  cacheKey?: string;
  /** The async function that performs the actual Firestore fetch (getDoc, getDocs) */
  fetcher: () => Promise<T>;
}

/**
 * A highly optimized hook to safely fetch data inside useEffect without causing
 * infinite loops due to state updates or unstable dependencies.
 * 
 * Requirements met:
 * - Ensure useEffect runs only once or when truly needed (via shouldFetch & cacheKey)
 * - Avoid dependency arrays that cause loops (by using refs for the fetcher function)
 * - Add guards (if conditions) to prevent repeated execution
 * - Use TypeScript
 */
export const useSafeFirestoreFetch = <T>({
  shouldFetch = true,
  cacheKey = 'default',
  fetcher
}: UseSafeFetchOptions<T>) => {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // 1. GUARD: Track the last successfully fetched key to prevent infinite loops.
  // This ref survives re-renders. If state updates cause a re-render, this will
  // explicitly block the useEffect from re-fetching.
  const lastFetchedKeyRef = useRef<string | null>(null);

  // 2. AVOID DEPENDENCY LOOPS: Keep the fetcher in a ref so useEffect 
  // doesn't re-trigger just because the parent function re-created the fetcher callback.
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  useEffect(() => {
    // GUARD: Only run when truly needed
    if (!shouldFetch) return;

    // GUARD: Prevent repeated execution for the exact same data/state
    if (lastFetchedKeyRef.current === cacheKey) {
      return; 
    }

    let isMounted = true; // Cleanup guard to prevent setting state on unmounted component
    
    const executeFetch = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // Execute the actual fetch logic
        const result = await fetcherRef.current();
        
        if (isMounted) {
          setData(result);
          // Lock the guard. It won't fetch again until the cacheKey explicitly changes.
          lastFetchedKeyRef.current = cacheKey;
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err);
          console.error("Safe Fetch Error:", err);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    executeFetch();

    // CLEANUP: If the component unmounts before the fetch finishes, we ignore the result
    // and avoid memory leak warnings ("Can't perform a React state update on an unmounted component").
    return () => {
      isMounted = false;
    };
    
    // We only depend on shouldFetch and cacheKey. 
    // We INTENTIONALLY EXCLUDE the `fetcher` from the dependency array because 
    // including it is the #1 cause of infinite loops in React.
  }, [shouldFetch, cacheKey]); 

  // Provide a manual refresh function that bypasses the guard
  const refetch = async () => {
    lastFetchedKeyRef.current = null; // Clear the guard lock
    setLoading(true);
    try {
      const result = await fetcherRef.current();
      setData(result);
      lastFetchedKeyRef.current = cacheKey;
    } catch (err: any) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  return { data, loading, error, refetch };
};
