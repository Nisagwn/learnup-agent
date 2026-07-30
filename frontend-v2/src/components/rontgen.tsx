import { useMemo, useState, type ReactNode } from 'react'
import {
  ResponsiveContainer, ComposedChart, Area, Bar, XAxis, YAxis, Tooltip, ReferenceLine,
} from 'recharts'
import { m } from 'framer-motion'
import { cn } from '../lib/cn'
// gunEtiketi lib/format'tan gelir (GOREV-034 taşıması): buradan re-export edilmez —
// çizelge-dışı bir tüketici onu bu modülden alırsa recharts'ı yine eager grafiğe sokar.
import { dersAnahtar, gunEtiketi } from '../lib/format'
import type { RontgenNode, TrendGunu, Tuzak } from '../lib/types'
import { Icon, type IconName } from '../ui'
import { SubjectName, SUBJECT_UI, Badge } from './ui'
import { Halka, Meter, IsiHucre, Tip } from './cekirdek'

/* ═══════════════════════════════════════════════════════════════════════════
   ANALİZ PANELLERİ — Analizler ekranının sunum katmanı (FİDAN v1.2).
   Referans: docs/design/onizleme/analizler.html (onay 2026-07-22).
   İki yüzeyde yaşar: öğrenci Analizler (Harita.tsx) + Öğretmen Röntgeni
   (OgrenciRontgeni.tsx) — imzalar geriye-uyumlu tutulur, fark yalnız fiildir
   ("Çöz" ↔ "Set gönder"). Dataviz sözleşmesi: magnitude = TEK renk (adaçayı
   4 ton) · dual-axis yok (hacim çubukları eksensiz de-emphasis katmandır) ·
   metin asla seri rengi giymez · null ≠ 0 (veri yoksa panel kendini gizler).
   ═══════════════════════════════════════════════════════════════════════════ */

const GUN_MS = 86_400_000

export const gunFarki = (iso: string): number =>
  Math.floor((Date.now() - +new Date(iso)) / GUN_MS)

/** Tarih-YALNIZ ('2026-07-19') dizgiler için gün farkı — UTC kayması yemesin. */
const gunFarkiGun = (isoGun: string): number =>
  Math.floor((Date.now() - +new Date(isoGun + 'T12:00:00')) / GUN_MS)


/* ── FİDAN yerel yapı taşları ─────────────────────────────────────────────────
   007 kararı gereği ortak varyantlar components/ui.tsx'e İNMEDİ — panel dili
   burada inline kurulur. Kart: standart buzlu cam; yoğun hücre yüzeyleri
   (matris, takvim) mat ikiz kullanır (TASARIM-DILI §9.2 perf sınırı). */

const KART = 'glass rounded-[20px] p-[22px] shadow-card transition-[transform,box-shadow] duration-200 motion-safe:hover:-translate-y-[3px] hover:[box-shadow:var(--golge-h)]'
const KART_MAT = 'glass-solid rounded-[20px] p-[22px] shadow-card'

function BaslikSatir({ ikon, renk, sag, children }: {
  ikon: IconName; renk: string; sag?: ReactNode; children: ReactNode
}) {
  return (
    <div className="mb-2.5 flex flex-wrap items-center gap-2.5">
      <span
        className="grid size-[30px] shrink-0 place-items-center rounded-[10px]"
        style={{ background: `color-mix(in srgb, ${renk} 15%, transparent)` }}
      >
        <Icon name={ikon} size={16} color={renk} strokeWidth={2} />
      </span>
      <h2 className="text-[17.5px] font-bold" style={{ color: 'var(--metin1)', fontFamily: 'Outfit, sans-serif' }}>
        {children}
      </h2>
      {sag != null && <span className="ml-auto flex items-center">{sag}</span>}
    </div>
  )
}

function Segment<T extends string | number>({ secenekler, deger, onDegis }: {
  secenekler: ReadonlyArray<readonly [T, string]>
  deger: T
  onDegis: (v: T) => void
}) {
  return (
    <div className="flex gap-1 rounded-[10px] p-0.5" style={{ background: 'var(--ic)' }}>
      {secenekler.map(([v, etiket]) => (
        <button
          key={String(v)}
          type="button"
          aria-pressed={deger === v}
          onClick={() => onDegis(v)}
          className="cursor-pointer rounded-lg px-2.5 py-1 text-[11.5px] font-semibold transition-colors"
          style={deger === v
            ? { background: 'var(--vurgu)', color: '#fff', fontFamily: 'Outfit, sans-serif' }
            : { color: 'var(--metin3)', fontFamily: 'Outfit, sans-serif' }}
        >
          {etiket}
        </button>
      ))}
    </div>
  )
}

