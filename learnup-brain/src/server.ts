import { env } from './config/env.js'
import { logger } from './utils/logger.js'
import { createApp } from './app.js'
import { redis, redisBlocking, redisLimiter, pingRedis, redisReady } from './clients/redis.js'
import { setInprocHandler } from './agents/bus.js'
import { handleTask } from './agents/ritim.js'

const app = createApp()

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'learnup-brain API dinlemede')
})

// Başlangıçta Redis bağlantısını doğrula (opsiyonel — başlatmayı bloklamaz).
//
// ⚠️ ÖNCE redisReady() BEKLENİR, sonra ping atılır. Doğrudan ping atmak YANLIŞ TEŞHİS ürettiriyordu:
// hot-path client `enableOfflineQueue:false` olduğu için soket açılmadan gelen PING anında reddedilir
// → süreç, Redis TAMAMEN SAĞLIKLIYKEN bile "erişilemedi" basıyordu. (Ölçüldü: uyarıdan 10ms sonra
// aynı client "redis bağlandı" logluyordu; uyarı ekranda kalıp Redis'i suçlu gösteriyordu.)
if (redis) {
  void redisReady(5000)
    .then(() => pingRedis())
    .then((status) => {
      if (status === 'ok') logger.info('redis bağlantısı doğrulandı (PONG)')
      else logger.warn({ status }, 'redis yapılandırıldı ama erişilemedi — ajan orkestrasyonu devre dışı olabilir')
    })
} else {
  // ⚠️ REDİS'SİZ DÜŞÜŞ ARTIK GERÇEK. bus.ts'te tam olarak yazılmış bir in-process kuyruk vardı
  // (eşzamanlılık 2) ama setInprocHandler HİÇ ÇAĞRILMIYORDU — yani belgelenen "zarif düşüş"
  // gerçekte YOKTU: REDIS_URL olmadan her görev sonsuza kadar PENDING'de kalıyordu (worker da
  // Redis'siz açılmıyor, dolayısıyla bekçi bile toparlamıyordu). Görevler sessizce kayboluyordu.
  // Handler burada enjekte edilir; bus → ritim döngüsel import'u böyle kırılır.
  setInprocHandler(handleTask)
  logger.warn('REDIS_URL tanımsız — ajan görevleri bu süreçte İN-PROCESS işlenecek (eşzamanlılık 2)')
}

/** Nazik kapanış — açık bağlantıları bitirip çıkar. */
function shutdown(signal: string): void {
  logger.info({ signal }, 'kapanıyor…')
  server.close(() => {
    logger.info('HTTP sunucusu kapandı')
    // Açık Redis soketlerini nazikçe kapat (varsa).
    void Promise.allSettled([redis?.quit(), redisBlocking?.quit(), redisLimiter?.quit()]).then(() =>
      process.exit(0),
    )
  })
  // Emniyet: 10 sn içinde kapanmazsa zorla çık.
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
