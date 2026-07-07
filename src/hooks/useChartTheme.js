import { useState, useEffect } from 'react';

// Recharts SVG nitelikleri var() kabul etmediği için, CSS chart tokenlarını
// runtime'da okuyup düz değer olarak döndürür. data-theme değişiminde günceller.

const readTheme = () => {
  if (typeof window === 'undefined') {
    return {
      c1: '#8B5CF6', c2: '#06B6D4', c3: '#10B981', c4: '#EF4444', c5: '#94A3B8',
      grid: 'rgba(139,92,246,0.12)', axis: '#94A3B8', tooltipBg: 'rgba(15,10,30,0.95)',
    };
  }
  const cs = getComputedStyle(document.documentElement);
  const v = (name, fallback) => cs.getPropertyValue(name).trim() || fallback;
  return {
    c1: v('--chart-1', '#8B5CF6'),
    c2: v('--chart-2', '#06B6D4'),
    c3: v('--chart-3', '#10B981'),
    c4: v('--chart-4', '#EF4444'),
    c5: v('--chart-5', '#94A3B8'),
    grid: v('--chart-grid', 'rgba(139,92,246,0.12)'),
    axis: v('--chart-axis', '#94A3B8'),
    tooltipBg: v('--chart-tooltip-bg', 'rgba(15,10,30,0.95)'),
  };
};

/** Tema-duyarlı Recharts renk paletini döndürür. */
export default function useChartTheme() {
  const [theme, setTheme] = useState(readTheme);

  useEffect(() => {
    const obs = new MutationObserver(() => setTheme(readTheme()));
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => obs.disconnect();
  }, []);

  return theme;
}

/** Recharts Tooltip için ortak contentStyle üretir. */
export const tooltipStyle = (theme) => ({
  backgroundColor: theme.tooltipBg,
  border: '1px solid var(--border-color)',
  borderRadius: '10px',
  color: 'var(--text-primary)',
  fontSize: '12px',
});
