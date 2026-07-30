import { useTheme } from '../lib/theme'

/**
 * GİRİŞ SAHNESİ — katmanlı orman kenarı + göl (FİDAN, iki tema).
 * Onaylı önizleme `docs/design/onizleme/giris.html` (2026-07-22) birebir portu.
 * Gündüz: güneş + kelebekler · Gece: ay + yansıması + yanıp sönen ateşböcekleri.
 * Süzülen yapraklar iki temada da. Eski three.js `Login3D` (deniz+fener) yerine hafif SVG.
 *
 * Animasyonlar YALNIZ `@media (prefers-reduced-motion: no-preference)` altında koşar
 * (aşağıdaki <style> bloğu) → hareket-azalt tercihinde sahne tamamen statik kalır.
 */

interface Palet {
  gokA: string; gokB: string; gunesR: string
  tepe1: string; tepe2: string; tepe3: string; agac: string; agacK: string
  golA: string; golB: string; yansima: string
}

const GUN: Palet = {
  gokA: '#DCEDE0', gokB: '#F6F3E4', gunesR: '#F7E8C8',
  tepe1: '#B9D2BC', tepe2: '#94B99B', tepe3: '#6E9C79', agac: '#5A8B67', agacK: '#456F52',
  golA: '#CDE6E3', golB: '#A8CFCB', yansima: 'rgba(255,255,255,0.55)',
}

const GECE: Palet = {
  gokA: '#0B1512', gokB: '#12211B', gunesR: '#EAE4C8',
  tepe1: '#16281E', tepe2: '#1D3527', tepe3: '#254230', agac: '#2C4E38', agacK: '#1E3A29',
  golA: '#12241F', golB: '#1A332C', yansima: 'rgba(234,228,200,0.18)',
}

const AGAC_GOVDE = '#7A5A3A'

