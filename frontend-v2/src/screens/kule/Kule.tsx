import { toast } from 'sonner'
import { apiGet, apiPost } from '../../lib/api'
import { useAsync } from '../../lib/useAsync'
import type {
  AdminEvalYaniti, AdminGorevlerYaniti, AdminHavuzYaniti, GorevYenidenYanit,
} from '../../lib/types.admin'
import { Sayfa, PanoIskeleti } from '../../components/RolGecidi'
import { GlowButton, StatusLine } from '../../components/ui'
import { CanliSayi, Halka, StatTile } from '../../components/cekirdek'
import { GlowBorder, Reveal, WaveDivider } from '../../components/fx'
import { AjanSagligi, EvalTrendi, OlcumYok } from '../../components/kule'
import { SinifBaslik } from '../../components/sinif'

/**
 * KULE — sistemin motor dairesi tek bakışta.
 *
 * ⚠️ ÜRETİM HUNİSİ BURADA YOK ve bu bir eksiklik olarak GÖSTERİLİR. Elenen aday
 * hiçbir yere yazılmıyor (generateVerifiedSet bellekte eliyor); huniyi eval
 * anlıklarından türetmek uydurma olurdu. Boş bir huni paneli çizmek ise
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
        <div className="glass-solid mx-auto max-w-md rounded-2xl px-6 py-8 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">Sistem verisi alınamadı: {havuz.error}</p>
          <GlowButton className="mt-4" variant="outline" onClick={() => havuz.reload()}>Tekrar dene</GlowButton>
        </div>
      </Sayfa>
    )
  }

  const h = havuz.data!
  const toplamHavuz = h.ai.toplam + h.osym.toplam
  const dogrulanmis = h.ai.verified + h.osym.verified
  const oran = toplamHavuz ? dogrulanmis / toplamHavuz : 0

  return (
    <Sayfa>
      <Reveal>
        <SinifBaslik
          ad="Kule"
          altBilgi="Havuz, kalite kapıları ve ajan sağlığı — motorun bütün göstergeleri tek ekranda."
          sag={
            <StatusLine active={gorev.data?.saglik === 'iyi'}>
              {ev.data?.sonKosumYasiSaat == null
                ? 'eval hiç koşmadı'
                : `son eval ${Math.round(ev.data.sonKosumYasiSaat)} saat önce`}
            </StatusLine>
          }
        />
      </Reveal>

      <Reveal delay={0.04}>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <GlowBorder mode="always">
            <div className="glass-solid flex items-center gap-4 rounded-2xl px-5 py-4">
              <Halka oran={oran} boyut={72} kalinlik={7}>
                <span className="font-display text-[15px] font-bold text-slate-700 dark:text-slate-200">
                  %<CanliSayi value={Math.round(oran * 100)} />
                </span>
              </Halka>
              <div className="min-w-0">
                <p className="font-display text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                  Doğrulanmış Oran
                </p>
                <p className="mt-1 font-mono text-[10.5px] leading-relaxed text-slate-400 dark:text-slate-500">
                  {dogrulanmis}/{toplamHavuz} soru kapılardan geçti
                </p>
              </div>
            </div>
          </GlowBorder>

          <StatTile icon="waves" label="Havuz Hacmi" alt={`ÖSYM ${h.osym.toplam} · AI ${h.ai.toplam}`}>
            <CanliSayi value={toplamHavuz} />
          </StatTile>

          <StatTile
            icon="scan"
            label="Müfredat Kapsaması"
            alt={`${h.kapsama.herhangiKapsanan}/${h.kapsama.kazanimToplam} kazanımda soru var`}
          >
            %<CanliSayi value={Math.round(h.kapsama.kapsamaOrani * 100)} />
          </StatTile>

          {/* Sızıntı oranı YÜKSELİRSE kötü → deltaIyi=false (yükselen rose olur). */}
          <StatTile
            icon="shield"
            label="Şık Uzunluk Sızıntısı"
            deltaIyi={false}
            alt={ev.data?.sonuncu ? `son eval · n=${ev.data.sonuncu.ai.n}` : 'eval koşmadı'}
          >
            {ev.data?.sonuncu?.ai.sizintiOrani == null
              ? <OlcumYok />
              : <>%<CanliSayi value={Math.round(ev.data.sonuncu.ai.sizintiOrani * 100)} /></>}
          </StatTile>
        </div>
      </Reveal>

      <WaveDivider className="mt-7" />

      <div className="mt-7 grid items-start gap-6 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          {ev.data && <Reveal delay={0.1}><EvalTrendi trend={ev.data.trend} /></Reveal>}

          {/* Ölçülmeyen şeyi UYDURMA — eksikliği açıkça bildir. */}
          <Reveal delay={0.16}>
            <div className="glass-solid rounded-2xl border-amber-500/25 px-5 py-4">
              <p className="font-display text-[13px] font-semibold text-slate-700 dark:text-slate-200">
                Üretim hunisi henüz ölçülmüyor
              </p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-slate-500 dark:text-slate-400">
                "Kaç aday üretildi, hangi kapı kaçını eledi, kaç onarım tuttu" sorusu şu an
                yanıtsız: elenen adaylar üretim döngüsünde bellekte eleniyor ve hiçbir yere
                yazılmıyor. Bu sayıları eval anlıklarından türetmek uydurma olurdu — eval
                yalnız <strong>havuza girmiş</strong> soruları ölçer, elenenleri tanım gereği
                göremez. Huni, üretim hattına telemetri eklendiğinde burada belirecek.
              </p>
            </div>
          </Reveal>
        </div>

        <div className="min-w-0 space-y-6">
          {gorev.data && (
            <Reveal delay={0.14}>
              <AjanSagligi veri={gorev.data} onYeniden={gorevYeniden} />
            </Reveal>
          )}
          {ev.data?.uyari && (
            <Reveal delay={0.18}>
              <div className="glass-solid rounded-2xl border-amber-500/25 px-5 py-4">
                <p className="text-[12.5px] leading-relaxed text-amber-700 dark:text-amber-300">
                  {ev.data.uyari}
                </p>
              </div>
            </Reveal>
          )}
        </div>
      </div>
    </Sayfa>
  )
}
