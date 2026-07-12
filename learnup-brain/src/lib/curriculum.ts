import { supabase } from '../clients/supabase.js'

export type KazanimNode = {
  id: number
  code: string | null
  title: string
  path: string
  subject: string
  grade: number | null
}

/** Kazanım düğümünü id ile çözer (Mikro test + segment kurma). */
export async function resolveKazanim(id: number): Promise<KazanimNode | null> {
  const { data, error } = await supabase
    .from('curriculum_nodes')
    .select('id, code, title, path, subject, grade')
    .eq('id', id)
    .eq('node_type', 'kazanim')
    .maybeSingle()
  if (error) throw error
  return (data as KazanimNode | null) ?? null
}

export type WeakPath = {
  subject: string
  kazanimId: number
  code: string | null
  title: string
  path: string
  wrongRate: number
}

/** Öğrencinin kronik zayıf kazanım alt-ağaçları (Mezo test + Context Injection). */
export async function getWeakPaths(userId: string, limit = 4): Promise<WeakPath[]> {
  const { data, error } = await supabase.rpc('weak_kazanimlar', { p_user_id: userId, p_limit: limit })
  if (error) throw error
  const rows = (data ?? []) as Array<{
    subject: string
    kazanim_id: number
    code: string | null
    title: string
    path: string
    wrong_rate: number
  }>
  return rows.map((r) => ({
    subject: r.subject,
    kazanimId: r.kazanim_id,
    code: r.code,
    title: r.title,
    path: r.path,
    wrongRate: r.wrong_rate,
  }))
}

export type BlueprintRow = { subject: string; questionCount: number }

/** ÖSYM deneme ders dağılımı (Makro test). */
export async function osymBlueprint(examType: 'TYT' | 'AYT'): Promise<BlueprintRow[]> {
  const { data, error } = await supabase
    .from('osym_blueprint')
    .select('subject, question_count')
    .eq('exam_type', examType)
  if (error) throw error
  const rows = (data ?? []) as Array<{ subject: string; question_count: number }>
  return rows.map((r) => ({ subject: r.subject, questionCount: r.question_count }))
}
