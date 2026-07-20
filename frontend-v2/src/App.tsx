import { Fragment, lazy, Suspense, useEffect, useRef, useState } from 'react'
import {
  Routes, Route, Navigate, NavLink, useNavigate, useLocation, useOutlet,
} from 'react-router-dom'
import { AnimatePresence, m } from 'framer-motion'
import { Toaster } from 'sonner'
import { useAuth } from './lib/auth'
import { useTheme } from './lib/theme'
import { NAV_H } from './lib/layout'
import { cn } from './lib/cn'
import { useIsDesktop } from './lib/responsive'
import { rolBul, ROL_ADI } from './lib/rol'
import { NAV_ROL, NAV_AYRAC, baslikBul, type NavOgesi } from './lib/nav'
import { Icon, type IconName } from './ui'
import { MotionRoot, YakamozBackdrop } from './components/fx'
import { PingDot, Chip } from './components/ui'
import { RolGecidi, PanoIskeleti } from './components/RolGecidi'
import { OtomatikKatilim } from './components/OtomatikKatilim'
import { TipProvider } from './components/cekirdek'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Onboarding, turGerekli } from './components/Onboarding'
import { CommandPalette } from './components/CommandPalette'
import { DurtmeZili } from './components/DurtmeZili'
import { NotFound } from './screens/NotFound'
import Login from './screens/Login'

// Ambiyans partikülleri — tsparticles kendi chunk'ında; masaüstü + hareket-serbest ortamda.
const Ambiyans = lazy(() => import('./components/Ambiyans'))

/* ── Rota-bazlı code-split: her ekran kendi chunk'ında (ana bundle şişmez).
     Ekranlar adlandırılmış export kullanır → default'a eşlenir. ── */
const Bugun = lazy(() => import('./screens/Bugun').then((mod) => ({ default: mod.Bugun })))
const Rota = lazy(() => import('./screens/Rota').then((mod) => ({ default: mod.Rota })))
const Kaptan = lazy(() => import('./screens/Kaptan').then((mod) => ({ default: mod.Kaptan })))
const Arsiv = lazy(() => import('./screens/Arsiv').then((mod) => ({ default: mod.Arsiv })))
const Harita = lazy(() => import('./screens/Harita').then((mod) => ({ default: mod.Harita })))
const Ben = lazy(() => import('./screens/Ben').then((mod) => ({ default: mod.Ben })))
const Coz = lazy(() => import('./screens/Coz').then((mod) => ({ default: mod.Coz })))
const Bahce = lazy(() => import('./screens/Bahce').then((mod) => ({ default: mod.Bahce })))
const Odevler = lazy(() => import('./screens/Odevler').then((mod) => ({ default: mod.Odevler })))

/* ── Öğretmen paneli (yalnız teacher/admin chunk'ına düşer) ── */
const SinifPanosu = lazy(() => import('./screens/sinif/SinifPanosu').then((m) => ({ default: m.SinifPanosu })))
const SinifIsi = lazy(() => import('./screens/sinif/SinifIsi').then((m) => ({ default: m.SinifIsi })))
const OgrenciRontgeni = lazy(() => import('./screens/sinif/OgrenciRontgeni').then((m) => ({ default: m.OgrenciRontgeni })))
const OdevAtolyesi = lazy(() => import('./screens/sinif/OdevAtolyesi').then((m) => ({ default: m.OdevAtolyesi })))
const Karsilastir = lazy(() => import('./screens/sinif/Karsilastir').then((m) => ({ default: m.Karsilastir })))

/* ── Yönetim (yalnız admin chunk'ına düşer) ── */
const Kule = lazy(() => import('./screens/kule/Kule').then((m) => ({ default: m.Kule })))
const Kullanicilar = lazy(() => import('./screens/kule/Kullanicilar').then((m) => ({ default: m.Kullanicilar })))
const SoruHavuzu = lazy(() => import('./screens/kule/SoruHavuzu').then((m) => ({ default: m.SoruHavuzu })))
const OzgunlukBariyeri = lazy(() => import('./screens/kule/OzgunlukBariyeri').then((m) => ({ default: m.OzgunlukBariyeri })))

