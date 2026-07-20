import { useEffect, useMemo, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { toast } from 'sonner'
import { makeTokens, type Tokens, FONT, Icon, type IconName } from '../ui'
import { cn } from '../lib/cn'
import { useTheme } from '../lib/theme'
import { useAuth } from '../lib/auth'
import { useAsync } from '../lib/useAsync'
import { apiGet, apiPost } from '../lib/api.js'
import { supabase } from '../lib/supabase.js'
import { sayi } from '../lib/format'
import { sesAcikMi, sesToggle } from '../lib/ses'
import { AVATARS, getAvatarSrc } from '../lib/avatars'
import { ROZETLER } from '../lib/rozetler'
import { TIER_TR, type LigYaniti, type RontgenYanit } from '../lib/types'
import { GlassCard, GlowButton, Chip, Badge, SectionLabel, Skeleton } from '../components/ui'
import { SinifKatilKarti } from '../components/SinifKatil'
import { rolBul, ROL_ADI } from '../lib/rol'
import { Reveal } from '../components/fx'
import { Halka, Sayi, Tip, PanelBaslik } from '../components/cekirdek'
import { SubjectChart } from '../components/SubjectChart'

/* ═══════════════════════════════════════════════════════════════════════════
   PROFİL — hesap merkezi.
   Kimlik hero (avatar seçici + rütbe) · 3 büyük stat · Lig tablosu ·
   Günlük Görevler (claim) · Seri Dondurması · Sefer sahnesi + Fener ·
   Sekmeli istatistikler · Rozet galerisi · Hesap (tema/ses/çıkış/KVKK silme).
   ═══════════════════════════════════════════════════════════════════════════ */

// Rütbe eşikleri = backend levelFromCorrect (correctAnswers üzerinden).
const ESIK = [0, 5, 15, 30, 60, 100, 150, 200]
const RUTBE = ['Er', 'Onbaşı', 'Çavuş', 'Astsubay', 'Teğmen', 'Üsteğmen', 'Yüzbaşı', 'Kaptan']

function rutbeHesap(correct: number) {
  let lvl = 1
  for (let i = 0; i < ESIK.length; i++) if (correct >= ESIK[i]) lvl = i + 1
  const cur = ESIK[lvl - 1]
  const next = ESIK[lvl] ?? cur
  const oran = next > cur ? (correct - cur) / (next - cur) : 1
  return { lvl, ad: RUTBE[lvl - 1] ?? 'Kaptan', oran, kalan: Math.max(0, next - correct) }
}

function sonrakiMilat(seri: number) {
  for (const mlt of [7, 14, 30, 60, 100, 200, 365]) if (seri < mlt) return mlt
  return seri
}

export function Ben() {
  const { theme, toggle } = useTheme()
  const { t } = useTheme()
  const { profile, user, signOut, refreshProfile } = useAuth()
  const gami = useAsync<any>(() => apiPost('/gamification/daily', {}), [])
  const lig = useAsync<LigYaniti>(() => apiGet('/gamification/league'), [])
  const rontgen = useAsync<RontgenYanit>(() => apiGet('/mastery/rontgen'), [])
  const [fener, setFener] = useState(false)
  const [sesli, setSesli] = useState(sesAcikMi)

  const G = gami.data?.gamification
  const ad = profile?.name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'Denizci'
  const correct = G?.correctAnswers ?? 0
  const r = rutbeHesap(correct)
  const seri = G?.streak?.count ?? 0
  const rozetIdleri = useMemo(
    () => Object.keys((profile?.unlocked_badges as Record<string, unknown>) ?? {}),
    [profile?.unlocked_badges],
  )
  const avatarSrc = getAvatarSrc(profile?.avatar)
  // Oyunlaştırma bölümleri (rütbe, seri, lig, görev, rozet, istatistik) ÖĞRENCİYE
  // özgüdür. Öğretmen/yönetici için bu veriler HİÇ üretilmez; göstermek boş
  // kartlar ve anlamsız sıfırlar demekti. Onlara yalnız Hesap bölümü kalır.
  const ogrenci = rolBul(profile) === 'student'

  if (fener) return <Fener onClose={() => setFener(false)} streakDays={seri} solved={G?.totalSolved ?? 0} />

  return (
    <div className="mx-auto max-w-4xl px-[clamp(16px,3.5vw,44px)] pb-20 pt-9">
      {/* ── Kimlik hero ── */}
      <Reveal>
        <div className="glass rounded-3xl px-7 py-6">
          <div className="flex flex-wrap items-center gap-6">
            <div className="relative">
              {/* Rütbe halkası doğru cevap sayısından türer — öğretmen/yönetici
                  soru çözmediği için hep 0 olurdu. Onlarda düz çerçeve. */}
              <Halka oran={ogrenci ? r.oran : 0} boyut={104} kalinlik={6} renk="#C99A4A">
                <span className="grid size-[84px] place-items-center overflow-hidden rounded-full border-2 border-brass-500/70 bg-gradient-to-br from-[#24487F] to-[#0C1B2E]">
                  {avatarSrc
                    ? <img src={avatarSrc} alt={`${ad} avatarı`} className="size-full object-cover" />
                    : <span className="font-display text-3xl font-bold text-[#E8D3A8]">{ad.charAt(0).toUpperCase()}</span>}
                </span>
              </Halka>
              {ogrenci && (
                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg border-2 border-white bg-brass-500 px-2.5 py-0.5 font-display text-[11px] font-extrabold text-white dark:border-ocean-900">
                  Rütbe {r.lvl}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-[24px] font-bold tracking-tight text-slate-800 dark:text-slate-100">{ad}</h1>
              <p className="mt-0.5 text-[13px] text-slate-500 dark:text-slate-400">
                {ogrenci ? `${r.ad} · YKS yolcusu` : ROL_ADI[rolBul(profile)]}
              </p>
              {ogrenci && (
              <div className="mt-3 max-w-xs">
                <div className="mb-1.5 flex justify-between font-mono text-[10.5px] text-slate-400 dark:text-slate-500">
                  <span>sonraki rütbe</span>
                  <span>{r.kalan > 0 ? `${r.kalan} doğru kaldı` : 'en yüksek rütbe'}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-shore-200 dark:bg-ocean-800">
                  <div className="h-full rounded-full bg-gradient-to-r from-brass-500 to-amber-400" style={{ width: `${r.oran * 100}%` }} />
                </div>
              </div>
              )}
            </div>
            <AvatarSecici mevcutId={profile?.avatar ?? null} onKaydet={refreshProfile} />
          </div>
        </div>
      </Reveal>

      {/* ── 3 büyük stat — yalnız öğrenci ── */}
      {ogrenci && (
      <Reveal delay={0.06}>
        <div className="mt-5 grid grid-cols-3 gap-3">
          <BuyukStat icon="flame" renk="text-amber-500" deger={<Sayi value={seri} />} birim="gün seri" onClick={() => setFener(true)} />
          <BuyukStat icon="sparkle" renk="text-amber-400" deger={<Sayi value={G?.xp ?? 0} />} birim="toplam XP" />
          <BuyukStat icon="trophy" renk="text-brass-500" deger={TIER_TR[G?.league?.tier] ?? '—'} birim={`${sayi(G?.league?.weeklyXP)} XP/hafta`} />
        </div>
      </Reveal>
      )}

      {/* ── Lig tablosu — yalnız öğrenci ── */}
      {ogrenci && (
      <Reveal delay={0.1}>
        <div className="mt-7">
          <SectionLabel>Bu Haftanın Ligi</SectionLabel>
          {lig.loading ? <Skeleton className="h-44" /> : lig.data ? (
            <GlassCard blur={false} className="px-5 py-4">
              <div className="mb-3 flex items-center justify-between">
                <Chip tone="brass" icon="trophy">{TIER_TR[lig.data.tier] ?? lig.data.tier} Ligi</Chip>
                <span className="font-mono text-[11px] text-slate-400 dark:text-slate-500">
                  {lig.data.benimSira ? `sıran: ${lig.data.benimSira}` : lig.data.katilimci >= 50 ? 'sıran: 50+' : 'henüz sıralamada değilsin'}
                </span>
              </div>
              {lig.data.top.length ? (
                <div className="space-y-1">
                  {lig.data.top.map((s) => (
                    <div
                      key={s.rank}
                      className={cn(
                        'flex items-center gap-3 rounded-xl px-3 py-2',
                        s.ben && 'bg-sky-500/8 ring-1 ring-sky-500/25 dark:bg-sky-400/8',
                      )}
                    >
                      <span className={cn(
                        'w-6 text-center font-display text-[13px] font-bold',
                        s.rank === 1 ? 'text-amber-500' : s.rank === 2 ? 'text-slate-400' : s.rank === 3 ? 'text-amber-700' : 'text-slate-400 dark:text-slate-500',
                      )}>
                        {s.rank}
                      </span>
                      <span className={cn(
                        'min-w-0 flex-1 truncate text-[13px] font-medium',
                        s.ben ? 'text-sky-700 dark:text-sky-300' : 'text-slate-600 dark:text-slate-300',
                      )}>
                        {s.name}{s.ben && ' (sen)'}
                      </span>
                      <span className="font-mono text-[11.5px] text-slate-400 dark:text-slate-500">{sayi(s.weeklyXP)} XP</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-3 text-center text-xs text-slate-400 dark:text-slate-500">
                  Bu hafta ligde henüz kimse yok — ilk XP'yi sen yaz.
                </p>
              )}
            </GlassCard>
          ) : null}
        </div>
      </Reveal>
      )}

      {/* ── Günlük Görevler — yalnız öğrenci ── */}
      {ogrenci && G?.dailyQuests?.quests?.length > 0 && (
        <Reveal delay={0.14}>
          <div className="mt-7">
            <SectionLabel>Günlük Görevler</SectionLabel>
            <GorevListesi quests={G.dailyQuests.quests} onClaimed={() => gami.reload()} />
          </div>
        </Reveal>
      )}

      {/* ── Seri Dondurması — yalnız öğrenci ── */}
      {ogrenci && (
      <Reveal delay={0.18}>
        <DondurmaKarti streak={G?.streak} onKullanildi={() => gami.reload()} />
      </Reveal>
      )}

      {/* ── Sefer sahnesi — yalnız öğrenci ── */}
      {ogrenci && (
      <Reveal delay={0.22}>
        <div className="mt-7">
          <VoyageStreak t={t} streakDays={seri} goal={sonrakiMilat(seri)} onFener={() => setFener(true)} />
        </div>
      </Reveal>
      )}

      {/* ── Sekmeli istatistikler — yalnız öğrenci ── */}
      {ogrenci && (
      <Reveal delay={0.26}>
        <div className="mt-7">
          <SectionLabel>İstatistikler</SectionLabel>
          <Istatistikler G={G} rontgen={rontgen.data} rozetSayisi={rozetIdleri.length} />
        </div>
      </Reveal>
      )}

      {/* ── Rozet galerisi — yalnız öğrenci ── */}
      {ogrenci && (
      <Reveal delay={0.3}>
        <div className="mt-7">
          <SectionLabel>Rozetler · {rozetIdleri.length}/{ROZETLER.length}</SectionLabel>
          <GlassCard blur={false} className="px-5 py-4">
            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5 md:grid-cols-7">
              {ROZETLER.map((rz) => {
                const acik = rozetIdleri.includes(rz.id)
                return (
                  <Tip key={rz.id} icerik={
                    <div>
                      <div className="font-display font-semibold">{rz.ad}</div>
                      <div className="mt-0.5 text-[11px]">{rz.kosul}{acik ? ' · kazanıldı' : ''}</div>
                    </div>
                  }>
                    <div className={cn(
                      'flex cursor-default flex-col items-center gap-1.5 rounded-xl px-2 py-3 transition-transform hover:scale-105',
                      acik ? 'bg-brass-500/10' : 'opacity-40 grayscale',
                    )}>
                      <span className={cn(
                        'grid size-10 place-items-center rounded-full',
                        acik ? 'bg-gradient-to-br from-brass-400 to-brass-600 text-white' : 'bg-slate-200 text-slate-400 dark:bg-ocean-800',
                      )}>
                        <Icon name={rz.icon} size={18} color="currentColor" />
                      </span>
                      <span className="text-center font-display text-[10px] font-semibold leading-tight text-slate-500 dark:text-slate-400">
                        {rz.ad}
                      </span>
                    </div>
                  </Tip>
                )
              })}
            </div>
          </GlassCard>
        </div>
      </Reveal>
      )}

      {/* ── Sınıfım — kod ile katıl/ayrıl. Yalnız öğrenci: öğretmen sınıfı KURAR,
             katılmaz; katılım ucu zaten role='student' arıyor. ── */}
      {ogrenci && (
      <Reveal delay={0.32}>
        <SinifKatilKarti />
      </Reveal>
      )}

      {/* ── Hesap merkezi ── */}
      <Reveal delay={0.36}>
        <div className="mt-7">
          <SectionLabel>Hesap</SectionLabel>
          <GlassCard blur={false} className="divide-y divide-slate-500/10 px-5 dark:divide-sky-500/10">
            <HesapSatiri baslik="Ad" deger={ad} />
            <HesapSatiri baslik="E-posta" deger={user?.email ?? '—'} />
            <div className="flex items-center justify-between py-3.5">
              <span className="text-[13px] font-medium text-slate-600 dark:text-slate-300">Tema</span>
              <button
                onClick={toggle}
                className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300/50 px-3 py-1.5 font-display text-[12px] font-semibold text-slate-500 transition-colors hover:border-sky-500/40 hover:text-slate-700 dark:border-ocean-700 dark:text-slate-400 dark:hover:text-slate-200"
              >
                <Icon name={theme === 'light' ? 'sun' : 'moon'} size={14} color="currentColor" />
                {theme === 'light' ? 'Güverte (açık)' : 'Gece Vardiyası (koyu)'}
              </button>
            </div>
            <div className="flex items-center justify-between py-3.5">
              <span className="text-[13px] font-medium text-slate-600 dark:text-slate-300">Ses efektleri</span>
              <button
                onClick={() => setSesli(sesToggle())}
                className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300/50 px-3 py-1.5 font-display text-[12px] font-semibold text-slate-500 transition-colors hover:border-sky-500/40 hover:text-slate-700 dark:border-ocean-700 dark:text-slate-400 dark:hover:text-slate-200"
              >
                <Icon name={sesli ? 'volume' : 'volumeOff'} size={14} color="currentColor" />
                {sesli ? 'Açık' : 'Kapalı'}
              </button>
            </div>
            <div className="flex items-center justify-between py-3.5">
              <span className="text-[13px] font-medium text-slate-600 dark:text-slate-300">Oturum</span>
              <GlowButton variant="outline" size="sm" onClick={() => signOut()}>Çıkış yap</GlowButton>
            </div>
            <TehlikeBolgesi onSil={async () => {
              await apiPost('/account/delete', {})
              await signOut()
            }} />
          </GlassCard>
        </div>
      </Reveal>
    </div>
  )
}

/* ── Büyük stat kartı ── */
function BuyukStat({ icon, renk, deger, birim, onClick }: {
  icon: IconName; renk: string; deger: React.ReactNode; birim: string; onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        'glass-solid relative overflow-hidden rounded-2xl px-4 py-4 text-left',
        onClick && 'cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-card',
      )}
    >
      <Icon name={icon} size={16} color="currentColor" style={{ opacity: 0.8 }} />
      <div className={cn('mt-2 truncate font-display text-[21px] font-bold leading-none', renk)}>{deger}</div>
      <div className="mt-1.5 text-[10.5px] text-slate-400 dark:text-slate-500">{birim}</div>
      <span className="absolute inset-x-0 bottom-0 h-0.5 bg-current opacity-25" />
    </button>
  )
}

/* ── Avatar seçici (Radix Dialog) — profiles.avatar kendi-satır güncellemesi ── */
function AvatarSecici({ mevcutId, onKaydet }: { mevcutId: string | null; onKaydet: () => Promise<void> }) {
  const { user } = useAuth()
  const [acik, setAcik] = useState(false)
  const [kaydediliyor, setKaydediliyor] = useState<string | null>(null)

  const sec = async (id: string) => {
    if (!user?.id || kaydediliyor) return
    setKaydediliyor(id)
    const { error } = await supabase.from('profiles').update({ avatar: id }).eq('id', user.id)
    if (error) {
      toast.error('Avatar kaydedilemedi', { description: error.message })
    } else {
      await onKaydet()
      toast.success('Avatar güncellendi')
      setAcik(false)
    }
    setKaydediliyor(null)
  }

  return (
    <Dialog.Root open={acik} onOpenChange={setAcik}>
      <Dialog.Trigger asChild>
        <GlowButton variant="outline" size="sm" icon="edit">Avatar</GlowButton>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[85] bg-ocean-950/50 backdrop-blur-sm" />
        <Dialog.Content className="glass fixed left-1/2 top-1/2 z-[86] w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-3xl p-6 shadow-card">
          <Dialog.Title className="font-display text-[16px] font-bold text-slate-800 dark:text-slate-100">
            Avatarını seç
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            Lider tablosunda ve güvertede seni bu karakter temsil eder.
          </Dialog.Description>
          <div className="mt-4 grid grid-cols-4 gap-2.5">
            {AVATARS.map((a) => (
              <button
                key={a.id}
                onClick={() => sec(a.id)}
                disabled={kaydediliyor !== null}
                className={cn(
                  'cursor-pointer overflow-hidden rounded-2xl border-2 p-1 transition-all hover:scale-105',
                  mevcutId === a.id
                    ? 'border-sky-500 shadow-glow-sky'
                    : 'border-transparent hover:border-sky-500/40',
                  kaydediliyor === a.id && 'animate-pulse',
                )}
                title={a.label}
              >
                <img src={a.src} alt={a.label} className="aspect-square w-full rounded-xl object-cover" />
              </button>
            ))}
          </div>
          <Dialog.Close asChild>
            <button className="absolute right-4 top-4 grid size-8 cursor-pointer place-items-center rounded-lg text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-slate-200">
              <Icon name="close" size={16} color="currentColor" />
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/* ── Günlük görevler — claim + toast ── */
function GorevListesi({ quests, onClaimed }: { quests: any[]; onClaimed: () => void }) {
  const [busy, setBusy] = useState('')

  const al = async (q: any) => {
    setBusy(q.id)
    try {
      const r = await apiPost('/gamification/quests/claim', { questId: q.id })
      toast.success(`+${r?.rewardXP ?? q.rewardXP} XP`, { description: q.title })
      onClaimed()
    } catch (e: any) {
      toast.error('Ödül alınamadı', { description: e?.message })
    } finally {
      setBusy('')
    }
  }

  return (
    <GlassCard blur={false} className="divide-y divide-slate-500/10 px-5 dark:divide-sky-500/10">
      {quests.map((q) => {
        const tamam = q.progress >= q.target
        return (
          <div key={q.id} className="flex items-center gap-4 py-3.5">
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium text-slate-700 dark:text-slate-200">{q.title}</div>
              <div className="mt-1.5 flex items-center gap-2.5">
                <div className="h-1 max-w-52 flex-1 overflow-hidden rounded-full bg-shore-200 dark:bg-ocean-800">
                  <div
                    className={cn('h-full rounded-full transition-all duration-500', tamam ? 'bg-emerald-500' : 'bg-sky-500')}
                    style={{ width: `${Math.min(100, (q.progress / q.target) * 100)}%` }}
                  />
                </div>
                <span className="font-mono text-[10.5px] text-slate-400 dark:text-slate-500">{q.progress}/{q.target}</span>
              </div>
            </div>
            {q.claimed ? (
              <span className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-400">
                <Icon name="check" size={13} color="#10B981" strokeWidth={2.4} />alındı
              </span>
            ) : tamam ? (
              <GlowButton size="sm" disabled={busy === q.id} onClick={() => al(q)}>
                +{q.rewardXP} XP · Al
              </GlowButton>
            ) : (
              <span className="font-mono text-[11px] text-slate-400 dark:text-slate-500">+{q.rewardXP} XP</span>
            )}
          </div>
        )
      })}
    </GlassCard>
  )
}

/* ── Seri dondurması — 7 günlük seriyle hak edilir; burada yalnız HARCANIR ── */
function DondurmaKarti({ streak, onKullanildi }: { streak: any; onKullanildi: () => void }) {
  const [busy, setBusy] = useState(false)
  const hak = Number(streak?.freezesAvailable) || 0
  const bugun = new Date().toISOString().slice(0, 10)
  const bugunDondu = Array.isArray(streak?.freezeUsedDates) && streak.freezeUsedDates.includes(bugun)

  const kullan = async () => {
    setBusy(true)
    try {
      await apiPost('/gamification/streak/freeze', { consume: true })
      toast.success('Bugün donduruldu', { description: 'Seri bugün çözmesen de yaşar. Yarın görüşürüz.' })
      onKullanildi()
    } catch (e: any) {
      toast.error('Dondurma kullanılamadı', { description: e?.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="glass-solid mt-7 flex items-center gap-4 rounded-2xl px-5 py-4">
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-sky-500/10 text-sky-500 dark:text-sky-300">
        <Icon name="snowflake" size={21} color="currentColor" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-display text-[13.5px] font-bold text-slate-700 dark:text-slate-200">
          Seri Dondurması · {hak} hak
        </div>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-slate-400 dark:text-slate-500">
          Yoğun bir günde seriyi korur. Hak, 7 günlük seriyle otomatik kazanılır — satın alınmaz.
        </p>
      </div>
      {bugunDondu ? (
        <Badge tone="sky">bugün donduruldu</Badge>
      ) : (
        <GlowButton variant="outline" size="sm" disabled={hak === 0 || busy} onClick={kullan}>
          Bugünü dondur
        </GlowButton>
      )}
    </div>
  )
}

/* ── Sekmeli istatistikler ── */
function Istatistikler({ G, rontgen, rozetSayisi }: {
  G: any; rontgen: RontgenYanit | null; rozetSayisi: number
}) {
  const [sekme, setSekme] = useState<'genel' | 'dersler' | 'rekorlar'>('genel')

  const rekorlar = useMemo(() => {
    const trend = rontgen?.trend ?? []
    let enVerimli: { date: string; solved: number } | null = null
    let enIsabetli: { date: string; acc: number; solved: number } | null = null
    for (const g of trend) {
      if (!enVerimli || g.solved > enVerimli.solved) enVerimli = { date: g.date, solved: g.solved }
      if (g.solved >= 5) {
        const acc = Math.round((g.correct / g.solved) * 100)
        if (!enIsabetli || acc > enIsabetli.acc) enIsabetli = { date: g.date, acc, solved: g.solved }
      }
    }
    return { enVerimli, enIsabetli }
  }, [rontgen])

  return (
    <GlassCard blur={false} className="px-5 py-4">
      <div className="mb-4 flex gap-1 rounded-xl bg-shore-100/80 p-1 dark:bg-ocean-950/60">
        {([['genel', 'Genel'], ['dersler', 'Dersler'], ['rekorlar', 'Rekorlar']] as const).map(([k, adx]) => (
          <button
            key={k}
            onClick={() => setSekme(k)}
            className={cn(
              'flex-1 cursor-pointer rounded-lg py-1.5 font-display text-[12px] font-bold transition-colors',
              sekme === k
                ? 'bg-white text-slate-700 shadow-sm dark:bg-ocean-800 dark:text-slate-200'
                : 'text-slate-400 hover:text-slate-600 dark:text-slate-500',
            )}
          >
            {adx}
          </button>
        ))}
      </div>

      {sekme === 'genel' && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { icon: 'check' as IconName, ad: 'Doğru', deger: sayi(G?.correctAnswers) },
            { icon: 'target' as IconName, ad: 'Çözülen', deger: sayi(G?.totalSolved) },
            { icon: 'coin' as IconName, ad: 'Coin', deger: sayi(G?.coins) },
            { icon: 'medal' as IconName, ad: 'Rozet', deger: String(rozetSayisi) },
          ].map((s) => (
            <div key={s.ad} className="rounded-xl bg-shore-100/60 px-3.5 py-3 dark:bg-ocean-950/40">
              <Icon name={s.icon} size={15} color="currentColor" style={{ opacity: 0.55 }} />
              <div className="mt-1.5 font-display text-[18px] font-bold leading-none text-slate-700 dark:text-slate-200">{s.deger}</div>
              <div className="mt-1 text-[10.5px] text-slate-400 dark:text-slate-500">{s.ad}</div>
            </div>
          ))}
        </div>
      )}

      {sekme === 'dersler' && (
        Object.values(G?.subjects ?? {}).some((s: any) => (s?.solved ?? 0) > 0)
          ? <SubjectChart subjects={G.subjects} />
          : <p className="py-4 text-center text-xs text-slate-400 dark:text-slate-500">Ders verisi soru çözdükçe birikir.</p>
      )}

      {sekme === 'rekorlar' && (
        <div className="space-y-3">
          <RekorSatiri
            icon="bolt" ad="En verimli gün"
            deger={rekorlar.enVerimli ? `${rekorlar.enVerimli.solved} soru` : '—'}
            not={rekorlar.enVerimli?.date}
          />
          <RekorSatiri
            icon="target" ad="En isabetli gün (≥5 soru)"
            deger={rekorlar.enIsabetli ? `%${rekorlar.enIsabetli.acc}` : '—'}
            not={rekorlar.enIsabetli ? `${rekorlar.enIsabetli.solved} soruda · ${rekorlar.enIsabetli.date}` : undefined}
          />
          <RekorSatiri icon="sparkle" ad="Toplam XP" deger={sayi(G?.xp)} />
        </div>
      )}
    </GlassCard>
  )
}

function RekorSatiri({ icon, ad, deger, not }: { icon: IconName; ad: string; deger: string; not?: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-300">
        <Icon name={icon} size={15} color="currentColor" />
      </span>
      <span className="min-w-0 flex-1 text-[13px] text-slate-600 dark:text-slate-300">{ad}</span>
      <div className="text-right">
        <div className="font-display text-[14px] font-bold text-slate-700 dark:text-slate-200">{deger}</div>
        {not && <div className="font-mono text-[9.5px] text-slate-400 dark:text-slate-500">{not}</div>}
      </div>
    </div>
  )
}

function HesapSatiri({ baslik, deger }: { baslik: string; deger: string }) {
  return (
    <div className="flex items-center justify-between py-3.5">
      <span className="text-[13px] font-medium text-slate-600 dark:text-slate-300">{baslik}</span>
      <span className="truncate text-[13px] text-slate-400 dark:text-slate-500">{deger}</span>
    </div>
  )
}

/* ── KVKK tehlike bölgesi — Radix onay modalı ── */
function TehlikeBolgesi({ onSil }: { onSil: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  return (
    <div className="flex items-center justify-between py-3.5">
      <div>
        <span className="text-[13px] font-medium text-rose-600 dark:text-rose-300">Hesabı kalıcı sil</span>
        <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">Tüm verilerin geri döndürülemez şekilde silinir (KVKK).</p>
      </div>
      <Dialog.Root>
        <Dialog.Trigger asChild>
          <button className="cursor-pointer rounded-lg border border-rose-500/30 px-3 py-1.5 font-display text-[12px] font-semibold text-rose-600 transition-colors hover:bg-rose-500/10 dark:text-rose-300">
            Sil
          </button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[85] bg-ocean-950/50 backdrop-blur-sm" />
          <Dialog.Content className="glass fixed left-1/2 top-1/2 z-[86] w-[min(92vw,380px)] -translate-x-1/2 -translate-y-1/2 rounded-3xl p-6 shadow-card">
            <Dialog.Title className="font-display text-[16px] font-bold text-slate-800 dark:text-slate-100">
              Hesabını silmek üzeresin
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
              Ustalık haritan, serin, rozetlerin ve bahçen dahil TÜM verilerin kalıcı
              olarak silinir. Bu işlem geri alınamaz.
            </Dialog.Description>
            <div className="mt-5 flex justify-end gap-2.5">
              <Dialog.Close asChild>
                <button className="cursor-pointer rounded-xl px-4 py-2 font-display text-[13px] font-semibold text-slate-500 transition-colors hover:text-slate-700 dark:hover:text-slate-200">
                  Vazgeç
                </button>
              </Dialog.Close>
              <button
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  try { await onSil() } catch (e: any) {
                    toast.error('Hesap silinemedi', { description: e?.message })
                    setBusy(false)
                  }
                }}
                className="cursor-pointer rounded-xl bg-rose-600 px-4 py-2 font-display text-[13px] font-bold text-white transition-colors hover:bg-rose-500 disabled:opacity-50"
              >
                {busy ? 'Siliniyor…' : 'Evet, kalıcı sil'}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}

/* ═══ Sefer — deniz feneri hedefine yol alan gemi (streak'ten beslenir) ═══════
   SVG sahne korunur — inline token diliyle (tema-duyarlı, sanatsal parça). */
function VoyageStreak({ t, streakDays, goal, onFener }: { t: Tokens; streakDays: number; goal: number; onFener: () => void }) {
  const W = 640, H = 168, N = 14, marginX = 26
  const span = W - marginX * 2
  const pts = Array.from({ length: N }, (_, i) => ({ x: marginX + (span * i) / (N - 1), y: 80 + Math.sin(i * 0.82 + 0.4) * 22 }))
  const oran = Math.max(0, Math.min(1, goal ? streakDays / goal : 0))
  const shipIdx = Math.max(0, Math.min(N - 1, Math.round(oran * (N - 1))))
  const ship = pts[shipIdx]
  const lh = pts[N - 1]
  const horizon = 56
  const routeLeft = t.isDark ? '#3A5675' : '#9DB4C4'

  const pathThrough = (from: number, to: number) => {
    let d = `M ${pts[from].x} ${pts[from].y}`
    for (let i = from + 1; i <= to; i++) {
      const p0 = pts[i - 1], p1 = pts[i], mx = (p0.x + p1.x) / 2
      d += ` Q ${mx} ${p0.y}, ${mx} ${(p0.y + p1.y) / 2} T ${p1.x} ${p1.y}`
    }
    return d
  }

  const sky1 = t.isDark ? '#0B1E3A' : '#2E6BA8', sky2 = t.isDark ? '#123457' : '#7FB3D9'
  const sun = t.isDark ? '#F0B429' : '#FFD27A'
  const sea1 = t.isDark ? '#0F3355' : '#2C8FBF', sea2 = t.isDark ? '#071B30' : '#12567F'
  const foam = t.isDark ? '#5C86A8' : '#EAF6FB', wave = t.isDark ? '#1E4468' : '#3E9AC4'

  return (
    <div className="glass-solid overflow-hidden rounded-2xl">
      <div className="flex items-center justify-between px-4 pb-2.5 pt-3.5">
        <PanelBaslik icon="flame" className="!mb-0">{streakDays} Günlük Sefer</PanelBaslik>
        <button
          onClick={onFener}
          className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 font-display text-[11px] font-semibold text-amber-600 dark:text-amber-300"
        >
          Fener<Icon name="chevronRight" size={12} color="currentColor" />
        </button>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full">
        <defs>
          <linearGradient id="bsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={sky1} /><stop offset="100%" stopColor={sky2} /></linearGradient>
          <linearGradient id="bsea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={sea1} /><stop offset="100%" stopColor={sea2} /></linearGradient>
          <radialGradient id="bsun" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor={sun} stopOpacity={t.isDark ? '0.55' : '0.9'} /><stop offset="100%" stopColor={sun} stopOpacity="0" /></radialGradient>
          <radialGradient id="bbeam" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor={t.gold} stopOpacity="0.7" /><stop offset="100%" stopColor={t.gold} stopOpacity="0" /></radialGradient>
          <linearGradient id="blh" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor={t.isDark ? '#C9BFA8' : '#FFFFFF'} /><stop offset="100%" stopColor={t.isDark ? '#8A7E62' : '#D8CEB8'} /></linearGradient>
          <linearGradient id="bsail" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#FFFFFF" /><stop offset="100%" stopColor="#D9CFB6" /></linearGradient>
          <clipPath id="bscene"><rect x="0" y="0" width={W} height={H} /></clipPath>
        </defs>
        <g clipPath="url(#bscene)">
          <rect x="0" y="0" width={W} height={horizon + 8} fill="url(#bsky)" />
          {t.isDark && [[40, 16], [110, 24], [190, 12], [300, 20], [400, 14], [500, 26], [250, 28]].map(([sx, sy], i) => (
            <circle key={i} cx={sx} cy={sy} r={i % 2 ? 0.9 : 1.3} fill="#CFE0F5" opacity="0.8"><animate attributeName="opacity" values="0.3;0.9;0.3" dur={`${2 + (i % 3)}s`} repeatCount="indefinite" /></circle>
          ))}
          <circle cx={lh.x} cy={horizon} r="48" fill="url(#bsun)" />
          <circle cx={lh.x} cy={horizon - 4} r="11" fill={sun} opacity={t.isDark ? 0.85 : 1} />
          <rect x="0" y={horizon} width={W} height={H - horizon} fill="url(#bsea)" />
          {[68, 84, 100, 120, 140].map((wy, i) => (
            <path key={i} d={`M-10 ${wy} q 30 -5 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0`} fill="none" stroke={wave} strokeWidth={1.5 + i * 0.3} strokeLinecap="round" opacity={0.28 + i * 0.11}>
              <animate attributeName="d" dur={`${5 + i}s`} repeatCount="indefinite"
                values={`M-10 ${wy} q 30 -5 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0;
                         M-10 ${wy} q 30 5 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0;
                         M-10 ${wy} q 30 -5 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0`} />
            </path>
          ))}
          <path d={pathThrough(shipIdx, N - 1)} fill="none" stroke={routeLeft} strokeWidth="2.5" strokeDasharray="1 7" strokeLinecap="round" opacity="0.85" />
          <path d={pathThrough(0, shipIdx)} fill="none" stroke={t.gold} strokeWidth="2.8" strokeDasharray="1 7" strokeLinecap="round" />
          {pts.map((p, i) => {
            if (i === shipIdx || i === N - 1) return null
            const passed = i < shipIdx
            return passed
              ? <g key={i}><circle cx={p.x} cy={p.y} r="4.5" fill={t.gold} stroke="#fff" strokeWidth="0.8" /></g>
              : <circle key={i} cx={p.x} cy={p.y} r="3.5" fill={t.isDark ? '#0A1524' : '#EAF2F6'} stroke={routeLeft} strokeWidth="1.6" />
          })}
          {/* Deniz feneri */}
          <g>
            <g style={{ transformOrigin: `${lh.x}px ${lh.y - 12}px` }}>
              <polygon points={`${lh.x},${lh.y - 12} ${lh.x - 44},${lh.y - 28} ${lh.x - 44},${lh.y + 2}`} fill="url(#bbeam)" opacity="0.5">
                <animateTransform attributeName="transform" type="rotate" values={`10 ${lh.x} ${lh.y - 12}; -10 ${lh.x} ${lh.y - 12}; 10 ${lh.x} ${lh.y - 12}`} dur="4s" repeatCount="indefinite" />
              </polygon>
            </g>
            <ellipse cx={lh.x} cy={lh.y + 13} rx="15" ry="4" fill={t.isDark ? '#0A2946' : '#4E7C9E'} />
            <polygon points={`${lh.x - 6},${lh.y + 12} ${lh.x - 4},${lh.y - 9} ${lh.x + 4},${lh.y - 9} ${lh.x + 6},${lh.y + 12}`} fill="url(#blh)" stroke={t.brass} strokeWidth="0.8" />
            <polygon points={`${lh.x - 5},${lh.y + 6} ${lh.x + 5},${lh.y + 6} ${lh.x + 5.4},${lh.y + 10} ${lh.x - 5.4},${lh.y + 10}`} fill={t.wrong} opacity="0.85" />
            <rect x={lh.x - 5} y={lh.y - 11} width="10" height="2.5" rx="1" fill={t.brass} />
            <circle cx={lh.x} cy={lh.y - 14} r="2.6" fill="#FFF3C4"><animate attributeName="opacity" values="1;0.55;1" dur="1.6s" repeatCount="indefinite" /></circle>
            <polygon points={`${lh.x - 4},${lh.y - 17} ${lh.x + 4},${lh.y - 17} ${lh.x},${lh.y - 22}`} fill={t.brass} />
            <text x={lh.x} y={lh.y + 28} textAnchor="middle" fontSize="9" fontWeight="700" fontFamily={FONT.display} fill={t.isDark ? '#AEB9C9' : '#4A5A72'}>{goal}. gün</text>
          </g>
          {/* Gemi */}
          <g transform={`translate(${ship.x}, ${ship.y})`}>
            <g>
              <animateTransform attributeName="transform" type="rotate" values="-3 0 0; 3 0 0; -3 0 0" dur="3.2s" repeatCount="indefinite" additive="sum" />
              <animateTransform attributeName="transform" type="translate" values="0 -1.5; 0 1.5; 0 -1.5" dur="2.6s" repeatCount="indefinite" additive="sum" />
              <circle cx="0" cy="-3" r="20" fill={t.ember} opacity="0.14" />
              <path d="M-16 8 q 8 4 16 0" fill="none" stroke={foam} strokeWidth="2.4" strokeLinecap="round" opacity="0.85" />
              <path d="M-12 2 L12 2 L9 10 L-9 10 Z" fill={t.action} />
              <path d="M-12 2 L12 2 L11 4.5 L-12 4.5 Z" fill="#0C1B2E" opacity="0.35" />
              <line x1="-9.5" y1="4.6" x2="10" y2="4.6" stroke={t.brass} strokeWidth="0.8" opacity="0.7" />
              <rect x="-0.9" y="-15" width="1.8" height="17" fill={t.brass} />
              <path d="M1.4 -14 C 11 -11, 11 -3, 9.5 -1 L1.4 -1 Z" fill="url(#bsail)" stroke={t.hairlineStrong} strokeWidth="0.4" />
              <path d="M-1.4 -12 C -9 -9, -9 -3, -8 -1 L-1.4 -1 Z" fill="#EDE3CA" stroke={t.hairlineStrong} strokeWidth="0.4" />
              <path d="M1 -15 q 7 1 4 3.5 q 3 -0.5 0 3" fill={t.ember} />
            </g>
          </g>
        </g>
      </svg>

      <div className="flex items-center justify-between px-4 pb-3.5 pt-2.5">
        <span className="text-[11.5px] text-slate-500 dark:text-slate-400">
          <span className="font-display font-bold text-amber-500">{streakDays}</span> gün yol alındı
        </span>
        <span className="text-[11.5px] text-slate-400 dark:text-slate-500">
          Feneri görmene <span className="font-semibold text-slate-600 dark:text-slate-300">{Math.max(0, goal - streakDays)} gün</span> kaldı
        </span>
      </div>
    </div>
  )
}

/* ═══ Fener kutlaması — tam ekran (korundu, palet uyumlu) ═══════════════════ */
const KONFETI = ['#183659', '#F0B429', '#38BDF8', '#F4FAFF', '#B98A44', '#27935F', '#22D3EE']
interface P { id: number; vx: number; vy: number; color: string; size: number; shape: number; rot: number; rotV: number; g: number; delay: number }
function konfetiYap(): P[] {
  return Array.from({ length: 46 }, (_, i) => {
    const a = (i / 46) * Math.PI * 2 + (i % 5) * 0.11
    const speed = 130 + (i % 7) * 26
    return { id: i, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 90, color: KONFETI[i % KONFETI.length], size: 5 + (i % 5), shape: i % 3, rot: i * 30, rotV: (i % 2 ? 1 : -1) * (360 + i * 10), g: 210 + (i % 4) * 30, delay: (i % 6) * 0.05 }
  })
}

function Fener({ onClose, streakDays, solved }: { onClose: () => void; streakDays: number; solved: number }) {
  const t = makeTokens('dark')
  const [phase, setPhase] = useState<'stamp' | 'go'>('stamp')
  const [parts] = useState(konfetiYap)
  const [tk, setTk] = useState(0)
  const raf = useRef(0)
  const start = useRef<number | null>(null)

  useEffect(() => { const id = setTimeout(() => setPhase('go'), 550); return () => clearTimeout(id) }, [])
  useEffect(() => {
    if (phase !== 'go') return
    start.current = null
    const step = (ts: number) => {
      if (!start.current) start.current = ts
      const e = (ts - start.current) / 1000
      setTk(e)
      if (e < 3) raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [phase])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'linear-gradient(180deg,#020C1A,#0A1524 55%,#0D1E35)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', fontFamily: FONT.body }}>
      <style>{`
        @keyframes stampIn { 0%{transform:scale(2.2);opacity:0} 60%{transform:scale(0.92);opacity:1} 80%{transform:scale(1.05)} 100%{transform:scale(1)} }
        @keyframes flick { 0%,100%{transform:scale(1)} 50%{transform:scale(1.05)} }
        @keyframes ringP { 0%,100%{transform:scale(1);opacity:0.5} 50%{transform:scale(1.14);opacity:0.15} }
      `}</style>

      {phase === 'go' && (
        <svg viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
          {parts.map((p) => {
            const e = Math.max(0, tk - p.delay)
            const x = 195 + p.vx * e, y = 300 + p.vy * e + 0.5 * p.g * e * e
            const op = Math.max(0, 1 - e / 2.6), rot = p.rot + p.rotV * e, s = p.size
            if (y > 900 || op <= 0) return null
            if (p.shape === 0) return <circle key={p.id} cx={x} cy={y} r={s / 2} fill={p.color} opacity={op} />
            if (p.shape === 1) return <rect key={p.id} x={x - s / 2} y={y - s / 3} width={s} height={s * 0.6} fill={p.color} opacity={op} transform={`rotate(${rot} ${x} ${y})`} />
            return <polygon key={p.id} points={`${x},${y - s} ${x + s * 0.6},${y} ${x},${y + s} ${x - s * 0.6},${y}`} fill={p.color} opacity={op} transform={`rotate(${rot} ${x} ${y})`} />
          })}
        </svg>
      )}

      <div style={{ position: 'absolute', width: 260, height: 260, borderRadius: '50%', background: 'radial-gradient(circle,rgba(244,112,46,0.22),transparent 70%)', top: '50%', left: '50%', transform: 'translate(-50%,-78%)', pointerEvents: 'none' }} />
      <div style={{ width: 92, height: 92, borderRadius: '50%', background: 'radial-gradient(circle at 50% 62%,#F4702E,#F0B429 45%,rgba(240,180,41,0.15) 78%,transparent)', display: 'grid', placeItems: 'center', marginBottom: 22, boxShadow: '0 0 44px rgba(244,112,46,0.5),0 0 90px rgba(244,112,46,0.24)', animation: 'flick 1.8s ease-in-out infinite' }}>
        <Icon name="flame" size={40} color="#FFF3E0" strokeWidth={1.8} />
      </div>

      <div style={{ position: 'relative', width: 84, height: 84, borderRadius: '50%', background: 'linear-gradient(145deg,#D4A040,#B98A44 50%,#8A6030)', border: '4px solid #F0B429', display: 'grid', placeItems: 'center', marginBottom: 22, boxShadow: '0 0 28px rgba(185,138,68,0.6),inset 0 2px 8px rgba(240,180,41,0.4)', animation: phase === 'stamp' ? 'stampIn 0.55s cubic-bezier(0.34,1.56,0.64,1) forwards' : 'none' }}>
        <div style={{ position: 'absolute', inset: -8, borderRadius: '50%', border: '2px dashed #B98A44', opacity: 0.5, animation: 'ringP 2.5s ease-in-out infinite' }} />
        <span style={{ fontSize: 30, fontWeight: 900, color: '#1A0D00', fontFamily: FONT.display, lineHeight: 1 }}>{streakDays}</span>
      </div>

      <div style={{ fontSize: 30, fontWeight: 900, color: '#F4FAFF', fontFamily: FONT.display, letterSpacing: -0.5, textShadow: '0 2px 24px rgba(244,112,46,0.35)' }}>{streakDays} gün.</div>
      <div style={{ fontSize: 17, fontWeight: 500, color: '#AEB9C9', fontFamily: FONT.display, marginTop: 6, marginBottom: 28 }}>Fener hiç sönmedi.</div>

      <button onClick={onClose} style={{ background: t.action, color: t.onAction, border: 'none', borderRadius: 14, padding: '14px 52px', fontSize: 16, fontWeight: 700, fontFamily: FONT.display, cursor: 'pointer' }}>Devam</button>
      <div style={{ fontSize: 11, color: '#3D5070', marginTop: 18 }}>Seride {streakDays} gün · {solved} soru çözüldü</div>
    </div>
  )
}
