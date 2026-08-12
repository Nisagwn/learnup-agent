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

/* ═══════════════════════════════════════════════════════════════════════════
   ÖĞRENCİ RÖNTGENİ — öğretmenin gördüğü, ÖĞRENCİNİN KENDİ EKRANIDIR.
   Onaylı önizleme: docs/design/onizleme/ogrenci-rontgeni.html (2026-07-23).

   Paneller rontgen.tsx'ten AYNEN gelir; fark eylem fiili ("Set gönder") ve
   teşhis dökümünün açık olması. Ekrana özgü GERÇEK-uç panelleri:
   · Cevap Logları — GET /teacher/ogrenci/:id/loglar (sayfalı; yanıtta doğru
     şık alanı YOK → doğru şık GÖSTERİLMEZ, uydurma yasak)
   · Ödev Geçmişi — GET /teacher/ogrenci/:id `sonOdevler` (öğrenci-bazlı,
     sunucuda süzülmüş; soru-bazlı ilerleme uçta yok → yalnız puan çizilir)
   · Trend'e sınıf ortalaması referansı — sınıf sağlayıcısının ZATEN çektiği
     /teacher/ozet trend'inden türetilir (yeni istek yok).
   ═══════════════════════════════════════════════════════════════════════════ */

const GUN_MS = 86_400_000
const LOG_LIMIT = 20

/**
 * GÜN ANAHTARI — ÖĞRENCİNİN SAATİ (Europe/Istanbul), tarayıcının değil.
 *
 * Bu ekrandaki günler sunucudan `lib/rontgen.ts:175` ile üretiliyor ve o dosya anahtarı
 * AÇIKÇA 'Europe/Istanbul' ile kuruyor. İstemci tarafında tarayıcı yereli kullanmak, iki
 * ucu farklı takvimlere bağlıyordu: yurt dışındaki (ya da saati kaymış cihazdaki) bir
 * öğretmende "bugün" bir gün öteleniyor, kıvılcım çizgisi trend verisiyle hizasını
 * kaybediyor ve "bu hafta N soru" yanlış pencereden toplanıyordu.
 *
 * 'en-CA' biçimi YYYY-MM-DD verir — uçtan gelen `trend[].date` ile aynı biçim.
 */
const TR = 'Europe/Istanbul'
const gunAnahtari = (t: number | Date): string =>
  new Date(t).toLocaleDateString('en-CA', { timeZone: TR })

/** Tarih-YALNIZ dizgiler için gün farkı (UTC kayması yemesin). */
// ⚠️ Math.max(0, …): öğlen çıpası, saat 12:00'den önce BUGÜNÜN farkını -1 yapıyordu ve
// `f >= 0` koşullu pencereler bugünü tamamen düşürüyordu ("bu hafta N soru" öğleden önce
// eksik gösteriyordu). Harita.tsx'te aynı hata, aynı çare.
const gunF = (isoGun: string): number =>
  Math.max(0, Math.floor((Date.now() - +new Date(isoGun + 'T12:00:00+03:00')) / GUN_MS))

/** ISO zaman → "bugün 14:20" · "dün 19:41" · "19 Tem 14:20". */
const zamanEtiketi = (iso: string): string => {
  const d = new Date(iso)
  if (Number.isNaN(+d)) return iso
  const saat = d.toLocaleTimeString('tr-TR', { timeZone: TR, hour: '2-digit', minute: '2-digit' })
  const key = gunAnahtari(d)
  const bugun = gunAnahtari(Date.now())
  const dun = gunAnahtari(Date.now() - GUN_MS)
  if (key === bugun) return `bugün ${saat}`
  if (key === dun) return `dün ${saat}`
  return `${gunEtiketi(key)} ${saat}`
}