export default function App() {
  const { session, loading } = useAuth()
  const { theme } = useTheme()
  const loc = useLocation()

  // Rota başına sekme başlığı — profesyonel SaaS detayı.
  // baslikBul: /sinif/ogrenci/:id gibi dinamik rotalar önek eşleşmesiyle çözülür.
  useEffect(() => {
    const sayfa = baslikBul(loc.pathname)
    document.title = sayfa ? `${sayfa} · LearnUp` : 'LearnUp — YKS Güvertesi'
  }, [loc.pathname])

  return (
    <>
      {/* Toast katmanı — Login dahil her yüzeyde kullanılabilir olsun diye kökte */}
      <Toaster
        position="top-center"
        theme={theme}
        gap={8}
        toastOptions={{
          className: 'glass-solid !rounded-xl !font-sans !text-[13px] !shadow-card',
        }}
      />
      {loading ? <Splash /> : !session ? <Login /> : (
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<AnaKapi />} />
            <Route path="rota" element={<Rota />} />
            <Route path="kaptan" element={<Kaptan />} />
            <Route path="arsiv" element={<Arsiv />} />
            <Route path="harita" element={<Harita />} />
            <Route path="bahce" element={<Bahce />} />
            <Route path="odevler" element={<Odevler />} />
            <Route path="ben" element={<Ben />} />

            {/* ── ÖĞRETMEN ── kapı + sınıf verisi TEK layout route'ta: kontrol ve
                paylaşılan fetch alt-ağaç başına bir kez çalışır. ── */}
            <Route path="sinif" element={<RolGecidi izin={['teacher', 'admin']} saglayici="sinif" />}>
              <Route index element={<SinifPanosu />} />
              <Route path="isi" element={<SinifIsi />} />
              <Route path="ogrenci/:ogrenciId" element={<OgrenciRontgeni />} />
              <Route path="odev" element={<OdevAtolyesi />} />
              <Route path="karsilastir" element={<Karsilastir />} />
            </Route>

            {/* ── YÖNETİM ── */}
            <Route path="kule" element={<RolGecidi izin={['admin']} />}>
              <Route index element={<Kule />} />
              <Route path="kullanicilar" element={<Kullanicilar />} />
              <Route path="havuz" element={<SoruHavuzu />} />
              <Route path="ozgunluk" element={<OzgunlukBariyeri />} />
            </Route>

            {/* Bilinmeyen rota: sisli deniz — kabuk İÇİNDE (nav kaybolmaz) */}
            <Route path="*" element={<NotFound />} />
          </Route>
          {/* Odak modu — nav yok, blob yok, tam ekran */}
          <Route path="coz" element={
            <Suspense fallback={<Splash />}>
              <Coz />
            </Suspense>
          } />
        </Routes>
      )}
    </>
  )
}

/**
 * Kök rota rol kapısı: öğretmen `/sinif`e, yönetici `/kule`ye iner; öğrenci Bugün'ü görür.
 *
 * `profilYukleniyor` iken YÖNLENDİRME YOK — profil gelmeden rol "student" görünür ve
 * öğretmen bir an Bugün ekranını görüp sonra sıçrardı.
 */
function AnaKapi() {
  const { profile, profilYukleniyor } = useAuth()
  if (profilYukleniyor) return <PanoIskeleti sutun={2} />
  const rol = rolBul(profile)
  if (rol === 'admin') return <Navigate to="/kule" replace />
  if (rol === 'teacher') return <Navigate to="/sinif" replace />
  return <Bugun />
}

function Splash() {
  return (
    <div className="grid min-h-screen place-items-center bg-shore-50 dark:bg-ocean-900">
      <div className="size-11 animate-spin rounded-full border-[3px] border-sky-600/20 border-t-sky-500" />
    </div>
  )
}

/** Ekran yüklenirken kabuk içinde küçük bekleme (tam Splash değil — nav ayakta). */
function EkranBekleme() {
  return (
    <div className="grid min-h-[50vh] place-items-center">
      <div className="size-9 animate-spin rounded-full border-[3px] border-sky-600/20 border-t-sky-500" />
    </div>
  )
}

function Shell() {
  const loc = useLocation()
  const outlet = useOutlet()
  const isDesktop = useIsDesktop()
  const { profile } = useAuth()
  const rol = rolBul(profile)
  const [tur, setTur] = useState(turGerekli)
  const hareketSerbest =
    typeof window === 'undefined' || !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  return (
    <MotionRoot>
      <TipProvider>
      <div className="min-h-screen font-sans text-slate-700 dark:text-slate-200">
        <YakamozBackdrop />
        {isDesktop && hareketSerbest && (
          <Suspense fallback={null}><Ambiyans /></Suspense>
        )}
        <TopBar />
        <main style={{ paddingTop: NAV_H }}>
          <ErrorBoundary>
            <Suspense fallback={<EkranBekleme />}>
              {/* Rota geçişleri: süzülme — mode=wait ile temiz devir. useOutlet
                  şart: çıkan sayfanın anlık görüntüsü animasyon boyunca korunur. */}
              <AnimatePresence mode="wait" initial={false}>
                <m.div
                  key={loc.pathname}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.22, ease: [0.21, 0.65, 0.32, 1] }}
                >
                  {outlet}
                </m.div>
              </AnimatePresence>
            </Suspense>
          </ErrorBoundary>
        </main>
        {/* İlk giriş turu — localStorage bayrağıyla bir kez. YALNIZ ÖĞRENCİ:
            tur /coz, /rota, /bahce gibi öğretmende olmayan ekranları anlatıyor. */}
        {rol === 'student' && tur && <Onboarding onKapat={() => setTur(false)} />}
        {/* ⌘K / Ctrl+K komut paleti */}
        <CommandPalette />
        {/* Kayıtta girilen sınıf kodunu ilk girişte uygular (görsel çıktısı yok) */}
        <OtomatikKatilim />
      </div>
      </TipProvider>
    </MotionRoot>
  )
}

