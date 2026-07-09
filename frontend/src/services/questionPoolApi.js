// Soru havuzu veri erişim katmanı — 3-tier Supabase (postgrest) fallback + lokal JSON yedek.
//
// Tasarım kısıtları (plan'dan):
//  • Öğrenciye soru servisi ASLA `verified`'a göre filtrelenmez (havuz boşalmasın);
//    `verified` yalnızca AI few-shot ve öğretmen onay kuyruğunda anlamlıdır.
//  • Tiered sorgular kademeli bozulur: sorgu hatası → bir sonraki tier'a düş.
//  • Tier 3 (category+grade, orderBy YOK) her zaman çalışan taban; Tier 4 (lokal JSON)
//    çevrimdışı zemindir.
import { supabase } from '../supabase';
import { normalizeQuestion } from '../utils/normalizeQuestion';
import localQuestions from '../data/questions.json';

const SEED_MAX = 1_000_000; // backend random_seed üst sınırıyla aynı (Math.floor(rand*1e6))

// Fisher-Yates karıştırma (yerinde kopya döndürür)
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Postgres satırını UI sözleşmesine indirger + kaynağı işaretler.
function mapDbRow(row) {
  return { ...normalizeQuestion(row), id: row.id, qualityScore: row.quality_score ?? null, _source: 'db' };
}

// Eşitlik filtrelerini bir select sorgusuna uygular ({ col: value, ... }).
function applyFilters(qb, filters) {
  let q = qb;
  for (const [col, val] of Object.entries(filters)) q = q.eq(col, val);
  return q;
}

// ─── Tier 1/2: random_seed penceresi (sarmalamalı) ───────────────────────────
// order(random_seed).gte(seed) ucuz pseudo-random pencere verir; tepeye yakınsa
// gte(0) ile ikinci geçiş yapıp tamamlar (wrap-around). Sorgu hatasında throw
// eder → çağıran tier'ı atlar.
async function fetchSeedWindow(filters, overFetch) {
  const seed = Math.random() * SEED_MAX;
  const first = await applyFilters(supabase.from('questions').select('*'), filters)
    .gte('random_seed', seed)
    .order('random_seed', { ascending: true })
    .limit(overFetch);
  if (first.error) throw first.error;
  let rows = first.data || [];
  if (rows.length < overFetch) {
    const wrap = await applyFilters(supabase.from('questions').select('*'), filters)
      .gte('random_seed', 0)
      .order('random_seed', { ascending: true })
      .limit(overFetch - rows.length);
    if (wrap.error) throw wrap.error;
    // İlk geçişteki id'leri çıkararak birleştir
    const seen = new Set(rows.map((r) => r.id));
    rows = rows.concat((wrap.data || []).filter((r) => !seen.has(r.id)));
  }
  return rows.map(mapDbRow);
}

// ─── Tier 4: lokal JSON yedek ────────────────────────────────────────────────
// questions.json şeması: { subject, question, choices[], answer (index), metadata:{difficulty,grade} }
// JSON'da id yok → stabil sentetik id üret (refill dedup'u için).
function mapLocalDoc(raw, index) {
  const id = `local:${raw.subject}:${raw.metadata?.grade || '?'}:${index}`;
  return {
    ...normalizeQuestion({
      text: raw.question,
      options: raw.choices,
      answer: raw.answer,
      category: raw.subject,
      subject: raw.subject,
      difficulty: raw.metadata?.difficulty || 'medium',
      grade: raw.metadata?.grade || null,
    }),
    id,
    topic: null,
    sub_topic: null,
    _source: 'local',
  };
}

function fetchLocalPool({ category, grade, difficulty, excludeIds, limit }) {
  const ex = new Set(excludeIds || []);
  const matches = localQuestions
    .map((raw, index) => ({ raw, index }))
    .filter(({ raw }) => {
      if (category && raw.subject !== category) return false;
      if (grade && String(raw.metadata?.grade || '') !== String(grade)) return false;
      if (difficulty && raw.metadata?.difficulty && raw.metadata.difficulty !== difficulty) return false;
      return true;
    })
    .map(({ raw, index }) => mapLocalDoc(raw, index))
    .filter((q) => !ex.has(q.id));
  return shuffle(matches).slice(0, limit);
}

/**
 * fetchQuestionPool — kademeli (3-tier) Supabase + lokal yedek soru getirir.
 * @returns {Promise<{ questions: Object[], tier: 1|2|3|4 }>}
 */
