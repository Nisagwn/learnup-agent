import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useReducedMotion } from 'framer-motion'
import { toast } from 'sonner'
import { useAsync } from '../lib/useAsync'
import { apiGet, apiPost } from '../lib/api.js'
import { hedefTarih, hedefTarihYaz, hedefEtiket, hedefIso, kalanGun } from '../lib/hedefTarih'
import type { RoadmapYaniti, ReviewYaniti, PlanGunu } from '../lib/types'
import { Reveal } from '../components/fx'

/* ═══════════════════════════════════════════════════════════════════════════
   ÇALIŞMA PLANI — onaylı önizleme portu (docs/design/onizleme/calisma-plani.html).
   Özet hero (geri sayım · haftanın hedefi · tekrar vadesi) → plan gerekçesi
   şeridi (pusula summary, yalnız oturumda üretilmişse) → 7 günlük blok ızgarası.
   Inline FİDAN deseni (007 emsali): görünüm ekran içinde, ortak varyant yok.
   null≠0: tamamlanma verisi planda YOK → geçmiş günler yalnız soluk; ortalama
   süre verisi YOK → yalnız soru adedi. Pusula YALNIZ kullanıcı eylemiyle koşar.
   ═══════════════════════════════════════════════════════════════════════════ */

const GUN_KISA = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt']
const AY_KISA = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']

/** 'YYYY-MM-DD' → yerel Date (öğlen çıpası — saat dilimi kaymasına karşı). */
const isoTarih = (iso: string): Date | null => {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return null
  const d = new Date(iso.slice(0, 10) + 'T12:00:00')
  return Number.isNaN(d.getTime()) ? null : d
}
const tarihEtiket = (iso: string): string => {
  const d = isoTarih(iso)
  return d ? `${d.getDate()} ${AY_KISA[d.getMonth()]}` : iso
}

/** Blok türü → kelimeli çip (asla yalnız renk). Planner kind sözleşmesi. */
const CIP: Record<string, { sinif: string; etiket: string }> = {
  remediation: { sinif: 'cp-cip zayif', etiket: 'zayıf konu' },
  srs: { sinif: 'cp-cip tekrar', etiket: 'tekrar' },
  tekrar: { sinif: 'cp-cip pekistir', etiket: 'pekiştirme' },
  yeni: { sinif: 'cp-cip pekistir', etiket: 'yeni konu' },
}

const dersAd = (s: string) =>
  s === 'tekrar' ? 'Aralıklı tekrar' : s ? s.charAt(0).toLocaleUpperCase('tr-TR') + s.slice(1) : ''

