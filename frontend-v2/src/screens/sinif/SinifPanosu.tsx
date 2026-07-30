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

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   SINIF PANOSU â€” onaylÄ± Ã¶nizleme portu (`docs/design/onizleme/sinif-panosu.html`,
   onay 2026-07-23). Ä°nline FÄ°DAN deseni (Bugun.tsx / GOREV-007 kalÄ±bÄ±).

   YerleÅŸim: Ã¼st ÅŸerit (kod + haftalÄ±k 3 KPI + 84 gÃ¼n trendi) â†’ Ä°lgi Bekleyenler +
   zayÄ±f kazanÄ±mlar (TEK birincil: "SeÃ§ili kazanÄ±mdan Ã¶dev derle") â†’ Ã¶ÄŸrenci tablosu
   (arama/filtre/sÄ±ralama URL'de, CSV istemcide) â†’ aktif Ã¶dev takibi + Ã¶ÄŸrenci yÃ¶netimi.

   Veri TAMAMI mevcut uÃ§lardan: SinifSaglayici (/teacher/ozet + /teacher/sinif),
   /teacher/sinif/zayif-kazanimlar, /teacher/odevler. `v_mastery_rollup` KULLANILMAZ.

   Kurallar: teÅŸhis dili Ã¶ÄŸretmende AÃ‡IK ama risk rozetleri KELÄ°MELÄ° Â· null â‰  0
   (Ã¶lÃ§Ã¼lmeyen "Ã¶lÃ§Ã¼m yok" der, panel gizlenir; sayÄ± uydurulmaz â€” Ã¶nizlemedeki
   deÄŸerler temsilÃ®ydi) Â· 409 sessiz-devralma sÄ±nÄ±rÄ± aÃ§Ä±k TÃ¼rkÃ§e hatayla korunur Â·
   ambiyans sakin (sÃ¼zÃ¼len yaprak YOK â€” yoÄŸun veri yÃ¼zeyi) Â· bulanÄ±klÄ±k: cam yÃ¼zeyler
   Ã¼st ÅŸerit + orta paneller (5) + TopBar; tablo ve alt paneller MAT (yoÄŸun liste).
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

type SiraAnahtar = 'risk' | 'ad' | 'aktiflik' | 'cozulen' | 'dogruluk'
type Yon = 'asc' | 'desc'
type Filtre = 'tumu' | 'pasif' | 'dusuk'

const SIRA_ANAHTARLARI: readonly SiraAnahtar[] = ['risk', 'ad', 'aktiflik', 'cozulen', 'dogruluk']
const VARSAYILAN_YON: Record<SiraAnahtar, Yon> = {
  risk: 'asc',      // yÃ¼ksek risk baÅŸta (RISK_SIRA kÃ¼Ã§Ã¼k = acil)
  ad: 'asc',
  aktiflik: 'desc', // en yeni etkinlik baÅŸta
  cozulen: 'desc',  // en Ã§ok Ã§Ã¶zen baÅŸta
  dogruluk: 'asc',  // en dÃ¼ÅŸÃ¼k doÄŸruluk baÅŸta â€” Ã¶ÄŸretmenin triyaj bakÄ±ÅŸÄ±
}
const RISK_SIRA: Record<OgrenciRisk, number> = { yuksek: 0, orta: 1, 'veri-yok': 2, dusuk: 3 }
/** KELÄ°MELÄ° rozet â€” renk tek baÅŸÄ±na bilgi taÅŸÄ±maz (renk kÃ¶rlÃ¼ÄŸÃ¼). 'veri-yok' risk DEÄÄ°L: Ã¶lÃ§Ã¼lemedi. */
const RISK_ETIKET: Record<OgrenciRisk, string> = {
  yuksek: 'yÃ¼ksek risk', orta: 'orta risk', dusuk: 'dÃ¼ÅŸÃ¼k risk', 'veri-yok': 'Ã¶lÃ§Ã¼m yok',
}
const RISK_TON: Record<OgrenciRisk, string> = {
  yuksek: 'sp-rz-yuksek', orta: 'sp-rz-orta', dusuk: 'sp-rz-iyi', 'veri-yok': 'sp-rz-notr',
}

/** DÃ¼ÅŸÃ¼k doÄŸruluk filtre eÅŸiÄŸi â€” UI kararÄ±, Ã§ipte aÃ§Ä±kÃ§a yazÄ±lÄ±r (%50 altÄ±). */
const DUSUK_DOGRULUK_ESIK = 0.5
/** Pasiflik eÅŸiÄŸi (gÃ¼n) â€” kart gereksinimi: "son 7 gÃ¼n". */
const PASIF_GUN = 7

const AYLAR = ['Ocak', 'Åubat', 'Mart', 'Nisan', 'MayÄ±s', 'Haziran', 'Temmuz', 'AÄŸustos', 'EylÃ¼l', 'Ekim', 'KasÄ±m', 'AralÄ±k']

/** /teacher/odevler yanÄ±tÄ±nÄ±n bu ekranÄ±n kullandÄ±ÄŸÄ± kesiti (panel.ts aynasÄ± â€” yalnÄ±z okunan alanlar). */
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
  ogrenciSayisi: number
}

