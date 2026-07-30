import type { Request as ExpressRequest, Response, NextFunction } from 'express'
import { z, type ZodSchema, type ZodError } from 'zod'
import { gecersizIstek } from '../lib/hata.js'

/**
 * Zod şemasına göre body/query/param doğrulayan Express middleware'leri.
 * Şema ihlâlinde 400 + `gecersiz_istek` döner.
 */

type Req = ExpressRequest

function formatZod(err: ZodError): string[] {
  return err.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
}

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Req, _res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) {
      next(gecersizIstek('gecersiz_istek', formatZod(parsed.error)[0] ?? 'Geçersiz istek gövdesi'))
      return
    }
    // Doğrulanmış veriye handler'da erişim kolaylığı için ekle (opt-in).
    ;(req as Req & { validatedBody: T }).validatedBody = parsed.data
    next()
  }
}

export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Req, _res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.query)
    if (!parsed.success) {
      next(gecersizIstek('gecersiz_istek', formatZod(parsed.error)[0] ?? 'Geçersiz sorgu parametresi'))
      return
    }
    ;(req as Req & { validatedQuery: T }).validatedQuery = parsed.data
    next()
  }
}

export function validateParams<T>(schema: ZodSchema<T>) {
  return (req: Req, _res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.params)
    if (!parsed.success) {
      next(gecersizIstek('gecersiz_istek', formatZod(parsed.error)[0] ?? 'Geçersiz yol parametresi'))
      return
    }
    ;(req as Req & { validatedParams: T }).validatedParams = parsed.data
    next()
  }
}

/** Sık kullanılan atomik şemalar */
export const IdParam = z.object({ id: z.string().uuid() })
export const PaginationQuery = z.object({
  sayfa: z.coerce.number().int().min(1).default(1),
  sayi: z.coerce.number().int().min(1).max(200).default(20),
})
