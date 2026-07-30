import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { apiGet } from '../../lib/api'
import { useAsync } from '../../lib/useAsync'
import { cn } from '../../lib/cn'
import { Icon } from '../../ui'
import { EYLEM_ADI, type AdminDenetimYaniti, type DenetimSatiri, type YonetimEylemi } from '../../lib/types.admin'
import { Sayfa, PanoIskeleti } from '../../components/RolGecidi'
import { GlowButton } from '../../components/ui'
import { CanliSayi } from '../../components/cekirdek'
import { Reveal } from '../../components/fx'
import { detayOzeti } from '../../components/yonetim'

/**
 * DENETİM DEFTERİ — yönetim eylemlerinin tam, filtrelenebilir kaydı (0025).
 *
 * ⚠️ BU EKRAN NEDEN VAR: uç (GET /admin/denetim) sayfalama ve filtre destekliyordu
 * ama arayüzde yalnız Kullanıcılar ekranının köşesindeki son 12 kayıt görünüyordu.
 * "Bu hesabı kim yönetici yaptı?" ya da "bu soruyu kim düşürdü?" sorusu 12 kaydın
 * ötesine geçtiği an cevapsız kalıyordu — yani defter vardı, okunamıyordu.
 *
 * ⚠️ DEFTER APPEND-ONLY (0020 tetikleyicisi). Burada silme/düzenme YOK ve olmayacak:
 * değiştirilebilir bir denetim defteri denetim değildir.
 */
const SAYFA = 50

/** Filtre menüsündeki gruplama — 20 eylemi düz liste yapmak seçilemez hâle getirirdi. */
const GRUPLAR: Array<{ baslik: string; eylemler: YonetimEylemi[] }> = [
  { baslik: 'Hesap', eylemler: ['hesap_olustur', 'rol_degis', 'ogretmen_onay', 'sinif_ata', 'profil_duzelt', 'sifre_sifirla', 'hesap_askiya', 'hesap_geri_al', 'basvuru_reddet'] },
  { baslik: 'Havuz', eylemler: ['soru_dogrulama', 'soru_karantina', 'soru_etiket', 'uretim_tetik'] },
  { baslik: 'Sistem', eylemler: ['esik_degis', 'eval_tetik', 'onbellek_dus', 'gorev_yeniden', 'gorev_iptal'] },
  { baslik: 'Vekil', eylemler: ['ogretmen_adina_odev', 'ogretmen_adina_ogrenci'] },
]

