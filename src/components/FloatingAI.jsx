import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Bot, X, Maximize2, Send, User, Sparkles, AlertCircle, RefreshCw, Loader2 } from 'lucide-react';
import { createChatSession, sendMessage } from '../utils/aiService';
import { startAiQuiz } from '../services/aiService';
import InlineActionMessage from './InlineActionMessage';
import { auth, db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import './FloatingAI.css';

const DEFAULT_CHIPS = [
  { label: '📚 Ders Özeti', message: 'Şu an çalıştığım konu hakkında kısa bir özet yazar mısın?' },
  { label: '💡 İpucu Ver', message: 'Bu konuda çalışırken dikkat etmem gereken en önemli ipucunu ver.' },
  { label: '🧮 Formül', message: 'Bu konunun en önemli formüllerini listeler misin?' },
  { label: '📝 Örnek Soru', message: 'Bana kısa bir örnek soru çözelim.' },
];

const QUIZ_CHIPS = [
  { label: '🤔 Bu soruyu açıkla', message: 'Bu soruyu anlamam için ne bilmem gerekiyor? Açıklar mısın?' },
  { label: '💡 İpucu ver', message: 'Bu soruyu çözmek için bana bir ipucu ver, ama cevabı söyleme.' },
  { label: '📐 Formülle göster', message: 'Bu konuyla ilgili temel formül veya kuralı gösterir misin?' },
  { label: '🔄 Konuyu özetle', message: 'Bu sorunun bağlı olduğu konuyu kısaca özetler misin?' },
];

const getTimestampMs = (value) => {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};

export default function FloatingAI({ quizContext = null, autoOpen = false, onAutoOpenHandled, onPanelToggle }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: 'bot',
      text: 'Merhaba! 👋 Herhangi bir konuda yardıma ihtiyacın varsa buradayım.',
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [quizStarting, setQuizStarting] = useState(false);

  const chatSessionRef = useRef(null);
  const messagesRef = useRef(null);
  const inputRef = useRef(null);
  const lastSentTimeRef = useRef(0);
  // FIX: Keep callback props in refs so they don't destabilize useEffect dependency arrays
  const onAutoOpenHandledRef = useRef(onAutoOpenHandled);
  const onPanelToggleRef = useRef(onPanelToggle);
  useEffect(() => { onAutoOpenHandledRef.current = onAutoOpenHandled; }, [onAutoOpenHandled]);
  useEffect(() => { onPanelToggleRef.current = onPanelToggle; }, [onPanelToggle]);
  const navigate = useNavigate();
  const location = useLocation();

  const isQuizMode = !!quizContext;
  const chips = isQuizMode ? QUIZ_CHIPS : DEFAULT_CHIPS;

  const scrollToBottom = () => {
    // Yalnizca mesaj kutusunu kaydir; scrollIntoView ust scroll
    // kapsayicilarini kaydirip layout'u kaydiriyordu.
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  useEffect(() => {
    if (isOpen) scrollToBottom();
  }, [messages, isTyping, isOpen]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 350);
    }
  }, [isOpen]);

  // Oturumu başlat (ilk açılışta ve Auth durumuna göre)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const chatsRef = collection(db, `users/${user.uid}/chats`);
          const snap = await getDocs(chatsRef);

          if (!snap.empty) {
            const latestChatDoc = [...snap.docs].sort((a, b) => {
              return getTimestampMs(b.data().lastMessageAt) - getTimestampMs(a.data().lastMessageAt);
            })[0];
            const chatData = latestChatDoc.data();
            const loadedMessages = chatData.messages || [];

            if (loadedMessages.length > 0) {
              const formattedMessages = loadedMessages.map(msg => ({
                ...msg,
                time: msg.time ? new Date(msg.time) : new Date()
              }));
              setMessages(formattedMessages);

              const history = formattedMessages.map(msg => ({
                role: msg.sender === 'user' ? 'user' : 'assistant',
                content: msg.text
              }));

              chatSessionRef.current = createChatSession(history, user.uid, latestChatDoc.id);
              return;
            }
          }
          chatSessionRef.current = createChatSession([], user.uid);
        } catch (err) {
          console.error('Sohbet geçmişi yüklenirken hata:', err);
          chatSessionRef.current = createChatSession([], user.uid);
        }
      } else {
        chatSessionRef.current = createChatSession();
      }
    });

    return () => unsubscribe();
  }, []);

  // Chatbot sayfasına gidilince panel'i kapat
  useEffect(() => {
    if (location.pathname === '/chatbot') {
      setIsOpen(false);
      setIsClosing(false);
    }
  }, [location.pathname]);

  // autoOpen tetikleyici: 2 yanlış cevap sonrası AI'yı aç ve yardım teklif et
  useEffect(() => {
    if (autoOpen && !isOpen && !hasError) {
      handleOpen();
      setTimeout(async () => {
        if (hasError) return;
        if (!chatSessionRef.current) {
          try { chatSessionRef.current = createChatSession(); } catch (_) { setHasError(true); return; }
        }
        if (hasError) return;
        const autoMsg = 'Bir ipucuna ihtiyacın var mı? 🤔 Bu soruyu birkaç kez yanlış yanıtladın. Sana yol göstermemi ister misin?';
        setMessages(prev => [...prev, { id: Date.now(), sender: 'bot', text: autoMsg }]);
        // FIX: Use ref so this effect doesn't re-run when the callback prop changes reference
        if (onAutoOpenHandledRef.current) onAutoOpenHandledRef.current();
      }, 600);
    }
  // FIX: Removed onAutoOpenHandled from deps — it's a callback prop that changes reference
  // on every parent render, causing this effect to trigger repeatedly.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen, isOpen, hasError]);

  const handleOpen = () => {
    setIsClosing(false);
    setIsOpen(true);
    if (onPanelToggle) onPanelToggle(true);
  };

  const handleClose = () => {
    setIsClosing(true);
    if (onPanelToggle) onPanelToggle(false);
    setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
    }, 220);
  };

  const handleToggle = () => {
    if (isOpen) handleClose();
    else handleOpen();
  };

  const handleExpand = () => {
    navigate('/chatbot');
  };

  const handleSend = async (text) => {
    const now = Date.now();
    if (now - lastSentTimeRef.current < 2000) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          sender: 'bot',
          text: '⏳ Çok hızlı mesaj gönderiyorsunuz. Lütfen 2 saniye bekleyin.',
        }
      ]);
      return;
    }

    const trimmed = (text || input).trim();
    if (!trimmed || isTyping) return;

    lastSentTimeRef.current = now;

    // 3 art arda hatadan sonra kilitle, ama yeniden deneme imkanı ver
    if (hasError) {
      // Hata durumunda otomatik olarak yeni bir oturum dene
      try {
        chatSessionRef.current = createChatSession();
        setHasError(false);
      } catch (_) {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now() + 1,
            sender: 'bot',
            text: '⚠️ Bağlantı hâlâ kurulamıyor. Sayfayı yenileyip tekrar deneyin.',
          },
        ]);
        return;
      }
    }

    if (!chatSessionRef.current) {
      try {
        chatSessionRef.current = createChatSession();
      } catch (e) {
        setHasError(true);
        return;
      }
    }

    const newMsg = { id: Date.now(), sender: 'user', text: trimmed };
    setMessages((prev) => [...prev, newMsg]);
    setInput('');
    setIsTyping(true);

    try {
      // quizContext'i sendMessage'a ilet
      const reply = await sendMessage(chatSessionRef.current, trimmed, quizContext);

      // Başarılı yanıt — kota/limit fallback kontrolü
      if (reply && (reply.includes('API kotası') || reply.includes('API limitleri dolu'))) {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now() + 1,
            sender: 'bot',
            text: '⏳ API kotası geçici olarak dolmuş. Birkaç dakika sonra tekrar deneyin.',
          },
        ]);
      } else {
        setHasError(false);
        setMessages((prev) => [
          ...prev,
          { id: Date.now() + 1, sender: 'bot', text: reply },
        ]);
      }
    } catch (_err) {
      console.error('Chatbot send error:', _err);
      setHasError(true);
      // Oturumu sıfırla — yeni denemede temiz başlasın
      chatSessionRef.current = null;
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          sender: 'bot',
          text: '⚠️ Yanıt alınamadı. Birkaç saniye sonra tekrar deneyin.',
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  // Mesaj-içi aksiyonlar: quiz pill → AI ile N soru üret → efemeral tur (source 'duel');
  // konu pill → mevcut sendMessage akışıyla özet iste.
  const handleInlineQuiz = async (topic, count) => {
    if (quizStarting) return;
    setQuizStarting(true);
    // Üretim + kalite kontrolü 30 sn'ye kadar sürebilir — kullanıcıya net bekleme geri bildirimi
    setMessages((prev) => [...prev, { id: Date.now(), sender: 'bot', text: '⏳ Sorular hazırlanıyor ve kalite kontrolünden geçiriliyor… (30 saniyeye kadar sürebilir)' }]);
    try {
      await startAiQuiz({ topic, subject: topic, count: count || 5, difficulty: 'medium', source: 'duel' }, navigate);
    } catch (e) {
      setMessages((prev) => [...prev, { id: Date.now(), sender: 'bot', text: `⚠️ Soru üretilemedi: ${e.message}` }]);
    } finally {
      setQuizStarting(false);
    }
  };
  const handleInlineTopic = (title) => handleSend(`Bana ${title} konusunu özetle ve anahtar noktalarını ver.`);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Chatbot tam sayfasında ve tam ekran Orman'da floating buton gizlensin
  if (location.pathname === '/chatbot' || location.pathname === '/student/garden') return null;

  return (
    <div className="floating-ai-trigger">
      {/* Tooltip */}
      {!isOpen && <span className="floating-ai-label">{isQuizMode ? 'Test Koçu' : 'Yapay Zekâ Asistanı'}</span>}

      {/* Chat Panel */}
      {isOpen && (
        <div
          className={`floating-ai-panel ${isClosing ? 'panel-close-anim' : ''}`}
          role="dialog"
          aria-label={isQuizMode ? 'Test Koçu sohbeti' : 'Yapay Zekâ Asistanı sohbeti'}
          onKeyDown={(e) => { if (e.key === 'Escape') handleClose(); }}
        >
          {/* Header */}
          <div className="fai-header">
            <div className="fai-bot-info">
              <div className={`fai-bot-avatar ${isQuizMode ? 'quiz-mode' : ''}`}>
                <Bot size={20} color="white" aria-hidden="true" />
              </div>
              <div>
                <div className="fai-bot-name">
                  {isQuizMode ? 'Test Koçu' : 'LearnUp Yapay Zekâ'}
                </div>
                <div className="fai-bot-status">
                  <span aria-hidden="true" style={{
                    width: 6, height: 6,
                    background: hasError ? 'var(--danger)' : 'var(--success)',
                    borderRadius: '50%', display: 'inline-block'
                  }}></span>
                  {hasError ? 'Bağlantı hatası' : isQuizMode
                    ? `${quizContext.subject} • Soru ${quizContext.questionNo}/${quizContext.totalQuestions}`
                    : 'Claude (Sonnet 4.6)'}
                </div>
              </div>
            </div>
            <div className="fai-header-actions">
              <button className="fai-icon-btn" onClick={handleExpand} aria-label="Tam ekrana aç" title="Tam Ekrana Aç">
                <Maximize2 size={14} aria-hidden="true" />
              </button>
              <button className="fai-icon-btn" onClick={handleClose} aria-label="Sohbeti kapat" title="Kapat">
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Quiz Mode Banner */}
          {isQuizMode && (
            <div className="fai-quiz-banner">
              <span className="fai-quiz-badge">📖 Test Modu</span>
              <span className="fai-quiz-info">Yapay zekâ cevabı söylemez, seni yönlendirir</span>
            </div>
          )}

          {/* Quick Chips */}
          <div className="fai-suggestions">
            {chips.map((chip, i) => (
              <button
                key={i}
                className="fai-chip"
                onClick={() => handleSend(chip.message)}
                disabled={isTyping}
              >
                {chip.label}
              </button>
            ))}
          </div>

          {/* Messages */}
          <div className="fai-messages" ref={messagesRef} role="log" aria-live="polite" aria-label="Sohbet mesajları">
            {messages.map((msg) => (
              <div key={msg.id} className={`fai-msg ${msg.sender}`}>
                <div className="fai-msg-avatar">
                  {msg.sender === 'bot' ? <Bot size={15} /> : <User size={15} />}
                </div>
                <div className="fai-msg-bubble" style={{ whiteSpace: 'pre-line' }}>
                  {msg.sender === 'bot' ? (
                    <InlineActionMessage
                      text={msg.text}
                      onQuiz={handleInlineQuiz}
                      onTopic={handleInlineTopic}
                      disabled={isTyping || quizStarting}
                    />
                  ) : (
                    msg.text
                  )}
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="fai-msg bot">
                <div className="fai-msg-avatar">
                  <Bot size={15} />
                </div>
                <div className="fai-typing">
                  <span></span><span></span><span></span>
                </div>
              </div>
            )}
          </div>

          {/* Error hint */}
          {hasError && (
            <div role="alert" style={{
              margin: '0 0.75rem 0.5rem',
              padding: '0.5rem 0.75rem',
              background: 'var(--danger-light)',
              border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: 8,
              fontSize: '0.72rem',
              color: '#FCA5A5',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}>
              <AlertCircle size={12} aria-hidden="true" />
              <span style={{ flex: 1 }}>Bağlantı sorunu — tekrar deneyin</span>
              <button
                onClick={() => {
                  chatSessionRef.current = null;
                  setHasError(false);
                  setMessages(prev => [...prev, {
                    id: Date.now(),
                    sender: 'bot',
                    text: '🔄 Oturum sıfırlandı. Tekrar sorabilirsiniz!'
                  }]);
                }}
                style={{
                  background: 'rgba(239,68,68,0.15)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: 6,
                  color: '#FCA5A5',
                  fontSize: '0.7rem',
                  padding: '0.25rem 0.5rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  whiteSpace: 'nowrap',
                }}
              >
                <RefreshCw size={10} /> Yeniden Bağlan
              </button>
            </div>
          )}

          {/* Input */}
          <div className="fai-input-area">
            <label htmlFor="fai-input" className="sr-only">Mesajınızı yazın</label>
            <input
              id="fai-input"
              ref={inputRef}
              type="text"
              className="fai-input"
              placeholder={isQuizMode ? 'Bu soru hakkında bir şey sor...' : 'Bir şeyler sor...'}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isTyping}
            />
            <button
              className="fai-send-btn"
              onClick={() => handleSend()}
              disabled={!input.trim() || isTyping}
              aria-label="Mesaj gönder"
            >
              {isTyping ? <Loader2 size={15} className="lucide-spin" aria-hidden="true" /> : <Send size={15} aria-hidden="true" />}
            </button>
          </div>
        </div>
      )}

      {/* Trigger Button */}
      <button
        id="floating-ai-btn"
        className={`floating-ai-btn ${isOpen ? 'is-open' : ''} ${isQuizMode ? 'quiz-mode' : ''}`}
        onClick={handleToggle}
        aria-expanded={isOpen}
        aria-label={isOpen ? 'Yapay Zekâ Asistanını kapat' : (isQuizMode ? 'Test Koçunu aç' : 'Yapay Zekâ Asistanını aç')}
      >
        {!isOpen && <div className="ai-notif-dot" aria-hidden="true" />}
        {isOpen ? <X size={22} aria-hidden="true" /> : <Sparkles size={22} aria-hidden="true" />}
      </button>
    </div>
  );
}
