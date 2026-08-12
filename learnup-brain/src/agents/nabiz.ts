import { redis } from '../clients/redis.js'
import { supabase } from '../clients/supabase.js'
import { logger } from '../utils/logger.js'
import { routedText, jsonCoz } from '../lib/model-router.js'
import { readSignals, computeSessionFeatures } from '../lib/signals.js'
import { speakAsKaptan } from '../persona/voice.js'
import {
  NABIZ_SYSTEM,
  AffectSemasi,
  NOTR_AFFECT,
  NUDGE_NIYETLERI,
  type AffectState,
} from '../persona/nabiz.charter.js'
import { upsertBrief } from './katip.js'
import { enqueueTask, type AgentTask } from './bus.js'

/**
 * NABIZ — empati nöbetçisi (§2.4). Heuristik-önce: kural ateşlenmeden LLM YOK.
 * Ateşlenince ucuz sınıflama → coaching stance + load_cap → masa + Pusula.
 *
 * Kurallar + duygu durumları + çıktı şeması → persona/nabiz.charter.ts (tek kaynak).
 */

export type { AffectState }

const EMOTION_RX =
  /yapamıyorum|yapamayacağım|bunaldım|sıkıldım|nefret|korkuyorum|kaygı|stres|bırakacağım|pes|yoruldum|üzgün|ağla|panik/i

/** Sohbet duygu kapısı (async — kaptan.persistKullaniciMesaji çağırır; gecikme eklemez). */
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
      { role: 'system', content: NABIZ_SYSTEM }, // → persona/nabiz.charter.ts
      {
        role: 'user',
        content: `SİNYALLER: ${JSON.stringify(f)}${chatText ? `\nSOHBET: "${chatText}"` : ''}`,
      },
    ],
  }, { priority: 'P1' })

  // ⚠️ SINIR DOĞRULAMASI. Eskiden `JSON.parse(raw) as AffectState` idi — iki ayrı kusur:
  //  (1) düz JSON.parse, modelin ```json çitini veya boş yanıtı yakalayamıyordu → her seferinde
  //      catch'e düşüp sessizce "nötr" oluyordu (yani Nabız hiç çalışmıyormuş gibi davranırdı),
  //  (2) `as` KÖR CAST: model "panik" veya "burned_out" dönse tip sistemi susar, o değer
  //      lb:affect cache'ine ve Kaptan'ın TON mantığına akardı.
  // Şema tutmazsa nötr-güvenli varsayılana düşüyoruz: yanlış duygu okumak, okumamaktan kötüdür
  // (tükenmiş öğrenciye "hadi bastır" demek geri teper).
  const cozum = AffectSemasi.safeParse(jsonCoz<unknown>(raw))
  if (!cozum.success) {
    logger.warn(
      { userId, ilk200: raw.slice(0, 200), ihlal: cozum.error.issues.map((i) => i.path.join('.')) },
      'Nabız: sınıflama şemaya uymadı — nötr varsayılana düşüldü',
    )
  }
  const affect: AffectState = cozum.success ? cozum.data : NOTR_AFFECT

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

  // Niyetler charter'da (persona/nabiz.charter.ts) — cümleyi kuran Kaptan'dır, Nabız değil.
  const niyet = (NUDGE_NIYETLERI as Record<string, string>)[kind] ?? `Amaç: ${kind}`
  const message = await speakAsKaptan(userId, niyet, task.payload)

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
