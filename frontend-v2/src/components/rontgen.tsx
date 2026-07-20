import { useMemo, useState } from 'react'
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
} from 'recharts'
import { m } from 'framer-motion'
import { cn } from '../lib/cn'
import { useTheme } from '../lib/theme'
import { dersAnahtar } from '../lib/format'
import type { RontgenNode, TrendGunu, Tuzak, KaliteYanit } from '../lib/types'
import { Icon } from '../ui'
import { SubjectName, Badge, GlowButton } from './ui'
import { Halka, Meter, IsiHucre, Tip, PanelBaslik } from './cekirdek'

/* ═══════════════════════════════════════════════════════════════════════════
   RÖNTGEN BİLEŞENLERİ — Analiz ekranının sunum katmanı.
   Dataviz sözleşmesi: tek eksen (asla dual-axis) · magnitude=tek ton sky ·
   2 seri olan TEK grafik ÖSYM↔AI (brass+sky, legend'lı) · metin renk giymez.
   ═══════════════════════════════════════════════════════════════════════════ */

const GUN_MS = 86_400_000

export const gunFarki = (iso: string): number =>
  Math.floor((Date.now() - +new Date(iso)) / GUN_MS)

/** '2026-07-19' → '19 Tem'. Tarih-dışı etiketler (ör. ders adı) olduğu gibi döner. */
const AY_KISA = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']
export const gunEtiketi = (iso: string): string => {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso
  const d = new Date(iso.slice(0, 10) + 'T12:00:00')
  return `${d.getDate()} ${AY_KISA[d.getMonth()]}`
}

/* ── Cam grafik tooltip'i (recharts content) ──────────────────────────────── */

export function CamTooltip({ active, payload, label, satirlar }: {
  active?: boolean
  payload?: Array<{ value: number; dataKey: string; payload: Record<string, unknown> }>
  label?: string
  satirlar: (p: Record<string, unknown>) => Array<{ ad: string; deger: string }>
}) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="glass-solid rounded-lg px-3 py-2 text-xs shadow-card">
      <div className="font-display font-semibold text-slate-700 dark:text-slate-200">
        {typeof label === 'string' ? gunEtiketi(label) : label}
      </div>
      {satirlar(p).map((s) => (
        <div key={s.ad} className="mt-0.5 flex items-center justify-between gap-4">
          <span className="text-slate-400 dark:text-slate-500">{s.ad}</span>
          <span className="font-mono text-slate-600 dark:text-slate-300">{s.deger}</span>
        </div>
      ))}
    </div>
  )
}

/* ── GELİŞİM TRENDİ — tek-eksen kuralı: iki HİZALI panel, syncId ortak ────── */