// ── Üst navigasyon — deniz köpüğü camı ──────────────────────────────────────
function TopBar() {
  const { theme, toggle } = useTheme()
  const { profile } = useAuth()
  const rol = rolBul(profile)
  const taban = NAV_ROL[rol]
  // Ödevler yalnız ÖĞRENCİDE ve öğretmeni atanmışsa görünür (koşullu modül).
  // teacher_id ROL DEĞİL — öğrencinin atanmış öğretmenidir; bu yüzden rol koşulu açık.
  const navOgeleri: NavOgesi[] =
    rol === 'student' && profile?.teacher_id
      ? [...taban.slice(0, 6), { to: '/odevler', label: 'Ödevler', icon: 'book' as IconName }, ...taban.slice(6)]
      : taban
  const ayrac = NAV_AYRAC[rol]
  return (
    <header className="glass fixed inset-x-0 top-0 z-50 rounded-none border-x-0 border-t-0" style={{ height: NAV_H }}>
      <div className="mx-auto flex h-full max-w-[1400px] items-center gap-4 px-[clamp(14px,4vw,28px)]">
        <Brand />
        {/* Rol rozeti — teal=yönetim, sky=öğretmen. Brass ÖSYM mührüne ayrılmıştır. */}
        {rol !== 'student' && (
          <Chip tone={rol === 'admin' ? 'teal' : 'sky'} className="lu-hide-narrow shrink-0">
            {ROL_ADI[rol]}
          </Chip>
        )}
        {/* Dar ekranda pill'ler yatay kayar; kenar fade'i taşmayı yumuşatır */}
        <nav
          className="flex flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none]"
          style={{ maskImage: 'linear-gradient(90deg, black 92%, transparent)' }}
        >
          {navOgeleri.map((item, i) => (
            <Fragment key={item.to}>
              {/* Yönetimde "Kule" grubu ile "Sınıf" grubunu ayıran ince çizgi (Arsiv.tsx:153 deyimi) */}
              {i === ayrac && <span className="mx-1 h-5 w-px shrink-0 bg-slate-300/50 dark:bg-ocean-700" />}
              <NavPill item={item} />
            </Fragment>
          ))}
        </nav>
        <DurtmeZili />
        <button
          onClick={toggle}
          title={theme === 'light' ? 'Gece Vardiyası' : 'Güverte'}
          className="grid size-9 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-lg text-slate-500 transition-colors hover:bg-sky-500/10 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-sky-400/10 dark:hover:text-slate-200"
        >
          {/* Güneş↔ay devri — tema her değiştiğinde ikon yuvarlanarak gelir */}
          <AnimatePresence mode="wait" initial={false}>
            <m.span
              key={theme}
              initial={{ rotate: -100, opacity: 0, scale: 0.6 }}
              animate={{ rotate: 0, opacity: 1, scale: 1 }}
              exit={{ rotate: 100, opacity: 0, scale: 0.6 }}
              transition={{ duration: 0.28, ease: 'easeOut' }}
              className="grid place-items-center"
            >
              <Icon name={theme === 'light' ? 'moon' : 'sun'} size={18} color="currentColor" />
            </m.span>
          </AnimatePresence>
        </button>
        <ProfileMenu />
      </div>
    </header>
  )
}

function Brand() {
  return (
    <NavLink to="/" className="flex shrink-0 items-center gap-2.5 no-underline">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-sky-600 to-cyan-500 shadow-glow-sky">
        <Icon name="anchor" size={17} color="#FFFFFF" />
      </span>
      {/* Yakamoz gradyanı — sky→cyan. bg-clip-text + text-transparent:
          harfler gradyanı maskeler. Açık temada okunurluk için ton bir kademe koyu. */}
      <span className="lu-hide-narrow bg-gradient-to-r from-sky-700 to-cyan-600 bg-clip-text font-display text-lg font-bold tracking-tight text-transparent dark:from-sky-400 dark:to-cyan-300">
        LearnUp
      </span>
    </NavLink>
  )
}

