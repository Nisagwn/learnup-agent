import React, { useEffect, useState } from 'react';
import { Megaphone } from 'lucide-react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useUserStats } from '../contexts/UserStatsContext';
import { toDate, formatDate } from '../utils/formatDate';
import EmptyState from './ui/EmptyState';

// Öğrencinin kendi öğretmeninin yayınladığı duyuruları gösterir (tek yönlü).
export default function AnnouncementsPanel() {
  const { userProfile } = useUserStats();
  const teacherId = userProfile?.teacherId;
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!teacherId) return;
    const qA = query(collection(db, 'announcements'), where('teacherId', '==', teacherId));
    const unsub = onSnapshot(
      qA,
      (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (toDate(b.createdAt) || 0) - (toDate(a.createdAt) || 0));
        setItems(list);
      },
      (err) => console.warn('Duyurular yüklenemedi:', err)
    );
    return () => unsub();
  }, [teacherId]);

  // Sınıfa katılmamış öğrenciye panel gösterilmez
  if (!teacherId) return null;

  return (
    <section className="ds-card">
      <h3 className="flex items-center gap-2 font-bold text-white mb-3">
        <Megaphone size={18} className="text-indigo-400" /> Sınıf Duyuruları
      </h3>
      {items.length === 0 ? (
        <EmptyState
          className="!py-6"
          icon={Megaphone}
          title="Duyuru yok"
          description="Öğretmenin henüz bir duyuru yayınlamadı."
        />
      ) : (
        <div className="flex flex-col gap-3 max-h-72 overflow-y-auto pr-1">
          {items.map(a => (
            <div key={a.id} className="p-3 bg-white/5 border border-white/5 rounded-xl">
              <div className="flex justify-between items-start gap-2">
                <h4 className="text-sm font-semibold text-white">{a.title}</h4>
                <span className="text-[11px] text-slate-500 whitespace-nowrap">
                  {formatDate(a.createdAt)}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 whitespace-pre-line">{a.body}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
