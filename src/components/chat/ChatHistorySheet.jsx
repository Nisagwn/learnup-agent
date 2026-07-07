import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { MessageSquare, Plus, Trash2, X, Loader2 } from 'lucide-react';
import { subscribeUserChats, deleteChat } from '../../services/chatsApi';
import './ChatHistorySheet.css';

// Göreli zaman — mobil ChatHistorySheet ile BİREBİR.
function timeAgo(ms) {
  if (!ms) return '';
  const diff = Date.now() - ms;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'az önce';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} dk`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} sa`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} gün`;
  return new Date(ms).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }); // "14 Şub"
}

// "Sohbetlerim" paneli — düz liste, lastMessageAt DESC (gruplama YOK).
// Yalnız açıkken mount edilir (parent koşullu render eder) → loading ilk değer true.
export default function ChatHistorySheet({ onClose, uid, currentChatId, onSelectChat, onNewChat }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) return undefined;
    const unsub = subscribeUserChats(uid, (list) => { setItems(list); setLoading(false); });
    return () => unsub?.();
  }, [uid]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm('Bu sohbet kalıcı olarak silinecek. Emin misin?')) return;
    try { await deleteChat(uid, id); } catch (err) { console.warn('Sohbet silinemedi:', err); }
  };

  const handleNew = () => { onNewChat(); onClose(); };
  const handleSelect = (id) => { onSelectChat(id); onClose(); };

  return createPortal(
    <div className="chs-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="chs-sheet" role="dialog" aria-modal="true" aria-label="Sohbetlerim">
        {/* Başlık */}
        <div className="chs-head">
          <span className="chs-head-ico"><MessageSquare size={18} /></span>
          <div className="chs-head-meta">
            <strong>Sohbetlerim</strong>
            <span>{items.length} kayıtlı sohbet</span>
          </div>
          <button type="button" className="chs-x" onClick={onClose} aria-label="Kapat"><X size={18} /></button>
        </div>

        {/* Yeni Sohbet */}
        <button type="button" className="chs-new" onClick={handleNew}>
          <Plus size={16} /> Yeni Sohbet
        </button>

        {/* Liste / yükleniyor / boş */}
        {loading ? (
          <div className="chs-loading"><Loader2 size={22} className="animate-spin" /></div>
        ) : items.length === 0 ? (
          <div className="chs-empty">
            <MessageSquare size={30} />
            <strong>Henüz sohbet yok</strong>
            <span>"Yeni Sohbet" ile başla.</span>
          </div>
        ) : (
          <div className="chs-list">
            {items.map((it) => {
              const active = it.id === currentChatId;
              return (
                <button
                  key={it.id}
                  type="button"
                  className={`chs-item${active ? ' is-active' : ''}`}
                  onClick={() => handleSelect(it.id)}
                >
                  <div className="chs-item-main">
                    <div className="chs-item-topic">{it.topic}</div>
                    <div className="chs-item-sub">
                      {active && <span className="chs-active-badge">AKTİF</span>}
                      <span>{it.messageCount} mesaj</span>
                      {it.lastMessageAt ? <><span className="chs-dot">·</span><span>{timeAgo(it.lastMessageAt)}</span></> : null}
                    </div>
                  </div>
                  <span className="chs-trash" role="button" tabIndex={-1} aria-label="Sohbeti sil" onClick={(e) => handleDelete(e, it.id)}>
                    <Trash2 size={16} />
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