function FBtn({ birincil, kucuk, onClick, className, children }: {
  birincil?: boolean; kucuk?: boolean; onClick?: () => void; className?: string; children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl font-semibold transition-all',
        kucuk ? 'px-3 py-1.5 text-[12.5px]' : 'px-4 py-2.5 text-[13.5px]',
        birincil
          ? 'text-white [background:var(--cta)] hover:[box-shadow:var(--parilti)] motion-safe:hover:-translate-y-px'
          : '[color:var(--vurgu)] [background:color-mix(in_srgb,var(--adacayi)_24%,transparent)] hover:[background:color-mix(in_srgb,var(--adacayi)_38%,transparent)]',
        className,
      )}
    >
      {children}
    </button>
  )
}

/** İmzalı fark rozeti — düşüş DÜRÜSTÇE sıcak toprak/uyarı tonuyla, kelime + yön okuyla. */
function DeltaRozet({ delta, sozel, birim = '' }: { delta: number; sozel?: string; birim?: string }) {
  const iyi = delta >= 0
  const renk = iyi ? 'var(--dogru)' : 'var(--uyari)'
  return (
    <span
      className="inline-flex items-center gap-1 rounded-xl px-2 py-0.5 text-[12px] font-semibold"
      style={{ background: `color-mix(in srgb, ${renk} 14%, transparent)`, color: renk }}
    >
      {iyi ? '▲' : '▼'} {sozel ? `${sozel} ` : ''}{iyi ? '+' : '−'}{Math.abs(delta)}{birim}
    </span>
  )
}

const dersHex = (subject: string): string => SUBJECT_UI[dersAnahtar(subject)]?.hex ?? '#84A98C'

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
      <div className="font-semibold" style={{ color: 'var(--metin1)', fontFamily: 'Outfit, sans-serif' }}>
        {typeof label === 'string' ? gunEtiketi(label) : label}
      </div>
      {satirlar(p).map((s) => (
        <div key={s.ad} className="mt-0.5 flex items-center justify-between gap-4">
          <span style={{ color: 'var(--metin3)' }}>{s.ad}</span>
          <span className="font-mono" style={{ color: 'var(--metin2)' }}>{s.deger}</span>
        </div>
      ))}
    </div>
  )
}

/* ── DOĞRULUK TRENDİ — TEK grafik: doğruluk çizgisi + eksensiz hacim çubukları ─
   Kesikli hedef çizgisi GERÇEK bir sayıya bağlanır: öğrencinin yerel günlük
   soru hedefi (hacim ölçeğinde). Uydurma "doğruluk hedefi" çizilmez. */

