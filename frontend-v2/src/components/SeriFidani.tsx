import { cn } from '../lib/cn'

/* ═══════════════════════════════════════════════════════════════════════════
   SERİ FİDANI — FİDAN imza öğesi (TASARIM-DILI §5.3, bileşen §7 StreakFidanı).
   Seri, 5 kademeli büyüyen bir bitkiyle gösterilir: Tohum → Filiz → Fidan →
   Genç Ağaç → Ulu Ağaç. Ulaşılan kademeler tam opak, mevcut kademe nokta imli
   ve hafif salınımlı (yalnız hareket-azalt KAPALIYKEN), gelecek kademeler soluk.
   Renkler kasıtlı sabit (organik toprak/yaprak tonları) — iki temada da aynı,
   onaylı önizlemeyle (docs/design/onizleme/profilim.html) birebir.
   ═══════════════════════════════════════════════════════════════════════════ */

export const SERI_KADEMELERI = [
  { esik: 1, ad: 'Tohum' },
  { esik: 3, ad: 'Filiz' },
  { esik: 7, ad: 'Fidan' },
  { esik: 30, ad: 'Genç Ağaç' },
  { esik: 100, ad: 'Ulu Ağaç' },
] as const

/** Bir sonraki kademe eşiği (gün). En üst kademe aşıldıysa null. */
export function seriSonrakiKademe(seri: number): number | null {
  for (const k of SERI_KADEMELERI) if (seri < k.esik) return k.esik
  return null
}

/** Kademe görselleri — önizlemedeki SVG'ler; sırası SERI_KADEMELERI ile birebir. */
const GORSELLER = [
  // Tohum
  <svg key="tohum" width="26" height="30" viewBox="0 0 24 28" aria-hidden>
    <ellipse cx="12" cy="22" rx="7" ry="5" fill="#A9713F" />
    <circle cx="12" cy="19" r="3.5" fill="#7A5A3A" />
  </svg>,
  // Filiz
  <svg key="filiz" width="26" height="34" viewBox="0 0 24 30" aria-hidden>
    <path d="M12 28v-8" stroke="#A9713F" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M12 20c0-4-3-6-7-6 0 4 3 6 7 6" fill="#4FA56F" />
  </svg>,
  // Fidan
  <svg key="fidan" width="30" height="40" viewBox="0 0 24 34" aria-hidden>
    <path d="M12 32V16" stroke="#A9713F" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M12 20c0-5-4-7-8-7 0 5 4 7 8 7" fill="#4FA56F" />
    <path d="M12 16c0-4 3-6 7-6 0 4.5-3 6.5-7 6.5" fill="#84A98C" />
  </svg>,
  // Genç Ağaç
  <svg key="genc" width="34" height="46" viewBox="0 0 24 38" aria-hidden>
    <path d="M12 36V12" stroke="#A9713F" strokeWidth="3" strokeLinecap="round" />
    <ellipse cx="12" cy="10" rx="9" ry="8" fill="#84A98C" />
  </svg>,
  // Ulu Ağaç
  <svg key="ulu" width="38" height="52" viewBox="0 0 24 42" aria-hidden>
    <path d="M12 40V14" stroke="#7A5A3A" strokeWidth="3.5" strokeLinecap="round" />
    <ellipse cx="12" cy="11" rx="11" ry="10" fill="#84A98C" />
    <ellipse cx="7" cy="15" rx="5" ry="4.5" fill="#4FA56F" />
  </svg>,
]

/**
 * 5 kademeli seri şeridi. `seri` gün sayısıdır (0 = henüz seri yok; hepsi soluk).
 * Salınım animasyonu yalnız `prefers-reduced-motion: no-preference` altında tanımlı —
 * hareket-azalt açıkken bileşen tamamen statiktir (kabul kriteri).
 */
export function SeriFidani({ seri, className }: { seri: number; className?: string }) {
  // Mevcut kademe: ulaşılan en büyük eşik. Seri 0 ise hiçbir kademe açık değil.
  let aktif = -1
  SERI_KADEMELERI.forEach((k, i) => { if (seri >= k.esik) aktif = i })

  const aktifAd = aktif >= 0 ? SERI_KADEMELERI[aktif].ad : 'henüz tohum ekilmedi'

  return (
    <div
      role="group"
      aria-label={`Seri fidanı: ${seri} gün — ${aktifAd}`}
      className={cn('sf-kademeler', className)}
    >
      <style>{`
        .sf-kademeler { display: flex; align-items: flex-end; justify-content: space-between; gap: 8px; padding: 0 6px; }
        .sf-kademe { flex: 1; text-align: center; position: relative; }
        .sf-kademe > svg { opacity: .35; }
        .sf-kademe.acik > svg { opacity: 1; }
        .sf-kademe.simdiki::after { content: ""; position: absolute; left: 50%; top: -8px; transform: translateX(-50%);
          width: 7px; height: 7px; border-radius: 50%; background: var(--yaprak); }
        .sf-kademe span { display: block; font-size: 10.5px; line-height: 1.35; color: var(--metin3); margin-top: 5px; }
        .sf-kademe.acik span { color: var(--metin2); font-weight: 600; }
        @media (prefers-reduced-motion: no-preference) {
          .sf-kademe.simdiki > svg { transform-origin: 50% 100%; animation: sf-salla 4s ease-in-out infinite; }
          @keyframes sf-salla { 0%, 100% { transform: rotate(-2deg) } 50% { transform: rotate(2deg) } }
        }
      `}</style>
      {SERI_KADEMELERI.map((k, i) => {
        const acik = seri >= k.esik
        const simdiki = i === aktif
        return (
          <div key={k.esik} className={cn('sf-kademe', acik && 'acik', simdiki && 'simdiki')}>
            {GORSELLER[i]}
            <span>
              {simdiki ? <b>{k.ad}</b> : k.ad}
              <br />
              {k.esik} gün{acik ? ' ✓' : ''}
            </span>
          </div>
        )
      })}
    </div>
  )
}
