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
    const konuId = Number(req.query.konuId) || null
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20))
    const offset = Math.max(0, Number(req.query.offset) || 0)

    // Konu → kazanım listesi (0026 eşleme katmanı). Soruda konu etiketi TUTULMAZ; konunun
    // soruları daima kazanım üzerinden türer, böylece kazanımın konusu düzeltilince eski
    // sorular da otomatik doğru konuya geçer (denormalize etiket kayması yok).
    let konuKazanimlari: number[] | null = null
    if (konuId) {
      const { data } = await supabase.from('kazanim_konu').select('kazanim_id').eq('konu_id', konuId)
      konuKazanimlari = (data ?? []).map((r) => Number(r.kazanim_id))
      // Eşlemesi olmayan konu: BOŞ küme dön. Filtreyi atlamak "konu seçtim, alakasız
      // soru geldi" demek olurdu — sessiz yanlış, boş listeden kötü.
      if (!konuKazanimlari.length) {
        res.json({ questions: [], total: 0, limit, offset })
        return
      }
    }

    let q = supabase
      .from('yks_ai_questions')
      // ⚠️ correct_option/solution BİLEREK YOK — bu uç öğrenciye soru servis eder (Çöz set
      // akışı, tanışma sınavı). Doğru şık ve çözüm cevaptan SONRA /answers'tan döner.
      // Yöneticinin cevabı gördüğü yer admin-havuz.routes'tur (rol kapılı), burası değil.
      .select(
        'id, subject, kazanim_id, topic, question_text, options, difficulty, quality, created_at',
        { count: 'exact' },
      )
      .eq('verified', true)
      .eq('karantina', false) // 0025: yöneticinin düşürdüğü soru görüntüleyicide de YOK
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)
    if (subject) q = q.eq('subject', subject)
    if (difficulty) q = q.eq('difficulty', difficulty)
    if (kazanimId) q = q.eq('kazanim_id', kazanimId)
    if (konuKazanimlari) q = q.in('kazanim_id', konuKazanimlari)

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
      supabase.from('yks_ai_questions').select('subject, difficulty').eq('verified', true).eq('karantina', false),
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
 * GET /api/v1/questions/ai/konular — ÖĞRENCİNİN DERS → KONU LİSTESİ (0026 konu katmanı).
 *
 * Kullanıcının asıl istediği ekran bunu tüketir: "Matematik → Türev → türev soruları".
 * MEB ünite hiyerarşisi ve ltree path'i BURADAN ÇIKMAZ — arayüz iki seviye görür (ders, konu).
 *
 * ⚠️ DERS GÖRÜNÜRLÜĞÜ ÖĞRENCİNİN ALANINA BAĞLI (kullanıcı kararı):
 *   · TYT dersleri (ders_kapsam.tyt) HERKESE görünür — alan seçilmemiş olsa bile.
 *   · AYT dersleri yalnız o dersi okuyan alanlara (ders_kapsam.ayt_alanlar).
 * Alan NULL ise (henüz seçmemiş / öğretmen / yönetici) yalnız TYT döner. NULL'u 'sayisal'
 * varsaymak sözelci öğrenciye Fizik/Kimya listelemek olurdu.
 *
 * ⚠️ AYNI DERSİN TYT ve AYT KONULARI AYRI SÜZÜLÜR. Sayısalcıya Matematik'in hem TYT hem AYT
 * konuları gösterilir; sözelciye YALNIZ TYT Matematik. Ders seviyesinde süzmek yetmez —
 * sözelci öğrenci "Türev"i (AYT konusu) görürdü.
 *
 * Varsayılan olarak İÇİ BOŞ KONU DÖNMEZ (soruSayisi>0). Seçilebilir ama 0 soru veren bir
 * konu, ürünün bozuk olduğunu düşündürür. ?tumu=1 ile kapsama analizi için hepsi döner.
 */
