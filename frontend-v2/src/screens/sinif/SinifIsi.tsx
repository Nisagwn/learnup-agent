import { useMemo, useState } from 'react'
import { tGet, useSinifNav } from '../../lib/sinif-kapsam'
import { useAsync } from '../../lib/useAsync'
import { useSorgu } from '../../lib/sorgu'
import { NAV_H } from '../../lib/layout'
import type {
  IsiHaritasiHucresi,
  IsiHaritasiYaniti,
  IsiOgrenciKirilimiYaniti,
  SinifZayifYaniti,
} from '../../lib/types.teacher'
import { Icon } from '../../ui'
import { Sayfa } from '../../components/RolGecidi'
import { Skeleton } from '../../components/ui'
import { Reveal } from '../../components/fx'

/**
 * KAZANIM ISI HARÄ°TASI â€” FÄ°DAN v1.2 inline desen (`si-*`), onaylÄ± Ã¶nizleme:
 * docs/design/onizleme/kazanim-isi-haritasi.html (GOREV-035).
 *
 * MOCK YASAK â€” Ã¼Ã§ GERÃ‡EK uÃ§:
 *   GET /teacher/sinif/isi-haritasi              â†’ ders Ã— ÃœNÄ°TE hÃ¼creleri (ltree ilk 2 seviye)
 *   GET /teacher/sinif/zayif-kazanimlar          â†’ sÄ±nÄ±fÄ±n kazanÄ±m-dÃ¼zeyi zayÄ±f listesi (panel kÃ¶prÃ¼sÃ¼)
 *   GET /teacher/sinif/isi-haritasi/ogrenciler   â†’ seÃ§ili hÃ¼crenin zayÄ±f Ã–ÄRENCÄ° kÄ±rÄ±lÄ±mÄ± (GOREV-049)
 *
 * Ã–nizlemeden BÄ°LÄ°NÃ‡LÄ° sapmalar (uÃ§ veriyi vermiyor â†’ parÃ§a GÄ°ZLENDÄ°, uydurulmadÄ±):
 *   Â· Matris granÃ¼lÃ¼ konuâ†’kazanÄ±m deÄŸil dersâ†’Ã¼nite: RPC ltree ilk 2 seviyeyi dÃ¶ndÃ¼rÃ¼r.
 *   Â· "Ã–lÃ§Ã¼m yok" kesikli hÃ¼cre YOK: RPC yalnÄ±z Ã¶lÃ§Ã¼len satÄ±rlarÄ± dÃ¶ndÃ¼rÃ¼r; Ã¶lÃ§Ã¼msÃ¼z
 *     Ã¼nitelerin tam listesi yanÄ±tsÄ±z. Lejanttaki "Ã¶lÃ§Ã¼m yok" Ã¶gesi de bu yÃ¼zden yok.
 *   Â· DaÄŸÄ±lÄ±m 4 bant deÄŸil 2 dÃ¼rÃ¼st bant (zayÄ±f eÅŸik altÄ± / eÅŸik Ã¼stÃ¼): uÃ§ yalnÄ±z
 *     weakStudentCount/studentCount verir; eÅŸik backend'den (esik.zayif) gelir.
 *   Â· [Ã‡Ã–ZÃœLDÃœ Â· GOREV-049] Ãœnite baÅŸÄ±na zayÄ±f Ã–ÄRENCÄ° kÄ±rÄ±lÄ±mÄ±: hÃ¼cre seÃ§ilince
 *     GET /teacher/sinif/isi-haritasi/ogrenciler ucundan en-zayÄ±f-baÅŸta Ã¶ÄŸrenci listesi
 *     gelir (kazanÄ±m paneliyle kardeÅŸ). TutarlÄ±lÄ±k: liste uzunluÄŸu = weakStudentCount.
 *   Â· [Ã‡Ã–ZÃœLDÃœ Â· GOREV-049] KarÅŸÄ±laÅŸtÄ±rma kÃ¶prÃ¼sÃ¼: her Ã¶ÄŸrenci satÄ±rÄ±
 *     /sinif/karsilastir?ogrenci=<studentId> ile KarÅŸÄ±laÅŸtÄ±r'Ä± aÃ§ar (Karsilastir ?ogrenci= okur).
 *   Kalan yapÄ±sal sapma (granÃ¼l dersâ†’Ã¼nite, "Ã¶lÃ§Ã¼m yok" hÃ¼creleri) RAPOR'da BACKEND kartÄ±
 *   Ã¶nerisiyle listelendi.
 *
 * Harita TEK istekte filtresiz Ã§ekilir; ders sÃ¼zgeci Ä°STEMCÄ°DE uygulanÄ±r. subject paramlÄ±
 * istek yalnÄ±z seÃ§ili dersin subjects listesini dÃ¶ndÃ¼rÃ¼r â†’ diÄŸer Ã§ipler kaybolurdu;
 * ayrÄ±ca Ã§ip baÅŸÄ±na refetch olmazdÄ± da olurdu. Veri Ã¶lÃ§eÄŸi kÃ¼Ã§Ã¼k (~40 hÃ¼cre).
 */

