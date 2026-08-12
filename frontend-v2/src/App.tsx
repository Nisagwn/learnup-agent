import { Fragment, lazy, Suspense, useEffect, useRef, useState } from 'react'
import {
  Routes, Route, Navigate, NavLink, useNavigate, useLocation, useOutlet,
} from 'react-router-dom'
import { AnimatePresence, m, useReducedMotion } from 'framer-motion'
import { Toaster } from 'sonner'
import { useAuth } from './lib/auth'
import { useTheme } from './lib/theme'
import { NAV_H } from './lib/layout'
import { cn } from './lib/cn'
import { useIsDesktop } from './lib/responsive'
import { rolBul, ROL_ADI, ROL_ANA_YOL } from './lib/rol'
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

// Ambiyans yaprakları — kendi chunk'ında (lazy); yalnız masaüstü + hareket-serbest ortamda yüklenir.
const Ambiyans = lazy(() => import('./components/Ambiyans'))

// Tanıtım (landing) — kimliksiz kök; kendi chunk'ında. Yalnız react+router kullanır:
// three/recharts/katex/framer-motion ÇEKMEZ (animasyonları saf CSS — GOREV-023).
const Tanitim = lazy(() => import('./screens/Tanitim').then((mod) => ({ default: mod.Tanitim })))

/* ── Rota-bazlı code-split: her ekran kendi chunk'ında (ana bundle şişmez).
     Ekranlar adlandırılmış export kullanır → default'a eşlenir. ── */
const Bugun = lazy(() => import('./screens/Bugun').then((mod) => ({ default: mod.Bugun })))
const Konular = lazy(() => import('./screens/Konular').then((mod) => ({ default: mod.Konular })))
const Rota = lazy(() => import('./screens/Rota').then((mod) => ({ default: mod.Rota })))
const Kaptan = lazy(() => import('./screens/Kaptan').then((mod) => ({ default: mod.Kaptan })))
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
const Siniflar = lazy(() => import('./screens/kule/Siniflar').then((m) => ({ default: m.Siniflar })))
const SoruHavuzu = lazy(() => import('./screens/kule/SoruHavuzu').then((m) => ({ default: m.SoruHavuzu })))
const OzgunlukBariyeri = lazy(() => import('./screens/kule/OzgunlukBariyeri').then((m) => ({ default: m.OzgunlukBariyeri })))
const Denetim = lazy(() => import('./screens/kule/Denetim').then((m) => ({ default: m.Denetim })))
const Ayarlar = lazy(() => import('./screens/kule/Ayarlar').then((m) => ({ default: m.Ayarlar })))

