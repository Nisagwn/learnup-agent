import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useReducedMotion } from 'framer-motion'
import { useAsync } from '../lib/useAsync'
import { apiGet } from '../lib/api.js'
import { dersAnahtar } from '../lib/format'
import type { RontgenNode, RontgenYanit, Tuzak } from '../lib/types'
import { cn } from '../lib/cn'
import { Skeleton, SUBJECT_UI } from '../components/ui'
import { Reveal } from '../components/fx'
import { CanliSayi } from '../components/cekirdek'
import { gunlukHedef } from './Bugun'
import {
  TrendPaneli, TakvimIsi, UstalikMatrisi, OncelikRadari, TuzakPaneli,
  HizPaneli, KapsamaKarti, HaftaKarsilastirma, FidanIkon, type DersGrubu,
} from '../components/rontgen'

/* ═══════════════════════════════════════════════════════════════════════════
   ANALİZLER — onaylı v2 önizleme (`docs/design/onizleme/analizler.html`) portu.
   Gelişim Özeti hero'su (gradyan halka + statlar + dal dekoru) → filtreler
   (ders/dönem URL'de, replace) → izgara: SOL Ustalık Matrisi · Doğruluk
   Trendi · Bu Hafta vs Geçen Hafta · Çalışma Takvimi — SAĞ Önce Bunlara
   Çalış · Tuzaklar · Hızın · Kapsama.
   Veri: GET /mastery/rontgen (tek istek, 84 günlük trend) + /questions/ai/topics.
   Her sayı gerçek uçtan türetilir; veri yoksa panel kendini gizler (null ≠ 0).
   Teşhis/taksonomi dili öğrenciye SIZMAZ (ürün kuralı).
   ═══════════════════════════════════════════════════════════════════════════ */

const GUN_MS = 86_400_000
/**
 * Tarih-YALNIZ dizgiler için gün farkı (UTC kayması yemesin). BUGÜN = 0.
 *
 * ⚠️ ÖĞLEN ÇIPASI BUGÜNÜ NEGATİFE DÜŞÜRÜYORDU. Çıpa 12:00 olduğu için, gün içinde saat
 * 12:00'den ÖNCE bugünün farkı `floor(-0.125) === -1` oluyordu. Pencere kontrolleri
 * `f >= 0 && f < 30` yazdığı için bugünün satırı hiçbir kovaya girmiyor, tamamen düşüyordu:
 * sabah 09:00'da 20 soru çözen öğrenci "Bu Ay Çözülen"de o 20 soruyu GÖRMÜYOR, sayı ancak
 * saat 12:00'den sonra aniden beliriyordu. Aynı ekrandaki `dogruluk7` ise `f < 7` yazdığı
 * için bugünü SAYIYORDU — iki stat aynı günü farklı sayıyordu.
 * Çözüm çıpayı değiştirmek değil (o UTC kaymasına karşı doğru), farkı TABANLAMAK.
 */
const gunF = (isoGun: string): number =>
  Math.max(0, Math.floor((Date.now() - +new Date(isoGun + 'T12:00:00')) / GUN_MS))

/** Backend trend penceresi (mastery.routes: 84 günlük) — "Tümü" dönemi bu tavana oturur. */
const TREND_PENCERE_GUN = 84

const DONEMLER = [['7', '7 gün'], ['30', '30 gün'], ['tumu', 'Tümü']] as const

interface Konu { kazanimId: number; title: string; subject: string; count: number }

