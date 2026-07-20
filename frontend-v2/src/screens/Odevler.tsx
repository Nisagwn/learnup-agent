import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { toast } from 'sonner'
import { Icon } from '../ui'
import { cn } from '../lib/cn'
import { useAsync } from '../lib/useAsync'
import { apiGet, apiPost } from '../lib/api.js'
import type { OdevListesi, OdevOzeti, HedefliSetOzeti, OdevSorusu } from '../lib/types'
import { GlassCard, GlowButton, Badge, SectionLabel, Skeleton } from '../components/ui'
import { Reveal } from '../components/fx'
import { Halka, BosDurum } from '../components/cekirdek'
import { MathMarkdown } from '../components/MathMarkdown'

/* ═══════════════════════════════════════════════════════════════════════════
   ÖDEVLER — öğretmenli öğrencinin panosu (nav'da yalnız teacher_id varsa).
   · Sınıf ödevleri + hedefli setler, gönderim durumu rozetli
   · Çözüm akışı: sorular CEVAPSIZ gelir (sunucu soyar), tüm cevaplar toplanır,
     TEK gönderim (Radix onay — tek-gönderim kuralı) → otoriter skor
   ═══════════════════════════════════════════════════════════════════════════ */

const HARFLER = ['A', 'B', 'C', 'D', 'E']

type Aktif =
  | { tur: 'sinif'; odev: OdevOzeti }
  | { tur: 'hedefli'; odev: HedefliSetOzeti }

export function Odevler() {
  const liste = useAsync<OdevListesi>(() => apiGet('/assignments'), [])
  const [aktif, setAktif] = useState<Aktif | null>(null)

  if (aktif) {
    return (
      <OdevCoz
        aktif={aktif}
        onKapat={(gonderildi) => {
          setAktif(null)
          if (gonderildi) liste.reload()
        }}
      />
    )
  }

  const v = liste.data
  const bos = v && v.assignments.length === 0 && v.targeted.length === 0

  return (
    <div className="mx-auto max-w-4xl px-[clamp(16px,3.5vw,44px)] pb-20 pt-9">
      <Reveal>
        <h1 className="font-display text-[28px] font-bold tracking-tight text-slate-800 dark:text-slate-100">Ödevler</h1>
        <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">
          Öğretmeninin verdiği ödevler ve sana özel hedefli setler — puanlama sunucuda, tek gönderim.
        </p>
      </Reveal>

      {liste.loading ? (
        <div className="mt-6 space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : liste.error ? (
        <GlassCard blur={false} className="mt-6 px-6 py-6 text-center text-sm text-slate-500">
          Ödevler yüklenemedi: {liste.error}
          <div className="mt-3"><GlowButton variant="outline" size="sm" onClick={() => liste.reload()}>Tekrar dene</GlowButton></div>
        </GlassCard>
      ) : bos ? (
        <div className="mt-10">
          <BosDurum
            baslik="Henüz ödev yok"
            aciklama="Öğretmenin ödev verdiğinde burada belirir. O zamana dek Analiz'deki zayıf konularına yüklenebilirsin."
          />
        </div>
      ) : (
        <>
          {v!.targeted.length > 0 && (
            <Reveal delay={0.06}>
              <div className="mt-7">
                <SectionLabel>Sana Özel Setler</SectionLabel>
                <div className="space-y-2.5">
                  {v!.targeted.map((t) => {
                    const tamam = t.status === 'completed'
                    return (
                      <OdevKarti
                        key={t.id}
                        baslik={t.title}
                        soruSayisi={t.soruSayisi}
                        durum={tamam
                          ? { rozet: 'tamamlandı', ton: 'emerald' as const, skor: t.score != null && t.maxScore ? `${t.score}/${t.maxScore}` : null }
                          : { rozet: 'bekliyor', ton: 'amber' as const, skor: null }}
                        tiklanabilir={!tamam}
                        onClick={() => setAktif({ tur: 'hedefli', odev: t })}
                      />
                    )
                  })}
                </div>
              </div>
            </Reveal>
          )}

          {v!.assignments.length > 0 && (
            <Reveal delay={0.1}>
              <div className="mt-7">
                <SectionLabel>Sınıf Ödevleri</SectionLabel>
                <div className="space-y-2.5">
                  {v!.assignments.map((a) => {
                    const gonderildi = a.submission != null
                    return (
                      <OdevKarti
                        key={a.id}
                        baslik={a.title}
                        soruSayisi={a.soruSayisi}
                        durum={gonderildi
                          ? { rozet: 'gönderildi', ton: 'emerald' as const, skor: a.submission!.score != null && a.submission!.maxScore ? `${a.submission!.score}/${a.submission!.maxScore}` : null }
                          : { rozet: 'bekliyor', ton: 'amber' as const, skor: null }}
                        tiklanabilir={!gonderildi}
                        onClick={() => setAktif({ tur: 'sinif', odev: a })}
                      />
                    )
                  })}
                </div>
              </div>
            </Reveal>
          )}
        </>
      )}
    </div>
  )
}

