import type { IconName } from '../ui'

/**
 * Rozet kataloğu — sunucudaki BADGE_CATALOG (lib/gamification.ts) + bahçe kilidi
 * rozetlerinin (market-catalog unlockBadge) istemci aynası. KAZANIM sunucuda
 * değerlendirilir (evaluateBadges); burada yalnız ad/açıklama/ikon eşlenir.
 * id'ler sunucuyla birebir — ayrışırsa galeri yanlış kilit gösterir.
 */
export const ROZETLER: Array<{ id: string; ad: string; kosul: string; icon: IconName }> = [
  { id: 'streak_3', ad: 'Kıvılcım', kosul: '3 günlük seri', icon: 'flame' },
  { id: 'streak_7', ad: 'Fener Bekçisi', kosul: '7 günlük seri', icon: 'flame' },
  { id: 'streak_30', ad: 'Ay Işığı', kosul: '30 günlük seri', icon: 'flame' },
  { id: 'streak_100', ad: 'Deniz Kurdu', kosul: '100 günlük seri', icon: 'flame' },
  { id: 'solved_25', ad: 'İlk Sefer', kosul: '25 soru çöz', icon: 'target' },
  { id: 'solved_100', ad: 'Açık Deniz', kosul: '100 soru çöz', icon: 'target' },
  { id: 'solved_500', ad: 'Okyanus Aşan', kosul: '500 soru çöz', icon: 'trophy' },
  { id: 'level_3', ad: 'Çavuş', kosul: 'Rütbe 3', icon: 'medal' },
  { id: 'level_5', ad: 'Teğmen', kosul: 'Rütbe 5', icon: 'medal' },
  { id: 'level_8', ad: 'Kaptan', kosul: 'Rütbe 8', icon: 'anchor' },
  { id: 'mastery_80', ad: 'Usta İşi', kosul: 'Bir konuda %80 ustalık', icon: 'scan' },
  { id: 'mastery_100', ad: 'Kusursuz', kosul: 'Bir konuda %100 ustalık', icon: 'sparkle' },
  { id: 'bloom_80', ad: 'Bahçıvan', kosul: 'Bahçede özel ağaç kilidi', icon: 'sprout' },
  { id: 'phoenix', ad: 'Anka', kosul: 'Efsanevi ağaç kilidi', icon: 'gift' },
]