aiQuestionsRouter.get('/konular', async (req, res, next) => {
  try {
    const tumu = req.query.tumu === '1'

    const { data: profil } = await supabase
      .from('profiles')
      .select('alan')
      .eq('id', String(req.userId))
      .maybeSingle()
    const alan = (profil?.alan as string | null) ?? null

    // ── ÖĞRENCİNİN ÜNİTE İLERLEMESİ ──
    // Kunduz düzenindeki "%N Tamamlandı · %N Başarı" bunlardan üretilir. Kart deseni ancak
    // gerçek veriyle dolu görünür; uydurma yüzde basmak kartı süsler ama yalan söyler.
    //
    // ⚠️ ÖĞRENCİYE ÖZEL: her satır req.userId ile filtrelenir. Ders/ünite listesi herkes
    // için aynı, ilerleme kişiye özeldir; ikisini tek uçta döndürmek panel-önbelleğine
    // ALINMAMASI gereken bir yanıt üretir (bu uç zaten önbelleksiz).
    const [aiSorular, eslemeler] = await Promise.all([
      fetchAll<{ id: string; kazanim_id: number | null }>(() =>
        supabase.from('yks_ai_questions').select('id, kazanim_id').eq('verified', true).eq('karantina', false),
      ),
      fetchAll<{ kazanim_id: number; konu_id: number }>(() =>
        supabase.from('kazanim_konu').select('kazanim_id, konu_id'),
      ),
    ])
    const kazanimKonu = new Map(eslemeler.map((e) => [Number(e.kazanim_id), Number(e.konu_id)]))
    const soruKonu = new Map<string, number>()
    for (const s of aiSorular) {
      const konuId = s.kazanim_id == null ? undefined : kazanimKonu.get(Number(s.kazanim_id))
      if (konuId) soruKonu.set(String(s.id), konuId)
    }
    // Atlananlar sayılmaz: bilmediği için atlayan öğrenci "yanlış yaptı" değildir.
    //
    // ⚠️ `.in('question_id', [...soruKonu.keys()])` KALDIRILDI: havuzun TÜM id'leri tek bir
    // GET sorgu dizesine gömülüyordu. Bugün havuz ~240 satır (≈9 KB URL) olduğu için
    // çalışıyor; 10 bin soruda ≈370 KB URL → PostgREST/nginx `414 Request-URI Too Large`
    // döndürür ve öğrencinin ANA KONU LİSTESİ ekranı havuz büyüdüğü gün topluca 500'e
    // düşerdi. Hata bugün görünmediği için sürprizle gelirdi.
    // Süzme zaten aşağıda `soruKonu.get(...)` ile yapılıyor: kullanıcının kendi cevapları
    // havuz boyutuyla değil KENDİ etkinliğiyle sınırlı, o yüzden filtresiz okumak hem
    // doğru hem ölçeklenebilir.
    const cevaplar = soruKonu.size
      ? await fetchAll<{ question_id: string | null; is_correct: boolean | null }>(() =>
          supabase
            .from('user_answers')
            .select('question_id, is_correct')
            .eq('user_id', String(req.userId))
            .eq('skipped', false),
        )
      : []
    /** konu_id → { cozulen: farklı soru adedi, dogru: doğru sayısı } */
    const konuIlerleme = new Map<number, { cozulen: Set<string>; dogru: number }>()
    for (const c of cevaplar) {
      const konuId = c.question_id ? soruKonu.get(c.question_id) : undefined
      if (!konuId) continue
      const cur = konuIlerleme.get(konuId) ?? { cozulen: new Set<string>(), dogru: 0 }
      cur.cozulen.add(String(c.question_id))
      if (c.is_correct === true) cur.dogru += 1
      konuIlerleme.set(konuId, cur)
    }

    const [{ data: kapsamlar }, havuz] = await Promise.all([
      supabase.from('ders_kapsam').select('subject, tyt, ayt_alanlar, sira').order('sira'),
      fetchAll<{
        konu_id: number
        subject: string
        ad: string
        sinav: string
        sira: number
        unite: string | null
        unite_sira: number
        soru_sayisi: number
        kolay: number
        orta: number
        zor: number
      }>(() =>
        supabase
          .from('konu_havuz')
          .select('konu_id, subject, ad, sinav, sira, unite, unite_sira, soru_sayisi, kolay, orta, zor'),
      ),
    ])

    const konuByDers = new Map<string, typeof havuz>()
    for (const k of havuz) {
      const l = konuByDers.get(k.subject) ?? []
      l.push(k)
      konuByDers.set(k.subject, l)
    }

    const dersler = []
    for (const kap of (kapsamlar ?? []) as Array<{
      subject: string
      tyt: boolean
      ayt_alanlar: string[]
      sira: number
    }>) {
      const aytVar = alan != null && (kap.ayt_alanlar ?? []).includes(alan)
      if (!kap.tyt && !aytVar) continue // ne TYT'de ne öğrencinin alanında → ders hiç görünmez

      const gorunur = (konuByDers.get(kap.subject) ?? [])
        .filter((k) => (k.sinav === 'TYT' ? kap.tyt : aytVar))
        .filter((k) => tumu || Number(k.soru_sayisi) > 0)

      // ── ÜNİTELERE GRUPLA (0031) ──
      // Ünite ayrı bir gezinti seviyesi DEĞİL, listenin bölüm başlığı. 34 satırlık düz
      // liste 5-7 taranabilir bloğa iner. Gruplama SUNUCUDA yapılır: istemci aynı sıralama
      // kurallarını ikinci kez uygulamak zorunda kalmasın (iki yerde tutulan sıra ayrışır).
      //
      // ⚠️ ÜNİTESİ NULL OLAN KONU KAYBOLMAZ. 0031 tüm sözlüğü atıyor ama ileride eklenen
      // bir konu ünitesiz kalabilir; onu düşürmek konuyu arayüzden sessizce yok ederdi.
      // Böyleleri "Diğer" bloğunda, en sonda toplanır.
      const uniteler: Array<{
        ad: string
        sinav: string
        sira: number
        toplam: number
        cozulen: number
        dogru: number
        konular: Array<{
          konuId: number; ad: string; sinav: string; soruSayisi: number
          kolay: number; orta: number; zor: number; cozulen: number
        }>
      }> = []
      const uniteIdx = new Map<string, number>()
      for (const k of gorunur.sort(
        (a, b) =>
          // TYT bloğu AYT'den önce; sonra ünite sırası; sonra ünite içi konu sırası.
          (a.sinav === b.sinav ? 0 : a.sinav === 'TYT' ? -1 : 1) ||
          Number(a.unite_sira) - Number(b.unite_sira) ||
          Number(a.sira) - Number(b.sira),
      )) {
        const uniteAdi = k.unite ?? 'Diğer'
        const anahtar = `${k.sinav}|${uniteAdi}`
        let i = uniteIdx.get(anahtar)
        if (i == null) {
          i = uniteler.length
          uniteIdx.set(anahtar, i)
          uniteler.push({
            ad: uniteAdi, sinav: k.sinav, sira: Number(k.unite_sira),
            toplam: 0, cozulen: 0, dogru: 0, konular: [],
          })
        }
        const ilerleme = konuIlerleme.get(Number(k.konu_id))
        uniteler[i].konular.push({
          konuId: Number(k.konu_id),
          ad: k.ad,
          sinav: k.sinav,
          soruSayisi: Number(k.soru_sayisi),
          kolay: Number(k.kolay),
          orta: Number(k.orta),
          zor: Number(k.zor),
          cozulen: ilerleme?.cozulen.size ?? 0,
        })
        uniteler[i].toplam += Number(k.soru_sayisi)
        uniteler[i].cozulen += ilerleme?.cozulen.size ?? 0
        uniteler[i].dogru += ilerleme?.dogru ?? 0
      }

      dersler.push({
        subject: kap.subject,
        tyt: kap.tyt,
        ayt: aytVar,
        toplam: uniteler.reduce((s, u) => s + u.toplam, 0),
        konuSayisi: uniteler.reduce((s, u) => s + u.konular.length, 0),
        cozulen: uniteler.reduce((s, u) => s + u.cozulen, 0),
        dogru: uniteler.reduce((s, u) => s + u.dogru, 0),
        uniteler,
      })
    }

    res.json({ alan, dersler, toplam: dersler.reduce((s, d) => s + d.toplam, 0) })
  } catch (err) {
    next(err)
  }
})