const basHarf = (ad: string | null): string => {
  const p = (ad ?? '').trim().split(/\s+/).filter(Boolean)
  if (!p.length) return '?'
  return p.slice(0, 2).map((x) => x.charAt(0).toLocaleUpperCase('tr-TR')).join('')
}

const gunOnce = (iso: string | null, simdi: number): number | null =>
  iso == null ? null : Math.max(0, Math.floor((simdi - +new Date(iso)) / 86_400_000))

/** Roster penceresi 30 gÃ¼n: lastActive null = "son 30 gÃ¼nde etkinlik yok", "hiÃ§" deÄŸil. */
function sonAktifMetin(iso: string | null, simdi: number): string {
  if (iso == null) return '30+ gÃ¼n Ã¶nce'
  const ms = simdi - +new Date(iso)
  if (ms < 3_600_000) return 'az Ã¶nce'
  if (ms < 86_400_000) return `${Math.max(1, Math.floor(ms / 3_600_000))} saat Ã¶nce`
  const g = Math.floor(ms / 86_400_000)
  return g === 1 ? 'dÃ¼n' : `${g} gÃ¼n Ã¶nce`
}

const tarihMetni = (iso: string): string => {
  const d = new Date(iso)
  return `${d.getDate()} ${AYLAR[d.getMonth()]}`
}

/** null her yÃ¶nde SONA â€” "Ã¶lÃ§Ã¼m yok" sÄ±ralamada asla "en iyi/en kÃ¶tÃ¼" gibi davranmaz. */
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

