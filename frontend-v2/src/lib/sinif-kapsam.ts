import { useCallback } from 'react'
import { useNavigate, type NavigateOptions } from 'react-router-dom'
import { apiDelete, apiGet, apiPatch, apiPost } from './api'

/**
 * SINIF KAPSAMI — "hangi öğretmenin gözüyle bakıyoruz?" (0025)
 *
 * Öğretmende cevap her zaman "kendisi" ve hiçbir şey taşınmaz. YÖNETİCİDE kapsam
 * açıkça seçilir: `/sinif?ogretmenId=<uuid>`. Sunucu tarafı bunu şart koşar —
 * yönetici parametresiz girerse 403 `ogretmen_secilmedi` alır, sessizce boş sınıf
 * DEĞİL (learnup-brain/src/middleware/requireRole.ts → requireOgretmenKapsami).
 *
 * ⚠️ KAYNAK URL, BELLEK DEĞİL. Kapsamı bir React state'inde ya da sessionStorage'da
 * tutmak üç şeyi bozardı: (1) sayfa yenilemesi kapsamı kaybederdi; (2) yer imi
 * çalışmazdı; (3) görünen ekran ile gönderilen istek ayrışabilirdi — yönetici bir
 * öğretmenin sınıfına bakarken BAŞKASININ sınıfına yazabilirdi. URL tek hakikattir.
 *
 * ⚠️ HER ŞEY BU DOSYADAN GEÇMELİ. Sınıf ekranlarında çıplak `apiGet('/teacher/...')`
 * ya da çıplak `useNavigate()` kullanmak, kapsamı düşüren sessiz bir hata üretir:
 * yönetici ekranı açar, veri gelmez, hata da görünmez.
 */

const ALAN = 'ogretmenId'

/** URL'deki kapsam. Öğretmende (ve kapsamsız yönetici girişinde) null. */
export function kapsamOku(): string | null {
  if (typeof window === 'undefined') return null
  const v = new URLSearchParams(window.location.search).get(ALAN)
  return v && v.trim() ? v.trim() : null
}

/**
 * Sınıf içi bir yola kapsamı ekler. Kapsam yoksa yol aynen döner (öğretmen yolu).
 * Zaten `ogretmenId` taşıyan bir yola ikinci kez EKLEMEZ.
 */
export function kapsamli(yol: string): string {
  const id = kapsamOku()
  if (!id || yol.includes(`${ALAN}=`)) return yol
  return `${yol}${yol.includes('?') ? '&' : '?'}${ALAN}=${encodeURIComponent(id)}`
}

/**
 * Kapsamı koruyan `navigate`. Sınıf ekranlarında `useNavigate` YERİNE kullanılır:
 * çağrı biçimi birebir aynı (`nav('/sinif/odev?ogrenci=…')`), tek fark kapsamın
 * kendiliğinden taşınması.
 *
 * Yalnız `/sinif` ile başlayan yollara dokunur — panelden çıkan bir bağlantıya
 * (`/kule/...`) öğretmen kimliği iliştirmek anlamsız olurdu.
 */
export function useSinifNav(): (yol: string, opts?: NavigateOptions) => void {
  const nav = useNavigate()
  return useCallback(
    (yol: string, opts?: NavigateOptions) => {
      void nav(yol.startsWith('/sinif') ? kapsamli(yol) : yol, opts)
    },
    [nav],
  )
}

/* ── /teacher/* API sarmalayıcıları ──────────────────────────────────────── */

/** GET /teacher/… — kapsam varsa `ogretmenId` sorgu parametresi olarak eklenir. */
export function tGet<T = any>(yol: string, params: Record<string, unknown> = {}, opts?: { signal?: AbortSignal }): Promise<T> {
  const id = kapsamOku()
  return apiGet(yol, id ? { ...params, [ALAN]: id } : params, opts)
}

/**
 * POST /teacher/… — kapsam GÖVDEDE değil SORGUDA gider.
 *
 * ⚠️ Gövdeye koymak yanlış olurdu: uçlar gövdeyi kendi şemalarıyla doğruluyor ve
 * kapsam bir yetki parametresidir, iş verisi değil. Sunucu onu middleware'de,
 * route'a girmeden okur.
 */
export function tPost<T = any>(yol: string, body: Record<string, unknown> = {}, opts?: { signal?: AbortSignal }): Promise<T> {
  return apiPost(kapsamli(yol), body, opts)
}

/** PATCH /teacher/… — kısmî güncelleme (ödev durumu / son tarihi). */
export function tPatch<T = any>(yol: string, body: Record<string, unknown> = {}, opts?: { signal?: AbortSignal }): Promise<T> {
  return apiPatch(kapsamli(yol), body, opts)
}

/** DELETE /teacher/… */
export function tDelete<T = any>(yol: string, opts?: { signal?: AbortSignal }): Promise<T> {
  return apiDelete(kapsamli(yol), opts)
}