/** avgMastery â†’ 4 adaÃ§ayÄ± tonu. SkalanÄ±n kÃ¶kÃ¼ backend eÅŸiÄŸi: v1 = zayÄ±f eÅŸiÄŸi ALTI,
    kalan [esik..1] aralÄ±ÄŸÄ± Ã¼Ã§ eÅŸit banda bÃ¶lÃ¼nÃ¼r (renk skalasÄ± tek kaynaktan kurulur). */
function ton(ort: number, zayifEsik: number): 1 | 2 | 3 | 4 {
  if (ort < zayifEsik) return 1
  const adim = Math.max(0.0001, (1 - zayifEsik) / 3)
  if (ort < zayifEsik + adim) return 2
  if (ort < zayifEsik + 2 * adim) return 3
  return 4
}

const yuzde = (x: number): number => Math.round(x * 100)

/** "matematik" â†’ "Matematik" (tr). GÃ¶rsel baÅŸlÄ±k â€” anahtar deÄŸeri URL'de ham kalÄ±r. */
const dersBaslik = (s: string): string =>
  s ? s.charAt(0).toLocaleUpperCase('tr-TR') + s.slice(1) : s

const STIL = `
  /* Ambiyans yaprak katmanÄ± bu ekranda KAPALI â€” yoÄŸun veri yÃ¼zeyi (Ã¶nizleme notu). */
  .amb-yprk { display: none !important; }

  .si-kart { background: var(--cam); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
    border: 1px solid var(--cam-kenar); border-radius: 20px; box-shadow: var(--golge); }
  .si-mono { font-family: var(--font-mono); font-size: 10.5px; letter-spacing: .12em;
    text-transform: uppercase; color: var(--metin3); font-weight: 500; }

  .si-arac { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
  .si-arac h1 { font-family: var(--font-display); font-size: 24px; font-weight: 800;
    letter-spacing: -0.02em; color: var(--metin1); margin-right: 10px; }
  .si-cip { min-height: 44px; padding: 8px 16px; border-radius: 12px; cursor: pointer;
    font-family: var(--font-sans); font-size: 12.5px; font-weight: 600; color: var(--metin2);
    background: transparent; border: 1.5px solid var(--cam-kenar);
    transition: color .15s, border-color .15s, background .15s; }
  .si-cip:hover { color: var(--metin1); border-color: var(--adacayi); }
  .si-cip.aktif { color: var(--vurgu); background: var(--v1); border-color: var(--adacayi); }
  .si-lejant { margin-left: auto; display: flex; align-items: center; gap: 7px;
    font-size: 11px; color: var(--metin3); flex-wrap: wrap; }
  .si-lejant i { width: 16px; height: 16px; border-radius: 5px; display: inline-block; }

  .si-izgara { display: grid; grid-template-columns: minmax(0, 1.75fr) minmax(0, 1fr);
    gap: 14px; margin-top: 14px; }
  .si-yapiskan { position: sticky; align-self: start; min-width: 0; }
  @media (max-width: 1020px) {
    .si-izgara { grid-template-columns: 1fr; }
    .si-yapiskan { position: static; }
  }

  .si-matris { padding: 20px 24px; }
  .si-blok { margin-bottom: 18px; }
  .si-blok:last-of-type { margin-bottom: 0; }
  .si-blok-baslik { display: flex; align-items: center; gap: 10px; margin-bottom: 9px; }
  .si-blok-baslik h3 { font-family: var(--font-display); font-size: 13.5px; font-weight: 700; color: var(--metin1); }
  .si-blok-baslik .ort { font-family: var(--font-mono); font-size: 10.5px; color: var(--metin3); }
  .si-blok-baslik .cizgi { flex: 1; height: 1px; background: var(--cam-kenar); }
  .si-hucreler { display: flex; gap: 7px; flex-wrap: wrap; }
  .si-hucre { width: 122px; min-height: 44px; border-radius: 12px; padding: 9px 10px;
    cursor: pointer; border: none; text-align: left; transition: box-shadow .18s, transform .18s; }
  .si-hucre .ad { display: block; font-family: var(--font-sans); font-size: 10.5px;
    font-weight: 600; line-height: 1.3; color: var(--metin1); overflow-wrap: anywhere; }
  .si-hucre .deger { display: block; font-family: var(--font-mono); font-size: 10px;
    color: var(--metin2); margin-top: 5px; }
  .si-hucre.t1 { background: var(--v1); }
  .si-hucre.t2 { background: var(--v2); }
  .si-hucre.t3 { background: var(--v3); }
  .si-hucre.t4 { background: var(--v4); }
  .si-hucre.t4 .ad, .si-hucre.t4 .deger { color: #14301E; }
  .dark .si-hucre.t4 .ad, .dark .si-hucre.t4 .deger { color: #EAF4EC; }
  .si-hucre:hover { box-shadow: var(--golge-h); }
  .si-hucre.secili { outline: 2.5px solid var(--yaprak); outline-offset: 2px; }
  .si-dipnot { margin-top: 14px; font-family: var(--font-mono); font-size: 10.5px; color: var(--metin3); }

  .si-bos { padding: 34px 20px; text-align: center; }
  .si-bos .baslik { font-family: var(--font-display); font-size: 15px; font-weight: 700; color: var(--metin1); }
  .si-bos .alt { margin-top: 6px; font-size: 12.5px; color: var(--metin2); line-height: 1.6; }

  .si-panel { padding: 22px 24px; }
  .si-panel-ust { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
  .si-kapat { display: grid; place-items: center; width: 28px; height: 28px; border: none;
    background: transparent; border-radius: 8px; color: var(--metin3); cursor: pointer; }
  .si-kapat:hover { color: var(--metin1); background: var(--v0); }
  .si-panel h2 { font-family: var(--font-display); font-size: 17px; font-weight: 700;
    line-height: 1.35; color: var(--metin1); overflow-wrap: anywhere; }
  .si-ders-cip { display: inline-block; font-size: 10.5px; font-weight: 700; color: var(--vurgu);
    background: var(--v1); padding: 3px 10px; border-radius: 10px; margin-top: 7px; }
  .si-ipucu { margin-top: 8px; font-size: 12.5px; color: var(--metin2); line-height: 1.6; }

  .si-dagilim { margin: 18px 0 6px; }
  .si-dag-satir { display: flex; align-items: center; gap: 10px; margin-bottom: 9px; font-size: 11.5px; }
  .si-dag-satir .etiket { width: 96px; color: var(--metin2); font-weight: 600; }
  .si-dag-satir .cubuk { flex: 1; height: 14px; border-radius: 7px; background: var(--v0); overflow: hidden; }
  .si-dag-satir .cubuk i { display: block; height: 100%; border-radius: 7px;
    background: linear-gradient(90deg, var(--adacayi), var(--yaprak)); }
  .si-dag-satir .adet { width: 72px; text-align: right; font-family: var(--font-mono);
    font-size: 10.5px; color: var(--metin3); }

  .si-kaz-liste { margin-top: 14px; border-top: 1px solid var(--cam-kenar); padding-top: 12px; }
  .si-kaz-liste h4 { font-size: 12px; font-weight: 600; color: var(--metin2); margin-bottom: 9px; }
  .si-kaz { display: block; width: 100%; min-height: 44px; text-align: left; cursor: pointer;
    border: 1.5px solid var(--cam-kenar); border-radius: 12px; background: transparent;
    padding: 8px 11px; margin-bottom: 7px; transition: border-color .15s, background .15s; }
  .si-kaz:hover { border-color: var(--adacayi); }
  .si-kaz.secili { border-color: var(--yaprak); background: var(--v1); }
  .si-kaz .baslik { display: block; font-size: 12px; font-weight: 600; color: var(--metin1); line-height: 1.35; }
  .si-kaz .alt { display: block; margin-top: 3px; font-family: var(--font-mono); font-size: 10px; color: var(--metin3); }
  .si-not { font-size: 11.5px; color: var(--metin3); line-height: 1.55; margin-top: 8px; }
  .si-baglanti { border: none; background: none; padding: 0; cursor: pointer; font-size: 11.5px;
    font-weight: 600; color: var(--vurgu); text-decoration: underline; text-underline-offset: 2px; }

  /* ZayÄ±f Ã¶ÄŸrenci kÄ±rÄ±lÄ±mÄ± â€” daÄŸÄ±lÄ±mÄ±n "eÅŸik altÄ±" sayÄ±sÄ±nÄ± isimli satÄ±rlara aÃ§ar.
     Her satÄ±r KarÅŸÄ±laÅŸtÄ±r'a kÃ¶prÃ¼; en zayÄ±f baÅŸta (sunucu sÄ±rasÄ± korunur). */
  .si-ogr-liste { margin-top: 14px; border-top: 1px solid var(--cam-kenar); padding-top: 12px; }
  .si-ogr-liste h4 { font-size: 12px; font-weight: 600; color: var(--metin2); margin-bottom: 9px; }
  .si-ogr { display: flex; align-items: center; justify-content: space-between; gap: 10px;
    width: 100%; min-height: 44px; text-align: left; cursor: pointer;
    border: 1.5px solid var(--cam-kenar); border-radius: 12px; background: transparent;
    padding: 8px 11px; margin-bottom: 7px; transition: border-color .15s, background .15s; }
  .si-ogr:hover { border-color: var(--adacayi); background: var(--v0); }
  .si-ogr .kim { min-width: 0; }
  .si-ogr .ad { display: block; font-size: 12px; font-weight: 600; color: var(--metin1);
    line-height: 1.35; overflow-wrap: anywhere; }
  .si-ogr .alt { display: block; margin-top: 3px; font-family: var(--font-mono); font-size: 10px;
    color: var(--metin3); }
  .si-ogr .git { display: inline-flex; align-items: center; gap: 5px; flex-shrink: 0;
    font-size: 11px; font-weight: 600; color: var(--vurgu); }

  .si-cta { width: 100%; margin-top: 16px; min-height: 44px; border: none; cursor: pointer;
    border-radius: 12px; padding: 11px 20px; font-family: var(--font-sans); font-size: 12.5px;
    font-weight: 600; background: var(--cta); color: #F2F7F3;
    box-shadow: 0 6px 16px rgba(30, 70, 32, .25); transition: box-shadow .2s, transform .15s; }
  .si-cta:hover { box-shadow: var(--parilti); }
  .si-cta:disabled { opacity: .55; cursor: not-allowed; box-shadow: none; }
  .si-soluk-genis { width: 100%; margin-top: 16px; min-height: 44px; cursor: pointer;
    border-radius: 12px; padding: 9px 14px; font-family: var(--font-sans); font-size: 12.5px;
    font-weight: 600; background: var(--v0); color: var(--metin2); border: 1px solid var(--cam-kenar);
    transition: color .15s, border-color .15s; }
  .si-soluk-genis:hover { color: var(--metin1); border-color: var(--adacayi); }

  /* Hareket yalnÄ±z tercih edene: hover kalkÄ±ÅŸlarÄ± gateli (kabul kriteri). */
  @media (prefers-reduced-motion: no-preference) {
    .si-hucre:hover { transform: translateY(-2px) scale(1.02); }
    .si-cta:hover:not(:disabled) { transform: translateY(-1px); }
  }
`

