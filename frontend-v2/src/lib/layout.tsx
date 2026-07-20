import type { ReactNode } from 'react'

// Üst navigasyon yüksekliği — hem kabuk hem sohbet ekranı (yükseklik hesabı) kullanır.
export const NAV_H = 62

/** Sayfa içeriği için tutarlı, ortalanmış, responsive konteyner. */
export function Page({ children, max = 1200, style }: { children: ReactNode; max?: number; style?: React.CSSProperties }) {
  return (
    <div style={{ maxWidth: max, margin: '0 auto', padding: '0 clamp(16px, 4vw, 36px)', width: '100%', ...style }}>
      {children}
    </div>
  )
}

/** Standart sayfa başlığı: ikon + başlık + alt açıklama + sağ aksiyon. */
export function PageHeader({ icon, title, subtitle, right }: { icon?: ReactNode; title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 13, minWidth: 0 }}>
        {icon}
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 'clamp(20px, 2.4vw, 26px)', fontWeight: 800, margin: 0, lineHeight: 1.1, fontFamily: "'Outfit', sans-serif" }}>{title}</h1>
          {subtitle && <div style={{ fontSize: 13, opacity: 0.62, marginTop: 3 }}>{subtitle}</div>}
        </div>
      </div>
      {right}
    </div>
  )
}
