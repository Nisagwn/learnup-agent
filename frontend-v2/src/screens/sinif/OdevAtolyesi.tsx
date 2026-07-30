import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useReducedMotion } from 'framer-motion'
import { toast } from 'sonner'
import { tGet, tPost, useSinifNav } from '../../lib/sinif-kapsam'
import { useAsync } from '../../lib/useAsync'
import { useSinif } from '../../lib/sinif'
import { dersAnahtar, gunEtiketi } from '../../lib/format'
import { NAV_H } from '../../lib/layout'
import { cn } from '../../lib/cn'
import type { IsiHaritasiYaniti } from '../../lib/types.teacher'
import { Icon } from '../../ui'
import { Sayfa } from '../../components/RolGecidi'
import { SubjectName } from '../../components/ui'
import { Sayi } from '../../components/cekirdek'
import { Reveal } from '../../components/fx'
import { MathMarkdown } from '../../components/MathMarkdown'

/**
 * Ã–DEV ATÃ–LYESÄ° â€” havuzdan derle, sÄ±nÄ±fa ya da tek Ã¶ÄŸrenciye gÃ¶nder.
 * GOREV-037: onaylÄ± Ã¶nizleme portu (`docs/design/onizleme/odev-atolyesi.html`, onay 2026-07-23) â€”
 * inline FÄ°DAN `oa-*` deseni (SinifPanosu `sp-*` kalÄ±bÄ±). DAVRANIÅ AYNEN korunmuÅŸtur.
 *
 * âš ï¸ SÄ°HÄ°RBAZ YOK (plandan bilinÃ§li sapma): "Sorular" ve "Ä°nceleme" adÄ±mlarÄ± pratikte
 * aynÄ± ÅŸey â€” filtre kurulunca eÅŸleÅŸenler zaten gÃ¶rÃ¼nÃ¼yor. Havuzun seyrek olduÄŸu
 * (kazanÄ±mlarÄ±n %70'inde soru yok) bir ortamda ayrÄ± bir "seÃ§im" adÄ±mÄ±, kullanÄ±cÄ±yÄ±
 * sÄ±k sÄ±k BOÅ bir ekrana gÃ¶tÃ¼rÃ¼rdÃ¼. Tek sayfa: solda kapsam + eÅŸleÅŸenler, saÄŸda sepet.
 *
 * âš ï¸ LLM YOK: backend havuzdan derler. Yetmezse `bulunan < istenen` gelir ve
 * uyarÄ± olduÄŸu gibi gÃ¶sterilir â€” sayÄ± uydurulmaz.
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

/** GET /teacher/odevler yanÄ±tÄ±nÄ±n bu ekranÄ±n OKUDUÄU kesiti (teacher.routes.ts:534 aynasÄ± â€”
    types.teacher.ts salt-okunur olduÄŸundan ekran-yerel; SinifPanosu `OdevTakipYaniti` emsali). */
type GecmisOdev = {
  id: string
  subject: string | null
  topic: string | null
  soruSayisi: number
  status: string
  createdAt: string
  gonderim: { toplam: number; ortalamaYuzde: number | null; bekleyen: number }
}
type GecmisYaniti = { assignments: GecmisOdev[]; ogrenciSayisi: number; total: number }

/**
 * TELÄ°F KARARI (2026-07-22): Ã§Ä±kmÄ±ÅŸ (Ã–SYM) sorular hiÃ§bir kullanÄ±cÄ± yÃ¼zÃ¼ne servis edilmez.
 * Ã–dev derlemesi YALNIZ AI havuzundan yapÄ±lÄ±r â€” kaynak seÃ§ici arayÃ¼zden kaldÄ±rÄ±ldÄ± (GOREV-025).
 * Sunucu tarafÄ± reddi GOREV-016'nÄ±n iÅŸi; buradaki istekler her zaman kaynak:'ai' gÃ¶nderir.
 */
const KAYNAK_AI = 'ai' as const

const ZORLUK: Array<['', string]> | Array<[string, string]> = [
  ['', 'Hepsi'],
  ['kolay', 'Kolay'],
  ['orta', 'Orta'],
  ['zor', 'Zor'],
]

/** '2026-07-19' â†’ 'dÃ¼n' / '4 gÃ¼n Ã¶nce' / '2 hafta Ã¶nce'; 30+ gÃ¼nde kÄ±sa tarih (gerÃ§ek tarih hesabÄ±). */
function goreceliGun(iso: string, simdi: number): string {
  const g = Math.max(0, Math.floor((simdi - +new Date(iso)) / 86_400_000))
  if (g === 0) return 'bugÃ¼n'
  if (g === 1) return 'dÃ¼n'
  if (g < 7) return `${g} gÃ¼n Ã¶nce`
  if (g < 30) {
    const h = Math.floor(g / 7)
    return h === 1 ? '1 hafta Ã¶nce' : `${h} hafta Ã¶nce`
  }
  return gunEtiketi(iso.slice(0, 10))
}