export function GirisSahnesi() {
  const { theme } = useTheme()
  const koyu = theme === 'dark'
  const p = koyu ? GECE : GUN

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      style={{ background: `linear-gradient(180deg, ${p.gokA}, ${p.gokB} 62%, ${p.golA} 62%)` }}
    >
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .gs-gunes { animation: gs-nefes 8s ease-in-out infinite; }
          @keyframes gs-nefes { 0%,100% { opacity: 0.8 } 50% { opacity: 1 } }
          .gs-kelebek { animation: gs-ucus 11s ease-in-out infinite; }
          @keyframes gs-ucus {
            0%,100% { transform: translate(0,0) rotate(-6deg) }
            25% { transform: translate(26px,-20px) rotate(8deg) }
            50% { transform: translate(56px,-6px) rotate(-4deg) }
            75% { transform: translate(28px,14px) rotate(6deg) }
          }
          .gs-atesbocegi { animation: gs-parla 3.2s ease-in-out infinite; }
          .gs-atesbocegi.b { animation-delay: 1.1s }
          .gs-atesbocegi.c { animation-delay: 2s }
          @keyframes gs-parla { 0%,100% { opacity: 0.15 } 50% { opacity: 0.95 } }
          .gs-yprk { animation: gs-suzul linear infinite; }
          @keyframes gs-suzul {
            0% { transform: translateY(-6vh) rotate(0) }
            100% { transform: translateY(108vh) rotate(300deg) }
          }
          .gs-dalga { animation: gs-kay 7s ease-in-out infinite alternate; }
          @keyframes gs-kay { from { transform: translateX(-12px) } to { transform: translateX(12px) } }
        }
      `}</style>

      {/* güneş/ay parıltısı */}
      <div
        className="gs-gunes absolute rounded-full"
        style={{
          width: koyu ? 220 : 340, height: koyu ? 220 : 340, right: '12%', top: '8%',
          background: `radial-gradient(circle, ${p.gunesR}, transparent 65%)`,
          filter: 'blur(8px)', opacity: koyu ? 0.9 : 1,
        }}
      />

      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMax slice">
        {/* güneş/ay */}
        <circle cx="1180" cy="170" r="46" fill={p.gunesR} />
        {/* uzak + orta tepe */}
        <path d="M0 470 Q 260 380 520 452 T 1040 430 T 1440 458 V 560 H 0 Z" fill={p.tepe1} />
        <path d="M0 520 Q 320 430 640 500 T 1440 495 V 620 H 0 Z" fill={p.tepe2} />
        {/* göl */}
        <rect x="0" y="558" width="1440" height="342" fill={p.golA} />
        <ellipse cx="720" cy="560" rx="900" ry="26" fill={p.golB} opacity="0.7" />
        <g className="gs-dalga">
          <ellipse cx="500" cy="620" rx="150" ry="4" fill={p.yansima} />
          <ellipse cx="940" cy="676" rx="200" ry="4.5" fill={p.yansima} opacity="0.8" />
          <ellipse cx="640" cy="730" rx="120" ry="3.5" fill={p.yansima} opacity="0.6" />
        </g>
        {/* güneş/ay yansıması */}
        <ellipse cx="1180" cy="600" rx="60" ry="7" fill={p.yansima} />
        <ellipse cx="1180" cy="640" rx="38" ry="5" fill={p.yansima} opacity="0.7" />
        {/* yakın kıyı */}
        <path d="M0 620 Q 200 585 430 612 Q 560 628 640 660 L 640 900 L 0 900 Z" fill={p.tepe3} />
        {/* ağaçlar (sol küme) */}
        <g>
          <rect x="120" y="470" width="16" height="90" rx="7" fill={AGAC_GOVDE} />
          <ellipse cx="128" cy="420" rx="78" ry="88" fill={p.agac} />
          <ellipse cx="86" cy="462" rx="46" ry="50" fill={p.agacK} />
          <rect x="284" y="500" width="13" height="76" rx="6" fill={AGAC_GOVDE} />
          <ellipse cx="290" cy="458" rx="60" ry="68" fill={p.agacK} />
          <rect x="30" y="520" width="10" height="58" rx="5" fill={AGAC_GOVDE} />
          <ellipse cx="35" cy="486" rx="42" ry="48" fill={p.agac} />
        </g>
        {/* sağ tekil ağaç */}
        <g>
          <rect x="1330" y="500" width="14" height="84" rx="6" fill={AGAC_GOVDE} />
          <ellipse cx="1337" cy="452" rx="66" ry="74" fill={p.agac} />
        </g>
        {/* ön plan çimen + sazlar */}
        <path d="M0 900 V 700 Q 60 690 90 700 T 180 706 T 300 700 L 300 900 Z" fill={p.agacK} />
        <g stroke={p.agac} strokeWidth="4" strokeLinecap="round" fill="none">
          <path d="M70 700 q -4 -46 6 -66" />
          <path d="M96 704 q 6 -40 -2 -60" />
          <path d="M130 702 q -6 -34 4 -52" />
        </g>
      </svg>

      {/* kelebekler — yalnız gündüz */}
      {!koyu && (
        <>
          <svg className="gs-kelebek absolute" style={{ left: '24%', top: '38%', width: 26 }} viewBox="0 0 24 24">
            <path d="M12 6c-3-5-9-4-9 1s6 6 9 3c3 3 9 2 9-3s-6-6-9-1Z" fill="#D4A373" />
            <path d="M12 5v10" stroke={AGAC_GOVDE} strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <svg className="gs-kelebek absolute" style={{ left: '64%', top: '30%', width: 18, animationDelay: '2s' }} viewBox="0 0 24 24">
            <path d="M12 6c-3-5-9-4-9 1s6 6 9 3c3 3 9 2 9-3s-6-6-9-1Z" fill="#84A98C" />
            <path d="M12 5v10" stroke="#456F52" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </>
      )}

      {/* ateşböcekleri — yalnız gece */}
      {koyu && (
        <>
          <svg className="gs-atesbocegi absolute" style={{ left: '30%', top: '45%', width: 8 }} viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#EAE4C8" /></svg>
          <svg className="gs-atesbocegi b absolute" style={{ left: '55%', top: '36%', width: 6 }} viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#EAE4C8" /></svg>
          <svg className="gs-atesbocegi c absolute" style={{ left: '75%', top: '52%', width: 7 }} viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#EAE4C8" /></svg>
        </>
      )}

      {/* süzülen yapraklar — iki temada */}
      <svg className="gs-yprk absolute" style={{ left: '38%', width: 20, animationDuration: '22s' }} viewBox="0 0 24 24">
        <path d="M12 2C7 7 5 12 12 22 19 12 17 7 12 2Z" fill="#84A98C" opacity="0.5" />
      </svg>
      <svg className="gs-yprk absolute" style={{ left: '82%', width: 15, animationDuration: '28s', animationDelay: '7s' }} viewBox="0 0 24 24">
        <path d="M12 2C7 7 5 12 12 22 19 12 17 7 12 2Z" fill="#D4A373" opacity="0.5" />
      </svg>
    </div>
  )
}

export default GirisSahnesi
