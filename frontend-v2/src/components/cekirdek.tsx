import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import NumberFlow, { type Format } from '@number-flow/react'
import * as RTooltip from '@radix-ui/react-tooltip'
import { m, useReducedMotion } from 'framer-motion'
import { cn } from '../lib/cn'
import { Icon, type IconName } from '../ui'

/* ═══════════════════════════════════════════════════════════════════════════
   ÇEKİRDEK GÖRSEL BİLEŞENLER — FİDAN veri dili (TASARIM-DILI v1.2).
   Dataviz sözleşmesi: magnitude = TEK renk (adaçayı) 4 doygunluk tonu
   `--v1..--v4` · ölçüm yok = `--v0` + kesik kenar (null ≠ 0) · metin asla seri
   rengi giymez · ray/track = `--ic` çökük yüzey · dolum adaçayı→yaprak gradyanı.
   ═══════════════════════════════════════════════════════════════════════════ */

/** tr-TR biçimli, dijit-kayması animasyonlu sayı (NumberFlow). */
export function Sayi({ value, format, suffix, className }: {
  value: number
  format?: Format
  suffix?: string
  className?: string
}) {
  return (
    <NumberFlow
      value={value}
      locales="tr-TR"
      format={format ?? { maximumFractionDigits: 0 }}
      suffix={suffix}
      className={className}
    />
  )
}

/** Görünüme girince 0→değer sayan yüzde/adet — KPI'ların canlı hissi. */
export function CanliSayi({ value, suffix, className }: {
  value: number; suffix?: string; className?: string
}) {
  const [goster, setGoster] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) { setGoster(value); return }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setGoster(value); io.disconnect() }
    }, { threshold: 0.4 })
    io.observe(el)
    return () => io.disconnect()
  }, [value])
  return (
    <span ref={ref} className={className}>
      <Sayi value={goster} suffix={suffix} />
    </span>
  )
}

/* ── Radix tooltip — cam içerik, tek Provider (Shell'de) ──────────────────── */

export function TipProvider({ children }: { children: ReactNode }) {
  return <RTooltip.Provider delayDuration={180} skipDelayDuration={220}>{children}</RTooltip.Provider>
}

export function Tip({ icerik, children, yan = 'top' }: {
  icerik: ReactNode; children: ReactNode; yan?: 'top' | 'bottom' | 'left' | 'right'
}) {
  return (
    <RTooltip.Root>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content
          side={yan}
          sideOffset={7}
          collisionPadding={10}
          className="glass-solid z-[80] max-w-64 rounded-xl px-3 py-2 text-xs leading-relaxed text-slate-600 shadow-card dark:text-slate-300"
        >
          {icerik}
          <RTooltip.Arrow className="fill-white/85 dark:fill-ocean-850/90" />
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  )
}

/* ── Stat tile — KPI şeridinin tuğlası ────────────────────────────────────── */

export function StatTile({ icon, label, children, alt, delta, deltaIyi, className }: {
  icon: IconName
  label: string
  children: ReactNode            // değer satırı (Sayi/CanliSayi + birim)
  alt?: ReactNode                // alt bilgi satırı (mono)
  delta?: number | null          // imzalı fark (ör. +7 puan) — yönlü renk
  deltaIyi?: boolean             // yukarısı iyi mi (varsayılan true)
  className?: string
}) {
  const iyi = deltaIyi ?? true
  const yukari = (delta ?? 0) >= 0
  const olumlu = delta != null && (yukari === iyi)
  return (
    <div className={cn('glass-solid rounded-2xl px-5 py-4', className)}>
      <div className="flex items-center gap-2">
        <Icon name={icon} size={15} color="currentColor" style={{ opacity: 0.55 }} />
        <span className="font-display text-[11.5px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">
          {label}
        </span>
        {delta != null && delta !== 0 && (
          <span className={cn(
            'ml-auto inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-mono text-[11px] font-semibold',
            olumlu
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
              : 'bg-rose-500/10 text-rose-600 dark:text-rose-300',
          )}>
            <Icon name="arrowUp" size={11} color="currentColor"
              style={{ transform: yukari ? 'none' : 'rotate(180deg)' }} />
            {Math.abs(delta)}
          </span>
        )}
      </div>
      <div className="mt-2.5 flex items-baseline gap-1.5 font-display text-[30px] font-bold leading-none tracking-tight text-slate-800 dark:text-slate-100">
        {children}
      </div>
      {alt && <div className="mt-2 font-mono text-[10.5px] text-slate-400 dark:text-slate-500">{alt}</div>}
    </div>
  )
}

/* ── Meter — aynı-ramp track'li dolum çubuğu (mount'ta genişler) ──────────── */

