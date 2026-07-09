// Sohbet geçmişi — chats tablosu (SALT OKUMA + sil). Mobil ChatHistorySheet ile birebir.
import { supabase } from '../supabase';

const ms = (v) => {
  if (!v) return 0;
  if (v instanceof Date) return v.getTime();
  const p = new Date(v).getTime();
  return Number.isNaN(p) ? 0 : p;
};

// Quiz içi AI asistanı (yanlış soruda yardım) sohbetleri "Quiz Koçu - {ders}" topic'iyle
// kaydedilir; bunlar "Sohbetlerim"de LİSTELENMEZ — yalnız gerçek sohbet konuşmaları.
const isQuizCoach = (topic) => String(topic || '').trim().toLowerCase().startsWith('quiz koçu');

// chats (user_id=uid), last_message_at DESC → [{ id, topic, lastMessageAt(ms), messageCount }]
// Realtime kanal + ilk yükleme için tek seferlik select; her değişimde yeniden yükler.
export function subscribeUserChats(uid, cb, onError) {
  if (!uid) { cb([]); return () => {}; }

  const mapRows = (rows) => (rows || [])
    .map((x) => ({
      id: x.id,
      topic: x.topic || 'Genel Sohbet',
      lastMessageAt: ms(x.last_message_at),
      messageCount: Array.isArray(x.messages) ? x.messages.length : (x.message_count || 0),
    }))
    .sort((a, b) => b.lastMessageAt - a.lastMessageAt)
    .filter((c) => !isQuizCoach(c.topic)); // Quiz koçu sohbetlerini gizle

  const load = async () => {
    const { data, error } = await supabase
      .from('chats')
      .select('*')
      .eq('user_id', uid)
      .order('last_message_at', { ascending: false });
    if (error) { console.warn('Sohbetler yüklenemedi:', error); onError?.(error); cb([]); return; }
    cb(mapRows(data));
  };

  // İlk veri
  load();

  // Realtime: chats satırlarındaki değişimlerde listeyi tazele
  const ch = supabase
    .channel(`chats:${uid}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'chats', filter: `user_id=eq.${uid}` }, () => { load(); })
    .subscribe();

  return () => supabase.removeChannel(ch);
}

// chats/{chatId} satırını sil.
export function deleteChat(uid, chatId) {
  if (!uid || !chatId) return Promise.resolve();
  return supabase.from('chats').delete().eq('id', chatId);
}
