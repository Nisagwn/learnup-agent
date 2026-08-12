import type OpenAI from 'openai'
import { TEMP } from '../lib/models.js'
import { routedStream } from '../lib/model-router.js'
import { composeChatContext, pushChatTurn } from '../lib/desk.js'
import { PERSONA_CHARTER, ONBOARDING_ADDENDUM } from '../persona/kaptan.charter.js'
import { supabase } from '../clients/supabase.js'
import { markActive } from './katip.js'
import { chatGate } from './nabiz.js'
import { KAPTAN_TOOLS, runKaptanTool, EYLEM_ANAHTARI, ONERI_ANAHTARI, type EylemTarifi } from './tools.js'
import { logger } from '../utils/logger.js'

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam

/**
 * AKIŞ DURUMU — sohbette görünen ilerleme satırının anahtarı.
 *
 * ⚠️ ETİKET DEĞİL ANAHTAR TAŞINIR. Cümleyi istemci kurar (Kaptan.tsx · DURUM_ADIMI):
 * metni buradan göndermek, arayüz dilini backend sürümüne bağlardı — kelimeyi
 * değiştirmek için servis deploy'u gerekirdi.
 */
export type DurumAdi =
  /** Koç Masası + anı endeksi okunuyor (composeChatContext). */
  | 'veri'
  /** Model çağrıldı, ilk token bekleniyor. */
  | 'model'
  /** İlk token geldi — yanıt yazılıyor. */
  | 'yanit'

/** SSE olayı — chat route bunu `event: <type>` / `data: <json>` olarak akıtır. */
export type ChatEvent =
  | { type: 'token'; data: string }
  | { type: 'tool'; data: string }
  /**
   * Sunucunun O AN NE YAPTIĞI. `tool`dan farkı: o, modelin ÇAĞIRDIĞI aracı bildirir
   * (yani yalnız araç varsa vardır), bu ise her turda akan boru hattının kendisidir.
   *
   * Sebebi: araçsız bir turda öğrenci ilk token'a kadar (bağlam derleme + model
   * gecikmesi, saniyeler) yalnız üç zıplayan nokta görüyordu — donma ile çalışma
   * ayırt edilemiyordu. Artık her adım satır olarak düşüyor.
   */
  | { type: 'durum'; data: DurumAdi }
  /**
   * Mesaja iliştirilen tıklanabilir eylem (buton). `tool` olayından FARKI: o yalnız
   * aracın ADINI taşır ("çalışıyor…" göstergesi için), bu ise aracın SONUCUNU taşır.
   * Eskiden araç sonuçları yalnız LLM'e gidiyordu; öğrenci onların düzyazıya çevrilmiş
   * halini görüyordu. Yapısal veri (kazanım, zorluk) düzyazıya çevrilip öğrenciden geri
   * parse edilmesi bekleniyordu — buton o veriyi olduğu gibi kullanır.
   */
  | { type: 'eylem'; data: EylemTarifi }
  /**
   * Giriş kutusunun üstündeki takip çipleri. `eylem`den AYRI: eylem bir EKRANA götürür
   * (buton → /coz), öneri SOHBETİ SÜRDÜRÜR (çip → aynı metni mesaj olarak gönderir).
   *
   * Çipler eskiden SABİTTİ ("Bugünkü planım · Dünü özetle · Moralim bozuk") ve konuşma
   * ilerledikçe alakasızlaşıyordu: öğrenci türev sorusu çözerken ekranda hâlâ "Moralim
   * bozuk" duruyordu. Artık her turda o konuşmaya özgü yenileniyor.
   */
  | { type: 'oneri'; data: string[] }
  | { type: 'error'; data: string }

type AccToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } }
type DeltaToolCall = { index: number; id?: string; function?: { name?: string; arguments?: string } }

/** Stream'lenen tool_call delta'larını index'e göre birleştirir. */
function accumulate(acc: AccToolCall[], deltas: DeltaToolCall[]): void {
  for (const d of deltas) {
    acc[d.index] ??= { id: '', type: 'function', function: { name: '', arguments: '' } }
    const slot = acc[d.index]
    if (d.id) slot.id = d.id
    if (d.function?.name) slot.function.name += d.function.name
    if (d.function?.arguments) slot.function.arguments += d.function.arguments
  }
}

