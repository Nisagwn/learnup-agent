import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Drawer } from 'vaul'
import { toast } from 'sonner'
import { Icon } from '../ui'
import { cn } from '../lib/cn'
import { useTheme } from '../lib/theme'
import { useAsync } from '../lib/useAsync'
import { apiGet, apiPost } from '../lib/api.js'
import { itemAdi, NADIRLIK, TUM_AGACLAR } from '../lib/katalog'
import type { BahceYaniti } from '../lib/types'
import { Skeleton } from '../components/ui'
import { Reveal } from '../components/fx'
import { Sayi } from '../components/cekirdek'

// three yalnız bu chunk zincirinde — kabuk bundle'ına girmez
const Bahce3D = lazy(() => import('../components/Bahce3D'))

/* ═══════════════════════════════════════════════════════════════════════════
   BAHÇEM — coin ekonomisinin 3D sahnesi (FİDAN v1.2 — onaylı önizleme:
   docs/design/onizleme/bahcem.html, GOREV-024).
   Tüm yazma işlemleri MEVCUT atomik RPC uçları: /garden/purchase · /plant ·
   /move · /remove. Fiyat/kilit OTORİTESİ sunucuda (catalog GET ile gelir);
   arayüz fiyat hesaplamaz.
   Akış: envanterden "Dik" → yerleştirme modu → zemine tıkla → plant.
         bitkiye tıkla → panel (Taşı → zemine tıkla → move · Sök → onay
         diyaloğu → remove). WebGL yoksa: 2D yedek (işlev aynı, sahne düz).
   Tek birincil eylem: seçili market ürünündeki "Satın al"; boş bahçede
   (market seçimi yokken) "Markete göz at".
   ═══════════════════════════════════════════════════════════════════════════ */

function webglVarMi(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch { return false }
}

type Mod =
  | { tip: 'bos' }
  | { tip: 'dik'; itemId: string }
  | { tip: 'tasi'; plantId: string }

type KatalogUrun = BahceYaniti['catalog'][number]

/** İçerik görseli — Bahçem metafor-serbest bölge (EKRAN-HARITASI §8). */
function urunGorsel(itemId: string): string {
  if (itemId.endsWith('_seed')) return '🌱'
  if (itemId.endsWith('_mature')) return '🌳'
  if (itemId.startsWith('decor_mushroom')) return '🍄'
  if (itemId.startsWith('decor_idol')) return '🗿'
  if (itemId.startsWith('decor_gazebo')) return '🛖'
  if (itemId.startsWith('special_ent')) return '🌲'
  return '🪴'
}

/** Nadirlik rozeti FİDAN renkleri — KELİME katalog aynasından (NADIRLIK) gelir. */
const NADIR_STIL: Record<string, CSSProperties> = {
  common: { background: 'var(--v1)', color: 'var(--metin2)' },
  uncommon: { background: 'var(--v2)', color: 'var(--metin2)' },
  rare: { background: 'color-mix(in srgb, var(--yaprak) 16%, transparent)', color: 'var(--vurgu)' },
  epic: { background: 'color-mix(in srgb, var(--bilgi) 20%, transparent)', color: 'var(--bilgi)' },
  legendary: {
    background: 'color-mix(in srgb, var(--toprak) 22%, transparent)',
    color: 'color-mix(in srgb, var(--toprak) 55%, var(--metin1))',
  },
}

function NadirRozet({ rarity }: { rarity: string }) {
  const n = NADIRLIK[rarity]
  if (!n) return null
  return (
    <span className="bh-nadir" style={NADIR_STIL[rarity] ?? NADIR_STIL.common}>{n.ad}</span>
  )
}

