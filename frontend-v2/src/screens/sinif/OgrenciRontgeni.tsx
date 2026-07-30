import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { apiGet } from '../../lib/api'
import { tGet, useSinifNav } from '../../lib/sinif-kapsam'
import { useAsync } from '../../lib/useAsync'
import { useSinif } from '../../lib/sinif'
import { dersAnahtar, gunEtiketi } from '../../lib/format'
import type {
  OgrenciDetayYaniti, OgrenciLoglarYaniti, OgretmenRontgenYaniti, YanilgiAyrinti,
} from '../../lib/types.teacher'
import type { RontgenNode } from '../../lib/types'
import { Sayfa, PanoIskeleti } from '../../components/RolGecidi'
import { CanliSayi, Halka, Sparkline } from '../../components/cekirdek'
import { Reveal } from '../../components/fx'
import {
  HizPaneli, OncelikRadari, TakvimIsi, TrendPaneli, TuzakPaneli, UstalikMatrisi,
  FidanIkon, type DersGrubu,
} from '../../components/rontgen'
import { OgrenciBaslik, OgrenciGezinme } from '../../components/sinif'

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   Ã–ÄRENCÄ° RÃ–NTGENÄ° â€” Ã¶ÄŸretmenin gÃ¶rdÃ¼ÄŸÃ¼, Ã–ÄRENCÄ°NÄ°N KENDÄ° EKRANIDIR.
   OnaylÄ± Ã¶nizleme: docs/design/onizleme/ogrenci-rontgeni.html (2026-07-23).

   Paneller rontgen.tsx'ten AYNEN gelir; fark eylem fiili ("Set gÃ¶nder") ve
   teÅŸhis dÃ¶kÃ¼mÃ¼nÃ¼n aÃ§Ä±k olmasÄ±. Ekrana Ã¶zgÃ¼ GERÃ‡EK-uÃ§ panelleri:
   Â· Cevap LoglarÄ± â€” GET /teacher/ogrenci/:id/loglar (sayfalÄ±; yanÄ±tta doÄŸru
     ÅŸÄ±k alanÄ± YOK â†’ doÄŸru ÅŸÄ±k GÃ–STERÄ°LMEZ, uydurma yasak)
   Â· Ã–dev GeÃ§miÅŸi â€” GET /teacher/ogrenci/:id `sonOdevler` (Ã¶ÄŸrenci-bazlÄ±,
     sunucuda sÃ¼zÃ¼lmÃ¼ÅŸ; soru-bazlÄ± ilerleme uÃ§ta yok â†’ yalnÄ±z puan Ã§izilir)
   Â· Trend'e sÄ±nÄ±f ortalamasÄ± referansÄ± â€” sÄ±nÄ±f saÄŸlayÄ±cÄ±sÄ±nÄ±n ZATEN Ã§ektiÄŸi
     /teacher/ozet trend'inden tÃ¼retilir (yeni istek yok).
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

const GUN_MS = 86_400_000
const LOG_LIMIT = 20

/** Tarih-YALNIZ dizgiler iÃ§in gÃ¼n farkÄ± (UTC kaymasÄ± yemesin). */
const gunF = (isoGun: string): number =>
  Math.floor((Date.now() - +new Date(isoGun + 'T12:00:00')) / GUN_MS)

/** ISO zaman â†’ "bugÃ¼n 14:20" Â· "dÃ¼n 19:41" Â· "19 Tem 14:20". */
const zamanEtiketi = (iso: string): string => {
  const d = new Date(iso)
  if (Number.isNaN(+d)) return iso
  const saat = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
  const key = d.toLocaleDateString('en-CA')
  const bugun = new Date().toLocaleDateString('en-CA')
  const dun = new Date(Date.now() - GUN_MS).toLocaleDateString('en-CA')
  if (key === bugun) return `bugÃ¼n ${saat}`
  if (key === dun) return `dÃ¼n ${saat}`
  return `${gunEtiketi(key)} ${saat}`
}

/** ms â†’ "58 sn" Â· "1 dk 42 sn" Â· yoksa "â€”". */
const sureEtiketi = (ms: number | null): string => {
  if (ms == null || ms <= 0) return 'â€”'
  const sn = Math.round(ms / 1000)
  if (sn < 60) return `${sn} sn`
  return `${Math.floor(sn / 60)} dk ${String(sn % 60).padStart(2, '0')} sn`
}

