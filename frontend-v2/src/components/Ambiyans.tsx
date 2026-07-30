/**
 * FİDAN ambiyansı — ağır çekim süzülen yapraklar (onaylı önizleme `bugun.html` v4 portu).
 * Işık lekeleri `fx.tsx` YakamozBackdrop'ta; burası YALNIZ yaprak katmanı (çift güneş olmasın).
 * Shell'de React.lazy ile yüklenir → yalnız MASAÜSTÜ (≥900px) + hareket-serbest ortamda çizilir
 * (animasyonlar `@media (prefers-reduced-motion: no-preference)` altında; azalt tercihinde statik).
 * İçeriğin önüne geçmez: pointer-events yok, z-index içerik altı, düşük opaklık.
 */

const YAPRAKLAR = [
  { sol: '12%', en: 26, sure: 24, gecikme: 0, renk: '#84A98C' },
  { sol: '32%', en: 18, sure: 30, gecikme: 6, renk: '#D4A373' },
  { sol: '55%', en: 22, sure: 26, gecikme: 12, renk: '#4FA56F' },
  { sol: '74%', en: 16, sure: 34, gecikme: 3, renk: '#84A98C' },
  { sol: '90%', en: 24, sure: 28, gecikme: 16, renk: '#D4A373' },
]

export default function Ambiyans() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 hidden overflow-hidden min-[900px]:block">
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .amb-yprk { animation: amb-suzul linear infinite; }
          @keyframes amb-suzul {
            0%   { transform: translateY(-8vh) translateX(0) rotate(0deg) }
            25%  { transform: translateY(22vh) translateX(34px) rotate(65deg) }
            50%  { transform: translateY(52vh) translateX(-22px) rotate(150deg) }
            75%  { transform: translateY(82vh) translateX(28px) rotate(230deg) }
            100% { transform: translateY(112vh) translateX(-12px) rotate(320deg) }
          }
        }
      `}</style>
      {YAPRAKLAR.map((y, i) => (
        <svg
          key={i}
          className="amb-yprk absolute top-[-8vh]"
          style={{ left: y.sol, width: y.en, opacity: 0.45, animationDuration: `${y.sure}s`, animationDelay: `${y.gecikme}s` }}
          viewBox="0 0 24 24"
        >
          <path d="M12 2C7 7 5 12 12 22 19 12 17 7 12 2Z" fill={y.renk} />
        </svg>
      ))}
    </div>
  )
}
