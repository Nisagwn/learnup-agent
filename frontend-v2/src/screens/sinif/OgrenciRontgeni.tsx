import { useCallback, useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apiGet } from '../../lib/api'
import { useAsync } from '../../lib/useAsync'
import { useSinif } from '../../lib/sinif'
import { dersAnahtar } from '../../lib/format'
import type { OgretmenRontgenYaniti } from '../../lib/types.teacher'
import type { RontgenNode } from '../../lib/types'
import { Sayfa, PanoIskeleti } from '../../components/RolGecidi'
import { Badge, Chip, GlowButton, StatusLine, SubjectName } from '../../components/ui'
import { CanliSayi, Halka, PanelBaslik, Sparkline, StatTile, Tip } from '../../components/cekirdek'
import { GlowBorder, Reveal, WaveDivider } from '../../components/fx'
import { Lighthouse } from '../../components/Lighthouse'
import {
  HizPaneli, OncelikRadari, TakvimIsi, TrendPaneli, TuzakPaneli, UstalikMatrisi,
  type DersGrubu,
} from '../../components/rontgen'
import { OgrenciBaslik, OgrenciGezinme } from '../../components/sinif'

/**
 * ÖĞRENCİ RÖNTGENİ — öğretmenin gördüğü, ÖĞRENCİNİN KENDİ EKRANIDIR.
 *
 * Panellerin hepsi (UstalikMatrisi, TrendPaneli, TakvimIsi, OncelikRadari, TuzakPaneli,
 * HizPaneli) rontgen.tsx'ten AYNEN gelir; backend de aynı gövdeyi döner. Tek fark
 * eylem fiilleri ("Çalış" → "Set gönder") ve teşhis dökümünün açık olması.
 *
 * "Aynı ürün" şartının en güçlü kanıtı bu ekran: öğretmen öğrenciyi, öğrencinin
 * gördüğü gözle görür.
 */
