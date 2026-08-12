/**
 * EMBED ÖNBELLEĞİ — kısmi isabet hâlinde SIRA korunur.
 *
 * Test edilen asıl risk: önbellekte olanları atlayıp yalnız eksikleri satın alırken, dönen
 * vektörleri YANLIŞ metnin yerine koymak. Bu, RAG'de teşhis edilmesi en zor arıza sınıfıdır —
 * sistem çalışmaya devam eder, yalnız yanlış şeyi getirir. Kısmi isabet (bir vurdu, bir ıskaladı)
 * tam da bu kaymanın oluşacağı durumdur.
 */
import { expect, test, describe, mock } from 'bun:test'

const ONBELLEK = new Map<string, string>()
/** Satın alınan (yani PARA HARCANAN) girdi partileri — kredisiz iddiasının kanıtı. */
const satinAlinan: string[][] = []

mock.module('../clients/redis.js', () => ({
  redis: {},
  redisTry: async (fn: (r: unknown) => Promise<unknown>, fallback: unknown) => {
    const sahte = {
      mget: async (...keys: string[]) => keys.map((k) => ONBELLEK.get(k) ?? null),
      pipeline: () => {
        const yazimlar: Array<[string, string]> = []
        return {
          set: (k: string, v: string) => { yazimlar.push([k, v]); return undefined },
          exec: async () => { for (const [k, v] of yazimlar) ONBELLEK.set(k, v); return [] },
        }
      },
    }
    try {
      return await fn(sahte)
    } catch {
      return fallback
    }
  },
}))

mock.module('../clients/openrouter.js', () => ({
  openrouter: {
    embeddings: {
      create: async ({ input }: { input: string[] }) => {
        satinAlinan.push(input)
        // Metne göre deterministik sahte vektör: hangi metnin hangi vektöre gittiği izlenebilsin.
        return { data: input.map((t) => ({ embedding: Array.from({ length: 768 }, () => t.length) })) }
      },
    },
  },
}))

const { embed } = await import('./rag.js')

describe('embed önbelleği', () => {
  test('ilk çağrı satın alır, ikinci çağrı HİÇ satın almaz', async () => {
    ONBELLEK.clear()
    satinAlinan.length = 0

    const a = await embed(['kazanım A'])
    expect(satinAlinan).toHaveLength(1)

    const b = await embed(['kazanım A'])
    expect(satinAlinan).toHaveLength(1) // ← ikinci çağrıda sağlayıcıya HİÇ gidilmedi
    expect(b[0]).toEqual(a[0])
  })

  test('kısmi isabette vektörler DOĞRU metne geri yazılır (sıra kayması yok)', async () => {
    ONBELLEK.clear()
    satinAlinan.length = 0

    // 'orta' önbelleğe alınır; sonraki çağrıda yalnız baştaki ve sondaki satın alınmalı.
    await embed(['orta'])
    satinAlinan.length = 0

    const sonuc = await embed(['kisa', 'orta', 'cok-uzun-metin'])

    expect(satinAlinan).toEqual([['kisa', 'cok-uzun-metin']]) // yalnız ıskalayanlar
    // Sahte vektör metnin uzunluğunu taşıyor → her vektör kendi metnine mi düşmüş?
    expect(sonuc[0][0]).toBe('kisa'.length)
    expect(sonuc[1][0]).toBe('orta'.length)
    expect(sonuc[2][0]).toBe('cok-uzun-metin'.length)
  })
})
