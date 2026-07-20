import { useMemo } from 'react'
import Particles, { ParticlesProvider } from '@tsparticles/react'
import { loadSlim } from '@tsparticles/slim'
import type { Engine, ISourceOptions } from '@tsparticles/engine'
import { useTheme } from '../lib/theme'

/**
 * Tema-duyarlı ambiyans partikülleri.
 * Koyu: yükselen yakamoz planktonu/kabarcıklar · Açık: süzülen ışık tozu.
 * Bu bileşen Shell'de React.lazy ile yüklenir (tsparticles ana bundle'a girmez)
 * ve YALNIZ masaüstü + hareket-serbest ortamda çizilir (kapsayıcı karar verir).
 */

const motoruKur = async (engine: Engine): Promise<void> => {
  await loadSlim(engine)
}

export default function Ambiyans() {
  const { theme } = useTheme()

  const secenekler = useMemo<ISourceOptions>(() => {
    const koyu = theme === 'dark'
    return {
      fullScreen: { enable: false },
      fpsLimit: 45,
      detectRetina: true,
      pauseOnBlur: true,
      pauseOnOutsideViewport: true,
      interactivity: { events: { onHover: { enable: false }, onClick: { enable: false } } },
      particles: {
        number: { value: koyu ? 26 : 16, density: { enable: true, width: 1400, height: 900 } },
        color: { value: koyu ? ['#38BDF8', '#2DD4BF', '#7DD3FC'] : ['#0284C7', '#67E8F9'] },
        shape: { type: 'circle' },
        size: { value: { min: 1, max: koyu ? 3 : 2.2 } },
        opacity: {
          value: { min: 0.08, max: koyu ? 0.4 : 0.22 },
          animation: { enable: true, speed: 0.6, sync: false },
        },
        move: {
          enable: true,
          direction: koyu ? 'top' : 'none',
          speed: koyu ? 0.5 : 0.25,
          random: true,
          straight: false,
          outModes: { default: 'out' },
        },
      },
    }
  }, [theme])

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
      <ParticlesProvider init={motoruKur}>
        <Particles id="ambiyans" options={secenekler} className="h-full w-full" />
      </ParticlesProvider>
    </div>
  )
}