export function TrendPaneli({ trend }: { trend: TrendGunu[] }) {
  const { t } = useTheme()
  const [aralik, setAralik] = useState<28 | 84>(28)

  const veri = useMemo(() => {
    // Boş günler 0 ile doldurulur — "hiç çözmedim" günü grafikte kaybolmasın
    const map = new Map(trend.map((g) => [g.date, g]))
    const bugun = new Date()
    const dizi: Array<TrendGunu & { acc: number | null }> = []
    for (let i = aralik - 1; i >= 0; i--) {
      const d = new Date(+bugun - i * GUN_MS)
      const key = d.toLocaleDateString('en-CA')
      const g = map.get(key) ?? { date: key, solved: 0, correct: 0, xp: 0 }
      dizi.push({ ...g, acc: g.solved ? Math.round((g.correct / g.solved) * 100) : null })
    }
    return dizi
  }, [trend, aralik])

  const toplamCozulen = veri.reduce((s, g) => s + g.solved, 0)
  const tikAralik = Math.max(1, Math.floor(veri.length / 6))

  return (
    <div className="glass-solid rounded-2xl px-5 py-4">
      <PanelBaslik
        icon="trend"
        sag={
          <div className="flex gap-1 rounded-lg bg-shore-100/80 p-0.5 dark:bg-ocean-950/60">
            {([28, 84] as const).map((a) => (
              <button
                key={a}
                onClick={() => setAralik(a)}
                className={cn(
                  'cursor-pointer rounded-md px-2 py-0.5 font-display text-[11px] font-semibold transition-colors',
                  aralik === a
                    ? 'bg-white text-slate-700 shadow-sm dark:bg-ocean-800 dark:text-slate-200'
                    : 'text-slate-400 hover:text-slate-600 dark:text-slate-500',
                )}
              >
                {a === 28 ? '4 hafta' : '12 hafta'}
              </button>
            ))}
          </div>
        }
      >
        Gelişim Trendi
      </PanelBaslik>

      {toplamCozulen === 0 ? (
        <p className="py-6 text-center text-xs text-slate-400 dark:text-slate-500">
          Bu aralıkta çözüm yok — ilk bloğu çözünce eğri burada belirir.
        </p>
      ) : (
        <>
          {/* Üst panel: doğruluk çizgisi (%) — tek seri, legend gerekmez */}
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={veri} syncId="rontgen-trend" margin={{ top: 6, right: 6, bottom: 0, left: -18 }}>
                <defs>
                  <linearGradient id="accAlan" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--data-hue)" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="var(--data-hue)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" hide />
                <YAxis
                  domain={[0, 100]} ticks={[0, 50, 100]} axisLine={false} tickLine={false}
                  tick={{ fill: t.inkMuted, fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
                />
                <Tooltip
                  cursor={{ stroke: t.hairlineStrong, strokeWidth: 1 }}
                  content={<CamTooltip satirlar={(p) => [
                    { ad: 'doğruluk', deger: p.acc == null ? '—' : `%${p.acc}` },
                    { ad: 'çözülen', deger: String(p.solved) },
                    { ad: 'XP', deger: `+${p.xp}` },
                  ]} />}
                />
                <Area
                  type="monotone" dataKey="acc" connectNulls
                  stroke="var(--data-hue)" strokeWidth={2}
                  fill="url(#accAlan)"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: t.card }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mb-1 mt-0.5 font-mono text-[10px] text-slate-400 dark:text-slate-500">doğruluk %</div>

          {/* Alt panel: günlük hacim sütunları — aynı x, syncId ile ortak crosshair */}
          <div className="h-20">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={veri} syncId="rontgen-trend" margin={{ top: 2, right: 6, bottom: 0, left: -18 }}>
                <XAxis
                  dataKey="date" axisLine={false} tickLine={false} interval={tikAralik}
                  tick={{ fill: t.inkMuted, fontSize: 9.5, fontFamily: 'JetBrains Mono, monospace' }}
                  tickFormatter={(v: string) => gunEtiketi(v)}
                />
                <YAxis hide />
                {/* syncId iki paneli birden tetikler — kutu YALNIZ üst panelde,
                    burada içerik boş kalır ki iki tooltip üst üste binmesin */}
                <Tooltip cursor={{ fill: 'rgb(14 165 233 / 0.06)' }} content={() => null} />
                <Bar dataKey="solved" fill="var(--data-hue)" radius={[4, 4, 0, 0]} maxBarSize={aralik === 28 ? 14 : 6} fillOpacity={0.75} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-slate-400 dark:text-slate-500">günlük çözülen</div>
        </>
      )}
    </div>
  )
}

/* ── ÇALIŞMA TAKVİMİ — 12 haftalık GitHub-tarzı ısı takvimi ───────────────── */

const HAFTA_GUN = ['Pzt', '', 'Çar', '', 'Cum', '', 'Paz']

