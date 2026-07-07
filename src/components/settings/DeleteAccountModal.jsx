import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Trash2, AlertTriangle, AlertCircle } from 'lucide-react';
import { auth } from '../../firebase';
import { EmailAuthProvider, reauthenticateWithCredential, signOut } from 'firebase/auth';
import Modal from '../ui/Modal';
import { mapAuthError } from '../../utils/authErrors';
import { deleteAccount } from '../../services/accountApi';

// Hesap silme (KVKK, yıkıcı): uyarı → re-auth (şifre) → deleteAccount CF → signOut + /login.
// Yeniden-doğrulama ZORUNLU; onaysız tetiklenmez.
export default function DeleteAccountModal({ isOpen, onClose }) {
  const navigate = useNavigate();
  const [step, setStep] = useState('warn'); // 'warn' | 'reauth'
  const [pwd, setPwd] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const reset = () => { setStep('warn'); setPwd(''); setMsg(''); };
  const close = () => { if (!busy) { reset(); onClose(); } };

  const confirmDelete = async () => {
    setMsg('');
    if (!pwd) { setMsg('Devam etmek için şifreni gir.'); return; }
    const user = auth.currentUser;
    if (!user?.email) { setMsg('Oturum bulunamadı.'); return; }
    setBusy(true);
    try {
      // 1) Yeniden-doğrulama (yıkıcı işlem zorunluluğu)
      const cred = EmailAuthProvider.credential(user.email, pwd);
      await reauthenticateWithCredential(user, cred);
      // 2) Backend kalıcı silme (Firestore + alt koleksiyonlar + Auth)
      await deleteAccount();
      // 3) Oturumu kapat ve girişe yönlendir
      try { await signOut(auth); } catch { /* token zaten geçersiz olabilir */ }
      navigate('/login', { replace: true });
    } catch (e) {
      setMsg(mapAuthError(e.code) || e.message || 'Hesap silinemedi.');
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      size="sm"
      title="Hesabı Sil"
      footer={
        step === 'warn' ? (
          <>
            <button type="button" className="ds-btn-ghost" onClick={close}>Vazgeç</button>
            <button type="button" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl font-semibold text-sm bg-red-500 hover:bg-red-600 text-white transition-colors disabled:opacity-50" onClick={() => { setMsg(''); setStep('reauth'); }}>
              <Trash2 size={15} /> Devam Et
            </button>
          </>
        ) : (
          <>
            <button type="button" className="ds-btn-ghost" onClick={() => { if (!busy) { setStep('warn'); setMsg(''); } }} disabled={busy}>Geri</button>
            <button type="button" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl font-semibold text-sm bg-red-500 hover:bg-red-600 text-white transition-colors disabled:opacity-50" onClick={confirmDelete} disabled={busy}>
              {busy ? <><Loader2 size={15} className="animate-spin" /> Siliniyor…</> : <><Trash2 size={15} /> Hesabı Kalıcı Sil</>}
            </button>
          </>
        )
      }
    >
      {step === 'warn' ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-2 text-sm text-red-300 bg-red-500/10 border border-red-500/25 rounded-xl p-3">
            <AlertTriangle size={18} className="flex-shrink-0 mt-0.5 text-red-400" />
            <div>
              <strong className="block text-red-200 mb-1">Bu işlem geri alınamaz.</strong>
              Tüm verilerin (ilerleme, rozetler, sorular, ödevler, gönderimler…) <strong>kalıcı olarak silinecek</strong>.
            </div>
          </div>
          <p className="text-xs text-slate-400">Devam etmek için bir sonraki adımda şifrenle kimliğini doğrulaman gerekir.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-slate-300">Silme işlemini onaylamak için mevcut şifreni gir.</p>
          <label className="flex flex-col text-[11px] text-slate-400 gap-0.5">
            Şifre
            <input className="form-control" type="password" autoComplete="current-password" value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="••••••••" autoFocus />
          </label>
          {msg && (
            <div className="flex items-start gap-1.5 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" /> <span>{msg}</span>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
