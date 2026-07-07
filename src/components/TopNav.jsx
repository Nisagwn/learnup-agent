import React, { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion as Motion } from 'framer-motion';
import {
  BookOpen, User, MessageSquare, BarChart, ClipboardList, Library, RotateCcw,
  Award, Star, StickyNote, Trophy, Search, Menu, X, ChevronDown, Home, Flame, Settings, Target, Crosshair, IdCard, TreePine,
} from 'lucide-react';
import { useUserStats } from '../contexts/UserStatsContext';
import { getAvatarSrc } from '../utils/avatars';
import NotificationBell from './NotificationBell';
import './TopNav.css';

// Öğrenci: Pano sabit + 3 gruplu kategori (Öğren / İlerleme / Kişisel).
const STUDENT_NAV = [
  { type: 'link', to: '/student', label: 'Pano', icon: Home, end: true },
  {
    type: 'group', label: 'Öğren', icon: BookOpen, items: [
      { to: '/student/lessons', label: 'Dersler', icon: BookOpen },
      { to: '/student/assignments', label: 'Ödevlerim', icon: ClipboardList },
      { to: '/student/targeted', label: 'Hedefli Setler', icon: Crosshair },
      { to: '/chatbot', label: 'Yapay Zekâ Asistanı', icon: MessageSquare },
    ],
  },
  { type: 'link', to: '/student/garden', label: 'Orman', icon: TreePine },
  {
    type: 'group', label: 'İlerleme', icon: BarChart, items: [
      { to: '/student/statistics', label: 'İstatistikler', icon: BarChart },
      { to: '/student/daily-quests', label: 'Günlük Görevler', icon: Target },
      { to: '/student/league', label: 'Lig', icon: Trophy },
      { to: '/student/badges', label: 'Rozetler', icon: Award },
    ],
  },
  {
    type: 'group', label: 'Kişisel', icon: User, items: [
      { to: '/student/bookmarks', label: 'Favoriler', icon: Star },
      { to: '/student/notes', label: 'Notlarım', icon: StickyNote },
      { to: '/student/wrong-answers', label: 'Yanlışlarım', icon: RotateCcw },
      { to: '/settings', label: 'Ayarlar', icon: Settings },
    ],
  },
];

// Öğretmen: zaten yalın — düz linkler.
const TEACHER_NAV = [
  { type: 'link', to: '/teacher', label: 'Analiz', icon: BarChart, end: true },
  { type: 'link', to: '/teacher/students', label: 'Öğrenciler', icon: User },
  { type: 'link', to: '/teacher/tests', label: 'Ödevler / Testler', icon: BookOpen },
  { type: 'link', to: '/teacher/questions', label: 'Soru Havuzu', icon: Library },
  { type: 'link', to: '/teacher/profile', label: 'Profil', icon: IdCard },
];

