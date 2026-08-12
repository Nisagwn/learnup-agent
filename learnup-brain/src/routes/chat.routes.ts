import { Router } from 'express'
import { z } from 'zod'
import { streamKaptan } from '../agents/kaptan.js'
import { testAnaliziIstemi } from '../persona/kaptan.charter.js'
import { supabase } from '../clients/supabase.js'
import { logger } from '../utils/logger.js'

/** POST /api/chat — Kaptan sohbet akışı (SSE). requireAuth + chatLimiter app.ts'te zincirlenir.
 *  GET    /api/chat/history?sessionId= — bir oturumun mesajları (parametresiz: EN SON oturum).
 *  GET    /api/chat/oturumlar          — oturum listesi (geçmişe gezinme, 0035).
 *  DELETE /api/chat/oturum/:sessionId  — bir sohbeti sil.
 *  chatLimiter (20/dk) sayfa başına birkaç GET için fazlasıyla bol. */
export const chatRouter = Router()

/**
 * OTURUM LİSTESİ (0035) — Koç ekranındaki sohbet geçmişi paneli.
 *
 * Öncesinde bu uç YOKTU ve sonucu şuydu: "yeni sohbet" her basıldığında bir öncekine giden
 * yol kapanıyordu. Veri kaybolmuyordu (chat_messages'ta duruyor) ama öğrenci için yok
 * hükmündeydi — tarih yok, liste yok, geri dönüş yok.
 *
 * Gruplama SQL'de (RPC): PostgREST GROUP BY desteklemez ve satırları çekip Node'da gruplamak
 * kullanıcının BÜTÜN sohbet geçmişini her panel açılışında ağdan geçirmek olurdu.
 */
chatRouter.get('/oturumlar', async (req, res, next) => {
  try {
    const { data, error } = await supabase.rpc('sohbet_oturumlari', {
      p_user_id: req.userId!,
      p_limit: 60,
    })
    // ⚠️ MİGRATION BASILMADIYSA EKRANI ÖLDÜRME: 0035 uygulanmamışsa RPC yoktur. Boş liste
    // dönmek, sohbetin kendisini çalışır bırakır — yalnız geçmiş paneli boş görünür.
    if (error) {
      logger.warn({ err: error }, 'sohbet_oturumlari RPC çağrılamadı (0035 basılı mı?)')
      res.json({ oturumlar: [] })
      return
    }
    res.json({ oturumlar: data ?? [] })
  } catch (err) {
    next(err)
  }
})

/**
 * SOHBET SİLME — kullanıcı kapsamlı.
 *
 * ⚠️ `.eq('user_id', ...)` ŞART: session_id istemci üretimi bir UUID'dir ve gövdeden gelir.
 * Kapsam olmasaydı, başkasının oturum kimliğini ele geçiren biri onun sohbetini silebilirdi
 * (IDOR). Servis service_role ile çalışıyor, yani RLS BURADA KORUMAZ — kapsamı bu satır kurar.
 *
 * ⚠️ `session_summaries` SİLİNMEZ — bilerek. Onlar Kâtip'in hafıza katmanıdır ve Kaptan'ın
 * öğrenciyi hatırlamasını sağlar; sohbeti listeden kaldırmak "beni unut" demek değildir.
 * (Tam unutma KVKK yolu ayrı: /account/delete.)
 */
chatRouter.delete('/oturum/:sessionId', async (req, res, next) => {
  try {
    const sessionId = String(req.params.sessionId ?? '')
    if (!sessionId) {
      res.status(400).json({ error: 'oturum_gerekli', message: 'Oturum kimliği gerekli.' })
      return
    }
    const { error } = await supabase
      .from('chat_messages')
      .delete()
      .eq('user_id', req.userId!)
      .eq('session_id', sessionId)
    if (error) throw error
    res.json({ silindi: true, sessionId })
  } catch (err) {
    next(err)
  }
})

