import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, m } from 'framer-motion'
import { cn } from '../lib/cn'
import { Icon } from '../ui'
import { MathMarkdown } from '../components/MathMarkdown'
import { MotionRoot } from '../components/fx'
import { GlowButton, Chip, Badge } from '../components/ui'
import { Halka } from '../components/cekirdek'
import { apiGet, apiPost } from '../lib/api.js'
import { sesAcikMi, sesToggle, sesDogru, sesYanlis, sesFanfar } from '../lib/ses'
import type { CozSpec, HavuzSoru } from '../lib/types'

const HARFLER = ['A', 'B', 'C', 'D', 'E'] as const

/* ═══════════════════════════════════════════════════════════════════════════
   ÇÖZ — odak modu. Her zaman KOYU "Gece Vardiyası" (kök .dark sarmalı).
   Kaynaklar:
     ai        → havuzdan kazanım/öneri seti (10)
     osym      → çıkmış sorular (state listesi ya da ders/yıl)
     review    → SRS vadesi gelen kartlar (state ya da /practice/review)
     tanisma   → karma yerleştirme seti (placement:true → K=0.3 hızlı yakınsama)
     antrenman → adaptif /practice/next döngüsü (zorluk merdiveni + pedagojik ipucu)
   Sunucu-otoriter puanlama: /answers havuzdan okur; istemci iddiası bağlayıcı değil.
   Klavye: A–E şık seçer · Enter kontrol/devam.
   ═══════════════════════════════════════════════════════════════════════════ */

export function Coz() {
  const nav = useNavigate()
  const loc = useLocation()
  const spec = (loc.state as CozSpec | null) ?? null
  const kaynak = spec?.source ?? 'ai'

  if (kaynak === 'antrenman') {
    return <Kabuk><Antrenman spec={spec} cikis={() => nav('/rota')} /></Kabuk>
  }
  return <Kabuk><SetCozumu spec={spec} kaynak={kaynak} /></Kabuk>
}

/** Zorunlu koyu kabuk — Tailwind dark varyantı :where(.dark, .dark *) ile açılır. */
function Kabuk({ children }: { children: React.ReactNode }) {
  return (
    <MotionRoot>
      <div className="dark">
        <div className="min-h-screen bg-ocean-900 font-sans text-slate-200">
          {children}
        </div>
      </div>
    </MotionRoot>
  )
}

/* ═══ SET AKIŞI — ai / osym / review / tanisma ═══════════════════════════════ */

