// ─── AI Service (Backend Proxy - Supabase Edge Function) ──────────────
// frontend (Tarayıcı) AI sağlayıcısıyla (Claude Sonnet 4.6) doğrudan konuşmaz.
// Bunun yerine paylaşılan Supabase Edge Function (get-ai-response) üzerinden gidiyor.
// Bu sayede API Key güvenliği (ANTHROPIC_API_KEY) sunucu tarafında sağlanmış oluyor.
// supabase.functions.invoke kullanıcının JWT'sini otomatik ekler.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '../supabase';
import { currentUid } from '../services/authApi';

// System instruction — konuşmanın ilk bağlamını oluşturur
const SYSTEM_HISTORY = [
  {
    role: 'user',
    content: 'Sen kimsin ve nasıl yardım edeceksin?'
  },
  {
    role: 'assistant',
    content: 'Ben LearnUp AI Asistan! Türk lise öğrencilerine matematik, fizik, kimya, biyoloji, edebiyat, tarih, coğrafya ve felsefe konularında Türkçe yardım ediyorum. Adım adım açıklar, örnekler veririm. Nasıl yardımcı olabilirim?'
  }
];

/**
 * Quiz bağlamını kullanarak mesajı zenginleştirir.
 * Bu bilgi AI'ya görünür ama öğrenciye sohbet balonu olarak gösterilmez.
 * @param {string} userMessage - Öğrencinin yazdığı gerçek mesaj
 * @param {Object|null} quizContext - Aktif soru verisi
 * @returns {string} - Zenginleştirilmiş mesaj
 */
function buildContextualMessage(userMessage, quizContext) {
  if (!quizContext) return userMessage;

  const { subject, questionText } = quizContext;

  return `[BAĞLAM: Ders - ${subject || 'Genel'}. Aktif Soru: ${questionText || ''}]
Kurallar: Öğrenciye cevabı asla söyleme, ipucu vererek yönlendir.
Öğrencinin sorusu: ${userMessage}`;
}

/**
 * AI'dan bu soru için dinamik ipucu üretir.
 * @param {Object} quizContext - Aktif soru verisi
 * @returns {Promise<string>} - Üretilen ipucu metni
 */
export async function generateDynamicHint(quizContext) {
  const { subject, grade, questionText, options } = quizContext;

  const optionsText = options && options.length > 0
    ? options.map((opt, i) => `${String.fromCharCode(65 + i)}) ${opt}`).join('\n')
    : '';

  const hintPrompt = `[SİSTEM BAĞLAMI — ÖĞRENCİYE BU METNİ GÖSTERME]
Öğrenci: Türk lise, ${grade || '10'}. sınıf — ${subject || 'Genel'} dersi.
[BAĞLAM SONU]

Aşağıdaki soru için öğrenciye CEVABI VERMEDEn rehberlik eden, dolu ve açıklayıcı bir ipucu yaz.
Kurallar:
- 3-5 cümle olsun; çok kısa kesme, öğrenciyi yormadan yeterince yönlendir.
- Doğru cevabı, doğru şıkkı veya sonucu ASLA söyleme.
- Soruyu çözmek için gereken kavramı/kuralı/formülü hatırlat ve hangi adımdan başlanacağını, nasıl ilerleneceğini anlat.
- Varsa öğrencinin sık yaptığı hataya veya dikkat etmesi gereken tuzağa kısaca değin.
- Türkçe, sıcak ve anlaşılır bir dille yaz; akıcı cümleler kur.

Soru: ${questionText}
${optionsText ? `Seçenekler:\n${optionsText}` : ''}

Sadece ipucunu yaz, başka bir şey ekleme.`;

  const tempSession = new ChatSession();
  return tempSession.sendMessage(hintPrompt);
}

/**
 * Sohbet mesajlarını Supabase'e (chats tablosu) kaydeder.
 * Yeni satır oluşturur veya mevcut olanın messages jsonb dizisini günceller.
 */
