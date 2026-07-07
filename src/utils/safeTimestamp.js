// Safe server timestamp helper: prefer Firestore sentinel when available,
// otherwise fall back to a numeric timestamp (ms since epoch).
import { serverTimestamp as fbServerTimestamp } from 'firebase/firestore';

export function safeServerTimestamp() {
  try {
    if (typeof fbServerTimestamp === 'function') {
      return fbServerTimestamp();
    }
  } catch (e) {
    // ignore and fall back
  }
  return Date.now();
}

export default safeServerTimestamp;
