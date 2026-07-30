import { useEffect, useState } from 'react'
import { useReducedMotion } from 'framer-motion'

/**
 * Odak Zamanlayıcısı — FİDAN, FRONTEND-ONLY (backend ucu YOK; localStorage seans sayacı).
 * 25 dk odak seansı; halka dolarak azalır, tamamlanınca günün seans sayacı + odak süresi artar.
 * Bugün KPI'sı `bugunkuOdakDk()` ile bugünkü toplam odak dakikasını okur.
 * Nabız noktası yalnız `prefers-reduced-motion: no-preference` altında atar.
 */

const SEANS_SN = 25 * 60

function bugunKey(): string {
  return new Date().toLocaleDateString('en-CA')
}
function oku(anahtar: string): number {
  try { return Number(localStorage.getItem(anahtar)) || 0 } catch { return 0 }
}
function yaz(anahtar: string, deger: number) {
  try { localStorage.setItem(anahtar, String(deger)) } catch { /* localStorage kapalı olabilir */ }
}

/** Bugün biriken odak süresi (dakika) — Bugün ekranı "Çalışma Süresi" KPI'sı. */
export function bugunkuOdakDk(): number {
  return Math.floor(oku('learnup.odak.sn.' + bugunKey()) / 60)
}
/** Bugün tamamlanan odak seansı sayısı. */
export function bugunkuOdakSeans(): number {
  return oku('learnup.odak.seans.' + bugunKey())
}

export function OdakZamanlayici() {
  const [kalan, setKalan] = useState(SEANS_SN)
  const [calisiyor, setCalisiyor] = useState(false)
  const [seans, setSeans] = useState(() => bugunkuOdakSeans())
  const azalt = useReducedMotion()

  // Saniye tik'i — çalışırken kalanı azalt + bugünkü odak saniyesini biriktir.
  useEffect(() => {
    if (!calisiyor) return
    const id = setInterval(() => {
      yaz('learnup.odak.sn.' + bugunKey(), oku('learnup.odak.sn.' + bugunKey()) + 1)
      setKalan((k) => Math.max(0, k - 1))
    }, 1000)
    return () => clearInterval(id)
  }, [calisiyor])

  // Seans tamamlandı → sayaç + sıfırla (yan etki kalan===0'da, updater içinde değil).
  useEffect(() => {
    if (kalan !== 0) return
    yaz('learnup.odak.seans.' + bugunKey(), bugunkuOdakSeans() + 1)
    setSeans(bugunkuOdakSeans())
    setCalisiyor(false)
    setKalan(SEANS_SN)
  }, [kalan])

  const dk = String(Math.floor(kalan / 60)).padStart(2, '0')
  const sn = String(kalan % 60).padStart(2, '0')
  const circ = 270
  const offset = circ * (kalan / SEANS_SN)

  return (
    <div>
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .oz-nokta { animation: oz-tik 2s ease-in-out infinite; }
          @keyframes oz-tik { 0%,100% { opacity: 0.5 } 50% { opacity: 1 } }
        }
        .oz-btn { border: 1px solid var(--cam-kenar); color: var(--metin2); background: transparent; }
        .oz-btn:hover { background: var(--ic); }
      `}</style>

      <svg viewBox="0 0 100 100" className="mx-auto mt-2 block size-26">
        <circle cx="50" cy="50" r="43" fill="none" stroke="var(--ic)" strokeWidth="8" />
        <circle
          cx="50" cy="50" r="43" fill="none" stroke="var(--toprak)" strokeWidth="8"
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
          transform="rotate(-90 50 50)"
          style={{ transition: azalt ? undefined : 'stroke-dashoffset 0.9s linear' }}
        />
        {calisiyor && <circle className="oz-nokta" cx="50" cy="7" r="3.5" fill="var(--toprak)" />}
      </svg>

      <div className="my-2.5 text-center font-display text-[38px] font-extrabold tracking-wide" style={{ color: 'var(--metin1)' }}>
        {dk}:{sn}
      </div>

      <div className="flex justify-center gap-2">
        <button type="button" onClick={() => setCalisiyor((c) => !c)} className="oz-btn cursor-pointer rounded-xl px-3.5 py-2 text-[13px] font-semibold transition-colors">
          {calisiyor ? 'Duraklat' : 'Başlat'}
        </button>
        <button type="button" onClick={() => { setCalisiyor(false); setKalan(SEANS_SN) }} className="oz-btn cursor-pointer rounded-xl px-3.5 py-2 text-[13px] font-semibold transition-colors">
          Sıfırla
        </button>
      </div>

      <p className="mt-2.5 text-center text-[13px]" style={{ color: 'var(--metin2)' }}>
        {seans > 0 ? `Bugün ${seans} odak seansı` : 'İlk odak seansını başlat'} · her seans bahçene su 🌱
      </p>
    </div>
  )
}

export default OdakZamanlayici
