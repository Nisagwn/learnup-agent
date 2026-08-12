import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useReducedMotion } from 'framer-motion'
import { toast } from 'sonner'
import * as Dialog from '@radix-ui/react-dialog'
import { tDelete, tGet, tPatch, tPost, useSinifNav } from '../../lib/sinif-kapsam'
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
 * ÖDEV ATÖLYESİ — havuzdan derle, sınıfa ya da tek öğrenciye gönder.
 * GOREV-037: onaylı önizleme portu (`docs/design/onizleme/odev-atolyesi.html`, onay 2026-07-23) —
 * inline FİDAN `oa-*` deseni (SinifPanosu `sp-*` kalıbı). DAVRANIŞ AYNEN korunmuştur.
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

/** GET /teacher/odevler yanıtının bu ekranın OKUDUĞU kesiti (teacher.routes.ts:534 aynası —
    types.teacher.ts salt-okunur olduğundan ekran-yerel; SinifPanosu `OdevTakipYaniti` emsali). */
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
 * TELİF KARARI (2026-07-22): çıkmış (ÖSYM) sorular hiçbir kullanıcı yüzüne servis edilmez.
 * Ödev derlemesi YALNIZ AI havuzundan yapılır — kaynak seçici arayüzden kaldırıldı (GOREV-025).
 * Sunucu tarafı reddi GOREV-016'nın işi; buradaki istekler her zaman kaynak:'ai' gönderir.
 */
const KAYNAK_AI = 'ai' as const

const ZORLUK: Array<['', string]> | Array<[string, string]> = [
  ['', 'Hepsi'],
  ['kolay', 'Kolay'],
  ['orta', 'Orta'],
  ['zor', 'Zor'],
]

/** '2026-07-19' → 'dün' / '4 gün önce' / '2 hafta önce'; 30+ günde kısa tarih (gerçek tarih hesabı). */
function goreceliGun(iso: string, simdi: number): string {
  const g = Math.max(0, Math.floor((simdi - +new Date(iso)) / 86_400_000))
  if (g === 0) return 'bugün'
  if (g === 1) return 'dün'
  if (g < 7) return `${g} gün önce`
  if (g < 30) {
    const h = Math.floor(g / 7)
    return h === 1 ? '1 hafta önce' : `${h} hafta önce`
  }
  return gunEtiketi(iso.slice(0, 10))
}