export function Bahce() {
  const { theme } = useTheme()
  const bahce = useAsync<BahceYaniti>(() => apiGet('/garden'), [])
  const [mod, setMod] = useState<Mod>({ tip: 'bos' })
  const [secili, setSecili] = useState<string | null>(null)          // sahnedeki bitki
  const [seciliUrun, setSeciliUrun] = useState<string | null>(null)  // markette seçili ürün
  const [envanterAcik, setEnvanterAcik] = useState(false)            // mobil çekmece
  const [sokOnay, setSokOnay] = useState(false)                      // sök onay diyaloğu
  const [mesgul, setMesgul] = useState(false)
  const webgl = useMemo(webglVarMi, [])
  const sahneRef = useRef<HTMLDivElement>(null)
  const marketRef = useRef<HTMLElement>(null)

  const veri = bahce.data
  const katalogMap = useMemo(
    () => new Map((veri?.catalog ?? []).map((c) => [c.itemId, c])),
    [veri?.catalog],
  )
  const envanterMap = useMemo(
    () => new Map((veri?.inventory ?? []).map((i) => [i.item_id, i.count])),
    [veri?.inventory],
  )
  const seciliBitki = veri?.plants.find((p) => p.id === secili) ?? null
  const seciliBitkiNadirlik = seciliBitki ? katalogMap.get(seciliBitki.item_id)?.rarity ?? null : null

  // Koleksiyon: envanterde ya da bahçede görülen ağaç türleri
  const koleksiyon = useMemo(() => {
    const sahip = new Set<string>()
    for (const p of veri?.plants ?? []) {
      const tur = p.item_id.replace(/_(seed|mature)$/, '')
      if ((TUM_AGACLAR as string[]).includes(tur)) sahip.add(tur)
    }
    for (const i of veri?.inventory ?? []) {
      const tur = i.item_id.replace(/_(seed|mature)$/, '')
      if ((TUM_AGACLAR as string[]).includes(tur)) sahip.add(tur)
    }
    return sahip
  }, [veri])

  // Yerleştirme modu: ESC iptal (önizleme davranışı)
  useEffect(() => {
    if (mod.tip === 'bos') return
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') setMod({ tip: 'bos' }) }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [mod.tip])

  const yumusakKaydir = (el: Element | null) => {
    const azalt = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    el?.scrollIntoView({ behavior: azalt ? 'auto' : 'smooth', block: 'nearest' })
  }

  /* ── Eylemler (atomik RPC uçları — fiyat/kilit sunucuda) ── */

  const satinAl = async (itemId: string) => {
    if (mesgul) return
    setMesgul(true)
    try {
      const r = await apiPost('/garden/purchase', { itemId })
      toast.success(`${itemAdi(itemId)} alındı`, { description: `Kalan coin: ${r?.coins ?? '—'}` })
      setSeciliUrun(null)
      bahce.reload()
    } catch (e: any) {
      toast.error('Satın alınamadı', { description: e?.message })
    } finally { setMesgul(false) }
  }

  const dikBasla = (itemId: string) => {
    setSecili(null)
    setEnvanterAcik(false)
    setMod({ tip: 'dik', itemId })
    yumusakKaydir(sahneRef.current)
  }

  const zeminTikla = async (p: { x: number; y: number }) => {
    if (mesgul) return
    if (mod.tip === 'dik') {
      setMesgul(true)
      try {
        await apiPost('/garden/plant', { itemId: mod.itemId, x: p.x, y: p.y })
        toast.success(`${itemAdi(mod.itemId)} dikildi`)
        setMod({ tip: 'bos' })
        bahce.reload()
      } catch (e: any) {
        toast.error('Dikilemedi', { description: e?.message })
      } finally { setMesgul(false) }
    } else if (mod.tip === 'tasi') {
      setMesgul(true)
      try {
        await apiPost('/garden/move', { plantId: mod.plantId, x: p.x, y: p.y })
        setMod({ tip: 'bos' })
        setSecili(null)
        bahce.reload()
      } catch (e: any) {
        toast.error('Taşınamadı', { description: e?.message })
      } finally { setMesgul(false) }
    }
  }

  const sok = async (plantId: string) => {
    if (mesgul) return
    setMesgul(true)
    try {
      const r = await apiPost('/garden/remove', { plantId })
      toast.success('Söküldü', { description: `${itemAdi(String(r?.returnedItemId ?? ''))} envantere döndü` })
      setSecili(null)
      bahce.reload()
    } catch (e: any) {
      toast.error('Sökülemedi', { description: e?.message })
    } finally {
      setSokOnay(false)
      setMesgul(false)
    }
  }

  const bahceBos = (veri?.plants.length ?? 0) === 0

  return (
    <div className="mx-auto max-w-[1152px] px-[clamp(16px,3.5vw,44px)] pb-20 pt-9">
      <style>{`
        /* Ambiyans yaprak katmanı bu ekranda KAPALI — sahne zaten doğa (GOREV-024). */
        .amb-yprk { display: none !important; }

        .bh-kart { background: var(--cam); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
          border: 1px solid var(--cam-kenar); border-radius: 20px; box-shadow: var(--golge); position: relative; }
        .bh-mat { background: var(--mat); border: 1px solid var(--cam-kenar); border-radius: 20px; box-shadow: var(--golge); }
        .bh-mono { font-family: 'JetBrains Mono', monospace; font-size: 10.5px; letter-spacing: .08em;
          text-transform: uppercase; color: var(--metin3); font-weight: 500; }
        .bh-h2 { font-family: Outfit, sans-serif; font-weight: 700; font-size: 17px; color: var(--metin1); }
        .bh-cip { display: inline-flex; align-items: center; gap: 6px; padding: 6px 13px; border-radius: 12px;
          font-size: 12.5px; font-weight: 600; background: var(--cam); border: 1px solid var(--cam-kenar); color: var(--metin2); }
        .bh-cip.coin { background: color-mix(in srgb, var(--toprak) 20%, transparent); border-color: transparent;
          color: color-mix(in srgb, var(--toprak) 60%, var(--metin1)); }
        .bh-cta { border: none; cursor: pointer; border-radius: 12px; padding: 9px 16px; font-family: Inter, sans-serif;
          font-weight: 600; font-size: 13px; display: inline-flex; align-items: center; gap: 7px;
          background: var(--cta); color: #fff; transition: box-shadow .2s, transform .15s; }
        .bh-cta:hover { box-shadow: var(--parilti); transform: translateY(-1px); }
        .bh-cta:active { transform: scale(.98); }
        .bh-cta:disabled { opacity: .55; cursor: not-allowed; transform: none; box-shadow: none; }
        .bh-soluk { cursor: pointer; border-radius: 12px; padding: 8px 14px; font-family: Inter, sans-serif;
          font-weight: 600; font-size: 12.5px; background: var(--v0); color: var(--metin2);
          border: 1px solid var(--cam-kenar); transition: color .15s, border-color .15s, background .15s; }
        .bh-soluk:hover { color: var(--metin1); border-color: var(--adacayi); }
        .bh-soluk:disabled { opacity: .55; cursor: not-allowed; color: var(--metin3); border-color: var(--cam-kenar); }
        .bh-soluk.tehlike { color: var(--yanlis); }
        .bh-soluk.tehlike:hover { border-color: color-mix(in srgb, var(--yanlis) 45%, transparent);
          background: color-mix(in srgb, var(--yanlis) 8%, transparent); }
        .bh-soluk.kucuk { padding: 5px 12px; font-size: 11px; }
        .bh-urun { display: flex; align-items: center; gap: 11px; padding: 11px 12px; border: 1.5px solid var(--cam-kenar);
          border-radius: 14px; background: var(--mat); transition: border-color .2s, box-shadow .2s; cursor: pointer; }
        .bh-urun:hover { border-color: var(--adacayi); }
        .bh-urun.secili { border-color: var(--yaprak); box-shadow: 0 6px 18px color-mix(in srgb, var(--yaprak) 15%, transparent); }
        .bh-nadir { font-size: 10.5px; font-weight: 700; padding: 2.5px 9px; border-radius: 10px; white-space: nowrap; }
        .bh-fiyat { font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 500;
          display: inline-flex; align-items: center; gap: 4px;
          color: color-mix(in srgb, var(--toprak) 60%, var(--metin1)); }
        .bh-sahip { font-size: 11.5px; font-weight: 700; color: var(--vurgu); white-space: nowrap; }
        .bh-mod { position: absolute; top: 14px; left: 50%; transform: translateX(-50%); z-index: 10;
          background: var(--cam); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
          border: 1px solid var(--adacayi); border-radius: 12px; padding: 8px 14px; font-size: 12px; font-weight: 600;
          color: var(--vurgu); display: flex; gap: 9px; align-items: center; white-space: nowrap; max-width: calc(100% - 24px); }
        .bh-nokta { width: 8px; height: 8px; border-radius: 50%; background: var(--yaprak); flex: none; }
        @media (prefers-reduced-motion: no-preference) {
          .bh-nokta { animation: bh-nbz 1.4s ease-in-out infinite; }
          @keyframes bh-nbz { 0%, 100% { opacity: .4 } 50% { opacity: 1 } }
        }
        .bh-panel { position: absolute; right: 14px; bottom: 14px; z-index: 10; width: 216px;
          background: var(--cam); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
          border: 1px solid var(--cam-kenar); border-radius: 16px; padding: 13px 15px; box-shadow: var(--golge); }
        .bh-env-kutu { width: 108px; background: var(--v0); border: 1px solid var(--cam-kenar); border-radius: 14px;
          padding: 12px 10px; text-align: center; transition: border-color .2s, transform .2s; }
        .bh-env-kutu:hover { border-color: var(--adacayi); }
        @media (prefers-reduced-motion: no-preference) { .bh-env-kutu:hover { transform: translateY(-2px); } }
      `}</style>

      {/* ── Üst şerit: başlık · coin çipi · koleksiyon sayacı ── */}
      <Reveal>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-[26px] font-extrabold tracking-tight" style={{ color: 'var(--metin1)' }}>
            Bahçem
          </h1>
          {veri && (
            <>
              <span className="bh-cip coin">
                <Icon name="coin" size={15} color="currentColor" />
                <Sayi value={veri.coins} /> coin
              </span>
              <span className="bh-cip">🌳 Koleksiyon {koleksiyon.size}/{TUM_AGACLAR.length} tür</span>
            </>
          )}
          <span className="bh-mono ml-auto hidden md:block">Soru çöz → coin kazan → bahçeni büyüt</span>
        </div>
      </Reveal>

      {bahce.loading ? (
        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
          <Skeleton className="h-[420px]" />
          <Skeleton className="h-[420px]" />
        </div>
      ) : bahce.error ? (
        <div className="bh-kart mt-5 px-6 py-8 text-center text-sm" style={{ color: 'var(--metin2)' }}>
          Bahçe yüklenemedi: {bahce.error}
          <div className="mt-3"><button className="bh-soluk" onClick={() => bahce.reload()}>Tekrar dene</button></div>
        </div>
      ) : (
        <>
          <div className="mt-5 grid items-start gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
            {/* ════════ SAHNE ════════ */}
            <Reveal delay={0.06}>
              <section ref={sahneRef} aria-label="Bahçe sahnesi" className="bh-kart overflow-hidden" style={{ padding: 0 }}>
                {/* Yerleştirme modu şeridi — nabızlı nokta motion-safe */}
                {mod.tip !== 'bos' && (
                  <div className="bh-mod">
                    <span className="bh-nokta" aria-hidden />
                    <span className="truncate">
                      {mod.tip === 'dik'
                        ? `Yerleştirme modu — ${itemAdi(mod.itemId)} için zemine tıkla · ESC iptal`
                        : 'Taşıma modu — yeni konum için zemine tıkla · ESC iptal'}
                    </span>
                    <button
                      onClick={() => setMod({ tip: 'bos' })}
                      className="cursor-pointer font-display text-[12px] font-bold underline-offset-2 hover:underline"
                      style={{ color: 'var(--vurgu)' }}
                    >
                      Vazgeç
                    </button>
                  </div>
                )}

                {webgl ? (
                  <div className="h-[360px] sm:h-[440px]">
                    <Suspense fallback={
                      <div className="grid h-full place-items-center">
                        <div
                          className="size-9 rounded-full border-[3px] motion-safe:animate-spin"
                          style={{ borderColor: 'color-mix(in srgb, var(--yaprak) 22%, transparent)', borderTopColor: 'var(--yaprak)' }}
                        />
                      </div>
                    }>
                      <Bahce3D
                        koyu={theme === 'dark'}
                        bitkiler={veri?.plants ?? []}
                        seciliId={secili}
                        yerlesimModu={mod.tip !== 'bos'}
                        onBitkiTikla={(id) => { if (mod.tip === 'bos') setSecili(secili === id ? null : id) }}
                        onZeminTikla={zeminTikla}
                      />
                    </Suspense>
                  </div>
                ) : (
                  <DuzBahce
                    bitkiler={veri?.plants ?? []}
                    seciliId={secili}
                    yerlesimModu={mod.tip !== 'bos'}
                    onTikla={(id) => { if (mod.tip === 'bos') setSecili(secili === id ? null : id) }}
                    onZemin={zeminTikla}
                  />
                )}

                {/* Seçili bitki paneli — Sök = onay diyaloğu (yıkıcı eylem) */}
                {seciliBitki && mod.tip === 'bos' && (
                  <div className="bh-panel">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="flex flex-wrap items-center gap-1.5 font-display text-[14px] font-semibold" style={{ color: 'var(--metin1)' }}>
                        <span aria-hidden>{urunGorsel(seciliBitki.item_id)}</span>
                        {itemAdi(seciliBitki.item_id)}
                        {seciliBitkiNadirlik && <NadirRozet rarity={seciliBitkiNadirlik} />}
                      </h3>
                      <button
                        onClick={() => setSecili(null)}
                        className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-md"
                        style={{ color: 'var(--metin3)' }}
                        aria-label="Paneli kapat"
                      >
                        <Icon name="close" size={13} color="currentColor" />
                      </button>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button className="bh-soluk" onClick={() => setMod({ tip: 'tasi', plantId: seciliBitki.id })}>
                        ↔ Taşı
                      </button>
                      <Dialog.Root open={sokOnay} onOpenChange={setSokOnay}>
                        <Dialog.Trigger asChild>
                          <button className="bh-soluk tehlike">Sök</button>
                        </Dialog.Trigger>
                        <Dialog.Portal>
                          <Dialog.Overlay className="fixed inset-0 z-[85] backdrop-blur-sm" style={{ background: 'rgba(12, 18, 14, 0.5)' }} />
                          <Dialog.Content className="bh-kart fixed left-1/2 top-1/2 z-[86] w-[min(92vw,380px)] -translate-x-1/2 -translate-y-1/2 p-6" style={{ borderRadius: 24 }}>
                            <Dialog.Title className="font-display text-[16px] font-bold" style={{ color: 'var(--metin1)' }}>
                              {itemAdi(seciliBitki.item_id)} sökülsün mü?
                            </Dialog.Title>
                            <Dialog.Description className="mt-2 text-[13px] leading-relaxed" style={{ color: 'var(--metin2)' }}>
                              Bitki bahçeden kaldırılır ve envanterine geri döner — istediğin zaman yeniden dikebilirsin.
                            </Dialog.Description>
                            <div className="mt-5 flex justify-end gap-2.5">
                              <Dialog.Close asChild>
                                <button className="bh-soluk">Vazgeç</button>
                              </Dialog.Close>
                              <button
                                disabled={mesgul}
                                onClick={() => sok(seciliBitki.id)}
                                className="cursor-pointer rounded-xl px-4 py-2 font-display text-[13px] font-bold text-white transition-opacity disabled:opacity-50"
                                style={{ background: 'var(--yanlis)' }}
                              >
                                {mesgul ? 'Sökülüyor…' : 'Evet, sök'}
                              </button>
                            </div>
                          </Dialog.Content>
                        </Dialog.Portal>
                      </Dialog.Root>
                    </div>
                  </div>
                )}

                {/* Boş bahçe — samimi metin + (market seçimi yokken) tek birincil CTA */}
                {bahceBos && mod.tip === 'bos' && (
                  <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center px-4">
                    <div className="bh-kart pointer-events-auto max-w-[300px] px-6 py-5 text-center">
                      <span aria-hidden className="block text-[34px] leading-none">🌱</span>
                      <h3 className="mt-2 font-display text-[16px] font-bold" style={{ color: 'var(--metin1)' }}>
                        Bahçen seni bekliyor
                      </h3>
                      <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: 'var(--metin2)' }}>
                        Soru çözdükçe coin kazanırsın; ilk fidanını marketten alıp buraya dikersin.
                      </p>
                      <button
                        className={seciliUrun == null ? 'bh-cta mt-3.5' : 'bh-soluk mt-3.5'}
                        onClick={() => yumusakKaydir(marketRef.current)}
                      >
                        Markete göz at
                      </button>
                    </div>
                  </div>
                )}
              </section>
            </Reveal>

            {/* ════════ MARKET — kaydırılan yoğun liste → mat ikiz ════════ */}
            <Reveal delay={0.12}>
              <section ref={marketRef} aria-label="Market" className="bh-mat px-5 py-4">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="bh-h2">Market</h2>
                  <span className="bh-mono">fiyatlar sunucudan</span>
                </div>
                {(veri?.catalog.length ?? 0) === 0 ? (
                  <div className="px-2 py-10 text-center">
                    <p className="font-display text-[14px] font-bold" style={{ color: 'var(--metin1)' }}>Market şu an boş</p>
                    <p className="mt-1 text-[12px]" style={{ color: 'var(--metin3)' }}>Katalog sunucudan gelir — daha sonra tekrar bak.</p>
                  </div>
                ) : (
                  <div className="mt-3 flex max-h-[520px] flex-col gap-2.5 overflow-y-auto pr-1">
                    {marketGruplari(veri?.catalog ?? []).map(([grupAd, liste]) => (
                      <div key={grupAd} className="flex flex-col gap-2">
                        <span className="bh-mono mt-1">{grupAd}</span>
                        {liste.map((c) => (
                          <MarketUrunu
                            key={c.itemId}
                            urun={c}
                            secili={seciliUrun === c.itemId}
                            sahipAdet={envanterMap.get(c.itemId) ?? 0}
                            kilitli={c.unlockBadge != null && !(veri?.badges ?? []).includes(c.unlockBadge)}
                            yetersiz={(veri?.coins ?? 0) < c.price}
                            mesgul={mesgul}
                            onSec={() => setSeciliUrun(seciliUrun === c.itemId ? null : c.itemId)}
                            onAl={() => satinAl(c.itemId)}
                            onDik={() => dikBasla(c.itemId)}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </Reveal>
          </div>

          {/* ════════ ENVANTER — masaüstü ızgara · mobilde vaul çekmecesi ════════ */}
          <Reveal delay={0.18}>
            <section aria-label="Envanter" className="bh-kart mt-4 px-5 py-4">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="bh-h2">Envanter</h2>
                {(veri?.inventory.length ?? 0) > 0 && (
                  <span className="bh-mono">{veri!.inventory.length} çeşit</span>
                )}
              </div>
              {(veri?.inventory.length ?? 0) === 0 ? (
                <div className="px-2 py-8 text-center">
                  <p className="font-display text-[14px] font-bold" style={{ color: 'var(--metin1)' }}>Envanter boş</p>
                  <p className="mt-1 text-[12px]" style={{ color: 'var(--metin3)' }}>
                    Marketten tohum al; soru çözdükçe coin birikir.
                  </p>
                </div>
              ) : (
                <>
                  {/* Masaüstü ızgara */}
                  <div className="mt-3 hidden flex-wrap gap-2.5 sm:flex">
                    {veri!.inventory.map((i) => (
                      <div key={i.item_id} className="bh-env-kutu">
                        <div aria-hidden className="text-[26px] leading-none">{urunGorsel(i.item_id)}</div>
                        <div className="mt-1.5 text-[11px] font-semibold leading-tight" style={{ color: 'var(--metin1)' }}>
                          {itemAdi(i.item_id)}
                        </div>
                        <div className="bh-mono mt-0.5">×{i.count}</div>
                        <button className="bh-soluk kucuk mt-2" onClick={() => dikBasla(i.item_id)}>
                          Dik
                        </button>
                      </div>
                    ))}
                  </div>
                  {/* Mobil: mevcut vaul alt çekmecesi */}
                  <div className="mt-3 sm:hidden">
                    <Drawer.Root open={envanterAcik} onOpenChange={setEnvanterAcik}>
                      <Drawer.Trigger asChild>
                        <button className="bh-soluk w-full">Envanteri aç — {veri!.inventory.length} çeşit</button>
                      </Drawer.Trigger>
                      <Drawer.Portal>
                        <Drawer.Overlay className="fixed inset-0 z-[85] backdrop-blur-sm" style={{ background: 'rgba(12, 18, 14, 0.5)' }} />
                        <Drawer.Content
                          className="fixed inset-x-0 bottom-0 z-[86] mx-auto flex max-h-[78vh] max-w-2xl flex-col rounded-t-3xl border-b-0"
                          style={{ background: 'var(--mat)', border: '1px solid var(--cam-kenar)' }}
                        >
                          <div className="mx-auto mt-3 h-1.5 w-11 shrink-0 rounded-full" style={{ background: 'var(--v2)' }} />
                          <Drawer.Title className="px-6 pb-1 pt-4 font-display text-[16px] font-bold" style={{ color: 'var(--metin1)' }}>
                            Envanter
                          </Drawer.Title>
                          <div className="flex flex-col gap-2 overflow-y-auto px-5 pb-8 pt-2">
                            {veri!.inventory.map((i) => (
                              <div key={i.item_id} className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: 'var(--v0)' }}>
                                <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl text-[20px]" style={{ background: 'var(--v1)' }}>
                                  {urunGorsel(i.item_id)}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-[13px] font-semibold" style={{ color: 'var(--metin1)' }}>{itemAdi(i.item_id)}</div>
                                  <div className="bh-mono">×{i.count}</div>
                                </div>
                                <button className="bh-soluk shrink-0" onClick={() => dikBasla(i.item_id)}>Dik</button>
                              </div>
                            ))}
                          </div>
                        </Drawer.Content>
                      </Drawer.Portal>
                    </Drawer.Root>
                  </div>
                </>
              )}
            </section>
          </Reveal>
        </>
      )}
    </div>
  )
}

/* ── Market gruplama — sunucu kataloğu kind'a göre başlıklanır ────────────── */
function marketGruplari(katalog: KatalogUrun[]): [string, KatalogUrun[]][] {
  const g = new Map<string, KatalogUrun[]>()
  for (const c of katalog) {
    const anahtar = c.kind === 'seed' ? 'Tohumlar' : c.kind === 'tree' ? 'Yetişkin Ağaçlar' : c.kind === 'decor' ? 'Dekor' : 'Özel'
    const dizi = g.get(anahtar) ?? []
    dizi.push(c)
    g.set(anahtar, dizi)
  }
  return [...g.entries()]
}

/* ── Market ürün satırı — durumlar KELİMELİ (asla yalnız renk) ──────────────
   seçili → tek birincil "Satın al" · seçilebilir → "Seç" · yetersiz coin →
   devre dışı "yetersiz coin" · sahip → "✓ sahipsin" + Dik · kilitli →
   "rozetle açılır". Fiyat sunucudan gelir, burada hesap yok. ─────────────── */
function MarketUrunu({ urun, secili, sahipAdet, kilitli, yetersiz, mesgul, onSec, onAl, onDik }: {
  urun: KatalogUrun
  secili: boolean
  sahipAdet: number
  kilitli: boolean
  yetersiz: boolean
  mesgul: boolean
  onSec: () => void
  onAl: () => void
  onDik: () => void
}) {
  const sahip = sahipAdet > 0
  const secilebilir = !kilitli && !sahip
  return (
    <div
      className={cn('bh-urun', secili && 'secili', kilitli && 'opacity-60')}
      onClick={() => { if (secilebilir) onSec() }}
      style={secilebilir ? undefined : { cursor: 'default' }}
    >
      <span aria-hidden className="grid size-[42px] shrink-0 place-items-center rounded-xl text-[21px]" style={{ background: 'var(--v1)' }}>
        {urunGorsel(urun.itemId)}
      </span>
      <div className="min-w-0 flex-1">
        <h4 className="truncate text-[13.5px] font-semibold" style={{ color: 'var(--metin1)' }}>{itemAdi(urun.itemId)}</h4>
        <div className="mt-0.5 flex flex-wrap items-center gap-2">
          {urun.rarity && <NadirRozet rarity={urun.rarity} />}
          {sahip ? (
            <span className="bh-sahip">✓ sahipsin{sahipAdet > 1 ? ` ×${sahipAdet}` : ''}</span>
          ) : (
            <span className="bh-fiyat"><Icon name="coin" size={12} color="currentColor" />{urun.price}</span>
          )}
          {kilitli && (
            <span className="bh-mono inline-flex items-center gap-1">
              <Icon name="lock" size={10} color="currentColor" />rozetle açılır
            </span>
          )}
        </div>
      </div>
      <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
        {kilitli ? (
          <button className="bh-soluk" disabled>kilitli</button>
        ) : sahip ? (
          <button className="bh-soluk" onClick={onDik}>Dik</button>
        ) : secili ? (
          <button className="bh-cta" disabled={mesgul || yetersiz} onClick={onAl}>Satın al</button>
        ) : yetersiz ? (
          <button className="bh-soluk" disabled>yetersiz coin</button>
        ) : (
          <button className="bh-soluk" onClick={onSec}>Seç</button>
        )}
      </div>
    </div>
  )
}

/* ── WebGL yedeği — düz 2D bahçe (işlev aynı: dik/taşı/sök akışı birebir) ───
   Kelimeli not: "Basit görünüm — işlevler aynı". Yerleştirme modunda zemine
   tıklama, tıklanan noktayı 0–100 yüzdesine çevirip aynı RPC akışına verir. */
function DuzBahce({ bitkiler, seciliId, yerlesimModu, onTikla, onZemin }: {
  bitkiler: BahceYaniti['plants']
  seciliId: string | null
  yerlesimModu: boolean
  onTikla: (id: string) => void
  onZemin: (p: { x: number; y: number }) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const zeminTik = (e: MouseEvent<HTMLDivElement>) => {
    if (!yerlesimModu || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(100, Math.round(((e.clientX - r.left) / r.width) * 100)))
    const y = Math.max(0, Math.min(100, Math.round(((e.clientY - r.top) / r.height) * 100)))
    onZemin({ x, y })
  }
  return (
    <div
      ref={ref}
      onClick={zeminTik}
      className="relative h-[340px] overflow-hidden"
      style={{ background: 'linear-gradient(180deg, var(--v0), var(--v1))', cursor: yerlesimModu ? 'crosshair' : undefined }}
    >
      <div className="absolute inset-x-0 bottom-0 h-2/3 rounded-t-[50%]" style={{ background: 'var(--v2)' }} />
      <div className="absolute inset-0 grid grid-cols-4 content-center gap-3 px-8 sm:grid-cols-6">
        {bitkiler.map((p) => (
          <button
            key={p.id}
            onClick={(e) => { if (!yerlesimModu) { e.stopPropagation(); onTikla(p.id) } }}
            title={itemAdi(p.item_id)}
            className="grid cursor-pointer place-items-center rounded-2xl py-3 text-[28px] leading-none transition-transform motion-safe:hover:scale-110"
            style={seciliId === p.id ? { background: 'color-mix(in srgb, var(--yaprak) 14%, transparent)', boxShadow: '0 0 0 2px var(--yaprak)' } : undefined}
          >
            <span aria-hidden>{urunGorsel(p.item_id)}</span>
          </button>
        ))}
      </div>
      <span className="bh-mono absolute bottom-2 right-3">Basit görünüm — işlevler aynı</span>
    </div>
  )
}