/* Ekran stilleri â€” Ã¶nizleme CSS'inin FÄ°DAN deÄŸiÅŸkenli karÅŸÄ±lÄ±ÄŸÄ± (oa- Ã¶neki Ã§akÄ±ÅŸmayÄ± Ã¶nler).
   Animasyonlar hareket-azalt kapÄ±lÄ±; kart giriÅŸleri Reveal (useReducedMotion).
   TÄ±k hedefleri â‰¥44px (FÄ°DAN Â§9.10) â€” Ã¶nizlemedeki 30-38px mini/segment dolgularÄ± bilinÃ§li bÃ¼yÃ¼tÃ¼ldÃ¼. */
const STIL = `
  .oa-kart { background: var(--cam); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
    border: 1px solid var(--cam-kenar); border-radius: 20px; box-shadow: var(--golge); }
  .oa-monoduz { font-family: 'JetBrains Mono', monospace; font-size: 10.5px; color: var(--metin3); }
  .oa-h1 { font-family: Outfit, sans-serif; font-weight: 700; font-size: 20px; color: var(--metin1); }
  .oa-h3 { font-family: Outfit, sans-serif; font-weight: 700; font-size: 14px; color: var(--metin1); }
  .oa-alt { font-size: 12px; color: var(--metin3); margin-top: 3px; }
  .oa-nokta { width: 8px; height: 8px; border-radius: 50%; background: var(--yaprak); display: inline-block; }
  .oa-etiket { display: block; font-size: 10.5px; font-weight: 600; letter-spacing: .12em;
    text-transform: uppercase; color: var(--metin3); margin-bottom: 8px; }
  .oa-btn { font-family: Inter, sans-serif; font-weight: 600; font-size: 12.5px; border-radius: 12px;
    cursor: pointer; border: none; min-height: 44px; padding: 0 16px;
    transition: filter .2s, background .2s, color .2s, border-color .2s; }
  .oa-btn:disabled { opacity: .45; cursor: not-allowed; box-shadow: none; }
  .oa-btn-birincil { background: var(--cta); color: #fff; box-shadow: 0 6px 16px color-mix(in srgb, var(--cta) 25%, transparent);
    display: inline-flex; align-items: center; justify-content: center; gap: 7px; }
  .oa-btn-birincil:hover:not(:disabled) { filter: brightness(1.12); box-shadow: var(--parilti); }
  .oa-btn-soluk { background: var(--v0); color: var(--metin2); border: 1px solid var(--cam-kenar); }
  .oa-btn-soluk:hover:not(:disabled) { color: var(--metin1); border-color: var(--adacayi); }
  .oa-btn-mini { background: var(--v1); color: var(--vurgu); font-size: 11px; border-radius: 10px; padding: 0 12px; }
  .oa-btn-mini:hover:not(:disabled) { background: var(--v2); }
  .oa-cip { font-family: Inter, sans-serif; font-size: 12px; font-weight: 600; color: var(--metin2);
    background: transparent; border: 1.5px solid var(--cam-kenar); border-radius: 12px; min-height: 44px;
    padding: 0 14px; cursor: pointer; transition: color .2s, background .2s, border-color .2s; }
  .oa-cip:hover { color: var(--metin1); border-color: var(--adacayi); }
  .oa-cip.aktif { color: var(--vurgu); background: var(--v1); border-color: var(--adacayi); }
  .oa-segment { display: inline-flex; background: var(--v0); border: 1px solid var(--cam-kenar);
    border-radius: 12px; padding: 3px; gap: 2px; }
  .oa-segment button { font-family: Inter, sans-serif; font-size: 12px; font-weight: 600; color: var(--metin3);
    background: transparent; border: none; border-radius: 9px; min-height: 44px; padding: 0 13px; cursor: pointer;
    transition: background .2s, color .2s; }
  .oa-segment button.aktif { background: var(--mat); color: var(--vurgu); box-shadow: 0 2px 8px rgba(24,49,33,.08); }
  .oa-sayi-girdi { width: 76px; font-family: 'JetBrains Mono', monospace; font-size: 13px; color: var(--metin1);
    background: transparent; border: 1.5px solid var(--cam-kenar); border-radius: 10px; min-height: 44px;
    padding: 0 12px; outline: none; transition: border-color .2s; }
  .oa-sayi-girdi:focus { border-color: var(--yaprak); }
  .oa-kazanim-cip { display: inline-flex; align-items: center; gap: 7px; font-size: 11.5px; font-weight: 600;
    color: var(--vurgu); background: var(--v1); padding: 6px 12px; border-radius: 11px; }
  .oa-kazanim-kaldir { color: var(--metin3); background: none; border: none; cursor: pointer;
    font-family: Inter, sans-serif; font-size: 11px; font-weight: 600; padding: 12px 8px; }
  .oa-kazanim-kaldir:hover { color: var(--metin1); }
  .oa-ara { display: flex; align-items: center; gap: 8px; border: 1.5px solid var(--cam-kenar);
    border-radius: 12px; min-height: 44px; padding: 0 13px; margin-bottom: 12px; color: var(--metin3);
    transition: border-color .2s; }
  .oa-ara:focus-within { border-color: var(--yaprak); }
  .oa-ara input { flex: 1; border: none; background: transparent; outline: none;
    font-family: Inter, sans-serif; font-size: 13px; color: var(--metin1); min-height: 42px; }
  .oa-ara input::placeholder { color: var(--metin3); }
  .oa-ara-temizle { background: none; border: none; cursor: pointer; color: var(--metin3); padding: 12px 6px; }
  .oa-ara-temizle:hover { color: var(--metin1); }
  .oa-soru { width: 100%; text-align: left; background: transparent; border: 1.5px solid var(--cam-kenar);
    border-radius: 14px; padding: 11px 13px; cursor: pointer; font-family: Inter, sans-serif;
    transition: border-color .18s, background .18s; }
  .oa-soru:hover { border-color: var(--adacayi); }
  .oa-soru.secili { border-color: var(--yaprak); background: color-mix(in srgb, var(--yaprak) 7%, transparent); }
  .oa-soru .isaret { color: var(--yaprak); font-weight: 800; font-size: 12px; }
  .oa-rozet { font-size: 10px; font-weight: 700; padding: 2.5px 9px; border-radius: 9px; white-space: nowrap; }
  .oa-rz-ai { background: var(--v1); color: var(--vurgu); }
  .oa-rz-zorluk { background: var(--v0); color: var(--metin2); border: 1px solid var(--cam-kenar); }
  .oa-rz-kalite { background: color-mix(in srgb, var(--dogru) 13%, transparent); color: var(--dogru); }
  .oa-sepet-ic { border: 1.5px solid var(--adacayi); border-radius: 20px; background: var(--cam);
    backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); box-shadow: var(--golge);
    padding: 20px 22px; }
  .oa-secim { border: 1.5px solid var(--cam-kenar); border-radius: 12px; width: 100%; background: transparent;
    font-family: Inter, sans-serif; font-size: 13px; color: var(--metin1); min-height: 44px; padding: 0 12px;
    outline: none; margin-bottom: 14px; transition: border-color .2s; }
  .oa-secim:focus { border-color: var(--yaprak); }
  .oa-ozet-satir { display: flex; justify-content: space-between; gap: 8px; font-family: 'JetBrains Mono', monospace;
    font-size: 11px; color: var(--metin3); padding: 3.5px 0; }
  .oa-ozet-satir b { color: var(--metin2); font-weight: 500; min-width: 0; overflow: hidden;
    text-overflow: ellipsis; white-space: nowrap; }
  .oa-buyuk { margin: 14px 0 4px; text-align: center; border-radius: 14px; padding: 12px;
    border: 1.5px solid color-mix(in srgb, var(--dogru) 30%, transparent);
    background: color-mix(in srgb, var(--dogru) 5%, transparent); }
  .oa-buyuk.eksik { border-color: color-mix(in srgb, var(--uyari) 35%, transparent);
    background: color-mix(in srgb, var(--uyari) 6%, transparent); }
  .oa-buyuk.notr { border-color: var(--cam-kenar); background: transparent; }
  .oa-buyuk .n { font-family: Outfit, sans-serif; font-size: 30px; font-weight: 800; line-height: 1; color: var(--metin1); }
  .oa-buyuk .a { font-size: 11px; color: var(--metin3); margin-top: 4px; display: block; }
  .oa-eksik-not { font-size: 11px; line-height: 1.55; color: var(--uyari); margin: 8px 0 2px; }
  .oa-odev-satir { display: flex; align-items: center; gap: 12px; padding: 8px 0;
    border-bottom: 1px solid var(--cam-kenar); font-size: 12.5px; flex-wrap: wrap; color: var(--metin1); }
  .oa-odev-satir:last-child { border-bottom: none; }
  .oa-odev-satir b { font-weight: 600; min-width: 150px; }
  .oa-odev-meta { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--metin3); }
  .oa-durum { font-size: 10.5px; font-weight: 700; padding: 2.5px 10px; border-radius: 9px; white-space: nowrap; }
  .oa-durum-acik { background: var(--v1); color: var(--vurgu); }
  .oa-durum-kapandi { background: var(--v0); color: var(--metin3); }
  .oa-tamamlama { flex: 1; min-width: 120px; display: flex; align-items: center; gap: 8px; }
  .oa-ray { flex: 1; height: 10px; border-radius: 5px; background: var(--v0); overflow: hidden; }
  .oa-ray i { display: block; height: 100%; border-radius: 5px;
    background: linear-gradient(90deg, var(--adacayi), var(--yaprak)); }
  .oa-hata { font-size: 12px; color: var(--yanlis); background: color-mix(in srgb, var(--yanlis) 9%, transparent);
    border: 1px solid color-mix(in srgb, var(--yanlis) 25%, transparent); border-radius: 12px;
    padding: 10px 14px; line-height: 1.5; }
  .oa-bos { padding: 24px 0; text-align: center; font-size: 12.5px; color: var(--metin3); line-height: 1.6; }
  .oa-iskelet { background: var(--v0); border-radius: 12px; }
  @media (prefers-reduced-motion: no-preference) {
    .oa-soru:hover { transform: translateY(-1px); }
    .oa-soru { transition: border-color .18s, background .18s, transform .18s; }
    .oa-iskelet { animation: oa-nabiz 1.6s ease-in-out infinite; }
    @keyframes oa-nabiz { 0%, 100% { opacity: 1; } 50% { opacity: .45; } }
    .oa-ray i { transform-origin: left; animation: oa-dolx .7s cubic-bezier(.2,.7,.3,1) backwards; }
    @keyframes oa-dolx { from { transform: scaleX(0); } }
  }
`

