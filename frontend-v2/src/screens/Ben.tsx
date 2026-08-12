import { useEffect, useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useNavigate } from 'react-router-dom'
import { useReducedMotion } from 'framer-motion'
import { toast } from 'sonner'
import { Icon } from '../ui'
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
import { TIER_TR, type LigYaniti } from '../lib/types'
import { rolBul, ROL_ADI } from '../lib/rol'
import { Reveal } from '../components/fx'
import { SeriFidani, seriSonrakiKademe } from '../components/SeriFidani'
import { OturumlarKarti } from '../components/oturumlar'

/* ═══════════════════════════════════════════════════════════════════════════
   PROFİLİM — onaylı önizleme portu (`docs/design/onizleme/profilim.html`).
   Hero (avatar + lig/seri/toplam çipleri + Seviye halkası) · Streak Fidanı ·
   Rozet galerisi · Lig tablosu (ORKESTRATÖR kararı: korunur) · Günlük görevler ·
   Analizler köprüsü (SubjectChart bu ekrandan ÇIKTI — sahibi Analizler) ·
   Sınıf kartı (ayrılma Dialog'lu) · Ayarlar (tema/ses/bildirim/hedef/çıkış/KVKK).
   Fener + Sefer sahnesi (denizcilik) EMEKLİ — kullanım kaldırıldı.
   Veri: /gamification/daily · /gamification/league · /sinif · profil satırı.
   ═══════════════════════════════════════════════════════════════════════════ */

// Seviye eşikleri = backend levelFromCorrect aynası (correctAnswers üzerinden).
const ESIK = [0, 5, 15, 30, 60, 100, 150, 200]

function seviyeHesap(correct: number) {
  let lvl = 1
  for (let i = 0; i < ESIK.length; i++) if (correct >= ESIK[i]) lvl = i + 1
  const cur = ESIK[lvl - 1]
  const next = ESIK[lvl] ?? cur
  const oran = next > cur ? (correct - cur) / (next - cur) : 1
  return { lvl, oran, kalan: Math.max(0, next - correct) }
}

const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

const TIER_EMOJI: Record<string, string> = {
  bronze: '🥉', silver: '🥈', gold: '🥇', sapphire: '💠', diamond: '💎',
}

/**
 * Bugünün ISO gün anahtarı — ÖĞRENCİ GÜNÜ (Europe/Istanbul).
 *
 * ⚠️ Eskiden TARAYICI YERELİ kullanılıyordu ve sunucu `todayISO()` ile karşılaştırılıyordu.
 * Sunucu tarafı UTC olduğu için gece 00:00–03:00 arasında iki taraf farklı gün üretiyordu:
 * "bugün tamamlandı ✓" rozeti çıkmıyor, yerine "Bugünü dondur" butonu beliriyor ve öğrenci
 * basarsa sunucunun "dünü" için bir dondurma hakkını BOŞA harcıyordu (o gün zaten aktifti).
 * Sunucu artık Europe/Istanbul kullanıyor (lib/gamification.ts); istemci de aynı sınırda
 * olmalı — yurt dışındaki bir kullanıcının tarayıcı saati bu kararı değiştirmemeli.
 */
const bugunIso = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' })