/* Ekran stilleri â€” Ã¶nizleme CSS'inin FÄ°DAN deÄŸiÅŸkenli karÅŸÄ±lÄ±ÄŸÄ± (sp- Ã¶neki Ã§akÄ±ÅŸmayÄ± Ã¶nler).
   Bar/Ã§ubuk bÃ¼yÃ¼meleri yalnÄ±z hareket-serbest ortamda; kart giriÅŸleri Reveal (useReducedMotion). */
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
  // ZayÄ±f kazanÄ±mlar ilk 5 â€” N+1'siz RPC ucu (MÂ§10); v_mastery_rollup KULLANILMAZ.
  const zayif = useAsync<SinifZayifYaniti>(() => tGet('/teacher/sinif/zayif-kazanimlar', { limit: 5 }), [])
  const odevler = useAsync<OdevTakipYaniti>(() => tGet('/teacher/odevler'), [])

  // "Åimdi" mount'ta bir kez: gÃ¶reli sÃ¼re metinleri render'lar arasÄ±nda titremesin.
  const [simdi] = useState(() => Date.now())

  /* â”€â”€ Filtre/sÄ±ralama URL'DE (paylaÅŸÄ±labilir gÃ¶rÃ¼nÃ¼m) â€” replace:true, geÃ§miÅŸ ÅŸiÅŸmez â”€â”€ */
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
    // VarsayÄ±lan anahtar (risk) URL'de gÃ¶sterilmez â€” temiz, paylaÅŸÄ±labilir adres.
    else paramGuncelle({ sirala: k === 'risk' ? null : k, yon: null })
  }

  /* â”€â”€ Yerel durum: kazanÄ±m seÃ§imi + Ã¶ÄŸrenci yÃ¶netimi â”€â”€ */
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

  /* â”€â”€ Triyaj: motorun risk iÅŸareti (roster.risk) + pasiflik. GerekÃ§eler GERÃ‡EK
     alanlardan kurulur (teÅŸhis dili Ã¶ÄŸretmende aÃ§Ä±k; sayÄ± uydurulmaz). â”€â”€ */
  const triaj = useMemo(() => {
    type Satir = { og: OgrenciSatiri; rozet: string; ton: 'yuksek' | 'notr'; neden: string }
    const yuksekler: Satir[] = []
    const pasifler: Array<Satir & { g: number }> = []
    for (const og of roster) {
      if (og.risk === 'yuksek') {
        const parca: string[] = []
        if (og.openMisconceptions > 0) parca.push(`${og.openMisconceptions} aÃ§Ä±k kavram yanÄ±lgÄ±sÄ± iÅŸareti`)
        if (og.basariOrani != null) parca.push(`doÄŸruluk %${Math.round(og.basariOrani * 100)} (son 30 gÃ¼n)`)
        if (og.avgMastery != null) parca.push(`ortalama ustalÄ±k %${Math.round(og.avgMastery * 100)}`)
        yuksekler.push({
          og, rozet: 'yÃ¼ksek risk', ton: 'yuksek',
          neden: parca.join(' Â· ') || 'Motor bu Ã¶ÄŸrenciyi yÃ¼ksek riskli iÅŸaretledi',
        })
      } else {
        const g = gunOnce(og.lastActive, simdi)
        if (g == null) {
          pasifler.push({
            og, ton: 'notr', g: 999,
            rozet: og.solved === 0 ? 'hiÃ§ baÅŸlamadÄ±' : 'pasif Â· 30+ gÃ¼n',
            neden: og.solved === 0 ? 'Son 30 gÃ¼nde hiÃ§ soru Ã§Ã¶zmedi' : 'Son 30 gÃ¼nde etkinlik gÃ¶rÃ¼nmÃ¼yor',
          })
        } else if (g >= PASIF_GUN) {
          pasifler.push({ og, ton: 'notr', g, rozet: `pasif Â· ${g} gÃ¼n`, neden: `${g} gÃ¼ndÃ¼r soru Ã§Ã¶zmedi` })
        }
      }
    }
    pasifler.sort((a, b) => b.g - a.g)
    return [...yuksekler, ...pasifler]
  }, [roster, simdi])
  const triajGoster = triaj.slice(0, 6)

  /* â”€â”€ Tablo gÃ¶rÃ¼nÃ¼mÃ¼: arama + filtre + sÄ±ralama (hepsi URL'den tÃ¼retilir) â”€â”€ */
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

  /* â”€â”€ 84 gÃ¼nlÃ¼k aktivite: /teacher/ozet trendi â†’ 42 adet 2 gÃ¼nlÃ¼k kova.
     HiÃ§ Ã§Ã¶zÃ¼m yoksa kart HÄ°Ã‡ Ã‡Ä°ZÄ°LMEZ (nullâ‰ 0 â€” boÅŸ grafik "dÃ¼z Ã§izgi" yalanÄ± olur). â”€â”€ */
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

  /* â”€â”€ Aktif Ã¶devler â€” tamamlanma Ã§ubuklarÄ± (/teacher/odevler gÃ¶nderim sayÄ±larÄ±) â”€â”€ */
  const aktifOdevler = useMemo(
    () => (odevler.data?.assignments ?? []).filter((od) => od.status === 'active').slice(0, 4),
    [odevler.data],
  )

  if (loading) return <PanoIskeleti sutun={2} />

  if (error) {
    return (
      <Sayfa>
        <style>{STIL}</style>
        <div className="sp-kart mx-auto max-w-md px-6 py-8 text-center">
          <p className="text-sm" style={{ color: 'var(--metin2)' }}>SÄ±nÄ±f verisi alÄ±namadÄ±: {error}</p>
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
  const havuzBos = seciliKazanim != null
    && seciliKazanim.havuzdaSoru.osym + seciliKazanim.havuzdaSoru.ai === 0

  const kopyala = async (): Promise<void> => {
    if (!kod) return
    try {
      await navigator.clipboard.writeText(kod)
      toast.success('SÄ±nÄ±f kodu kopyalandÄ±')
    } catch {
      toast.error('KopyalanamadÄ± â€” kodu elle seÃ§ebilirsin')
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
      if (!y.eklendi) toast.info(`${y.student?.name ?? 'Ã–ÄŸrenci'} zaten sÄ±nÄ±fÄ±nda`)
      else toast.success(`${y.student?.name ?? 'Ã–ÄŸrenci'} sÄ±nÄ±fa eklendi`)
      setEmail('')
      reload()
    } catch (hata) {
      // `baska_sinifta` (409) bir arÄ±za deÄŸil, KASITLI SINIR: baÅŸka Ã¶ÄŸretmenin Ã¶ÄŸrencisi
      // sessizce devralÄ±namaz. TÃ¼rkÃ§e tam cÃ¼mle kalÄ±cÄ± kutuda kalÄ±r â€” toast gibi kaybolmaz.
      setEkleHata(hata instanceof Error && hata.message ? hata.message : 'Ã–ÄŸrenci eklenemedi')
    } finally {
      setEkleniyor(false)
    }
  }

  const ogrenciCikar = async (): Promise<void> => {
    if (!cikarilacak || cikariliyor) return
    setCikariliyor(true)
    try {
      const y = await tDelete(`/teacher/ogrenci/${cikarilacak.studentId}`)
      toast.success(`${y.student?.name ?? cikarilacak.name ?? 'Ã–ÄŸrenci'} sÄ±nÄ±ftan Ã§Ä±karÄ±ldÄ±`)
      setCikarilacak(null)
      reload() // iyimser gÃ¼ncelleme YOK â€” sunucu hakikati tek gerÃ§ek
    } catch (hata) {
      toast.error(hata instanceof Error && hata.message ? hata.message : 'Ã–ÄŸrenci Ã§Ä±karÄ±lamadÄ±')
    } finally {
      setCikariliyor(false)
    }
  }

  // GÃ¶vde bloklu: react-router 7'de nav() `void | Promise<void>` dÃ¶ner.
  const rontgeneGit = (id: string): void => { void nav(`/sinif/ogrenci/${id}`) }
  const odevDerle = (): void => {
    if (!seciliKazanim) return
    void nav(`/sinif/odev?kazanim=${seciliKazanim.kazanimId}&ders=${encodeURIComponent(seciliKazanim.subject)}`)
  }

  /* â”€â”€ CSV: gÃ¶rÃ¼nÃ¼mdeki (filtre+sÄ±ralama uygulanmÄ±ÅŸ) liste, istemci tarafÄ±nda.
     AyraÃ§ `;` (TR Excel), BOM'lu UTF-8; null "Ã¶lÃ§Ã¼m yok" diye yazÄ±lÄ±r â€” 0 DEÄÄ°L. â”€â”€ */
  const csvIndir = (): void => {
    const kacir = (s: string): string => `"${s.replace(/"/g, '""')}"`
    const baslik = ['Ad', 'SÄ±nÄ±f', 'Son aktivite', 'Ã‡Ã¶zÃ¼len (30 gÃ¼n)', 'DoÄŸru', 'DoÄŸruluk (%)', 'UstalÄ±k (%)', 'AÃ§Ä±k yanÄ±lgÄ±', 'XP', 'Risk']
    const satirlar = gorunum.map((og) => [
      og.name ?? 'Ä°simsiz',
      og.studentClass ?? '',
      og.lastActive ?? 'son 30 gÃ¼nde yok',
      String(og.solved),
      String(og.correct),
      og.basariOrani == null ? 'Ã¶lÃ§Ã¼m yok' : String(Math.round(og.basariOrani * 100)),
      og.avgMastery == null ? 'Ã¶lÃ§Ã¼m yok' : String(Math.round(og.avgMastery * 100)),
      String(og.openMisconceptions),
      String(og.xp),
      RISK_ETIKET[og.risk],
    ].map(kacir).join(';'))
    // BOM (U+FEFF) baÅŸa eklenir â€” Excel'in UTF-8'i doÄŸru aÃ§masÄ± iÃ§in.
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
    URL.revokeObjectURL(url)
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
            SÄ±nÄ±f Panosu
          </h1>
          <p className="mt-1 text-[13px]" style={{ color: 'var(--metin2)' }}>
            SÄ±nÄ±fÄ±nÄ±n gÃ¼ncel durumu: aktivite, risk iÅŸaretleri, zayÄ±f kazanÄ±mlar ve Ã¶dev takibi.
          </p>
        </header>
      </Reveal>

      {sinifBos ? (
        /* â•â•â• BOÅ SINIF â€” kod paylaÅŸÄ±mÄ± odaklÄ± boÅŸ durum (sayÄ± uydurulmaz) â•â•â• */
        <Reveal delay={0.06}>
          <section className="sp-kart mx-auto mt-10 max-w-xl px-8 py-10 text-center" aria-label="SÄ±nÄ±f kurulumu">
            <h2 className="sp-h2 text-[18px]">SÄ±nÄ±fÄ±n henÃ¼z boÅŸ ğŸŒ±</h2>
            <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed" style={{ color: 'var(--metin2)' }}>
              Ã–ÄŸrencilerin aÅŸaÄŸÄ±daki kodla katÄ±ldÄ±ÄŸÄ±nda pano canlanÄ±r: aktivite, risk iÅŸaretleri
              ve zayÄ±f kazanÄ±mlar burada belirir.
            </p>
            {kod ? (
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <span className="sp-kod text-[26px]">{kod}</span>
                {/* BoÅŸ ekranÄ±n TEK birincil eylemi kodu paylaÅŸmak */}
                <button className="sp-btn sp-btn-birincil" onClick={() => { void kopyala() }}>Kodu kopyala</button>
              </div>
            ) : (
              <p className="sp-alt mt-6">SÄ±nÄ±f kodun henÃ¼z oluÅŸmamÄ±ÅŸ gÃ¶rÃ¼nÃ¼yor.</p>
            )}
            <form className="mx-auto mt-7 flex max-w-sm gap-2.5" onSubmit={(e) => { void ogrenciEkle(e) }}>
              <input
                className="sp-ara"
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value) }}
                placeholder="ya da e-postayla ekle: ogrenci@ornek.com"
                aria-label="Ã–ÄŸrenci e-postasÄ±"
              />
              <button className="sp-btn sp-btn-soluk" type="submit" disabled={ekleniyor || !email.trim()}>
                {ekleniyor ? 'Ekleniyorâ€¦' : 'Ekle'}
              </button>
            </form>
            {ekleHata && <div className="sp-hata mx-auto mt-3 max-w-sm text-left">âš  {ekleHata}</div>}
          </section>
        </Reveal>
      ) : (
        <>
          {/* â•â•â• ÃœST ÅERÄ°T: kod + haftalÄ±k rapor (3 KPI) + 84 gÃ¼n trendi â•â•â• */}
          <Reveal delay={0.04}>
            <div className="mt-6 grid gap-3.5 lg:grid-cols-[auto_minmax(0,1fr)_auto]">
              <section className="sp-kart flex flex-col justify-center gap-2 px-[22px] py-[18px]" aria-label="SÄ±nÄ±f kodu">
                <span className="sp-mono">SÄ±nÄ±f Kodun</span>
                <div className="flex items-center gap-2.5">
                  <span className="sp-kod">{kod ?? 'â€”'}</span>
                  <button className="sp-btn sp-btn-soluk" onClick={() => { void kopyala() }} disabled={!kod}>
                    Kopyala
                  </button>
                </div>
                <span className="sp-alt">{ogrenciSayisi} Ã¶ÄŸrenci kayÄ±tlÄ±</span>
              </section>

              <section
                className="sp-kart grid grid-cols-1 items-center gap-3.5 px-6 py-[18px] sm:grid-cols-3"
                aria-label="HaftalÄ±k rapor"
              >
                <div>
                  <div className="sp-kpi"><CanliSayi value={o?.hafta.cozulen ?? 0} /></div>
                  <p className="sp-mono mt-0.5" style={{ letterSpacing: '.08em' }}>Bu hafta Ã§Ã¶zÃ¼len</p>
                </div>
                <div>
                  <div className="sp-kpi">
                    <CanliSayi value={o?.sinif.aktif7Gun ?? 0} />
                    <small> / {ogrenciSayisi}</small>
                  </div>
                  <p className="sp-mono mt-0.5" style={{ letterSpacing: '.08em' }}>Aktif Ã¶ÄŸrenci Â· 7 gÃ¼n</p>
                </div>
                <div>
                  <div className="sp-kpi">
                    {/* %0 ile "hiÃ§ Ã§Ã¶zÃ¼lmedi" AYNI ÅEY DEÄÄ°L â€” null'da tire */}
                    {o?.hafta.basariOrani == null
                      ? <span style={{ color: 'var(--metin3)' }}>â€”</span>
                      : <>%<CanliSayi value={Math.round(o.hafta.basariOrani * 100)} /></>}
                  </div>
                  <p className="sp-mono mt-0.5" style={{ letterSpacing: '.08em' }}>
                    {o?.hafta.basariOrani == null ? 'DoÄŸruluk Â· Ã¶lÃ§Ã¼m yok' : 'Ort. doÄŸruluk Â· 7 gÃ¼n'}
                  </p>
                </div>
              </section>

              {trendKova.length > 0 && (
                <section
                  className="sp-kart flex min-w-[220px] flex-col gap-2 px-5 py-4"
                  aria-label="Son 84 gÃ¼nde Ã§Ã¶zÃ¼len soru daÄŸÄ±lÄ±mÄ±"
                >
                  <span className="sp-mono">84 GÃ¼nlÃ¼k Aktivite</span>
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

          {/* â•â•â• ORTA: Ä°lgi Bekleyenler + zayÄ±f kazanÄ±mlar â•â•â• */}
          <div className="mt-3.5 grid items-start gap-3.5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <Reveal delay={0.1}>
              <section className="sp-kart px-6 py-5" aria-label="Ä°lgi bekleyen Ã¶ÄŸrenciler">
                <h2 className="sp-h2">Ä°lgi Bekleyenler</h2>
                <p className="sp-alt mb-3.5 mt-0.5">
                  Motorun iÅŸaretlediÄŸi Ã¶ÄŸrenciler â€” gerekÃ§esiyle (teÅŸhis dili Ã¶ÄŸretmende aÃ§Ä±ktÄ±r, Ã¶ÄŸrenci asla gÃ¶rmez)
                </p>
                {triajGoster.length === 0 ? (
                  <p className="py-4 text-[13px]" style={{ color: 'var(--metin2)' }}>
                    Åu an ilgi bekleyen Ã¶ÄŸrenci gÃ¶rÃ¼nmÃ¼yor ğŸŒ¿ Motor yeni bir iÅŸaret Ã¼rettiÄŸinde burada belirir.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {triajGoster.map(({ og, rozet, ton, neden }) => (
                      <div key={og.studentId} className="sp-triaj">
                        <div className="sp-avatar" aria-hidden>{basHarf(og.name)}</div>
                        <div className="min-w-0 flex-1">
                          <div className="text-[13.5px] font-semibold">{og.name ?? 'Ä°simsiz Ã¶ÄŸrenci'}</div>
                          <div className="mt-0.5 text-[11.5px]" style={{ color: 'var(--metin2)' }}>{neden}</div>
                        </div>
                        <span className={`sp-rozet ${ton === 'yuksek' ? 'sp-rz-yuksek' : 'sp-rz-notr'}`}>{rozet}</span>
                        <button className="sp-link" onClick={() => { rontgeneGit(og.studentId) }}>
                          RÃ¶ntgeni aÃ§ â†’
                        </button>
                      </div>
                    ))}
                    {triaj.length > triajGoster.length && (
                      <p className="sp-alt pt-1">
                        +{triaj.length - triajGoster.length} Ã¶ÄŸrenci daha â€” tabloda risk sÄ±ralamasÄ±yla gÃ¶rebilirsin.
                      </p>
                    )}
                  </div>
                )}
              </section>
            </Reveal>

            <Reveal delay={0.14}>
              <section className="sp-kart px-6 py-5" aria-label="SÄ±nÄ±fÄ±n zayÄ±f kazanÄ±mlarÄ±">
                <h2 className="sp-h2">SÄ±nÄ±fÄ±n ZayÄ±f KazanÄ±mlarÄ±</h2>
                <p className="sp-alt mb-3 mt-0.5">YaygÄ±nlÄ±ÄŸa gÃ¶re ilk 5 â€” seÃ§ip Ã¶dev derleyebilirsin</p>
                {zayif.loading ? (
                  <div className="h-40 animate-pulse rounded-xl" style={{ background: 'var(--ic)' }} />
                ) : zayif.error ? (
                  <div className="text-[12.5px]" style={{ color: 'var(--metin2)' }}>
                    ZayÄ±f kazanÄ±mlar alÄ±namadÄ±: {zayif.error}
                    <div className="mt-2.5">
                      <button className="sp-btn sp-btn-soluk" onClick={zayif.reload}>Tekrar dene</button>
                    </div>
                  </div>
                ) : kazanimlar.length === 0 ? (
                  <p className="py-3 text-[13px]" style={{ color: 'var(--metin2)' }}>
                    SÄ±nÄ±f geneli zayÄ±flÄ±k Ã¶lÃ§Ã¼lecek kadar veri yok â€” Ã¶ÄŸrenciler Ã§Ã¶zdÃ¼kÃ§e burada belirir.
                  </p>
                ) : (
                  <>
                    <div role="radiogroup" aria-label="Ã–dev derlenecek kazanÄ±m seÃ§imi">
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
                              {k.weakStudentCount}/{k.studentCount} Ã¶ÄŸrenci
                            </span>
                          </button>
                        )
                      })}
                    </div>
                    {havuzBos && (
                      <p className="sp-alt mt-2">
                        SeÃ§ili kazanÄ±m iÃ§in havuzda soru yok â€” Ã¶dev derlenemez, Ã¶nce havuz dolmalÄ±.
                      </p>
                    )}
                    {/* SayfanÄ±n TEK birincil eylemi (FÄ°DAN Â§9.1) */}
                    <button
                      className="sp-btn sp-btn-birincil mt-3.5 w-full"
                      onClick={odevDerle}
                      disabled={!seciliKazanim || havuzBos}
                    >
                      SeÃ§ili kazanÄ±mdan Ã¶dev derle
                    </button>
                  </>
                )}
              </section>
            </Reveal>
          </div>

          {/* â•â•â• Ã–ÄRENCÄ° TABLOSU â€” MAT yÃ¼zey (kaydÄ±rÄ±lan yoÄŸun liste, FÄ°DAN Â§9.2) â•â•â• */}
          <Reveal delay={0.18}>
            <section className="sp-mat mt-3.5 px-6 py-5" aria-label="Ã–ÄŸrenci listesi">
              <h2 className="sp-h2">Ã–ÄŸrenciler</h2>
              <p className="sp-alt mb-3 mt-0.5">
                SatÄ±ra tÄ±kla â†’ Ã–ÄŸrenci RÃ¶ntgeni Â· baÅŸlÄ±ÄŸa tÄ±kla â†’ sÄ±rala Â· gÃ¶rÃ¼nÃ¼m URL'de kalÄ±cÄ± (paylaÅŸÄ±labilir)
              </p>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <input
                  className="sp-ara"
                  value={arama}
                  onChange={(e) => { paramGuncelle({ q: e.target.value || null }) }}
                  placeholder="Ã–ÄŸrenci araâ€¦"
                  aria-label="Ã–ÄŸrenci ara"
                />
                <button
                  className={`sp-cip${filtre === 'tumu' ? ' aktif' : ''}`}
                  aria-pressed={filtre === 'tumu'}
                  onClick={() => { paramGuncelle({ filtre: null }) }}
                >
                  TÃ¼mÃ¼ ({roster.length})
                </button>
                <button
                  className={`sp-cip${filtre === 'pasif' ? ' aktif' : ''}`}
                  aria-pressed={filtre === 'pasif'}
                  onClick={() => { paramGuncelle({ filtre: filtre === 'pasif' ? null : 'pasif' }) }}
                >
                  Pasif â€” son 7 gÃ¼n ({pasifSayi})
                </button>
                <button
                  className={`sp-cip${filtre === 'dusuk' ? ' aktif' : ''}`}
                  aria-pressed={filtre === 'dusuk'}
                  onClick={() => { paramGuncelle({ filtre: filtre === 'dusuk' ? null : 'dusuk' }) }}
                  title={`DoÄŸruluÄŸu %${DUSUK_DOGRULUK_ESIK * 100} altÄ±nda olanlar (son 30 gÃ¼n)`}
                >
                  DÃ¼ÅŸÃ¼k doÄŸruluk ({dusukSayi})
                </button>
                <button className="sp-btn sp-btn-soluk" onClick={csvIndir} disabled={gorunum.length === 0}>
                  â¬‡ CSV
                </button>
              </div>

              {gorunum.length === 0 ? (
                <p className="py-6 text-center text-[13px]" style={{ color: 'var(--metin2)' }}>
                  Bu filtreyle eÅŸleÅŸen Ã¶ÄŸrenci yok.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="sp-tablo">
                    <thead>
                      <tr>
                        {([
                          ['ad', 'Ad'],
                          ['aktiflik', 'Son aktivite'],
                          ['cozulen', 'Ã‡Ã¶zÃ¼len Â· 30 gÃ¼n'],
                          ['dogruluk', 'DoÄŸruluk'],
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
                              {etiket}{aktif ? (yon === 'asc' ? ' â†‘' : ' â†“') : ''}
                            </th>
                          )
                        })}
                        <th scope="col" style={{ cursor: 'default' }} aria-label="Ä°ÅŸlem" />
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
                          aria-label={`${og.name ?? 'Ä°simsiz Ã¶ÄŸrenci'} â€” rÃ¶ntgeni aÃ§`}
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
                              {og.name ?? 'Ä°simsiz'}
                            </span>
                          </td>
                          <td className="sp-soluk">{sonAktifMetin(og.lastActive, simdi)}</td>
                          <td>{og.solved} soru</td>
                          <td>
                            {og.basariOrani == null
                              ? <span className="sp-soluk">Ã¶lÃ§Ã¼m yok</span>
                              : `%${Math.round(og.basariOrani * 100)}`}
                          </td>
                          <td><span className={`sp-rozet ${RISK_TON[og.risk]}`}>{RISK_ETIKET[og.risk]}</span></td>
                          <td onClick={(e) => { e.stopPropagation() }} style={{ cursor: 'default' }}>
                            <button
                              className="sp-link"
                              style={{ color: 'var(--metin3)' }}
                              onClick={() => { setCikarilacak(og) }}
                              aria-label={`${og.name ?? 'Ã–ÄŸrenciyi'} sÄ±nÄ±ftan Ã§Ä±kar`}
                            >
                              Ã‡Ä±kar
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

          {/* â•â•â• ALT: Ã¶dev takibi + Ã¶ÄŸrenci yÃ¶netimi (MAT â€” form/liste yÃ¼zeyi) â•â•â• */}
          <div className={`mt-3.5 grid items-start gap-3.5 ${aktifOdevler.length > 0 || odevler.error ? 'md:grid-cols-2' : ''}`}>
            {/* Aktif Ã¶dev yoksa panel GÄ°ZLENÄ°R (nullâ‰ 0); uÃ§tan hata geldiyse dÃ¼rÃ¼stÃ§e sÃ¶ylenir. */}
            {(aktifOdevler.length > 0 || odevler.error) && (
              <Reveal delay={0.24}>
                <section className="sp-mat px-6 py-5" aria-label="Aktif Ã¶dev takibi">
                  <h2 className="sp-h2">Aktif Ã–dev Takibi</h2>
                  <p className="sp-alt mb-3.5 mt-0.5">Ã–dev geÃ§miÅŸi verisinden tamamlanma oranlarÄ±</p>
                  {odevler.error ? (
                    <div className="text-[12.5px]" style={{ color: 'var(--metin2)' }}>
                      Ã–dev verisi alÄ±namadÄ±: {odevler.error}
                      <div className="mt-2.5">
                        <button className="sp-btn sp-btn-soluk" onClick={odevler.reload}>Tekrar dene</button>
                      </div>
                    </div>
                  ) : (
                    aktifOdevler.map((od) => {
                      const mevcut = odevler.data?.ogrenciSayisi ?? 0
                      const oran = mevcut > 0 ? od.gonderim.toplam / mevcut : 0
                      const baslik = [od.subject, od.topic].filter(Boolean).join(' Â· ') || 'Ã–dev'
                      return (
                        <div key={od.id} className="mb-3.5 last:mb-0">
                          <div className="mb-1.5 flex items-center justify-between gap-2 text-[12.5px]">
                            <b className="min-w-0 truncate font-semibold">{baslik}</b>
                            <span style={{ color: 'var(--metin2)' }}>
                              {od.gonderim.toplam}/{mevcut} tamamladÄ±
                            </span>
                          </div>
                          <div className="sp-cubuk">
                            <i style={{ width: `${Math.round(Math.min(1, oran) * 100)}%` }} />
                          </div>
                          <p className="sp-alt mt-1.5">
                            {od.gonderim.bekleyen > 0
                              ? `HenÃ¼z yapmayan ${od.gonderim.bekleyen} Ã¶ÄŸrenci`
                              : 'Herkes tamamladÄ± ğŸŒ¿'}
                            {od.dueDate ? ` Â· Son tarih: ${tarihMetni(od.dueDate)}` : ''}
                          </p>
                        </div>
                      )
                    })
                  )}
                </section>
              </Reveal>
            )}

            <Reveal delay={0.28}>
              <section className="sp-mat px-6 py-5" aria-label="Ã–ÄŸrenci yÃ¶netimi">
                <h2 className="sp-h2">Ã–ÄŸrenci YÃ¶netimi</h2>
                <p className="sp-alt mb-3.5 mt-0.5">E-postayla ekle Â· Ã§Ä±karma onay diyaloÄŸuyla</p>
                <form className="flex gap-2.5" onSubmit={(e) => { void ogrenciEkle(e) }}>
                  <input
                    className="sp-ara"
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value) }}
                    placeholder="ogrenci@ornek.com"
                    aria-label="Ã–ÄŸrenci e-postasÄ±"
                  />
                  <button className="sp-btn sp-btn-soluk" type="submit" disabled={ekleniyor || !email.trim()}>
                    {ekleniyor ? 'Ekleniyorâ€¦' : 'Ekle'}
                  </button>
                </form>
                {ekleHata && <div className="sp-hata mt-3">âš  {ekleHata}</div>}
                <p className="sp-alt mt-3">
                  Ã–ÄŸrenci Ã§Ä±karmak iÃ§in tablodaki satÄ±rda "Ã‡Ä±kar"a bas â€” onay diyaloÄŸu aÃ§Ä±lÄ±r;
                  kayÄ±tlÄ± veri silinmez, yalnÄ±z sÄ±nÄ±f baÄŸÄ± kalkar.
                </p>
              </section>
            </Reveal>
          </div>
        </>
      )}

      {/* â•â•â• Ã‡IKARMA ONAYI â€” yÄ±kÄ±cÄ± eylem daima Radix Dialog (window.confirm asla) â•â•â• */}
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
              Ã–ÄŸrenciyi sÄ±nÄ±ftan Ã§Ä±kar?
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-[13px] leading-relaxed" style={{ color: 'var(--metin2)' }}>
              {cikarilacak?.name ?? 'Ã–ÄŸrenci'} sÄ±nÄ±ftan Ã§Ä±karÄ±lacak. KayÄ±tlÄ± verisi silinmez â€”
              yalnÄ±z sÄ±nÄ±f baÄŸÄ± kalkar; istediÄŸinde kodla yeniden katÄ±labilir.
            </Dialog.Description>
            <div className="mt-5 flex justify-end gap-2.5">
              <button
                className="sp-btn sp-btn-soluk"
                onClick={() => { setCikarilacak(null) }}
                disabled={cikariliyor}
              >
                VazgeÃ§
              </button>
              <button
                className="sp-btn sp-btn-tehlike"
                onClick={() => { void ogrenciCikar() }}
                disabled={cikariliyor}
              >
                {cikariliyor ? 'Ã‡Ä±karÄ±lÄ±yorâ€¦' : 'Evet, Ã§Ä±kar'}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </Sayfa>
  )
}
