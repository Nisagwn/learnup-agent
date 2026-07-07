// ─── AI Service (Backend Proxy - Firebase Cloud Functions) ──────────────
// frontend (Tarayıcı) AI sağlayıcısıyla (Claude Sonnet 4.6) doğrudan konuşmaz.
// Bunun yerine paylaşılan Firebase Cloud Function (getAIResponse) üzerinden gidiyor.
// Bu sayede API Key güvenliği (ANTHROPIC_API_KEY) Secret Manager ile sağlanmış oluyor.
// ─────────────────────────────────────────────────────────────────────────────

import { db, auth } from '../firebase';
import { doc, updateDoc, arrayUnion, serverTimestamp, increment, collection, setDoc } from 'firebase/firestore';

// Geliştirme (Local) ve Canlı (Production) URL Ayarları
const IS_DEV = import.meta.env.DEV;
const FIREBASE_PROJECT_ID = "learnup-3cdb7";

const BACKEND_BASE = import.meta.env.VITE_BACKEND_BASE_URL || (IS_DEV ? `http://127.0.0.1:5001/${FIREBASE_PROJECT_ID}/us-central1` : `https://us-central1-${FIREBASE_PROJECT_ID}.cloudfunctions.net`);
const API_URL = `${BACKEND_BASE.replace(/\/$/, '')}/getAIResponse`;

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
 * Sohbet mesajlarını Firestore'a kaydeder. Yeni doküman oluşturur veya mevcut olanı günceller.
 */
export async function saveMessageToFirestore(uid, chatId, userMsg, botMsg, topic = 'Genel Sohbet') {
  if (!uid) return null;

  let finalChatId = chatId;
  const chatsCollectionRef = collection(db, `users/${uid}/chats`);

  if (!finalChatId) {
    const newChatDoc = doc(chatsCollectionRef);
    finalChatId = newChatDoc.id;
    await setDoc(newChatDoc, {
      messages: [],
      lastMessageAt: serverTimestamp(),
      topic: topic
    });
  }

  const chatDocRef = doc(db, `users/${uid}/chats`, finalChatId);

  await updateDoc(chatDocRef, {
    messages: arrayUnion(
      {
        id: userMsg.id,
        sender: userMsg.sender,
        text: userMsg.text,
        time: userMsg.time instanceof Date ? userMsg.time.toISOString() : userMsg.time
      },
      {
        id: botMsg.id,
        sender: botMsg.sender,
        text: botMsg.text,
        time: botMsg.time instanceof Date ? botMsg.time.toISOString() : botMsg.time
      }
    ),
    lastMessageAt: serverTimestamp()
  });

  // Profil istatistiklerinde totalChatMessages sayacını artır
  const userDocRef = doc(db, 'users', uid);
  await updateDoc(userDocRef, {
    'stats.totalChatMessages': increment(1)
  }).catch(err => console.warn('Could not increment totalChatMessages:', err));

  return finalChatId;
}

class ChatSession {
  constructor(initialHistory = [], uid = null, chatId = null) {
    this.history = [...SYSTEM_HISTORY, ...initialHistory];
    this.uid = uid || auth.currentUser?.uid;
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
        const response = await fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            history: slicedHistory,
            userMessage: finalMessage,
          }),
        });

        if (!response.ok) {
          let errBody = {};
          try {
            errBody = await response.json();
          } catch (_err) {
            errBody = {};
          }
          const status = response.status;
          const errMsg = errBody?.error || response.statusText;

          if (status === 429) {
            resolve('⏳ Şu an API limitleri dolu, 10 saniye sonra tekrar deneyin.');
            continue;
          }
          throw new Error(`[${status}] ${errMsg}`);
        }

        const data = await response.json();
        const replyText = data.reply || '(Boş yanıt)';

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
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ history: [], userMessage: prompt }),
  });
  if (!res.ok) throw new Error(`Konu önerilemedi (${res.status})`);
  const data = await res.json();
  let topic = String(data.reply || '').trim();
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