export default function App() {
  const { session, loading } = useAuth()
  const { theme } = useTheme()
  const loc = useLocation()
  const nav = useNavigate()

  /**
   * OTURUM KAPANDI → URL'yi giriş kapısına sabitle.
   *
   * Kimliksiz yüzey derin bağlantıyı KORUR (paylaşılan link girişten sonra açılsın diye)
   * ama ÇIKIŞ bunun istisnasıdır: öğrenci /ben'de çıkış yapınca URL /ben'de kalıyor,
   * ardından giren YÖNETİCİ doğrudan öğrenci profiline düşüyordu. Çıkışta yol sıfırlanır;
   * bir sonraki hesap kendi ana ekranından (AnaKapi rol kapısı) başlar.
   *
   * `replace`: geri tuşu kapanmış oturumun sayfasına dönmemeli.
   * Yalnız VAR→YOK geçişinde çalışır; ilk yüklemedeki "henüz oturum yok" hâli tetiklemez.
   */
  const oturumVardi = useRef(false)
  useEffect(() => {
    if (oturumVardi.current && !session) nav('/giris', { replace: true })
    oturumVardi.current = !!session
  }, [session, nav])

  // Rota başına sekme başlığı — profesyonel SaaS detayı.
  // baslikBul: /sinif/ogrenci/:id gibi dinamik rotalar önek eşleşmesiyle çözülür.
  useEffect(() => {
    // Kimliksiz yüzeyde (Tanıtım/Giriş) rota başlığı basılmaz: ziyaretçi "/"ta
    // "Genel Bakış" gibi uygulama-içi bir ad değil, nötr ürün başlığını görür.
    const sayfa = session ? baslikBul(loc.pathname) : undefined
    document.title = sayfa ? `${sayfa} · LearnUp` : 'LearnUp — YKS Hazırlık'
  }, [loc.pathname, session])

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
      {loading ? <Splash /> : !session ? (
        /* Kimliksiz yüzey: kök → Tanıtım (landing, GOREV-023); diğer TÜM yollar (derin
           bağlantılar dahil) Giriş'e düşer — URL korunur, girişten sonra hedef rota açılır.
           TEK İSTİSNA ÇIKIŞ: yukarıdaki oturum-kapandı effect'i yolu /giris'e sabitler,
           yoksa sonraki hesap önceki rolün sayfasına düşerdi.
           Tanıtımdaki CTA'lar /giris'e yönlendirir. */
        <Suspense fallback={<Splash />}>
          <Routes>
            <Route index element={<Tanitim />} />
            <Route path="*" element={<Login />} />
          </Routes>
        </Suspense>
      ) : (
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<AnaKapi />} />

            {/* ── ÖĞRENCİ YÜZEYİ ── kişisel çalışma ekranları: öğretmen/yöneticide bu
                verilerin hiçbiri yok (navlarında da yoklar — nav.ts). Kapı OLMADIĞI için
                yer imi, geri tuşu ya da çıkış sonrası kalan URL yöneticiyi öğrenci
                ekranına düşürüyordu. Yetkisiz rol UYARI KARTI DEĞİL, kendi ana ekranını
                görür (`yonlendir`): burada bir ihlal yok, sayfa sadece o hesabın işi değil. */}
            <Route element={<RolGecidi izin={['student']} yonlendir />}>
              <Route path="konular" element={<Konular />} />
              <Route path="rota" element={<Rota />} />
              <Route path="kaptan" element={<Kaptan />} />
              <Route path="harita" element={<Harita />} />
              <Route path="bahce" element={<Bahce />} />
              <Route path="odevler" element={<Odevler />} />
            </Route>

            {/* /ben öğretmende de var (NAV_OGRETMEN son sekmesi) — yalnız yönetim dışarıda;
                yöneticinin kendi hesabı /kule/ayarlar'da (ProfileMenu de bu çizgide). */}
            <Route element={<RolGecidi izin={['student', 'teacher']} yonlendir />}>
              <Route path="ben" element={<Ben />} />
            </Route>

            {/* ── SINIF YÜZEYİ ── kapı + sınıf verisi TEK layout route'ta: kontrol ve
                paylaşılan fetch alt-ağaç başına bir kez çalışır.
                Yönetici buraya KAPSAM SEÇEREK girer (/sinif?ogretmenId=…, 0025);
                kapsamsız gelirse RolGecidi "önce bir sınıf seç" ekranını gösterir. ── */}
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
              <Route path="siniflar" element={<Siniflar />} />
              <Route path="havuz" element={<SoruHavuzu />} />
              <Route path="ozgunluk" element={<OzgunlukBariyeri />} />
              <Route path="denetim" element={<Denetim />} />
              <Route path="ayarlar" element={<Ayarlar />} />
            </Route>

            {/* Kimlikli kullanıcı /giris'te kalmaz: girişten hemen sonra (veya elle
                gelirse) köke — AnaKapi rol yönlendirmesine — düşer. NotFound değil:
                tanıtım CTA'sından gelen oturum bu yolda oturum açar. */}
            <Route path="giris" element={<Navigate to="/" replace />} />

            {/* Bilinmeyen rota: NotFound — kabuk İÇİNDE (nav kaybolmaz) */}
            <Route path="*" element={<NotFound />} />
          </Route>
          {/* Odak modu — nav yok, blob yok, tam ekran. Hata sınırı: soru çözüm ekranı
              çökerse diğer rotalar sağlam kalmalı. Öğrenci yüzeyi: buraya YALNIZ öğrenci
              akışlarından gelinir (Bugün/Rota/Harita/Konular/Koç); öğretmenin karşılığı
              Ödev Atölyesi'dir (OgrenciRontgeni.tsx:216). */}
          <Route path="coz" element={<RolGecidi izin={['student']} yonlendir />}>
            <Route index element={
              <ErrorBoundary>
                <Suspense fallback={<Splash />}>
                  <Coz />
                </Suspense>
              </ErrorBoundary>
            } />
          </Route>
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
  // Öğrencinin ana yolu köktür (ROL_ANA_YOL.student === '/') — kendine yönlendirme olmaz,
  // ekran doğrudan basılır. Diğer roller kendi paneline iner.
  if (rol !== 'student') return <Navigate to={ROL_ANA_YOL[rol]} replace />
  return <Bugun />
}

function Splash() {
  return (
    <div className="grid min-h-screen place-items-center" style={{ background: 'var(--page-bg)' }}>
      <div
        className="size-11 rounded-full border-[3px] motion-safe:animate-spin"
        style={{ borderColor: 'color-mix(in srgb, var(--yaprak) 22%, transparent)', borderTopColor: 'var(--yaprak)' }}
      />
    </div>
  )
}

/** Ekran yüklenirken kabuk içinde küçük bekleme (tam Splash değil — nav ayakta). */
function EkranBekleme() {
  return (
    <div className="grid min-h-[50vh] place-items-center">
      <div
        className="size-9 rounded-full border-[3px] motion-safe:animate-spin"
        style={{ borderColor: 'color-mix(in srgb, var(--yaprak) 22%, transparent)', borderTopColor: 'var(--yaprak)' }}
      />
    </div>
  )
}

function Shell() {
  const loc = useLocation()
  const outlet = useOutlet()
  const isDesktop = useIsDesktop()
  const { profile, profilYukleniyor } = useAuth()
  const rol = rolBul(profile)
  const [tur, setTur] = useState(turGerekli)
  const azalt = useReducedMotion()
  const hareketSerbest =
    typeof window === 'undefined' || !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  return (
    <MotionRoot>
      <TipProvider>
      <div className="min-h-screen font-sans" style={{ color: 'var(--metin1)' }}>
        <YakamozBackdrop />
        {isDesktop && hareketSerbest && (
          <Suspense fallback={null}><Ambiyans /></Suspense>
        )}
        <TopBar />
        <main style={{ paddingTop: NAV_H }}>
          {/* sifirlaAnahtari: rota değişince sınır kendini temizler — yoksa bir kez çöken
              ekran, kullanıcı başka sayfaya geçse bile hata ekranını orada tutuyordu. */}
          <ErrorBoundary sifirlaAnahtari={loc.pathname}>
            <Suspense fallback={<EkranBekleme />}>
              {/* Rota geçişleri: süzülme — mode=wait ile temiz devir. useOutlet
                  şart: çıkan sayfanın anlık görüntüsü animasyon boyunca korunur. */}
              <AnimatePresence mode="wait" initial={false}>
                <m.div
                  key={loc.pathname}
                  initial={azalt ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={azalt ? { opacity: 0 } : { opacity: 0, y: -8 }}
                  transition={{ duration: azalt ? 0 : 0.22, ease: [0.21, 0.65, 0.32, 1] }}
                >
                  {outlet}
                </m.div>
              </AnimatePresence>
            </Suspense>
          </ErrorBoundary>
        </main>
        {/* İlk giriş turu — localStorage bayrağıyla bir kez. YALNIZ ÖĞRENCİ:
            tur /coz, /rota, /bahce gibi öğretmende olmayan ekranları anlatıyor.
            ⚠️ `profilYukleniyor` BEKLENİR: RolGecidi ve AnaKapi bekliyordu, Shell beklemiyordu
            ve `rolBul(null)` güvenli varsayılan olarak 'student' dönüyor. Yeni kaydolan bir
            öğretmen ilk girişinde, profil satırı gelene kadarki pencerede tam ekran onboarding
            görüyordu; "Sınava başla"ya basınca RolGecidi onu geri atıyor ama localStorage'a
            'tamam' yazılmış oluyordu — yani aynı cihazdaki gerçek öğrenci turu HİÇ görmüyordu. */}
        {!profilYukleniyor && rol === 'student' && tur && <Onboarding onKapat={() => setTur(false)} />}
        {/* ⌘K / Ctrl+K komut paleti */}
        <CommandPalette />
        {/* Kayıtta girilen sınıf kodunu ilk girişte uygular (görsel çıktısı yok) */}
        <OtomatikKatilim />
      </div>
      </TipProvider>
    </MotionRoot>
  )
}

// ── Üst navigasyon (FİDAN cam kabuk) ────────────────────────────────────────
function TopBar() {
  const { theme, toggle } = useTheme()
  const azalt = useReducedMotion()
  const { profile } = useAuth()
  const rol = rolBul(profile)
  const taban = NAV_ROL[rol]
  // Ödevler yalnız ÖĞRENCİDE ve öğretmeni atanmışsa görünür (koşullu modül).
  // teacher_id ROL DEĞİL — öğrencinin atanmış öğretmenidir; bu yüzden rol koşulu açık.
  // Profil'den ÖNCE eklenir (slice(-1) = Profil hep son) — nav uzunluğundan bağımsız
  // (GOREV-015 sonrası taban 6 sekme; sabit indeks kırılgandı).
  const navOgeleri: NavOgesi[] =
    rol === 'student' && profile?.teacher_id
      ? [...taban.slice(0, -1), { to: '/odevler', label: 'Ödevler', icon: 'book' as IconName }, ...taban.slice(-1)]
      : taban
  const ayrac = NAV_AYRAC[rol]
  return (
    <header className="glass fixed inset-x-0 top-0 z-50 rounded-none border-x-0 border-t-0" style={{ height: NAV_H }}>
      <div className="mx-auto flex h-full max-w-[1400px] items-center gap-4 px-[clamp(14px,4vw,28px)]">
        <KabukStil />
        <Brand />
        {/* Rol rozeti (teacher/admin) — ui.tsx Chip tonları; FİDAN'a taşınması ui.tsx konsolidasyon kartında. */}
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
              {i === ayrac && <span className="mx-1 h-5 w-px shrink-0" style={{ background: 'var(--cam-kenar)' }} />}
              <NavPill item={item} />
            </Fragment>
          ))}
        </nav>
        <DurtmeZili />
        <button
          onClick={toggle}
          title={theme === 'light' ? 'Koyu tema' : 'Açık tema'}
          className="kb-ikonbtn grid size-9 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-lg transition-colors"
        >
          {/* Güneş↔ay devri — tema her değiştiğinde ikon yuvarlanarak gelir (hareket-azalt'ta düz geçiş) */}
          <AnimatePresence mode="wait" initial={false}>
            <m.span
              key={theme}
              initial={azalt ? false : { rotate: -100, opacity: 0, scale: 0.6 }}
              animate={{ rotate: 0, opacity: 1, scale: 1 }}
              exit={azalt ? { opacity: 0 } : { rotate: 100, opacity: 0, scale: 0.6 }}
              transition={{ duration: azalt ? 0 : 0.28, ease: 'easeOut' }}
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
      <span
        className="grid size-8 shrink-0 place-items-center rounded-lg"
        style={{ background: 'linear-gradient(135deg, var(--cta), var(--yaprak))' }}
      >
        <Icon name="sprout" size={17} color="#FFFFFF" />
      </span>
      {/* FİDAN marka gradyanı — orman→yaprak; bg-clip-text + text-transparent harfleri maskeler. */}
      <span
        className="lu-hide-narrow bg-clip-text font-display text-lg font-bold tracking-tight text-transparent"
        style={{ backgroundImage: 'linear-gradient(90deg, var(--vurgu), var(--yaprak))' }}
      >
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
        'kb-pill relative inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 py-1.5',
        'font-display text-[13px] font-semibold no-underline transition-colors duration-150',
        isActive && 'kb-aktif',
      )}
    >
      {({ isActive }) => (
        <>
          <Icon name={item.icon} size={16} color="currentColor" strokeWidth={isActive ? 2 : 1.7} />
          {item.label}
          {/* Aktif alt filiz çizgisi — pill'in altında ince yaprak vurgusu */}
          {isActive && (
            <m.span
              layoutId="nav-isik"
              aria-hidden
              className="absolute -bottom-px left-3 right-3 h-px rounded-full"
              style={{ background: 'linear-gradient(90deg, transparent, var(--yaprak), transparent)' }}
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
  const ham = profile?.name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'Öğrenci'
  const ad = ham.split(' ').map((w: string) => w ? w.charAt(0).toLocaleUpperCase('tr-TR') + w.slice(1) : w).join(' ')
  const [open, setOpen] = useState(false)
  const azalt = useReducedMotion()
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
        className="kb-profil glass-solid flex cursor-pointer items-center gap-2 rounded-full py-1 pl-1 pr-2 transition-colors"
      >
        {/* Avatar + canlı durum halkası. PingDot sayfada TEK (ping bütçesi). */}
        <span className="relative shrink-0">
          <span
            className="grid size-7 place-items-center rounded-full font-display text-xs font-bold text-white"
            style={{ background: 'linear-gradient(135deg, var(--cta), var(--vurgu))' }}
          >
            {ad.charAt(0).toUpperCase()}
          </span>
          <PingDot className="absolute -bottom-px -right-px rounded-full ring-2 ring-white/90 dark:ring-[#121C15]" />
        </span>
        <span className="lu-hide-narrow max-w-28 truncate font-display text-[13px] font-semibold" style={{ color: 'var(--metin1)' }}>{ad}</span>
        <Icon name="chevronDown" size={13} color="var(--metin3)" />
      </button>

      <AnimatePresence>
        {open && (
          <m.div
            initial={azalt ? false : { opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={azalt ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: azalt ? 0 : 0.16 }}
            className="glass absolute right-0 top-11 z-60 min-w-48 overflow-hidden rounded-xl shadow-card"
          >
            <div className="border-b px-3.5 py-3" style={{ borderColor: 'var(--cam-kenar)' }}>
              <div className="truncate font-display text-[13px] font-semibold" style={{ color: 'var(--metin1)' }}>{ad}</div>
              <div className="mt-0.5 truncate text-[11px]" style={{ color: 'var(--metin3)' }}>{user?.email}</div>
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
        danger ? 'kb-menu-danger' : 'kb-menu-item',
      )}
    >
      <Icon name={icon} size={15} color="currentColor" />
      {label}
    </button>
  )
}

/** Kabuk (TopBar) FİDAN sınıfları — hover/aktif durumları CSS değişkenleriyle (inline :hover olmaz). */
function KabukStil() {
  return (
    <style>{`
      .kb-ikonbtn { color: var(--metin3); }
      .kb-ikonbtn:hover { background: var(--ic); color: var(--metin1); }
      .kb-pill { color: var(--metin3); border-color: transparent; }
      .kb-pill:hover { background: var(--ic); color: var(--metin1); }
      .kb-pill.kb-aktif { border-color: color-mix(in srgb, var(--vurgu) 28%, transparent); background: color-mix(in srgb, var(--yaprak) 12%, transparent); color: var(--vurgu); }
      .kb-profil:hover { border-color: color-mix(in srgb, var(--yaprak) 35%, transparent); }
      .kb-menu-item { color: var(--metin2); }
      .kb-menu-item:hover { background: var(--ic); color: var(--metin1); }
      .kb-menu-danger { color: var(--yanlis); }
      .kb-menu-danger:hover { background: color-mix(in srgb, var(--yanlis) 10%, transparent); }
    `}</style>
  )
}