interface Konu { kazanimId: number; title: string; subject: string }

export function OgrenciRontgeni() {
  const nav = useSinifNav()
  const { ogrenciId = '' } = useParams()
  const { ozet, ogrenciBul, siradaki } = useSinif()

  const rontgen = useAsync<OgretmenRontgenYaniti>(
    () => tGet(`/teacher/ogrenci/${ogrenciId}/rontgen`),
    [ogrenciId],
  )
  const konular = useAsync<{ subjects: Array<{ subject: string; topics: Konu[] }> }>(
    () => apiGet('/questions/ai/topics'),
    [],
  )
  // Ã–dev geÃ§miÅŸi: Ã¶ÄŸrenci-bazlÄ± `sonOdevler` bu uÃ§ta SUNUCUDA sÃ¼zÃ¼lÃ¼ dÃ¶ner.
  const detay = useAsync<OgrenciDetayYaniti>(
    () => tGet(`/teacher/ogrenci/${ogrenciId}`),
    [ogrenciId],
  )
  const [logSayfa, setLogSayfa] = useState(0)
  useEffect(() => { setLogSayfa(0) }, [ogrenciId])
  const loglar = useAsync<OgrenciLoglarYaniti>(
    () => tGet(`/teacher/ogrenci/${ogrenciId}/loglar?limit=${LOG_LIMIT}&offset=${logSayfa * LOG_LIMIT}`),
    [ogrenciId, logSayfa],
  )

  const satir = ogrenciBul(ogrenciId)
  const nodes = useMemo(() => rontgen.data?.nodes ?? [], [rontgen.data])
  const trend = useMemo(() => rontgen.data?.trend ?? [], [rontgen.data])

  const onceki = siradaki(ogrenciId, -1)
  const sonraki = siradaki(ogrenciId, 1)

  const git = useCallback((id: string | null) => { if (id) nav(`/sinif/ogrenci/${id}`) }, [nav])

  // â† / â†’ roster sÄ±rasÄ±nda gezinir, Esc panoya dÃ¶ner.
  // Girdi alanÄ±ndayken devre dÄ±ÅŸÄ±: arama yazan Ã¶ÄŸretmen sayfa deÄŸiÅŸtirmemeli.
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

  /* â”€â”€ TÃ¼retimler â€” Harita.tsx ile birebir â”€â”€ */

  const genelUstalik = useMemo(
    () => (nodes.length ? nodes.reduce((s, n) => s + n.mastery, 0) / nodes.length : 0),
    [nodes],
  )
  const toplamKazanim = useMemo(
    () => (rontgen.data?.curriculum ?? []).reduce((s, c) => s + c.total, 0),
    [rontgen.data],
  )
  const dogruluk = useMemo(() => {
    const s7 = { c: 0, n: 0 }
    const o7 = { c: 0, n: 0 }
    for (const g of trend) {
      const f = gunF(g.date)
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
      dizi.push(map.get(new Date(Date.now() - i * GUN_MS).toLocaleDateString('en-CA')) ?? 0)
    }
    return dizi
  }, [trend])

  const buHafta = useMemo(
    () => trend.reduce((s, g) => {
      const f = gunF(g.date)
      return f >= 0 && f < 7 ? s + g.solved : s
    }, 0),
    [trend],
  )

  // SÄ±nÄ±f doÄŸruluk ortalamasÄ± â€” saÄŸlayÄ±cÄ±nÄ±n zaten Ã§ektiÄŸi /teacher/ozet trend'i
  // (30 gÃ¼nlÃ¼k pencere). Veri yoksa null â†’ referans Ã§izgisi hiÃ§ Ã§izilmez.
  const sinifOrt = useMemo(() => {
    let s = 0, c = 0
    for (const g of ozet?.trend ?? []) { s += g.solved; c += g.correct }
    return s ? (c / s) * 100 : null
  }, [ozet])

  // MÃ¼fredat toplamlarÄ± â€” matristeki kesikli "Ã¶lÃ§Ã¼m yok" hÃ¼creleri
  const mufredat = useMemo(() => {
    const map = new Map<string, number>()
    for (const c of rontgen.data?.curriculum ?? []) {
      const k = dersAnahtar(c.subject)
      map.set(k, (map.get(k) ?? 0) + c.total)
    }
    return map
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
    return havuzKonulari.filter((k) => !bilinen.has(k.kazanimId)).slice(0, 2)
  }, [nodes, havuzKonulari])

  const yavaslar = useMemo(
    () => [...nodes]
      .filter((n) => (n.avgLatencyMs ?? 0) > 40_000 && n.attempts >= 3)
      .sort((a, b) => (b.avgLatencyMs ?? 0) - (a.avgLatencyMs ?? 0))
      .slice(0, 3),
    [nodes],
  )

  // Log tablosunda kazanÄ±m adÄ±: rontgen dÃ¼ÄŸÃ¼mlerinden GERÃ‡EK baÅŸlÄ±k eÅŸlemesi
  const kazanimAdlari = useMemo(() => new Map(nodes.map((n) => [n.kazanimId, n.title])), [nodes])
  const kazanimAdi = useCallback(
    (id: number | null): string | null => (id == null ? null : kazanimAdlari.get(id) ?? null),
    [kazanimAdlari],
  )

  /** Ã–ÄŸrencide "Ã‡Ã¶z" /coz'e giderdi; Ã¶ÄŸretmende atÃ¶lyeye Ã–N-DOLU gider. */
  const setGonder = (n: { kazanimId: number; subject: string }): void => {
    void nav(`/sinif/odev?ogrenci=${ogrenciId}&kazanim=${n.kazanimId}&ders=${encodeURIComponent(n.subject)}`)
  }

  const baslik = (ctaGoster: boolean): ReactNode => (
    <OgrenciBaslik
      ad={rontgen.data?.student.name ?? satir?.name ?? null}
      grade={rontgen.data?.student.grade ?? satir?.grade ?? null}
      onGeri={() => nav('/sinif')}
      altBilgi={
        <>
          {satir?.lastActive && <span>son aktivite: {zamanEtiketi(satir.lastActive)}</span>}
          {buHafta > 0 && <span>Â· bu hafta {buHafta} soru</span>}
        </>
      }
      sag={
        <>
          <span className="hidden text-[10.5px] xl:inline" style={{ color: 'var(--metin3)' }}>
            â† â†’ Ã¶ÄŸrenciler arasÄ±nda gezinir Â· Esc panoya dÃ¶ner
          </span>
          <OgrenciGezinme
            onOnceki={onceki ? () => git(onceki) : null}
            onSonraki={sonraki ? () => git(sonraki) : null}
          />
          {/* EkranÄ±n TEK birincil eylemi â€” boÅŸ durumda oradaki CTA devralÄ±r */}
          {ctaGoster && (
            <button className="or-cta" onClick={() => nav(`/sinif/odev?ogrenci=${ogrenciId}`)}>
              Hedefli Ã¶dev gÃ¶nder
            </button>
          )}
        </>
      }
    />
  )

  if (rontgen.loading) return <PanoIskeleti sutun={2} />

  if (rontgen.error) {
    return (
      <Sayfa>
        <OrStil />
        <div className="glass mx-auto max-w-md rounded-[20px] px-6 py-8 text-center shadow-card">
          <p className="text-sm" style={{ color: 'var(--metin2)' }}>Ã–ÄŸrenci verisi yÃ¼klenemedi: {rontgen.error}</p>
          <button className="or-dis mt-4" onClick={() => rontgen.reload()}>Tekrar dene</button>
        </div>
      </Sayfa>
    )
  }

  if (!nodes.length) {
    return (
      <Sayfa>
        <OrStil />
        <Reveal>{baslik(false)}</Reveal>
        <Reveal delay={0.06}>
          <div className="glass mx-auto mt-10 max-w-lg rounded-[20px] px-8 py-10 text-center shadow-card">
            <div className="mx-auto flex w-fit items-end gap-1.5">
              <FidanIkon boyut={22} acik={false} />
              <FidanIkon boyut={40} />
              <FidanIkon boyut={22} acik={false} />
            </div>
            <h2 className="mt-4 text-xl font-bold" style={{ color: 'var(--metin1)', fontFamily: 'Outfit, sans-serif' }}>
              Bu Ã¶ÄŸrenci iÃ§in henÃ¼z Ã¶lÃ§Ã¼m yok
            </h2>
            <p className="mx-auto mt-2 max-w-sm text-[13.5px] leading-relaxed" style={{ color: 'var(--metin2)' }}>
              Harita, Ã¶ÄŸrenci soru Ã§Ã¶zdÃ¼kÃ§e belirir: her cevap, kazanÄ±m baÅŸÄ±na ustalÄ±k
              Ã¶lÃ§Ã¼mÃ¼nÃ¼ gÃ¼nceller. Bir tanÄ±ÅŸma seti yeterli.
            </p>
            <button className="or-cta mt-6" onClick={() => nav(`/sinif/odev?ogrenci=${ogrenciId}`)}>
              TanÄ±ÅŸma seti gÃ¶nder
            </button>
          </div>
        </Reveal>
      </Sayfa>
    )
  }

  const yanilgilar = rontgen.data?.misconceptions ?? []

  return (
    <Sayfa>
      <OrStil />
      <Reveal>{baslik(true)}</Reveal>

      {/* â”€â”€ 4 stat ÅŸeridi â€” tÃ¼retimler Harita ile birebir â”€â”€ */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Reveal delay={0.04}>
          <section className="glass flex items-center gap-3.5 rounded-[20px] p-4 shadow-card" aria-label="Genel ustalÄ±k">
            <Halka oran={genelUstalik} boyut={64} kalinlik={7} renk="var(--yaprak)">
              <span className="text-[13px] font-extrabold" style={{ color: 'var(--metin1)', fontFamily: 'Outfit, sans-serif' }}>
                %<CanliSayi value={Math.round(genelUstalik * 100)} />
              </span>
            </Halka>
            <div className="min-w-0">
              <div className="or-etiket">Genel UstalÄ±k</div>
              <div className="or-alt">Ã§Ã¼rÃ¼me uygulanmÄ±ÅŸ Â· {nodes.length} kazanÄ±m</div>
            </div>
          </section>
        </Reveal>

        <Reveal delay={0.08}>
          <section className="glass flex items-center rounded-[20px] p-4 shadow-card" aria-label="Kapsama">
            <div className="min-w-0">
              <div className="or-deger"><CanliSayi value={nodes.length} /></div>
              <div className="or-etiket">Kapsama</div>
              {toplamKazanim > 0 && <div className="or-alt">{toplamKazanim} mÃ¼fredat kazanÄ±mÄ± iÃ§inden</div>}
            </div>
          </section>
        </Reveal>

        <Reveal delay={0.12}>
          <section className="glass flex items-center gap-3 rounded-[20px] p-4 shadow-card" aria-label="7 gÃ¼n doÄŸruluk">
            <div className="min-w-0 flex-1">
              <div className="or-deger">
                {dogruluk.son == null
                  ? <span style={{ color: 'var(--metin3)' }}>â€”</span>
                  : <>%<CanliSayi value={dogruluk.son} /></>}
                {dogruluk.delta != null && dogruluk.delta !== 0 && (
                  <span
                    className="ml-1.5 align-[3px] text-[12px] font-bold"
                    style={{ color: dogruluk.delta > 0 ? 'var(--dogru)' : 'var(--uyari)' }}
                  >
                    {dogruluk.delta > 0 ? 'â–²' : 'â–¼'}{Math.abs(dogruluk.delta)}
                  </span>
                )}
              </div>
              <div className="or-etiket">7 GÃ¼n DoÄŸruluk</div>
              <div className="or-alt">{dogruluk.n7} soru Â· Ã¶nceki 7 gÃ¼ne gÃ¶re</div>
            </div>
            <Sparkline veri={kivilcim} genislik={64} yukseklik={22} />
          </section>
        </Reveal>

        <Reveal delay={0.16}>
          <section className="glass flex items-center rounded-[20px] p-4 shadow-card" aria-label="AÃ§Ä±k yanÄ±lgÄ±">
            <div className="min-w-0">
              <div className="or-deger"><CanliSayi value={yanilgilar.length} /></div>
              <div className="or-etiket">AÃ§Ä±k YanÄ±lgÄ±</div>
              <div className="or-alt">{zayiflar.length} kazanÄ±m Ã¶ncelikli</div>
            </div>
          </section>
        </Reveal>
      </div>

      {/* â”€â”€ Ana Ä±zgara â”€â”€ */}
      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
        {/* SOL */}
        <div className="min-w-0 space-y-4">
          <Reveal delay={0.1}>
            <UstalikMatrisi
              gruplar={gruplar}
              havuzda={havuzda}
              calisEtiketi="Set gÃ¶nder"
              onCalis={setGonder}
            />
          </Reveal>
          {trend.length > 1 && (
            <Reveal delay={0.16}>
              <TrendPaneli trend={trend} sinifOrt={sinifOrt} />
            </Reveal>
          )}
          {trend.length > 0 && <Reveal delay={0.22}><TakvimIsi trend={trend} /></Reveal>}
          <Reveal delay={0.28}>
            <CevapLoglari
              veri={loglar.data}
              yukleniyor={loglar.loading}
              hata={loglar.error}
              tekrar={() => loglar.reload()}
              sayfa={logSayfa}
              onSayfa={setLogSayfa}
              kazanimAdi={kazanimAdi}
            />
          </Reveal>
        </div>

        {/* SAÄ */}
        <div className="min-w-0 space-y-4">
          <Reveal delay={0.1}>
            <OncelikRadari
              zayiflar={zayiflar}
              kesfedilmemis={kesfedilmemis}
              calisEtiketi="Set gÃ¶nder"
              onCalis={setGonder}
              onKesfet={setGonder}
            />
          </Reveal>
          {/* TEÅHÄ°S DÃ–KÃœMÃœ â€” yalnÄ±z Ã¶ÄŸretmende. Ã–ÄŸrenci ucu bu alanÄ± hiÃ§ dÃ¶ndÃ¼rmez
              (persona TESHIS_DILI_YOK: teÅŸhis Ã¶ÄŸrenciye METÄ°N olarak gÃ¶sterilmez). */}
          {yanilgilar.length > 0 && (
            <Reveal delay={0.16}><YanilgiTeshisi yanilgilar={yanilgilar} /></Reveal>
          )}
          {(rontgen.data?.traps.length ?? 0) > 0 && (
            <Reveal delay={0.22}><TuzakPaneli traps={rontgen.data!.traps} /></Reveal>
          )}
          {yavaslar.length > 0 && (
            <Reveal delay={0.26}><HizPaneli yavaslar={yavaslar} zorluk={rontgen.data!.zorluk} /></Reveal>
          )}
          <Reveal delay={0.3}>
            <OdevGecmisi odevler={detay.data?.sonOdevler ?? []} yukleniyor={detay.loading} />
          </Reveal>
        </div>
      </div>
    </Sayfa>
  )
}

/* â”€â”€ Ekran stilleri â€” FÄ°DAN (007 inline deseni) â”€â”€ */

function OrStil() {
  return (
    <style>{`
      .or-cta { border: none; cursor: pointer; border-radius: 12px; padding: 11px 18px;
        font-family: Inter, sans-serif; font-weight: 600; font-size: 12.5px;
        display: inline-flex; align-items: center; gap: 7px; background: var(--cta); color: #fff;
        transition: box-shadow .2s, transform .15s; }
      .or-cta:hover { box-shadow: var(--parilti); transform: translateY(-1px); }
      .or-dis { border: 1px solid color-mix(in srgb, var(--vurgu) 35%, transparent); cursor: pointer;
        border-radius: 12px; padding: 9px 14px; font-family: Inter, sans-serif; font-weight: 600;
        font-size: 12.5px; background: transparent; color: var(--vurgu); transition: background .15s; }
      .or-dis:hover { background: var(--ic); }
      .or-etiket { font-family: 'JetBrains Mono', monospace; font-size: 10.5px; letter-spacing: .1em;
        text-transform: uppercase; color: var(--metin3); font-weight: 500; margin-top: 4px; }
      .or-deger { font-family: Outfit, sans-serif; font-size: 23px; font-weight: 800; line-height: 1;
        color: var(--metin1); }
      .or-alt { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--metin3); margin-top: 4px; }
      .or-h3 { font-family: Outfit, sans-serif; font-size: 15px; font-weight: 700; color: var(--metin1); }
      .or-th { text-align: left; font-family: 'JetBrains Mono', monospace; font-size: 9.5px;
        letter-spacing: .12em; text-transform: uppercase; color: var(--metin3); font-weight: 500;
        padding: 7px 10px; border-bottom: 1px solid var(--cizgi); }
      .or-td { padding: 9px 10px; border-bottom: 1px solid var(--cizgi); color: var(--metin2); font-size: 12px; }
      .or-tablo tr:last-child .or-td { border-bottom: none; }
    `}</style>
  )
}

/* â”€â”€ YANILGI TEÅHÄ°SÄ° â€” yalnÄ±z Ã¶ÄŸretmen gÃ¶rÃ¼r (uyarÄ± tonu; kehribar RAFTA) â”€â”€ */

function YanilgiTeshisi({ yanilgilar }: { yanilgilar: YanilgiAyrinti[] }) {
  const cip = (bg: string, renk: string): CSSProperties => ({ background: bg, color: renk })
  return (
    <section className="glass rounded-[20px] p-[22px] shadow-card" aria-label="YanÄ±lgÄ± teÅŸhisi">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="or-h3">YanÄ±lgÄ± TeÅŸhisi</h3>
        <span
          className="rounded-[9px] px-2.5 py-1 text-[10px] font-bold"
          style={{ background: 'color-mix(in srgb, var(--uyari) 16%, transparent)', color: 'var(--uyari)' }}
        >
          yalnÄ±z Ã¶ÄŸretmen gÃ¶rÃ¼r
        </span>
      </div>
      <div className="space-y-2.5">
        {yanilgilar.slice(0, 5).map((y, i) => (
          <div
            key={`${y.kazanimId}-${i}`}
            className="rounded-[14px] px-3.5 py-3"
            style={{ border: '1px solid color-mix(in srgb, var(--uyari) 25%, transparent)' }}
          >
            <div className="flex items-start justify-between gap-2">
              <b className="min-w-0 text-[12.5px] font-semibold leading-snug" style={{ color: 'var(--metin1)' }}>
                {y.title}
              </b>
              {y.confidence != null && (
                <span className="shrink-0 font-mono text-[10px]" style={{ color: 'var(--metin3)' }}>
                  gÃ¼ven %{Math.round(y.confidence * 100)}
                </span>
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <span className="rounded-[9px] px-2 py-0.5 text-[10px] font-semibold" style={cip('var(--v1)', 'var(--vurgu)')}>
                {y.subject}
              </span>
              {y.taxonomy && (
                <span
                  className="rounded-[9px] px-2 py-0.5 text-[10px] font-semibold"
                  style={cip('color-mix(in srgb, var(--uyari) 15%, transparent)', 'var(--uyari)')}
                >
                  {y.taxonomy}
                </span>
              )}
              {y.selectedOption && (
                <span
                  className="rounded-[9px] px-2 py-0.5 text-[10px] font-semibold"
                  style={cip('color-mix(in srgb, var(--yanlis) 12%, transparent)', 'var(--yanlis)')}
                >
                  sÄ±k seÃ§ilen: {y.selectedOption}
                </span>
              )}
            </div>
            {y.evidence && (
              <p className="mt-1.5 text-[11.5px] leading-relaxed" style={{ color: 'var(--metin2)' }}>
                {y.evidence}
              </p>
            )}
            {y.prereqHypothesis && (
              <p className="mt-1 text-[11px] italic leading-relaxed" style={{ color: 'var(--metin3)' }}>
                Ã–nkoÅŸul hipotezi: {y.prereqHypothesis}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

/* â”€â”€ CEVAP LOGLARI â€” sayfalÄ± gerÃ§ek akÄ±ÅŸ (doÄŸru ÅŸÄ±k uÃ§ta YOK â†’ Ã§izilmez) â”€â”€ */

function SonucRozeti({ isCorrect, isSkipped }: { isCorrect: boolean | null; isSkipped: boolean }) {
  if (isSkipped) {
    return (
      <span className="rounded-[9px] px-2.5 py-0.5 text-[10.5px] font-bold" style={{ background: 'var(--ic)', color: 'var(--metin2)' }}>
        boÅŸ
      </span>
    )
  }
  if (isCorrect == null) return <span style={{ color: 'var(--metin3)' }}>â€”</span>
  const renk = isCorrect ? 'var(--dogru)' : 'var(--yanlis)'
  return (
    <span
      className="rounded-[9px] px-2.5 py-0.5 text-[10.5px] font-bold"
      style={{ background: `color-mix(in srgb, ${renk} 14%, transparent)`, color: renk }}
    >
      {isCorrect ? 'doÄŸru' : 'yanlÄ±ÅŸ'}
    </span>
  )
}

/** Sayfa listesi: ilk Â· aktifÂ±1 Â· son (aralar "â€¦" ile). */
const sayfaListesi = (aktif: number, toplam: number): number[] =>
  [...new Set([0, aktif - 1, aktif, aktif + 1, toplam - 1])]
    .filter((s) => s >= 0 && s < toplam)
    .sort((a, b) => a - b)

function CevapLoglari({ veri, yukleniyor, hata, tekrar, sayfa, onSayfa, kazanimAdi }: {
  veri: OgrenciLoglarYaniti | null
  yukleniyor: boolean
  hata: string | null
  tekrar: () => void
  sayfa: number
  onSayfa: (s: number) => void
  kazanimAdi: (id: number | null) => string | null
}) {
  if (hata) {
    return (
      <section className="glass-solid rounded-[20px] p-[22px] text-center shadow-card">
        <p className="text-[12.5px]" style={{ color: 'var(--metin2)' }}>Cevap kayÄ±tlarÄ± yÃ¼klenemedi: {hata}</p>
        <button className="or-dis mt-3" onClick={tekrar}>Tekrar dene</button>
      </section>
    )
  }
  if (!veri) {
    return yukleniyor ? <div className="glass-solid h-40 animate-pulse rounded-[20px]" /> : null
  }
  if (veri.total === 0) return null // hiÃ§ kayÄ±t yok â†’ panel gizlenir (null â‰  0)

  const toplamSayfa = Math.max(1, Math.ceil(veri.total / veri.limit))
  const sayfalar = sayfaListesi(sayfa, toplamSayfa)

  return (
    <section className="glass-solid rounded-[20px] p-[22px] shadow-card" aria-label="Cevap loglarÄ±">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="or-h3">Cevap LoglarÄ±</h3>
        <span className="font-mono text-[10.5px]" style={{ color: 'var(--metin3)' }}>
          {veri.total} kayÄ±t Â· son {veri.gunAraligi} gÃ¼n Â· sayfa {sayfa + 1}/{toplamSayfa}
        </span>
      </div>
      <div className={yukleniyor ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
        <div className="overflow-x-auto">
          <table className="or-tablo w-full border-collapse">
            <thead>
              <tr>
                {['Tarih', 'KazanÄ±m', 'SonuÃ§', 'SÃ¼re', 'SeÃ§ilen'].map((b) => (
                  <th key={b} className="or-th" scope="col">{b}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {veri.logs.map((l, i) => {
                const ad = kazanimAdi(l.kazanimId) ?? l.subTopic
                return (
                  <tr key={`${l.createdAt}-${i}`}>
                    <td className="or-td whitespace-nowrap">{zamanEtiketi(l.createdAt)}</td>
                    <td className="or-td">
                      {ad
                        ? <b className="font-semibold" style={{ color: 'var(--metin1)' }}>{ad}</b>
                        : <span style={{ color: 'var(--metin3)' }}>â€”</span>}
                      {l.subject && <span> Â· {l.subject}</span>}
                    </td>
                    <td className="or-td"><SonucRozeti isCorrect={l.isCorrect} isSkipped={l.isSkipped} /></td>
                    <td className="or-td whitespace-nowrap">{sureEtiketi(l.durationMs)}</td>
                    {/* UÃ§ta "doÄŸru ÅŸÄ±k" alanÄ± YOK â€” yalnÄ±z Ã¶ÄŸrencinin seÃ§tiÄŸi Ã§izilir */}
                    <td className="or-td">{l.selectedOption ?? 'â€”'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      {toplamSayfa > 1 && (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5" role="navigation" aria-label="Log sayfalarÄ±">
          <button
            type="button"
            className="or-dis !px-2.5 !py-1"
            disabled={sayfa === 0}
            style={sayfa === 0 ? { opacity: 0.35, cursor: 'default' } : undefined}
            onClick={() => onSayfa(Math.max(0, sayfa - 1))}
            aria-label="Ã–nceki sayfa"
          >
            â€¹
          </button>
          {sayfalar.map((s, i) => (
            <span key={s} className="flex items-center gap-1.5">
              {i > 0 && s - sayfalar[i - 1] > 1 && (
                <span className="font-mono text-[10px]" style={{ color: 'var(--metin3)' }}>â€¦</span>
              )}
              <button
                type="button"
                onClick={() => onSayfa(s)}
                aria-current={s === sayfa ? 'page' : undefined}
                className="grid size-[30px] cursor-pointer place-items-center rounded-[10px] border text-[12px] font-semibold transition-colors"
                style={s === sayfa
                  ? { background: 'var(--v1)', color: 'var(--vurgu)', borderColor: 'var(--adacayi)' }
                  : { background: 'transparent', color: 'var(--metin2)', borderColor: 'var(--cam-kenar)' }}
              >
                {s + 1}
              </button>
            </span>
          ))}
          <button
            type="button"
            className="or-dis !px-2.5 !py-1"
            disabled={sayfa >= toplamSayfa - 1}
            style={sayfa >= toplamSayfa - 1 ? { opacity: 0.35, cursor: 'default' } : undefined}
            onClick={() => onSayfa(Math.min(toplamSayfa - 1, sayfa + 1))}
            aria-label="Sonraki sayfa"
          >
            â€º
          </button>
        </div>
      )}
    </section>
  )
}

/* â”€â”€ Ã–DEV GEÃ‡MÄ°ÅÄ° â€” Ã¶ÄŸrenci-bazlÄ± son setler (sunucuda sÃ¼zÃ¼lÃ¼ `sonOdevler`) â”€â”€ */

function OdevGecmisi({ odevler, yukleniyor }: {
  odevler: OgrenciDetayYaniti['sonOdevler']
  yukleniyor: boolean
}) {
  if (!odevler.length) {
    return yukleniyor ? <div className="glass h-28 animate-pulse rounded-[20px]" /> : null
  }
  return (
    <section className="glass rounded-[20px] p-[22px] shadow-card" aria-label="Ã–dev geÃ§miÅŸi">
      <h3 className="or-h3 mb-2">Ã–dev GeÃ§miÅŸi</h3>
      <div>
        {odevler.map((o, i) => {
          const bitti = o.submittedAt != null
          // Soru-bazlÄ± ilerleme (7/10) uÃ§ta YOK â€” yalnÄ±z gerÃ§ek puan Ã§izilir.
          const oran = o.score != null && o.maxScore
            ? `${o.score}/${o.maxScore} Â· %${Math.round((o.score / o.maxScore) * 100)}`
            : null
          return (
            <div
              key={o.id}
              className="flex items-center gap-2.5 py-2.5 text-[12px]"
              style={i > 0 ? { borderTop: '1px solid var(--cizgi)' } : undefined}
            >
              <b className="min-w-0 truncate font-semibold" style={{ color: 'var(--metin1)' }}>{o.title}</b>
              <span
                className="shrink-0 rounded-[9px] px-2 py-0.5 text-[10px] font-semibold"
                style={{ background: 'var(--v1)', color: 'var(--vurgu)' }}
              >
                {o.tur === 'hedefli' ? 'hedefli set' : 'sÄ±nÄ±f Ã¶devi'}
              </span>
              {oran && (
                <span className="shrink-0 font-mono text-[10px]" style={{ color: 'var(--metin3)' }}>{oran}</span>
              )}
              <span
                className="ml-auto shrink-0 rounded-[9px] px-2.5 py-0.5 text-[10.5px] font-bold"
                style={bitti
                  ? { background: 'color-mix(in srgb, var(--dogru) 14%, transparent)', color: 'var(--dogru)' }
                  : { background: 'var(--v1)', color: 'var(--vurgu)' }}
              >
                {bitti ? 'tamamlandÄ±' : 'sÃ¼rÃ¼yor'}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
