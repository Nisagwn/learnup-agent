import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useSinif } from '../../lib/sinif'
import { Sayfa } from '../../components/RolGecidi'
import { Reveal } from '../../components/fx'
import {
  KarsilastirmaIzgarasi, OgrenciSecici, SonAktiflikSeridi,
} from '../../components/sinif'

const EN_FAZLA = 4

/**
 * ÖĞRENCİ KARŞILAŞTIRMA — FİDAN (GOREV-038; onaylı önizleme:
 * docs/design/onizleme/karsilastirma.html).
 *
 * Seçim URL'de (?ogrenci=a,b,c): karşılaştırmanın KENDİSİ artefakttır; yenilemeyi,
 * yapıştırmayı ve geri tuşunu atlatmalı. Modal olsaydı hiçbiri olmazdı.
 *
 * Ölçek SATIR BAŞINA normalize edilir (KarsilastirmaIzgarasi) — yatay taramayı
 * dürüst kılan şey bu. Tüm ölçütler GERÇEK roster alanlarından; sınıf ortalaması
 * da roster'dan hesaplanır (uydurma yok, null ≠ 0).
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
      <style>{`
        .ka-cip { font-family: 'JetBrains Mono', monospace; font-size: 10.5px; font-weight: 600;
          letter-spacing: .06em; color: var(--vurgu); background: var(--v1); padding: 5px 12px;
          border-radius: 11px; }
        .ka-kod { font-family: 'JetBrains Mono', monospace; font-size: 11px; background: var(--v1);
          padding: 1.5px 6px; border-radius: 6px; color: var(--vurgu); }
      `}</style>

      {/* ── Başlık ── */}
      <Reveal>
        <section className="glass flex flex-wrap items-start justify-between gap-3 rounded-[20px] p-[22px] shadow-card">
          <div className="min-w-0">
            <h1 className="text-[20px] font-bold tracking-tight" style={{ color: 'var(--metin1)', fontFamily: 'Outfit, sans-serif' }}>
              Öğrenci Karşılaştırma
            </h1>
            <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed" style={{ color: 'var(--metin3)' }}>
              Aynı satır, aynı ölçek — fark göze çarpsın diye. Her ölçüt kendi içinde normalize edilir.
            </p>
          </div>
          <span className="ka-cip shrink-0">{secilenler.length}/{EN_FAZLA} seçili</span>
        </section>
      </Reveal>

      {/* ── Seçici ── */}
      <Reveal delay={0.05}>
        <section className="glass mt-3.5 rounded-[20px] p-[22px] shadow-card">
          <span className="mb-2.5 block text-[10.5px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--metin3)' }}>
            Öğrenci seç · en fazla {EN_FAZLA}
          </span>
          {loading && roster.length === 0 ? (
            <p className="text-[12.5px]" style={{ color: 'var(--metin3)' }}>Sınıf mevcudu yükleniyor…</p>
          ) : roster.length === 0 ? (
            <p className="text-[12.5px]" style={{ color: 'var(--metin3)' }}>Sınıfında henüz öğrenci yok.</p>
          ) : (
            <OgrenciSecici ogrenciler={roster} secili={secili} enFazla={EN_FAZLA} onDegis={ayarla} />
          )}
          <p className="mt-2.5 text-[11px] leading-relaxed" style={{ color: 'var(--metin3)' }}>
            Seçim adres çubuğunda taşınır (<code className="ka-kod">?ogrenci=a,b,c</code>) — karşılaştırmayı
            yenile, yapıştır, geri tuşuyla dön: hepsi çalışır.
          </p>
        </section>
      </Reveal>

      {secilenler.length < 2 ? (
        <Reveal delay={0.1}>
          <section className="glass mt-3.5 rounded-[20px] px-6 py-10 text-center shadow-card">
            <div className="mx-auto mb-3.5 w-fit"><FidanFiliz /></div>
            <h3 className="text-[15px] font-bold" style={{ color: 'var(--metin2)', fontFamily: 'Outfit, sans-serif' }}>
              En az iki öğrenci seç
            </h3>
            <p className="mx-auto mt-1.5 max-w-sm text-[12.5px] leading-relaxed" style={{ color: 'var(--metin3)' }}>
              {loading
                ? 'Sınıf mevcudu yükleniyor…'
                : 'Karşılaştırma, iki öğrencinin aynı ölçütteki farkını yan yana gösterir.'}
            </p>
          </section>
        </Reveal>
      ) : (
        <>
          <Reveal delay={0.1}>
            <div className="mt-3.5">
              {/* Sınıf ortalaması TÜM roster'dan hesaplanır (gerçek veri; sağlayıcıda
                  zaten yüklü). Roster tek öğrenciyse ortalama sütunu yine anlamlı. */}
              <KarsilastirmaIzgarasi ogrenciler={secilenler} sinifOrtalama={roster} />
            </div>
          </Reveal>
          <Reveal delay={0.16}>
            <div className="mt-3.5"><SonAktiflikSeridi ogrenciler={secilenler} /></div>
          </Reveal>
        </>
      )}
    </Sayfa>
  )
}

/** FİDAN filizi — boş durum süsü (önizlemedeki inline filiz; recharts çekmez). */
function FidanFiliz() {
  return (
    <svg width="64" height="64" viewBox="0 0 32 32" aria-hidden>
      <defs>
        <linearGradient id="ka-filiz" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--adacayi)" />
          <stop offset="1" stopColor="var(--yaprak)" />
        </linearGradient>
      </defs>
      <g fill="none" stroke="url(#ka-filiz)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 27V14" />
        <path d="M16 17c0-3.6-2.9-5.9-7-5.9 0 3.6 2.9 5.9 7 5.9Z" />
        <path d="M16 15c0-3 2.4-5.1 6-5.1 0 3-2.4 5.1-6 5.1Z" />
      </g>
    </svg>
  )
}
