import { useMemo, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { apiDelete, apiGet, apiPost } from '../../lib/api'
import { useAsync } from '../../lib/useAsync'
import { useSinif } from '../../lib/sinif'
import type { SinifZayifKazanim, SinifZayifYaniti } from '../../lib/types.teacher'
import { Sayfa, PanoIskeleti } from '../../components/RolGecidi'
import { GlowButton, StatusLine } from '../../components/ui'
import { CanliSayi, Halka, Sayi, Sparkline, StatTile } from '../../components/cekirdek'
import { GlowBorder, Reveal, WaveDivider } from '../../components/fx'
import { TrendPaneli } from '../../components/rontgen'
import {
  AksiyonMerkezi, OgrenciListesi, SecimCubugu, SinifBaslik, SinifKodKarti,
  TriajKuyrugu, type SiraAnahtar,
} from '../../components/sinif'

/**
 * SINIF PANOSU — öğretmenin her sabah açtığı sayfa.
 *
 * Roster + triyaj + aksiyon TEK sayfada: ayrı route'taki bir triyaj kuyruğu iki kez
 * ziyaret edilip terk edilir. Yerleşim Harita.tsx'in imzası (KPI şeridi + 1.9fr/1fr).
 *
 * Bulanıklık bütçesi: TopBar (1) + seçim çubuğu (geçici) → tavan 5'in çok altında.
 * Kalıcı GlowBorder: 1 (Sınıf Ustalığı hero'su).
 */
export function SinifPanosu() {
  const nav = useNavigate()
  const { ozet, roster, loading, error, reload } = useSinif()
  const zayif = useAsync<SinifZayifYaniti>(() => apiGet('/teacher/sinif/zayif-kazanimlar', { limit: 8 }), [])

  const [secili, setSecili] = useState<Set<string>>(new Set())
  const [sirala, setSirala] = useState<SiraAnahtar>('risk')
  const [arama, setArama] = useState('')

  const kivilcim = useMemo(
    () => roster.slice(0, 12).map((o) => o.solved),
    [roster],
  )

  if (loading) return <PanoIskeleti sutun={2} />

  if (error) {
    return (
      <Sayfa>
        <div className="glass-solid mx-auto max-w-md rounded-2xl px-6 py-8 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">Sınıf verisi alınamadı: {error}</p>
          <GlowButton className="mt-4" variant="outline" onClick={reload}>Tekrar dene</GlowButton>
        </div>
      </Sayfa>
    )
  }

  const o = ozet
  const secimAc = (id: string): void => {
    const y = new Set(secili)
    if (y.has(id)) y.delete(id)
    else y.add(id)
    setSecili(y)
  }
  const hepsiSec = (): void => {
    const hepsi = roster.every((r) => secili.has(r.studentId))
    setSecili(hepsi ? new Set() : new Set(roster.map((r) => r.studentId)))
  }

  // Gövde bloklu: react-router 7'de nav() `void | Promise<void>` döner.
  const setGonder = (d: SinifZayifKazanim): void => {
    void nav(`/sinif/odev?kazanim=${d.kazanimId}&ders=${encodeURIComponent(d.subject)}`)
  }

  const ogrenciEkle = async (email: string): Promise<void> => {
    try {
      const y = await apiPost('/teacher/ogrenci', { email })
      if (!y.eklendi) toast.info(`${y.student?.name ?? 'Öğrenci'} zaten sınıfında`)
      else toast.success(`${y.student?.name ?? 'Öğrenci'} sınıfa eklendi`)
      reload()
    } catch (e: any) {
      // `baska_sinifta` (409) bir arıza değil, KASITLI SINIR: başka öğretmenin
      // öğrencisi sessizce devralınamaz. Uzun açıklamayı okunur tutmak için
      // `duration` uzatılıyor — bu toast bir talimat içeriyor.
      toast.error(e?.message ?? 'Öğrenci eklenemedi', { duration: 8000 })
    }
  }

  const ogrenciCikar = async (id: string): Promise<void> => {
    try {
      const y = await apiDelete(`/teacher/ogrenci/${id}`)
      toast.success(`${y.student?.name ?? 'Öğrenci'} sınıftan çıkarıldı`)
      setSecili((s) => {
        const n = new Set(s)
        n.delete(id)
        return n
      })
      reload()
    } catch (e: any) {
      toast.error(e?.message ?? 'Öğrenci çıkarılamadı')
    }
  }

  return (
    <Sayfa>
      <Reveal>
        <SinifBaslik
          ad="Sınıf Panosu"
          altBilgi="Motor gece boyunca çalıştı; aşağıdakiler bugün müdahale isteyenler."
          sag={<StatusLine>{o?.sinif.ogrenciSayisi ?? 0} öğrenci · canlı</StatusLine>}
        />
      </Reveal>

      <Reveal delay={0.04}>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {/* Sayfanın TEK kalıcı neonu. İçi glass-solid: GlowBorder'ın iç yüzeyi zaten
              opak (--page-bg), .glass koymak görsel olarak ölü olurdu. */}
          <GlowBorder mode="always">
            <div className="glass-solid flex items-center gap-4 rounded-2xl px-5 py-4">
              <Halka oran={o?.ortalamaUstalik ?? 0} boyut={72} kalinlik={7}>
                <span className="font-display text-[15px] font-bold text-slate-700 dark:text-slate-200">
                  {o?.ortalamaUstalik === null || o?.ortalamaUstalik === undefined
                    ? '—'
                    : <>%<CanliSayi value={Math.round(o.ortalamaUstalik * 100)} /></>}
                </span>
              </Halka>
              <div className="min-w-0">
                <p className="font-display text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                  Sınıf Ustalığı
                </p>
                <p className="mt-1 font-mono text-[10.5px] leading-relaxed text-slate-400 dark:text-slate-500">
                  {o?.ortalamaUstalik === null
                    ? 'henüz ölçüm yok'
                    : `çürüme uygulanmış · ${o?.sinif.ogrenciSayisi ?? 0} öğrenci`}
                </p>
              </div>
            </div>
          </GlowBorder>

          <StatTile
            icon="waves"
            label="Aktif Öğrenci"
            alt={`son 7 günde çözüm yapan · ${o?.sinif.hicBaslamayan ?? 0} hiç başlamadı`}
          >
            <CanliSayi value={o?.sinif.aktif7Gun ?? 0} />
          </StatTile>
          <StatTile
            icon="trend"
            label="7 Gün Doğruluk"
            alt={
              <span className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">{o?.hafta.cozulen ?? 0} soru çözüldü</span>
                {kivilcim.length > 1 && <Sparkline veri={kivilcim} genislik={64} yukseklik={22} />}
              </span>
            }
          >
            {/* Hiç çözüm yoksa "—": %0 doğruluk ile "hiç denenmedi" AYNI ŞEY DEĞİL. */}
            {o?.hafta.basariOrani == null
              ? <span className="text-slate-300 dark:text-slate-600">—</span>
              : <>%<CanliSayi value={Math.round(o.hafta.basariOrani * 100)} /></>}
          </StatTile>
          <StatTile
            icon="target"
            label="Açık Sinyal"
            alt={`${zayif.data?.kazanimlar.length ?? 0} zayıf kazanım kuyrukta`}
          >
            <CanliSayi value={o?.acikYanilgi ?? 0} />
          </StatTile>
        </div>
      </Reveal>

      <WaveDivider className="mt-7" />

      <div className="mt-7 grid items-start gap-6 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <Reveal delay={0.1}>
            <OgrenciListesi
              ogrenciler={roster}
              secili={secili}
              onSec={secimAc}
              onHepsi={hepsiSec}
              onAc={(id) => nav(`/sinif/ogrenci/${id}`)}
              sirala={sirala}
              onSirala={setSirala}
              arama={arama}
              onArama={setArama}
              onCikar={ogrenciCikar}
            />
          </Reveal>
          {/* Veri yoksa panel kendini gizler — Harita.tsx:270 disiplini.
              Yer tutucu bir "boş grafik" çizmek, ölçüm yokluğunu düz çizgi gibi gösterirdi. */}
          {(o?.trend.length ?? 0) > 1 && (
            <Reveal delay={0.16}><TrendPaneli trend={o!.trend} /></Reveal>
          )}
        </div>

        <div className="min-w-0 space-y-6">
          <Reveal delay={0.14}>
            <TriajKuyrugu
              dugumler={zayif.data?.kazanimlar ?? []}
              onSetGonder={setGonder}
              onOgrenciler={(d) => nav(`/sinif/isi?ders=${encodeURIComponent(d.subject)}`)}
            />
          </Reveal>
          <Reveal delay={0.18}>
            <AksiyonMerkezi
              sayaclar={{
                bekleyenGonderim: 0,
                acikYanilgi: o?.acikYanilgi ?? 0,
                hicBaslamayan: o?.sinif.hicBaslamayan ?? 0,
                aktif7Gun: o?.sinif.aktif7Gun ?? 0,
              }}
              onGit={(k) => {
                if (k === 'bekleyenGonderim') nav('/sinif/odev')
                else if (k === 'acikYanilgi') setSirala('risk')
                else if (k === 'hicBaslamayan') setSirala('ustalik')
              }}
            />
          </Reveal>
          <Reveal delay={0.22}>
            <SinifKodKarti kod={o?.ogretmen.classCode ?? null} onEkle={ogrenciEkle} />
          </Reveal>
        </div>
      </div>

      <AnimatePresence>
        {secili.size > 0 && (
          <SecimCubugu
            sayi={secili.size}
            onKarsilastir={() => nav(`/sinif/karsilastir?ogrenci=${[...secili].join(',')}`)}
            onTemizle={() => setSecili(new Set())}
          />
        )}
      </AnimatePresence>
    </Sayfa>
  )
}
