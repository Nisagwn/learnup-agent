import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bot, Send, User, Sparkles, Brain, Zap, Clock,
  AlertCircle, RefreshCw, PanelLeftClose, PanelLeftOpen, MessageSquare,
} from 'lucide-react';
import { createChatSession, sendMessage } from '../utils/aiService';
import { startAiQuiz } from '../services/aiService';
import InlineActionMessage from '../components/InlineActionMessage';
import ChatHistorySheet from '../components/chat/ChatHistorySheet';
import { supabase } from '../supabase';
import { currentUid, onAuthChange } from '../services/authApi';
import './Chatbot.css';

const GREETING_TEXT = 'Merhaba! Ben LearnUp Yapay Zekâ — sana özel kişisel öğrenme asistanın. 🤖✨\n\nHerhangi bir ders konusunda takıldığın yeri sor, birlikte çözelim! Sol taraftaki konulardan birini seçebilir ya da doğrudan yazabilirsin.';
const freshGreeting = () => ({ id: Date.now(), sender: 'bot', text: GREETING_TEXT, time: new Date() });

const SUGGESTED_TOPICS = [
  { icon: '🧮', label: 'Türev Hesaplama', subject: 'Matematik' },
  { icon: '⚡', label: 'Newton Hareket Yasaları', subject: 'Fizik' },
  { icon: '🧪', label: 'Mol Kavramı', subject: 'Kimya' },
  { icon: '🧬', label: 'DNA Replikasyonu', subject: 'Biyoloji' },
  { icon: '📐', label: 'Trigonometri Temelleri', subject: 'Matematik' },
  { icon: '🌊', label: 'Dalga Hareketi', subject: 'Fizik' },
  { icon: '🔥', label: 'Isı ve Sıcaklık', subject: 'Kimya' },
  { icon: '🌿', label: 'Fotosentez', subject: 'Biyoloji' },
];

const QUICK_CHIPS = [
  '📚 Konuyu Açıkla',
  '💡 İpucu Ver',
  '🧮 Formül Göster',
  '📝 Örnek Çöz',
  '✅ Doğruluğu Kontrol Et',
  '🔁 Farklı Anlat',
];

