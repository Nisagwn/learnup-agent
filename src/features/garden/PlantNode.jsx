import React, { useRef, useState } from 'react';
import { pickItemImage } from './treeAssets';
import {
  DEFAULT_SIZE, STAGE_RENDER_SCALE, DRAG_SCALE, TAP_MAX_MS, LONGPRESS_MS,
} from './gardenLogic';

// Tek bitki: konum (merkez anchor) + pointer gesture + PNG/emoji render.
// editMode DIŞINDA: tap → onTap. editMode'da: sürükle → onDragMove/onDragEnd, wheel → onScale.
export default function PlantNode({
  plant, item, stage, editMode, canvasRef,
  onTap, onDragMove, onDragEnd, onScale,
}) {
  const [dragging, setDragging] = useState(false);
  const [pos, setPos] = useState(null); // {x,y} sürükleme sırasında canlı konum
  const [imgError, setImgError] = useState(false);
  const gesture = useRef(null);
  const longPressTimer = useRef(null);
  const rectRef = useRef(null);   // sürükleme başında canvas rect cache (reflow önler)
  const rafRef = useRef(0);       // pointermove'u rAF ile birleştir (60fps cap)
  const pendingRef = useRef(null);

  const isDecor = !item?.plantType; // dekor/özel → tam boy, evre ölçeği yok
  const imgSrc = imgError ? null : pickItemImage(item, stage);
  const renderScale = isDecor ? 1 : (STAGE_RENDER_SCALE[stage] || 1);
  const imgSize = Math.round(DEFAULT_SIZE * renderScale);

  const cx = pos ? pos.x : plant.x;
  const cy = pos ? pos.y : plant.y;
  const userScale = typeof plant.scale === 'number' ? plant.scale : 1;
  const visualScale = userScale * (dragging ? DRAG_SCALE : 1);

  const localFromClient = (e) => {
    // Sürüklerken cache'lenmiş rect kullan → her harekette reflow tetiklemez.
    const rect = rectRef.current || canvasRef?.current?.getBoundingClientRect();
    if (!rect) return { x: plant.x, y: plant.y };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const clearLongPress = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  };

  const cancelRaf = () => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0; }
    pendingRef.current = null;
  };

  // rAF içinde tek sefer konum uygula (birikmiş pointermove'ları birleştirir)
  const flushDrag = () => {
    rafRef.current = 0;
    const p = pendingRef.current;
    if (!p) return;
    setPos(p);
    onDragMove?.(plant.plantId, p.x, p.y);
  };

  const beginDrag = () => {
    if (!editMode || dragging) return;
    rectRef.current = canvasRef?.current?.getBoundingClientRect() || null;
    setDragging(true);
    setPos({ x: plant.x, y: plant.y });
  };

  const onPointerDown = (e) => {
    if (e.button != null && e.button !== 0) return; // sadece sol/temas
    e.currentTarget.setPointerCapture?.(e.pointerId);
    gesture.current = { startX: e.clientX, startY: e.clientY, t: Date.now(), moved: false };
    if (editMode) {
      longPressTimer.current = setTimeout(beginDrag, LONGPRESS_MS);
    }
  };

  const onPointerMove = (e) => {
    const g = gesture.current;
    if (!g) return;
    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    if (Math.hypot(dx, dy) > 6) g.moved = true;
    if (editMode && !dragging && g.moved) { clearLongPress(); beginDrag(); }
    if (dragging) {
      // Senkron setPos yerine rAF'e biriktir → ekran yenileme hızında (60fps) uygula.
      pendingRef.current = localFromClient(e);
      if (!rafRef.current) rafRef.current = requestAnimationFrame(flushDrag);
    }
  };

  const onPointerUp = (e) => {
    clearLongPress();
    cancelRaf();
    rectRef.current = null;
    const g = gesture.current;
    gesture.current = null;
    if (dragging) {
      const p = localFromClient(e);
      setDragging(false);
      setPos(null);
      onDragEnd?.(plant.plantId, p.x, p.y);
      return;
    }
    // tap: kısa + hareketsiz
    if (g && !g.moved && Date.now() - g.t < TAP_MAX_MS) onTap?.(plant);
  };

  const onWheel = (e) => {
    if (!editMode) return;
    e.preventDefault();
    onScale?.(plant.plantId, e.deltaY < 0 ? 0.05 : -0.05);
  };

  return (
    <div
      className={`gp-plant${editMode ? ' gp-plant--edit' : ''}${dragging ? ' gp-plant--drag' : ''}`}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: DEFAULT_SIZE,
        height: DEFAULT_SIZE,
        // left/top yerine translate3d → layout reflow yok, kompozit katmanda taşınır
        // (alttaki blur'lu gölgeler yeniden raster edilmez = sürükleme akıcı).
        transform: `translate3d(${cx - DEFAULT_SIZE / 2}px, ${cy - DEFAULT_SIZE / 2}px, 0) scale(${visualScale})`,
        willChange: dragging ? 'transform' : undefined,
        zIndex: dragging ? 999 : undefined,
        touchAction: 'none',
        cursor: editMode ? 'grab' : 'pointer',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
      role="button"
      tabIndex={0}
      aria-label={item?.name || 'Bitki'}
    >
      {imgSrc ? (
        <img
          src={imgSrc}
          alt={item?.name || ''}
          draggable={false}
          onError={() => setImgError(true)}
          style={{ width: imgSize, height: imgSize, objectFit: 'contain', pointerEvents: 'none', userSelect: 'none' }}
        />
      ) : (
        <span style={{ fontSize: Math.round(30 * (isDecor ? 1 : renderScale + 0.2)), lineHeight: 1, pointerEvents: 'none' }}>
          {item?.emoji || '🌱'}
        </span>
      )}
    </div>
  );
}
