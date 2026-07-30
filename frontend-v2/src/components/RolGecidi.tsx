import type { ReactNode } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { rolBul, ROL_ADI, type Rol } from '../lib/rol'
import { Skeleton } from './ui'
import { Reveal } from './fx'
import { SinifSaglayici } from '../lib/sinif'
import { kapsamOku } from '../lib/sinif-kapsam'
import { VekilSerit } from './VekilSerit'

/** Ortak sayfa sarmalayıcı — Harita.tsx:281 ile birebir. */
export function Sayfa({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-7xl px-[clamp(16px,3.5vw,44px)] pb-20 pt-9">{children}</div>
}

/**
 * Panel iskeleti — Harita'nın YÜKLEME ŞEKLİYLE birebir (Harita.tsx:130-141).
 * Aynı olması kasıtlı: iskeletten gerçek panele geçerken sıfır düzen kayması.
 */
export function PanoIskeleti({ sutun = 2 }: { sutun?: 1 | 2 }) {
  return (
    <Sayfa>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}
      </div>
      {sutun === 2 ? (
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      ) : (
        <Skeleton className="mt-6 h-96" />
      )}
    </Sayfa>
  )
}

/* Yetki reddi stilleri — FİDAN değişkenli, OdevAtolyesi boş-durum diliyle uyumlu (rg- öneki
   çakışmayı önler). Renkler iki temada da --cam/--metin/--v0'dan döner; sabit renk yok. */
const RG_STIL = `
  .rg-kart { background: var(--cam); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
    border: 1px solid var(--cam-kenar); border-radius: 24px; box-shadow: var(--golge); }
  .rg-h2 { font-family: Outfit, sans-serif; font-weight: 700; font-size: 20px; color: var(--metin1); }
  .rg-alt { font-size: 13px; line-height: 1.65; color: var(--metin3); }
  .rg-alt strong { color: var(--metin2); font-weight: 600; }
  .rg-btn { font-family: Inter, sans-serif; font-weight: 600; font-size: 12.5px; border-radius: 12px;
    cursor: pointer; min-height: 44px; padding: 0 18px; display: inline-flex; align-items: center; gap: 7px;
    background: var(--v0); color: var(--metin2); border: 1px solid var(--cam-kenar);
    transition: filter .2s, background .2s, color .2s, border-color .2s; }
  .rg-btn:hover { color: var(--metin1); border-color: var(--adacayi); }
`

/**
 * Yetki reddi — SESSİZ REDIRECT DEĞİL.
 *
 * Yer imi olan ya da eski bir link tıklayan öğretmen, ana sayfaya fırlatılırsa
 * "uygulama bozuldu" sanır. Açıkça söylemek hem dürüst hem daha az destek talebi.
 * Yapı Harita'nın boş durumuyla aynı (Harita.tsx:157-172): aynı ürün, aynı ses.
 */
export function YetkiYok({ rol }: { rol: Rol }) {
  const nav = useNavigate()
  return (
    <Sayfa>
      <style>{RG_STIL}</style>
      <Reveal delay={0.05}>
        <div className="rg-kart mx-auto mt-10 max-w-lg px-8 py-10 text-center">
          {/* FİDAN filiz — OdevAtolyesi boş-durum görseliyle aynı dil (--vurgu/--adacayi/--yaprak) */}
          <svg width="72" height="72" viewBox="0 0 24 24" fill="none" aria-hidden className="mx-auto">
            <path d="M12 21V9" stroke="var(--vurgu)" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M12 12C12 8 9 5 4 5c0 5 3 8 8 8" fill="var(--adacayi)" />
            <path d="M12 9c0-3.5 2.5-6 7-6 0 4.5-2.5 7-7 7" fill="var(--yaprak)" />
          </svg>
          <h2 className="rg-h2 mt-4">Bu sayfaya erişimin yok</h2>
          <p className="rg-alt mx-auto mt-2 max-w-sm">
            Bu alan öğretmen ve yönetici hesapları için. Hesabın <strong>{ROL_ADI[rol]}</strong> olarak
            görünüyor. Yanlış olduğunu düşünüyorsan okul yöneticinle görüş.
          </p>
          <button type="button" className="rg-btn mx-auto mt-6" onClick={() => nav('/')}>
            Genel Bakış'a dön
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8"
                strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </Reveal>
    </Sayfa>
  )
}

/**
 * ROL KAPISI — layout route olarak kullanılır, ekran başına değil.
 *
 * Böylece hem kontrol hem paylaşılan sınıf verisi alt-ağaç başına BİR KEZ çalışır
 * (/sinif → /sinif/ogrenci/:id → /sinif gezinmesinde roster yeniden çekilmez).
 *
 * ⚠️ ÜÇ HÂL, İKİSİ DEĞİL. `profilYukleniyor` iken YÖNLENDİRME YOK: profil satırı
 * gelmeden rol "student" görünür ve her sert yenilemede 403 yanıp söner. Bekleme
 * hâlinin varlığı bu panelin en kritik detayı.
 */
export function RolGecidi({ izin, saglayici }: { izin: Rol[]; saglayici?: 'sinif' }) {
  const { profile, profilYukleniyor } = useAuth()

  if (profilYukleniyor) return <PanoIskeleti sutun={2} />

  const rol = rolBul(profile)
  if (!izin.includes(rol)) return <YetkiYok rol={rol} />

  const govde = <Outlet />
  if (saglayici !== 'sinif') return govde

  /**
   * VEKİL KAPSAM (0025) — yönetici sınıf yüzeyine ancak bir öğretmen SEÇEREK girer.
   *
   * ⚠️ Kapsamsız yönetici burada durdurulur, ekran açılmaz. Sunucu zaten 403
   * `ogretmen_secilmedi` döner ama istemcide de kesmek şart: aksi hâlde yönetici
   * beş panel dolusu hata toast'u görür ve "uygulama bozuk" sanır. Sebebi ve
   * çözümü tek ekranda söylenir.
   */
  const vekil = rol === 'admin'
  if (vekil && !kapsamOku()) return <KapsamSecilmedi />

  return (
    <SinifSaglayici>
      {vekil && <VekilSerit />}
      {govde}
    </SinifSaglayici>
  )
}

/** Yönetici sınıf yüzeyine kapsamsız geldi — yol gösterir, boş ekran göstermez. */
function KapsamSecilmedi() {
  const nav = useNavigate()
  return (
    <Sayfa>
      <style>{RG_STIL}</style>
      <Reveal delay={0.05}>
        <div className="rg-kart mx-auto mt-10 max-w-lg px-8 py-10 text-center">
          <svg width="72" height="72" viewBox="0 0 24 24" fill="none" aria-hidden className="mx-auto">
            <path d="M12 21V9" stroke="var(--vurgu)" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M12 12C12 8 9 5 4 5c0 5 3 8 8 8" fill="var(--adacayi)" />
            <path d="M12 9c0-3.5 2.5-6 7-6 0 4.5-2.5 7-7 7" fill="var(--yaprak)" />
          </svg>
          <h2 className="rg-h2 mt-4">Önce bir sınıf seç</h2>
          <p className="rg-alt mx-auto mt-2 max-w-sm">
            Yöneticinin kendi sınıfı yoktur; sınıf ekranlarına <strong>hangi öğretmenin</strong> gözüyle
            baktığını seçerek girilir. Yaptığın yazma işlemleri o öğretmenin adına denetim defterine işlenir.
          </p>
          <button type="button" className="rg-btn mx-auto mt-6" onClick={() => nav('/kule/siniflar')}>
            Sınıflar'a git
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8"
                strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </Reveal>
    </Sayfa>
  )
}