export function OgrenciRontgeni() {
  const nav = useNavigate()
  const { ogrenciId = '' } = useParams()
  const { ogrenciBul, siradaki } = useSinif()

  const rontgen = useAsync<OgretmenRontgenYaniti>(
    () => apiGet(`/teacher/ogrenci/${ogrenciId}/rontgen`),
    [ogrenciId],
  )
  const konular = useAsync<{ subjects: Array<{ subject: string; topics: Array<{ kazanimId: number; title: string; subject: string }> }> }>(
    () => apiGet('/questions/ai/topics'),
    [],
  )

  const satir = ogrenciBul(ogrenciId)
  const nodes = useMemo(() => rontgen.data?.nodes ?? [], [rontgen.data])
  const trend = useMemo(() => rontgen.data?.trend ?? [], [rontgen.data])

  const onceki = siradaki(ogrenciId, -1)
  const sonraki = siradaki(ogrenciId, 1)

  const git = useCallback((id: string | null) => { if (id) nav(`/sinif/ogrenci/${id}`) }, [nav])

  // ← / → roster sırasında gezinir, Esc panoya döner.
  // Girdi alanındayken devre dışı: arama yazan öğretmen sayfa değiştirmemeli.
  useEffect(() => {
    const tus = (e: KeyboardEvent): void => {
      const hedef = e.target
      if (hedef instanceof HTMLInputElement || hedef instanceof HTMLTextAreaElement) return
      if (e.key === 'ArrowLeft') git(onceki)
      else if (e.key === 'ArrowRight') git(sonraki)
      else if (e.key === 'Escape') nav('/sinif')
    }
    window.addEventListener('keydown', tus)
    return () => window.removeEventListener('keydown', tus)
  }, [onceki, sonraki, git, nav])

  /* ── Türetimler — Harita.tsx ile birebir ── */

  const genelUstalik = useMemo(
    () => (nodes.length ? nodes.reduce((s, n) => s + n.mastery, 0) / nodes.length : 0),
    [nodes],
  )
  const toplamKazanim = useMemo(
    () => (rontgen.data?.curriculum ?? []).reduce((s, c) => s + c.total, 0),
    [rontgen.data],
  )
  const dogruluk = useMemo(() => {
    const gun = (iso: string): number => Math.floor((Date.now() - +new Date(iso + 'T12:00:00')) / 86_400_000)
    const s7 = { c: 0, n: 0 }
    const o7 = { c: 0, n: 0 }
    for (const g of trend) {
      const f = gun(g.date)
      if (f < 7) { s7.c += g.correct; s7.n += g.solved }
      else if (f < 14) { o7.c += g.correct; o7.n += g.solved }
    }
    const son = s7.n ? Math.round((s7.c / s7.n) * 100) : null
    const once = o7.n ? Math.round((o7.c / o7.n) * 100) : null
    return { son, delta: son != null && once != null ? son - once : null, n7: s7.n }
  }, [trend])

  const kivilcim = useMemo(() => {
    const map = new Map(trend.map((g) => [g.date, g.solved]))
    const dizi: number[] = []
    for (let i = 11; i >= 0; i--) {
      dizi.push(map.get(new Date(Date.now() - i * 86_400_000).toLocaleDateString('en-CA')) ?? 0)
    }
    return dizi
  }, [trend])

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

  const yavaslar = useMemo(
    () => [...nodes]
      .filter((n) => (n.avgLatencyMs ?? 0) > 40_000 && n.attempts >= 3)
      .sort((a, b) => (b.avgLatencyMs ?? 0) - (a.avgLatencyMs ?? 0))
      .slice(0, 3),
    [nodes],
  )

  /** Öğrencide "Çalış" /coz'e giderdi; öğretmende atölyeye ÖN-DOLU gider. */
  // Gövde bloklu: react-router 7'de nav() `void | Promise<void>` döner, doğrudan
  // döndürmek `: void` imzasıyla çakışıyor.
  const setGonder = (n: { kazanimId: number; subject: string }): void => {
    void nav(`/sinif/odev?ogrenci=${ogrenciId}&kazanim=${n.kazanimId}&ders=${encodeURIComponent(n.subject)}`)
  }

  const baslik = (
    <OgrenciBaslik
      ad={rontgen.data?.student.name ?? satir?.name ?? null}
      grade={rontgen.data?.student.grade ?? satir?.grade ?? null}
      onGeri={() => nav('/sinif')}
      sag={<OgrenciGezinme onOnceki={onceki ? () => git(onceki) : null} onSonraki={sonraki ? () => git(sonraki) : null} />}
    />
  )

  if (rontgen.loading) return <PanoIskeleti sutun={2} />

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
        {baslik}
        <Reveal delay={0.05}>
          <div className="glass mx-auto mt-10 max-w-lg rounded-3xl px-8 py-10 text-center">
            <div className="mx-auto w-fit"><Lighthouse size={84} /></div>
            <h2 className="mt-4 font-display text-xl font-bold text-slate-800 dark:text-slate-100">
              Bu öğrenci henüz röntgen çekmedi
            </h2>
            <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
              Bilişsel harita soru çözdükçe belirir: her cevap, kazanım başına ustalık
              tahminini güncelleyen BKT motorunu besler. Bir tanışma seti yeterli.
            </p>
            <GlowButton className="mt-6" icon="book" onClick={() => nav(`/sinif/odev?ogrenci=${ogrenciId}`)}>
              Tanışma seti gönder
            </GlowButton>
          </div>
        </Reveal>
      </Sayfa>
    )
  }

  const yanilgilar = rontgen.data?.misconceptions ?? []

  return (
    <Sayfa>
      <Reveal>{baslik}</Reveal>

      <Reveal delay={0.04}>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <GlowBorder mode="always">
            <div className="glass-solid flex items-center gap-4 rounded-2xl px-5 py-4">
              <Halka oran={genelUstalik} boyut={72} kalinlik={7}>
                <span className="font-display text-[15px] font-bold text-slate-700 dark:text-slate-200">
                  %<CanliSayi value={Math.round(genelUstalik * 100)} />
                </span>
              </Halka>
              <div className="min-w-0">
                <p className="font-display text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                  Genel Ustalık
                </p>
                <p className="mt-1 font-mono text-[10.5px] leading-relaxed text-slate-400 dark:text-slate-500">
                  çürüme uygulanmış · {nodes.length} kazanım
                </p>
              </div>
            </div>
          </GlowBorder>

          <StatTile icon="waves" label="Kapsama" alt={`${toplamKazanim} müfredat kazanımı içinden`}>
            <CanliSayi value={nodes.length} />
          </StatTile>

          <StatTile
            icon="trend"
            label="7 Gün Doğruluk"
            delta={dogruluk.delta}
            alt={
              <span className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">{dogruluk.n7} soru · önceki 7 güne göre</span>
                <Sparkline veri={kivilcim} genislik={64} yukseklik={22} />
              </span>
            }
          >
            {dogruluk.son == null
              ? <span className="text-slate-300 dark:text-slate-600">—</span>
              : <>%<CanliSayi value={dogruluk.son} /></>}
          </StatTile>

          <StatTile icon="target" label="Açık Yanılgı" alt={`${zayiflar.length} kazanım öncelikli`}>
            <CanliSayi value={yanilgilar.length} />
          </StatTile>
        </div>
      </Reveal>

      <WaveDivider className="mt-7" />

      <div className="mt-7 grid items-start gap-6 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <Reveal delay={0.1}>
            <UstalikMatrisi
              gruplar={gruplar}
              havuzda={havuzda}
              calisEtiketi="Set gönder"
              onCalis={setGonder}
            />
          </Reveal>
          {trend.length > 1 && <Reveal delay={0.16}><TrendPaneli trend={trend} /></Reveal>}
          {trend.length > 0 && <Reveal delay={0.2}><TakvimIsi trend={trend} /></Reveal>}
        </div>

        <div className="min-w-0 space-y-6">
          <Reveal delay={0.14}>
            <OncelikRadari
              zayiflar={zayiflar}
              kesfedilmemis={kesfedilmemis}
              onCalis={setGonder}
              onKesfet={setGonder}
            />
          </Reveal>
          {/* TEŞHİS DÖKÜMÜ — yalnız öğretmende. Öğrenci ucu bu alanı hiç döndürmez
              (persona TESHIS_DILI_YOK: teşhis öğrenciye METİN olarak gösterilmez). */}
          {yanilgilar.length > 0 && (
            <Reveal delay={0.17}>
              <div className="glass-solid rounded-2xl px-5 py-4">
                <PanelBaslik icon="lightbulb" sag={<Badge tone="amber">{yanilgilar.length} açık</Badge>}>
                  Yanılgı Teşhisi
                </PanelBaslik>
                <ul className="space-y-3">
                  {yanilgilar.slice(0, 5).map((y, i) => (
                    <li key={`${y.kazanimId}-${i}`} className="rounded-xl border border-amber-500/20 px-3 py-2.5 dark:border-amber-400/15">
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0 font-display text-[12.5px] font-semibold text-slate-700 dark:text-slate-200">
                          {y.title}
                        </span>
                        {y.confidence !== null && (
                          <Tip icerik="ATLAS'ın bu teşhise güveni">
                            <span className="shrink-0 font-mono text-[10.5px] text-slate-400">
                              %{Math.round(y.confidence * 100)}
                            </span>
                          </Tip>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <SubjectName subject={y.subject} anahtar={dersAnahtar(y.subject)} className="!text-[11px]" />
                        {y.taxonomy && <Chip tone="amber" className="!py-0.5 !text-[10.5px]">{y.taxonomy}</Chip>}
                        {y.selectedOption && (
                          <Chip tone="rose" className="!py-0.5 !text-[10.5px]">sık seçilen: {y.selectedOption}</Chip>
                        )}
                      </div>
                      {y.evidence && (
                        <p className="mt-1.5 text-[11.5px] leading-relaxed text-slate-500 dark:text-slate-400">
                          {y.evidence}
                        </p>
                      )}
                      {y.prereqHypothesis && (
                        <p className="mt-1 text-[11px] italic leading-relaxed text-slate-400 dark:text-slate-500">
                          Önkoşul hipotezi: {y.prereqHypothesis}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          )}
          {(rontgen.data?.traps.length ?? 0) > 0 && (
            <Reveal delay={0.2}><TuzakPaneli traps={rontgen.data!.traps} /></Reveal>
          )}
          {yavaslar.length > 0 && (
            <Reveal delay={0.24}><HizPaneli yavaslar={yavaslar} zorluk={rontgen.data!.zorluk} /></Reveal>
          )}
        </div>
      </div>
    </Sayfa>
  )
}
