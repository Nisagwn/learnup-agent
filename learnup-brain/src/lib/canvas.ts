import { supabase } from '../clients/supabase.js'

/**
 * "Canvas" — öğrencinin bir soru üzerindeki çalışma durumu (çizim/işaretleme/ara-işlem/not).
 * Supabase `question_states` tablosunda (user_id, question_id) tekil anahtarıyla saklanır.
 */
export type QuestionState = {
  userId: string
  questionId: string
  state: Record<string, unknown>
  updatedAt?: string
}

export async function saveQuestionState(p: {
  userId: string
  questionId: string
  state: Record<string, unknown>
}): Promise<void> {
  const { error } = await supabase.from('question_states').upsert(
    {
      user_id: p.userId,
      question_id: p.questionId,
      state: p.state,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,question_id' },
  )
  if (error) throw error
}

export async function loadQuestionState(p: {
  userId: string
  questionId: string
}): Promise<QuestionState | null> {
  const { data, error } = await supabase
    .from('question_states')
    .select('user_id, question_id, state, updated_at')
    .eq('user_id', p.userId)
    .eq('question_id', p.questionId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const row = data as {
    user_id: string
    question_id: string
    state: Record<string, unknown>
    updated_at: string
  }
  return { userId: row.user_id, questionId: row.question_id, state: row.state, updatedAt: row.updated_at }
}
