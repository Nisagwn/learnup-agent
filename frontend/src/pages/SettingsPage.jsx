import React, { useState, useEffect } from 'react';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import {
  User, GraduationCap, CalendarDays, Sun, Moon, Volume2, VolumeX,
  Target, Mail, IdCard, LogOut, Palette, Pencil, BookOpen,
  Camera, Sparkles, School, Link2, Flame, Zap, BarChart3, ShieldCheck,
  Bell, ClipboardCheck, FilePlus2, ArrowRight, Lock, KeyRound, Trash2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';
import { currentUser, currentUid, signOutUser } from '../services/authApi';
import { getProfile, updateProfile } from '../services/profileApi';
import { getLevelInfo } from '../utils/levelSystem';
import { useUserStats } from '../contexts/UserStatsContext';
import { SkeletonCard } from '../components/ui/Skeleton';
import { isSoundEnabled, setSoundEnabled, playSound } from '../utils/sound';
import DailyGoalModal from '../components/badges/DailyGoalModal';
import { useToast } from '../components/ToastProvider';
import { AVATARS, getAvatarSrc } from '../utils/avatars';
import { containerStagger, itemRise } from '../utils/motion';
import { updateTeacherNotifPref } from '../services/teacherProfileApi';
import ChangePasswordModal from '../components/settings/ChangePasswordModal';
import DeleteAccountModal from '../components/settings/DeleteAccountModal';
import ClassManager from '../components/ClassManager';
import './SettingsPage.css';

const initialTheme = () =>
  document.documentElement.getAttribute('data-theme') || localStorage.getItem('theme') || 'light';

export default function SettingsPage() {
  const navigate = useNavigate();
  const { stats } = useUserStats();
  const { success, error } = useToast();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState(initialTheme);
  const [soundOn, setSoundOn] = useState(isSoundEnabled());
  const [goal, setGoal] = useState(20);
  const [goalOpen, setGoalOpen] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  // Öğretmen bildirim tercihleri (yalnız Firestore; gerçek push teslimi Faz 14)
  const [notifPrefs, setNotifPrefs] = useState({ assignmentSubmissions: true, questionSubmissions: true });
  // Genel bildirim tercihi (users.notificationsEnabled) — gerçek FCM teslimi Faz 14
  const [notifEnabled, setNotifEnabled] = useState(true);
  const [savingNotif, setSavingNotif] = useState(false);
  const [pwdModalOpen, setPwdModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  const applySound = (on) => {
    setSoundEnabled(on);
    setSoundOn(on);
    if (on) playSound('correct');
  };

  const selectAvatar = async (id) => {
    const uid = currentUid();
    if (!uid || savingAvatar || profile?.avatar === id) return;
    setSavingAvatar(true);
    const prev = profile?.avatar;
    setProfile((p) => ({ ...p, avatar: id }));
    try {
      await updateProfile(uid, { avatar: id });
      success('Avatar Güncellendi', 'Profil avatarın değiştirildi.');
      setAvatarOpen(false);
    } catch (err) {
      console.error('Avatar kaydedilemedi:', err);
      setProfile((p) => ({ ...p, avatar: prev }));
      error('Hata', 'Avatar kaydedilirken bir sorun oluştu.');
    } finally {
      setSavingAvatar(false);
    }
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const fetchProfile = async () => {
    const user = currentUser();
    if (!user) { setLoading(false); return; }
    const baseline = { uid: user.id, email: user.email, displayName: user.user_metadata?.name || null };
    try {
      const data = await getProfile(user.id);
      if (data) {
        let teacherName = '';
        let fetchedClassCode = '';
        if (data.role === 'student' && data.teacher_id) {
          try {
            const { data: t } = await supabase
              .from('profiles').select('name,class_code').eq('id', data.teacher_id).single();
            if (t) {
              teacherName = t.name || 'Bilinmeyen Öğretmen';
              fetchedClassCode = t.class_code || '';
            }
          } catch (tErr) { console.warn('Öğretmen bilgisi çekilemedi:', tErr.message); }
        }
        setProfile({ ...baseline, ...data, teacherName, classCode: fetchedClassCode || data.classCode });
        setGoal(data.dailyGoal ?? 20);
        const tnp = data.teacherNotifPrefs || {};
        setNotifPrefs({
          assignmentSubmissions: tnp.assignmentSubmissions !== false,
          questionSubmissions: tnp.questionSubmissions !== false,
        });
        setNotifEnabled(data.notificationsEnabled !== false);
      } else {
        setProfile(baseline);
      }
    } catch (_err) {
      setProfile(baseline);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchProfile(); }, []);

  const handleLogout = async () => {
    try { await signOutUser(); navigate('/'); } catch (err) { console.error('Çıkış hatası:', err); }
  };

  const onGoalClose = () => { setGoalOpen(false); fetchProfile(); };

  // Öğretmen bildirim tercihi toggle (optimistic + hata geri alma)
  const toggleNotif = async (key, value) => {
    const uid = currentUid();
    if (!uid || notifPrefs[key] === value) return;
    const prev = notifPrefs[key];
    setNotifPrefs((p) => ({ ...p, [key]: value }));
    try {
      await updateTeacherNotifPref(uid, key, value);
      success('Tercih kaydedildi', value ? 'Bildirim açıldı.' : 'Bildirim kapatıldı.');
    } catch (e) {
      console.error('Bildirim tercihi kaydedilemedi:', e);
      setNotifPrefs((p) => ({ ...p, [key]: prev }));
      error('Hata', 'Tercih kaydedilemedi.');
    }
  };

  // Genel bildirim toggle (users.notificationsEnabled) — optimistic + geri alma
  const toggleNotifEnabled = async (value) => {
    const uid = currentUid();
    if (!uid || savingNotif || notifEnabled === value) return;
    const prev = notifEnabled;
    setSavingNotif(true);
    setNotifEnabled(value);
    try {
      await updateProfile(uid, { notificationsEnabled: value });
    } catch (e) {
      console.error('Bildirim tercihi kaydedilemedi:', e);
      setNotifEnabled(prev);
      error('Hata', 'Tercih kaydedilemedi.');
    } finally {
      setSavingNotif(false);
    }
  };

  if (loading) {
    return (
      <div className="dashboard settings-page animate-fade-in pb-12" aria-busy="true">
        <div className="settings-stack">
          <SkeletonCard lines={4} />
          <div className="settings-grid"><SkeletonCard lines={4} /><SkeletonCard lines={4} /></div>
        </div>
      </div>
    );
  }

  const name = profile?.name || profile?.fullName || profile?.email?.split('@')[0] || 'Kullanıcı';
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'KU';
  const roleLabel = profile?.role === 'teacher' ? 'Öğretmen' : 'Öğrenci';
  const isTeacher = profile?.role === 'teacher';
  const avatarSrc = getAvatarSrc(profile?.avatar);

  const correct = stats.correctAnswers ?? 0;
  const { levelData, index, progress, toNext } = getLevelInfo(correct);
  const currentLevel = index + 1;
  const classText = profile?.studentClass ? profile.studentClass : (profile?.grade ? `${profile.grade}. Sınıf` : '—');

  const createdAt = profile?.createdAt
    ? (typeof profile.createdAt === 'string'
        ? new Date(profile.createdAt).toLocaleDateString('tr-TR', { year: 'numeric', month: 'long', day: 'numeric' })
        : profile.createdAt?.toDate
          ? profile.createdAt.toDate().toLocaleDateString('tr-TR', { year: 'numeric', month: 'long', day: 'numeric' })
          : '—')
    : '—';

  const heroStats = isTeacher ? [] : [
    { icon: Zap, label: 'Puan', value: stats.totalXP ?? 0 },
    { icon: Flame, label: 'Seri', value: `${stats.streakDays ?? 0}g` },
    { icon: BookOpen, label: 'Çözülen', value: stats.totalSolved ?? 0 },
    { icon: BarChart3, label: 'Başarı', value: `%${stats.successRate ?? 0}` },
  ];

  return (
    <Motion.div
      className="dashboard settings-page animate-fade-in pb-12"
      variants={containerStagger}
      initial="hidden"
      animate="show"
    >
      {/* ── Hero banner ── */}
      <Motion.section className="set-hero gradient-animated" variants={itemRise}>
        <span className="set-hero-orb set-hero-orb--1" aria-hidden="true" />
        <span className="set-hero-orb set-hero-orb--2" aria-hidden="true" />

        <div className="set-hero-avatar-wrap">
          {avatarSrc
            ? <img className="set-hero-avatar" src={avatarSrc} alt={`${name} avatarı`} />
            : <div className="set-hero-avatar set-hero-avatar--initials">{initials}</div>}
          <button
            type="button"
            className="set-hero-cam"
            onClick={() => setAvatarOpen((o) => !o)}
            aria-label="Avatarı değiştir"
            title="Avatarı değiştir"
          >
            <Camera size={15} />
          </button>
        </div>

        <div className="set-hero-info">
          <div className="set-hero-top">
            <h1 className="set-hero-name">{name}</h1>
            <span className="set-hero-badge">
              {isTeacher ? <><GraduationCap size={13} /> Öğretmen</> : <>{levelData.emoji} {levelData.name}</>}
            </span>
          </div>

          {!isTeacher && (
            <div className="set-hero-level">
              <div className="set-hero-level-row">
                <span>Seviye {currentLevel}</span>
                <span>{toNext > 0 ? `Sonraki için ${toNext} doğru` : 'Maks seviye!'}</span>
              </div>
              <div className="set-hero-progress"><div className="set-hero-progress-fill" style={{ width: `${progress}%` }} /></div>
            </div>
          )}

          {heroStats.length > 0 && (
            <div className="set-hero-stats">
              {heroStats.map((s) => {
                const Icon = s.icon;
                return (
                  <div key={s.label} className="set-hero-chip">
                    <Icon size={15} />
                    <strong>{s.value}</strong>
                    <span>{s.label}</span>
                  </div>
                );
              })}
            </div>
          )}

          {isTeacher && profile?.branch && (
            <div className="set-hero-meta"><IdCard size={13} /> Branş: {profile.branch}</div>
          )}
          <div className="set-hero-meta"><CalendarDays size={13} /> Katılım: {createdAt}</div>
        </div>
      </Motion.section>

      {/* ── Avatar seçici (açılır/kapanır) ── */}
      <AnimatePresence initial={false}>
        {avatarOpen && (
          <Motion.section
            className="ds-card set-card set-avatar-card"
            initial={{ opacity: 0, height: 0, marginTop: -8 }}
            animate={{ opacity: 1, height: 'auto', marginTop: 0 }}
            exit={{ opacity: 0, height: 0, marginTop: -8 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          >
            <div className="set-card-head">
              <h3 className="set-card-title"><Camera size={18} /> Avatar Seç</h3>
              <button type="button" className="set-goal-btn" onClick={() => setAvatarOpen(false)}>Kapat</button>
            </div>
            <div className="set-avatar-grid">
              {AVATARS.map((a) => {
                const active = profile?.avatar === a.id;
                return (
                  <button
                    key={a.id}
                    type="button"
                    className={`set-avatar-opt ${active ? 'active' : ''}`}
                    onClick={() => selectAvatar(a.id)}
                    disabled={savingAvatar}
                    aria-pressed={active}
                    aria-label={`${a.label} avatarını seç`}
                    title={a.label}
                  >
                    <img src={a.src} alt={a.label} loading="lazy" />
                  </button>
                );
              })}
            </div>
          </Motion.section>
        )}
      </AnimatePresence>

      <div className="settings-grid">
        {/* Tercihler */}
        <Motion.div className="ds-card set-card" variants={itemRise}>
          <h3 className="set-card-title"><Palette size={18} /> Tercihler</h3>

          <div className="set-row">
            <div className="set-row-label">{theme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}<span>Tema</span></div>
            <div className="set-segment" role="radiogroup" aria-label="Tema seçimi">
              <button type="button" role="radio" aria-checked={theme === 'light'} className={`set-seg-btn ${theme === 'light' ? 'active' : ''}`} onClick={() => setTheme('light')}><Sun size={14} /> Açık</button>
              <button type="button" role="radio" aria-checked={theme === 'dark'} className={`set-seg-btn ${theme === 'dark' ? 'active' : ''}`} onClick={() => setTheme('dark')}><Moon size={14} /> Koyu</button>
            </div>
          </div>

          <div className="set-row">
            <div className="set-row-label">{soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}<span>Ses Efektleri</span></div>
            <div className="set-segment" role="radiogroup" aria-label="Ses efektleri">
              <button type="button" role="radio" aria-checked={soundOn} className={`set-seg-btn ${soundOn ? 'active' : ''}`} onClick={() => applySound(true)}><Volume2 size={14} /> Açık</button>
              <button type="button" role="radio" aria-checked={!soundOn} className={`set-seg-btn ${!soundOn ? 'active' : ''}`} onClick={() => applySound(false)}><VolumeX size={14} /> Kapalı</button>
            </div>
          </div>

          {!isTeacher && (
            <div className="set-row">
              <div className="set-row-label"><Target size={16} /><span>Günlük Hedef</span></div>
              <button type="button" className="set-goal-btn" onClick={() => setGoalOpen(true)}><strong>{goal}</strong> soru <Pencil size={13} /></button>
            </div>
          )}
        </Motion.div>

        {/* Sınıf & Okul */}
        <Motion.div className="ds-card set-card" variants={itemRise}>
          <h3 className="set-card-title"><School size={18} /> Sınıf & Okul</h3>
          {!isTeacher && (
            <div className="set-row set-row--flat">
              <div className="set-row-label"><Link2 size={16} /><span>Sınıf Bağlantısı</span></div>
              <span className={`set-conn ${profile?.teacherId ? 'is-on' : 'is-off'}`}>
                {profile?.teacherId ? <><ShieldCheck size={14} /> Bağlı</> : '⚠ Bağlı değil'}
              </span>
            </div>
          )}
          {!isTeacher && (
            <div className="set-info-row"><span className="set-info-k"><GraduationCap size={15} /> Öğretmen</span><span className="set-info-v">{profile?.teacherName || '—'}</span></div>
          )}
          <div className="set-info-row"><span className="set-info-k"><IdCard size={15} /> Sınıf Kodu</span><span className="set-info-v set-info-code">{profile?.classCode || '—'}</span></div>
          {!isTeacher && (
            <div className="set-info-row"><span className="set-info-k"><BookOpen size={15} /> Sınıf / Şube</span><span className="set-info-v">{classText}</span></div>
          )}
          {profile?.school && (
            <div className="set-info-row"><span className="set-info-k"><School size={15} /> Okul</span><span className="set-info-v">{profile.school}</span></div>
          )}
        </Motion.div>

        {/* Sınıflarım — çoklu sınıf üyeliği (öğrenci) */}
        {!isTeacher && (
          <Motion.div className="ds-card set-card" variants={itemRise}>
            <ClassManager />
          </Motion.div>
        )}

        {/* Hesap & AI */}
        <Motion.div className="ds-card set-card" variants={itemRise}>
          <h3 className="set-card-title"><User size={18} /> Hesap</h3>
          <div className="set-info-row"><span className="set-info-k"><Mail size={15} /> E-posta</span><span className="set-info-v">{profile?.email || '—'}</span></div>
          <div className="set-info-row"><span className="set-info-k"><User size={15} /> Rol</span><span className="set-info-v">{roleLabel}</span></div>
          {!isTeacher && (
            <div className="set-info-row"><span className="set-info-k"><Sparkles size={15} /> AI Etkileşim</span><span className="set-info-v">{profile?.totalChatMessages ?? 0}</span></div>
          )}
          <button type="button" className="set-logout" onClick={handleLogout}><LogOut size={16} /> Çıkış Yap</button>
          <button
            type="button"
            className="w-full mt-2 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl font-semibold text-sm text-red-400 border border-red-500/30 bg-red-500/5 hover:bg-red-500/15 transition-colors"
            onClick={() => setDeleteModalOpen(true)}
          >
            <Trash2 size={15} /> Hesabı Sil
          </button>
        </Motion.div>

        {/* Güvenlik (tüm kullanıcılar) */}
        <Motion.div className="ds-card set-card" variants={itemRise}>
          <h3 className="set-card-title"><Lock size={18} /> Güvenlik</h3>
          <button type="button" className="set-goal-btn !w-full !justify-between" onClick={() => setPwdModalOpen(true)}>
            <span className="flex items-center gap-1.5"><KeyRound size={14} /> Şifre Değiştir</span>
            <ArrowRight size={14} />
          </button>
        </Motion.div>

        {/* Bildirimler (genel — tüm kullanıcılar) */}
        <Motion.div className="ds-card set-card" variants={itemRise}>
          <h3 className="set-card-title"><Bell size={18} /> Bildirimler</h3>
          <div className="set-row">
            <div className="set-row-label"><Bell size={16} /><span>Bildirimleri Al</span></div>
            <div className="set-segment" role="radiogroup" aria-label="Genel bildirimler">
              <button type="button" role="radio" aria-checked={notifEnabled} disabled={savingNotif} className={`set-seg-btn ${notifEnabled ? 'active' : ''}`} onClick={() => toggleNotifEnabled(true)}>Açık</button>
              <button type="button" role="radio" aria-checked={!notifEnabled} disabled={savingNotif} className={`set-seg-btn ${!notifEnabled ? 'active' : ''}`} onClick={() => toggleNotifEnabled(false)}>Kapalı</button>
            </div>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Bildirim teslimi yakında; tercihin şimdiden kaydedilir.</p>
        </Motion.div>

        {/* Öğretmen ayarları (yalnız öğretmen) */}
        {isTeacher && (
          <Motion.div className="ds-card set-card" variants={itemRise}>
            <h3 className="set-card-title"><Bell size={18} /> Öğretmen Bildirimleri</h3>

            <div className="set-row">
              <div className="set-row-label"><ClipboardCheck size={16} /><span>Ödev Gönderimleri</span></div>
              <div className="set-segment" role="radiogroup" aria-label="Ödev gönderim bildirimleri">
                <button type="button" role="radio" aria-checked={notifPrefs.assignmentSubmissions} className={`set-seg-btn ${notifPrefs.assignmentSubmissions ? 'active' : ''}`} onClick={() => toggleNotif('assignmentSubmissions', true)}>Açık</button>
                <button type="button" role="radio" aria-checked={!notifPrefs.assignmentSubmissions} className={`set-seg-btn ${!notifPrefs.assignmentSubmissions ? 'active' : ''}`} onClick={() => toggleNotif('assignmentSubmissions', false)}>Kapalı</button>
              </div>
            </div>

            <div className="set-row">
              <div className="set-row-label"><FilePlus2 size={16} /><span>Soru Gönderimleri</span></div>
              <div className="set-segment" role="radiogroup" aria-label="Soru gönderim bildirimleri">
                <button type="button" role="radio" aria-checked={notifPrefs.questionSubmissions} className={`set-seg-btn ${notifPrefs.questionSubmissions ? 'active' : ''}`} onClick={() => toggleNotif('questionSubmissions', true)}>Açık</button>
                <button type="button" role="radio" aria-checked={!notifPrefs.questionSubmissions} className={`set-seg-btn ${!notifPrefs.questionSubmissions ? 'active' : ''}`} onClick={() => toggleNotif('questionSubmissions', false)}>Kapalı</button>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 mt-1">Bildirim teslimi yakında; tercihlerin şimdiden kaydedilir.</p>

            <button type="button" className="set-goal-btn !w-full !justify-between mt-1" onClick={() => navigate('/teacher/profile')}>
              <span className="flex items-center gap-1.5"><Pencil size={13} /> Profili Düzenle (bio · okul · branş)</span>
              <ArrowRight size={14} />
            </button>
          </Motion.div>
        )}
      </div>

      <DailyGoalModal isOpen={goalOpen} onClose={onGoalClose} currentGoal={goal} />
      <ChangePasswordModal isOpen={pwdModalOpen} onClose={() => setPwdModalOpen(false)} />
      <DeleteAccountModal isOpen={deleteModalOpen} onClose={() => setDeleteModalOpen(false)} />
    </Motion.div>
  );
}
