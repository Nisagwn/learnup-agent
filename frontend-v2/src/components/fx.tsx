import type { ReactNode } from 'react'
import { LazyMotion, domMax, m, useReducedMotion } from 'framer-motion'
import { cn } from '../lib/cn'

/* ═══════════════════════════════════════════════════════════════════════════
   Ambiyans & hareket — FİDAN imza efektleri.
   Perf kuralları: lekeler transform-only + pointer-events-none; blur'lu öğenin
   kendisi anime edilmez (opaklık/konum drift'i GPU-dostu).
   ═══════════════════════════════════════════════════════════════════════════ */

/** framer-motion özellik sarmalayıcısı (m.* bileşenleri için şart).
    domMax: layoutId (nav aktif çizgisi) + drag (Bahçe taşıma) bunu gerektirir. */
export function MotionRoot({ children }: { children: ReactNode }) {
  return <LazyMotion features={domMax}>{children}</LazyMotion>
}

/** Işık Huzmesi (FİDAN §5.1) — sayfanın üstünden süzülen 2 sıcak ışık lekesi.
    radial-gradient (filter yok), yavaş drift: bal/toprak + adaçayı yeşili.
    (Fonksiyon adı `YakamozBackdrop` App.tsx importuyla korunur — yeniden adlandırma ayrı temizlik kartı.) */
export function YakamozBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div
        className="absolute -top-40 left-[8%] size-[560px] rounded-full will-change-transform motion-safe:animate-drift"
        style={{ background: 'radial-gradient(circle, rgba(212,163,115,0.14), transparent 62%)' }}
      />
      <div
        className="absolute right-[-10%] top-[38%] size-[640px] rounded-full will-change-transform motion-safe:animate-drift-slow"
        style={{ background: 'radial-gradient(circle, rgba(132,169,140,0.16), transparent 65%)' }}
      />
    </div>
  )
}

export function WaveDivider({ className }: { className?: string }) {
  return <div aria-hidden className={cn('wave-divider', className)} />
}

/**
 * Stagger'lı süzülerek giriş — yalnız opacity/transform.
 *
 * CSS animasyonları `motion-safe:` ile kapılı ama bu JS animasyonuydu: hareket
 * hassasiyeti olan kullanıcı yine de her sayfada süzülme görüyordu. useReducedMotion
 * ile içerik ANINDA görünür — gecikme de sıfırlanır (yoksa stagger boyunca boş ekran).
 */
export function Reveal({ delay = 0, className, children }: {
  delay?: number; className?: string; children: ReactNode
}) {
  const azalt = useReducedMotion()
  return (
    <m.div
      initial={azalt ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: azalt ? 0 : 0.55, delay: azalt ? 0 : delay, ease: [0.21, 0.65, 0.32, 1] }}
      className={className}
    >
      {children}
    </m.div>
  )
}

/**
 * Aceternity tarzı dönen conic-gradient neon sınır.
 * mode="always": kalıcı animasyon (sayfada TEK kullanım — hero).
 * mode="hover":  sınır yalnız hover'da belirir (ajan kartları).
 */
export function GlowBorder({ mode = 'hover', radius = 'rounded-2xl', className, children }: {
  mode?: 'always' | 'hover'; radius?: string; className?: string; children: ReactNode
}) {
  return (
    <div className={cn('group relative', radius, className)}>
      <div
        aria-hidden
        className={cn(
          'absolute -inset-px',
          radius,
          mode === 'always'
            ? 'motion-safe:animate-border-spin'
            : 'opacity-0 transition-opacity duration-300 group-hover:opacity-100 motion-safe:group-hover:animate-border-spin',
        )}
        style={{
          background:
            'conic-gradient(from var(--border-angle), transparent 0%, rgba(79,165,111,0.75) 12%, rgba(132,169,140,0.55) 26%, transparent 42%, transparent 58%, rgba(79,165,111,0.35) 74%, transparent 90%)',
        }}
      />
      {/* İç yüzey — neon katmanın 1px içinde, zemini kapatır (tema-duyarlı) */}
      <div className={cn('relative', radius)} style={{ background: 'var(--page-bg)' }}>{children}</div>
    </div>
  )
}

/** Ajan ikonunun arkasında yavaşça nefes alan FİDAN yaprak ışığı (GPU-dostu; hareket-azalt'ta durur). */
export function BreathingGlow({ className }: { className?: string }) {
  const azalt = useReducedMotion()
  return (
    <m.span
      aria-hidden
      className={cn('absolute inset-0 rounded-full blur-md', className)}
      style={{ background: 'color-mix(in srgb, var(--yaprak) 25%, transparent)' }}
      animate={azalt ? undefined : { scale: [1, 1.3, 1], opacity: [0.3, 0.7, 0.3] }}
      transition={azalt ? undefined : { duration: 5, repeat: Infinity, ease: 'easeInOut' }}
    />
  )
}
