import { apiGet } from '../../lib/api'
import { useAsync } from '../../lib/useAsync'
import type { AdminOzgunlukYaniti } from '../../lib/types.admin'
import { Sayfa, PanoIskeleti } from '../../components/RolGecidi'
import { GlowButton } from '../../components/ui'
import { CanliSayi } from '../../components/cekirdek'
import { Reveal } from '../../components/fx'
import { EsikTablosu, OlcumYok } from '../../components/kule'
import { Icon } from '../../ui'

const ondalik = (n: number, basamak: number): string =>
  n.toLocaleString('tr-TR', { minimumFractionDigits: basamak, maximumFractionDigits: basamak })

/**
 * ÖZGÜNLÜK BARİYERİ — anlatı sayfası (FİDAN v1.2 inline desen, `oz-*` scoped;
 * onaylı önizleme: docs/design/onizleme/ozgunluk-bariyeri.html, 2026-07-23).
 *
 * Ürünü savunulabilir kılan şey burada: "sorularımız özgün" iddiası, eşiğin
 * NEREDEN geldiği görünmeden anlamsızdır. Sayfa hem ölçümü hem yöntemi gösterir.
 *
 * ⚠️ MOCK YOK. Tek gerçek uç: GET /admin/ozgunluk. İKİ İMZA DÜRÜSTLÜK ÖĞESİ:
 *  1. "ölçüm yok" ≠ "0 kopya": eval koşmadıysa hero "Ölçüm yok" der; 0 kopya ile
 *     ölçülmemiş ASLA aynı gösterilmez (null ≠ 0).
 *  2. "Bariyerin Sınırı": bariyerde elenen aday ÖLÇÜLMÜYOR (bellekte eleniyor);
 *     hayatta kalanlardan türetmek uydurma olurdu → OlcumYok. (Üretim hunisi
 *     dürüst-boşluğunun ikizi.)
 */
