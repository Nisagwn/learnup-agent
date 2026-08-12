import type { Request, Response, NextFunction } from 'express'
import { createRemoteJWKSet, jwtVerify, errors } from 'jose'
import { logger } from '../utils/logger.js'
import { env } from '../config/env.js'
import { sidCikar, type OturumBilgisi } from '../lib/oturum.js'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** requireAuth başarılıysa doğrulanan Supabase kullanıcı kimliği (JWT `sub`). */
      userId?: string
      /**
       * Token'ın oturum kimliği (`session_id`) + basım anı. `oturumKapisi` bunu okur.
       *
       * ⚠️ Talepleri BURADA okuyoruz çünkü doğrulanmış payload yalnız burada var. Aşağı
       * katmanların token'ı yeniden çözmesi, imzası doğrulanmamış veriye bakma riskidir.
       */
      oturum?: OturumBilgisi
    }
  }
}

/**
 * Bearer JWT'yi ASİMETRİK (RS256/ES256) doğrular — Supabase JWKS'ine karşı.
 * `createRemoteJWKSet` public anahtarları getirip CACHE'ler → istek başına ağ round-trip'i YOK
 * (yalnız ilk doğrulama / anahtar rotasyonunda JWKS çekilir). Paylaşılan secret gerekmez.
 * JWKS URL'i `SUPABASE_URL`'den türetilir: `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`.
 */
const JWKS = createRemoteJWKSet(new URL(env.SUPABASE_JWKS_URL))

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'missing_bearer' })
    return
  }
  try {
    const { payload } = await jwtVerify(header.slice(7), JWKS, {
      issuer: `${env.SUPABASE_URL}/auth/v1`,
      audience: 'authenticated',
    })
    if (!payload.sub) {
      res.status(401).json({ error: 'invalid_token' })
      return
    }
    req.userId = payload.sub
    req.oturum = {
      sid: sidCikar(payload),
      userId: payload.sub,
      // `iat` saniye cinsindendir; kesim damgası ms tutulur (Date.now() ile aynı birim).
      iatMs: typeof payload.iat === 'number' ? payload.iat * 1000 : 0,
    }
    next()
  } catch (err) {
    // İstemciye detay sızdırmadan log'a ayrım yaz (debug/izleme).
    let neden = 'unknown'
    if (err instanceof errors.JOSEError) {
      neden = err.code ?? err.constructor.name
    } else if (err instanceof Error) {
      neden = err.name
    }
    logger.debug({ neden, path: req.path }, 'JWT doğrulama reddedildi')
    res.status(401).json({ error: 'invalid_token' })
  }
}
