import type { ReactNode } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { rolBul, ROL_ADI, type Rol } from '../lib/rol'
import { GlowButton, Skeleton } from './ui'
import { Reveal } from './fx'
import { Lighthouse } from './Lighthouse'
import { SinifSaglayici } from '../lib/sinif'

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
      <Reveal delay={0.05}>
        <div className="glass mx-auto mt-10 max-w-lg rounded-3xl px-8 py-10 text-center">
          <div className="mx-auto w-fit"><Lighthouse size={84} /></div>
          <h2 className="mt-4 font-display text-xl font-bold text-slate-800 dark:text-slate-100">
            Bu güverte sana kapalı
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
            Bu alan öğretmen ve yönetici hesapları için. Hesabın <strong>{ROL_ADI[rol]}</strong> olarak
            görünüyor. Yanlış olduğunu düşünüyorsan okul yöneticinle görüş.
          </p>
          <GlowButton className="mt-6" icon="arrowRight" onClick={() => nav('/')}>
            Genel Bakış'a dön
          </GlowButton>
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
  return saglayici === 'sinif' ? <SinifSaglayici>{govde}</SinifSaglayici> : govde
}
