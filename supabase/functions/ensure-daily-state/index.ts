// ensureDailyState — açılışta çağrılır: bugünün görevleri + haftanın lig kaydı.
import { preflight, json, getAdmin, resolveUserId } from '../_shared/http.ts';
import { todayISO, getWeekId, ensureGamification, displayName, isStudent } from '../_shared/logic.ts';

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);
  try {
    const admin = getAdmin();
    const userId = await resolveUserId(req, admin);
    if (!userId) return json({ error: 'userId gerekli.' }, 401);

    const today = todayISO();
    const weekId = getWeekId();
    const { data: profile } = await admin.from('profiles').select('*').eq('id', userId).single();
    const userData: any = profile || {};
    const g = ensureGamification(userData.gamification, today, weekId);

    await admin.from('profiles').update({ gamification: g }).eq('id', userId);
    if (isStudent(userData)) {
      await admin.from('league_entries').upsert({
        week_id: weekId, uid: userId, name: displayName(userData),
        tier: g.league.tier, weekly_xp: g.league.weeklyXP, role: 'student',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'week_id,uid' });
    }
    return json({ success: true, gamification: g, weekId });
  } catch (err: any) {
    return json({ error: err?.message || 'Sunucu hatası.' }, 500);
  }
});
