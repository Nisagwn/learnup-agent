import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { m } from 'framer-motion'
import * as Dialog from '@radix-ui/react-dialog'
import { cn } from '../lib/cn'
import { dersAnahtar } from '../lib/format'
import { Icon } from '../ui'
import { Badge, Chip, FiltreCipi, GlowButton, SegmentGecis, SubjectName } from './ui'
import { CanliSayi, Halka, IsiHucre, Meter, PanelBaslik, Sayi, Sparkline, Tip } from './cekirdek'
import type { IsiHaritasiYaniti, OgrenciRisk, OgrenciSatiri, SinifZayifKazanim } from '../lib/types.teacher'

/* ═══════════════════════════════════════════════════════════════════════════
   ÖĞRETMEN BİLEŞENLERİ — bu modül yalnız /sinif ekranlarınca import edilir,
   yani öğrenci bu chunk'tan tek bayt indirmez.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── Risk rozeti — ASLA yalnız renk ─────────────────────────────────────────
   Renk körü bir öğretmen için kırmızı yüzde ile yeşil yüzde aynıdır. Etiket
   kelimeyi taşır; renk yalnız hızlandırır. (Legacy AtRiskCard saf renk kullanıyordu.) */
const RISK_ETIKET: Record<OgrenciRisk, { ad: string; tone: 'rose' | 'amber' | 'emerald' | 'slate' }> = {
  yuksek: { ad: 'yüksek risk', tone: 'rose' },
  orta: { ad: 'izlemede', tone: 'amber' },
  dusuk: { ad: 'yolunda', tone: 'emerald' },
  // "veri yok" bir RİSK SEVİYESİ DEĞİL, bilginin yokluğudur. Yeşil göstermek yalan olurdu.
  'veri-yok': { ad: 'veri yok', tone: 'slate' },
}

export function RiskRozeti({ risk }: { risk: OgrenciRisk }) {
  const r = RISK_ETIKET[risk]
  return <Badge tone={r.tone}>{r.ad}</Badge>
}

/* ── Öğrenci avatarı — App.tsx:286'daki disk ile aynı ─────────────────────── */
function Avatar({ ad }: { ad: string | null }) {
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-sky-600 to-cyan-600 font-display text-[12px] font-bold text-white">
      {(ad ?? '?').trim().charAt(0).toUpperCase()}
    </span>
  )
}

/* ═══════════════ ÖĞRENCİ LİSTESİ ═══════════════ */

export type SiraAnahtar = 'risk' | 'ad' | 'ustalik' | 'dogruluk' | 'aktiflik'

const SIRA_SECENEK: Array<[SiraAnahtar, string]> = [
  ['risk', 'Risk'],
  ['ustalik', 'Ustalık'],
  ['dogruluk', 'Doğruluk'],
  ['ad', 'Ad'],
]

const RISK_SIRA: Record<OgrenciRisk, number> = { yuksek: 0, orta: 1, 'veri-yok': 2, dusuk: 3 }

/**
 * Sınıftan çıkarma onayı — Radix Dialog.
 *
 * `window.confirm` KULLANILMAZ (legacy TeacherDashboard.jsx:1005 öyle yapıyordu):
 * tarayıcı diyaloğu tasarım dilinin dışına düşer ve mobilde engellenebilir.
 */
