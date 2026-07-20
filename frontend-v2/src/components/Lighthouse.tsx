import { useTheme } from '../lib/theme'

/** Minimalist kıyı feneri — ince çizgiler, yakamoz turkuazı ışık. Streak widget'ının görseli. */
export function Lighthouse({ size = 72 }: { size?: number }) {
  const { t } = useTheme()
  const cizgi = t.isDark ? '#64748B' : '#7C93A8'
  const govde = t.isDark ? 'rgba(18,35,52,0.5)' : 'rgba(255,255,255,0.8)'
  const kaya = t.isDark ? '#334155' : '#9DB4C6'
  const w = size, h = size * (96 / 72)
  return (
    <svg width={w} height={h} viewBox="0 0 72 96" fill="none" aria-hidden>
      <defs>
        <radialGradient id="lhLampGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#2DD4BF" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#2DD4BF" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="lhBeamGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#2DD4BF" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#2DD4BF" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Işık halesi */}
      <circle cx="36" cy="22" r="20" fill="url(#lhLampGlow)">
        <animate attributeName="opacity" values="0.7;1;0.7" dur="3s" repeatCount="indefinite" />
      </circle>

      {/* Dönen huzme */}
      <g>
        <polygon points="36,22 72,12 72,32" fill="url(#lhBeamGrad)">
          <animateTransform attributeName="transform" type="rotate"
            values="-14 36 22; 14 36 22; -14 36 22" dur="6s" repeatCount="indefinite" />
        </polygon>
      </g>

      {/* Lamba */}
      <circle cx="36" cy="22" r="4" fill="#5EEAD4">
        <animate attributeName="opacity" values="1;0.55;1" dur="1.8s" repeatCount="indefinite" />
      </circle>
      <rect x="30.5" y="14.5" width="11" height="3" rx="1.5" fill={cizgi} opacity="0.7" />
      <path d="M31 14.5 36 8l5 6.5" stroke={cizgi} strokeWidth="1.6" strokeLinejoin="round" opacity="0.7" />

      {/* Gövde — ince çizgi, iki kuşak */}
      <path d="M30 30h12l4 54H26l4-54Z" stroke={cizgi} strokeWidth="1.6" strokeLinejoin="round" fill={govde} />
      <path d="M29 44h14" stroke="#2DD4BF" strokeWidth="3" opacity="0.45" />
      <path d="M27.5 62h17" stroke="#2DD4BF" strokeWidth="3" opacity="0.3" />
      <rect x="33.5" y="72" width="5" height="9" rx="2.5" stroke={cizgi} strokeWidth="1.3" opacity="0.7" />

      {/* Kayalık zemin + su çizgisi */}
      <path d="M18 86q18 6 36 0" stroke={kaya} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M10 91q10 3 20 0M42 92q10 3 20 0" stroke="#2DD4BF" strokeWidth="1.3" strokeLinecap="round" opacity="0.35" />
    </svg>
  )
}
