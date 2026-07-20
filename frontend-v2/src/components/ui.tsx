import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'
import { cn } from '../lib/cn'
import { Icon, type IconName } from '../ui'

/* ═══════════════════════════════════════════════════════════════════════════
   COASTAL primitives — Tailwind, iki tema (kıyı-açık varsayılan, .dark okyanus).
   Dinamik renk kuralı: bilinen varyant → statik sınıf haritası;
   veri-güdümlü değer → inline style (bilinçli istisna).
   ═══════════════════════════════════════════════════════════════════════════ */

export const TONE = {
  teal: 'bg-teal-500/10 text-teal-700 border-teal-500/25 dark:bg-teal-400/15 dark:text-teal-300 dark:border-teal-400/25',
  sky: 'bg-sky-500/10 text-sky-700 border-sky-500/25 dark:bg-sky-400/15 dark:text-sky-300 dark:border-sky-400/25',
  amber: 'bg-amber-500/10 text-amber-700 border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/25',
  brass: 'bg-brass-500/10 text-brass-700 border-brass-500/30 dark:bg-brass-500/15 dark:text-brass-300 dark:border-brass-500/30',
  emerald: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/25 dark:bg-emerald-400/15 dark:text-emerald-300 dark:border-emerald-400/25',
  rose: 'bg-rose-500/10 text-rose-700 border-rose-500/25 dark:bg-rose-400/15 dark:text-rose-300 dark:border-rose-400/25',
  slate: 'bg-slate-500/10 text-slate-600 border-slate-500/15 dark:bg-slate-400/10 dark:text-slate-300 dark:border-slate-400/15',
} as const
export type Tone = keyof typeof TONE

// Ders kimliği — nokta rengi her iki temada okunur orta tonlar.
export const SUBJECT_UI: Record<string, { hex: string }> = {
  mat: { hex: '#EA8A2E' },
  geo: { hex: '#8B6CD9' },
  fiz: { hex: '#2E9BD6' },
  kim: { hex: '#18A97B' },
  bio: { hex: '#7CB332' },
  trk: { hex: '#E0679A' },
  tar: { hex: '#DB6B5A' },
}

/** Ders adı TAM yazılır — renkli nokta + ad (kısaltma yok). */
export function SubjectName({ subject, anahtar, className }: {
  subject: string; anahtar: string; className?: string
}) {
  const hex = SUBJECT_UI[anahtar]?.hex ?? '#64748B'
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-600 dark:text-slate-300', className)}>
      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: hex }} />
      {subject}
    </span>
  )
}

export function GlassCard({
  interactive, blur = true, className, children, onClick,
}: {
  interactive?: boolean; blur?: boolean; className?: string
  children: ReactNode; onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-2xl',
        blur ? 'glass' : 'glass-solid',
        interactive &&
          'cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:border-sky-500/30 hover:shadow-card dark:hover:border-sky-400/25',
        className,
      )}
    >
      {children}
    </div>
  )
}

const BTN = {
  primary:
    'bg-sky-600 text-white font-bold shadow-glow-sky hover:bg-sky-500 active:translate-y-px dark:bg-sky-500 dark:text-ocean-950 dark:hover:bg-sky-400',
  outline:
    'border border-sky-600/25 text-sky-700 hover:bg-sky-500/10 dark:border-sky-500/20 dark:text-sky-300 dark:hover:bg-sky-400/10',
  ghost:
    'text-slate-500 hover:text-slate-800 hover:bg-sky-500/10 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-sky-400/10',
} as const

const BTN_SIZE = {
  sm: 'px-3.5 py-2 text-xs gap-1.5',
  md: 'px-5 py-2.5 text-sm gap-2',
  lg: 'px-7 py-3.5 text-base gap-2',
} as const

export function GlowButton({
  variant = 'primary', size = 'md', full, icon, className, children, ...rest
}: {
  variant?: keyof typeof BTN; size?: keyof typeof BTN_SIZE
  full?: boolean; icon?: IconName; className?: string; children: ReactNode
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={cn(
        'inline-flex items-center justify-center rounded-xl font-display transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-default',
        BTN[variant], BTN_SIZE[size], full && 'w-full', className,
      )}
    >
      {icon && <Icon name={icon} size={size === 'sm' ? 14 : 17} color="currentColor" />}
      {children}
    </button>
  )
}

export function Chip({ tone = 'slate', icon, className, children }: {
  tone?: Tone; icon?: IconName; className?: string; children: ReactNode
}) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-display text-xs font-semibold',
      TONE[tone], className,
    )}>
      {icon && <Icon name={icon} size={13} color="currentColor" />}
      {children}
    </span>
  )
}

