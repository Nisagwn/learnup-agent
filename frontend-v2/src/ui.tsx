import { useState, type CSSProperties, type ReactNode } from 'react'

// ═══════════════════════════════════════════════════════════════════════════
//  DESIGN TOKENS
// ═══════════════════════════════════════════════════════════════════════════

export type Theme = 'light' | 'dark'

export interface Tokens {
  bg: string
  sunken: string
  card: string
  raised: string
  hairline: string
  hairlineStrong: string
  ink: string          // primary text
  inkSoft: string      // secondary text
  inkMuted: string     // muted text
  action: string
  actionEdge: string
  onAction: string
  // brand accents (theme-stable)
  brass: string
  ember: string
  gold: string
  correct: string
  wrong: string
  teal: string
  sky: string          // fresh highlight blue
  isDark: boolean
}

// DEEP OCEAN — iki palet: KIYI (açık) + OKYANUS (koyu). Mavi tonlu soft.
// Birincil aksiyon = soft azura (sky); teal ikincil yakamoz vurgusu.
// Hex'ler Tailwind varsayılanlarıyla hizalı → inline-stilli eski ekranlar,
// Tailwind'e taşınmış yeni kodla uyumlu görünür.
const KIYI: Tokens = {
  bg: '#F3F7FC', sunken: '#E7EFF8', card: '#FFFFFF', raised: '#FFFFFF',
  hairline: 'rgba(2,64,110,0.10)', hairlineStrong: 'rgba(2,64,110,0.20)',
  ink: '#16324A', inkSoft: '#46647E', inkMuted: '#7A93AA',
  action: '#0284C7', actionEdge: '#0369A1', onAction: '#FFFFFF',
  brass: '#B8863B', ember: '#D97706', gold: '#D9A406',
  correct: '#059669', wrong: '#E11D48', teal: '#0D9488', sky: '#0284C7',
  isDark: false,
}

const OKYANUS: Tokens = {
  bg: '#0B1520', sunken: '#060D15', card: '#0E1B28', raised: '#122334',
  hairline: 'rgba(56,189,248,0.10)', hairlineStrong: 'rgba(56,189,248,0.20)',
  ink: '#E2E8F0', inkSoft: '#94A3B8', inkMuted: '#64748B',
  action: '#38BDF8', actionEdge: '#0284C7', onAction: '#082F49',
  brass: '#C99A4A', ember: '#F59E0B', gold: '#FBBF24',
  correct: '#34D399', wrong: '#FB7185', teal: '#2DD4BF', sky: '#38BDF8',
  isDark: true,
}

export function makeTokens(theme: Theme = 'light'): Tokens {
  return theme === 'dark' ? OKYANUS : KIYI
}

// Muted, sophisticated subject palette (works on both themes)
export const SUBJECTS: Record<string, { short: string; color: string }> = {
  mat: { short: 'MAT', color: '#C77D18' },
  geo: { short: 'GEO', color: '#7C5CD1' },
  fiz: { short: 'FİZ', color: '#3B72C4' },
  kim: { short: 'KİM', color: '#1F9E70' },
  bio: { short: 'BİO', color: '#5AA02C' },
  trk: { short: 'TRK', color: '#C74B84' },
  tar: { short: 'TAR', color: '#C0503F' },
}

export const FONT = {
  display: "'Space Grotesk', 'Outfit', sans-serif",
  body: "'Inter', sans-serif",
  mono: "'JetBrains Mono', monospace",
}

// ═══════════════════════════════════════════════════════════════════════════
//  ICON SET — clean 1.6px stroke line icons on a 24px grid
// ═══════════════════════════════════════════════════════════════════════════

export type IconName =
  | 'today' | 'route' | 'compass' | 'chat' | 'target' | 'anchor'
  | 'flame' | 'coin' | 'check' | 'chevronRight' | 'chevronDown' | 'chevronLeft'
  | 'close' | 'plus' | 'history' | 'clock' | 'waves' | 'book' | 'trophy'
  | 'chart' | 'seal' | 'arrowRight' | 'arrowUp' | 'sparkle' | 'lock'
  | 'medal' | 'sprout' | 'bolt' | 'refresh' | 'sun' | 'moon' | 'lightbulb'
  | 'send' | 'edit' | 'gauge'
  | 'scan' | 'shield' | 'trend' | 'pulse' | 'filter' | 'bell'
  | 'gift' | 'snowflake' | 'search' | 'eye' | 'eyeOff' | 'copy'
  | 'volume' | 'volumeOff'

