import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Icon } from '../ui'
import { cn } from '../lib/cn'
import { useAsync } from '../lib/useAsync'
import { apiGet, apiPost } from '../lib/api.js'
import { dersAnahtar, tarihKisa } from '../lib/format'
import type { MasteryYanit, RoadmapYaniti, PlanGunu } from '../lib/types'
import { GlassCard, GlowButton, Badge, Chip, SubjectName, SectionLabel, Skeleton } from '../components/ui'
import { Reveal, WaveDivider } from '../components/fx'
import { Halka, Meter, PanelBaslik } from '../components/cekirdek'
import { Captain } from '../ui'
import { gunlukHedef } from './Bugun'
import { gunEtiketi } from '../components/rontgen'

/* ═══════════════════════════════════════════════════════════════════════════
   ÇALIŞMA PLANI — Pusula optimizer'ının görünür yüzü.
   Sol: hafta şeridi · Bugünün Odağı · PUSULA HAFTALIK PLANI (gün-gün zaman
        çizelgesi; üret/yenile) · Sıradaki Bloklar (+ustalık barı).
   Sağ: Günlük Hedef ayarı · Antrenman CTA · Koç Notu · görev ilerlemesi.
   ═══════════════════════════════════════════════════════════════════════════ */

const GUNLER = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']

