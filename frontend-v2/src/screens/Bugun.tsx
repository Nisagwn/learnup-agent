import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useReducedMotion } from 'framer-motion'
import { Icon, SUBJECTS } from '../ui'
import { useAuth } from '../lib/auth'
import { useAsync } from '../lib/useAsync'
import { apiGet, apiPost } from '../lib/api.js'
import { selam, dersAnahtar, sayi } from '../lib/format'
import { kalanGun } from '../lib/hedefTarih'
import { TIER_TR, type ReviewYaniti, type RontgenYanit, type CozSpec } from '../lib/types'
import { CanliSayi } from '../components/cekirdek'
import { Reveal } from '../components/fx'
import { PlanYolu, type Durak } from '../components/PlanYolu'
import { OdakZamanlayici, bugunkuOdakDk } from '../components/OdakZamanlayici'

/* ═══════════════════════════════════════════════════════════════════════════
   BUGÜN — onaylı v4 önizleme (`docs/design/onizleme/bugun.html`) portu.
   Sol: günlük hedef HERO (halka + tek birincil "Soru Çöz") · Plan YOL görünümü ·
        Ustalık özeti (tek-renk ısı şeridi). Sağ: Tekrar · Odak Zamanlayıcısı ·
        Lig. Veri wiring KORUNDU: /gamification/daily · /practice/suggest ·
        /questions/ai/topics · /mastery/rontgen · /practice/review.
   ═══════════════════════════════════════════════════════════════════════════ */

const kisalt = (s: string, n = 44) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s)

const buyukHarf = (s: string) =>
  s.split(' ').map((w) => (w ? w.charAt(0).toLocaleUpperCase('tr-TR') + w.slice(1) : w)).join(' ')

const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
const GUNLER = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi']

/** Çöz'ün yazdığı yarım-blok oturumu (localStorage) — hero'daki "yarım kalan test". */
export interface DevamKaydi {
  spec: CozSpec
  idx: number
  toplam: number
  zaman: number
}

export function devamKaydiOku(): DevamKaydi | null {
  try {
    const raw = localStorage.getItem('learnup.devam')
    if (!raw) return null
    const d = JSON.parse(raw) as DevamKaydi
    if (!d?.spec || Date.now() - (d.zaman ?? 0) > 24 * 3_600_000) return null
    if (typeof d.idx !== 'number' || d.idx <= 0 || d.idx >= (d.toplam ?? 0)) return null
    return d
  } catch { return null }
}

export function gunlukHedef(): number {
  try {
    const n = Number(localStorage.getItem('learnup.hedef'))
    return Number.isFinite(n) && n >= 1 ? n : 10
  } catch { return 10 }
}

const dersKisa = (subject: string) => SUBJECTS[dersAnahtar(subject)]?.short ?? subject
const dersRenk = (subject: string) => SUBJECTS[dersAnahtar(subject)]?.color ?? 'var(--vurgu)'

const DERSLER: [string, string][] = [
  ['mat', 'MAT'], ['geo', 'GEO'], ['fiz', 'FİZ'], ['kim', 'KİM'], ['bio', 'BİY'], ['trk', 'TRK'], ['tar', 'TAR'],
]