export function SinifIsi() {
  const nav = useSinifNav()
  // Drill-down state URL'de (replace:true, varsayÄ±lan silinir) â€” paylaÅŸÄ±labilir baÄŸlantÄ±.
  const [ders, setDers] = useSorgu<string>('ders', '')
  const [unite, setUnite] = useSorgu<string>('unite', '')
  // Panel iÃ§i kazanÄ±m seÃ§imi GEÃ‡Ä°CÄ° (akordeon tÃ¼rÃ¼) â€” URL'e yazÄ±lmaz.
  const [kazanimSecim, setKazanimSecim] = useState<number | null>(null)

  // âš ï¸ BaÄŸÄ±mlÄ±lÄ±klar Ä°LKEL (useAsync deps'i effect dizisine yayar) â€” burada sabit [].
  const isi = useAsync<IsiHaritasiYaniti>(() => tGet('/teacher/sinif/isi-haritasi'), [])
  const zayif = useAsync<SinifZayifYaniti>(
    () => tGet('/teacher/sinif/zayif-kazanimlar', { limit: 100 }),
    [],
  )

  const veri = isi.data

  // Ders bloklarÄ±: subjects sÄ±rasÄ± korunur, ders sÃ¼zgeci istemcide.
  const bloklar = useMemo(() => {
    if (!veri) return []
    const grup = new Map<string, IsiHaritasiHucresi[]>()
    for (const c of veri.cells) {
      if (ders && c.subject !== ders) continue
      const dizi = grup.get(c.subject)
      if (dizi) dizi.push(c)
      else grup.set(c.subject, [c])
    }
    return veri.subjects
      .filter((s) => grup.has(s))
      .map((s) => {
        const hucreler = grup.get(s)!
        return {
          ders: s,
          hucreler,
          // GÃ¶rÃ¼nen hÃ¼crelerin dÃ¼z ortalamasÄ± â€” gerÃ§ek veriden tÃ¼retilir, Ã¶lÃ§Ã¼m uydurulmaz.
          ort: hucreler.reduce((t, c) => t + c.avgMastery, 0) / hucreler.length,
        }
      })
  }, [veri, ders])

  const seciliHucre = useMemo(() => {
    if (!unite) return null
    for (const b of bloklar) {
      const c = b.hucreler.find((h) => h.unitPath === unite)
      if (c) return c
    }
    return null // sÃ¼zgeÃ§ deÄŸiÅŸti ya da baÄŸlantÄ± eski â€” panel gizlenir, sahte hÃ¼cre Ã§izilmez
  }, [bloklar, unite])

  // SeÃ§ili hÃ¼crenin (ders Ã— Ã¼nite) zayÄ±f Ã–ÄRENCÄ° kÄ±rÄ±lÄ±mÄ± (GOREV-048 ucu, RPC 0023). SeÃ§im
  // yoksa aÄŸ Ã§aÄŸrÄ±sÄ± YOK (fn null'a Ã§Ã¶zÃ¼lÃ¼r). Deps Ä°LKEL: subject + unitPath deÄŸiÅŸince yeniden
  // Ã§ekilir. âš ï¸ Migration 0023 canlÄ±ya inene dek uÃ§ 500 isi_kirilim_okunamadi dÃ¶ner â€” beklenen;
  // hata yolu (aÅŸaÄŸÄ±da "kÄ±rÄ±lÄ±m yÃ¼klenemedi" + tekrar dene) ekranÄ± Ã§Ã¶kertmeden karÅŸÄ±lar.
  const kirilimSubject = seciliHucre?.subject ?? ''
  const kirilimUnite = seciliHucre?.unitPath ?? ''
  const kirilim = useAsync<IsiOgrenciKirilimiYaniti | null>(
    () =>
      kirilimSubject && kirilimUnite
        ? tGet('/teacher/sinif/isi-haritasi/ogrenciler', {
            subject: kirilimSubject,
            unitPath: kirilimUnite,
          })
        : Promise.resolve(null),
    [kirilimSubject, kirilimUnite],
  )
  // YanÄ±t yalnÄ±z SEÃ‡Ä°LÄ° Ã¼niteye aitse geÃ§erli â€” dep geÃ§iÅŸindeki bir kare bayat veri gÃ¶stermesin.
  const kirilimData =
    kirilim.data && kirilimUnite && kirilim.data.unitPath === kirilimUnite ? kirilim.data : null

  // SÄ±nÄ±f zayÄ±f listesinin bu Ã¼niteye dÃ¼ÅŸen kesiÅŸimi (path Ã¶neki â€” ltree).
  const uniteKazanimlari = useMemo(() => {
    if (!seciliHucre || !zayif.data) return []
    const kok = seciliHucre.unitPath
    return zayif.data.kazanimlar.filter((k) => k.path === kok || k.path.startsWith(kok + '.'))
  }, [seciliHucre, zayif.data])

  // SeÃ§im listede yoksa (Ã¼nite deÄŸiÅŸti) listenin baÅŸÄ±na â€” RPC "en zayÄ±f Ã¶nce" dÃ¶ndÃ¼rÃ¼r.
  const seciliKazanim =
    uniteKazanimlari.find((k) => k.kazanimId === kazanimSecim) ?? uniteKazanimlari[0] ?? null

  const hucreSec = (path: string, seciliMi: boolean): void => {
    setUnite(seciliMi ? null : path)
    setKazanimSecim(null)
  }

  const odevDerle = (): void => {
    if (!seciliKazanim) return
    // Mevcut derin-baÄŸlantÄ± sÃ¶zleÅŸmesi: Ã–dev AtÃ¶lyesi ?kazanim= & ?ders= Ã¶n-dolgusunu okur.
    nav(`/sinif/odev?kazanim=${seciliKazanim.kazanimId}&ders=${encodeURIComponent(seciliKazanim.subject)}`)
  }

  return (
    <Sayfa>
      <style>{STIL}</style>

      {isi.loading ? (
        <>
          <Skeleton className="h-11 w-full max-w-xl" />
          <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
            <Skeleton className="h-[420px]" />
            <Skeleton className="h-[320px]" />
          </div>
        </>
      ) : isi.error ? (
        <div className="si-kart mx-auto max-w-md px-6 py-8 text-center">
          <p style={{ color: 'var(--metin2)', fontSize: 13 }}>IsÄ± haritasÄ± alÄ±namadÄ±: {isi.error}</p>
          <button
            type="button"
            className="si-soluk-genis"
            style={{ width: 'auto', marginTop: 14 }}
            onClick={() => isi.reload()}
          >
            Tekrar dene
          </button>
        </div>
      ) : veri ? (
        <>
          {/* â”€â”€ BaÅŸlÄ±k + ders Ã§ipleri (URL) + lejant â”€â”€ */}
          <Reveal>
            <div className="si-arac">
              <h1>KazanÄ±m IsÄ± HaritasÄ±</h1>
              <button
                type="button"
                className={`si-cip${!ders ? ' aktif' : ''}`}
                aria-pressed={!ders}
                onClick={() => setDers(null)}
              >
                TÃ¼mÃ¼
              </button>
              {veri.subjects.map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`si-cip${ders === d ? ' aktif' : ''}`}
                  aria-pressed={ders === d}
                  onClick={() => setDers(ders === d ? null : d)}
                >
                  {dersBaslik(d)}
                </button>
              ))}
              {/* DeÄŸer asla yalnÄ±z renkle verilmez â€” her hÃ¼cre sayÄ±sÄ±nÄ± da taÅŸÄ±r;
                  lejant yalnÄ±z yÃ¶n okutur. "Ã–lÃ§Ã¼m yok" Ã¶gesi YOK: uÃ§ Ã¶lÃ§Ã¼msÃ¼z Ã¼nite
                  listesi dÃ¶ndÃ¼rmÃ¼yor (bkz. dosya baÅŸÄ± envanter notu). */}
              <div className="si-lejant">
                <span>dÃ¼ÅŸÃ¼k</span>
                <i aria-hidden style={{ background: 'var(--v1)' }} />
                <i aria-hidden style={{ background: 'var(--v2)' }} />
                <i aria-hidden style={{ background: 'var(--v3)' }} />
                <i aria-hidden style={{ background: 'var(--v4)' }} />
                <span>yÃ¼ksek</span>
              </div>
            </div>
          </Reveal>

          <div className="si-izgara">
            {/* â”€â”€ Matris: ders bloklarÄ± â†’ Ã¼nite hÃ¼creleri â”€â”€ */}
            <Reveal delay={0.06}>
              <section className="si-kart si-matris" aria-label="SÄ±nÄ±f ustalÄ±k matrisi">
                {bloklar.length === 0 ? (
                  <div className="si-bos">
                    <p className="baslik">
                      {ders && veri.cells.length > 0
                        ? `${dersBaslik(ders)} iÃ§in henÃ¼z Ã¶lÃ§Ã¼m yok.`
                        : 'SÄ±nÄ±f henÃ¼z Ã¶lÃ§Ã¼m Ã¼retmedi.'}
                    </p>
                    <p className="alt">
                      Ã–ÄŸrencilerin soru Ã§Ã¶zdÃ¼kÃ§e sÄ±nÄ±f haritasÄ± burada belirir â€” sahte hÃ¼cre Ã§izilmez.
                    </p>
                  </div>
                ) : (
                  <>
                    {bloklar.map((b) => (
                      <div className="si-blok" key={b.ders}>
                        <div className="si-blok-baslik">
                          <h3>{dersBaslik(b.ders)}</h3>
                          <span className="ort">
                            ders ort. %{yuzde(b.ort)} Â· {b.hucreler.length} Ã¼nite
                          </span>
                          <span className="cizgi" aria-hidden />
                        </div>
                        <div className="si-hucreler">
                          {b.hucreler.map((c) => {
                            const seciliMi = c.unitPath === unite
                            return (
                              <button
                                key={c.unitPath}
                                type="button"
                                className={`si-hucre t${ton(c.avgMastery, veri.esik.zayif)}${seciliMi ? ' secili' : ''}`}
                                aria-pressed={seciliMi}
                                aria-label={`${dersBaslik(b.ders)} â€” ${c.unitTitle ?? c.unitPath}: sÄ±nÄ±f ortalamasÄ± yÃ¼zde ${yuzde(c.avgMastery)}, ${c.studentCount} Ã¶ÄŸrenci Ã¶lÃ§Ã¼ldÃ¼`}
                                onClick={() => hucreSec(c.unitPath, seciliMi)}
                              >
                                <span className="ad">{c.unitTitle ?? c.unitPath}</span>
                                <span className="deger">
                                  %{yuzde(c.avgMastery)} Â· {c.studentCount} Ã¶ÄŸr.
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                    <p className="si-dipnot">
                      Ã§Ã¼rÃ¼me uygulanmÄ±ÅŸ Â· {veri.ogrenciSayisi} Ã¶ÄŸrenci Â· zayÄ±f eÅŸiÄŸi %{yuzde(veri.esik.zayif)}
                    </p>
                  </>
                )}
              </section>
            </Reveal>

            {/* â”€â”€ SeÃ§ili Ã¼nite paneli (yapÄ±ÅŸkan) â”€â”€ */}
            <div className="si-yapiskan" style={{ top: NAV_H + 24 }}>
              <Reveal delay={0.1}>
                <aside className="si-kart si-panel" aria-label="SeÃ§ili Ã¼nite paneli">
                  {!seciliHucre ? (
                    <>
                      <span className="si-mono">SeÃ§ili Ã¼nite</span>
                      <p className="si-ipucu">
                        Matristen bir hÃ¼cre seÃ§ â€” Ã¼nitenin sÄ±nÄ±f daÄŸÄ±lÄ±mÄ± ve zayÄ±f kazanÄ±mlarÄ±
                        burada aÃ§Ä±lÄ±r.
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="si-panel-ust">
                        <span className="si-mono">SeÃ§ili Ã¼nite</span>
                        <button
                          type="button"
                          className="si-kapat"
                          aria-label="Ãœnite seÃ§imini kapat"
                          onClick={() => hucreSec(seciliHucre.unitPath, true)}
                        >
                          <Icon name="close" size={14} color="currentColor" />
                        </button>
                      </div>
                      <h2>{seciliHucre.unitTitle ?? seciliHucre.unitPath}</h2>
                      <span className="si-ders-cip">
                        {dersBaslik(seciliHucre.subject)} Â· sÄ±nÄ±f ort. %{yuzde(seciliHucre.avgMastery)} Â·{' '}
                        {seciliHucre.studentCount} Ã¶ÄŸrenci Ã¶lÃ§Ã¼ldÃ¼
                      </span>

                      {/* DaÄŸÄ±lÄ±m â€” uÃ§ yalnÄ±z zayÄ±f/toplam verir â†’ Ä°KÄ° kelimeli bant.
                          4'lÃ¼ bant (baÅŸlangÄ±Ã§/geliÅŸiyor/oturuyor/gÃ¼Ã§lÃ¼) BACKEND iÅŸi ister. */}
                      <div className="si-dagilim">
                        <DagSatir
                          etiket="zayÄ±f â€” eÅŸik altÄ±"
                          adet={seciliHucre.weakStudentCount}
                          toplam={seciliHucre.studentCount}
                        />
                        <DagSatir
                          etiket="eÅŸik Ã¼stÃ¼"
                          adet={Math.max(0, seciliHucre.studentCount - seciliHucre.weakStudentCount)}
                          toplam={seciliHucre.studentCount}
                        />
                      </div>

                      {/* ZayÄ±f Ã¶ÄŸrenci kÄ±rÄ±lÄ±mÄ± â€” daÄŸÄ±lÄ±mÄ±n "eÅŸik altÄ±" sayÄ±sÄ±nÄ± isimli
                          satÄ±rlara aÃ§ar; her satÄ±r KarÅŸÄ±laÅŸtÄ±r'a kÃ¶prÃ¼. Sunucu sÄ±rasÄ± (en
                          zayÄ±f baÅŸta) KORUNUR; liste uzunluÄŸu = weakStudentCount (deÄŸiÅŸmez). */}
                      <div className="si-ogr-liste">
                        <h4>Bu Ã¼nitede eÅŸik altÄ± Ã¶ÄŸrenciler</h4>
                        {kirilim.loading || (!kirilim.error && !kirilimData) ? (
                          <Skeleton className="h-24" />
                        ) : kirilim.error ? (
                          <p className="si-not">
                            Ã–ÄŸrenci kÄ±rÄ±lÄ±mÄ± yÃ¼klenemedi: {kirilim.error}{' '}
                            <button type="button" className="si-baglanti" onClick={() => kirilim.reload()}>
                              tekrar dene
                            </button>
                          </p>
                        ) : kirilimData!.ogrenciler.length === 0 ? (
                          <p className="si-not">
                            Bu Ã¼nitede eÅŸik altÄ± Ã¶ÄŸrenci yok â€” Ã¶lÃ§Ã¼m eÅŸiÄŸini aÅŸan Ã¶ÄŸrenci
                            olmadÄ±kÃ§a satÄ±r uydurulmaz.
                          </p>
                        ) : (
                          kirilimData!.ogrenciler.map((o) => {
                            const ad = o.ad ?? `Ã–ÄŸrenci ${o.studentId.slice(0, 4)}`
                            return (
                              <button
                                key={o.studentId}
                                type="button"
                                className="si-ogr"
                                aria-label={`${ad} â€” Ã¼nite ustalÄ±ÄŸÄ± yÃ¼zde ${yuzde(o.mastery)}, ${o.attempts} deneme. KarÅŸÄ±laÅŸtÄ±rmada aÃ§.`}
                                onClick={() =>
                                  nav(`/sinif/karsilastir?ogrenci=${encodeURIComponent(o.studentId)}`)
                                }
                              >
                                <span className="kim">
                                  <span className="ad">{ad}</span>
                                  <span className="alt">
                                    %{yuzde(o.mastery)} ustalÄ±k Â· {o.attempts} deneme
                                  </span>
                                </span>
                                <span className="git">
                                  KarÅŸÄ±laÅŸtÄ±r
                                  <Icon name="gauge" size={13} color="currentColor" />
                                </span>
                              </button>
                            )
                          })
                        )}
                      </div>

                      <div className="si-kaz-liste">
                        <h4>SÄ±nÄ±f zayÄ±f listesinde bu Ã¼niteden kazanÄ±mlar</h4>
                        {zayif.loading ? (
                          <Skeleton className="h-16" />
                        ) : zayif.error ? (
                          <p className="si-not">
                            ZayÄ±f kazanÄ±m listesi alÄ±namadÄ±: {zayif.error}{' '}
                            <button type="button" className="si-baglanti" onClick={() => zayif.reload()}>
                              tekrar dene
                            </button>
                          </p>
                        ) : uniteKazanimlari.length === 0 ? (
                          <p className="si-not">
                            Bu Ã¼niteden sÄ±nÄ±f zayÄ±f listesine dÃ¼ÅŸen kazanÄ±m yok â€” Ã¶lÃ§Ã¼m eÅŸiÄŸi
                            aÅŸÄ±lmadÄ±ysa satÄ±r uydurulmaz.
                          </p>
                        ) : (
                          uniteKazanimlari.map((k) => {
                            const seciliMi = seciliKazanim?.kazanimId === k.kazanimId
                            return (
                              <button
                                key={k.kazanimId}
                                type="button"
                                className={`si-kaz${seciliMi ? ' secili' : ''}`}
                                aria-pressed={seciliMi}
                                onClick={() => setKazanimSecim(k.kazanimId)}
                              >
                                <span className="baslik">{k.title}</span>
                                <span className="alt">
                                  {k.code ? `${k.code} Â· ` : ''}%{yuzde(k.avgWrongRate)} yanlÄ±ÅŸ Â·{' '}
                                  {k.weakStudentCount} zayÄ±f Ã¶ÄŸrenci Â· havuzda {k.havuzdaSoru.ai} soru
                                </span>
                              </button>
                            )
                          })
                        )}
                      </div>

                      {/* TEK birincil eylem â€” havuzda soru yoksa buton dÃ¼rÃ¼stÃ§e kapanÄ±r. */}
                      {seciliKazanim ? (
                        <>
                          <button
                            type="button"
                            className="si-cta"
                            disabled={seciliKazanim.havuzdaSoru.ai === 0}
                            onClick={odevDerle}
                          >
                            Bu kazanÄ±mdan Ã¶dev derle
                          </button>
                          {seciliKazanim.havuzdaSoru.ai === 0 && (
                            <p className="si-not">
                              Havuzda bu kazanÄ±m iÃ§in doÄŸrulanmÄ±ÅŸ soru yok â€” Ã¶dev derlenemez.
                            </p>
                          )}
                        </>
                      ) : (
                        !zayif.loading && (
                          <button
                            type="button"
                            className="si-soluk-genis"
                            onClick={() =>
                              nav(`/sinif/odev?ders=${encodeURIComponent(seciliHucre.subject)}`)
                            }
                          >
                            Ã–dev AtÃ¶lyesi'ni bu dersle aÃ§
                          </button>
                        )
                      )}
                    </>
                  )}
                </aside>
              </Reveal>
            </div>
          </div>
        </>
      ) : null}
    </Sayfa>
  )
}

/** Kelimeli daÄŸÄ±lÄ±m bandÄ± â€” asla yalnÄ±z renk: etiket + Ã§ubuk + adet birlikte. */
function DagSatir({ etiket, adet, toplam }: { etiket: string; adet: number; toplam: number }) {
  const oran = toplam > 0 ? Math.round((adet / toplam) * 100) : 0
  return (
    <div className="si-dag-satir">
      <span className="etiket">{etiket}</span>
      <span className="cubuk" role="img" aria-label={`${etiket}: ${toplam} Ã¶ÄŸrencinin ${adet} tanesi`}>
        <i style={{ width: `${oran}%` }} />
      </span>
      <span className="adet">{adet} Ã¶ÄŸrenci</span>
    </div>
  )
}