/**
 * Kaptan sohbet akışı — 4 halkalı hafıza (§4.3) + stream + tool-loop.
 *   [1] charter + Koç Masası (stabil prefix)  [2] semantik (masada gömülü)
 *   [3] son 12 tur pencere                    [4] episodik recall (anı endeksi)
 * Tur sonunda mesajlar chat_messages'a persist edilir (kopan istemcide kayıp yok).
 */
export async function* streamKaptan(
  userId: string,
  sessionId: string,
  userMsg: string,
  /**
   * GİZLİ TUR BAĞLAMI — modele gider, öğrenciye GÖRÜNMEZ, geçmişe YAZILMAZ.
   *
   * Tek üreticisi sunucudur (persona/kaptan.charter.ts · testAnaliziIstemi); istemci yalnız
   * yapısal veri gönderir, cümleleri backend kurar. Serbest metni istemciden alıp buraya
   * koymak, kullanıcıya kendi sohbetinde persona'yı ezme kapısı açardı.
   *
   * ⚠️ `composeChatContext`'e VERİLMEZ: o, episodik anı aramasını `userMsg` embedding'iyle
   * yapar. 12 satırlık test dökümünü oraya sokmak, anı aramasını sohbetin konusundan
   * koparıp "skor/yanlış" kelimelerine benzeyen alakasız oturumları çağırırdı.
   */
  gizliBaglam?: string,
): AsyncGenerator<ChatEvent> {
  // ⚠️ İLK YIELD, İLK `await`TEN ÖNCE. Bağlam derleme (Redis penceresi + embedding +
  // anı araması) turun en uzun sessiz parçasıdır; sonrasında bildirmek, bildirimi tam da
  // gereken yerde geciktirirdi.
  yield { type: 'durum', data: 'veri' }
  const ctx = await composeChatContext(userId, userMsg)
  const isOnboarding = ctx.desk.includes('ONBOARDING')
  const system = [
    PERSONA_CHARTER,
    isOnboarding ? ONBOARDING_ADDENDUM : '',
    `\n### KOÇ MASASI\n${ctx.desk}`,
    ctx.recall ? `\n### GEÇMİŞ ANILAR (ilgili oturumlar)\n${ctx.recall}` : '',
  ].filter(Boolean).join('\n')

  const messages: ChatMessage[] = [
    { role: 'system', content: system },
    ...ctx.window.map((t): ChatMessage => ({ role: t.role, content: t.content })),
    // ⚠️ PENCEREDEN SONRA, KULLANICI MESAJINDAN ÖNCE. Sıra bilinçli: bağlam bu TURA aittir,
    // kalıcı persona'ya değil (charter'ın yanına konsa sonraki turlarda da yaşardı) ve
    // kullanıcı mesajının içine gömülse geçmişe o haliyle yazılırdı.
    ...(gizliBaglam ? [{ role: 'system' as const, content: gizliBaglam }] : []),
    { role: 'user', content: userMsg },
  ]

  /**
   * ⚠️ KULLANICI MESAJI AKIŞTAN ÖNCE YAZILIR — turun sonunda DEĞİL.
   *
   * Eskiden ikisi de tur sonunda tek `persistTurn` ile yazılıyordu. Akış ortasında node
   * ölürse (deploy, OOM, çökme) hiçbir şey yazılmamış oluyordu ve nginx bunu KURTARAMAZ:
   * `proxy_buffering off` ile yanıt başlıkları çoktan istemciye gitmiştir, `proxy_next_upstream`
   * devreye giremez. Öğrenci sayfayı yenilediğinde kendi yazdığı mesajı bile göremiyordu —
   * sistem soruyu hiç duymamış gibi davranıyordu.
   *
   * Sıra bu yüzden önemli: `composeChatContext` YUKARIDA çağrıldı, yani bağlam penceresi
   * bu mesaj eklenmeden alındı; burada yazmak pencereyi çift saymaz.
   */
  await persistKullaniciMesaji(userId, sessionId, userMsg)

  let finalText = ''
  /** Bu turda gösterilen butonlar — tur sonunda mesajla birlikte kalıcılaştırılır. */
  const turEylemleri: EylemTarifi[] = []
  /**
   * 'yanit' durumu TUR BAŞINA DEĞİL, AKIŞ BAŞINA bir kez duyurulur. Tur döngüsü aynı
   * yanıtın parçalarını üretiyor (araç → devam); her turda tekrar bildirmek, öğrenciye
   * yanıt birkaç kez baştan yazılıyormuş gibi görünürdü.
   */
  let yanitBildirildi = false
  try {
    for (let turn = 0; turn < 6; turn++) {
      // Model bekleniyor — araç turlarından SONRA da yeniden duyurulur: araç sonucu
      // dönmüşken satırın "çalışıyor" kalması, kilitlenmiş bir adım gibi okunurdu.
      yield { type: 'durum', data: 'model' }
      // P0 interaktif: ücretsiz zincir → bütçe dolarsa paid'e düşer, öğrenci hata görmez.
      const { stream } = await routedStream('chat', {
        temperature: TEMP.DERIVE,
        tools: KAPTAN_TOOLS,
        messages,
      }, { priority: 'P0' })

      const toolAcc: AccToolCall[] = []
      let text = ''
      for await (const chunk of stream) {
        const choice = chunk.choices[0]
        if (!choice) continue
        const delta = choice.delta
        if (delta.content) {
          if (!yanitBildirildi) {
            yanitBildirildi = true
            yield { type: 'durum', data: 'yanit' }
          }
          text += delta.content
          yield { type: 'token', data: delta.content }
        }
        if (delta.tool_calls) accumulate(toolAcc, delta.tool_calls)
      }

      const toolCalls = toolAcc.filter((t) => t.function.name)
      messages.push(
        toolCalls.length
          ? { role: 'assistant', content: text || null, tool_calls: toolCalls }
          : { role: 'assistant', content: text },
      )
      if (text) finalText = text

      if (!toolCalls.length) return // düz yanıt tamamlandı → finally persist eder

      for (const call of toolCalls) {
        let parsed: Record<string, unknown> = {}
        try {
          parsed = call.function.arguments
            ? (JSON.parse(call.function.arguments) as Record<string, unknown>)
            : {}
        } catch {
          parsed = {}
        }
        yield { type: 'tool', data: call.function.name }
        let out: unknown
        try {
          out = await runKaptanTool(call.function.name, parsed, userId)
        } catch (err) {
          out = { error: err instanceof Error ? err.message : 'araç hatası' }
          logger.error({ err, tool: call.function.name }, 'Kaptan aracı hata verdi')
        }

        /**
         * Araç sonucuna iliştirilmiş eylemleri AYIKLA — hem istemciye yay hem kalıcılaştır.
         *
         * ⚠️ EYLEMLER LLM'E GERİ VERİLMEZ (`delete`). Modelin buton tarifini kendi bağlamında
         * görmesi, onu metinde tekrar anlatmaya ("aşağıdaki butona basabilirsin, 5 soru,
         * orta zorluk…") teşvik ediyor — yani düzyazıya dönüş. Model yalnız `{ok:true,
         * gosterildi:'…'}` görür: buton gösterildi, konuyu kapat.
         */
        const ham = out as Record<string, unknown> | null
        const eylemler = Array.isArray(ham?.[EYLEM_ANAHTARI])
          ? (ham[EYLEM_ANAHTARI] as EylemTarifi[])
          : []
        if (ham && EYLEM_ANAHTARI in ham) delete ham[EYLEM_ANAHTARI]
        for (const eylem of eylemler) {
          turEylemleri.push(eylem)
          yield { type: 'eylem', data: eylem }
        }

        // Takip çipleri — aynı ayıklama, ayrı kanal. LLM'e geri verilmez (aynı gerekçe:
        // modelin kendi önerdiği çipleri metinde tekrar sayması düzyazıya dönüştür).
        const oneriler = Array.isArray(ham?.[ONERI_ANAHTARI])
          ? (ham[ONERI_ANAHTARI] as string[])
          : []
        if (ham && ONERI_ANAHTARI in ham) delete ham[ONERI_ANAHTARI]
        if (oneriler.length) yield { type: 'oneri', data: oneriler }

        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(out) })
      }
    }
  } finally {
    /**
     * ⚠️ `finally` — ÜÇ ÇIKIŞ YOLUNUN DA TEK TOPLAYICISI:
     *   1) düz yanıt tamamlandı (`return`)
     *   2) tur limiti (6) doldu
     *   3) akış ORTASINDA hata / istemci koptu (LLM patladı, generator `.return()` aldı)
     *
     * 3. yol eskiden hiç yazmıyordu: yarım kalan yanıt tamamen kayboluyordu. Artık eldeki
     * kısmî metin de kaydedilir — öğrenci yarım da olsa cevabı görür, Kâtip'in oturum
     * özeti eksik veriyle çalışmaz.
     *
     * ⚠️ Bu, node'un ÖLDÜĞÜ durumu kurtarmaz — o an hiçbir kod çalışmaz. Onun karşılığı
     * yukarıdaki erken `persistKullaniciMesaji`: en azından soru kaydedilmiş olur.
     */
    await persistAsistanMesaji(userId, sessionId, finalText, turEylemleri)
  }
}

