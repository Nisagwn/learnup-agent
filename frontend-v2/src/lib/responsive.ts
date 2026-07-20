import { useEffect, useState } from 'react'

// Kabuk kararı: geniş ekranda sol sidebar, dar ekranda alt tab bar.
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  )
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setMatches(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return matches
}

/** ≥1000px → masaüstü (sidebar). Altında → mobil (alt navigasyon). */
export const useIsDesktop = () => useMediaQuery('(min-width: 1000px)')
