import { useEffect, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import { toast } from 'sonner'
import { apiGet, apiPost } from '../../lib/api'
import { useAsync } from '../../lib/useAsync'
import type {
  AdminEvalYaniti, AdminGorevlerYaniti, AdminHavuzYaniti, GorevYenidenYanit,
} from '../../lib/types.admin'
import { Sayfa, PanoIskeleti } from '../../components/RolGecidi'
import { GlowButton } from '../../components/ui'
import { CanliSayi } from '../../components/cekirdek'
import { Reveal } from '../../components/fx'
import { AjanSagligi, EvalTrendi, OlcumYok } from '../../components/kule'
import { Icon } from '../../ui'

/**
 * YÖNETİM PANOSU — sistemin motor dairesi tek bakışta (FİDAN v1.2 inline desen,
 * onaylı önizleme: docs/design/onizleme/yonetim-panosu.html, 2026-07-23).
 *
 * ⚠️ HİÇBİR SAYI UYDURULMAZ. Tümü gerçek uçlardan: /admin/havuz · /admin/eval ·
 * /admin/gorevler. Ölçülmeyen her yer `OlcumYok` — null ≠ 0.
 *
 * ⚠️ ÜRETİM HUNİSİ BURADA YOK ve bu bir eksiklik olarak GÖSTERİLİR (dürüst boşluk).
 * Elenen aday hiçbir yere yazılmıyor (generateVerifiedSet bellekte eliyor); huniyi
 * eval anlıklarından türetmek uydurma olurdu. Boş bir huni paneli çizmek ise
 * denetlenmemiş bir hattı "sıfır sorunlu" göstermek demekti.
 */
export function Kule() {
  const havuz = useAsync<AdminHavuzYaniti>(() => apiGet('/admin/havuz'), [])
  const ev = useAsync<AdminEvalYaniti>(() => apiGet('/admin/eval'), [])
  const gorev = useAsync<AdminGorevlerYaniti>(() => apiGet('/admin/gorevler'), [])

  /**
   * Takılan/başarısız görevi kuyruğa geri koy.
   *
   * ⚠️ Sunucu `attempts`'i sıfırlıyor — yoksa bekçi (attempts >= 3) görevi 5 dakika
   * içinde sessizce FAILED'a geri çevirirdi. `akisaItildi: false` ise görev
   * kaybolmaz ama HEMEN de başlamaz; bunu yazmak, yöneticinin "çalışmadı" sanıp
   * arka arkaya tıklamasını engelliyor.
   */
  const gorevYeniden = async (id: string): Promise<void> => {
    try {
      const y: GorevYenidenYanit = await apiPost(`/admin/gorev/${id}/yeniden`, {})
      toast.success(
        y.akisaItildi
          ? 'Görev kuyruğa alındı — worker birazdan devralacak.'
          : 'Görev PENDING yapıldı. Redis kapalı olduğu için bekçi 5 dk içinde toplayacak.',
        { duration: y.akisaItildi ? 4000 : 8000 },
      )
      if (!y.denetimYazildi) {
        toast.warning('İşlem tamam ama denetim defterine yazılamadı — 0020 uygulanmamış olabilir.', { duration: 9000 })
      }
      gorev.reload()
    } catch (e: any) {
      toast.error(e?.message ?? 'Görev yeniden kuyruklanamadı', { duration: 7000 })
    }
  }

  if (havuz.loading) return <PanoIskeleti sutun={2} />

  if (havuz.error) {
    return (
      <Sayfa>
        <div
          className="mx-auto max-w-md rounded-2xl px-6 py-8 text-center"
          style={{ background: 'var(--cam)', border: '1px solid var(--cam-kenar)', boxShadow: 'var(--golge)' }}
        >
          <p className="text-sm" style={{ color: 'var(--metin2)' }}>Sistem verisi alınamadı: {havuz.error}</p>
          <GlowButton className="mt-4" variant="outline" onClick={() => havuz.reload()}>Tekrar dene</GlowButton>
        </div>
      </Sayfa>
    )
  }

  const h = havuz.data!
  const toplamHavuz = h.ai.toplam + h.osym.toplam
  const dogrulanmis = h.ai.verified + h.osym.verified
  const oran = toplamHavuz ? dogrulanmis / toplamHavuz : 0

  // ── Son-eval durumu (başlıktaki nokta + metin) ──
  const evalKosmadi = ev.data?.sonuncu == null
  const yasSaat = ev.data?.sonKosumYasiSaat ?? null
  const evalBayat = yasSaat != null && yasSaat > 24 * 7
  const saglikIyi = gorev.data?.saglik === 'iyi'
  const durumRengi = evalKosmadi || ev.error
    ? 'var(--metin3)'
    : evalBayat || !saglikIyi ? 'var(--uyari)' : 'var(--dogru)'
  const durumMetin = ev.error
    ? 'eval durumu okunamadı'
    : evalKosmadi
      ? 'eval hiç koşmadı'
      : `son eval ${Math.round(yasSaat ?? 0)} saat önce`

  // ── Şık sızıntısı: değer + DELTA (ters ölçüt: ▲ = kötü). Delta gerçek trendden
  // türetilir; iki ölçüm yoksa gösterilmez (uydurma yön çizilmez). ──
  const sizSon = ev.data?.sonuncu?.ai.sizintiOrani ?? null
  const sizNokta = (ev.data?.trend ?? [])
    .filter((t) => t.ai.sizintiOrani != null)
    .map((t) => ({ tarih: t.tarih, v: Math.round((t.ai.sizintiOrani as number) * 100) }))
    .sort((a, b) => a.tarih.localeCompare(b.tarih))
  const sizDelta = sizNokta.length >= 2 ? sizNokta[sizNokta.length - 1].v - sizNokta[sizNokta.length - 2].v : null

  return (
    <Sayfa>
      <style>{`
        .yp-kart { background: var(--cam); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
          border: 1px solid var(--cam-kenar); border-radius: 20px; box-shadow: var(--golge); }
        .yp-baslik { padding: 16px 22px; display: flex; align-items: flex-start; gap: 14px; flex-wrap: wrap; }
        .yp-baslik h1 { font-family: Outfit, sans-serif; font-weight: 800; font-size: clamp(20px, 2.4vw, 24px); color: var(--metin1); }
        .yp-baslik .alt { font-size: 12.5px; color: var(--metin3); margin-top: 4px; line-height: 1.5; max-width: 540px; }
        .yp-durum { margin-left: auto; display: inline-flex; align-items: center; gap: 7px;
          font-family: 'JetBrains Mono', monospace; font-size: 10.5px; color: var(--metin3); white-space: nowrap; }
        .yp-durum i { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex: 0 0 auto; }
        .yp-statlar { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: 14px; }
        @media (max-width: 980px) { .yp-statlar { grid-template-columns: repeat(2, 1fr); } }
        .yp-stat { padding: 15px 18px; display: flex; align-items: center; gap: 13px; }
        .yp-stat .icerik { min-width: 0; }
        .yp-stat .deger { font-family: Outfit, sans-serif; font-size: 23px; font-weight: 800; line-height: 1;
          color: var(--metin1); display: inline-flex; align-items: baseline; gap: 6px; }
        .yp-stat .etiket { margin-top: 5px; font-size: 10px; font-weight: 600; letter-spacing: .1em;
          text-transform: uppercase; color: var(--metin3); }
        .yp-stat .subalt { margin-top: 4px; font-family: 'JetBrains Mono', monospace; font-size: 9.5px; color: var(--metin3); }
        .yp-delta { font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; gap: 3px; }
        .yp-izgara { display: grid; grid-template-columns: 1.9fr 1fr; gap: 14px; margin-top: 20px; align-items: start; }
        @media (max-width: 1020px) { .yp-izgara { grid-template-columns: 1fr; } }
        .yp-kolon { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
        .yp-uyari-kart { border-color: color-mix(in srgb, var(--uyari) 25%, transparent) !important; padding: 18px 22px; }
        .yp-uyari-kart h3 { font-family: Outfit, sans-serif; font-size: 13px; font-weight: 700; color: var(--metin1);
          display: flex; align-items: center; gap: 7px; }
        .yp-uyari-kart p { font-size: 12px; line-height: 1.6; color: var(--metin2); margin-top: 8px; }
        .yp-uyari-kart b { color: var(--metin1); font-weight: 600; }
        .yp-eval-uyari { border-color: color-mix(in srgb, var(--uyari) 25%, transparent) !important; padding: 14px 18px; }
        .yp-eval-uyari p { font-size: 12.5px; line-height: 1.6; color: var(--uyari); }
        .yp-panel-ic { padding: 18px 22px; }
        .yp-panel-bas { display: flex; align-items: center; gap: 9px; margin-bottom: 14px; }
        .yp-panel-bas h3 { font-family: Outfit, sans-serif; font-size: 14px; font-weight: 700; color: var(--metin1); }
        .yp-panel-bas .say { margin-left: auto; font-family: 'JetBrains Mono', monospace; font-size: 10.5px; color: var(--metin3); }
        .yp-servis-satir { display: flex; align-items: center; gap: 10px; padding: 9px 0;
          border-bottom: 1px solid var(--cizgi); font-size: 12.5px; }
        .yp-servis-satir:last-child { border-bottom: none; }
        .yp-servis-satir .nokta { width: 9px; height: 9px; border-radius: 50%; flex: 0 0 auto; }
        .yp-servis-satir .ad { font-weight: 600; color: var(--metin1); }
        .yp-servis-satir .not { margin-left: auto; font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--metin3); }
      `}</style>

      {/* ═══ BAŞLIK + son-eval durumu ═══ */}
      <Reveal>
        <section className="yp-kart yp-baslik">
          <div>
            <h1>Yönetim</h1>
            <p className="alt">Havuz, kalite kapıları ve ajan sağlığı — motorun bütün göstergeleri tek ekranda.</p>
          </div>
          <span className="yp-durum">
            <i style={{ background: durumRengi }} />
            {durumMetin}
          </span>
        </section>
      </Reveal>

      {/* ═══ STAT ŞERİDİ (4) ═══ */}
      <div className="yp-statlar">
        <Reveal delay={0.04}>
          <section className="yp-kart yp-stat">
            <OranHalka oran={oran} />
            <div className="icerik">
              <div className="etiket">Doğrulanmış Oran</div>
              <div className="subalt">{dogrulanmis}/{toplamHavuz} soru kapılardan geçti</div>
            </div>
          </section>
        </Reveal>

        <Reveal delay={0.08}>
          <section className="yp-kart yp-stat">
            <div className="icerik">
              <div className="deger"><CanliSayi value={toplamHavuz} /></div>
              <div className="etiket">Havuz Hacmi</div>
              {/* Telif (§18): ÖSYM sayısı YÖNETİCİ iç operasyonudur — öğrenci/öğretmen yüzüne yayın yok. */}
              <div className="subalt">ÖSYM {h.osym.toplam} · AI {h.ai.toplam}</div>
            </div>
          </section>
        </Reveal>

        <Reveal delay={0.12}>
          <section className="yp-kart yp-stat">
            <div className="icerik">
              <div className="deger">%<CanliSayi value={Math.round(h.kapsama.kapsamaOrani * 100)} /></div>
              <div className="etiket">Müfredat Kapsaması</div>
              <div className="subalt">{h.kapsama.herhangiKapsanan}/{h.kapsama.kazanimToplam} kazanımda soru var</div>
            </div>
          </section>
        </Reveal>

        <Reveal delay={0.16}>
          <section className="yp-kart yp-stat">
            <div className="icerik">
              <div className="deger">
                {sizSon == null ? <OlcumYok /> : <>%<CanliSayi value={Math.round(sizSon * 100)} /></>}
                {sizSon != null && sizDelta != null && sizDelta !== 0 && (
                  // TERS ÖLÇÜT: sızıntı YÜKSELİRSE kötü. Renk-körü güvenli → ok + kelime birlikte.
                  <span
                    className="yp-delta"
                    style={{ color: sizDelta > 0 ? 'var(--uyari)' : 'var(--dogru)' }}
                    title={sizDelta > 0 ? 'önceki evale göre arttı (kötü)' : 'önceki evale göre azaldı (iyi)'}
                  >
                    {sizDelta > 0 ? '▲' : '▼'}{Math.abs(sizDelta)} {sizDelta > 0 ? 'arttı' : 'azaldı'}
                  </span>
                )}
              </div>
              <div className="etiket">Şık Uzunluk Sızıntısı</div>
              <div className="subalt">{ev.data?.sonuncu ? `son eval · n=${ev.data.sonuncu.ai.n}` : 'eval koşmadı'}</div>
            </div>
          </section>
        </Reveal>
      </div>

      {/* ═══ ANA IZGARA ═══ */}
      <div className="yp-izgara">
        {/* ─── SOL ─── */}
        <div className="yp-kolon">
          {ev.data && <Reveal delay={0.1}><EvalTrendi trend={ev.data.trend} /></Reveal>}

          {/* DÜRÜST BOŞLUK (imza): ölçülmeyen huniyi UYDURMA — eksikliği açıkça bildir. */}
          <Reveal delay={0.16}>
            <section className="yp-kart yp-uyari-kart">
              <h3>
                <UyariUcgen />
                Üretim hunisi henüz ölçülmüyor
              </h3>
              <p>
                "Kaç aday üretildi, hangi kapı kaçını eledi, kaç onarım tuttu" sorusu şu an
                yanıtsız: elenen adaylar üretim döngüsünde bellekte eleniyor ve hiçbir yere
                yazılmıyor. Bu sayıları eval anlıklarından türetmek uydurma olurdu — eval
                yalnız <b>havuza girmiş</b> soruları ölçer, elenenleri tanım gereği göremez.
                Huni, üretim hattına telemetri eklendiğinde burada belirecek.
              </p>
            </section>
          </Reveal>
        </div>

        {/* ─── SAĞ ─── */}
        <div className="yp-kolon">
          {gorev.data && (
            <Reveal delay={0.14}>
              <AjanSagligi veri={gorev.data} onYeniden={gorevYeniden} />
            </Reveal>
          )}

          {/* SERVİS SAĞLIĞI — nokta + KELİMELİ; her satır GERÇEK sinyalden türetilir.
              Ölçülmeyen (Redis'in anlık durumu 3 uçta yok) → OlcumYok. null ≠ 0. */}
          <Reveal delay={0.18}>
            <ServisSagligi
              havuzVar={!!havuz.data}
              gorev={gorev.data ?? null}
              gorevHata={!!gorev.error}
            />
          </Reveal>

          {/* Eval uyarısı (gerçek): hiç koşmadı / bayat — dürüst metin, sessizliği bozar. */}
          {ev.data?.uyari && (
            <Reveal delay={0.22}>
              <section className="yp-kart yp-eval-uyari">
                <p>{ev.data.uyari}</p>
              </section>
            </Reveal>
          )}
        </div>
      </div>
    </Sayfa>
  )
}

/* ── Doğrulanmış oran halkası — adaçayı→yaprak, mount'ta dolar (0.9s), reduced-motion uyumlu ── */
function OranHalka({ oran }: { oran: number }) {
  const azalt = useReducedMotion()
  const [dolu, setDolu] = useState(!!azalt)
  useEffect(() => {
    if (azalt) return
    const id = requestAnimationFrame(() => setDolu(true))
    return () => cancelAnimationFrame(id)
  }, [azalt])
  const boyut = 64
  const kalinlik = 7
  const r = (boyut - kalinlik) / 2
  const cevre = 2 * Math.PI * r
  const off = cevre * (1 - Math.min(1, Math.max(0, oran)))
  return (
    <div style={{ position: 'relative', width: boyut, height: boyut, flex: '0 0 auto' }}>
      <svg width={boyut} height={boyut} viewBox={`0 0 ${boyut} ${boyut}`} style={{ transform: 'rotate(-90deg)' }}>
        <defs>
          <linearGradient id="yp-halka" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--adacayi)" />
            <stop offset="1" stopColor="var(--yaprak)" />
          </linearGradient>
        </defs>
        <circle cx={boyut / 2} cy={boyut / 2} r={r} fill="none" stroke="var(--v0)" strokeWidth={kalinlik} />
        <circle
          cx={boyut / 2} cy={boyut / 2} r={r} fill="none" stroke="url(#yp-halka)" strokeWidth={kalinlik} strokeLinecap="round"
          strokeDasharray={cevre} strokeDashoffset={dolu ? off : cevre}
          style={{ transition: azalt ? undefined : 'stroke-dashoffset 0.9s cubic-bezier(.4,0,.2,1)' }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 14, color: 'var(--metin1)' }}>
          %<CanliSayi value={Math.round(oran * 100)} />
        </span>
      </div>
    </div>
  )
}

