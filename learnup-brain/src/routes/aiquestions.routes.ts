import { Router } from 'express'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { supabase } from '../clients/supabase.js'
import { fetchAll } from '../lib/pg.js'
// Kalite ucu eval.ts'in AYNI ölçüm fonksiyonlarını kullanır — kod kopyalanmaz,
// eşikler/desenler tek kaynaktan gelir (bkz. src/scripts/eval.ts 2b).
import { celdiriciKusatmasi, sikUzunlukSizintisi, type SikliSoru } from '../utils/shufflers.js'
import { varOlmayanGorseleGonderme, gorselBagimli } from '../utils/soru-saglik.js'
import { ozgunlukEsigi } from '../utils/benzerlik.js'
import { dersAilesi } from '../persona/osym.charter.js'

/**
 * GET /api/v1/questions/ai — AI ÜRETİMİ SORU HAVUZU görüntüleyici.
 * Yalnız yks_ai_questions'tan okur (0013 ile ayrı tablo) → çıkmış sorularla ASLA karışmaz.
 * osym.routes.ts'in AI eşi: frontend "AI ÜRETİMİ" rozetini bu uçtan basar.
 * Query: ?subject=&difficulty=&kazanimId=&limit=&offset=
 *
 * Salt-okunur ve LLM ÇAĞIRMAZ (standardLimiter yeterli, llmLimiter değil).
 */
export const aiQuestionsRouter = Router()

const ZORLUKLAR = new Set(['kolay', 'orta', 'zor'])

aiQuestionsRouter.get('/', async (req, res, next) => {
  try {
    const subject = typeof req.query.subject === 'string' && req.query.subject ? req.query.subject : null
    const difficulty =
      typeof req.query.difficulty === 'string' && ZORLUKLAR.has(req.query.difficulty)
        ? req.query.difficulty
        : null
    const kazanimId = Number(req.query.kazanimId) || null
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20))
    const offset = Math.max(0, Number(req.query.offset) || 0)

    let q = supabase
      .from('yks_ai_questions')
      .select(
        'id, subject, kazanim_id, topic, question_text, options, correct_option, solution, difficulty, quality, created_at',
        { count: 'exact' },
      )
      .eq('verified', true)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)
    if (subject) q = q.eq('subject', subject)
    if (difficulty) q = q.eq('difficulty', difficulty)
    if (kazanimId) q = q.eq('kazanim_id', kazanimId)

    const { data, error, count } = await q
    if (error) throw error
    res.json({ questions: data ?? [], total: count ?? 0, limit, offset })
  } catch (err) {
    next(err)
  }
})

/** GET /api/v1/questions/ai/facets — filtre UI'ı için ders envanteri (ders → adet). */
aiQuestionsRouter.get('/facets', async (_req, res, next) => {
  try {
    const data = await fetchAll<{ subject: string; difficulty: string | null }>(() =>
      supabase.from('yks_ai_questions').select('subject, difficulty').eq('verified', true),
    )
    const dersler = new Map<string, number>()
    const zorluklar = new Map<string, number>()
    for (const r of data) {
      dersler.set(r.subject, (dersler.get(r.subject) ?? 0) + 1)
      if (r.difficulty) zorluklar.set(r.difficulty, (zorluklar.get(r.difficulty) ?? 0) + 1)
    }
    res.json({
      total: data.length,
      subjects: [...dersler.entries()].map(([subject, count]) => ({ subject, count })).sort((a, b) => b.count - a.count),
      difficulties: [...zorluklar.entries()].map(([difficulty, count]) => ({ difficulty, count })),
    })
  } catch (err) {
    next(err)
  }
})

/**
 * GET /api/v1/questions/ai/topics — PRATİK EDİLEBİLİR KONULAR.
 * Havuzda ≥1 doğrulanmış AI sorusu olan kazanımlar (derse göre gruplu, adetli).
 * Pratik "havuz-önce-doldur" kuralında → yalnız içi dolu konular seçilebilmeli (boş sete düşme).
 * Ortak yardımcı: /practice/suggest de bu listeyi kullanır → poolTopics().
 */
aiQuestionsRouter.get('/topics', async (_req, res, next) => {
  try {
    const topics = await poolTopics()
    // Derse göre grupla
    const gruplar = new Map<string, typeof topics>()
    for (const t of topics) {
      const list = gruplar.get(t.subject) ?? []
      list.push(t)
      gruplar.set(t.subject, list)
    }
    res.json({
      total: topics.reduce((s, t) => s + t.count, 0),
      subjects: [...gruplar.entries()]
        .map(([subject, list]) => ({ subject, count: list.reduce((s, t) => s + t.count, 0), topics: list }))
        .sort((a, b) => b.count - a.count),
    })
  } catch (err) {
    next(err)
  }
})

