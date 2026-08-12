import express, { type Express } from 'express'
import helmet from 'helmet'
import cors from 'cors'
import { pinoHttp } from 'pino-http'
import { env } from './config/env.js'
import { logger } from './utils/logger.js'

const isProd = env.NODE_ENV === 'production'
const originList = isProd
  ? [env.APP_URL]
  : [env.APP_URL, 'http://localhost:5173', 'http://localhost:3000']
if (!isProd) {
  logger.debug({ origins: originList }, 'CORS: geliştirme modunda localhost origin\'leri açık')
}
import { notFound, errorHandler } from './middleware/error.js'
import { requireAuth } from './middleware/auth.js'
import { requireAktifHesap } from './middleware/requireAktifHesap.js'
import { oturumKapisi } from './middleware/oturum.js'
import { standardLimiter, chatLimiter, llmLimiter } from './middleware/rateLimit.js'
import { healthRouter } from './routes/health.routes.js'
import { chatRouter } from './routes/chat.routes.js'
import { testsRouter } from './routes/tests.routes.js'
import { telemetryRouter } from './routes/telemetry.routes.js'
import { questionStateRouter } from './routes/questionState.routes.js'
import { agentsRouter, agentsStatusRouter } from './routes/agents.routes.js'
// ── Migrasyon (Edge Functions → route) ──
import { questionsRouter } from './routes/questions.routes.js'
import { practiceRouter } from './routes/practice.routes.js'
import { assignmentsRouter } from './routes/assignments.routes.js'
import { gamificationRouter } from './routes/gamification.routes.js'
import { gardenRouter } from './routes/garden.routes.js'
import { aiRouter } from './routes/ai.routes.js'
import { accountRouter } from './routes/account.routes.js'
import { oturumRouter } from './routes/oturum.routes.js'
// ── v1 (master plan Faz 1) ──
import { answersRouter } from './routes/answers.routes.js'
import { aiQuestionsRouter } from './routes/aiquestions.routes.js'
import { masteryRouter } from './routes/mastery.routes.js'
// ── Öğretmen / Yönetici panelleri ──
import { requireRole, requireOgretmenKapsami } from './middleware/requireRole.js'
import { teacherRouter } from './routes/teacher.routes.js'
import { sinifRouter } from './routes/sinif.routes.js'
import { ogretmenBasvuruRouter } from './routes/ogretmen-basvuru.routes.js'
import { adminRouter } from './routes/admin.routes.js'

/**
 * Express uygulamasını kurar (mount + middleware zinciri).
 *
 * NOT (Hotfix 2 — SSE): `compression()` KULLANILMAZ ve `standardLimiter` `/api/chat`'e
 * mount edilmez; SSE token akışının buffer'lanmaması/kesilmemesi için. `standardLimiter`
 * yalnız mutating rotalara (tests/telemetry/question-state/agents) per-router eklenir.
 */