export function Rota() {
  const nav = useNavigate()
  const gami = useAsync<any>(() => apiPost('/gamification/daily', {}), [])
  const oneri = useAsync<any>(() => apiGet('/practice/suggest'), [])
  const konular = useAsync<any>(() => apiGet('/questions/ai/topics'), [])
  const mastery = useAsync<MasteryYanit>(() => apiGet('/mastery'), [])
  const roadmap = useAsync<RoadmapYaniti>(() => apiGet('/agents/roadmap'), [])

  const [planUretiliyor, setPlanUretiliyor] = useState(false)
  const [pusulaOzeti, setPusulaOzeti] = useState<string | null>(null)

  const G = gami.data?.gamification
  const seri = G?.streak?.count ?? 0
  const quests = G?.dailyQuests?.quests ?? []
  const bitenGorev = quests.filter((q: any) => q.progress >= q.target).length
  const odak = oneri.data?.kazanim
  const bugunIdx = (new Date().getDay() + 6) % 7 // Pzt=0

  const ustalikMap = useMemo(() => {
    const map = new Map<number, number>()
    for (const n of mastery.data?.nodes ?? []) map.set(n.kazanimId, n.mastery)
    return map
  }, [mastery.data])

  const bloklar = useMemo(() => {
    const hepsi: any[] = (konular.data?.subjects ?? []).flatMap((s: any) => s.topics)
    return hepsi.filter((k) => k.kazanimId !== odak?.kazanimId).slice(0, 6)
  }, [konular.data, odak?.kazanimId])

  const coz = (kazanimId: number, subject: string, title: string) =>
    nav('/coz', { state: { source: 'ai', kazanimId, subject, title } })

  const planiUret = async () => {
    if (planUretiliyor) return
    setPlanUretiliyor(true)
    try {
      // Pusula: deterministik optimizer + tek anlatım çağrısı (llmLimiter altında)
      const r = await apiPost('/agents/pusula', {})
      if (r?.summary) setPusulaOzeti(String(r.summary))
      roadmap.reload()
      toast.success('Haftalık plan hazır', { description: 'Pusula rotayı optimizer ile kurdu.' })
    } catch (e: any) {
      toast.error('Plan çıkarılamadı', { description: e?.message || 'Biraz sonra tekrar dene.' })
    } finally {
      setPlanUretiliyor(false)
    }
  }

  const gunler: PlanGunu[] = roadmap.data?.steps?.days ?? []

  return (
    <div className="mx-auto max-w-7xl px-[clamp(16px,3.5vw,44px)] pb-20 pt-9">
      {/* Başlık + görev halkası */}
      <Reveal>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-[28px] font-bold tracking-tight text-slate-800 dark:text-slate-100">
              Çalışma Planı
            </h1>
            <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">
              {tarihKisa()} · Pusula optimizer'ı zayıf kazanımdan rotayı kurar
            </p>
          </div>
          <Halka oran={quests.length ? bitenGorev / quests.length : 0} boyut={48} kalinlik={5}>
            <span className="text-center font-mono text-[9.5px] font-semibold leading-tight text-slate-600 dark:text-slate-300">
              {bitenGorev}/{quests.length || 0}<br />görev
            </span>
          </Halka>
        </div>
      </Reveal>

      {/* Hafta şeridi — serinin haftaya yansıması */}
      <Reveal delay={0.05}>
        <div className="mt-6 flex max-w-md justify-between">
          {GUNLER.map((g, i) => {
            const bugun = i === bugunIdx
            const yolAlindi = i < bugunIdx && (bugunIdx - i) <= seri
            return (
              <div key={g} className="flex flex-col items-center gap-1.5">
                <span className={cn(
                  'grid place-items-center rounded-full transition-all',
                  bugun ? 'size-10 bg-sky-600 shadow-glow-sky dark:bg-sky-500' :
                  yolAlindi ? 'size-8.5 bg-emerald-500' :
                  'size-8.5 border border-slate-300/60 bg-white/50 dark:border-ocean-700 dark:bg-ocean-850/50',
                )}>
                  {yolAlindi ? <Icon name="check" size={14} color="#fff" strokeWidth={2.4} />
                    : bugun ? <Icon name="compass" size={17} color="#fff" />
                    : <span className="font-display text-[11px] font-bold text-slate-400 dark:text-slate-500">{g[0]}</span>}
                </span>
                <span className={cn(
                  'font-display text-[10px]',
                  bugun ? 'font-bold text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500',
                )}>{g}</span>
              </div>
            )
          })}
        </div>
      </Reveal>

      <WaveDivider className="mt-6" />

      <div className="mt-7 grid items-start gap-8 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        {/* ════════ SOL ════════ */}
        <div className="min-w-0">
          {/* Bugünün Odağı */}
          <Reveal delay={0.08}>
            <SectionLabel>Bugünün Odağı</SectionLabel>
            {oneri.loading ? <Skeleton className="h-24" /> : odak ? (
              <GlassCard blur={false} className="border-sky-500/25 px-6 py-5">
                <div className="flex flex-wrap items-center gap-2.5">
                  <SubjectName subject={odak.subject} anahtar={dersAnahtar(odak.subject)} />
                  <span className="font-display text-[14.5px] font-bold text-slate-700 dark:text-slate-200">{odak.title}</span>
                  {oneri.data?.reason === 'weak' && <Badge tone="amber">zayıf konu</Badge>}
                  <span className="text-[11.5px] text-slate-400">· {odak.count} soru</span>
                </div>
                <GlowButton className="mt-4" icon="arrowRight" onClick={() => coz(odak.kazanimId, odak.subject, odak.title)}>
                  Devam Et
                </GlowButton>
              </GlassCard>
            ) : (
              <GlassCard blur={false} className="px-6 py-5 text-center text-[13px] text-slate-500 dark:text-slate-400">
                Havuz henüz boş — Koç doldurunca bugünün odağı burada belirir.
              </GlassCard>
            )}
          </Reveal>

          {/* PUSULA — haftalık plan */}
          <Reveal delay={0.12}>
            <div className="mt-7">
              <SectionLabel
                action={gunler.length ? (planUretiliyor ? 'Pusula çiziyor…' : 'Yeniden üret') : undefined}
                onAction={planiUret}
              >
                Pusula · Haftalık Plan
              </SectionLabel>

              {roadmap.loading ? <Skeleton className="h-40" /> : gunler.length ? (
                <div className="space-y-3">
                  {pusulaOzeti && (
                    <div className="glass-solid flex items-start gap-3 rounded-2xl border-sky-500/20 px-5 py-3.5">
                      <Captain size={28} />
                      <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300">{pusulaOzeti}</p>
                    </div>
                  )}
                  {gunler.slice(0, 7).map((gun, gi) => (
                    <div key={gun.day} className="glass-solid rounded-2xl px-5 py-4">
                      <div className="flex items-center justify-between">
                        <span className={cn(
                          'font-display text-[12.5px] font-bold',
                          gi === 0 ? 'text-sky-600 dark:text-sky-300' : 'text-slate-500 dark:text-slate-400',
                        )}>
                          {gi === 0 ? 'Bugün' : gunEtiketi(gun.day)}
                        </span>
                        <span className="font-mono text-[10.5px] text-slate-400 dark:text-slate-500">
                          {gun.blocks.reduce((s, b) => s + b.count, 0)} soru
                        </span>
                      </div>
                      <div className="mt-2.5 space-y-2">
                        {gun.blocks.map((b, bi) => {
                          const tiklanir = b.kazanim_id > 0
                          const Ic = (
                            <>
                              <Chip
                                tone={b.kind === 'srs' ? 'teal' : b.kind === 'remediation' ? 'amber' : b.kind === 'yeni' ? 'sky' : 'slate'}
                                className="shrink-0"
                              >
                                {b.kind === 'srs' ? 'tekrar destesi' : b.kind === 'remediation' ? 'onarım' : b.kind}
                              </Chip>
                              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-slate-600 dark:text-slate-300" title={b.title}>
                                {b.title}
                              </span>
                              <span className="shrink-0 font-mono text-[10.5px] text-slate-400 dark:text-slate-500">
                                {b.count}s · {b.difficulty}
                              </span>
                            </>
                          )
                          return tiklanir ? (
                            <button
                              key={bi}
                              onClick={() => coz(b.kazanim_id, b.subject, b.title)}
                              className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-sky-500/5"
                            >
                              {Ic}
                              <Icon name="chevronRight" size={13} color="currentColor" style={{ opacity: 0.35 }} />
                            </button>
                          ) : (
                            <button
                              key={bi}
                              onClick={() => nav('/coz', { state: { source: 'review', title: 'Tekrar Zamanı' } })}
                              className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-teal-500/5"
                            >
                              {Ic}
                              <Icon name="chevronRight" size={13} color="currentColor" style={{ opacity: 0.35 }} />
                            </button>
                          )
                        })}
                        {gun.tactic_notes.map((not, ni) => (
                          <p key={ni} className="flex items-start gap-1.5 px-2 text-[11.5px] leading-relaxed text-slate-400 dark:text-slate-500">
                            <Icon name="lightbulb" size={12} color="currentColor" style={{ marginTop: 2, flexShrink: 0 }} />
                            {not}
                          </p>
                        ))}
                      </div>
                    </div>
                  ))}
                  {roadmap.data?.updatedAt && (
                    <p className="px-1 font-mono text-[10px] text-slate-400 dark:text-slate-500">
                      son üretim: {new Date(roadmap.data.updatedAt).toLocaleString('tr-TR')}
                    </p>
                  )}
                </div>
              ) : (
                <GlassCard blur={false} className="px-6 py-7 text-center">
                  <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-sky-500/10 text-sky-600 dark:text-sky-300">
                    <Icon name="route" size={22} color="currentColor" />
                  </span>
                  <p className="mt-3 font-display text-[15px] font-bold text-slate-700 dark:text-slate-200">
                    Haftalık planın henüz çizilmedi
                  </p>
                  <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-slate-400 dark:text-slate-500">
                    Pusula, ustalık haritanı ve SRS vadelerini okuyup 7 günlük dengeli
                    bir rota kurar — zayıf kazanım önce, tekrar desteleri yerinde.
                  </p>
                  <GlowButton className="mt-5" icon="compass" disabled={planUretiliyor} onClick={planiUret}>
                    {planUretiliyor ? 'Pusula rota çiziyor…' : 'Haftalık planımı çıkar'}
                  </GlowButton>
                </GlassCard>
              )}
            </div>
          </Reveal>

          {/* Sıradaki Bloklar + ustalık barı */}
          <Reveal delay={0.16}>
            <div className="mt-7">
              <SectionLabel>Sıradaki Bloklar</SectionLabel>
              {konular.loading ? <Skeleton className="h-24" /> : bloklar.length ? (
                <div className="space-y-2.5">
                  {bloklar.map((k) => {
                    const u = ustalikMap.get(k.kazanimId)
                    return (
                      <button
                        key={k.kazanimId}
                        onClick={() => coz(k.kazanimId, k.subject, k.title)}
                        className="glass-solid flex w-full cursor-pointer items-center gap-4 rounded-xl px-5 py-3.5 text-left transition-all hover:-translate-y-px hover:border-sky-500/30 hover:shadow-card dark:hover:border-sky-400/25"
                      >
                        <SubjectName subject={k.subject} anahtar={dersAnahtar(k.subject)} className="w-28 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] font-medium text-slate-600 dark:text-slate-300" title={k.title}>
                            {k.title}
                          </div>
                          {u != null && (
                            <div className="mt-1.5 flex items-center gap-2">
                              <Meter oran={u} yukseklik={4} className="max-w-36 flex-1" />
                              <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500">%{Math.round(u * 100)}</span>
                            </div>
                          )}
                        </div>
                        <span className="shrink-0 text-[11px] text-slate-400 dark:text-slate-500">{k.count} soru</span>
                        <Icon name="chevronRight" size={15} color="currentColor" style={{ opacity: 0.4 }} />
                      </button>
                    )
                  })}
                </div>
              ) : (
                <GlassCard blur={false} className="px-5 py-4 text-center text-xs text-slate-400">Havuzda başka kazanım yok.</GlassCard>
              )}
            </div>
          </Reveal>
        </div>

        {/* ════════ SAĞ ════════ */}
        <div className="min-w-0 space-y-6">
          {/* Günlük hedef ayarı */}
          <Reveal delay={0.14}>
            <HedefAyari />
          </Reveal>

          {/* Antrenman CTA */}
          <Reveal delay={0.18}>
            <GlassCard blur={false} className="px-5 py-4">
              <PanelBaslik icon="bolt">Antrenman Modu</PanelBaslik>
              <p className="text-[12px] leading-relaxed text-slate-500 dark:text-slate-400">
                Adaptif zorluk merdiveni: doğru yaptıkça sertleşir, yanlışta Koç'tan
                pedagojik ipucu gelir.
              </p>
              <GlowButton
                variant="outline" size="sm" className="mt-3" icon="bolt"
                onClick={() => nav('/coz', {
                  state: { source: 'antrenman', subject: odak?.subject, title: odak?.title },
                })}
              >
                Antrenmana başla
              </GlowButton>
            </GlassCard>
          </Reveal>

          {/* Koç Notu — gerçek sinyaller */}
          <Reveal delay={0.22}>
            <GlassCard blur={false} className="border-brass-500/25 px-5 py-4">
              <div className="mb-3 flex items-center gap-2.5">
                <Captain size={30} />
                <div>
                  <div className="font-display text-[13px] font-bold text-brass-600 dark:text-brass-300">Koç'un Notu</div>
                  <div className="text-[10.5px] text-slate-400">bugün için</div>
                </div>
              </div>
              {[
                seri > 0 ? `${seri} günlük serin sürüyor — bugün de bir blok çöz, fener sönmesin.` : 'Bugün ilk bloğu çöz ve serini başlat.',
                odak ? `Odak konun: ${odak.title}. Küçük ama düzenli ilerle.` : 'Soru havuzu dolunca sana özel rota çizeceğim.',
                bitenGorev < quests.length ? `Günlük görevlerden ${quests.length - bitenGorev} tanesi seni bekliyor.` : 'Bugünün görevlerini bitirdin — tam yol ileri!',
              ].map((n, i) => (
                <div key={i} className="mb-2 flex items-start gap-2">
                  <Icon name="anchor" size={13} color="#B8863B" style={{ marginTop: 3, flexShrink: 0 }} />
                  <span className="text-[12.5px] leading-relaxed text-slate-500 dark:text-slate-400">{n}</span>
                </div>
              ))}
              <GlowButton variant="ghost" size="sm" icon="chat" onClick={() => nav('/kaptan')}>
                Koç'la konuş
              </GlowButton>
            </GlassCard>
          </Reveal>
        </div>
      </div>
    </div>
  )
}