/**
 * Kullanıcı mesajını kalıcılaştırır — AKIŞ BAŞLAMADAN ÖNCE.
 * chat_messages (PG hakikat) + Redis penceresi + Kâtip aktif kümesi + Nabız duygu kapısı.
 */
async function persistKullaniciMesaji(
  userId: string,
  sessionId: string,
  userMsg: string,
): Promise<void> {
  try {
    await supabase
      .from('chat_messages')
      .insert([{ user_id: userId, session_id: sessionId, role: 'user', content: userMsg }])
    await pushChatTurn(userId, { role: 'user', content: userMsg })
    await markActive(userId)
    await chatGate(userId, userMsg) // Nabız duygu kapısı (async — gecikme eklemez)
  } catch (err) {
    // İZOLE: kalıcılaştırma sohbeti ÖLDÜRMEZ. Öğrenci cevabını alır, kayıt kaybolur.
    logger.warn({ err }, 'kullanıcı mesajı persist edilemedi (izole)')
  }
}

/**
 * Asistan yanıtını kalıcılaştırır. Boş metin (hiç token gelmedi) yazılmaz.
 *
 * ⚠️ EYLEMLER DE YAZILIR (0034). SSE olayı yalnız o an bağlı istemciye ulaşır; öğrenci
 * sayfayı yenilerse balon metni durur ama butonu giderdi — tıklanacak hiçbir şeyi olmayan
 * "5 soru çözelim mi?" mesajı. `/chat/history` bu kolonu da döndürüyor.
 *
 * ⚠️ Redis penceresine (pushChatTurn) yalnız METİN gider: o pencere LLM'in bağlamıdır ve
 * §yukarıdaki gerekçeyle model buton tarifini görmemeli.
 */