/**
 * GET /api/v1/questions/ai/kalite — HAVUZ GÜVENCESİ (yapisal-eval'in öğrenci-yüzü).
 *
 * Analiz ekranındaki "Havuz Güvencesi" paneli: AI havuzunun yapısal metrikleri
 * GERÇEK ÖSYM referansıyla yan yana + özgünlük kapısının eşikleri/snapshot'ı.
 * Kullanıcı kararı: tam mühendislik şeffaflığı — sayılar gerçek, dil didaktik.
 *
 * · O(n) regex/parse ölçümleri CANLI hesaplanır (10 dk modül-içi cache — kişisel veri
 *   İÇERMEZ, kullanıcılar arası paylaşmak doğru ve ucuz).
 * · NN benzerliği CANLI HESAPLANMAZ (O(n²), eval'de saniyeler): son eval koşusunun
 *   snapshot'ı (eval-sonuclari/*.json) okunur; yoksa null — UYDURMA YOK.
 */
type KaliteRow = {
  question_text: string
  options: Record<string, string>
  correct_option: string
  subject: string
  difficulty?: string | null
  quality?: number | null
}

let kaliteCache: { zaman: number; veri: unknown } | null = null
const KALITE_CACHE_MS = 10 * 60_000

const sayiAdedi = (s: string): number => (s.match(/\d+([.,]\d+)?/g) ?? []).length

function evalSnapshot(): { tarih: string; nnKopya: number; nnP90: number } | null {
  try {
    const dir = join(import.meta.dir, '..', '..', 'eval-sonuclari')
    const son = readdirSync(dir).filter((f) => f.endsWith('.json')).sort().at(-1)
    if (!son) return null
    const j = JSON.parse(readFileSync(join(dir, son), 'utf8')) as {
      tarih?: string
      ai?: { nnKopya?: number; nnP90?: number }
    }
    if (!j?.tarih || !j.ai) return null
    return { tarih: j.tarih, nnKopya: j.ai.nnKopya ?? 0, nnP90: j.ai.nnP90 ?? 0 }
  } catch {
    return null // eval hiç koşmamış olabilir — panel bu alanı "ölçüm bekleniyor" gösterir
  }
}

