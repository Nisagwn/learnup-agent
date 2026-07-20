import { useEffect, useState, useCallback } from 'react'

interface AsyncState<T> { data: T | null; loading: boolean; error: string | null }

/** Standart veri yükleme: loading / error / data + reload(). Bileşen sökülünce yarış yok. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: null })
  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    let alive = true
    setState((s) => ({ ...s, loading: true, error: null }))
    fn()
      .then((d) => { if (alive) setState({ data: d, loading: false, error: null }) })
      .catch((e) => { if (alive) setState({ data: null, loading: false, error: e?.message || 'Bir şeyler ters gitti' }) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])

  return { ...state, reload }
}
