import React from 'react';
import { Trash2, Minus, Plus } from 'lucide-react';
import BottomSheet from './BottomSheet';
import { plantTooltipETA, PLANT_SCALE_MIN, PLANT_SCALE_MAX } from '../gardenLogic';

// Tek bitki aksiyonları: ETA + boyut (slider + ince +/−) + Söke (ağıla geri).
// Slider canlı önizler (onScalePreview = yalnız yerel), bırakınca kaydeder (onScaleCommit).
const SCALE_STEP = 0.05;
export default function PlantActionSheet({ open, onClose, plant, item, now = 0, growthSeconds, eternal, onScale, onScalePreview, onScaleCommit, onRemove }) {
  if (!open || !plant || !item) return null;
  const eta = plantTooltipETA(plant, now, growthSeconds, eternal);
  const scale = typeof plant.scale === 'number' ? plant.scale : 1;

  const remove = () => {
    if (window.confirm('Bitkiyi söke - Bitki ağıla geri eklenecek. Emin misin?')) {
      onRemove?.(plant.plantId);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={`${item.emoji || '🌱'} ${item.name}`} subtitle={eta} maxHeight="auto">
      <div className="gp-pa-row">
        <span className="gp-pa-label">Boyut</span>
        <div className="gp-pa-scale">
          <button type="button" className="gp-pa-stepper" disabled={scale <= PLANT_SCALE_MIN + 0.001} onClick={() => onScale?.(plant.plantId, -SCALE_STEP)} aria-label="Küçült"><Minus size={16} /></button>
          <span className="gp-pa-scaleval">{Math.round(scale * 100)}%</span>
          <button type="button" className="gp-pa-stepper" disabled={scale >= PLANT_SCALE_MAX - 0.001} onClick={() => onScale?.(plant.plantId, SCALE_STEP)} aria-label="Büyült"><Plus size={16} /></button>
        </div>
      </div>

      <input
        type="range"
        className="gp-pa-slider"
        min={PLANT_SCALE_MIN}
        max={PLANT_SCALE_MAX}
        step={0.01}
        value={scale}
        onChange={(e) => onScalePreview?.(plant.plantId, parseFloat(e.target.value))}
        onPointerUp={() => onScaleCommit?.(plant.plantId)}
        onPointerCancel={() => onScaleCommit?.(plant.plantId)}
        onKeyUp={() => onScaleCommit?.(plant.plantId)}
        aria-label="Bitki boyutu (sürükleyerek ayarla)"
      />

      <button type="button" className="gp-pa-remove" onClick={remove}>
        <Trash2 size={16} /> Söke (fiyatın %30'u iade)
      </button>
    </BottomSheet>
  );
}
