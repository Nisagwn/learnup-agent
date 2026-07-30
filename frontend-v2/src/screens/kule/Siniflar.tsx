import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiGet } from '../../lib/api'
import { useAsync } from '../../lib/useAsync'
import { cn } from '../../lib/cn'
import { Icon } from '../../ui'
import type { AdminKullanicilarYaniti } from '../../lib/types.admin'
import { Sayfa, PanoIskeleti } from '../../components/RolGecidi'
import { GlowButton } from '../../components/ui'
import { CanliSayi, Sayi } from '../../components/cekirdek'
import { Reveal } from '../../components/fx'

/**
 * SINIFLAR — yöneticinin sınıf yüzeyine tek meşru girişi (0025).
 *
 * ⚠️ BU EKRAN NEDEN VAR: /teacher/* uçları sınıf kapsamını isteği yapan kişiden
 * türetiyordu; yönetici oraya girse SESSİZCE BOŞ SINIF görürdü. Artık kapsam açıkça
 * seçiliyor (?ogretmenId) ve seçim yeri burası. "Öğretmen sınıfım boş diyor" ya da
 * "bu ödev nasıl atandı" şikâyetlerinin teşhis edilebildiği tek yol bu.
 *
 * ⚠️ ONAYSIZ ÖĞRETMEN AÇILAMAZ. O öğretmen /teacher/* uçlarından zaten 403 alıyor;
 * satırı tıklanabilir bırakmak, çalışmayan bir kapıyı davetkâr göstermek olurdu.
 * Satır görünür kalır ama sebebiyle birlikte: yönetici önce onaylamalı.
 */
const SAYFA = 100

