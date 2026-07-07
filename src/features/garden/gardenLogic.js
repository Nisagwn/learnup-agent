// ============================================================
// Bahçe/Orman — saf mantık + sabitler (Firebase/React importu YOK)
// Mobil sözleşmeyle birebir: sabitler, stage oranları, clamp, findFreePosition.
// ============================================================

// ── Sabitler (birebir) ──
export const CANVAS_PADDING = 24;
export const DEFAULT_SIZE = 60;            // bitki render boyutu (px, merkez anchor)
export const PLANT_SCALE_MIN = 0.4;
export const PLANT_SCALE_MAX = 1.6;
export const PLANT_SCALE_DEFAULT = 1.0;
export const TRASH_SIZE = 76;
export const TRASH_LEFT = 18;
export const TAB_BAR_HEIGHT = 70;
export const TRASH_BOTTOM_OFFSET = 24;
export const GHOST_SIZE = 72;
export const GHOST_IMG = 64;

// Büyüme: evre eşik oranları (elapsed / growth)
export const STAGE_RATIO = { sprout: 0.17, young: 0.50, mature: 1.0 };
// Render ölçeği (PNG boyutu = DEFAULT_SIZE * bu)
export const STAGE_RENDER_SCALE = { seed: 0.35, sprout: 0.55, young: 0.78, mature: 1.0 };

export const STAGE_ORDER = ['seed', 'sprout', 'young', 'mature'];
export const STAGE_LABEL_TR = { seed: 'Tohum', sprout: 'Filiz', young: 'Genç', mature: 'Olgun' };

// Gölge elipsi (DEFAULT_SIZE bazlı)
export const SHADOW = { rx: DEFAULT_SIZE * 0.32, ry: DEFAULT_SIZE * 0.07, cyOffset: DEFAULT_SIZE * 0.36 };

// Etkileşim eşikleri
export const TAP_MAX_MS = 220;
export const LONGPRESS_MS = 220;
export const DRAG_SCALE = 1.18;
export const MIN_DIST = 40;
export const SPIRAL_RADII = [40, 64, 92, 120];

export const RARITY_TONE = {
  common: { fg: '#16A34A', soft: '#DCFCE7', label: 'Yaygın' },
  uncommon: { fg: '#22D3EE', soft: '#CFFAFE', label: 'Sıra Dışı' },
  rare: { fg: '#84CC16', soft: '#EDE9FE', label: 'Nadir' },
  epic: { fg: '#FB923C', soft: '#FCE7F3', label: 'Epik' },
  legendary: { fg: '#FBBF24', soft: '#FEF3C7', label: 'Efsane' },
};

// Legacy satır/sütun → canvas px (merkez)
export function legacyRowColToXY(row, col) {
  return { x: (Number(col) || 0) * 60 + 30, y: (Number(row) || 0) * 60 + 30 };
}

// ── Büyüme / evre ──
// eternal/mature item → her zaman 'mature'. Aksi halde oranla evre hesapla.
export function computeStage(plant, now, growthSeconds, eternal = false) {
  if (eternal || plant?.form === 'mature') return 'mature';
  if (!growthSeconds || !plant?.plantedAt) return plant?.stage || 'seed';
  const ratio = (now - plant.plantedAt) / (growthSeconds * 1000);
  if (ratio < STAGE_RATIO.sprout) return 'seed';
  if (ratio < STAGE_RATIO.young) return 'sprout';
  if (ratio < STAGE_RATIO.mature) return 'young';
  return 'mature';
}

// ms → "3g 5s" / "5s 20d" / "45 dk"
export function formatRemaining(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const mins = Math.floor((total % 3600) / 60);
  if (days > 0) return `${days}g ${hours}s`;
  if (hours > 0) return `${hours}s ${mins}d`;
  return `${Math.max(1, mins)} dk`;
}

// Bir sonraki evre + kalan süre → { stage, label, remainingMs } | null (olgunsa)
export function nextStageETA(plant, now, growthSeconds, eternal = false) {
  if (eternal || !growthSeconds || !plant?.plantedAt) return null;
  const elapsed = now - plant.plantedAt;
  const full = growthSeconds * 1000;
  const ratio = elapsed / full;
  let nextStage = null;
  let threshold = 0;
  if (ratio < STAGE_RATIO.sprout) { nextStage = 'sprout'; threshold = STAGE_RATIO.sprout; }
  else if (ratio < STAGE_RATIO.young) { nextStage = 'young'; threshold = STAGE_RATIO.young; }
  else if (ratio < STAGE_RATIO.mature) { nextStage = 'mature'; threshold = STAGE_RATIO.mature; }
  else return null;
  return { stage: nextStage, label: STAGE_LABEL_TR[nextStage], remainingMs: Math.max(0, threshold * full - elapsed) };
}

// PlantActionSheet/tooltip metni: "Filiz → 3g 5s" | "Olgun"
export function plantTooltipETA(plant, now, growthSeconds, eternal = false) {
  const eta = nextStageETA(plant, now, growthSeconds, eternal);
  if (!eta) return 'Olgun';
  return `${eta.label} → ${formatRemaining(eta.remainingMs)}`;
}

// ── Konumlandırma ──
export function clampPosition(x, y, w, h, pad = CANVAS_PADDING) {
  return {
    x: Math.min(Math.max(x, pad), Math.max(pad, w - pad)),
    y: Math.min(Math.max(y, pad), Math.max(pad, h - pad)),
  };
}

const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

// İstenen noktaya minDist'ten yakın komşu varsa spiral tarayıp boş nokta bul.
export function findFreePosition(plants, x, y, w, h, minDist = MIN_DIST, ignoreId = null) {
  const others = (plants || []).filter((p) => p.plantId !== ignoreId);
  const isFree = (px, py) => others.every((p) => dist(px, py, p.x, p.y) >= minDist);
  const base = clampPosition(x, y, w, h);
  if (isFree(base.x, base.y)) return base;
  for (const r of SPIRAL_RADII) {
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2;
      const c = clampPosition(x + r * Math.cos(ang), y + r * Math.sin(ang), w, h);
      if (isFree(c.x, c.y)) return c;
    }
  }
  return base; // hepsi dolu → en azından clamp'li nokta
}

export function clampScale(s) {
  const n = Number(s);
  if (Number.isNaN(n)) return PLANT_SCALE_DEFAULT;
  return Math.min(Math.max(n, PLANT_SCALE_MIN), PLANT_SCALE_MAX);
}
