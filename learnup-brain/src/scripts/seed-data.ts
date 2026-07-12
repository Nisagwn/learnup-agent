/**
 * MEB/YKS müfredat tohumu — Bun ile doğrudan çalışır:  `bun run seed`  (bun src/scripts/seed-data.ts)
 *
 * Idempotent:
 *  - curriculum_nodes → yalnız EKSİK `path`'leri ekler (tekrar çalıştırınca çoğaltmaz).
 *  - osym_blueprint  → (exam_type, subject) üzerinden upsert.
 *
 * NOT: `path` bir ltree'dir → yalnız [a-z0-9_.] kullan (Türkçe karakter YASAK). `title`/`subject` serbest.
 */
import { supabase } from '../clients/supabase.js'
import { logger } from '../utils/logger.js'

type SeedNode = {
  node_type: 'kazanim'
  code: string
  title: string
  path: string
  subject: string
  grade: number
}

const CURRICULUM: SeedNode[] = [
  // ── Matematik ──
  { node_type: 'kazanim', code: 'MAT.9.USLU', title: 'Üslü Sayılar', path: 'mat.temel.uslu_sayilar', subject: 'Matematik', grade: 9 },
  { node_type: 'kazanim', code: 'MAT.9.KOKLU', title: 'Köklü Sayılar', path: 'mat.temel.koklu_sayilar', subject: 'Matematik', grade: 9 },
  { node_type: 'kazanim', code: 'MAT.10.FONK', title: 'Fonksiyon Kavramı', path: 'mat.fonksiyon.tanim', subject: 'Matematik', grade: 10 },
  { node_type: 'kazanim', code: 'MAT.12.LIMIT', title: 'Limit ve Süreklilik', path: 'mat.analiz.limit', subject: 'Matematik', grade: 12 },
  { node_type: 'kazanim', code: 'MAT.12.TUREV', title: 'Türev Kuralları', path: 'mat.analiz.turev', subject: 'Matematik', grade: 12 },
  { node_type: 'kazanim', code: 'MAT.12.INT', title: 'Belirsiz İntegral', path: 'mat.analiz.integral', subject: 'Matematik', grade: 12 },
  // ── Fizik ──
  { node_type: 'kazanim', code: 'FIZ.9.HRKT', title: 'Doğrusal Hareket', path: 'fiz.mekanik.hareket', subject: 'Fizik', grade: 9 },
  { node_type: 'kazanim', code: 'FIZ.9.NEWTON', title: 'Newton Hareket Yasaları', path: 'fiz.mekanik.newton', subject: 'Fizik', grade: 9 },
  { node_type: 'kazanim', code: 'FIZ.10.AKIM', title: 'Elektrik Akımı', path: 'fiz.elektrik.akim', subject: 'Fizik', grade: 10 },
  // ── Kimya ──
  { node_type: 'kazanim', code: 'KIM.9.ATOM', title: 'Atomun Yapısı', path: 'kim.atom.yapisi', subject: 'Kimya', grade: 9 },
  { node_type: 'kazanim', code: 'KIM.10.MOL', title: 'Mol Kavramı', path: 'kim.hesaplama.mol', subject: 'Kimya', grade: 10 },
  // ── Biyoloji ──
  { node_type: 'kazanim', code: 'BIY.9.HUCRE', title: 'Hücre ve Organeller', path: 'biy.hucre.yapisi', subject: 'Biyoloji', grade: 9 },
  // ── Türkçe ──
  { node_type: 'kazanim', code: 'TR.TYT.PARAG', title: 'Paragrafta Anlam', path: 'tr.paragraf.anlam', subject: 'Türkçe', grade: 12 },
  { node_type: 'kazanim', code: 'TR.TYT.SOZCUK', title: 'Sözcük Türleri', path: 'tr.dilbilgisi.sozcuk', subject: 'Türkçe', grade: 12 },
]

const BLUEPRINT: Array<{ exam_type: 'TYT' | 'AYT'; subject: string; question_count: number }> = [
  { exam_type: 'TYT', subject: 'Türkçe', question_count: 40 },
  { exam_type: 'TYT', subject: 'Matematik', question_count: 40 },
  { exam_type: 'TYT', subject: 'Sosyal Bilimler', question_count: 20 },
  { exam_type: 'TYT', subject: 'Fen Bilimleri', question_count: 20 },
  { exam_type: 'AYT', subject: 'Matematik', question_count: 40 },
  { exam_type: 'AYT', subject: 'Fizik', question_count: 14 },
  { exam_type: 'AYT', subject: 'Kimya', question_count: 13 },
  { exam_type: 'AYT', subject: 'Biyoloji', question_count: 13 },
]

async function seedCurriculum(): Promise<void> {
  const { data, error } = await supabase.from('curriculum_nodes').select('path')
  if (error) throw error
  const mevcut = new Set<string>((data ?? []).map((r) => (r as { path: string }).path))
  const eklenecek = CURRICULUM.filter((n) => !mevcut.has(n.path))
  if (eklenecek.length > 0) {
    const { error: insErr } = await supabase.from('curriculum_nodes').insert(eklenecek)
    if (insErr) throw insErr
  }
  logger.info({ eklendi: eklenecek.length, toplam: CURRICULUM.length }, 'curriculum_nodes tohumlandı')
}

async function seedBlueprint(): Promise<void> {
  const { error } = await supabase.from('osym_blueprint').upsert(BLUEPRINT, { onConflict: 'exam_type,subject' })
  if (error) throw error
  logger.info({ satir: BLUEPRINT.length }, 'osym_blueprint tohumlandı')
}

logger.info('MEB/YKS müfredat tohumu başlıyor…')
await seedCurriculum()
await seedBlueprint()
logger.info('✅ Tohumlama tamamlandı. (Sonraki faz: yks_knowledge / yks_exemplars embedding ingestion)')
process.exit(0)