export function Harita() {
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const rontgen = useAsync<RontgenYanit>(() => apiGet('/mastery/rontgen'), [])
  const konular = useAsync<{ subjects: Array<{ subject: string; topics: Konu[] }> }>(
    () => apiGet('/questions/ai/topics'), [],
  )

  /* ── Filtreler — URL'de yaşar, geri tuşunu kirletmez (replace) ── */
  const ders = params.get('ders')                 // dersAnahtar ('mat'…) | null = tümü
  const donem = params.get('donem') ?? '30'       // '7' | '30' | 'tumu'
  const filtre = (k: string, v: string | null): void => {
    const p = new URLSearchParams(params)
    if (v) p.set(k, v); else p.delete(k)
    setParams(p, { replace: true })
  }

  const tumNodes = useMemo(() => rontgen.data?.nodes ?? [], [rontgen.data])
  const trend = useMemo(() => rontgen.data?.trend ?? [], [rontgen.data])

  /* ── Türetimler — hepsi gerçek uçtan ── */

  // Ders çipleri: veride görülen dersler (anahtar → görünen ad)
  const dersler = useMemo(() => {
    const m = new Map<string, string>()
    for (const n of tumNodes) {
      const k = dersAnahtar(n.subject)
      if (!m.has(k)) m.set(k, n.subject)
    }
    return [...m.entries()]
  }, [tumNodes])

  // Panel verisi ders filtresine uyar; hero GLOBAL kalır (Gelişim Özeti = genel resim)
  const nodes = useMemo(
    () => (ders ? tumNodes.filter((n) => dersAnahtar(n.subject) === ders) : tumNodes),
    [tumNodes, ders],
  )

  const genelUstalik = useMemo(
    () => (tumNodes.length ? tumNodes.reduce((s, n) => s + n.mastery, 0) / tumNodes.length : 0),
    [tumNodes],
  )

  // Bu ay (son 30 gün) çözülen ↔ önceki 30 gün — delta yalnız önceki pencere veri içeriyorsa
  const heroAy = useMemo(() => {
    let bu = 0, onceki = 0, oncekiVar = false
    for (const g of trend) {
      const f = gunF(g.date)
      if (f >= 0 && f < 30) bu += g.solved
      else if (f >= 30 && f < 60) { onceki += g.solved; oncekiVar = true }
    }
    return { bu, delta: oncekiVar ? bu - onceki : null }
  }, [trend])

  // En güçlü ders — ölçülmüş derslerin ustalık ortalaması (global).
  // "En çok gelişen" stat'ı ÇİZİLMEZ: mevcut uçlarda ders-bazlı tarihsel seri yok (uydurulmaz).
  const enGuclu = useMemo(() => {
    const m = new Map<string, { subject: string; sum: number; n: number }>()
    for (const n of tumNodes) {
      const k = dersAnahtar(n.subject)
      const e = m.get(k) ?? { subject: n.subject, sum: 0, n: 0 }
      e.sum += n.mastery; e.n += 1
      m.set(k, e)
    }
    let best: { subject: string; ort: number } | null = null
    for (const e of m.values()) {
      const ort = e.sum / e.n
      if (!best || ort > best.ort) best = { subject: e.subject, ort }
    }
    return best
  }, [tumNodes])

  // Son 7 gün ↔ önceki 7 gün doğruluğu (yüzde puan farkı) — global
  const dogruluk7 = useMemo(() => {
    const s7 = { c: 0, n: 0 }, o7 = { c: 0, n: 0 }
    for (const g of trend) {
      const f = gunF(g.date)
      if (f < 7) { s7.c += g.correct; s7.n += g.solved }
      else if (f < 14) { o7.c += g.correct; o7.n += g.solved }
    }
    const son = s7.n ? Math.round((s7.c / s7.n) * 100) : null
    const once = o7.n ? Math.round((o7.c / o7.n) * 100) : null
    return { son, delta: son != null && once != null ? son - once : null }
  }, [trend])

  // Müfredat toplamları (anahtar bazında) — matristeki "ölçüm yok" hücreleri + kapsama
  const mufredat = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of rontgen.data?.curriculum ?? []) {
      const k = dersAnahtar(c.subject)
      m.set(k, (m.get(k) ?? 0) + c.total)
    }
    return m
  }, [rontgen.data])

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
      toplam: mufredat.get(dersAnahtar(subject)),
    }))
  }, [nodes, mufredat])

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
    return havuzKonulari
      .filter((k) => !bilinen.has(k.kazanimId) && (!ders || dersAnahtar(k.subject) === ders))
      .slice(0, 2)
  }, [nodes, havuzKonulari, ders])

  // "Doğru ama yavaş": ort. gecikmesi 40s üstü, en az 3 denemeli — en yavaş 3
  const yavaslar = useMemo(
    () => [...nodes]
      .filter((n) => (n.avgLatencyMs ?? 0) > 40_000 && n.attempts >= 3)
      .sort((a, b) => (b.avgLatencyMs ?? 0) - (a.avgLatencyMs ?? 0))
      .slice(0, 3),
    [nodes],
  )

  const traps = useMemo<Tuzak[]>(
    () => (rontgen.data?.traps ?? []).filter((t) => !ders || dersAnahtar(t.subject) === ders),
    [rontgen.data, ders],
  )

  // Zorluk kırılımı GLOBAL bir sayıdır (uçta ders kırılımı yok) — ders filtresi
  // aktifken sıfırlanır ki panel o bölümü DÜRÜSTÇE gizlesin.
  const zorluk = ders
    ? { kolay: 0, orta: 0, zor: 0 }
    : rontgen.data?.zorluk ?? { kolay: 0, orta: 0, zor: 0 }

  const kapsamaToplam = useMemo(() => {
    if (ders) return mufredat.get(ders) ?? 0
    return (rontgen.data?.curriculum ?? []).reduce((s, c) => s + c.total, 0)
  }, [ders, mufredat, rontgen.data])

  const aralikGun = donem === '7' ? 7 : donem === 'tumu' ? TREND_PENCERE_GUN : 30
  const trendVar = useMemo(() => trend.some((g) => g.solved > 0), [trend])

  const calis = (n: { kazanimId: number; subject: string; title: string }): void => {
    nav('/coz', { state: { source: 'ai', kazanimId: n.kazanimId, subject: n.subject, title: n.title } })
  }

  /* ── Durumlar ── */

  if (rontgen.loading) {
    return (
      <Sayfa>
        <Skeleton className="h-10 w-56" />
        <Skeleton className="mt-5 h-12 w-full max-w-xl" />
        <Skeleton className="mt-5 h-48" />
        <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </Sayfa>
    )
  }

  if (rontgen.error) {
    return (
      <Sayfa>
        <div className="glass mx-auto max-w-md rounded-[20px] px-6 py-8 text-center">
          <p className="text-sm" style={{ color: 'var(--metin2)' }}>Analizler yüklenemedi: {rontgen.error}</p>
          <button className="an-dis mt-4" onClick={() => rontgen.reload()}>Tekrar dene</button>
        </div>
      </Sayfa>
    )
  }

  if (!tumNodes.length) {
    return (
      <Sayfa>
        <Baslik />
        <Reveal delay={0.06}>
          <div className="glass mx-auto mt-10 max-w-lg rounded-[20px] px-8 py-10 text-center">
            <div className="mx-auto flex w-fit items-end gap-1.5">
              <FidanIkon boyut={22} acik={false} />
              <FidanIkon boyut={40} />
              <FidanIkon boyut={22} acik={false} />
            </div>
            <h2 className="mt-4 text-xl font-bold" style={{ color: 'var(--metin1)', fontFamily: 'Outfit, sans-serif' }}>
              Analizlerin henüz hazır değil
            </h2>
            <p className="mx-auto mt-2 max-w-sm text-[13.5px] leading-relaxed" style={{ color: 'var(--metin2)' }}>
              Harita soru çözdükçe açılır: her cevap, konu başına ustalık ölçümünü
              günceller. İlk adımı at — fidanın büyüsün.
            </p>
            <button className="an-cta mt-6" onClick={() => nav('/coz', { state: { source: 'ai' } })}>
              Soru çözmeye başla
            </button>
          </div>
        </Reveal>
      </Sayfa>
    )
  }

  return (
    <Sayfa>
      <Baslik>
        <div className="glass mt-3.5 inline-flex flex-wrap items-stretch gap-1 rounded-[14px] p-[5px] shadow-card" role="group" aria-label="Filtreler">
          <button className={cn('an-cip', !ders && 'secili')} aria-pressed={!ders} onClick={() => filtre('ders', null)}>
            Tüm dersler
          </button>
          {dersler.map(([k, ad]) => (
            <button key={k} className={cn('an-cip', ders === k && 'secili')} aria-pressed={ders === k} onClick={() => filtre('ders', k)}>
              {ad}
            </button>
          ))}
          <span className="an-ayrac" aria-hidden />
          {DONEMLER.map(([k, ad]) => (
            <button key={k} className={cn('an-cip', donem === k && 'secili')} aria-pressed={donem === k} onClick={() => filtre('donem', k === '30' ? null : k)}>
              {ad}
            </button>
          ))}
        </div>
      </Baslik>

      {/* ── GELİŞİM ÖZETİ — hero (global resim) ── */}
      <Reveal delay={0.06}>
        <section className="glass relative mt-5 overflow-hidden rounded-[20px] p-[22px] shadow-card" aria-label="Gelişim özeti">
          <svg className="pointer-events-none absolute -right-5 -top-6 w-[210px]" style={{ opacity: 0.09 }} viewBox="0 0 100 100" aria-hidden>
            <path d="M10 90C30 60 40 40 90 10M35 62c8 2 16 0 22-6M52 44c8 2 15 0 21-6M25 74c7 3 14 2 20-2" stroke="var(--vurgu)" strokeWidth="3" fill="none" strokeLinecap="round" />
          </svg>
          <div className="flex flex-wrap items-center gap-[30px]">
            <BuyukHalka oran={genelUstalik} />
            <div className="grid min-w-[260px] flex-1 gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
              <OzetStat etiket="Bu Ay Çözülen"
                alt={heroAy.delta != null ? <Yon delta={heroAy.delta} sozel="geçen aydan" /> : undefined}>
                <CanliSayi value={heroAy.bu} /> <small className="text-[13px] font-medium" style={{ color: 'var(--metin2)' }}>soru</small>
              </OzetStat>
              {enGuclu && (
                <OzetStat etiket="En Güçlü Dersin"
                  nokta={SUBJECT_UI[dersAnahtar(enGuclu.subject)]?.hex}
                  alt={<span style={{ color: 'var(--metin2)' }}>%{Math.round(enGuclu.ort * 100)} ustalık</span>}>
                  {enGuclu.subject}
                </OzetStat>
              )}
              {dogruluk7.son != null && (
                <OzetStat etiket="7 Gün Doğruluk"
                  alt={dogruluk7.delta != null ? <Yon delta={dogruluk7.delta} sozel="önceki 7 güne göre" birim=" puan" /> : undefined}>
                  %<CanliSayi value={dogruluk7.son} />
                </OzetStat>
              )}
            </div>
          </div>
        </section>
      </Reveal>

      {nodes.length === 0 ? (
        /* Ders filtresi sonuç vermedi — sayı uydurulmaz, boş durum gösterilir */
        <Reveal delay={0.12}>
          <div className="glass mx-auto mt-6 max-w-md rounded-[20px] px-6 py-8 text-center">
            <div className="mx-auto w-fit"><FidanIkon boyut={32} acik={false} /></div>
            <p className="mt-3 text-[13.5px]" style={{ color: 'var(--metin2)' }}>
              Bu derste henüz ölçüm yok — panel, ilk çözümle birlikte belirir.
            </p>
            <button className="an-dis mt-4" onClick={() => filtre('ders', null)}>Filtreyi temizle</button>
          </div>
        </Reveal>
      ) : (
        <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
          {/* SOL */}
          <div className="min-w-0 space-y-5">
            <Reveal delay={0.12}>
              <UstalikMatrisi gruplar={gruplar} havuzda={havuzda} onCalis={calis} />
            </Reveal>
            {trendVar && (
              <Reveal delay={0.18}>
                <TrendPaneli trend={trend} aralikGun={aralikGun} hedefGunluk={gunlukHedef()} />
              </Reveal>
            )}
            <Reveal delay={0.24}>
              <HaftaKarsilastirma trend={trend} />
            </Reveal>
            <Reveal delay={0.3}>
              <TakvimIsi trend={trend} />
            </Reveal>
          </div>

          {/* SAĞ */}
          <div className="min-w-0 space-y-5">
            <Reveal delay={0.12}>
              <OncelikRadari
                zayiflar={zayiflar}
                kesfedilmemis={kesfedilmemis}
                onCalis={calis}
                onKesfet={calis}
              />
            </Reveal>
            {traps.length > 0 && (
              <Reveal delay={0.18}>
                <TuzakPaneli traps={traps} onKir={calis} />
              </Reveal>
            )}
            <Reveal delay={0.24}>
              <HizPaneli yavaslar={yavaslar} zorluk={zorluk} />
            </Reveal>
            <Reveal delay={0.3}>
              <KapsamaKarti taranan={nodes.length} toplam={kapsamaToplam} />
            </Reveal>
          </div>
        </div>
      )}
    </Sayfa>
  )
}

