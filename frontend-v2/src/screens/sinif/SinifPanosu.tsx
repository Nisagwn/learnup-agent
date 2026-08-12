import { useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import * as Dialog from '@radix-ui/react-dialog'
import { toast } from 'sonner'
import { tDelete, tGet, tPost, useSinifNav } from '../../lib/sinif-kapsam'
import { useAsync } from '../../lib/useAsync'
import { useSinif } from '../../lib/sinif'
import type { OgrenciRisk, OgrenciSatiri, SinifZayifKazanim, SinifZayifYaniti } from '../../lib/types.teacher'
import { Sayfa, PanoIskeleti } from '../../components/RolGecidi'
import { CanliSayi } from '../../components/cekirdek'
import { Reveal } from '../../components/fx'

/* ═══════════════════════════════════════════════════════════════════════════
   SINIF PANOSU — onaylı önizleme portu (`docs/design/onizleme/sinif-panosu.html`,
   onay 2026-07-23). İnline FİDAN deseni (Bugun.tsx / GOREV-007 kalıbı).

   Yerleşim: üst şerit (kod + haftalık 3 KPI + 84 gün trendi) → İlgi Bekleyenler +
   zayıf kazanımlar (TEK birincil: "Seçili kazanımdan ödev derle") → öğrenci tablosu
   (arama/filtre/sıralama URL'de, CSV istemcide) → aktif ödev takibi + öğrenci yönetimi.

   Veri TAMAMI mevcut uçlardan: SinifSaglayici (/teacher/ozet + /teacher/sinif),
   /teacher/sinif/zayif-kazanimlar, /teacher/odevler. `v_mastery_rollup` KULLANILMAZ.

   Kurallar: teşhis dili öğretmende AÇIK ama risk rozetleri KELİMELİ · null ≠ 0
   (ölçülmeyen "ölçüm yok" der, panel gizlenir; sayı uydurulmaz — önizlemedeki
   değerler temsilîydi) · 409 sessiz-devralma sınırı açık Türkçe hatayla korunur ·
   ambiyans sakin (süzülen yaprak YOK — yoğun veri yüzeyi) · bulanıklık: cam yüzeyler
   üst şerit + orta paneller (5) + TopBar; tablo ve alt paneller MAT (yoğun liste).
   ═══════════════════════════════════════════════════════════════════════════ */

type SiraAnahtar = 'risk' | 'ad' | 'aktiflik' | 'cozulen' | 'dogruluk'
type Yon = 'asc' | 'desc'
type Filtre = 'tumu' | 'pasif' | 'dusuk'

const SIRA_ANAHTARLARI: readonly SiraAnahtar[] = ['risk', 'ad', 'aktiflik', 'cozulen', 'dogruluk']
const VARSAYILAN_YON: Record<SiraAnahtar, Yon> = {
  risk: 'asc',      // yüksek risk başta (RISK_SIRA küçük = acil)
  ad: 'asc',
  aktiflik: 'desc', // en yeni etkinlik başta
  cozulen: 'desc',  // en çok çözen başta
  dogruluk: 'asc',  // en düşük doğruluk başta — öğretmenin triyaj bakışı
}
const RISK_SIRA: Record<OgrenciRisk, number> = { yuksek: 0, orta: 1, 'veri-yok': 2, dusuk: 3 }
/** KELİMELİ rozet — renk tek başına bilgi taşımaz (renk körlüğü). 'veri-yok' risk DEĞİL: ölçülemedi. */
const RISK_ETIKET: Record<OgrenciRisk, string> = {
  yuksek: 'yüksek risk', orta: 'orta risk', dusuk: 'düşük risk', 'veri-yok': 'ölçüm yok',
}
const RISK_TON: Record<OgrenciRisk, string> = {
  yuksek: 'sp-rz-yuksek', orta: 'sp-rz-orta', dusuk: 'sp-rz-iyi', 'veri-yok': 'sp-rz-notr',
}

/** Düşük doğruluk filtre eşiği — UI kararı, çipte açıkça yazılır (%50 altı). */
const DUSUK_DOGRULUK_ESIK = 0.5
/** Pasiflik eşiği (gün) — kart gereksinimi: "son 7 gün". */
const PASIF_GUN = 7

const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

/** /teacher/odevler yanıtının bu ekranın kullandığı kesiti (panel.ts aynası — yalnız okunan alanlar). */
interface OdevTakipYaniti {
  assignments: Array<{
    id: string
    subject: string | null
    topic: string | null
    soruSayisi: number
    dueDate: string | null
    status: string
    createdAt: string
    gonderim: { toplam: number; ortalamaYuzde: number | null; bekleyen: number }
  }>
  /**
   * Tek öğrenciye gönderilen setler. Uç bunu HEP döndürüyordu (teacher.routes.ts ·
   * OdevListesiYaniti) ama hiçbir ekran okumuyordu: öğretmen Röntgen'den set gönderiyor
   * — panelin en çok öne çıkarılan eylemi — sonra "kim yaptı?" sorusunun cevabını
   * yalnız öğrenci öğrenci Röntgen açarak bulabiliyordu. Ödev zincirinin geri bildirim
   * ucu, en çok kullanılan yolda kopuktu.
   */
  hedefli: Array<{
    id: string
    studentId: string
    studentName: string | null
    title: string
    status: string
    score: number | null
    maxScore: number | null
    createdAt: string
  }>
  ogrenciSayisi: number
}

const basHarf = (ad: string | null): string => {
  const p = (ad ?? '').trim().split(/\s+/).filter(Boolean)
  if (!p.length) return '?'
  return p.slice(0, 2).map((x) => x.charAt(0).toLocaleUpperCase('tr-TR')).join('')
}

const gunOnce = (iso: string | null, simdi: number): number | null =>
  iso == null ? null : Math.max(0, Math.floor((simdi - +new Date(iso)) / 86_400_000))

/** Roster penceresi 30 gün: lastActive null = "son 30 günde etkinlik yok", "hiç" değil. */
function sonAktifMetin(iso: string | null, simdi: number): string {
  if (iso == null) return '30+ gün önce'
  const ms = simdi - +new Date(iso)
  if (ms < 3_600_000) return 'az önce'
  if (ms < 86_400_000) return `${Math.max(1, Math.floor(ms / 3_600_000))} saat önce`
  const g = Math.floor(ms / 86_400_000)
  return g === 1 ? 'dün' : `${g} gün önce`
}

const tarihMetni = (iso: string): string => {
  const d = new Date(iso)
  return `${d.getDate()} ${AYLAR[d.getMonth()]}`
}

/** null her yönde SONA — "ölçüm yok" sıralamada asla "en iyi/en kötü" gibi davranmaz. */
function sayisalNullSon(a: number | null, b: number | null, k: number): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  return k * (a - b)
}