export function Denetim() {
  const [eylem, setEylem] = useState<YonetimEylemi | ''>('')
  const [adminId, setAdminId] = useState('')
  const [baslangic, setBaslangic] = useState('')
  const [bitis, setBitis] = useState('')
  const [sayfa, setSayfa] = useState(0)

  const defter = useAsync<AdminDenetimYaniti>(
    () => apiGet('/admin/denetim', {
      limit: SAYFA,
      offset: sayfa * SAYFA,
      ...(eylem ? { eylem } : {}),
      ...(adminId ? { adminId } : {}),
      ...(baslangic ? { baslangic } : {}),
      ...(bitis ? { bitis } : {}),
    }),
    // ⚠️ İLKEL bağımlılıklar — nesne geçmek sonsuz refetch üretir (useAsync.ts:19).
    [eylem, adminId, baslangic, bitis, sayfa],
  )

  const filtreVar = Boolean(eylem || adminId || baslangic || bitis)
  const sifirla = (): void => {
    setEylem(''); setAdminId(''); setBaslangic(''); setBitis(''); setSayfa(0)
  }

  const d = defter.data
  const sayfaSayisi = useMemo(() => Math.max(1, Math.ceil((d?.total ?? 0) / SAYFA)), [d?.total])

  /**
   * CSV indir — YALNIZ GÖRÜNEN SAYFA. Bunu söylemek şart: "denetim kaydını dışa
   * aktardım" sanıp 50 satırla yetinen bir yönetici, olmayan bir tamlık varsayar.
   */
  const csvIndir = (): void => {
    if (!d?.kayitlar.length) return
    const kacis = (v: unknown): string => `"${String(v ?? '').replace(/"/g, '""')}"`
    const satirlar = [
      ['tarih', 'eylem', 'yonetici', 'hedef', 'hedefTur', 'ozet', 'detay'].join(','),
      ...d.kayitlar.map((k) => [
        kacis(k.createdAt),
        kacis(EYLEM_ADI[k.eylem] ?? k.eylem),
        kacis(k.adminAdi ?? k.adminId),
        kacis(k.hedefAdi ?? k.hedefId ?? ''),
        kacis(k.hedefTur ?? ''),
        kacis(detayOzeti(k) ?? ''),
        kacis(JSON.stringify(k.detay ?? {})),
      ].join(',')),
    ].join('\n')

    // BOM: Excel UTF-8'i BOM'suz açtığında Türkçe karakterler bozuluyor.
    const blob = new Blob([`﻿${satirlar}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `denetim-sayfa-${sayfa + 1}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`${d.kayitlar.length} kayıt indirildi (yalnız bu sayfa)`)
  }

  if (defter.loading && !d) return <PanoIskeleti sutun={1} />

  if (defter.error) {
    return (
      <Sayfa>
        <div
          className="mx-auto max-w-md rounded-2xl px-6 py-8 text-center"
          style={{ background: 'var(--cam)', border: '1px solid var(--cam-kenar)', boxShadow: 'var(--golge)' }}
        >
          <p className="text-sm" style={{ color: 'var(--metin2)' }}>Defter alınamadı: {defter.error}</p>
          <GlowButton className="mt-4" variant="outline" onClick={() => defter.reload()}>Tekrar dene</GlowButton>
        </div>
      </Sayfa>
    )
  }

  return (
    <Sayfa>
      <style>{`
        .dn-kart { background: var(--cam); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
          border: 1px solid var(--cam-kenar); border-radius: 20px; box-shadow: var(--golge); }
        .dn-baslik { padding: 16px 22px; }
        .dn-baslik h1 { font-family: Outfit, sans-serif; font-weight: 800; font-size: clamp(20px, 2.4vw, 24px); color: var(--metin1); }
        .dn-baslik .alt { font-size: 12.5px; color: var(--metin3); margin-top: 4px; line-height: 1.5; max-width: 640px; }
        .dn-muhur { float: right; font-family: 'JetBrains Mono', monospace; font-size: 10.5px; padding: 5px 12px;
          border-radius: 11px; background: var(--v0); color: var(--metin3); }

        .dn-panel { padding: 18px 22px; margin-top: 20px; }
        .dn-filtreler { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
        @media (max-width: 900px) { .dn-filtreler { grid-template-columns: repeat(2, 1fr); } }
        .dn-alan { display: block; }
        .dn-alan .etiket { display: block; font-size: 10px; font-weight: 600; letter-spacing: .1em;
          text-transform: uppercase; color: var(--metin3); margin-bottom: 5px; }
        .dn-alan select, .dn-alan input { width: 100%; font-family: Inter, sans-serif; font-size: 12.5px;
          color: var(--metin1); background: var(--v0); border: 1.5px solid var(--cam-kenar);
          border-radius: 11px; padding: 9px 11px; min-height: 42px; outline: none; }
        .dn-alan select:focus, .dn-alan input:focus { border-color: var(--adacayi); }

        .dn-arac { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 14px;
          padding-top: 13px; border-top: 1px solid var(--cam-kenar); }
        .dn-sayim { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--metin3); margin-right: auto; }
        .dn-btn { font-family: Outfit, sans-serif; font-weight: 600; font-size: 12px; border-radius: 11px;
          cursor: pointer; border: 1px solid var(--cam-kenar); background: var(--v0); color: var(--metin2);
          min-height: 40px; padding: 9px 14px; display: inline-flex; align-items: center; gap: 6px; }
        .dn-btn:hover { color: var(--metin1); border-color: var(--adacayi); }
        .dn-btn:disabled { opacity: .45; cursor: default; }

        .dn-tablo { width: 100%; border-collapse: collapse; font-size: 12.5px; margin-top: 4px; }
        .dn-sarmal { overflow-x: auto; }
        .dn-tablo th { text-align: left; font-family: 'JetBrains Mono', monospace; font-size: 9.5px;
          letter-spacing: .1em; text-transform: uppercase; color: var(--metin3); font-weight: 500;
          padding: 8px 10px; border-bottom: 1px solid var(--cam-kenar); white-space: nowrap; }
        .dn-tablo td { padding: 11px 10px; border-bottom: 1px solid var(--cam-kenar); color: var(--metin2);
          vertical-align: top; }
        .dn-tablo tbody tr:hover td { background: var(--v0); }
        .dn-zaman { font-family: 'JetBrains Mono', monospace; font-size: 10.5px; color: var(--metin3); white-space: nowrap; }
        .dn-eylem { font-weight: 600; color: var(--metin1); white-space: nowrap; }
        .dn-hedef { color: var(--metin2); }
        .dn-tur { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 8px;
          background: var(--v0); color: var(--metin3); white-space: nowrap; }
        .dn-tur.dn-t-ogretmen { background: color-mix(in srgb, var(--bilgi) 16%, transparent); color: var(--bilgi); }
        .dn-tur.dn-t-sistem { background: color-mix(in srgb, var(--toprak) 18%, transparent); color: var(--toprak); }
        .dn-ozet { color: var(--metin2); line-height: 1.5; }
        .dn-bos { text-align: center; padding: 34px 20px; font-size: 13px; color: var(--metin3); line-height: 1.6; }
        .dn-uyari { font-size: 12.5px; line-height: 1.6; color: var(--metin2); }
      `}</style>

      <Reveal>
        <section className="dn-kart dn-baslik">
          <span className="dn-muhur">append-only</span>
          <h1>Denetim Defteri</h1>
          <p className="alt">
            Her yönetim işleminin kalıcı kaydı. Satırlar <strong>değiştirilemez ve silinemez</strong> —
            veritabanı tetikleyicisi update/delete/truncate'i engeller.
          </p>
        </section>
      </Reveal>

      {d?.defterYok ? (
        <Reveal delay={0.06}>
          <section className="dn-kart dn-panel">
            <p className="dn-uyari">
              Defter tablosu henüz yok —{' '}
              <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>0020_yonetim_denetim.sql</span>{' '}
              uygulanmamış. Bu, "hiç yönetim işlemi yapılmadı" demek <strong>değildir</strong>: işlemler
              yapılıyor ama kaydedilmiyor. Migration uygulanana kadar rol değişimleri, askılar ve havuz
              müdahaleleri izsiz kalıyor.
            </p>
          </section>
        </Reveal>
      ) : (
        <>
          <Reveal delay={0.04}>
            <div className="dn-statlar" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginTop: 22 }}>
              <section className="dn-kart" style={{ padding: '15px 18px' }}>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--metin3)' }}>
                  {filtreVar ? 'Filtreye Uyan' : 'Toplam Kayıt'}
                </div>
                <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 23, fontWeight: 800, marginTop: 5, color: 'var(--metin1)' }}>
                  <CanliSayi value={d?.total ?? 0} />
                </div>
              </section>
              <section className="dn-kart" style={{ padding: '15px 18px' }}>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--metin3)' }}>
                  Yönetici
                </div>
                <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 23, fontWeight: 800, marginTop: 5, color: 'var(--metin1)' }}>
                  <CanliSayi value={d?.yoneticiler.length ?? 0} />
                </div>
              </section>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <section className="dn-kart dn-panel">
              <div className="dn-filtreler">
                <label className="dn-alan">
                  <span className="etiket">Eylem</span>
                  <select value={eylem} onChange={(e) => { setEylem(e.target.value as YonetimEylemi | ''); setSayfa(0) }}>
                    <option value="">Hepsi</option>
                    {GRUPLAR.map((g) => (
                      <optgroup key={g.baslik} label={g.baslik}>
                        {g.eylemler.map((ey) => <option key={ey} value={ey}>{EYLEM_ADI[ey]}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </label>
                <label className="dn-alan">
                  <span className="etiket">Yönetici</span>
                  <select value={adminId} onChange={(e) => { setAdminId(e.target.value); setSayfa(0) }}>
                    <option value="">Hepsi</option>
                    {(d?.yoneticiler ?? []).map((y) => (
                      <option key={y.id} value={y.id}>{y.ad ?? 'İsimsiz yönetici'}</option>
                    ))}
                  </select>
                </label>
                <label className="dn-alan">
                  <span className="etiket">Başlangıç</span>
                  <input type="date" value={baslangic} onChange={(e) => { setBaslangic(e.target.value); setSayfa(0) }} />
                </label>
                <label className="dn-alan">
                  <span className="etiket">Bitiş</span>
                  <input type="date" value={bitis} onChange={(e) => { setBitis(e.target.value); setSayfa(0) }} />
                </label>
              </div>

              <div className="dn-arac">
                <span className="dn-sayim">
                  {d?.total
                    ? `${sayfa * SAYFA + 1}–${Math.min((sayfa + 1) * SAYFA, d.total)} / ${d.total}`
                    : '0 kayıt'}
                </span>
                {filtreVar && (
                  <button type="button" className="dn-btn" onClick={sifirla}>
                    <Icon name="close" size={13} color="currentColor" />
                    Filtreleri temizle
                  </button>
                )}
                <button type="button" className="dn-btn" disabled={!d?.kayitlar.length} onClick={csvIndir}>
                  <Icon name="book" size={13} color="currentColor" />
                  Bu sayfayı CSV indir
                </button>
                <button type="button" className="dn-btn" disabled={sayfa === 0} onClick={() => setSayfa((s) => Math.max(0, s - 1))}>
                  Önceki
                </button>
                <button type="button" className="dn-btn" disabled={sayfa + 1 >= sayfaSayisi} onClick={() => setSayfa((s) => s + 1)}>
                  Sonraki
                </button>
              </div>

              {!d?.kayitlar.length ? (
                <p className="dn-bos">
                  {filtreVar
                    ? 'Bu filtrelere uyan kayıt yok. Filtreleri gevşetmeyi dene.'
                    : 'Henüz yönetim işlemi yapılmamış.'}
                </p>
              ) : (
                <div className="dn-sarmal">
                  <table className="dn-tablo">
                    <thead>
                      <tr>
                        <th>Zaman</th>
                        <th>Eylem</th>
                        <th>Hedef</th>
                        <th>Özet</th>
                        <th>Yönetici</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.kayitlar.map((k) => <Satir key={k.id} k={k} />)}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </Reveal>
        </>
      )}
    </Sayfa>
  )
}

function Satir({ k }: { k: DenetimSatiri }) {
  const ozet = detayOzeti(k)
  return (
    <tr>
      <td className="dn-zaman">
        {new Date(k.createdAt).toLocaleString('tr-TR', {
          day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
        })}
      </td>
      <td className="dn-eylem">{EYLEM_ADI[k.eylem] ?? k.eylem}</td>
      <td className="dn-hedef">
        {k.hedefAdi ?? (k.hedefId ? <span className="dn-zaman">{k.hedefId.slice(0, 8)}…</span> : '—')}
        {k.hedefTur && (
          <>
            {' '}
            <span className={cn('dn-tur', k.hedefTur === 'ogretmen' && 'dn-t-ogretmen', k.hedefTur === 'sistem' && 'dn-t-sistem')}>
              {k.hedefTur}
            </span>
          </>
        )}
      </td>
      {/* Özet çıkarılamıyorsa "—": ham jsonb anahtarlarını yöneticiye basmak gürültüdür. */}
      <td className="dn-ozet">{ozet ?? '—'}</td>
      <td className="dn-hedef">{k.adminAdi ?? 'yönetici'}</td>
    </tr>
  )
}