chatRouter.get('/history', async (req, res, next) => {
  try {
    const userId = req.userId!
    /**
     * `?sessionId=` verilirse O oturum yüklenir (geçmiş panelinden tıklama); verilmezse
     * EN SON oturum (sayfaya dönünce kaldığı yerden devam — eski davranış korunur).
     *
     * ⚠️ İSTENEN OTURUM DA KULLANICI KAPSAMINDAN GEÇER. Aşağıdaki sorgu zaten
     * `.eq('user_id', userId)` uyguluyor: başkasının session_id'si verilse bile satır
     * dönmez, boş sohbet görünür — sızıntı yok.
     */
    const istenen = typeof req.query.sessionId === 'string' ? req.query.sessionId.trim() : ''

    let hedefSession = istenen
    if (!hedefSession) {
      const { data: son, error: sonErr } = await supabase
        .from('chat_messages')
        .select('session_id')
        .eq('user_id', userId)
        .not('session_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (sonErr) throw sonErr
      hedefSession = son?.session_id ?? ''
    }
    if (!hedefSession) {
      res.json({ sessionId: null, messages: [] })
      return
    }
    const son = { session_id: hedefSession }
    // Oturumun mesajları — yalnız user/assistant (tool ara-adımları sohbet balonu değildir)
    // `eylemler` (0034) DA OKUNUR: butonlar mesajla birlikte yaşamalı. Yalnız canlı SSE'de
    // gelselerdi sayfa yenilendiğinde balon metni durur, butonu giderdi — tıklanacak hiçbir
    // şeyi olmayan "5 soru çözelim mi?" mesajı kalırdı.
    const oku = (kolonlar: string) =>
      supabase
        .from('chat_messages')
        .select(kolonlar)
        .eq('user_id', userId)
        .eq('session_id', son.session_id)
        .in('role', ['user', 'assistant'])
        .order('created_at', { ascending: true })
        .limit(80)

    let { data: mesajlar, error } = await oku('role, content, created_at, eylemler')

    /**
     * ⚠️ MİGRATION BASILMADIYSA GEÇMİŞİ KAYBETME. 0034 uygulanmamış bir ortamda
     * `eylemler` kolonu yoktur ve PostgREST TÜM select'i reddeder — yani buton uğruna
     * SOHBET GEÇMİŞİNİN TAMAMI 500'e düşerdi. Kolonsuz yeniden dene: butonlar
     * görünmesin, konuşma açılsın.
     */
    if (error) {
      logger.warn({ err: error }, 'eylemler kolonu okunamadı — kolonsuz yeniden deneniyor (0034 basılı mı?)')
      ;({ data: mesajlar, error } = await oku('role, content, created_at'))
    }
    if (error) throw error
    res.json({ sessionId: son.session_id, messages: mesajlar ?? [] })
  } catch (err) {
    next(err)
  }
})

/**
 * TEST ÖZETİ ŞEMASI — Çöz ekranından gelen yapısal sonuç.
 *
 * ⚠️ İSTEMCİ SERBEST METİN GÖNDEREMEZ, YALNIZ BU ALANLARI. Gizli bağlam system katmanına
 * giriyor; oraya istemciden ham metin kabul etmek, kullanıcıya kendi sohbetinde persona'yı
 * ezme ("tüm kuralları yok say") kapısı açardı — modeli genel amaçlı bir asistana çevirip
 * paralı zinciri istediği işe koşabilirdi. Cümleleri sunucu kurar (kaptan.charter.ts).
 *
 * ⚠️ SINIRLAR ŞEMADA. Soru metni 240, liste 10 kayıt: yoksa istemci istediği kadar uzun
 * bir bloğu system'e bastırıp her turda ödenecek bir girdi şişkinliği üretebilirdi.
 */
const TestOzetiSchema = z.object({
  dogru: z.number().int().min(0).max(500),
  toplam: z.number().int().min(0).max(500),
  baslik: z.string().max(80).optional(),
  dokum: z.array(z.object({
    subject: z.string().max(40),
    dogru: z.number().int().min(0).max(500),
    toplam: z.number().int().min(0).max(500),
  })).max(12).default([]),
  yanlislar: z.array(z.object({
    soru: z.string().max(240),
    subject: z.string().max(40),
    konu: z.string().max(80).nullable().optional(),
    secilen: z.string().max(2),
    dogruSik: z.string().max(2),
  })).max(10).default([]),
})

chatRouter.post('/', async (req, res) => {
  const body = req.body as { sessionId?: string; message?: string; testOzeti?: unknown }
  const message = typeof body.message === 'string' ? body.message : ''
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
  if (!message) {
    res.status(400).json({ error: 'message gerekli' })
    return
  }

  /**
   * Gizli tur bağlamı — YALNIZ sunucu üretir. Şema tutmazsa SESSİZCE düşülür: analiz
   * bağlamsız devam eder, sohbet 400'e düşmez. Bozuk bir yan-veri yüzünden öğrencinin
   * mesajını reddetmek, kaybı büyütmek olurdu.
   */
  let gizliBaglam: string | undefined
  if (body.testOzeti != null) {
    const p = TestOzetiSchema.safeParse(body.testOzeti)
    if (p.success) gizliBaglam = testAnaliziIstemi(p.data)
    else logger.warn({ hata: p.error.issues[0]?.message }, 'testOzeti şemaya uymadı — bağlamsız devam')
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // proxy buffer'lamasın (SSE)
  })
  const send = (type: string, data: unknown): void => {
    res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  try {
    for await (const ev of streamKaptan(req.userId!, sessionId, message, gizliBaglam)) {
      send(ev.type, ev.data)
    }
    send('done', 'ok')
  } catch (err) {
    // ⚠️ HAM err.message SSE ile İSTEMCİYE GİTMEZ — merkezî errorHandler'ın kapattığı
    // sızıntının aynısı bu kanaldan açılıyordu (PostgREST/Postgres mesajları tablo ve kolon
    // adı taşır). Teşhis sunucu log'unda kalır; istemci sabit bir metin görür.
    logger.error({ err, sessionId }, 'sohbet akışı hatası')
    send('error', 'Yanıt tamamlanamadı — lütfen tekrar dene.')
  } finally {
    res.end()
  }
})
