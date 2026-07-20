import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { apiGet, apiPost } from '../../lib/api'
import { useAsync } from '../../lib/useAsync'
import { useSinif } from '../../lib/sinif'
import { dersAnahtar } from '../../lib/format'
import { NAV_H } from '../../lib/layout'
import { cn } from '../../lib/cn'
import type { IsiHaritasiYaniti } from '../../lib/types.teacher'
import { Icon } from '../../ui'
import { Sayfa } from '../../components/RolGecidi'
import {
  Badge, Chip, FiltreCipi, GlowButton, SegmentGecis, Skeleton, StatusLine, SubjectName,
} from '../../components/ui'
import { BosDurum, PanelBaslik, Sayi } from '../../components/cekirdek'
import { GlowBorder, Reveal } from '../../components/fx'
import { Lighthouse } from '../../components/Lighthouse'
import { MathMarkdown } from '../../components/MathMarkdown'
import { SinifBaslik } from '../../components/sinif'

/**
 * ÖDEV ATÖLYESİ — havuzdan derle, sınıfa ya da tek öğrenciye gönder.
 *
 * ⚠️ SİHİRBAZ YOK (plandan bilinçli sapma): "Sorular" ve "İnceleme" adımları pratikte
 * aynı şey — filtre kurulunca eşleşenler zaten görünüyor. Havuzun seyrek olduğu
 * (kazanımların %70'inde soru yok) bir ortamda ayrı bir "seçim" adımı, kullanıcıyı
 * sık sık BOŞ bir ekrana götürürdü. Tek sayfa: solda kapsam + eşleşenler, sağda sepet.
 *
 * ⚠️ LLM YOK: backend havuzdan derler. Yetmezse `bulunan < istenen` gelir ve
 * uyarı olduğu gibi gösterilir — sayı uydurulmaz.
 */

type HavuzSorusu = {
  id: string
  kaynak: 'osym' | 'ai'
  subject: string
  topic: string | null
  kazanimId: number | null
  questionText: string
  difficulty: string | null
  quality: number | null
  examLabel: string | null
  examYear: number | null
}

const KAYNAK: Array<['karisik' | 'osym' | 'ai', string]> = [
  ['karisik', 'Karışık'],
  ['osym', 'ÖSYM'],
  ['ai', 'AI'],
]
const ZORLUK: Array<['', string]> | Array<[string, string]> = [
  ['', 'Hepsi'],
  ['kolay', 'Kolay'],
  ['orta', 'Orta'],
  ['zor', 'Zor'],
]