export function OdevAtolyesi() {
  const nav = useSinifNav()
  const [params] = useSearchParams()
  const { roster } = useSinif()
  const azalt = useReducedMotion()

  // Derin baÄŸlantÄ± Ã¶n-dolgusu: rÃ¶ntgendeki "Set gÃ¶nder" buraya bÃ¶yle gelir.
  const onDolguOgrenci = params.get('ogrenci')
  const onDolguKazanim = params.get('kazanim')
  const onDolguDers = params.get('ders')

  const [ders, setDers] = useState<string | null>(onDolguDers)
  const [zorluk, setZorluk] = useState('')
  const [adet, setAdet] = useState(10)
  const [hedef, setHedef] = useState<string>(onDolguOgrenci ?? 'sinif')
  const [yayinlaniyor, setYayinlaniyor] = useState(false)
  const [ara, setAra] = useState('')
  const [araGecikmeli, setAraGecikmeli] = useState('')
  const [sayfa, setSayfa] = useState(0)
  /** Elle seÃ§im. BoÅŸsa filtre + rastgele Ã¶rnekleme; doluysa TAM OLARAK bunlar gider. */
  const [secili, setSecili] = useState<string[]>([])
  // "Åimdi" mount'ta bir kez: gÃ¶reli sÃ¼re metinleri render'lar arasÄ±nda titremesin (sp deseni).
  const [simdi] = useState(() => Date.now())

  // AramayÄ± geciktir: her tuÅŸta havuza gitmek geniÅŸ havuzda hem yavaÅŸ hem gereksiz.
  useEffect(() => {
    const t = setTimeout(() => { setAraGecikmeli(ara.trim()); setSayfa(0) }, 350)
    return () => clearTimeout(t)
  }, [ara])

  const kazanimId = onDolguKazanim ? Number(onDolguKazanim) : null

  // Ders listesi sÄ±nÄ±fÄ±n Ä±sÄ± haritasÄ±ndan: Ã¶ÄŸretmene "sÄ±nÄ±fÄ±nÄ±n Ã§alÄ±ÅŸtÄ±ÄŸÄ± dersler"
  // gÃ¶sterilir, mÃ¼fredatÄ±n tamamÄ± deÄŸil.
  const isi = useAsync<IsiHaritasiYaniti>(() => tGet('/teacher/sinif/isi-haritasi'), [])
  const dersler = isi.data?.subjects ?? []

  // GeÃ§miÅŸ Ã–devler (GOREV-037) â€” GERÃ‡EK uÃ§, mock yok: GET /teacher/odevler (teacher.routes.ts:534).
  const gecmis = useAsync<GecmisYaniti>(() => tGet('/teacher/odevler'), [])

  // âš ï¸ BaÄŸÄ±mlÄ±lÄ±klar Ä°LKEL: useAsync deps'i effect dizisine yayar (useAsync.ts:19),
  // taze nesne geÃ§mek sonsuz refetch olurdu.
  const SAYFA_BOY = 20
  const havuz = useAsync<{ sorular: HavuzSorusu[]; total: number }>(
    () =>
      tGet('/teacher/soru-havuzu', {
        kaynak: KAYNAK_AI,
        subject: ders ?? '',
        kazanimId: kazanimId ?? '',
        difficulty: zorluk,
        q: araGecikmeli,
        limit: SAYFA_BOY,
        offset: sayfa * SAYFA_BOY,
      }),
    [ders, kazanimId, zorluk, araGecikmeli, sayfa],
  )

  // Savunma hattÄ±: sunucu reddi (GOREV-016) inene dek yanÄ±t yine de sÃ¼zÃ¼lÃ¼r â€”
  // sunucu yanlÄ±ÅŸlÄ±kla Ã§Ä±kmÄ±ÅŸ sÄ±zdÄ±rsa bile Ã¶ÄŸretmen yÃ¼zÃ¼ne Ã§Ä±kmaz.
  const eslesen = (havuz.data?.sorular ?? []).filter((q) => q.kaynak !== 'osym')
  // Havuzda kaÃ§ soru VAR (bu sayfada kaÃ§ tane deÄŸil) â€” geniÅŸ havuzda ayrÄ±m kritik.
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

  // Ã–n-dolgu dersi Ä±sÄ± haritasÄ±nda yoksa kullanÄ±cÄ±yÄ± yanÄ±ltmayalÄ±m.
  useEffect(() => {
    if (onDolguDers && dersler.length && !dersler.includes(onDolguDers)) setDers(onDolguDers)
  }, [onDolguDers, dersler])

  const yayinla = async (): Promise<void> => {
    setYayinlaniyor(true)
    try {
      if (hedefOgrenci) {
        const y = await tPost('/teacher/hedefli-odev', {
          studentId: hedefOgrenci.studentId,
          soruSayisi: adet,
          kaynak: KAYNAK_AI,
          ...(kazanimId ? { kazanimIds: [kazanimId] } : {}),
        })
        toast.success(`${hedefOgrenci.name ?? 'Ã–ÄŸrenciye'} ${y.bulunan} soruluk set gÃ¶nderildi`)
        if (y.uyari) toast.warning(y.uyari)
      } else {
        const y = await tPost('/teacher/odev', {
          subject: ders ?? undefined,
          kaynak: KAYNAK_AI,
          soruSayisi: adet,
          ...(kazanimId ? { kazanimId } : {}),
          ...(zorluk ? { difficulty: zorluk } : {}),
          // Elle seÃ§im varsa filtre yok sayÄ±lÄ±r â€” backend tam olarak bunlarÄ± alÄ±r.
          ...(secili.length ? { questionIds: secili } : {}),
        })
        toast.success(`Ã–dev yayÄ±nlandÄ± â€” ${y.bulunan} soru sÄ±nÄ±fa gitti`)
        if (y.uyari) toast.warning(y.uyari)
      }
      nav('/sinif')
    } catch (e: any) {
      toast.error(e?.message ?? 'YayÄ±nlanamadÄ±')
    } finally {
      setYayinlaniyor(false)
    }
  }

  /**
   * "Åablon olarak kopyala" (EKRAN-HARITASI [HAZIR]): formu eski Ã¶devin deÄŸerleriyle Ã¶n-doldurur;
   * yayÄ±n AYNI derleme ucuyla yapÄ±lÄ±r â€” yeni uÃ§ yok. UÃ§ yanÄ±tÄ±nda `difficulty` YOK â†’
   * zorluk 'Hepsi'ye dÃ¶ner (bilinmeyen uydurulmaz). Derin-baÄŸ kazanÄ±mÄ± ÅŸablona sÄ±zmasÄ±n
   * diye URL temizlenir; elle seÃ§im ve sayfa sÄ±fÄ±rlanÄ±r.
   */
  const sablonKopyala = (o: GecmisOdev): void => {
    if (o.subject) setDers(o.subject)
    if (o.soruSayisi > 0) setAdet(Math.min(40, Math.max(1, o.soruSayisi)))
    setZorluk('')
    setSecili([])
    setSayfa(0)
    setHedef('sinif')
    if (kazanimId || onDolguOgrenci || onDolguDers) nav('/sinif/odev', { replace: true })
    window.scrollTo({ top: 0, behavior: azalt ? 'auto' : 'smooth' })
    toast.success('Åablon yÃ¼klendi â€” yayÄ±nlamadan Ã¶nce gÃ¶zden geÃ§ir')
  }

  const kapsamVar = Boolean(ders || kazanimId)

  return (
    <Sayfa>
      <style>{STIL}</style>

      {/* â•â•â• BAÅLIK â€” havuz-durum ÅŸeridi gerÃ§ek `total` â•â•â• */}
      <Reveal>
        <section className="oa-kart flex flex-wrap items-center gap-3.5 px-[22px] py-4">
          <div>
            <h1 className="oa-h1">Ã–dev AtÃ¶lyesi</h1>
            <p className="oa-alt">AI havuzundan soru derle, sÄ±nÄ±fa ya da tek Ã¶ÄŸrenciye gÃ¶nder.</p>
          </div>
          <div className="oa-monoduz ml-auto flex items-center gap-2">
            <i className="oa-nokta" aria-hidden />
            {havuz.loading ? 'havuz taranÄ±yorâ€¦' : `${havuzToplam} doÄŸrulanmÄ±ÅŸ soru`}
          </div>
        </section>
      </Reveal>

      <div className="mt-3.5 grid items-start gap-3.5 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
        {/* â”€â”€ SOL: kapsam + havuz â”€â”€ */}
        <div className="min-w-0 space-y-3.5">
          <Reveal delay={0.06}>
            <section className="oa-kart px-[22px] py-[18px]">
              <h3 className="oa-h3 mb-3">Kapsam</h3>

              <span className="oa-etiket">Ders</span>
              <div className="flex flex-wrap gap-2">
                {isi.loading ? (
                  <div className="oa-iskelet h-11 w-64" />
                ) : dersler.length === 0 ? (
                  <p className="text-[12.5px]" style={{ color: 'var(--metin3)' }}>SÄ±nÄ±fÄ±n henÃ¼z Ã§alÄ±ÅŸtÄ±ÄŸÄ± ders yok.</p>
                ) : (
                  dersler.map((d) => (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={ders === d}
                      onClick={() => setDers(ders === d ? null : d)}
                      className={cn('oa-cip', ders === d && 'aktif')}
                    >
                      <SubjectName subject={d} anahtar={dersAnahtar(d)} className="!text-[12px]" />
                    </button>
                  ))
                )}
              </div>

              <div className="mt-4 flex flex-wrap items-end gap-5">
                <div>
                  <span className="oa-etiket">Zorluk</span>
                  <div className="oa-segment" role="group" aria-label="Zorluk filtresi">
                    {(ZORLUK as Array<[string, string]>).map(([deger, etiket]) => (
                      <button
                        key={etiket}
                        type="button"
                        aria-pressed={zorluk === deger}
                        onClick={() => setZorluk(deger)}
                        className={zorluk === deger ? 'aktif' : undefined}
                      >
                        {etiket}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label htmlFor="adet" className="oa-etiket">Soru sayÄ±sÄ±</label>
                  <input
                    id="adet"
                    type="number"
                    min={1}
                    max={40}
                    value={adet}
                    onChange={(e) => setAdet(Math.min(40, Math.max(1, Number(e.target.value) || 1)))}
                    className="oa-sayi-girdi"
                  />
                </div>
              </div>

              {kazanimId && (
                <div className="mt-4 flex items-center gap-1.5">
                  <span className="oa-kazanim-cip">ğŸ¯ Tek kazanÄ±ma odaklÄ± (#{kazanimId})</span>
                  <button
                    type="button"
                    onClick={() => nav('/sinif/odev', { replace: true })}
                    className="oa-kazanim-kaldir"
                  >
                    kaldÄ±r âœ•
                  </button>
                </div>
              )}
            </section>
          </Reveal>

          <Reveal delay={0.12}>
            <section className="oa-kart px-[22px] py-[18px]">
              <div className="mb-3 flex items-center gap-2">
                <h3 className="oa-h3">Havuz</h3>
                <span className="oa-monoduz ml-auto">
                  {havuzToplam > 0 &&
                    `${sayfa * SAYFA_BOY + 1}â€“${sayfa * SAYFA_BOY + eslesen.length} / ${havuzToplam} eÅŸleÅŸen`}
                </span>
              </div>

              {/* Arama â€” geniÅŸ havuzda filtre tek baÅŸÄ±na yetmez */}
              <div className="oa-ara">
                <Icon name="search" size={15} color="currentColor" style={{ opacity: 0.6 }} />
                <input
                  value={ara}
                  onChange={(e) => setAra(e.target.value)}
                  placeholder="Soru metninde araâ€¦"
                  aria-label="Soru metninde ara"
                />
                {ara && (
                  <button type="button" onClick={() => setAra('')} aria-label="AramayÄ± temizle" className="oa-ara-temizle">
                    <Icon name="close" size={14} color="currentColor" />
                  </button>
                )}
              </div>

              {havuz.loading ? (
                <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="oa-iskelet h-16" />)}</div>
              ) : !kapsamVar ? (
                <p className="oa-bos">BaÅŸlamak iÃ§in bir ders seÃ§.</p>
              ) : eslesen.length === 0 ? (
                <div className="oa-bos">
                  <p className="font-semibold" style={{ color: 'var(--metin2)' }}>
                    {araGecikmeli ? 'Aramaya uyan soru yok' : 'Bu kriterlere uyan soru yok'}
                  </p>
                  <p className="mt-1">
                    {araGecikmeli
                      ? 'Arama terimini kÄ±saltmayÄ± dene.'
                      : "Havuz bu kazanÄ±mda henÃ¼z boÅŸ. Zorluk filtresini 'Hepsi' yap ya da baÅŸka ders dene."}
                  </p>
                </div>
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
                            className={cn('oa-soru', isaretli && 'secili')}
                          >
                            {/* KELÄ°MELÄ° rozetler + âœ“ iÅŸaret: seÃ§im asla yalnÄ±z renkle anlatÄ±lmaz */}
                            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                              {isaretli && <span className="isaret" aria-hidden>âœ“</span>}
                              <span className="oa-rozet oa-rz-ai">AI</span>
                              {q.difficulty && <span className="oa-rozet oa-rz-zorluk">{q.difficulty}</span>}
                              {q.quality != null && <span className="oa-rozet oa-rz-kalite">kalite {q.quality}</span>}
                            </div>
                            <div className="line-clamp-3 text-[12.5px] leading-relaxed" style={{ color: 'var(--metin2)' }}>
                              <MathMarkdown>{q.questionText}</MathMarkdown>
                            </div>
                          </button>
                        </li>
                      )
                    })}
                  </ul>

                  {sonSayfa > 0 && (
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        className="oa-btn oa-btn-soluk"
                        disabled={sayfa === 0}
                        onClick={() => setSayfa((s) => Math.max(0, s - 1))}
                      >
                        â† Ã–nceki
                      </button>
                      <span className="oa-monoduz">sayfa {sayfa + 1} / {sonSayfa + 1}</span>
                      <button
                        type="button"
                        className="oa-btn oa-btn-soluk"
                        disabled={sayfa >= sonSayfa}
                        onClick={() => setSayfa((s) => Math.min(sonSayfa, s + 1))}
                      >
                        Sonraki â†’
                      </button>
                    </div>
                  )}
                </>
              )}
            </section>
          </Reveal>
        </div>

        {/* â”€â”€ SAÄ: yapÄ±ÅŸkan sepet â€” sayfanÄ±n TEK birincil eylemi burada â”€â”€ */}
        <div className="min-w-0">
          <Reveal delay={0.1}>
            <div className="sticky" style={{ top: NAV_H + 24 }}>
              <section className="oa-sepet-ic">
                <h3 className="oa-h3 mb-3.5">Set Ã–zeti</h3>

                <label htmlFor="oa-hedef" className="oa-etiket">Kime</label>
                <select
                  id="oa-hedef"
                  value={hedef}
                  onChange={(e) => setHedef(e.target.value)}
                  aria-label="Ã–devin hedefi"
                  className="oa-secim"
                >
                  <option value="sinif">TÃ¼m sÄ±nÄ±f ({roster.length} Ã¶ÄŸrenci)</option>
                  {roster.map((o) => (
                    <option key={o.studentId} value={o.studentId}>
                      {o.name ?? 'Ä°simsiz Ã¶ÄŸrenci'}
                    </option>
                  ))}
                </select>

                <div>
                  <div className="oa-ozet-satir"><span>Ders</span><b>{ders ?? 'â€”'}</b></div>
                  {/* TELÄ°F: kaynak seÃ§ici YOK â€” sabit satÄ±r; her istek kaynak:'ai' gÃ¶nderir */}
                  <div className="oa-ozet-satir"><span>Kaynak</span><b>AI havuzu</b></div>
                  <div className="oa-ozet-satir"><span>Zorluk</span><b>{zorluk || 'Hepsi'}</b></div>
                  <div className="oa-ozet-satir">
                    <span>SeÃ§im</span><b>{secili.length ? `${secili.length} soru elle` : `${adet} soru rastgele`}</b>
                  </div>
                  <div className="oa-ozet-satir"><span>Havuzda</span><b>{havuzToplam} soru</b></div>
                </div>

                {secili.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSecili([])}
                    className="oa-btn oa-btn-mini mt-2 w-full"
                  >
                    SeÃ§imi temizle â€” filtreye dÃ¶n
                  </button>
                )}

                {/* Rakamlar filtre deÄŸiÅŸtikÃ§e YUVARLANIR (NumberFlow) â€” bu ekranÄ±n
                    en yÃ¼ksek kaldÄ±raÃ§lÄ± mikro-etkileÅŸimi. */}
                <div className={cn('oa-buyuk', !kapsamVar ? 'notr' : !yeterli && 'eksik')}>
                  <span className="n"><Sayi value={gonderilecek} /></span>
                  <span className="a">
                    {!kapsamVar
                      ? 'ders seÃ§ilmedi'
                      : secili.length > 0
                        ? 'soru gidecek â€” elle seÃ§ildi'
                        : yeterli
                          ? 'soru gidecek'
                          : `soru gidecek Â· ${adet} istendi`}
                  </span>
                </div>

                {/* Eksikse ÅÄ°MDÄ°DEN sÃ¶yle â€” yayÄ±nladÄ±ktan sonra sÃ¼rpriz olmasÄ±n. */}
                {kapsamVar && !yeterli && havuzToplam > 0 && (
                  <p className="oa-eksik-not">
                    Havuzda bu kriterlerde {havuzToplam} soru var; set o kadarÄ±yla
                    oluÅŸacak. <b>Soru uydurulmaz â€” eksik olduÄŸu gibi gÃ¶rÃ¼nÃ¼r.</b>
                  </p>
                )}

                <button
                  type="button"
                  className="oa-btn oa-btn-birincil mt-3.5 w-full"
                  disabled={yayinlaniyor || !kapsamVar || gonderilecek === 0}
                  onClick={() => { void yayinla() }}
                >
                  <Icon name="send" size={15} color="currentColor" />
                  {yayinlaniyor ? 'YayÄ±nlanÄ±yorâ€¦' : hedefOgrenci ? 'Sete gÃ¶nder' : 'SÄ±nÄ±fa yayÄ±nla'}
                </button>

                {hedefOgrenci && (
                  <p className="mt-2.5 text-center text-[11px] leading-relaxed" style={{ color: 'var(--metin3)' }}>
                    Hedefli set, <strong style={{ color: 'var(--metin2)' }}>{hedefOgrenci.name}</strong> iÃ§in
                    zayÄ±f kazanÄ±mlarÄ±ndan derlenir.
                  </p>
                )}
              </section>
            </div>
          </Reveal>
        </div>
      </div>

      {/* â•â•â• GEÃ‡MÄ°Å Ã–DEVLER (GOREV-037) â€” gerÃ§ek uÃ§; sayÄ± uydurulmaz â•â•â• */}
      <Reveal delay={0.18}>
        <section className="oa-kart mt-3.5 px-[22px] py-[18px]">
          <div className="mb-2 flex items-center gap-2">
            <h3 className="oa-h3">GeÃ§miÅŸ Ã–devler</h3>
            <span className="oa-monoduz ml-auto">
              {/* Ã–nizlemedeki "son 30 gÃ¼n" ibaresi uÃ§ gerÃ§eÄŸiyle eÅŸleÅŸmiyor (uÃ§ son kayÄ±tlarÄ± dÃ¶ner) â€”
                  yerine GERÃ‡EK toplam yazÄ±lÄ±r. */}
              {gecmis.data ? `${gecmis.data.total} Ã¶dev` : ''}
            </span>
          </div>

          {gecmis.loading ? (
            <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="oa-iskelet h-12" />)}</div>
          ) : gecmis.error ? (
            <div className="oa-hata">
              GeÃ§miÅŸ Ã¶devler yÃ¼klenemedi: {gecmis.error}{' '}
              <button type="button" className="oa-btn oa-btn-mini ml-2" onClick={gecmis.reload}>Tekrar dene</button>
            </div>
          ) : (gecmis.data?.assignments.length ?? 0) === 0 ? (
            <p className="oa-bos">HenÃ¼z Ã¶dev gÃ¶ndermedin â€” ilk seti yukarÄ±dan derle.</p>
          ) : (
            gecmis.data!.assignments.map((o) => {
              const acik = o.status === 'active'
              const ogrenciSayisi = gecmis.data!.ogrenciSayisi
              const baslikMetni = [o.subject, o.topic].filter(Boolean).join(' Â· ') || 'Ã–dev'
              return (
                <div key={o.id} className="oa-odev-satir">
                  <b>{baslikMetni}</b>
                  <span className="oa-odev-meta">{o.soruSayisi} soru Â· {goreceliGun(o.createdAt, simdi)}</span>
                  {/* KELÄ°MELÄ° durum â€” renk tek baÅŸÄ±na bilgi taÅŸÄ±maz */}
                  <span className={cn('oa-durum', acik ? 'oa-durum-acik' : 'oa-durum-kapandi')}>
                    {acik ? 'aÃ§Ä±k' : 'kapandÄ±'}
                  </span>
                  {/* Tamamlanma = gÃ¶nderim/Ã¶ÄŸrenci (uÃ§ verisi). Ã–ÄŸrenci sayÄ±sÄ± 0 ise Ã§ubuk GÄ°ZLENÄ°R â€” pay uydurulmaz. */}
                  {ogrenciSayisi > 0 && (
                    <div className="oa-tamamlama">
                      <div className="oa-ray" aria-hidden>
                        <i style={{ width: `${Math.min(100, Math.round((o.gonderim.toplam / ogrenciSayisi) * 100))}%` }} />
                      </div>
                      <span className="oa-odev-meta" style={{ width: 52, textAlign: 'right' }}>
                        {o.gonderim.toplam}/{ogrenciSayisi}
                      </span>
                    </div>
                  )}
                  <button type="button" className="oa-btn oa-btn-mini" onClick={() => sablonKopyala(o)}>
                    Åablon olarak kopyala
                  </button>
                </div>
              )
            })
          )}
        </section>
      </Reveal>

      {/* SÄ±nÄ±f boÅŸ â€” FÄ°DAN filiz gÃ¶rseli (Lighthouse emekli) + tek kÃ¶prÃ¼: SÄ±nÄ±f Panosu */}
      {roster.length === 0 && (
        <Reveal delay={0.24}>
          <section className="oa-kart mx-auto mt-8 max-w-md px-8 py-8 text-center">
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" aria-hidden className="mx-auto mb-3">
              <path d="M12 21V9" stroke="var(--vurgu)" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M12 12C12 8 9 5 4 5c0 5 3 8 8 8" fill="var(--adacayi)" />
              <path d="M12 9c0-3.5 2.5-6 7-6 0 4.5-2.5 7-7 7" fill="var(--yaprak)" />
            </svg>
            <h3 className="oa-h3">SÄ±nÄ±fÄ±nda henÃ¼z Ã¶ÄŸrenci yok</h3>
            <p className="oa-alt mx-auto mt-1.5 max-w-[320px] leading-relaxed">
              Ã–dev gÃ¶nderebilmek iÃ§in Ã¶nce sÄ±nÄ±f kodunu paylaÅŸ ya da e-postayla Ã¶ÄŸrenci ekle.
            </p>
            <button type="button" className="oa-btn oa-btn-soluk mt-4" onClick={() => nav('/sinif')}>
              SÄ±nÄ±f Panosu'na git
            </button>
          </section>
        </Reveal>
      )}
    </Sayfa>
  )
}