/* ── Kabuk ── */

function Sayfa({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-[1152px] px-[clamp(16px,3.5vw,44px)] pb-20 pt-9">
      <style>{`
        .an-cip { padding: 7px 15px; border-radius: 10px; font-size: 13.5px; font-weight: 600;
          cursor: pointer; border: none; background: transparent; color: var(--metin2);
          font-family: Inter, sans-serif; transition: background .15s, color .15s; }
        .an-cip:hover { background: var(--ic); }
        .an-cip.secili { background: var(--vurgu); color: #fff; }
        .an-ayrac { width: 1px; background: var(--cam-kenar); margin: 6px 4px; }
        .an-cta { border: none; cursor: pointer; border-radius: 12px; padding: 12px 20px;
          font-family: Inter, sans-serif; font-weight: 600; font-size: 14.5px;
          display: inline-flex; align-items: center; gap: 8px; background: var(--cta); color: #fff;
          transition: box-shadow .2s, transform .15s; }
        .an-cta:hover { box-shadow: var(--parilti); transform: translateY(-1px); }
        .an-dis { border: 1px solid color-mix(in srgb, var(--vurgu) 35%, transparent); cursor: pointer;
          border-radius: 12px; padding: 11px 16px; font-family: Inter, sans-serif; font-weight: 600;
          font-size: 13.5px; background: transparent; color: var(--vurgu); transition: background .15s; }
        .an-dis:hover { background: var(--ic); }
      `}</style>
      {children}
    </div>
  )
}

