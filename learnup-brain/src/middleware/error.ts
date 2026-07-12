import type { Request, Response, NextFunction } from 'express'
import { logger } from '../utils/logger.js'

/** Tanımsız route → 404. */
export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ error: 'not_found' })
}

/**
 * Merkezi hata yakalayıcı — middleware zincirinin EN SONUNDA mount edilir.
 * Express bir middleware'i 4 parametreli olduğunda "error handler" sayar; `_next` bu yüzden var.
 */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  logger.error({ err }, 'istek hatası')
  // SSE gibi akış zaten başladıysa gövdenin üzerine yazma.
  if (res.headersSent) return
  const message = err instanceof Error ? err.message : 'internal_error'
  res.status(500).json({ error: 'internal_error', message })
}