/* Ekran stilleri — önizleme CSS'inin FİDAN değişkenli karşılığı (oa- öneki çakışmayı önler).
   Animasyonlar hareket-azalt kapılı; kart girişleri Reveal (useReducedMotion).
   Tık hedefleri ≥44px (FİDAN §9.10) — önizlemedeki 30-38px mini/segment dolguları bilinçli büyütüldü. */
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
  // ⚠️ `loading` DE OKUNUR (panelin diğer ekranları gibi). Yalnız `roster` alınıp
  // yüklenme beklenmediğinde hedefli ödev sessizce SINIFA gidiyordu — bkz. hedefKilitli.
  const { roster, loading: sinifYukleniyor, error: sinifHatasi } = useSinif()
  const azalt = useReducedMotion()

  // Derin bağlantı ön-dolgusu: röntgendeki "Set gönder" buraya böyle gelir.
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
  /** Son tarih (YYYY-MM-DD, boş = süresiz). Sunucu bunu o günün SONUNA çeker — bkz. sonTarihCoz. */
  const [sonTarih, setSonTarih] = useState('')
  /** Elle seçim. Boşsa filtre + rastgele örnekleme; doluysa TAM OLARAK bunlar gider. */
  const [secili, setSecili] = useState<string[]>([])
  // "Şimdi" mount'ta bir kez: göreli süre metinleri render'lar arasında titremesin (sp deseni).
  const [simdi] = useState(() => Date.now())

  // Aramayı geciktir: her tuşta havuza gitmek geniş havuzda hem yavaş hem gereksiz.
  useEffect(() => {
    const t = setTimeout(() => { setAraGecikmeli(ara.trim()); setSayfa(0) }, 350)
    return () => clearTimeout(t)
  }, [ara])

  const kazanimId = onDolguKazanim ? Number(onDolguKazanim) : null

  // Ders listesi sınıfın ısı haritasından: öğretmene "sınıfının çalıştığı dersler"
  // gösterilir, müfredatın tamamı değil.
  const isi = useAsync<IsiHaritasiYaniti>((signal) => tGet('/teacher/sinif/isi-haritasi', {}, { signal }), [])
  const dersler = isi.data?.subjects ?? []

  // Geçmiş Ödevler (GOREV-037) — GERÇEK uç, mock yok: GET /teacher/odevler (teacher.routes.ts:534).
  const gecmis = useAsync<GecmisYaniti>((signal) => tGet('/teacher/odevler', {}, { signal }), [])

  // ⚠️ Bağımlılıklar İLKEL: useAsync deps'i effect dizisine yayar (useAsync.ts:19),
  // taze nesne geçmek sonsuz refetch olurdu.
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

  // Savunma hattı: sunucu reddi (GOREV-016) inene dek yanıt yine de süzülür —
  // sunucu yanlışlıkla çıkmış sızdırsa bile öğretmen yüzüne çıkmaz.
  const eslesen = (havuz.data?.sorular ?? []).filter((q) => q.kaynak !== 'osym')
  // Havuzda kaç soru VAR (bu sayfada kaç tane değil) — geniş havuzda ayrım kritik.
  const havuzToplam = havuz.data?.total ?? 0
  const gonderilecek = secili.length > 0 ? secili.length : Math.min(adet, havuzToplam)
  const yeterli = secili.length > 0 || havuzToplam >= adet
  const sonSayfa = Math.max(0, Math.ceil(havuzToplam / SAYFA_BOY) - 1)

  const secimCevir = (id: string): void =>
    setSecili((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  /**
   * Filtre (ders/zorluk) değişince ÇAĞRILIR — iki ayrı hatayı birden kapatır.
   *
   * 1) SAYFA SIFIRLANMIYORDU: `sayfa` yalnız arama debounce'unda sıfırlanıyor ama
   *    useAsync bağımlılığında duruyordu. Öğretmen 4. sayfadayken (offset 60) 18 soruluk
   *    bir derse geçince istek `offset=60` ile gidiyor, boş dizi dönüyor ve ekran "Bu
   *    kriterlere uyan soru yok" diyordu — oysa 18 soru var. Üstelik `sonSayfa = 0`
   *    olduğu için sayfalama şeridi tümüyle gizleniyor, kullanıcının 1. sayfaya dönecek
   *    düğmesi bile kalmıyordu.
   * 2) ELLE SEÇİM KORUNUYORDU: Matematik'ten 6 soru işaretleyip Fizik'e geçen öğretmen
   *    "Sınıfa yayınla"ya bastığında istek `subject:'Fizik'` + o 6 MATEMATİK sorusuyla
   *    gidiyordu; sepet "6 soru elle seçildi", özet "Ders: Fizik" diyordu ve sınıfa Fizik
   *    ödevi diye Matematik soruları düşüyordu.
   */
  const filtreDegisti = (): void => { setSayfa(0); setSecili([]) }

  const hedefOgrenci = useMemo(
    () => (hedef === 'sinif' ? null : roster.find((o) => o.studentId === hedef) ?? null),
    [hedef, roster],
  )

  /**
   * ⚠️ HEDEF SEÇİLİ AMA ÖĞRENCİ ÇÖZÜLEMİYOR — YAYIN KİLİTLİ.
   *
   * Buradaki `find` roster boşken `null` döner ve akış SESSİZCE sınıf dalına düşerdi:
   * öğretmen Röntgen'den "Hedefli ödev gönder"e basıp buraya gelir (?ogrenci=<uuid>),
   * ekran anında çizilir, `/teacher/sinif` isteği hâlâ uçuşta ya da hata almıştır ve
   * sepetteki düğmeye basıldığında istek `POST /teacher/odev` olarak gider — ödev
   * SINIFIN TAMAMINA düşer. Düğme o an "Sınıfa yayınla" der ama öğretmen tek öğrenci
   * için geldiği hâlde okumaz; başarı toast'ı da "sınıfa gitti" der ve ekran kapanır.
   * Geri alınamazdı; artık DELETE ucu var ama yine de olmaması gereken bir yayın.
   *
   * Sessiz düşüşün yerine açık kilit: liste gelene kadar bekle, gelmediyse söyle.
   */
  const hedefKilitli = hedef !== 'sinif' && !hedefOgrenci
  const hedefBulunamadi = hedefKilitli && !sinifYukleniyor

  // Ön-dolgu dersi ısı haritasında yoksa çipler arasında karşılığı olmayan bir kapsam
  // kalır: hiçbir çip "aktif" görünmez ama sepet "Ders: Kimya" der ve havuz sorgusu
  // Kimya ile gider. Eski effect bunu düzeltmiyordu — state'i ZATEN sahip olduğu değere
  // yeniden atıyordu (ölü dal). Kapsam korunur, yalnız durum ekranda AÇIKÇA yazılır.
  const dersListeDisi = Boolean(ders && dersler.length && !dersler.includes(ders))

  const yayinla = async (): Promise<void> => {
    // Kilit düğmede de var; burada ikinci kez kontrol edilir çünkü sessiz sınıf yayını
    // geri alınamaz bir hatadır ve tek bir savunma satırına bırakılmamalı.
    if (hedefKilitli) {
      toast.error(
        sinifYukleniyor
          ? 'Öğrenci listesi henüz yüklenmedi — bir saniye.'
          : 'Seçili öğrenci listede bulunamadı. Sayfayı yenile ya da hedefi yeniden seç.',
      )
      return
    }
    setYayinlaniyor(true)
    try {
      if (hedefOgrenci) {
        const y = await tPost('/teacher/hedefli-odev', {
          studentId: hedefOgrenci.studentId,
          soruSayisi: adet,
          kaynak: KAYNAK_AI,
          ...(kazanimId ? { kazanimIds: [kazanimId] } : {}),
          // Zorluk çipi sepette yazıyor ("Zorluk: Zor") ama hedefli dalda İSTEĞE
          // girmiyordu — ekranın söylediği ile gidenin ayrışması.
          ...(zorluk ? { difficulty: zorluk } : {}),
          // ⚠️ ELLE SEÇİM HEDEFLİ DALDA DA TAŞINIR.
          // Sınıf dalı `questionIds`'i gönderiyordu, hedefli dal GÖNDERMİYORDU: öğretmen
          // havuzdan 5 soru işaretleyip tek öğrenciye yolladığında sepet "5 soru gidecek —
          // elle seçildi" derken sunucuya yalnız `soruSayisi: adet` (varsayılan 10) gidiyor,
          // öğrenciye zayıf kazanımlarından derlenmiş RASTGELE 10 soru düşüyordu. Toast da
          // `y.bulunan` bastığı için sayı 5 değil 10 çıkıyor ama öğretmen bunu yuvarlama
          // sanıyordu — arayüzün vaadi ile giden istek sessizce ayrışıyordu.
          ...(secili.length ? { questionIds: secili } : {}),
        })
        toast.success(`${hedefOgrenci.name ?? 'Öğrenciye'} ${y.bulunan} soruluk set gönderildi`)
        if (y.uyari) toast.warning(y.uyari)
      } else {
        const y = await tPost('/teacher/odev', {
          subject: ders ?? undefined,
          kaynak: KAYNAK_AI,
          soruSayisi: adet,
          ...(kazanimId ? { kazanimId } : {}),
          ...(zorluk ? { difficulty: zorluk } : {}),
          // Elle seçim varsa filtre yok sayılır — backend tam olarak bunları alır.
          ...(secili.length ? { questionIds: secili } : {}),
          // Boş = süresiz. Gün-yalnız değer sunucuda o günün SONUNA çekilir; ham
          // gönderirsek UTC gece yarısı (TSİ 03:00) olur ve son gün baştan kapanırdı.
          ...(sonTarih ? { dueDate: sonTarih } : {}),
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

  /**
   * "Şablon olarak kopyala" (EKRAN-HARITASI [HAZIR]): formu eski ödevin değerleriyle ön-doldurur;
   * yayın AYNI derleme ucuyla yapılır — yeni uç yok. Uç yanıtında `difficulty` YOK →
   * zorluk 'Hepsi'ye döner (bilinmeyen uydurulmaz). Derin-bağ kazanımı şablona sızmasın
   * diye URL temizlenir; elle seçim ve sayfa sıfırlanır.
   */
  const sablonKopyala = (o: GecmisOdev): void => {
    if (o.subject) setDers(o.subject)
    if (o.soruSayisi > 0) setAdet(Math.min(40, Math.max(1, o.soruSayisi)))
    setZorluk('')
    setSecili([])
    setSayfa(0)
    setHedef('sinif')
    // Son tarih ŞABLONA GİRMEZ: eski ödevin tarihi çoktan geçmiş olabilir ve sessizce
    // kopyalanırsa yeni ödev doğduğu anda kapalı olurdu.
    setSonTarih('')
    if (kazanimId || onDolguOgrenci || onDolguDers) nav('/sinif/odev', { replace: true })
    window.scrollTo({ top: 0, behavior: azalt ? 'auto' : 'smooth' })
    toast.success('Şablon yüklendi — yayınlamadan önce gözden geçir')
  }

  /* ── Ödev yaşam döngüsü (kapat / sil) ─────────────────────────────────────
     Yayınlanmış ödevin geri dönüşü yoktu: `status` `'active'` sabitiyle yazılıp bir
     daha değişmiyordu, silen uç da yoktu. Yanlış yayınlanan ödev kalıcıydı; öğrenciler
     onu görmeye ve göndermeye devam ediyor, puanlar sınıf ortalamasına giriyordu.
     ────────────────────────────────────────────────────────────────────────── */
  const [silinecek, setSilinecek] = useState<GecmisOdev | null>(null)
  const [odevIsleniyor, setOdevIsleniyor] = useState(false)

  const odevKapat = async (o: GecmisOdev): Promise<void> => {
    if (odevIsleniyor) return
    setOdevIsleniyor(true)
    try {
      await tPatch(`/teacher/odev/${o.id}`, { status: 'archived' })
      toast.success('Ödev kapatıldı — yeni gönderim alınmaz')
      gecmis.reload()
    } catch (e: any) {
      toast.error(e?.message ?? 'Ödev kapatılamadı')
    } finally {
      setOdevIsleniyor(false)
    }
  }

  const odevSil = async (): Promise<void> => {
    if (!silinecek || odevIsleniyor) return
    setOdevIsleniyor(true)
    try {
      // Sunucu karar verir: gönderim varsa SİLMEZ, arşivler (öğrencinin cevapları
      // `on delete cascade` ile yok olurdu). Yanıt hangisinin olduğunu söyler.
      const y = await tDelete(`/teacher/odev/${silinecek.id}`)
      toast.success(
        y.silindi
          ? 'Ödev silindi'
          : `Ödev arşivlendi — ${y.gonderimSayisi} gönderim olduğu için silinmedi`,
      )
      setSilinecek(null)
      gecmis.reload()
    } catch (e: any) {
      toast.error(e?.message ?? 'Ödev kaldırılamadı')
    } finally {
      setOdevIsleniyor(false)
    }
  }

  const kapsamVar = Boolean(ders || kazanimId)

  return (
    <Sayfa>
      <style>{STIL}</style>

      {/* ═══ BAŞLIK — havuz-durum şeridi gerçek `total` ═══ */}
      <Reveal>
        <section className="oa-kart flex flex-wrap items-center gap-3.5 px-[22px] py-4">
          <div>
            <h1 className="oa-h1">Ödev Atölyesi</h1>
            <p className="oa-alt">AI havuzundan soru derle, sınıfa ya da tek öğrenciye gönder.</p>
          </div>
          <div className="oa-monoduz ml-auto flex items-center gap-2">
            <i className="oa-nokta" aria-hidden />
            {havuz.loading ? 'havuz taranıyor…' : `${havuzToplam} doğrulanmış soru`}
          </div>
        </section>
      </Reveal>

      <div className="mt-3.5 grid items-start gap-3.5 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
        {/* ── SOL: kapsam + havuz ── */}
        <div className="min-w-0 space-y-3.5">
          <Reveal delay={0.06}>
            <section className="oa-kart px-[22px] py-[18px]">
              <h3 className="oa-h3 mb-3">Kapsam</h3>

              <span className="oa-etiket">Ders</span>
              <div className="flex flex-wrap gap-2">
                {isi.loading ? (
                  <div className="oa-iskelet h-11 w-64" />
                ) : dersler.length === 0 ? (
                  <p className="text-[12.5px]" style={{ color: 'var(--metin3)' }}>Sınıfın henüz çalıştığı ders yok.</p>
                ) : (
                  dersler.map((d) => (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={ders === d}
                      onClick={() => { setDers(ders === d ? null : d); filtreDegisti() }}
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
                        onClick={() => { setZorluk(deger); filtreDegisti() }}
                        className={zorluk === deger ? 'aktif' : undefined}
                      >
                        {etiket}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label htmlFor="adet" className="oa-etiket">Soru sayısı</label>
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
                  <span className="oa-kazanim-cip">ğŸ¯ Tek kazanıma odaklı (#{kazanimId})</span>
                  <button
                    type="button"
                    onClick={() => nav('/sinif/odev', { replace: true })}
                    className="oa-kazanim-kaldir"
                  >
                    kaldır ✕
                  </button>
                </div>
              )}
            </section>
          </Reveal>

          <Reveal delay={0.12}>
            <section className="oa-kart px-[22px] py-[18px]">
              <div className="mb-3 flex items-center gap-2">
                <h3 className="oa-h3">Havuz</h3>
                {/* ⚠️ ARALIK BOŞ SAYFADA KURULMAZ. Etiket `sayfa*20+1`'den başlıyordu; sonuç
                    kümesi küçülüp sayfa dışında kalındığında (sunucu boş dizi döner)
                    "61–60 / 18 eşleşen" gibi İMKÂNSIZ bir aralık yazıyordu. Sayfa sıfırlama
                    bunu tetiklemeyi zorlaştırdı ama etiket yine de kendi başına dürüst olmalı. */}
                <span className="oa-monoduz ml-auto">
                  {havuzToplam > 0 && (eslesen.length > 0
                    ? `${sayfa * SAYFA_BOY + 1}–${sayfa * SAYFA_BOY + eslesen.length} / ${havuzToplam} eşleşen`
                    : `${havuzToplam} eşleşen`)}
                </span>
              </div>

              {/* Arama — geniş havuzda filtre tek başına yetmez */}
              <div className="oa-ara">
                <Icon name="search" size={15} color="currentColor" style={{ opacity: 0.6 }} />
                <input
                  value={ara}
                  onChange={(e) => setAra(e.target.value)}
                  placeholder="Soru metninde ara…"
                  aria-label="Soru metninde ara"
                />
                {ara && (
                  <button type="button" onClick={() => setAra('')} aria-label="Aramayı temizle" className="oa-ara-temizle">
                    <Icon name="close" size={14} color="currentColor" />
                  </button>
                )}
              </div>

              {havuz.loading ? (
                <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="oa-iskelet h-16" />)}</div>
              ) : !kapsamVar ? (
                <p className="oa-bos">Başlamak için bir ders seç.</p>
              ) : eslesen.length === 0 ? (
                <div className="oa-bos">
                  <p className="font-semibold" style={{ color: 'var(--metin2)' }}>
                    {araGecikmeli ? 'Aramaya uyan soru yok' : 'Bu kriterlere uyan soru yok'}
                  </p>
                  <p className="mt-1">
                    {araGecikmeli
                      ? 'Arama terimini kısaltmayı dene.'
                      : "Havuz bu kazanımda henüz boş. Zorluk filtresini 'Hepsi' yap ya da başka ders dene."}
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
                            {/* KELİMELİ rozetler + ✓ işaret: seçim asla yalnız renkle anlatılmaz */}
                            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                              {isaretli && <span className="isaret" aria-hidden>✓</span>}
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
                        ← Önceki
                      </button>
                      <span className="oa-monoduz">sayfa {sayfa + 1} / {sonSayfa + 1}</span>
                      <button
                        type="button"
                        className="oa-btn oa-btn-soluk"
                        disabled={sayfa >= sonSayfa}
                        onClick={() => setSayfa((s) => Math.min(sonSayfa, s + 1))}
                      >
                        Sonraki →
                      </button>
                    </div>
                  )}
                </>
              )}
            </section>
          </Reveal>
        </div>

        {/* ── SAĞ: yapışkan sepet — sayfanın TEK birincil eylemi burada ── */}
        <div className="min-w-0">
          <Reveal delay={0.1}>
            <div className="sticky" style={{ top: NAV_H + 24 }}>
              <section className="oa-sepet-ic">
                <h3 className="oa-h3 mb-3.5">Set Özeti</h3>

                <label htmlFor="oa-hedef" className="oa-etiket">Kime</label>
                <select
                  id="oa-hedef"
                  value={hedef}
                  onChange={(e) => setHedef(e.target.value)}
                  aria-label="Ödevin hedefi"
                  className="oa-secim"
                  disabled={sinifYukleniyor}
                >
                  <option value="sinif">
                    {sinifYukleniyor ? 'Tüm sınıf' : `Tüm sınıf (${roster.length} öğrenci)`}
                  </option>
                  {/* Roster gelmemişken seçili öğrenci listede YOKTUR; adını bilmediğimiz
                      için uydurmuyoruz ama seçimi de düşürmüyoruz (düşseydi hedef sessizce
                      "sınıf" olurdu — tam kaçındığımız şey). */}
                  {hedefKilitli && (
                    <option value={hedef}>
                      {sinifYukleniyor ? 'Seçili öğrenci (yükleniyor…)' : 'Seçili öğrenci (bulunamadı)'}
                    </option>
                  )}
                  {roster.map((o) => (
                    <option key={o.studentId} value={o.studentId}>
                      {o.name ?? 'İsimsiz öğrenci'}
                    </option>
                  ))}
                </select>

                {hedefBulunamadi && (
                  <p className="oa-hata mt-2">
                    Öğrenci listesi yüklenemedi{sinifHatasi ? `: ${sinifHatasi}` : ''}. Hedefli set
                    gönderilemez — <b>sınıfa yayın yapılmaz</b>. Sayfayı yenile ya da hedefi
                    "Tüm sınıf" olarak yeniden seç.
                  </p>
                )}

                <label htmlFor="oa-son-tarih" className="oa-etiket mt-3.5 block">Son tarih</label>
                <input
                  id="oa-son-tarih"
                  type="date"
                  value={sonTarih}
                  min={new Date().toLocaleDateString('en-CA')}
                  onChange={(e) => setSonTarih(e.target.value)}
                  className="oa-secim"
                />
                <p className="mt-1 text-[11px]" style={{ color: 'var(--metin3)' }}>
                  {sonTarih
                    ? 'O günün sonuna kadar gönderilebilir.'
                    : 'Boş bırakılırsa süresiz — istediğin zaman "Kapat" ile bitirebilirsin.'}
                </p>

                <div>
                  <div className="oa-ozet-satir">
                    <span>Ders</span>
                    <b>{ders ?? '—'}{dersListeDisi ? ' (sınıfta ölçüm yok)' : ''}</b>
                  </div>
                  {/* TELİF: kaynak seçici YOK — sabit satır; her istek kaynak:'ai' gönderir */}
                  <div className="oa-ozet-satir"><span>Kaynak</span><b>AI havuzu</b></div>
                  <div className="oa-ozet-satir"><span>Zorluk</span><b>{zorluk || 'Hepsi'}</b></div>
                  <div className="oa-ozet-satir">
                    <span>Seçim</span><b>{secili.length ? `${secili.length} soru elle` : `${adet} soru rastgele`}</b>
                  </div>
                  <div className="oa-ozet-satir"><span>Havuzda</span><b>{havuzToplam} soru</b></div>
                </div>

                {secili.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSecili([])}
                    className="oa-btn oa-btn-mini mt-2 w-full"
                  >
                    Seçimi temizle — filtreye dön
                  </button>
                )}

                {/* Rakamlar filtre değiştikçe YUVARLANIR (NumberFlow) — bu ekranın
                    en yüksek kaldıraçlı mikro-etkileşimi. */}
                <div className={cn('oa-buyuk', !kapsamVar ? 'notr' : !yeterli && 'eksik')}>
                  <span className="n"><Sayi value={gonderilecek} /></span>
                  <span className="a">
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
                  <p className="oa-eksik-not">
                    Havuzda bu kriterlerde {havuzToplam} soru var; set o kadarıyla
                    oluşacak. <b>Soru uydurulmaz — eksik olduğu gibi görünür.</b>
                  </p>
                )}

                <button
                  type="button"
                  className="oa-btn oa-btn-birincil mt-3.5 w-full"
                  disabled={yayinlaniyor || !kapsamVar || gonderilecek === 0 || hedefKilitli}
                  onClick={() => { void yayinla() }}
                >
                  <Icon name="send" size={15} color="currentColor" />
                  {/* ⚠️ ETİKET HEDEFİ YANSITIR. Kilitliyken "Sınıfa yayınla" yazmak, öğretmene
                      yapmak istediğinden BAŞKA bir işi vaat etmek olurdu. */}
                  {yayinlaniyor
                    ? 'Yayınlanıyor…'
                    : hedefKilitli
                      ? 'Öğrenci bekleniyor…'
                      : hedefOgrenci ? 'Sete gönder' : 'Sınıfa yayınla'}
                </button>

                {hedefOgrenci && (
                  <p className="mt-2.5 text-center text-[11px] leading-relaxed" style={{ color: 'var(--metin3)' }}>
                    Hedefli set, <strong style={{ color: 'var(--metin2)' }}>{hedefOgrenci.name}</strong> için
                    zayıf kazanımlarından derlenir.
                  </p>
                )}
              </section>
            </div>
          </Reveal>
        </div>
      </div>

      {/* ═══ GEÇMİŞ ÖDEVLER (GOREV-037) — gerçek uç; sayı uydurulmaz ═══ */}
      <Reveal delay={0.18}>
        <section className="oa-kart mt-3.5 px-[22px] py-[18px]">
          <div className="mb-2 flex items-center gap-2">
            <h3 className="oa-h3">Geçmiş Ödevler</h3>
            <span className="oa-monoduz ml-auto">
              {/* Önizlemedeki "son 30 gün" ibaresi uç gerçeğiyle eşleşmiyor (uç son kayıtları döner) —
                  yerine GERÇEK toplam yazılır. */}
              {gecmis.data ? `${gecmis.data.total} ödev` : ''}
            </span>
          </div>

          {gecmis.loading ? (
            <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="oa-iskelet h-12" />)}</div>
          ) : gecmis.error ? (
            <div className="oa-hata">
              Geçmiş ödevler yüklenemedi: {gecmis.error}{' '}
              <button type="button" className="oa-btn oa-btn-mini ml-2" onClick={gecmis.reload}>Tekrar dene</button>
            </div>
          ) : (gecmis.data?.assignments.length ?? 0) === 0 ? (
            <p className="oa-bos">Henüz ödev göndermedin — ilk seti yukarıdan derle.</p>
          ) : (
            gecmis.data!.assignments.map((o) => {
              const acik = o.status === 'active'
              const ogrenciSayisi = gecmis.data!.ogrenciSayisi
              const baslikMetni = [o.subject, o.topic].filter(Boolean).join(' · ') || 'Ödev'
              return (
                <div key={o.id} className="oa-odev-satir">
                  <b>{baslikMetni}</b>
                  <span className="oa-odev-meta">{o.soruSayisi} soru · {goreceliGun(o.createdAt, simdi)}</span>
                  {/* KELİMELİ durum — renk tek başına bilgi taşımaz */}
                  <span className={cn('oa-durum', acik ? 'oa-durum-acik' : 'oa-durum-kapandi')}>
                    {acik ? 'açık' : 'kapandı'}
                  </span>
                  {/* Tamamlanma = gönderim/öğrenci (uç verisi). Öğrenci sayısı 0 ise çubuk GİZLENİR — pay uydurulmaz. */}
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
                    Şablon olarak kopyala
                  </button>
                  {/* Kapatma yıkıcı DEĞİL (geri açılabilir) → onay istemez. Silme yıkıcı →
                      Radix Dialog (proje kuralı: window.confirm asla). */}
                  {acik && (
                    <button
                      type="button"
                      className="oa-btn oa-btn-mini"
                      disabled={odevIsleniyor}
                      onClick={() => { void odevKapat(o) }}
                    >
                      Kapat
                    </button>
                  )}
                  <button
                    type="button"
                    className="oa-btn oa-btn-mini"
                    disabled={odevIsleniyor}
                    onClick={() => setSilinecek(o)}
                  >
                    Sil
                  </button>
                </div>
              )
            })
          )}
        </section>
      </Reveal>

      {/* ═══ SİLME ONAYI — yıkıcı eylem daima Radix Dialog ═══ */}
      <Dialog.Root open={!!silinecek} onOpenChange={(a) => { if (!a) setSilinecek(null) }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[85]" style={{ background: 'rgba(20,32,24,.42)' }} />
          <Dialog.Content className="oa-kart fixed left-1/2 top-1/2 z-[86] w-[min(92vw,400px)] -translate-x-1/2 -translate-y-1/2 p-6">
            <Dialog.Title className="font-display text-[16px] font-bold" style={{ color: 'var(--metin1)' }}>
              Ödev kaldırılsın mı?
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-[13px] leading-relaxed" style={{ color: 'var(--metin2)' }}>
              <b>{[silinecek?.subject, silinecek?.topic].filter(Boolean).join(' · ') || 'Ödev'}</b> öğrenci
              listelerinden kalkar. Gönderim yapılmışsa ödev <b>silinmez, arşivlenir</b> — öğrencilerin
              verdiği cevaplar ve aldıkları puanlar korunur.
            </Dialog.Description>
            <div className="mt-5 flex justify-end gap-2.5">
              <Dialog.Close asChild>
                <button type="button" className="oa-btn oa-btn-soluk">Vazgeç</button>
              </Dialog.Close>
              <button
                type="button"
                className="oa-btn oa-btn-birincil"
                disabled={odevIsleniyor}
                onClick={() => { void odevSil() }}
              >
                {odevIsleniyor ? 'Kaldırılıyor…' : 'Kaldır'}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Sınıf boş — FİDAN filiz görseli (Lighthouse emekli) + tek köprü: Sınıf Panosu */}
      {roster.length === 0 && (
        <Reveal delay={0.24}>
          <section className="oa-kart mx-auto mt-8 max-w-md px-8 py-8 text-center">
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" aria-hidden className="mx-auto mb-3">
              <path d="M12 21V9" stroke="var(--vurgu)" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M12 12C12 8 9 5 4 5c0 5 3 8 8 8" fill="var(--adacayi)" />
              <path d="M12 9c0-3.5 2.5-6 7-6 0 4.5-2.5 7-7 7" fill="var(--yaprak)" />
            </svg>
            <h3 className="oa-h3">Sınıfında henüz öğrenci yok</h3>
            <p className="oa-alt mx-auto mt-1.5 max-w-[320px] leading-relaxed">
              Ödev gönderebilmek için önce sınıf kodunu paylaş ya da e-postayla öğrenci ekle.
            </p>
            <button type="button" className="oa-btn oa-btn-soluk mt-4" onClick={() => nav('/sinif')}>
              Sınıf Panosu'na git
            </button>
          </section>
        </Reveal>
      )}
    </Sayfa>
  )
}
