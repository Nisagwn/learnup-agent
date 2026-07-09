// ============================================================
// Bahçe backend erişimi — paylaşılan Edge Functions (web yalnız ÇAĞIRIR).
// Realtime: garden, inventory tabloları (user_id) ve profiles.gamification.coins.
// Mutasyonlar Edge Functions: purchase-garden-item / plant-seed / move-plant / remove-plant.
// ============================================================
import { supabase } from '../../supabase';
import { legacyRowColToXY, PLANT_SCALE_DEFAULT } from './gardenLogic';

const toMs = (ts) => {
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.toDate === 'function') return ts.toDate().getTime();
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === 'number') return ts;
  const p = new Date(ts).getTime();
  return Number.isNaN(p) ? 0 : p;
};

async function invokeFn(fn, body = {}) {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) throw new Error(error.message || 'İstek başarısız');
  return data;
}

// Bir garden satırını app'in beklediği şekle çevir.
function mapPlantRow(r) {
  let { x, y } = r;
  if (x == null || y == null) {
    const xy = legacyRowColToXY(r.row, r.col);
    x = x == null ? xy.x : x;
    y = y == null ? xy.y : y;
  }
  return {
    plantId: r.id,
    itemId: r.item_id || null,
    x, y,
    stage: r.stage || 'seed',
    plantedAt: toMs(r.planted_at),
    lastWateredAt: toMs(r.last_watered_at),
    status: r.status || 'healthy',
    scale: typeof r.scale === 'number' ? r.scale : PLANT_SCALE_DEFAULT,
  };
}

// ── Realtime listeners ──

// garden — bitkiler (planted_at asc). x/y yoksa legacy row/col'dan türet.
export function subscribeGardenPlants(uid, cb, onError) {
  if (!uid) { cb([]); return () => {}; }
  const load = async () => {
    const { data, error } = await supabase
      .from('garden')
      .select('*')
      .eq('user_id', uid)
      .order('planted_at', { ascending: true });
    if (error) { console.warn('garden plants yüklenemedi:', error); onError?.(error); return; }
    cb((data || []).map(mapPlantRow));
  };
  load();
  const ch = supabase
    .channel(`garden-${uid}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'garden', filter: `user_id=eq.${uid}` }, () => { load(); })
    .subscribe();
  return () => supabase.removeChannel(ch);
}

// inventory — [{itemId, kind, count}]
export function subscribeInventory(uid, cb, onError) {
  if (!uid) { cb([]); return () => {}; }
  const load = async () => {
    const { data, error } = await supabase
      .from('inventory')
      .select('*')
      .eq('user_id', uid);
    if (error) { console.warn('inventory yüklenemedi:', error); onError?.(error); return; }
    cb((data || [])
      .map((r) => ({ itemId: r.item_id, kind: r.kind || 'seed', count: Number(r.count) || 0 }))
      .filter((i) => i.count > 0));
  };
  load();
  const ch = supabase
    .channel(`inventory-${uid}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory', filter: `user_id=eq.${uid}` }, () => { load(); })
    .subscribe();
  return () => supabase.removeChannel(ch);
}

// profiles.gamification.coins — canlı bakiye
export function subscribeCoins(uid, cb, onError) {
  if (!uid) { cb(0); return () => {}; }
  const load = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('gamification')
      .eq('id', uid)
      .single();
    if (error) { console.warn('coins yüklenemedi:', error); onError?.(error); return; }
    cb(data?.gamification?.coins ?? 0);
  };
  load();
  const ch = supabase
    .channel(`coins-${uid}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${uid}` }, (payload) => {
      cb(payload.new?.gamification?.coins ?? 0);
    })
    .subscribe();
  return () => supabase.removeChannel(ch);
}

// ── Mutasyonlar (Edge Functions) ──
export async function purchaseItem(itemId) {
  const data = await invokeFn('purchase-garden-item', { itemId });
  return { coins: data.coins, itemId: data.itemId ?? itemId, newCount: data.newCount };
}

export async function plantSeed({ itemId, x, y }) {
  const data = await invokeFn('plant-seed', { itemId, x, y });
  return { plantId: data.plantId || data.id || null };
}

export async function movePlant({ plantId, x, y, scale }) {
  const body = { plantId, x, y };
  if (typeof scale === 'number') body.scale = scale;
  await invokeFn('move-plant', body);
  return { success: true };
}

export async function removePlant(plantId) {
  const data = await invokeFn('remove-plant', { plantId });
  return { returnedItemId: data.returnedItemId ?? null, newCount: data.newCount };
}