function OdevKarti({ baslik, soruSayisi, durum, tiklanabilir, onClick }: {
  baslik: string
  soruSayisi: number
  durum: { rozet: string; ton: 'emerald' | 'amber'; skor: string | null }
  tiklanabilir: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={tiklanabilir ? onClick : undefined}
      disabled={!tiklanabilir}
      className={cn(
        'glass-solid flex w-full items-center gap-4 rounded-2xl px-5 py-4 text-left',
        tiklanabilir
          ? 'cursor-pointer transition-all hover:-translate-y-px hover:border-sky-500/30 hover:shadow-card dark:hover:border-sky-400/25'
          : 'opacity-75',
      )}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-300">
        <Icon name="book" size={19} color="currentColor" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate font-display text-[13.5px] font-bold text-slate-700 dark:text-slate-200">{baslik}</div>
        <div className="mt-0.5 font-mono text-[10.5px] text-slate-400 dark:text-slate-500">{soruSayisi} soru · tek gönderim</div>
      </div>
      {durum.skor && <span className="font-mono text-[12px] font-semibold text-slate-600 dark:text-slate-300">{durum.skor}</span>}
      <Badge tone={durum.ton}>{durum.rozet}</Badge>
      {tiklanabilir && <Icon name="chevronRight" size={15} color="currentColor" style={{ opacity: 0.4 }} />}
    </button>
  )
}