function CikarOnayi({ ogrenci, onCikar }: {
  ogrenci: OgrenciSatiri
  onCikar: (id: string) => Promise<void>
}) {
  const [mesgul, setMesgul] = useState(false)
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label={`${ogrenci.name ?? 'Öğrenciyi'} sınıftan çıkar`}
          className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-lg text-slate-300 opacity-0 transition-colors hover:bg-rose-500/10 hover:text-rose-500 focus-visible:opacity-100 group-hover:opacity-100 dark:text-slate-600"
        >
          <Icon name="close" size={14} color="currentColor" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[85] bg-ocean-950/50 backdrop-blur-sm" />
        <Dialog.Content className="glass fixed left-1/2 top-1/2 z-[86] w-[min(92vw,380px)] -translate-x-1/2 -translate-y-1/2 rounded-3xl p-6 shadow-card">
          <Dialog.Title className="font-display text-[16px] font-bold text-slate-800 dark:text-slate-100">
            Sınıftan çıkarılsın mı?
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
            <strong>{ogrenci.name ?? 'Bu öğrenci'}</strong> sınıf listenden çıkar. Verisi
            silinmez — ustalık, çözüm geçmişi ve rozetleri kendisinde kalır. İstersen
            tekrar ekleyebilirsin.
          </Dialog.Description>
          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <GlowButton size="sm" variant="ghost">Vazgeç</GlowButton>
            </Dialog.Close>
            <Dialog.Close asChild>
              <GlowButton
                size="sm"
                variant="outline"
                disabled={mesgul}
                className="!border-rose-500/40 !text-rose-600 dark:!text-rose-300"
                onClick={() => {
                  setMesgul(true)
                  void onCikar(ogrenci.studentId).finally(() => setMesgul(false))
                }}
              >
                Çıkar
              </GlowButton>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export function OgrenciListesi({
  ogrenciler, secili, onSec, onHepsi, onAc, sirala, onSirala, arama, onArama, onCikar,
}: {
  ogrenciler: OgrenciSatiri[]
  secili: Set<string>
  onSec: (id: string) => void
  onHepsi: () => void
  onAc: (id: string) => void
  sirala: SiraAnahtar
  onSirala: (k: SiraAnahtar) => void
  arama: string
  onArama: (s: string) => void
  /** Verilirse her satırda çıkarma düğmesi (hover'da belirir). */
  onCikar?: (id: string) => Promise<void>
}) {
  const gorunen = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase('tr')
    const suzulmus = q
      ? ogrenciler.filter((o) => (o.name ?? '').toLocaleLowerCase('tr').includes(q))
      : ogrenciler
    const kopya = [...suzulmus]
    if (sirala === 'ad') kopya.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'tr'))
    else if (sirala === 'ustalik') kopya.sort((a, b) => (a.avgMastery ?? 2) - (b.avgMastery ?? 2))
    else if (sirala === 'dogruluk') kopya.sort((a, b) => (a.basariOrani ?? 2) - (b.basariOrani ?? 2))
    else if (sirala === 'aktiflik') kopya.sort((a, b) => (b.lastActive ?? '').localeCompare(a.lastActive ?? ''))
    else kopya.sort((a, b) => RISK_SIRA[a.risk] - RISK_SIRA[b.risk] || (a.avgMastery ?? 2) - (b.avgMastery ?? 2))
    return kopya
  }, [ogrenciler, arama, sirala])

  const hepsiSecili = gorunen.length > 0 && gorunen.every((o) => secili.has(o.studentId))

  return (
    <div className="glass-solid rounded-2xl px-5 py-4">
      <PanelBaslik
        icon="waves"
        sag={<SegmentGecis secenekler={SIRA_SECENEK} deger={sirala} onDegis={onSirala} />}
      >
        Sınıf Mevcudu
      </PanelBaslik>

      {/* Arama — CommandPalette girdisiyle aynı dil */}
      <div className="mt-1 flex items-center gap-2 rounded-xl border border-slate-500/10 px-3 py-2 dark:border-sky-500/10">
        <Icon name="search" size={15} color="currentColor" style={{ opacity: 0.5 }} />
        <input
          value={arama}
          onChange={(e) => onArama(e.target.value)}
          placeholder="Öğrenci ara…"
          aria-label="Öğrenci ara"
          className="w-full bg-transparent text-[13px] outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500"
        />
        {gorunen.length > 0 && (
          <button
            type="button"
            onClick={onHepsi}
            className="shrink-0 cursor-pointer font-display text-[11px] font-semibold text-sky-600 hover:text-sky-500 dark:text-sky-400"
          >
            {hepsiSecili ? 'Seçimi bırak' : 'Hepsini seç'}
          </button>
        )}
      </div>

      {gorunen.length === 0 ? (
        <p className="py-8 text-center text-xs text-slate-400 dark:text-slate-500">
          {arama ? 'Aramaya uyan öğrenci yok.' : 'Sınıfında henüz öğrenci yok.'}
        </p>
      ) : (
        <ul className="mt-2 space-y-0.5">
          {gorunen.map((o) => (
            <li key={o.studentId}>
              <div
                className={cn(
                  'group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-sky-500/5',
                  secili.has(o.studentId) && 'bg-sky-500/5',
                )}
              >
                <input
                  type="checkbox"
                  checked={secili.has(o.studentId)}
                  onChange={() => onSec(o.studentId)}
                  aria-label={`${o.name ?? 'Öğrenci'} seç`}
                  className={cn(
                    'size-3.5 shrink-0 cursor-pointer accent-sky-500 transition-opacity',
                    secili.size > 0 ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
                  )}
                />
                {/* Satırın kendisi <button>: Tab+Enter doğal çalışır, özel tuş gerekmez. */}
                <button
                  type="button"
                  onClick={() => onAc(o.studentId)}
                  className="grid min-w-0 cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-center gap-2.5 text-left"
                >
                  <Avatar ad={o.name} />
                  <span className="min-w-0">
                    <span className="block truncate font-display text-[13px] font-semibold text-slate-700 dark:text-slate-200">
                      {o.name ?? 'İsimsiz öğrenci'}
                    </span>
                    <span className="block truncate font-mono text-[10.5px] text-slate-400 dark:text-slate-500">
                      {o.grade ? `${o.grade}. sınıf · ` : ''}
                      {o.solved} soru
                      {o.openMisconceptions > 0 && ` · ${o.openMisconceptions} yanılgı`}
                    </span>
                  </span>
                </button>

                <div className="flex shrink-0 items-center gap-3">
                  {/* Ustalık ölçüsü — veri yoksa çubuk YOK, boş çubuk değil. */}
                  {o.avgMastery === null ? (
                    <span className="hidden w-24 text-right font-mono text-[10.5px] text-slate-300 md:block dark:text-slate-600">
                      ölçüm yok
                    </span>
                  ) : (
                    <Tip icerik={<>Ortalama ustalık<div className="mt-0.5 font-mono text-[11px]">%{Math.round(o.avgMastery * 100)} · {o.trackedNodes} kazanım · çürüme uygulanmış</div></>}>
                      <span className="hidden w-24 md:block"><Meter oran={o.avgMastery} yukseklik={5} /></span>
                    </Tip>
                  )}
                  <span className="w-11 text-right font-mono text-[11.5px] text-slate-500 dark:text-slate-400">
                    {o.basariOrani === null ? '—' : <>%<Sayi value={Math.round(o.basariOrani * 100)} /></>}
                  </span>
                  <RiskRozeti risk={o.risk} />
                  {onCikar && <CikarOnayi ogrenci={o} onCikar={onCikar} />}
                  <Icon name="chevronRight" size={15} color="currentColor" style={{ opacity: 0.4 }} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* ═══════════════ TRİYAJ KUYRUĞU ═══════════════
   OncelikRadari'nin (rontgen.tsx:390) kasıtlı kardeşi: aynı kart, aynı halka.
   Öğrencide "en zayıf kazanımların", öğretmende "sınıfın en yaygın açığı". */

export function TriajKuyrugu({ dugumler, onSetGonder, onOgrenciler }: {
  dugumler: SinifZayifKazanim[]
  onSetGonder: (d: SinifZayifKazanim) => void
  onOgrenciler: (d: SinifZayifKazanim) => void
}) {
  return (
    <div className="glass-solid rounded-2xl px-5 py-4">
      <PanelBaslik icon="target">Triyaj Kuyruğu</PanelBaslik>
      {dugumler.length === 0 ? (
        <p className="py-4 text-center text-xs text-slate-400 dark:text-slate-500">
          Kuyruk temiz — motorun işaretlediği zayıf düğüm yok.
        </p>
      ) : (
        <ul className="space-y-1">
          {dugumler.map((d) => {
            const ustalik = 1 - d.avgWrongRate
            const havuzVar = d.havuzdaSoru.osym + d.havuzdaSoru.ai > 0
            return (
              <li
                key={d.kazanimId}
                className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-sky-500/5"
              >
                <Halka
                  oran={ustalik}
                  boyut={40}
                  kalinlik={4}
                  renk={ustalik < 0.35 ? 'var(--color-rose-500)' : 'var(--color-amber-500)'}
                />
                <button
                  type="button"
                  onClick={() => onOgrenciler(d)}
                  className="min-w-0 flex-1 cursor-pointer text-left"
                >
                  <span className="block truncate font-display text-[13px] font-semibold text-slate-700 dark:text-slate-200">
                    {d.title}
                  </span>
                  <span className="mt-0.5 flex items-center gap-2">
                    <SubjectName subject={d.subject} anahtar={dersAnahtar(d.subject)} className="!text-[11px]" />
                    <Badge tone="amber">{d.weakStudentCount} öğrenci</Badge>
                  </span>
                </button>
                {havuzVar ? (
                  <GlowButton size="sm" variant="outline" onClick={() => onSetGonder(d)}>
                    Set gönder
                  </GlowButton>
                ) : (
                  // Havuz boşken buton GÖSTERİLMEZ: tıklanınca boş set üreten bir
                  // buton, çalışmayan bir özelliktir.
                  <Tip icerik="Havuzda bu kazanım için doğrulanmış soru yok — üretim hattı doldurunca açılır.">
                    <span className="shrink-0 cursor-default font-mono text-[10.5px] text-slate-300 dark:text-slate-600">
                      havuz boş
                    </span>
                  </Tip>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/* ═══════════════ AKSİYON MERKEZİ ═══════════════ */

export function AksiyonMerkezi({ sayaclar, onGit }: {
  sayaclar: { bekleyenGonderim: number; acikYanilgi: number; hicBaslamayan: number; aktif7Gun: number }
  onGit: (k: 'bekleyenGonderim' | 'acikYanilgi' | 'hicBaslamayan' | 'aktif7Gun') => void
}) {
  const kutular = [
    { k: 'bekleyenGonderim' as const, ad: 'Bekleyen gönderim', v: sayaclar.bekleyenGonderim, uyar: true },
    { k: 'acikYanilgi' as const, ad: 'Açık yanılgı', v: sayaclar.acikYanilgi, uyar: true },
    { k: 'hicBaslamayan' as const, ad: 'Hiç başlamayan', v: sayaclar.hicBaslamayan, uyar: true },
    { k: 'aktif7Gun' as const, ad: 'Bu hafta aktif', v: sayaclar.aktif7Gun, uyar: false },
  ]
  return (
    <div className="glass-solid rounded-2xl px-5 py-4">
      <PanelBaslik icon="bell">Aksiyon Merkezi</PanelBaslik>
      <div className="grid grid-cols-2 gap-2">
        {kutular.map((b) => (
          <button
            key={b.k}
            type="button"
            onClick={() => onGit(b.k)}
            className={cn(
              'cursor-pointer rounded-xl border px-3 py-2.5 text-left transition-all duration-200 hover:-translate-y-px',
              b.uyar && b.v > 0
                ? 'border-amber-500/30 bg-amber-500/5 text-amber-700 dark:border-amber-400/25 dark:text-amber-300'
                : 'border-slate-300/40 text-slate-500 dark:border-ocean-700 dark:text-slate-400',
            )}
          >
            <span className="block font-display text-[22px] font-bold leading-none">
              <Sayi value={b.v} />
            </span>
            <span className="mt-1 block text-[11px]">{b.ad}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/* ═══════════════ SINIF KODU ═══════════════ */

export function SinifKodKarti({ kod, onEkle }: {
  kod: string | null
  /** E-posta ile doğrudan ekleme. Kod paylaşımının yanındaki İKİNCİ kayıt yolu. */
  onEkle: (email: string) => Promise<void>
}) {
  const [kopyalandi, setKopyalandi] = useState(false)
  const [email, setEmail] = useState('')
  const [mesgul, setMesgul] = useState(false)

  const ekle = async (): Promise<void> => {
    const t = email.trim()
    if (!t) return
    setMesgul(true)
    try {
      await onEkle(t)
      setEmail('')
    } finally {
      setMesgul(false)
    }
  }

  return (
    <div className="glass-solid rounded-2xl px-5 py-4">
      <PanelBaslik icon="seal">Sınıfa Kayıt</PanelBaslik>
      {kod && (
        <>
          <p className="text-[12px] leading-relaxed text-slate-500 dark:text-slate-400">
            Öğrencilerin Profil ekranından bu kodu girmesi yeterli.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <span className="select-all rounded-lg border border-sky-500/25 bg-sky-500/10 px-3 py-1 font-mono text-lg font-bold tracking-[0.25em] text-sky-700 dark:text-sky-300">
              {kod}
            </span>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(kod)
                setKopyalandi(true)
                setTimeout(() => setKopyalandi(false), 2000)
              }}
              aria-label="Sınıf kodunu kopyala"
              className="grid size-9 cursor-pointer place-items-center rounded-lg text-slate-500 transition-colors hover:bg-sky-500/10 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            >
              <Icon name={kopyalandi ? 'check' : 'copy'} size={16} color="currentColor" />
            </button>
          </div>
        </>
      )}

      <div className="mt-4 border-t border-slate-500/10 pt-3 dark:border-sky-500/10">
        <p className="text-[12px] text-slate-500 dark:text-slate-400">Ya da e-posta ile doğrudan ekle:</p>
        <div className="mt-2 flex items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-xl border border-slate-500/10 px-3 py-1.5 dark:border-sky-500/10">
            <Icon name="plus" size={14} color="currentColor" style={{ opacity: 0.5 }} />
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void ekle() }}
              placeholder="ogrenci@eposta.com"
              aria-label="Eklenecek öğrencinin e-postası"
              className="w-full bg-transparent text-[12.5px] outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500"
            />
          </div>
          <GlowButton size="sm" variant="outline" onClick={ekle} disabled={mesgul || !email.trim()}>
            {mesgul ? '…' : 'Ekle'}
          </GlowButton>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════ SINIF ISI MATRİSİ ═══════════════ */

export function SinifIsiMatrisi({ veri, seciliUnite, onHucre }: {
  veri: IsiHaritasiYaniti
  seciliUnite: string | null
  onHucre: (unitePath: string | null) => void
}) {
  // Sütunlar = ünite yolları (ltree ilk 2 seviye). Eksen ders × ünite (~40 sütun),
  // öğrenci × kazanım (~8000 hücre) DEĞİL — ölçek riski burada, tasarımla kapatıldı.
  const uniteler = useMemo(() => {
    const görülen = new Map<string, string | null>()
    for (const c of veri.cells) if (!görülen.has(c.unitPath)) görülen.set(c.unitPath, c.unitTitle)
    return [...görülen.entries()].map(([path, title]) => ({ path, title }))
  }, [veri.cells])

  const hucreler = useMemo(() => {
    const m = new Map<string, IsiHaritasiYaniti['cells'][number]>()
    for (const c of veri.cells) m.set(`${c.subject}|${c.unitPath}`, c)
    return m
  }, [veri.cells])

  if (!veri.cells.length) {
    return (
      <div className="glass-solid rounded-2xl px-5 py-10 text-center">
        <p className="text-[13px] text-slate-500 dark:text-slate-400">
          Isı haritası öğrenciler soru çözdükçe belirir.
        </p>
      </div>
    )
  }

  // Kısa etiket: "matematik.g11" → "g11". Tam ad tooltip'te.
  const kisa = (p: string): string => p.split('.').slice(-1)[0] ?? p

  return (
    <div className="glass-solid overflow-x-auto rounded-2xl px-5 py-4">
      <PanelBaslik icon="scan" sag={<span className="font-mono text-[10.5px] text-slate-400">{uniteler.length} ünite</span>}>
        Ders × Ünite
      </PanelBaslik>
      <table className="w-full border-separate" style={{ borderSpacing: '3px' }}>
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 z-10 w-32" style={{ background: 'var(--glass-solid-bg)' }} />
            {uniteler.map((u) => (
              <th key={u.path} scope="col" className="pb-1 font-mono text-[9.5px] font-normal text-slate-400 dark:text-slate-500">
                {kisa(u.path)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {veri.subjects.map((ders, si) => (
            <tr key={ders}>
              <th
                scope="row"
                className="sticky left-0 z-10 pr-2 text-left font-normal"
                style={{ background: 'var(--glass-solid-bg)' }}
              >
                <SubjectName subject={ders} anahtar={dersAnahtar(ders)} className="!text-[11.5px]" />
              </th>
              {uniteler.map((u, ui) => {
                const c = hucreler.get(`${ders}|${u.path}`)
                if (!c) {
                  // Bu derste bu ünite YOK — boş hücre. Sıfır ustalık DEĞİL.
                  return <td key={u.path} className="text-center"><span className="inline-block size-[22px] rounded-[4px] border border-dashed border-slate-300/40 dark:border-ocean-700" /></td>
                }
                const secili = seciliUnite === u.path
                return (
                  <td key={u.path} className="text-center">
                    <IsiHucre
                      deger={c.avgMastery}
                      boyut={22}
                      uyari={c.weakStudentCount > 0}
                      gecikmeMs={(si * uniteler.length + ui) * 8}
                      onClick={() => onHucre(secili ? null : u.path)}
                      etiket={`${ders} ${u.title ?? u.path}: ortalama %${Math.round(c.avgMastery * 100)}`}
                      className={cn(secili && 'ring-2 ring-sky-500 dark:ring-sky-400')}
                      tip={
                        <>
                          {u.title ?? u.path}
                          <div className="mt-0.5 font-mono text-[11px]">
                            sınıf ort. %{Math.round(c.avgMastery * 100)} · {c.studentCount} öğrenci
                            {c.weakStudentCount > 0 && ` · ${c.weakStudentCount} zayıf`}
                          </div>
                          <div className="font-mono text-[10px] opacity-70">{c.nodeCount} kazanım · {c.attempts} deneme</div>
                        </>
                      }
                    />
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Gösterge — TakvimIsi'nin (rontgen.tsx:234) gradyanı, zayıf→usta etiketiyle */}
      <div className="mt-3 flex items-center justify-end gap-2 font-mono text-[10px] text-slate-400 dark:text-slate-500">
        zayıf
        <span
          className="h-2 w-24 rounded-full"
          style={{ background: 'linear-gradient(90deg, var(--heat-zero), color-mix(in oklab, var(--data-hue) 100%, var(--heat-zero)))' }}
        />
        usta
      </div>
    </div>
  )
}

/* ═══════════════ ÜNİTE ZAFİYET ŞERİDİ ═══════════════ */

export function UniteZafiyetSeridi({ unite, hucre, onKapat }: {
  unite: string
  hucre: IsiHaritasiYaniti['cells'][number] | undefined
  onKapat: () => void
}) {
  if (!hucre) return null
  return (
    <div className="glass-solid rounded-2xl px-5 py-4">
      <PanelBaslik
        icon="filter"
        sag={
          <button type="button" onClick={onKapat} className="cursor-pointer font-display text-[11px] font-semibold text-sky-600 dark:text-sky-400">
            Seçimi kaldır
          </button>
        }
      >
        {hucre.unitTitle ?? unite}
      </PanelBaslik>
      <div className="flex flex-wrap items-center gap-3">
        <Chip tone="sky" icon="waves">{hucre.studentCount} öğrenci</Chip>
        <Chip tone={hucre.weakStudentCount > 0 ? 'rose' : 'emerald'} icon="target">
          {hucre.weakStudentCount} zayıf
        </Chip>
        <Chip tone="slate" icon="scan">{hucre.nodeCount} kazanım</Chip>
        <Chip tone="slate" icon="bolt">{hucre.attempts} deneme</Chip>
        <span className="ml-auto font-display text-[22px] font-bold text-slate-700 dark:text-slate-200">
          %<CanliSayi value={Math.round(hucre.avgMastery * 100)} />
        </span>
      </div>
    </div>
  )
}

/* ═══════════════ SEÇİM EYLEM ÇUBUĞU ═══════════════ */

export function SecimCubugu({ sayi, onKarsilastir, onTemizle }: {
  sayi: number
  onKarsilastir: () => void
  onTemizle: () => void
}) {
  return (
    <m.div
      initial={{ y: 60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 60, opacity: 0 }}
      transition={{ duration: 0.22, ease: [0.21, 0.65, 0.32, 1] }}
      className="glass fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-2xl px-5 py-3 shadow-card"
    >
      <span className="font-display text-[13px] font-semibold text-slate-700 dark:text-slate-200">
        <Sayi value={sayi} /> öğrenci seçildi
      </span>
      <GlowButton size="sm" variant="outline" onClick={onKarsilastir}>Karşılaştır</GlowButton>
      <button
        type="button"
        onClick={onTemizle}
        aria-label="Seçimi temizle"
        className="grid size-7 cursor-pointer place-items-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
      >
        <Icon name="close" size={15} color="currentColor" />
      </button>
    </m.div>
  )
}

/* ═══════════════ BAŞLIKLAR ═══════════════ */

export function SinifBaslik({ ad, altBilgi, sag }: {
  ad: string
  altBilgi?: ReactNode
  sag?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-display text-[28px] font-bold tracking-tight text-slate-800 dark:text-slate-100">
          {ad}
        </h1>
        {altBilgi && (
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
            {altBilgi}
          </p>
        )}
      </div>
      {sag}
    </div>
  )
}

export function OgrenciBaslik({ ad, grade, onGeri, sag }: {
  ad: string | null
  grade: string | null
  onGeri: () => void
  sag?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onGeri}
          aria-label="Sınıf panosuna dön"
          className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg text-slate-500 transition-colors hover:bg-sky-500/10 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
        >
          <Icon name="chevronLeft" size={18} color="currentColor" />
        </button>
        <Avatar ad={ad} />
        <div className="min-w-0">
          <h1 className="truncate font-display text-[24px] font-bold tracking-tight text-slate-800 dark:text-slate-100">
            {ad ?? 'İsimsiz öğrenci'}
          </h1>
          {grade && <p className="font-mono text-[11px] text-slate-400 dark:text-slate-500">{grade}. sınıf</p>}
        </div>
      </div>
      {sag}
    </div>
  )
}

/** ← / → gezinme — roster sırasında komşu öğrenciye. */
export function OgrenciGezinme({ onOnceki, onSonraki }: {
  onOnceki: (() => void) | null
  onSonraki: (() => void) | null
}) {
  return (
    <div className="flex items-center gap-1">
      {([['chevronLeft', onOnceki, 'Önceki öğrenci'], ['chevronRight', onSonraki, 'Sonraki öğrenci']] as const).map(
        ([ikon, fn, etiket]) => (
          <button
            key={ikon}
            type="button"
            onClick={fn ?? undefined}
            disabled={!fn}
            aria-label={etiket}
            className="grid size-8 cursor-pointer place-items-center rounded-lg text-slate-500 transition-colors hover:bg-sky-500/10 hover:text-slate-800 disabled:cursor-default disabled:opacity-30 dark:text-slate-400 dark:hover:text-slate-200"
          >
            <Icon name={ikon} size={16} color="currentColor" />
          </button>
        ),
      )}
    </div>
  )
}

/* ═══════════════ ÖĞRENCİ SEÇİCİ (karşılaştırma) ═══════════════ */

export function OgrenciSecici({ ogrenciler, secili, enFazla = 4, onDegis }: {
  ogrenciler: OgrenciSatiri[]
  secili: string[]
  enFazla?: number
  onDegis: (ids: string[]) => void
}) {
  const cevir = (id: string): void => {
    if (secili.includes(id)) onDegis(secili.filter((x) => x !== id))
    else if (secili.length < enFazla) onDegis([...secili, id])
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {ogrenciler.map((o) => (
        <FiltreCipi key={o.studentId} aktif={secili.includes(o.studentId)} onClick={() => cevir(o.studentId)}>
          {o.name ?? 'İsimsiz'}
        </FiltreCipi>
      ))}
      <span className="ml-1 font-mono text-[10.5px] text-slate-400 dark:text-slate-500">
        {secili.length}/{enFazla}
      </span>
    </div>
  )
}

/* ═══════════════ KARŞILAŞTIRMA IZGARASI ═══════════════ */

export type Olcut = {
  ad: string
  deger: (o: OgrenciSatiri) => number | null
  bicim: (n: number | null) => string
  /** 'yuksek' → büyük olan iyidir. Renk değil, ikon+renk birlikte kullanılır. */
  iyiYon: 'yuksek' | 'dusuk'
}

export const OLCUTLER: Olcut[] = [
  { ad: 'Ortalama ustalık', deger: (o) => o.avgMastery, bicim: (n) => (n === null ? 'ölçüm yok' : `%${Math.round(n * 100)}`), iyiYon: 'yuksek' },
  { ad: 'Doğruluk', deger: (o) => o.basariOrani, bicim: (n) => (n === null ? 'veri yok' : `%${Math.round(n * 100)}`), iyiYon: 'yuksek' },
  { ad: 'Çözülen soru', deger: (o) => o.solved, bicim: (n) => String(n ?? 0), iyiYon: 'yuksek' },
  { ad: 'Takip edilen kazanım', deger: (o) => o.trackedNodes, bicim: (n) => String(n ?? 0), iyiYon: 'yuksek' },
  { ad: 'Açık yanılgı', deger: (o) => o.openMisconceptions, bicim: (n) => String(n ?? 0), iyiYon: 'dusuk' },
  { ad: 'XP', deger: (o) => o.xp, bicim: (n) => String(n ?? 0), iyiYon: 'yuksek' },
]

export function KarsilastirmaIzgarasi({ ogrenciler, olcutler = OLCUTLER }: {
  ogrenciler: OgrenciSatiri[]
  olcutler?: Olcut[]
}) {
  return (
    <div className="glass-solid overflow-x-auto rounded-2xl px-5 py-4">
      <PanelBaslik icon="gauge">Ölçüt Karşılaştırması</PanelBaslik>
      <div
        className="grid gap-x-3 gap-y-2"
        style={{ gridTemplateColumns: `180px repeat(${ogrenciler.length}, minmax(90px, 1fr))` }}
      >
        <span className="sticky left-0 z-10" style={{ background: 'var(--glass-solid-bg)' }} />
        {ogrenciler.map((o) => (
          <span key={o.studentId} className="truncate text-center font-display text-[12px] font-semibold text-slate-700 dark:text-slate-200">
            {o.name ?? 'İsimsiz'}
          </span>
        ))}

        {olcutler.map((m) => {
          const degerler = ogrenciler.map((o) => m.deger(o))
          const gecerli = degerler.filter((d): d is number => d !== null)
          // Ölçek SATIR BAŞINA: yatay taramayı dürüst kılan şey bu.
          const enBuyuk = gecerli.length ? Math.max(...gecerli) : 0
          const enIyi = gecerli.length
            ? (m.iyiYon === 'yuksek' ? Math.max(...gecerli) : Math.min(...gecerli))
            : null
          return (
            <Fragment key={m.ad}>
              <span
                className="sticky left-0 z-10 self-center truncate text-[12px] text-slate-500 dark:text-slate-400"
                style={{ background: 'var(--glass-solid-bg)' }}
              >
                {m.ad}
              </span>
              {ogrenciler.map((o, i) => {
                const d = degerler[i]
                const kazanan = d !== null && enIyi !== null && d === enIyi && gecerli.length > 1
                return (
                  <span key={o.studentId} className="min-w-0">
                    <span
                      className={cn(
                        'flex items-center justify-center gap-1 font-mono text-[12.5px]',
                        kazanan ? 'font-bold text-emerald-600 dark:text-emerald-300' : 'text-slate-600 dark:text-slate-300',
                      )}
                    >
                      {m.bicim(d)}
                      {/* Asla yalnız renk — kazananın yanında ikon da var. */}
                      {kazanan && <Icon name="check" size={12} color="currentColor" />}
                    </span>
                    {d !== null && enBuyuk > 0 && (
                      <Meter oran={Math.max(0, d) / enBuyuk} yukseklik={4} className="mt-1" />
                    )}
                  </span>
                )
              })}
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}

/* ═══════════════ DERS KIRILIMI (karşılaştırma yardımcısı) ═══════════════ */

export function SonAktiflikSeridi({ ogrenciler }: { ogrenciler: OgrenciSatiri[] }) {
  return (
    <div className="glass-solid rounded-2xl px-5 py-4">
      <PanelBaslik icon="pulse">Etkinlik</PanelBaslik>
      <ul className="space-y-2.5">
        {ogrenciler.map((o) => (
          <li key={o.studentId} className="flex items-center gap-3">
            <span className="w-28 shrink-0 truncate text-[12px] text-slate-600 dark:text-slate-300">
              {o.name ?? 'İsimsiz'}
            </span>
            <Sparkline veri={[o.solved, o.correct, o.trackedNodes, o.openMisconceptions]} genislik={72} yukseklik={20} />
            <span className="ml-auto font-mono text-[10.5px] text-slate-400 dark:text-slate-500">
              {o.lastActive ? new Date(o.lastActive).toLocaleDateString('tr-TR') : 'hiç'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
