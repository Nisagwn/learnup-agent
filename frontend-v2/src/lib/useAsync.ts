import { useEffect, useState, useCallback, useRef } from 'react'

interface AsyncState<T> { data: T | null; loading: boolean; error: string | null }

/**
 * Standart veri yükleme: loading / error / data + reload().
 * Bileşen sökülünce yarış yok ve açık istek AbortController ile iptal edilir.
 * `fn` her `deps` değişiminde yeniden oluşturulur; kapanışlar için stabilize edilmelidir.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: null })
  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => setNonce((n) => n + 1), [])
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    const controller = new AbortController()
    let alive = true
    setState((s) => ({ ...s, loading: true, error: null }))
    fnRef
      .current()
      .then((d) => { if (alive) setState({ data: d, loading: false, error: null }) })
      .catch((e) => {
        if (!alive) return
        if (e?.name === 'AbortError') return
        setState({ data: null, loading: false, error: e?.message || 'Bir şeyler ters gitti' })
      })
    return () => {
      alive = false
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])

  return { ...state, reload }
}