export function TakvimIsi({ trend }: { trend: TrendGunu[] }) {
  const { haftalar, maks } = useMemo(() => {
    const map = new Map(trend.map((g) => [g.date, g]))
    const bugun = new Date()
    // Bugünden geriye 83 gün + haftabaşına (Pzt) hizala
    const baslangic = new Date(+bugun - 83 * GUN_MS)
    const pzt = (baslangic.getDay() + 6) % 7
    baslangic.setDate(baslangic.getDate() - pzt)
    const gunler: Array<{ date: string; solved: number; correct: number; gelecek: boolean }> = []
    for (let d = new Date(baslangic); +d <= +bugun + GUN_MS; d.setDate(d.getDate() + 1)) {
      const key = d.toLocaleDateString('en-CA')
      const g = map.get(key)
      gunler.push({ date: key, solved: g?.solved ?? 0, correct: g?.correct ?? 0, gelecek: +d > +bugun })
      if (gunler.length >= 91) break
    }
    const haftalar: typeof gunler[] = []
    for (let i = 0; i < gunler.length; i += 7) haftalar.push(gunler.slice(i, i + 7))
    const maks = Math.max(1, ...gunler.map((g) => g.solved))
    return { haftalar, maks }
  }, [trend])

  let sira = 0
  return (
    <div className="glass-solid rounded-2xl px-5 py-4">
      <PanelBaslik icon="today">Çalışma Takvimi</PanelBaslik>
      <div className="flex gap-2">
        <div className="grid shrink-0 grid-rows-7 gap-1 pt-0.5">
          {HAFTA_GUN.map((g, i) => (
            <span key={i} className="flex h-3 items-center font-mono text-[8.5px] leading-none text-slate-400 dark:text-slate-500">{g}</span>
          ))}
        </div>
        <div className="flex flex-1 justify-between gap-1 overflow-x-auto pb-1 [scrollbar-width:thin]">
          {haftalar.map((hafta, hi) => (
            <div key={hi} className="grid grid-rows-7 gap-1">
              {hafta.map((g) => {
                const i = sira++
                if (g.gelecek) return <span key={g.date} className="size-3" />
                return (
                  <IsiHucre
                    key={g.date}
                    boyut={12}
                    deger={g.solved / maks}
                    gecikmeMs={i * 6}
                    tip={
                      <div>
                        <div className="font-display font-semibold">{gunEtiketi(g.date)}</div>
                        <div className="mt-0.5 font-mono text-[11px]">
                          {g.solved ? `${g.solved} soru · %${Math.round((g.correct / g.solved) * 100)} doğru` : 'çözüm yok'}
                        </div>
                      </div>
                    }
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2.5 flex items-center justify-end gap-2">
        <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500">az</span>
        <span className="h-1.5 w-14 rounded-full" style={{ background: 'linear-gradient(90deg, var(--heat-zero), var(--data-hue))' }} />
        <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500">yoğun</span>
      </div>
    </div>
  )
}

/* ── USTALIK MATRİSİ — ders satırları + açılır kazanım detayı ─────────────── */

export interface DersGrubu {
  subject: string
  nodes: RontgenNode[]
  ortalama: number
}

export function UstalikMatrisi({ gruplar, havuzda, onCalis, calisEtiketi = 'Çalış' }: {
  gruplar: DersGrubu[]
  havuzda: Set<number>
  onCalis: (n: RontgenNode) => void
  /** Öğrencide "Çalış", öğretmende "Set gönder" — aynı bileşen, farklı fiil. */
  calisEtiketi?: string
}) {
  const [acik, setAcik] = useState<string | null>(null)
  const [siralama, setSiralama] = useState<'ustalik' | 'hacim'>('hacim')

  const sirali = useMemo(() => {
    const kopya = [...gruplar]
    if (siralama === 'ustalik') kopya.sort((a, b) => a.ortalama - b.ortalama)
    else kopya.sort((a, b) => b.nodes.length - a.nodes.length)
    return kopya
  }, [gruplar, siralama])

  let hucreSira = 0
  return (
    <div className="glass-solid rounded-2xl px-5 py-4">
      <PanelBaslik
        icon="scan"
        sag={
          <div className="flex gap-1 rounded-lg bg-shore-100/80 p-0.5 dark:bg-ocean-950/60">
            {([['hacim', 'hacme göre'], ['ustalik', 'zayıftan']] as const).map(([k, ad]) => (
              <button
                key={k}
                onClick={() => setSiralama(k)}
                className={cn(
                  'cursor-pointer rounded-md px-2 py-0.5 font-display text-[11px] font-semibold transition-colors',
                  siralama === k
                    ? 'bg-white text-slate-700 shadow-sm dark:bg-ocean-800 dark:text-slate-200'
                    : 'text-slate-400 hover:text-slate-600 dark:text-slate-500',
                )}
              >
                {ad}
              </button>
            ))}
          </div>
        }
      >
        Ustalık Matrisi
      </PanelBaslik>

      <div className="space-y-1">
        {sirali.map((g) => {
          const acikMi = acik === g.subject
          return (
            <div key={g.subject} className="rounded-xl transition-colors hover:bg-sky-500/5">
              {/* Ders satırı */}
              <button
                onClick={() => setAcik(acikMi ? null : g.subject)}
                className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-2 py-2.5 text-left"
              >
                <SubjectName subject={g.subject} anahtar={dersAnahtar(g.subject)} className="w-32 shrink-0" />
                <div className="flex min-w-0 flex-1 flex-wrap content-center gap-1">
                  {g.nodes.map((n) => {
                    const i = hucreSira++
                    const pas = gunFarki(n.updatedAt) >= 14
                    return (
                      <IsiHucre
                        key={n.kazanimId}
                        deger={n.mastery}
                        uyari={n.openMisconceptions > 0}
                        gecikmeMs={i * 14}
                        tip={
                          <div>
                            <div className="font-display font-semibold">{n.title}</div>
                            <div className="mt-1 font-mono text-[11px]">
                              ustalık %{Math.round(n.mastery * 100)} · {n.correct}/{n.attempts} doğru
                            </div>
                            <div className="mt-0.5 font-mono text-[10.5px] text-slate-400">
                              son çalışma {gunFarki(n.updatedAt)} gün önce{pas ? ' · paslanıyor' : ''}
                            </div>
                          </div>
                        }
                      />
                    )
                  })}
                </div>
                <span className="w-11 shrink-0 text-right font-mono text-[12px] font-semibold text-slate-500 dark:text-slate-400">
                  %{Math.round(g.ortalama * 100)}
                </span>
                <Icon
                  name="chevronDown" size={14} color="currentColor"
                  style={{ opacity: 0.4, transform: acikMi ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
                />
              </button>

              {/* Açılır kazanım detayı — en zayıf önce */}
              {acikMi && (
                <m.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  transition={{ duration: 0.24, ease: [0.21, 0.65, 0.32, 1] }}
                  className="overflow-hidden"
                >
                  <div className="space-y-1.5 px-2 pb-3 pt-1">
                    {[...g.nodes].sort((a, b) => a.mastery - b.mastery).map((n) => {
                      const pas = gunFarki(n.updatedAt) >= 14
                      const havuzVar = havuzda.has(n.kazanimId)
                      return (
                        <div key={n.kazanimId} className="flex items-center gap-3 rounded-lg px-2 py-1.5">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-[13px] font-medium text-slate-600 dark:text-slate-300" title={n.title}>
                                {n.title}
                              </span>
                              {n.openMisconceptions > 0 && <Badge tone="amber">çalışılıyor</Badge>}
                              {pas && <Badge tone="slate">paslanıyor</Badge>}
                            </div>
                            <div className="mt-1.5 flex items-center gap-2.5">
                              <Meter oran={n.mastery} className="max-w-44 flex-1" yukseklik={5} />
                              <span className="font-mono text-[11px] text-slate-400 dark:text-slate-500">
                                %{Math.round(n.mastery * 100)} · {n.correct}/{n.attempts}
                              </span>
                            </div>
                          </div>
                          {havuzVar ? (
                            <GlowButton size="sm" variant="outline" onClick={() => onCalis(n)}>{calisEtiketi}</GlowButton>
                          ) : (
                            <Tip icerik="Havuzda bu kazanım için hazır soru yok — Koç doldurunca açılır.">
                              <span className="cursor-default font-mono text-[10.5px] text-slate-300 dark:text-slate-600">havuz boş</span>
                            </Tip>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </m.div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── ÖNCELİK RADARI — en zayıf 5 + keşfedilmemiş konular ──────────────────── */

export function OncelikRadari({ zayiflar, kesfedilmemis, onCalis, onKesfet }: {
  zayiflar: RontgenNode[]
  kesfedilmemis: Array<{ kazanimId: number; title: string; subject: string }>
  onCalis: (n: RontgenNode) => void
  onKesfet: (k: { kazanimId: number; title: string; subject: string }) => void
}) {
  return (
    <div className="glass-solid rounded-2xl px-5 py-4">
      <PanelBaslik icon="target">Öncelik Radarı</PanelBaslik>
      {zayiflar.length === 0 && kesfedilmemis.length === 0 ? (
        <p className="py-4 text-center text-xs text-slate-400 dark:text-slate-500">
          Radar temiz — zayıf sinyal yok. Yeni konu keşfetmeye devam.
        </p>
      ) : (
        <div className="space-y-1">
          {zayiflar.map((n) => (
            <button
              key={n.kazanimId}
              onClick={() => onCalis(n)}
              className="group flex w-full cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-sky-500/5"
            >
              <Halka oran={n.mastery} boyut={40} kalinlik={4}
                renk={n.mastery < 0.35 ? 'var(--color-rose-500)' : 'var(--color-amber-500)'}>
                <span className="font-mono text-[9.5px] font-semibold text-slate-500 dark:text-slate-400">
                  {Math.round(n.mastery * 100)}
                </span>
              </Halka>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-slate-700 dark:text-slate-200" title={n.title}>
                  {n.title}
                </div>
                <SubjectName subject={n.subject} anahtar={dersAnahtar(n.subject)} className="mt-0.5 !text-[11px]" />
              </div>
              <Icon name="arrowRight" size={15} color="currentColor"
                style={{ opacity: 0.35 }} />
            </button>
          ))}
          {kesfedilmemis.map((k) => (
            <button
              key={k.kazanimId}
              onClick={() => onKesfet(k)}
              className="group flex w-full cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-sky-500/5"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-full border border-dashed border-sky-500/40 text-sky-600 dark:border-sky-400/30 dark:text-sky-300">
                <Icon name="sparkle" size={15} color="currentColor" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-slate-700 dark:text-slate-200" title={k.title}>
                  {k.title}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <SubjectName subject={k.subject} anahtar={dersAnahtar(k.subject)} className="!text-[11px]" />
                  <Badge tone="sky">keşfedilmedi</Badge>
                </div>
              </div>
              <Icon name="arrowRight" size={15} color="currentColor" style={{ opacity: 0.35 }} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── TUZAK ANALİZİ — en çok düşülen çeldiriciler ──────────────────────────── */

export function TuzakPaneli({ traps }: { traps: Tuzak[] }) {
  if (!traps.length) return null
  return (
    <div className="glass-solid rounded-2xl px-5 py-4">
      <PanelBaslik icon="bolt">Tuzak Analizi</PanelBaslik>
      <p className="mb-3 text-[11.5px] leading-relaxed text-slate-400 dark:text-slate-500">
        Aynı çeldiriciye tekrar tekrar düşmek desendir — bu şıklar seni avlıyor.
      </p>
      <div className="space-y-2">
        {traps.map((t) => (
          <div key={`${t.kazanimId}-${t.selectedOption}`} className="flex items-center gap-3">
            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-rose-500/10 font-display text-[13px] font-bold text-rose-600 dark:text-rose-300">
              {t.selectedOption}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12.5px] font-medium text-slate-600 dark:text-slate-300" title={t.title}>
                {t.title}
              </div>
              <SubjectName subject={t.subject} anahtar={dersAnahtar(t.subject)} className="!text-[10.5px]" />
            </div>
            <span className="shrink-0 font-mono text-[11px] text-slate-400 dark:text-slate-500">
              ×{t.missCount}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── HIZ ANALİZİ — "doğru ama yavaş" + zorluk kırılımı ────────────────────── */

export function HizPaneli({ yavaslar, zorluk }: {
  yavaslar: RontgenNode[]
  zorluk: { kolay: number; orta: number; zor: number }
}) {
  const zToplam = zorluk.kolay + zorluk.orta + zorluk.zor
  if (!yavaslar.length && !zToplam) return null
  return (
    <div className="glass-solid rounded-2xl px-5 py-4">
      <PanelBaslik icon="pulse">Hız Analizi</PanelBaslik>
      {yavaslar.length > 0 && (
        <>
          <p className="mb-2.5 text-[11.5px] leading-relaxed text-slate-400 dark:text-slate-500">
            Doğru ama yavaş çözüyorsun — motor bu kazanımlarda yarım kredi işliyor.
          </p>
          <div className="space-y-1.5">
            {yavaslar.map((n) => (
              <div key={n.kazanimId} className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-medium text-slate-600 dark:text-slate-300" title={n.title}>
                    {n.title}
                  </div>
                  <SubjectName subject={n.subject} anahtar={dersAnahtar(n.subject)} className="!text-[10.5px]" />
                </div>
                <span className="shrink-0 font-mono text-[11.5px] text-slate-500 dark:text-slate-400">
                  ort {Math.round((n.avgLatencyMs ?? 0) / 1000)}s
                </span>
              </div>
            ))}
          </div>
        </>
      )}
      {zToplam > 0 && (
        <div className="mt-3.5 border-t border-slate-500/10 pt-3 dark:border-sky-500/10">
          <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
            son 30 gün · zorluk kırılımı
          </div>
          <div className="flex gap-1.5">
            {([['kolay', zorluk.kolay], ['orta', zorluk.orta], ['zor', zorluk.zor]] as const).map(([ad, n]) => (
              <span key={ad} className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500/8 px-2.5 py-1 dark:bg-sky-400/8">
                <span className="text-[11px] text-slate-500 dark:text-slate-400">{ad}</span>
                <span className="font-mono text-[11.5px] font-semibold text-slate-700 dark:text-slate-200">{n}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── KAPSAMA — ders başına taranan/toplam ─────────────────────────────────── */

export function KapsamaKarti({ satirlar }: {
  satirlar: Array<{ subject: string; taranan: number; toplam: number }>
}) {
  if (!satirlar.length) return null
  return (
    <div className="glass-solid rounded-2xl px-5 py-4">
      <PanelBaslik icon="waves">Müfredat Kapsaması</PanelBaslik>
      <div className="space-y-2.5">
        {satirlar.map((s) => (
          <div key={s.subject}>
            <div className="mb-1 flex items-center justify-between">
              <SubjectName subject={s.subject} anahtar={dersAnahtar(s.subject)} className="!text-[12px]" />
              <span className="font-mono text-[10.5px] text-slate-400 dark:text-slate-500">
                {s.taranan}/{s.toplam}
              </span>
            </div>
            <Meter oran={s.toplam ? s.taranan / s.toplam : 0} yukseklik={5} />
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── HAVUZ GÜVENCESİ — yapisal-eval'in didaktik vitrini ───────────────────── */

export function GuvencePaneli({ kalite }: { kalite: KaliteYanit }) {
  const { theme } = useTheme()
  // Validator'dan geçmiş çiftler: ÖSYM=brass, AI=sky (açık #B8863B/#0284C7 · koyu #A6792F/#0284C7)
  const brass = theme === 'dark' ? '#A6792F' : '#B8863B'
  const sky = '#0284C7'
  const snap = kalite.ozgunluk.snapshot
  const yog = kalite.yapisal.sayiYogunlugu.filter((r) => r.osym != null && r.ai != null)

  return (
    <div className="glass-solid rounded-2xl px-5 py-4">
      <PanelBaslik icon="shield">Havuz Güvencesi</PanelBaslik>
      <p className="mb-3 text-[11.5px] leading-relaxed text-slate-400 dark:text-slate-500">
        Çözdüğün her AI sorusu, gerçek ÖSYM korpusuyla kalibre edilmiş yapısal
        kapılardan geçer. Sayılar gerçek ölçümdür.
      </p>

      {/* Kapı satırları */}
      <div className="space-y-2.5">
        <Kapi
          ad="Özgünlük Kapısı"
          aciklama="Jaccard shingle benzerliği — her aday, havuzdaki en yakın komşusuna göre ders-bazlı eşikle denetlenir"
          deger={snap ? `${snap.nnKopya} kopya` : 'ölçüm bekleniyor'}
          iyi={!snap || snap.nnKopya === 0}
        />
        <Kapi
          ad="Şık Uzunluk Sızıntısı"
          aciklama="En uzun şık doğru cevabı ele veriyor mu — ÖSYM taban oranıyla yan yana"
          deger={`AI %${kalite.yapisal.sizinti.ai ?? '—'} · ÖSYM %${kalite.yapisal.sizinti.osym ?? '—'}`}
          iyi={(kalite.yapisal.sizinti.ai ?? 0) <= (kalite.yapisal.sizinti.osym ?? 100)}
        />
        <Kapi
          ad="Çeldirici Kuşatması"
          aciklama="Sayısal şıklarda doğru cevap uçta kalmasın — tek-yanda ihlali"
          deger={`AI %${kalite.yapisal.kusatma.ai ?? '—'} · ÖSYM %${kalite.yapisal.kusatma.osym ?? '—'}`}
          iyi={(kalite.yapisal.kusatma.ai ?? 0) <= (kalite.yapisal.kusatma.osym ?? 100)}
        />
        <Kapi
          ad="Görsel Göndermesi"
          aciklama="Var olmayan bir şekle işaret eden soru anında elenir"
          deger={`${kalite.yapisal.gorselGonderme} ihlal`}
          iyi={kalite.yapisal.gorselGonderme === 0}
        />
      </div>

      {/* Sayı yoğunluğu dengesi — ekrandaki TEK 2-serili grafik (legend zorunlu) */}
      {yog.length > 0 && (
        <div className="mt-4 border-t border-slate-500/10 pt-3.5 dark:border-sky-500/10">
          <div className="mb-1 font-mono text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
            sayı yoğunluğu dengesi · kök başına ort. sayı (sayısal aile)
          </div>
          <div style={{ height: yog.length * 44 + 28 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={yog} layout="vertical" margin={{ top: 0, right: 26, bottom: 0, left: 0 }} barGap={2}>
                <XAxis type="number" hide />
                <YAxis
                  type="category" dataKey="subject" axisLine={false} tickLine={false} width={72}
                  tick={{ fill: 'currentColor', fontSize: 11, fontFamily: 'Inter, sans-serif', opacity: 0.65 }}
                />
                <Tooltip
                  cursor={{ fill: 'rgb(14 165 233 / 0.05)' }}
                  content={<CamTooltip satirlar={(p) => [
                    { ad: 'ÖSYM', deger: String(p.osym) },
                    { ad: 'AI', deger: String(p.ai) },
                  ]} />}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11, fontFamily: 'Inter, sans-serif' }}
                  iconType="circle" iconSize={7}
                />
                <Bar name="ÖSYM" dataKey="osym" fill={brass} radius={[0, 4, 4, 0]} maxBarSize={9} />
                <Bar name="AI" dataKey="ai" fill={sky} radius={[0, 4, 4, 0]} maxBarSize={9} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Alt künye */}
      <div className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-500/10 pt-3 font-mono text-[10.5px] text-slate-400 dark:border-sky-500/10 dark:text-slate-500">
        <span>{kalite.havuz.toplam} doğrulanmış soru</span>
        <span>·</span>
        <span>{kalite.havuz.osymReferans} ÖSYM referansı</span>
        {kalite.havuz.ortKalite != null && (
          <>
            <span>·</span>
            <span>ort. kalite {kalite.havuz.ortKalite}/5</span>
          </>
        )}
        {snap && (
          <>
            <span>·</span>
            <span>son eval {gunEtiketi(snap.tarih.slice(0, 10))}</span>
          </>
        )}
      </div>
    </div>
  )
}

function Kapi({ ad, aciklama, deger, iyi }: {
  ad: string; aciklama: string; deger: string; iyi: boolean
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className={cn(
        'mt-0.5 grid size-5 shrink-0 place-items-center rounded-md',
        iyi ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-300'
            : 'bg-amber-500/12 text-amber-600 dark:text-amber-300',
      )}>
        <Icon name={iyi ? 'check' : 'clock'} size={12} color="currentColor" strokeWidth={2.2} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2">
          <span className="text-[12.5px] font-semibold text-slate-600 dark:text-slate-300">{ad}</span>
          <span className="font-mono text-[10.5px] text-slate-400 dark:text-slate-500">{deger}</span>
        </div>
        <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">{aciklama}</p>
      </div>
    </div>
  )
}
