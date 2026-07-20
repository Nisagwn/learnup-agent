import { createHash } from 'node:crypto'
import { env } from '../config/env.js'
import { supabase } from '../clients/supabase.js'
import { generateVerifiedSet } from '../lib/generation.js'
import { logger } from '../utils/logger.js'

/**
 * GECE DEMİRHANESİ (§5.4) — 02:00–06:00 TSİ penceresinde ince havuz hücrelerini doldurur.
 * Hücre = (kazanım, zorluk). Hedef: hücre başına ≥ MIN_POOL doğrulanmış AI sorusu.
 *
 * ⚠️ ŞU AN VARSAYILAN OLARAK KAPALI (env.NIGHTLY_FORGE=off). Kod duruyor; kapı kapalı.
 *
 * Kapatma sebebi, eski yorumun kendisinde saklıydı: "P2 önceliğiyle çalışır, günlük ÜCRETSİZ
 * bütçenin interaktif payını asla yemez." Doğru — ama eksik. P2 yalnız ücretsiz sağlayıcıları
 * sınırlar; model-router'ın isFree() kontrolü ':free' son ekine bakar → generate/verify
 * zincirlerinin başındaki PARALI DeepSeek slug'ları (v4-flash üretim, v4-pro doğrulama)
 * bütçe kapısına hiç girmez. Yani gece işi doğrudan PARALI modele gidiyor ve önünde HİÇBİR
 * tavan yok. Worker 7/24 ayaktayken (Docker) bu, her gece habersiz gerçek para demekti.
 *
 * AÇMADAN ÖNCE GEREKEN: paralı hatta gece başına sert bir çağrı/harcama tavanı.
 * Bugünkü iş sınırı yalnız hücre sayısıyla dolaylı: MAX_CELLS × (3 tur × [1 üretim + aday başına
 * 1 denetim + onarım]) → kötü bir gecede yüzlerce çağrı. Kabul edilen soru başına ~$0.002
 * (baskın kalem ÜRETİM; denetim ucuz hakemle ~%10'a indi), ama tavansız × yüzlerce hâlâ tavansız.
 */

const MIN_POOL = 8      // hücre başına hedef doğrulanmış soru
const MAX_CELLS = 6     // gece başına işlenecek hücre (bütçe disiplini)
const PER_CELL = 4      // hücre başına üretim hedefi

export async function runNightlyForge(): Promise<void> {
  // Kapı: çağıran kim olursa olsun (worker zamanlayıcısı, elle tetikleme) burada durur.
  if (env.NIGHTLY_FORGE !== 'on') {
    logger.info('demirhane: KAPALI (NIGHTLY_FORGE=off) — gece üretimi yapılmadı, LLM harcanmadı')
    return
  }

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
        .from('yks_ai_questions') // AI havuzu ayrı tablo (0013)
        .select('id', { count: 'exact', head: true })
        .eq('kazanim_id', nodeId)
        .eq('verified', true)
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
          // source_type YOK: yks_ai_questions tablosu zaten AI kaynağını belirtir (0013).
          content_hash: createHash('md5').update(q.soru).digest('hex'),
        }))
        // ⚠️ Eskiden düz insert + dedup hatasını AÇIKÇA YUTMA vardı:
        //      if (insErr && !insErr.message.includes('yq_dedup')) { warn(...) }
        //    Ama insert TEK ifadedir: bir satır yq_dedup_verified'e takılırsa TÜM batch
        //    reddedilir. Yani tek bir çift soru, o hücrenin sağlam sorularını da yok ediyordu —
        //    ve hata yutulduğu için hemen altındaki log "demirhane hücresi tamam, made: 4"
        //    yazıyordu. Gece boyunca SIFIR satır yazıp "başarılı" raporlayabilirdi.
        const { data, error: insErr } = await supabase
          .from('yks_ai_questions') // AI havuzu ayrı tablo (0013)
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
