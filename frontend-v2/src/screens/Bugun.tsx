import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../ui'
import { cn } from '../lib/cn'
import { useAuth } from '../lib/auth'
import { useAsync } from '../lib/useAsync'
import { apiGet, apiPost } from '../lib/api.js'
import { selam, dersAnahtar, sayi } from '../lib/format'
import { TIER_TR, type ReviewYaniti, type RontgenYanit, type Nudge, type CozSpec } from '../lib/types'
import {
  GlassCard, GlowButton, Badge, Chip, SubjectName, SectionLabel, Skeleton,
} from '../components/ui'
import { GlowBorder, Reveal, WaveDivider } from '../components/fx'
import { Lighthouse } from '../components/Lighthouse'
import { SubjectChart } from '../components/SubjectChart'
import { Halka, IsiHucre, Sayi } from '../components/cekirdek'

/* ═══════════════════════════════════════════════════════════════════════════
   GENEL BAKIŞ — günün güvertesi.
   Sol: Devam Et (yarıda kalan blok) · Bugünün Rotası · sıradaki bloklar ·
        Tekrar Zamanı (SRS).
   Sağ: Fener/seri + lig · Günlük Hedef halkası · Görev şeridi · Isı haritası
        mini · Ders Performansı · Koç dürtmesi.
   Veriler gerçek: /gamification/daily · /practice/suggest · /questions/ai/topics ·
   /mastery/rontgen (trend → hedef halkası) · /practice/review · /agents/nudges.
   ═══════════════════════════════════════════════════════════════════════════ */

function sonrakiMilat(seri: number) {
  for (const mlt of [7, 14, 30, 60, 100, 200, 365]) if (seri < mlt) return mlt
  return seri
}

const kisalt = (s: string, n = 64) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s)

const buyukHarf = (s: string) =>
  s.split(' ').map((w) => (w ? w.charAt(0).toLocaleUpperCase('tr-TR') + w.slice(1) : w)).join(' ')

/** Çöz'ün yazdığı yarım-blok oturumu (localStorage) — Devam Et kartının kaynağı. */
export interface DevamKaydi {
  spec: CozSpec
  idx: number
  toplam: number
  zaman: number
}

export function devamKaydiOku(): DevamKaydi | null {
  try {
    const raw = localStorage.getItem('learnup.devam')
    if (!raw) return null
    const d = JSON.parse(raw) as DevamKaydi
    // 24 saatten eski yarım blok bayat sayılır
    if (!d?.spec || Date.now() - (d.zaman ?? 0) > 24 * 3_600_000) return null
    if (typeof d.idx !== 'number' || d.idx <= 0 || d.idx >= (d.toplam ?? 0)) return null
    return d
  } catch { return null }
}

export function gunlukHedef(): number {
  try {
    const n = Number(localStorage.getItem('learnup.hedef'))
    return Number.isFinite(n) && n >= 1 ? n : 10
  } catch { return 10 }
}

