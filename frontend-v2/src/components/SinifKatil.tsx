import { useState } from 'react'
import { toast } from 'sonner'
import { apiGet, apiPost } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { Icon } from '../ui'
import { Badge, GlassCard, GlowButton, SectionLabel } from './ui'

type SinifDurumu = {
  kayitli: boolean
  ogretmen: { id: string; name: string | null; school: string | null; classCode: string | null } | null
}

/**
 * ÖĞRENCİ — SINIFA KATIL / AYRIL.
 *
 * Bu kart, `profiles.teacher_id`'yi dolduran İKİ yoldan biri (diğeri öğretmenin
 * e-postayla eklemesi). Bunlar yazılana kadar sınıf modeli şemada duruyor ama
 * hiçbir kod onu yazmıyordu — öğretmen paneli tanım gereği boştu.
 *
 * ÖĞRENCİ chunk'ında durur: öğretmen bileşenleri (components/sinif.tsx) ayrı
 * chunk'ta, ikisi birbirine bağlanmaz.
 */
export function SinifKatilKarti() {
  const durum = useAsync<SinifDurumu>(() => apiGet('/sinif'), [])
  const [kod, setKod] = useState('')
  const [mesgul, setMesgul] = useState(false)

  const katil = async (): Promise<void> => {
    const temiz = kod.trim().toUpperCase()
    if (!temiz) return
    setMesgul(true)
    try {
      const y = await apiPost('/sinif/katil', { classCode: temiz })
      toast.success(
        y.degisti
          ? `${y.ogretmen?.name ?? 'Öğretmenin'} sınıfına katıldın`
          : 'Zaten bu sınıftasın',
      )
      setKod('')
      durum.reload()
    } catch (e: any) {
      // Sunucu mesajını olduğu gibi göster: "kod yanlış" ile "sınıf yok" ayrımını
      // kasıtlı olarak yapmıyor (numaralandırma yüzeyi) — biz de uydurmayalım.
      toast.error(e?.message ?? 'Sınıfa katılınamadı')
    } finally {
      setMesgul(false)
    }
  }

  const ayril = async (): Promise<void> => {
    setMesgul(true)
    try {
      await apiPost('/sinif/ayril', {})
      toast.success('Sınıftan ayrıldın')
      durum.reload()
    } catch (e: any) {
      toast.error(e?.message ?? 'Ayrılma başarısız')
    } finally {
      setMesgul(false)
    }
  }

  if (durum.loading) return null

  const d = durum.data

  return (
    <section className="mt-8">
      <SectionLabel>Sınıfım</SectionLabel>
      <GlassCard blur={false} className="px-5 py-4">
        {d?.kayitli && d.ogretmen ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-display text-[14px] font-semibold text-slate-700 dark:text-slate-200">
                {d.ogretmen.name ?? 'Öğretmenin'}
              </p>
              <p className="mt-0.5 flex items-center gap-2 font-mono text-[11px] text-slate-400 dark:text-slate-500">
                {d.ogretmen.school && <span>{d.ogretmen.school}</span>}
                {d.ogretmen.classCode && <Badge tone="sky">{d.ogretmen.classCode}</Badge>}
              </p>
            </div>
            <GlowButton size="sm" variant="ghost" onClick={ayril} disabled={mesgul}>
              Sınıftan ayrıl
            </GlowButton>
          </div>
        ) : (
          <>
            <p className="text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
              Öğretmeninin verdiği sınıf kodunu gir; ödevlerin ve ilerlemen onunla paylaşılsın.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <div className="flex flex-1 items-center gap-2 rounded-xl border border-slate-500/10 px-3 py-2 dark:border-sky-500/10">
                <Icon name="seal" size={15} color="currentColor" style={{ opacity: 0.5 }} />
                <input
                  value={kod}
                  onChange={(e) => setKod(e.target.value.toUpperCase())}
                  onKeyDown={(e) => { if (e.key === 'Enter') void katil() }}
                  placeholder="SINIF KODU"
                  aria-label="Sınıf kodu"
                  maxLength={12}
                  className="w-full bg-transparent font-mono text-[14px] tracking-[0.2em] outline-none placeholder:tracking-normal placeholder:text-slate-400 dark:placeholder:text-slate-500"
                />
              </div>
              <GlowButton size="sm" onClick={katil} disabled={mesgul || !kod.trim()}>
                {mesgul ? 'Katılıyor…' : 'Katıl'}
              </GlowButton>
            </div>
          </>
        )}
      </GlassCard>
    </section>
  )
}
