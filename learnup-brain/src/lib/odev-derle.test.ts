/** Telif kapısı sözleşmesi (GOREV-016) — `bun test src/lib` */
import { expect, test, describe } from 'bun:test'
import { havuzdanSec } from './odev-derle.js'
import { HttpHatasi } from './hata.js'

describe("havuzdanSec — çıkmış kaynak kapısı (telif kararı 2026-07-22)", () => {
  // Kapı fonksiyonun İLK işidir: bu test ağ/DB OLMADAN koşar. Kapı gevşer ya da sıra
  // değişirse çağrı Supabase'e düşer ve test başka şekilde de (timeout/ağ) kırılır —
  // yani yeşil kalması "kapı DB'den önce" demektir.
  test("kaynak='osym' açık Türkçe hatayla reddedilir — sessizce AI'ya düşülmez", async () => {
    let yakalanan: unknown = null
    try {
      await havuzdanSec({ kaynak: 'osym', adet: 5 })
    } catch (err) {
      yakalanan = err
    }
    expect(yakalanan).toBeInstanceOf(HttpHatasi)
    const h = yakalanan as HttpHatasi
    expect(h.status).toBe(400)
    expect(h.code).toBe('cikmis_kaynak_kapali')
    // Mesaj makine kodu değil, öğretmenin ekranda okuyacağı tam Türkçe cümledir.
    expect(h.message).toContain('telif')
    expect(h.message).toContain('ÖSYM')
  })
})
