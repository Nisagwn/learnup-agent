/**
 * PLAN YOLU — "Bugünün Planı" yol görünümü (onaylı önizleme `bugun.html` v4 portu).
 * Duraklar: tamamlanan (dolu yeşil ✓) · aktif (nabız halkalı, "Buradan devam") ·
 * bekleyen (kesikli) · yolun sonu günlük hedef bayrağı. Mobilde dikey akar.
 * Durum plan verisinden TÜRETİLİR (Bugun.tsx); bu bileşen yalnız sunum + hareket-azalt uyumu.
 */

export interface Durak {
  tip: 'tamam' | 'aktif' | 'bekle' | 'hedef'
  no?: number
  dersKisa?: string
  dersRenk?: string
  baslik: string
  detay?: string
  onDevam?: () => void
}

export function PlanYolu({ duraklar }: { duraklar: Durak[] }) {
  return (
    <div className="py-yol">
      <style>{`
        .py-yol { display: flex; align-items: flex-start; margin-top: 18px; }
        .py-durak { flex: 1; min-width: 0; text-align: center; position: relative; padding: 0 8px; }
        .py-nokta { width: 54px; height: 54px; border-radius: 50%; margin: 0 auto 10px; display: grid;
          place-items: center; font-family: Outfit, sans-serif; font-weight: 700; font-size: 17px; position: relative; z-index: 1; }
        .py-durak + .py-durak::before { content: ""; position: absolute; top: 26px; left: calc(-50% + 35px);
          right: calc(50% + 35px); border-top: 2.5px dashed color-mix(in srgb, var(--adacayi) 55%, transparent); }
        .py-durak.aktif::before { border-top-style: solid; border-top-color: var(--yaprak); }
        .py-durak.tamam .py-nokta { background: var(--yaprak); color: #fff; }
        .py-durak.aktif .py-nokta { background: var(--cam); border: 2.5px solid var(--yaprak); color: var(--vurgu); }
        .py-durak.bekle .py-nokta { background: var(--ic); border: 2px dashed color-mix(in srgb, var(--adacayi) 50%, transparent); color: var(--metin3); }
        .py-durak.hedef .py-nokta { background: var(--ic); border: 2px dashed color-mix(in srgb, var(--toprak) 45%, transparent); color: var(--toprak); }
        .py-durak b { display: block; font-size: 13px; line-height: 1.35; margin-top: 6px; color: var(--metin1); }
        .py-det { display: block; font-size: 11.5px; color: var(--metin3); margin-top: 2px; }
        .py-cip { display: inline-block; padding: 3px 9px; border-radius: 12px; font-family: Outfit, sans-serif; font-weight: 700; font-size: 11px; }
        .py-devam { margin-top: 8px; border: none; cursor: pointer; border-radius: 12px; padding: 6px 12px;
          font-family: Inter, sans-serif; font-weight: 600; font-size: 12px;
          background: color-mix(in srgb, var(--adacayi) 26%, transparent); color: var(--vurgu); transition: background 0.15s; }
        .py-devam:hover { background: color-mix(in srgb, var(--adacayi) 38%, transparent); }
        @media (prefers-reduced-motion: no-preference) {
          .py-durak.aktif .py-nokta::after { content: ""; position: absolute; inset: -7px; border-radius: 50%;
            border: 2px solid color-mix(in srgb, var(--yaprak) 45%, transparent); animation: py-dalga 2s ease-out infinite; }
          @keyframes py-dalga { 0% { transform: scale(0.8); opacity: 1 } 100% { transform: scale(1.25); opacity: 0 } }
        }
        @media (max-width: 640px) {
          .py-yol { flex-direction: column; gap: 16px; align-items: stretch; }
          .py-durak { display: flex; align-items: center; gap: 12px; text-align: left; padding: 0; }
          .py-nokta { margin: 0; flex: 0 0 auto; width: 46px; height: 46px; }
          .py-durak + .py-durak::before { display: none; }
          .py-durak b { margin-top: 0; }
          .py-govde { min-width: 0; }
        }
      `}</style>

      {duraklar.map((d, i) => (
        <div key={i} className={`py-durak ${d.tip}`}>
          <span className="py-nokta" aria-label={d.tip === 'tamam' ? 'Tamamlandı' : d.tip === 'hedef' ? 'Günlük hedef' : undefined}>
            {d.tip === 'tamam' ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><path d="M4 12.5 9.5 18 20 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            ) : d.tip === 'hedef' ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 21V4m0 0h12l-2.5 4L17 12H5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            ) : (
              d.no
            )}
          </span>
          <span className="py-govde">
            {d.dersKisa && (
              <span className="py-cip" style={{ background: `color-mix(in srgb, ${d.dersRenk} 12%, transparent)`, color: d.dersRenk }}>
                {d.dersKisa}
              </span>
            )}
            <b>{d.baslik}</b>
            {d.detay && <span className="py-det">{d.detay}</span>}
            {d.tip === 'aktif' && d.onDevam && (
              <button type="button" className="py-devam" onClick={d.onDevam}>Buradan devam</button>
            )}
          </span>
        </div>
      ))}
    </div>
  )
}

export default PlanYolu
