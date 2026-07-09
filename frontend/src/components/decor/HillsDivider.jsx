import React from 'react';

/**
 * Organik tepe/yaprak ayraç — bölüm geçişlerini doğal/yumuşak yapar (FAZ 17).
 * Tema-duyarlı (CSS var dolgu). flip=true → aşağı bakan tepeler.
 * @param {string} [tone]  Üst katman dolgusu (varsayılan yaprak-soft)
 * @param {boolean} [flip]
 */
export default function HillsDivider({ tone = 'var(--accent-leaf-soft)', flip = false, className = '' }) {
  return (
    <div
      aria-hidden="true"
      className={className}
      style={{
        width: '100%',
        lineHeight: 0,
        transform: flip ? 'rotate(180deg)' : 'none',
        pointerEvents: 'none',
      }}
    >
      <svg viewBox="0 0 1440 110" preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: 'clamp(48px, 7vw, 88px)' }}>
        {/* arka tepe — kabuk kahve, çok hafif */}
        <path
          d="M0,64 C240,24 420,96 720,72 C1020,48 1200,104 1440,64 L1440,110 L0,110 Z"
          fill="rgba(146,112,78,0.08)"
        />
        {/* orta tepe — bal, hafif */}
        <path
          d="M0,80 C260,52 460,100 720,84 C1000,66 1220,108 1440,82 L1440,110 L0,110 Z"
          fill="rgba(232,163,61,0.10)"
        />
        {/* ön tepe — yaprak (ana) */}
        <path
          d="M0,92 C280,72 480,108 720,96 C980,82 1200,110 1440,94 L1440,110 L0,110 Z"
          fill={tone}
        />
      </svg>
    </div>
  );
}
