// Merkezi kutlama yardımcısı — doğru ses + konfeti varyantını birlikte tetikler.
// prefers-reduced-motion açıksa konfeti atlanır (ses kalır).
import confetti from 'canvas-confetti';
import { playSound } from './sound';

const NEON = ['#8B5CF6', '#06B6D4', '#10B981', '#EC4899'];

function reducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
}

function burst(opts) {
  if (reducedMotion()) return;
  try {
    confetti({ colors: NEON, ...opts });
  } catch {
    /* canvas-confetti yüklenemedi */
  }
}

/**
 * @param {'correct'|'wrong'|'milestone'|'levelup'|'quest'|'badge'|'league'|'session'} type
 * @param {{ confetti?: boolean }} [opts] - confetti:false → yalnız ses (yanlış cevapta
 *   kazanılan görev/rozet için konfeti patlatmamak üzere; bildirim toast'u yine gösterilir).
 */
export function celebrate(type, { confetti: withConfetti = true } = {}) {
  const pop = (o) => { if (withConfetti) burst(o); };
  switch (type) {
    case 'correct':
      playSound('correct');
      pop({ particleCount: 60, spread: 70, origin: { y: 0.7 } });
      break;
    case 'wrong':
      playSound('wrong');
      break;
    case 'milestone':
      playSound('streak');
      pop({ particleCount: 160, spread: 110, origin: { y: 0.6 } });
      break;
    case 'levelup':
      playSound('levelup');
      pop({ particleCount: 140, spread: 100 });
      break;
    case 'quest':
      playSound('quest');
      pop({ particleCount: 50, spread: 60, scalar: 0.85, origin: { y: 0.7 } });
      break;
    case 'badge':
      playSound('levelup');
      pop({ particleCount: 120, spread: 90 });
      break;
    case 'league':
      playSound('league');
      pop({ particleCount: 120, spread: 100 });
      break;
    case 'session':
      playSound('levelup');
      pop({ particleCount: 100, spread: 90, origin: { y: 0.5 } });
      break;
    default:
      break;
  }
}
