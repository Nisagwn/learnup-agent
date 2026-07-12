import pino from 'pino'
import { env } from '../config/env.js'

/**
 * Uygulama genel logger'ı (pino).
 * Prod: JSON `info`; dev: `debug`. (İstenirse `pino-pretty` eklenip transport verilebilir.)
 */
export const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  base: { service: 'learnup-brain' },
})