export function OdevAtolyesi() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const { roster } = useSinif()

  // Derin bağlantı ön-dolgusu: röntgendeki "Set gönder" buraya böyle gelir.
  const onDolguOgrenci = params.get('ogrenci')
  const onDolguKazanim = params.get('kazanim')
  const onDolguDers = params.get('ders')

  const [ders, setDers] = useState<string | null>(onDolguDers)
  const [kaynak, setKaynak] = useState<'karisik' | 'osym' | 'ai'>('karisik')
  const [zorluk, setZorluk] = useState('')
  const [adet, setAdet] = useState(10)
  const [hedef, setHedef] = useState<string>(onDolguOgrenci ?? 'sinif')
  const [yayinlaniyor, setYayinlaniyor] = useState(false)
  const [ara, setAra] = useState('')
  const [araGecikmeli, setAraGecikmeli] = useState('')
  const [sayfa, setSayfa] = useState(0)
  /** Elle seçim. Boşsa filtre + rastgele örnekleme; doluysa TAM OLARAK bunlar gider. */
  const [secili, setSecili] = useState<string[]>([])

  // Aramayı geciktir: her tuşta havuza gitmek geniş havuzda hem yavaş hem gereksiz.
  useEffect(() => {
    const t = setTimeout(() => { setAraGecikmeli(ara.trim()); setSayfa(0) }, 350)
    return () => clearTimeout(t)
  }, [ara])

  const kazanimId = onDolguKazanim ? Number(onDolguKazanim) : null

  // Ders listesi sınıfın ısı haritasından: öğretmene "sınıfının çalıştığı dersler"
  // gösterilir, müfredatın tamamı değil.
  const isi = useAsync<IsiHaritasiYaniti>(() => apiGet('/teacher/sinif/isi-haritasi'), [])
  const dersler = isi.data?.subjects ?? []

  // ⚠️ Bağımlılıklar İLKEL: useAsync deps'i effect dizisine yayar (useAsync.ts:19),
  // taze nesne geçmek sonsuz refetch olurdu.
  const SAYFA_BOY = 20
  const havuz = useAsync<{ sorular: HavuzSorusu[]; total: number }>(
    () =>
      apiGet('/teacher/soru-havuzu', {
        kaynak,
        subject: ders ?? '',
        kazanimId: kazanimId ?? '',
        difficulty: zorluk,
        q: araGecikmeli,
        limit: SAYFA_BOY,
        offset: sayfa * SAYFA_BOY,
      }),
    [kaynak, ders, kazanimId, zorluk, araGecikmeli, sayfa],
  )

  const eslesen = havuz.data?.sorular ?? []
  // Havuzda kaç soru VAR (bu sayfada kaç tane değil) — geniş havuzda ayrım kritik.
  const havuzToplam = havuz.data?.total ?? 0
  const gonderilecek = secili.length > 0 ? secili.length : Math.min(adet, havuzToplam)
  const yeterli = secili.length > 0 || havuzToplam >= adet
  const sonSayfa = Math.max(0, Math.ceil(havuzToplam / SAYFA_BOY) - 1)

  const secimCevir = (id: string): void =>
    setSecili((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  const hedefOgrenci = useMemo(
    () => (hedef === 'sinif' ? null : roster.find((o) => o.studentId === hedef) ?? null),
    [hedef, roster],
  )

  // Ön-dolgu dersi ısı haritasında yoksa kullanıcıyı yanıltmayalım.
  useEffect(() => {
    if (onDolguDers && dersler.length && !dersler.includes(onDolguDers)) setDers(onDolguDers)
  }, [onDolguDers, dersler])

  const yayinla = async (): Promise<void> => {
    setYayinlaniyor(true)
    try {
      if (hedefOgrenci) {
        const y = await apiPost('/teacher/hedefli-odev', {
          studentId: hedefOgrenci.studentId,
          soruSayisi: adet,
          kaynak,
          ...(kazanimId ? { kazanimIds: [kazanimId] } : {}),
        })
        toast.success(`${hedefOgrenci.name ?? 'Öğrenciye'} ${y.bulunan} soruluk set gönderildi`)
        if (y.uyari) toast.warning(y.uyari)
      } else {
        const y = await apiPost('/teacher/odev', {
          subject: ders ?? undefined,
          kaynak,
          soruSayisi: adet,
          ...(kazanimId ? { kazanimId } : {}),
          ...(zorluk ? { difficulty: zorluk } : {}),
          // Elle seçim varsa filtre yok sayılır — backend tam olarak bunları alır.
          ...(secili.length ? { questionIds: secili } : {}),
        })
        toast.success(`Ödev yayınlandı — ${y.bulunan} soru sınıfa gitti`)
        if (y.uyari) toast.warning(y.uyari)
      }
      nav('/sinif')
    } catch (e: any) {
      toast.error(e?.message ?? 'Yayınlanamadı')
    } finally {
      setYayinlaniyor(false)
    }
  }

  const kapsamVar = Boolean(ders || kazanimId)

  return (
    <Sayfa>
      <Reveal>
        <SinifBaslik
          ad="Ödev Atölyesi"
          altBilgi="Havuzdan derle, ÖSYM kalibrasyonundan geçmiş soruları sınıfa ya da tek öğrenciye gönder."
          sag={
            <StatusLine active={!havuz.loading}>
              {havuz.loading ? 'havuz taranıyor…' : `${havuz.data?.total ?? 0} doğrulanmış soru`}
            </StatusLine>
          }
        />
      </Reveal>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
        {/* ── SOL: kapsam + eşleşenler ── */}
        <div className="min-w-0 space-y-6">
          <Reveal delay={0.06}>
            <div className="glass-solid rounded-2xl px-5 py-4">
              <PanelBaslik icon="filter">Kapsam</PanelBaslik>

              <label className="block text-[11.5px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">
                Ders
              </label>
              <div className="mt-2 flex flex-wrap gap-2">
                {isi.loading ? (
                  <Skeleton className="h-8 w-64" />
                ) : dersler.length === 0 ? (
                  <p className="text-[12.5px] text-slate-400">Sınıfın henüz çalıştığı ders yok.</p>
                ) : (
                  dersler.map((d) => (
                    <FiltreCipi key={d} aktif={ders === d} onClick={() => setDers(ders === d ? null : d)}>
                      <SubjectName subject={d} anahtar={dersAnahtar(d)} className="!text-[12.5px]" />
                    </FiltreCipi>
                  ))
                )}
              </div>

              <div className="mt-4 flex flex-wrap items-end gap-5">
                <div>
                  <label className="block text-[11.5px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">
                    Kaynak
                  </label>
                  <SegmentGecis className="mt-2" secenekler={KAYNAK} deger={kaynak} onDegis={setKaynak} />
                </div>
                <div>
                  <label className="block text-[11.5px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">
                    Zorluk
                  </label>
                  <SegmentGecis
                    className="mt-2"
                    secenekler={ZORLUK as Array<[string, string]>}
                    deger={zorluk}
                    onDegis={setZorluk}
                  />
                </div>
                <div>
                  <label
                    htmlFor="adet"
                    className="block text-[11.5px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500"
                  >
                    Soru sayısı
                  </label>
                  <input
                    id="adet"
                    type="number"
                    min={1}
                    max={40}
                    value={adet}
                    onChange={(e) => setAdet(Math.min(40, Math.max(1, Number(e.target.value) || 1)))}
                    className="mt-2 w-20 rounded-lg border border-slate-500/10 bg-transparent px-3 py-1 font-mono text-[13px] outline-none dark:border-sky-500/10"
                  />
                </div>
              </div>

              {kazanimId && (
                <div className="mt-4 flex items-center gap-2">
                  <Chip tone="teal" icon="target">Tek kazanıma odaklı (#{kazanimId})</Chip>
                  <button
                    type="button"
                    onClick={() => nav('/sinif/odev', { replace: true })}
                    className="cursor-pointer font-display text-[11px] font-semibold text-sky-600 dark:text-sky-400"
                  >
                    kaldır
                  </button>
                </div>
              )}
            </div>
          </Reveal>

          <Reveal delay={0.12}>
            <div className="glass-solid rounded-2xl px-5 py-4">
              <PanelBaslik
                icon="seal"
                sag={
                  <span className="font-mono text-[10.5px] text-slate-400">
                    {havuzToplam > 0 && `${sayfa * SAYFA_BOY + 1}–${sayfa * SAYFA_BOY + eslesen.length} / ${havuzToplam}`}
                  </span>
                }
              >
                Havuz
              </PanelBaslik>

              {/* Arama — geniş havuzda filtre tek başına yetmez */}
              <div className="mb-3 flex items-center gap-2 rounded-xl border border-slate-500/10 px-3 py-2 dark:border-sky-500/10">
                <Icon name="search" size={15} color="currentColor" style={{ opacity: 0.5 }} />
                <input
                  value={ara}
                  onChange={(e) => setAra(e.target.value)}
                  placeholder="Soru metninde ara…"
                  aria-label="Soru metninde ara"
                  className="w-full bg-transparent text-[13px] outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500"
                />
                {ara && (
                  <button
                    type="button"
                    onClick={() => setAra('')}
                    aria-label="Aramayı temizle"
                    className="shrink-0 cursor-pointer text-slate-400 hover:text-slate-600"
                  >
                    <Icon name="close" size={14} color="currentColor" />
                  </button>
                )}
              </div>

              {havuz.loading ? (
                <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>
              ) : !kapsamVar ? (
                <p className="py-6 text-center text-[12.5px] text-slate-400 dark:text-slate-500">
                  Başlamak için bir ders seç.
                </p>
              ) : eslesen.length === 0 ? (
                <BosDurum
                  baslik={araGecikmeli ? 'Aramaya uyan soru yok' : 'Bu kriterlere uyan soru yok'}
                  aciklama={
                    araGecikmeli
                      ? 'Arama terimini kısaltmayı dene.'
                      : "Havuz bu kazanımda henüz boş. Filtreyi gevşet — kaynak 'Karışık', zorluk 'Hepsi'."
                  }
                />
              ) : (
                <>
                  <ul className="space-y-2">
                    {eslesen.map((q) => {
                      const isaretli = secili.includes(q.id)
                      return (
                        <li key={q.id}>
                          <button
                            type="button"
                            onClick={() => secimCevir(q.id)}
                            aria-pressed={isaretli}
                            className={cn(
                              'w-full cursor-pointer rounded-xl border px-3 py-2.5 text-left transition-colors',
                              isaretli
                                ? 'border-sky-500/40 bg-sky-500/10'
                                : 'border-slate-500/10 hover:bg-sky-500/5 dark:border-sky-500/10',
                            )}
                          >
                            <div className="mb-1 flex flex-wrap items-center gap-1.5">
                              {isaretli && <Icon name="check" size={13} color="currentColor" />}
                              {/* Brass yalnız ÖSYM mührü için — tasarım sözleşmesi. */}
                              <Badge tone={q.kaynak === 'osym' ? 'brass' : 'sky'}>
                                {q.kaynak === 'osym' ? (q.examLabel ?? 'ÖSYM') : 'AI'}
                              </Badge>
                              {q.examYear && <Badge tone="slate">{q.examYear}</Badge>}
                              {q.difficulty && <Badge tone="slate">{q.difficulty}</Badge>}
                              {q.quality != null && <Badge tone="emerald">kalite {q.quality}</Badge>}
                            </div>
                            <div className="line-clamp-3 text-[12.5px] leading-relaxed text-slate-600 dark:text-slate-300">
                              <MathMarkdown>{q.questionText}</MathMarkdown>
                            </div>
                          </button>
                        </li>
                      )
                    })}
                  </ul>

                  {sonSayfa > 0 && (
                    <div className="mt-3 flex items-center justify-between">
                      <GlowButton
                        size="sm"
                        variant="ghost"
                        disabled={sayfa === 0}
                        onClick={() => setSayfa((s) => Math.max(0, s - 1))}
                      >
                        ← Önceki
                      </GlowButton>
                      <span className="font-mono text-[11px] text-slate-400">
                        sayfa {sayfa + 1} / {sonSayfa + 1}
                      </span>
                      <GlowButton
                        size="sm"
                        variant="ghost"
                        disabled={sayfa >= sonSayfa}
                        onClick={() => setSayfa((s) => Math.min(sonSayfa, s + 1))}
                      >
                        Sonraki →
                      </GlowButton>
                    </div>
                  )}
                </>
              )}
            </div>
          </Reveal>
        </div>

        {/* ── SAĞ: yapışkan sepet ── */}
        <div className="min-w-0">
          <Reveal delay={0.1}>
            <div className="sticky" style={{ top: NAV_H + 24 }}>
              {/* Sayfanın TEK kalıcı neonu — hero burada sepet. */}
              <GlowBorder mode="always">
                <div className="glass-solid rounded-2xl px-5 py-4">
                  <PanelBaslik icon="book">Set Özeti</PanelBaslik>

                  <label className="block text-[11.5px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">
                    Kime
                  </label>
                  <select
                    value={hedef}
                    onChange={(e) => setHedef(e.target.value)}
                    aria-label="Ödevin hedefi"
                    className="mt-2 w-full rounded-lg border border-slate-500/10 bg-transparent px-3 py-2 text-[13px] outline-none dark:border-sky-500/10"
                  >
                    <option value="sinif">Tüm sınıf ({roster.length} öğrenci)</option>
                    {roster.map((o) => (
                      <option key={o.studentId} value={o.studentId}>
                        {o.name ?? 'İsimsiz öğrenci'}
                      </option>
                    ))}
                  </select>

                  <div className="mt-4 space-y-1.5 font-mono text-[11.5px] text-slate-500 dark:text-slate-400">
                    <Satir etiket="Ders" deger={ders ?? '—'} />
                    <Satir etiket="Kaynak" deger={KAYNAK.find(([k]) => k === kaynak)?.[1] ?? '—'} />
                    <Satir etiket="Zorluk" deger={zorluk || 'Hepsi'} />
                    <Satir
                      etiket="Seçim"
                      deger={secili.length ? `${secili.length} soru elle` : `${adet} soru rastgele`}
                    />
                    <Satir etiket="Havuzda" deger={`${havuzToplam} soru`} />
                  </div>

                  {secili.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSecili([])}
                      className="mt-2 w-full cursor-pointer text-center font-display text-[11px] font-semibold text-sky-600 dark:text-sky-400"
                    >
                      Seçimi temizle — filtreye dön
                    </button>
                  )}

                  {/* Rakamlar filtre değiştikçe YUVARLANIR (NumberFlow) — bu ekranın
                      en yüksek kaldıraçlı mikro-etkileşimi. */}
                  <div
                    className={cn(
                      'mt-4 rounded-xl border px-3 py-2.5 text-center',
                      !kapsamVar
                        ? 'border-slate-300/40 dark:border-ocean-700'
                        : yeterli
                          ? 'border-emerald-500/30 bg-emerald-500/5'
                          : 'border-amber-500/30 bg-amber-500/5',
                    )}
                  >
                    <span className="block font-display text-[26px] font-bold leading-none text-slate-800 dark:text-slate-100">
                      <Sayi value={gonderilecek} />
                    </span>
                    <span className="mt-1 block text-[11px] text-slate-500 dark:text-slate-400">
                      {!kapsamVar
                        ? 'ders seçilmedi'
                        : secili.length > 0
                          ? 'soru gidecek — elle seçildi'
                          : yeterli
                            ? 'soru gidecek'
                            : `soru gidecek · ${adet} istendi`}
                    </span>
                  </div>

                  {/* Eksikse ŞİMDİDEN söyle — yayınladıktan sonra sürpriz olmasın. */}
                  {kapsamVar && !yeterli && havuzToplam > 0 && (
                    <p className="mt-2 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
                      Havuzda bu kriterlerde {havuzToplam} soru var; set o kadarıyla
                      oluşacak. Soru uydurulmaz — eksik olduğu gibi görünür.
                    </p>
                  )}

                  <GlowButton
                    className="mt-4 w-full"
                    icon="send"
                    disabled={yayinlaniyor || !kapsamVar || gonderilecek === 0}
                    onClick={yayinla}
                  >
                    {yayinlaniyor ? 'Yayınlanıyor…' : hedefOgrenci ? 'Sete gönder' : 'Sınıfa yayınla'}
                  </GlowButton>
                </div>
              </GlowBorder>

              {hedefOgrenci && (
                <p className="mt-3 text-center text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
                  Hedefli set, <strong>{hedefOgrenci.name}</strong> için zayıf kazanımlarından derlenir.
                </p>
              )}
            </div>
          </Reveal>
        </div>
      </div>

      {roster.length === 0 && (
        <Reveal delay={0.2}>
          <div className="mt-8">
            <BosDurum
              gorsel={<Lighthouse size={72} />}
              baslik="Sınıfında henüz öğrenci yok"
              aciklama="Ödev gönderebilmek için önce sınıf kodunu paylaş ya da e-postayla öğrenci ekle."
              cta={<GlowButton size="sm" onClick={() => nav('/sinif')}>Sınıf Panosu'na git</GlowButton>}
            />
          </div>
        </Reveal>
      )}
    </Sayfa>
  )
}

function Satir({ etiket, deger }: { etiket: string; deger: string }) {
  return (
    <span className="flex items-center justify-between gap-2">
      <span className="text-slate-400 dark:text-slate-500">{etiket}</span>
      <span className="min-w-0 truncate text-slate-600 dark:text-slate-300">{deger}</span>
    </span>
  )
}