async function persistAsistanMesaji(
  userId: string,
  sessionId: string,
  assistantText: string,
  eylemler: EylemTarifi[] = [],
): Promise<void> {
  if (!assistantText) return
  const temel = { user_id: userId, session_id: sessionId, role: 'assistant', content: assistantText }
  try {
    // Boş dizi yerine null: "buton yoktu" ile "buton vardı ama boş" ayrımı kalsın.
    const { error } = await supabase
      .from('chat_messages')
      .insert([{ ...temel, eylemler: eylemler.length ? eylemler : null }])

    /**
     * ⚠️ MİGRATION BASILMADIYSA MESAJI KAYBETME. 0034 uygulanmamış bir ortamda `eylemler`
     * kolonu yoktur ve PostgREST TÜM insert'i reddeder — yani buton uğruna ÖĞRENCİNİN
     * YANITI kaybolurdu. Kolonsuz yeniden dene: butonlar gitsin, mesaj kalsın.
     * (Aynı "migration basılmadıysa alan gelmez → opsiyonel" çizgisi rag.ts'te de var.)
     */
    if (error) {
      logger.warn({ err: error }, 'eylemler kolonuyla yazılamadı — kolonsuz yeniden deneniyor (0034 basılı mı?)')
      const { error: ikinci } = await supabase.from('chat_messages').insert([temel])
      if (ikinci) throw ikinci
    }
    await pushChatTurn(userId, { role: 'assistant', content: assistantText })
  } catch (err) {
    logger.warn({ err }, 'asistan yanıtı persist edilemedi (izole)')
  }
}
