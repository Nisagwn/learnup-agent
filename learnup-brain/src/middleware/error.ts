import type { Request, Response, NextFunction } from 'express'
import { logger } from '../utils/logger.js'
import { HttpHatasi } from '../lib/hata.js'

/** Tanımsız route → 404. */
export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ error: 'not_found' })
}

/**
 * Merkezi hata yakalayıcı — middleware zincirinin EN SONUNDA mount edilir.
 * Express bir middleware'i 4 parametreli olduğunda "error handler" sayar; `_next` bu yüzden var.
 *
 * İKİ SINIF HATA:
 *  - HttpHatasi  → KASITLI. status/code/message olduğu gibi istemciye gider.
 *  - diğer her şey → BEKLENMEYEN. 500 + jenerik mesaj.
 *
 * ⚠️ Beklenmeyen hatanın `err.message`'ı artık DIŞARI ÇIKMIYOR (eskiden çıkıyordu):
 * Postgres/PostgREST hataları mesajın içinde tablo ve kolon adı taşır — o metni
 * istemciye vermek şema keşfine davetiyedir. Ayrıntı log'da kalır.
 */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const kasitli = err instanceof HttpHatasi
  const status = kasitli ? err.status : 500
  const code = kasitli ? err.code : 'internal_error'
  const message = kasitli ? err.message : 'Beklenmeyen bir hata oluştu.'

  // 4xx istemci hatasıdır, gürültü değil → warn. 5xx bizim arızamız → error.
  logger[status >= 500 ? 'error' : 'warn']({ err }, 'istek hatası')

  // SSE gibi akış zaten başladıysa gövdenin üzerine yazma.
  if (res.headersSent) return
  res.status(status).json({ error: code, message })
}
