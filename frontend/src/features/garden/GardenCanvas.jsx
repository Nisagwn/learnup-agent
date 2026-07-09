import React from 'react';
import PlantNode from './PlantNode';
import { SHADOW } from './gardenLogic';

const BG_URL = '/assets/garden/forest_bg.png';

// Katmanlı render alanı: arka plan → gölgeler → bitkiler (Y-sort).
// Üst katmanlar (ghost/overlay/sheet) GardenScreen tarafından bu alanın üstüne konur.
export default function GardenCanvas({
  canvasRef, resolved, editMode, onTap, onDragMove, onDragEnd, onScale,
}) {
  // Y-sort: küçük y arkada, büyük y önde
  const sorted = [...resolved].sort((a, b) => a.plant.y - b.plant.y);

  return (
    <div
      ref={canvasRef}
      className="gp-canvas"
      style={{
        position: 'absolute', inset: 0, overflow: 'hidden',
        backgroundColor: '#1b3b2a',
        backgroundImage: `url('${BG_URL}')`,
        backgroundSize: 'cover',     // tam doldurur, boşluk yok
        backgroundPosition: 'center', // foto direkt ortalı
        backgroundRepeat: 'no-repeat',
      }}
    >
      {/* Katman 2: gölgeler */}
      {sorted.map(({ plant }) => {
        const s = typeof plant.scale === 'number' ? plant.scale : 1;
        return (
          <div
            key={`sh-${plant.plantId}`}
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: plant.x - SHADOW.rx * s,
              top: plant.y + SHADOW.cyOffset - SHADOW.ry * s,
              width: SHADOW.rx * 2 * s,
              height: SHADOW.ry * 2 * s,
              borderRadius: '50%',
              background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 70%)',
              filter: 'blur(6px)',
              pointerEvents: 'none',
            }}
          />
        );
      })}

      {/* Katman 3: bitkiler (Y-sort) */}
      {sorted.map(({ plant, item, stage }) => (
        <PlantNode
          key={plant.plantId}
          plant={plant}
          item={item}
          stage={stage}
          editMode={editMode}
          canvasRef={canvasRef}
          onTap={onTap}
          onDragMove={onDragMove}
          onDragEnd={onDragEnd}
          onScale={onScale}
        />
      ))}
    </div>
  );
}