aiQuestionsRouter.get('/kalite', async (_req, res, next) => {
  try {
    if (kaliteCache && Date.now() - kaliteCache.zaman < KALITE_CACHE_MS) {
      res.json(kaliteCache.veri)
      return
    }

    const [ai, osym] = await Promise.all([
      fetchAll<KaliteRow>(() =>
        supabase
          .from('yks_ai_questions')
          .select('question_text, options, correct_option, subject, difficulty, quality')
          .eq('verified', true)
          .returns<KaliteRow[]>(),
      ),
      fetchAll<KaliteRow>(() =>
        supabase
          .from('yks_questions')
          .select('question_text, options, correct_option, subject')
          .eq('source_type', 'osym_cikmis')
          .eq('verified', true)
          .returns<KaliteRow[]>(),
      ),
    ])

    // ── Taraf ölçümü: sızıntı + kuşatma + görsel arızası (taraf-özel desen — eval 2b) ──
    const olc = (rows: KaliteRow[], aiTarafi: boolean) => {
      let sizinti = 0, sizintiOlculen = 0, kusatma = 0, kusatmaOlculen = 0, gorsel = 0
      for (const r of rows) {
        const q: SikliSoru = { siklar: r.options as SikliSoru['siklar'], dogru: r.correct_option, cozum: '' }
        const siz = sikUzunlukSizintisi(q)
        if (siz !== null) { sizintiOlculen++; if (siz === 'sizinti') sizinti++ }
        const kus = celdiriciKusatmasi(q)
        if (kus !== null) { kusatmaOlculen++; if (kus === 'tek-yanda') kusatma++ }
        if (aiTarafi ? varOlmayanGorseleGonderme(r.question_text) : gorselBagimli(r.question_text)) gorsel++
      }
      const oran = (pay: number, payda: number) => (payda ? Number(((pay / payda) * 100).toFixed(1)) : null)
      return {
        sizinti: oran(sizinti, sizintiOlculen),
        kusatma: oran(kusatma, kusatmaOlculen),
        gorsel,
        n: rows.length,
      }
    }
    const aiOlcum = olc(ai, true)
    const osymOlcum = olc(osym, false)

    // ── Sayı yoğunluğu — YALNIZ sayısal aile, ders bazında (eval 2b uyarısı:
    //    karışık ölçüm sözel payıyla şişer; ders kırılımı şart) ──
    const yogunluk = (rows: KaliteRow[]) => {
      const m = new Map<string, { toplam: number; n: number }>()
      for (const r of rows) {
        if (dersAilesi(r.subject) !== 'sayisal') continue
        const g = m.get(r.subject) ?? { toplam: 0, n: 0 }
        g.toplam += sayiAdedi(r.question_text)
        g.n += 1
        m.set(r.subject, g)
      }
      return m
    }
    const yA = yogunluk(ai)
    const yO = yogunluk(osym)
    const sayiYogunlugu = [...new Set([...yA.keys(), ...yO.keys()])]
      .sort()
      .map((subject) => {
        const a = yA.get(subject)
        const o = yO.get(subject)
        return {
          subject,
          osym: o ? Number((o.toplam / o.n).toFixed(1)) : null,
          ai: a ? Number((a.toplam / a.n).toFixed(1)) : null,
        }
      })
      .filter((r) => r.osym !== null || r.ai !== null)

    // ── Havuz envanteri ──
    const zorlukSayaci: Record<string, number> = { kolay: 0, orta: 0, zor: 0 }
    const dersSayaci = new Map<string, number>()
    let kaliteToplam = 0, kaliteN = 0
    for (const r of ai) {
      if (r.difficulty && r.difficulty in zorlukSayaci) zorlukSayaci[r.difficulty]++
      dersSayaci.set(r.subject, (dersSayaci.get(r.subject) ?? 0) + 1)
      if (typeof r.quality === 'number') { kaliteToplam += r.quality; kaliteN++ }
    }

    const veri = {
      havuz: {
        toplam: ai.length,
        osymReferans: osym.length,
        ortKalite: kaliteN ? Number((kaliteToplam / kaliteN).toFixed(2)) : null,
        zorluk: zorlukSayaci,
        dersler: [...dersSayaci.entries()]
          .map(([subject, count]) => ({ subject, count }))
          .sort((a, b) => b.count - a.count),
      },
      yapisal: {
        sizinti: { osym: osymOlcum.sizinti, ai: aiOlcum.sizinti },
        kusatma: { osym: osymOlcum.kusatma, ai: aiOlcum.kusatma },
        sayiYogunlugu,
        gorselGonderme: aiOlcum.gorsel,
      },
      ozgunluk: {
        // Ders-bazlı Jaccard shingle NN eşiği — benzerlik.ozgunlukEsigi (p99+pay, eval ispatlı)
        esikler: [...dersSayaci.keys()].sort().map((subject) => ({ subject, esik: ozgunlukEsigi(subject) })),
        snapshot: evalSnapshot(),
      },
      olcumZamani: new Date().toISOString(),
    }

    kaliteCache = { zaman: Date.now(), veri }
    res.json(veri)
  } catch (err) {
    next(err)
  }
})

/** Havuzdaki kazanımlar → {kazanimId, code, title, subject, count}. İçi boş kazanım DÖNMEZ. */
export async function poolTopics(): Promise<
  Array<{ kazanimId: number; code: string | null; title: string; subject: string; count: number }>
> {
  const rows = await fetchAll<{ kazanim_id: number | null; subject: string }>(() =>
    supabase.from('yks_ai_questions').select('kazanim_id, subject').eq('verified', true),
  )
  const sayac = new Map<number, { subject: string; count: number }>()
  for (const r of rows) {
    if (r.kazanim_id == null) continue // kazanımsız soru konu listesine giremez
    const cur = sayac.get(r.kazanim_id) ?? { subject: r.subject, count: 0 }
    cur.count += 1
    sayac.set(r.kazanim_id, cur)
  }
  const girdiler = [...sayac.entries()]
  if (!girdiler.length) return []
  const { data: nodes } = await supabase
    .from('curriculum_nodes')
    .select('id, code, title, subject')
    .in('id', girdiler.map(([id]) => id))
  const nodeById = new Map((nodes ?? []).map((n) => [n.id as number, n]))
  return girdiler
    .map(([id, s]) => {
      const n = nodeById.get(id)
      return {
        kazanimId: id,
        code: n?.code ?? null,
        title: n?.title ?? `Kazanım #${id}`,
        subject: n?.subject ?? s.subject,
        count: s.count,
      }
    })
    .sort((a, b) => b.count - a.count)
}
