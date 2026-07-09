import { useState, useEffect, useMemo, useCallback } from 'react';
import { currentUid } from '../services/authApi';

// Learn feed kartlarının "dismiss" durumunu localStorage'da 24sa TTL ile tutar.
// activeIds = şu an gizli (dismiss edilmiş, süresi dolmamış) kart id'leri.
const DAY = 24 * 3600e3;
const keyFor = (uid) => `learn_feed_dismissed:${uid || 'anon'}`;

const readRaw = (uid) => {
  try {
    const raw = localStorage.getItem(keyFor(uid));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
};

const writeRaw = (uid, arr) => {
  try { localStorage.setItem(keyFor(uid), JSON.stringify(arr)); } catch { /* yoksay */ }
};

export default function useFeedDismiss() {
  const uid = currentUid();
  const [version, setVersion] = useState(0); // değişiklikte activeIds'i yeniden türetir

  // Mount/uid değişiminde expired olanları storage'dan temizle (setState YOK → effect güvenli)
  useEffect(() => {
    const now = Date.now();
    const all = readRaw(uid);
    const fresh = all.filter((e) => e && e.expiresAt > now);
    if (fresh.length !== all.length) writeRaw(uid, fresh);
  }, [uid]);

  // activeIds her zaman taze: süresi dolmuşları memo'da da ele
  const activeIds = useMemo(() => {
    const now = Date.now();
    return readRaw(uid).filter((e) => e && e.expiresAt > now).map((e) => e.id);
    // version: dismiss/reset sonrası yeniden hesaplama tetikler
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, version]);

  const dismiss = useCallback((id) => {
    if (!id) return;
    const now = Date.now();
    const next = readRaw(uid).filter((e) => e.id !== id && e.expiresAt > now);
    next.push({ id, expiresAt: now + DAY });
    writeRaw(uid, next);
    setVersion((v) => v + 1);
  }, [uid]);

  const reset = useCallback(() => {
    writeRaw(uid, []);
    setVersion((v) => v + 1);
  }, [uid]);

  return { activeIds, dismiss, reset, loaded: true };
}