export function Bugun() {
  const nav = useNavigate()
  const { profile, user } = useAuth()
  const ad = buyukHarf((profile?.name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'Öğrenci').split(' ')[0])

  const gami = useAsync<any>(() => apiPost('/gamification/daily', {}), [])
  const oneri = useAsync<any>(() => apiGet('/practice/suggest'), [])
  const konular = useAsync<any>(() => apiGet('/questions/ai/topics'), [])
  const rontgen = useAsync<RontgenYanit>(() => apiGet('/mastery/rontgen'), [])
  const review = useAsync<ReviewYaniti>(() => apiGet('/practice/review'), [])

  const G = gami.data?.gamification
  const odak = oneri.data?.kazanim
  const seri = G?.streak?.count ?? 0
  const devam = useMemo(devamKaydiOku, [])
  const hedef = gunlukHedef()
  const odakDk = bugunkuOdakDk()

  const bugunCozulen = useMemo(() => {
    const bugun = new Date().toLocaleDateString('en-CA')
    return (rontgen.data?.trend ?? []).find((g) => g.date === bugun)?.solved ?? 0
  }, [rontgen.data])

  const dogruluk = useMemo(() => {
    const t = G?.totalSolved ?? 0
    return t > 0 ? Math.round(100 * (G?.correctAnswers ?? 0) / t) : null
  }, [G])

  const siradaki = useMemo(() => {
    const hepsi: any[] = (konular.data?.subjects ?? []).flatMap((s: any) => s.topics)
    return hepsi.filter((k) => k.kazanimId !== odak?.kazanimId).slice(0, 2)
  }, [konular.data, odak?.kazanimId])

  const rontgenBos = !rontgen.loading && (rontgen.data?.nodes?.length ?? 0) === 0

  const isiSerit = useMemo(() => DERSLER.map(([key, kisa]) => {
    const dn = (rontgen.data?.nodes ?? []).filter((n) => dersAnahtar(n.subject) === key)
    if (!dn.length) return { kisa, ton: 'var(--v0)', olcumYok: true }
    const ort = dn.reduce((s, n) => s + n.mastery, 0) / dn.length
    const ton = ort < 0.25 ? 'var(--v1)' : ort < 0.5 ? 'var(--v2)' : ort < 0.75 ? 'var(--v3)' : 'var(--v4)'
    return { kisa, ton, olcumYok: false }
  }), [rontgen.data])

  const soruCoz = () => {
    if (rontgenBos) return nav('/coz', { state: { source: 'tanisma', title: 'Tanışma Sınavı' } })
    if (odak) return nav('/coz', { state: { source: 'ai', kazanimId: odak.kazanimId, subject: odak.subject, title: odak.title } })
    nav('/coz', { state: { source: 'ai' } })
  }

  const duraklar: Durak[] = useMemo(() => {
    if (!odak) return []
    const d: Durak[] = [
      { tip: 'aktif', no: 1, dersKisa: dersKisa(odak.subject), dersRenk: dersRenk(odak.subject), baslik: kisalt(odak.title), detay: `${odak.count} soru · şimdi`, onDevam: soruCoz },
    ]
    siradaki.forEach((s, i) => d.push({
      tip: 'bekle', no: i + 2, dersKisa: dersKisa(s.subject), dersRenk: dersRenk(s.subject), baslik: kisalt(s.title), detay: `${s.count} soru · sırada`,
    }))
    d.push({ tip: 'hedef', baslik: 'Günlük Hedef', detay: `${hedef} soru · fidanın büyür` })
    return d
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [odak, siradaki, hedef])

  const bugun = new Date()
  const heroTamam = bugunCozulen >= hedef && bugunCozulen > 0

  return (
    <div className="mx-auto max-w-[1152px] px-[clamp(16px,3.5vw,44px)] pb-20 pt-9">
      <style>{`
        .bg-kart { background: var(--cam); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
          border: 1px solid var(--cam-kenar); border-radius: 20px; padding: 22px; box-shadow: var(--golge);
          position: relative; overflow: hidden; transition: transform .2s ease, box-shadow .2s ease; }
        .bg-kart:hover { transform: translateY(-3px); box-shadow: var(--golge-h); }
        .bg-cip { display: inline-flex; align-items: center; gap: 6px; padding: 4px 11px; border-radius: 12px;
          font-size: 12.5px; font-weight: 600; background: color-mix(in srgb, var(--adacayi) 18%, transparent); color: var(--vurgu); }
        .bg-cip.sicak { background: color-mix(in srgb, var(--toprak) 22%, transparent); color: color-mix(in srgb, var(--toprak) 72%, var(--metin1)); }
        .bg-etiket { font-family: 'JetBrains Mono', monospace; font-size: 10.5px; letter-spacing: .08em;
          text-transform: uppercase; color: var(--metin3); font-weight: 500; }
        .bg-sayi { font-family: Outfit, sans-serif; font-weight: 700; font-size: 26px; margin-top: 3px; color: var(--metin1); }
        .bg-sayi small { font-size: 13px; color: var(--metin2); font-weight: 500; }
        .bg-h2 { font-family: Outfit, sans-serif; font-weight: 700; font-size: 17.5px; color: var(--metin1); }
        .bg-bikon { width: 30px; height: 30px; border-radius: 10px; display: grid; place-items: center; flex: 0 0 auto; }
        .bg-bikon svg { width: 16px; height: 16px; }
        .bg-aciklama { color: var(--metin2); font-size: 14px; }
        .bg-cta { border: none; cursor: pointer; border-radius: 12px; padding: 12px 20px; font-family: Inter, sans-serif;
          font-weight: 600; font-size: 14.5px; display: inline-flex; align-items: center; gap: 8px; background: var(--cta); color: #fff;
          transition: box-shadow .2s, transform .15s; }
        .bg-cta:hover { box-shadow: var(--parilti); transform: translateY(-1px); }
        .bg-cta:active { transform: scale(.98); }
        .bg-dis { border: 1px solid color-mix(in srgb, var(--vurgu) 35%, transparent); cursor: pointer; border-radius: 12px;
          padding: 11px 16px; font-family: Inter, sans-serif; font-weight: 600; font-size: 13.5px; background: transparent; color: var(--vurgu);
          transition: background .15s; }
        .bg-dis:hover { background: var(--ic); }
        .bg-mini { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 9px 0;
          font-size: 14px; color: var(--metin2); border-top: 1px solid var(--cizgi); }
        .bg-mini:first-of-type { border-top: none; }
        .bg-mini b { color: var(--metin1); }
        .bg-rozet { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; }
        .bg-rozet.dogru { background: color-mix(in srgb, var(--dogru) 14%, transparent); color: var(--dogru); }
        .bg-ilerleme { height: 8px; border-radius: 12px; background: var(--ic); overflow: hidden; margin-top: 8px; }
        .bg-ilerleme i { display: block; height: 100%; border-radius: 12px; background: linear-gradient(90deg, var(--adacayi), var(--yaprak)); }
        @media (prefers-reduced-motion: no-preference) {
          .bg-fidan { transform-origin: 50% 100%; animation: bg-salla 4s ease-in-out infinite; }
          @keyframes bg-salla { 0%,100% { transform: rotate(-2.5deg) } 50% { transform: rotate(2.5deg) } }
        }
      `}</style>

      {/* ── Başlık ── */}
      <Reveal>
        <header>
          <h1 className="font-display text-[clamp(27px,3vw,33px)] font-extrabold tracking-tight" style={{ color: 'var(--metin1)' }}>
            {selam()}, {ad}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2.5 text-[14.5px]" style={{ color: 'var(--metin2)' }}>
            <span>{GUNLER[bugun.getDay()]}, {bugun.getDate()} {AYLAR[bugun.getMonth()]}</span>
            <span className="bg-cip">YKS'ye {kalanGun()} gün</span>
            {seri > 0 && (
              <span className="bg-cip sicak">
                <svg className="bg-fidan" width="14" height="14" viewBox="0 0 24 24">
                  <path d="M12 22v-9" stroke="#A9713F" strokeWidth="2" strokeLinecap="round" />
                  <path d="M12 13C12 9 9 6 4 6c0 4.5 3.5 7 8 7" fill="#4FA56F" />
                  <path d="M12 11c0-3 2-5 6.5-5C18.5 9.5 16 11.5 12 11.5" fill="#84A98C" />
                </svg>
                {seri} gün seri
              </span>
            )}
          </div>
        </header>
      </Reveal>

      {/* ── 4 KPI ── */}
      <section className="mt-6 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]" aria-label="Bugünün özeti">
        <Reveal delay={0.04}>
          <div className="bg-kart"><div className="bg-etiket">Bugün Çözülen</div><div className="bg-sayi"><CanliSayi value={bugunCozulen} /> <small>soru</small></div></div>
        </Reveal>
        <Reveal delay={0.08}>
          <div className="bg-kart">
            <div className="bg-etiket">Doğruluk</div>
            <div className="bg-sayi">{dogruluk != null ? <>%<CanliSayi value={dogruluk} /></> : <span style={{ color: 'var(--metin3)' }}>—</span>}</div>
          </div>
        </Reveal>
        <Reveal delay={0.12}>
          <div className="bg-kart"><div className="bg-etiket">Çalışma Süresi</div><div className="bg-sayi"><CanliSayi value={odakDk} /> <small>dk</small></div></div>
        </Reveal>
        <Reveal delay={0.16}>
          <div className="bg-kart"><div className="bg-etiket">Seri</div><div className="bg-sayi"><CanliSayi value={seri} /> <small>gün</small></div></div>
        </Reveal>
      </section>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
        {/* ════════ SOL ════════ */}
        <div className="flex min-w-0 flex-col gap-5">
          {/* Günlük hedef HERO */}
          <Reveal delay={0.08}>
            <section className="bg-kart" aria-label="Günlük hedef">
              <div className="flex flex-wrap items-center gap-[26px]">
                <HedefHalka etiket={`${bugunCozulen}/${hedef}`} oran={hedef > 0 ? bugunCozulen / hedef : 0} />
                <div className="min-w-[220px] flex-1">
                  <h2 className="bg-h2">
                    {heroTamam ? 'Günlük hedef tamam 🌿' : rontgenBos ? 'Hadi başlayalım 🌱' : 'Bugün harika gidiyorsun 🌿'}
                  </h2>
                  <p className="bg-aciklama mt-1.5">
                    {heroTamam
                      ? 'Hedefi tamamladın — istersen devam et, fidanın büyüsün.'
                      : rontgenBos
                        ? 'Motoru tanıştır: 10 karma soruda ustalık haritan çıksın.'
                        : odak
                          ? `Hedefe ${Math.max(0, hedef - bugunCozulen)} soru kaldı. Planındaki ${dersKisa(odak.subject)} bloğuyla bitirebilirsin.`
                          : `Hedefe ${Math.max(0, hedef - bugunCozulen)} soru kaldı. Soru havuzu dolunca planın belirir.`}
                  </p>
                  <div className="mt-3.5 flex flex-wrap gap-2.5">
                    <button className="bg-cta" onClick={soruCoz}>
                      <Icon name="bolt" size={16} color="#fff" /> {rontgenBos ? 'Tanışma Sınavına Başla' : 'Soru Çöz'}
                    </button>
                    {devam && (
                      <button className="bg-dis" onClick={() => nav('/coz', { state: { ...devam.spec, startIndex: devam.idx } })}>
                        Yarım kalan teste devam — {devam.idx}/{devam.toplam}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </section>
          </Reveal>

          {/* Bugünün Planı — YOL */}
          <Reveal delay={0.12}>
            <section className="bg-kart" aria-label="Bugünün planı">
              <div className="mb-1.5 flex items-center gap-2.5">
                <span className="bg-bikon" style={{ background: 'color-mix(in srgb, var(--yaprak) 15%, transparent)' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="var(--yaprak)" strokeWidth="2"><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" strokeLinecap="round" /></svg>
                </span>
                <h2 className="bg-h2">Bugünün Planı</h2>
              </div>
              {oneri.loading ? (
                <div className="mt-4 h-24 motion-safe:animate-pulse rounded-xl" style={{ background: 'var(--ic)' }} />
              ) : duraklar.length ? (
                <>
                  <p className="bg-aciklama">Sırayla ilerle — yol seni günlük hedefe götürür.</p>
                  <PlanYolu duraklar={duraklar} />
                </>
              ) : (
                <p className="bg-aciklama mt-2">Plan, soru havuzu dolunca burada belirir. Şimdilik "Soru Çöz" ile başlayabilirsin.</p>
              )}
            </section>
          </Reveal>

          {/* Ustalık Özeti — tek-renk ısı şeridi */}
          <Reveal delay={0.16}>
            <section className="bg-kart" aria-label="Analiz özeti">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="bg-bikon" style={{ background: 'color-mix(in srgb, var(--bilgi) 15%, transparent)' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="var(--bilgi)" strokeWidth="2"><path d="M3 20h18M6 16v-5M11 16V7M16 16v-8M21 16V4" strokeLinecap="round" /></svg>
                  </span>
                  <h2 className="bg-h2">Ustalık Özeti</h2>
                </div>
                <button onClick={() => nav('/harita')} className="cursor-pointer text-[13.5px] font-semibold" style={{ color: 'var(--vurgu)' }}>Analizler →</button>
              </div>
              <div className="mt-3.5 flex flex-wrap gap-2">
                {isiSerit.map((s) => (
                  <div key={s.kisa} className="min-w-[60px] flex-1 text-center">
                    <div className="h-9 rounded-xl" style={{ background: s.ton, border: s.olcumYok ? '1px dashed var(--cam-kenar)' : undefined }} />
                    <span className="mt-1 block text-[11px] font-medium" style={{ color: 'var(--metin3)' }}>{s.olcumYok ? `${s.kisa} · yok` : s.kisa}</span>
                  </div>
                ))}
              </div>
            </section>
          </Reveal>
        </div>

        {/* ════════ SAĞ ════════ */}
        <div className="flex min-w-0 flex-col gap-5">
          {/* Bugünün Tekrarı — koşul SERVİS EDİLEBİLEN soru sayısı. Eskiden vadeli KART
              sayısına bakıyordu: kartların hepsi elemede düşünce (çıkmış/karantina) modül
              yine çıkıyor, buton boş bir Çöz ekranı açıyordu. */}
          {(review.data?.count ?? 0) > 0 && (
            <Reveal delay={0.12}>
              <section className="bg-kart" aria-label="Bugünün tekrarı">
                <div className="mb-1.5 flex items-center gap-2.5">
                  <span className="bg-bikon" style={{ background: 'color-mix(in srgb, var(--adacayi) 20%, transparent)' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="var(--vurgu)" strokeWidth="2"><path d="M21 12a9 9 0 1 1-3-6.7M21 3v6h-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </span>
                  <h2 className="bg-h2">Bugünün Tekrarı</h2>
                </div>
                {/* Sayı VERİDEN gelir. Sabit "10" yazıyordu; set 10'a KESİLİYOR ama elemeden
                    sonra çoğu zaman altında kalıyor — etiket ile ekran birbirini tutmuyordu. */}
                <p className="bg-aciklama">{review.data!.count} sorunun tekrar vakti geldi — unutmadan pekiştir, fidanın büyüsün.</p>
                <button className="bg-dis mt-3" onClick={() => nav('/coz', { state: { source: 'review', title: 'Tekrar Zamanı', questions: review.data!.questions } })}>
                  {review.data!.count} soruluk tekrar başlat
                </button>
              </section>
            </Reveal>
          )}

          {/* Odak Zamanlayıcısı */}
          <Reveal delay={0.16}>
            <section className="bg-kart" aria-label="Odak zamanlayıcısı">
              <div className="mb-1.5 flex items-center gap-2.5">
                <span className="bg-bikon" style={{ background: 'color-mix(in srgb, var(--toprak) 22%, transparent)' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="var(--toprak)" strokeWidth="2"><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2.5M9 2h6" strokeLinecap="round" /></svg>
                </span>
                <h2 className="bg-h2">Odak Zamanlayıcısı</h2>
              </div>
              <OdakZamanlayici />
            </section>
          </Reveal>

          {/* Lig */}
          {G?.league && (
            <Reveal delay={0.2}>
              <section className="bg-kart" aria-label="Lig durumu">
                <div className="mb-1.5 flex items-center gap-2.5">
                  <span className="bg-bikon" style={{ background: 'color-mix(in srgb, var(--toprak) 22%, transparent)' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="var(--toprak)" strokeWidth="2"><path d="M8 21h8M12 17v4M17 4H7v5a5 5 0 0 0 10 0V4ZM17 6h3v2a3 3 0 0 1-3 3M7 6H4v2a3 3 0 0 0 3 3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </span>
                  <h2 className="bg-h2">{TIER_TR[G.league.tier] ?? G.league.tier} Ligi</h2>
                </div>
                <div className="bg-mini"><span>Bu hafta</span><b>{sayi(G.league.weeklyXP)} XP</b></div>
                <div className="bg-mini"><span>Sıralama</span><span className="bg-rozet dogru">canlı</span></div>
              </section>
            </Reveal>
          )}

          {/* Hata durumu */}
          {(gami.error || oneri.error || rontgen.error) && (
            <div className="bg-kart flex items-center gap-3" style={{ borderColor: 'color-mix(in srgb, var(--yanlis) 30%, transparent)' }}>
              <Icon name="bolt" size={16} color="var(--yanlis)" />
              <span className="flex-1 text-xs" style={{ color: 'var(--metin2)' }}>Sunucuya ulaşılamadı</span>
              <button className="bg-dis" onClick={() => { gami.reload(); oneri.reload(); konular.reload(); rontgen.reload() }}>Tekrar dene</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Günlük hedef halkası — adaçayı→yaprak gradyan, mount'ta dolar (0.9s) ──── */
function HedefHalka({ oran, etiket }: { oran: number; etiket: string }) {
  const azalt = useReducedMotion()
  const [dolu, setDolu] = useState(!!azalt)
  useEffect(() => {
    if (azalt) return
    const id = requestAnimationFrame(() => setDolu(true))
    return () => cancelAnimationFrame(id)
  }, [azalt])
  const r = 56
  const cevre = 2 * Math.PI * r
  const hedefOffset = cevre * (1 - Math.min(1, Math.max(0, oran)))
  return (
    <div className="relative" style={{ width: 130, height: 130 }}>
      <svg width="130" height="130" viewBox="0 0 130 130">
        <defs>
          <linearGradient id="bg-halka" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--adacayi)" />
            <stop offset="1" stopColor="var(--yaprak)" />
          </linearGradient>
        </defs>
        <circle cx="65" cy="65" r={r} fill="none" stroke="var(--ic)" strokeWidth="9" />
        <circle
          cx="65" cy="65" r={r} fill="none" stroke="url(#bg-halka)" strokeWidth="9" strokeLinecap="round"
          strokeDasharray={cevre} strokeDashoffset={dolu ? hedefOffset : cevre}
          transform="rotate(-90 65 65)"
          style={{ transition: azalt ? undefined : 'stroke-dashoffset 0.9s cubic-bezier(.4,0,.2,1)' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <b className="block font-display text-[24px] font-extrabold leading-none" style={{ color: 'var(--metin1)' }}>{etiket}</b>
          <span className="text-[11px]" style={{ color: 'var(--metin3)' }}>günlük hedef</span>
        </div>
      </div>
    </div>
  )
}