function SetCozumu({ spec, kaynak }: { spec: CozSpec | null; kaynak: string }) {
  const nav = useNavigate()
  const [sorular, setSorular] = useState<HavuzSoru[]>([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [hata, setHata] = useState('')
  const [idx, setIdx] = useState(spec?.startIndex ?? 0)
  const [secili, setSecili] = useState<string | null>(null)
  const [asama, setAsama] = useState<'soru' | 'geri'>('soru')
  const [dogruMu, setDogruMu] = useState(false)
  const [istatistik, setIstatistik] = useState({ dogru: 0, toplam: 0, xp: 0 })
  const [sonXp, setSonXp] = useState(0)
  const [sesli, setSesli] = useState(sesAcikMi)
  const basladi = useRef(Date.now())
  const [gecen, setGecen] = useState(0)

  // Soru kronometresi — mono sayaç (saniyede bir)
  useEffect(() => {
    const t = setInterval(() => setGecen(Math.floor((Date.now() - basladi.current) / 1000)), 1000)
    return () => clearInterval(t)
  }, [])

  // Soruları yükle
  useEffect(() => {
    let alive = true
    setYukleniyor(true); setHata('')

    const yukle = async (): Promise<HavuzSoru[]> => {
      if (spec?.questions?.length) return spec.questions
      if (kaynak === 'osym') {
        const r = await apiGet('/questions/osym', {
          subject: spec?.subject, year: spec?.year, label: spec?.label, limit: 10,
        })
        return r.questions ?? []
      }
      if (kaynak === 'review') {
        const r = await apiGet('/practice/review')
        return r.questions ?? []
      }
      if (kaynak === 'tanisma') {
        // Karma yerleştirme: havuzdan geniş çek, ders başına dengeli 10 soru örnekle
        const r = await apiGet('/questions/ai', { limit: 50 })
        const hepsi: HavuzSoru[] = r.questions ?? []
        const gruplar = new Map<string, HavuzSoru[]>()
        for (const q of hepsi) {
          const g = gruplar.get(q.subject) ?? []
          g.push(q)
          gruplar.set(q.subject, g)
        }
        const secilen: HavuzSoru[] = []
        const listeler = [...gruplar.values()]
        for (let tur = 0; secilen.length < 10 && listeler.some((l) => l.length); tur++) {
          for (const l of listeler) {
            const q = l.shift()
            if (q) secilen.push(q)
            if (secilen.length >= 10) break
          }
        }
        return secilen
      }
      // ai: kazanım varsa ona göre, yoksa öneriye düş
      let kazanimId = spec?.kazanimId
      let subject = spec?.subject
      if (!kazanimId) {
        const s = await apiGet('/practice/suggest')
        if (s?.kazanim) { kazanimId = s.kazanim.kazanimId; subject = s.kazanim.subject }
      }
      // kazanimId varken subject'i EKLEME: harf uyuşmazlığında AND filtresi havuzu boşaltır.
      const r = await apiGet('/questions/ai', kazanimId ? { kazanimId, limit: 10 } : { subject, limit: 10 })
      return r.questions ?? []
    }

    yukle()
      .then((qs) => { if (alive) { setSorular(qs); setYukleniyor(false); basladi.current = Date.now() } })
      .catch((e) => { if (alive) { setHata(e?.message || 'Sorular yüklenemedi'); setYukleniyor(false) } })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const soru = sorular[idx]
  const geri = asama === 'geri'

  // Yarım blok kaydı — Genel Bakış'taki "Devam Et" kartının kaynağı
  useEffect(() => {
    try {
      if (!sorular.length) return
      if (idx > 0 && idx < sorular.length) {
        localStorage.setItem('learnup.devam', JSON.stringify({
          spec: { ...spec, source: kaynak, startIndex: undefined },
          idx, toplam: sorular.length, zaman: Date.now(),
        }))
      } else if (idx >= sorular.length) {
        localStorage.removeItem('learnup.devam')
      }
    } catch { /* yut */ }
  }, [idx, sorular.length, spec, kaynak])

  const kontrol = async () => {
    if (!secili || !soru || geri) return
    const dogru = secili === soru.correct_option
    setDogruMu(dogru)
    setAsama('geri')
    setSonXp(0)
    setIstatistik((s) => ({ ...s, dogru: s.dogru + (dogru ? 1 : 0), toplam: s.toplam + 1 }))
    if (dogru) sesDogru(); else sesYanlis()
    // Sunucu-otoriter puanlama (havuzdan okur, LLM yok). Anlık geri bildirim client'tan.
    try {
      const r = await apiPost('/answers', {
        questionId: soru.id,
        subject: soru.subject,
        kazanimId: soru.kazanim_id ?? null,
        selectedOption: secili,
        attemptNumber: 1,
        durationSec: Math.round((Date.now() - basladi.current) / 1000),
        difficulty: soru.difficulty ?? null,
        // Tanışma = yerleştirme: BKT K=0.3 (hızlı yakınsama) — harita ilk setten belirir
        placement: kaynak === 'tanisma' || undefined,
      })
      if (typeof r?.xpGained === 'number') { setSonXp(r.xpGained); setIstatistik((s) => ({ ...s, xp: s.xp + r.xpGained })) }
    } catch { /* puanlama sessizce başarısız olabilir; geri bildirim yine gösterilir */ }
  }

  const ilerle = () => {
    setSonXp(0)
    if (idx + 1 >= sorular.length) { setIdx(sorular.length); return } // özet
    setIdx((i) => i + 1); setSecili(null); setAsama('soru'); basladi.current = Date.now(); setGecen(0)
  }

  const cikis = () => nav(kaynak === 'osym' ? '/arsiv' : kaynak === 'tanisma' ? '/harita' : '/')

  // Klavye: A–E seç · Enter kontrol/devam
  useEffect(() => {
    const dinle = (e: KeyboardEvent) => {
      if (yukleniyor || !soru || idx >= sorular.length) return
      const k = e.key.toUpperCase()
      if (!geri && (HARFLER as readonly string[]).includes(k) && soru.options?.[k] != null) setSecili(k)
      else if (e.key === 'Enter') { e.preventDefault(); geri ? ilerle() : void kontrol() }
    }
    window.addEventListener('keydown', dinle)
    return () => window.removeEventListener('keydown', dinle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yukleniyor, soru, geri, secili, idx, sorular.length])

  /* ── Durumlar ── */
  if (yukleniyor) return <Merkez><Spinner /><p className="mt-3.5 text-[13px] text-slate-400">Sorular hazırlanıyor…</p></Merkez>
  if (hata) return (
    <Merkez>
      <Icon name="waves" size={40} color="#64748B" />
      <p className="mt-3 text-sm font-semibold text-slate-200">{hata}</p>
      <GlowButton className="mt-5" onClick={cikis}>Geri dön</GlowButton>
    </Merkez>
  )
  if (!sorular.length) return (
    <Merkez>
      <span className="grid size-13 place-items-center rounded-2xl bg-sky-400/15">
        <Icon name="waves" size={26} color="#38BDF8" />
      </span>
      <p className="mt-3.5 font-display text-[15px] font-bold text-slate-100">
        {kaynak === 'review' ? 'Vadesi gelen kart yok' : 'Bu konuda soru bulunamadı'}
      </p>
      <p className="mt-1.5 max-w-70 text-center text-xs leading-relaxed text-slate-400">
        {kaynak === 'ai' ? 'Havuz bu kazanım için henüz boş. Koç doldurunca burada belirir.'
          : kaynak === 'review' ? 'Aralıklı tekrar motoru kartların vadesini bekliyor — çözmeye devam.'
          : kaynak === 'tanisma' ? 'Havuz henüz boş — Koç doldurunca tanışma sınavı açılır.'
          : 'Bu derste çıkmış soru bulunamadı.'}
      </p>
      <GlowButton className="mt-5" onClick={cikis}>Geri dön</GlowButton>
    </Merkez>
  )

  /* ── Özet ── */
  if (idx >= sorular.length) {
    return (
      <Ozet
        istatistik={istatistik}
        kaynak={kaynak}
        onTekrar={() => { setIdx(0); setSecili(null); setAsama('soru'); setIstatistik({ dogru: 0, toplam: 0, xp: 0 }); basladi.current = Date.now() }}
        onBitir={cikis}
      />
    )
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Üst bar: çık + cam ilerleme + sayaçlar */}
      <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 pb-3 pt-4">
        <button onClick={cikis} className="glass-solid grid size-9 cursor-pointer place-items-center rounded-xl text-slate-400 transition-colors hover:text-slate-200">
          <Icon name="close" size={17} color="currentColor" />
        </button>
        <div className="glass-solid h-2 flex-1 overflow-hidden rounded-full">
          <m.div
            className="h-full rounded-full bg-gradient-to-r from-sky-500 to-cyan-400"
            animate={{ width: `${((idx + (geri ? 1 : 0)) / sorular.length) * 100}%` }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          />
        </div>
        <span className="font-mono text-[11.5px] text-slate-400">{idx + 1}/{sorular.length}</span>
        <span className="w-11 text-right font-mono text-[11.5px] tabular-nums text-slate-500">
          {Math.floor(gecen / 60)}:{String(gecen % 60).padStart(2, '0')}
        </span>
        <button
          onClick={() => setSesli(sesToggle())}
          title={sesli ? 'Sesi kapat' : 'Sesi aç'}
          className="grid size-9 cursor-pointer place-items-center rounded-xl text-slate-500 transition-colors hover:text-slate-300"
        >
          <Icon name={sesli ? 'volume' : 'volumeOff'} size={16} color="currentColor" />
        </button>
      </div>

      <div className="mx-auto w-full max-w-3xl flex-1 px-4 pb-6">
        {/* Kaynak kimliği — ÖSYM: brass mühür; diğerleri mütevazı çip (asla karışmaz) */}
        {kaynak === 'osym' ? (
          <div className="mb-4 inline-flex items-center gap-2.5 rounded-xl border border-brass-500 bg-gradient-to-br from-[#2A1E08] to-[#191204] px-3.5 py-2">
            <Icon name="seal" size={18} color="#C99A4A" />
            <div>
              <div className="font-display text-[11.5px] font-extrabold tracking-wider text-brass-400">ÖSYM · ÇIKMIŞ SORU</div>
              {(soru.exam_label || soru.exam_year) && (
                <div className="text-[10.5px] text-brass-700">{soru.exam_label || soru.exam_year}</div>
              )}
            </div>
          </div>
        ) : (
          <div className="mb-4">
            <Chip tone={kaynak === 'review' ? 'teal' : 'sky'} icon={kaynak === 'review' ? 'history' : kaynak === 'tanisma' ? 'scan' : 'sparkle'}>
              {kaynak === 'review' ? 'TEKRAR · aralıklı hafıza'
                : kaynak === 'tanisma' ? 'TANIŞMA SINAVI · yerleştirme'
                : 'KOÇ PRATİĞİ · adaptif'}
            </Chip>
          </div>
        )}

        {/* Soru kartı */}
        <AnimatePresence mode="wait">
          <m.div
            key={idx}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -18 }}
            transition={{ duration: 0.22, ease: [0.21, 0.65, 0.32, 1] }}
          >
            <div className="glass-solid rounded-2xl px-5 py-4.5">
              <div className="text-[15.5px] leading-relaxed text-slate-100">
                <span className="font-display font-bold">Soru {idx + 1}.</span>{' '}
                <MathMarkdown inline>{soru.question_text}</MathMarkdown>
              </div>
            </div>

            {/* Şıklar */}
            <div className="mt-3.5 space-y-2.5">
              {HARFLER.filter((L) => soru.options?.[L] != null).map((L) => {
                const dogruSik = L === soru.correct_option
                const secildi = secili === L
                return (
                  <m.button
                    key={L}
                    onClick={() => !geri && setSecili(L)}
                    whileTap={!geri ? { scale: 0.985 } : undefined}
                    className={cn(
                      'flex w-full items-center gap-3.5 rounded-2xl border px-4 py-3 text-left transition-colors duration-150',
                      geri && dogruSik && 'border-emerald-400/70 bg-emerald-400/10',
                      geri && secildi && !dogruSik && 'border-rose-400/70 bg-rose-400/10',
                      !geri && secildi && 'border-sky-400/80 bg-sky-400/10',
                      !geri && !secildi && 'glass-solid cursor-pointer hover:border-sky-400/40',
                      geri && !dogruSik && !secildi && 'glass-solid opacity-55',
                    )}
                  >
                    <span className={cn(
                      'grid size-8 shrink-0 place-items-center rounded-full font-display text-[13px] font-extrabold transition-colors',
                      geri && dogruSik ? 'bg-emerald-400 text-ocean-950'
                        : geri && secildi && !dogruSik ? 'bg-rose-400 text-ocean-950'
                        : secildi ? 'bg-sky-400 text-ocean-950'
                        : 'bg-ocean-700 text-slate-300',
                    )}>
                      {geri && dogruSik ? <Icon name="check" size={16} color="currentColor" strokeWidth={2.6} />
                        : geri && secildi && !dogruSik ? <Icon name="close" size={15} color="currentColor" strokeWidth={2.6} />
                        : L}
                    </span>
                    {/* Şık metni KaTeX'ten geçer — havuz "$12$" yazar, ham basılmaz */}
                    <span className={cn(
                      'text-[14.5px] font-medium leading-normal',
                      geri && dogruSik ? 'text-emerald-300'
                        : geri && secildi && !dogruSik ? 'text-rose-300'
                        : secildi ? 'text-sky-200' : 'text-slate-300',
                    )}>
                      <MathMarkdown inline>{soru.options[L]}</MathMarkdown>
                    </span>
                  </m.button>
                )
              })}
            </div>
          </m.div>
        </AnimatePresence>
      </div>

      {/* Alt bar */}
      {!geri ? (
        <div className="mx-auto w-full max-w-3xl px-4 pb-6">
          <GlowButton full size="lg" disabled={!secili} onClick={kontrol}>
            Kontrol Et <span className="ml-1 font-mono text-[11px] opacity-60">↵</span>
          </GlowButton>
        </div>
      ) : (
        <m.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.28, ease: [0.21, 0.65, 0.32, 1] }}
          className="glass rounded-t-3xl border-x-0 border-b-0"
        >
          <div className="mx-auto w-full max-w-3xl px-5 pb-6 pt-4">
            <div className="flex items-center gap-2.5">
              <span className={cn(
                'grid size-7 place-items-center rounded-full',
                dogruMu ? 'bg-emerald-400/20 text-emerald-300' : 'bg-rose-400/20 text-rose-300',
              )}>
                <Icon name={dogruMu ? 'check' : 'close'} size={15} color="currentColor" strokeWidth={2.6} />
              </span>
              <span className={cn('font-display text-[15px] font-extrabold', dogruMu ? 'text-emerald-300' : 'text-rose-300')}>
                {dogruMu ? 'Doğru!' : `Doğru cevap ${soru.correct_option}`}
              </span>
              {dogruMu && sonXp > 0 && (
                <m.span initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="ml-auto">
                  <Chip tone="amber" icon="sparkle">+{sonXp} XP</Chip>
                </m.span>
              )}
            </div>
            {/* Çözüm — EN FORMÜL-YOĞUN alan; yanlış yapanın gördüğü tek şey */}
            {soru.solution && (
              <div className="mt-3 max-h-56 overflow-y-auto text-[13.5px] leading-relaxed text-slate-300">
                <MathMarkdown>{soru.solution}</MathMarkdown>
              </div>
            )}
            <GlowButton full size="lg" icon="arrowRight" className="mt-4" onClick={ilerle}>
              {idx + 1 >= sorular.length ? 'Bitir' : 'Devam'} <span className="ml-1 font-mono text-[11px] opacity-60">↵</span>
            </GlowButton>
          </div>
        </m.div>
      )}
    </div>
  )
}

/* ═══ ANTRENMAN — adaptif /practice/next döngüsü ════════════════════════════ */

interface AntrenmanSoru {
  id: string | null
  question_text: string
  options: string[]
  correct_answer: string | null
  explanation: string
  subject: string | null
  difficulty: string | null
  kazanim_id?: number | null
}

function Antrenman({ spec, cikis }: { spec: CozSpec | null; cikis: () => void }) {
  const [soru, setSoru] = useState<AntrenmanSoru | null>(null)
  const [seviye, setSeviye] = useState(2)
  const [ipucu, setIpucu] = useState<string | null>(null)
  const [secili, setSecili] = useState<number | null>(null)
  const [asama, setAsama] = useState<'yukleniyor' | 'soru' | 'geri'>('yukleniyor')
  const [dogruMu, setDogruMu] = useState(false)
  const [istatistik, setIstatistik] = useState({ dogru: 0, toplam: 0 })
  const [hata, setHata] = useState('')
  const basladi = useRef(Date.now())
  const subject = spec?.subject ?? 'Matematik'

  const getir = async (cevap?: { isCorrect: boolean; givenAnswer: string }) => {
    setAsama('yukleniyor')
    setIpucu(null)
    try {
      const r = await apiPost('/practice/next', {
        subject,
        topic: spec?.title ?? subject,
        questionId: soru?.id ?? null,
        questionText: soru?.question_text ?? null,
        duration: Math.round((Date.now() - basladi.current) / 1000),
        ...(cevap ? { isCorrect: cevap.isCorrect, givenAnswer: cevap.givenAnswer } : {}),
      })
      if (r?.pedagogicalHint) setIpucu(String(r.pedagogicalHint))
      if (typeof r?.stats?.currentLevel === 'number') setSeviye(r.stats.currentLevel)
      if (r?.nextQuestion) {
        setSoru(r.nextQuestion as AntrenmanSoru)
        setSecili(null)
        setAsama(cevap ? 'geri' : 'soru')
        if (!cevap) basladi.current = Date.now()
      } else {
        setHata('Havuzda uygun soru kalmadı — Koç yenilerini hazırlıyor.')
        setAsama('soru')
      }
    } catch (e: any) {
      setHata(e?.message || 'Antrenman başlatılamadı')
      setAsama('soru')
    }
  }

  // İlk soru
  useEffect(() => { void getir() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const [aktifSoru, setAktifSoru] = useState<AntrenmanSoru | null>(null)
  useEffect(() => { if (asama === 'soru' && soru) setAktifSoru(soru) }, [asama, soru])

  const kontrol = async () => {
    if (secili == null || !aktifSoru?.correct_answer) return
    const verilen = aktifSoru.options[secili]
    const dogru = String(verilen) === String(aktifSoru.correct_answer)
    setDogruMu(dogru)
    setIstatistik((s) => ({ dogru: s.dogru + (dogru ? 1 : 0), toplam: s.toplam + 1 }))
    if (dogru) sesDogru(); else sesYanlis()
    // Otoriter kayıt (XP/mastery) — soru havuzda kayıtlıysa puanlanır
    try {
      await apiPost('/answers', {
        questionId: aktifSoru.id,
        subject: aktifSoru.subject ?? subject,
        kazanimId: aktifSoru.kazanim_id ?? null,
        selectedOption: HARFLER[secili] ?? null,
        attemptNumber: 1,
        durationSec: Math.round((Date.now() - basladi.current) / 1000),
        difficulty: aktifSoru.difficulty ?? null,
      })
    } catch { /* sessiz */ }
    // Sıradaki soru + ipucu (yanlışta) arka planda gelir; "geri" aşaması gösterilir
    void getir({ isCorrect: dogru, givenAnswer: String(verilen) })
  }

  const devamEt = () => {
    setAsama('soru')
    basladi.current = Date.now()
  }

  if (hata && !aktifSoru) {
    return (
      <Merkez>
        <Icon name="waves" size={40} color="#64748B" />
        <p className="mt-3 max-w-75 text-center text-sm font-semibold text-slate-200">{hata}</p>
        <GlowButton className="mt-5" onClick={cikis}>Geri dön</GlowButton>
      </Merkez>
    )
  }

  const geri = asama === 'geri'
  const gosterilen = geri ? aktifSoru : (asama === 'soru' ? aktifSoru : null)

  return (
    <div className="flex min-h-screen flex-col">
      {/* Üst bar: çık + zorluk merdiveni + doğruluk */}
      <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 pb-3 pt-4">
        <button onClick={cikis} className="glass-solid grid size-9 cursor-pointer place-items-center rounded-xl text-slate-400 transition-colors hover:text-slate-200">
          <Icon name="close" size={17} color="currentColor" />
        </button>
        <Chip tone="sky" icon="bolt">ANTRENMAN · adaptif</Chip>
        <div className="ml-auto flex items-center gap-1.5" title={`Zorluk kademesi ${seviye}/3`}>
          <span className="font-mono text-[10.5px] text-slate-500">zorluk</span>
          {[1, 2, 3].map((s) => (
            <span key={s} className={cn(
              'h-2 w-5 rounded-full transition-colors',
              s <= seviye ? 'bg-sky-400' : 'bg-ocean-700',
            )} />
          ))}
        </div>
        <span className="font-mono text-[11.5px] text-slate-400">
          {istatistik.dogru}/{istatistik.toplam}
        </span>
      </div>

      <div className="mx-auto w-full max-w-3xl flex-1 px-4 pb-6">
        {asama === 'yukleniyor' && !gosterilen ? (
          <div className="grid min-h-60 place-items-center">
            <div className="text-center">
              <Spinner />
              <p className="mt-3.5 text-[13px] text-slate-400">Koç soru hazırlıyor…</p>
            </div>
          </div>
        ) : gosterilen ? (
          <>
            <div className="glass-solid rounded-2xl px-5 py-4.5">
              <div className="text-[15.5px] leading-relaxed text-slate-100">
                <MathMarkdown inline>{gosterilen.question_text}</MathMarkdown>
              </div>
            </div>
            <div className="mt-3.5 space-y-2.5">
              {gosterilen.options.map((secenek, i) => {
                const dogruSik = geri && String(secenek) === String(gosterilen.correct_answer)
                const secildi = secili === i
                return (
                  <button
                    key={i}
                    onClick={() => !geri && setSecili(i)}
                    className={cn(
                      'flex w-full items-center gap-3.5 rounded-2xl border px-4 py-3 text-left transition-colors',
                      dogruSik && 'border-emerald-400/70 bg-emerald-400/10',
                      geri && secildi && !dogruSik && 'border-rose-400/70 bg-rose-400/10',
                      !geri && secildi && 'border-sky-400/80 bg-sky-400/10',
                      !geri && !secildi && 'glass-solid cursor-pointer hover:border-sky-400/40',
                      geri && !dogruSik && !secildi && 'glass-solid opacity-55',
                    )}
                  >
                    <span className={cn(
                      'grid size-8 shrink-0 place-items-center rounded-full font-display text-[13px] font-extrabold',
                      dogruSik ? 'bg-emerald-400 text-ocean-950'
                        : geri && secildi ? 'bg-rose-400 text-ocean-950'
                        : secildi ? 'bg-sky-400 text-ocean-950' : 'bg-ocean-700 text-slate-300',
                    )}>
                      {HARFLER[i] ?? i + 1}
                    </span>
                    <span className="text-[14.5px] font-medium text-slate-300">
                      <MathMarkdown inline>{String(secenek)}</MathMarkdown>
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Pedagojik ipucu balonu — yanlışta Koç'tan gelir */}
            {geri && ipucu && (
              <m.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 flex items-start gap-2.5 rounded-2xl border border-sky-400/25 bg-sky-400/8 px-4 py-3"
              >
                <Icon name="lightbulb" size={16} color="#38BDF8" style={{ marginTop: 2, flexShrink: 0 }} />
                <p className="text-[13px] leading-relaxed text-sky-200">{ipucu}</p>
              </m.div>
            )}

            {geri && gosterilen.explanation && (
              <div className="mt-3 text-[13px] leading-relaxed text-slate-400">
                <MathMarkdown>{gosterilen.explanation}</MathMarkdown>
              </div>
            )}
          </>
        ) : null}
      </div>

      <div className="mx-auto w-full max-w-3xl px-4 pb-6">
        {!geri ? (
          <GlowButton full size="lg" disabled={secili == null || asama === 'yukleniyor'} onClick={kontrol}>
            Kontrol Et
          </GlowButton>
        ) : (
          <div className="flex gap-2.5">
            <GlowButton variant="outline" size="lg" onClick={cikis}>Bitir</GlowButton>
            <GlowButton full size="lg" icon="arrowRight" disabled={asama !== 'geri' && !soru} onClick={devamEt}>
              {dogruMu ? 'Devam — zorluk artıyor' : 'Devam'}
            </GlowButton>
          </div>
        )}
      </div>
    </div>
  )
}

/* ═══ ÖZET ═══════════════════════════════════════════════════════════════════ */

function Ozet({ istatistik, kaynak, onTekrar, onBitir }: {
  istatistik: { dogru: number; toplam: number; xp: number }
  kaynak: string
  onTekrar: () => void
  onBitir: () => void
}) {
  const yuzde = istatistik.toplam ? Math.round((istatistik.dogru / istatistik.toplam) * 100) : 0

  useEffect(() => {
    sesFanfar()
    if (yuzde >= 70) {
      // Konfeti — dinamik import (ana bundle'a girmez), reduced-motion'da atlanır
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
      void import('canvas-confetti').then(({ default: confetti }) => {
        confetti({ particleCount: 90, spread: 75, origin: { y: 0.6 }, colors: ['#38BDF8', '#22D3EE', '#FBBF24', '#F4FAFF'] })
      })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Merkez>
      <m.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
        className="text-center"
      >
        <div className="mx-auto w-fit">
          <Halka oran={yuzde / 100} boyut={104} kalinlik={8}
            renk={yuzde >= 70 ? 'var(--color-emerald-400)' : yuzde >= 40 ? 'var(--color-amber-400)' : 'var(--color-rose-400)'}>
            <span className="font-display text-[26px] font-extrabold text-slate-100">%{yuzde}</span>
          </Halka>
        </div>
        <h2 className="mt-5 font-display text-[22px] font-extrabold text-slate-100">
          {kaynak === 'tanisma' ? 'Röntgenin çekildi' : 'Blok tamam'}
        </h2>
        <p className="mt-1.5 text-[13.5px] text-slate-400">
          {istatistik.dogru}/{istatistik.toplam} doğru
          {istatistik.xp > 0 && <> · <span className="font-semibold text-amber-300">+{istatistik.xp} XP</span></>}
        </p>
        {kaynak === 'tanisma' && (
          <p className="mx-auto mt-2 max-w-70 text-xs leading-relaxed text-slate-500">
            Motor seni tanıdı — Analiz'de ustalık haritan artık canlı.
          </p>
        )}
        <div className="mt-7 flex justify-center gap-2.5">
          {kaynak !== 'tanisma' && (
            <GlowButton variant="outline" onClick={onTekrar}>Tekrar</GlowButton>
          )}
          <GlowButton icon="arrowRight" onClick={onBitir}>
            {kaynak === 'tanisma' ? 'Analize git' : 'Bitir'}
          </GlowButton>
        </div>
      </m.div>
    </Merkez>
  )
}

function Merkez({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      {children}
    </div>
  )
}

function Spinner() {
  return <div className="mx-auto size-9 animate-spin rounded-full border-[3px] border-sky-400/20 border-t-sky-400" />
}
