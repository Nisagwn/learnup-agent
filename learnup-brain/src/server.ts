import { env } from './config/env.js'
import { logger } from './utils/logger.js'
import { createApp } from './app.js'
import { redis, redisBlocking, pingRedis } from './clients/redis.js'

const app = createApp()

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'learnup-brain API dinlemede')
})

// Başlangıçta Redis bağlantısını doğrula (opsiyonel — başlatmayı bloklamaz).
if (redis) {
  void pingRedis().then((status) => {
    if (status === 'ok') logger.info('redis bağlantısı doğrulandı (PONG)')
    else logger.warn({ status }, 'redis yapılandırıldı ama erişilemedi — ajan orkestrasyonu devre dışı olabilir')
  })
} else {
  logger.info('REDIS_URL tanımsız — ajan orkestrasyonu (Streams) bu süreçte devre dışı')
}

/** Nazik kapanış — açık bağlantıları bitirip çıkar. */
function shutdown(signal: string): void {
  logger.info({ signal }, 'kapanıyor…')
  server.close(() => {
    logger.info('HTTP sunucusu kapandı')
    // Açık Redis soketlerini nazikçe kapat (varsa).
    void Promise.allSettled([redis?.quit(), redisBlocking?.quit()]).then(() => process.exit(0))
  })
  // Emniyet: 10 sn içinde kapanmazsa zorla çık.
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
