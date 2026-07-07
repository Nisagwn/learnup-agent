import React from 'react';

const SIZES = { sm: 18, md: 28, lg: 40 };

/**
 * Tutarlı yükleme göstergesi (dönen halka).
 * @param {'sm'|'md'|'lg'|number} [size]
 * @param {string} [label] - erişilebilirlik etiketi
 */
export default function Spinner({ size = 'md', label = 'Yükleniyor', className = '' }) {
  const px = typeof size === 'number' ? size : SIZES[size] || SIZES.md;
  return (
    <span
      role="status"
      aria-label={label}
      className={`inline-block animate-spin rounded-full ${className}`}
      style={{
        width: px,
        height: px,
        border: `${Math.max(2, Math.round(px / 9))}px solid var(--border-color)`,
        borderTopColor: 'var(--accent-primary)',
      }}
    />
  );
}

/** Verilen yükseklikte ortalanmış spinner sarmalı. */
export function SpinnerBox({ height = '12rem', ...props }) {
  return (
    <div className="flex items-center justify-center" style={{ height }}>
      <Spinner {...props} />
    </div>
  );
}