export function Badge({ tone = 'slate', className, children }: {
  tone?: Tone; className?: string; children: ReactNode
}) {
  return (
    <span className={cn(
      'inline-flex items-center rounded-md border px-1.5 py-0.5 font-display text-[10.5px] font-bold lowercase tracking-wide',
      TONE[tone], className,
    )}>
      {children}
    </span>
  )
}

export function SectionLabel({ children, action, onAction, className }: {
  children: ReactNode; action?: string; onAction?: () => void; className?: string
}) {
  return (
    <div className={cn('mb-3 flex items-center justify-between', className)}>
      <span className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
        {children}
      </span>
      {action && (
        <button onClick={onAction}
          className="inline-flex cursor-pointer items-center gap-0.5 text-xs font-medium text-sky-600 hover:text-sky-500 dark:text-sky-400 dark:hover:text-sky-300">
          {action}
          <Icon name="chevronRight" size={13} color="currentColor" />
        </button>
      )}
    </div>
  )
}

/** İsim yanındaki canlı durum halkası — sayfada 1 adet (ping bütçesi). */
export function PingDot({ className }: { className?: string }) {
  return (
    <span className={cn('relative inline-flex size-2.5', className)}>
      <span className="absolute inline-flex size-full rounded-full bg-teal-500 opacity-70 motion-safe:animate-ping dark:bg-teal-400" />
      <span className="relative inline-flex size-2.5 rounded-full bg-teal-500 dark:bg-teal-400" />
    </span>
  )
}

/** Mono statü satırı — yumuşak nabız noktalı. */
export function StatusLine({ active = true, className, children }: {
  active?: boolean; className?: string; children: ReactNode
}) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 font-mono text-[11px] text-teal-700 dark:text-teal-300/90', className)}>
      <span className={cn('size-1.5 rounded-full bg-teal-500 dark:bg-teal-400', active && 'motion-safe:animate-pulse-soft')} />
      {children}
    </span>
  )
}

export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div className={cn('glass-solid animate-pulse rounded-2xl', className)} style={style} />
}

/**
 * Segment anahtarı — TrendPaneli'nin 4/12 hafta kontrolünün çıkarılmış hâli.
 *
 * Çıkarma sebebi çoğaltma değil TERSİ: aynı kontrol rontgen.tsx'te iki kez kopyalanmıştı.
 * Tek yerde durunca öğretmen panelindeki sıralama anahtarı, öğrencinin trend anahtarıyla
 * piksel-aynı olur — "aynı ürün" hissi bu ayrıntılardan doğar.
 */
export function SegmentGecis<T extends string>({ secenekler, deger, onDegis, className }: {
  secenekler: Array<[T, string]>
  deger: T
  onDegis: (v: T) => void
  className?: string
}) {
  return (
    <div className={cn('flex gap-1 rounded-lg bg-shore-100/80 p-0.5 dark:bg-ocean-950/60', className)}>
      {secenekler.map(([v, etiket]) => (
        <button
          key={v}
          type="button"
          aria-pressed={deger === v}
          onClick={() => onDegis(v)}
          className={cn(
            'cursor-pointer rounded-md px-2 py-0.5 font-display text-[11px] font-semibold transition-colors',
            deger === v
              ? 'bg-white text-slate-700 shadow-sm dark:bg-ocean-800 dark:text-slate-200'
              : 'text-slate-400 hover:text-slate-600 dark:text-slate-500',
          )}
        >
          {etiket}
        </button>
      ))}
    </div>
  )
}

/**
 * Filtre çipi — Arsiv.tsx:127 kalıbı, sky tonunda.
 * (Arsiv brass kullanır çünkü orası ÖSYM mührünün evi; genel filtreler sky'dır.)
 */
export function FiltreCipi({ aktif, onClick, children, className }: {
  aktif: boolean
  onClick: () => void
  children: ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      aria-pressed={aktif}
      onClick={onClick}
      className={cn(
        'cursor-pointer rounded-lg border px-3 py-1.5 font-display text-[12.5px] font-semibold transition-colors',
        aktif
          ? 'border-sky-600/40 bg-sky-500/10 text-sky-700 dark:border-sky-400/30 dark:text-sky-300'
          : 'border-slate-300/50 text-slate-400 hover:text-slate-600 dark:border-ocean-700 dark:hover:text-slate-300',
        className,
      )}
    >
      {children}
    </button>
  )
}