export async function fetchQuestionPool({
  category,
  grade,
  topic = null,
  sub_topic = null,
  difficulty = null,
  verified = undefined,
  excludeIds = [],
  limit = 5,
  strictTopic = false,
}) {
  const overFetch = Math.max(limit * 2, limit + 4);
  const ex = new Set(excludeIds);
  const gradeStr = grade != null ? String(grade) : null;

  // verified yalnızca açıkça true geçilirse filtreye eklenir (varsayılan: filtre yok)
  const verifiedClause = verified === true ? { verified: true } : {};

  const dedupSlice = (list) => {
    const seen = new Set();
    const out = [];
    for (const q of list) {
      if (ex.has(q.id) || seen.has(q.id)) continue;
      seen.add(q.id);
      out.push(q);
      if (out.length >= limit) break;
    }
    return out;
  };

  // Tier 1: sub_topic + category + grade (+ difficulty) — random_seed penceresi
  if (sub_topic && category && gradeStr) {
    try {
      const filters = {
        category,
        grade: gradeStr,
        sub_topic,
        ...(difficulty ? { difficulty } : {}),
        ...verifiedClause,
      };
      const got = dedupSlice(await fetchSeedWindow(filters, overFetch));
      if (got.length > 0) return { questions: got, tier: 1 };
    } catch (e) {
      console.warn('[questionPool] Tier 1 atlandı:', e?.message || e);
    }
  }

  // Tier 2: topic + category + grade — random_seed penceresi
  if (topic && category && gradeStr) {
    try {
      const filters = {
        category,
        grade: gradeStr,
        topic,
        ...verifiedClause,
      };
      const got = dedupSlice(await fetchSeedWindow(filters, overFetch));
      if (got.length > 0) return { questions: got, tier: 2 };
    } catch (e) {
      console.warn('[questionPool] Tier 2 atlandı:', e?.message || e);
    }
  }

  // Tier 3: category + grade — orderBy YOK (seed dokümanlarında random_seed yok),
  // plain limit + JS shuffle. strictTopic && konu istenmişse ATLA (konu-dışı sızma yok).
  if (category && !(strictTopic && (topic || sub_topic))) {
    try {
      let q = supabase.from('questions').select('*').eq('category', category);
      if (gradeStr) q = q.eq('grade', gradeStr);
      const { data, error } = await q.limit(overFetch * 2);
      if (error) throw error;
      const got = dedupSlice(shuffle((data || []).map(mapDbRow)));
      if (got.length > 0) return { questions: got, tier: 3 };

      // grade filtresi boş bıraktıysa, grade'siz tekrar dene
      if (gradeStr) {
        const { data: dataAny, error: errAny } = await supabase
          .from('questions').select('*').eq('category', category).limit(overFetch * 2);
        if (errAny) throw errAny;
        const gotAny = dedupSlice(shuffle((dataAny || []).map(mapDbRow)));
        if (gotAny.length > 0) return { questions: gotAny, tier: 3 };
      }
    } catch (e) {
      console.warn('[questionPool] Tier 3 başarısız:', e?.message || e);
    }
  }

  // strictTopic && konu istenmişse lokal (konusuz) yedek de ATLANIR
  if (strictTopic && (topic || sub_topic)) return { questions: [], tier: 0 };

  // Tier 4: lokal JSON yedek (çevrimdışı zemin)
  const local = fetchLocalPool({ category, grade: gradeStr, difficulty, excludeIds, limit });
  return { questions: local, tier: 4 };
}

/**
 * fetchSampleQuestions — AI few-shot için onaylı havuzdan birkaç örnek.
 * Salt-okunur, orderBy yok → istemci tarafı filtrele/sırala.
 */
export async function fetchSampleQuestions({ category, grade = null, topic = null, limit = 3 }) {
  try {
    let q = supabase.from('questions').select('*').eq('category', category);
    if (topic) q = q.eq('topic', topic);
    // Daha geniş çek (gold filtresi sonrası yeterli örnek kalsın diye)
    const { data, error } = await q.limit(limit * 6);
    if (error) throw error;
    let list = (data || []).map(mapDbRow);
    if (grade) {
      const byGrade = list.filter((q2) => String(q2.grade || '') === String(grade));
      if (byGrade.length) list = byGrade; // sınıf eşleşmesi yoksa sınıfsız listeye geri düş
    }
    // Gold-set önceliği: verified && qualityScore>=4 örnekler havuz tarzını korur.
    // Yeterli gold yoksa tüm onaylı/mevcut listeye GERİ DÜŞ (boş dönmesin).
    const gold = list.filter((q2) => q2.verified === true && typeof q2.qualityScore === 'number' && q2.qualityScore >= 4);
    const pool = gold.length >= limit ? gold : list;
    return shuffle(pool).slice(0, limit);
  } catch (e) {
    console.warn('[questionPool] fetchSampleQuestions başarısız:', e?.message || e);
    return [];
  }
}

/**
 * persistAIQuestions — istemcide üretilen/alınan AI sorularını havuza geri besler
 * (`verified:false`). RLS öğrenci yazımına izin vermezse sessizce no-op.
 * @returns {Promise<string[]>} kaydedilen satır id'leri
 */
