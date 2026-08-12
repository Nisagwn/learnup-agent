/**
 * DOĞRULAMA ATLATMA REGRESYONU — istemci hakemi atlatamaz.
 *
 * NEDEN VAR: `skipVerification` ve `costOptimized` bayrakları /api/agents/dispatch
 * gövdesinden okunuyordu ve o uç her oturumlu kullanıcıya açık (routes/agents.routes.ts,
 * app.ts'te yalnız `kimlikli` ile mount). `skipVerification`, generation.denetle içinde
 * hakemi TAMAMEN atlatıp `matchesMarked/singleCorrect/curriculumBound = true` uydurur ve
 * `quality = 4` verir; ritim de sonucu `verified: true` ile ORTAK havuza yazar. Yani
 * herhangi bir öğrenci hesabı, doğru cevabı hiç kontrol edilmemiş soruyu tüm öğrencilere
 * servis edilen havuza sokabiliyordu.
 *
 * Bu testler iki kapıyı birlikte tutar:
 *   1) ritim payload'daki strateji bayraklarını GenSpec'e GEÇİRMEZ,
 *   2) HTTP beyaz listesi yönetim görevlerini (`eval`) dışarıda tutar.
 */
import { expect, test, describe, mock } from 'bun:test'
import type { GenSpec } from '../lib/generation.js'

// Redis'i sürece hiç sokma (app.test.ts'teki gerekçenin aynısı).
mock.module('../clients/redis.js', () => ({
  redis: null,
  redisBlocking: null,
  redisLimiter: null,
  redisSession: null,
  redisTry: async (_fn: unknown, fallback: unknown) => fallback,
  redisSessionTry: async (_fn: unknown, fallback: unknown) => fallback,
  redisReady: async () => false,
  requireRedis: () => {
    throw new Error('test: redis yok')
  },
  pingRedis: async () => 'disabled',
  pingSessionRedis: async () => 'disabled',
}))

mock.module('../lib/curriculum.js', () => ({
  resolveKazanim: async (id: number) => ({
    id,
    code: 'MAT.10.1.1',
    title: 'Test kazanımı',
    path: 'mat.g10.test',
    subject: 'Matematik',
    grade: 10,
  }),
}))

/** Üretime giden GenSpec burada yakalanır — LLM'e hiç gidilmez.
 *  ⚠️ Modülün TAMAMI değil yalnız `generateVerifiedSet` değiştirilir: generation.ts'in diğer
 *  dışa verimleri (buildStudentContext, parseTagged…) başka modüllerce import ediliyor;
 *  modülü baştan yazmak onları "export bulunamadı" ile düşürür. */
const gercekGeneration = await import('../lib/generation.js')
let yakalananSpec: GenSpec | null = null
mock.module('../lib/generation.js', () => ({
  ...gercekGeneration,
  generateVerifiedSet: async (spec: GenSpec) => {
    yakalananSpec = spec
    return [] // boş set → ritim havuza yazmaya hiç girmez (supabase'e dokunulmaz)
  },
}))

const { handleTask } = await import('./ritim.js')
const { HTTP_GOREVLERI } = await import('../routes/agents.routes.js')

describe('ritim topup — strateji bayrakları istemciden geçmez', () => {
  test('skipVerification/costOptimized payload’da olsa bile GenSpec.options kurulmaz', async () => {
    yakalananSpec = null
    await handleTask({
      id: 'test-1',
      userId: '00000000-0000-0000-0000-000000000000',
      kind: 'topup',
      payload: { kazanimId: 1, difficulty: 'zor', count: 1, skipVerification: true, costOptimized: true },
    })

    expect(yakalananSpec).not.toBeNull()
    // options HİÇ kurulmamalı: kurulursa (boş nesne dahil) bir sonraki geliştirici
    // "buraya bayrak eklemek serbest" sanır. Yokluk, sözleşmenin kendisidir.
    expect(yakalananSpec!.options).toBeUndefined()
  })

  test('kimlik alanları payload’dan DEĞİL curriculum_nodes’tan türer', async () => {
    yakalananSpec = null
    await handleTask({
      id: 'test-2',
      userId: '00000000-0000-0000-0000-000000000000',
      // Saldırgan payload: ders/konu/kazanım metinleri prompt'a interpole ediliyordu.
      payload: { kazanimId: 7, subject: 'ENJEKSİYON', topic: 'ENJEKSİYON', kazanim: 'ENJEKSİYON' },
      kind: 'topup',
    })

    expect(yakalananSpec!.subject).toBe('Matematik')
    expect(yakalananSpec!.topic).toBe('Test kazanımı')
    expect(yakalananSpec!.kazanim).toBe('MAT.10.1.1')
  })
})

describe('dispatch beyaz listesi — yönetim görevleri HTTP’den tetiklenemez', () => {
  test("'eval' listede YOK (O(n²) tarama; kendi yolu admin arkasında)", () => {
    expect(HTTP_GOREVLERI.has('eval')).toBe(false)
  })

  test('öğrencinin kendi hesabı için isteyebileceği görevler listede VAR', () => {
    for (const k of ['topup', 'forge_topup', 'plan', 'diagnose'] as const) {
      expect(HTTP_GOREVLERI.has(k)).toBe(true)
    }
  })
})
