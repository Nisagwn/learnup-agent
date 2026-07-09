import React, { useState } from 'react';
import { Loader2, KeyRound, AlertCircle } from 'lucide-react';
import { changePassword } from '../../services/authApi';
import Modal from '../ui/Modal';
import { useToast } from '../ToastProvider';

// Şifre değiştir: mevcut şifreyle yeniden-doğrula → updateUser({password}). Saf Supabase Auth.
export default function ChangePasswordModal({ isOpen, onClose }) {
  const { success } = useToast();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [conf, setConf] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const reset = () => { setCur(''); setNext(''); setConf(''); setMsg(''); };
  const close = () => { if (!busy) { reset(); onClose(); } };

  const submit = async () => {
    setMsg('');
    if (!cur) { setMsg('Mevcut şifreni gir.'); return; }
    if (next.length < 6) { setMsg('Yeni şifre en az 6 karakter olmalı.'); return; }
    if (next !== conf) { setMsg('Yeni şifreler eşleşmiyor.'); return; }
    setBusy(true);
    try {
      await changePassword(cur, next);
      success('Şifre güncellendi', 'Yeni şifren kaydedildi.');
      reset();
      onClose();
    } catch (e) {
      setMsg(e.message || 'Şifre değiştirilemedi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      size="sm"
      title="Şifre Değiştir"
      footer={
        <>
          <button type="button" className="ds-btn-ghost" onClick={close} disabled={busy}>Vazgeç</button>
          <button type="button" className="ds-btn-primary flex items-center gap-1.5" onClick={submit} disabled={busy}>
            {busy ? <><Loader2 size={15} className="animate-spin" /> Kaydediliyor…</> : <><KeyRound size={15} /> Güncelle</>}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <label className="flex flex-col text-[11px] text-slate-400 gap-0.5">
          Mevcut Şifre
          <input className="form-control" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} placeholder="••••••••" />
        </label>
        <label className="flex flex-col text-[11px] text-slate-400 gap-0.5">
          Yeni Şifre
          <input className="form-control" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="En az 6 karakter" />
        </label>
        <label className="flex flex-col text-[11px] text-slate-400 gap-0.5">
          Yeni Şifre (Tekrar)
          <input className="form-control" type="password" autoComplete="new-password" value={conf} onChange={(e) => setConf(e.target.value)} placeholder="Yeni şifreyi tekrar gir" />
        </label>
        {msg && (
          <div className="flex items-start gap-1.5 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2">
            <AlertCircle size={14} className="flex-shrink-0 mt-0.5" /> <span>{msg}</span>
          </div>
        )}
      </div>
    </Modal>
  );
}
