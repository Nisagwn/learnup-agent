import React, { useEffect, useState } from 'react';
import { ChevronDown, Megaphone } from 'lucide-react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useUserStats } from '../../contexts/UserStatsContext';
import { toDate, formatDate } from '../../utils/formatDate';

export default function AnnouncementsAccordion() {
  const { userProfile } = useUserStats();
  const teacherId = userProfile?.teacherId;
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!teacherId) return undefined;
    const q = query(collection(db, 'announcements'), where('teacherId', '==', teacherId));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (toDate(b.createdAt) || 0) - (toDate(a.createdAt) || 0));
        setItems(list);
      },
      (err) => console.warn('Duyurular yüklenemedi:', err),
    );
    return () => unsub();
  }, [teacherId]);

  if (!teacherId) return null;

  return (
    <section className={`announce-accordion ds-card-light ${open ? 'is-open' : ''}`}>
      <button
        type="button"
        className="announce-accordion__header"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="announce-accordion__icon" aria-hidden="true">
          <Megaphone size={16} />
        </span>
        <span className="announce-accordion__title">
          Sınıf Duyuruları
        </span>
        <span className="announce-accordion__count">
          {items.length}
        </span>
        <ChevronDown
          size={18}
          aria-hidden="true"
          className={`announce-accordion__chev ${open ? 'is-open' : ''}`}
        />
      </button>

      {open && (
        <div className="announce-accordion__body">
          {items.length === 0 ? (
            <p className="announce-accordion__empty">Öğretmenin henüz bir duyuru yayınlamadı.</p>
          ) : (
            <ul className="announce-accordion__list">
              {items.map((a) => (
                <li key={a.id} className="announce-accordion__item">
                  <div className="announce-accordion__item-head">
                    <strong>{a.title}</strong>
                    <span>{formatDate(a.createdAt)}</span>
                  </div>
                  <p>{a.body}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
