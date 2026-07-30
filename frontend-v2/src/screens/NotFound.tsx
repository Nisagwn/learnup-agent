import { useNavigate } from 'react-router-dom'
import { GlowButton } from '../components/ui'

/** 404 — sisli deniz sahnesi. Bilinmeyen rota kabuk İÇİNDE yakalanır (nav kaybolmaz). */
export function NotFound() {
  const nav = useNavigate()
  return (
    <div className="mx-auto grid min-h-[70vh] max-w-lg place-items-center px-6 pb-16 text-center">
      <div>
        <SisliDeniz />
        <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100">
          Sayfa bulunamadı
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          Aradığın sayfa bulunamadı. Ana sayfaya dönebilirsin.
        </p>
        <GlowButton className="mt-6" icon="compass" onClick={() => nav('/')}>
          Ana sayfaya dön
        </GlowButton>
      </div>
    </div>
  )
}

/** Sisli deniz vinyeti — tema-duyarlı, hafif animasyonlu (motion-safe). */
function SisliDeniz() {
  return (
    <svg viewBox="0 0 320 170" className="mx-auto w-full max-w-xs" aria-hidden>
      <defs>
        <linearGradient id="nf-sis" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.14" />
        </linearGradient>
        <radialGradient id="nf-ay" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#38BDF8" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* Ay/fener ışığı */}
      <circle cx="240" cy="40" r="34" fill="url(#nf-ay)" />
      <circle cx="240" cy="40" r="9" className="fill-sky-300 dark:fill-sky-200" opacity="0.9" />
      {/* 404 — suda yüzen şamandıra rakamları */}
      <text x="160" y="86" textAnchor="middle" fontFamily="'Space Grotesk', sans-serif" fontWeight="700" fontSize="54"
        className="fill-slate-300 dark:fill-ocean-700">404</text>
      {/* Dalga katmanları */}
      {[104, 118, 132].map((y, i) => (
        <path key={y} fill="none" strokeLinecap="round" strokeWidth={1.6 + i * 0.4}
          className="stroke-sky-600/30 dark:stroke-sky-400/25"
          d={`M-10 ${y} q 26 -7 52 0 t 52 0 t 52 0 t 52 0 t 52 0 t 52 0 t 52 0`}>
          <animate attributeName="d" dur={`${7 + i * 2}s`} repeatCount="indefinite"
            values={`M-10 ${y} q 26 -7 52 0 t 52 0 t 52 0 t 52 0 t 52 0 t 52 0 t 52 0;
                     M-10 ${y} q 26 7 52 0 t 52 0 t 52 0 t 52 0 t 52 0 t 52 0 t 52 0;
                     M-10 ${y} q 26 -7 52 0 t 52 0 t 52 0 t 52 0 t 52 0 t 52 0 t 52 0`} />
        </path>
      ))}
      {/* Sis bantları */}
      <rect x="0" y="88" width="320" height="30" fill="url(#nf-sis)" className="text-slate-400 dark:text-sky-300">
        <animate attributeName="x" values="-20;20;-20" dur="14s" repeatCount="indefinite" />
      </rect>
      <rect x="0" y="120" width="320" height="26" fill="url(#nf-sis)" className="text-slate-400 dark:text-sky-300" opacity="0.7">
        <animate attributeName="x" values="24;-24;24" dur="18s" repeatCount="indefinite" />
      </rect>
    </svg>
  )
}
