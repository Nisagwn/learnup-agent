import { apiGet } from '../../lib/api'
import { useAsync } from '../../lib/useAsync'
import { dersAnahtar } from '../../lib/format'
import type { AdminHavuzYaniti } from '../../lib/types.admin'
import { Sayfa, PanoIskeleti } from '../../components/RolGecidi'
import { Badge, GlowButton, StatusLine, SubjectName } from '../../components/ui'
import { CanliSayi, PanelBaslik, StatTile } from '../../components/cekirdek'
import { Reveal } from '../../components/fx'
import { DersKapsamaTablosu, KaliteHistogrami, OlcumYok, ZorlukDagilimi } from '../../components/kule'
import { SinifBaslik } from '../../components/sinif'

/**
 * SORU HAVUZU — kâşif sayfası.
 *
 * GlowBorder YOK: tek bir hero'su yok, hepsi eşit ağırlıkta göstergeler.
 * (Sayfa başına ≤1 kuralı TAVANDIR, kota değil.)
 */
export function SoruHavuzu() {
  const havuz = useAsync<AdminHavuzYaniti>(() => apiGet('/admin/havuz'), [])

  if (havuz.loading) return <PanoIskeleti sutun={2} />
  if (havuz.error) {
    return (
      <Sayfa>
        <div className="glass-solid mx-auto max-w-md rounded-2xl px-6 py-8 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">Havuz verisi alınamadı: {havuz.error}</p>
          <GlowButton className="mt-4" variant="outline" onClick={() => havuz.reload()}>Tekrar dene</GlowButton>
        </div>
      </Sayfa>
    )
  }

  const h = havuz.data!
  const kapsanmayan = h.kapsama.kazanimToplam - h.kapsama.herhangiKapsanan

  return (
    <Sayfa>
      <Reveal>
        <SinifBaslik
          ad="Soru Havuzu"
          altBilgi="Hacim, doğrulanmış oranı, kalite dağılımı ve müfredat kapsaması."
          sag={
            <StatusLine active={false}>
              son üretim {h.ai.sonUretim ? new Date(h.ai.sonUretim).toLocaleDateString('tr-TR') : '—'}
            </StatusLine>
          }
        />
      </Reveal>

      <Reveal delay={0.05}>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {/* ÖSYM = brass (mühür kimliği), AI = sky. /arsiv dışındaki tek meşru brass. */}
          <StatTile icon="seal" label="ÖSYM Çıkmış" alt={`${h.osym.yillar.length} yıl · ${h.osym.dersler.length} ders`}>
            <span className="text-brass-600 dark:text-brass-300"><CanliSayi value={h.osym.toplam} /></span>
          </StatTile>
          <StatTile icon="sparkle" label="AI Üretimi" alt={`doğrulanmış %${Math.round(h.ai.verifiedOrani * 100)}`}>
            <CanliSayi value={h.ai.toplam} />
          </StatTile>
          <StatTile icon="medal" label="Ortalama Kalite" alt="hakem ÖSYM-üslup skoru (1–5)">
            {h.ai.ortKalite == null ? <OlcumYok /> : <CanliSayi value={h.ai.ortKalite} />}
          </StatTile>
          <StatTile icon="scan" label="Kapsanan Kazanım" alt={`${kapsanmayan} kazanımda HİÇ soru yok`}>
            <CanliSayi value={h.kapsama.herhangiKapsanan} />
          </StatTile>
        </div>
      </Reveal>

      <Reveal delay={0.1}>
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <KaliteHistogrami veri={h.ai} />
          <ZorlukDagilimi zorluk={h.ai.zorluk} />
        </div>
      </Reveal>

      <Reveal delay={0.16}>
        <div className="mt-6"><DersKapsamaTablosu satirlar={h.kapsama.dersBazli} /></div>
      </Reveal>

      <Reveal delay={0.22}>
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="glass-solid rounded-2xl px-5 py-4">
            <PanelBaslik icon="history">ÖSYM Yıl Dağılımı</PanelBaslik>
            {h.osym.yillar.length === 0 ? (
              <OlcumYok />
            ) : (
              <ul className="space-y-1.5">
                {h.osym.yillar.map((y) => (
                  <li key={y.year} className="flex items-center justify-between font-mono text-[12px]">
                    <span className="text-slate-500 dark:text-slate-400">{y.year}</span>
                    <span className="text-slate-700 dark:text-slate-200">{y.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="glass-solid rounded-2xl px-5 py-4">
            <PanelBaslik
              icon="sparkle"
              sag={h.ai.kazanimsiz > 0 ? <Badge tone="amber">{h.ai.kazanimsiz} kazanımsız</Badge> : undefined}
            >
              AI Havuzu — Ders Kırılımı
            </PanelBaslik>
            <ul className="space-y-1.5">
              {h.ai.dersler.map((d) => (
                <li key={d.subject} className="flex items-center justify-between gap-2">
                  <SubjectName subject={d.subject} anahtar={dersAnahtar(d.subject)} className="!text-[12px]" />
                  <span className="font-mono text-[11.5px] text-slate-500 dark:text-slate-400">
                    {d.verified}/{d.count}
                  </span>
                </li>
              ))}
            </ul>
            {h.ai.kazanimsiz > 0 && (
              <p className="mt-3 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
                Kazanıma bağlanmamış sorular konu listesine giremez — pratik akışında
                servis edilemeyen ölü stoktur.
              </p>
            )}
          </div>
        </div>
      </Reveal>
    </Sayfa>
  )
}
