import { NavLink } from 'react-router-dom'
import { Icon, type IconName } from '../ui'
import { kapsamli } from '../lib/sinif-kapsam'
import { useSinif } from '../lib/sinif'

/**
 * VEKİL ŞERİDİ — yönetici bir öğretmenin sınıfında çalışırken (0025).
 *
 * ⚠️ İKİ İŞİ BİRDEN YAPAR ve ikisi de zorunlu:
 *
 * 1) UYARIR. Yöneticinin burada yazdığı her şey (ödev, öğrenci ekleme/çıkarma)
 *    denetim defterine "X öğretmeni adına" olarak işlenir. Bunu ekranda söylemeyen
 *    bir vekil modu, yöneticiye kendi panelindeymiş gibi hissettirir — ve sınıf
 *    ortalaması sebepsiz değişen öğretmen olan biteni asla öğrenemez.
 *
 * 2) GEZDİRİR. Üst navigasyon yöneticide Kule sekmelerini gösterir (nav.ts:
 *    NAV_YONETIM), sınıf sekmelerini DEĞİL. Bu şerit olmasaydı yönetici bir sınıfa
 *    girer ve ısı haritasına geçemezdi: ekran açılır, çıkış yolu yok.
 *
 * Kapsam URL'den taşınır (`kapsamli`) — her bağlantı ?ogretmenId'yi korur, yoksa
 * bir sonraki ekran 403 `ogretmen_secilmedi` alır.
 */
const SEKMELER: Array<{ to: string; label: string; icon: IconName; end?: boolean }> = [
  { to: '/sinif', label: 'Sınıf', icon: 'waves', end: true },
  { to: '/sinif/isi', label: 'Isı Haritası', icon: 'scan' },
  { to: '/sinif/odev', label: 'Ödev Atölyesi', icon: 'book' },
  { to: '/sinif/karsilastir', label: 'Karşılaştır', icon: 'gauge' },
]

export function VekilSerit() {
  const { ozet } = useSinif()
  const ad = ozet?.ogretmen?.name ?? null
  const kod = ozet?.ogretmen?.classCode ?? null

  return (
    <div className="vs-sarmal">
      <style>{`
        .vs-sarmal { max-width: 80rem; margin: 0 auto; padding: 18px clamp(16px, 3.5vw, 44px) 0; }
        .vs-kart { background: color-mix(in srgb, var(--bilgi) 8%, var(--cam));
          border: 1px solid color-mix(in srgb, var(--bilgi) 32%, transparent);
          border-radius: 18px; padding: 13px 18px; box-shadow: var(--golge); }
        .vs-ust { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .vs-ikon { display: inline-grid; place-items: center; width: 30px; height: 30px; flex-shrink: 0;
          border-radius: 10px; background: color-mix(in srgb, var(--bilgi) 16%, transparent); color: var(--bilgi); }
        .vs-metin { min-width: 0; flex: 1; }
        .vs-metin b { font-family: Outfit, sans-serif; font-size: 13.5px; font-weight: 700; color: var(--metin1); }
        .vs-metin p { font-size: 11.5px; color: var(--metin2); line-height: 1.5; margin-top: 2px; }
        .vs-kod { font-family: 'JetBrains Mono', monospace; font-size: 10.5px; padding: 3px 9px; border-radius: 8px;
          background: var(--v0); color: var(--metin3); flex-shrink: 0; }
        .vs-cikis { font-family: Outfit, sans-serif; font-size: 11.5px; font-weight: 600; text-decoration: none;
          color: var(--metin2); border: 1px solid var(--cam-kenar); border-radius: 10px; padding: 7px 12px;
          display: inline-flex; align-items: center; gap: 5px; flex-shrink: 0; min-height: 34px; }
        .vs-cikis:hover { color: var(--metin1); border-color: var(--adacayi); }
        .vs-sekmeler { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 12px; padding-top: 11px;
          border-top: 1px solid color-mix(in srgb, var(--bilgi) 20%, transparent); }
        .vs-sekme { display: inline-flex; align-items: center; gap: 5px; text-decoration: none;
          font-family: Outfit, sans-serif; font-size: 12.5px; font-weight: 600; color: var(--metin3);
          border: 1px solid transparent; border-radius: 10px; padding: 6px 11px; min-height: 36px; }
        .vs-sekme:hover { background: var(--v0); color: var(--metin1); }
        .vs-sekme.vs-aktif { background: color-mix(in srgb, var(--bilgi) 14%, transparent);
          border-color: color-mix(in srgb, var(--bilgi) 30%, transparent); color: var(--bilgi); }
      `}</style>

      <section className="vs-kart">
        <div className="vs-ust">
          <span className="vs-ikon"><Icon name="shield" size={16} color="currentColor" /></span>
          <div className="vs-metin">
            <b>{ad ?? 'Öğretmen'} adına çalışıyorsun</b>
            <p>
              Bu sınıfta yaptığın her yazma işlemi denetim defterine <strong>onun adına</strong> işlenir.
              Görüntüleme iz bırakmaz.
            </p>
          </div>
          {kod && <span className="vs-kod">{kod}</span>}
          <NavLink to="/kule/siniflar" className="vs-cikis">
            <Icon name="close" size={13} color="currentColor" />
            Vekilden çık
          </NavLink>
        </div>

        <nav className="vs-sekmeler">
          {SEKMELER.map((s) => (
            <NavLink
              key={s.to}
              to={kapsamli(s.to)}
              end={s.end}
              className={({ isActive }) => (isActive ? 'vs-sekme vs-aktif' : 'vs-sekme')}
            >
              <Icon name={s.icon} size={14} color="currentColor" />
              {s.label}
            </NavLink>
          ))}
        </nav>
      </section>
    </div>
  )
}
