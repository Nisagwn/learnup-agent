import {
  createContext, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react'
import { makeTokens, type Theme, type Tokens } from '../ui'

// Tema: Gün Işığı (açık) VARSAYILAN · Gece Ormanı (koyu) tercihe bağlı. Tercih localStorage'da.
// Tailwind tarafı: <html>.dark sınıfı (@custom-variant dark) · legacy tarafı: makeTokens.
const KEY = 'learnup.theme'

interface ThemeValue {
  theme: Theme
  t: Tokens
  toggle: () => void
  setTheme: (th: Theme) => void
}

const ThemeCtx = createContext<ThemeValue | null>(null)

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch { /* localStorage kapalı olabilir */ }
  // Kayıtlı tercih yoksa VARSAYILAN AÇIK (Gün Işığı) — FİDAN: koyu tema tercihe bağlı ikincil.
  // OS tercihi bilinçli YOK SAYILIR; index.html FOUC scriptiyle AYNI kural (ayrışırsa tema
  // açılışta bir kare yanlış basılır).
  return 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(initialTheme)

  useEffect(() => {
    try { localStorage.setItem(KEY, theme) } catch { /* yut */ }
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.documentElement.style.colorScheme = theme
  }, [theme])

  const value = useMemo<ThemeValue>(() => ({
    theme,
    t: makeTokens(theme),
    toggle: () => setTheme((p) => (p === 'light' ? 'dark' : 'light')),
    setTheme,
  }), [theme])

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeCtx)
  if (!ctx) throw new Error('useTheme ThemeProvider içinde kullanılmalı')
  return ctx
}