export function Siniflar() {
  const nav = useNavigate()
  const [ara, setAra] = useState('')
  const [sorgu, setSorgu] = useState('')
  const [yalnizDolu, setYalnizDolu] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setSorgu(ara.trim()), 300)
    return () => clearTimeout(t)
  }, [ara])

  const liste = useAsync<AdminKullanicilarYaniti>(
    () => apiGet('/admin/kullanicilar', { role: 'teacher', limit: SAYFA, ...(sorgu ? { q: sorgu } : {}) }),
    [sorgu],
  )

  const ogretmenler = useMemo(() => {
    const hepsi = liste.data?.users ?? []
    return yalnizDolu ? hepsi.filter((o) => (o.ogrenciSayisi ?? 0) > 0) : hepsi
  }, [liste.data, yalnizDolu])

  const toplamOgrenci = useMemo(
    () => (liste.data?.users ?? []).reduce((t, o) => t + (o.ogrenciSayisi ?? 0), 0),
    [liste.data],
  )
  const onaysiz = useMemo(
    () => (liste.data?.users ?? []).filter((o) => !o.isApproved).length,
    [liste.data],
  )
  const bosSinif = useMemo(
    () => (liste.data?.users ?? []).filter((o) => o.isApproved && (o.ogrenciSayisi ?? 0) === 0).length,
    [liste.data],
  )

  if (liste.loading && !liste.data) return <PanoIskeleti sutun={1} />

  if (liste.error) {
    return (
      <Sayfa>
        <div
          className="mx-auto max-w-md rounded-2xl px-6 py-8 text-center"
          style={{ background: 'var(--cam)', border: '1px solid var(--cam-kenar)', boxShadow: 'var(--golge)' }}
        >
          <p className="text-sm" style={{ color: 'var(--metin2)' }}>Sınıflar alınamadı: {liste.error}</p>
          <GlowButton className="mt-4" variant="outline" onClick={() => liste.reload()}>Tekrar dene</GlowButton>
        </div>
      </Sayfa>
    )
  }

  const ac = (id: string): void => { nav(`/sinif?ogretmenId=${encodeURIComponent(id)}`) }

  return (
    <Sayfa>
      <style>{`
        .sn-kart { background: var(--cam); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
          border: 1px solid var(--cam-kenar); border-radius: 20px; box-shadow: var(--golge); }
        .sn-baslik { padding: 16px 22px; }
        .sn-baslik h1 { font-family: Outfit, sans-serif; font-weight: 800; font-size: clamp(20px, 2.4vw, 24px); color: var(--metin1); }
        .sn-baslik .alt { font-size: 12.5px; color: var(--metin3); margin-top: 4px; line-height: 1.5; max-width: 620px; }

        .sn-statlar { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: 22px; }
        @media (max-width: 980px) { .sn-statlar { grid-template-columns: repeat(2, 1fr); } }
        .sn-stat { padding: 15px 18px; }
        .sn-stat .etiket { font-size: 10px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: var(--metin3); }
        .sn-stat .deger { font-family: Outfit, sans-serif; font-size: 23px; font-weight: 800; line-height: 1; margin-top: 5px; color: var(--metin1); }
        .sn-stat .deger.uyari { color: var(--uyari); }
        .sn-stat .alt { margin-top: 4px; font-size: 10.5px; color: var(--metin3); }

        .sn-panel { padding: 18px 22px; margin-top: 20px; }
        .sn-arac { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
        .sn-ara { flex: 1; min-width: 200px; display: flex; align-items: center; gap: 8px;
          border: 1.5px solid var(--cam-kenar); border-radius: 12px; padding: 9px 13px; color: var(--metin3); }
        .sn-ara input { flex: 1; min-width: 0; border: none; background: transparent; outline: none; font-size: 13px; color: var(--metin1); }
        .sn-cip { font-family: Inter, sans-serif; font-size: 12px; font-weight: 600; color: var(--metin2);
          background: transparent; border: 1.5px solid var(--cam-kenar); border-radius: 12px; padding: 8px 13px;
          cursor: pointer; min-height: 44px; }
        .sn-cip.sn-aktif { color: var(--vurgu); background: var(--v1); border-color: var(--adacayi); }

        .sn-izgara { display: grid; grid-template-columns: repeat(auto-fill, minmax(268px, 1fr)); gap: 12px; }
        .sn-ogr { text-align: left; font: inherit; padding: 15px 17px; cursor: pointer; width: 100%;
          background: var(--cam); border: 1px solid var(--cam-kenar); border-radius: 18px;
          transition: border-color .15s, box-shadow .15s; }
        .sn-ogr:hover { border-color: var(--adacayi); box-shadow: var(--parilti); }
        .sn-ogr:disabled { cursor: default; opacity: .72; }
        .sn-ogr:disabled:hover { border-color: var(--cam-kenar); box-shadow: none; }
        .sn-ogr .ad { font-family: Outfit, sans-serif; font-size: 14.5px; font-weight: 700; color: var(--metin1);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .sn-ogr .epost { font-family: 'JetBrains Mono', monospace; font-size: 10.5px; color: var(--metin3);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
        .sn-satir { display: flex; align-items: center; gap: 8px; margin-top: 11px; flex-wrap: wrap; }
        .sn-mevcut { font-family: Outfit, sans-serif; font-size: 13px; font-weight: 700; color: var(--vurgu); }
        .sn-kod { font-family: 'JetBrains Mono', monospace; font-size: 10px; padding: 3px 8px; border-radius: 8px;
          background: var(--v0); color: var(--metin3); }
        .sn-rozet { font-size: 10px; font-weight: 700; padding: 2.5px 9px; border-radius: 8px; }
        .sn-r-onaysiz { background: color-mix(in srgb, var(--uyari) 16%, transparent); color: var(--uyari); }
        .sn-r-bos { background: var(--v0); color: var(--metin3); }
        .sn-r-askida { background: color-mix(in srgb, var(--yanlis) 14%, transparent); color: var(--yanlis); }
        .sn-not { font-size: 11px; color: var(--metin3); line-height: 1.5; margin-top: 9px; }
        .sn-bos { text-align: center; padding: 34px 20px; font-size: 13px; color: var(--metin3); line-height: 1.6; }
      `}</style>

      <Reveal>
        <section className="sn-kart sn-baslik">
          <h1>Sınıflar</h1>
          <p className="alt">
            Bir öğretmen seç, sınıfını onun gözüyle aç. Görüntüleme iz bırakmaz; ödev atamak ya da
            öğrenci eklemek/çıkarmak denetim defterine <strong>o öğretmenin adına</strong> işlenir.
          </p>
        </section>
      </Reveal>

      <Reveal delay={0.04}>
        <div className="sn-statlar">
          <section className="sn-kart sn-stat">
            <div className="etiket">Öğretmen</div>
            <div className="deger"><CanliSayi value={liste.data?.total ?? 0} /></div>
            <div className="alt">toplam hesap</div>
          </section>
          <section className="sn-kart sn-stat">
            <div className="etiket">Sınıftaki Öğrenci</div>
            <div className="deger"><CanliSayi value={toplamOgrenci} /></div>
            <div className="alt">bu sayfadaki sınıfların toplamı</div>
          </section>
          <section className="sn-kart sn-stat">
            <div className="etiket">Boş Sınıf</div>
            <div className={cn('deger', bosSinif > 0 && 'uyari')}><CanliSayi value={bosSinif} /></div>
            <div className="alt">onaylı ama hiç öğrencisi yok</div>
          </section>
          <section className="sn-kart sn-stat">
            <div className="etiket">Onaysız</div>
            <div className={cn('deger', onaysiz > 0 && 'uyari')}><CanliSayi value={onaysiz} /></div>
            <div className="alt">panele giremiyor</div>
          </section>
        </div>
      </Reveal>

      <Reveal delay={0.1}>
        <section className="sn-kart sn-panel">
          <div className="sn-arac">
            <label className="sn-ara">
              <Icon name="search" size={14} color="currentColor" style={{ opacity: 0.55 }} />
              <input
                value={ara}
                onChange={(e) => setAra(e.target.value)}
                placeholder="Öğretmen adı ya da e-posta ara"
                aria-label="Öğretmen ara"
              />
            </label>
            <button
              type="button"
              aria-pressed={yalnizDolu}
              className={cn('sn-cip', yalnizDolu && 'sn-aktif')}
              onClick={() => setYalnizDolu((v) => !v)}
            >
              Yalnız öğrencisi olanlar
            </button>
          </div>

          {ogretmenler.length === 0 ? (
            <p className="sn-bos">
              {sorgu ? 'Aramaya uyan öğretmen yok.' : 'Henüz öğretmen hesabı yok. Kullanıcılar ekranından hesap açabilirsin.'}
            </p>
          ) : (
            <div className="sn-izgara">
              {ogretmenler.map((o) => {
                const acilabilir = o.isApproved && !o.askidaMi
                return (
                  <button
                    key={o.id}
                    type="button"
                    className="sn-ogr"
                    disabled={!acilabilir}
                    onClick={() => acilabilir && ac(o.id)}
                    title={acilabilir ? `${o.name ?? 'Öğretmen'} sınıfını aç` : undefined}
                  >
                    <div className="ad">{o.name ?? 'İsimsiz öğretmen'}</div>
                    <div className="epost">{o.email ?? '—'}</div>
                    <div className="sn-satir">
                      <span className="sn-mevcut"><Sayi value={o.ogrenciSayisi ?? 0} /> öğrenci</span>
                      {o.classCode && <span className="sn-kod">{o.classCode}</span>}
                      {o.askidaMi && <span className="sn-rozet sn-r-askida">askıda</span>}
                      {!o.isApproved && <span className="sn-rozet sn-r-onaysiz">onaysız</span>}
                      {o.isApproved && !o.askidaMi && (o.ogrenciSayisi ?? 0) === 0 && (
                        <span className="sn-rozet sn-r-bos">boş</span>
                      )}
                    </div>
                    {/* Açılamayan satırın SEBEBİ yazılır — tıklanmayan bir kart sessiz kalmamalı. */}
                    {!acilabilir && (
                      <p className="sn-not">
                        {o.askidaMi
                          ? 'Hesap askıda; askı kalkmadan sınıfı açılamaz.'
                          : 'Öğretmen onaylanmadan sınıfı açılamaz — Kullanıcılar ekranından onayla.'}
                      </p>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </section>
      </Reveal>
    </Sayfa>
  )
}
