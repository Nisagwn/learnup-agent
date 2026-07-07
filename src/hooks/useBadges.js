import { useMemo } from 'react';
import { useUserStats } from '../contexts/UserStatsContext';
import { BADGE_CATALOG, TOTAL_BADGES, normalizeUnlockedMap } from '../utils/badges';

/**
 * Rozet gösterimi — yalnızca okuma.
 * Kazanım sunucuda (recordAnswer → users/{uid}.unlockedBadges). Bu hook ham map'i
 * normalize eder (eski ID'leri yeniye çevirir) ve kazanılmış kimlikleri/zamanları döndürür.
 */
export default function useBadges() {
  const { userProfile } = useUserStats();

  const unlockedMap = useMemo(
    () => normalizeUnlockedMap(userProfile?.unlockedBadges),
    [userProfile?.unlockedBadges]
  );
  const earnedIds = useMemo(() => Object.keys(unlockedMap), [unlockedMap]);

  return {
    catalog: BADGE_CATALOG,
    unlockedMap,
    earnedIds,
    newlyUnlocked: [],
    totalEarned: earnedIds.length,
    total: TOTAL_BADGES,
  };
}
