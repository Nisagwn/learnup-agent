// İstemci tarafı soru kuyruğu — havuzu önceden tamponlar, eşik altına inince
// arka planda doldurur, gerekirse AI fallback'e düşer.
//
// React hook DEĞİL: Quiz.jsx ref pattern'iyle sürülür (stale-closure'dan kaçınmak için
// zaten tüm volatile state ref'lerden okunuyor). Test edilebilir, render'a bağlı değil.
import { fetchQuestionPool, persistAIQuestions } from '../services/questionPoolApi';

export function createQuestionQueue({
  category,
  grade,
  topic = null,
  sub_topic = null,
  difficulty = null,
  batchSize = 5,
  refillThreshold = 2,
} = {}) {
  const ctx = { category, grade, topic, sub_topic, difficulty };
  let queue = [];
  const solvedIds = new Set();
  let inflightRefill = null;
  let lastTier = null;

  // Halihazırda çözülmüş + kuyruktaki id'ler (refill dedup'u için)
  const excludeIds = () => [...solvedIds, ...queue.map((q) => q.id)];

  async function refill() {
    if (inflightRefill) return inflightRefill;
    inflightRefill = (async () => {
      try {
        const { questions, tier } = await fetchQuestionPool({
          ...ctx,
          excludeIds: excludeIds(),
          limit: batchSize,
        });
        lastTier = tier;
        const known = new Set(excludeIds());
        const fresh = questions.filter((q) => q && q.id && !known.has(q.id));
        queue.push(...fresh);
        return fresh.length;
      } finally {
        inflightRefill = null;
      }
    })();
    return inflightRefill;
  }

  return {
    // Quiz mount'ında mevcut solvedQuestionIds ile doldur.
    seedSolved(ids) {
      (ids || []).forEach((id) => id && solvedIds.add(id));
    },

    size() {
      return queue.length;
    },

    lastTier() {
      return lastTier;
    },

    // Adaptif zorluk / konu değişimini sonraki refill'e uygula.
    updateContext(partial = {}) {
      Object.assign(ctx, partial);
    },

    markSolved(id) {
      if (id) solvedIds.add(id);
    },

    // Bir sonraki soruyu döndürür. Kuyruk boşsa doldurmayı bekler; eşik altındaysa
    // arka planda (await etmeden) önden doldurur → soru geçişleri anlık kalır.
    async next() {
      if (queue.length === 0) {
        await refill();
      } else if (queue.length <= refillThreshold && !inflightRefill) {
        refill(); // fire-and-forget prefetch
      }
      const q = queue.shift() || null;
      if (q) solvedIds.add(q.id);
      return q;
    },

    refill,

    // AI fallback: havuz boşaldıysa dışarıdan verilen üretici fonksiyonu çağırır,
    // dönen soruları (varsa) havuza geri besler (verified:false) ve kuyruğa ekler.
    // fetchFn: () => Promise<Object[]>  (normalize edilmiş soru listesi döndürmeli)
    async aiFallback(fetchFn) {
      try {
        const generated = (await fetchFn()) || [];
        if (!generated.length) return 0;
        persistAIQuestions(generated, ctx).catch(() => {}); // ateşle-unut geri besleme
        const known = new Set(excludeIds());
        const fresh = generated.filter((q) => q && q.id && !known.has(q.id));
        queue.push(...fresh);
        return fresh.length;
      } catch (e) {
        console.warn('[questionQueue] aiFallback başarısız:', e?.message || e);
        return 0;
      }
    },
  };
}

export default createQuestionQueue;
