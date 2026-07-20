import { lazy, Suspense, useEffect, useState, type CSSProperties } from 'react'

/**
 * Lottie oynatıcı — hem kütüphane hem animasyon verisi TEMBEL yüklenir
 * (dusunuyor.json 364KB — ana bundle'a asla girmez). reduced-motion'da
 * animasyon oynamaz (ilk kare durağan gösterilir).
 * Varlıklar: src/assets/lottie/ (LISANS-NOTU.md — Lottie Simple License).
 */

const Lottie = lazy(() => import('lottie-react'))

const YUKLEYICI = {
  basari: () => import('../assets/lottie/basari.json'),
  kupa: () => import('../assets/lottie/kupa.json'),
  konfeti: () => import('../assets/lottie/konfeti.json'),
  ucak: () => import('../assets/lottie/ucak.json'),
  dusunuyor: () => import('../assets/lottie/dusunuyor.json'),
} as const

export type LottieAd = keyof typeof YUKLEYICI

export function LottieOynatici({ ad, loop = true, className, style }: {
  ad: LottieAd; loop?: boolean; className?: string; style?: CSSProperties
}) {
  const [veri, setVeri] = useState<object | null>(null)
  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    let aktif = true
    YUKLEYICI[ad]().then((mod) => { if (aktif) setVeri(mod.default as object) })
    return () => { aktif = false }
  }, [ad])

  if (!veri) return <div className={className} style={style} aria-hidden />
  return (
    <Suspense fallback={<div className={className} style={style} aria-hidden />}>
      <Lottie
        animationData={veri}
        loop={reduced ? false : loop}
        autoplay={!reduced}
        className={className}
        style={style}
        aria-hidden
      />
    </Suspense>
  )
}
