import { useEffect, useState, useCallback, useRef } from 'react'

interface AsyncState<T> { data: T | null; loading: boolean; error: string | null }

/**
 * Standart veri yükleme: loading / error / data + reload().
 * `fn` her `deps` değişiminde yeniden oluşturulur; kapanışlar için stabilize edilmelidir.
 *
 * ⚠️ `signal` FN'E VERİLİR VE İLETİLMELİDİR: `useAsync((s) => tGet('/yol', {}, { signal: s }))`.
 * Eskiden `AbortController` kuruluyor, `abort()` çağrılıyor ama sinyal HİÇBİR fetch'e
 * bağlanmıyordu — yani iptal yalnız `alive` bayrağıyla state yazımını susturuyordu, istek
 * ağda sürüyordu. Sonucu: ekran değiştirince açık istekler birikiyor (sınıf → öğrenci →
 * sınıf gezinmesi öğretmenin günde onlarca kez yaptığı hareket) ve iptal edilmiş sorgular
 * sunucuda çalışmaya devam ediyordu. Sinyali iletmeyen çağrılar eskisi gibi çalışır.
 */
export function useAsync<T>(fn: (signal: AbortSignal) => Promise<T>, deps: unknown[] = []) {
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
      .current(controller.signal)
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
