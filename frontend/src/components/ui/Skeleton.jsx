import React from 'react';

/**
 * Tek bir iskelet (placeholder) bloğu.
 * @param {string|number} [width]  - CSS genişliği (örn. '60%', 120)
 * @param {string|number} [height] - CSS yüksekliği
 * @param {string} [radius]        - border-radius
 */
export function Skeleton({ width = '100%', height = 16, radius, className = '', style }) {
  return (
    <span
      className={`skeleton ${className}`}
      aria-hidden="true"
      style={{ width, height, borderRadius: radius, ...style }}
    />
  );
}

/** Birden çok satırlık metin iskeleti. Son satır biraz kısa görünür. */
export function SkeletonText({ lines = 3, className = '' }) {
  return (
    <span className={`flex flex-col gap-2 ${className}`} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} height={12} width={i === lines - 1 ? '70%' : '100%'} />
      ))}
    </span>
  );
}

/** ds-card görünümünde tam bir kart iskeleti. */
export function SkeletonCard({ lines = 3, className = '' }) {
  return (
    <div className={`ds-card ${className}`} aria-hidden="true">
      <Skeleton height={20} width="45%" />
      <div className="mt-4">
        <SkeletonText lines={lines} />
      </div>
    </div>
  );
}

export default Skeleton;
