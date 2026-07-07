import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion as Motion } from 'framer-motion';
import {
  Bell, Award, Trophy, Flame, Target, ClipboardList, ClipboardCheck, CheckCircle2,
  AlertTriangle, BookOpen, Star, TrendingUp, Sparkles, MessageSquare, Crosshair,
  RotateCcw, Megaphone, Zap, Snowflake, GraduationCap, CheckCheck,
} from 'lucide-react';
import { auth } from '../firebase';
import {
  subscribeNotifications, subscribeUnreadCount, markRead, markAllRead, resolveNotificationRoute,
} from '../services/notificationsApi';
import './NotificationBell.css';

// Backend'in yazdığı lucide adı (string) → component. Bilinmeyen → Bell.
const ICONS = {
  Bell, Award, Trophy, Flame, Target, ClipboardList, ClipboardCheck, CheckCircle2,
  AlertTriangle, BookOpen, Star, TrendingUp, Sparkles, MessageSquare, Crosshair,
  RotateCcw, Megaphone, Zap, Snowflake, GraduationCap,
};

// tone → tasarım token sınıfı (ikon kabı)
const TONE = {
  accent: 'notif-ico--accent',
  success: 'notif-ico--success',
  warning: 'notif-ico--warning',
  danger: 'notif-ico--danger',
};

function timeAgo(ms) {
  if (!ms) return '';
  const diff = Date.now() - ms;
  if (diff < 60000) return 'şimdi';
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `${mins} dk önce`;
  const hours = Math.round(diff / 3600000);
  if (hours < 24) return `${hours} sa önce`;
  const days = Math.round(diff / 86400000);
  if (days < 7) return `${days} gün önce`;
  const weeks = Math.round(days / 7);
  return `${weeks} hf önce`;
}

export default function NotificationBell({ isStudent = true }) {
  const navigate = useNavigate();
  const uid = auth.currentUser?.uid;
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const wrapRef = useRef(null);

  // Okunmamış sayacı — her zaman dinle (panel kapalıyken de rozet güncel)
  useEffect(() => {
    if (!uid) return undefined;
    return subscribeUnreadCount(uid, setUnread);
  }, [uid]);

  // Liste — yalnız panel açıkken dinle (gereksiz okuma yok)
  useEffect(() => {
    if (!uid || !open) return undefined;
    return subscribeNotifications(uid, setItems);
  }, [uid, open]);

  // Dışarı tık + Esc ile kapat
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const handleItemClick = (n) => {
    if (!n.readAtMs && uid) markRead(uid, n.id).catch(() => {});
    setOpen(false);
    const route = resolveNotificationRoute(n, { isStudent });
    if (route) navigate(route);
  };

  const handleMarkAll = () => {
    if (uid) markAllRead(uid, items).catch(() => {});
  };

  const badge = unread > 0 ? (unread > 99 ? '99+' : String(unread)) : null;

  return (
    <div className="notif-wrap" ref={wrapRef}>
      <button
        type="button"
        className="topnav-icon-btn"
        onClick={() => setOpen((o) => !o)}
        aria-label={badge ? `Bildirimler (${unread} okunmamış)` : 'Bildirimler'}
        aria-expanded={open}
      >
        <Bell size={18} aria-hidden="true" />
        {badge && <span className="notif-badge">{badge}</span>}
      </button>

      <AnimatePresence>
        {open && (
          <Motion.div
            className="notif-panel"
            role="menu"
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="notif-head">
              <h3 className="notif-title"><Bell size={15} /> Bildirimler</h3>
              {items.some((n) => !n.readAtMs) && (
                <button type="button" onClick={handleMarkAll} className="notif-markall">
                  <CheckCheck size={13} /> Tümünü okundu işaretle
                </button>
              )}
            </div>

            <div className="notif-list">
              {items.length === 0 ? (
                <div className="notif-empty">
                  <Bell size={26} />
                  Henüz bildirim yok.
                </div>
              ) : (
                items.map((n) => {
                  const Icon = ICONS[n.icon] || Bell;
                  const isUnread = !n.readAtMs;
                  return (
                    <button
                      key={n.id}
                      type="button"
                      role="menuitem"
                      onClick={() => handleItemClick(n)}
                      className={`notif-item ${isUnread ? 'is-unread' : ''}`}
                    >
                      <span className={`notif-ico ${TONE[n.tone] || TONE.accent}`}>
                        <Icon size={16} />
                      </span>
                      <span className="notif-body">
                        <span className="notif-row">
                          {isUnread && <span className="notif-dot" aria-hidden="true" />}
                          <span className="notif-item-title">{n.title}</span>
                        </span>
                        {n.body && <span className="notif-item-body">{n.body}</span>}
                        <span className="notif-time">{timeAgo(n.createdAtMs)}</span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </Motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