/** ms → "58 sn" · "1 dk 42 sn" · yoksa "—". */
const sureEtiketi = (ms: number | null): string => {
  if (ms == null || ms <= 0) return '—'
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
    (signal) => tGet(`/teacher/ogrenci/${ogrenciId}/rontgen`, {}, { signal }),
    [ogrenciId],
  )
  const konular = useAsync<{ subjects: Array<{ subject: string; topics: Konu[] }> }>(
    (signal) => apiGet('/questions/ai/topics', {}, { signal }),
    [],
  )
  // Ödev geçmişi: öğrenci-bazlı `sonOdevler` bu uçta SUNUCUDA süzülü döner.
  const detay = useAsync<OgrenciDetayYaniti>(
    (signal) => tGet(`/teacher/ogrenci/${ogrenciId}`, {}, { signal }),
    [ogrenciId],
  )
  const [logSayfa, setLogSayfa] = useState(0)
  useEffect(() => { setLogSayfa(0) }, [ogrenciId])
  // ⚠️ SORGU DİZİSİ YOLA GÖMÜLMEZ — parametreler ikinci argümandan geçer.
  // Eskiden yol zaten `?limit=…&offset=…` içeriyordu; `tGet` ise yönetici vekil kapsamını
  // (`ogretmenId`) sorgu parametresi olarak EKLİYOR ve `apiGet` yolun sonuna `?${qs}`
  // yapıştırıyordu. Üretilen URL `…/loglar?limit=20&offset=0?ogretmenId=<uuid>` oluyordu:
  // `ogretmenId` ayrı bir parametre olarak parse edilmiyor (offset'in İÇİNE gömülüyor),
  // `requireOgretmenKapsami` yöneticide kapsam bulamıyor → 403 ogretmen_secilmedi.
  // Ekranın diğer panelleri düz `tGet(yol, {})` kullandığı için çalışıyor, yalnız "Cevap
  // Logları" paneli "yüklenemedi" diyordu — üstelik yalnız YÖNETİCİDE (öğretmende kapsam
  // null olduğu için hata görünmüyordu). Ayrıca offset NaN oluyordu.
  const loglar = useAsync<OgrenciLoglarYaniti>(
    (signal) => tGet(`/teacher/ogrenci/${ogrenciId}/loglar`, { limit: LOG_LIMIT, offset: logSayfa * LOG_LIMIT }, { signal }),
    [ogrenciId, logSayfa],
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
      // Anahtar TSİ ile kurulur — `trend[].date` da öyle üretiliyor (lib/rontgen.ts).
      dizi.push(map.get(gunAnahtari(Date.now() - i * GUN_MS)) ?? 0)
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

  // Sınıf doğruluk ortalaması — sağlayıcının zaten çektiği /teacher/ozet trend'i
  // (⚠️ 84 GÜNLÜK pencere; yorum eskiden "30 günlük" diyordu ve uçla uyuşmuyordu:
  // teacher.routes.ts trendi 84 günden kuruyor. Sayı doğru hesaplanıyordu ama grafikteki
  // referans çizgisinin NE olduğunu okuyan kişi yanlış öğreniyordu.)
  // Veri yoksa null → referans çizgisi hiç çizilmez.
  const sinifOrt = useMemo(() => {
    let s = 0, c = 0
    for (const g of ozet?.trend ?? []) { s += g.solved; c += g.correct }
    return s ? (c / s) * 100 : null
  }, [ozet])

  // Müfredat toplamları — matristeki kesikli "ölçüm yok" hücreleri
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

  // Log tablosunda kazanım adı: rontgen düğümlerinden GERÇEK başlık eşlemesi
  const kazanimAdlari = useMemo(() => new Map(nodes.map((n) => [n.kazanimId, n.title])), [nodes])
  const kazanimAdi = useCallback(
    (id: number | null): string | null => (id == null ? null : kazanimAdlari.get(id) ?? null),
    [kazanimAdlari],
  )

  /** Öğrencide "Çöz" /coz'e giderdi; öğretmende atölyeye ÖN-DOLU gider. */
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
          {buHafta > 0 && <span>· bu hafta {buHafta} soru</span>}
        </>
      }
      sag={
        <>
          <span className="hidden text-[10.5px] xl:inline" style={{ color: 'var(--metin3)' }}>
            ← → öğrenciler arasında gezinir · Esc panoya döner
          </span>
          <OgrenciGezinme
            onOnceki={onceki ? () => git(onceki) : null}
            onSonraki={sonraki ? () => git(sonraki) : null}
          />
          {/* Ekranın TEK birincil eylemi — boş durumda oradaki CTA devralır */}
          {ctaGoster && (
            <button className="or-cta" onClick={() => nav(`/sinif/odev?ogrenci=${ogrenciId}`)}>
              Hedefli ödev gönder
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
          <p className="text-sm" style={{ color: 'var(--metin2)' }}>Öğrenci verisi yüklenemedi: {rontgen.error}</p>
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
              Bu öğrenci için henüz ölçüm yok
            </h2>
            <p className="mx-auto mt-2 max-w-sm text-[13.5px] leading-relaxed" style={{ color: 'var(--metin2)' }}>
              Harita, öğrenci soru çözdükçe belirir: her cevap, kazanım başına ustalık
              ölçümünü günceller. Bir tanışma seti yeterli.
            </p>
            <button className="or-cta mt-6" onClick={() => nav(`/sinif/odev?ogrenci=${ogrenciId}`)}>
              Tanışma seti gönder
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

      {/* ── 4 stat şeridi — türetimler Harita ile birebir ── */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Reveal delay={0.04}>
          <section className="glass flex items-center gap-3.5 rounded-[20px] p-4 shadow-card" aria-label="Genel ustalık">
            <Halka oran={genelUstalik} boyut={64} kalinlik={7} renk="var(--yaprak)">
              <span className="text-[13px] font-extrabold" style={{ color: 'var(--metin1)', fontFamily: 'Outfit, sans-serif' }}>
                %<CanliSayi value={Math.round(genelUstalik * 100)} />
              </span>
            </Halka>
            <div className="min-w-0">
              <div className="or-etiket">Genel Ustalık</div>
              <div className="or-alt">çürüme uygulanmış · {nodes.length} kazanım</div>
            </div>
          </section>
        </Reveal>

        <Reveal delay={0.08}>
          <section className="glass flex items-center rounded-[20px] p-4 shadow-card" aria-label="Kapsama">
            <div className="min-w-0">
              <div className="or-deger"><CanliSayi value={nodes.length} /></div>
              <div className="or-etiket">Kapsama</div>
              {toplamKazanim > 0 && <div className="or-alt">{toplamKazanim} müfredat kazanımı içinden</div>}
            </div>
          </section>
        </Reveal>

        <Reveal delay={0.12}>
          <section className="glass flex items-center gap-3 rounded-[20px] p-4 shadow-card" aria-label="7 gün doğruluk">
            <div className="min-w-0 flex-1">
              <div className="or-deger">
                {dogruluk.son == null
                  ? <span style={{ color: 'var(--metin3)' }}>—</span>
                  : <>%<CanliSayi value={dogruluk.son} /></>}
                {dogruluk.delta != null && dogruluk.delta !== 0 && (
                  <span
                    className="ml-1.5 align-[3px] text-[12px] font-bold"
                    style={{ color: dogruluk.delta > 0 ? 'var(--dogru)' : 'var(--uyari)' }}
                  >
                    {dogruluk.delta > 0 ? '▲' : '▼'}{Math.abs(dogruluk.delta)}
                  </span>
                )}
              </div>
              <div className="or-etiket">7 Gün Doğruluk</div>
              <div className="or-alt">{dogruluk.n7} soru · önceki 7 güne göre</div>
            </div>
            <Sparkline veri={kivilcim} genislik={64} yukseklik={22} />
          </section>
        </Reveal>

        <Reveal delay={0.16}>
          <section className="glass flex items-center rounded-[20px] p-4 shadow-card" aria-label="Açık yanılgı">
            <div className="min-w-0">
              <div className="or-deger"><CanliSayi value={yanilgilar.length} /></div>
              <div className="or-etiket">Açık Yanılgı</div>
              <div className="or-alt">{zayiflar.length} kazanım öncelikli</div>
            </div>
          </section>
        </Reveal>
      </div>

      {/* ── Ana ızgara ── */}
      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
        {/* SOL */}
        <div className="min-w-0 space-y-4">
          <Reveal delay={0.1}>
            <UstalikMatrisi
              gruplar={gruplar}
              havuzda={havuzda}
              calisEtiketi="Set gönder"
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

        {/* SAĞ */}
        <div className="min-w-0 space-y-4">
          <Reveal delay={0.1}>
            <OncelikRadari
              zayiflar={zayiflar}
              kesfedilmemis={kesfedilmemis}
              calisEtiketi="Set gönder"
              onCalis={setGonder}
              onKesfet={setGonder}
            />
          </Reveal>
          {/* TEŞHİS DÖKÜMÜ — yalnız öğretmende. Öğrenci ucu bu alanı hiç döndürmez
              (persona TESHIS_DILI_YOK: teşhis öğrenciye METİN olarak gösterilmez). */}
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

/* ── Ekran stilleri — FİDAN (007 inline deseni) ── */

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

/* ── YANILGI TEŞHİSİ — yalnız öğretmen görür (uyarı tonu; kehribar RAFTA) ── */

function YanilgiTeshisi({ yanilgilar }: { yanilgilar: YanilgiAyrinti[] }) {
  const cip = (bg: string, renk: string): CSSProperties => ({ background: bg, color: renk })
  return (
    <section className="glass rounded-[20px] p-[22px] shadow-card" aria-label="Yanılgı teşhisi">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="or-h3">Yanılgı Teşhisi</h3>
        <span
          className="rounded-[9px] px-2.5 py-1 text-[10px] font-bold"
          style={{ background: 'color-mix(in srgb, var(--uyari) 16%, transparent)', color: 'var(--uyari)' }}
        >
          yalnız öğretmen görür
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
                  güven %{Math.round(y.confidence * 100)}
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
                  sık seçilen: {y.selectedOption}
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
                Önkoşul hipotezi: {y.prereqHypothesis}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

/* ── CEVAP LOGLARI — sayfalı gerçek akış (doğru şık uçta YOK → çizilmez) ── */

function SonucRozeti({ isCorrect, isSkipped }: { isCorrect: boolean | null; isSkipped: boolean }) {
  if (isSkipped) {
    return (
      <span className="rounded-[9px] px-2.5 py-0.5 text-[10.5px] font-bold" style={{ background: 'var(--ic)', color: 'var(--metin2)' }}>
        boş
      </span>
    )
  }
  if (isCorrect == null) return <span style={{ color: 'var(--metin3)' }}>—</span>
  const renk = isCorrect ? 'var(--dogru)' : 'var(--yanlis)'
  return (
    <span
      className="rounded-[9px] px-2.5 py-0.5 text-[10.5px] font-bold"
      style={{ background: `color-mix(in srgb, ${renk} 14%, transparent)`, color: renk }}
    >
      {isCorrect ? 'doğru' : 'yanlış'}
    </span>
  )
}

/** Sayfa listesi: ilk · aktif±1 · son (aralar "…" ile). */
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
        <p className="text-[12.5px]" style={{ color: 'var(--metin2)' }}>Cevap kayıtları yüklenemedi: {hata}</p>
        <button className="or-dis mt-3" onClick={tekrar}>Tekrar dene</button>
      </section>
    )
  }
  if (!veri) {
    return yukleniyor ? <div className="glass-solid h-40 animate-pulse rounded-[20px]" /> : null
  }
  if (veri.total === 0) return null // hiç kayıt yok → panel gizlenir (null ≠ 0)

  const toplamSayfa = Math.max(1, Math.ceil(veri.total / veri.limit))
  const sayfalar = sayfaListesi(sayfa, toplamSayfa)

  return (
    <section className="glass-solid rounded-[20px] p-[22px] shadow-card" aria-label="Cevap logları">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="or-h3">Cevap Logları</h3>
        <span className="font-mono text-[10.5px]" style={{ color: 'var(--metin3)' }}>
          {veri.total} kayıt · son {veri.gunAraligi} gün · sayfa {sayfa + 1}/{toplamSayfa}
        </span>
      </div>
      <div className={yukleniyor ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
        <div className="overflow-x-auto">
          <table className="or-tablo w-full border-collapse">
            <thead>
              <tr>
                {['Tarih', 'Kazanım', 'Sonuç', 'Süre', 'Seçilen'].map((b) => (
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
                        : <span style={{ color: 'var(--metin3)' }}>—</span>}
                      {l.subject && <span> · {l.subject}</span>}
                    </td>
                    <td className="or-td"><SonucRozeti isCorrect={l.isCorrect} isSkipped={l.isSkipped} /></td>
                    <td className="or-td whitespace-nowrap">{sureEtiketi(l.durationMs)}</td>
                    {/* Uçta "doğru şık" alanı YOK — yalnız öğrencinin seçtiği çizilir */}
                    <td className="or-td">{l.selectedOption ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      {toplamSayfa > 1 && (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5" role="navigation" aria-label="Log sayfaları">
          <button
            type="button"
            className="or-dis !px-2.5 !py-1"
            disabled={sayfa === 0}
            style={sayfa === 0 ? { opacity: 0.35, cursor: 'default' } : undefined}
            onClick={() => onSayfa(Math.max(0, sayfa - 1))}
            aria-label="Önceki sayfa"
          >
            ‹
          </button>
          {sayfalar.map((s, i) => (
            <span key={s} className="flex items-center gap-1.5">
              {i > 0 && s - sayfalar[i - 1] > 1 && (
                <span className="font-mono text-[10px]" style={{ color: 'var(--metin3)' }}>…</span>
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
            ›
          </button>
        </div>
      )}
    </section>
  )
}

/* ── ÖDEV GEÇMİŞİ — öğrenci-bazlı son setler (sunucuda süzülü `sonOdevler`) ── */

function OdevGecmisi({ odevler, yukleniyor }: {
  odevler: OgrenciDetayYaniti['sonOdevler']
  yukleniyor: boolean
}) {
  if (!odevler.length) {
    return yukleniyor ? <div className="glass h-28 animate-pulse rounded-[20px]" /> : null
  }
  return (
    <section className="glass rounded-[20px] p-[22px] shadow-card" aria-label="Ödev geçmişi">
      <h3 className="or-h3 mb-2">Ödev Geçmişi</h3>
      <div>
        {odevler.map((o, i) => {
          const bitti = o.submittedAt != null
          // Soru-bazlı ilerleme (7/10) uçta YOK — yalnız gerçek puan çizilir.
          const oran = o.score != null && o.maxScore
            ? `${o.score}/${o.maxScore} · %${Math.round((o.score / o.maxScore) * 100)}`
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
                {o.tur === 'hedefli' ? 'hedefli set' : 'sınıf ödevi'}
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
                {bitti ? 'tamamlandı' : 'sürüyor'}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
