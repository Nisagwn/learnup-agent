import { useMemo } from 'react'
import { apiGet } from '../../lib/api'
import { useAsync } from '../../lib/useAsync'
import { useSorgu } from '../../lib/sorgu'
import { dersAnahtar } from '../../lib/format'
import type { IsiHaritasiYaniti } from '../../lib/types.teacher'
import { Sayfa } from '../../components/RolGecidi'
import { FiltreCipi, GlowButton, Skeleton, StatusLine, SubjectName } from '../../components/ui'
import { CanliSayi, StatTile } from '../../components/cekirdek'
import { GlowBorder, Reveal } from '../../components/fx'
import { SinifBaslik, SinifIsiMatrisi, UniteZafiyetSeridi } from '../../components/sinif'

/**
 * KAZANIM ISI HARİTASI — kendi route'u, TAM GENİŞLİK.
 *
 * 1.9fr/1fr yerleşimi burada YOK: matris yatay kayan geniş bir artefakt; dar sütuna
 * sıkıştırmak hücreleri okunabilirlik tabanının altına indirirdi.
 *
 * Filtreler URL'de (?ders=…&unite=…): "şu Kimya sütununa bak" öğretmenin zümre
 * sohbetine gerçekten attığı mesajdır — bağlantı paylaşılabilir olmalı.
 */
export function SinifIsi() {
  const [ders, setDers] = useSorgu<string>('ders', '')
  const [unite, setUnite] = useSorgu<string>('unite', '')

  // ⚠️ Bağımlılık İLKEL geçilir. useAsync deps'i effect dizisine yayar (useAsync.ts:19);
  // taze bir nesne/dizi geçmek sonsuz refetch demektir.
  const isi = useAsync<IsiHaritasiYaniti>(
    () => apiGet('/teacher/sinif/isi-haritasi', ders ? { subject: ders } : undefined),
    [ders],
  )

  const veri = isi.data
  const seciliHucre = useMemo(
    () => (unite ? veri?.cells.find((c) => c.unitPath === unite) : undefined),
    [veri, unite],
  )

  const enZayif = useMemo(() => {
    if (!veri?.cells.length) return null
    return veri.cells.reduce((a, b) => (a.avgMastery <= b.avgMastery ? a : b))
  }, [veri])

  const sinifOrt = useMemo(() => {
    if (!veri?.cells.length) return null
    return veri.cells.reduce((s, c) => s + c.avgMastery, 0) / veri.cells.length
  }, [veri])

  const kapsanan = veri?.cells.reduce((s, c) => s + c.nodeCount, 0) ?? 0

  if (isi.loading) {
    return (
      <Sayfa>
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="mt-6 h-[420px]" />
      </Sayfa>
    )
  }

  if (isi.error) {
    return (
      <Sayfa>
        <div className="glass-solid mx-auto max-w-md rounded-2xl px-6 py-8 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">Isı haritası alınamadı: {isi.error}</p>
          <GlowButton className="mt-4" variant="outline" onClick={() => isi.reload()}>Tekrar dene</GlowButton>
        </div>
      </Sayfa>
    )
  }

  return (
    <Sayfa>
      <Reveal>
        <SinifBaslik
          ad="Kazanım Isı Haritası"
          altBilgi="Sınıfın ortalama ustalığı, ünite kırılımında. Bir hücreye tıkla — o ünitenin dökümü aşağıda açılır."
          sag={<StatusLine>çürüme uygulanmış · {veri?.ogrenciSayisi ?? 0} öğrenci</StatusLine>}
        />
      </Reveal>

      <Reveal delay={0.05}>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <FiltreCipi aktif={!ders} onClick={() => setDers(null)}>Tümü</FiltreCipi>
          {(veri?.subjects ?? []).map((d) => (
            <FiltreCipi key={d} aktif={ders === d} onClick={() => setDers(ders === d ? null : d)}>
              <SubjectName subject={d} anahtar={dersAnahtar(d)} className="!text-[12.5px]" />
            </FiltreCipi>
          ))}
        </div>
      </Reveal>

      <Reveal delay={0.08}>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <StatTile icon="scan" label="Kapsanan Kazanım" alt={`${veri?.cells.length ?? 0} ders × ünite hücresi`}>
            <CanliSayi value={kapsanan} />
          </StatTile>
          <StatTile icon="gauge" label="Sınıf Ortalaması" alt="tüm ünitelerin ortalaması">
            {sinifOrt === null
              ? <span className="text-slate-300 dark:text-slate-600">—</span>
              : <>%<CanliSayi value={Math.round(sinifOrt * 100)} /></>}
          </StatTile>
          <StatTile
            icon="bolt"
            label="En Zayıf Ünite"
            alt={enZayif ? `${enZayif.subject} · %${Math.round(enZayif.avgMastery * 100)}` : 'ölçüm yok'}
          >
            <span className="truncate text-[20px]">
              {enZayif?.unitTitle ?? enZayif?.unitPath ?? '—'}
            </span>
          </StatTile>
        </div>
      </Reveal>

      <Reveal delay={0.12}>
        <div className="mt-6">
          {/* Sayfanın TEK kalıcı neonu — hero burada matrisin kendisi. */}
          <GlowBorder mode="always">
            {veri && (
              <SinifIsiMatrisi
                veri={veri}
                seciliUnite={unite || null}
                onHucre={(p) => setUnite(p)}
              />
            )}
          </GlowBorder>
        </div>
      </Reveal>

      {seciliHucre && (
        <Reveal delay={0.05}>
          <div className="mt-6">
            <UniteZafiyetSeridi unite={unite} hucre={seciliHucre} onKapat={() => setUnite(null)} />
          </div>
        </Reveal>
      )}
    </Sayfa>
  )
}