export async function persistAIQuestions(questions, meta = {}) {
  if (!Array.isArray(questions) || questions.length === 0) return [];
  const ids = [];
  for (const q of questions) {
    try {
      const text = q.text || q.question_text || q.question || '';
      const options = Array.isArray(q.options) ? q.options : Array.isArray(q.choices) ? q.choices : [];
      const correctAnswer = q.correctAnswer ?? q.correct_answer ?? null;
      const { data, error } = await supabase
        .from('questions')
        .insert({
          category: meta.category || q.category || null,
          subject: meta.category || q.subject || null,
          topic: meta.topic || q.topic || null,
          sub_topic: meta.sub_topic || q.sub_topic || meta.topic || null,
          difficulty: meta.difficulty || q.difficulty || 'medium',
          grade: String(meta.grade || q.grade || '10'),
          question_text: text,
          options,
          correct_answer: correctAnswer,
          explanation: q.explanation || '',
          is_ai_generated: true,
          verified: false,
          gen_mode: meta.mode || 'strict',
          random_seed: Math.floor(Math.random() * SEED_MAX),
          // Backend verifier puanı (1-5). Yoksa null — gold-set döngüsü için kalıcılaştır.
          quality_score: typeof q.qualityScore === 'number' ? q.qualityScore : null,
        })
        .select('id')
        .single();
      if (error) throw error;
      ids.push(data.id);
    } catch (e) {
      // RLS reddederse (öğrenci hesabı) sessizce geç — soru zaten UI'da gösterildi.
      console.warn('[questionPool] persistAIQuestions yazımı atlandı:', e?.message || e);
      break;
    }
  }
  return ids;
}

// ─── Çok-şemalı satır → tek biçim ────────────────────────────────────────────
// (category|subject, text|question_text|question, options|choices,
//  correctAnswer|correct_answer|answer [harf|index|metin])
export function normalizeDoc(raw) {
  const d = raw || {};
  const subject = d.subject || d.category || 'Genel';
  const question = d.text || d.question_text || d.question || '';
  const choices = Array.isArray(d.options) ? d.options : Array.isArray(d.choices) ? d.choices : [];
  let answer = d.correctAnswer ?? d.correct_answer ?? d.answer ?? null;
  if (typeof answer === 'number') {
    answer = choices[answer] ?? null;
  } else if (typeof answer === 'string' && /^[A-E]$/i.test(answer.trim()) && choices.length) {
    answer = choices[answer.trim().toUpperCase().charCodeAt(0) - 65] ?? answer;
  }
  return {
    id: d.id || null,
    subject,
    question,
    choices,
    answer,
    difficulty: d.difficulty || 'medium',
    grade: d.grade != null ? String(d.grade) : null,
    topic: d.topic || null,
    sub_topic: d.sub_topic || null,
    explanation: d.explanation || '',
  };
}

// AI few-shot örneği biçimi.
export function toSample(q) {
  const question = q.question ?? q.text ?? q.question_text ?? '';
  const choices = Array.isArray(q.choices) ? q.choices : Array.isArray(q.options) ? q.options : [];
  const ans = q.answer ?? q.correctAnswer ?? q.correct_answer;
  let correctIndex = -1;
  if (typeof ans === 'number') correctIndex = ans;
  else if (typeof ans === 'string') {
    const byText = choices.indexOf(ans);
    if (byText >= 0) correctIndex = byText;
    else if (/^[A-E]$/i.test(ans.trim())) correctIndex = ans.trim().toUpperCase().charCodeAt(0) - 65;
  }
  return { question, choices, correctIndex: correctIndex >= 0 ? correctIndex : 0, explanation: q.explanation || '' };
}

// AI sorularını DEPLOYED save-ai-questions Edge Function ile yazar (verified:false). → savedIds[]
export async function saveAIQuestions(questions, meta = {}) {
  if (!Array.isArray(questions) || questions.length === 0) return [];
  const { data, error } = await supabase.functions.invoke('save-ai-questions', {
    body: { questions, meta },
  });
  if (error) throw new Error(error.message || 'AI soruları kaydedilemedi');
  return data?.savedIds || data?.ids || [];
}

// ============================================================
// TEK KAYNAK: Onay bekleyen AI soruları (genel kuyruk).
// Tanım: is_ai_generated == true && verified == false.
// Hem öğretmen Inbox sayacı hem Soru Havuzu "Onay Bekleyen" sekmesi
// BU fonksiyonu kullanır → iki yüzeyde sayı ÇATIŞMAZ (tek yerden gelir).
// "Herhangi öğretmen onaylayabilir" semantiği: teacher_id'ye göre kısıtlanmaz.
// ============================================================
export function subscribePendingAIQuestions(cb, onError) {
  const emit = async () => {
    const { data, error } = await supabase
      .from('questions').select('*').eq('is_ai_generated', true).eq('verified', false);
    if (error) { console.warn('Onay bekleyen AI soruları yüklenemedi:', error); onError?.(error); cb([]); return; }
    cb((data || []).map((r) => ({
      ...r,
      questionText: r.question_text,
      correctAnswer: r.correct_answer,
      isAI: r.is_ai_generated,
      qualityScore: r.quality_score ?? null,
      createdAt: r.created_at,
    })));
  };
  emit();
  const ch = supabase
    .channel('pending_ai_questions')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'questions', filter: 'is_ai_generated=eq.true' }, () => { emit(); })
    .subscribe();
  return () => supabase.removeChannel(ch);
}

// Onaylama: verified:true. → onaylanan sayısı
export async function approveQuestions(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return 0;
  const { error } = await supabase.from('questions').update({ verified: true }).in('id', ids);
  if (error) throw error;
  return ids.length;
}
