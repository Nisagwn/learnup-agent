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
]

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
      return { taskId: task.id, status: 'queued' }
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