function NavPill({ item }: { item: NavOgesi }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) => cn(
        'relative inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-transparent px-3 py-1.5',
        'font-display text-[13px] font-semibold no-underline transition-colors duration-150',
        isActive
          ? 'border-sky-600/25 bg-sky-500/10 text-sky-700 dark:border-sky-400/25 dark:bg-sky-400/15 dark:text-sky-300'
          : 'text-slate-500 hover:bg-sky-500/10 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-sky-400/10 dark:hover:text-slate-200',
      )}
    >
      {({ isActive }) => (
        <>
          <Icon name={item.icon} size={16} color="currentColor" strokeWidth={isActive ? 2 : 1.7} />
          {item.label}
          {/* Aktif alt ışık çizgisi — pill'in altında ince yakamoz */}
          {isActive && (
            <m.span
              layoutId="nav-isik"
              aria-hidden
              className="absolute -bottom-px left-3 right-3 h-px rounded-full bg-gradient-to-r from-transparent via-sky-500 to-transparent dark:via-sky-400"
              transition={{ type: 'spring', stiffness: 420, damping: 36 }}
            />
          )}
        </>
      )}
    </NavLink>
  )
}

function ProfileMenu() {
  const nav = useNavigate()
  const { profile, user, signOut } = useAuth()
  const rol = rolBul(profile)
  const ham = profile?.name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'Denizci'
  const ad = ham.split(' ').map((w: string) => w ? w.charAt(0).toLocaleUpperCase('tr-TR') + w.slice(1) : w).join(' ')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const kapat = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', kapat)
    return () => document.removeEventListener('mousedown', kapat)
  }, [])

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="glass-solid flex cursor-pointer items-center gap-2 rounded-full py-1 pl-1 pr-2 transition-colors hover:border-sky-500/30 dark:hover:border-sky-400/25"
      >
        {/* Avatar + canlı durum halkası. PingDot sayfada TEK (ping bütçesi). */}
        <span className="relative shrink-0">
          <span className="grid size-7 place-items-center rounded-full bg-gradient-to-br from-sky-600 to-cyan-600 font-display text-xs font-bold text-white">
            {ad.charAt(0).toUpperCase()}
          </span>
          <PingDot className="absolute -bottom-px -right-px ring-2 ring-white/90 dark:ring-ocean-900/90 rounded-full" />
        </span>
        <span className="lu-hide-narrow max-w-28 truncate font-display text-[13px] font-semibold text-slate-700 dark:text-slate-200">{ad}</span>
        <Icon name="chevronDown" size={13} color="currentColor" />
      </button>

      <AnimatePresence>
        {open && (
          <m.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className="glass absolute right-0 top-11 z-60 min-w-48 overflow-hidden rounded-xl shadow-card"
          >
            <div className="border-b border-slate-500/10 px-3.5 py-3 dark:border-sky-500/10">
              <div className="truncate font-display text-[13px] font-semibold text-slate-800 dark:text-slate-200">{ad}</div>
              <div className="mt-0.5 truncate text-[11px] text-slate-500">{user?.email}</div>
              {rol !== 'student' && (
                <div className="mt-1.5"><Chip tone={rol === 'admin' ? 'teal' : 'sky'}>{ROL_ADI[rol]}</Chip></div>
              )}
            </div>
            {/* "Profilim" YALNIZ öğrencide: /ben rozet, lig, günlük görev ve bahçe
                ekonomisi ekranıdır — yöneticide bu verilerin hiçbiri yok, sekme
                boş bir öğrenci profiline götürüyordu. */}
            {rol === 'student' && (
              <MenuItem icon="chart" label="Profilim" onClick={() => { setOpen(false); nav('/ben') }} />
            )}
            <MenuItem icon="close" label="Çıkış yap" danger onClick={() => { setOpen(false); signOut() }} />
          </m.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function MenuItem({ icon, label, onClick, danger }: {
  icon: IconName; label: string; onClick: () => void; danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full cursor-pointer items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-medium transition-colors',
        danger
          ? 'text-rose-600 hover:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-400/10'
          : 'text-slate-500 hover:bg-sky-500/10 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-sky-400/10 dark:hover:text-slate-200',
      )}
    >
      <Icon name={icon} size={15} color="currentColor" />
      {label}
    </button>
  )
}
