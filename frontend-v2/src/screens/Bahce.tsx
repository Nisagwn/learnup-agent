import { lazy, Suspense, useMemo, useState } from 'react'
import { Drawer } from 'vaul'
import { toast } from 'sonner'
import { Icon } from '../ui'
import { cn } from '../lib/cn'
import { useTheme } from '../lib/theme'
import { useAsync } from '../lib/useAsync'
import { apiGet, apiPost } from '../lib/api.js'
import { itemAdi, NADIRLIK, TUM_AGACLAR, AGAC_ADLARI } from '../lib/katalog'
import type { BahceYaniti } from '../lib/types'
import { GlassCard, GlowButton, Badge, SectionLabel, Skeleton } from '../components/ui'
import { Reveal } from '../components/fx'
import { Sayi, Tip, PanelBaslik, BosDurum } from '../components/cekirdek'

// three yalnız bu chunk zincirinde — kabuk bundle'ına girmez
const Bahce3D = lazy(() => import('../components/Bahce3D'))

/* ═══════════════════════════════════════════════════════════════════════════
   BAHÇEM — coin ekonomisinin 3D sahnesi.
   Tüm yazma işlemleri MEVCUT atomik RPC uçları: /garden/purchase · /plant ·
   /move · /remove. Fiyat/kilit OTORİTESİ sunucuda (catalog GET ile gelir).
   Akış: envanterden "dik" → yerleştirme modu → zemine tıkla → plant.
         bitkiye tıkla → panel (taşı → zemine tıkla → move · sök → remove).
   WebGL yoksa: 2D ızgara yedeği (işlev aynı, sahne düz).
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

export function Bahce() {
  const { theme } = useTheme()
  const bahce = useAsync<BahceYaniti>(() => apiGet('/garden'), [])
  const [mod, setMod] = useState<Mod>({ tip: 'bos' })
  const [secili, setSecili] = useState<string | null>(null)
  const [mesgul, setMesgul] = useState(false)
  const webgl = useMemo(webglVarMi, [])

  const veri = bahce.data
  const fiyatlar = useMemo(
    () => new Map((veri?.catalog ?? []).map((c) => [c.itemId, c])),
    [veri?.catalog],
  )
  const seciliBitki = veri?.plants.find((p) => p.id === secili) ?? null

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

  /* ── Eylemler (atomik RPC uçları) ── */

  const satinAl = async (itemId: string) => {
    if (mesgul) return
    setMesgul(true)
    try {
      const r = await apiPost('/garden/purchase', { itemId })
      toast.success(`${itemAdi(itemId)} alındı`, { description: `Kalan coin: ${r?.coins ?? '—'}` })
      bahce.reload()
    } catch (e: any) {
      toast.error('Satın alınamadı', { description: e?.message })
    } finally { setMesgul(false) }
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
    } finally { setMesgul(false) }
  }

  return (
    <div className="mx-auto max-w-7xl px-[clamp(16px,3.5vw,44px)] pb-20 pt-9">
      {/* Başlık + coin */}
      <Reveal>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-[28px] font-bold tracking-tight text-slate-800 dark:text-slate-100">Bahçem</h1>
            <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">
              Çözdükçe kazandığın coin'lerle adanı yeşert — gece temasında ateşböcekleri çıkar.
            </p>
          </div>
          <div className="glass-solid flex items-center gap-2 rounded-2xl px-4 py-2.5">
            <Icon name="coin" size={18} color="#D9A406" />
            <span className="font-display text-[19px] font-bold text-slate-800 dark:text-slate-100">
              <Sayi value={veri?.coins ?? 0} />
            </span>
            <span className="font-mono text-[10px] text-slate-400">coin</span>
          </div>
        </div>
      </Reveal>

      {bahce.loading ? (
        <Skeleton className="mt-6 h-[420px]" />
      ) : bahce.error ? (
        <GlassCard blur={false} className="mt-6 px-6 py-8 text-center text-sm text-slate-500">
          Bahçe yüklenemedi: {bahce.error}
          <div className="mt-3"><GlowButton variant="outline" size="sm" onClick={() => bahce.reload()}>Tekrar dene</GlowButton></div>
        </GlassCard>
      ) : (
        <>
          {/* ── Sahne ── */}
          <Reveal delay={0.06}>
            <div className="glass-solid relative mt-6 overflow-hidden rounded-3xl">
              {/* Mod şeridi */}
              {mod.tip !== 'bos' && (
                <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-3 bg-sky-600/90 px-4 py-2 text-white backdrop-blur-sm">
                  <span className="text-[12.5px] font-semibold">
                    {mod.tip === 'dik' ? `${itemAdi(mod.itemId)} için zemine tıkla` : 'Yeni konum için zemine tıkla'}
                  </span>
                  <button onClick={() => setMod({ tip: 'bos' })} className="cursor-pointer font-display text-[12px] font-bold underline-offset-2 hover:underline">
                    Vazgeç
                  </button>
                </div>
              )}

              {webgl ? (
                <div className="h-[440px]">
                  <Suspense fallback={<div className="grid h-full place-items-center"><div className="size-9 animate-spin rounded-full border-[3px] border-sky-500/20 border-t-sky-500" /></div>}>
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
                  onTikla={(id) => setSecili(secili === id ? null : id)}
                />
              )}

              {/* Seçili bitki paneli */}
              {seciliBitki && mod.tip === 'bos' && (
                <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 rounded-2xl bg-ocean-900/85 px-4 py-2.5 text-white backdrop-blur-md">
                  <span className="text-[13px] font-semibold">{itemAdi(seciliBitki.item_id)}</span>
                  <button
                    onClick={() => setMod({ tip: 'tasi', plantId: seciliBitki.id })}
                    className="cursor-pointer rounded-lg bg-sky-500/90 px-3 py-1.5 font-display text-[11.5px] font-bold transition-colors hover:bg-sky-400"
                  >
                    Taşı
                  </button>
                  <button
                    onClick={() => sok(seciliBitki.id)}
                    disabled={mesgul}
                    className="cursor-pointer rounded-lg bg-rose-500/80 px-3 py-1.5 font-display text-[11.5px] font-bold transition-colors hover:bg-rose-400"
                  >
                    Sök
                  </button>
                  <button onClick={() => setSecili(null)} className="grid size-6 cursor-pointer place-items-center rounded-md text-white/70 hover:text-white">
                    <Icon name="close" size={13} color="currentColor" />
                  </button>
                </div>
              )}

              {(veri?.plants.length ?? 0) === 0 && (
                <div className="pointer-events-none absolute inset-x-0 bottom-4 text-center">
                  <span className="rounded-full bg-ocean-900/70 px-4 py-1.5 text-[12px] text-white backdrop-blur-sm">
                    Ada bomboş — markete uğra, ilk tohumunu dik 🌱
                  </span>
                </div>
              )}
            </div>
          </Reveal>

          {/* ── Alt panel: envanter + market + koleksiyon ── */}
          <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <div className="min-w-0 space-y-6">
              {/* Envanter */}
              <Reveal delay={0.1}>
                <div className="glass-solid rounded-2xl px-5 py-4">
                  <PanelBaslik icon="gift" sag={<Market fiyatlar={veri?.catalog ?? []} badges={veri?.badges ?? []} coins={veri?.coins ?? 0} mesgul={mesgul} onAl={satinAl} />}>
                    Envanter
                  </PanelBaslik>
                  {(veri?.inventory.length ?? 0) === 0 ? (
                    <BosDurum
                      baslik="Envanter boş"
                      aciklama="Marketten tohum al; soru çözdükçe coin birikir."
                    />
                  ) : (
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                      {veri!.inventory.map((i) => (
                        <div key={i.item_id} className="flex items-center gap-2.5 rounded-xl bg-shore-100/60 px-3 py-2.5 dark:bg-ocean-950/40">
                          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-emerald-500/12 text-emerald-600 dark:text-emerald-300">
                            <Icon name={i.kind === 'seed' ? 'sprout' : i.kind === 'decor' ? 'gift' : 'sparkle'} size={15} color="currentColor" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[12px] font-semibold text-slate-600 dark:text-slate-300">{itemAdi(i.item_id)}</div>
                            <div className="font-mono text-[10px] text-slate-400">×{i.count}</div>
                          </div>
                          <button
                            onClick={() => { setSecili(null); setMod({ tip: 'dik', itemId: i.item_id }) }}
                            className="shrink-0 cursor-pointer rounded-lg border border-sky-500/30 px-2.5 py-1 font-display text-[11px] font-bold text-sky-600 transition-colors hover:bg-sky-500/10 dark:text-sky-300"
                          >
                            Dik
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Reveal>
            </div>

            {/* Koleksiyon defteri */}
            <Reveal delay={0.14} className="min-w-0">
              <div className="glass-solid rounded-2xl px-5 py-4">
                <PanelBaslik icon="book">Koleksiyon · {koleksiyon.size}/{TUM_AGACLAR.length}</PanelBaslik>
                <div className="grid grid-cols-4 gap-2">
                  {TUM_AGACLAR.map((tur) => {
                    const sahip = koleksiyon.has(tur)
                    return (
                      <Tip key={tur} icerik={<span>{AGAC_ADLARI[tur]}{sahip ? ' · koleksiyonda' : ' · henüz yok'}</span>}>
                        <div className={cn(
                          'flex cursor-default flex-col items-center gap-1 rounded-xl px-1 py-2.5 transition-transform hover:scale-105',
                          sahip ? 'bg-emerald-500/10' : 'opacity-35 grayscale',
                        )}>
                          <span className={cn(
                            'grid size-9 place-items-center rounded-full',
                            sahip ? 'bg-gradient-to-br from-emerald-400 to-teal-600 text-white' : 'bg-slate-200 text-slate-400 dark:bg-ocean-800',
                          )}>
                            <Icon name="sprout" size={16} color="currentColor" />
                          </span>
                          <span className="text-center font-display text-[9px] font-semibold leading-tight text-slate-500 dark:text-slate-400">
                            {AGAC_ADLARI[tur]}
                          </span>
                        </div>
                      </Tip>
                    )
                  })}
                </div>
                <p className="mt-3 text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
                  8 türün hepsini topla — Işık Ağacı rozet kilidiyle, Parıltı efsanevi nadirlikte.
                </p>
              </div>
            </Reveal>
          </div>
        </>
      )}
    </div>
  )
}

/* ── Market — vaul çekmecesi (fiyatlar SUNUCUDAN) ─────────────────────────── */
function Market({ fiyatlar, badges, coins, mesgul, onAl }: {
  fiyatlar: BahceYaniti['catalog']
  badges: string[]
  coins: number
  mesgul: boolean
  onAl: (itemId: string) => void
}) {
  const gruplar = useMemo(() => {
    const g = new Map<string, typeof fiyatlar>()
    for (const c of fiyatlar) {
      const anahtar = c.kind === 'seed' ? 'Tohumlar' : c.kind === 'tree' ? 'Yetişkin Ağaçlar' : c.kind === 'decor' ? 'Dekor' : 'Özel'
      const dizi = g.get(anahtar) ?? []
      dizi.push(c)
      g.set(anahtar, dizi)
    }
    return [...g.entries()]
  }, [fiyatlar])

  return (
    <Drawer.Root>
      <Drawer.Trigger asChild>
        <button className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 font-display text-[12px] font-bold text-amber-600 transition-colors hover:bg-amber-500/20 dark:text-amber-300">
          <Icon name="coin" size={13} color="currentColor" />Market
        </button>
      </Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[85] bg-ocean-950/50 backdrop-blur-sm" />
        <Drawer.Content className="glass fixed inset-x-0 bottom-0 z-[86] mx-auto flex max-h-[82vh] max-w-2xl flex-col rounded-t-3xl border-b-0">
          <div className="mx-auto mt-3 h-1.5 w-11 shrink-0 rounded-full bg-slate-300 dark:bg-ocean-700" />
          <div className="flex items-center justify-between px-6 pb-2 pt-4">
            <Drawer.Title className="font-display text-[17px] font-bold text-slate-800 dark:text-slate-100">
              Market
            </Drawer.Title>
            <span className="inline-flex items-center gap-1.5 font-mono text-[12px] text-slate-500 dark:text-slate-400">
              <Icon name="coin" size={14} color="#D9A406" />{coins}
            </span>
          </div>
          <div className="overflow-y-auto px-6 pb-8">
            {gruplar.map(([ad, liste]) => (
              <div key={ad} className="mt-4">
                <SectionLabel>{ad}</SectionLabel>
                <div className="grid gap-2 sm:grid-cols-2">
                  {liste.map((c) => {
                    const kilitli = c.unlockBadge != null && !badges.includes(c.unlockBadge)
                    const yetersiz = coins < c.price
                    const nadir = c.rarity ? NADIRLIK[c.rarity] : null
                    return (
                      <div key={c.itemId} className={cn(
                        'flex items-center gap-3 rounded-xl border border-slate-300/40 px-3.5 py-2.5 dark:border-ocean-700',
                        kilitli && 'opacity-60',
                      )}>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-[12.5px] font-semibold text-slate-700 dark:text-slate-200">
                              {itemAdi(c.itemId)}
                            </span>
                            {nadir && (
                              <span className="rounded px-1 font-mono text-[9px] font-semibold" style={{ color: nadir.renk, backgroundColor: nadir.renk + '1A' }}>
                                {nadir.ad}
                              </span>
                            )}
                          </div>
                          {kilitli && (
                            <span className="mt-0.5 inline-flex items-center gap-1 font-mono text-[9.5px] text-slate-400">
                              <Icon name="lock" size={10} color="currentColor" />rozetle açılır
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => onAl(c.itemId)}
                          disabled={kilitli || yetersiz || mesgul}
                          className={cn(
                            'inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 font-display text-[11.5px] font-bold transition-colors',
                            kilitli || yetersiz
                              ? 'cursor-default bg-slate-200/60 text-slate-400 dark:bg-ocean-800'
                              : 'cursor-pointer bg-amber-500/15 text-amber-600 hover:bg-amber-500/25 dark:text-amber-300',
                          )}
                        >
                          <Icon name="coin" size={12} color="currentColor" />{c.price}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

/* ── WebGL yedeği — düz 2D bahçe (işlev aynı) ────────────────────────────── */
function DuzBahce({ bitkiler, seciliId, onTikla }: {
  bitkiler: BahceYaniti['plants']
  seciliId: string | null
  onTikla: (id: string) => void
}) {
  return (
    <div className="relative h-[340px] overflow-hidden bg-gradient-to-b from-sky-200/60 to-emerald-200/50 dark:from-ocean-850 dark:to-[#12321F]">
      <div className="absolute inset-x-0 bottom-0 h-2/3 rounded-t-[50%] bg-emerald-400/60 dark:bg-emerald-900/50" />
      <div className="absolute inset-0 grid grid-cols-4 content-center gap-3 px-8 sm:grid-cols-6">
        {bitkiler.map((p) => (
          <button
            key={p.id}
            onClick={() => onTikla(p.id)}
            title={itemAdi(p.item_id)}
            className={cn(
              'grid cursor-pointer place-items-center rounded-2xl py-3 transition-transform hover:scale-110',
              seciliId === p.id && 'bg-sky-500/20 ring-2 ring-sky-400',
            )}
          >
            <Icon name="sprout" size={30} color="#059669" />
          </button>
        ))}
      </div>
      <span className="absolute bottom-2 right-3 font-mono text-[9.5px] text-slate-500/70">
        3D sahne bu cihazda desteklenmiyor — düz görünüm
      </span>
    </div>
  )
}
