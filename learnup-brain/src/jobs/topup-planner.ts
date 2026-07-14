import { createHash } from 'node:crypto'
import { supabase } from '../clients/supabase.js'
import { generateVerifiedSet } from '../lib/generation.js'
import { logger } from '../utils/logger.js'

/**
 * GECE DEMİRHANESİ (§5.4) — 02:00–06:00 TSİ penceresinde ince havuz hücrelerini doldurur.
 * P2 önceliğiyle çalışır: günlük ücretsiz bütçenin interaktif payını ASLA yemez.
 * Hücre = (kazanım, zorluk). Hedef: hücre başına ≥ MIN_POOL doğrulanmış AI sorusu.
 */

const MIN_POOL = 8      // hücre başına hedef doğrulanmış soru
const MAX_CELLS = 6     // gece başına işlenecek hücre (bütçe disiplini)
const PER_CELL = 4      // hücre başına üretim hedefi

export async function runNightlyForge(): Promise<void> {
  // 1) Aktif kazanımlar: son 14 günde çalışılmış (user_mastery) — havuz talebi buradan doğar.
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString()
  const { data: active, error } = await supabase
    .from('user_mastery')
    .select('node_id')
    .gte('updated_at', since)
    .limit(500)
  if (error) {
    logger.warn({ err: error }, 'demirhane: user_mastery okunamadı (0005 uygulanmamış olabilir)')
    return
  }
  const nodeIds = [...new Set((active ?? []).map((r) => r.node_id as number))]
  if (nodeIds.length === 0) {
    logger.info('demirhane: aktif kazanım yok — bu gece iş yok')
    return
  }

  // 2) Her kazanım için havuz derinliğini ölç, ince hücreleri topla.
  const thin: Array<{ nodeId: number; difficulty: string; have: number }> = []
  for (const nodeId of nodeIds) {
    for (const difficulty of ['kolay', 'orta', 'zor']) {
      const { count } = await supabase
        .from('yks_questions')
        .select('id', { count: 'exact', head: true })
        .eq('kazanim_id', nodeId)
        .eq('verified', true)
        .eq('source_type', 'ai_generated')
        .eq('difficulty', difficulty)
      if ((count ?? 0) < MIN_POOL) thin.push({ nodeId, difficulty, have: count ?? 0 })
      if (thin.length >= MAX_CELLS * 3) break
    }
    if (thin.length >= MAX_CELLS * 3) break
  }
  // En boş hücreler önce
  thin.sort((a, b) => a.have - b.have)
  const cells = thin.slice(0, MAX_CELLS)
  if (cells.length === 0) {
    logger.info('demirhane: tüm hücreler dolu — iş yok')
    return
  }

  // 3) Hücreleri sırayla döv (drip — dakika penceresini router zaten korur).
  for (const cell of cells) {
    const { data: node } = await supabase
      .from('curriculum_nodes')
      .select('id, code, title, subject, path')
      .eq('id', cell.nodeId)
      .single()
    if (!node) continue

    try {
      const set = await generateVerifiedSet(
        {
          userId: '00000000-0000-0000-0000-000000000000', // sistem üretimi — öğrenci bağlamı nötr
          subject: node.subject,
          paths: [String(node.path)],
          kazanim: node.code ?? '',
          topic: node.title,
          difficulty: cell.difficulty,
        },
        PER_CELL,
        'P2', // gece bütçe sınıfı
      )
      let yazilan = 0
      if (set.length) {
        const rows = set.map((q) => ({
          subject: node.subject,
          kazanim_id: node.id,
          question_text: q.soru,
          options: q.siklar,
          correct_option: q.dogru,
          solution: q.cozum,
          difficulty: q.zorluk || cell.difficulty,
          verified: true,
          quality: q.quality,
          source_type: 'ai_generated',
          content_hash: createHash('md5').update(q.soru).digest('hex'),
        }))
        // ⚠️ Eskiden düz insert + dedup hatasını AÇIKÇA YUTMA vardı:
        //      if (insErr && !insErr.message.includes('yq_dedup')) { warn(...) }
        //    Ama insert TEK ifadedir: bir satır yq_dedup_verified'e takılırsa TÜM batch
        //    reddedilir. Yani tek bir çift soru, o hücrenin sağlam sorularını da yok ediyordu —
        //    ve hata yutulduğu için hemen altındaki log "demirhane hücresi tamam, made: 4"
        //    yazıyordu. Gece boyunca SIFIR satır yazıp "başarılı" raporlayabilirdi.
        const { data, error: insErr } = await supabase
          .from('yks_questions')
          .upsert(rows, { onConflict: 'content_hash', ignoreDuplicates: true })
          .select('id')
        if (insErr) {
          logger.warn({ err: insErr, nodeId: node.id }, 'demirhane: upsert hatası')
        }
        yazilan = data?.length ?? 0
      }
      // "made" DEĞİL "yazilan" raporlanır — üretilmiş ama yazılamamış soru başarı değildir.
      logger.info(
        { nodeId: node.id, difficulty: cell.difficulty, uretilen: set.length, yazilan },
        'demirhane hücresi tamam',
      )
    } catch (err) {
      logger.warn({ err, nodeId: cell.nodeId }, 'demirhane hücresi başarısız (bütçe/LLM) — sıradaki')
    }
  }
}
