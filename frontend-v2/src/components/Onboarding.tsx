import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, m } from 'framer-motion'
import { cn } from '../lib/cn'
import { Icon, type IconName } from '../ui'
import { GlowButton } from './ui'

/**
 * Onboarding turu — İLK girişte 4 durak. localStorage bayrağıyla bir kez;
 * her adımda geçilebilir. Spotlight yerine merkezi kart dizisi (sade, mobil-dost).
 */

const KEY = 'learnup.tur'

export function turGerekli(): boolean {
  try { return localStorage.getItem(KEY) !== 'tamam' } catch { return false }
}

const DURAKLAR: Array<{ icon: IconName; baslik: string; metin: string }> = [
  {
    icon: 'today',
    baslik: 'Genel Bakış — günün güvertesi',
    metin: 'Bugünün rotası, serin, günlük hedefin ve yarıda kalan bloğun tek ekranda. Her sabah buradan denize açıl.',
  },
  {
    icon: 'scan',
    baslik: 'Analiz — bilişsel röntgenin',
    metin: 'Her cevabın, kazanım başına ustalık tahminini güncelleyen bir motoru besler. Zayıf noktaların, trendin ve çalışma takvimin burada canlı.',
  },
  {
    icon: 'anchor',
    baslik: 'Koç — yanındaki kaptan',
    metin: 'Plan çıkarır, zayıf konundan soru hazırlar, formül anlatır. Sohbet kaldığın yerden sürer.',
  },
  {
    icon: 'bolt',
    baslik: 'İlk adım: Tanışma Sınavı',
    metin: '10 karma soruyla motor seni hızlı tanır (yerleştirme modu) ve haritan anında belirir. Hazırsan başlayalım.',
  },
]

export function Onboarding({ onKapat }: { onKapat: () => void }) {
  const nav = useNavigate()
  const [adim, setAdim] = useState(0)
  const son = adim === DURAKLAR.length - 1
  const d = DURAKLAR[adim]

  const bitir = (tanisma: boolean) => {
    try { localStorage.setItem(KEY, 'tamam') } catch { /* yut */ }
    onKapat()
    if (tanisma) nav('/coz', { state: { source: 'tanisma', title: 'Tanışma Sınavı' } })
  }

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-ocean-950/55 px-5 backdrop-blur-sm">
      <m.div
        initial={{ opacity: 0, y: 18, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.3, ease: [0.21, 0.65, 0.32, 1] }}
        className="glass w-full max-w-sm rounded-3xl p-7 text-center shadow-card"
      >
        <AnimatePresence mode="wait">
          <m.div
            key={adim}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.18 }}
          >
            <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-sky-600 to-cyan-500 shadow-glow-sky">
              <Icon name={d.icon} size={26} color="#fff" strokeWidth={1.8} />
            </div>
            <h2 className="mt-4 font-display text-[17px] font-bold text-slate-800 dark:text-slate-100">
              {d.baslik}
            </h2>
            <p className="mx-auto mt-2 max-w-xs text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
              {d.metin}
            </p>
          </m.div>
        </AnimatePresence>

        {/* İlerleme noktaları */}
        <div className="mt-5 flex justify-center gap-1.5">
          {DURAKLAR.map((_, i) => (
            <span key={i} className={cn(
              'h-1.5 rounded-full transition-all duration-300',
              i === adim ? 'w-5 bg-sky-500' : 'w-1.5 bg-slate-300 dark:bg-ocean-700',
            )} />
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            onClick={() => bitir(false)}
            className="cursor-pointer font-display text-[12.5px] font-semibold text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-slate-300"
          >
            Geç
          </button>
          {son ? (
            <div className="flex gap-2">
              <GlowButton variant="outline" size="sm" onClick={() => bitir(false)}>Sonra</GlowButton>
              <GlowButton size="sm" icon="scan" onClick={() => bitir(true)}>Sınava başla</GlowButton>
            </div>
          ) : (
            <GlowButton size="sm" icon="arrowRight" onClick={() => setAdim((a) => a + 1)}>İleri</GlowButton>
          )}
        </div>
      </m.div>
    </div>
  )
}
