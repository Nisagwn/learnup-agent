// claimQuestReward — tamamlanmış günlük görevin XP ödülünü verir.
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
    const { questId } = await req.json().catch(() => ({}));
    if (!questId) return json({ error: 'questId gerekli.' }, 400);

    const today = todayISO();
    const weekId = getWeekId();
    const { data: profile } = await admin.from('profiles').select('*').eq('id', userId).single();
    const userData: any = profile || {};
    const g = ensureGamification(userData.gamification, today, weekId);

    const quest = g.dailyQuests.quests.find((q: any) => q.id === questId);
    if (!quest) return json({ error: 'Görev bulunamadı.' }, 404);
    if (quest.claimed) return json({ error: 'Ödül zaten alındı.' }, 400);
    if (quest.progress < quest.target) return json({ error: 'Görev tamamlanmadı.' }, 400);

    quest.claimed = true;
    g.xp = (g.xp || 0) + quest.rewardXP;
    g.league.weeklyXP = (g.league.weeklyXP || 0) + quest.rewardXP;

    await admin.from('profiles').update({ gamification: g }).eq('id', userId);
    if (isStudent(userData)) {
      await admin.from('league_entries').upsert({
        week_id: weekId, uid: userId, name: displayName(userData),
        tier: g.league.tier, weekly_xp: g.league.weeklyXP, role: 'student',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'week_id,uid' });
    }
    return json({ success: true, rewardXP: quest.rewardXP, totalXp: g.xp, league: { tier: g.league.tier, weeklyXP: g.league.weeklyXP } });
  } catch (err: any) {
    return json({ error: err?.message || 'Sunucu hatası.' }, 500);
  }
});
