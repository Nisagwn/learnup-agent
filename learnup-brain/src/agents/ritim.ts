import { createHash } from 'node:crypto'
import { generateVerifiedSet, type GenSpec } from '../lib/generation.js'
import { resolveKazanim } from '../lib/curriculum.js'
import { supabase } from '../clients/supabase.js'
import { logger } from '../utils/logger.js'
import { runCompact } from './katip.js'
import { runPlanTask } from './pusula.js'
import { runDiagnose, runClosureCheck } from './atlas.js'
import { runAffect, runNudge } from './nabiz.js'
import { evalKosVeYaz } from '../lib/eval-olc.js'
import type { AgentTask } from './bus.js'

/**
 * Ritim işçi mantığı — bir görevi işler ve serileştirilebilir bir sonuç döndürür.
 * (Worker döngüsü `handleTask`'ı çağırır; RUNNING/COMPLETED/FAILED olaylarını worker yayınlar.)
 */
export async function handleTask(task: AgentTask): Promise<unknown> {
  switch (task.kind) {
    case 'topup':        // legacy alias
    case 'session':      // legacy alias
    case 'forge_topup':
      return handleTopup(task)
    case 'roadmap':
    case 'plan':
      return runPlanTask(task)
    case 'diagnose':
      return runDiagnose(task)
    case 'closure_check':
      return runClosureCheck(task)
    case 'affect':
      return runAffect(task)
    case 'nudge':
      return runNudge(task)
    case 'compact':
      return runCompact(task)
    case 'eval':
      // Yönetim tetikli yapısal ölçüm (0025). LLM çağırmaz ama binlerce soruyu tarar
      // (NN benzerliği O(n²)) — bu yüzden HTTP'de değil, worker'da koşar.
      return evalKosVeYaz('panel', task.userId)
    default:
      return { error: `bilinmeyen görev türü: ${String(task.kind)}` }
  }
}

/**
 * ⚠️ `costOptimized` / `skipVerification` BU TİPTE YOK — GERİ EKLEME.
 * İkisi de payload'dan okunuyordu ve /api/agents/dispatch her oturumlu kullanıcıya açık
 * (routes/agents.routes.ts). `skipVerification` generation.denetle içinde hakemi TAMAMEN
 * atlatıp `matchesMarked/singleCorrect/curriculumBound = true` UYDURUR, `quality = 4` verir;
 * aşağıdaki yazım da `verified: true` ile ortak havuza basar. Yani herhangi bir öğrenci
 * hesabı, doğru cevabı HİÇ KONTROL EDİLMEMİŞ soruyu TÜM öğrencilere servis edilen havuza
 * yazdırabiliyordu — aşağıdaki yorumun "kapattık" dediği havuz-zehirlenmesi sınıfının aynısı,
 * yalnız başka kapıdan. Strateji seçenekleri İÇERİDEN verilir (test-modes/script'ler);
 * HTTP yüzeyinden asla.
 */
type TopupPayload = {
  kazanimId?: number
  difficulty?: string
  count?: number
}

const ZORLUKLAR = new Set(['kolay', 'orta', 'zor'])
const MAX_TOPUP = 10 // tek görevde üretilecek soru tavanı (LLM maliyeti = doğrudan para)
const md5 = (t: string): string => createHash('md5').update(t).digest('hex')

/**
 * Bir kazanımın havuzunu doğrulanmış sorularla doldurur (generate → verify do-loop).
 *
 * ⚠️ İSTEMCİYE GÜVENİLMEZ. Bu görev /api/agents/dispatch üzerinden HTTP'den tetiklenebiliyor
 * (tek tetikleyici orası; hiçbir iç ajan 'topup' kuyruğa atmıyor). Eskiden subject/paths/
 * kazanim/topic doğrudan payload'dan alınıyordu ve:
 *   · bu metinler LLM prompt'una interpole ediliyordu → prompt enjeksiyonu,
 *   · üretilen sorular payload'daki KEYFÎ kazanim_id ile paylaşılan yks_questions'a
 *     `verified: true` yazılıyordu → havuz zehirlenmesi; test-modes.ts o satırları
 *     TÜM öğrencilere servis ediyor,
 *   · count sınırsızdı → tek istekle ciddi LLM faturası.
 * Artık istemci YALNIZCA "hangi kazanım" der; kimlik bilgilerinin tamamı curriculum_nodes'tan
 * türetilir. (Gece demirhanesi — jobs/topup-planner.ts — zaten böyle çalışıyordu.)
 */
async function handleTopup(task: AgentTask): Promise<unknown> {
  const p = task.payload as TopupPayload
  const kazanimId = Number(p.kazanimId)
  if (!Number.isInteger(kazanimId)) return { error: 'kazanimId gerekli (tam sayı)' }

  const node = await resolveKazanim(kazanimId)
  if (!node) return { error: `kazanım bulunamadı: ${kazanimId}` }

  const difficulty = ZORLUKLAR.has(String(p.difficulty)) ? String(p.difficulty) : 'orta'
  const spec: GenSpec = {
    userId: task.userId,
    subject: node.subject,          // ← DB'den, payload'dan DEĞİL
    paths: [node.path],
    kazanim: node.code ?? '',
    topic: node.title,
    difficulty,
    // options YOK: doğrulama/onarım zinciri bu yolda HER ZAMAN çalışır (yukarıdaki uyarı).
  }
  const target = Math.min(MAX_TOPUP, Math.max(1, Math.floor(Number(p.count)) || 5))
  const set = await generateVerifiedSet(spec, target)

  if (set.length) {
    const rows = set.map((q) => ({
      subject: spec.subject,
      kazanim_id: node.id,
      question_text: q.soru,
      options: q.siklar,
      correct_option: q.dogru,
      solution: q.cozum,
      difficulty: q.zorluk || spec.difficulty,
      verified: true,
      quality: q.quality,
      // source_type YOK: kaynak ayrımı artık FİZİKSEL (0013) — bu tablo yalnız AI içerir.
      content_hash: md5(q.soru),   // 0009 idempotensi + aşağıdaki upsert'in çakışma hedefi
    }))

    // ⚠️ DÜZ `insert(rows)` TEK İFADEDİR: bir satır bile 0004'ün yq_dedup_verified
    // (unique md5(question_text) where verified) kısıtına takılırsa Postgres TÜM BATCH'İ
    // reddeder — sağlam sorular da kaybolur. Ölçüldü: 1 sağlam + 1 çift satırlık insert →
    // tabloya HİÇBİRİ yazılmadı. LLM aynı kazanım+zorluk için benzer soru üretmeye eğilimli,
    // yani bu çakışma istisna değil KURAL. Üstelik hata yutulup "generated: 5" raporlanıyordu.
    // upsert + ignoreDuplicates: çift satır atlanır, sağlamlar YAZILIR.
    const { data: yazilan, error } = await supabase
      .from('yks_ai_questions') // AI havuzu ayrı tablo (0013)
      .upsert(rows, { onConflict: 'content_hash', ignoreDuplicates: true })
      .select('id')
    if (error) {
      logger.error({ err: error, kazanimId: node.id }, 'yks_ai_questions upsert hata')
      return { generated: 0, written: 0, kazanimId: node.id, error: error.message }
    }
    const written = yazilan?.length ?? 0
    if (written < set.length) {
      logger.info({ kazanimId: node.id, uretilen: set.length, yazilan: written },
        'bazı sorular zaten havuzda (çift) — atlandı')
    }
    return { generated: set.length, written, kazanimId: node.id }
  }

  return { generated: 0, written: 0, kazanimId: node.id }
}