export function TrendPaneli({ trend, aralikGun, hedefGunluk, sinifOrt }: {
  trend: TrendGunu[]
  /** Verilirse pencere DIŞARIDAN yönetilir (URL dönem filtresi) ve panel içi anahtar gizlenir. */
  aralikGun?: number
  /** Öğrencinin günlük soru hedefi (yerel tercih) — kesikli hedef çizgisi hacim ölçeğinde çizilir. */
  hedefGunluk?: number
  /** Sınıf doğruluk ortalaması (0–100) — Öğretmen Röntgeni geçer, kesikli referans
      çizgisi çizilir. Verilmezse yok: öğrenci Analizler yüzeyi ETKİLENMEZ (GOREV-036). */
  sinifOrt?: number | null
}) {
  const [icAralik, setIcAralik] = useState<28 | 84>(28)
  const aralik = aralikGun ?? icAralik

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

  // Pencerenin ilk yarısı ↔ ikinci yarısı doğruluk farkı (puan).
  // İki yarımdan biri boşsa rozet HİÇ çizilmez (null = ölçülmedi).
  const delta = useMemo(() => {
    const yari = Math.floor(veri.length / 2)
    const acc = (d: typeof veri): number | null => {
      const s = d.reduce((x, g) => x + g.solved, 0)
      const c = d.reduce((x, g) => x + g.correct, 0)
      return s ? (c / s) * 100 : null
    }
    const a = acc(veri.slice(0, yari))
    const b = acc(veri.slice(yari))
    return a != null && b != null ? Math.round(b - a) : null
  }, [veri])

  const hacimMax = Math.max(1, hedefGunluk ?? 0, ...veri.map((g) => g.solved))
  const tikAralik = Math.max(1, Math.floor(veri.length / 6))

  return (
    <section className={KART} aria-label="Doğruluk trendi">
      <BaslikSatir
        ikon="trend"
        renk="var(--bilgi)"
        sag={aralikGun == null
          ? <Segment secenekler={[[28, '4 hafta'], [84, '12 hafta']] as const} deger={icAralik} onDegis={setIcAralik} />
          : delta != null && toplamCozulen > 0
            ? <DeltaRozet delta={delta} sozel={`${aralik} günde`} birim=" puan" />
            : undefined}
      >
        Doğruluk Trendi
      </BaslikSatir>

      {toplamCozulen === 0 ? (
        <p className="py-6 text-center text-[13px]" style={{ color: 'var(--metin3)' }}>
          Bu aralıkta çözüm yok — ilk soruyu çözünce eğri burada belirir.
        </p>
      ) : (
        <>
          <div className="mt-1 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={veri} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                <defs>
                  <linearGradient id="trendAlan" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--adacayi)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--adacayi)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date" axisLine={false} tickLine={false} interval={tikAralik}
                  tick={{ fill: 'var(--metin3)', fontSize: 9.5, fontFamily: 'JetBrains Mono, monospace' }}
                  tickFormatter={(v: string) => gunEtiketi(v)}
                />
                <YAxis
                  yAxisId="acc" domain={[0, 100]} ticks={[0, 50, 100]} axisLine={false} tickLine={false}
                  tick={{ fill: 'var(--metin3)', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
                  tickFormatter={(v: number) => `%${v}`}
                />
                {/* Gizli hacim ölçeği — dual-axis DEĞİL: çubuklar eksensiz arka katman.
                    2.4 çarpanı çubukları alt üçte-bire bastırır (önizleme dili). */}
                <YAxis yAxisId="hacim" hide domain={[0, hacimMax * 2.4]} />
                <Tooltip
                  cursor={{ stroke: 'var(--adacayi)', strokeWidth: 1 }}
                  content={<CamTooltip satirlar={(p) => [
                    { ad: 'doğruluk', deger: p.acc == null ? '—' : `%${p.acc}` },
                    { ad: 'çözülen', deger: String(p.solved) },
                    { ad: 'XP', deger: `+${p.xp}` },
                  ]} />}
                />
                {hedefGunluk != null && hedefGunluk > 0 && (
                  <ReferenceLine
                    yAxisId="hacim" y={hedefGunluk}
                    stroke="var(--toprak)" strokeWidth={1.5} strokeDasharray="6 5"
                    label={{ value: `hedef ${hedefGunluk} soru/gün`, position: 'insideTopRight', fill: 'var(--toprak)', fontSize: 10, fontWeight: 600 }}
                  />
                )}
                {sinifOrt != null && sinifOrt > 0 && (
                  <ReferenceLine
                    yAxisId="acc" y={Math.min(100, sinifOrt)}
                    stroke="var(--toprak)" strokeWidth={1.5} strokeDasharray="6 5"
                    label={{ value: `sınıf ort. %${Math.round(sinifOrt)}`, position: 'insideTopRight', fill: 'var(--toprak)', fontSize: 10, fontWeight: 600 }}
                  />
                )}
                <Bar
                  yAxisId="hacim" dataKey="solved"
                  fill="var(--adacayi)" fillOpacity={0.28}
                  radius={[4, 4, 0, 0]} maxBarSize={aralik <= 30 ? 14 : 6}
                />
                <Area
                  yAxisId="acc" type="monotone" dataKey="acc" connectNulls
                  stroke="var(--yaprak)" strokeWidth={2.5} fill="url(#trendAlan)"
                  dot={aralik <= 30 ? { r: 2.5, fill: 'var(--yaprak)', strokeWidth: 0 } : false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--mat)' }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-1.5 flex flex-wrap justify-between gap-x-3 gap-y-1 font-mono text-[10px]" style={{ color: 'var(--metin3)' }}>
            <span>çizgi = doğruluk %</span>
            <span>
              çubuklar = günlük çözüm hacmi
              {hedefGunluk ? ' · kesikli çizgi = günlük hedef' : ''}
              {sinifOrt != null && sinifOrt > 0 ? ' · kesikli çizgi = sınıf ortalaması' : ''}
            </span>
          </div>
        </>
      )}
    </section>
  )
}

/* ── BU HAFTA vs GEÇEN HAFTA — user_logs türevi trend'den dürüst karşılaştırma ─
   Çalışma süresi trend verisinde YOK (uydurulmaz) — üçüncü karşılaştırma
   gerçek bir sayı olan XP'dir. İki hafta da boşsa panel kendini gizler. */