export async function saveMessageToFirestore(uid, chatId, userMsg, botMsg, topic = 'Genel Sohbet') {
  if (!uid) return null;

  const newUserMsg = {
    id: userMsg.id,
    sender: userMsg.sender,
    text: userMsg.text,
    time: userMsg.time instanceof Date ? userMsg.time.toISOString() : userMsg.time
  };
  const newBotMsg = {
    id: botMsg.id,
    sender: botMsg.sender,
    text: botMsg.text,
    time: botMsg.time instanceof Date ? botMsg.time.toISOString() : botMsg.time
  };

  let finalChatId = chatId;

  if (!finalChatId) {
    // Yeni sohbet satırı oluştur
    const { data, error } = await supabase
      .from('chats')
      .insert({
        user_id: uid,
        topic,
        messages: [newUserMsg, newBotMsg],
        message_count: 2,
        last_message_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw error;
    finalChatId = data.id;
  } else {
    // arrayUnion karşılığı: mevcut jsonb diziyi oku, ekle, güncelle
    const { data: existing } = await supabase
      .from('chats')
      .select('messages')
      .eq('id', finalChatId)
      .single();
    const messages = Array.isArray(existing?.messages) ? existing.messages : [];
    messages.push(newUserMsg, newBotMsg);
    await supabase
      .from('chats')
      .update({
        messages,
        message_count: messages.length,
        last_message_at: new Date().toISOString(),
      })
      .eq('id', finalChatId);
  }

  // Profil istatistiklerinde total_chat_messages sayacını artır (read-modify-write)
  try {
    const { data: prof } = await supabase
      .from('profiles')
      .select('total_chat_messages')
      .eq('id', uid)
      .single();
    const next = (Number(prof?.total_chat_messages) || 0) + 1;
    await supabase.from('profiles').update({ total_chat_messages: next }).eq('id', uid);
  } catch (err) {
    console.warn('Could not increment total_chat_messages:', err);
  }

  return finalChatId;
}

class ChatSession {
  constructor(initialHistory = [], uid = null, chatId = null) {
    this.history = [...SYSTEM_HISTORY, ...initialHistory];
    this.uid = uid || currentUid();
    this.chatId = chatId;
    this._queue = [];
    this._inFlight = false;
  }

  async sendMessage(userMessage, quizContext = null) {
    return new Promise((resolve, reject) => {
      this._queue.push({ userMessage, quizContext, resolve, reject });
      if (!this._inFlight) this._processQueue();
    });
  }

  async _processQueue() {
    if (this._inFlight) return;
    this._inFlight = true;

    while (this._queue.length > 0) {
      const { userMessage, quizContext, resolve, reject } = this._queue.shift();
      try {
        const finalMessage = buildContextualMessage(userMessage, quizContext);
        const slicedHistory = this.history.slice(-5);

        const startTime = Date.now();
        const { data, error } = await supabase.functions.invoke('get-ai-response', {
          body: {
            history: slicedHistory,
            userMessage: finalMessage,
          },
        });

        if (error) {
          const status = error?.context?.status;
          if (status === 429) {
            resolve('⏳ Şu an API limitleri dolu, 10 saniye sonra tekrar deneyin.');
            continue;
          }
          const errMsg = error?.context?.error || error?.message || 'Bilinmeyen hata';
          throw new Error(`[${status || 'ERR'}] ${errMsg}`);
        }

        const replyText = data?.reply || '(Boş yanıt)';

        // Geçmişi güncelle
        const userMsgObj = { id: Date.now() - 1000, sender: 'user', text: userMessage, time: new Date() };
        const botMsgObj = { id: Date.now(), sender: 'bot', text: replyText, time: new Date() };

        this.history.push({ role: 'user', content: userMessage });
        this.history.push({ role: 'assistant', content: replyText });

        // Firestore'a kaydet
        if (this.uid) {
          const topic = quizContext ? `Quiz Koçu - ${quizContext.subject}` : 'Genel Sohbet';
          saveMessageToFirestore(this.uid, this.chatId, userMsgObj, botMsgObj, topic)
            .then(newId => {
              if (newId) this.chatId = newId;
            })
            .catch(err => console.error('Error saving chat message to Firestore:', err));
        }

        const duration = Date.now() - startTime;
        const minDuration = 450;
        if (duration < minDuration) {
          await new Promise(resolveDelay => setTimeout(resolveDelay, minDuration - duration));
        }

        resolve(replyText);
      } catch (error) {
        console.error('Backend Proxy Çağrı Hatası:', error);
        reject(error);
      }
    }

    this._inFlight = false;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// GEÇİCİ (kullanıcı isteğiyle): onay kuyruğundaki ETİKETSİZ sorulara hızlı
// AI konu önerisi. getAIResponse'u tek-atış kullanır; sohbet geçmişine YAZMAZ.
// Kaldırmak için: bu fonksiyonu + QuestionPool'daki "AI ile Etiketle" butonunu sil.
// ─────────────────────────────────────────────────────────────────────────
export async function suggestTopicForQuestion({ text, subject, grade }) {
  const prompt = `Aşağıdaki ${grade || '10'}. sınıf ${subject || ''} çoktan seçmeli sorusunun Türk müfredatındaki KONU başlığını belirle.
SADECE konu adını yaz (2-5 kelime, Türkçe). Açıklama, tırnak veya noktalama ekleme.
Soru: ${String(text || '').slice(0, 600)}`;
  const { data, error } = await supabase.functions.invoke('get-ai-response', {
    body: { history: [], userMessage: prompt },
  });
  if (error) throw new Error('Konu önerilemedi');
  let topic = String(data?.reply || '').trim();
  // İlk satır + baştaki/sondaki tırnak-nokta temizliği + makul uzunluk
  topic = topic.split('\n')[0].replace(/^["'“”\s.]+|["'“”\s.]+$/g, '').slice(0, 60).trim();
  if (!topic || /^\W*$/.test(topic)) throw new Error('AI geçerli bir konu döndürmedi.');
  return topic;
}

export function createChatSession(history = [], uid = null, chatId = null) {
  return new ChatSession(history, uid, chatId);
}

export async function sendMessage(chatSession, userMessage, quizContext = null) {
  return chatSession.sendMessage(userMessage, quizContext);
}
