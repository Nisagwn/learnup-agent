import { Component, type ReactNode } from 'react'

/**
 * Rota içeriğini saran hata sınırı — bir ekran çökerse kabuk (nav + tema) ayakta kalır,
 * kullanıcı gemiden atlamak zorunda kalmaz. Tailwind sınıfları tema-duyarlı.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="mx-auto grid min-h-[60vh] max-w-md place-items-center px-6 text-center">
        <div>
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-300">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 8v5M12 16.5v.5" />
              <path d="M10.3 3.8 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.8a2 2 0 0 0-3.4 0Z" />
            </svg>
          </div>
          <h2 className="mt-4 font-display text-lg font-bold text-slate-800 dark:text-slate-100">
            Beklenmedik bir dalga vurdu
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
            Bu ekran bir hatayla karşılaştı. Sayfayı yenilemek genellikle rotayı düzeltir.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-sky-600 px-5 py-2.5 font-display text-sm font-bold text-white shadow-glow-sky transition-colors hover:bg-sky-500 dark:bg-sky-500 dark:text-ocean-950 dark:hover:bg-sky-400"
          >
            Sayfayı yenile
          </button>
          {import.meta.env.DEV && (
            <pre className="mt-5 max-h-40 overflow-auto rounded-lg bg-slate-900/90 p-3 text-left font-mono text-[11px] text-rose-300">
              {String(this.state.error?.stack ?? this.state.error)}
            </pre>
          )}
        </div>
      </div>
    )
  }
}
