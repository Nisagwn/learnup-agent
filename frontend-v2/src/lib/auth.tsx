import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from './supabase.js'

interface AuthValue {
  session: Session | null
  user: User | null
  profile: any | null
  loading: boolean
  /**
   * Profil SATIRI hâlâ geliyor mu?
   *
   * `loading` yalnız OTURUMU kapsar; profil ikinci bir effect'te çekilir ve o pencerede
   * `profile` null'dır. Rol kapısı bunu bilmezse her sert yenilemede "yetkiniz yok" diye
   * yanıp söner — çünkü null profilin rolü "student" görünür. Kapı bu bayrak true iken
   * BEKLER, yönlendirmez.
   */
  profilYukleniyor: boolean
  signIn: (email: string, password: string) => Promise<{ error: unknown }>
  /**
   * Kayıt. `ek` alanları auth.users.raw_user_meta_data'ya yazılır ve
   * `handle_new_user()` trigger'ı oradan `profiles` satırını kurar:
   *   role → student|teacher (0016 beyaz listesi; 'admin' bu kapıdan GEÇEMEZ)
   *   grade, student_class → profil alanları
   *   role='teacher' ise 6 haneli class_code OTOMATİK üretilir
   * `class_code` (öğrencinin katılmak istediği sınıf) yalnız TAŞINIR; katılım
   * ilk girişte /sinif/katil ucundan yapılır — yetki kontrolü orada.
   */
  signUp: (
    email: string,
    password: string,
    name: string,
    ek?: Record<string, string>,
  ) => Promise<{ error: unknown }>
  signOut: () => Promise<unknown>
  /** Profil satırını yeniden çek (avatar değişimi gibi kendi-satır güncellemelerinden sonra). */
  refreshProfile: () => Promise<void>
}

const AuthCtx = createContext<AuthValue | null>(null)

/** Uygulama genelinde oturum + profil. Supabase onAuthStateChange'e abone olur. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  // Başlangıçta TRUE: ilk kare henüz profili bilmiyor. "Bilmiyorum"u "yetkisiz" saymak yasak.
  const [profilYukleniyor, setProfilYukleniyor] = useState(true)

  useEffect(() => {
    let iptal = false
    supabase.auth.getSession().then(({ data }: any) => {
      if (iptal) return
      setSession(data.session ?? null)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_evt: unknown, s: Session | null) => {
      setSession(s ?? null)
    })
    return () => {
      iptal = true
      sub.subscription.unsubscribe()
    }
  }, [])

  // Oturum varsa profil satırını çek (isim, rol, gamification, rozetler için).
  useEffect(() => {
    const uid = session?.user?.id
    // Oturum yok → çekilecek profil de yok. Bekleme biter (aksi hâlde çıkışta sonsuz iskelet).
    if (!uid) { setProfile(null); setProfilYukleniyor(false); return }
    let iptal = false
    setProfilYukleniyor(true)
    supabase.from('profiles').select('*').eq('id', uid).maybeSingle()
      .then(({ data }: any) => {
        if (iptal) return
        setProfile(data ?? null)
        // Hata hâlinde de biter: profil çekilemediyse kapı "yetki yok" göstermeli,
        // sonsuza kadar iskelet DEĞİL.
        setProfilYukleniyor(false)
      })
    return () => { iptal = true }
  }, [session?.user?.id])

  const value: AuthValue = {
    session,
    user: session?.user ?? null,
    profile,
    loading,
    profilYukleniyor,
    signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
    signUp: (email, password, name, ek) =>
      supabase.auth.signUp({ email, password, options: { data: { name, ...(ek ?? {}) } } }),
    signOut: () => supabase.auth.signOut(),
    refreshProfile: async () => {
      const uid = session?.user?.id
      if (!uid) return
      const { data } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle()
      setProfile(data ?? null)
    },
  }
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthCtx)
  if (!ctx) throw new Error('useAuth AuthProvider içinde kullanılmalı')
  return ctx
}