export function createApp(): Express {
  const app = express()

  app.disable('x-powered-by')
  // Ters vekil (Docker/ingress) arkasındayız: X-Forwarded-For'a güven ki req.ip gerçek istemci
  // olsun. Ayarlanmazsa req.ip HERKES için vekilin IP'sidir. (Rate limit anahtarı artık userId
  // olduğu için kritik değil, ama log'lardaki ve teorik IP yedeğindeki yalanı da bitiriyor.)
  app.set('trust proxy', 1)
  app.use(helmet())
  // CORS: yalnız bilinen frontend origin'i. cors() çıplak çağrıldığında `Access-Control-Allow-
  // Origin: *` gönderiyordu — Bearer token kullandığımız için oturum çalınamıyor, ama API'yi
  // herkese açık tutmanın da bir gerekçesi yok.
  app.use(
    cors({
      origin: originList,
      credentials: false,
    }),
  )
  app.use(express.json({ limit: '1mb' }))
  app.use(pinoHttp({ logger }))

  // Sağlık kontrolü — auth/limit yok
  app.use('/health', healthRouter)

  // Eski (v1-öncesi) /api/* yüzeyi cutover boyunca çalışır ama deprecated işaretlenir.
  // Uyarı middleware'i artık top-level: app.use('/api', ...) şeklinde mount etmek
  // Express'in iç-yol (mounted path) davranışını değiştirip sonraki route mount'larını
  // bozabiliyordu. Burada sadece gelen path'i kontrol edip header ekliyoruz — req.url
  // değişmeden kalır.
  app.use((req, res, nextFn) => {
    if (req.path.startsWith('/api') && !req.path.startsWith('/api/v1')) res.setHeader('Deprecation', 'true')
    nextFn()
  })

  /**
   * KİMLİK ZİNCİRİ — tek yerde kurulur, her yola aynı biçimde takılır.
   *
   * `requireAuth` "sen kimsin?"i, `oturumKapisi` "bu oturum hâlâ açık mı?"yı,
   * `requireAktifHesap` "hesabın açık mı?"yı yanıtlar. Sıra rastgele değil:
   *  1) Kimlik kanıtlanmadan oturum sorusunun konusu yoktur.
   *  2) Oturum kapısı TEK Redis okumasıdır; askı kapısı soğuk önbellekte DB'ye gider —
   *     sonlandırılmış oturuma profil sorgusu ödetmenin anlamı yok.
   *  3) Askı rol kapılarından ÖNCE gelmek zorunda: askı bir yetki sorunu değil, erişimin
   *     tümden kesilmesidir (0025).
   * Diziyi tek sabitte tutmak, yeni bir router eklerken kapılardan birinin sessizce
   * unutulmasını imkânsız kılar.
   */
  const kimlikli = [requireAuth, oturumKapisi, requireAktifHesap]

  // Aynı router setini hem /api (legacy alias) hem /api/v1 (kanonik) altına bağlar.
  for (const base of ['/api', '/api/v1']) {
    // SSE: compression YOK, standardLimiter YOK → kimlik zinciri → chatLimiter (yalnız başlatma)
    app.use(`${base}/chat`, kimlikli, chatLimiter, chatRouter)
    // LLM ÇAĞIRAN rotalar: dar limit (10/dk/kullanıcı). Tek istek onlarca LLM çağrısı
    // tetikleyebiliyor → burada sınır hız değil, FATURA meselesi.
    app.use(`${base}/tests`, kimlikli, llmLimiter, testsRouter)
    // Görev durumu YOKLAMA ucu — /agents'tan ÖNCE (Express sıralı eşleşir, V§3.5.8).
    // llmLimiter DEĞİL standardLimiter: tek SELECT, sıfır LLM. 10/dk kovasına konması
    // yoklamayı imkânsız kılıyordu (3 sn'de bir = 20 istek/dk → 429).
    app.use(`${base}/agents/status`, kimlikli, standardLimiter, agentsStatusRouter)
    app.use(`${base}/agents`, kimlikli, llmLimiter, agentsRouter)
    // Mutating rotalar: kimlik zinciri + standardLimiter
    app.use(`${base}/telemetry`, kimlikli, standardLimiter, telemetryRouter)
    app.use(`${base}/question-state`, kimlikli, standardLimiter, questionStateRouter)
    // Birleşik cevap ucu (record-answer + telemetry'nin halefi)
    app.use(`${base}/answers`, kimlikli, standardLimiter, answersRouter)
    // TELİF KARARI (2026-07-22): /questions/osym KALDIRILDI — çıkmış ÖSYM soruları hiçbir
    // role servis edilmez (UI'sız API erişimi de yayındır). Yol hiçbir router'a eşleşmez →
    // notFound 404, kaynak hiç yokmuş gibi (M§9 deseniyle tutarlı; 403/410 varlığı doğrulardı).
    // Veri DB'de yaşamaya devam eder: RAG/üretim hattı ve iç ölçüm okumayı sürdürür.
    // AI üretimi havuz görüntüleyici (salt-okunur) — /questions'tan ÖNCE (Express sıralı eşleşir, V§3.5.8)
    app.use(`${base}/questions/ai`, kimlikli, standardLimiter, aiQuestionsRouter)
    // Migrasyon rotaları (Edge Functions → Express) — LLM çağıranlar llmLimiter'da
    // ⚠️ ROL KAPISI: bu router'ın üç ucu da (generate/targeted/save) ÖĞRETMEN aracıdır ve
    // üçü de paylaşılan `questions` havuzuna YAZAR. Kapı yokken herhangi bir öğrenci hesabı
    // havuza satır basabiliyor, /targeted ile başka bir öğrencinin SRS yanlış-cevap
    // geçmişini çekebiliyordu. requireRole ayrıca öğretmenin onayını da doğrular
    // (is_approved) → onayı iptal edilmiş öğretmenin kalıcı erişim penceresi de kapanır.
    app.use(`${base}/questions`, kimlikli, llmLimiter, requireRole('teacher', 'admin'), questionsRouter)
    app.use(`${base}/ai`, kimlikli, llmLimiter, aiRouter)
    app.use(`${base}/practice`, kimlikli, standardLimiter, practiceRouter)
    // Bilişsel harita (salt-okunur) — çürüme-farkındalıklı ustalık; LLM yok
    app.use(`${base}/mastery`, kimlikli, standardLimiter, masteryRouter)
    app.use(`${base}/assignments`, kimlikli, standardLimiter, assignmentsRouter)
    app.use(`${base}/gamification`, kimlikli, standardLimiter, gamificationRouter)
    app.use(`${base}/garden`, kimlikli, standardLimiter, gardenRouter)
    // ⚠️ /account/delete askı kapısının ARDINDA: askıdaki hesap kendini silerek
    // askıdan kaçamaz. KVKK talebi askı kalktıktan sonra ya da yönetici eliyle işler.
    app.use(`${base}/account`, kimlikli, standardLimiter, accountRouter)
    // Oturum yönetimi (kendi cihazların): listele · bu cihazdan çık · her yerden çık.
    // Kapının ARDINDA olması kasıtlı: sonlandırılmış bir oturum kendi listesini de göremez.
    app.use(`${base}/oturum`, kimlikli, standardLimiter, oturumRouter)
    // Öğretmen paneli — LLM çağrısı YOK. standardLimiter kapıdan ÖNCE: rol yoklayan
    // döngü de sınırlansın.
    //
    // ⚠️ KAPSAM ARTIK req.userId DEĞİL (0025): `requireOgretmenKapsami` öğretmende
    // kapsamı kendi id'sine, yöneticide ?ogretmenId ile SEÇİLEN öğretmene bağlar.
    // Yönetici seçim yapmadan girerse 403 — sessizce boş sınıf ASLA.
    app.use(`${base}/teacher`, kimlikli, standardLimiter, requireOgretmenKapsami, teacherRouter)
    // Sınıf kaydı (öğrenci tarafı) — rol kapısı YOK: uç kendi içinde role='student' arar.
    // Hedef satır her zaman req.userId'dir, gövdeden gelmez.
    app.use(`${base}/sinif`, kimlikli, standardLimiter, sinifRouter)
    // Öğretmen başvurusu (öğrenci tarafı) — rol kapısı YOK: uç kendi içinde role='student'
    // arar. YALNIZ "başvuru bekliyor" durumunu yazar; rolü yönetici çevirir (0019 çizgisi
    // korunur, rol istemciden yazılmaz/türetilmez). Hedef satır her zaman req.userId.
    app.use(`${base}/ogretmen-basvuru`, kimlikli, standardLimiter, ogretmenBasvuruRouter)
    // Yönetici paneli. Öğretmen uçlarıyla AYRI yüzeyler olmayı sürdürür: yönetici
    // sınıf verisine /teacher/* üzerinden ?ogretmenId ile girer, buradan DEĞİL.
    app.use(`${base}/admin`, kimlikli, standardLimiter, requireRole('admin'), adminRouter)
  }

  app.use(notFound)
  app.use(errorHandler)

  return app
}
