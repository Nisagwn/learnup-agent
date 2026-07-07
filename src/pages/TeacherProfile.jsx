import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  GraduationCap, Mail, CalendarDays, Users, BarChart3, Activity, IdCard,
  FileQuestion, ClipboardList, Megaphone, Pencil, Check, Loader2, School,
  BookOpen, Library, User as UserIcon, ArrowRight,
} from 'lucide-react';
import { auth, db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { getAvatarSrc } from '../utils/avatars';
import { CANONICAL_SUBJECTS_TR } from '../utils/subjects';
import { useToast } from '../components/ToastProvider';
import { SkeletonCard } from '../components/ui/Skeleton';
import {
  fetchTeacherLifetimeStats, updateTeacherBio, updateTeacherBranch, updateTeacherName,
} from '../services/teacherProfileApi';

const fmtDate = (v) => {
  if (!v) return '—';
  try {
    if (typeof v === 'string') return new Date(v).toLocaleDateString('tr-TR', { year: 'numeric', month: 'long', day: 'numeric' });
    if (v?.toDate) return v.toDate().toLocaleDateString('tr-TR', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch { /* yoksay */ }
  return '—';
};

// Öğretmen profili: hero + sınıf özeti + lifetime etki + bio/okul/branş düzenleme.
// summary props'u TeacherDashboard'da zaten hesaplanan sınıf verisinden gelir (yeni sorgu yok).
export default function TeacherProfile({ summary = {}, classCode }) {
  const navigate = useNavigate();
  const { success, error } = useToast();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lifetime, setLifetime] = useState(null);

  // Düzenleme alanları
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [branch, setBranch] = useState('');
  const [bio, setBio] = useState('');
  const [school, setSchool] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const user = auth.currentUser;
      if (!user) { setLoading(false); return; }
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        const data = snap.exists() ? snap.data() : {};
        if (cancelled) return;
        const p = { uid: user.uid, email: user.email, ...data };
        setProfile(p);
        setName(p.name || p.fullName || '');
        setBranch(p.branch || '');
        setBio(p.bio || '');
        setSchool(p.school || '');
      } catch (e) {
        console.warn('Öğretmen profili yüklenemedi:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
      const stats = await fetchTeacherLifetimeStats(user.uid);
      if (!cancelled) setLifetime(stats);
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSave = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid || saving) return;
    setSaving(true);
    try {
      await Promise.all([
        updateTeacherName(uid, name),
        updateTeacherBranch(uid, branch),
        updateTeacherBio(uid, { bio, school }),
      ]);
      setProfile((p) => ({ ...p, name: name.trim().slice(0, 60), branch: branch.trim().slice(0, 40), bio: bio.replace(/[<>]/g, '').trim().slice(0, 200), school: school.replace(/[<>]/g, '').trim().slice(0, 80) }));
      setEditing(false);
      success('Profil güncellendi', 'Bilgilerin kaydedildi.');
    } catch (e) {
      error('Kaydedilemedi', e.message || 'Lütfen tekrar dene.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="animate-fade-in flex flex-col gap-4" aria-busy="true">
        <SkeletonCard lines={4} />
        <div className="grid md:grid-cols-3 gap-4"><SkeletonCard lines={2} /><SkeletonCard lines={2} /><SkeletonCard lines={2} /></div>
      </div>
    );
  }

  const displayName = profile?.name || profile?.fullName || profile?.email?.split('@')[0] || 'Öğretmen';
  const initials = displayName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase() || 'ÖĞ';
  const avatarSrc = getAvatarSrc(profile?.avatar);

  const summaryCards = [
    { icon: Users, label: 'Öğrenci', value: summary.totalStudents ?? 0, color: 'text-lime-600' },
    { icon: BarChart3, label: 'Sınıf Ortalaması', value: `%${summary.successRate ?? 0}`, color: 'text-emerald-400' },
    { icon: Activity, label: 'Aktif (7 gün)', value: summary.activeLast7 ?? 0, color: 'text-amber-400' },
  ];

  const lifetimeCards = [
    { icon: FileQuestion, label: 'Oluşturulan Soru', value: lifetime?.questionsCreated ?? '…' },
    { icon: ClipboardList, label: 'Oluşturulan Ödev', value: lifetime?.assignmentsCreated ?? '…' },
    { icon: Megaphone, label: 'Yayınlanan Duyuru', value: lifetime?.announcementsCreated ?? '…' },
  ];

  const quickLinks = [
    { to: '/teacher', label: 'Analiz Panosu', icon: BarChart3 },
    { to: '/teacher/students', label: 'Öğrenciler', icon: UserIcon },
    { to: '/teacher/tests', label: 'Ödevler / Testler', icon: BookOpen },
    { to: '/teacher/questions', label: 'Soru Havuzu', icon: Library },
  ];

  return (
    <div className="animate-fade-in flex flex-col gap-5 pb-8">
      {/* ── Hero ── */}
      <div className="ds-card flex flex-col sm:flex-row sm:items-center gap-4">
        {avatarSrc
          ? <img src={avatarSrc} alt={`${displayName} avatarı`} className="w-20 h-20 rounded-2xl object-cover border border-white/10 flex-shrink-0" />
          : <div className="w-20 h-20 rounded-2xl bg-lime-500/15 text-lime-700 flex items-center justify-center text-2xl font-extrabold flex-shrink-0">{initials}</div>}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-extrabold text-white truncate">{displayName}</h1>
            <span className="text-[11px] px-2 py-1 rounded-lg bg-lime-500/15 text-lime-700 font-semibold flex items-center gap-1"><GraduationCap size={13} /> Öğretmen</span>
          </div>
          <div className="flex items-center gap-4 mt-1.5 text-xs text-slate-400 flex-wrap">
            <span className="flex items-center gap-1"><Mail size={13} /> {profile?.email || '—'}</span>
            <span className="flex items-center gap-1"><IdCard size={13} /> Branş: {profile?.branch || '—'}</span>
            <span className="flex items-center gap-1"><CalendarDays size={13} /> Katılım: {fmtDate(profile?.createdAt)}</span>
            {classCode && <span className="flex items-center gap-1"><BookOpen size={13} /> Kod: <strong className="tracking-widest text-slate-200">{classCode}</strong></span>}
          </div>
        </div>
        {!editing && (
          <button type="button" onClick={() => setEditing(true)} className="ds-btn-ghost !text-xs flex items-center gap-1.5 self-start">
            <Pencil size={14} /> Düzenle
          </button>
        )}
      </div>

      {/* ── Sınıf özeti ── */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        {summaryCards.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="ds-card ds-card--compact text-center">
              <Icon size={20} className={`mx-auto mb-1 ${c.color}`} />
              <div className="text-2xl font-extrabold text-white">{c.value}</div>
              <div className="text-[11px] text-slate-400">{c.label}</div>
            </div>
          );
        })}
      </div>

      {/* ── Öğretim etkisi (lifetime) ── */}
      <div>
        <h3 className="text-sm font-bold text-slate-300 mb-2 flex items-center gap-1.5"><Activity size={16} /> Öğretim Etkisi</h3>
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          {lifetimeCards.map((c) => {
            const Icon = c.icon;
            return (
              <div key={c.label} className="ds-card ds-card--compact text-center">
                <Icon size={20} className="mx-auto mb-1 text-slate-300" />
                <div className="text-2xl font-extrabold text-white">{c.value}</div>
                <div className="text-[11px] text-slate-400">{c.label}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Bio / Okul / Branş ── */}
      <div className="ds-card flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-300 flex items-center gap-1.5"><School size={16} /> Profil Bilgileri</h3>
          {editing && (
            <button type="button" onClick={handleSave} disabled={saving} className="ds-btn-primary !text-xs flex items-center gap-1.5 disabled:opacity-50">
              {saving ? <><Loader2 size={13} className="animate-spin" /> Kaydediliyor…</> : <><Check size={13} /> Kaydet</>}
            </button>
          )}
        </div>

        {editing ? (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col text-[11px] text-slate-400 gap-0.5">
              Ad
              <input className="form-control" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Adın" />
            </label>
            <label className="flex flex-col text-[11px] text-slate-400 gap-0.5">
              Branş
              <input className="form-control" value={branch} maxLength={40} list="branch-suggest" onChange={(e) => setBranch(e.target.value)} placeholder="Örn. Matematik" />
              <datalist id="branch-suggest">{CANONICAL_SUBJECTS_TR.map((s) => <option key={s} value={s} />)}</datalist>
            </label>
            <label className="flex flex-col text-[11px] text-slate-400 gap-0.5">
              Okul
              <input className="form-control" value={school} maxLength={80} onChange={(e) => setSchool(e.target.value)} placeholder="Okulun (ops.)" />
            </label>
            <label className="flex flex-col text-[11px] text-slate-400 gap-0.5">
              Hakkımda <span className="text-slate-500">({bio.length}/200)</span>
              <textarea className="form-control min-h-[72px] resize-y" value={bio} maxLength={200} onChange={(e) => setBio(e.target.value)} placeholder="Kısa bir tanıtım (ops.)" />
            </label>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 text-sm">
            {/* Okul */}
            <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white/5 border border-white/5">
              <span className="w-9 h-9 rounded-lg bg-lime-500/15 text-lime-700 flex items-center justify-center flex-shrink-0"><School size={17} /></span>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] text-slate-400">Okul</div>
                <div className="text-slate-100 font-medium truncate">{profile?.school || <span className="text-slate-500 italic font-normal">Belirtilmemiş</span>}</div>
              </div>
            </div>
            {/* Branş */}
            <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white/5 border border-white/5">
              <span className="w-9 h-9 rounded-lg bg-emerald-500/15 text-emerald-300 flex items-center justify-center flex-shrink-0"><IdCard size={17} /></span>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] text-slate-400">Branş</div>
                <div className="text-slate-100 font-medium truncate">{profile?.branch || <span className="text-slate-500 italic font-normal">Belirtilmemiş</span>}</div>
              </div>
            </div>
            {/* Hakkımda */}
            <div className="flex gap-3 p-2.5 rounded-xl bg-white/5 border border-white/5">
              <span className="w-9 h-9 rounded-lg bg-violet-500/15 text-violet-300 flex items-center justify-center flex-shrink-0"><UserIcon size={17} /></span>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] text-slate-400 mb-0.5">Hakkımda</div>
                <p className="text-slate-200 leading-relaxed">{profile?.bio || <span className="text-slate-500 italic">Henüz bir tanıtım eklenmemiş.</span>}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Hızlı linkler ── */}
      <div>
        <h3 className="text-sm font-bold text-slate-300 mb-2">Hızlı Erişim</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {quickLinks.map((l) => {
            const Icon = l.icon;
            return (
              <button key={l.to} type="button" onClick={() => navigate(l.to)} className="ds-card ds-card--compact flex items-center justify-between gap-2 hover:bg-white/10 transition-colors text-left">
                <span className="flex items-center gap-2 text-sm text-slate-200 font-medium"><Icon size={16} className="text-lime-600" /> {l.label}</span>
                <ArrowRight size={14} className="text-slate-500" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
