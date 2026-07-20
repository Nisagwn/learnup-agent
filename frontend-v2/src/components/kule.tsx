import { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts'
import { cn } from '../lib/cn'
import { dersAnahtar } from '../lib/format'
import { useTheme } from '../lib/theme'
import { Icon } from '../ui'
import { Badge, SubjectName } from './ui'
import { Meter, Olcer, PanelBaslik, Sayi, Tip } from './cekirdek'
import type {
  AdminGorevlerYaniti, AdminHavuzYaniti, AdminOzgunlukYaniti, EvalAnlik,
} from '../lib/types.admin'

/* ═══════════════════════════════════════════════════════════════════════════
   YÖNETİM BİLEŞENLERİ — yalnız /kule ekranlarınca import edilir (ayrı chunk).
   Öğrenci ve öğretmen bu koddan tek bayt indirmez.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Ölçülmemiş metrik için ortak gösterim — asla 0 çizilmez. */
export function OlcumYok({ not = 'ölçüm yok' }: { not?: string }) {
  return <span className="font-mono text-[11px] text-slate-300 dark:text-slate-600">{not}</span>
}

/**
 * Kule tooltip'i.
 *
 * rontgen.tsx'teki CamTooltip KULLANILMAZ: o, etiketi `gunEtiketi()` ile TARİH olarak
 * biçimlendiriyor. Buradaki etiketler tarih değil (kalite 1–5, ders adı) — geçirsek
 * "Invalid Date" yazardı.
 */
function KuleTooltip({ active, payload, label, birimler }: {
  active?: boolean
  payload?: Array<{ value: number | null; dataKey: string }>
  label?: string | number
  birimler: Record<string, string>
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="glass-solid rounded-lg px-3 py-2 text-xs shadow-card">
      <div className="font-display font-semibold text-slate-700 dark:text-slate-200">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="mt-0.5 flex items-center justify-between gap-4">
          <span className="text-slate-400 dark:text-slate-500">{birimler[p.dataKey] ?? p.dataKey}</span>
          <span className="font-mono text-slate-600 dark:text-slate-300">
            {p.value == null ? 'ölçülmedi' : p.value}
          </span>
        </div>
      ))}
    </div>
  )
}

/* ── Dağılım histogramı ─────────────────────────────────────────────────── */

