// use-streak-freeze — seri dondurması (streak freeze) elle ver/harca.
// Client: src/utils/gamificationApi.js -> requestStreakFreeze() invoke('use-streak-freeze', {}).
// Otoriter gamification yazımı (service-role). Güvenli/idempotent.
import { preflight, json, getAdmin, resolveUserId } from '../_shared/http.ts';
import { todayISO, getWeekId, ensureGamification } from '../_shared/logic.ts';

const MAX_FREEZES = 2;

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);
  try {
    const admin = getAdmin();
    const userId = await resolveUserId(req, admin);
    if (!userId) return json({ error: 'userId gerekli.' }, 401);

    const body = await req.json().catch(() => ({}));
    // consume=true ise bir dondurma harca; aksi halde bir dondurma ver (varsayılan).
    const consume = body?.consume === true || body?.action === 'consume';

    const today = todayISO();
    const weekId = getWeekId();
    const { data: profile } = await admin.from('profiles').select('*').eq('id', userId).single();
    const userData: any = profile || {};
    const g = ensureGamification(userData.gamification, today, weekId);

    const s = g.streak;
    s.freezesAvailable = Number(s.freezesAvailable) || 0;
    if (!Array.isArray(s.freezeUsedDates)) s.freezeUsedDates = [];

    let changed = false;
    if (consume) {
      // Bugün için bir dondurma harca (idempotent: aynı gün tekrar harcamaz).
      if (s.freezesAvailable > 0 && !s.freezeUsedDates.includes(today)) {
        s.freezesAvailable -= 1;
        s.freezeUsedDates.push(today);
        changed = true;
      }
    } else {
      // Elle bir dondurma ver (üst sınıra kadar).
      if (s.freezesAvailable < MAX_FREEZES) {
        s.freezesAvailable += 1;
        changed = true;
      }
    }

    if (changed) {
      g.streak = s;
      await admin.from('profiles').update({ gamification: g }).eq('id', userId);
    }

    return json({ success: true, streak: g.streak });
  } catch (err: any) {
    return json({ error: err?.message || 'Sunucu hatası.' }, 500);
  }
});
