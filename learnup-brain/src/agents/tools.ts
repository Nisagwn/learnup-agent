import type OpenAI from 'openai'
import { supabase } from '../clients/supabase.js'
import { buildStudentContext } from '../lib/generation.js'
import { getWeakPaths } from '../lib/curriculum.js'
import { buildMicroTest, type ServedQuestion } from '../lib/test-modes.js'
import { saveQuestionState, loadQuestionState } from '../lib/canvas.js'
import { recallMemories } from '../lib/desk.js'
import { delegateAndAwait, enqueueTask } from './bus.js'

type Tool = OpenAI.Chat.Completions.ChatCompletionTool
type ToolResult = Record<string, unknown> | unknown[]

// ─── Kaptan (chatbot komuta merkezi) araçları ───────────────────────────────
export const KAPTAN_TOOLS: Tool[] = [
  {
    type: 'function',
    function: {
      name: 'get_student_snapshot',
      description: 'Öğrencinin zayıf kazanımlarını ve kişiselleştirme bağlamını getirir.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_practice',
      description: 'Belirli bir kazanım için nokta-atışı (mikro) alıştırma soruları derler/üretir.',
      parameters: {
        type: 'object',
        properties: {
          kazanimId: { type: 'number', description: 'curriculum_nodes.id (kazanım düğümü)' },
          difficulty: { type: 'string', enum: ['kolay', 'orta', 'zor'] },
          count: { type: 'number', minimum: 1, maximum: 10 },
        },
        required: ['kazanimId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'save_to_canvas',
      description: 'Öğrencinin bir soru üzerindeki çalışma durumunu (canvas) kaydeder.',
      parameters: {
        type: 'object',
        properties: {
          questionId: { type: 'string' },
          state: { type: 'object', additionalProperties: true },
        },
        required: ['questionId', 'state'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'load_from_canvas',
      description: 'Öğrencinin bir soru üzerindeki kayıtlı canvas durumunu getirir.',
      parameters: {
        type: 'object',
        properties: { questionId: { type: 'string' } },
        required: ['questionId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'recall_memory',
      description:
        'Geçmiş oturum anılarında anlamsal arama yapar ("hatırlıyor musun...?" veya geçmişe atıf gerektiğinde).',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'aranan konu/an (Türkçe serbest metin)' } },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'request_plan_update',
      description:
        'Çalışma planının yeniden hesaplanmasını kuyruğa alır (async — sonucu bekletme, "hazırlayıp haber vereceğim" de).',
      parameters: {
        type: 'object',
        properties: { reason: { type: 'string' } },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'eylem_oner',
      description:
        'Öğrenciye TIKLANABİLİR bir eylem butonu gösterir. Bir şey yapmasını önerdiğinde ' +
        '("soru çözelim mi", "planına bakalım mı") metinde SORMA — bu aracı çağır, buton çıksın. ' +
        'Araç soru ÜRETMEZ, sadece butonu gösterir; üretim öğrenci butona basınca olur.',
      parameters: {
        type: 'object',
        properties: {
          tur: {
            type: 'string',
            enum: ['coz', 'tekrar', 'antrenman', 'rota', 'konular'],
            description:
              'coz: belirli bir kazanımda soru · tekrar: vadesi gelen tekrar destesi · ' +
              'antrenman: adaptif serbest çalışma · rota: çalışma planı ekranı · konular: konu listesi',
          },
          etiket: { type: 'string', description: 'Buton metni — kısa, emir kipi ("5 soru çöz")' },
          kazanimId: { type: 'number', description: 'tur=coz için ZORUNLU (curriculum_nodes.id)' },
          subject: { type: 'string' },
          difficulty: { type: 'string', enum: ['kolay', 'orta', 'zor'] },
          baslik: { type: 'string', description: 'Çöz ekranının üst başlığı' },
        },
        required: ['tur', 'etiket'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'oneri_ver',
      description:
        'Yanıtını bitirirken çağır: öğrencinin SIRADA sorabileceği 2-3 kısa takip sorusu. ' +
        'Bunlar giriş kutusunun üstünde çip olarak görünür ve tıklanınca aynen gönderilir. ' +
        'Öğrencinin AĞZINDAN yaz ("Bunu daha basit anlat"), kendi ağzından değil ("Basitleştireyim mi").',
      parameters: {
        type: 'object',
        properties: {
          oneriler: {
            type: 'array',
            items: { type: 'string' },
            minItems: 2,
            maxItems: 3,
            description: 'Kısa (≤34 karakter), birbirinden FARKLI, bu konuşmaya özgü takipler',
          },
        },
        required: ['oneriler'],
        additionalProperties: false,
      },
    },
  },
]

/**
 * EYLEM TARİFİ — Kaptan'ın mesajına iliştirilen buton.
 *
 * ⚠️ ARAYÜZ MODELİN KELİMESİNE DEĞİL, ÇAĞIRDIĞI ARACA BAĞLANIR. Alternatif "asistan
 * metninde 'tekrar' geçiyorsa buton bas" idi; o, LLM'in kelime seçimine bağlı bir arayüz
 * demektir — model bir gün başka türlü ifade eder, buton sessizce kaybolur.
 *
 * ⚠️ BU ARAÇ SORU ÜRETMEZ. Üretimi butona basılınca /coz ekranı yapar (o ekran zaten
 * {source:'ai', kazanimId} ile kendi setini çekiyor). Sebep maliyet: havuz boşsa üretim
 * bir LLM zinciridir (üret → aday başına doğrula → onar) ve öğrenci "şimdi değil" derse
 * o para boşa ödenmiş olurdu. Öneri bedava, üretim ancak kabul edilince.
 *
 * Şekil frontend ile ortaktır: frontend-v2/src/lib/types.ts · EylemTarifi
 */
export type EylemTarifi = {
  tur: 'coz' | 'tekrar' | 'antrenman' | 'rota' | 'konular' | 'plan_bekle'
  etiket: string
  kaynak?: 'ai' | 'review' | 'antrenman' | 'tanisma'
  kazanimId?: number
  subject?: string
  difficulty?: 'kolay' | 'orta' | 'zor'
  baslik?: string
  /** tur='plan_bekle': istemci bu görevi yoklar, bitince "Planın hazır" butonuna döner. */
  taskId?: string
}

/** Araç sonucuna iliştirilen eylemler bu anahtarla taşınır; kaptan.ts ayıklar. */
export const EYLEM_ANAHTARI = '_eylemler' as const

/**
 * Takip önerileri (giriş üstü çipler) bu anahtarla taşınır.
 *
 * ⚠️ EYLEM'DEN AYRI TUTULUYOR — ikisi farklı şeyler. Eylem bir EKRANA GÖTÜRÜR (buton →
 * /coz, /rota); öneri ise SOHBETİ SÜRDÜRÜR (çip → aynı metni mesaj olarak gönderir).
 * Tek kanalda birleştirmek, istemcinin hangisinin gezinme hangisinin mesaj olduğunu
 * `tur` alanına bakarak ayırmasını gerektirirdi ve iki kavram tek tipte bulanıklaşırdı.
 */
export const ONERI_ANAHTARI = '_oneriler' as const

const ZORLUKLAR = new Set(['kolay', 'orta', 'zor'])

/** Model çıktısını EylemTarifi'ne çevirir; geçersizse null (buton çizilmez). */
function eylemKur(args: Record<string, unknown>): EylemTarifi | null {
  const tur = String(args.tur ?? '')
  const etiket = String(args.etiket ?? '').trim().slice(0, 40)
  if (!etiket) return null

  // tur=coz kazanımsız anlamsızdır: buton hangi soruyu açacağını bilemez. Modelin
  // kazanimId uydurmasına da izin verilmez — snapshot'tan gelmeli.
  if (tur === 'coz') {
    const kazanimId = Number(args.kazanimId)
    if (!Number.isInteger(kazanimId) || kazanimId <= 0) return null
    return {
      tur: 'coz',
      etiket,
      kaynak: 'ai',
      kazanimId,
      subject: typeof args.subject === 'string' ? args.subject : undefined,
      difficulty: ZORLUKLAR.has(String(args.difficulty))
        ? (String(args.difficulty) as 'kolay' | 'orta' | 'zor')
        : 'orta',
      baslik: typeof args.baslik === 'string' ? args.baslik : undefined,
    }
  }
  if (tur === 'tekrar') return { tur: 'tekrar', etiket, kaynak: 'review', baslik: 'Tekrar destesi' }
  if (tur === 'antrenman') return { tur: 'antrenman', etiket, kaynak: 'antrenman' }
  if (tur === 'rota') return { tur: 'rota', etiket }
  if (tur === 'konular') return { tur: 'konular', etiket }
  return null
}

export async function runKaptanTool(
  name: string,
  args: Record<string, unknown>,
  userId: string,
): Promise<ToolResult> {
  switch (name) {
    case 'get_student_snapshot': {
      const [brief, weak] = await Promise.all([buildStudentContext(userId), getWeakPaths(userId, 4)])
      return { brief, weak }
    }
    case 'generate_practice': {
      // ⚠️ ARGÜMANLARI ÜRETEN TARAF MODELDİR — şemadaki `maximum: 10` bir RİCADIR, kısıt değil.
      // Kod da uygulamıyordu: count doğrudan buildMicroTest'e gidiyordu. Sohbet tool-loop'u 6
      // tura kadar dönüyor ve her tur bir üretim zinciri (üret → aday başına doğrula → onar)
      // tetikleyebiliyor → TEK sohbet mesajından yüzlerce LLM çağrısı çıkabilirdi.
      // Zorluk da serbest metindi ve hem prompt'a hem DB filtresine gidiyor.
      const kazanimId = Number(args.kazanimId)
      if (!Number.isInteger(kazanimId)) return { error: 'kazanimId gerekli (tam sayı)' }
      const zorluk = new Set(['kolay', 'orta', 'zor']).has(String(args.difficulty))
        ? String(args.difficulty)
        : 'orta'
      const adet = Math.min(10, Math.max(1, Math.floor(Number(args.count)) || 3))
      const questions: ServedQuestion[] = await buildMicroTest({
        userId,
        kazanimId,
        difficulty: zorluk,
        count: adet,
      })
      return { questions }
    }
    case 'save_to_canvas': {
      await saveQuestionState({
        userId,
        questionId: String(args.questionId),
        state: (args.state as Record<string, unknown>) ?? {},
      })
      return { ok: true }
    }
    case 'load_from_canvas': {
      const state = await loadQuestionState({ userId, questionId: String(args.questionId) })
      return { state }
    }
    case 'recall_memory': {
      const memories = await recallMemories(userId, String(args.query ?? ''), 5)
      return { memories: memories || 'İlgili geçmiş anı bulunamadı.' }
    }
    case 'request_plan_update': {
      // Async-first (§B3): LLM turunu 60 sn rehin almak yerine anında kuyruğa al.
      const task = await enqueueTask({
        userId,
        kind: 'plan',
        payload: { reason: String(args.reason ?? 'öğrenci istedi') },
      })
      // ⚠️ taskId ARTIK İSTEMCİYE DE GİDİYOR. Eskiden yalnız LLM'e dönüyordu ve Kaptan
      // "hazırlayıp haber vereceğim" diyordu — ama haber verecek KANAL YOKTU: görev
      // worker'da bitiyor, öğrenciye hiçbir şey ulaşmıyordu. Verilen söz yapısal olarak
      // tutulamıyordu. Artık istemci bu görevi yokluyor (useAgentTaskStatus) ve bitince
      // balonun altında "Planın hazır" butonu beliriyor.
      return {
        taskId: task.id,
        status: 'queued',
        [EYLEM_ANAHTARI]: [
          { tur: 'plan_bekle', etiket: 'Planın hazır — Rota\'ya git', taskId: task.id },
        ] satisfies EylemTarifi[],
      }
    }
    case 'eylem_oner': {
      const eylem = eylemKur(args)
      if (!eylem) return { error: 'eylem kurulamadı (tur/etiket/kazanimId kontrol et)' }
      // LLM'e sade bir onay döner; buton tarifi EYLEM_ANAHTARI ile ayrı taşınır.
      return { ok: true, gosterildi: eylem.etiket, [EYLEM_ANAHTARI]: [eylem] }
    }
    case 'oneri_ver': {
      /**
       * ⚠️ ŞEMADAKİ SINIRLAR RİCADIR, KISIT DEĞİL — burada zorlanır. Model 6 tane ya da
       * 90 karakterlik öneri döndürebilir. Aynı ders `generate_practice`'in
       * count/difficulty kelepçesinde de alınmıştı.
       *
       * ⚠️ UZUN ÖNERİ KIRPILMAZ, ELENİR. Çip metni tıklanınca AYNEN MESAJ OLARAK gider —
       * yani kırpmak, öğrencinin adına yarım bir cümle göndermek demektir ("Bu sorunun
       * çözümünü baştan sona bü"). Ölçüldü: 34'e kırpma tam olarak bunu üretiyordu.
       * Sığmayanı atmak, bozuk göndermekten iyidir; model zaten 2-3 öneri veriyor.
       */
      const ham = Array.isArray(args.oneriler) ? args.oneriler : []
      const oneriler = ham
        .map((s) => String(s ?? '').trim().replace(/\s+/g, ' '))
        .filter((s) => s.length >= 3 && s.length <= 44)

      /**
       * Yinelenenleri ele — ama İLK yazımı koru.
       * ⚠️ `new Map(...)` doğrudan kurulursa SON eşleşen kazanır: model
       * ["Zincir kuralını göster", "zincir kuralını göster"] verdiğinde küçük harfli
       * ikinci hâl öne geçiyordu. İlk öneri modelin birincil tercihidir ve genelde
       * daha düzgün yazılmıştır.
       */
      const gorulen = new Set<string>()
      const benzersiz: string[] = []
      for (const s of oneriler) {
        const anahtar = s.toLocaleLowerCase('tr-TR')
        if (gorulen.has(anahtar)) continue
        gorulen.add(anahtar)
        benzersiz.push(s)
      }

      if (!benzersiz.length) return { error: 'öneri listesi boş' }
      return { ok: true, sayi: benzersiz.length, [ONERI_ANAHTARI]: benzersiz.slice(0, 3) }
    }
    default:
      return { error: `bilinmeyen araç: ${name}` }
  }
}

// ─── Pusula (orkestratör) araçları ──────────────────────────────────────────
export const PUSULA_TOOLS: Tool[] = [
  {
    type: 'function',
    function: {
      name: 'get_student_snapshot',
      description: 'Öğrencinin zayıf kazanımlarını ve kişiselleştirme bağlamını getirir.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delegate_session',
      description:
        'Bir çalışma oturumunu Ritim işçisine delege eder ve tamamlanmasını bekler (ör. soru havuzu doldurma).',
      parameters: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['topup', 'session'] },
          payload: { type: 'object', additionalProperties: true },
        },
        required: ['kind', 'payload'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'persist_roadmap',
      description: 'Öğrenci için oluşturulan çalışma yol haritasını kalıcılaştırır.',
      parameters: {
        type: 'object',
        properties: {
          steps: { type: 'array', items: { type: 'object', additionalProperties: true } },
        },
        required: ['steps'],
        additionalProperties: false,
      },
    },
  },
]

export async function runPusulaTool(
  name: string,
  args: Record<string, unknown>,
  userId: string,
): Promise<ToolResult> {
  switch (name) {
    case 'get_student_snapshot': {
      const [brief, weak] = await Promise.all([buildStudentContext(userId), getWeakPaths(userId, 4)])
      return { brief, weak }
    }
    case 'delegate_session': {
      const kind = args.kind === 'session' ? 'session' : 'topup'
      const payload = (args.payload as Record<string, unknown>) ?? {}
      const result = await delegateAndAwait({ userId, kind, payload })
      return { result }
    }
    case 'persist_roadmap': {
      const steps = Array.isArray(args.steps) ? args.steps : []
      const { error } = await supabase
        .from('roadmaps')
        .upsert({ user_id: userId, steps, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
      if (error) throw error
      return { ok: true, count: steps.length }
    }
    default:
      return { error: `bilinmeyen araç: ${name}` }
  }
}