export function Icon({
  name, size = 20, color = 'currentColor', strokeWidth = 1.7, style,
}: {
  name: IconName; size?: number; color?: string; strokeWidth?: number; style?: CSSProperties
}) {
  const p = {
    fill: 'none',
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  const paths: Record<IconName, ReactNode> = {
    today: <><path {...p} d="M4 10.5 12 4l8 6.5" /><path {...p} d="M6 9.5V19a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9.5" /></>,
    route: <><circle {...p} cx="6" cy="6" r="2.2" /><circle {...p} cx="18" cy="18" r="2.2" /><path {...p} d="M6 8.2v3.3a4 4 0 0 0 4 4h4a4 4 0 0 1 0-8" strokeDasharray="0.1 3" /></>,
    compass: <><circle {...p} cx="12" cy="12" r="8.5" /><path {...p} d="m15 9-2 4-4 2 2-4z" fill={color} fillOpacity="0.15" /></>,
    chat: <><path {...p} d="M20 12a7 7 0 0 1-9.5 6.5L5 20l1.5-4.5A7 7 0 1 1 20 12Z" /></>,
    target: <><circle {...p} cx="12" cy="12" r="8" /><circle {...p} cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="1.4" fill={color} /></>,
    anchor: <><circle {...p} cx="12" cy="5" r="2" /><path {...p} d="M12 7v12" /><path {...p} d="M6 11a6 6 0 0 0 12 0" /><path {...p} d="M4 12h2M18 12h2" /></>,
    flame: <><path {...p} d="M12 3c1.5 3 4.5 4.5 4.5 8a4.5 4.5 0 0 1-9 0c0-1.6.8-2.7 1.6-3.6C10 8.6 10.5 7 9.8 5.5 11 6 12 7.2 12 3Z" /></>,
    coin: <><circle {...p} cx="12" cy="12" r="8.5" /><circle {...p} cx="12" cy="12" r="5" /></>,
    check: <path {...p} d="m5 12.5 4.5 4.5L19 7" />,
    chevronRight: <path {...p} d="m9 5 7 7-7 7" />,
    chevronDown: <path {...p} d="m5 9 7 7 7-7" />,
    chevronLeft: <path {...p} d="m15 5-7 7 7 7" />,
    close: <path {...p} d="M6 6l12 12M18 6 6 18" />,
    plus: <path {...p} d="M12 5v14M5 12h14" />,
    history: <><path {...p} d="M4 12a8 8 0 1 0 2.5-5.8" /><path {...p} d="M4 4v3h3" /><path {...p} d="M12 8v4l3 2" /></>,
    clock: <><circle {...p} cx="12" cy="12" r="8.5" /><path {...p} d="M12 7.5V12l3 2" /></>,
    waves: <><path {...p} d="M3 8c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0" /><path {...p} d="M3 14c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0" /></>,
    book: <><path {...p} d="M5 5.5A2 2 0 0 1 7 4h11v14H7a2 2 0 0 0-2 2z" /><path {...p} d="M5 5.5V18" /></>,
    trophy: <><path {...p} d="M8 5h8v4a4 4 0 0 1-8 0z" /><path {...p} d="M8 6H5.5A1.5 1.5 0 0 0 5 9h3M16 6h2.5A1.5 1.5 0 0 1 18 9h-2" /><path {...p} d="M12 13v3M9 19h6M10 19v-1.5a2 2 0 0 1 4 0V19" /></>,
    chart: <><path {...p} d="M5 19V5M5 19h14" /><path {...p} d="M9 15v-3M13 15V8M17 15v-5" /></>,
    seal: <><circle {...p} cx="12" cy="10" r="6" /><path {...p} d="M12 7v6M9.5 10h5" strokeWidth={strokeWidth * 0.8} /><path {...p} d="m9 15-1 5 4-2 4 2-1-5" /></>,
    arrowRight: <path {...p} d="M5 12h14M13 6l6 6-6 6" />,
    arrowUp: <path {...p} d="M12 19V5M6 11l6-6 6 6" />,
    sparkle: <path {...p} d="M12 4v4M12 16v4M4 12h4M16 12h4M7 7l2.5 2.5M14.5 14.5 17 17M17 7l-2.5 2.5M9.5 14.5 7 17" strokeWidth={strokeWidth * 0.85} />,
    lock: <><rect {...p} x="5" y="10" width="14" height="9" rx="2" /><path {...p} d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
    medal: <><circle {...p} cx="12" cy="14" r="5" /><path {...p} d="M9 9.5 7 3M15 9.5 17 3M12 12v4M10 14h4" strokeWidth={strokeWidth * 0.8} /></>,
    sprout: <><path {...p} d="M12 20v-8" /><path {...p} d="M12 12c0-3-2.5-5-6-5 0 3 2.5 5 6 5Z" /><path {...p} d="M12 11c0-2.5 2-4.5 5-4.5 0 2.5-2 4.5-5 4.5Z" /></>,
    bolt: <path {...p} d="M13 3 5 13h6l-1 8 8-10h-6z" />,
    refresh: <><path {...p} d="M19 12a7 7 0 1 1-2-5" /><path {...p} d="M20 4v4h-4" /></>,
    sun: <><circle {...p} cx="12" cy="12" r="4" /><path {...p} d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" strokeWidth={strokeWidth * 0.85} /></>,
    moon: <path {...p} d="M19 13.5A7.5 7.5 0 0 1 9.5 5a6 6 0 1 0 9.5 8.5Z" />,
    lightbulb: <><path {...p} d="M9 17.5A6 6 0 1 1 15 17.5" /><path {...p} d="M9.5 18h5M10 21h4" /></>,
    send: <path {...p} d="M5 12h13M12 5l7 7-7 7" />,
    edit: <><path {...p} d="M4 20h4L18.5 9.5a2 2 0 0 0-3-3L5 17z" /><path {...p} d="M14 7l3 3" /></>,
    gauge: <><path {...p} d="M5 18a8 8 0 1 1 14 0" /><path {...p} d="m12 14 4-4" /></>,
    // ── Deep Ocean ekleri ──
    scan: <><path {...p} d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" /><path {...p} d="M4 12h16" strokeDasharray="0.1 3.4" /><circle {...p} cx="12" cy="12" r="3.2" /></>,
    shield: <><path {...p} d="M12 3.5 19 6v5.5c0 4.4-2.9 7.6-7 9-4.1-1.4-7-4.6-7-9V6z" /><path {...p} d="m9 12 2.2 2.2L15.5 10" /></>,
    trend: <><path {...p} d="M4 17.5 9.5 12l3.5 3.5 6.5-6.5" /><path {...p} d="M15 9h4.5v4.5" /></>,
    pulse: <path {...p} d="M3 12h3.5l2-5 3.5 10 2.5-7 1.5 2h5" />,
    filter: <path {...p} d="M4 6h16l-6.2 7v5.2L10 20v-7z" />,
    bell: <><path {...p} d="M6 16v-5.5a6 6 0 0 1 12 0V16l1.5 2.5H4.5z" /><path {...p} d="M10 20.5a2.2 2.2 0 0 0 4 0" /></>,
    gift: <><rect {...p} x="4" y="10" width="16" height="10" rx="1.5" /><path {...p} d="M4 10h16M12 10v10" /><path {...p} d="M12 10V7M12 7c-1.5 0-4-.6-4-2.5C8 3 9.5 3 10 3.5c1 1 2 3.5 2 3.5Zm0 0c1.5 0 4-.6 4-2.5C16 3 14.5 3 14 3.5c-1 1-2 3.5-2 3.5Z" /></>,
    snowflake: <><path {...p} d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9" /><path {...p} d="M12 3l-2 2m2-2 2 2M12 21l-2-2m2 2 2-2M4.2 7.5 4.9 10M4.2 7.5 6.9 7M19.8 16.5 19.1 14M19.8 16.5 17.1 17M4.2 16.5 6.9 17M4.2 16.5 4.9 14M19.8 7.5 17.1 7M19.8 7.5 19.1 10" strokeWidth={strokeWidth * 0.75} /></>,
    search: <><circle {...p} cx="11" cy="11" r="6.5" /><path {...p} d="m16 16 4.5 4.5" /></>,
    eye: <><path {...p} d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle {...p} cx="12" cy="12" r="3" /></>,
    eyeOff: <><path {...p} d="M4 4l16 16" /><path {...p} d="M9.9 5.9A9.4 9.4 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3.2 3.9M6 7.6A16.6 16.6 0 0 0 2.5 12S6 18.5 12 18.5c1.1 0 2.1-.2 3-.6" /><path {...p} d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>,
    copy: <><rect {...p} x="9" y="9" width="11" height="11" rx="2" /><path {...p} d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" /></>,
    volume: <><path {...p} d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" /><path {...p} d="M15 9.5a4 4 0 0 1 0 5M17.5 7a7.5 7.5 0 0 1 0 10" /></>,
    volumeOff: <><path {...p} d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" /><path {...p} d="m15.5 9.5 5 5M20.5 9.5l-5 5" /></>,
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: 'block', flexShrink: 0, ...style }}>
      {paths[name]}
    </svg>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
//  PRIMITIVES
// ═══════════════════════════════════════════════════════════════════════════

export function Card({
  t, children, style, onClick, accent, inset,
}: {
  t: Tokens; children: ReactNode; style?: CSSProperties
  onClick?: () => void; accent?: string; inset?: boolean
}) {
  const [hover, setHover] = useState(false)
  const tik = !!onClick
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => tik && setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: inset ? t.sunken : t.card,
        border: `1px solid ${hover ? t.hairlineStrong : t.hairline}`,
        borderRadius: 16,
        borderLeft: accent ? `3px solid ${accent}` : undefined,
        cursor: tik ? 'pointer' : undefined,
        transform: hover ? 'translateY(-2px)' : 'none',
        boxShadow: hover
          ? (t.isDark ? '0 10px 26px rgba(0,0,0,0.34)' : '0 12px 28px rgba(15,46,74,0.12)')
          : undefined,
        transition: 'transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export function Button({
  t, children, onClick, variant = 'primary', size = 'md', full, icon, style,
}: {
  t: Tokens; children: ReactNode; onClick?: () => void
  variant?: 'primary' | 'secondary' | 'ghost'; size?: 'sm' | 'md' | 'lg'
  full?: boolean; icon?: IconName; style?: CSSProperties
}) {
  const [pressed, setPressed] = useState(false)
  const pad = size === 'sm' ? '8px 14px' : size === 'lg' ? '14px 22px' : '11px 18px'
  const fs = size === 'sm' ? 13 : size === 'lg' ? 16 : 14

  const base: CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
    padding: pad, fontSize: fs, fontFamily: FONT.display, fontWeight: 700,
    borderRadius: 14, border: 'none', cursor: 'pointer',
    width: full ? '100%' : undefined,
    transition: 'transform 0.08s, box-shadow 0.08s, background 0.15s',
    ...style,
  }

  if (variant === 'primary') {
    return (
      <button onClick={onClick}
        onMouseDown={() => setPressed(true)} onMouseUp={() => setPressed(false)} onMouseLeave={() => setPressed(false)}
        onTouchStart={() => setPressed(true)} onTouchEnd={() => setPressed(false)}
        style={{
          ...base, background: t.action, color: t.onAction,
          boxShadow: pressed ? 'none' : `0 3px 0 ${t.actionEdge}`,
          transform: pressed ? 'translateY(3px)' : 'none',
        }}>
        {icon && <Icon name={icon} size={fs + 2} color={t.onAction} />}
        {children}
      </button>
    )
  }
  if (variant === 'secondary') {
    return (
      <button onClick={onClick} style={{
        ...base, background: t.sunken, color: t.ink,
        border: `1px solid ${t.hairlineStrong}`,
      }}>
        {icon && <Icon name={icon} size={fs + 2} color={t.ink} />}
        {children}
      </button>
    )
  }
  return (
    <button onClick={onClick} style={{ ...base, background: 'transparent', color: t.inkSoft }}>
      {icon && <Icon name={icon} size={fs + 2} color={t.inkSoft} />}
      {children}
    </button>
  )
}

