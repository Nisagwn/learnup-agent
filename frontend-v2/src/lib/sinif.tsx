import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'
import { tGet, kapsamOku } from './sinif-kapsam'
import { useAsync } from './useAsync'
import type { OgretmenOzeti, OgrenciSatiri, SinifRosterYaniti } from './types.teacher'

/**
 * SINIF BAĞLAMI — /sinif alt-ağacının paylaşılan verisi.
 *
 * NEDEN CONTEXT: `useAsync` panel başınadır ve paylaşım bilmez. Naif kullanımda
 * sınıf → öğrenci → sınıf gezinmesi roster'ı HER SEFERİNDE yeniden çeker; öğretmenin
 * günde onlarca kez yaptığı hareket tam olarak bu. Sağlayıcı KAPI ROUTE'una monte
 * edildiği için alt-ağaç başına bir kez çalışır.
 *
 * React Query/SWR yerine bunu seçtik: 8 ekran, "tek fetch kalıbı" değişmezini bozmayı
 * ve ~12KB'ı haklı çıkarmıyor. Context, useAsync'in eksik TEK şeyini (paylaşım) veriyor.
 */

interface SinifDeger {
  ozet: OgretmenOzeti | null
  roster: OgrenciSatiri[]
  loading: boolean
  error: string | null
  reload: () => void
  ogrenciBul: (id: string) => OgrenciSatiri | undefined
  /** Röntgen ekranındaki ← / → gezinmesi: roster sırasında komşu öğrenci. */
  siradaki: (id: string, yon: 1 | -1) => string | null
}

const SinifCtx = createContext<SinifDeger | null>(null)

export function SinifSaglayici({ children }: { children: ReactNode }) {
  // ⚠️ KAPSAM BAĞIMLILIK DİZİSİNDE (0025): yönetici Sınıflar ekranından başka bir
  // öğretmene geçtiğinde bileşen ağacı aynı kalır — kapsam değişimini bağımlılık
  // olarak yazmazsak sağlayıcı ÖNCEKİ öğretmenin verisini göstermeye devam eder.
  const kapsam = kapsamOku()
  const ozet = useAsync<OgretmenOzeti>(() => tGet('/teacher/ozet'), [kapsam])
  const roster = useAsync<SinifRosterYaniti>(() => tGet('/teacher/sinif'), [kapsam])

  const ogrenciler = useMemo(() => roster.data?.students ?? [], [roster.data])

  const ogrenciBul = useCallback(
    (id: string) => ogrenciler.find((o) => o.studentId === id),
    [ogrenciler],
  )

  const siradaki = useCallback(
    (id: string, yon: 1 | -1) => {
      const i = ogrenciler.findIndex((o) => o.studentId === id)
      if (i < 0) return null
      const j = i + yon
      // Sarmalama YOK: listenin ucunda ok tuşu sessizce başa dönerse öğretmen
      // nerede olduğunu kaybeder.
      return j >= 0 && j < ogrenciler.length ? ogrenciler[j].studentId : null
    },
    [ogrenciler],
  )

  const reload = useCallback(() => {
    ozet.reload()
    roster.reload()
  }, [ozet.reload, roster.reload])

  const deger: SinifDeger = useMemo(
    () => ({
      ozet: ozet.data,
      roster: ogrenciler,
      loading: ozet.loading || roster.loading,
      // İkisinden biri düşse de ekran bir şey gösterebilsin diye ilk hatayı taşırız.
      error: ozet.error ?? roster.error,
      reload,
      ogrenciBul,
      siradaki,
    }),
    [ozet.data, ozet.loading, ozet.error, roster.loading, roster.error, ogrenciler, reload, ogrenciBul, siradaki],
  )

  return <SinifCtx.Provider value={deger}>{children}</SinifCtx.Provider>
}

export function useSinif(): SinifDeger {
  const ctx = useContext(SinifCtx)
  if (!ctx) throw new Error('useSinif, SinifSaglayici içinde kullanılmalı')
  return ctx
}
