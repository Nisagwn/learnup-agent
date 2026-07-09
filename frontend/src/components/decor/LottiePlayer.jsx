import React, { Suspense, lazy } from 'react';

// lottie-react'i tembel yükle (ilk paint'i şişirmesin). reduced-motion'da
// son kareyi (durağan) gösterir. data = içe aktarılmış Lottie JSON nesnesi.
const Lottie = lazy(() => import('lottie-react'));

export default function LottiePlayer({ data, loop = true, className = '', style }) {
  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (!data) return null;
  return (
    <Suspense fallback={<div className={className} style={style} aria-hidden="true" />}>
      <Lottie
        animationData={data}
        loop={reduced ? false : loop}
        autoplay={!reduced}
        className={className}
        style={style}
        aria-hidden="true"
      />
    </Suspense>
  );
}