export function Meter({ oran, yukseklik = 6, renk, className }: {
  oran: number                    // 0–1
  yukseklik?: number
  renk?: string                   // veri-güdümlü istisna; verilmezse sky
  className?: string
}) {
  const yuzde = Math.min(100, Math.max(0, oran * 100))
  return (
    <div
      className={cn('overflow-hidden rounded-full', className)}
      style={{ height: yukseklik, background: 'var(--ic)' }}
    >
      <m.div
        initial={{ width: 0 }}
        whileInView={{ width: `${yuzde}%` }}
        viewport={{ once: true, amount: 0.6 }}
        transition={{ duration: 0.7, ease: [0.22, 0.61, 0.36, 1] }}
        className="h-full rounded-full"
        style={{ background: renk ?? 'linear-gradient(90deg, var(--adacayi), var(--yaprak))' }}
      />
    </div>
  )
}

/* ── Halka — SVG ilerleme halkası (animasyonlu stroke) ────────────────────── */

export function Halka({ oran, boyut = 64, kalinlik = 6, renk, children, className }: {
  oran: number; boyut?: number; kalinlik?: number
  renk?: string; children?: ReactNode; className?: string
}) {
  const r = (boyut - kalinlik) / 2
  const cevre = 2 * Math.PI * r
  const hedef = cevre * (1 - Math.min(1, Math.max(0, oran)))
  return (
    <div className={cn('relative shrink-0', className)} style={{ width: boyut, height: boyut }}>
      <svg width={boyut} height={boyut}>
        <circle
          cx={boyut / 2} cy={boyut / 2} r={r} fill="none" strokeWidth={kalinlik}
          stroke="var(--ic)"
        />
        <m.circle
          cx={boyut / 2} cy={boyut / 2} r={r} fill="none" strokeWidth={kalinlik}
          strokeLinecap="round"
          stroke={renk ?? 'var(--data-hue)'}
          strokeDasharray={cevre}
          initial={{ strokeDashoffset: cevre }}
          whileInView={{ strokeDashoffset: hedef }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.9, ease: [0.22, 0.61, 0.36, 1] }}
          transform={`rotate(-90 ${boyut / 2} ${boyut / 2})`}
        />
      </svg>
      {children && (
        <div className="absolute inset-0 grid place-items-center">{children}</div>
      )}
    </div>
  )
}

/* ── Sparkline — 12 noktalı mini eğilim (de-emphasis + uç vurgusu) ────────── */

export function Sparkline({ veri, genislik = 96, yukseklik = 28 }: {
  veri: number[]; genislik?: number; yukseklik?: number
}) {
  if (veri.length < 2) return null
  const min = Math.min(...veri)
  const max = Math.max(...veri)
  const aralik = max - min || 1
  const pad = 3
  const pts = veri.map((v, i) => [
    pad + (i / (veri.length - 1)) * (genislik - pad * 2),
    yukseklik - pad - ((v - min) / aralik) * (yukseklik - pad * 2),
  ])
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const son = pts[pts.length - 1]
  return (
    <svg width={genislik} height={yukseklik} aria-hidden className="shrink-0">
      <path d={d} fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
        className="stroke-slate-300 dark:stroke-slate-600" />
      {/* Son dönem vurgusu: uç nokta veri renginde, yüzey halkalı */}
      <circle cx={son[0]} cy={son[1]} r="3.4" className="fill-white dark:fill-ocean-850" />
      <circle cx={son[0]} cy={son[1]} r="2.2" fill="var(--data-hue)" />
    </svg>
  )
}

/* ── Isı hücresi — FİDAN 4-ton skala, zengin tooltip'li ───────────────────── */

/** FİDAN ısı skalası: TEK renk (adaçayı) 4 doygunluk tonu. 0 = boş gün/veri
    (`--v0` yüzeyine düşer); ölçülmüş düşük değerler `--v1`den başlar. */
export const isiTonu = (deger: number): string => {
  const d = Math.min(1, Math.max(0, deger))
  if (d <= 0) return 'var(--v0)'
  return d < 0.25 ? 'var(--v1)' : d < 0.5 ? 'var(--v2)' : d < 0.75 ? 'var(--v3)' : 'var(--v4)'
}

