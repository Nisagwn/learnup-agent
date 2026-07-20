import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useSinif } from '../../lib/sinif'
import { Sayfa } from '../../components/RolGecidi'
import { StatusLine } from '../../components/ui'
import { BosDurum } from '../../components/cekirdek'
import { GlowBorder, Reveal } from '../../components/fx'
import { Lighthouse } from '../../components/Lighthouse'
import {
  KarsilastirmaIzgarasi, OgrenciSecici, SinifBaslik, SonAktiflikSeridi,
} from '../../components/sinif'

const EN_FAZLA = 4

/**
 * ÖĞRENCİ KARŞILAŞTIRMA — "cerrah titizliği" görünümü.
 *
 * Seçim URL'de (?ogrenci=a,b,c): karşılaştırmanın KENDİSİ artefakttır; yenilemeyi,
 * yapıştırmayı ve geri tuşunu atlatmalı. Modal olsaydı hiçbiri olmazdı.
 *
 * Ölçek SATIR BAŞINA normalize edilir (KarsilastirmaIzgarasi) — yatay taramayı
 * dürüst kılan şey bu.
 */
export function Karsilastir() {
  const { roster, loading } = useSinif()
  const [params, setParams] = useSearchParams()

  const secili = useMemo(
    () => (params.get('ogrenci') ?? '').split(',').filter(Boolean).slice(0, EN_FAZLA),
    [params],
  )

  const ayarla = (ids: string[]): void => {
    const p = new URLSearchParams(params)
    if (ids.length) p.set('ogrenci', ids.join(','))
    else p.delete('ogrenci')
    // replace: filtre kurcalamak geçmişi doldurmasın.
    setParams(p, { replace: true })
  }

  const secilenler = useMemo(
    () => secili.map((id) => roster.find((o) => o.studentId === id)).filter((o): o is NonNullable<typeof o> => !!o),
    [secili, roster],
  )

  return (
    <Sayfa>
      <Reveal>
        <SinifBaslik
          ad="Öğrenci Karşılaştırma"
          altBilgi="Aynı satır, aynı ölçek — fark göze çarpsın diye. Her ölçüt kendi içinde normalize edilir."
          sag={<StatusLine active={secilenler.length > 1}>{secilenler.length}/{EN_FAZLA} seçili</StatusLine>}
        />
      </Reveal>

      <Reveal delay={0.05}>
        <div className="mt-5">
          <OgrenciSecici ogrenciler={roster} secili={secili} enFazla={EN_FAZLA} onDegis={ayarla} />
        </div>
      </Reveal>

      {secilenler.length < 2 ? (
        <Reveal delay={0.1}>
          <div className="mt-8">
            <BosDurum
              gorsel={<Lighthouse size={72} />}
              baslik="En az iki öğrenci seç"
              aciklama={
                loading
                  ? 'Sınıf mevcudu yükleniyor…'
                  : 'Karşılaştırma, iki öğrencinin aynı ölçütteki farkını yan yana gösterir.'
              }
            />
          </div>
        </Reveal>
      ) : (
        <>
          <Reveal delay={0.1}>
            <div className="mt-6">
              <GlowBorder mode="always">
                <KarsilastirmaIzgarasi ogrenciler={secilenler} />
              </GlowBorder>
            </div>
          </Reveal>
          <Reveal delay={0.16}>
            <div className="mt-6"><SonAktiflikSeridi ogrenciler={secilenler} /></div>
          </Reveal>
        </>
      )}
    </Sayfa>
  )
}