/* ── Günlük hedef ayarı — localStorage; Genel Bakış halkasını besler ───────── */
function HedefAyari() {
  const [hedef, setHedef] = useState(gunlukHedef)
  const sec = (n: number) => {
    setHedef(n)
    try { localStorage.setItem('learnup.hedef', String(n)) } catch { /* yut */ }
    toast.success(`Günlük hedef ${n} soru`, { description: 'Genel Bakış halkası buna göre doldu.' })
  }
  return (
    <GlassCard blur={false} className="px-5 py-4">
      <PanelBaslik icon="target">Günlük Hedef</PanelBaslik>
      <div className="flex gap-2">
        {[5, 10, 20, 30].map((n) => (
          <button
            key={n}
            onClick={() => sec(n)}
            className={cn(
              'flex-1 cursor-pointer rounded-xl border py-2.5 text-center font-display text-[14px] font-bold transition-all',
              hedef === n
                ? 'border-sky-500/50 bg-sky-500/10 text-sky-700 shadow-glow-sky dark:text-sky-300'
                : 'border-slate-300/50 text-slate-400 hover:border-sky-500/30 hover:text-slate-600 dark:border-ocean-700 dark:hover:text-slate-300',
            )}
          >
            {n}
          </button>
        ))}
      </div>
      <p className="mt-2.5 text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
        Küçük ve sürdürülebilir hedef, seriyi büyütür — motor tutarlılığı sever.
      </p>
    </GlassCard>
  )
}