export function Rota() {
  const nav = useNavigate()
  const roadmap = useAsync<RoadmapYaniti>(() => apiGet('/agents/roadmap'), [])
  const review = useAsync<ReviewYaniti>(() => apiGet('/practice/review'), [])

  const [planUretiliyor, setPlanUretiliyor] = useState(false)
  // Gerekçe yalnız bu oturumda pusula koşulduysa bilinir (GET ucu summary taşımaz) — yoksa şerit gizlenir.
  const [gerekce, setGerekce] = useState<string | null>(null)

  // Hedef tarih — TEK kaynak lib/hedefTarih.ts (Bugün çipi de aynı kaynaktan okur).
  const [hedef, setHedef] = useState(() => hedefTarih())
  const [tarihDuzenle, setTarihDuzenle] = useState(false)
  const [tarihTaslak, setTarihTaslak] = useState(() => hedefIso())
  const kalan = kalanGun(hedef)

  const gunler = useMemo<PlanGunu[]>(() => (roadmap.data?.steps?.days ?? []).slice(0, 7), [roadmap.data])
  const bugunIso = new Date().toLocaleDateString('en-CA')
  const toplamSatir = useMemo(() => gunler.reduce((s, g) => s + g.blocks.length, 0), [gunler])
  const bugunPlan = gunler.find((g) => g.day.slice(0, 10) === bugunIso)

  const tarihKaydet = () => {
    if (hedefTarihYaz(tarihTaslak)) {
      const yeni = hedefTarih()
      setHedef(yeni)
      setTarihDuzenle(false)
      toast.success('Hedef tarih güncellendi', {
        description: `Sınava ${kalanGun(yeni)} gün — plan aciliyeti buna göre ayarlanır.`,
      })
    } else {
      toast.error('Geçersiz tarih', { description: 'Bugünden sonraki bir gün seç.' })
    }
  }

  /* Pusula — YALNIZ kullanıcı eylemiyle. İyimser güncelleme YOK: mevcut plan
     görünür kalır, yanıt gelince roadmap.reload() hakikati getirir. */
  const planiGuncelle = async () => {
    if (planUretiliyor) return
    setPlanUretiliyor(true)
    try {
      const r = await apiPost('/agents/pusula', {})
      if (r?.summary) setGerekce(String(r.summary))
      roadmap.reload()
      toast.success('Haftalık plan hazır', { description: 'Plan optimizer ile yeniden kuruldu.' })
    } catch (e: any) {
      toast.error('Plan güncellenemedi', { description: e?.message || 'Biraz sonra tekrar dene.' })
    } finally {
      setPlanUretiliyor(false)
    }
  }

  const bugunuBaslat = () => {
    const blok = bugunPlan?.blocks[0]
    if (!blok) return
    if (blok.kazanim_id > 0) {
      nav('/coz', { state: { source: 'ai', kazanimId: blok.kazanim_id, subject: blok.subject, title: blok.title } })
    } else {
      nav('/coz', {
        state: {
          source: 'review', title: 'Tekrar Zamanı',
          ...(review.data?.questions?.length ? { questions: review.data.questions } : {}),
        },
      })
    }
  }

  const tekrarBaslat = () =>
    nav('/coz', { state: { source: 'review', title: 'Tekrar Zamanı', questions: review.data?.questions ?? [] } })

  const planVar = gunler.length > 0
  const heroKolonlar = planVar || roadmap.loading ? '1.25fr 1fr 1fr' : '1.25fr 1fr'

  return (
    <div className="mx-auto max-w-[1240px] px-[clamp(16px,3.5vw,44px)] pb-20 pt-9">
      <style>{`
        .cp-kart { position: relative; background: var(--cam); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
          border: 1px solid var(--cam-kenar); border-radius: 20px; box-shadow: var(--golge); transition: transform .25s, box-shadow .25s; }
        .cp-kart:hover { transform: translateY(-2px); box-shadow: var(--golge-h); }
        .cp-mono { font-family: 'JetBrains Mono', monospace; font-size: 10.5px; letter-spacing: .12em;
          text-transform: uppercase; color: var(--metin3); font-weight: 500; }
        .cp-hero { display: grid; overflow: hidden; padding: 0; }
        .cp-hero > div { padding: 24px 26px; min-width: 0; }
        .cp-hero > div + div { border-left: 1px solid var(--cam-kenar); }
        @media (max-width: 900px) {
          .cp-hero { grid-template-columns: 1fr !important; }
          .cp-hero > div + div { border-left: none; border-top: 1px solid var(--cam-kenar); }
        }
        .cp-hero h3 { font-family: Outfit, sans-serif; font-size: 13.5px; font-weight: 600; color: var(--metin2);
          margin-bottom: 12px; display: flex; align-items: center; gap: 7px; }
        .cp-ikon { width: 26px; height: 26px; border-radius: 9px; background: var(--v1);
          display: inline-flex; align-items: center; justify-content: center; font-size: 13px; flex: none; }
        .cp-sayim { font-family: Outfit, sans-serif; font-weight: 800; font-size: 52px; line-height: 1;
          color: var(--metin1); letter-spacing: -.02em; }
        .cp-sayim em { font-style: normal; font-size: 16px; font-weight: 600; color: var(--metin3); margin-left: 6px; }
        .cp-orta { font-family: Outfit, sans-serif; font-weight: 700; font-size: 26px; color: var(--metin1); }
        .cp-orta small { font-size: 15px; color: var(--metin3); font-weight: 600; }
        .cp-not { font-size: 12px; color: var(--metin3); line-height: 1.5; }
        .cp-btn { font-family: Inter, sans-serif; font-weight: 600; font-size: 13.5px; border-radius: 12px;
          cursor: pointer; transition: filter .2s, transform .15s, background .15s, box-shadow .2s; border: none;
          display: inline-flex; align-items: center; justify-content: center; gap: 7px; }
        .cp-btn:disabled { opacity: .55; cursor: not-allowed; transform: none !important; }
        .cp-btn.birincil { background: var(--cta); color: #fff; padding: 12px 22px;
          box-shadow: 0 6px 16px color-mix(in srgb, var(--cta) 25%, transparent); }
        .cp-btn.birincil:hover:not(:disabled) { box-shadow: var(--parilti); transform: translateY(-1px); }
        .cp-btn.ikincil { background: transparent; color: var(--vurgu); border: 1.5px solid var(--adacayi); padding: 10px 18px; }
        .cp-btn.ikincil:hover { background: var(--v1); }
        .cp-btn.soluk { background: var(--v0); color: var(--metin2); padding: 9px 15px; border: 1px solid var(--cam-kenar); }
        .cp-btn.soluk:hover:not(:disabled) { color: var(--metin1); border-color: var(--adacayi); }
        .cp-btn:focus-visible, .cp-cizgili:focus-visible { outline: 2px solid var(--yaprak); outline-offset: 2px; }
        .cp-cip { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; font-weight: 600;
          padding: 4px 10px; border-radius: 12px; white-space: nowrap; width: fit-content; }
        .cp-cip.zayif { background: color-mix(in srgb, var(--toprak) 22%, transparent);
          color: color-mix(in srgb, var(--toprak) 60%, var(--metin1)); }
        .cp-cip.tekrar { background: color-mix(in srgb, var(--yaprak) 16%, transparent); color: var(--vurgu); }
        .cp-cip.pekistir { background: var(--v1); color: var(--metin2); }
        .cp-cizgili { display: inline-flex; align-items: center; gap: 5px; border: 1.5px dashed var(--adacayi);
          background: transparent; color: var(--vurgu); cursor: pointer; padding: 6px 12px; font-size: 12px;
          font-weight: 600; border-radius: 12px; font-family: Inter, sans-serif; transition: background .15s; }
        .cp-cizgili:hover { background: var(--v1); }
        .cp-gerekce { display: flex; align-items: center; gap: 16px; padding: 16px 22px; flex-wrap: wrap; }
        .cp-gerekce .metin { flex: 1; min-width: 240px; font-size: 13.5px; color: var(--metin2); line-height: 1.55; }
        .cp-gerekce .metin b { color: var(--metin1); font-weight: 600; }
        .cp-spin { width: 15px; height: 15px; border: 2.5px solid var(--v2); border-top-color: var(--yaprak);
          border-radius: 50%; flex: none; }
        @media (prefers-reduced-motion: no-preference) { .cp-spin { animation: cp-donme .8s linear infinite; } }
        @keyframes cp-donme { to { transform: rotate(360deg); } }
        .cp-hafta { display: grid; grid-template-columns: repeat(7, 1fr); gap: 12px; align-items: stretch; }
        @media (max-width: 1080px) { .cp-hafta { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 640px) { .cp-hafta { grid-template-columns: 1fr; } }
        .cp-gun-sarici { display: flex; min-width: 0; }
        .cp-gun { display: flex; flex-direction: column; gap: 9px; min-width: 0; flex: 1; }
        .cp-gun.gecmis { opacity: .68; }
        .cp-etiket { display: flex; align-items: center; gap: 8px; padding: 0 4px; }
        .cp-etiket .no { font-family: Outfit, sans-serif; font-weight: 700; font-size: 14px; color: var(--metin2);
          width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
          background: var(--v0); flex: none; }
        .cp-gun.bugun .cp-etiket .no { background: var(--cta); color: #fff; box-shadow: 0 0 0 3px var(--v2); }
        .cp-etiket .ad { font-size: 12px; font-weight: 600; color: var(--metin3); }
        .cp-gun.bugun .cp-etiket .ad { color: var(--vurgu); }
        .cp-blok { padding: 15px 15px 17px; display: flex; flex-direction: column; gap: 10px; flex: 1; }
        .cp-gun.bekleyen .cp-blok { border-style: dashed; background: transparent; box-shadow: none;
          backdrop-filter: none; -webkit-backdrop-filter: none; }
        .cp-gun.bugun .cp-blok { border-color: var(--adacayi);
          box-shadow: 0 10px 30px color-mix(in srgb, var(--vurgu) 14%, transparent); }
        .cp-satir { display: flex; flex-direction: column; gap: 3px; padding: 9px 10px; border-radius: 12px; background: var(--v0); }
        .cp-gun.bekleyen .cp-satir { background: transparent; border: 1px solid var(--cam-kenar); }
        .cp-satir .kazanim { font-size: 12.5px; font-weight: 600; color: var(--metin1); line-height: 1.35; }
        .cp-satir .ders { font-size: 10.5px; color: var(--metin3); font-weight: 500; }
        .cp-alt { display: flex; align-items: center; justify-content: space-between; margin-top: auto;
          padding-top: 4px; font-size: 11.5px; color: var(--metin3); font-weight: 500; }
        .cp-nabiz { position: relative; display: inline-flex; width: 9px; height: 9px; flex: none; }
        .cp-nabiz::before { content: ''; position: absolute; inset: 0; border-radius: 50%; background: var(--yaprak); }
        @media (prefers-reduced-motion: no-preference) {
          .cp-nabiz::after { content: ''; position: absolute; inset: -4px; border-radius: 50%;
            border: 2px solid var(--yaprak); opacity: .5; animation: cp-nbz 1.8s ease-out infinite; }
        }
        @keyframes cp-nbz { 0% { transform: scale(.6); opacity: .6; } 100% { transform: scale(1.4); opacity: 0; } }
        .cp-tarih { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .cp-tarih input { font-family: Inter, sans-serif; font-size: 13px; color: var(--metin1); background: var(--ic);
          border: 1px solid var(--cam-kenar); border-radius: 12px; padding: 9px 10px; }
        .cp-tarih input:focus-visible { outline: 2px solid var(--yaprak); outline-offset: 1px; }
      `}</style>

      {/* ── Başlık ── */}
      <Reveal>
        <header>
          <h1 className="font-display text-[clamp(24px,2.6vw,28px)] font-bold tracking-tight" style={{ color: 'var(--metin1)' }}>
            Çalışma Planı
          </h1>
          <p className="mt-1 text-[13px]" style={{ color: 'var(--metin3)' }}>
            Haftalık programın — zayıf kazanım önce, tekrarlar yerli yerinde.
          </p>
        </header>
      </Reveal>

      {/* ═══ ÖZET HERO: geri sayım · haftanın hedefi · tekrar vadesi ═══ */}
      <Reveal delay={0.04}>
        <section className="cp-kart cp-hero mt-5" style={{ gridTemplateColumns: heroKolonlar }} aria-label="Plan özeti">
          {/* Sınava kalan — hedef tarih TEK kaynaktan */}
          <div>
            <h3><span className="cp-ikon" aria-hidden>🎯</span> Sınava kalan</h3>
            <div className="cp-sayim"><GeriSayim deger={kalan} /><em>gün</em></div>
            <div className="mt-3.5">
              {tarihDuzenle ? (
                <div className="cp-tarih">
                  <input
                    type="date"
                    value={tarihTaslak}
                    min={new Date().toLocaleDateString('en-CA')}
                    onChange={(e) => setTarihTaslak(e.target.value)}
                    aria-label="Sınav hedef tarihi"
                  />
                  <button className="cp-btn soluk" onClick={tarihKaydet}>Kaydet</button>
                  <button className="cp-btn soluk" onClick={() => { setTarihTaslak(hedefIso(hedef)); setTarihDuzenle(false) }}>
                    Vazgeç
                  </button>
                </div>
              ) : (
                <button className="cp-cizgili" onClick={() => setTarihDuzenle(true)} aria-expanded={tarihDuzenle}>
                  Hedef: {hedefEtiket(hedef)} · değiştir ✎
                </button>
              )}
            </div>
            <p className="cp-not mt-2.5">Hedef tarihi sen belirlersin; plan aciliyeti buna göre ayarlanır.</p>
          </div>

          {/* Bu haftanın hedefi — plan satırlarından SAYILIR; plan yoksa modül gizlenir */}
          {(planVar || roadmap.loading) && (
            <div>
              <h3><span className="cp-ikon" aria-hidden>📈</span> Bu haftanın hedefi</h3>
              {roadmap.loading ? (
                <div className="h-16 rounded-xl motion-safe:animate-pulse" style={{ background: 'var(--ic)' }} />
              ) : (
                <>
                  <div className="cp-orta">{toplamSatir}<small> blok satırı</small></div>
                  <p className="cp-not mt-2">
                    Planındaki toplam çalışma satırı. Tamamlanma bu planda henüz ölçülmüyor.
                  </p>
                </>
              )}
            </div>
          )}

          {/* Tekrar vadesi — /practice/review; 0 = ölçüldü sıfır (null≠0) */}
          <div>
            <h3><span className="cp-ikon" aria-hidden>🔁</span> Tekrar vadesi</h3>
            {review.loading ? (
              <div className="h-16 rounded-xl motion-safe:animate-pulse" style={{ background: 'var(--ic)' }} />
            ) : review.data ? (
              (review.data.count ?? 0) > 0 ? (
                <>
                  <div className="cp-orta">{review.data.count}<small> kazanım</small></div>
                  <p className="cp-not mb-3.5 mt-2">Aralıklı tekrar programında bugün vadesi gelenler.</p>
                  <button className="cp-btn ikincil" onClick={tekrarBaslat}>10 soruluk tekrar</button>
                </>
              ) : (
                <p className="cp-not mt-1 text-[13px]">Bugün tekrar vaden yok.</p>
              )
            ) : (
              <p className="cp-not mt-1 text-[13px]">Tekrar verisi şu an alınamadı.</p>
            )}
          </div>
        </section>
      </Reveal>

      {/* ═══ PLAN GEREKÇESİ ŞERİDİ — yalnız gerekçe varsa (null≠0) ═══ */}
      {gerekce && (
        <Reveal delay={0.08}>
          <section className="cp-kart cp-gerekce mt-3.5" aria-label="Plan gerekçesi">
            <span className="cp-ikon" style={{ width: 34, height: 34, fontSize: 16 }} aria-hidden>🧭</span>
            <div className="metin">
              <b>Plan gerekçesi:</b> {gerekce}
              {roadmap.data?.updatedAt && (
                <div className="cp-mono mt-1.5">
                  son güncelleme · {new Date(roadmap.data.updatedAt).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}
                </div>
              )}
            </div>
            {planUretiliyor && <span className="cp-spin" aria-hidden />}
            <button className="cp-btn soluk" disabled={planUretiliyor} onClick={planiGuncelle}>
              {planUretiliyor ? 'Plan hazırlanıyor…' : 'Planı güncelle'}
            </button>
          </section>
        </Reveal>
      )}

      {/* ═══ HAFTALIK PLAN ═══ */}
      {roadmap.loading ? (
        <div className="mt-8 space-y-3">
          <div className="h-7 w-44 rounded-xl motion-safe:animate-pulse" style={{ background: 'var(--ic)' }} />
          <div className="cp-hafta">
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i} className="h-48 rounded-[20px] motion-safe:animate-pulse" style={{ background: 'var(--ic)' }} />
            ))}
          </div>
        </div>
      ) : roadmap.error ? (
        <Reveal delay={0.1}>
          <section className="cp-kart mt-8 flex items-center gap-3 px-6 py-5">
            <span className="flex-1 text-[13px]" style={{ color: 'var(--metin2)' }}>
              Plan yüklenemedi — sunucuya ulaşılamadı.
            </span>
            <button className="cp-btn soluk" onClick={() => roadmap.reload()}>Tekrar dene</button>
          </section>
        </Reveal>
      ) : planVar ? (
        <>
          <Reveal delay={0.1}>
            <div className="mt-8 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-[21px] font-bold" style={{ color: 'var(--metin1)' }}>Haftalık Plan</h2>
                <p className="mt-0.5 text-[12.5px]" style={{ color: 'var(--metin3)' }}>
                  {gunler.length} günlük program · {tarihEtiket(gunler[0].day)} – {tarihEtiket(gunler[gunler.length - 1].day)}
                </p>
              </div>
              {/* Gerekçe şeridi gizliyken güncelleme eylemi burada yaşar */}
              {!gerekce && (
                <span className="flex items-center gap-2.5">
                  {planUretiliyor && <span className="cp-spin" aria-hidden />}
                  <button className="cp-btn soluk" disabled={planUretiliyor} onClick={planiGuncelle}>
                    {planUretiliyor ? 'Plan hazırlanıyor…' : 'Planı güncelle'}
                  </button>
                </span>
              )}
            </div>
          </Reveal>

          <div className="cp-hafta mt-4">
            {gunler.map((gun, gi) => {
              const iso = gun.day.slice(0, 10)
              const t = isoTarih(iso)
              const durum = iso === bugunIso ? 'bugun' : iso < bugunIso ? 'gecmis' : 'bekleyen'
              const toplamSoru = gun.blocks.reduce((s, b) => s + b.count, 0)
              return (
                <Reveal key={gun.day} delay={Math.min(0.1 + gi * 0.03, 0.3)} className="cp-gun-sarici">
                  <div className={`cp-gun ${durum}`}>
                    <div className="cp-etiket">
                      <span className="no">{t ? t.getDate() : '·'}</span>
                      <span className="ad">{durum === 'bugun' ? 'Bugün' : t ? GUN_KISA[t.getDay()] : iso}</span>
                      {durum === 'bugun' && <span className="cp-nabiz" aria-hidden />}
                    </div>
                    <div className="cp-kart cp-blok">
                      {gun.blocks.map((b, bi) => {
                        const cip = CIP[b.kind] ?? { sinif: 'cp-cip pekistir', etiket: b.kind }
                        return (
                          <div key={bi} className="cp-satir">
                            <span className={cip.sinif}>{cip.etiket}</span>
                            <span className="kazanim" title={b.title}>{b.title}</span>
                            <span className="ders">{dersAd(b.subject)}</span>
                          </div>
                        )
                      })}
                      {/* Tamamlanma/süre verisi planda YOK → ✓/süre/skor uydurulmaz; yalnız soru adedi */}
                      <div className="cp-alt"><span>{toplamSoru} soru</span></div>
                      {durum === 'bugun' && gun.blocks.length > 0 && (
                        <button className="cp-btn birincil w-full" onClick={bugunuBaslat}>Başlat</button>
                      )}
                    </div>
                  </div>
                </Reveal>
              )
            })}
          </div>
        </>
      ) : (
        /* ═══ BOŞ DURUM — sayfanın TEK birincil eylemi "Planı oluştur" ═══ */
        <Reveal delay={0.1}>
          <section className="cp-kart mt-8 px-7 py-7" style={{ maxWidth: 560 }} aria-label="Plan boş durumu">
            <span className="block text-[38px]" aria-hidden>🌱</span>
            <h2 className="mt-2 font-display text-[17px] font-bold" style={{ color: 'var(--metin1)' }}>
              Henüz planın yok
            </h2>
            <p className="mt-1.5 max-w-md text-[13px] leading-relaxed" style={{ color: 'var(--metin2)' }}>
              Planlayıcı, çözdüğün sorulardan seni tanıdıkça haftalık program kurar —
              zayıf kazanım önce, tekrarlar yerli yerinde.
            </p>
            <div className="mt-4 flex items-center gap-2.5">
              {planUretiliyor && <span className="cp-spin" aria-hidden />}
              <button className="cp-btn birincil" disabled={planUretiliyor} onClick={planiGuncelle}>
                {planUretiliyor ? 'Plan hazırlanıyor…' : 'Planı oluştur'}
              </button>
            </div>
          </section>
        </Reveal>
      )}
    </div>
  )
}

/* ── Geri sayım sayacı — 0→değer (~0.9s ease-out); hareket-azaltta anında sabit ── */
function GeriSayim({ deger }: { deger: number }) {
  const azalt = useReducedMotion()
  const [goster, setGoster] = useState(() => (azalt ? deger : 0))
  useEffect(() => {
    if (azalt) { setGoster(deger); return }
    let raf = 0
    const t0 = performance.now()
    const adim = (t: number) => {
      const oran = Math.min((t - t0) / 900, 1)
      setGoster(Math.round(deger * (1 - Math.pow(1 - oran, 3))))
      if (oran < 1) raf = requestAnimationFrame(adim)
    }
    raf = requestAnimationFrame(adim)
    return () => cancelAnimationFrame(raf)
  }, [deger, azalt])
  return <span>{goster}</span>
}
