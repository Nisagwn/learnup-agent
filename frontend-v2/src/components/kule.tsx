import { useState, type CSSProperties } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts'
import { dersAnahtar } from '../lib/format'
import { useTheme } from '../lib/theme'
import { Icon } from '../ui'
import { SubjectName } from './ui'
import { Meter, Sayi, Tip } from './cekirdek'
import type {
  AdminGorevlerYaniti, AdminHavuzYaniti, AdminOzgunlukYaniti, EvalAnlik,
} from '../lib/types.admin'

/* ═══════════════════════════════════════════════════════════════════════════
   YÖNETİM BİLEŞENLERİ — yalnız /kule ekranlarınca import edilir (ayrı chunk).
   Öğrenci ve öğretmen bu koddan tek bayt indirmez.
   ═══════════════════════════════════════════════════════════════════════════ */

/** FİDAN standart kart yüzeyi (buzlu cam) — /kule panelleri paylaşır. Renkler
 *  index.css CSS değişkenlerinden → iki tema otomatik. */
const KART: CSSProperties = {
  background: 'var(--cam)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: '1px solid var(--cam-kenar)',
  borderRadius: 20,
  boxShadow: 'var(--golge)',
}

/** Ölçülmemiş metrik için ortak gösterim — asla 0 çizilmez (null ≠ 0). FİDAN silik ton. */
export function OlcumYok({ not = 'ölçüm yok' }: { not?: string }) {
  return <span className="font-mono text-[11px]" style={{ color: 'var(--metin3)', opacity: 0.8 }}>{not}</span>
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

/* ── Kalite histogramı ──────────────────────────────────────────────────────
   FİDAN v1.2 · `sh-*` scoped: sınıflar SoruHavuzu.tsx <style> bloğunda tanımlı
   (bu bileşen yalnız o ekrandan render edilir; onaylı önizleme soru-havuzu.html).
   Dikey CSS çubuk: adet üstte, kalite 1–5 altta. Boş → OlcumYok (null ≠ 0). */

export function KaliteHistogrami({ veri }: { veri: AdminHavuzYaniti['ai'] }) {
  const kovalar = [1, 2, 3, 4, 5].map((q) => ({
    q,
    sayi: veri.kaliteHistogram.find((k) => k.quality === q)?.count ?? 0,
  }))
  const enBuyuk = Math.max(0, ...kovalar.map((k) => k.sayi))
  return (
    <section className="sh-kart sh-panel-ic">
      <div className="sh-panel-bas">
        <h3>Kalite Dağılımı</h3>
        <span className="say">AI · hakem skoru</span>
      </div>
      {enBuyuk === 0 ? (
        <OlcumYok />
      ) : (
        <div className="sh-histo">
          {kovalar.map((k) => (
            <div key={k.q} className="bar">
              <span className="adet">{k.sayi}</span>
              {/* Yükseklik = adet / en büyük kova (dürüst oran; tam sayı üstte görünür). */}
              <div className="cubuk" style={{ height: `${(k.sayi / enBuyuk) * 100}%` }} />
              <span className="etk">{k.q}</span>
            </div>
          ))}
        </div>
      )}
      <p className="sh-histo-not">hakemin ÖSYM-üslup skoru (1–5) · kabul eşiği ≥4</p>
    </section>
  )
}

/* ── Zorluk dağılımı ─────────────────────────────────────────────────────────
   FİDAN v1.2 · `sh-*` scoped (SoruHavuzu.tsx <style>). Çubuk = kova / en büyük
   kova → baskın zorluk dolu görünür (önizleme deseni). Renkler önizlemeden:
   kolay adaçayı · orta yaprak · zor toprak · etiketsiz nötr. */

const ZORLUK_ADI: Record<string, string> = {
  kolay: 'Kolay', orta: 'Orta', zor: 'Zor', etiketsiz: 'Etiketsiz',
}

const ZORLUK_RENK: Record<string, string> = {
  kolay: 'var(--v3)', orta: 'var(--yaprak)', zor: 'var(--toprak)', etiketsiz: 'var(--v2)',
}

export function ZorlukDagilimi({ zorluk }: { zorluk: AdminHavuzYaniti['ai']['zorluk'] }) {
  const toplam = Object.values(zorluk).reduce((a, b) => a + b, 0)
  const enBuyuk = Math.max(0, ...Object.values(zorluk))
  // "Etiketsiz" yalnız GERÇEKTEN varsa gösterilir (null ≠ 0); kolay/orta/zor daima.
  const anahtarlar = (['kolay', 'orta', 'zor', 'etiketsiz'] as const).filter(
    (k) => k !== 'etiketsiz' || zorluk.etiketsiz > 0,
  )
  return (
    <section className="sh-kart sh-panel-ic">
      <div className="sh-panel-bas">
        <h3>Zorluk Dağılımı</h3>
        <span className="say">AI havuzu</span>
      </div>
      {toplam === 0 ? (
        <OlcumYok />
      ) : (
        <div>
          {anahtarlar.map((k) => (
            <div key={k} className="sh-zor">
              <span className="et">{ZORLUK_ADI[k]}</span>
              <Meter oran={enBuyuk ? zorluk[k] / enBuyuk : 0} renk={ZORLUK_RENK[k]} yukseklik={14} className="flex-1" />
              <span className="n"><Sayi value={zorluk[k]} /></span>
            </div>
          ))}
        </div>
      )}
      {zorluk.zor === 0 && toplam > 0 && (
        <p className="sh-uyari">
          Havuzda hiç "zor" soru yok — [TASARIM] kapısı hiçbir adayı zor olarak
          doğrulamamış demektir.
        </p>
      )}
    </section>
  )
}

/* ── Ders kapsama tablosu ────────────────────────────────────────────────────
   FİDAN v1.2 · `sh-*` scoped (SoruHavuzu.tsx <style>). DÜRÜST KAPSAMA: düşük
   oranlar (TDE %3 vb.) sıcak uyarı tonunda, GÜZELLEŞTİRİLMEDEN gösterilir. */

export function DersKapsamaTablosu({ satirlar, soruSayisi }: {
  satirlar: AdminHavuzYaniti['kapsama']['dersBazli']
  /** Ders başına toplam soru (ÖSYM+AI). Verilirse "Soru" sütunu çizilir; eşleşmezse "—". */
  soruSayisi?: Record<string, number>
}) {
  return (
    <section className="sh-kart sh-panel-ic overflow-x-auto">
      <div className="sh-panel-bas">
        <h3>Ders Bazlı Kapsama</h3>
        <span className="say">doğrulanmış / müfredat kazanımı</span>
      </div>
      <table className="sh-ktablo">
        <thead>
          <tr>
            <th scope="col">Ders</th>
            <th scope="col">Kapsama</th>
            <th scope="col">Oran</th>
            {soruSayisi && <th scope="col" className="sag">Soru</th>}
          </tr>
        </thead>
        <tbody>
          {satirlar.map((d) => {
            const dusuk = d.oran < 0.2
            const soru = soruSayisi?.[d.subject]
            return (
              <tr key={d.subject}>
                <td className="ders">
                  <SubjectName subject={d.subject} anahtar={dersAnahtar(d.subject)} className="!text-[12px]" />
                </td>
                <td className={dusuk ? 'dusuk' : undefined}>{d.kapsanan} / {d.kazanim}</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Meter oran={d.oran} className="w-24" yukseklik={8} />
                    <span className="font-mono text-[11px]" style={{ color: dusuk ? 'var(--uyari)' : 'var(--metin3)' }}>
                      %{Math.round(d.oran * 100)}
                    </span>
                  </div>
                </td>
                {soruSayisi && <td className="sag">{soru == null ? '—' : soru}</td>}
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

/* ── Ajan sağlığı (FİDAN) ───────────────────────────────────────────────── */

const SAGLIK_FIDAN: Record<AdminGorevlerYaniti['saglik'], { ad: string; renk: string; ikon: 'check' | 'clock' | 'bolt' }> = {
  iyi: { ad: 'iyi', renk: 'var(--dogru)', ikon: 'check' },
  uyari: { ad: 'uyarı', renk: 'var(--uyari)', ikon: 'clock' },
  kritik: { ad: 'kritik', renk: 'var(--yanlis)', ikon: 'bolt' },
}

/** PENDING/RUNNING/… sayaçları KELİMELİ gösterilir — teknik durum adı değil (renk-körü + Türkçe). */
const DURUM_KELIME: Record<'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED', string> = {
  PENDING: 'bekliyor', RUNNING: 'çalışıyor', COMPLETED: 'tamamlandı', FAILED: 'başarısız',
}

/**
 * Ajan sağlığı — görev kuyruğu durumu + takılan/başarısız görevlerde MÜDAHALE.
 *
 * `onYeniden` verilmezse panel salt-okunur kalır. Verildiğinde her satır kendi
 * "Yeniden kuyrukla" düğmesini alır: takılmış bir görevi görüp hiçbir şey
 * yapamamak, ops panelinin en can sıkıcı hâliydi. İYİMSER GÜNCELLEME YOK —
 * düğme dönerken devre dışı kalır, sunucu yanıtı sonrası reload gerçeği çeker.
 */
export function AjanSagligi({ veri, onYeniden }: {
  veri: AdminGorevlerYaniti
  onYeniden?: (id: string) => Promise<void>
}) {
  const s = SAGLIK_FIDAN[veri.saglik]
  return (
    <section style={{ ...KART, padding: '18px 22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
        <Icon name="pulse" size={14} color="var(--vurgu)" />
        <h3 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 14, fontWeight: 700, color: 'var(--metin1)' }}>Ajan Sağlığı</h3>
        {/* saglik: kelime + ikon birlikte (asla yalnız renk) */}
        <span style={{
          marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px',
          borderRadius: 10, fontSize: 11, fontWeight: 700, color: s.renk,
          background: `color-mix(in srgb, ${s.renk} 14%, transparent)`,
        }}>
          <Icon name={s.ikon} size={12} color="currentColor" />
          {s.ad}
        </span>
      </div>

      {/* Görev kuyruğu özeti — gerçek `durum` sayaçları, KELİMELİ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED'] as const).map((d) => (
          <div key={d} style={{ border: '1px solid var(--cizgi)', borderRadius: 12, padding: '8px 4px', textAlign: 'center', background: 'var(--v0)' }}>
            <span style={{ display: 'block', fontFamily: 'Outfit, sans-serif', fontSize: 18, fontWeight: 800, lineHeight: 1, color: 'var(--metin1)' }}>
              <Sayi value={veri.durum[d]} />
            </span>
            <span style={{ marginTop: 4, display: 'block', fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: 'var(--metin3)' }}>
              {DURUM_KELIME[d]}
            </span>
          </div>
        ))}
      </div>

      {veri.takilanlar.length > 0 && (
        <div style={{ marginTop: 12, borderRadius: 14, padding: '10px 12px', border: '1px solid color-mix(in srgb, var(--uyari) 25%, transparent)', background: 'color-mix(in srgb, var(--uyari) 6%, transparent)' }}>
          <p style={{ fontFamily: 'Outfit, sans-serif', fontSize: 12, fontWeight: 700, color: 'var(--uyari)' }}>
            {veri.takilanlar.length} takılan görev
          </p>
          <ul style={{ marginTop: 2, listStyle: 'none' }}>
            {veri.takilanlar.slice(0, 5).map((t) => (
              <GorevSatiri
                key={t.id}
                id={t.id}
                tur={t.kind}
                ton="takildi"
                durumKelime={`takıldı · ${t.yasDk} dk · ${t.attempts} deneme`}
                onYeniden={onYeniden}
              />
            ))}
          </ul>
          <p style={{ marginTop: 6, fontSize: 10.5, lineHeight: 1.5, color: 'var(--metin3)' }}>
            RUNNING + kilit 10 dk'dan eski → worker çökmüş ya da kilit sızmış olabilir.
          </p>
        </div>
      )}

      {veri.sonHatalar.length > 0 && (
        <div style={{ marginTop: 12, borderRadius: 14, padding: '10px 12px', border: '1px solid color-mix(in srgb, var(--yanlis) 25%, transparent)', background: 'color-mix(in srgb, var(--yanlis) 5%, transparent)' }}>
          <p style={{ fontFamily: 'Outfit, sans-serif', fontSize: 12, fontWeight: 700, color: 'var(--yanlis)' }}>
            Son başarısız görevler
          </p>
          <ul style={{ marginTop: 2, listStyle: 'none' }}>
            {veri.sonHatalar.slice(0, 5).map((t) => (
              <GorevSatiri
                key={t.id}
                id={t.id}
                tur={t.kind}
                ton="basarisiz"
                durumKelime={`başarısız · ${t.attempts} deneme`}
                ek={t.error ?? 'hata metni yok'}
                onYeniden={onYeniden}
              />
            ))}
          </ul>
        </div>
      )}

      <p style={{ marginTop: 12, fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--metin3)' }}>
        son 24 saat: {veri.son24Saat.olusturulan} oluşturuldu · {veri.son24Saat.tamamlanan} tamamlandı ·{' '}
        {veri.son24Saat.basarisiz} başarısız
      </p>
    </section>
  )
}

/**
 * Tek görev satırı — tür + KELİMELİ durum + (yaş/deneme) + isteğe bağlı
 * "Yeniden kuyrukla". İYİMSER GÜNCELLEME YOK: düğme dönerken devre dışı.
 */
function GorevSatiri({ id, tur, durumKelime, ton, ek, onYeniden }: {
  id: string
  tur: string
  durumKelime: string
  ton: 'takildi' | 'basarisiz'
  ek?: string
  onYeniden?: (id: string) => Promise<void>
}) {
  const [mesgul, setMesgul] = useState(false)
  const renk = ton === 'basarisiz' ? 'var(--yanlis)' : 'var(--uyari)'
  return (
    <li style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: '1px solid var(--cizgi)' }}>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--metin2)', flexShrink: 0, minWidth: 92 }}>
        {tur}
      </span>
      <span style={{
        flexShrink: 0, fontSize: 10, fontWeight: 700, padding: '2.5px 9px', borderRadius: 8, whiteSpace: 'nowrap',
        color: renk, background: `color-mix(in srgb, ${renk} 14%, transparent)`,
      }}>
        {durumKelime}
      </span>
      {ek && (
        <span
          title={ek}
          style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, color: 'var(--metin3)' }}
        >
          {ek}
        </span>
      )}
      {onYeniden && (
        <button
          type="button"
          disabled={mesgul}
          onClick={() => { setMesgul(true); void onYeniden(id).finally(() => setMesgul(false)) }}
          style={{
            marginLeft: ek ? 0 : 'auto', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5,
            border: 'none', borderRadius: 9, padding: '6px 11px', fontFamily: 'Outfit, sans-serif', fontSize: 10.5,
            fontWeight: 600, minHeight: 34, color: 'var(--vurgu)', background: 'var(--v1)',
            cursor: mesgul ? 'default' : 'pointer', opacity: mesgul ? 0.5 : 1,
          }}
        >
          <Icon name="refresh" size={11} color="currentColor" style={mesgul ? { opacity: 0.6 } : undefined} />
          Yeniden kuyrukla
        </button>
      )}
    </li>
  )
}

/* ── Eval trendi ────────────────────────────────────────────────────────── */

export function EvalTrendi({ trend }: { trend: EvalAnlik[] }) {
  const { theme } = useTheme()
  const eksen = theme === 'dark' ? '#74887A' : '#7C8F80'  // --metin3 (recharts tick fill hex ister)
  const veri = trend.map((t) => ({
    tarih: new Date(t.tarih).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' }),
    sizinti: t.ai.sizintiOrani == null ? null : Math.round(t.ai.sizintiOrani * 100),
    nnP90: t.ai.nnP90 == null ? null : Math.round(t.ai.nnP90 * 100),
  }))
  return (
    <section style={{ ...KART, padding: '18px 22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
        <Icon name="trend" size={14} color="var(--vurgu)" />
        <h3 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 14, fontWeight: 700, color: 'var(--metin1)' }}>Eval Trendi</h3>
        <span style={{ marginLeft: 'auto', fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: 'var(--metin3)' }}>
          son {trend.length} koşu · drift %
        </span>
      </div>
      {veri.length < 2 ? (
        <p style={{ padding: '16px 0', textAlign: 'center', fontSize: 12, color: 'var(--metin3)' }}>
          Trend için en az iki eval koşumu gerekiyor. Şu an {veri.length} var.
        </p>
      ) : (
        <div style={{ height: 160 }}>
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
              {/* Sızıntı ters ölçüt (yükseliş kötü) → uyarı tonu; nnP90 → veri tonu. İkisi de tema ile döner. */}
              <Line type="monotone" dataKey="sizinti" stroke="var(--uyari)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              <Line type="monotone" dataKey="nnP90" stroke="var(--data-hue)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  )
}

/* ── Eşik tablosu (özgünlük bariyeri) ─────────────────────────────────────────
   FİDAN v1.2 · `oz-*` scoped: sınıflar OzgunlukBariyeri.tsx <style> bloğunda tanımlı
   (bu bileşen yalnız o ekrandan render edilir; onaylı önizleme ozgunluk-bariyeri.html).
   Ders/Eşik/Taban/Havuz tablosu + havuz geneli p90 TEK satır. Kendi ölçümü olan
   ders eşiği VURGULU; taban uygulananda SOLUK + "taban" etiketi (bilgi asla yalnız
   renkte taşınmaz — §14). p90 yoksa 0 çizilmez → OlcumYok (null ≠ 0). */

const ondalik = (n: number, basamak: number): string =>
  n.toLocaleString('tr-TR', { minimumFractionDigits: basamak, maximumFractionDigits: basamak })

export function EsikTablosu({ esikler, tabanEsik, p90 }: {
  esikler: AdminOzgunlukYaniti['esikler']
  tabanEsik: number
  p90: number | null
}) {
  return (
    <section className="oz-kart oz-panel-ic overflow-x-auto">
      <div className="oz-panel-bas"><h3>Ders Bazlı Eşikler</h3></div>
      <table className="oz-etablo">
        <thead>
          <tr>
            <th scope="col">Ders</th>
            <th scope="col">Eşik</th>
            <th scope="col">Taban</th>
            <th scope="col">Havuz</th>
          </tr>
        </thead>
        <tbody>
          {esikler.map((e) => (
            <tr key={e.subject}>
              <td className="ders">
                <SubjectName subject={e.subject} anahtar={dersAnahtar(e.subject)} className="!text-[12px]" />
              </td>
              {/* Kendi ölçümü olan derste eşik VURGULU; taban uygulanınca SOLUK
                  + "taban" etiketi — bilgi asla yalnız renkte taşınmaz (§14). */}
              <td className={e.taban ? 'taban' : 'esik'}>
                {ondalik(e.esik, 2)}
                {e.taban && (
                  <Tip icerik="Bu ders için ayrı ölçüm yok — taban eşik uygulanıyor.">
                    <span className="oz-taban-cip">taban</span>
                  </Tip>
                )}
              </td>
              <td className="taban">{ondalik(tabanEsik, 2)}</td>
              <td className="n">{e.havuzAdedi}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* Havuz geneli en-yakın-komşu p90 — TEK satır. Eval koşmadıysa 0 gösterilmez. */}
      <div className="oz-p90">
        <span>Havuz geneli en-yakın-komşu p90</span>
        {p90 == null
          ? <OlcumYok not="p90 ölçülmedi — eval koşmadı" />
          : <b>{ondalik(p90, 3)}</b>}
      </div>
    </section>
  )
}
