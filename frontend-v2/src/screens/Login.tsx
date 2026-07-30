import { lazy, Suspense, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '../lib/auth'
import { useTheme } from '../lib/theme'
import { cn } from '../lib/cn'
import { Icon } from '../ui'

// Küre arkaplanı (Vanta GLOBE'un R3F portu) — LAZY: Login App.tsx'te statik import edilir,
// tembel olmasa three ana bundle'a düşerdi. Bu ekran hem tanıtım hem giriş kapısı.
const KureArkaplan = lazy(() => import('../components/KureArkaplan'))

/**
 * Giriş kapısı — Supabase Auth. Onaylı önizleme `docs/design/onizleme/giris.html` (2026-07-22) portu.
 * Sahne: `KureArkaplan` (Vanta GLOBE'un R3F portu) — eski three.js `Login3D` bu ekrandan çıkarıldı.
 * Kayıt: Ad Soyad + e-posta + şifre + ROL SEÇİMİ (+ öğrencide OPSİYONEL sınıf kodu).
 * Sınıf DÜZEYİ sorulmaz (YKS'ye özel); okul alanı yok.
 *
 * ⚠️ AÇIK ÖĞRETMEN KAYDI (kullanıcı kararı 2026-07-24 — 2026-07-23'ün başvuru akışı KALKTI):
 * "Öğretmenim" seçen hesap ANINDA öğretmen açılır. Yönetici onayı, başvuru bayrağı ve
 * `POST /ogretmen-basvuru` çağrısı bu ekrandan tümden çıkarıldı. Rolü DB trigger'ı
 * `handle_new_user` (migration 0024) `raw_user_meta_data.role`dan okur; öğretmene aynı
 * anda çakışmasız `class_code` + `is_approved=true` verir.
 *
 * ⚠️ Buradaki `role` bir DİLEKTİR, sözleşme değil: alan istemci-yazılabilir ve garanti
 * DB'dedir. Beyaz liste student|teacher — 'admin' bu kapıdan GEÇMEZ (0024/0016 çizgisi).
 * Öğretmen kaydının herkese açık olması bilinçli üründür; gerekçe ve kalan sınırlar
 * migration 0024'ün başlığında yazılı.
 */

/**
 * Supabase hata mesajını (yaygın olarak İngilizce) samimi Türkçe cümleye çevirir.
 * Yaygın kodlar eşlenir; bilinmeyen → NÖTR fallback (ham İngilizce gösterilmez, kod/sınıf
 * varlığı sızdırılmaz). "message-önce" düzeni korunur: kaynak yine err.message, yalnız yerelleşir.
 */
function supabaseHataTR(err: unknown): string {
  const m = ((err as { message?: string })?.message ?? '').toLowerCase()
  if (m.includes('invalid login credentials')) return 'E-posta ya da şifre hatalı. Kontrol edip tekrar dene.'
  if (m.includes('email not confirmed')) return 'E-postanı henüz onaylamadın — gelen kutundaki bağlantıya tıkla.'
  if (m.includes('already registered') || m.includes('already been registered') || m.includes('user already')) return 'Bu e-posta zaten kayıtlı. Giriş yapmayı dene.'
  if (m.includes('password should be at least') || m.includes('weak password')) return 'Şifre en az 6 karakter olmalı.'
  if (m.includes('unable to validate email') || m.includes('invalid format') || m.includes('invalid email')) return 'E-posta adresi geçersiz görünüyor.'
  if (m.includes('for security purposes') || m.includes('rate limit') || m.includes('too many') || m.includes('email rate')) return 'Çok sık denedin — birkaç saniye sonra tekrar dene.'
  if (m.includes('failed to fetch') || m.includes('network') || m.includes('load failed')) return 'Bağlantı kurulamadı — internetini kontrol edip tekrar dene.'
  return 'Bilgileri kontrol edip tekrar dene.'
}

export default function Login() {
  const { signIn, signUp } = useAuth()
  const { theme, toggle } = useTheme()
  // Tanıtım CTA'sı "Ücretsiz başla" → /giris?sekme=kayit KAYIT sekmesiyle açılır (GOREV-032).
  // Yalnız BAŞLANGIÇ modu: parametre yok/başka değer → mevcut davranış (giriş sekmesi);
  // sekme değiştirme ve auth mantığı değişmedi.
  const [params] = useSearchParams()
  const [mode, setMode] = useState<'in' | 'up'>(params.get('sekme') === 'kayit' ? 'up' : 'in')
  const [ad, setAd] = useState('')
  const [email, setEmail] = useState('')
  const [sifre, setSifre] = useState('')
  const [sinifKodu, setSinifKodu] = useState('')
  // Kayıt rolü — DB'ye dilek olarak gider; beyaz liste student|teacher (0024).
  const [rol, setRol] = useState<'student' | 'teacher'>('student')
  // YKS alanı — YALNIZ öğrencide anlamlı (0026). Ders listesini bu belirler: TYT dersleri
  // herkeste, AYT dersleri yalnız o alanda. Boş bırakılabilir; seçilmezse öğrenci yalnız
  // TYT derslerini görür ve alanını sonradan profilinden seçer.
  const [alan, setAlan] = useState<'sayisal' | 'sozel' | 'esit_agirlik' | ''>('')
  const [gizli, setGizli] = useState(true)
  const [busy, setBusy] = useState(false)
  const [hata, setHata] = useState<string | null>(null)

  const gonder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setHata(null)
    try {
      if (mode === 'in') {
        const { error } = await signIn(email.trim(), sifre)
        if (error) throw error
      } else {
        // auth.users.raw_user_meta_data → handle_new_user() (0024) profiles satırını kurar.
        // Rol buradan TAŞINIR: 'teacher' seçilirse hesap ANINDA öğretmen açılır (onay yok,
        // sınıf kodu trigger'da üretilir). Sınıf kodu alanı YALNIZ öğrencide anlamlı —
        // öğretmene kendi kodu verilir, birininkine katılmaz. Öğrenci katılımı ilk girişte
        // /sinif/katil'de yapılır (e-posta onayı öncesi yetkili çağrı atılamaz).
        const ek: Record<string, string> = { role: rol }
        if (rol === 'student' && sinifKodu.trim()) ek.class_code = sinifKodu.trim().toUpperCase()
        // Alan yalnız öğrencide taşınır; trigger (0026) öğretmen/yönetici satırında zaten NULL'lar.
        if (rol === 'student' && alan) ek.alan = alan

        const { error } = await signUp(email.trim(), sifre, ad.trim(), ek)
        if (error) throw error
        toast.success('Hesap oluşturuldu', {
          description:
            rol === 'teacher'
              ? 'E-postanı onayladıktan sonra giriş yap — öğretmen panelin hazır olacak. Sınıf kodunu Sınıf Panosu\'nda bulacaksın.'
              : sinifKodu.trim()
                ? 'E-postanı onayladıktan sonra giriş yap — sınıfına otomatik katılacaksın.'
                : 'E-postana gelen bağlantıyı onayladıktan sonra giriş yapabilirsin.',
        })
        setMode('in')
      }
    } catch (err: unknown) {
      // Supabase mesajı → samimi Türkçe (yaygın kodlar eşlenir; bilinmeyen → nötr fallback,
      // ham İngilizce gösterilmez; kod/sınıf varlığı sızdırılmaz).
      setHata(supabaseHataTR(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden" style={{ color: 'var(--metin1)' }}>
      <style>{`
        .lg-girdi { background: var(--ic); border: 1.5px solid var(--cizgi); color: var(--metin1); }
        .lg-girdi:focus { border-color: var(--yaprak); box-shadow: 0 0 0 3px color-mix(in srgb, var(--yaprak) 18%, transparent); }
        .lg-girdi::placeholder { color: var(--metin3); }
        .lg-btn { background: var(--cta); color: #fff; }
        .lg-btn:hover:not(:disabled) { box-shadow: var(--parilti); transform: translateY(-1px); }
        .lg-btn:active:not(:disabled) { transform: scale(0.98); }
        .lg-btn:disabled { opacity: 0.6; cursor: default; }
        .lg-sekme { color: var(--metin2); }
        .lg-sekme.lg-aktif { background: var(--cam); color: var(--metin1); box-shadow: 0 2px 8px rgba(24,49,33,0.08); }
        .lg-cikis { border: 1px solid var(--cam-kenar); background: var(--cam); color: var(--metin2); }
        @media (prefers-reduced-motion: no-preference) {
          .lg-kart { opacity: 0; transform: translateY(16px); animation: lg-belir 0.5s ease-out 0.1s forwards; }
          @keyframes lg-belir { to { opacity: 1; transform: none; } }
        }
      `}</style>

      {/* Tanıtım + giriş fonu — Vanta GLOBE küresi (yüklenene dek düz zemin) */}
      <Suspense fallback={<div aria-hidden className="pointer-events-none fixed inset-0 z-0" style={{ background: '#87c591' }} />}>
        <KureArkaplan className="z-0" />
      </Suspense>

      {/* Tema geçişi — Login kabuğun dışında, kendi düğmesi */}
      <button
        type="button"
        onClick={toggle}
        title={theme === 'light' ? 'Koyu tema' : 'Açık tema'}
        className="lg-cikis fixed right-4 top-4 z-10 grid size-10 cursor-pointer place-items-center rounded-xl backdrop-blur-md transition-colors"
      >
        <Icon name={theme === 'light' ? 'moon' : 'sun'} size={17} color="currentColor" />
      </button>

      <div className="relative z-[1] flex min-h-screen items-center gap-10 px-[clamp(16px,5vw,72px)] py-10">
        {/* ── Form ── */}
        <div className="w-[min(430px,100%)]">
          <form onSubmit={gonder} className="lg-kart glass rounded-3xl p-[30px] shadow-card">
            {/* Marka */}
            <span className="mb-5 flex items-center gap-2.5 font-display text-[21px] font-extrabold" style={{ color: 'var(--metin1)' }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                <path d="M12 21V9" stroke="var(--vurgu)" strokeWidth="2.2" strokeLinecap="round" />
                <path d="M12 12C12 8 9 5 4 5c0 5 3 8 8 8" fill="var(--adacayi)" />
                <path d="M12 9c0-3.5 2.5-6 7-6 0 4.5-2.5 7-7 7" fill="var(--yaprak)" />
              </svg>
              LearnUp
            </span>

            {/* Sekmeler */}
            <div className="mb-5 flex gap-1 rounded-xl p-1" style={{ background: 'var(--ic)' }} role="tablist">
              {(['in', 'up'] as const).map((mo) => (
                <button
                  key={mo}
                  type="button"
                  role="tab"
                  aria-selected={mode === mo}
                  onClick={() => { setMode(mo); setHata(null) }}
                  className={cn(
                    'lg-sekme flex-1 cursor-pointer rounded-[9px] py-2.5 font-sans text-[14px] font-semibold transition-all',
                    mode === mo && 'lg-aktif',
                  )}
                >
                  {mo === 'in' ? 'Giriş yap' : 'Hesap oluştur'}
                </button>
              ))}
            </div>

            {/* Rol seçimi — kayıt formunun İLK kararı: altındaki alanları o belirler. */}
            {mode === 'up' && (
              <div className="mb-3.5">
                <span className="mb-1.5 block text-[13px] font-semibold" style={{ color: 'var(--metin2)' }}>
                  Nasıl kaydolacaksın?
                </span>
                <div className="flex gap-1 rounded-xl p-1" style={{ background: 'var(--ic)' }} role="radiogroup" aria-label="Hesap türü">
                  {([
                    { v: 'student', etiket: 'Öğrenciyim', ikon: 'sprout' },
                    { v: 'teacher', etiket: 'Öğretmenim', ikon: 'book' },
                  ] as const).map((s) => (
                    <button
                      key={s.v}
                      type="button"
                      role="radio"
                      aria-checked={rol === s.v}
                      onClick={() => setRol(s.v)}
                      className={cn(
                        'lg-sekme flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[9px] py-2.5 font-sans text-[13.5px] font-semibold transition-all',
                        rol === s.v && 'lg-aktif',
                      )}
                    >
                      <Icon name={s.ikon} size={15} color="currentColor" />
                      {s.etiket}
                    </button>
                  ))}
                </div>
                {rol === 'teacher' && (
                  <p className="mt-2 rounded-xl px-3.5 py-2.5 text-[11.5px] leading-relaxed" style={{ background: 'color-mix(in srgb, var(--yaprak) 9%, transparent)', color: 'var(--metin2)' }}>
                    Öğretmen panelin <strong style={{ color: 'var(--metin1)' }}>hemen</strong> açılır — onay beklemezsin.
                    Sınıf kodun otomatik üretilir; öğrencilerin o kodla sınıfına katılır.
                  </p>
                )}
              </div>
            )}

            {mode === 'up' && (
              <Alan label="Ad Soyad" value={ad} onChange={setAd} placeholder="Adın Soyadın" autoComplete="name" />
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
                  className="grid size-9 cursor-pointer place-items-center rounded-lg transition-colors"
                  style={{ color: 'var(--metin3)' }}
                >
                  <Icon name={gizli ? 'eye' : 'eyeOff'} size={17} color="currentColor" />
                </button>
              }
            />

            {/* YKS alanı — YALNIZ öğrencide. Ders listesini bu belirler (0026): TYT dersleri
                herkeste görünür, AYT dersleri yalnız seçilen alanda. Zorunlu DEĞİL: alanına
                henüz karar vermemiş 9. sınıf öğrencisini kayıt ekranında karar vermeye
                zorlamak, yanlış seçip sonra şaşırmasına yol açardı. */}
            {mode === 'up' && rol === 'student' && (
              <div className="mb-3.5">
                <span className="mb-1.5 block text-[13px] font-semibold" style={{ color: 'var(--metin2)' }}>
                  Alanın (istersen sonra seç)
                </span>
                <div className="flex gap-1 rounded-xl p-1" style={{ background: 'var(--ic)' }} role="radiogroup" aria-label="YKS alanı">
                  {([
                    { v: 'sayisal', etiket: 'Sayısal' },
                    { v: 'esit_agirlik', etiket: 'Eşit Ağırlık' },
                    { v: 'sozel', etiket: 'Sözel' },
                  ] as const).map((s) => (
                    <button
                      key={s.v}
                      type="button"
                      role="radio"
                      aria-checked={alan === s.v}
                      // Aynı seçeneğe tekrar basmak seçimi KALDIRIR: alan zorunlu değil ve
                      // yanlışlıkla seçen öğrencinin geri dönebilmesi gerekir.
                      onClick={() => setAlan((a) => (a === s.v ? '' : s.v))}
                      className={cn(
                        'lg-sekme flex flex-1 cursor-pointer items-center justify-center rounded-[9px] py-2.5 font-sans text-[13px] font-semibold transition-all',
                        alan === s.v && 'lg-aktif',
                      )}
                    >
                      {s.etiket}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] leading-relaxed" style={{ color: 'var(--metin3)' }}>
                  TYT dersleri herkeste görünür. Alanını seçersen AYT dersleri de eklenir.
                </p>
              </div>
            )}

            {/* Sınıf kodu YALNIZ öğrencide: öğretmen bir sınıfa katılmaz, kendi kodunu alır. */}
            {mode === 'up' && rol === 'student' && (
              <>
                <Alan
                  label="Sınıf kodu (varsa)"
                  value={sinifKodu}
                  onChange={(v) => setSinifKodu(v.toUpperCase())}
                  placeholder="Öğretmeninin verdiği kod"
                  required={false}
                />
                <p className="-mt-1.5 text-[11px] leading-relaxed" style={{ color: 'var(--metin3)' }}>
                  Öğretmenin verdiyse gir — seni sınıfına bağlar. Boş bırakabilirsin; sonra Profil'den de katılabilirsin.
                </p>
              </>
            )}

            {mode === 'in' && (
              <div className="mt-3 text-right text-[13px]">
                <span style={{ color: 'var(--metin3)' }}>Hesabın güvende</span>
              </div>
            )}

            {hata && (
              <div
                role="alert"
                className="mt-3.5 flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-[13px] font-medium"
                style={{ background: 'color-mix(in srgb, var(--yanlis) 10%, transparent)', color: 'var(--yanlis)' }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v5M12 16.5h.01" strokeLinecap="round" />
                </svg>
                {hata}
              </div>
            )}

            <button type="submit" disabled={busy} className="lg-btn mt-[18px] w-full cursor-pointer rounded-xl py-3.5 font-sans text-[15px] font-semibold transition-[box-shadow,transform]">
              {busy ? 'Bekle…' : mode === 'in' ? 'Giriş yap' : 'Hesap oluştur'}
            </button>

            <p className="mt-4 text-center text-[13.5px]" style={{ color: 'var(--metin2)' }}>
              {mode === 'in' ? (
                <>Hesabın yok mu?{' '}
                  <button type="button" onClick={() => { setMode('up'); setHata(null) }} className="cursor-pointer font-semibold" style={{ color: 'var(--vurgu)' }}>
                    Hemen oluştur
                  </button>
                </>
              ) : (
                <>Zaten hesabın var mı?{' '}
                  <button type="button" onClick={() => { setMode('in'); setHata(null) }} className="cursor-pointer font-semibold" style={{ color: 'var(--vurgu)' }}>
                    Giriş yap
                  </button>
                </>
              )}
            </p>
          </form>

          <p className="mt-4 text-center text-[11.5px]" style={{ color: 'var(--metin3)' }}>
            Öğretmenin verdiği hesapla da giriş yapabilirsin.
          </p>
        </div>

        {/* ── Slogan (yalnız geniş ekran) ──
            İÇERİK SÖZLEŞMESİ (Tanitim.tsx:7-11 ile AYNI): "ÖSYM formatına en yakın" yalnız
            BİÇİM iddiasıdır (şık düzeni · çeldirici mantığı · soru dili). Çıkmış soru YAYINI
            vaadi YOK (telif kararı 2026-07-22) ve resmî bağ/onay iması taşımaz. Bahçe/fidan
            metaforu buradan kaldırıldı (kullanıcı kararı 2026-07-24). */}
        <div className="hidden flex-1 lg:block">
          <h2 className="font-display text-[clamp(30px,3.6vw,44px)] font-extrabold leading-[1.2] tracking-tight" style={{ color: 'var(--metin1)' }}>
            ÖSYM formatına<br /><span style={{ color: 'var(--vurgu)' }}>en yakın sorular.</span>
          </h2>
          <p className="mt-3.5 max-w-[440px] text-[16.5px]" style={{ color: 'var(--metin2)' }}>
            Şık düzeni, çeldirici mantığı ve zorluk dengesi gerçek sınav standardında kurulur;
            her soru havuza girmeden çift kontrolden geçer. Üstelik hepsi senin zayıf
            konularına göre önüne gelir.
          </p>
        </div>
      </div>
    </div>
  )
}

/**
 * Form alanı.
 *
 * ⚠️ `required` VARSAYILAN true ama AÇILABİLİR olmalı: eskiden koşulsuz basılıyordu ve
 * "Sınıf kodu (varsa)" alanı — etiketi de alt metni de opsiyonel dediği hâlde — tarayıcı
 * tarafından ZORUNLU tutuluyordu. Kod girmeyen öğrenci kaydolamıyordu.
 */
function Alan({ label, value, onChange, type = 'text', placeholder, autoComplete, sonEk, required = true }: {
  label: string; value: string; onChange: (v: string) => void
  type?: string; placeholder?: string; autoComplete?: string; sonEk?: React.ReactNode
  required?: boolean
}) {
  return (
    <label className="mb-3.5 block">
      <span className="mb-1.5 block text-[13px] font-semibold" style={{ color: 'var(--metin2)' }}>{label}</span>
      <div className="relative flex items-center">
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
          className="lg-girdi w-full rounded-xl px-3.5 py-3 text-[14.5px] outline-none transition-[border-color,box-shadow]"
        />
        {sonEk && <span className="absolute right-1.5">{sonEk}</span>}
      </div>
    </label>
  )
}
