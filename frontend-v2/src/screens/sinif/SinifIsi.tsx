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
 * KAZANIM ISI HARİTASI — FİDAN v1.2 inline desen (`si-*`), onaylı önizleme:
 * docs/design/onizleme/kazanim-isi-haritasi.html (GOREV-035).
 *
 * MOCK YASAK — üç GERÇEK uç:
 *   GET /teacher/sinif/isi-haritasi              → ders × ÜNİTE hücreleri (ltree ilk 2 seviye)
 *   GET /teacher/sinif/zayif-kazanimlar          → sınıfın kazanım-düzeyi zayıf listesi (panel köprüsü)
 *   GET /teacher/sinif/isi-haritasi/ogrenciler   → seçili hücrenin zayıf ÖĞRENCİ kırılımı (GOREV-049)
 *
 * Önizlemeden BİLİNÇLİ sapmalar (uç veriyi vermiyor → parça GİZLENDİ, uydurulmadı):
 *   · Matris granülü konu→kazanım değil ders→ünite: RPC ltree ilk 2 seviyeyi döndürür.
 *   · "Ölçüm yok" kesikli hücre YOK: RPC yalnız ölçülen satırları döndürür; ölçümsüz
 *     ünitelerin tam listesi yanıtsız. Lejanttaki "ölçüm yok" ögesi de bu yüzden yok.
 *   · Dağılım 4 bant değil 2 dürüst bant (zayıf eşik altı / eşik üstü): uç yalnız
 *     weakStudentCount/studentCount verir; eşik backend'den (esik.zayif) gelir.
 *   · [ÇÖZÜLDÜ · GOREV-049] Ünite başına zayıf ÖĞRENCİ kırılımı: hücre seçilince
 *     GET /teacher/sinif/isi-haritasi/ogrenciler ucundan en-zayıf-başta öğrenci listesi
 *     gelir (kazanım paneliyle kardeş). Tutarlılık: liste uzunluğu = weakStudentCount.
 *   · Öğrenci satırı RÖNTGEN'e gider (/sinif/ogrenci/<id>). Eskiden Karşılaştır'ı tek
 *     öğrenciyle açıyordu; Karşılaştır ikiden az seçimde ızgarayı çizmediği için satır
 *     çıkmaz sokaktı. Karşılaştırma girişi Sınıf Panosu'ndaki çoklu seçim şerididir.
 *   Kalan yapısal sapma (granül ders→ünite, "ölçüm yok" hücreleri) RAPOR'da BACKEND kartı
 *   önerisiyle listelendi.
 *
 * Harita TEK istekte filtresiz çekilir; ders süzgeci İSTEMCİDE uygulanır. subject paramlı
 * istek yalnız seçili dersin subjects listesini döndürür → diğer çipler kaybolurdu;
 * ayrıca çip başına refetch olmazdı da olurdu. Veri ölçeği küçük (~40 hücre).
 */

/** avgMastery → 4 adaçayı tonu. Skalanın kökü backend eşiği: v1 = zayıf eşiği ALTI,
    kalan [esik..1] aralığı üç eşit banda bölünür (renk skalası tek kaynaktan kurulur). */
function ton(ort: number, zayifEsik: number): 1 | 2 | 3 | 4 {
  if (ort < zayifEsik) return 1
  const adim = Math.max(0.0001, (1 - zayifEsik) / 3)
  if (ort < zayifEsik + adim) return 2
  if (ort < zayifEsik + 2 * adim) return 3
  return 4
}

const yuzde = (x: number): number => Math.round(x * 100)

/** "matematik" → "Matematik" (tr). Görsel başlık — anahtar değeri URL'de ham kalır. */
const dersBaslik = (s: string): string =>
  s ? s.charAt(0).toLocaleUpperCase('tr-TR') + s.slice(1) : s

