import { redis } from '../clients/redis.js'
import { supabase } from '../clients/supabase.js'
import { logger } from '../utils/logger.js'
import { routedText } from '../lib/model-router.js'
import { readSignals, computeSessionFeatures } from '../lib/signals.js'
import { speakAsKaptan } from '../persona/voice.js'
import { upsertBrief } from './katip.js'
import { enqueueTask, type AgentTask } from './bus.js'

/**
 * NABIZ — empati nöbetçisi (§2.4). Heuristik-önce: kural ateşlenmeden LLM YOK.
 * Ateşlenince ucuz sınıflama → coaching stance + load_cap → masa + Pusula.
 */

export type AffectState = {
  state: 'motive' | 'nötr' | 'hüsran' | 'kaygı' | 'tükenmiş'
  evidence: string
  coaching_stance: string
  load_cap: 'micro' | 'normal'
}

const EMOTION_RX =
  /yapamıyorum|yapamayacağım|bunaldım|sıkıldım|nefret|korkuyorum|kaygı|stres|bırakacağım|pes|yoruldum|üzgün|ağla|panik/i

/** Sohbet duygu kapısı (async — kaptan.persistTurn çağırır; gecikme eklemez). */
export async function chatGate(userId: string, text: string): Promise<void> {
  if (!EMOTION_RX.test(text)) return
  await enqueueTask({ userId, kind: 'affect', payload: { source: 'chat', text: text.slice(0, 300) } })
    .catch((err) => logger.warn({ err }, 'affect görevi kuyruğa alınamadı'))
}

/** `affect` işleyicisi — heuristik özellikler + (gerekirse) LLM sınıflaması. */
export async function runAffect(task: AgentTask): Promise<unknown> {
  const userId = task.userId
  const signals = await readSignals(userId)
  const f = computeSessionFeatures(signals)
  const chatText = typeof task.payload.text === 'string' ? task.payload.text : null

  // Heuristik kapı: hiçbir kural ateşlenmediyse ve sohbet tetiği yoksa LLM'e gitme.
  const fired =
    chatText !== null ||
    f.errorRun >= 4 ||
    (f.latencyZ !== null && Math.abs(f.latencyZ) > 2) ||
    f.rageQuitCandidate ||
    (f.lateNight && f.wrongRatio > 0.5)
  if (!fired) {
    return { skipped: 'heuristik sakin — LLM harcanmadı', features: f }
  }

  const raw = await routedText('fast', {
    temperature: 0.2,
    max_tokens: 250,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'Öğrenci duygu-durumu sınıflandırıcısısın (YKS bağlamı). Sinyaller + (varsa) sohbet cümlesinden ' +
          'JSON döndür: {"state":"motive|nötr|hüsran|kaygı|tükenmiş","evidence":"tek cümle",' +
          '"coaching_stance":"koça tek cümlelik ton talimatı","load_cap":"micro|normal"}. ' +
          'Şüphede nazik tarafta kal; teşhis dili kullanma.',
      },
      {
        role: 'user',
        content: `SİNYALLER: ${JSON.stringify(f)}${chatText ? `\nSOHBET: "${chatText}"` : ''}`,
      },
    ],
  }, { priority: 'P1' })

  let affect: AffectState
  try {
    affect = JSON.parse(raw) as AffectState
  } catch {
    affect = { state: 'nötr', evidence: 'sınıflama çözümlenemedi', coaching_stance: 'nötr-destekleyici', load_cap: 'normal' }
  }

  if (redis) await redis.set(`lb:affect:${userId}`, JSON.stringify(affect), 'EX', 86_400)
  await upsertBrief(
    userId, 'nabiz',
    `Durum: ${affect.state}. Ton: ${affect.coaching_stance} Bugünkü yük tavanı: ${affect.load_cap}. (${affect.evidence})`,
  )

  // Tükenmiş/hüsran → ertesi sabah geri-dönüş nudge'ı (Kaptan'ın sesiyle).
  if (affect.state === 'tükenmiş' || affect.state === 'hüsran') {
    await enqueueTask({ userId, kind: 'nudge', payload: { kind: 'comeback', state: affect.state } })
  }
  return { state: affect.state, load_cap: affect.load_cap }
}

/** `nudge` işleyicisi — speakAsKaptan üretir, nudges + notifications'a yazar. */
export async function runNudge(task: AgentTask): Promise<unknown> {
  const userId = task.userId
  const kind = String(task.payload.kind ?? 'genel')

  const intents: Record<string, string> = {
    comeback: 'Dün zor bir gündü; bugün küçük garantili bir galibiyetle (10 dk kolay set) yeniden başlamaya davet et.',
    morning_plan: 'Bugünün planını tek cümleyle duyur ve ilk bloğa davet et.',
    closure_praise: 'Öğrenci uzun süredir düştüğü bir tuzağı kırdı — kısa, somut bir tebrik + kalıcılaştırma önerisi.',
    streak_save: 'Serisi risk altında — bugün 5 dakikalık mini setle seriyi kurtarmaya çağır.',
  }
  const message = await speakAsKaptan(userId, intents[kind] ?? `Amaç: ${kind}`, task.payload)

  const { error } = await supabase.from('nudges').insert({ user_id: userId, kind, message, status: 'SENT' })
  if (error) throw error
  // Uygulama bildirimi (mevcut notifications tablosu — Realtime ile UI'a düşer)
  await supabase.from('notifications').insert({
    user_id: userId, type: 'kaptan_nudge', title: 'Kaptan', body: message, icon: '🧭', tone: 'info',
  }).then(({ error: nErr }) => {
    if (nErr) logger.warn({ err: nErr }, 'notification yazılamadı (nudges kaydı duruyor)')
  })
  return { kind, message }
}