/* ── Çözüm akışı — tüm cevaplar toplanır, TEK gönderim ────────────────────── */
function OdevCoz({ aktif, onKapat }: { aktif: Aktif; onKapat: (gonderildi: boolean) => void }) {
  const yol = aktif.tur === 'sinif'
    ? `/assignments/${aktif.odev.id}/questions`
    : `/assignments/targeted/${aktif.odev.id}/questions`
  const sorular = useAsync<{ title: string; questions: OdevSorusu[] }>(() => apiGet(yol), [yol])
  const [cevaplar, setCevaplar] = useState<Record<string, number>>({})
  const [gonderiliyor, setGonderiliyor] = useState(false)
  const [sonuc, setSonuc] = useState<{ dogru: number; toplam: number } | null>(null)

  const qs = sorular.data?.questions ?? []
  const cevapli = Object.keys(cevaplar).length

  const gonder = async () => {
    if (gonderiliyor) return
    setGonderiliyor(true)
    try {
      const answers = qs.map((q) => ({ questionId: q.id, selectedIndex: cevaplar[q.id] ?? -1 }))
      const r = aktif.tur === 'sinif'
        ? await apiPost('/assignments/submit', { assignmentId: aktif.odev.id, answers })
        : await apiPost('/assignments/targeted/submit', { targetedAssignmentId: aktif.odev.id, answers })
      setSonuc({ dogru: Number(r?.correctCount ?? r?.autoScore ?? 0), toplam: Number(r?.maxScore ?? qs.length) })
    } catch (e: any) {
      toast.error('Gönderilemedi', { description: e?.message })
    } finally {
      setGonderiliyor(false)
    }
  }

  if (sonuc) {
    const yuzde = sonuc.toplam ? Math.round((sonuc.dogru / sonuc.toplam) * 100) : 0
    return (
      <div className="mx-auto grid min-h-[70vh] max-w-md place-items-center px-6">
        <div className="text-center">
          <div className="mx-auto w-fit">
            <Halka oran={yuzde / 100} boyut={104} kalinlik={8}
              renk={yuzde >= 70 ? 'var(--color-emerald-500)' : yuzde >= 40 ? 'var(--color-amber-500)' : 'var(--color-rose-500)'}>
              <span className="font-display text-[24px] font-extrabold text-slate-800 dark:text-slate-100">%{yuzde}</span>
            </Halka>
          </div>
          <h2 className="mt-5 font-display text-[20px] font-bold text-slate-800 dark:text-slate-100">Ödev gönderildi</h2>
          <p className="mt-1.5 text-[13px] text-slate-500 dark:text-slate-400">
            {sonuc.dogru}/{sonuc.toplam} doğru — sonuç öğretmenine iletildi.
          </p>
          <GlowButton className="mt-6" onClick={() => onKapat(true)}>Panoya dön</GlowButton>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-[clamp(16px,3.5vw,44px)] pb-24 pt-9">
      {/* Üst bar */}
      <div className="flex items-center gap-3">
        <button onClick={() => onKapat(false)} className="glass-solid grid size-9 cursor-pointer place-items-center rounded-xl text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
          <Icon name="close" size={16} color="currentColor" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-[17px] font-bold text-slate-800 dark:text-slate-100">
            {sorular.data?.title ?? aktif.odev.title}
          </h1>
          <p className="font-mono text-[10.5px] text-slate-400 dark:text-slate-500">{cevapli}/{qs.length} cevaplandı</p>
        </div>
      </div>

      {sorular.loading ? (
        <div className="mt-6 space-y-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-40" />)}</div>
      ) : (
        <div className="mt-6 space-y-6">
          {qs.map((q, qi) => (
            <div key={q.id} className="glass-solid rounded-2xl px-5 py-4">
              <div className="text-[14.5px] leading-relaxed text-slate-700 dark:text-slate-200">
                <span className="font-display font-bold">{qi + 1}.</span>{' '}
                <MathMarkdown inline>{q.question_text}</MathMarkdown>
              </div>
              <div className="mt-3 space-y-2">
                {q.options.map((secenek, i) => {
                  const secildi = cevaplar[q.id] === i
                  return (
                    <button
                      key={i}
                      onClick={() => setCevaplar((c) => ({ ...c, [q.id]: i }))}
                      className={cn(
                        'flex w-full cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors',
                        secildi
                          ? 'border-sky-500/70 bg-sky-500/10'
                          : 'border-slate-300/40 hover:border-sky-500/40 dark:border-ocean-700',
                      )}
                    >
                      <span className={cn(
                        'grid size-7 shrink-0 place-items-center rounded-full font-display text-[12px] font-extrabold',
                        secildi ? 'bg-sky-500 text-white' : 'bg-shore-100 text-slate-500 dark:bg-ocean-800 dark:text-slate-400',
                      )}>
                        {HARFLER[i] ?? i + 1}
                      </span>
                      <span className="text-[13.5px] text-slate-600 dark:text-slate-300">
                        <MathMarkdown inline>{String(secenek)}</MathMarkdown>
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Gönderim — Radix onay (tek gönderim kuralı) */}
      {qs.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40">
          <div className="glass mx-auto flex max-w-3xl items-center gap-4 rounded-t-2xl border-b-0 px-5 py-3.5">
            <span className="flex-1 font-mono text-[11.5px] text-slate-500 dark:text-slate-400">
              {cevapli}/{qs.length} cevaplandı{cevapli < qs.length ? ' — boşlar yanlış sayılır' : ''}
            </span>
            <Dialog.Root>
              <Dialog.Trigger asChild>
                <GlowButton size="sm" disabled={cevapli === 0 || gonderiliyor}>Gönder</GlowButton>
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-[85] bg-ocean-950/50 backdrop-blur-sm" />
                <Dialog.Content className="glass fixed left-1/2 top-1/2 z-[86] w-[min(92vw,360px)] -translate-x-1/2 -translate-y-1/2 rounded-3xl p-6 shadow-card">
                  <Dialog.Title className="font-display text-[16px] font-bold text-slate-800 dark:text-slate-100">
                    Ödevi gönder?
                  </Dialog.Title>
                  <Dialog.Description className="mt-2 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
                    Bu ödev TEK gönderimlik — gönderdikten sonra cevap değiştirilemez.
                    {cevapli < qs.length && ` ${qs.length - cevapli} soru boş.`}
                  </Dialog.Description>
                  <div className="mt-5 flex justify-end gap-2.5">
                    <Dialog.Close asChild>
                      <button className="cursor-pointer rounded-xl px-4 py-2 font-display text-[13px] font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-200">
                        Dön
                      </button>
                    </Dialog.Close>
                    <Dialog.Close asChild>
                      <GlowButton size="sm" onClick={gonder}>Evet, gönder</GlowButton>
                    </Dialog.Close>
                  </div>
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
          </div>
        </div>
      )}
    </div>
  )
}