function karsilastir(a: OgrenciSatiri, b: OgrenciSatiri, anahtar: SiraAnahtar, yon: Yon): number {
  const k = yon === 'asc' ? 1 : -1
  switch (anahtar) {
    case 'ad':
      return k * (a.name ?? '').localeCompare(b.name ?? '', 'tr')
    case 'cozulen':
      return k * (a.solved - b.solved)
    case 'aktiflik':
      return sayisalNullSon(
        a.lastActive ? +new Date(a.lastActive) : null,
        b.lastActive ? +new Date(b.lastActive) : null,
        k,
      )
    case 'dogruluk':
      return sayisalNullSon(a.basariOrani, b.basariOrani, k)
    case 'risk': {
      const fark = RISK_SIRA[a.risk] - RISK_SIRA[b.risk]
      return fark !== 0 ? k * fark : sayisalNullSon(a.avgMastery, b.avgMastery, 1)
    }
  }
}

/* Ekran stilleri — önizleme CSS'inin FİDAN değişkenli karşılığı (sp- öneki çakışmayı önler).
   Bar/çubuk büyümeleri yalnız hareket-serbest ortamda; kart girişleri Reveal (useReducedMotion). */
const STIL = `
  .sp-kart { background: var(--cam); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
    border: 1px solid var(--cam-kenar); border-radius: 20px; box-shadow: var(--golge); }
  .sp-mat { background: var(--mat); border: 1px solid var(--cam-kenar); border-radius: 20px; box-shadow: var(--golge); }
  .sp-mono { font-family: 'JetBrains Mono', monospace; font-size: 10.5px; letter-spacing: .14em;
    text-transform: uppercase; color: var(--metin3); font-weight: 500; }
  .sp-h2 { font-family: Outfit, sans-serif; font-weight: 700; font-size: 16.5px; color: var(--metin1); }
  .sp-alt { font-size: 12px; color: var(--metin3); }
  .sp-kpi { font-family: Outfit, sans-serif; font-weight: 700; font-size: 24px; color: var(--metin1); }
  .sp-kpi small { font-size: 13px; color: var(--metin3); font-weight: 600; }
  .sp-btn { font-family: Inter, sans-serif; font-weight: 600; font-size: 12.5px; border-radius: 12px;
    cursor: pointer; border: none; min-height: 44px; padding: 0 16px; transition: filter .2s, background .2s, color .2s, border-color .2s; }
  .sp-btn:disabled { opacity: .55; cursor: not-allowed; }
  .sp-btn-birincil { background: var(--cta); color: #fff; box-shadow: 0 6px 16px color-mix(in srgb, var(--cta) 25%, transparent); }
  .sp-btn-birincil:hover:not(:disabled) { filter: brightness(1.12); box-shadow: var(--parilti); }
  .sp-btn-soluk { background: var(--v0); color: var(--metin2); border: 1px solid var(--cam-kenar); }
  .sp-btn-soluk:hover:not(:disabled) { color: var(--metin1); border-color: var(--adacayi); }
  .sp-btn-tehlike { background: var(--yanlis); color: #fff; }
  .sp-btn-tehlike:hover:not(:disabled) { filter: brightness(1.08); }
  .sp-rozet { display: inline-flex; align-items: center; gap: 5px; font-size: 10.5px; font-weight: 700;
    padding: 3.5px 10px; border-radius: 11px; white-space: nowrap; }
  .sp-rz-yuksek { background: color-mix(in srgb, var(--yanlis) 13%, transparent); color: var(--yanlis); }
  .sp-rz-orta { background: color-mix(in srgb, var(--uyari) 15%, transparent); color: var(--uyari); }
  .sp-rz-iyi { background: color-mix(in srgb, var(--dogru) 13%, transparent); color: var(--dogru); }
  .sp-rz-notr { background: var(--v1); color: var(--metin2); }
  .sp-avatar { width: 36px; height: 36px; border-radius: 12px; background: var(--v2); color: var(--vurgu);
    display: grid; place-items: center; font-family: Outfit, sans-serif; font-weight: 700; font-size: 13px; flex: none; }
  .sp-triaj { display: flex; align-items: center; gap: 12px; padding: 11px 12px; border-radius: 14px; background: var(--v0); }
  .sp-link { font-size: 11.5px; color: var(--vurgu); font-weight: 700; text-decoration: none;
    white-space: nowrap; background: none; border: none; cursor: pointer; padding: 12px 6px; }
  .sp-link:hover { text-decoration: underline; }
  .sp-ara { flex: 1; min-width: 180px; font-family: Inter, sans-serif; font-size: 12.5px; color: var(--metin1);
    background: var(--ic); border: 1.5px solid var(--cam-kenar); border-radius: 12px; min-height: 44px;
    padding: 0 14px; outline: none; transition: border-color .2s; }
  .sp-ara::placeholder { color: var(--metin3); }
  .sp-ara:focus { border-color: var(--yaprak); }
  .sp-cip { font-family: Inter, sans-serif; font-size: 11.5px; font-weight: 600; color: var(--metin2);
    background: transparent; border: 1.5px solid var(--cam-kenar); border-radius: 12px; min-height: 44px;
    padding: 0 13px; cursor: pointer; transition: color .2s, background .2s, border-color .2s; }
  .sp-cip:hover { color: var(--metin1); border-color: var(--adacayi); }
  .sp-cip.aktif { color: var(--vurgu); background: var(--v1); border-color: var(--adacayi); }
  .sp-tablo { width: 100%; border-collapse: collapse; font-size: 13px; color: var(--metin1); }
  .sp-tablo th { font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: .1em;
    text-transform: uppercase; color: var(--metin3); font-weight: 500; text-align: left;
    padding: 8px 10px; border-bottom: 1px solid var(--cizgi); cursor: pointer; white-space: nowrap; }
  .sp-tablo th:hover { color: var(--vurgu); }
  .sp-tablo td { padding: 11px 10px; border-bottom: 1px solid var(--cizgi); }
  .sp-tablo tbody tr { cursor: pointer; }
  .sp-tablo tbody tr:hover td, .sp-tablo tbody tr:focus-visible td { background: var(--v0); }
  .sp-soluk { color: var(--metin3); font-size: 12px; }
  .sp-zayif { display: flex; width: 100%; align-items: center; gap: 11px; padding: 10px 12px;
    border: none; background: transparent; border-radius: 12px; cursor: pointer; text-align: left;
    font-size: 13px; color: var(--metin1); font-family: Inter, sans-serif; min-height: 44px; }
  .sp-zayif:hover { background: var(--v0); }
  .sp-zayif[aria-pressed='true'] { background: var(--v0); box-shadow: inset 0 0 0 1.5px var(--adacayi); }
  .sp-cubuk { height: 9px; border-radius: 6px; background: var(--ic); overflow: hidden; }
  .sp-cubuk i { display: block; height: 100%; border-radius: 6px;
    background: linear-gradient(90deg, var(--adacayi), var(--yaprak)); }
  .sp-trend { display: flex; align-items: flex-end; gap: 2.5px; height: 52px; }
  .sp-trend i { flex: 1; border-radius: 3px 3px 0 0; background: linear-gradient(180deg, var(--adacayi), var(--yaprak)); opacity: .85; }
  .sp-trend i.sifir { background: var(--v2); opacity: .5; }
  .sp-hata { font-size: 12px; color: var(--yanlis); background: color-mix(in srgb, var(--yanlis) 9%, transparent);
    border: 1px solid color-mix(in srgb, var(--yanlis) 25%, transparent); border-radius: 12px;
    padding: 10px 14px; line-height: 1.5; }
  .sp-kod { font-family: 'JetBrains Mono', monospace; font-size: 22px; letter-spacing: .24em;
    font-weight: 500; color: var(--vurgu); }
  @media (prefers-reduced-motion: no-preference) {
    .sp-cubuk i { transform-origin: left; animation: sp-dolx .7s cubic-bezier(.2,.7,.3,1) backwards; }
    .sp-trend i { transform-origin: bottom; animation: sp-doly .7s cubic-bezier(.2,.7,.3,1) backwards; }
    @keyframes sp-dolx { from { transform: scaleX(0); } }
    @keyframes sp-doly { from { transform: scaleY(0); } }
  }
`

