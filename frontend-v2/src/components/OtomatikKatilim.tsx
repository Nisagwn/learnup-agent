import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { apiPost } from '../lib/api'
import { useAuth } from '../lib/auth'
import { rolBul } from '../lib/rol'

/**
 * KAYITTA GİRİLEN SINIF KODUNU İLK GİRİŞTE UYGULAR.
 *
 * ⚠️ Neden kayıt anında yapılamıyor: Supabase e-posta onayı isteyince signUp
 * OTURUM DÖNDÜRMEZ. Yetkili bir çağrı (`/sinif/katil`) atacak token yok. Bu yüzden
 * kod `raw_user_meta_data.class_code` içinde TAŞINIR ve ilk oturumda uygulanır.
 *
 * ⚠️ Yetki burada DEĞİL: katılımı yapan uç, hedef satırı her zaman `req.userId`den
 * alır ve kodu kendisi doğrular. Buradaki kod yalnız TETİKLEYİCİDİR — metadata'ya
 * elle yazılmış bir kod da o uçtan geçmek zorundadır.
 *
 * Görsel çıktısı yok; Shell'de bir kez mount edilir.
 */
export function OtomatikKatilim() {
  const { user, profile, profilYukleniyor, refreshProfile } = useAuth()
  // Tek deneme: kod yanlışsa her render'da tekrar denenmesin (sonsuz toast).
  const denendi = useRef(false)

  useEffect(() => {
    if (denendi.current || profilYukleniyor || !user || !profile) return
    if (rolBul(profile) !== 'student') return
    // Zaten bir sınıfta → yapılacak iş yok.
    if (profile.teacher_id) return

    const kod = (user.user_metadata as Record<string, unknown> | undefined)?.class_code
    if (typeof kod !== 'string' || !kod.trim()) return

    denendi.current = true
    apiPost('/sinif/katil', { classCode: kod.trim().toUpperCase() })
      .then((y: { ogretmen?: { name?: string | null } }) => {
        toast.success(`${y.ogretmen?.name ?? 'Öğretmeninin'} sınıfına katıldın`)
        void refreshProfile()
      })
      .catch((e: Error) => {
        // Kod artık geçersizse SESSİZ KALMA: kullanıcı kaydolurken kod girdiğini
        // biliyor, katılmadığını da bilmeli. Profil ekranından elle girebilir.
        toast.error('Sınıfa otomatik katılım olmadı', {
          description: `${e?.message ?? 'Kod doğrulanamadı.'} Profil ekranından tekrar deneyebilirsin.`,
        })
      })
  }, [user, profile, profilYukleniyor, refreshProfile])

  return null
}