function formatTime(date) {
  return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

const getTimestampMs = (value) => {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};

export default function Chatbot() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState([{ id: 1, sender: 'bot', text: GREETING_TEXT, time: new Date() }]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [uid, setUid] = useState(null);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState(null);
  const [msgCount, setMsgCount] = useState(1);
  const [quizStarting, setQuizStarting] = useState(false);
  // Sol panel daraltma durumu; son secim localStorage'da hatirlanir,
  // ilk acilista genis ekranda acik, dar ekranda kapali baslar.
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    const saved = localStorage.getItem('chatSidebarOpen');
    if (saved !== null) return saved === 'true';
    return window.innerWidth > 1024;
  });

  const chatSessionRef = useRef(null);
  const messagesRef = useRef(null);
  const inputRef = useRef(null);
  const lastSentTimeRef = useRef(0);

  useEffect(() => {
    const unsubscribe = onAuthChange(async (user) => {
      if (user) {
        setUid(user.id);
        try {
          const { data: chats } = await supabase.from('chats').select('*').eq('user_id', user.id);
          if (chats && chats.length > 0) {
            const latestChatDoc = [...chats].sort((a, b) =>
              getTimestampMs(b.last_message_at) - getTimestampMs(a.last_message_at)
            )[0];
            const loadedMessages = (latestChatDoc.messages || []);
            if (loadedMessages.length > 0) {
              const formattedMessages = loadedMessages.map(msg => ({
                ...msg,
                time: msg.time ? new Date(msg.time) : new Date()
              }));
              setMessages(formattedMessages);
              setMsgCount(formattedMessages.length);
              const history = formattedMessages.map(msg => ({
                role: msg.sender === 'user' ? 'user' : 'assistant',
                content: msg.text
              }));
              chatSessionRef.current = createChatSession(history, user.id, latestChatDoc.id);
              setCurrentChatId(latestChatDoc.id);
              return;
            }
          }
          chatSessionRef.current = createChatSession([], user.id);
          setCurrentChatId(null);
        } catch (err) {
          console.error('Sohbet geçmişi yüklenirken hata:', err);
          chatSessionRef.current = createChatSession([], user.id);
          setCurrentChatId(null);
        }
      } else {
        setUid(null);
        chatSessionRef.current = createChatSession();
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // Yalnizca mesaj kutusunu kaydir. scrollIntoView ust katman scroll
    // kapsayicilarini (overflow:hidden olanlar dahil) kaydirip tum
    // uygulamayi yukari ittigi icin kullanilmiyor.
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isTyping]);

  useEffect(() => {
    localStorage.setItem('chatSidebarOpen', String(sidebarOpen));
  }, [sidebarOpen]);

  const toggleSidebar = () => setSidebarOpen(v => !v);

  const handleSend = async (text) => {
    const now = Date.now();
    if (now - lastSentTimeRef.current < 2000) {
      setError('Çok hızlı mesaj gönderiyorsunuz. Lütfen 2 saniye bekleyin.');
      return;
    }
    const trimmed = (text || input).trim();
    if (!trimmed || isTyping) return;
    if (!chatSessionRef.current) {
      setError('Oturum başlatılamadı. Sayfayı yenile.');
      return;
    }
    lastSentTimeRef.current = now;
    const userMsg = { id: Date.now(), sender: 'user', text: trimmed, time: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);
    setError(null);
    setMsgCount(c => c + 1);
    try {
      const reply = await sendMessage(chatSessionRef.current, trimmed);
      setMessages(prev => [...prev, { id: Date.now() + 1, sender: 'bot', text: reply, time: new Date() }]);
      setMsgCount(c => c + 1);
    } catch (err) {
      console.error('Yapay zekâ (Claude) hata:', err);
      setError('Şu an API limitleri dolu, 10 saniye sonra tekrar deneyin.');
      setMessages(prev => [...prev, {
        id: Date.now() + 1, sender: 'bot',
        text: '⏳ Şu an API limitleri dolu, 10 saniye sonra tekrar deneyin.',
        time: new Date(), isError: true,
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };
  // Mesaj-içi aksiyonlar: quiz pill → AI ile N soru üret → efemeral tur (source 'duel');
  // konu pill → mevcut sendMessage akışıyla özet iste.
  const handleInlineQuiz = async (topic, count) => {
    if (quizStarting) return;
    setQuizStarting(true);
    setError(null);
    // Üretim + kalite kontrolü 30 sn'ye kadar sürebilir — net bekleme geri bildirimi
    setMessages((prev) => [...prev, { id: Date.now(), sender: 'bot', text: '⏳ Sorular hazırlanıyor ve kalite kontrolünden geçiriliyor… (30 saniyeye kadar sürebilir)', time: new Date() }]);
    try {
      await startAiQuiz({ topic, subject: topic, count: count || 5, difficulty: 'medium', source: 'duel' }, navigate);
    } catch (e) {
      setError(`Soru üretilemedi: ${e.message}`);
    } finally {
      setQuizStarting(false);
    }
  };
  const handleInlineTopic = (title) => handleSend(`Bana ${title} konusunu özetle ve anahtar noktalarını ver.`);
  const handleTopicClick = (topic) => handleSend(`${topic.icon} ${topic.label} konusunu bana açıkla.`);
  const handleChipClick = (chip) => {
    const chipText = chip.split(' ').slice(1).join(' ');
    handleSend(input.trim() ? `${chipText}: ${input.trim()}` : `${chipText} hakkında yardım et.`);
  };
  const handleRetry = () => { chatSessionRef.current = createChatSession(); setError(null); };

  // Geçmişten bir sohbeti yükle (mesajlar + oturum geçmişi).
  const handleSelectChat = async (chatId) => {
    const u = currentUid();
    if (!u) return;
    try {
      const { data: row } = await supabase.from('chats').select('*').eq('id', chatId).single();
      const data = row || {};
      const loaded = (data.messages || []).map((m) => ({ ...m, time: m.time ? new Date(m.time) : new Date() }));
      setMessages(loaded.length ? loaded : [freshGreeting()]);
      setMsgCount(loaded.length || 1);
      const history = loaded.map((m) => ({ role: m.sender === 'user' ? 'user' : 'assistant', content: m.text }));
      chatSessionRef.current = createChatSession(history, u, chatId);
      setCurrentChatId(chatId);
      setError(null);
    } catch (e) {
      console.warn('Sohbet yüklenemedi:', e);
    }
  };

  // Yeni boş sohbet başlat (selamlama + yeni oturum).
  const handleNewChat = () => {
    const u = currentUid();
    chatSessionRef.current = createChatSession([], u || null);
    setMessages([freshGreeting()]);
    setMsgCount(1);
    setCurrentChatId(null);
    setError(null);
  };

  return (
    <div className="chatbot-page">
     <div className="chatbot-frame">
      {/* Mobil: panel acikken arka plani karartan, tiklaninca kapatan ortu */}
      {sidebarOpen && (
        <div className="chat-sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sol Sidebar */}
      <aside className={`chat-sidebar${sidebarOpen ? '' : ' chat-sidebar--collapsed'}`}>
        <div className="chat-sidebar-card stats-card">
          <div className="chat-sidebar-title"><Sparkles size={13} /> AI İstatistikler</div>
          <div className="ai-stat-row">
            <span className="ai-stat-label">Yanıtlanan Soru</span>
            <span className="ai-stat-val">{msgCount}</span>
          </div>
          <div className="ai-stat-row">
            <span className="ai-stat-label">Durum</span>
            <span className="ai-stat-val status-text" style={{ color: error ? 'var(--danger)' : 'var(--success)' }}>
              {error ? '⚠️ Hata' : '✓ Çevrimiçi'}
            </span>
          </div>
        </div>
        
        <div className="chat-sidebar-card topics-card">
          <div className="chat-sidebar-title"><Brain size={13} /> Popüler Konular</div>
          <div className="topic-list">
            {SUGGESTED_TOPICS.map((topic, i) => (
              <button key={i} className="topic-item" onClick={() => handleTopicClick(topic)} disabled={isTyping}>
                <span className="topic-icon">{topic.icon}</span>
                <div className="topic-details">
                  <span className="topic-label">{topic.label}</span>
                  <span className="topic-subject">{topic.subject}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* Ana Chat Bölgesi */}
      <div className="chat-main">
        <div className="chat-header">
          <div className="chat-header-left">
            <button
              className="chat-sidebar-toggle"
              onClick={toggleSidebar}
              aria-label={sidebarOpen ? 'Paneli kapat' : 'Paneli aç'}
              title={sidebarOpen ? 'Paneli kapat' : 'Paneli aç'}
            >
              {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
            </button>
            <div className="chat-header-bot">
              <div className="chat-bot-avatar-lg"><Bot size={24} color="white" /></div>
              <div>
                <div className="chat-bot-name-lg">LearnUp Yapay Zekâ Asistanı</div>
                <div className="chat-bot-desc">
                  <span className="status-dot" style={{ background: error ? 'var(--danger)' : 'var(--success)' }} aria-hidden="true"></span>
                  {error ? 'Bağlantı hatası' : 'Claude (Sonnet 4.6) · Çevrimiçi'}
                </div>
              </div>
            </div>
          </div>
          <div className="chat-header-actions">
            {error && (
              <button className="chat-header-badge error-retry" onClick={handleRetry}>
                <RefreshCw size={13} /> Yeniden Bağlan
              </button>
            )}
            <button className="chat-header-badge" onClick={() => setHistoryOpen(true)} title="Sohbetlerim">
              <MessageSquare size={13} /> Sohbetlerim
            </button>
            <div className="chat-header-badge mode-badge"><Zap size={13} /> Akıllı Öğrenme Modu</div>
          </div>
        </div>

        <div className="chat-chips-bar">
          {QUICK_CHIPS.map((chip, i) => (
            <button key={i} className="chat-chip" onClick={() => handleChipClick(chip)} disabled={isTyping}>{chip}</button>
          ))}
        </div>

        {error && (
          <div className="chat-error-banner" role="alert">
            <AlertCircle size={15} aria-hidden="true" /> {error}
          </div>
        )}

        <div className="chat-messages" ref={messagesRef} role="log" aria-live="polite" aria-label="Sohbet mesajları">
          <div className="chat-date-divider">Bugün</div>
          {messages.map(msg => (
            <div key={msg.id} className={`chat-msg-row ${msg.sender}`}>
              <div className="chat-msg-avatar">
                {msg.sender === 'bot' ? <Bot size={18} /> : <User size={18} />}
              </div>
              <div className="chat-msg-content">
                <div className="chat-msg-bubble" style={{ whiteSpace: 'pre-line', ...(msg.isError ? { borderColor: 'rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.07)' } : {}) }}>
                  {msg.sender === 'bot' && !msg.isError ? (
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
                <div className="chat-msg-time">
                  <Clock size={10} style={{ display: 'inline', marginRight: 3 }} />
                  {formatTime(msg.time)}
                </div>
              </div>
            </div>
          ))}
          {isTyping && (
            <div className="chat-typing-row">
              <div className="chat-msg-avatar typing-avatar">
                <Bot size={18} />
              </div>
              <div className="chat-typing-dots"><span/><span/><span/></div>
            </div>
          )}
        </div>

        <div className="chat-input-bar">
          <div className="chat-input-row">
            <div className="chat-input-wrap">
              <label htmlFor="chat-input" className="sr-only">Mesajınızı yazın</label>
              <input id="chat-input" ref={inputRef} type="text" className="chat-input-field"
                placeholder="Bir konu veya soru yaz... (Enter ile gönder)"
                value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown} disabled={isTyping} />
            </div>
            <button className="chat-send-btn" onClick={() => handleSend()} disabled={!input.trim() || isTyping} aria-label="Mesaj gönder">
              <Send size={18} aria-hidden="true" />
            </button>
          </div>
          <div className="chat-input-hint">✨ Yapay zekâ ile çalışıyor · LearnUp Yapay Zekâ yalnızca eğitim amaçlıdır</div>
        </div>
      </div>
     </div>

      {historyOpen && (
        <ChatHistorySheet
          onClose={() => setHistoryOpen(false)}
          uid={uid}
          currentChatId={currentChatId}
          onSelectChat={handleSelectChat}
          onNewChat={handleNewChat}
        />
      )}
    </div>
  );
}