export function SinifPanosu() {
  const nav = useSinifNav()
  const { ozet, roster, loading, error, reload } = useSinif()
  // Zayıf kazanımlar ilk 5 — N+1'siz RPC ucu (M§10); v_mastery_rollup KULLANILMAZ.
  const zayif = useAsync<SinifZayifYaniti>((signal) => tGet('/teacher/sinif/zayif-kazanimlar', { limit: 5 }, { signal }), [])
  const odevler = useAsync<OdevTakipYaniti>((signal) => tGet('/teacher/odevler', {}, { signal }), [])

  // "Şimdi" mount'ta bir kez: göreli süre metinleri render'lar arasında titremesin.
  const [simdi] = useState(() => Date.now())

  /* ── Filtre/sıralama URL'DE (paylaşılabilir görünüm) — replace:true, geçmiş şişmez ── */
  const [params, setParams] = useSearchParams()
  const arama = params.get('q') ?? ''
  const filtreHam = params.get('filtre')
  const filtre: Filtre = filtreHam === 'pasif' || filtreHam === 'dusuk' ? filtreHam : 'tumu'
  const siralaHam = params.get('sirala')
  const sirala: SiraAnahtar = SIRA_ANAHTARLARI.includes(siralaHam as SiraAnahtar)
    ? (siralaHam as SiraAnahtar)
    : 'risk'
  const yonHam = params.get('yon')
  const yon: Yon = yonHam === 'asc' || yonHam === 'desc' ? yonHam : VARSAYILAN_YON[sirala]

  const paramGuncelle = (degisen: Record<string, string | null>): void => {
    const p = new URLSearchParams(params)
    for (const [k, v] of Object.entries(degisen)) {
      if (v == null || v === '') p.delete(k)
      else p.set(k, v)
    }
    setParams(p, { replace: true })
  }

  const basligaTikla = (k: SiraAnahtar): void => {
    if (sirala === k) paramGuncelle({ yon: yon === 'asc' ? 'desc' : 'asc' })
    // Varsayılan anahtar (risk) URL'de gösterilmez — temiz, paylaşılabilir adres.
    else paramGuncelle({ sirala: k === 'risk' ? null : k, yon: null })
  }

  /* ── Yerel durum: kazanım seçimi + öğrenci yönetimi ── */
  const [secilenKazanim, setSecilenKazanim] = useState<number | null>(null)
  const [email, setEmail] = useState('')
  const [ekleniyor, setEkleniyor] = useState(false)
  const [ekleHata, setEkleHata] = useState<string | null>(null)
  const [cikarilacak, setCikarilacak] = useState<OgrenciSatiri | null>(null)
  const [cikariliyor, setCikariliyor] = useState(false)

  const pasifMi = (og: OgrenciSatiri): boolean => {
    const g = gunOnce(og.lastActive, simdi)
    return g == null || g >= PASIF_GUN
  }

  /* ── Triyaj: motorun risk işareti (roster.risk) + pasiflik. Gerekçeler GERÇEK
     alanlardan kurulur (teşhis dili öğretmende açık; sayı uydurulmaz). ── */
  const triaj = useMemo(() => {
    type Satir = { og: OgrenciSatiri; rozet: string; ton: 'yuksek' | 'notr'; neden: string }
    const yuksekler: Satir[] = []
    const pasifler: Array<Satir & { g: number }> = []
    for (const og of roster) {
      if (og.risk === 'yuksek') {
        const parca: string[] = []
        if (og.openMisconceptions > 0) parca.push(`${og.openMisconceptions} açık kavram yanılgısı işareti`)
        if (og.basariOrani != null) parca.push(`doğruluk %${Math.round(og.basariOrani * 100)} (son 30 gün)`)
        if (og.avgMastery != null) parca.push(`ortalama ustalık %${Math.round(og.avgMastery * 100)}`)
        yuksekler.push({
          og, rozet: 'yüksek risk', ton: 'yuksek',
          neden: parca.join(' · ') || 'Motor bu öğrenciyi yüksek riskli işaretledi',
        })
      } else {
        const g = gunOnce(og.lastActive, simdi)
        if (g == null) {
          pasifler.push({
            og, ton: 'notr', g: 999,
            rozet: og.solved === 0 ? 'hiç başlamadı' : 'pasif · 30+ gün',
            neden: og.solved === 0 ? 'Son 30 günde hiç soru çözmedi' : 'Son 30 günde etkinlik görünmüyor',
          })
        } else if (g >= PASIF_GUN) {
          pasifler.push({ og, ton: 'notr', g, rozet: `pasif · ${g} gün`, neden: `${g} gündür soru çözmedi` })
        }
      }
    }
    pasifler.sort((a, b) => b.g - a.g)
    return [...yuksekler, ...pasifler]
  }, [roster, simdi])
  const triajGoster = triaj.slice(0, 6)

  /* ── Tablo görünümü: arama + filtre + sıralama (hepsi URL'den türetilir) ── */
  const gorunum = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase('tr-TR')
    let liste = roster
    if (q) liste = liste.filter((og) => (og.name ?? '').toLocaleLowerCase('tr-TR').includes(q))
    if (filtre === 'pasif') liste = liste.filter(pasifMi)
    else if (filtre === 'dusuk') {
      liste = liste.filter((og) => og.basariOrani != null && og.basariOrani < DUSUK_DOGRULUK_ESIK)
    }
    return [...liste].sort((a, b) => karsilastir(a, b, sirala, yon))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roster, arama, filtre, sirala, yon, simdi])

  const pasifSayi = useMemo(() => roster.filter(pasifMi).length, [roster, simdi]) // eslint-disable-line react-hooks/exhaustive-deps
  const dusukSayi = useMemo(
    () => roster.filter((og) => og.basariOrani != null && og.basariOrani < DUSUK_DOGRULUK_ESIK).length,
    [roster],
  )

  /* ── 84 günlük aktivite: /teacher/ozet trendi → 42 adet 2 günlük kova.
     Hiç çözüm yoksa kart HİÇ ÇİZİLMEZ (null≠0 — boş grafik "düz çizgi" yalanı olur). ── */
  const trendKova = useMemo(() => {
    const t = ozet?.trend ?? []
    if (!t.length) return []
    const harita = new Map(t.map((g) => [g.date, g.solved]))
    const gunler: number[] = []
    for (let i = 83; i >= 0; i--) {
      const anahtar = new Date(simdi - i * 86_400_000)
        .toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' })
      gunler.push(harita.get(anahtar) ?? 0)
    }
    const kova: number[] = []
    for (let i = 0; i < 42; i++) kova.push((gunler[i * 2] ?? 0) + (gunler[i * 2 + 1] ?? 0))
    const max = Math.max(...kova)
    if (max === 0) return []
    return kova.map((v) => v / max)
  }, [ozet?.trend, simdi])

  /* ── Aktif ödevler — tamamlanma çubukları (/teacher/odevler gönderim sayıları) ── */
  const aktifOdevler = useMemo(
    () => (odevler.data?.assignments ?? []).filter((od) => od.status === 'active').slice(0, 4),
    [odevler.data],
  )
  // Sınıf ödevleriyle aynı panelde ama ayrı şeritte; uç zaten tarihe göre sıralı veriyor.
  const hedefliSetler = useMemo(() => (odevler.data?.hedefli ?? []).slice(0, 5), [odevler.data])

  if (loading) return <PanoIskeleti sutun={2} />

  if (error) {
    return (
      <Sayfa>
        <style>{STIL}</style>
        <div className="sp-kart mx-auto max-w-md px-6 py-8 text-center">
          <p className="text-sm" style={{ color: 'var(--metin2)' }}>Sınıf verisi alınamadı: {error}</p>
          <button className="sp-btn sp-btn-soluk mt-4" onClick={reload}>Tekrar dene</button>
        </div>
      </Sayfa>
    )
  }

  const o = ozet
  const kod = o?.ogretmen.classCode ?? null
  const ogrenciSayisi = o?.sinif.ogrenciSayisi ?? roster.length
  const sinifBos = roster.length === 0

  const kazanimlar = zayif.data?.kazanimlar ?? []
  const seciliKazanim: SinifZayifKazanim | null =
    kazanimlar.find((k) => k.kazanimId === secilenKazanim) ?? kazanimlar[0] ?? null
  /**
   * ⚠️ YALNIZ `ai` SAYILIR — ÖSYM stoğu ödeve DERLENEMEZ.
   *
   * Telif kararı (2026-07-22) gereği çıkmış ÖSYM sorusu ödev yüzeyine giremiyor:
   * `havuzdanSec` açık 'osym' isteğini 400 ile reddediyor, `tablodanOrnekle` tabloyu
   * `yks_ai_questions` olarak sabitlemiş. `osym` sayacı yalnızca bilgi amaçlı.
   *
   * Toplamı saymak, "çıkmışta 14 / AI'da 0" olan bir kazanımda (etiketli 1695 çıkmış
   * soru yüzünden bu durum yaygın) kapıyı AÇIK gösteriyordu: öğretmen sayfanın tek
   * birincil eylemine basıyor, Atölye "0 doğrulanmış soru" diyerek açılıyor ve yayın
   * düğmesi kapalı buluyordu — boş bir gezinti. Isı Haritası aynı kapıyı zaten doğru
   * kuruyordu (SinifIsi.tsx · `havuzdaSoru.ai === 0`); iki ekran aynı soruya iki
   * farklı cevap veriyordu.
   */
  const havuzBos = seciliKazanim != null && seciliKazanim.havuzdaSoru.ai === 0

  /**
   * SINIF MEVCUDU DEĞİŞTİ → EKRANIN ÜÇÜ DE YENİLENİR.
   *
   * `reload` yalnız sağlayıcının `ozet` + `roster`'ını tazeliyor; `zayif` ve `odevler`
   * ayrı `useAsync` örnekleri ve bu çağrıdan haber almıyorlardı. Sonuç: iki öğrenci
   * çıkarıldıktan sonra tablo 10 satıra iniyor ve üst şerit "10 öğrenci kayıtlı" derken
   * "Aktif Ödev Takibi" hâlâ "5/12 tamamladı · henüz yapmayan 7 öğrenci" yazıyordu.
   * Aynı ekranda iki farklı mevcut: öğretmen hangisinin doğru olduğunu bilemiyordu.
   */
  const sinifTazele = (): void => {
    reload()
    zayif.reload()
    odevler.reload()
  }

  const kopyala = async (): Promise<void> => {
    if (!kod) return
    try {
      await navigator.clipboard.writeText(kod)
      toast.success('Sınıf kodu kopyalandı')
    } catch {
      toast.error('Kopyalanamadı — kodu elle seçebilirsin')
    }
  }

  const ogrenciEkle = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault()
    const adres = email.trim()
    if (!adres || ekleniyor) return
    setEkleniyor(true)
    setEkleHata(null)
    try {
      const y = await tPost('/teacher/ogrenci', { email: adres })
      if (!y.eklendi) toast.info(`${y.student?.name ?? 'Öğrenci'} zaten sınıfında`)
      else toast.success(`${y.student?.name ?? 'Öğrenci'} sınıfa eklendi`)
      setEmail('')
      sinifTazele()
    } catch (hata) {
      // `baska_sinifta` (409) bir arıza değil, KASITLI SINIR: başka öğretmenin öğrencisi
      // sessizce devralınamaz. Türkçe tam cümle kalıcı kutuda kalır — toast gibi kaybolmaz.
      setEkleHata(hata instanceof Error && hata.message ? hata.message : 'Öğrenci eklenemedi')
    } finally {
      setEkleniyor(false)
    }
  }

  const ogrenciCikar = async (): Promise<void> => {
    if (!cikarilacak || cikariliyor) return
    setCikariliyor(true)
    try {
      const y = await tDelete(`/teacher/ogrenci/${cikarilacak.studentId}`)
      toast.success(`${y.student?.name ?? cikarilacak.name ?? 'Öğrenci'} sınıftan çıkarıldı`)
      setCikarilacak(null)
      sinifTazele() // iyimser güncelleme YOK — sunucu hakikati tek gerçek
    } catch (hata) {
      toast.error(hata instanceof Error && hata.message ? hata.message : 'Öğrenci çıkarılamadı')
    } finally {
      setCikariliyor(false)
    }
  }

  // Gövde bloklu: react-router 7'de nav() `void | Promise<void>` döner.
  const rontgeneGit = (id: string): void => { void nav(`/sinif/ogrenci/${id}`) }
  const odevDerle = (): void => {
    if (!seciliKazanim) return
    void nav(`/sinif/odev?kazanim=${seciliKazanim.kazanimId}&ders=${encodeURIComponent(seciliKazanim.subject)}`)
  }

  /* ── CSV: görünümdeki (filtre+sıralama uygulanmış) liste, istemci tarafında.
     Ayraç `;` (TR Excel), BOM'lu UTF-8; null "ölçüm yok" diye yazılır — 0 DEĞİL. ── */
  const csvIndir = (): void => {
    const kacir = (s: string): string => `"${s.replace(/"/g, '""')}"`
    const baslik = ['Ad', 'Sınıf', 'Son aktivite', 'Çözülen (30 gün)', 'Doğru', 'Doğruluk (%)', 'Ustalık (%)', 'Açık yanılgı', 'XP', 'Risk']
    const satirlar = gorunum.map((og) => [
      og.name ?? 'İsimsiz',
      og.studentClass ?? '',
      og.lastActive ?? 'son 30 günde yok',
      String(og.solved),
      String(og.correct),
      og.basariOrani == null ? 'ölçüm yok' : String(Math.round(og.basariOrani * 100)),
      og.avgMastery == null ? 'ölçüm yok' : String(Math.round(og.avgMastery * 100)),
      String(og.openMisconceptions),
      String(og.xp),
      RISK_ETIKET[og.risk],
    ].map(kacir).join(';'))
    // BOM (U+FEFF) başa eklenir — Excel'in UTF-8'i doğru açması için.
    const bom = String.fromCharCode(0xfeff)
    const blob = new Blob(
      [bom + [baslik.map(kacir).join(';'), ...satirlar].join('\r\n')],
      { type: 'text/csv;charset=utf-8' },
    )
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'sinif-ogrenciler.csv'
    a.click()
    /**
     * ⚠️ SERBEST BIRAKMA BİR SONRAKİ TIK'A ERTELENİR. `click()` indirmeyi SENKRON
     * başlatmaz; tarayıcı işi bir sonraki tura kuyruklar. Hemen `revokeObjectURL`
     * çağırmak, indirme daha okumaya başlamadan kaynağı geçersiz kılabiliyor ve
     * dosya kimi tarayıcıda boş/başarısız iniyordu. Sızıntı yok: iptal yine yapılır,
     * yalnız bir turluk gecikmeyle.
     */
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  return (
    <Sayfa>
      <style>{STIL}</style>

      <Reveal>
        <header>
          <h1
            className="font-display text-[clamp(24px,3vw,30px)] font-extrabold tracking-tight"
            style={{ color: 'var(--metin1)' }}
          >
            Sınıf Panosu
          </h1>
          <p className="mt-1 text-[13px]" style={{ color: 'var(--metin2)' }}>
            Sınıfının güncel durumu: aktivite, risk işaretleri, zayıf kazanımlar ve ödev takibi.
          </p>
        </header>
      </Reveal>

      {sinifBos ? (
        /* ═══ BOŞ SINIF — kod paylaşımı odaklı boş durum (sayı uydurulmaz) ═══ */
        <Reveal delay={0.06}>
          <section className="sp-kart mx-auto mt-10 max-w-xl px-8 py-10 text-center" aria-label="Sınıf kurulumu">
            <h2 className="sp-h2 text-[18px]">Sınıfın henüz boş ğŸŒ±</h2>
            <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed" style={{ color: 'var(--metin2)' }}>
              Öğrencilerin aşağıdaki kodla katıldığında pano canlanır: aktivite, risk işaretleri
              ve zayıf kazanımlar burada belirir.
            </p>
            {kod ? (
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <span className="sp-kod text-[26px]">{kod}</span>
                {/* Boş ekranın TEK birincil eylemi kodu paylaşmak */}
                <button className="sp-btn sp-btn-birincil" onClick={() => { void kopyala() }}>Kodu kopyala</button>
              </div>
            ) : (
              <p className="sp-alt mt-6">Sınıf kodun henüz oluşmamış görünüyor.</p>
            )}
            <form className="mx-auto mt-7 flex max-w-sm gap-2.5" onSubmit={(e) => { void ogrenciEkle(e) }}>
              <input
                className="sp-ara"
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value) }}
                placeholder="ya da e-postayla ekle: ogrenci@ornek.com"
                aria-label="Öğrenci e-postası"
              />
              <button className="sp-btn sp-btn-soluk" type="submit" disabled={ekleniyor || !email.trim()}>
                {ekleniyor ? 'Ekleniyor…' : 'Ekle'}
              </button>
            </form>
            {ekleHata && <div className="sp-hata mx-auto mt-3 max-w-sm text-left">⚠ {ekleHata}</div>}
          </section>
        </Reveal>
      ) : (
        <>
          {/* ═══ ÜST ŞERİT: kod + haftalık rapor (3 KPI) + 84 gün trendi ═══ */}
          <Reveal delay={0.04}>
            <div className="mt-6 grid gap-3.5 lg:grid-cols-[auto_minmax(0,1fr)_auto]">
              <section className="sp-kart flex flex-col justify-center gap-2 px-[22px] py-[18px]" aria-label="Sınıf kodu">
                <span className="sp-mono">Sınıf Kodun</span>
                <div className="flex items-center gap-2.5">
                  <span className="sp-kod">{kod ?? '—'}</span>
                  <button className="sp-btn sp-btn-soluk" onClick={() => { void kopyala() }} disabled={!kod}>
                    Kopyala
                  </button>
                </div>
                <span className="sp-alt">{ogrenciSayisi} öğrenci kayıtlı</span>
              </section>

              <section
                className="sp-kart grid grid-cols-1 items-center gap-3.5 px-6 py-[18px] sm:grid-cols-3"
                aria-label="Haftalık rapor"
              >
                <div>
                  <div className="sp-kpi"><CanliSayi value={o?.hafta.cozulen ?? 0} /></div>
                  <p className="sp-mono mt-0.5" style={{ letterSpacing: '.08em' }}>Bu hafta çözülen</p>
                </div>
                <div>
                  <div className="sp-kpi">
                    <CanliSayi value={o?.sinif.aktif7Gun ?? 0} />
                    <small> / {ogrenciSayisi}</small>
                  </div>
                  <p className="sp-mono mt-0.5" style={{ letterSpacing: '.08em' }}>Aktif öğrenci · 7 gün</p>
                </div>
                <div>
                  <div className="sp-kpi">
                    {/* %0 ile "hiç çözülmedi" AYNI ŞEY DEĞİL — null'da tire */}
                    {o?.hafta.basariOrani == null
                      ? <span style={{ color: 'var(--metin3)' }}>—</span>
                      : <>%<CanliSayi value={Math.round(o.hafta.basariOrani * 100)} /></>}
                  </div>
                  <p className="sp-mono mt-0.5" style={{ letterSpacing: '.08em' }}>
                    {o?.hafta.basariOrani == null ? 'Doğruluk · ölçüm yok' : 'Ort. doğruluk · 7 gün'}
                  </p>
                </div>
              </section>

              {trendKova.length > 0 && (
                <section
                  className="sp-kart flex min-w-[220px] flex-col gap-2 px-5 py-4"
                  aria-label="Son 84 günde çözülen soru dağılımı"
                >
                  <span className="sp-mono">84 Günlük Aktivite</span>
                  <div className="sp-trend" aria-hidden>
                    {trendKova.map((oran, i) => (
                      <i
                        key={i}
                        className={oran === 0 ? 'sifir' : undefined}
                        style={{
                          height: oran === 0 ? 2 : `${Math.max(10, Math.round(oran * 100))}%`,
                          animationDelay: `${Math.min(i * 6, 280)}ms`,
                        }}
                      />
                    ))}
                  </div>
                </section>
              )}
            </div>
          </Reveal>

          {/* ═══ ORTA: İlgi Bekleyenler + zayıf kazanımlar ═══ */}
          <div className="mt-3.5 grid items-start gap-3.5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <Reveal delay={0.1}>
              <section className="sp-kart px-6 py-5" aria-label="İlgi bekleyen öğrenciler">
                <h2 className="sp-h2">İlgi Bekleyenler</h2>
                <p className="sp-alt mb-3.5 mt-0.5">
                  Motorun işaretlediği öğrenciler — gerekçesiyle (teşhis dili öğretmende açıktır, öğrenci asla görmez)
                </p>
                {triajGoster.length === 0 ? (
                  <p className="py-4 text-[13px]" style={{ color: 'var(--metin2)' }}>
                    Şu an ilgi bekleyen öğrenci görünmüyor ğŸŒ¿ Motor yeni bir işaret ürettiğinde burada belirir.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {triajGoster.map(({ og, rozet, ton, neden }) => (
                      <div key={og.studentId} className="sp-triaj">
                        <div className="sp-avatar" aria-hidden>{basHarf(og.name)}</div>
                        <div className="min-w-0 flex-1">
                          <div className="text-[13.5px] font-semibold">{og.name ?? 'İsimsiz öğrenci'}</div>
                          <div className="mt-0.5 text-[11.5px]" style={{ color: 'var(--metin2)' }}>{neden}</div>
                        </div>
                        <span className={`sp-rozet ${ton === 'yuksek' ? 'sp-rz-yuksek' : 'sp-rz-notr'}`}>{rozet}</span>
                        <button className="sp-link" onClick={() => { rontgeneGit(og.studentId) }}>
                          Röntgeni aç →
                        </button>
                      </div>
                    ))}
                    {triaj.length > triajGoster.length && (
                      <p className="sp-alt pt-1">
                        +{triaj.length - triajGoster.length} öğrenci daha — tabloda risk sıralamasıyla görebilirsin.
                      </p>
                    )}
                  </div>
                )}
              </section>
            </Reveal>

            <Reveal delay={0.14}>
              <section className="sp-kart px-6 py-5" aria-label="Sınıfın zayıf kazanımları">
                <h2 className="sp-h2">Sınıfın Zayıf Kazanımları</h2>
                <p className="sp-alt mb-3 mt-0.5">Yaygınlığa göre ilk 5 — seçip ödev derleyebilirsin</p>
                {zayif.loading ? (
                  <div className="h-40 animate-pulse rounded-xl" style={{ background: 'var(--ic)' }} />
                ) : zayif.error ? (
                  <div className="text-[12.5px]" style={{ color: 'var(--metin2)' }}>
                    Zayıf kazanımlar alınamadı: {zayif.error}
                    <div className="mt-2.5">
                      <button className="sp-btn sp-btn-soluk" onClick={zayif.reload}>Tekrar dene</button>
                    </div>
                  </div>
                ) : kazanimlar.length === 0 ? (
                  <p className="py-3 text-[13px]" style={{ color: 'var(--metin2)' }}>
                    Sınıf geneli zayıflık ölçülecek kadar veri yok — öğrenciler çözdükçe burada belirir.
                  </p>
                ) : (
                  <>
                    <div role="radiogroup" aria-label="Ödev derlenecek kazanım seçimi">
                      {kazanimlar.map((k) => {
                        const secili = seciliKazanim?.kazanimId === k.kazanimId
                        return (
                          <button
                            key={k.kazanimId}
                            className="sp-zayif"
                            aria-pressed={secili}
                            onClick={() => { setSecilenKazanim(k.kazanimId) }}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-semibold">{k.title}</div>
                              <div className="sp-alt text-[10.5px]">{k.subject}</div>
                            </div>
                            <span className="font-mono text-[11px]" style={{ color: 'var(--metin3)' }}>
                              {k.weakStudentCount}/{k.studentCount} öğrenci
                            </span>
                          </button>
                        )
                      })}
                    </div>
                    {havuzBos && (
                      <p className="sp-alt mt-2">
                        Seçili kazanım için havuzda soru yok — ödev derlenemez, önce havuz dolmalı.
                      </p>
                    )}
                    {/* Sayfanın TEK birincil eylemi (FİDAN §9.1) */}
                    <button
                      className="sp-btn sp-btn-birincil mt-3.5 w-full"
                      onClick={odevDerle}
                      disabled={!seciliKazanim || havuzBos}
                    >
                      Seçili kazanımdan ödev derle
                    </button>
                  </>
                )}
              </section>
            </Reveal>
          </div>

          {/* ═══ ÖĞRENCİ TABLOSU — MAT yüzey (kaydırılan yoğun liste, FİDAN §9.2) ═══ */}
          <Reveal delay={0.18}>
            <section className="sp-mat mt-3.5 px-6 py-5" aria-label="Öğrenci listesi">
              <h2 className="sp-h2">Öğrenciler</h2>
              <p className="sp-alt mb-3 mt-0.5">
                Satıra tıkla → Öğrenci Röntgeni · başlığa tıkla → sırala · görünüm URL'de kalıcı (paylaşılabilir)
              </p>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <input
                  className="sp-ara"
                  value={arama}
                  onChange={(e) => { paramGuncelle({ q: e.target.value || null }) }}
                  placeholder="Öğrenci ara…"
                  aria-label="Öğrenci ara"
                />
                <button
                  className={`sp-cip${filtre === 'tumu' ? ' aktif' : ''}`}
                  aria-pressed={filtre === 'tumu'}
                  onClick={() => { paramGuncelle({ filtre: null }) }}
                >
                  Tümü ({roster.length})
                </button>
                <button
                  className={`sp-cip${filtre === 'pasif' ? ' aktif' : ''}`}
                  aria-pressed={filtre === 'pasif'}
                  onClick={() => { paramGuncelle({ filtre: filtre === 'pasif' ? null : 'pasif' }) }}
                >
                  Pasif — son 7 gün ({pasifSayi})
                </button>
                <button
                  className={`sp-cip${filtre === 'dusuk' ? ' aktif' : ''}`}
                  aria-pressed={filtre === 'dusuk'}
                  onClick={() => { paramGuncelle({ filtre: filtre === 'dusuk' ? null : 'dusuk' }) }}
                  title={`Doğruluğu %${DUSUK_DOGRULUK_ESIK * 100} altında olanlar (son 30 gün)`}
                >
                  Düşük doğruluk ({dusukSayi})
                </button>
                <button className="sp-btn sp-btn-soluk" onClick={csvIndir} disabled={gorunum.length === 0}>
                  ⬇ CSV
                </button>
              </div>

              {gorunum.length === 0 ? (
                <p className="py-6 text-center text-[13px]" style={{ color: 'var(--metin2)' }}>
                  Bu filtreyle eşleşen öğrenci yok.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="sp-tablo">
                    <thead>
                      <tr>
                        {([
                          ['ad', 'Ad'],
                          ['aktiflik', 'Son aktivite'],
                          ['cozulen', 'Çözülen · 30 gün'],
                          ['dogruluk', 'Doğruluk'],
                          ['risk', 'Risk'],
                        ] as Array<[SiraAnahtar, string]>).map(([anahtar, etiket]) => {
                          const aktif = sirala === anahtar
                          return (
                            <th
                              key={anahtar}
                              scope="col"
                              aria-sort={aktif ? (yon === 'asc' ? 'ascending' : 'descending') : undefined}
                              onClick={() => { basligaTikla(anahtar) }}
                            >
                              {etiket}{aktif ? (yon === 'asc' ? ' ↑' : ' ↓') : ''}
                            </th>
                          )
                        })}
                        <th scope="col" style={{ cursor: 'default' }} aria-label="İşlem" />
                      </tr>
                    </thead>
                    <tbody>
                      {gorunum.map((og) => (
                        <tr
                          key={og.studentId}
                          tabIndex={0}
                          onClick={() => { rontgeneGit(og.studentId) }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              rontgeneGit(og.studentId)
                            }
                          }}
                          aria-label={`${og.name ?? 'İsimsiz öğrenci'} — röntgeni aç`}
                        >
                          <td>
                            <span className="flex items-center gap-2.5 font-semibold">
                              <span
                                className="sp-avatar"
                                style={{ width: 28, height: 28, fontSize: 11, borderRadius: 9 }}
                                aria-hidden
                              >
                                {basHarf(og.name)}
                              </span>
                              {og.name ?? 'İsimsiz'}
                            </span>
                          </td>
                          <td className="sp-soluk">{sonAktifMetin(og.lastActive, simdi)}</td>
                          <td>{og.solved} soru</td>
                          <td>
                            {og.basariOrani == null
                              ? <span className="sp-soluk">ölçüm yok</span>
                              : `%${Math.round(og.basariOrani * 100)}`}
                          </td>
                          <td><span className={`sp-rozet ${RISK_TON[og.risk]}`}>{RISK_ETIKET[og.risk]}</span></td>
                          <td onClick={(e) => { e.stopPropagation() }} style={{ cursor: 'default' }}>
                            <button
                              className="sp-link"
                              style={{ color: 'var(--metin3)' }}
                              onClick={() => { setCikarilacak(og) }}
                              aria-label={`${og.name ?? 'Öğrenciyi'} sınıftan çıkar`}
                            >
                              Çıkar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </Reveal>

          {/* ═══ ALT: ödev takibi + öğrenci yönetimi (MAT — form/liste yüzeyi) ═══ */}
          <div className={`mt-3.5 grid items-start gap-3.5 ${aktifOdevler.length > 0 || hedefliSetler.length > 0 || odevler.error ? 'md:grid-cols-2' : ''}`}>
            {/* Aktif ödev yoksa panel GİZLENİR (null≠0); uçtan hata geldiyse dürüstçe söylenir. */}
            {(aktifOdevler.length > 0 || hedefliSetler.length > 0 || odevler.error) && (
              <Reveal delay={0.24}>
                <section className="sp-mat px-6 py-5" aria-label="Aktif ödev takibi">
                  <h2 className="sp-h2">Aktif Ödev Takibi</h2>
                  <p className="sp-alt mb-3.5 mt-0.5">Ödev geçmişi verisinden tamamlanma oranları</p>
                  {odevler.error ? (
                    <div className="text-[12.5px]" style={{ color: 'var(--metin2)' }}>
                      Ödev verisi alınamadı: {odevler.error}
                      <div className="mt-2.5">
                        <button className="sp-btn sp-btn-soluk" onClick={odevler.reload}>Tekrar dene</button>
                      </div>
                    </div>
                  ) : (
                    aktifOdevler.map((od) => {
                      const mevcut = odevler.data?.ogrenciSayisi ?? 0
                      const oran = mevcut > 0 ? od.gonderim.toplam / mevcut : 0
                      const baslik = [od.subject, od.topic].filter(Boolean).join(' · ') || 'Ödev'
                      return (
                        <div key={od.id} className="mb-3.5 last:mb-0">
                          <div className="mb-1.5 flex items-center justify-between gap-2 text-[12.5px]">
                            <b className="min-w-0 truncate font-semibold">{baslik}</b>
                            <span style={{ color: 'var(--metin2)' }}>
                              {od.gonderim.toplam}/{mevcut} tamamladı
                            </span>
                          </div>
                          <div className="sp-cubuk">
                            <i style={{ width: `${Math.round(Math.min(1, oran) * 100)}%` }} />
                          </div>
                          <p className="sp-alt mt-1.5">
                            {od.gonderim.bekleyen > 0
                              ? `Henüz yapmayan ${od.gonderim.bekleyen} öğrenci`
                              : 'Herkes tamamladı 🌿'}
                            {od.dueDate ? ` · Son tarih: ${tarihMetni(od.dueDate)}` : ''}
                          </p>
                        </div>
                      )
                    })
                  )}

                  {/* ── Hedefli setler — sınıf ödevlerinden AYRI şerit ──
                      Ayrı tutulur çünkü ölçüsü farklıdır: sınıf ödevinde "kaç kişi
                      tamamladı", hedefli sette "o öğrenci yaptı mı". İkisini aynı
                      çubukta göstermek, 1 kişilik seti %100 ya da %0 diye okuturdu. */}
                  {hedefliSetler.length > 0 && (
                    <div className="mt-4 border-t pt-3.5" style={{ borderColor: 'var(--cam-kenar)' }}>
                      <h3 className="text-[12.5px] font-semibold" style={{ color: 'var(--metin1)' }}>
                        Hedefli setler
                      </h3>
                      <p className="sp-alt mb-2 mt-0.5">Tek öğrenciye gönderilenler — son {hedefliSetler.length}</p>
                      {hedefliSetler.map((h) => {
                        const bitti = h.status === 'completed'
                        return (
                          <div key={h.id} className="flex items-center gap-2 py-1 text-[12.5px]">
                            <button
                              className="sp-link min-w-0 truncate"
                              onClick={() => { rontgeneGit(h.studentId) }}
                              aria-label={`${h.studentName ?? 'Öğrenci'} röntgenini aç`}
                            >
                              {h.studentName ?? 'İsimsiz öğrenci'}
                            </button>
                            <span className="min-w-0 flex-1 truncate" style={{ color: 'var(--metin3)' }}>
                              {h.title}
                            </span>
                            {/* KELİMELİ durum; puan yalnız GERÇEKTEN varsa yazılır (null ≠ 0) */}
                            <span style={{ color: 'var(--metin2)' }}>
                              {bitti
                                ? h.score != null && h.maxScore
                                  ? `${h.score}/${h.maxScore}`
                                  : 'tamamlandı'
                                : 'bekliyor'}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </section>
              </Reveal>
            )}

            <Reveal delay={0.28}>
              <section className="sp-mat px-6 py-5" aria-label="Öğrenci yönetimi">
                <h2 className="sp-h2">Öğrenci Yönetimi</h2>
                <p className="sp-alt mb-3.5 mt-0.5">E-postayla ekle · çıkarma onay diyaloğuyla</p>
                <form className="flex gap-2.5" onSubmit={(e) => { void ogrenciEkle(e) }}>
                  <input
                    className="sp-ara"
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value) }}
                    placeholder="ogrenci@ornek.com"
                    aria-label="Öğrenci e-postası"
                  />
                  <button className="sp-btn sp-btn-soluk" type="submit" disabled={ekleniyor || !email.trim()}>
                    {ekleniyor ? 'Ekleniyor…' : 'Ekle'}
                  </button>
                </form>
                {ekleHata && <div className="sp-hata mt-3">⚠ {ekleHata}</div>}
                <p className="sp-alt mt-3">
                  Öğrenci çıkarmak için tablodaki satırda "Çıkar"a bas — onay diyaloğu açılır;
                  kayıtlı veri silinmez, yalnız sınıf bağı kalkar.
                </p>
              </section>
            </Reveal>
          </div>
        </>
      )}

      {/* ═══ ÇIKARMA ONAYI — yıkıcı eylem daima Radix Dialog (window.confirm asla) ═══ */}
      <Dialog.Root
        open={cikarilacak != null}
        onOpenChange={(acik) => { if (!acik && !cikariliyor) setCikarilacak(null) }}
      >
        <Dialog.Portal>
          <Dialog.Overlay
            className="fixed inset-0 z-[85] backdrop-blur-sm"
            style={{ background: 'rgba(12, 18, 14, 0.45)' }}
          />
          <Dialog.Content className="sp-kart fixed left-1/2 top-1/2 z-[86] w-[min(92vw,380px)] -translate-x-1/2 -translate-y-1/2 p-6">
            <style>{STIL}</style>
            <Dialog.Title className="font-display text-[16px] font-bold" style={{ color: 'var(--metin1)' }}>
              Öğrenciyi sınıftan çıkar?
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-[13px] leading-relaxed" style={{ color: 'var(--metin2)' }}>
              {cikarilacak?.name ?? 'Öğrenci'} sınıftan çıkarılacak. Kayıtlı verisi silinmez —
              yalnız sınıf bağı kalkar; istediğinde kodla yeniden katılabilir.
            </Dialog.Description>
            <div className="mt-5 flex justify-end gap-2.5">
              <button
                className="sp-btn sp-btn-soluk"
                onClick={() => { setCikarilacak(null) }}
                disabled={cikariliyor}
              >
                Vazgeç
              </button>
              <button
                className="sp-btn sp-btn-tehlike"
                onClick={() => { void ogrenciCikar() }}
                disabled={cikariliyor}
              >
                {cikariliyor ? 'Çıkarılıyor…' : 'Evet, çıkar'}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </Sayfa>
  )
}