export function IsiHucre({ deger, boyut = 14, uyari, tip, gecikmeMs = 0, className, onClick, etiket, olcumYok }: {
  deger: number                    // 0–1 (ustalık / yoğunluk)
  boyut?: number
  uyari?: boolean                  // uyarı kenarı (açık yanılgı vb.) — tooltip kelimesi eşlik eder
  tip?: ReactNode                  // tooltip içeriği (verilmezse tooltip yok)
  gecikmeMs?: number               // stagger (dalga girişi)
  className?: string
  /** Verilirse hücre <button> olur (sınıf ısı matrisinde üniteye inmek için). */
  onClick?: () => void
  /** onClick varken ekran okuyucu adı — renk tek başına bilgi taşıyamaz. */
  etiket?: string
  /** null ≠ 0: hiç ölçüm yok → `--v0` dolgu + KESİK kenar; hover büyümez. */
  olcumYok?: boolean
}) {
  const azalt = useReducedMotion()
  const ortak = {
    className: cn(
      'inline-block rounded-[4px] border transition-transform duration-150',
      !olcumYok && 'hover:scale-125',
      onClick && 'cursor-pointer',
      className,
    ),
    style: {
      width: boyut, height: boyut,
      backgroundColor: olcumYok ? 'var(--v0)' : isiTonu(deger),
      borderColor: uyari && !olcumYok ? 'var(--uyari)' : 'var(--cam-kenar)',
      borderStyle: olcumYok ? 'dashed' : 'solid',
      animation: azalt ? undefined : `heatIn 0.4s ease-out ${Math.min(gecikmeMs, 900)}ms backwards`,
    } as CSSProperties,
  }
  const kutu = onClick
    ? <button type="button" onClick={onClick} aria-label={etiket} {...ortak} />
    : <span {...ortak} />
  return tip ? <Tip icerik={tip}>{kutu}</Tip> : kutu
}

/* ── Ölçer — eşik çentikli dolum çubuğu (Meter'in kapı-eşiği kardeşi) ─────── */

/**
 * Ölçülen değeri BİR EŞİĞE KARŞI gösterir (Jaccard özgünlük eşikleri, sızıntı oranı…).
 * Meter "ne kadar" der; Ölçer "sınırın neresinde" der — kapının geçildiği görünür olmalı.
 */
export function Olcer({ deger, esik, min = 0, max = 1, etiket, tersIyi, yukseklik = 8, className }: {
  deger: number
  esik: number
  min?: number
  max?: number
  etiket?: string
  /** true → değerin eşiği AŞMASI kötüdür (sızıntı oranı gibi). Varsayılan: aşmak kötü. */
  tersIyi?: boolean
  yukseklik?: number
  className?: string
}) {
  const norm = (v: number): number => Math.min(100, Math.max(0, ((v - min) / (max - min)) * 100))
  const y = norm(deger)
  const e = norm(esik)
  const asildi = tersIyi ? deger < esik : deger > esik
  return (
    <div className={className}>
      <div className="relative overflow-hidden rounded-full bg-sky-500/12 dark:bg-sky-400/10" style={{ height: yukseklik }}>
        <m.div
          initial={{ width: 0 }}
          whileInView={{ width: `${y}%` }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: 0.7, ease: [0.22, 0.61, 0.36, 1] }}
          className="h-full rounded-full"
          style={{
            background: asildi
              ? 'linear-gradient(90deg, var(--color-rose-600), var(--color-rose-400))'
              : 'linear-gradient(90deg, var(--color-sky-600), var(--color-sky-400))',
          }}
        />
        {/* Eşik çentiği — çubuğun üstünde, tam sınırda */}
        <span
          className={cn('absolute top-0 h-full w-0.5', asildi ? 'bg-rose-600 dark:bg-rose-400' : 'bg-amber-500 dark:bg-amber-400')}
          style={{ left: `${e}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-slate-400 dark:text-slate-500">
        <span>{etiket ?? deger.toFixed(2)}</span>
        <span>eşik {esik.toFixed(2)}</span>
      </div>
    </div>
  )
}

/* ── Panel başlığı — bölüm etiketi + sağ aksiyon/rozet ────────────────────── */

export function PanelBaslik({ icon, children, sag, className }: {
  icon?: IconName; children: ReactNode; sag?: ReactNode; className?: string
}) {
  return (
    <div className={cn('mb-3 flex items-center justify-between gap-2', className)}>
      <span className="inline-flex items-center gap-1.5 font-display text-xs font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
        {icon && <Icon name={icon} size={13} color="currentColor" />}
        {children}
      </span>
      {sag}
    </div>
  )
}

/* ── Boş durum — SVG vinyet yuvası + başlık + CTA ─────────────────────────── */

export function BosDurum({ gorsel, baslik, aciklama, cta, className }: {
  gorsel?: ReactNode; baslik: string; aciklama?: string
  cta?: ReactNode; className?: string
}) {
  return (
    <div className={cn('grid place-items-center px-6 py-10 text-center', className)}>
      <div>
        {gorsel}
        <p className="mt-3 font-display text-[15px] font-bold text-slate-700 dark:text-slate-200">{baslik}</p>
        {aciklama && (
          <p className="mx-auto mt-1.5 max-w-xs text-xs leading-relaxed text-slate-400 dark:text-slate-500">
            {aciklama}
          </p>
        )}
        {cta && <div className="mt-4">{cta}</div>}
      </div>
    </div>
  )
}
