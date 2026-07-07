import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useUserStats } from '../../contexts/UserStatsContext';
import { useToast } from '../../components/ToastProvider';
import GardenCanvas from './GardenCanvas';
import InventorySheet from './sheets/InventorySheet';
import MarketSheet from './sheets/MarketSheet';
import PlantActionSheet from './sheets/PlantActionSheet';
import { getItem } from './marketCatalog';
import { pickItemImage } from './treeAssets';
import {
  subscribeGardenPlants, subscribeInventory, subscribeCoins,
  purchaseItem, plantSeed, movePlant, removePlant,
} from './gardenApi';
import {
  computeStage, clampPosition, findFreePosition, clampScale,
  TRASH_SIZE, TRASH_LEFT, TRASH_BOTTOM_OFFSET, GHOST_SIZE, GHOST_IMG, LONGPRESS_MS,
} from './gardenLogic';
import './GardenScreen.css';

export default function GardenScreen() {
  const { currentUser, userProfile } = useUserStats();
  const { success, error } = useToast();
  const uid = currentUser?.uid;
  const unlockedBadgeIds = useMemo(() => Object.keys(userProfile?.unlockedBadges || {}), [userProfile?.unlockedBadges]);

  const [coins, setCoins] = useState(0);
  const [plants, setPlants] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [editMode, setEditMode] = useState(false);
  const [openSheet, setOpenSheet] = useState(null); // 'inventory' | 'market'
  const [actionPlantId, setActionPlantId] = useState(null);
  const [ghost, setGhost] = useState(null); // {item, x, y} envanterden sürüklenen
  const [trashHover, setTrashHover] = useState(false);
  const [now, setNow] = useState(() => Date.now()); // evreleri zamanla yeniden hesapla
  // Tam-ekran için .content-area portal hedefi (garden zaten onun içinde render edilir → node hazır)
  const [host] = useState(() => (typeof document !== 'undefined' ? document.querySelector('.content-area') : null));

  const canvasRef = useRef(null);
  const ghostRef = useRef(null);
  const handlePlantRef = useRef(() => {});

  // ── Realtime abonelikler ──
  useEffect(() => {
    if (!uid) return undefined;
    const u1 = subscribeGardenPlants(uid, setPlants);
    const u2 = subscribeInventory(uid, setInventory);
    const u3 = subscribeCoins(uid, setCoins);
    return () => { u1?.(); u2?.(); u3?.(); };
  }, [uid]);

  // Evre ilerlemesi için zaman damgasını periyodik tazele (interval callback'inde — render'da değil)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);


  // Bitkileri katalog item + güncel evreyle çöz
  const resolved = useMemo(() => plants.map((plant) => {
    const item = getItem(plant.itemId) || { id: plant.itemId, emoji: '🌱', name: 'Bitki', eternal: false };
    const stage = computeStage(plant, now, item.growthSeconds, item.eternal);
    return { plant, item, stage };
  }), [plants, now]);

  const actionData = useMemo(() => {
    if (!actionPlantId) return null;
    const r = resolved.find((x) => x.plant.plantId === actionPlantId);
    return r || null;
  }, [actionPlantId, resolved]);

  // ── Çöp kutusu çarpışma (canvas-local) ──
  const isOverTrash = (x, y) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return false;
    const top = rect.height - TRASH_BOTTOM_OFFSET - TRASH_SIZE;
    return x >= TRASH_LEFT && x <= TRASH_LEFT + TRASH_SIZE && y >= top && y <= top + TRASH_SIZE;
  };

  // ── Handler'lar ──
  const handlePurchase = async (item) => {
    try {
      await purchaseItem(item.id);
      success('Satın alındı', `${item.name} ağılına eklendi.`);
    } catch (e) {
      error('Satın alınamadı', e.message || 'İşlem başarısız.');
    }
  };

  const handlePlant = async (item, x, y) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const w = rect?.width || 0;
    const h = rect?.height || 0;
    const free = findFreePosition(plants, x, y, w, h);
    try {
      await plantSeed({ itemId: item.id, x: free.x, y: free.y });
      setOpenSheet(null);
      success('Dikildi 🌱', `${item.name} bahçene eklendi.`);
    } catch (e) {
      error('Dikilemedi', e.message || 'İşlem başarısız.');
    }
  };
  // En güncel handlePlant'ı ref'te tut (document-level ghost listener'ı bunu çağırır)
  useEffect(() => { handlePlantRef.current = handlePlant; });

  const handleMove = async (plantId, x, y) => {
    setTrashHover(false);
    const rect = canvasRef.current?.getBoundingClientRect();
    const w = rect?.width || 0;
    const h = rect?.height || 0;
    const c = clampPosition(x, y, w, h);
    const free = findFreePosition(plants, c.x, c.y, w, h, undefined, plantId);
    // Optimistik: yerel konumu ANINDA güncelle → bırakınca eski konuma snap-back olmaz.
    // (Aksi halde: setPos(null) eski plant.x/y'yi gösterir, sonra server yeni konuma zıplar.)
    setPlants((prev) => prev.map((p) => (p.plantId === plantId ? { ...p, x: free.x, y: free.y } : p)));
    try {
      await movePlant({ plantId, x: free.x, y: free.y });
    } catch (e) {
      error('Taşınamadı', e.message || 'İşlem başarısız.');
      // Hata: abonelik gerçek (eski) değeri geri getirecek.
    }
  };

  const handleRemove = async (plantId) => {
    setTrashHover(false);
    setActionPlantId(null);
    try {
      await removePlant(plantId);
      success('Söküldü', 'Bitki ağıla geri eklendi.');
    } catch (e) {
      error('Sökülemedi', e.message || 'İşlem başarısız.');
    }
  };

  const handleScale = async (plantId, delta) => {
    const p = plants.find((x) => x.plantId === plantId);
    if (!p) return;
    const newScale = clampScale((typeof p.scale === 'number' ? p.scale : 1) + delta);
    setPlants((prev) => prev.map((x) => (x.plantId === plantId ? { ...x, scale: newScale } : x)));
    try {
      await movePlant({ plantId, x: p.x, y: p.y, scale: newScale });
    } catch (e) {
      error('Güncellenemedi', e.message || 'İşlem başarısız.');
    }
  };

  // Slider canlı önizleme: YALNIZ yerel state (Firestore'a yazma yok) → akıcı, anlık boyut.
  const handleScalePreview = (plantId, absScale) => {
    const s = clampScale(absScale);
    setPlants((prev) => prev.map((x) => (x.plantId === plantId ? { ...x, scale: s } : x)));
  };
  // Slider bırakılınca: o anki yerel ölçeği TEK seferde kalıcılaştır (write spam yok).
  const handleScaleCommit = async (plantId) => {
    const p = plants.find((x) => x.plantId === plantId);
    if (!p) return;
    try {
      await movePlant({ plantId, x: p.x, y: p.y, scale: clampScale(typeof p.scale === 'number' ? p.scale : 1) });
    } catch (e) {
      error('Güncellenemedi', e.message || 'İşlem başarısız.');
    }
  };

  const onDragMove = (plantId, x, y) => setTrashHover(editMode && isOverTrash(x, y));
  const onDragEnd = (plantId, x, y) => {
    if (editMode && isOverTrash(x, y)) handleRemove(plantId);
    else handleMove(plantId, x, y);
  };

  // ── Envanterden ghost ile dikme (document-level pointer) ──
  useEffect(() => {
    const onMove = (e) => {
      const d = ghostRef.current;
      if (!d) return;
      d.x = e.clientX; d.y = e.clientY;
      if (d.active) setGhost({ item: d.item, x: d.x, y: d.y });
    };
    const onUp = (e) => {
      const d = ghostRef.current;
      ghostRef.current = null;
      if (!d) return;
      if (d.timer) clearTimeout(d.timer);
      if (d.active) {
        setGhost(null);
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect && e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
          handlePlantRef.current(d.item, e.clientX - rect.left, e.clientY - rect.top);
        }
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
  }, []);

  const onInvItemPointerDown = (item, e) => {
    const d = { item, x: e.clientX, y: e.clientY, active: false, timer: null };
    d.timer = setTimeout(() => { d.active = true; setGhost({ item, x: d.x, y: d.y }); }, LONGPRESS_MS);
    ghostRef.current = d;
  };

  const ghostImg = ghost ? pickItemImage(ghost.item, 'mature') : null;

  const scene = (
    <div className={`gp-root${host ? '' : ' gp-root--inline'}`} aria-label="Bahçe / Orman">
      <GardenCanvas
        canvasRef={canvasRef}
        resolved={resolved}
        editMode={editMode}
        onTap={(p) => setActionPlantId(p.plantId)}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
        onScale={handleScale}
      />

      {/* Coin chip */}
      <div className="gp-coin">🪙 {Number(coins || 0).toLocaleString('tr-TR')}</div>

      {/* Boş orman ipucu */}
      {plants.length === 0 && (
        <div className="gp-empty">
          <div className="gp-empty-card">
            <div className="gp-empty-title">Ormanın boş 🌱</div>
            <div className="gp-empty-text">Sağ alttaki markete tıkla → tohum veya dekor al → ağıldan sürükleyip yerleştir</div>
          </div>
          <div className="gp-empty-arrow" aria-hidden="true">↘</div>
        </div>
      )}

      {/* Edit mode üst ipucu */}
      {editMode && (
        <div className="gp-edit-hint">Sürükle → taşı · Çöp kutusuna at → ağıla geri</div>
      )}

      {/* Çöp kutusu (edit mode) */}
      {editMode && (
        <div className={`gp-trash${trashHover ? ' gp-trash--hover' : ''}`} aria-hidden="true">
          🗑
          <span className="gp-trash-label">{trashHover ? 'BIRAK' : 'AĞILA AT'}</span>
        </div>
      )}

      {/* Edit mode alt "BİTTİ" */}
      {editMode && (
        <button type="button" className="gp-done" onClick={() => setEditMode(false)}>✓ BİTTİ</button>
      )}

      {/* FAB'lar */}
      {!editMode && (
        <div className="gp-fabs">
          <button type="button" className="gp-fab" onClick={() => setOpenSheet('market')} title="Market" aria-label="Market">🛍</button>
          <button type="button" className="gp-fab" onClick={() => setOpenSheet('inventory')} title="Ağıl" aria-label="Ağıl">🎒</button>
          <button type="button" className="gp-fab" onClick={() => setEditMode(true)} title="Düzenle" aria-label="Düzenle">✏️</button>
        </div>
      )}

      {/* Envanterden sürüklenen ghost */}
      {ghost && (
        <div className="gp-ghost" style={{ left: ghost.x - GHOST_SIZE / 2, top: ghost.y - GHOST_SIZE / 2, width: GHOST_SIZE, height: GHOST_SIZE }}>
          {ghostImg
            ? <img src={ghostImg} alt="" draggable={false} style={{ width: GHOST_IMG, height: GHOST_IMG, objectFit: 'contain' }} />
            : <span style={{ fontSize: 40 }}>{ghost.item?.emoji || '🌱'}</span>}
        </div>
      )}

      {/* Sheet'ler */}
      <InventorySheet
        open={openSheet === 'inventory'}
        onClose={() => setOpenSheet(null)}
        inventory={inventory}
        onItemPointerDown={onInvItemPointerDown}
        dim={!!ghost}
      />
      <MarketSheet
        open={openSheet === 'market'}
        onClose={() => setOpenSheet(null)}
        coins={coins}
        unlockedBadgeIds={unlockedBadgeIds}
        onBuy={handlePurchase}
      />
      <PlantActionSheet
        open={!!actionData}
        onClose={() => setActionPlantId(null)}
        plant={actionData?.plant}
        item={actionData?.item}
        now={now}
        growthSeconds={actionData?.item?.growthSeconds}
        eternal={actionData?.item?.eternal}
        onScale={handleScale}
        onScalePreview={handleScalePreview}
        onScaleCommit={handleScaleCommit}
        onRemove={handleRemove}
      />
    </div>
  );

  // Host (.content-area) varsa portal → fixed inset:0 tüm viewport'u kaplar (bar arkası dahil).
  return host ? createPortal(scene, host) : scene;
}