export function DagilimHistogrami({ kovalar, yukseklik = 148, birim = 'soru' }: {
  kovalar: Array<{ etiket: string; sayi: number }>
  yukseklik?: number
  birim?: string
}) {
  const { theme } = useTheme()
  const eksen = theme === 'dark' ? '#64748B' : '#7A93AA'
  if (!kovalar.length) return <OlcumYok />
  return (
    <div style={{ height: yukseklik }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={kovalar} margin={{ top: 4, right: 4, bottom: 0, left: -22 }}>
          <CartesianGrid strokeDasharray="2 4" stroke={eksen} strokeOpacity={0.18} vertical={false} />
          <XAxis dataKey="etiket" tick={{ fill: eksen, fontSize: 10, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: eksen, fontSize: 10, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: 'rgb(14 165 233 / 0.05)' }}
            content={<KuleTooltip birimler={{ sayi: birim }} />}
          />
          {/* Tek seri → gösterge YOK; büyüklük tek sky rampasıyla anlatılır. */}
          <Bar dataKey="sayi" fill="var(--data-hue)" radius={[4, 4, 0, 0]} maxBarSize={30} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/* ── Kalite histogramı ──────────────────────────────────────────────────── */

export function KaliteHistogrami({ veri }: { veri: AdminHavuzYaniti['ai'] }) {
  const kovalar = [1, 2, 3, 4, 5].map((q) => ({
    etiket: String(q),
    sayi: veri.kaliteHistogram.find((k) => k.quality === q)?.count ?? 0,
  }))
  return (
    <div className="glass-solid rounded-2xl px-5 py-4">
      <PanelBaslik
        icon="medal"
        sag={veri.ortKalite == null ? <OlcumYok /> : <Badge tone="emerald">ort {veri.ortKalite}</Badge>}
      >
        Kalite Dağılımı
      </PanelBaslik>
      <DagilimHistogrami kovalar={kovalar} />
      <p className="mt-2 font-mono text-[10px] leading-relaxed text-slate-400 dark:text-slate-500">
        hakemin ÖSYM-üslup skoru (1–5) · kabul eşiği ≥4
      </p>
    </div>
  )
}

/* ── Zorluk dağılımı ────────────────────────────────────────────────────── */

const ZORLUK_ADI: Record<string, string> = {
  kolay: 'Kolay', orta: 'Orta', zor: 'Zor', etiketsiz: 'Etiketsiz',
}

export function ZorlukDagilimi({ zorluk }: { zorluk: AdminHavuzYaniti['ai']['zorluk'] }) {
  const toplam = Object.values(zorluk).reduce((a, b) => a + b, 0)
  return (
    <div className="glass-solid rounded-2xl px-5 py-4">
      <PanelBaslik icon="gauge">Zorluk Dağılımı</PanelBaslik>
      {toplam === 0 ? (
        <OlcumYok />
      ) : (
        <ul className="space-y-2.5">
          {(Object.keys(ZORLUK_ADI) as Array<keyof typeof zorluk>).map((k) => (
            <li key={k} className="flex items-center gap-3">
              <span className="w-20 shrink-0 text-[12px] text-slate-600 dark:text-slate-300">{ZORLUK_ADI[k]}</span>
              <Meter oran={zorluk[k] / toplam} className="flex-1" yukseklik={6} />
              <span className="w-14 shrink-0 text-right font-mono text-[11.5px] text-slate-500 dark:text-slate-400">
                <Sayi value={zorluk[k]} />
              </span>
            </li>
          ))}
        </ul>
      )}
      {zorluk.zor === 0 && toplam > 0 && (
        <p className="mt-3 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
          Havuzda hiç "zor" soru yok — [TASARIM] kapısı hiçbir adayı zor olarak
          doğrulamamış demektir.
        </p>
      )}
    </div>
  )
}

/* ── Ders kapsama tablosu ───────────────────────────────────────────────── */

export function DersKapsamaTablosu({ satirlar }: { satirlar: AdminHavuzYaniti['kapsama']['dersBazli'] }) {
  return (
    <div className="glass-solid overflow-x-auto rounded-2xl px-5 py-4">
      <PanelBaslik icon="scan" sag={<span className="font-mono text-[10.5px] text-slate-400">en zayıf üstte</span>}>
        Müfredat Kapsaması
      </PanelBaslik>
      <table className="w-full">
        <thead>
          <tr className="text-left font-display text-[10.5px] uppercase tracking-[0.1em] text-slate-400 dark:text-slate-500">
            <th scope="col" className="pb-2 font-semibold">Ders</th>
            <th scope="col" className="pb-2 font-semibold">Kapsama</th>
            <th scope="col" className="pb-2 text-right font-semibold">Kazanım</th>
          </tr>
        </thead>
        <tbody>
          {satirlar.map((d) => (
            <tr key={d.subject} className="border-t border-slate-500/10 dark:border-sky-500/10">
              <td className="py-2 pr-3">
                <SubjectName subject={d.subject} anahtar={dersAnahtar(d.subject)} className="!text-[12px]" />
              </td>
              <td className="py-2 pr-3">
                <div className="flex items-center gap-2">
                  <Meter oran={d.oran} className="w-24" yukseklik={5} />
                  <span
                    className={cn(
                      'font-mono text-[11px]',
                      d.oran < 0.2 ? 'text-rose-600 dark:text-rose-300' : 'text-slate-500 dark:text-slate-400',
                    )}
                  >
                    %{Math.round(d.oran * 100)}
                  </span>
                </div>
              </td>
              <td className="py-2 text-right font-mono text-[11.5px] text-slate-500 dark:text-slate-400">
                {d.kapsanan}/{d.kazanim}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ── Ajan sağlığı ───────────────────────────────────────────────────────── */

const SAGLIK_STIL: Record<AdminGorevlerYaniti['saglik'], { ad: string; sinif: string; ikon: 'check' | 'clock' | 'bolt' }> = {
  iyi: { ad: 'iyi', sinif: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300', ikon: 'check' },
  uyari: { ad: 'uyarı', sinif: 'bg-amber-500/15 text-amber-600 dark:text-amber-300', ikon: 'clock' },
  kritik: { ad: 'kritik', sinif: 'bg-rose-500/15 text-rose-600 dark:text-rose-300', ikon: 'bolt' },
}

/**
 * Ajan sağlığı — durum sayaçları + takılan/başarısız görevlerde MÜDAHALE.
 *
 * `onYeniden` verilmezse panel salt-okunur kalır. Verildiğinde her satır kendi
 * "yeniden kuyrukla" düğmesini alır: takılmış bir görevi görüp hiçbir şey
 * yapamamak, ops panelinin en can sıkıcı hâliydi.
 */
export function AjanSagligi({ veri, onYeniden }: {
  veri: AdminGorevlerYaniti
  onYeniden?: (id: string) => Promise<void>
}) {
  const s = SAGLIK_STIL[veri.saglik]
  return (
    <div className="glass-solid rounded-2xl px-5 py-4">
      <PanelBaslik
        icon="pulse"
        sag={
          <span className={cn('inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-display text-[11px] font-bold', s.sinif)}>
            <Icon name={s.ikon} size={12} color="currentColor" />
            {s.ad}
          </span>
        }
      >
        Ajan Sağlığı
      </PanelBaslik>

      <div className="grid grid-cols-4 gap-2">
        {(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED'] as const).map((d) => (
          <div key={d} className="rounded-lg border border-slate-500/10 px-2 py-2 text-center dark:border-sky-500/10">
            <span className="block font-display text-[18px] font-bold leading-none text-slate-700 dark:text-slate-200">
              <Sayi value={veri.durum[d]} />
            </span>
            <span className="mt-1 block font-mono text-[9.5px] text-slate-400">{d.toLowerCase()}</span>
          </div>
        ))}
      </div>

      {veri.takilanlar.length > 0 && (
        <div className="mt-3 rounded-xl border border-rose-500/25 bg-rose-500/5 px-3 py-2">
          <p className="font-display text-[12px] font-semibold text-rose-600 dark:text-rose-300">
            {veri.takilanlar.length} takılan görev
          </p>
          <ul className="mt-1 space-y-0.5">
            {veri.takilanlar.slice(0, 5).map((t) => (
              <GorevSatiri
                key={t.id}
                id={t.id}
                metin={`${t.kind} · ${t.yasDk} dk · deneme ${t.attempts}`}
                onYeniden={onYeniden}
              />
            ))}
          </ul>
          <p className="mt-1 text-[10.5px] leading-relaxed text-slate-500 dark:text-slate-400">
            RUNNING + kilit 10 dk'dan eski → worker çökmüş ya da kilit sızmış olabilir.
          </p>
        </div>
      )}

      {veri.sonHatalar.length > 0 && (
        <div className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/5 px-3 py-2">
          <p className="font-display text-[12px] font-semibold text-amber-700 dark:text-amber-300">
            Son başarısız görevler
          </p>
          <ul className="mt-1 space-y-0.5">
            {veri.sonHatalar.slice(0, 5).map((t) => (
              <GorevSatiri
                key={t.id}
                id={t.id}
                metin={`${t.kind} · ${t.error ?? 'hata metni yok'}`}
                onYeniden={onYeniden}
              />
            ))}
          </ul>
        </div>
      )}

      <p className="mt-3 font-mono text-[10px] text-slate-400 dark:text-slate-500">
        son 24 saat: {veri.son24Saat.olusturulan} oluşturuldu · {veri.son24Saat.tamamlanan} tamamlandı ·{' '}
        {veri.son24Saat.basarisiz} başarısız
      </p>
    </div>
  )
}

/** Tek görev satırı + isteğe bağlı "yeniden kuyrukla". İyimser güncelleme YOK. */
function GorevSatiri({ id, metin, onYeniden }: {
  id: string; metin: string; onYeniden?: (id: string) => Promise<void>
}) {
  const [mesgul, setMesgul] = useState(false)
  return (
    <li className="flex items-center gap-2">
      <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-slate-500 dark:text-slate-400">
        {metin}
      </span>
      {onYeniden && (
        <button
          type="button"
          disabled={mesgul}
          onClick={() => { setMesgul(true); void onYeniden(id).finally(() => setMesgul(false)) }}
          className="shrink-0 cursor-pointer rounded-md px-1.5 py-0.5 font-display text-[10px] font-semibold text-sky-600 transition-colors hover:bg-sky-500/10 disabled:opacity-40 dark:text-sky-300"
        >
          <Icon name="refresh" size={11} color="currentColor" style={mesgul ? { opacity: 0.5 } : undefined} />
        </button>
      )}
    </li>
  )
}

/* ── Eval trendi ────────────────────────────────────────────────────────── */

export function EvalTrendi({ trend }: { trend: EvalAnlik[] }) {
  const { theme } = useTheme()
  const eksen = theme === 'dark' ? '#64748B' : '#7A93AA'
  const veri = trend.map((t) => ({
    tarih: new Date(t.tarih).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' }),
    sizinti: t.ai.sizintiOrani == null ? null : Math.round(t.ai.sizintiOrani * 100),
    nnP90: t.ai.nnP90 == null ? null : Math.round(t.ai.nnP90 * 100),
  }))
  return (
    <div className="glass-solid rounded-2xl px-5 py-4">
      <PanelBaslik icon="trend" sag={<span className="font-mono text-[10.5px] text-slate-400">{trend.length} ölçüm</span>}>
        Drift Trendi
      </PanelBaslik>
      {veri.length < 2 ? (
        <p className="py-4 text-center text-[12px] text-slate-400 dark:text-slate-500">
          Trend için en az iki eval koşumu gerekiyor. Şu an {veri.length} var.
        </p>
      ) : (
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={veri} margin={{ top: 4, right: 6, bottom: 0, left: -24 }}>
              <CartesianGrid strokeDasharray="2 4" stroke={eksen} strokeOpacity={0.18} vertical={false} />
              <XAxis dataKey="tarih" tick={{ fill: eksen, fontSize: 10, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: eksen, fontSize: 10, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
              <Tooltip
                content={<KuleTooltip birimler={{
                  sizinti: 'şık uzunluk sızıntısı %',
                  nnP90: 'en yakın komşu p90 %',
                }} />}
              />
              <Line type="monotone" dataKey="sizinti" stroke="var(--color-rose-500)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              <Line type="monotone" dataKey="nnP90" stroke="var(--data-hue)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

/* ── Eşik tablosu (özgünlük bariyeri) ───────────────────────────────────── */

export function EsikTablosu({ esikler, p90 }: {
  esikler: AdminOzgunlukYaniti['esikler']
  p90: number | null
}) {
  return (
    <div className="glass-solid rounded-2xl px-5 py-4">
      <PanelBaslik icon="shield">Ders Bazlı Eşikler</PanelBaslik>
      <ul className="space-y-3.5">
        {esikler.map((e) => (
          <li key={e.subject}>
            <div className="mb-1 flex items-center justify-between gap-2">
              <SubjectName subject={e.subject} anahtar={dersAnahtar(e.subject)} className="!text-[12px]" />
              <span className="flex items-center gap-1.5">
                {e.taban && (
                  <Tip icerik="Bu ders için ayrı ölçüm yok — taban eşik uygulanıyor.">
                    <span><Badge tone="slate">taban</Badge></span>
                  </Tip>
                )}
                <span className="font-mono text-[10.5px] text-slate-400">{e.havuzAdedi} soru</span>
              </span>
            </div>
            {/* Ölçülen p90 dolgu, eşik çentik. p90 yoksa çubuk çizilmez — 0 gösterilmez. */}
            {p90 == null ? (
              <OlcumYok not="p90 ölçülmedi — eval koşmadı" />
            ) : (
              <Olcer deger={p90} esik={e.esik} etiket={`ölçülen p90 ${p90.toFixed(2)}`} />
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