export function Chip({
  t, children, tone = 'neutral', icon, style,
}: {
  t: Tokens; children: ReactNode
  tone?: 'neutral' | 'ember' | 'gold' | 'teal' | 'brass' | 'correct'
  icon?: IconName; style?: CSSProperties
}) {
  const map = {
    neutral: { fg: t.inkSoft, bg: t.sunken, bd: t.hairline },
    ember: { fg: t.ember, bg: t.ember + '18', bd: t.ember + '33' },
    gold: { fg: t.gold, bg: t.gold + '18', bd: t.gold + '33' },
    teal: { fg: t.teal, bg: t.teal + '18', bd: t.teal + '33' },
    brass: { fg: t.brass, bg: t.brass + '1E', bd: t.brass + '40' },
    correct: { fg: t.correct, bg: t.correct + '18', bd: t.correct + '33' },
  }[tone]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: map.bg, color: map.fg, border: `1px solid ${map.bd}`,
      borderRadius: 8, padding: '4px 9px',
      fontSize: 12, fontWeight: 700, fontFamily: FONT.display,
      ...style,
    }}>
      {icon && <Icon name={icon} size={13} color={map.fg} />}
      {children}
    </span>
  )
}

export function Badge({ label, color, t }: { label: string; color?: string; t: Tokens }) {
  const c = color ?? t.inkSoft
  return (
    <span style={{
      background: c + '1E', color: c,
      borderRadius: 6, padding: '2px 7px',
      fontSize: 10.5, fontWeight: 700, fontFamily: FONT.display,
      letterSpacing: 0.2, textTransform: 'lowercase',
    }}>{label}</span>
  )
}