export function OzgunlukBariyeri() {
  const oz = useAsync<AdminOzgunlukYaniti>(() => apiGet('/admin/ozgunluk'), [])

  if (oz.loading) return <PanoIskeleti sutun={2} />
  if (oz.error) {
    return (
      <Sayfa>
        <div
          className="mx-auto max-w-md rounded-2xl px-6 py-8 text-center"
          style={{ background: 'var(--cam)', border: '1px solid var(--cam-kenar)', boxShadow: 'var(--golge)' }}
        >
          <p className="text-sm" style={{ color: 'var(--metin2)' }}>Bariyer verisi alınamadı: {oz.error}</p>
          <GlowButton className="mt-4" variant="outline" onClick={() => oz.reload()}>Tekrar dene</GlowButton>
        </div>
      </Sayfa>
    )
  }

  const o = oz.data!
  const kopya = o.snapshot?.nnKopya
  const havuzToplam = o.esikler.reduce((s, e) => s + e.havuzAdedi, 0)

  return (
    <Sayfa>
      <style>{`
        .oz-kart { position: relative; background: var(--cam); backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px); border: 1px solid var(--cam-kenar); border-radius: 20px;
          box-shadow: var(--golge); }

        .oz-baslik { padding: 16px 22px; }
        .oz-baslik h1 { font-family: Outfit, sans-serif; font-weight: 800; font-size: clamp(20px, 2.4vw, 24px);
          color: var(--metin1); letter-spacing: -0.01em; }
        .oz-baslik .alt { font-size: 12.5px; color: var(--metin3); margin-top: 4px; line-height: 1.5; max-width: 560px; }
        .oz-baslik .durum { float: right; font-family: 'JetBrains Mono', monospace; font-size: 10.5px;
          color: var(--metin3); white-space: nowrap; }

        /* hero — tek ışık vurgusu (adaçayı sınır); "ölçüm yok" ≠ "0 kopya" */
        .oz-hero { margin-top: 14px; padding: 28px 26px; text-align: center; border: 1.5px solid var(--adacayi); }
        .oz-hero .buyuk { font-family: Outfit, sans-serif; font-size: clamp(44px, 6vw, 56px); font-weight: 800;
          line-height: 1; color: var(--metin1); }
        .oz-hero .buyuk-yok { font-family: Outfit, sans-serif; font-size: 22px; font-weight: 700; color: var(--metin3); }
        .oz-hero .etiket { margin-top: 8px; font-family: Outfit, sans-serif; font-size: 13px; font-weight: 700;
          letter-spacing: 0.14em; text-transform: uppercase; color: var(--metin3); }
        .oz-hero .aciklama { margin: 10px auto 0; max-width: 520px; font-size: 12.5px; line-height: 1.6; color: var(--metin2); }
        .oz-hero .aciklama strong { color: var(--metin1); font-weight: 700; }

        .oz-izgara { display: grid; grid-template-columns: 1.9fr 1fr; gap: 14px; margin-top: 14px; align-items: start; }
        @media (max-width: 1020px) { .oz-izgara { grid-template-columns: 1fr; } }
        .oz-kolon { display: flex; flex-direction: column; gap: 14px; min-width: 0; }

        .oz-panel-ic { padding: 18px 22px; }
        .oz-panel-bas { display: flex; align-items: center; gap: 9px; margin-bottom: 14px; }
        .oz-panel-bas h3 { font-family: Outfit, sans-serif; font-size: 14px; font-weight: 700; color: var(--metin1);
          display: inline-flex; align-items: center; gap: 8px; }

        /* eşik tablosu (EsikTablosu — components/kule.tsx) */
        .oz-etablo { width: 100%; border-collapse: collapse; font-size: 12px; }
        .oz-etablo th { text-align: left; font-family: 'JetBrains Mono', monospace; font-size: 9.5px;
          letter-spacing: 0.1em; text-transform: uppercase; color: var(--metin3); font-weight: 500;
          padding: 7px 10px; border-bottom: 1px solid var(--cam-kenar); }
        .oz-etablo td { padding: 9px 10px; border-bottom: 1px solid var(--cam-kenar); color: var(--metin2);
          vertical-align: middle; }
        .oz-etablo tr:last-child td { border-bottom: none; }
        .oz-etablo .ders { font-weight: 600; color: var(--metin1); }
        .oz-etablo .esik { font-family: 'JetBrains Mono', monospace; color: var(--vurgu); font-weight: 600; }
        .oz-etablo .taban { font-family: 'JetBrains Mono', monospace; color: var(--metin3); }
        .oz-etablo .n { font-family: 'JetBrains Mono', monospace; color: var(--metin2); }
        .oz-taban-cip { margin-left: 6px; font-family: 'JetBrains Mono', monospace; font-size: 9px;
          letter-spacing: 0.06em; text-transform: uppercase; color: var(--metin3);
          background: color-mix(in srgb, var(--metin3) 12%, transparent); padding: 1px 5px; border-radius: 6px;
          vertical-align: middle; cursor: help; }
        .oz-p90 { margin-top: 12px; padding-top: 10px; border-top: 1px dashed var(--cam-kenar);
          display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 11.5px; color: var(--metin3); }
        .oz-p90 b { font-family: 'JetBrains Mono', monospace; color: var(--toprak); }

        /* Bariyerin Sınırı — dürüst boşluk (uyarı tonlu sınır) */
        .oz-sinir { border-color: color-mix(in srgb, var(--uyari) 25%, transparent); }
        .oz-sinir p { font-size: 12px; line-height: 1.6; color: var(--metin2); margin-top: 8px; }
        .oz-sinir strong { color: var(--metin1); font-weight: 600; }
        .oz-olcumyok { margin-top: 12px; padding: 12px; text-align: center; border: 1.5px dashed var(--adacayi);
          border-radius: 12px; }

        /* Yöntem — şeffaf ölçüm anlatısı */
        .oz-yontem { list-style: none; }
        .oz-yontem li { font-size: 12px; line-height: 1.6; color: var(--metin2); margin-bottom: 9px;
          padding-left: 16px; position: relative; }
        .oz-yontem li:last-child { margin-bottom: 0; }
        .oz-yontem li::before { content: '▸'; position: absolute; left: 0; color: var(--adacayi); }
        .oz-yontem strong { color: var(--metin1); font-weight: 600; }
        .oz-yontem code { font-family: 'JetBrains Mono', monospace; font-size: 11px;
          background: var(--v1); padding: 1px 5px; border-radius: 5px; color: var(--vurgu); }
      `}</style>

      {/* ═══ BAŞLIK ═══ */}
      <Reveal>
        <section className="oz-kart oz-baslik">
          <span className="durum">
            {o.snapshot ? `ölçüm ${new Date(o.snapshot.tarih).toLocaleDateString('tr-TR')}` : 'ölçüm yok'}
          </span>
          <h1>Özgünlük Bariyeri</h1>
          <p className="alt">{o.not}</p>
        </section>
      </Reveal>

      {/* ═══ HERO — tek ışık vurgusu · "ölçüm yok" ≠ "0 kopya" (imza dürüstlük) ═══ */}
      <Reveal delay={0.05}>
        <section className="oz-kart oz-hero">
          {kopya == null ? (
            <>
              {/* "0 kopya" ile "ölçülmedi" ASLA aynı şey gibi gösterilmez. */}
              <div className="buyuk-yok">Ölçüm yok</div>
              <p className="aciklama">
                Eval hiç koşmadığı için en-yakın-komşu kopya sayısı bilinmiyor.
                Bu, "kopya yok" demek <strong>değildir</strong> — ölçülmedi demektir.
              </p>
            </>
          ) : (
            <>
              <div className="buyuk"><CanliSayi value={kopya} /></div>
              <div className="etiket">Eşiği aşan kopya</div>
              <p className="aciklama">
                Havuzdaki {havuzToplam} AI sorusunun hiçbiri kendi dersindeki eşiği aşmadı.
                {o.snapshot?.nnP90 != null && ` En yakın komşu p90 değeri ${ondalik(o.snapshot.nnP90, 3)}.`}
              </p>
            </>
          )}
        </section>
      </Reveal>

      {/* ═══ EŞİK TABLOSU (1.9fr) + SINIR/YÖNTEM (1fr) ═══ */}
      <div className="oz-izgara">
        <Reveal delay={0.1}>
          <EsikTablosu esikler={o.esikler} tabanEsik={o.tabanEsik} p90={o.snapshot?.nnP90 ?? null} />
        </Reveal>

        <div className="oz-kolon">
          <Reveal delay={0.14}>
            <section className="oz-kart oz-panel-ic oz-sinir">
              <div className="oz-panel-bas">
                {/* kelime + ikon birlikte (asla yalnız renk) — uyarı tonlu */}
                <h3><Icon name="shield" size={15} color="var(--uyari)" /><span>Bariyerin Sınırı</span></h3>
              </div>
              <p>
                Bu sayfa havuza <strong>girmiş</strong> soruları ölçer. Bariyerde kaç adayın
                elendiği burada <strong>görünmez</strong>: elenen aday üretim döngüsünde
                bellekte eleniyor ve hiçbir yere yazılmıyor.
              </p>
              <p>
                Eleme sayısını hayatta kalanlardan türetmek uydurma olurdu; bu yüzden
                aşağıdaki alan boş bırakıldı.
              </p>
              <div className="oz-olcumyok">
                {o.engel == null ? (
                  <OlcumYok not="bariyerde elenen aday: ölçülmüyor" />
                ) : (
                  <span className="font-mono text-[12px]" style={{ color: 'var(--metin2)' }}>
                    son 7 gün {o.engel.son7GunElenen} · son 30 gün {o.engel.son30GunElenen}
                  </span>
                )}
              </div>
            </section>
          </Reveal>

          <Reveal delay={0.18}>
            <section className="oz-kart oz-panel-ic">
              <div className="oz-panel-bas"><h3>Yöntem</h3></div>
              <ul className="oz-yontem">
                <li>
                  <strong>{o.shingle} karakterlik</strong> shingle kümeleri — kelime değil
                  karakter, çünkü Türkçe sondan eklemeli bir dil.
                </li>
                <li>
                  Sayılar <code>#</code> ile maskelenir: aynı soru farklı sayılarla yeniden
                  yazılırsa yine yakalanır.
                </li>
                <li>
                  Kalıp ifadeler ("aşağıdakilerden hangisi" vb.) temizlenir — yoksa her soru
                  birbirine benzer çıkardı.
                </li>
                <li>
                  Taban eşik <strong>{ondalik(o.tabanEsik, 2)}</strong>; kendi ölçümü olan
                  derste o dersin eşiği kullanılır.
                </li>
                <li>Eşiği aşan aday <strong>onarılmaz</strong>, doğrudan elenir.</li>
              </ul>
            </section>
          </Reveal>
        </div>
      </div>
    </Sayfa>
  )
}
