import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import {
  ArrowLeft, GraduationCap, Briefcase, Sparkles, LogIn, UserPlus
} from 'lucide-react';
import { useToast } from '../components/ToastProvider';
import './Auth.css';

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName]       = useState('');
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole]       = useState('student');
  const [grade, setGrade]     = useState('9');
  const [studentClass, setStudentClass] = useState('');
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const toast = useToast();

  /* ── Firebase handler ─────────────────────────────────── */
  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
        toast.success('Hoş Geldin!', 'Yönlendiriliyorsun...');
        navigate('/dashboard');
      } else {
        const { user } = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          name: name.trim() || 'İsimsiz Kullanıcı',
          email,
          role,
          ...(role === 'student' && {
            grade,
            studentClass: studentClass.trim() || '',
            teacherId: null,
            stats: { totalSolved: 0, correctAnswers: 0, totalChatMessages: 0 },
          }),
          ...(role === 'teacher' && {
            classCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
            students: [],
          }),
          createdAt: new Date().toISOString(),
        });
        toast.success('Kayıt Başarılı!', 'Aramıza hoş geldin 🚀');
        navigate('/dashboard');
      }
    } catch (err) {
      const map = {
        'auth/email-already-in-use': 'Bu e-posta zaten kullanımda.',
        'auth/invalid-credential':   'E-posta veya şifre hatalı.',
        'auth/wrong-password':       'E-posta veya şifre hatalı.',
        'auth/user-not-found':       'Kullanıcı bulunamadı.',
        'auth/weak-password':        'Şifre en az 6 karakter olmalı.',
      };
      toast.error('Hata', map[err.code] || 'Bir hata oluştu, tekrar dene.');
    } finally {
      setLoading(false);
    }
  };

  const switchMode = () => {
    setIsLogin(!isLogin);
    setName(''); setEmail(''); setPassword('');
    setRole('student'); setGrade('9');
  };

  /* ── Render ───────────────────────────────────────────── */
  return (
    <div className="auth-root">
      {/* Background Orbs — same palette as Landing */}
      <div className="auth-orbs">
        <div className="orb orb-1" style={{ left: '-8%', top: '8%' }} />
        <div className="orb orb-2" style={{ right: '-6%', bottom: '6%' }} />
      </div>

      {/* Back button — top-left, always visible */}
      <button className="auth-back-btn" onClick={() => navigate('/')}>
        <ArrowLeft size={16} />
        <span>Ana Sayfa</span>
      </button>

      {/* Card */}
      <div className="auth-card">

        {/* Logo & Header */}
        <div className="auth-header">
          <img src="/favicon.png" className="auth-logo-img" alt="LearnUp" />

          <p className="auth-brand">Learn<span className="auth-brand-accent">Up</span></p>

          {/* Tab switcher */}
          <div className="auth-tabs">
            <button
              type="button"
              className={`auth-tab ${isLogin ? 'auth-tab-active' : ''}`}
              onClick={() => { setIsLogin(true); switchMode(); setIsLogin(true); }}
            >
              <LogIn size={15} /> Giriş Yap
            </button>
            <button
              type="button"
              className={`auth-tab ${!isLogin ? 'auth-tab-active' : ''}`}
              onClick={() => { setIsLogin(false); switchMode(); setIsLogin(false); }}
            >
              <UserPlus size={15} /> Kayıt Ol
            </button>
          </div>

          <p className="auth-tagline">
            {isLogin
              ? 'Eğitim serüvenine kaldığın yerden devam et.'
              : 'Geleceğin yapay zeka destekli platformuna katıl.'}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleAuth} className="auth-form">

          {/* Name — signup only */}
          {!isLogin && (
            <div className="auth-field auth-fade-in">
              <label className="auth-label">AD SOYAD</label>
              <input
                type="text"
                placeholder="Örn: Ahmet Yılmaz"
                value={name}
                onChange={e => setName(e.target.value)}
                className="auth-input"
                required
              />
            </div>
          )}

          {/* Email */}
          <div className="auth-field">
            <label className="auth-label">E-POSTA</label>
            <input
              type="email"
              placeholder="ornek@mail.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="auth-input"
              required
            />
          </div>

          {/* Password */}
          <div className="auth-field">
            <label className="auth-label">ŞİFRE</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="auth-input"
              required
            />
          </div>

          {/* Role selector — signup only */}
          {!isLogin && (
            <>
              <div className="auth-field auth-fade-in">
                <label className="auth-label">SEN BİR...</label>
                <div className="role-grid">
                  <button
                    type="button"
                    className={`role-btn ${role === 'student' ? 'role-btn-active' : ''}`}
                    onClick={() => setRole('student')}
                  >
                    <GraduationCap size={22} />
                    <span>Öğrenci</span>
                  </button>
                  <button
                    type="button"
                    className={`role-btn ${role === 'teacher' ? 'role-btn-active' : ''}`}
                    onClick={() => setRole('teacher')}
                  >
                    <Briefcase size={22} />
                    <span>Öğretmen</span>
                  </button>
                </div>
              </div>

              {role === 'student' && (
                <>
                  <div className="auth-field auth-fade-in">
                    <label className="auth-label">SINIF SEVİYESİ</label>
                    <div className="auth-select-wrapper">
                      <select
                        value={grade}
                        onChange={e => setGrade(e.target.value)}
                        className="auth-select"
                      >
                        <option value="9">9. Sınıf</option>
                        <option value="10">10. Sınıf</option>
                        <option value="11">11. Sınıf</option>
                        <option value="12">12. Sınıf</option>
                      </select>
                      <span className="auth-select-arrow">▾</span>
                    </div>
                  </div>

                  <div className="auth-field auth-fade-in">
                    <label className="auth-label">SINIF / ŞUBE (Örn: 9-A)</label>
                    <input
                      type="text"
                      placeholder="Örn: 9-A, 11-B"
                      value={studentClass}
                      onChange={e => setStudentClass(e.target.value)}
                      className="auth-input"
                      required={role === 'student'}
                    />
                  </div>
                </>
              )}
            </>
          )}

          {/* Submit */}
          <button type="submit" disabled={loading} className="auth-submit">
            {loading ? (
              <span className="auth-spinner" />
            ) : (
              <>
                {isLogin ? 'Giriş Yap' : 'Kayıt Ol ve Başla'}
                <Sparkles size={17} />
              </>
            )}
          </button>
        </form>

        {/* Footer toggle */}
        <p className="auth-footer">
          {isLogin ? 'Hesabın yok mu? ' : 'Zaten hesabın var mı? '}
          <button type="button" className="auth-toggle-link" onClick={switchMode}>
            {isLogin ? 'Kayıt Ol' : 'Giriş Yap'}
          </button>
        </p>

      </div>
    </div>
  );
};

export default Auth;
