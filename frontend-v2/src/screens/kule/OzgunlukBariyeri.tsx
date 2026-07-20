import { apiGet } from '../../lib/api'
import { useAsync } from '../../lib/useAsync'
import type { AdminOzgunlukYaniti } from '../../lib/types.admin'
import { Sayfa, PanoIskeleti } from '../../components/RolGecidi'
import { GlowButton, StatusLine } from '../../components/ui'
import { CanliSayi, PanelBaslik } from '../../components/cekirdek'
import { GlowBorder, Reveal } from '../../components/fx'
import { EsikTablosu, OlcumYok } from '../../components/kule'
import { SinifBaslik } from '../../components/sinif'

/**
 * ÖZGÜNLÜK BARİYERİ — anlatı sayfası.
 *
 * Ürünü savunulabilir kılan şey burada: "sorularımız özgün" iddiası, eşiğin
 * NEREDEN geldiği görünmeden anlamsızdır. Sayfa hem ölçümü hem yöntemi gösterir.
 */
export function OzgunlukBariyeri() {
  const oz = useAsync<AdminOzgunlukYaniti>(() => apiGet('/admin/ozgunluk'), [])

  if (oz.loading) return <PanoIskeleti sutun={2} />
  if (oz.error) {
    return (
      <Sayfa>
        <div className="glass-solid mx-auto max-w-md rounded-2xl px-6 py-8 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">Bariyer verisi alınamadı: {oz.error}</p>
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
      <Reveal>
        <SinifBaslik
          ad="Özgünlük Bariyeri"
          altBilgi={o.not}
          sag={
            <StatusLine active={false}>
              {o.snapshot ? `ölçüm ${new Date(o.snapshot.tarih).toLocaleDateString('tr-TR')}` : 'ölçüm yok'}
            </StatusLine>
          }
        />
      </Reveal>

      <Reveal delay={0.05}>
        <div className="mt-6">
          <GlowBorder mode="always">
            <div className="glass-solid rounded-2xl px-6 py-7 text-center">
              {kopya == null ? (
                <>
                  <p className="font-display text-[22px] font-bold text-slate-400 dark:text-slate-500">
                    Ölçüm yok
                  </p>
                  {/* "0 kopya" ile "ölçülmedi" ASLA aynı şey gibi gösterilmez. */}
                  <p className="mx-auto mt-2 max-w-md text-[12.5px] leading-relaxed text-slate-500 dark:text-slate-400">
                    Eval hiç koşmadığı için en-yakın-komşu kopya sayısı bilinmiyor.
                    Bu, "kopya yok" demek <strong>değildir</strong> — ölçülmedi demektir.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-display text-[52px] font-bold leading-none text-slate-800 dark:text-slate-100">
                    <CanliSayi value={kopya} />
                  </p>
                  <p className="mt-2 font-display text-[13px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                    Eşiği aşan kopya
                  </p>
                  <p className="mx-auto mt-2 max-w-md text-[12.5px] leading-relaxed text-slate-500 dark:text-slate-400">
                    Havuzdaki {havuzToplam} AI sorusunun hiçbiri kendi dersindeki eşiği aşmadı.
                    {o.snapshot?.nnP90 != null && ` En yakın komşu p90 değeri ${o.snapshot.nnP90.toFixed(3)}.`}
                  </p>
                </>
              )}
            </div>
          </GlowBorder>
        </div>
      </Reveal>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
        <Reveal delay={0.1}>
          <EsikTablosu esikler={o.esikler} p90={o.snapshot?.nnP90 ?? null} />
        </Reveal>

        <div className="min-w-0 space-y-6">
          <Reveal delay={0.14}>
            <div className="glass-solid rounded-2xl border-amber-500/25 px-5 py-4">
              <PanelBaslik icon="shield">Bariyerin Sınırı</PanelBaslik>
              <p className="text-[12px] leading-relaxed text-slate-500 dark:text-slate-400">
                Bu sayfa havuza <strong>girmiş</strong> soruları ölçer. Bariyerde kaç adayın
                elendiği burada <strong>görünmez</strong>: elenen aday üretim döngüsünde
                bellekte eleniyor ve hiçbir yere yazılmıyor.
              </p>
              <p className="mt-2 text-[12px] leading-relaxed text-slate-500 dark:text-slate-400">
                Eleme sayısını hayatta kalanlardan türetmek uydurma olurdu; bu yüzden
                aşağıdaki alan boş bırakıldı.
              </p>
              <div className="mt-3 rounded-xl border border-dashed border-slate-300/50 px-3 py-3 text-center dark:border-ocean-700">
                {o.engel == null ? (
                  <OlcumYok not="bariyerde elenen aday: ölçülmüyor" />
                ) : (
                  <span className="font-mono text-[12px] text-slate-600 dark:text-slate-300">
                    son 7 gün {o.engel.son7GunElenen} · son 30 gün {o.engel.son30GunElenen}
                  </span>
                )}
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.18}>
            <div className="glass-solid rounded-2xl px-5 py-4">
              <PanelBaslik icon="scan">Yöntem</PanelBaslik>
              <ul className="space-y-2 text-[12px] leading-relaxed text-slate-500 dark:text-slate-400">
                <li>
                  <strong>{o.shingle} karakterlik</strong> shingle kümeleri — kelime değil
                  karakter, çünkü Türkçe sondan eklemeli bir dil.
                </li>
                <li>
                  Sayılar <code className="font-mono text-[11px]">#</code> ile maskelenir: aynı
                  soru farklı sayılarla yeniden yazılırsa yine yakalanır.
                </li>
                <li>
                  Kalıp ifadeler ("aşağıdakilerden hangisi" vb.) temizlenir — yoksa her soru
                  birbirine benzer çıkardı.
                </li>
                <li>
                  Taban eşik <strong>{o.tabanEsik}</strong>; kendi ölçümü olan derste o dersin
                  eşiği kullanılır.
                </li>
                <li>Eşiği aşan aday <strong>onarılmaz</strong>, doğrudan elenir.</li>
              </ul>
            </div>
          </Reveal>
        </div>
      </div>
    </Sayfa>
  )
}
