import React, { useState } from 'react';
import { Snowflake } from 'lucide-react';
import Modal from '../ui/Modal';
import { useUserStats } from '../../contexts/UserStatsContext';
import { useToast } from '../ToastProvider';
import { requestStreakFreeze } from '../../utils/gamificationApi';
import { todayISO, formatDate } from '../../utils/formatDate';

// Seri dondurma kullanım modalı (mobildeki StreakFreezeSheet karşılığı).
// Veriyi users/{uid}.gamification.streak'ten OKUR; yazmayı backend yapar
// (requestStreakFreeze → useStreakFreeze). Tek kaynak: StreakCard + StreakTile ortak kullanır.
export default function StreakFreezeModal({ isOpen, onClose }) {
  const { gamification, stats } = useUserStats();
  const { success, error } = useToast();
  const [busy, setBusy] = useState(false);

  const streak = gamification?.streak || {};
  const count = stats?.streakDays || 0;
  const longest = Math.max(streak.longest || 0, count);
  const freezes = streak.freezesAvailable || 0;
  const usedDates = Array.isArray(streak.freezeUsedDates) ? streak.freezeUsedDates : [];
  const lastUsed = usedDates.length ? usedDates[usedDates.length - 1] : null;

  const activeToday = streak.lastActiveDate === todayISO();
  const noFreezes = freezes === 0;
  const disabled = busy || noFreezes || activeToday;
  const label = busy
    ? 'Donduruluyor…'
    : noFreezes
      ? 'Dondurma hakkın yok'
      : activeToday
        ? 'Bugün zaten aktifsin'
        : 'Bugünü Dondur';

  const handleFreeze = async () => {
    setBusy(true);
    try {
      await requestStreakFreeze();
      success('Seri Donduruldu ❄️', 'Bugün için serin korundu.');
      onClose?.();
    } catch (err) {
      error('Hata', err.message || 'Seri dondurulamadı.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      title="Seriyi Dondur"
      footer={
        <>
          <button type="button" className="ds-btn-ghost" onClick={onClose}>Vazgeç</button>
          <button
            type="button"
            className="ds-btn-primary flex items-center gap-1.5 disabled:opacity-50"
            onClick={handleFreeze}
            disabled={disabled}
          >
            <Snowflake size={15} aria-hidden="true" /> {label}
          </button>
        </>
      }
    >
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1 ds-card ds-card--compact text-center">
          <div className="text-xl font-extrabold text-white">{count}</div>
          <div className="text-[11px] text-slate-400">günlük seri</div>
        </div>
        <div className="flex-1 ds-card ds-card--compact text-center">
          <div className="text-xl font-extrabold text-white">{longest}</div>
          <div className="text-[11px] text-slate-400">en uzun</div>
        </div>
        <div className="flex-1 ds-card ds-card--compact text-center">
          <div className="text-xl font-extrabold text-sky-300 flex items-center justify-center gap-1">
            <Snowflake size={16} aria-hidden="true" />{freezes}
          </div>
          <div className="text-[11px] text-slate-400">kalan dondurma</div>
        </div>
      </div>

      <p className="text-sm text-slate-400">
        Dondurma, çalışmadığın bir günde serinin kırılmasını önler. Her 7 günlük seride +1 kazanırsın (en fazla 2).
      </p>

      {lastUsed && (
        <p className="text-[11px] text-slate-500 mt-2">Son kullanım: {formatDate(lastUsed)}</p>
      )}
    </Modal>
  );
}