export function Ben() {
  const nav = useNavigate()
  const { profile, user, signOut, refreshProfile } = useAuth()
  const gami = useAsync<any>(() => apiPost('/gamification/daily', {}), [])
  const lig = useAsync<LigYaniti>(() => apiGet('/gamification/league'), [])

  const G = gami.data?.gamification
  const ad = profile?.name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'Öğrenci'
  const seri = G?.streak?.count ?? 0
  const sv = seviyeHesap(G?.correctAnswers ?? 0)
  const rozetIdleri = useMemo(
    () => Object.keys((profile?.unlocked_badges as Record<string, unknown>) ?? {}),
    [profile?.unlocked_badges],
  )
  const avatarSrc = getAvatarSrc(profile?.avatar)
  const katildi = useMemo(() => {
    const raw = profile?.created_at
    if (!raw) return null
    const d = new Date(raw)
    return Number.isNaN(d.getTime()) ? null : `${AYLAR[d.getMonth()]} ${d.getFullYear()}`
  }, [profile?.created_at])

  // Oyunlaştırma bölümleri (seviye, seri, lig, görev, rozet) ÖĞRENCİYE özgüdür.
  // Öğretmen/yönetici için bu veriler hiç üretilmez — onlara yalnız Ayarlar kalır.
  const ogrenci = rolBul(profile) === 'student'

  /**
   * "Tüm cihazlardan çık" — sunucudaki oturum defteri kapatılır, SONRA yerel çıkış.
   *
   * ⚠️ SIRA ÖNEMLİ: `signOut()` önce çağrılsaydı token silinir ve `/oturum/cikis-hepsi`
   * isteği kimliksiz gider (401) — diğer cihazlar açık kalırdı. Kullanıcı "her yerden
   * çıktım" sanırken kaybettiği telefonu hâlâ içeride olurdu.
   */
  const hepsindenCik = async (): Promise<void> => {
    await apiPost('/oturum/cikis-hepsi', {})
    await signOut()
  }

  // Sayfanın TEK birincil eylemi: ilk talep edilebilir "Ödülü al" (FİDAN anayasa §1).
  const quests: any[] = ogrenci ? (G?.dailyQuests?.quests ?? []) : []
  const ilkTalep = quests.findIndex((q) => !q.claimed && q.progress >= q.target)

  return (
    <div className="mx-auto max-w-[1152px] px-[clamp(16px,3.5vw,44px)] pb-20 pt-9">
      <style>{`
        .pf-kart { background: var(--cam); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
          border: 1px solid var(--cam-kenar); border-radius: 20px; padding: 22px; box-shadow: var(--golge);
          position: relative; overflow: hidden; transition: transform .2s ease, box-shadow .2s ease; }
        .pf-kart:hover { transform: translateY(-3px); box-shadow: var(--golge-h); }
        .pf-h2 { font-family: Outfit, sans-serif; font-weight: 700; font-size: 17.5px; color: var(--metin1); }
        .pf-bikon { width: 30px; height: 30px; border-radius: 10px; display: grid; place-items: center; flex: 0 0 auto; }
        .pf-bikon svg { width: 16px; height: 16px; }
        .pf-baslik { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
        .pf-aciklama { color: var(--metin2); font-size: 14px; }
        .pf-cip { display: inline-flex; align-items: center; gap: 6px; padding: 4px 11px; border-radius: 12px;
          font-size: 12.5px; font-weight: 600; background: color-mix(in srgb, var(--adacayi) 18%, transparent); color: var(--vurgu); }
        .pf-cta { border: none; cursor: pointer; border-radius: 12px; padding: 10px 18px; font-family: Inter, sans-serif;
          font-weight: 600; font-size: 14px; display: inline-flex; align-items: center; gap: 7px; background: var(--cta); color: #fff;
          transition: box-shadow .2s, transform .15s; }
        .pf-cta:hover { box-shadow: var(--parilti); transform: translateY(-1px); }
        .pf-cta:disabled { opacity: .55; cursor: default; transform: none; box-shadow: none; }
        .pf-dis { background: transparent; color: var(--vurgu); border: 1px solid color-mix(in srgb, var(--vurgu) 35%, transparent);
          cursor: pointer; border-radius: 12px; padding: 10px 16px; font-family: Inter, sans-serif; font-weight: 600; font-size: 13.5px;
          display: inline-flex; align-items: center; gap: 7px; transition: background .15s; }
        .pf-dis:hover { background: var(--ic); }
        .pf-dis:disabled { opacity: .55; cursor: default; }
        .pf-kucuk { padding: 7px 13px; font-size: 13px; }
        .pf-tehlike { background: transparent; color: var(--yanlis); border: 1px solid color-mix(in srgb, var(--yanlis) 35%, transparent);
          cursor: pointer; border-radius: 12px; padding: 7px 13px; font-family: Inter, sans-serif; font-weight: 600; font-size: 13px;
          transition: background .15s; }
        .pf-tehlike:hover { background: color-mix(in srgb, var(--yanlis) 10%, transparent); }
        .pf-rozet { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; }
        .pf-rozet.dogru { background: color-mix(in srgb, var(--dogru) 14%, transparent); color: var(--dogru); }
        .pf-rozet.buz { background: color-mix(in srgb, var(--bilgi) 16%, transparent); color: var(--bilgi); }
        .pf-rzler { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 12px; margin-top: 12px; }
        .pf-rz { padding: 14px 10px; border-radius: 14px; background: var(--ic); text-align: center; transition: transform .15s; }
        .pf-rz:hover { transform: translateY(-3px); }
        .pf-rz-ikon { width: 44px; height: 44px; border-radius: 50%; margin: 0 auto 8px; display: grid; place-items: center;
          background: color-mix(in srgb, var(--yaprak) 16%, transparent); color: var(--vurgu); }
        .pf-rz b { display: block; font-size: 12.5px; line-height: 1.3; color: var(--metin1); }
        .pf-rz span { display: block; font-size: 10.5px; color: var(--metin3); margin-top: 3px; }
        .pf-rz.kilitli { opacity: .55; }
        .pf-rz.kilitli .pf-rz-ikon { background: var(--cizgi); filter: grayscale(1); color: var(--metin3); }
        .pf-gorev { display: flex; align-items: center; gap: 12px; padding: 12px; border-radius: 12px; background: var(--ic); }
        .pf-gorev + .pf-gorev { margin-top: 10px; }
        .pf-gikon { width: 34px; height: 34px; border-radius: 11px; display: grid; place-items: center; flex: 0 0 auto; font-size: 16px;
          background: color-mix(in srgb, var(--toprak) 20%, transparent); }
        .pf-gorev b { display: block; font-size: 13.5px; color: var(--metin1); }
        .pf-gcubuk { height: 6px; border-radius: 12px; background: var(--cizgi); margin-top: 6px; overflow: hidden; }
        .pf-gcubuk i { display: block; height: 100%; border-radius: 12px; background: linear-gradient(90deg, var(--adacayi), var(--yaprak)); }
        .pf-det { font-size: 11.5px; color: var(--metin3); }
        .pf-lig-satir { display: flex; align-items: center; gap: 12px; border-radius: 12px; padding: 8px 12px; }
        .pf-lig-satir.ben { background: color-mix(in srgb, var(--adacayi) 16%, transparent); }
        .pf-ayar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 0;
          border-top: 1px solid var(--cizgi); font-size: 14px; color: var(--metin1); }
        .pf-ayar:first-of-type { border-top: none; }
        .pf-secici { display: flex; background: var(--ic); border-radius: 10px; padding: 3px; }
        .pf-secici button { border: none; background: transparent; padding: 6px 12px; border-radius: 8px; font-family: Inter, sans-serif;
          font-weight: 600; font-size: 12.5px; color: var(--metin2); cursor: pointer; }
        .pf-secici button.aktif { background: var(--cam); color: var(--metin1); box-shadow: 0 1px 6px rgba(24,49,33,.1); }
        .pf-anahtar { width: 44px; height: 25px; border-radius: 999px; background: var(--yaprak); position: relative; cursor: pointer;
          border: none; transition: background .2s; flex: 0 0 auto; }
        .pf-anahtar.kapali { background: var(--cizgi); }
        .pf-anahtar::after { content: ""; position: absolute; top: 2.5px; left: 22px; width: 20px; height: 20px; border-radius: 50%;
          background: #fff; transition: left .2s; }
        .pf-anahtar.kapali::after { left: 2.5px; }
        .pf-anahtar:disabled { opacity: .55; cursor: default; }
        .pf-sayac { display: flex; align-items: center; gap: 8px; }
        .pf-sayac button { width: 32px; height: 32px; border-radius: 9px; border: 1px solid var(--cam-kenar); background: transparent;
          color: var(--metin2); cursor: pointer; font-size: 16px; line-height: 1; }
        .pf-sayac button:hover { background: var(--ic); }
        .pf-sayac button:disabled { opacity: .45; cursor: default; }
        .pf-sayac b { font-family: Outfit, sans-serif; min-width: 34px; text-align: center; color: var(--metin1); }
        .pf-modal { background: var(--cam); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
          border: 1px solid var(--cam-kenar); border-radius: 24px; box-shadow: var(--golge-h); }
        .pf-avatar-degistir { position: absolute; right: -4px; bottom: -4px; width: 32px; height: 32px; border-radius: 50%;
          border: 2px solid var(--cam); background: var(--ic); color: var(--metin2); cursor: pointer; display: grid;
          place-items: center; font-size: 13px; }
        @media (prefers-reduced-motion: no-preference) {
          .pf-odul-parla { animation: pf-odul 2.4s ease-in-out infinite; }
          @keyframes pf-odul { 0%, 100% { box-shadow: none } 50% { box-shadow: var(--parilti) } }
        }
      `}</style>

      {/* ── HERO ── */}
      <Reveal>
        <section className="pf-kart" aria-label="Profil özeti">
          <svg aria-hidden className="pointer-events-none absolute -right-4 -top-6 w-[200px] opacity-[0.09]" viewBox="0 0 100 100">
            <path d="M10 90C30 60 40 40 90 10M35 62c8 2 16 0 22-6M52 44c8 2 15 0 21-6" stroke="var(--vurgu)" strokeWidth="3" fill="none" strokeLinecap="round" />
          </svg>
          <div className="flex flex-wrap items-center gap-[26px]">
            <AvatarAlani ad={ad} avatarSrc={avatarSrc} mevcutId={profile?.avatar ?? null} onKaydet={refreshProfile} />
            <div className="min-w-[220px] flex-1">
              <h1 className="font-display text-[clamp(24px,2.6vw,30px)] font-extrabold tracking-tight" style={{ color: 'var(--metin1)' }}>{ad}</h1>
              {ogrenci && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {lig.data && (
                    <span className="pf-cip">
                      {TIER_EMOJI[lig.data.tier] ?? ''} {TIER_TR[lig.data.tier] ?? lig.data.tier} Ligi
                      {lig.data.benimSira ? ` · ${lig.data.benimSira}. sıra` : ''}
                    </span>
                  )}
                  {G && seri > 0 && <span className="pf-cip"><MiniFidan /> {seri} gün seri</span>}
                  {G && <span className="pf-cip">Toplam {sayi(G.totalSolved)} soru</span>}
                </div>
              )}
              <p className="pf-aciklama mt-2">
                {ogrenci ? 'YKS öğrencisi' : ROL_ADI[rolBul(profile)]}
                {katildi ? ` · Katıldı: ${katildi}` : ''}
              </p>
            </div>
            {ogrenci && G && <SeviyeHalka lvl={sv.lvl} kalan={sv.kalan} oran={sv.oran} />}
          </div>
        </section>
      </Reveal>

      {ogrenci ? (
        <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
          {/* ════════ SOL ════════ */}
          <div className="flex min-w-0 flex-col gap-5">
            {/* Streak Fidanı */}
            <Reveal delay={0.06}>
              {gami.loading ? (
                <div className="pf-kart h-56 animate-pulse" />
              ) : G ? (
                <SeriKarti G={G} onDegisti={() => gami.reload()} />
              ) : null}
            </Reveal>

            {/* Rozet galerisi */}
            <Reveal delay={0.12}>
              <section className="pf-kart" aria-label="Rozetler">
                <div className="pf-baslik">
                  <span className="pf-bikon" style={{ background: 'color-mix(in srgb, var(--toprak) 20%, transparent)' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="var(--toprak)" strokeWidth="2"><circle cx="12" cy="9" r="6" /><path d="m8.5 14-2 7 5.5-3 5.5 3-2-7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </span>
                  <h2 className="pf-h2">Rozetlerin</h2>
                  <span className="pf-aciklama" style={{ marginLeft: 'auto' }}>{rozetIdleri.length} / {ROZETLER.length} açıldı</span>
                </div>
                <div className="pf-rzler">
                  {ROZETLER.map((rz) => {
                    const acik = rozetIdleri.includes(rz.id)
                    return (
                      <div key={rz.id} className={cn('pf-rz', !acik && 'kilitli')}>
                        <span className="pf-rz-ikon"><Icon name={rz.icon} size={20} color="currentColor" /></span>
                        <b>{rz.ad}</b>
                        <span>{acik ? 'açıldı' : rz.kosul}</span>
                      </div>
                    )
                  })}
                </div>
              </section>
            </Reveal>

            {/* Lig tablosu — ORKESTRATÖR kararı: tam sıralama başka ekranda yok, kalır */}
            <Reveal delay={0.18}>
              {lig.loading ? (
                <div className="pf-kart h-44 animate-pulse" />
              ) : lig.data ? (
                <section className="pf-kart" aria-label="Haftalık lig sıralaması">
                  <div className="pf-baslik">
                    <span className="pf-bikon" style={{ background: 'color-mix(in srgb, var(--toprak) 20%, transparent)' }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="var(--toprak)" strokeWidth="2"><path d="M8 21h8M12 17v4M17 4H7v5a5 5 0 0 0 10 0V4ZM17 6h3v2a3 3 0 0 1-3 3M7 6H4v2a3 3 0 0 0 3 3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </span>
                    <h2 className="pf-h2">Bu Haftanın Ligi</h2>
                    <span className="pf-cip" style={{ marginLeft: 'auto' }}>
                      {TIER_EMOJI[lig.data.tier] ?? ''} {TIER_TR[lig.data.tier] ?? lig.data.tier}
                    </span>
                  </div>
                  <p className="pf-det">
                    {lig.data.benimSira
                      ? `sıran: ${lig.data.benimSira} · ${sayi(lig.data.benimXP)} XP`
                      : lig.data.katilimci >= 50 ? 'sıran: 50+' : 'henüz sıralamada değilsin'}
                  </p>
                  {lig.data.top.length ? (
                    <div className="mt-2.5 space-y-1">
                      {lig.data.top.map((s) => (
                        <div key={s.rank} className={cn('pf-lig-satir', s.ben && 'ben')}>
                          <span className="w-6 text-center font-display text-[13px] font-bold" style={{ color: s.rank <= 3 ? 'var(--toprak)' : 'var(--metin3)' }}>
                            {s.rank}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium" style={{ color: s.ben ? 'var(--vurgu)' : 'var(--metin2)' }}>
                            {s.name}{s.ben && ' (sen)'}
                          </span>
                          <span className="pf-det">{sayi(s.weeklyXP)} XP</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="pf-aciklama mt-3 text-center">Bu hafta ligde henüz kimse yok — ilk XP'yi sen yaz.</p>
                  )}
                </section>
              ) : null}
            </Reveal>
          </div>

          {/* ════════ SAĞ ════════ */}
          <div className="flex min-w-0 flex-col gap-5">
            {/* Günlük görevler */}
            <Reveal delay={0.06}>
              {gami.loading ? (
                <div className="pf-kart h-44 animate-pulse" />
              ) : quests.length > 0 ? (
                <section className="pf-kart" aria-label="Günlük görevler">
                  <div className="pf-baslik">
                    <span className="pf-bikon" style={{ background: 'color-mix(in srgb, var(--toprak) 20%, transparent)' }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="var(--toprak)" strokeWidth="2"><path d="M9 11l3 3 8-8M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </span>
                    <h2 className="pf-h2">Günlük Görevler</h2>
                  </div>
                  <GorevListesi quests={quests} ilkTalep={ilkTalep} onClaimed={() => gami.reload()} />
                </section>
              ) : null}
            </Reveal>

            {/* Analizler köprüsü — sekmeli istatistiklerin yerine (GOREV-009 sahibi) */}
            <Reveal delay={0.12}>
              <button
                onClick={() => nav('/harita')}
                className="pf-kart w-full cursor-pointer text-left"
                aria-label="Analizler ekranına git"
              >
                <div className="flex items-center gap-3">
                  <span className="pf-bikon" style={{ background: 'color-mix(in srgb, var(--bilgi) 15%, transparent)' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="var(--bilgi)" strokeWidth="2"><path d="M3 20h18M6 16v-5M11 16V7M16 16v-8M21 16V4" strokeLinecap="round" /></svg>
                  </span>
                  <div className="min-w-0 flex-1">
                    <b className="block text-[13.5px]" style={{ color: 'var(--metin1)' }}>İstatistiklerin</b>
                    <span className="pf-det">Ders kırılımı, gelişim ve rekorlar Analizler'de</span>
                  </div>
                  <span className="text-[13.5px] font-semibold" style={{ color: 'var(--vurgu)' }}>Analizler'e git →</span>
                </div>
              </button>
            </Reveal>

            {/* Sınıf */}
            <Reveal delay={0.18}>
              <SinifKarti />
            </Reveal>

            {/* Ayarlar */}
            <Reveal delay={0.24}>
              <AyarlarKarti ogrenci />
            </Reveal>

            {/* Cihazlarım — Ayarlar'daki "Çıkış yap"ın karşılığı: BURASI diğer cihazları görür */}
            <Reveal delay={0.3}>
              <OturumlarKarti onHepsindenCik={hepsindenCik} />
            </Reveal>

            {/* Hata durumu */}
            {(gami.error || lig.error) && (
              <div className="pf-kart flex items-center gap-3" style={{ borderColor: 'color-mix(in srgb, var(--yanlis) 30%, transparent)' }}>
                <Icon name="bolt" size={16} color="var(--yanlis)" />
                <span className="flex-1 text-xs" style={{ color: 'var(--metin2)' }}>Sunucuya ulaşılamadı</span>
                <button className="pf-dis pf-kucuk" onClick={() => { gami.reload(); lig.reload() }}>Tekrar dene</button>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Öğretmen / yönetici: oyunlaştırma yok — Ayarlar + Cihazlarım.
           Cihaz listesi role bağlı DEĞİL: öğretmenin hesabı sınıf verisine erişiyor,
           orada çalınan bir oturum öğrencininkinden daha pahalıdır. */
        <div className="mt-5 max-w-xl space-y-4">
          <Reveal delay={0.06}>
            <AyarlarKarti ogrenci={false} />
          </Reveal>
          <Reveal delay={0.12}>
            <OturumlarKarti onHepsindenCik={hepsindenCik} />
          </Reveal>
        </div>
      )}
    </div>
  )
}

/* ── Hero: mini fidan (seri çipi içindeki filiz) ──────────────────────────── */
function MiniFidan() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
      <path d="M12 22v-9" stroke="#A9713F" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 13C12 9 9 6 4 6c0 4.5 3.5 7 8 7" fill="#4FA56F" />
      <path d="M12 11c0-3 2-5 6.5-5C18.5 9.5 16 11.5 12 11.5" fill="#84A98C" />
    </svg>
  )
}

/* ── Hero: avatar + değiştir diyaloğu (profiles.avatar kendi-satır) ───────── */
function AvatarAlani({ ad, avatarSrc, mevcutId, onKaydet }: {
  ad: string; avatarSrc: string | null; mevcutId: string | null; onKaydet: () => Promise<void>
}) {
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
    <div className="relative flex-none">
      <div
        role="img"
        aria-label={`${ad} avatarı`}
        className="grid size-24 place-items-center overflow-hidden rounded-full font-display text-[34px] font-extrabold text-white"
        style={{
          background: 'linear-gradient(135deg, var(--adacayi), var(--yaprak))',
          boxShadow: '0 0 0 4px var(--cam), 0 0 0 5px var(--cam-kenar)',
        }}
      >
        {avatarSrc
          ? <img src={avatarSrc} alt="" className="size-full object-cover" />
          : ad.charAt(0).toLocaleUpperCase('tr-TR')}
      </div>
      <Dialog.Root open={acik} onOpenChange={setAcik}>
        <Dialog.Trigger asChild>
          <button className="pf-avatar-degistir" title="Avatarını değiştir" aria-label="Avatarını değiştir">✎</button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[85] backdrop-blur-sm" style={{ background: 'rgba(12,18,14,0.45)' }} />
          <Dialog.Content className="pf-modal fixed left-1/2 top-1/2 z-[86] w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 p-6">
            <Dialog.Title className="font-display text-[16px] font-bold" style={{ color: 'var(--metin1)' }}>
              Avatarını seç
            </Dialog.Title>
            <Dialog.Description className="mt-1 text-xs" style={{ color: 'var(--metin3)' }}>
              Lig tablosunda ve panoda seni bu karakter temsil eder.
            </Dialog.Description>
            <div className="mt-4 grid grid-cols-4 gap-2.5">
              {AVATARS.map((a) => (
                <button
                  key={a.id}
                  onClick={() => sec(a.id)}
                  disabled={kaydediliyor !== null}
                  className={cn(
                    'cursor-pointer overflow-hidden rounded-2xl border-2 p-1 transition-transform hover:scale-105',
                    kaydediliyor === a.id && 'animate-pulse',
                  )}
                  style={{ borderColor: mevcutId === a.id ? 'var(--yaprak)' : 'transparent' }}
                  title={a.label}
                >
                  <img src={a.src} alt={a.label} className="aspect-square w-full rounded-xl object-cover" />
                </button>
              ))}
            </div>
            <Dialog.Close asChild>
              <button
                className="absolute right-4 top-4 grid size-8 cursor-pointer place-items-center rounded-lg"
                style={{ color: 'var(--metin3)' }}
                aria-label="Kapat"
              >
                <Icon name="close" size={16} color="currentColor" />
              </button>
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}

/* ── Hero: seviye halkası — yüklenince dolar (0.9s), hareket-azalt'ta anında ── */
function SeviyeHalka({ lvl, kalan, oran }: { lvl: number; kalan: number; oran: number }) {
  const azalt = useReducedMotion()
  const [dolu, setDolu] = useState(!!azalt)
  useEffect(() => {
    if (azalt) { setDolu(true); return }
    const id = requestAnimationFrame(() => setDolu(true))
    return () => cancelAnimationFrame(id)
  }, [azalt])
  const r = 47
  const cevre = 2 * Math.PI * r
  const hedef = cevre * (1 - Math.min(1, Math.max(0, oran)))
  return (
    <div className="relative flex-none" style={{ width: 110, height: 110 }}>
      <svg width="110" height="110" viewBox="0 0 110 110">
        <defs>
          <linearGradient id="pf-sv" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--adacayi)" />
            <stop offset="1" stopColor="var(--yaprak)" />
          </linearGradient>
        </defs>
        <circle cx="55" cy="55" r={r} fill="none" stroke="var(--ic)" strokeWidth="8" />
        <circle
          cx="55" cy="55" r={r} fill="none" stroke="url(#pf-sv)" strokeWidth="8" strokeLinecap="round"
          strokeDasharray={cevre} strokeDashoffset={dolu ? hedef : cevre}
          transform="rotate(-90 55 55)"
          style={{ transition: azalt ? undefined : 'stroke-dashoffset 0.9s cubic-bezier(.4,0,.2,1)' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <b className="block font-display text-[19px] font-extrabold leading-tight" style={{ color: 'var(--metin1)' }}>
            Seviye {lvl}
          </b>
          <span className="block text-[10.5px]" style={{ color: 'var(--metin3)' }}>
            {/* Eşikler doğru cevap sayısından — "soru" değil "doğru" (dürüst birim) */}
            {kalan > 0 ? `Seviye ${lvl + 1}'e ${kalan} doğru` : 'en yüksek seviye'}
          </span>
        </div>
      </div>
    </div>
  )
}

/* ── Streak Fidanı kartı — seri + 5 kademe + dondurma (freeze alanları GERÇEK:
      /gamification yanıtında freezesAvailable/freezeUsedDates var) ──────────── */
function SeriKarti({ G, onDegisti }: { G: any; onDegisti: () => void }) {
  const [busy, setBusy] = useState(false)
  const seri = G?.streak?.count ?? 0
  const enUzun = G?.streak?.longest ?? 0
  const hak = Number(G?.streak?.freezesAvailable) || 0
  const bugun = bugunIso()
  const bugunDondu = Array.isArray(G?.streak?.freezeUsedDates) && G.streak.freezeUsedDates.includes(bugun)
  const bugunTamam = !bugunDondu && G?.streak?.lastActiveDate === bugun
  const sonraki = seriSonrakiKademe(seri)

  const dondur = async () => {
    setBusy(true)
    try {
      await apiPost('/gamification/streak/freeze', { consume: true })
      toast.success('Bugün donduruldu', { description: 'Seri bugün çözmesen de yaşar. Yarın görüşürüz.' })
      onDegisti()
    } catch (e: any) {
      toast.error('Dondurma kullanılamadı', { description: e?.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="pf-kart" aria-label="Seri">
      <div className="pf-baslik">
        <span className="pf-bikon" style={{ background: 'color-mix(in srgb, var(--yaprak) 15%, transparent)' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--yaprak)" strokeWidth="2"><path d="M12 22v-9M12 13C12 9 9 6 4 6c0 4.5 3.5 7 8 7M12 11c0-3 2-5 6.5-5C18.5 10.5 16 12.5 12 12.5" strokeLinecap="round" /></svg>
        </span>
        <h2 className="pf-h2">Serin: {seri} gün</h2>
        {hak > 0 && (
          <span className="pf-rozet buz" style={{ marginLeft: 'auto' }}>❄ {hak} dondurma hakkın var</span>
        )}
      </div>
      <p className="pf-aciklama">
        {seri > 0
          ? <>Her gün en az bir blok çöz, fidanın büyüsün.{sonraki != null && <> Bir sonraki kademe: <b style={{ color: 'var(--metin1)' }}>{sonraki} gün</b>.</>}</>
          : 'Henüz seri yok — bugün bir blok çöz, tohumu filizlendir.'}
      </p>
      <div className="mt-4">
        <SeriFidani seri={seri} />
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2.5">
        <span className="pf-aciklama">En uzun serin: <b style={{ color: 'var(--metin1)' }}>{enUzun} gün</b></span>
        {bugunTamam ? (
          <span className="pf-rozet dogru">bugün tamamlandı ✓</span>
        ) : bugunDondu ? (
          <span className="pf-rozet buz">bugün donduruldu ❄</span>
        ) : hak > 0 && seri > 0 ? (
          <button className="pf-dis pf-kucuk" disabled={busy} onClick={dondur}>Bugünü dondur</button>
        ) : null}
      </div>
    </section>
  )
}

/* ── Günlük görevler — claim akışı; TEK birincil "Ödülü al" (ilk talep edilebilir) ── */
function GorevListesi({ quests, ilkTalep, onClaimed }: {
  quests: any[]; ilkTalep: number; onClaimed: () => void
}) {
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
    <div>
      {quests.map((q, i) => {
        const tamam = q.progress >= q.target
        return (
          <div key={q.id} className="pf-gorev">
            <span className="pf-gikon" aria-hidden>{q.emoji ?? '✏️'}</span>
            <span className="min-w-0 flex-1">
              <b>{q.title}</b>
              {!tamam && q.target > 1 && (
                <span className="pf-gcubuk"><i style={{ width: `${Math.min(100, (q.progress / q.target) * 100)}%` }} /></span>
              )}
              <span className="pf-det">
                {q.claimed
                  ? `+${q.rewardXP} XP alındı`
                  : tamam
                    ? `tamamlandı · +${q.rewardXP} XP`
                    : `${q.progress} / ${q.target} · +${q.rewardXP} XP`}
              </span>
            </span>
            {q.claimed ? (
              <span className="pf-rozet dogru">✓</span>
            ) : tamam ? (
              <button
                className={cn(i === ilkTalep ? 'pf-cta pf-kucuk' : 'pf-dis pf-kucuk', i === ilkTalep && 'pf-odul-parla')}
                disabled={busy === q.id}
                onClick={() => al(q)}
              >
                Ödülü al
              </button>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

/* ── Sınıf kartı — /sinif akışı; ayrılma YIKICI → Radix Dialog.
      Katılım hatasında sunucunun TEK NÖTR mesajı olduğu gibi gösterilir
      ("kod yanlış" / "sınıf yok" ayrımı bilinçli yapılmaz — numaralandırma yüzeyi). ── */
type SinifDurumu = {
  kayitli: boolean
  ogretmen: { id: string; name: string | null; school: string | null; classCode: string | null } | null
}

function SinifKarti() {
  const durum = useAsync<SinifDurumu>(() => apiGet('/sinif'), [])
  const { refreshProfile } = useAuth()
  const [kod, setKod] = useState('')
  const [mesgul, setMesgul] = useState(false)
  const [onayAcik, setOnayAcik] = useState(false)

  /**
   * ⚠️ PROFİL DE TAZELENİR — yalnız `durum.reload()` YETMEZ.
   *
   * `profile.teacher_id` istemci belleğinde eski değeriyle kalıyordu ve App.tsx "Ödevler"
   * sekmesini TAM OLARAK o alana bakarak ekliyor. Sonuç: öğrenci sınıf koduyla katılıyor,
   * "…sınıfına katıldın" toast'ını görüyor, ama Ödevler sekmesi belirmiyordu — öğretmeninin
   * gönderdiği ödevlere hiçbir yerden ulaşamıyordu; tek çare tam sayfa yenilemeydi.
   * Ters yönde de aynısı: ayrıldıktan sonra sekme duruyor ve boş liste açıyordu.
   * (OtomatikKatilim.tsx aynı durumda refreshProfile'ı zaten doğru çağırıyor.)
   */
  const katil = async () => {
    const temiz = kod.trim().toUpperCase()
    if (!temiz) return
    setMesgul(true)
    try {
      const y = await apiPost('/sinif/katil', { classCode: temiz })
      toast.success(y.degisti ? `${y.ogretmen?.name ?? 'Öğretmenin'} sınıfına katıldın` : 'Zaten bu sınıftasın')
      setKod('')
      durum.reload()
      await refreshProfile()
    } catch (e: any) {
      toast.error(e?.message ?? 'Sınıfa katılınamadı')
    } finally {
      setMesgul(false)
    }
  }

  const ayril = async () => {
    setMesgul(true)
    try {
      await apiPost('/sinif/ayril', {})
      toast.success('Sınıftan ayrıldın')
      setOnayAcik(false)
      durum.reload()
      await refreshProfile()
    } catch (e: any) {
      toast.error(e?.message ?? 'Ayrılma başarısız')
    } finally {
      setMesgul(false)
    }
  }

  if (durum.loading) return <div className="pf-kart h-32 animate-pulse" />

  const d = durum.data

  return (
    <section className="pf-kart" aria-label="Sınıf">
      <div className="pf-baslik">
        <span className="pf-bikon" style={{ background: 'color-mix(in srgb, var(--adacayi) 20%, transparent)' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--vurgu)" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
        <h2 className="pf-h2">Sınıfın</h2>
      </div>
      {d?.kayitli && d.ogretmen ? (
        <>
          <p className="text-[14.5px] font-semibold" style={{ color: 'var(--metin1)' }}>{d.ogretmen.name ?? 'Öğretmenin'}</p>
          <p className="pf-aciklama mt-0.5">
            {[d.ogretmen.school, d.ogretmen.classCode ? `kod: ${d.ogretmen.classCode}` : null].filter(Boolean).join(' · ') || 'Sınıfa kayıtlısın'}
          </p>
          <Dialog.Root open={onayAcik} onOpenChange={setOnayAcik}>
            <Dialog.Trigger asChild>
              <button className="pf-dis pf-kucuk mt-3">Sınıftan ayrıl</button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-[85] backdrop-blur-sm" style={{ background: 'rgba(12,18,14,0.45)' }} />
              <Dialog.Content className="pf-modal fixed left-1/2 top-1/2 z-[86] w-[min(92vw,380px)] -translate-x-1/2 -translate-y-1/2 p-6">
                <Dialog.Title className="font-display text-[16px] font-bold" style={{ color: 'var(--metin1)' }}>
                  Sınıftan ayrılmak üzeresin
                </Dialog.Title>
                <Dialog.Description className="mt-2 text-[13px] leading-relaxed" style={{ color: 'var(--metin2)' }}>
                  Öğretmenin ilerlemeni artık göremez ve sana ödev gönderemez.
                  İstediğin zaman sınıf koduyla yeniden katılabilirsin.
                </Dialog.Description>
                <div className="mt-5 flex justify-end gap-2.5">
                  <Dialog.Close asChild>
                    <button className="pf-dis pf-kucuk">Vazgeç</button>
                  </Dialog.Close>
                  <button className="pf-tehlike" disabled={mesgul} onClick={ayril}>
                    {mesgul ? 'Ayrılıyor…' : 'Evet, ayrıl'}
                  </button>
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </>
      ) : (
        <>
          <p className="pf-aciklama">Öğretmeninin verdiği sınıf kodunu gir; ödevlerin ve ilerlemen onunla paylaşılsın.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              value={kod}
              onChange={(e) => setKod(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === 'Enter') void katil() }}
              placeholder="SINIF KODU"
              aria-label="Sınıf kodu"
              maxLength={12}
              className="min-w-0 flex-1 rounded-xl px-3 py-2.5 font-mono text-[14px] tracking-[0.2em] outline-none placeholder:tracking-normal"
              style={{ background: 'var(--ic)', border: '1px solid var(--cam-kenar)', color: 'var(--metin1)' }}
            />
            <button className="pf-dis" onClick={katil} disabled={mesgul || !kod.trim()}>
              {mesgul ? 'Katılıyor…' : 'Katıl'}
            </button>
          </div>
        </>
      )}
    </section>
  )
}

/* ── Ayarlar — tema segmenti · ses · bildirim (profiles.notifications_enabled,
      0019 beyaz listesi) · günlük hedef (profiles.daily_goal) · çıkış · KVKK ── */
function AyarlarKarti({ ogrenci }: { ogrenci: boolean }) {
  const { theme, setTheme } = useTheme()
  const { profile, user, signOut, refreshProfile } = useAuth()
  const [sesli, setSesli] = useState(sesAcikMi)
  const [bilBusy, setBilBusy] = useState(false)
  const [cikisBusy, setCikisBusy] = useState(false)

  /**
   * Çıkış artık SUNUCUYA DA söyleniyor: `/oturum/cikis` bu cihazın oturumunu deftere
   * kapalı yazar ve Supabase refresh token'ını öldürür.
   *
   * ⚠️ Bu olmadan "çıkış", token'ı yalnız tarayıcıdan silmekti — sunucu tarafında hiçbir
   * şey değişmez, aynı token başka bir yerden çalışmaya devam ederdi.
   *
   * ⚠️ SUNUCU HATASI ÇIKIŞI ENGELLEMEZ: istek başarısız olsa da yerel çıkış yapılır.
   * Aksi hâlde Redis arızası kullanıcıyı kendi hesabından çıkamaz hâle getirirdi.
   */
  const cikisYap = async (): Promise<void> => {
    if (cikisBusy) return
    setCikisBusy(true)
    try {
      await apiPost('/oturum/cikis', {})
    } catch {
      /* yut — yerel çıkış her hâlükârda yapılır */
    }
    await signOut()
    setCikisBusy(false)
  }

  const bildirimAcik = (profile?.notifications_enabled ?? true) as boolean

  const bildirimDegistir = async () => {
    if (!user?.id || bilBusy) return
    setBilBusy(true)
    const { error } = await supabase
      .from('profiles')
      .update({ notifications_enabled: !bildirimAcik })
      .eq('id', user.id)
    if (error) toast.error('Bildirim ayarı kaydedilemedi', { description: error.message })
    else await refreshProfile()
    setBilBusy(false)
  }

  return (
    <section className="pf-kart" aria-label="Ayarlar">
      <div className="pf-baslik">
        <span className="pf-bikon" style={{ background: 'color-mix(in srgb, var(--adacayi) 20%, transparent)' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--vurgu)" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" /></svg>
        </span>
        <h2 className="pf-h2">Ayarlar</h2>
      </div>

      <div className="pf-ayar">
        <span>E-posta</span>
        <span className="truncate text-[13px]" style={{ color: 'var(--metin3)' }}>{user?.email ?? '—'}</span>
      </div>

      <div className="pf-ayar">
        <span>Tema</span>
        <div className="pf-secici" role="group" aria-label="Tema seçimi">
          <button className={cn(theme === 'light' && 'aktif')} aria-pressed={theme === 'light'} onClick={() => setTheme('light')}>
            ☀ Gün Işığı
          </button>
          <button className={cn(theme === 'dark' && 'aktif')} aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}>
            ☾ Gece Ormanı
          </button>
        </div>
      </div>

      <div className="pf-ayar">
        <span>Sesler</span>
        <button
          role="switch"
          aria-checked={sesli}
          aria-label={sesli ? 'Sesler açık' : 'Sesler kapalı'}
          className={cn('pf-anahtar', !sesli && 'kapali')}
          onClick={() => setSesli(sesToggle())}
        />
      </div>

      <div className="pf-ayar">
        <span>Bildirimler</span>
        <button
          role="switch"
          aria-checked={bildirimAcik}
          aria-label={bildirimAcik ? 'Bildirimler açık' : 'Bildirimler kapalı'}
          className={cn('pf-anahtar', !bildirimAcik && 'kapali')}
          disabled={bilBusy}
          onClick={bildirimDegistir}
        />
      </div>

      {ogrenci && <GunlukHedefSatiri />}

      <div className="pf-ayar">
        <span>Oturum</span>
        <button className="pf-dis pf-kucuk" disabled={cikisBusy} onClick={cikisYap}>
          {cikisBusy ? 'Çıkılıyor…' : 'Çıkış yap'}
        </button>
      </div>

      <TehlikeBolgesi onSil={async () => {
        await apiPost('/account/delete', {})
        await signOut()
      }} />
    </section>
  )
}

/* ── Günlük hedef — profiles.daily_goal (0019 beyaz listesi) + Bugün ekranının
      okuduğu localStorage aynası birlikte güncellenir (iki yüzey tek değer) ── */
function GunlukHedefSatiri() {
  const { profile, user, refreshProfile } = useAuth()
  const [busy, setBusy] = useState(false)
  const [hedef, setHedef] = useState<number>(() => {
    const p = Number(profile?.daily_goal)
    if (Number.isFinite(p) && p >= 1) return p
    try {
      const l = Number(localStorage.getItem('learnup.hedef'))
      if (Number.isFinite(l) && l >= 1) return l
    } catch { /* yut */ }
    return 10
  })

  const kaydet = async (yeni: number) => {
    const y = Math.max(5, Math.min(100, yeni))
    if (y === hedef || !user?.id || busy) return
    setBusy(true)
    const eski = hedef
    setHedef(y)
    try { localStorage.setItem('learnup.hedef', String(y)) } catch { /* yut */ }
    const { error } = await supabase.from('profiles').update({ daily_goal: y }).eq('id', user.id)
    if (error) {
      setHedef(eski)
      try { localStorage.setItem('learnup.hedef', String(eski)) } catch { /* yut */ }
      toast.error('Günlük hedef kaydedilemedi', { description: error.message })
    } else {
      await refreshProfile()
    }
    setBusy(false)
  }

  return (
    <div className="pf-ayar">
      <span>Günlük hedef</span>
      <div className="pf-sayac">
        <button aria-label="Hedefi azalt" disabled={busy || hedef <= 5} onClick={() => kaydet(hedef - 5)}>−</button>
        <b>{hedef}</b>
        <button aria-label="Hedefi artır" disabled={busy || hedef >= 100} onClick={() => kaydet(hedef + 5)}>+</button>
      </div>
    </div>
  )
}

/* ── KVKK tehlike bölgesi — Radix onay diyaloğu (korundu) ─────────────────── */
function TehlikeBolgesi({ onSil }: { onSil: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  return (
    <div className="pf-ayar">
      <div>
        <span className="text-[13.5px] font-medium" style={{ color: 'var(--yanlis)' }}>Hesabı kalıcı sil</span>
        <p className="pf-det mt-0.5">Tüm verilerin geri döndürülemez şekilde silinir (KVKK).</p>
      </div>
      <Dialog.Root>
        <Dialog.Trigger asChild>
          <button className="pf-tehlike">Sil</button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[85] backdrop-blur-sm" style={{ background: 'rgba(12,18,14,0.45)' }} />
          <Dialog.Content className="pf-modal fixed left-1/2 top-1/2 z-[86] w-[min(92vw,380px)] -translate-x-1/2 -translate-y-1/2 p-6">
            <Dialog.Title className="font-display text-[16px] font-bold" style={{ color: 'var(--metin1)' }}>
              Hesabını silmek üzeresin
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-[13px] leading-relaxed" style={{ color: 'var(--metin2)' }}>
              Ustalık haritan, serin, rozetlerin ve bahçen dahil TÜM verilerin kalıcı
              olarak silinir. Bu işlem geri alınamaz.
            </Dialog.Description>
            <div className="mt-5 flex justify-end gap-2.5">
              <Dialog.Close asChild>
                <button className="pf-dis pf-kucuk">Vazgeç</button>
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
                className="cursor-pointer rounded-xl px-4 py-2 font-display text-[13px] font-bold text-white transition-colors disabled:opacity-50"
                style={{ background: 'var(--yanlis)' }}
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