function Baslik({ children }: { children?: ReactNode }) {
  return (
    <Reveal>
      <header>
        <h1 className="text-[clamp(27px,3vw,33px)] font-extrabold tracking-tight" style={{ color: 'var(--metin1)', fontFamily: 'Outfit, sans-serif' }}>
          Analizler
        </h1>
        {children}
      </header>
    </Reveal>
  )
}

/* ── Hero parçaları ── */

/** Gradyan büyük halka — dolum + sayaç animasyonlu (hareket-azalt uyumlu). */
function BuyukHalka({ oran }: { oran: number }) {
  const azalt = useReducedMotion()
  const [dolu, setDolu] = useState(!!azalt)
  useEffect(() => {
    if (azalt) return
    const id = requestAnimationFrame(() => setDolu(true))
    return () => cancelAnimationFrame(id)
  }, [azalt])
  const r = 64
  const cevre = 2 * Math.PI * r
  const hedefOffset = cevre * (1 - Math.min(1, Math.max(0, oran)))
  return (
    <div className="relative shrink-0" style={{ width: 150, height: 150 }}>
      <svg width="150" height="150" viewBox="0 0 150 150">
        <defs>
          <linearGradient id="an-halka" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--adacayi)" />
            <stop offset="1" stopColor="var(--yaprak)" />
          </linearGradient>
        </defs>
        <circle cx="75" cy="75" r={r} fill="none" stroke="var(--ic)" strokeWidth="11" />
        <circle
          cx="75" cy="75" r={r} fill="none" stroke="url(#an-halka)" strokeWidth="11" strokeLinecap="round"
          strokeDasharray={cevre} strokeDashoffset={dolu ? hedefOffset : cevre}
          transform="rotate(-90 75 75)"
          style={{ transition: azalt ? undefined : 'stroke-dashoffset 1.1s cubic-bezier(.4,0,.2,1)' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <b className="block text-[31px] font-extrabold leading-none" style={{ color: 'var(--metin1)', fontFamily: 'Outfit, sans-serif' }}>
            %<CanliSayi value={Math.round(oran * 100)} />
          </b>
          <span className="text-[11px]" style={{ color: 'var(--metin3)' }}>genel ustalık</span>
        </div>
      </div>
    </div>
  )
}

function OzetStat({ etiket, nokta, alt, children }: {
  etiket: string; nokta?: string; alt?: ReactNode; children: ReactNode
}) {
  return (
    <div className="rounded-[14px] px-4 py-3.5" style={{ background: 'var(--ic)' }}>
      <div className="font-mono text-[10px] font-medium uppercase tracking-[0.08em]" style={{ color: 'var(--metin3)' }}>
        {etiket}
      </div>
      <b className="mt-0.5 flex items-center gap-1.5 text-[19px] font-bold" style={{ color: 'var(--metin1)', fontFamily: 'Outfit, sans-serif' }}>
        {nokta && <span className="inline-block size-2 shrink-0 rounded-full" style={{ background: nokta }} />}
        <span className="min-w-0 truncate">{children}</span>
      </b>
      {alt && <div className="mt-0.5 text-[12px] font-semibold">{alt}</div>}
    </div>
  )
}

/** İmzalı fark satırı — yükseliş yeşil, düşüş sıcak toprak/uyarı tonunda (kelime + ok). */
function Yon({ delta, sozel, birim = '' }: { delta: number; sozel: string; birim?: string }) {
  const iyi = delta >= 0
  return (
    <span style={{ color: iyi ? 'var(--dogru)' : 'var(--uyari)' }}>
      {iyi ? '▲' : '▼'} {sozel} {iyi ? '+' : '−'}{Math.abs(delta)}{birim}
    </span>
  )
}
