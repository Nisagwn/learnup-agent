import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../ui'
import { cn } from '../lib/cn'
import { useAsync } from '../lib/useAsync'
import { apiGet } from '../lib/api.js'
import { dersAnahtar } from '../lib/format'
import type { MatrisYaniti } from '../lib/types'
import { GlassCard, GlowButton, SubjectName, SectionLabel, Skeleton, Badge } from '../components/ui'
import { Reveal } from '../components/fx'
import { Sayi, Tip, PanelBaslik } from '../components/cekirdek'

/* ═══════════════════════════════════════════════════════════════════════════
   ÇIKMIŞ SORULAR — brass prestij kimliği (AI havuzuyla ASLA karışmaz).
   · Prestij bandı: mühür + canlı istatistikler + dalga sahnesi
   · TYT/AYT filtre çipleri · ders×yıl ISI MATRİSİ (hücre → doğrudan çöz)
   · Derse Göre / Yıla Göre listeler · hızlı eylemler (Rastgele 10 · TYT provası)
   Tek veri kaynağı: GET /questions/osym/matrix (N+1 istek YOK — eski ekran her
   ders için ayrı sayım isteği atıyordu).
   ═══════════════════════════════════════════════════════════════════════════ */

export function Arsiv() {
  const nav = useNavigate()
  const matris = useAsync<MatrisYaniti>(() => apiGet('/questions/osym/matrix'), [])
  const [etiket, setEtiket] = useState<string | null>(null) // TYT | AYT* | null

  const veri = matris.data

  // Etiket seçenekleri hücrelerden türetilir (TYT / AYT‑… ailelere indirgenir)
  const etiketler = useMemo(() => {
    const kume = new Set<string>()
    for (const c of veri?.cells ?? []) {
      if (!c.label) continue
      kume.add(c.label.startsWith('AYT') ? 'AYT' : c.label)
    }
    return [...kume].sort()
  }, [veri])

  const uygun = (label: string | null) =>
    !etiket || (label != null && (etiket === 'AYT' ? label.startsWith('AYT') : label === etiket))

  // Filtreli toplamlar
  const dersler = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of veri?.cells ?? []) if (uygun(c.label)) m.set(c.subject, (m.get(c.subject) ?? 0) + c.count)
    return [...m.entries()].map(([subject, count]) => ({ subject, count })).sort((a, b) => b.count - a.count)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [veri, etiket])

  const yillar = useMemo(() => {
    const m = new Map<number, { count: number; labels: Set<string> }>()
    for (const c of veri?.cells ?? []) {
      if (c.year == null || !uygun(c.label)) continue
      const g = m.get(c.year) ?? { count: 0, labels: new Set<string>() }
      g.count += c.count
      if (c.label) g.labels.add(c.label.startsWith('AYT') ? 'AYT' : c.label)
      m.set(c.year, g)
    }
    return [...m.entries()]
      .map(([year, g]) => ({ year, count: g.count, labels: [...g.labels].sort() }))
      .sort((a, b) => b.year - a.year)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [veri, etiket])

  // Isı matrisi: satır=ders (ilk 8), sütun=yıl (son 8)
  const matrisIzgara = useMemo(() => {
    const satirDersler = dersler.slice(0, 8).map((d) => d.subject)
    const sutunYillar = yillar.slice(0, 8).map((y) => y.year)
    const hucre = new Map<string, number>()
    let maks = 1
    for (const c of veri?.cells ?? []) {
      if (c.year == null || !uygun(c.label)) continue
      const key = `${c.subject}|${c.year}`
      const v = (hucre.get(key) ?? 0) + c.count
      hucre.set(key, v)
      if (v > maks) maks = v
    }
    return { satirDersler, sutunYillar, hucre, maks }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [veri, dersler, yillar, etiket])

  const toplam = dersler.reduce((s, d) => s + d.count, 0)
  const yilAraligi = yillar.length ? `${yillar[yillar.length - 1].year}–${yillar[0].year}` : '—'

  const cozDers = (subject?: string) => nav('/coz', { state: { source: 'osym', subject } })
  const cozYil = (year: number) => nav('/coz', { state: { source: 'osym', year } })
  const cozHucre = (subject: string, year: number) => nav('/coz', { state: { source: 'osym', subject, year } })

  return (
    <div className="pb-20">
      {/* ── Prestij bandı ── */}
      <div className="relative overflow-hidden bg-gradient-to-br from-[#0C3557] to-[#071F33]">
        <BantDalgalar />
        <div className="relative mx-auto max-w-7xl px-[clamp(16px,3.5vw,44px)] py-9">
          <Reveal>
            <div className="flex flex-wrap items-center gap-5">
              <div className="grid size-14 shrink-0 place-items-center rounded-2xl border-2 border-[#EFCB80] bg-gradient-to-br from-[#E3B564] to-[#B07E38] shadow-[0_6px_20px_rgba(0,0,0,0.25)]">
                <Icon name="seal" size={26} color="#3A2A08" strokeWidth={1.8} />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="font-display text-[26px] font-bold text-[#F4FAFF]">Çıkmış Sorular</h1>
                <p className="mt-0.5 text-[13px] text-[#CDE6F8]">
                  Gerçek ÖSYM arşivi — bir hücre, ders ya da yıl seç; çözmeye başla.
                </p>
              </div>
              {/* Canlı istatistikler */}
              <div className="flex gap-6">
                {[
                  { deger: <Sayi value={toplam} />, ad: 'soru' },
                  { deger: yilAraligi, ad: 'yıl aralığı' },
                  { deger: <Sayi value={dersler.length} />, ad: 'ders' },
                ].map((s, i) => (
                  <div key={i} className="text-center">
                    <div className="font-display text-[22px] font-bold leading-none text-[#F4FAFF]">{s.deger}</div>
                    <div className="mt-1 font-mono text-[10px] uppercase tracking-wide text-[#8FB6D8]">{s.ad}</div>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-[clamp(16px,3.5vw,44px)]">
        {/* ── Filtre çipleri + hızlı eylemler ── */}
        <Reveal delay={0.05}>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <button
              onClick={() => setEtiket(null)}
              className={cn(
                'cursor-pointer rounded-lg border px-3 py-1.5 font-display text-[12.5px] font-semibold transition-colors',
                !etiket
                  ? 'border-brass-500/50 bg-brass-500/10 text-brass-600 dark:text-brass-300'
                  : 'border-slate-300/50 text-slate-400 hover:text-slate-600 dark:border-ocean-700 dark:hover:text-slate-300',
              )}
            >
              Tümü
            </button>
            {etiketler.map((e) => (
              <button
                key={e}
                onClick={() => setEtiket(etiket === e ? null : e)}
                className={cn(
                  'cursor-pointer rounded-lg border px-3 py-1.5 font-display text-[12.5px] font-semibold transition-colors',
                  etiket === e
                    ? 'border-brass-500/50 bg-brass-500/10 text-brass-600 dark:text-brass-300'
                    : 'border-slate-300/50 text-slate-400 hover:text-slate-600 dark:border-ocean-700 dark:hover:text-slate-300',
                )}
              >
                {e}
              </button>
            ))}
            <span className="mx-1 h-5 w-px bg-slate-300/50 dark:bg-ocean-700" />
            <GlowButton variant="outline" size="sm" icon="bolt" onClick={() => cozDers()}>
              Rastgele 10
            </GlowButton>
            {etiketler.includes('TYT') && (
              <GlowButton
                variant="outline" size="sm" icon="seal"
                onClick={() => nav('/coz', { state: { source: 'osym', label: 'TYT', title: 'TYT Provası' } })}
              >
                TYT provası
              </GlowButton>
            )}
          </div>
        </Reveal>

        {matris.loading ? (
          <div className="mt-6 space-y-4">
            <Skeleton className="h-56" />
            <Skeleton className="h-40" />
          </div>
        ) : matris.error ? (
          <GlassCard blur={false} className="mt-6 px-6 py-6 text-center text-sm text-slate-500">
            Arşiv yüklenemedi: {matris.error}
            <div className="mt-3"><GlowButton variant="outline" size="sm" onClick={() => matris.reload()}>Tekrar dene</GlowButton></div>
          </GlassCard>
        ) : (
          <>
            {/* ── Ders×Yıl ısı matrisi ── */}
            {matrisIzgara.satirDersler.length > 0 && matrisIzgara.sutunYillar.length > 1 && (
              <Reveal delay={0.09}>
                <div className="glass-solid mt-6 overflow-x-auto rounded-2xl px-5 py-4">
                  <PanelBaslik icon="filter">Ders × Yıl Haritası</PanelBaslik>
                  <table className="w-full border-separate" style={{ borderSpacing: '3px' }}>
                    <thead>
                      <tr>
                        <th className="w-32 min-w-28" />
                        {matrisIzgara.sutunYillar.map((y) => (
                          <th key={y} className="pb-1 text-center font-mono text-[10px] font-medium text-slate-400 dark:text-slate-500">
                            {String(y).slice(2)}'
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {matrisIzgara.satirDersler.map((ders) => (
                        <tr key={ders}>
                          <td className="pr-2">
                            <SubjectName subject={ders} anahtar={dersAnahtar(ders)} className="!text-[11.5px]" />
                          </td>
                          {matrisIzgara.sutunYillar.map((yil) => {
                            const n = matrisIzgara.hucre.get(`${ders}|${yil}`) ?? 0
                            const x = n ? Math.round(18 + (n / matrisIzgara.maks) * 82) : 0
                            return (
                              <td key={yil} className="text-center">
                                {n > 0 ? (
                                  <Tip icerik={<span className="font-mono">{ders} · {yil} — {n} soru</span>}>
                                    <button
                                      onClick={() => cozHucre(ders, yil)}
                                      className="h-7 w-full min-w-8 cursor-pointer rounded-md border border-brass-500/10 font-mono text-[10px] font-semibold text-slate-600 transition-transform hover:scale-110 dark:text-slate-300"
                                      style={{ backgroundColor: `color-mix(in oklab, var(--color-brass-500) ${x}%, var(--heat-zero))` }}
                                    >
                                      {n}
                                    </button>
                                  </Tip>
                                ) : (
                                  <span className="block h-7 w-full min-w-8 rounded-md bg-shore-100/60 dark:bg-ocean-850/40" />
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-2 font-mono text-[10px] text-slate-400 dark:text-slate-500">
                    hücreye tıkla → o ders+yıl setini çöz · ton = soru yoğunluğu (brass)
                  </p>
                </div>
              </Reveal>
            )}

            {/* ── Derse göre ── */}
            <Reveal delay={0.13}>
              <div className="mt-8">
                <SectionLabel>Derse Göre</SectionLabel>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {dersler.map((d) => (
                    <button
                      key={d.subject}
                      onClick={() => cozDers(d.subject)}
                      className="glass-solid group flex cursor-pointer items-center gap-3.5 rounded-2xl px-5 py-4 text-left transition-all hover:-translate-y-0.5 hover:border-brass-500/40 hover:shadow-card"
                    >
                      <SubjectName subject={d.subject} anahtar={dersAnahtar(d.subject)} className="min-w-0 flex-1" />
                      <span className="font-mono text-[11.5px] text-slate-400 dark:text-slate-500">
                        <Sayi value={d.count} /> soru
                      </span>
                      <Icon name="chevronRight" size={15} color="currentColor" style={{ opacity: 0.4 }} />
                    </button>
                  ))}
                </div>
              </div>
            </Reveal>

            {/* ── Yıla göre ── */}
            <Reveal delay={0.17}>
              <div className="mt-8">
                <SectionLabel>Yıla Göre</SectionLabel>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  {yillar.map((y) => (
                    <button
                      key={y.year}
                      onClick={() => cozYil(y.year)}
                      className="glass-solid group relative cursor-pointer overflow-hidden rounded-2xl px-4 py-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-brass-500/40 hover:shadow-card"
                    >
                      <div className="font-display text-[21px] font-bold leading-none text-brass-600 dark:text-brass-300">
                        {y.year}
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {y.labels.map((l) => <Badge key={l} tone="brass">{l}</Badge>)}
                      </div>
                      <div className="mt-1.5 font-mono text-[10.5px] text-slate-400 dark:text-slate-500">{y.count} soru</div>
                      <span className="absolute bottom-0 right-0 size-6 bg-gradient-to-tl from-brass-500/25 to-transparent" />
                    </button>
                  ))}
                </div>
              </div>
            </Reveal>
          </>
        )}
      </div>
    </div>
  )
}

/** Prestij bandının akan dalga sahnesi — koyu lacivert üstüne ince yakamoz. */
function BantDalgalar() {
  return (
    <svg aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-16 w-full opacity-40" viewBox="0 0 900 60" preserveAspectRatio="none">
      {[{ y: 22, dur: 13 }, { y: 38, dur: 17 }].map((w, i) => (
        <path key={i} fill="none" strokeWidth={1.4} strokeLinecap="round" className="stroke-sky-300/50"
          d={`M-10 ${w.y} q 45 -10 90 0 t 90 0 t 90 0 t 90 0 t 90 0 t 90 0 t 90 0 t 90 0 t 90 0 t 90 0`}>
          <animate attributeName="d" dur={`${w.dur}s`} repeatCount="indefinite"
            values={`M-10 ${w.y} q 45 -10 90 0 t 90 0 t 90 0 t 90 0 t 90 0 t 90 0 t 90 0 t 90 0 t 90 0 t 90 0;
                     M-10 ${w.y} q 45 10 90 0 t 90 0 t 90 0 t 90 0 t 90 0 t 90 0 t 90 0 t 90 0 t 90 0 t 90 0;
                     M-10 ${w.y} q 45 -10 90 0 t 90 0 t 90 0 t 90 0 t 90 0 t 90 0 t 90 0 t 90 0 t 90 0 t 90 0`} />
        </path>
      ))}
    </svg>
  )
}