/**
 * POST /api/v1/questions/ai/konu-talep — body: { konuId }
 *
 * Öğrenci seyrek/boş bir konuya girdiğinde ilgisini kaydeder (0028). ÜRETİM TETİKLEMEZ:
 * yalnız yöneticinin kapsama ekranındaki öncelik sayacını besler. Otomatik üretim
 * tavansız paralı harcama demekti (bkz. 0028 gerekçesi ve env.ts NIGHTLY_FORGE).
 *
 * Kişi başı tek satır (PK konu_id+user_id) → tekrar çağrı sessizce yutulur.
 */
aiQuestionsRouter.post('/konu-talep', async (req, res, next) => {
  try {
    const konuId = Number((req.body as { konuId?: unknown } | undefined)?.konuId) || null
    if (!konuId) {
      res.status(400).json({ error: 'konu_gerekli', message: 'konuId zorunlu.' })
      return
    }
    // Var olmayan konuya talep yazmak, kapsama ekranında hayalet satır üretirdi.
    const { data: konu } = await supabase.from('konular').select('id').eq('id', konuId).maybeSingle()
    if (!konu) {
      res.status(404).json({ error: 'konu_bulunamadi', message: 'Konu bulunamadı.' })
      return
    }
    await supabase
      .from('konu_talep')
      .upsert({ konu_id: konuId, user_id: String(req.userId) }, { onConflict: 'konu_id,user_id', ignoreDuplicates: true })
    res.json({ ok: true })
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
          .eq('karantina', false) // 0025: kalite raporu SERVİS EDİLEN havuzu ölçer
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
    supabase.from('yks_ai_questions').select('kazanim_id, subject').eq('verified', true).eq('karantina', false),
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

/**
 * SON DURAK — /questions/ai altında eşleşmeyen yol BURADA biter, düşmez.
 *
 * ⚠️ NEDEN ŞART (ölçüldü, kullanıcı bunu yaşadı): Express `app.use()`'ları SIRAYLA dener ve
 * bir router hiçbir rotasına uymayan isteği `next()` ile bırakır. app.ts'te mount sırası
 *     /questions/ai  → standardLimiter (60/dk)
 *     /questions     → llmLimiter      (10/dk, PAHALI üretim kotası)
 * olduğu için, /questions/ai altındaki BİLİNMEYEN bir yol (eski imaj, yazım hatası, henüz
 * deploy edilmemiş uç) sessizce /questions'a düşüyor ve ÜRETİM KOTASINI yiyordu.
 *
 * Somut sonuç: salt-okunur `/questions/ai/konular` isteği 404 alıyor, ama 10 denemede
 * kullanıcının günlük üretim hakkı tükeniyor ve ekranda "Dakikada 10 ÜRETİM isteği sınırı
 * aşıldı" yazıyor — hiç üretim istenmemişken. Hem yanlış fatura hem yanlış teşhis.
 *
 * Bu handler zincirin sonunda: üstteki rotalar eşleşirse buraya hiç gelinmez.
 */
aiQuestionsRouter.use((_req, res) => {
  res.status(404).json({ error: 'not_found' })
})
