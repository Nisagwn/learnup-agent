import type { IconName } from '../ui'

/**
 * Rozet kataloğu — sunucudaki BADGE_CATALOG (lib/gamification.ts) + bahçe kilidi
 * rozetlerinin (market-catalog unlockBadge) istemci aynası. KAZANIM sunucuda
 * değerlendirilir (evaluateBadges); burada yalnız ad/açıklama/ikon eşlenir.
 * id'ler sunucuyla birebir — ayrışırsa galeri yanlış kilit gösterir.
 */
export const ROZETLER: Array<{ id: string; ad: string; kosul: string; icon: IconName }> = [
  { id: 'streak_3', ad: '3 Gün Seri', kosul: '3 günlük seri', icon: 'flame' },
  { id: 'streak_7', ad: '7 Gün Seri', kosul: '7 günlük seri', icon: 'flame' },
  { id: 'streak_30', ad: '30 Gün Seri', kosul: '30 günlük seri', icon: 'flame' },
  { id: 'streak_100', ad: '100 Gün Seri', kosul: '100 günlük seri', icon: 'flame' },
  { id: 'solved_25', ad: 'İlk 25 Soru', kosul: '25 soru çöz', icon: 'target' },
  { id: 'solved_100', ad: '100 Soru', kosul: '100 soru çöz', icon: 'target' },
  { id: 'solved_500', ad: '500 Soru', kosul: '500 soru çöz', icon: 'trophy' },
  { id: 'level_3', ad: 'Seviye 3', kosul: 'Seviye 3\'e ulaş', icon: 'medal' },
  { id: 'level_5', ad: 'Seviye 5', kosul: 'Seviye 5\'e ulaş', icon: 'medal' },
  { id: 'level_8', ad: 'Seviye 8', kosul: 'Seviye 8\'e ulaş', icon: 'anchor' },
  { id: 'mastery_80', ad: '%80 Ustalık', kosul: 'Bir konuda %80 ustalık', icon: 'scan' },
  { id: 'mastery_100', ad: '%100 Ustalık', kosul: 'Bir konuda %100 ustalık', icon: 'sparkle' },
  { id: 'bloom_80', ad: 'Özel Ağaç', kosul: 'Bahçede özel ağaç kilidi', icon: 'sprout' },
  { id: 'phoenix', ad: 'Efsanevi Ağaç', kosul: 'Efsanevi ağaç kilidi', icon: 'gift' },
]
