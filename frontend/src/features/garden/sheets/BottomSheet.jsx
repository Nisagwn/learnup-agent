import React, { useState } from 'react';
import { X } from 'lucide-react';
import { pickItemImage } from '../treeAssets';

// Ortada açılan, çerçeveli oyun paneli (Market / Ağıl / Aksiyon). Pop-in animasyon, gradyan başlık.
// dim: ağıldan sürüklerken paneli saydamlaştır → arkadaki bahçe görünür, yerleştirme net olur.
export default function BottomSheet({ open, onClose, title, subtitle, headerRight, dim = false, maxHeight = '60vh', children }) {
  if (!open) return null;
  return (
    <div
      className={`gp-panel-backdrop${dim ? ' gp-panel-backdrop--dim' : ''}`}
      onPointerDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div className="gp-panel" role="dialog" aria-modal="true" aria-label={title}>
        <div className="gp-panel-head">
          <div className="gp-panel-titles">
            <div className="gp-panel-title">{title}</div>
            {subtitle && <div className="gp-panel-sub">{subtitle}</div>}
          </div>
          <div className="gp-panel-head-right">
            {headerRight}
            <button type="button" className="gp-panel-close" onClick={onClose} aria-label="Kapat"><X size={18} /></button>
          </div>
        </div>
        <div className="gp-panel-body" style={{ maxHeight }}>{children}</div>
      </div>
    </div>
  );
}

// Item küçük görseli: PNG varsa onu, yoksa emoji.
export function ItemThumb({ item, size = 40, stage = 'mature' }) {
  const [err, setErr] = useState(false);
  const src = err ? null : pickItemImage(item, stage);
  if (src) {
    return <img src={src} alt="" draggable={false} onError={() => setErr(true)} style={{ width: size, height: size, objectFit: 'contain', pointerEvents: 'none' }} />;
  }
  return <span style={{ fontSize: Math.round(size * 0.7), lineHeight: 1 }}>{item?.emoji || '🌱'}</span>;
}