export function SubjectTag({ subject, t }: { subject: string; t: Tokens }) {
  const s = SUBJECTS[subject] ?? { short: subject.toUpperCase(), color: t.inkSoft }
  return (
    <span style={{
      background: s.color + '1A', color: s.color,
      borderRadius: 6, padding: '3px 7px',
      fontSize: 10.5, fontWeight: 800, fontFamily: FONT.display, letterSpacing: 0.3,
    }}>{s.short}</span>
  )
}

// Captain avatar — a refined monogram-style anchor, not an emoji.
// `t` opsiyonel: Tailwind ekranları tokensız çağırır (brass sabittir, tema-bağımsız).
export function Captain({ size = 40, t, ring }: { size?: number; t?: Tokens; ring?: boolean }) {
  const brass = t?.brass ?? '#B8863B'
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: 'linear-gradient(150deg, #24487F 0%, #0C1B2E 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
      border: ring ? `2px solid ${brass}` : `1.5px solid ${brass}88`,
      boxShadow: `inset 0 1px 2px rgba(255,255,255,0.12)`,
    }}>
      <Icon name="anchor" size={size * 0.5} color="#E8D3A8" strokeWidth={1.6} />
    </div>
  )
}

export function ProgressBar({
  value, t, color, height = 6, track,
}: { value: number; t: Tokens; color?: string; height?: number; track?: string }) {
  return (
    <div style={{ height, background: track ?? t.sunken, borderRadius: height / 2, overflow: 'hidden' }}>
      <div style={{
        height: '100%', width: `${Math.min(100, Math.max(0, value * 100))}%`,
        background: color ?? t.action, borderRadius: height / 2,
        transition: 'width 0.5s ease',
      }} />
    </div>
  )
}

