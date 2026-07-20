import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAsync } from '../lib/useAsync'
import { apiGet } from '../lib/api.js'
import type { KaliteYanit, RontgenNode, RontgenYanit } from '../lib/types'
import { GlowButton, StatusLine, Skeleton } from '../components/ui'
import { GlowBorder, Reveal, WaveDivider } from '../components/fx'
import { Lighthouse } from '../components/Lighthouse'
import { CanliSayi, Sayi, Halka, Sparkline, StatTile } from '../components/cekirdek'
import {
  TrendPaneli, TakvimIsi, UstalikMatrisi, OncelikRadari, TuzakPaneli,
  HizPaneli, KapsamaKarti, GuvencePaneli, type DersGrubu,
} from '../components/rontgen'

/* ═══════════════════════════════════════════════════════════════════════════
   ANALİZ — Bilişsel Röntgen. Motorun ham verisi (BKT-lite + çürüme + yapisal-eval)
   tek bakışta okunur: KPI şeridi → Ustalık Matrisi + Trend + Takvim (sol) ·
   Radar + Tuzak + Hız + Kapsama + Havuz Güvencesi (sağ).
   Veri: GET /mastery/rontgen (tek istek) + /questions/ai/kalite + /questions/ai/topics.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Konu { kazanimId: number; title: string; subject: string; count: number }

export function Harita() {
  const nav = useNavigate()
  const rontgen = useAsync<RontgenYanit>(() => apiGet('/mastery/rontgen'), [])
  const kalite = useAsync<KaliteYanit>(() => apiGet('/questions/ai/kalite'), [])
  const konular = useAsync<{ subjects: Array<{ subject: string; topics: Konu[] }> }>(
    () => apiGet('/questions/ai/topics'), [],
  )

  const nodes = useMemo(() => rontgen.data?.nodes ?? [], [rontgen.data])
  const trend = useMemo(() => rontgen.data?.trend ?? [], [rontgen.data])

  /* ── Türetimler ── */

  const genelUstalik = useMemo(
    () => (nodes.length ? nodes.reduce((s, n) => s + n.mastery, 0) / nodes.length : 0),
    [nodes],
  )

  const toplamKazanim = useMemo(
    () => (rontgen.data?.curriculum ?? []).reduce((s, c) => s + c.total, 0),
    [rontgen.data],
  )

  // Son 7 gün ↔ önceki 7 gün doğruluğu (yüzde puan farkı)
  const dogruluk = useMemo(() => {
    const gun = (iso: string) => Math.floor((Date.now() - +new Date(iso + 'T12:00:00')) / 86_400_000)
    let s7 = { c: 0, n: 0 }, o7 = { c: 0, n: 0 }
    for (const g of trend) {
      const f = gun(g.date)
      if (f < 7) { s7.c += g.correct; s7.n += g.solved }
      else if (f < 14) { o7.c += g.correct; o7.n += g.solved }
    }
    const son = s7.n ? Math.round((s7.c / s7.n) * 100) : null
    const once = o7.n ? Math.round((o7.c / o7.n) * 100) : null
    return { son, delta: son != null && once != null ? son - once : null, n7: s7.n }
  }, [trend])

  // 12 günlük sparkline (günlük çözülen)
  const kivilcim = useMemo(() => {
    const map = new Map(trend.map((g) => [g.date, g.solved]))
    const dizi: number[] = []
    for (let i = 11; i >= 0; i--) {
      const key = new Date(Date.now() - i * 86_400_000).toLocaleDateString('en-CA')
      dizi.push(map.get(key) ?? 0)
    }
    return dizi
  }, [trend])

  const sinyal = useMemo(() => {
    const yanilgi = nodes.reduce((s, n) => s + n.openMisconceptions, 0)
    const zayif = nodes.filter((n) => n.attempts >= 2 && n.mastery < 0.45).length
    return { yanilgi, zayif }
  }, [nodes])

  const gruplar = useMemo<DersGrubu[]>(() => {
    const map = new Map<string, RontgenNode[]>()
    for (const n of nodes) {
      const dizi = map.get(n.subject)
      if (dizi) dizi.push(n)
      else map.set(n.subject, [n])
    }
    return [...map.entries()].map(([subject, ns]) => ({
      subject,
      nodes: ns,
      ortalama: ns.reduce((s, n) => s + n.mastery, 0) / ns.length,
    }))
  }, [nodes])

  const havuzKonulari = useMemo(
    () => (konular.data?.subjects ?? []).flatMap((s) => s.topics),
    [konular.data],
  )
  const havuzda = useMemo(() => new Set(havuzKonulari.map((k) => k.kazanimId)), [havuzKonulari])

  const zayiflar = useMemo(
    () => [...nodes].filter((n) => n.attempts >= 2).sort((a, b) => a.mastery - b.mastery).slice(0, 5),
    [nodes],
  )
  const kesfedilmemis = useMemo(() => {
    const bilinen = new Set(nodes.map((n) => n.kazanimId))
    return havuzKonulari.filter((k) => !bilinen.has(k.kazanimId)).slice(0, 2)
  }, [nodes, havuzKonulari])

  const kapsamaSatirlar = useMemo(() => {
    const taranan = new Map<string, number>()
    for (const n of nodes) taranan.set(n.subject, (taranan.get(n.subject) ?? 0) + 1)
    return (rontgen.data?.curriculum ?? [])
      .map((c) => ({ subject: c.subject, taranan: taranan.get(c.subject) ?? 0, toplam: c.total }))
      .sort((a, b) => b.taranan - a.taranan || b.toplam - a.toplam)
      .slice(0, 8)
  }, [nodes, rontgen.data])

  // "Doğru ama yavaş": ort. gecikmesi 40s üstü, en az 3 denemeli — en yavaş 3
  const yavaslar = useMemo(
    () => [...nodes]
      .filter((n) => (n.avgLatencyMs ?? 0) > 40_000 && n.attempts >= 3)
      .sort((a, b) => (b.avgLatencyMs ?? 0) - (a.avgLatencyMs ?? 0))
      .slice(0, 3),
    [nodes],
  )

  const calis = (n: { kazanimId: number; subject: string; title: string }) =>
    nav('/coz', { state: { source: 'ai', kazanimId: n.kazanimId, subject: n.subject, title: n.title } })

  /* ── Durumlar ── */

  if (rontgen.loading) {
    return (
      <Sayfa>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </Sayfa>
    )
  }

  if (rontgen.error) {
    return (
      <Sayfa>
        <div className="glass-solid mx-auto max-w-md rounded-2xl px-6 py-8 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">Röntgen çekilemedi: {rontgen.error}</p>
          <GlowButton className="mt-4" variant="outline" onClick={() => rontgen.reload()}>Tekrar dene</GlowButton>
        </div>
      </Sayfa>
    )
  }

  if (!nodes.length) {
    return (
      <Sayfa>
        <Baslik />
        <Reveal delay={0.05}>
          <div className="glass mx-auto mt-10 max-w-lg rounded-3xl px-8 py-10 text-center">
            <div className="mx-auto w-fit"><Lighthouse size={84} /></div>
            <h2 className="mt-4 font-display text-xl font-bold text-slate-800 dark:text-slate-100">
              Röntgen henüz çekilmedi
            </h2>
            <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
              Bilişsel haritan soru çözdükçe belirir: her cevap, kazanım başına ustalık
              tahminini güncelleyen BKT motorunu besler. İlk blok yeterli.
            </p>
            <GlowButton className="mt-6" icon="bolt" onClick={() => nav('/coz', { state: { source: 'ai' } })}>
              İlk röntgeni çek
            </GlowButton>
          </div>
        </Reveal>
      </Sayfa>
    )
  }

  return (
    <Sayfa>
      <Baslik />

      {/* ── KPI şeridi ── */}
      <Reveal delay={0.04}>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {/* HERO — sayfanın tek kalıcı neonu */}
          <GlowBorder mode="always">
            <div className="glass flex items-center gap-4 rounded-2xl px-5 py-4">
              <Halka oran={genelUstalik} boyut={72} kalinlik={7}>
                <span className="font-display text-[17px] font-bold text-slate-800 dark:text-slate-100">
                  <CanliSayi value={Math.round(genelUstalik * 100)} />
                </span>
              </Halka>
              <div>
                <div className="font-display text-[11.5px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">
                  Genel Ustalık
                </div>
                <div className="mt-1 font-display text-[26px] font-bold leading-none tracking-tight text-slate-800 dark:text-slate-100">
                  %<Sayi value={Math.round(genelUstalik * 100)} />
                </div>
                <div className="mt-1.5 font-mono text-[10.5px] text-slate-400 dark:text-slate-500">
                  çürüme uygulanmış · {nodes.length} kazanım
                </div>
              </div>
            </div>
          </GlowBorder>

          <StatTile icon="waves" label="Kapsama"
            alt={<span>{nodes.length}/{toplamKazanim || '—'} kazanım tarandı</span>}>
            %<CanliSayi value={toplamKazanim ? Math.round((nodes.length / toplamKazanim) * 100) : 0} />
          </StatTile>

          <StatTile icon="trend" label="7 Gün Doğruluk"
            delta={dogruluk.delta}
            alt={
              <span className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">{dogruluk.n7} soru · önceki 7 güne göre</span>
                <Sparkline veri={kivilcim} genislik={64} yukseklik={22} />
              </span>
            }>
            {dogruluk.son == null ? <span className="text-slate-300 dark:text-slate-600">—</span> : <>%<CanliSayi value={dogruluk.son} /></>}
          </StatTile>

          <StatTile icon="target" label="Aktif Sinyal"
            alt={<span>{sinyal.yanilgi} açık yanılgı · {sinyal.zayif} zayıf kazanım</span>}>
            <CanliSayi value={sinyal.yanilgi + sinyal.zayif} />
          </StatTile>
        </div>
      </Reveal>

      <WaveDivider className="mt-7" />

      {/* ── Ana grid ── */}
      {/* minmax(0,·): uzun kazanım başlıkları rayı şişirip sütunları üst üste bindirmesin */}
      <div className="mt-7 grid items-start gap-6 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
        {/* SOL */}
        <div className="min-w-0 space-y-6">
          <Reveal delay={0.1}>
            <UstalikMatrisi gruplar={gruplar} havuzda={havuzda} onCalis={calis} />
          </Reveal>
          <Reveal delay={0.16}>
            <TrendPaneli trend={trend} />
          </Reveal>
          <Reveal delay={0.2}>
            <TakvimIsi trend={trend} />
          </Reveal>
        </div>

        {/* SAĞ */}
        <div className="min-w-0 space-y-6">
          <Reveal delay={0.14}>
            <OncelikRadari
              zayiflar={zayiflar}
              kesfedilmemis={kesfedilmemis}
              onCalis={calis}
              onKesfet={calis}
            />
          </Reveal>
          {rontgen.data && rontgen.data.traps.length > 0 && (
            <Reveal delay={0.18}>
              <TuzakPaneli traps={rontgen.data.traps} />
            </Reveal>
          )}
          <Reveal delay={0.22}>
            <HizPaneli yavaslar={yavaslar} zorluk={rontgen.data?.zorluk ?? { kolay: 0, orta: 0, zor: 0 }} />
          </Reveal>
          <Reveal delay={0.26}>
            <KapsamaKarti satirlar={kapsamaSatirlar} />
          </Reveal>
          {/* Kalite ucu düşerse panel SESSİZCE gizlenir (uydurma yok) */}
          {kalite.data && (
            <Reveal delay={0.3}>
              <GuvencePaneli kalite={kalite.data} />
            </Reveal>
          )}
        </div>
      </div>
    </Sayfa>
  )
}

function Sayfa({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-7xl px-[clamp(16px,3.5vw,44px)] pb-20 pt-9">
      {children}
    </div>
  )
}

function Baslik() {
  return (
    <Reveal>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[28px] font-bold tracking-tight text-slate-800 dark:text-slate-100">
            Bilişsel Röntgen
          </h1>
          <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">
            Ustalık, çürümeyle birlikte canlı hesaplanır — harita her bakışta güncel.
          </p>
        </div>
        <StatusLine>motor canlı · BKT-lite + çürüme</StatusLine>
      </div>
    </Reveal>
  )
}
