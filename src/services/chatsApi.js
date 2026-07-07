// Sohbet geçmişi — users/{uid}/chats (SALT OKUMA + sil). Mobil ChatHistorySheet ile birebir.
import { db } from '../firebase';
import { collection, query, orderBy, onSnapshot, doc, deleteDoc } from 'firebase/firestore';

const ms = (v) => {
  if (!v) return 0;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.toDate === 'function') return v.toDate().getTime();
  if (v instanceof Date) return v.getTime();
  const p = new Date(v).getTime();
  return Number.isNaN(p) ? 0 : p;
};

// Quiz içi AI asistanı (yanlış soruda yardım) sohbetleri "Quiz Koçu - {ders}" topic'iyle
// kaydedilir; bunlar "Sohbetlerim"de LİSTELENMEZ — yalnız gerçek sohbet konuşmaları.
const isQuizCoach = (topic) => String(topic || '').trim().toLowerCase().startsWith('quiz koçu');

// users/{uid}/chats, lastMessageAt DESC → [{ id, topic, lastMessageAt(ms), messageCount }]
// Liste zaten desc gelir; tüketici ekstra sıralama/gruplama yapmaz.
export function subscribeUserChats(uid, cb, onError) {
  if (!uid) { cb([]); return () => {}; }
  const qy = query(collection(db, `users/${uid}/chats`), orderBy('lastMessageAt', 'desc'));
  return onSnapshot(
    qy,
    (snap) => cb(
      snap.docs
        .map((d) => {
          const x = d.data();
          return {
            id: d.id,
            topic: x.topic || 'Genel Sohbet',
            lastMessageAt: ms(x.lastMessageAt),
            messageCount: Array.isArray(x.messages) ? x.messages.length : (x.messageCount || 0),
          };
        })
        .filter((c) => !isQuizCoach(c.topic)) // Quiz koçu sohbetlerini gizle
    ),
    (e) => { console.warn('Sohbetler yüklenemedi:', e); onError?.(e); cb([]); },
  );
}

// users/{uid}/chats/{chatId} dokümanını sil.
export function deleteChat(uid, chatId) {
  if (!uid || !chatId) return Promise.resolve();
  return deleteDoc(doc(db, `users/${uid}/chats`, chatId));
}