const STIL = `
  /* Ambiyans yaprak katmanı bu ekranda KAPALI — yoğun veri yüzeyi (önizleme notu). */
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

  /* Zayıf öğrenci kırılımı — dağılımın "eşik altı" sayısını isimli satırlara açar.
     Her satır Karşılaştır'a köprü; en zayıf başta (sunucu sırası korunur). */
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

  /* Hareket yalnız tercih edene: hover kalkışları gateli (kabul kriteri). */
  @media (prefers-reduced-motion: no-preference) {
    .si-hucre:hover { transform: translateY(-2px) scale(1.02); }
    .si-cta:hover:not(:disabled) { transform: translateY(-1px); }
  }
`

export function SinifIsi() {
  const nav = useSinifNav()
  // Drill-down state URL'de (replace:true, varsayılan silinir) — paylaşılabilir bağlantı.
  const [ders, setDers] = useSorgu<string>('ders', '')
  const [unite, setUnite] = useSorgu<string>('unite', '')
  // Panel içi kazanım seçimi GEÇİCİ (akordeon türü) — URL'e yazılmaz.
  const [kazanimSecim, setKazanimSecim] = useState<number | null>(null)

  // ⚠️ Bağımlılıklar İLKEL (useAsync deps'i effect dizisine yayar) — burada sabit [].
  const isi = useAsync<IsiHaritasiYaniti>((signal) => tGet('/teacher/sinif/isi-haritasi', {}, { signal }), [])
  const zayif = useAsync<SinifZayifYaniti>(
    () => tGet('/teacher/sinif/zayif-kazanimlar', { limit: 100 }),
    [],
  )

  const veri = isi.data

  // Ders blokları: subjects sırası korunur, ders süzgeci istemcide.
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
          // Görünen hücrelerin düz ortalaması — gerçek veriden türetilir, ölçüm uydurulmaz.
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
    return null // süzgeç değişti ya da bağlantı eski — panel gizlenir, sahte hücre çizilmez
  }, [bloklar, unite])

  // Seçili hücrenin (ders × ünite) zayıf ÖĞRENCİ kırılımı (GOREV-048 ucu, RPC 0023). Seçim
  // yoksa ağ çağrısı YOK (fn null'a çözülür). Deps İLKEL: subject + unitPath değişince yeniden
  // çekilir. ⚠️ Migration 0023 canlıya inene dek uç 500 isi_kirilim_okunamadi döner — beklenen;
  // hata yolu (aşağıda "kırılım yüklenemedi" + tekrar dene) ekranı çökertmeden karşılar.
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
  // Yanıt yalnız SEÇİLİ üniteye aitse geçerli — dep geçişindeki bir kare bayat veri göstermesin.
  const kirilimData =
    kirilim.data && kirilimUnite && kirilim.data.unitPath === kirilimUnite ? kirilim.data : null

  // Sınıf zayıf listesinin bu üniteye düşen kesişimi (path öneki — ltree).
  const uniteKazanimlari = useMemo(() => {
    if (!seciliHucre || !zayif.data) return []
    const kok = seciliHucre.unitPath
    return zayif.data.kazanimlar.filter((k) => k.path === kok || k.path.startsWith(kok + '.'))
  }, [seciliHucre, zayif.data])

  // Seçim listede yoksa (ünite değişti) listenin başına — RPC "en zayıf önce" döndürür.
  const seciliKazanim =
    uniteKazanimlari.find((k) => k.kazanimId === kazanimSecim) ?? uniteKazanimlari[0] ?? null

  const hucreSec = (path: string, seciliMi: boolean): void => {
    setUnite(seciliMi ? null : path)
    setKazanimSecim(null)
  }

  /**
   * Ders çipi — seçili ÜNİTE de düşürülür.
   *
   * Eskiden yalnız `ders` yazılıyordu: `unite` URL'de kalıyordu ve artık görünmeyen bir
   * bloğa ait oluyordu. Panel gizlendiği için ekran yanlış bir şey GÖSTERMİYORDU ama
   * adres bayat kalıyor, öğretmen eski derse döndüğünde hiç seçmediği bir ünite açılmış
   * geliyordu (ve paylaşılan bağlantı da o hâli taşıyordu).
   */
  const dersSec = (d: string | null): void => {
    setDers(d)
    setUnite(null)
    setKazanimSecim(null)
  }

  const odevDerle = (): void => {
    if (!seciliKazanim) return
    // Mevcut derin-bağlantı sözleşmesi: Ödev Atölyesi ?kazanim= & ?ders= ön-dolgusunu okur.
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
          <p style={{ color: 'var(--metin2)', fontSize: 13 }}>Isı haritası alınamadı: {isi.error}</p>
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
          {/* ── Başlık + ders çipleri (URL) + lejant ── */}
          <Reveal>
            <div className="si-arac">
              <h1>Kazanım Isı Haritası</h1>
              <button
                type="button"
                className={`si-cip${!ders ? ' aktif' : ''}`}
                aria-pressed={!ders}
                onClick={() => dersSec(null)}
              >
                Tümü
              </button>
              {veri.subjects.map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`si-cip${ders === d ? ' aktif' : ''}`}
                  aria-pressed={ders === d}
                  onClick={() => dersSec(ders === d ? null : d)}
                >
                  {dersBaslik(d)}
                </button>
              ))}
              {/* Değer asla yalnız renkle verilmez — her hücre sayısını da taşır;
                  lejant yalnız yön okutur. "Ölçüm yok" ögesi YOK: uç ölçümsüz ünite
                  listesi döndürmüyor (bkz. dosya başı envanter notu). */}
              <div className="si-lejant">
                <span>düşük</span>
                <i aria-hidden style={{ background: 'var(--v1)' }} />
                <i aria-hidden style={{ background: 'var(--v2)' }} />
                <i aria-hidden style={{ background: 'var(--v3)' }} />
                <i aria-hidden style={{ background: 'var(--v4)' }} />
                <span>yüksek</span>
              </div>
            </div>
          </Reveal>

          <div className="si-izgara">
            {/* ── Matris: ders blokları → ünite hücreleri ── */}
            <Reveal delay={0.06}>
              <section className="si-kart si-matris" aria-label="Sınıf ustalık matrisi">
                {bloklar.length === 0 ? (
                  <div className="si-bos">
                    <p className="baslik">
                      {ders && veri.cells.length > 0
                        ? `${dersBaslik(ders)} için henüz ölçüm yok.`
                        : 'Sınıf henüz ölçüm üretmedi.'}
                    </p>
                    <p className="alt">
                      Öğrencilerin soru çözdükçe sınıf haritası burada belirir — sahte hücre çizilmez.
                    </p>
                  </div>
                ) : (
                  <>
                    {bloklar.map((b) => (
                      <div className="si-blok" key={b.ders}>
                        <div className="si-blok-baslik">
                          <h3>{dersBaslik(b.ders)}</h3>
                          <span className="ort">
                            ders ort. %{yuzde(b.ort)} · {b.hucreler.length} ünite
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
                                aria-label={`${dersBaslik(b.ders)} — ${c.unitTitle ?? c.unitPath}: sınıf ortalaması yüzde ${yuzde(c.avgMastery)}, ${c.studentCount} öğrenci ölçüldü`}
                                onClick={() => hucreSec(c.unitPath, seciliMi)}
                              >
                                <span className="ad">{c.unitTitle ?? c.unitPath}</span>
                                <span className="deger">
                                  %{yuzde(c.avgMastery)} · {c.studentCount} öğr.
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                    {/* ⚠️ KAPSAM AÇIKÇA YAZILIR. Eskiden buradaki tek sayı "en kalabalık
                        hücrenin ölçüm sayısı"ydı ama "N öğrenci" diye okunuyordu: 30 kişilik
                        sınıfta "9 öğrenci" yazıyor, öğretmen haritanın sınıfın tamamını
                        gösterdiğini sanıyordu. İki sayı birlikte söylenir. */}
                    <p className="si-dipnot">
                      çürüme uygulanmış · {veri.ogrenciSayisi} öğrencinin {veri.olculenOgrenci}'i
                      ölçüldü · zayıf eşiği %{yuzde(veri.esik.zayif)}
                    </p>
                  </>
                )}
              </section>
            </Reveal>

            {/* ── Seçili ünite paneli (yapışkan) ── */}
            <div className="si-yapiskan" style={{ top: NAV_H + 24 }}>
              <Reveal delay={0.1}>
                <aside className="si-kart si-panel" aria-label="Seçili ünite paneli">
                  {!seciliHucre ? (
                    <>
                      <span className="si-mono">Seçili ünite</span>
                      <p className="si-ipucu">
                        Matristen bir hücre seç — ünitenin sınıf dağılımı ve zayıf kazanımları
                        burada açılır.
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="si-panel-ust">
                        <span className="si-mono">Seçili ünite</span>
                        <button
                          type="button"
                          className="si-kapat"
                          aria-label="Ünite seçimini kapat"
                          onClick={() => hucreSec(seciliHucre.unitPath, true)}
                        >
                          <Icon name="close" size={14} color="currentColor" />
                        </button>
                      </div>
                      <h2>{seciliHucre.unitTitle ?? seciliHucre.unitPath}</h2>
                      <span className="si-ders-cip">
                        {dersBaslik(seciliHucre.subject)} · sınıf ort. %{yuzde(seciliHucre.avgMastery)} ·{' '}
                        {seciliHucre.studentCount} öğrenci ölçüldü
                      </span>

                      {/* Dağılım — uç yalnız zayıf/toplam verir → İKİ kelimeli bant.
                          4'lü bant (başlangıç/gelişiyor/oturuyor/güçlü) BACKEND işi ister. */}
                      <div className="si-dagilim">
                        <DagSatir
                          etiket="zayıf — eşik altı"
                          adet={seciliHucre.weakStudentCount}
                          toplam={seciliHucre.studentCount}
                        />
                        <DagSatir
                          etiket="eşik üstü"
                          adet={Math.max(0, seciliHucre.studentCount - seciliHucre.weakStudentCount)}
                          toplam={seciliHucre.studentCount}
                        />
                      </div>

                      {/* Zayıf öğrenci kırılımı — dağılımın "eşik altı" sayısını isimli
                          satırlara açar; her satır Karşılaştır'a köprü. Sunucu sırası (en
                          zayıf başta) KORUNUR; liste uzunluğu = weakStudentCount (değişmez). */}
                      <div className="si-ogr-liste">
                        <h4>Bu ünitede eşik altı öğrenciler</h4>
                        {kirilim.loading || (!kirilim.error && !kirilimData) ? (
                          <Skeleton className="h-24" />
                        ) : kirilim.error ? (
                          <p className="si-not">
                            Öğrenci kırılımı yüklenemedi: {kirilim.error}{' '}
                            <button type="button" className="si-baglanti" onClick={() => kirilim.reload()}>
                              tekrar dene
                            </button>
                          </p>
                        ) : kirilimData!.ogrenciler.length === 0 ? (
                          <p className="si-not">
                            Bu ünitede eşik altı öğrenci yok — ölçüm eşiğini aşan öğrenci
                            olmadıkça satır uydurulmaz.
                          </p>
                        ) : (
                          kirilimData!.ogrenciler.map((o) => {
                            const ad = o.ad ?? `Öğrenci ${o.studentId.slice(0, 4)}`
                            return (
                              <button
                                key={o.studentId}
                                type="button"
                                className="si-ogr"
                                aria-label={`${ad} — ünite ustalığı yüzde ${yuzde(o.mastery)}, ${o.attempts} deneme. Röntgeni aç.`}
                                /**
                                 * ⚠️ RÖNTGEN, KARŞILAŞTIRMA DEĞİL. Satır tek öğrenciyle
                                 * `/sinif/karsilastir?ogrenci=<id>` açıyordu; Karşılaştır ise
                                 * ikiden az seçimde ızgarayı hiç çizmez ve "En az iki öğrenci
                                 * seç" boş durumuna düşer. Yani eşik altı listede en zayıf
                                 * öğrenciye tıklayan öğretmen, aradığı bilgiye (o öğrencinin
                                 * durumu) ulaşamadan çıkmaz sokakta kalıyordu.
                                 */
                                onClick={() => nav(`/sinif/ogrenci/${o.studentId}`)}
                              >
                                <span className="kim">
                                  <span className="ad">{ad}</span>
                                  <span className="alt">
                                    %{yuzde(o.mastery)} ustalık · {o.attempts} deneme
                                  </span>
                                </span>
                                {/* ⚠️ ETİKET HEDEFLE AYNI ŞEYİ SÖYLER. Satırın gittiği yer
                                    Röntgen'e çevrildi ama etiket "Karşılaştır" kalmıştı:
                                    aria-label "Röntgeni aç" derken gözle okunan söz başka
                                    bir ekran vaat ediyordu — ekran okuyucu kullanan ve
                                    kullanmayan öğretmen farklı iki şey duyuyordu. */}
                                <span className="git">
                                  Röntgen
                                  <Icon name="scan" size={13} color="currentColor" />
                                </span>
                              </button>
                            )
                          })
                        )}
                      </div>

                      <div className="si-kaz-liste">
                        <h4>Sınıf zayıf listesinde bu üniteden kazanımlar</h4>
                        {zayif.loading ? (
                          <Skeleton className="h-16" />
                        ) : zayif.error ? (
                          <p className="si-not">
                            Zayıf kazanım listesi alınamadı: {zayif.error}{' '}
                            <button type="button" className="si-baglanti" onClick={() => zayif.reload()}>
                              tekrar dene
                            </button>
                          </p>
                        ) : uniteKazanimlari.length === 0 ? (
                          <p className="si-not">
                            Bu üniteden sınıf zayıf listesine düşen kazanım yok — ölçüm eşiği
                            aşılmadıysa satır uydurulmaz.
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
                                  {k.code ? `${k.code} · ` : ''}%{yuzde(k.avgWrongRate)} yanlış ·{' '}
                                  {k.weakStudentCount} zayıf öğrenci · havuzda {k.havuzdaSoru.ai} soru
                                </span>
                              </button>
                            )
                          })
                        )}
                      </div>

                      {/* TEK birincil eylem — havuzda soru yoksa buton dürüstçe kapanır. */}
                      {seciliKazanim ? (
                        <>
                          <button
                            type="button"
                            className="si-cta"
                            disabled={seciliKazanim.havuzdaSoru.ai === 0}
                            onClick={odevDerle}
                          >
                            Bu kazanımdan ödev derle
                          </button>
                          {seciliKazanim.havuzdaSoru.ai === 0 && (
                            <p className="si-not">
                              Havuzda bu kazanım için doğrulanmış soru yok — ödev derlenemez.
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
                            Ödev Atölyesi'ni bu dersle aç
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

/** Kelimeli dağılım bandı — asla yalnız renk: etiket + çubuk + adet birlikte. */
function DagSatir({ etiket, adet, toplam }: { etiket: string; adet: number; toplam: number }) {
  const oran = toplam > 0 ? Math.round((adet / toplam) * 100) : 0
  return (
    <div className="si-dag-satir">
      <span className="etiket">{etiket}</span>
      <span className="cubuk" role="img" aria-label={`${etiket}: ${toplam} öğrencinin ${adet} tanesi`}>
        <i style={{ width: `${oran}%` }} />
      </span>
      <span className="adet">{adet} öğrenci</span>
    </div>
  )
}
