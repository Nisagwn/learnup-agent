import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * URL PARAMETRESİ OLARAK STATE.
 *
 * Isı haritası filtresi, karşılaştırma seçimi gibi şeyler PAYLAŞILABİLİR olmalı:
 * "şu Kimya sütununa bak" öğretmenin zümre sohbetine gerçekten attığı mesajdır.
 * Geçici state (akordeon açıklığı, hover, sihirbaz adımı) yerel useState'te kalır.
 *
 * ⚠️ `replace: true` şart: onsuz on filtre tıklaması, sayfadan çıkmak için on geri
 * tuşu demektir. Filtre kurcalamak geçmişi doldurmamalı.
 *
 * ⚠️ Varsayılana eşit değer URL'den SİLİNİR — temiz, paylaşılabilir bağlantı.
 */
export function useSorgu<T extends string>(
  anahtar: string,
  varsayilan: T,
): [T, (v: T | null) => void] {
  const [params, setParams] = useSearchParams()
  const deger = (params.get(anahtar) as T | null) ?? varsayilan

  const ayarla = useCallback(
    (v: T | null) => {
      const p = new URLSearchParams(params)
      if (v == null || v === varsayilan) p.delete(anahtar)
      else p.set(anahtar, v)
      setParams(p, { replace: true })
    },
    [params, anahtar, varsayilan, setParams],
  )

  return [deger, ayarla]
}