export function Bugun() {
  const nav = useNavigate()
  const { profile, user } = useAuth()
  const ad = buyukHarf(profile?.name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'Denizci')

  const gami = useAsync<any>(() => apiPost('/gamification/daily', {}), [])
  const oneri = useAsync<any>(() => apiGet('/practice/suggest'), [])
  const konular = useAsync<any>(() => apiGet('/questions/ai/topics'), [])
  // Bilişsel harita + trend — çürüme backend'de uygulanır; hedef halkası bugünün
  // gerçek çözüm sayısını trend'den okur.
  const rontgen = useAsync<RontgenYanit>(() => apiGet('/mastery/rontgen'), [])
  const review = useAsync<ReviewYaniti>(() => apiGet('/practice/review'), [])
  const nudges = useAsync<{ nudges: Nudge[] }>(() => apiGet('/agents/nudges'), [])

  const G = gami.data?.gamification
  const odak = oneri.data?.kazanim
  const seri = G?.streak?.count ?? 0
  const devam = useMemo(devamKaydiOku, [])

  const bugunCozulen = useMemo(() => {
    const bugun = new Date().toLocaleDateString('en-CA')
    return (rontgen.data?.trend ?? []).find((g) => g.date === bugun)?.solved ?? 0
  }, [rontgen.data])
  const hedef = gunlukHedef()

  const coz = (kazanimId: number, subject: string, title: string) =>
    nav('/coz', { state: { source: 'ai', kazanimId, subject, title } })

  // Sıradaki bloklar: havuzdaki kazanımlar, odak hariç
  const siradaki = useMemo(() => {
    const hepsi: any[] = (konular.data?.subjects ?? []).flatMap((s: any) => s.topics)
    return hepsi.filter((k) => k.kazanimId !== odak?.kazanimId).slice(0, 4)
  }, [konular.data, odak?.kazanimId])

  const sonDurtme = nudges.data?.nudges?.[0] ?? null
  const rontgenBos = !rontgen.loading && (rontgen.data?.nodes?.length ?? 0) === 0

  return (
    <div className="mx-auto max-w-7xl px-[clamp(16px,3.5vw,44px)] pb-20 pt-11">
      {/* ── Selamlama + mini metrikler ── */}
      <Reveal>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[15px] text-slate-500 dark:text-slate-400">{selam()},</p>
            <h1 className="mt-1 font-display text-4xl font-bold tracking-tight text-slate-800 dark:text-slate-100">{ad}</h1>
          </div>
          {G && (
            <div className="flex items-center gap-5 font-mono text-[12px] text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <Icon name="flame" size={14} color="#F59E0B" />{seri} gün
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Icon name="sparkle" size={14} color="currentColor" />{sayi(G.xp)} XP
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Icon name="coin" size={14} color="currentColor" />{sayi(G.coins)}
              </span>
            </div>
          )}
        </div>
      </Reveal>

      {/* ── Koç dürtmesi — canlı ürün hissi (varsa) ── */}
      {sonDurtme && (
        <Reveal delay={0.03}>
          <div className="glass-solid mt-5 flex items-start gap-3 rounded-2xl border-sky-500/20 px-5 py-3.5">
            <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-sky-600 to-cyan-600">
              <Icon name="anchor" size={14} color="#fff" />
            </span>
            <div className="min-w-0 flex-1">
              <span className="font-display text-[11px] font-semibold uppercase tracking-wide text-sky-600 dark:text-sky-300">Koç'tan</span>
              <p className="mt-0.5 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300">{sonDurtme.message}</p>
            </div>
            <button
              onClick={() => nav('/kaptan')}
              className="shrink-0 cursor-pointer font-display text-[12px] font-semibold text-sky-600 hover:text-sky-500 dark:text-sky-400"
            >
              Yanıtla
            </button>
          </div>
        </Reveal>
      )}

      <div className="mt-9 grid items-start gap-8 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
        {/* ════════ SOL ════════ */}
        <div className="min-w-0">
          {/* Devam Et — yarıda kalan blok */}
          {devam && (
            <Reveal delay={0.05}>
              <button
                onClick={() => nav('/coz', { state: { ...devam.spec, startIndex: devam.idx } })}
                className="glass-solid group mb-5 flex w-full cursor-pointer items-center gap-4 rounded-2xl border-amber-500/25 px-6 py-4 text-left transition-all hover:-translate-y-px hover:shadow-card"
              >
                <Halka oran={devam.idx / devam.toplam} boyut={44} kalinlik={4} renk="var(--color-amber-500)">
                  <span className="font-mono text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                    {devam.idx}/{devam.toplam}
                  </span>
                </Halka>
                <div className="min-w-0 flex-1">
                  <div className="font-display text-[13.5px] font-bold text-slate-700 dark:text-slate-200">
                    Yarıda kalan blok seni bekliyor
                  </div>
                  <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                    {devam.spec.title ?? devam.spec.subject ?? 'Pratik'} · kaldığın yerden sür
                  </p>
                </div>
                <Icon name="arrowRight" size={17} color="currentColor" style={{ opacity: 0.4 }} />
              </button>
            </Reveal>
          )}

          <Reveal delay={0.06}>
            <SectionLabel action="Planın tümü" onAction={() => nav('/rota')}>Bugünün Rotası</SectionLabel>

            {oneri.loading ? (
              <Skeleton className="h-28" />
            ) : odak ? (
              <GlowBorder mode="always">
                <div className="glass flex flex-wrap items-center gap-5 rounded-2xl px-7 py-6">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      {/* Ders adı TAM — kısaltma yok */}
                      <SubjectName subject={odak.subject} anahtar={dersAnahtar(odak.subject)} className="text-[15px]" />
                      {oneri.data?.reason === 'weak' && <Badge tone="amber">zayıf konu</Badge>}
                      <span className="text-xs text-slate-400 dark:text-slate-500">· {odak.count} soru</span>
                    </div>
                    <p className="mt-2 truncate text-sm text-slate-500 dark:text-slate-400" title={odak.title}>
                      {kisalt(odak.title)}
                    </p>
                  </div>
                  <GlowButton icon="arrowRight" onClick={() => coz(odak.kazanimId, odak.subject, odak.title)}>
                    Devam Et
                  </GlowButton>
                </div>
              </GlowBorder>
            ) : (
              <GlassCard blur={false} className="px-7 py-6 text-sm text-slate-500 dark:text-slate-400">
                Rota henüz çizilmedi — soru havuzu dolunca bugünün rotası burada belirir.
              </GlassCard>
            )}

            {/* Sıradaki bloklar — buton YOK, satırın tamamı tıklanır */}
            {siradaki.length > 0 && (
              <div className="mt-4 space-y-2.5">
                {siradaki.map((k) => (
                  <button
                    key={k.kazanimId}
                    onClick={() => coz(k.kazanimId, k.subject, k.title)}
                    className="glass-solid group flex w-full cursor-pointer items-center gap-4 rounded-xl px-6 py-4 text-left transition-all duration-200 hover:-translate-y-px hover:border-sky-500/30 hover:shadow-card dark:hover:border-sky-400/25"
                  >
                    <SubjectName subject={k.subject} anahtar={dersAnahtar(k.subject)} className="w-28 shrink-0" />
                    <span
                      className="min-w-0 flex-1 truncate text-[13.5px] text-slate-500 dark:text-slate-400"
                      title={k.title}
                    >
                      {kisalt(k.title, 72)}
                    </span>
                    <span className="shrink-0 text-[11px] text-slate-400 dark:text-slate-500">{k.count} soru</span>
                    <Icon name="chevronRight" size={16} color="currentColor" style={{ opacity: 0.45 }} />
                  </button>
                ))}
              </div>
            )}
          </Reveal>

          {/* Tekrar Zamanı — SRS vadesi */}
          {(review.data?.count ?? 0) > 0 && (
            <Reveal delay={0.1}>
              <div className="glass-solid mt-5 flex items-center gap-4 rounded-2xl border-teal-500/25 px-6 py-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-teal-500/12 text-teal-600 dark:text-teal-300">
                  <Icon name="history" size={19} color="currentColor" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-display text-[13.5px] font-bold text-slate-700 dark:text-slate-200">
                    Tekrar Zamanı — <Sayi value={review.data!.count} /> kartın vadesi geldi
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Aralıklı tekrar unutma eğrisini kırar; en eskisinden başla.
                  </p>
                </div>
                <GlowButton
                  variant="outline" size="sm"
                  onClick={() => nav('/coz', {
                    state: { source: 'review', title: 'Tekrar Zamanı', questions: review.data!.questions },
                  })}
                >
                  Tekrarla
                </GlowButton>
              </div>
            </Reveal>
          )}

          {/* Tanışma daveti — röntgen boşsa */}
          {rontgenBos && (
            <Reveal delay={0.12}>
              <div className="glass-solid mt-5 flex items-center gap-4 rounded-2xl border-sky-500/25 px-6 py-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-sky-500/12 text-sky-600 dark:text-sky-300">
                  <Icon name="scan" size={19} color="currentColor" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-display text-[13.5px] font-bold text-slate-700 dark:text-slate-200">
                    Tanışma Sınavı — röntgenini 10 soruda çek
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Karma sorularla motor seni hızlı tanır; Analiz haritan anında belirir.
                  </p>
                </div>
                <GlowButton size="sm" onClick={() => nav('/coz', { state: { source: 'tanisma', title: 'Tanışma Sınavı' } })}>
                  Başla
                </GlowButton>
              </div>
            </Reveal>
          )}

          <WaveDivider className="mt-9" />
        </div>

        {/* ════════ SAĞ PANEL ════════ */}
        <div className="min-w-0 space-y-7">
          {/* Fener (seri) + lig şeridi */}
          <Reveal delay={0.14}>
            {gami.loading ? (
              <Skeleton className="h-36" />
            ) : (
              <GlassCard className="px-6 py-5">
                <div className="flex items-center gap-5">
                  <Lighthouse size={60} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-1.5">
                      <span className={cn('font-display text-4xl font-bold text-slate-800 dark:text-slate-100', seri > 0 && 'text-glow')}>
                        {seri}
                      </span>
                      <span className="text-sm text-slate-500 dark:text-slate-400">gün</span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {seri > 0 ? 'Fener yanık — seyir sürüyor' : 'Fener sönük — bir blokla yak'}
                    </p>
                    <div className="mt-3 h-1 overflow-hidden rounded-full bg-shore-200 dark:bg-ocean-800">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-sky-600 to-cyan-400"
                        style={{ width: `${Math.min(100, (seri / sonrakiMilat(seri)) * 100)}%` }}
                      />
                    </div>
                    <p className="mt-1.5 font-mono text-[10.5px] text-slate-400 dark:text-slate-500">
                      {sonrakiMilat(seri) - seri} gün → {sonrakiMilat(seri)}. gün feneri
                    </p>
                  </div>
                </div>

                {G?.league && (
                  <div className="mt-5 flex items-center justify-between border-t border-slate-500/10 pt-4 dark:border-sky-500/10">
                    <Chip tone="brass">{TIER_TR[G.league.tier] ?? G.league.tier}</Chip>
                    <span className="font-mono text-[11px] text-slate-400 dark:text-slate-500">
                      bu hafta {sayi(G.league.weeklyXP)} XP
                    </span>
                  </div>
                )}
              </GlassCard>
            )}
          </Reveal>

          {/* Günlük hedef halkası — gerçek çözüm sayısı (trend) + yerel hedef */}
          <Reveal delay={0.18}>
            <GlassCard blur={false} className="flex items-center gap-4 px-5 py-4">
              <Halka oran={Math.min(1, bugunCozulen / hedef)} boyut={56} kalinlik={5}
                renk={bugunCozulen >= hedef ? 'var(--color-emerald-500)' : undefined}>
                <span className="font-mono text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                  {bugunCozulen}/{hedef}
                </span>
              </Halka>
              <div className="min-w-0 flex-1">
                <div className="font-display text-[13px] font-bold text-slate-700 dark:text-slate-200">
                  Günlük Hedef
                </div>
                <p className="mt-0.5 text-[11.5px] leading-snug text-slate-400 dark:text-slate-500">
                  {bugunCozulen >= hedef
                    ? 'Hedef tamam — istersen açık denize devam.'
                    : `Bugün ${hedef - bugunCozulen} soru kaldı. Hedefi Planım'dan ayarla.`}
                </p>
              </div>
              {bugunCozulen >= hedef && <Icon name="check" size={18} color="#10B981" strokeWidth={2.4} />}
            </GlassCard>
          </Reveal>

          {/* Görev şeridi */}
          {G?.dailyQuests?.quests?.length > 0 && (
            <Reveal delay={0.2}>
              <GorevSeridi
                quests={G.dailyQuests.quests}
                onGit={() => nav('/ben')}
              />
            </Reveal>
          )}

          {/* Kazanım Isı Haritası */}
          <Reveal delay={0.22}>
            <SectionLabel action="Analize git" onAction={() => nav('/harita')}>Kazanım Isı Haritası</SectionLabel>
            <GlassCard blur={false} className="px-5 py-4">
              <KazanimHeatmap rontgen={rontgen.data} loading={rontgen.loading} />
            </GlassCard>
          </Reveal>

          {/* Ders Performansı — gerçek subjects verisi */}
          {G && Object.values(G.subjects ?? {}).some((s: any) => (s?.solved ?? 0) > 0) && (
            <Reveal delay={0.3}>
              <SectionLabel>Ders Performansı</SectionLabel>
              <GlassCard blur={false} className="px-4 py-4">
                <SubjectChart subjects={G.subjects} />
              </GlassCard>
            </Reveal>
          )}

          {(gami.error || oneri.error || rontgen.error) && (
            <GlassCard blur={false} className="flex items-center gap-3 border-rose-500/25 px-4 py-3">
              <Icon name="bolt" size={16} color="#E11D48" />
              <span className="flex-1 text-xs text-slate-500 dark:text-slate-400">Sunucuya ulaşılamadı</span>
              <GlowButton variant="outline" size="sm" onClick={() => { gami.reload(); oneri.reload(); konular.reload(); rontgen.reload() }}>
                Tekrar dene
              </GlowButton>
            </GlassCard>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Görev şeridi — tamamlanan/toplam + Profil köprüsü ─────────────────────── */
function GorevSeridi({ quests, onGit }: { quests: any[]; onGit: () => void }) {
  const biten = quests.filter((q) => q.progress >= q.target).length
  const alinmamis = quests.filter((q) => q.progress >= q.target && !q.claimed).length
  return (
    <button
      onClick={onGit}
      className="glass-solid flex w-full cursor-pointer items-center gap-4 rounded-2xl px-5 py-4 text-left transition-all hover:-translate-y-px hover:border-sky-500/30 hover:shadow-card dark:hover:border-sky-400/25"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-500/12 text-amber-600 dark:text-amber-300">
        <Icon name="gift" size={19} color="currentColor" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-display text-[13px] font-bold text-slate-700 dark:text-slate-200">
          Günlük Görevler · {biten}/{quests.length}
        </div>
        <div className="mt-1.5 flex gap-1">
          {quests.map((q) => (
            <span
              key={q.id}
              className={cn(
                'h-1.5 flex-1 rounded-full',
                q.progress >= q.target ? 'bg-amber-500/80' : 'bg-shore-200 dark:bg-ocean-800',
              )}
            />
          ))}
        </div>
      </div>
      {alinmamis > 0 && <Badge tone="amber">{alinmamis} ödül hazır</Badge>}
      <Icon name="chevronRight" size={15} color="currentColor" style={{ opacity: 0.4 }} />
    </button>
  )
}

/* ── Isı haritası mini — Analiz'in özeti (yalnız DOKUNULMUŞ kazanımlar) ────── */
function KazanimHeatmap({ rontgen, loading }: { rontgen: RontgenYanit | null; loading: boolean }) {
  const nodes = rontgen?.nodes ?? []
  const gruplar = useMemo(() => {
    const map = new Map<string, typeof nodes>()
    for (const n of nodes) {
      const dizi = map.get(n.subject)
      if (dizi) dizi.push(n)
      else map.set(n.subject, [n])
    }
    // Çok kazanımlı ders üstte — en yoğun çalışılan alan önce okunur.
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [nodes])

  if (loading) return <div className="h-16 animate-pulse rounded-lg bg-shore-100 dark:bg-ocean-800/60" />

  if (!gruplar.length) {
    return (
      <p className="py-3 text-center text-xs leading-relaxed text-slate-400 dark:text-slate-500">
        Harita soru çözdükçe belirir —<br />her kazanım bir yakamoz karesi.
      </p>
    )
  }

  let sira = 0 // stagger sayacı — gruplar arası sürekli aksın
  return (
    <div>
      <div className="space-y-3">
        {gruplar.map(([ders, kazanimlar]) => (
          <div key={ders}>
            <SubjectName subject={ders} anahtar={dersAnahtar(ders)} className="mb-1.5 text-[11px]" />
            <div className="flex flex-wrap gap-1.5">
              {kazanimlar.map((k) => {
                const i = sira++
                return (
                  <IsiHucre
                    key={k.kazanimId}
                    deger={k.mastery}
                    uyari={k.openMisconceptions > 0}
                    gecikmeMs={i * 22}
                    tip={
                      <div>
                        <div className="font-display font-semibold">{k.title}</div>
                        <div className="mt-0.5 font-mono text-[11px]">
                          %{Math.round(k.mastery * 100)}{k.openMisconceptions > 0 ? ' · üzerinde çalışılıyor' : ''}
                        </div>
                      </div>
                    }
                  />
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3.5 flex items-center gap-2">
        <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500">az</span>
        <span
          className="h-1.5 w-16 rounded-full"
          style={{ background: 'linear-gradient(90deg, var(--heat-zero), var(--data-hue))' }}
        />
        <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500">usta</span>
      </div>
    </div>
  )
}