export function HaftaKarsilastirma({ trend }: { trend: TrendGunu[] }) {
  const { bu, gecen } = useMemo(() => {
    const bu = { solved: 0, correct: 0, xp: 0 }
    const gecen = { solved: 0, correct: 0, xp: 0 }
    for (const g of trend) {
      const f = gunFarkiGun(g.date)
      const kova = f >= 0 && f < 7 ? bu : f >= 7 && f < 14 ? gecen : null
      if (kova) { kova.solved += g.solved; kova.correct += g.correct; kova.xp += g.xp }
    }
    return { bu, gecen }
  }, [trend])

  if (bu.solved === 0 && gecen.solved === 0) return null

  const acc = (x: { solved: number; correct: number }): number | null =>
    x.solved ? Math.round((x.correct / x.solved) * 100) : null
  const buAcc = acc(bu)
  const gecenAcc = acc(gecen)

  const kutular: Array<{ deger: string; etiket: string; delta: number | null; birim: string }> = [
    { deger: String(bu.solved), etiket: 'soru çözüldü', delta: gecen.solved ? bu.solved - gecen.solved : null, birim: '' },
    { deger: buAcc == null ? '—' : `%${buAcc}`, etiket: 'doğruluk', delta: buAcc != null && gecenAcc != null ? buAcc - gecenAcc : null, birim: ' puan' },
    { deger: `+${bu.xp}`, etiket: 'XP toplandı', delta: gecen.solved ? bu.xp - gecen.xp : null, birim: '' },
  ]

  return (
    <section className={KART} aria-label="Bu hafta ile geçen haftanın karşılaştırması">
      <BaslikSatir ikon="chart" renk="var(--adacayi)">Bu Hafta vs Geçen Hafta</BaslikSatir>
      <div className="grid gap-3 sm:grid-cols-3">
        {kutular.map((k) => (
          <div key={k.etiket} className="rounded-[14px] px-4 py-3 text-center" style={{ background: 'var(--ic)' }}>
            <b className="block text-[19px] font-bold" style={{ color: 'var(--metin1)', fontFamily: 'Outfit, sans-serif' }}>
              {k.deger}
            </b>
            <span className="text-[11.5px]" style={{ color: 'var(--metin3)' }}>{k.etiket}</span>
            <div className="mt-1">
              {k.delta == null
                ? <span className="font-mono text-[10.5px]" style={{ color: 'var(--metin3)' }}>geçen hafta veri yok</span>
                : <DeltaRozet delta={k.delta} birim={k.birim} />}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ── ÇALIŞMA TAKVİMİ — son 6 hafta, gün etiketli, bugün halkalı ısı ────────── */

const HAFTA_GUN = ['Pzt', '', 'Çar', '', 'Cum', '', 'Paz']

export function TakvimIsi({ trend }: { trend: TrendGunu[] }) {
  const { haftalar, maks } = useMemo(() => {
    const map = new Map(trend.map((g) => [g.date, g]))
    const bugun = new Date()
    const bugunKey = bugun.toLocaleDateString('en-CA')
    // Bu haftanın pazartesisinden 5 hafta geriye → tam 6 sütun (42 gün).
    const basla = new Date(+bugun)
    basla.setDate(basla.getDate() - ((basla.getDay() + 6) % 7) - 35)
    const gunler: Array<{ date: string; solved: number; correct: number; bugunMu: boolean; gelecek: boolean }> = []
    for (let i = 0; i < 42; i++) {
      const d = new Date(+basla + i * GUN_MS)
      const key = d.toLocaleDateString('en-CA')
      const g = map.get(key)
      gunler.push({
        date: key,
        solved: g?.solved ?? 0,
        correct: g?.correct ?? 0,
        bugunMu: key === bugunKey,
        gelecek: key > bugunKey,
      })
    }
    const haftalar: Array<typeof gunler> = []
    for (let i = 0; i < gunler.length; i += 7) haftalar.push(gunler.slice(i, i + 7))
    const maks = Math.max(1, ...gunler.map((g) => g.solved))
    return { haftalar, maks }
  }, [trend])

  if (!trend.length) return null // günlük kayıt hiç yok → panel gizlenir

  let sira = 0
  return (
    <section className={KART_MAT} aria-label="Çalışma takvimi">
      <BaslikSatir
        ikon="today"
        renk="var(--toprak)"
        sag={<span className="text-[13px]" style={{ color: 'var(--metin2)' }}>son 6 hafta</span>}
      >
        Çalışma Takvimi
      </BaslikSatir>
      <div className="flex gap-2.5">
        <div className="grid shrink-0 grid-rows-7 gap-1.5 pt-0.5">
          {HAFTA_GUN.map((g, i) => (
            <span key={i} className="flex h-4 items-center font-mono text-[9px] leading-none" style={{ color: 'var(--metin3)' }}>
              {g}
            </span>
          ))}
        </div>
        <div className="flex flex-1 justify-between gap-1.5">
          {haftalar.map((hafta, hi) => (
            <div key={hi} className="grid grid-rows-7 gap-1.5">
              {hafta.map((g) => {
                const i = sira++
                if (g.gelecek) return <span key={g.date} className="size-4" />
                return (
                  <IsiHucre
                    key={g.date}
                    boyut={16}
                    deger={g.solved / maks}
                    gecikmeMs={i * 8}
                    className={g.bugunMu ? 'outline outline-2 outline-offset-1 outline-[var(--yaprak)]' : undefined}
                    tip={
                      <div>
                        <div className="font-semibold" style={{ fontFamily: 'Outfit, sans-serif' }}>
                          {gunEtiketi(g.date)}{g.bugunMu ? ' · bugün' : ''}
                        </div>
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
      <div className="mt-3 flex items-center justify-end gap-1.5 font-mono text-[10px]" style={{ color: 'var(--metin3)' }}>
        <span>az</span>
        {['var(--v1)', 'var(--v2)', 'var(--v3)', 'var(--v4)'].map((t) => (
          <span key={t} className="h-2.5 w-5 rounded-[4px]" style={{ background: t }} />
        ))}
        <span>çok</span>
      </div>
    </section>
  )
}

/* ── USTALIK MATRİSİ — ders satırları + kesikli "ölçüm yok" + kazanım drill-down ─ */

export interface DersGrubu {
  subject: string
  nodes: RontgenNode[]
  ortalama: number
  /** O dersin müfredattaki TOPLAM kazanımı — verilirse ölçülmemiş konular kesikli
      hücre olarak görünür (null ≠ 0). Öğretmen yüzeyi vermeden çağırır (geriye-uyumlu). */
  toplam?: number
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
    <section className={KART_MAT} aria-label="Ustalık matrisi">
      <BaslikSatir
        ikon="scan"
        renk="var(--yaprak)"
        sag={<Segment secenekler={[['hacim', 'hacme göre'], ['ustalik', 'zayıftan']] as const} deger={siralama} onDegis={setSiralama} />}
      >
        Ustalık Matrisi
      </BaslikSatir>
      <p className="mb-2 text-[13px]" style={{ color: 'var(--metin2)' }}>
        Hücreye gel: konu ve yüzde · ders satırına tıkla: kazanım detayına in.
      </p>

      <div className="space-y-1">
        {sirali.map((g) => {
          const acikMi = acik === g.subject
          const yok = Math.max(0, (g.toplam ?? 0) - g.nodes.length)
          const yokGoster = yok > 0 ? Math.min(yok, Math.max(1, 12 - g.nodes.length)) : 0
          return (
            <div key={g.subject} className="rounded-xl transition-colors hover:[background:color-mix(in_srgb,var(--adacayi)_10%,transparent)]">
              {/* Ders satırı */}
              <button
                onClick={() => setAcik(acikMi ? null : g.subject)}
                className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-2 py-2.5 text-left"
              >
                <SubjectName subject={g.subject} anahtar={dersAnahtar(g.subject)} className="w-28 shrink-0" />
                <div className="flex min-w-0 flex-1 flex-wrap content-center gap-1.5">
                  {g.nodes.map((n) => {
                    const i = hucreSira++
                    const tekrarVakti = gunFarki(n.updatedAt) >= 14
                    return (
                      <IsiHucre
                        key={n.kazanimId}
                        boyut={22}
                        deger={n.mastery}
                        uyari={n.openMisconceptions > 0}
                        gecikmeMs={i * 14}
                        tip={
                          <div>
                            <div className="font-semibold" style={{ fontFamily: 'Outfit, sans-serif' }}>{n.title}</div>
                            <div className="mt-1 font-mono text-[11px]">
                              ustalık %{Math.round(n.mastery * 100)} · {n.correct}/{n.attempts} doğru
                            </div>
                            <div className="mt-0.5 font-mono text-[10.5px]" style={{ color: 'var(--metin3)' }}>
                              son çalışma {gunFarki(n.updatedAt)} gün önce
                              {tekrarVakti ? ' · tekrar vakti' : ''}
                              {n.openMisconceptions > 0 ? ' · üstünde çalıştığın nokta var' : ''}
                            </div>
                          </div>
                        }
                      />
                    )
                  })}
                  {Array.from({ length: yokGoster }, (_, i) => (
                    <IsiHucre
                      key={`yok-${i}`}
                      boyut={22}
                      deger={0}
                      olcumYok
                      tip={<span>ölçüm yok — bu dersten {yok} konuya henüz dokunulmadı</span>}
                    />
                  ))}
                </div>
                <span className="w-11 shrink-0 text-right font-mono text-[12px] font-semibold" style={{ color: 'var(--metin2)' }}>
                  %{Math.round(g.ortalama * 100)}
                </span>
                <Icon
                  name="chevronDown" size={14} color="currentColor"
                  style={{ opacity: 0.4, transform: acikMi ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
                />
              </button>

              {/* Açılır kazanım detayı (ltree drill-down) — en zayıf önce */}
              {acikMi && (
                <m.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  transition={{ duration: 0.24, ease: [0.21, 0.65, 0.32, 1] }}
                  className="overflow-hidden"
                >
                  <div className="space-y-1.5 px-2 pb-3 pt-1">
                    {[...g.nodes].sort((a, b) => a.mastery - b.mastery).map((n) => {
                      const tekrarVakti = gunFarki(n.updatedAt) >= 14
                      const havuzVar = havuzda.has(n.kazanimId)
                      return (
                        <div key={n.kazanimId} className="flex items-center gap-3 rounded-lg px-2 py-1.5">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-[13px] font-medium" style={{ color: 'var(--metin2)' }} title={n.title}>
                                {n.title}
                              </span>
                              {n.openMisconceptions > 0 && <Badge tone="amber">çalışılıyor</Badge>}
                              {tekrarVakti && <Badge tone="slate">tekrar vakti</Badge>}
                            </div>
                            <div className="mt-1.5 flex items-center gap-2.5">
                              <Meter oran={n.mastery} className="max-w-44 flex-1" yukseklik={5} />
                              <span className="font-mono text-[11px]" style={{ color: 'var(--metin3)' }}>
                                %{Math.round(n.mastery * 100)} · {n.correct}/{n.attempts}
                              </span>
                            </div>
                          </div>
                          {havuzVar ? (
                            <FBtn kucuk onClick={() => onCalis(n)}>{calisEtiketi}</FBtn>
                          ) : (
                            <Tip icerik="Havuzda bu kazanım için hazır soru yok — Koç doldurunca açılır.">
                              <span className="cursor-default font-mono text-[10.5px]" style={{ color: 'var(--metin3)' }}>havuz boş</span>
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

      <div className="mt-3.5 flex flex-wrap items-center gap-1.5 font-mono text-[10.5px]" style={{ color: 'var(--metin3)' }}>
        <span>az</span>
        {['var(--v1)', 'var(--v2)', 'var(--v3)', 'var(--v4)'].map((t) => (
          <span key={t} className="h-2.5 w-5 rounded-[4px]" style={{ background: t }} />
        ))}
        <span>çok</span>
        <span className="mx-1">·</span>
        <span className="inline-block size-3 rounded-[4px] border border-dashed" style={{ background: 'var(--v0)', borderColor: 'var(--cam-kenar)' }} />
        <span>ölçüm yok</span>
        <span className="mx-1">·</span>
        <span>sağdaki sayı = ders ortalaması</span>
      </div>
    </section>
  )
}

/* ── ÖNCE BUNLARA ÇALIŞ — mini ustalık halkaları + gerekçe satırı ──────────── */

export function OncelikRadari({ zayiflar, kesfedilmemis, onCalis, onKesfet, calisEtiketi = 'Çöz' }: {
  zayiflar: RontgenNode[]
  kesfedilmemis: Array<{ kazanimId: number; title: string; subject: string }>
  onCalis: (n: RontgenNode) => void
  onKesfet: (k: { kazanimId: number; title: string; subject: string }) => void
  /** Öğrencide "Çöz", öğretmende "Set gönder" (UstalikMatrisi ile aynı sözleşme). */
  calisEtiketi?: string
}) {
  // Gerekçe GERÇEK sinyallerden türetilir — sınav ağırlığı gibi elimizde
  // olmayan veri yazılmaz (uydurma yasak).
  const gerekce = (n: RontgenNode): string => {
    const par: string[] = ['ustalık düşük']
    if (n.openMisconceptions > 0) par.push('açık yanılgı var')
    if (gunFarki(n.updatedAt) >= 14) par.push('uzun süredir tekrar yok')
    return par.join(' · ')
  }

  // Satırın tamamı buton (≥44px tık hedefi) — sağdaki "Çöz" görsel bir pil,
  // iç içe buton değil. Sayfanın TEK koyu eylemi #1'in pilidir.
  const pil = (birincil: boolean): string => cn(
    'inline-flex shrink-0 items-center rounded-xl px-3.5 py-2 text-[13px] font-semibold transition-all',
    birincil
      ? 'text-white [background:var(--cta)] group-hover:[box-shadow:var(--parilti)]'
      : '[color:var(--vurgu)] [background:color-mix(in_srgb,var(--adacayi)_24%,transparent)] group-hover:[background:color-mix(in_srgb,var(--adacayi)_38%,transparent)]',
  )

  return (
    <section className={KART} aria-label="Öncelikli konular">
      <BaslikSatir ikon="target" renk="var(--yaprak)">Önce Bunlara Çalış</BaslikSatir>
      {zayiflar.length === 0 && kesfedilmemis.length === 0 ? (
        <p className="py-4 text-center text-[13px]" style={{ color: 'var(--metin3)' }}>
          Öncelik listesi temiz — zayıf sinyal yok. Yeni konu keşfetmeye devam.
        </p>
      ) : (
        <div className="space-y-2.5">
          {zayiflar.map((n, i) => {
            const bir = i === 0
            return (
              <button
                key={n.kazanimId}
                type="button"
                onClick={() => onCalis(n)}
                aria-label={`${n.title} — ${calisEtiketi}`}
                className="group flex w-full cursor-pointer items-center gap-3 rounded-[14px] p-3 text-left transition-transform motion-safe:hover:translate-x-1"
                style={{
                  background: bir ? 'color-mix(in srgb, var(--yaprak) 7%, var(--ic))' : 'var(--ic)',
                  border: `1px solid ${bir ? 'color-mix(in srgb, var(--yaprak) 35%, transparent)' : 'transparent'}`,
                }}
              >
                <Halka oran={n.mastery} boyut={44} kalinlik={4.5} renk={bir ? 'var(--yaprak)' : 'var(--adacayi)'}>
                  <span className="font-mono text-[10px] font-semibold" style={{ color: 'var(--metin2)' }}>
                    %{Math.round(n.mastery * 100)}
                  </span>
                </Halka>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="size-2 shrink-0 rounded-full" style={{ background: dersHex(n.subject) }} />
                    <b className="truncate text-[14px] font-semibold" style={{ color: 'var(--metin1)' }} title={n.title}>
                      {n.title}
                    </b>
                  </span>
                  <span className="mt-0.5 block truncate text-[12.5px]" style={{ color: 'var(--metin2)' }}>
                    {gerekce(n)}
                  </span>
                </span>
                <span className={pil(bir)}>{calisEtiketi}</span>
              </button>
            )
          })}
          {kesfedilmemis.map((k) => (
            <button
              key={k.kazanimId}
              type="button"
              onClick={() => onKesfet(k)}
              aria-label={`${k.title} — ${calisEtiketi}`}
              className="group flex w-full cursor-pointer items-center gap-3 rounded-[14px] p-3 text-left transition-transform motion-safe:hover:translate-x-1"
              style={{ background: 'var(--ic)', border: '1px solid transparent' }}
            >
              <span
                className="grid size-11 shrink-0 place-items-center rounded-full border border-dashed"
                style={{ borderColor: 'color-mix(in srgb, var(--vurgu) 40%, transparent)', color: 'var(--vurgu)' }}
              >
                <Icon name="sparkle" size={15} color="currentColor" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="size-2 shrink-0 rounded-full" style={{ background: dersHex(k.subject) }} />
                  <b className="truncate text-[14px] font-semibold" style={{ color: 'var(--metin1)' }} title={k.title}>
                    {k.title}
                  </b>
                </span>
                <span className="mt-0.5 block truncate text-[12.5px]" style={{ color: 'var(--metin2)' }}>
                  yeni konu · henüz hiç dokunmadın
                </span>
              </span>
              <span className={pil(false)}>{calisEtiketi}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

/* ── DİKKAT: TUZAKLARIN — sık düşülen çeldiriciler (öğrenci dili) ──────────── */

export function TuzakPaneli({ traps, onKir }: {
  traps: Tuzak[]
  /** Verilirse "Bu tuzağı kır →" köprüsü çizilir (o kazanımdan pratik başlatır).
      Öğretmen yüzeyi vermeden çağırır (geriye-uyumlu). */
  onKir?: (t: Tuzak) => void
}) {
  if (!traps.length) return null
  return (
    <section className={KART} aria-label="Sık düşülen tuzaklar">
      <BaslikSatir ikon="bolt" renk="var(--uyari)">Dikkat: Tuzakların</BaslikSatir>
      <p className="mb-1 text-[13px]" style={{ color: 'var(--metin2)' }}>
        Aynı çeldiriciye tekrar düşmek bir desendir — görünce kırması kolay.
      </p>
      <div>
        {traps.map((t, i) => (
          <div
            key={`${t.kazanimId}-${t.selectedOption}`}
            className={cn('flex gap-3 py-3', i > 0 && 'border-t')}
            style={{ borderColor: 'var(--cizgi)' }}
          >
            <span
              className="grid size-[34px] shrink-0 place-items-center rounded-[11px]"
              style={{ background: 'color-mix(in srgb, var(--uyari) 13%, transparent)', color: 'var(--uyari)' }}
            >
              <Icon name="bolt" size={16} color="currentColor" strokeWidth={2} />
            </span>
            <div className="min-w-0 flex-1">
              <b className="block truncate text-[13.5px] font-semibold" style={{ color: 'var(--metin1)' }} title={t.title}>
                {t.title}
              </b>
              <span className="block text-[12.5px]" style={{ color: 'var(--metin2)' }}>
                {t.subject} · hep {t.selectedOption} şıkkına takılıyorsun
              </span>
              {onKir && (
                <button
                  type="button"
                  onClick={() => onKir(t)}
                  className="mt-0.5 cursor-pointer text-[12.5px] font-semibold hover:underline"
                  style={{ color: 'var(--vurgu)' }}
                >
                  Bu tuzağı kır →
                </button>
              )}
            </div>
            <span
              className="shrink-0 self-start rounded-[9px] px-2 py-0.5 font-mono text-[11px] font-medium"
              style={{ background: 'color-mix(in srgb, var(--uyari) 14%, transparent)', color: 'var(--uyari)' }}
            >
              {t.missCount} kez
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ── HIZIN — gradyan çubuklar + hedef imi + kelimeli yorum ─────────────────── */

/** Backend "doğru ama yavaş" kuralının eşiği (>40 sn yarım kredi) — hedef imi
    GERÇEK ürün kuralına bağlanır, uydurma tempo hedefi yazılmaz. */
const HIZ_HEDEF_SN = 40

export function HizPaneli({ yavaslar, zorluk }: {
  yavaslar: RontgenNode[]
  zorluk: { kolay: number; orta: number; zor: number }
}) {
  const zToplam = zorluk.kolay + zorluk.orta + zorluk.zor
  if (!yavaslar.length && !zToplam) return null
  const maksSn = Math.max(HIZ_HEDEF_SN, ...yavaslar.map((n) => (n.avgLatencyMs ?? 0) / 1000)) * 1.15
  return (
    <section className={KART} aria-label="Hız analizi">
      <BaslikSatir ikon="clock" renk="var(--bilgi)">Hızın</BaslikSatir>
      {yavaslar.length > 0 && (
        <>
          {yavaslar.map((n) => {
            const sn = Math.round((n.avgLatencyMs ?? 0) / 1000)
            return (
              <div key={n.kazanimId} className="mt-3 first:mt-1">
                <div className="flex items-baseline justify-between gap-2 text-[13px]" style={{ color: 'var(--metin2)' }}>
                  <span className="min-w-0 truncate" title={n.title}>
                    <span className="mr-1.5 inline-block size-2 rounded-full align-[1px]" style={{ background: dersHex(n.subject) }} />
                    {n.title}
                  </span>
                  <span className="shrink-0 font-mono text-[11.5px]">
                    <b style={{ color: 'var(--metin1)' }}>ort {sn} sn</b> · hedef {HIZ_HEDEF_SN} sn
                  </span>
                </div>
                <div className="relative mt-1.5 h-[9px] rounded-full" style={{ background: 'var(--ic)' }}>
                  <span
                    className="absolute inset-y-0 left-0 block rounded-full"
                    style={{
                      width: `${Math.min(100, (sn / maksSn) * 100)}%`,
                      background: 'linear-gradient(90deg, var(--toprak), color-mix(in srgb, var(--toprak) 70%, var(--uyari)))',
                    }}
                  />
                  <span
                    className="absolute -inset-y-1 w-0.5 rounded"
                    style={{ left: `${(HIZ_HEDEF_SN / maksSn) * 100}%`, background: 'var(--metin3)' }}
                  />
                </div>
              </div>
            )
          })}
          <p className="mt-3 text-[12.5px] leading-relaxed" style={{ color: 'var(--metin2)' }}>
            Dikey im = hedef tempo ({HIZ_HEDEF_SN} sn). Bu kazanımlarda doğru çözüyorsun
            ama yavaşsın — pratik arttıkça çubuk ime yaklaşır.
          </p>
        </>
      )}
      {zToplam > 0 && (
        <div
          className={cn('pt-3', yavaslar.length > 0 && 'mt-3.5 border-t')}
          style={{ borderColor: 'var(--cizgi)' }}
        >
          <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wide" style={{ color: 'var(--metin3)' }}>
            son 30 gün · zorluk kırılımı
          </div>
          <div className="flex gap-1.5">
            {([['kolay', zorluk.kolay], ['orta', zorluk.orta], ['zor', zorluk.zor]] as const).map(([ad, n]) => (
              <span key={ad} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1" style={{ background: 'var(--ic)' }}>
                <span className="text-[11px]" style={{ color: 'var(--metin2)' }}>{ad}</span>
                <span className="font-mono text-[11.5px] font-semibold" style={{ color: 'var(--metin1)' }}>{n}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

/* ── KAPSAMA — halka + kapsama oranıyla canlanan fidan sırası ──────────────── */

export function KapsamaKarti({ taranan, toplam }: { taranan: number; toplam: number }) {
  if (!toplam) return null
  const oran = Math.min(1, taranan / toplam)
  const canli = Math.round(oran * 5)
  return (
    <section className={KART} aria-label="Müfredat kapsaması">
      <div className="flex items-center gap-[18px]">
        <Halka oran={oran} boyut={92} kalinlik={8} renk="var(--adacayi)">
          <span className="text-[17px] font-extrabold" style={{ color: 'var(--metin1)', fontFamily: 'Outfit, sans-serif' }}>
            %{Math.round(oran * 100)}
          </span>
        </Halka>
        <div className="min-w-0">
          <b className="block text-[21px] font-extrabold leading-tight" style={{ color: 'var(--metin1)', fontFamily: 'Outfit, sans-serif' }}>
            {taranan} / {toplam} kazanım
          </b>
          <span className="text-[13px]" style={{ color: 'var(--metin2)' }}>
            dokunduğun konular — her soru haritayı biraz daha açar
          </span>
          <div className="mt-2.5 flex items-end gap-1.5" aria-hidden>
            {[0, 1, 2, 3, 4].map((i) => <FidanIkon key={i} acik={i < canli} />)}
          </div>
        </div>
      </div>
    </section>
  )
}

/** FİDAN filizi — kapsama/boş durum süsü (kapsama arttıkça canlanır). */
export function FidanIkon({ acik = true, boyut = 15 }: { acik?: boolean; boyut?: number }) {
  return (
    <svg width={boyut} height={boyut * 1.2} viewBox="0 0 24 28" style={{ opacity: acik ? 1 : 0.35 }} aria-hidden>
      <path d="M12 26v-9" stroke="#A9713F" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M12 17C12 12 8 9 3 9c0 5 4 8 9 8" fill={acik ? 'var(--yaprak)' : 'var(--adacayi)'} />
      <path d="M12 15c0-4 3-6 8-6 0 4.5-3.5 6.5-8 6.5" fill="var(--adacayi)" />
    </svg>
  )
}