export default function TopNav({ userData }) {
  const navigate = useNavigate();
  const location = useLocation();
  const role = userData?.role || 'student';
  const isStudent = role === 'student';
  const nav = isStudent ? STUDENT_NAV : TEACHER_NAV;

  const { stats, userProfile } = useUserStats();
  const avatarSrc = getAvatarSrc(userProfile?.avatar);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState(null); // açık dropdown etiketi
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') || localStorage.getItem('theme') || 'light');

  // Açık / koyu tema arası geçiş (data-theme + localStorage; ProfileDrawer ile aynı kaynak)
  const toggleTheme = () => {
    const next = (document.documentElement.getAttribute('data-theme') === 'dark') ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    setTheme(next);
  };

  const navRef = useRef(null);
  const searchInputRef = useRef(null);

  const name = userData?.name || userData?.fullName || userData?.email?.split('@')[0] || 'Kullanıcı';
  const initials = (name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()) || 'KU';

  const isActivePath = (to, end) => (end ? location.pathname === to : location.pathname.startsWith(to));
  const isGroupActive = (group) => group.items.some((it) => isActivePath(it.to, it.end));

  // Bir yere gidilince tüm açılır menüleri kapat (link onClick'lerinden çağrılır)
  const closeMenus = () => { setOpenMenu(null); setMobileOpen(false); };

  // Dropdown: dışarı tık + Esc ile kapat
  useEffect(() => {
    if (!openMenu) return undefined;
    const onDown = (e) => { if (navRef.current && !navRef.current.contains(e.target)) setOpenMenu(null); };
    const onKey = (e) => { if (e.key === 'Escape') setOpenMenu(null); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [openMenu]);

  useEffect(() => { if (searchOpen) searchInputRef.current?.focus(); }, [searchOpen]);

  const handleSearchChange = (event) => {
    const value = event.target.value;
    const url = new URL(window.location);
    if (value) url.searchParams.set('search', value);
    else url.searchParams.delete('search');
    window.history.replaceState({}, '', url);
    window.dispatchEvent(new CustomEvent('searchChange', { detail: value }));
  };

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter' && searchQuery.trim()) navigate(`/student/lessons?search=${encodeURIComponent(searchQuery.trim())}`);
    if (e.key === 'Escape') setSearchOpen(false);
  };

  // ── Birincil link pill ──
  const renderLink = (link) => {
    const Icon = link.icon;
    const active = isActivePath(link.to, link.end);
    return (
      <NavLink key={link.to} to={link.to} end={link.end} onClick={closeMenus} className={`topnav-pill ${active ? 'active' : ''}`}>
        <Icon size={16} aria-hidden="true" />
        <span>{link.label}</span>
      </NavLink>
    );
  };

  // ── Gruplu açılır kategori ──
  const renderGroup = (group) => {
    const open = openMenu === group.label;
    const active = isGroupActive(group);
    const Icon = group.icon;
    return (
      <div key={group.label} className="topnav-dropdown">
        <button
          type="button"
          className={`topnav-pill topnav-trigger ${active ? 'active' : ''} ${open ? 'open' : ''}`}
          onClick={() => setOpenMenu(open ? null : group.label)}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <Icon size={16} aria-hidden="true" />
          <span>{group.label}</span>
          <ChevronDown size={14} className="topnav-caret" aria-hidden="true" />
        </button>
        <AnimatePresence>
          {open && (
            <Motion.div
              className="topnav-menu"
              role="menu"
              initial={{ opacity: 0, y: -8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            >
              {group.items.map((it) => {
                const ItIcon = it.icon;
                const itActive = isActivePath(it.to, it.end);
                return (
                  <NavLink key={it.to} to={it.to} role="menuitem" onClick={closeMenus} className={`topnav-menu-item ${itActive ? 'active' : ''}`}>
                    <ItIcon size={17} aria-hidden="true" />
                    <span>{it.label}</span>
                  </NavLink>
                );
              })}
            </Motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <header className="topnav animate-fade-in">
      <div className="topnav-inner">
        {/* Sol — logo */}
        <button className="topnav-logo animate-pop" onClick={() => navigate(isStudent ? '/student' : '/teacher')} aria-label="Ana sayfa">
          <img src="/favicon.png" className="topnav-logo-img" alt="LearnUp" />
          <span className="topnav-logo-text">Learn<span>Up</span></span>
        </button>

        {/* Orta — gruplu navigasyon */}
        <nav className="topnav-links" aria-label="Ana menü" ref={navRef}>
          {nav.map((item) => (item.type === 'group' ? renderGroup(item) : renderLink(item)))}
        </nav>

        {/* Sağ — oyunlaştırma + arama + avatar */}
        <div className="topnav-actions">
          {isStudent && (
            <button
              className="topnav-gamify"
              onClick={() => navigate('/student/league')}
              aria-label={`Seri ${stats?.streakDays || 0} gün, seviye ${stats?.level || 1}. Lige git`}
            >
              <span className="topnav-gamify-streak"><Flame size={15} aria-hidden="true" />{stats?.streakDays || 0}</span>
              <span className="topnav-gamify-div" aria-hidden="true" />
              <span className="topnav-gamify-level"><Star size={14} aria-hidden="true" />Lv{stats?.level || 1}</span>
            </button>
          )}

          {isStudent && (
            <div className={`topnav-search ${searchOpen ? 'open' : ''}`}>
              <button className="topnav-icon-btn topnav-search-toggle" onClick={() => setSearchOpen((o) => !o)} aria-label="Ders ara" aria-expanded={searchOpen}>
                <Search size={18} aria-hidden="true" />
              </button>
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Ders ara..."
                className="topnav-search-input"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); handleSearchChange(e); }}
                onKeyDown={handleSearchKeyDown}
                onBlur={() => !searchQuery && setSearchOpen(false)}
                aria-label="Ders ara"
                tabIndex={searchOpen ? 0 : -1}
              />
            </div>
          )}

          <NotificationBell isStudent={isStudent} />

          <button
            className="topnav-icon-btn topnav-theme"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Açık temaya geç' : 'Koyu temaya geç'}
            title={theme === 'dark' ? 'Açık tema' : 'Koyu tema'}
          >
            <span aria-hidden="true">{theme === 'dark' ? '☀️' : '🌙'}</span>
          </button>

          <button className="topnav-avatar hover-pop" onClick={() => navigate('/settings')} aria-label="Profil ve ayarlar">
            {avatarSrc ? <img src={avatarSrc} alt="Avatar" /> : initials}
          </button>

          <button
            className="topnav-icon-btn topnav-hamburger"
            onClick={() => setMobileOpen((o) => !o)}
            aria-label="Menüyü aç/kapat"
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobil açılır menü (gruplu) */}
      <AnimatePresence>
        {mobileOpen && (
          <Motion.div
            className="topnav-mobile"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          >
            <div className="topnav-mobile-inner">
              {isStudent && (
                <button className="topnav-gamify topnav-gamify--mobile" onClick={() => { closeMenus(); navigate('/student/league'); }}>
                  <span className="topnav-gamify-streak"><Flame size={15} aria-hidden="true" />{stats?.streakDays || 0} gün seri</span>
                  <span className="topnav-gamify-div" aria-hidden="true" />
                  <span className="topnav-gamify-level"><Star size={14} aria-hidden="true" />Seviye {stats?.level || 1}</span>
                </button>
              )}

              {nav.map((item) => {
                if (item.type === 'link') {
                  const Icon = item.icon;
                  const active = isActivePath(item.to, item.end);
                  return (
                    <NavLink key={item.to} to={item.to} end={item.end} onClick={closeMenus} className={`topnav-mobile-item ${active ? 'active' : ''}`}>
                      <Icon size={18} /><span>{item.label}</span>
                    </NavLink>
                  );
                }
                return (
                  <div key={item.label} className="topnav-mobile-group">
                    <div className="topnav-mobile-grouptitle">{item.label}</div>
                    {item.items.map((it) => {
                      const ItIcon = it.icon;
                      const active = isActivePath(it.to, it.end);
                      return (
                        <NavLink key={it.to} to={it.to} onClick={closeMenus} className={`topnav-mobile-item ${active ? 'active' : ''}`}>
                          <ItIcon size={18} /><span>{it.label}</span>
                        </NavLink>
                      );
                    })}
                  </div>
                );
              })}

              <button onClick={() => { closeMenus(); navigate('/settings'); }} className="topnav-mobile-item topnav-mobile-profile">
                <User size={18} /><span>Profil & Ayarlar</span>
              </button>
            </div>
          </Motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
