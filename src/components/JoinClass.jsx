import React, { useState } from 'react';
import { UserPlus, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { joinClass } from '../services/studentClassesApi';
import './ClassManager.css';

// Sınıf kodu ile katılma formu (çoklu-sınıf destekli). compact: başlıksız (ClassManager içinde).
export default function JoinClass({ compact = false, onJoined }) {
  const [classCode, setClassCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  const handleJoin = async (event) => {
    event.preventDefault();
    if (!classCode || loading) return;
    setLoading(true);
    setMessage({ type: '', text: '' });
    try {
      const res = await joinClass(classCode);
      setMessage({ type: 'success', text: `${res.teacherName} sınıfına katıldın 🎉` });
      setClassCode('');
      onJoined?.(res);
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`joinclass${compact ? ' joinclass--compact' : ''}`}>
      {!compact && <h2 className="joinclass__title"><UserPlus size={18} /> Sınıfa Katıl</h2>}
      <p className="joinclass__hint">Öğretmeninin verdiği 6 haneli sınıf kodunu gir — birden fazla sınıfa katılabilirsin.</p>
      <form onSubmit={handleJoin} className="joinclass__form">
        <label htmlFor="class-code" className="sr-only">Sınıf kodu</label>
        <input
          id="class-code"
          type="text"
          value={classCode}
          onChange={(event) => setClassCode(event.target.value.toUpperCase())}
          placeholder="Örn: A1B2C3"
          className="joinclass__input"
          maxLength={6}
          required
        />
        <button type="submit" disabled={loading} className="joinclass__btn">
          {loading ? <Loader2 size={16} className="animate-spin" /> : 'Katıl'}
        </button>
      </form>
      {message.text && (
        <div role={message.type === 'success' ? 'status' : 'alert'} className={`joinclass__msg joinclass__msg--${message.type}`}>
          {message.type === 'success' ? <CheckCircle2 size={15} aria-hidden="true" /> : <AlertCircle size={15} aria-hidden="true" />}
          {message.text}
        </div>
      )}
    </div>
  );
}
