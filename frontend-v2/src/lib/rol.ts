import { useAuth } from './auth'

/**
 * ROL — tek yorum noktası.
 *
 * ⚠️ `profile.teacher_id` ROL DEĞİLDİR: o, ÖĞRENCİNİN atanmış öğretmenidir. App.tsx'te
 * "Ödevler" sekmesi ona bakıyor ve bu doğru — ama rol kapısı ASLA ona bakmamalı.
 * Rol yalnız `profile.role`'dur.
 *
 * ⚠️ Bu istemci-tarafı rol YALNIZ GÖRÜNÜM içindir (hangi sekme çizilecek, hangi ekran
 * açılacak). Gerçek yetki backend'de `requireRole` + service-role sorgularındadır.
 * Buradaki bir bypass yalnız boş bir ekran gösterir, veri sızdırmaz.
 */
export type Rol = 'student' | 'teacher' | 'admin'

/** Tanınmayan/eksik rol → 'student'. En dar yetki, güvenli varsayılan. */
export function rolBul(profile: { role?: unknown } | null | undefined): Rol {
  const r = profile?.role
  return r === 'admin' || r === 'teacher' ? r : 'student'
}

export function useRol(): Rol {
  return rolBul(useAuth().profile)
}

export const ROL_ADI: Record<Rol, string> = {
  student: 'Öğrenci',
  teacher: 'Öğretmen',
  admin: 'Yönetim',
}

/**
 * Rolün ANA EKRANI — "bu hesap açılışta nereyi görür" sorusunun TEK cevabı.
 *
 * Kök rota kapısı (AnaKapi) ve rol kapısının yönlendirme kipi aynı tablodan okur:
 * iki yerde ayrı ayrı yazılsaydı biri güncellenip diğeri unutulurdu.
 */
export const ROL_ANA_YOL: Record<Rol, string> = {
  student: '/',
  teacher: '/sinif',
  admin: '/kule',
}
