// Soru havuzu veri erişim katmanı — 3-tier Firestore fallback + lokal JSON yedek.
//
// Tasarım kısıtları (plan'dan):
//  • Öğrenciye soru servisi ASLA `verified`'a göre filtrelenmez (havuz boşalmasın);
//    `verified` yalnızca AI few-shot ve öğretmen onay kuyruğunda anlamlıdır.
//  • Tiered sorgular kademeli bozulur: eksik index/alan → bir sonraki tier'a düş.
//  • Tier 3 (category+grade, orderBy YOK) her zaman çalışan taban; Tier 4 (lokal JSON)
//    çevrimdışı zemindir.
import { auth, db } from '../firebase';
import {
  collection,
  query as fsQuery,
  where,
  orderBy,
  startAt,
  limit as fsLimit,
  getDocs,
  onSnapshot,
  addDoc,
  doc,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { normalizeQuestion } from '../utils/normalizeQuestion';
import localQuestions from '../data/questions.json';

const SEED_MAX = 1_000_000; // backend random_seed üst sınırıyla aynı (Math.floor(rand*1e6))

const IS_DEV = import.meta.env.DEV;
const FIREBASE_PROJECT_ID = 'learnup-3cdb7';
const BACKEND_BASE =
  import.meta.env.VITE_BACKEND_BASE_URL ||
  (IS_DEV
    ? `http://127.0.0.1:5001/${FIREBASE_PROJECT_ID}/us-central1`
    : `https://us-central1-${FIREBASE_PROJECT_ID}.cloudfunctions.net`);

// Fisher-Yates karıştırma (yerinde kopya döndürür)
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Firestore dökümanını UI sözleşmesine indirger + kaynağı işaretler.
function mapDbDoc(docSnap) {
  const data = { id: docSnap.id, ...docSnap.data() };
  return { ...normalizeQuestion(data), id: docSnap.id, _source: 'db' };
}

// ─── Tier 1/2: random_seed penceresi (sarmalamalı) ───────────────────────────
// orderBy('random_seed').startAt(rand) ucuz pseudo-random pencere verir;
// tepeye yakınsa startAt(0) ile ikinci geçiş yapıp tamamlar (wrap-around).
// Eksik composite index → failed-precondition → çağıran tier'ı atlar (null döner).
async function fetchSeedWindow(constraints, overFetch) {
  const seed = Math.random() * SEED_MAX;
  const base = collection(db, 'questions');
  const first = await getDocs(
    fsQuery(base, ...constraints, orderBy('random_seed'), startAt(seed), fsLimit(overFetch))
  );
  let docs = first.docs;
  if (docs.length < overFetch) {
    const wrap = await getDocs(
      fsQuery(base, ...constraints, orderBy('random_seed'), startAt(0), fsLimit(overFetch - docs.length))
    );
    // İlk geçişteki id'leri çıkararak birleştir
    const seen = new Set(docs.map((d) => d.id));
    docs = docs.concat(wrap.docs.filter((d) => !seen.has(d.id)));
  }
  return docs.map(mapDbDoc);
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
 * fetchQuestionPool — kademeli (3-tier) Firestore + lokal yedek soru getirir.
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

  // verified yalnızca açıkça true geçilirse where'e eklenir (varsayılan: filtre yok)
  const verifiedClause = verified === true ? [where('verified', '==', true)] : [];

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
      const constraints = [
        where('category', '==', category),
        where('grade', '==', gradeStr),
        where('sub_topic', '==', sub_topic),
        ...(difficulty ? [where('difficulty', '==', difficulty)] : []),
        ...verifiedClause,
      ];
      const got = dedupSlice(await fetchSeedWindow(constraints, overFetch));
      if (got.length > 0) return { questions: got, tier: 1 };
    } catch (e) {
      console.warn('[questionPool] Tier 1 atlandı (muhtemelen eksik index):', e?.message || e);
    }
  }

  // Tier 2: topic + category + grade — random_seed penceresi
  if (topic && category && gradeStr) {
    try {
      const constraints = [
        where('category', '==', category),
        where('grade', '==', gradeStr),
        where('topic', '==', topic),
        ...verifiedClause,
      ];
      const got = dedupSlice(await fetchSeedWindow(constraints, overFetch));
      if (got.length > 0) return { questions: got, tier: 2 };
    } catch (e) {
      console.warn('[questionPool] Tier 2 atlandı (muhtemelen eksik index):', e?.message || e);
    }
  }

  // Tier 3: category + grade — orderBy YOK (seed dokümanlarında random_seed yok),
  // plain limit + JS shuffle. strictTopic && konu istenmişse ATLA (konu-dışı sızma yok).
  if (category && !(strictTopic && (topic || sub_topic))) {
    try {
      const constraints = [
        where('category', '==', category),
        ...(gradeStr ? [where('grade', '==', gradeStr)] : []),
      ];
      const snap = await getDocs(fsQuery(collection(db, 'questions'), ...constraints, fsLimit(overFetch * 2)));
      const got = dedupSlice(shuffle(snap.docs.map(mapDbDoc)));
      if (got.length > 0) return { questions: got, tier: 3 };

      // grade filtresi boş bıraktıysa, grade'siz tekrar dene
      if (gradeStr) {
        const snapAny = await getDocs(
          fsQuery(collection(db, 'questions'), where('category', '==', category), fsLimit(overFetch * 2))
        );
        const gotAny = dedupSlice(shuffle(snapAny.docs.map(mapDbDoc)));
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
 * Salt-okunur, orderBy yok → yeni index gerektirmez.
 */
export async function fetchSampleQuestions({ category, grade = null, topic = null, limit = 3 }) {
  try {
    const constraints = [where('category', '==', category)];
    if (topic) constraints.push(where('topic', '==', topic));
    // Daha geniş çek (gold filtresi sonrası yeterli örnek kalsın diye)
    const snap = await getDocs(fsQuery(collection(db, 'questions'), ...constraints, fsLimit(limit * 6)));
    let list = snap.docs.map(mapDbDoc);
    if (grade) {
      const byGrade = list.filter((q) => String(q.grade || '') === String(grade));
      if (byGrade.length) list = byGrade; // sınıf eşleşmesi yoksa sınıfsız listeye geri düş
    }
    // Gold-set önceliği: verified && qualityScore>=4 örnekler havuz tarzını korur.
    // qualityScore yeni alan (eski sorularda yok) → yeterli gold yoksa tüm onaylı/mevcut
    // listeye GERİ DÜŞ (boş dönmesin). İstemci tarafı sıralama → composite index gerekmez.
    const gold = list.filter((q) => q.verified === true && typeof q.qualityScore === 'number' && q.qualityScore >= 4);
    const pool = gold.length >= limit ? gold : list;
    return shuffle(pool).slice(0, limit);
  } catch (e) {
    console.warn('[questionPool] fetchSampleQuestions başarısız:', e?.message || e);
    return [];
  }
}

/**
 * persistAIQuestions — istemcide üretilen/alınan AI sorularını havuza geri besler
 * (`verified:false`). Firestore rules öğrenci yazımına izin vermezse sessizce no-op.
 * @returns {Promise<string[]>} kaydedilen doc id'leri
 */
export async function persistAIQuestions(questions, meta = {}) {
  if (!Array.isArray(questions) || questions.length === 0) return [];
  const ids = [];
  for (const q of questions) {
    try {
      const text = q.text || q.question_text || q.question || '';
      const options = Array.isArray(q.options) ? q.options : Array.isArray(q.choices) ? q.choices : [];
      const correctAnswer = q.correctAnswer ?? q.correct_answer ?? null;
      const ref = await addDoc(collection(db, 'questions'), {
        category: meta.category || q.category || null,
        subject: meta.category || q.subject || null,
        topic: meta.topic || q.topic || null,
        sub_topic: meta.sub_topic || q.sub_topic || meta.topic || null,
        difficulty: meta.difficulty || q.difficulty || 'medium',
        grade: String(meta.grade || q.grade || '10'),
        text,
        question_text: text,
        options,
        correctAnswer,
        correct_answer: correctAnswer,
        explanation: q.explanation || '',
        is_ai_generated: true,
        isAI: true,
        verified: false,
        gen_mode: meta.mode || 'strict',
        random_seed: Math.floor(Math.random() * SEED_MAX),
        createdAt: Date.now(),
        // Backend verifier puanı (1-5). Yoksa null — gold-set döngüsü için kalıcılaştır.
        qualityScore: typeof q.qualityScore === 'number' ? q.qualityScore : null,
      });
      ids.push(ref.id);
    } catch (e) {
      // Rules reddederse (öğrenci hesabı) sessizce geç — soru zaten UI'da gösterildi.
      console.warn('[questionPool] persistAIQuestions yazımı atlandı:', e?.message || e);
      break;
    }
  }
  return ids;
}

// ─── Çok-şemalı doc → tek biçim ──────────────────────────────────────────────
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

// AI sorularını DEPLOYED saveAIQuestions ile yazar (verified:false). → savedIds[]
export async function saveAIQuestions(questions, meta = {}) {
  if (!Array.isArray(questions) || questions.length === 0) return [];
  const user = auth.currentUser;
  const headers = { 'Content-Type': 'application/json' };
  try {
    const token = await user?.getIdToken?.();
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch { /* token yoksa userId gövdede */ }
  const res = await fetch(`${BACKEND_BASE.replace(/\/$/, '')}/saveAIQuestions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ userId: user?.uid, questions, meta }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || data.message || `AI soruları kaydedilemedi (${res.status})`);
  }
  const data = await res.json();
  return data.savedIds || data.ids || [];
}

// ============================================================
// TEK KAYNAK: Onay bekleyen AI soruları (genel kuyruk).
// Tanım: is_ai_generated == true && verified == false.
// Hem öğretmen Inbox sayacı hem Soru Havuzu "Onay Bekleyen" sekmesi
// BU fonksiyonu kullanır → iki yüzeyde sayı ÇATIŞMAZ (tek yerden gelir).
// "Herhangi öğretmen onaylayabilir" semantiği: teacherId'ye göre kısıtlanmaz.
// ============================================================
export function subscribePendingAIQuestions(cb, onError) {
  const qy = fsQuery(
    collection(db, 'questions'),
    where('is_ai_generated', '==', true),
    where('verified', '==', false),
  );
  return onSnapshot(
    qy,
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (e) => { console.warn('Onay bekleyen AI soruları yüklenemedi:', e); onError?.(e); cb([]); },
  );
}

// Onaylama: verified:true + onay izi, ≤450'lik batch chunk. → onaylanan sayısı
export async function approveQuestions(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return 0;
  const uid = auth.currentUser?.uid || null;
  let done = 0;
  for (let i = 0; i < ids.length; i += 450) {
    const chunk = ids.slice(i, i + 450);
    const batch = writeBatch(db);
    chunk.forEach((id) => batch.update(doc(db, 'questions', id), { verified: true, approvedBy: uid, approvedAt: serverTimestamp() }));
    await batch.commit();
    done += chunk.length;
  }
  return done;
}