export function Ring({
  value, size = 44, stroke = 5, color, track, t, children,
}: {
  value: number; size?: number; stroke?: number; color?: string
  track?: string; t: Tokens; children?: ReactNode
}) {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke={track ?? (color ?? t.brass) + '2E'} strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r}
          stroke={color ?? t.brass} strokeWidth={stroke} fill="none"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - value)} strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      {children && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          {children}
        </div>
      )}
    </div>
  )
}

export function SectionLabel({ children, t, action, onAction }: {
  children: ReactNode; t: Tokens; action?: string; onAction?: () => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
      <span style={{
        fontSize: 12, fontWeight: 700, color: t.inkMuted,
        fontFamily: FONT.display, letterSpacing: 0.6, textTransform: 'uppercase',
      }}>{children}</span>
      {action && (
        <button onClick={onAction} style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          fontSize: 12, fontWeight: 600, color: t.teal, fontFamily: FONT.body,
          display: 'inline-flex', alignItems: 'center', gap: 2,
        }}>
          {action}<Icon name="chevronRight" size={13} color={t.teal} />
        </button>
      )}
    </div>
  )
}

export function DiffDots({ level, t }: { level: number; t: Tokens }) {
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} style={{
          width: 5, height: 5, borderRadius: '50%',
          background: i <= level ? t.gold : t.isDark ? '#2A3A50' : '#D9D2C4',
        }} />
      ))}
    </div>
  )
}
