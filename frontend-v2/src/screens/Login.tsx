import { lazy, Suspense, useMemo, useState } from 'react'
import { m } from 'framer-motion'
import { toast } from 'sonner'
import { useAuth } from '../lib/auth'
import { useTheme } from '../lib/theme'
import { cn } from '../lib/cn'
import { Icon } from '../ui'
import { MotionRoot } from '../components/fx'
import { GlowButton } from '../components/ui'
import { Lighthouse } from '../components/Lighthouse'

// 3D kahraman sahne — lazy (three yalnız bu zincirde); WebGL yoksa SVG sahne kalır
const Login3D = lazy(() => import('../components/Login3D'))

function webglVarMi(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch { return false }
}

/** Giriş kapısı — Supabase Auth. Eski frontend ile aynı kullanıcılar geçerli.
    Sahne: katmanlı deniz (SVG, animasyonlu) + cam form kartı. 3D yükseltme Faz 15'te. */
export default function Login() {
  const { signIn, signUp } = useAuth()
  const { theme } = useTheme()
  const uclu = useMemo(() =>
    webglVarMi() && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches, [])
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [rol, setRol] = useState<'student' | 'teacher'>('student')
  const [ad, setAd] = useState('')
  const [email, setEmail] = useState('')
  const [sifre, setSifre] = useState('')
  const [sinif, setSinif] = useState('')       // öğrenci: kaçıncı sınıf
  const [sinifKodu, setSinifKodu] = useState('') // öğrenci: katılmak istediği sınıf (opsiyonel)
  const [okul, setOkul] = useState('')          // öğretmen: kurum
  const [gizli, setGizli] = useState(true)
  const [busy, setBusy] = useState(false)

  const gonder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      if (mode === 'in') {
        const { error } = await signIn(email.trim(), sifre)
        if (error) throw error
      } else {
        // Bu alanlar auth.users.raw_user_meta_data'ya gider; profiles satırını
        // handle_new_user() trigger'ı buradan kurar. 'admin' beyaz listede YOK.
        const ek: Record<string, string> = { role: rol }
        if (rol === 'student') {
          if (sinif) ek.grade = sinif
          // Katılım burada YAPILMAZ, yalnız taşınır: e-posta onayı öncesi oturum
          // yok, yetkili çağrı atılamaz. İlk girişte /sinif/katil'e gönderilir.
          if (sinifKodu.trim()) ek.class_code = sinifKodu.trim().toUpperCase()
        } else if (okul.trim()) {
          ek.school = okul.trim()
        }

        const { error } = await signUp(email.trim(), sifre, ad.trim(), ek)
        if (error) throw error
        toast.success('Hesap oluşturuldu', {
          description:
            rol === 'teacher'
              ? 'E-postanı onayladıktan sonra giriş yap — sınıf kodun otomatik oluşturulacak.'
              : sinifKodu.trim()
                ? 'E-postanı onayladıktan sonra giriş yap — sınıfına otomatik katılacaksın.'
                : 'E-postana gelen bağlantıyı onayladıktan sonra giriş yapabilirsin.',
        })
        setMode('in')
      }
    } catch (err: unknown) {
      toast.error(mode === 'in' ? 'Giriş yapılamadı' : 'Kayıt tamamlanamadı', {
        description: (err as Error)?.message || 'Bilgileri kontrol edip tekrar dene.',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <MotionRoot>
      <div className="relative grid min-h-screen place-items-center overflow-hidden bg-gradient-to-b from-sky-100 via-shore-50 to-sky-200/60 px-5 py-10 dark:from-[#071B30] dark:via-ocean-900 dark:to-[#04101C]">
        {uclu ? (
          <Suspense fallback={<DenizSahnesi />}>
            <Login3D koyu={theme === 'dark'} />
          </Suspense>
        ) : (
          <DenizSahnesi />
        )}

        <m.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.21, 0.65, 0.32, 1] }}
          className="relative w-full max-w-95"
        >
          {/* Marka */}
          <div className="mb-7 text-center">
            <div className="mx-auto mb-3.5 grid size-16 place-items-center rounded-[20px] bg-gradient-to-br from-sky-600 to-cyan-500 shadow-glow-sky">
              <Icon name="anchor" size={30} color="#FFFFFF" strokeWidth={1.6} />
            </div>
            <div className="bg-gradient-to-r from-sky-700 to-cyan-600 bg-clip-text font-display text-[27px] font-bold tracking-tight text-transparent dark:from-sky-400 dark:to-cyan-300">
              LearnUp
            </div>
            <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">
              YKS yolculuğunda Koç seninle
            </p>
          </div>

          {/* Kart */}
          <form onSubmit={gonder} className="glass rounded-3xl p-6 shadow-card">
            {/* Sekmeler — kayan cam zemin */}
            <div className="mb-5 flex gap-1 rounded-xl bg-shore-100/80 p-1 dark:bg-ocean-950/60">
              {(['in', 'up'] as const).map((mo) => (
                <button
                  key={mo}
                  type="button"
                  onClick={() => setMode(mo)}
                  className={cn(
                    'relative flex-1 cursor-pointer rounded-[9px] py-2 font-display text-[13.5px] font-bold transition-colors',
                    mode === mo
                      ? 'text-slate-800 dark:text-slate-100'
                      : 'text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300',
                  )}
                >
                  {mode === mo && (
                    <m.span
                      layoutId="login-sekme"
                      className="absolute inset-0 rounded-[9px] bg-white shadow-sm dark:bg-ocean-800"
                      transition={{ type: 'spring', stiffness: 460, damping: 38 }}
                    />
                  )}
                  <span className="relative">{mo === 'in' ? 'Giriş Yap' : 'Kaydol'}</span>
                </button>
              ))}
            </div>

            {mode === 'up' && (
              <>
                {/* ROL — kayıt akışının belirleyici adımı: öğretmene sınıf kodu
                    üretilir, öğrenciye sınıfa katılma alanı açılır. */}
                <div className="mb-4">
                  <span className="mb-1.5 block font-display text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Hesap türü
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      ['student', 'Öğrenci', 'sprout', 'Ders çalışır, ödev alır'],
                      ['teacher', 'Öğretmen', 'waves', 'Sınıf kurar, ödev gönderir'],
                    ] as const).map(([deger, etiket, ikon, aciklama]) => (
                      <button
                        key={deger}
                        type="button"
                        aria-pressed={rol === deger}
                        onClick={() => setRol(deger)}
                        className={cn(
                          'cursor-pointer rounded-xl border px-3 py-2.5 text-left transition-all duration-200',
                          rol === deger
                            ? 'border-sky-500/50 bg-sky-500/10 shadow-glow-sky'
                            : 'border-slate-500/20 hover:border-sky-500/30 dark:border-sky-500/15',
                        )}
                      >
                        <span className="flex items-center gap-1.5">
                          <Icon
                            name={ikon}
                            size={15}
                            color="currentColor"
                            style={{ opacity: rol === deger ? 1 : 0.5 }}
                          />
                          <span
                            className={cn(
                              'font-display text-[13px] font-bold',
                              rol === deger
                                ? 'text-sky-700 dark:text-sky-300'
                                : 'text-slate-500 dark:text-slate-400',
                            )}
                          >
                            {etiket}
                          </span>
                        </span>
                        <span className="mt-0.5 block text-[10.5px] leading-snug text-slate-400 dark:text-slate-500">
                          {aciklama}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <Alan label="Ad" value={ad} onChange={setAd} placeholder="Adın" autoComplete="name" />

                {rol === 'student' ? (
                  <>
                    <div className="mb-3.5">
                      <span className="mb-1.5 block font-display text-xs font-semibold text-slate-500 dark:text-slate-400">
                        Sınıf
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {['9', '10', '11', '12', 'Mezun'].map((s) => (
                          <button
                            key={s}
                            type="button"
                            aria-pressed={sinif === s}
                            onClick={() => setSinif(sinif === s ? '' : s)}
                            className={cn(
                              'cursor-pointer rounded-lg border px-3 py-1.5 font-display text-[12.5px] font-semibold transition-colors',
                              sinif === s
                                ? 'border-sky-600/40 bg-sky-500/10 text-sky-700 dark:border-sky-400/30 dark:text-sky-300'
                                : 'border-slate-500/20 text-slate-400 hover:text-slate-600 dark:border-sky-500/15 dark:hover:text-slate-300',
                            )}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                    <Alan
                      label="Sınıf kodu (varsa)"
                      value={sinifKodu}
                      onChange={(v) => setSinifKodu(v.toUpperCase())}
                      placeholder="Öğretmeninin verdiği kod"
                    />
                    <p className="-mt-2 mb-3.5 text-[10.5px] leading-relaxed text-slate-400 dark:text-slate-500">
                      Şimdi girmezsen sorun değil — Profil ekranından istediğin zaman katılabilirsin.
                    </p>
                  </>
                ) : (
                  <>
                    <Alan
                      label="Okul / kurum (opsiyonel)"
                      value={okul}
                      onChange={setOkul}
                      placeholder="Örn. Atatürk Anadolu Lisesi"
                    />
                    <p className="-mt-2 mb-3.5 text-[10.5px] leading-relaxed text-slate-400 dark:text-slate-500">
                      Kaydolduğunda sana 6 haneli bir sınıf kodu üretilir; öğrencilerin o kodla katılır.
                    </p>
                  </>
                )}
              </>
            )}
            <Alan label="E-posta" type="email" value={email} onChange={setEmail} placeholder="ornek@eposta.com" autoComplete="email" />
            <Alan
              label="Şifre"
              type={gizli ? 'password' : 'text'}
              value={sifre}
              onChange={setSifre}
              placeholder="••••••••"
              autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
              sonEk={
                <button
                  type="button"
                  onClick={() => setGizli((g) => !g)}
                  title={gizli ? 'Şifreyi göster' : 'Şifreyi gizle'}
                  className="grid size-8 cursor-pointer place-items-center rounded-lg text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <Icon name={gizli ? 'eye' : 'eyeOff'} size={17} color="currentColor" />
                </button>
              }
            />

            <GlowButton full size="lg" disabled={busy} className="mt-1.5">
              {busy ? 'Bekle…' : mode === 'in' ? 'Güverteye çık' : 'Yolculuğa başla'}
            </GlowButton>
          </form>

          <p className="mt-4 text-center text-[11.5px] text-slate-400 dark:text-slate-500">
            Öğretmenin verdiği hesapla da giriş yapabilirsin.
          </p>
        </m.div>
      </div>
    </MotionRoot>
  )
}

function Alan({ label, value, onChange, type = 'text', placeholder, autoComplete, sonEk }: {
  label: string; value: string; onChange: (v: string) => void
  type?: string; placeholder?: string; autoComplete?: string; sonEk?: React.ReactNode
}) {
  return (
    <label className="mb-3.5 block">
      <span className="mb-1.5 block font-display text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</span>
      <div className="flex items-center gap-1 rounded-xl border border-slate-500/20 bg-white/70 pr-1.5 transition-colors focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-500/20 dark:border-sky-500/15 dark:bg-ocean-950/50 dark:focus-within:border-sky-400">
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required
          className="w-full bg-transparent px-3.5 py-2.5 text-[14.5px] text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-600"
        />
        {sonEk}
      </div>
    </label>
  )
}

/** Katmanlı deniz sahnesi — fener + akan dalgalar + koyu temada yıldızlar. */
function DenizSahnesi() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Yıldızlar — yalnız koyu temada görünür */}
      <svg className="absolute inset-x-0 top-0 hidden h-64 w-full dark:block" viewBox="0 0 800 200" preserveAspectRatio="xMidYMin slice">
        {[[60, 40, 1.2], [150, 90, 0.9], [260, 30, 1.4], [370, 70, 1], [470, 45, 0.8], [560, 100, 1.2], [660, 35, 1], [740, 80, 1.3], [210, 140, 0.9], [630, 150, 0.8]].map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r} fill="#CFE0F5">
            <animate attributeName="opacity" values="0.25;0.9;0.25" dur={`${2.4 + (i % 4) * 0.7}s`} repeatCount="indefinite" />
          </circle>
        ))}
      </svg>

      {/* Fener — sol altta, sahneye demirli */}
      <div className="absolute bottom-[9%] left-[6%] hidden opacity-80 md:block">
        <Lighthouse size={92} />
      </div>

      {/* Akan dalga katmanları — alt kıyı */}
      <svg className="absolute inset-x-0 bottom-0 h-40 w-full" viewBox="0 0 900 160" preserveAspectRatio="none">
        {[
          { y: 60, dur: 11, cls: 'fill-sky-500/10 dark:fill-sky-400/10' },
          { y: 92, dur: 15, cls: 'fill-sky-600/10 dark:fill-sky-500/10' },
          { y: 122, dur: 19, cls: 'fill-cyan-500/15 dark:fill-cyan-400/10' },
        ].map((w, i) => (
          <path key={i} className={w.cls}
            d={`M0 ${w.y} q 75 -22 150 0 t 150 0 t 150 0 t 150 0 t 150 0 t 150 0 V160 H0 Z`}>
            <animate attributeName="d" dur={`${w.dur}s`} repeatCount="indefinite"
              values={`M0 ${w.y} q 75 -22 150 0 t 150 0 t 150 0 t 150 0 t 150 0 t 150 0 V160 H0 Z;
                       M0 ${w.y} q 75 22 150 0 t 150 0 t 150 0 t 150 0 t 150 0 t 150 0 V160 H0 Z;
                       M0 ${w.y} q 75 -22 150 0 t 150 0 t 150 0 t 150 0 t 150 0 t 150 0 V160 H0 Z`} />
          </path>
        ))}
      </svg>
    </div>
  )
}
