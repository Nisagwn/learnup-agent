// ============================================================
// Bahçe backend erişimi — paylaşılan Cloud Functions (web yalnız ÇAĞIRIR).
// Realtime: users/{uid}/garden, /inventory, ve users/{uid}.gamification.coins.
// Mutasyonlar DEPLOYED CF: purchaseGardenItem / plantSeed / movePlant / removePlant.
// ============================================================
import { auth, db } from '../../firebase';
import { collection, query, orderBy, onSnapshot, doc } from 'firebase/firestore';
import { legacyRowColToXY, PLANT_SCALE_DEFAULT } from './gardenLogic';

const IS_DEV = import.meta.env.DEV;
const FIREBASE_PROJECT_ID = 'learnup-3cdb7';
const BACKEND_BASE =
  import.meta.env.VITE_BACKEND_BASE_URL ||
  (IS_DEV
    ? `http://127.0.0.1:5001/${FIREBASE_PROJECT_ID}/us-central1`
    : `https://us-central1-${FIREBASE_PROJECT_ID}.cloudfunctions.net`);

const toMs = (ts) => {
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.toDate === 'function') return ts.toDate().getTime();
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === 'number') return ts;
  const p = new Date(ts).getTime();
  return Number.isNaN(p) ? 0 : p;
};

async function postJson(path, body) {
  const user = auth.currentUser;
  const headers = { 'Content-Type': 'application/json' };
  try {
    const token = await user?.getIdToken?.();
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch { /* token yoksa userId gövdede */ }
  const res = await fetch(`${BACKEND_BASE.replace(/\/$/, '')}/${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ userId: user?.uid, ...body }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 404) {
      throw new Error('Bu özellik için backend fonksiyonu henüz yayında değil (mobil repodan deploy gerekiyor).');
    }
    throw new Error(data.error || data.message || `İstek başarısız (${res.status})`);
  }
  return res.json();
}

// ── Realtime listeners ──

// users/{uid}/garden — bitkiler (plantedAt asc). x/y yoksa legacy row/col'dan türet.
export function subscribeGardenPlants(uid, cb, onError) {
  if (!uid) { cb([]); return () => {}; }
  const qG = query(collection(db, 'users', uid, 'garden'), orderBy('plantedAt', 'asc'));
  return onSnapshot(
    qG,
    (snap) => {
      const list = snap.docs.map((d) => {
        const data = d.data() || {};
        let { x, y } = data;
        if (x == null || y == null) {
          const xy = legacyRowColToXY(data.row, data.col);
          x = x == null ? xy.x : x;
          y = y == null ? xy.y : y;
        }
        return {
          plantId: d.id,
          itemId: data.itemId || null,
          x, y,
          stage: data.stage || 'seed',
          plantedAt: toMs(data.plantedAt),
          lastWateredAt: toMs(data.lastWateredAt),
          status: data.status || 'healthy',
          scale: typeof data.scale === 'number' ? data.scale : PLANT_SCALE_DEFAULT,
        };
      });
      cb(list);
    },
    (err) => { console.warn('garden plants yüklenemedi:', err); onError?.(err); }
  );
}

// users/{uid}/inventory — [{itemId, kind, count}]
export function subscribeInventory(uid, cb, onError) {
  if (!uid) { cb([]); return () => {}; }
  return onSnapshot(
    collection(db, 'users', uid, 'inventory'),
    (snap) => cb(snap.docs.map((d) => {
      const data = d.data() || {};
      return { itemId: data.itemId || d.id, kind: data.kind || 'seed', count: Number(data.count) || 0 };
    }).filter((i) => i.count > 0)),
    (err) => { console.warn('inventory yüklenemedi:', err); onError?.(err); }
  );
}

// users/{uid}.gamification.coins — canlı bakiye
export function subscribeCoins(uid, cb, onError) {
  if (!uid) { cb(0); return () => {}; }
  return onSnapshot(
    doc(db, 'users', uid),
    (snap) => cb(snap.exists() ? (snap.data()?.gamification?.coins ?? 0) : 0),
    (err) => { console.warn('coins yüklenemedi:', err); onError?.(err); }
  );
}

// ── Mutasyonlar (deployed CF) ──
export async function purchaseItem(itemId) {
  const data = await postJson('purchaseGardenItem', { itemId });
  return { coins: data.coins, itemId: data.itemId ?? itemId, newCount: data.newCount };
}

export async function plantSeed({ itemId, x, y }) {
  const data = await postJson('plantSeed', { itemId, x, y });
  return { plantId: data.plantId || data.id || null };
}

export async function movePlant({ plantId, x, y, scale }) {
  const body = { plantId, x, y };
  if (typeof scale === 'number') body.scale = scale;
  await postJson('movePlant', body);
  return { success: true };
}

export async function removePlant(plantId) {
  const data = await postJson('removePlant', { plantId });
  return { returnedItemId: data.returnedItemId ?? null, newCount: data.newCount };
}
