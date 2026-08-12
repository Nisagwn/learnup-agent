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

/** Sunucunun tek istekte verdiği en büyük sayfa (teacher.routes.ts · sayiParam(…, 200, 500)). */
const SAYFA = 500
/** Güvenlik freni: bir öğretmenin sınıfı bunu geçiyorsa sorun sayfalamada değil veridedir. */
const TAVAN = 5000

/**
 * ROSTER'IN TAMAMI — sayfalayarak.
 *
 * Eskiden tek parametresiz istek atılıyordu ve sunucunun varsayılanı 200'dü; sınıf daha
 * kalabalıksa liste SESSİZCE kesiliyordu. Roster bu panelin TEK öğrenci kaynağı: tablo,
 * triyaj listesi, Karşılaştır seçicisi, Ödev Atölyesi "Kime" listesi ve Röntgen'deki
 * ← / → gezinmesi hep buradan besleniyor. Sonuç: üst şerit "240 öğrenci kayıtlı" derken
 * (o sayı /teacher/ozet'ten, gerçek) filtre çipi "Tümü (200)" diyordu ve 40 öğrenci
 * hiçbir yüzeyde görünmüyordu — onlara ulaşmanın tek yolu URL'i elle yazmaktı.
 *
 * Sayfalama arayüzü YERİNE tam çekim: roster paylaşılan bir bağlam ve tüketicilerinin
 * çoğu (komşu gezinmesi, "Kime" listesi, karşılaştırma seçicisi) yarım listeyle DOĞRU
 * çalışamaz — sayfa düğmesi eklemek sorunu ekranlara dağıtırdı.
 */
async function rosterCek(signal: AbortSignal): Promise<SinifRosterYaniti> {
  const ilk = await tGet<SinifRosterYaniti>('/teacher/sinif', { limit: SAYFA }, { signal })
  const toplam = Math.min(ilk.total ?? ilk.students.length, TAVAN)
  const students = [...ilk.students]

  while (students.length < toplam) {
    const sayfa = await tGet<SinifRosterYaniti>(
      '/teacher/sinif',
      { limit: SAYFA, offset: students.length },
      { signal },
    )
    // Boş sayfa = sunucu daha fazlasını vermiyor. `total` ile students arasındaki farkı
    // sonsuz döngüye çevirmemek için burada kesilir.
    if (!sayfa.students.length) break
    students.push(...sayfa.students)
  }

  return { ...ilk, students, limit: students.length, offset: 0 }
}

export function SinifSaglayici({ children }: { children: ReactNode }) {
  // ⚠️ KAPSAM BAĞIMLILIK DİZİSİNDE (0025): yönetici Sınıflar ekranından başka bir
  // öğretmene geçtiğinde bileşen ağacı aynı kalır — kapsam değişimini bağımlılık
  // olarak yazmazsak sağlayıcı ÖNCEKİ öğretmenin verisini göstermeye devam eder.
  const kapsam = kapsamOku()
  const ozet = useAsync<OgretmenOzeti>((signal) => tGet('/teacher/ozet', {}, { signal }), [kapsam])
  const roster = useAsync<SinifRosterYaniti>((signal) => rosterCek(signal), [kapsam])

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