/* ── Küçük uyarı üçgeni (dürüst-boşluk başlığı) ── */
function UyariUcgen() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <path d="M12 4 22 20H2z" stroke="var(--uyari)" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M12 10v4M12 17h.01" stroke="var(--uyari)" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

/**
 * SERVİS SAĞLIĞI — nokta + KELİMELİ satırlar. Ayrı bir servis-sağlık ucu YOK;
 * her satır elimizdeki GERÇEK sinyalden dürüstçe türetilir, uydurulmaz:
 *  · API      — havuz/görev isteği çözüldüyse learnup-brain erişilebilir.
 *  · Supabase — havuz verisi Postgres'ten geldi → bağlı.
 *  · Worker   — /admin/gorevler `saglik`inden (iyi/uyarı/kritik); veri yoksa OlcumYok.
 *  · Redis    — anlık durumu üç uçta YOK. null ≠ 0 → OlcumYok. Redis'in gerçek hâli
 *               yalnız görev-yeniden yanıtındaki `akisaItildi` ile REAKTİF görünür;
 *               kapalıysa bekçi 5 dk'da toplar (hata değil, bilinçli degrade).
 */
function ServisSagligi({ havuzVar, gorev, gorevHata }: {
  havuzVar: boolean
  gorev: AdminGorevlerYaniti | null
  gorevHata: boolean
}) {
  // Worker satırı: gerçek `saglik` → kelime + nokta rengi.
  const workerYok = gorevHata || !gorev
  const takilanN = gorev?.takilanlar.length ?? 0
  const workerKelime = workerYok
    ? null
    : takilanN > 0
      ? `takılma var · ${takilanN} görev`
      : gorev!.saglik === 'iyi' ? 'çalışıyor' : gorev!.saglik === 'uyari' ? 'gecikmeli' : 'takılma var'
  const workerNokta = workerYok
    ? 'var(--metin3)'
    : gorev!.saglik === 'iyi' && takilanN === 0 ? 'var(--dogru)' : 'var(--uyari)'

  return (
    <section className="yp-kart yp-panel-ic">
      <div className="yp-panel-bas">
        <Icon name="pulse" size={14} color="var(--vurgu)" />
        <h3>Servis Sağlığı</h3>
      </div>

      <div className="yp-servis-satir">
        <span className="nokta" style={{ background: havuzVar ? 'var(--dogru)' : 'var(--metin3)' }} />
        <span className="ad">API</span>
        <span className="not">{havuzVar ? 'çalışıyor' : 'yanıt yok'}</span>
      </div>

      <div className="yp-servis-satir">
        <span className="nokta" style={{ background: havuzVar ? 'var(--dogru)' : 'var(--metin3)' }} />
        <span className="ad">Supabase</span>
        <span className="not">{havuzVar ? 'bağlı' : 'okunamadı'}</span>
      </div>

      <div className="yp-servis-satir">
        <span className="nokta" style={{ background: workerNokta }} />
        <span className="ad">Worker</span>
        <span className="not">{workerKelime ?? <OlcumYok />}</span>
      </div>

      <div className="yp-servis-satir">
        <span className="nokta" style={{ background: 'var(--metin3)' }} />
        <span className="ad">Redis</span>
        {/* Anlık durum ölçülmez (3 uçta yok). Reaktif: görev kuyruklarken görünür; kapalıysa bekçi modu. */}
        <span className="not"><OlcumYok not="ölçüm yok · yeniden kuyruklarken görünür" /></span>
      </div>
    </section>
  )
}
