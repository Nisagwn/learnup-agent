import { Router } from 'express'
import { supabase } from '../clients/supabase.js'
import { redisTry } from '../clients/redis.js'
import { fetchAll } from '../lib/pg.js'
import { kimligiUnut, yetkiOnbelleginiDus } from '../lib/yetki.js'
import { denetimYaz } from '../lib/denetim.js'
import { enqueueTask } from '../agents/bus.js'
import { yonetimRouter } from './admin-yonetim.routes.js'
import { havuzRouter } from './admin-havuz.routes.js'
import { onbellegiDus, onbellekli } from '../lib/panel-onbellek.js'
import { HttpHatasi, bulunamadi, gecersizIstek } from '../lib/hata.js'
import { evalKosumSayisi, evalSonAnlik, evalTrendi } from '../lib/eval-anlik.js'
import { esikleriTazele, esikYaz } from '../lib/ozgunluk-esik.js'
import { esikKaynagiDB, ozgunlukEsigi, OZGUNLUK_TABAN, OZGUNLUK_TABLOSU, SHINGLE_BOYU } from '../utils/benzerlik.js'
import type {
  AdminEvalYaniti,
  AdminGorevlerYaniti,
  AdminHavuzYaniti,
  AdminKullaniciSatiri,
  AdminKullanicilarYaniti,
  AdminOzgunlukYaniti,
  EsikDegisYanit,
  EvalTetikYanit,
  OgretmenOnayYanit,
  OnbellekDusYanit,
} from '../types/panel.js'

/**
 * YÖNETİCİ PANELİ — sistemin motor dairesi.
 *
 * ⚠️ Buradaki hiçbir uç SAYI UYDURMAZ. Ölçülmemiş bir metrik `null` döner; panel
 * onu "ölçüm yok" diye çizer. Denetlenmemiş bir hattı "sıfır sorunlu" göstermek,
 * bu panelin önlemek için var olduğu şeydir.
 *
 * ⚠️ ÜRETİM HUNİSİ (/uretim-hatti) BURADA YOK: elenen aday hiçbir yere yazılmıyor
 * (generateVerifiedSet içinde bellekte eleniyor). Huniyi eval anlıklarından türetmek
 * UYDURMA olurdu. O uç, üretim telemetrisi tablosu geldiğinde eklenir.
 */
export const adminRouter = Router()

/**
 * YAZAN uçlar ayrı dosyada (rol değiştir · sınıf ata · görev yeniden kuyrukla ·
 * denetim defteri). Ayrım okuma/yazma ekseninde: bu dosya sistemin durumunu
 * RAPORLAR, oradaki uçlar DEĞİŞTİRİR ve hepsi denetim izi bırakmak zorunda.
 * Aynı requireRole('admin') kapısının ardındalar — app.ts:106.
 */
adminRouter.use(yonetimRouter)

/**
 * Havuz moderasyonu (0025) — soru listesi/detayı, doğrulama geri alma, karantina,
 * etiket düzeltme, üretim tetikleme. `/havuz/sorular` yollarının bu dosyadaki
 * `/havuz` özetiyle çakışmaması için o uç TAM eşleşmeli (aşağıda `'/havuz'`).
 */
adminRouter.use('/havuz', havuzRouter)

const sayiParam = (v: unknown, varsayilan: number, tavan: number): number => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), tavan) : varsayilan
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /admin/havuz — havuz hacmi, doğrulanmış oranı, kalite, kapsama
// ─────────────────────────────────────────────────────────────────────────────
const havuzOzeti = onbellekli<AdminHavuzYaniti>('havuz', async () => {
  const [ai, osym, kazanimlar] = await Promise.all([
    fetchAll<{ subject: string; verified: boolean; karantina: boolean; difficulty: string | null; quality: number | null; kazanim_id: number | null; created_at: string }>(
      () => supabase.from('yks_ai_questions').select('subject, verified, karantina, difficulty, quality, kazanim_id, created_at'),
    ),
    fetchAll<{ subject: string; verified: boolean; exam_year: number | null; kazanim_id: number | null }>(
      () => supabase.from('yks_questions').select('subject, verified, exam_year, kazanim_id').eq('source_type', 'osym_cikmis'),
    ),
    fetchAll<{ id: number; subject: string }>(
      () => supabase.from('curriculum_nodes').select('id, subject').eq('node_type', 'kazanim'),
    ),
  ])

  // ── AI havuzu ──
  // ⚠️ "Doğrulanmış" ile "SERVİS EDİLEBİLİR" ayrı sayılır (0025): karantinaya alınan soru
  // doğrulamayı geçmiştir ama havuzda yoktur. İkisini tek sayıya indirmek ya hattın kalite
  // oranını insan müdahalesiyle kirletir ya da düşürülen soruyu hâlâ varmış gibi gösterir.
  const aiDogrulanmis = ai.filter((r) => r.verified && !r.karantina)
  const karantinada = ai.filter((r) => r.karantina).length
  const zorluk = { kolay: 0, orta: 0, zor: 0, etiketsiz: 0 }
  const kaliteSayim = new Map<number, number>()
  const aiDers = new Map<string, { count: number; verified: number }>()
  let kaliteToplam = 0
  let kaliteAdet = 0
  for (const r of ai) {
    const d = aiDers.get(r.subject) ?? { count: 0, verified: 0 }
    d.count += 1
    if (r.verified) d.verified += 1
    aiDers.set(r.subject, d)
  }
  for (const r of aiDogrulanmis) {
    const z = r.difficulty && r.difficulty in zorluk ? (r.difficulty as 'kolay' | 'orta' | 'zor') : 'etiketsiz'
    zorluk[z] += 1
    const q = r.quality ?? 0
    kaliteSayim.set(q, (kaliteSayim.get(q) ?? 0) + 1)
    if (r.quality != null) {
      kaliteToplam += r.quality
      kaliteAdet += 1
    }
  }

  // ── ÖSYM havuzu ──
  const osymDogrulanmis = osym.filter((r) => r.verified)
  const osymDers = new Map<string, number>()
  const yillar = new Map<number, number>()
  for (const r of osym) {
    osymDers.set(r.subject, (osymDers.get(r.subject) ?? 0) + 1)
    if (r.exam_year) yillar.set(r.exam_year, (yillar.get(r.exam_year) ?? 0) + 1)
  }

  // ── Kapsama: kaç kazanımda gerçekten soru var ──
  const aiKapsam = new Set(aiDogrulanmis.map((r) => r.kazanim_id).filter((x): x is number => x != null))
  const osymKapsam = new Set(osymDogrulanmis.map((r) => r.kazanim_id).filter((x): x is number => x != null))
  const herhangi = new Set([...aiKapsam, ...osymKapsam])
  const dersKapsam = new Map<string, { kazanim: number; kapsanan: number }>()
  for (const k of kazanimlar) {
    const d = dersKapsam.get(k.subject) ?? { kazanim: 0, kapsanan: 0 }
    d.kazanim += 1
    if (herhangi.has(k.id)) d.kapsanan += 1
    dersKapsam.set(k.subject, d)
  }

  return {
    ai: {
      toplam: ai.length,
      verified: aiDogrulanmis.length,
      verifiedOrani: ai.length ? Number((aiDogrulanmis.length / ai.length).toFixed(4)) : 0,
      zorluk,
      kaliteHistogram: [...kaliteSayim.entries()]
        .map(([quality, count]) => ({ quality, count }))
        .sort((a, b) => a.quality - b.quality),
      // Hiç kalite etiketi yoksa ortalama YOK — 0 değil.
      ortKalite: kaliteAdet ? Number((kaliteToplam / kaliteAdet).toFixed(2)) : null,
      dersler: [...aiDers.entries()]
        .map(([subject, v]) => ({ subject, ...v }))
        .sort((a, b) => b.count - a.count),
      kazanimsiz: aiDogrulanmis.filter((r) => r.kazanim_id == null).length,
      karantinada,
      sonUretim: ai.length ? ai.map((r) => r.created_at).sort().at(-1) ?? null : null,
    },
    osym: {
      toplam: osym.length,
      verified: osymDogrulanmis.length,
      dersler: [...osymDers.entries()].map(([subject, count]) => ({ subject, count })).sort((a, b) => b.count - a.count),
      yillar: [...yillar.entries()].map(([year, count]) => ({ year, count })).sort((a, b) => b.year - a.year),
    },
    kapsama: {
      kazanimToplam: kazanimlar.length,
      aiKapsanan: aiKapsam.size,
      osymKapsanan: osymKapsam.size,
      herhangiKapsanan: herhangi.size,
      kapsamaOrani: kazanimlar.length ? Number((herhangi.size / kazanimlar.length).toFixed(4)) : 0,
      dersBazli: [...dersKapsam.entries()]
        .map(([subject, v]) => ({
          subject,
          kazanim: v.kazanim,
          kapsanan: v.kapsanan,
          oran: v.kazanim ? Number((v.kapsanan / v.kazanim).toFixed(4)) : 0,
        }))
        .sort((a, b) => a.oran - b.oran), // en zayıf kapsama başta: iş sırası
    },
    olcumZamani: new Date().toISOString(),
  }
})

adminRouter.get('/havuz', async (_req, res, next) => {
  try {
    res.json(await havuzOzeti())
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /admin/eval — yapısal-eval anlıkları + drift trendi
// ─────────────────────────────────────────────────────────────────────────────
adminRouter.get('/eval', async (req, res, next) => {
  try {
    const limit = sayiParam(req.query.limit, 30, 200)
    // 0025: anlıklar artık DB'de (eval_anliklari); dosya dizini yalnız yedek.
    const [sonuncu, trend, kosumSayisi] = await Promise.all([
      evalSonAnlik(),
      evalTrendi(limit),
      evalKosumSayisi(),
    ])

    const yasSaat = sonuncu
      ? Number(((Date.now() - +new Date(sonuncu.tarih)) / 3_600_000).toFixed(1))
      : null

    // Uyarı, sessizliği bozmak için: hiç koşmadıysa ya da bayatladıysa panel söylesin.
    let uyari: string | null = null
    if (!sonuncu) uyari = 'Eval hiç koşmadı — havuz kalitesi ÖLÇÜLMEDİ.'
    else if (yasSaat != null && yasSaat > 24 * 7) {
      uyari = `Son ölçüm ${Math.round(yasSaat / 24)} gün önce — bayat.`
    }

    const yanit: AdminEvalYaniti = { sonuncu, trend, kosumSayisi, sonKosumYasiSaat: yasSaat, uyari }
    res.json(yanit)
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /admin/ozgunluk — Jaccard bariyeri: eşikler + ölçüm
// ─────────────────────────────────────────────────────────────────────────────
const ozgunlukOzeti = onbellekli<AdminOzgunlukYaniti>('ozgunluk', async () => {
  const ai = await fetchAll<{ subject: string }>(() =>
    supabase.from('yks_ai_questions').select('subject').eq('verified', true).eq('karantina', false),
  )
  const adet = new Map<string, number>()
  for (const r of ai) adet.set(r.subject, (adet.get(r.subject) ?? 0) + 1)

  // Eşikler DB'den (0025); tablo boşsa kod tablosuna düşülür — hangisi geçerliyse O gösterilir.
  await esikleriTazele()
  // Eşik tablosundaki dersler + havuzda görülen dersler birleşimi.
  const dersler = new Set([...Object.keys(OZGUNLUK_TABLOSU), ...adet.keys()])
  const anlik = await evalSonAnlik()

  return {
    esikler: [...dersler]
      .map((subject) => ({
        subject,
        esik: ozgunlukEsigi(subject),
        // `taban` = bu ders için özel eşik YOK, taban uygulanıyor.
        taban: ozgunlukEsigi(subject) === OZGUNLUK_TABAN && !(subject in OZGUNLUK_TABLOSU),
        havuzAdedi: adet.get(subject) ?? 0,
      }))
      .sort((a, b) => b.esik - a.esik),
    kaynakDB: esikKaynagiDB(),
    tabanEsik: OZGUNLUK_TABAN,
    shingle: SHINGLE_BOYU,
    snapshot: anlik
      ? { tarih: anlik.tarih, nnKopya: anlik.ai.nnKopya, nnP90: anlik.ai.nnP90 }
      : null,
    // Üretim telemetrisi yok → kaç adayın bariyerde elendiği ÖLÇÜLMEDİ. null = bilinmiyor.
    engel: null,
    not:
      `Her aday soru, aynı dersteki en yakın komşusuna karşı ${SHINGLE_BOYU} karakterlik ` +
      'shingle kümeleri üzerinden Jaccard benzerliğiyle ölçülür. Eşik ders bazlıdır: ' +
      'gerçek ÖSYM sorularının aynı-ders en-yakın-komşu p99 değerine 0.05 eklenerek ' +
      'türetilmiştir. Eşiği aşan aday ONARILMAZ, doğrudan elenir.',
  }
})

adminRouter.get('/ozgunluk', async (_req, res, next) => {
  try {
    res.json(await ozgunlukOzeti())
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// PUT /admin/ozgunluk/esik — body: { subject, esik }
//
// ⚠️ EŞİĞİ DÜŞÜRMEK KALİTE BARİYERİNİ GEVŞETİR. Bu uç bunu engellemez (yönetici
// ölçüme dayanarak düşürmek isteyebilir) ama SAKLAMAZ da: önceki/sonraki değer
// denetim defterine yazılır ve arayüz düşürmede açık onay ister.
//
// Sınırlar 0025'teki CHECK ile aynı: 0 < esik < 1. Eşiği 0'a yaklaştırmak bariyeri
// tamamen açar, 1'e yaklaştırmak her adayı kopya sayar — ikisi de kapıyı işlevsizleştirir.
// ─────────────────────────────────────────────────────────────────────────────
adminRouter.put('/ozgunluk/esik', async (req, res, next) => {
  try {
    const adminId = req.userId!
    const b = (req.body ?? {}) as { subject?: unknown; esik?: unknown }
    const subject = typeof b.subject === 'string' ? b.subject.trim() : ''
    const esik = Number(b.esik)

    if (!subject) throw gecersizIstek('ders_gerekli', '`subject` alanı gerekli.')
    if (!Number.isFinite(esik) || esik <= 0 || esik >= 1) {
      throw gecersizIstek('gecersiz_esik', 'Eşik 0 ile 1 arasında (dahil değil) bir sayı olmalı.')
    }
    // 3 basamak: DB kolonu numeric(4,3). Fazlası sessizce yuvarlanır ve panelde
    // "kaydettiğim değer bu değil" şaşkınlığı üretirdi.
    const yuvarlak = Number(esik.toFixed(3))

    const onceki = await esikYaz(subject, yuvarlak, adminId)
    onbellegiDus('ozgunluk')

    const denetimYazildi = await denetimYaz({
      adminId, eylem: 'esik_degis', hedefId: null, hedefTur: 'sistem',
      detay: { subject, onceki, yeni: yuvarlak, dusuruldu: onceki !== null && yuvarlak < onceki },
    })

    const yanit: EsikDegisYanit = { subject, onceki, yeni: yuvarlak, denetimYazildi }
    res.json(yanit)
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /admin/onbellek/dus — panel + yetki önbelleklerini düşür
//
// "Panelde eski sayı görünüyor" şikâyetinin tek tıklık cevabı. Yanıt hangi katmandan
// kaç anahtarın düştüğünü SAYIYLA döner: sonucu görünmeyen bir ops düğmesi, basıldıktan
// sonra bir şey olup olmadığı bilinemeyen bir düğmedir.
// ─────────────────────────────────────────────────────────────────────────────
adminRouter.post('/onbellek/dus', async (req, res, next) => {
  try {
    const adminId = req.userId!
    const panel = onbellegiDus()
    const { kimlik, sinif } = yetkiOnbelleginiDus()
    const redis = await redisTry(async (r) => {
      const anahtarlar = await r.keys('yetki:kimlik:*')
      if (!anahtarlar.length) return 0
      await r.del(...anahtarlar)
      return anahtarlar.length
    }, 0)

    // Eşikler de tazelensin: yönetici "önbelleği düşür" derken bunu da kastediyor.
    await esikleriTazele(true)

    const denetimYazildi = await denetimYaz({
      adminId, eylem: 'onbellek_dus', hedefId: null, hedefTur: 'sistem',
      detay: { panel, kimlik, sinif, redis },
    })

    const yanit: OnbellekDusYanit = { panel, kimlik, sinif, redis, denetimYazildi }
    res.json(yanit)
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /admin/eval/kosum — yapısal eval ölçümünü kuyruğa at
//
// ⚠️ SENKRON KOŞMAZ. Ölçüm binlerce soruyu tarar ve dakikalar sürer; HTTP isteğinde
// koşturmak vekil/zaman aşımı duvarına toslar ve yarım kalmış bir ölçüm bırakır.
// Worker'a `eval` görevi olarak gider, sonuç `eval_anliklari` tablosuna yazılır.
//
// ⚠️ TEK KOŞUM KİLİDİ: aynı anda iki ölçüm başlatmak hem boşa LLM'siz-ama-ağır iştir
// hem de aynı `tarih` anahtarına yazma yarışı üretir.
// ─────────────────────────────────────────────────────────────────────────────
adminRouter.post('/eval/kosum', async (req, res, next) => {
  try {
    const adminId = req.userId!

    // Koşan görev var mı? (Redis kilidi yok/düşükse DB'ye bakarız — kaynak hakikat orası.)
    const { data: kosan } = await supabase
      .from('agent_tasks')
      .select('id')
      .eq('kind', 'eval')
      .in('status', ['PENDING', 'RUNNING'])
      .limit(1)
      .maybeSingle()
    if (kosan) {
      throw new HttpHatasi(409, 'eval_kosuyor', 'Zaten kosan bir eval ölçümü var; bitmesini bekle.')
    }

    const task = await enqueueTask({ userId: adminId, kind: 'eval', payload: { kaynak: 'panel' } })

    const denetimYazildi = await denetimYaz({
      adminId, eylem: 'eval_tetik', hedefId: task.id, hedefTur: 'gorev', detay: {},
    })

    const yanit: EvalTetikYanit = { taskId: task.id, denetimYazildi }
    res.status(202).json(yanit)
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /admin/gorevler — ajan/worker sağlığı. ÖNBELLEK YOK: ops verisi bayatlamamalı.
// ─────────────────────────────────────────────────────────────────────────────
const TAKILMA_DK = 10

adminRouter.get('/gorevler', async (req, res, next) => {
  try {
    const limit = sayiParam(req.query.limit, 50, 200)
    const gunOnce = new Date(Date.now() - 86_400_000).toISOString()

    const gorevler = await fetchAll<{
      id: string
      kind: string
      status: string
      error: string | null
      attempts: number
      locked_by: string | null
      locked_at: string | null
      created_at: string
      updated_at: string
    }>(() =>
      supabase
        .from('agent_tasks')
        .select('id, kind, status, error, attempts, locked_by, locked_at, created_at, updated_at')
        .order('updated_at', { ascending: false }),
    )

    const durum = { PENDING: 0, RUNNING: 0, COMPLETED: 0, FAILED: 0 }
    const kindMap = new Map<string, { pending: number; running: number; completed: number; failed: number }>()
    const takilanlar: AdminGorevlerYaniti['takilanlar'] = []
    const son24 = { olusturulan: 0, tamamlanan: 0, basarisiz: 0 }

    for (const g of gorevler) {
      if (g.status in durum) durum[g.status as keyof typeof durum] += 1
      const k = kindMap.get(g.kind) ?? { pending: 0, running: 0, completed: 0, failed: 0 }
      if (g.status === 'PENDING') k.pending += 1
      else if (g.status === 'RUNNING') k.running += 1
      else if (g.status === 'COMPLETED') k.completed += 1
      else if (g.status === 'FAILED') k.failed += 1
      kindMap.set(g.kind, k)

      // RUNNING + kilit yaşlı → worker çöktü ya da kilit sızdı.
      if (g.status === 'RUNNING' && g.locked_at) {
        const yasDk = Math.round((Date.now() - +new Date(g.locked_at)) / 60_000)
        if (yasDk > TAKILMA_DK) {
          takilanlar.push({ id: g.id, kind: g.kind, lockedBy: g.locked_by, lockedAt: g.locked_at, yasDk, attempts: g.attempts })
        }
      }
      if (g.created_at >= gunOnce) son24.olusturulan += 1
      if (g.updated_at >= gunOnce) {
        if (g.status === 'COMPLETED') son24.tamamlanan += 1
        if (g.status === 'FAILED') son24.basarisiz += 1
      }
    }

    const saglik: AdminGorevlerYaniti['saglik'] =
      takilanlar.length > 0 || durum.FAILED > durum.COMPLETED ? 'kritik'
        : durum.FAILED > 0 || durum.PENDING > 20 ? 'uyari'
          : 'iyi'

    const yanit: AdminGorevlerYaniti = {
      durum,
      kindBazli: [...kindMap.entries()].map(([kind, v]) => ({ kind, ...v })).sort((a, b) => b.failed - a.failed),
      takilanlar: takilanlar.slice(0, limit),
      sonHatalar: gorevler
        .filter((g) => g.status === 'FAILED')
        .slice(0, 10)
        .map((g) => ({ id: g.id, kind: g.kind, error: g.error, attempts: g.attempts, updatedAt: g.updated_at })),
      son24Saat: son24,
      saglik,
      olcumZamani: new Date().toISOString(),
    }
    res.json(yanit)
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /admin/kullanicilar — ÖNBELLEK YOK: onay anında yansımalı.
// ─────────────────────────────────────────────────────────────────────────────
adminRouter.get('/kullanicilar', async (req, res, next) => {
  try {
    const rol = req.query.role ? String(req.query.role) : null
    const onay = req.query.approved
    const ara = req.query.q ? String(req.query.q).trim() : null
    const basvuru = req.query.basvuru ? String(req.query.basvuru) : null
    const askida = req.query.askida
    const limit = sayiParam(req.query.limit, 50, 200)
    const offset = Math.max(0, Number(req.query.offset) || 0)

    let q = supabase
      .from('profiles')
      .select(
        'id, name, email, role, is_approved, class_code, school, created_at, teacher_application_status, askiya_alindi',
        { count: 'exact' },
      )
    if (rol) q = q.eq('role', rol)
    if (onay === 'true' || onay === 'false') q = q.eq('is_approved', onay === 'true')
    if (askida === 'true' || askida === 'false') q = q.eq('askiya_alindi', askida === 'true')
    if (basvuru === 'bekliyor' || basvuru === 'onaylandi' || basvuru === 'reddedildi') {
      q = q.eq('teacher_application_status', basvuru)
    }
    if (ara) q = q.or(`name.ilike.%${ara}%,email.ilike.%${ara}%`)

    const { data, count, error } = await q
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)
    if (error) throw new HttpHatasi(500, 'kullanicilar_okunamadi', 'Kullanıcılar okunamadı.')

    const satirlar = (data ?? []) as Array<Record<string, unknown>>

    // Öğretmenlerin öğrenci sayısı: öğretmen başına DEĞİL, tek gruplu sorgu.
    const ogretmenIds = satirlar.filter((r) => r.role === 'teacher').map((r) => String(r.id))
    const ogrenciSayim = new Map<string, number>()
    if (ogretmenIds.length) {
      const ogrenciler = await fetchAll<{ teacher_id: string }>(() =>
        supabase.from('profiles').select('teacher_id').eq('role', 'student').in('teacher_id', ogretmenIds),
      )
      for (const o of ogrenciler) {
        ogrenciSayim.set(o.teacher_id, (ogrenciSayim.get(o.teacher_id) ?? 0) + 1)
      }
    }

    // Üç kuyruk AYRI sayılır: onaysız öğretmen + bekleyen başvuru (0021) + askı (0025).
    // Toplayıp tek "dikkat" sayısı vermek, yöneticiye hangi işi yapacağını söylemezdi.
    const [{ count: bekleyen }, { count: bekleyenBas }, { count: askidaSayim }] = await Promise.all([
      supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'teacher')
        .eq('is_approved', false),
      supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('teacher_application_status', 'bekliyor'),
      supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('askiya_alindi', true),
    ])

    const users: AdminKullaniciSatiri[] = satirlar.map((r) => ({
      id: String(r.id),
      name: (r.name as string | null) ?? null,
      email: (r.email as string | null) ?? null,
      role: (r.role as AdminKullaniciSatiri['role']) ?? 'student',
      isApproved: r.is_approved === true,
      classCode: (r.class_code as string | null) ?? null,
      school: (r.school as string | null) ?? null,
      ogrenciSayisi: r.role === 'teacher' ? (ogrenciSayim.get(String(r.id)) ?? 0) : null,
      createdAt: String(r.created_at),
      basvuruDurumu: (r.teacher_application_status as AdminKullaniciSatiri['basvuruDurumu']) ?? null,
      askidaMi: r.askiya_alindi === true,
    }))

    const yanit: AdminKullanicilarYaniti = {
      users,
      total: count ?? users.length,
      limit,
      offset,
      bekleyenOnay: bekleyen ?? 0,
      bekleyenBasvuru: bekleyenBas ?? 0,
      askidaSayisi: askidaSayim ?? 0,
    }
    res.json(yanit)
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /admin/ogretmen/:id/onay — öğretmen onayını aç/kapat
// ─────────────────────────────────────────────────────────────────────────────
adminRouter.post('/ogretmen/:id/onay', async (req, res, next) => {
  try {
    const id = String(req.params.id)
    const onayli = (req.body as { onayli?: unknown })?.onayli
    if (typeof onayli !== 'boolean') {
      throw gecersizIstek('gecersiz_onay', '`onayli` alanı true/false olmalı.')
    }

    const { data: hedef } = await supabase.from('profiles').select('id, role').eq('id', id).maybeSingle()
    if (!hedef || hedef.role !== 'teacher') {
      throw bulunamadi('ogretmen_bulunamadi', 'Öğretmen bulunamadı.')
    }

    const { error } = await supabase.from('profiles').update({ is_approved: onayli }).eq('id', id)
    if (error) throw new HttpHatasi(500, 'onay_yazilamadi', 'Onay durumu güncellenemedi.')

    // ⚠️ Kimlik önbelleğini ANINDA düş: onay iptali TTL beklemeden geçmeli,
    // yoksa yetkisi alınan öğretmen 60sn daha sınıfı görür.
    await kimligiUnut(id)

    const denetimYazildi = await denetimYaz({
      adminId: req.userId!, eylem: 'ogretmen_onay', hedefId: id, hedefTur: 'kullanici',
      detay: { onayli },
    })

    const yanit: OgretmenOnayYanit = {
      id, isApproved: onayli, guncellendi: new Date().toISOString(), denetimYazildi,
    }
    res.json(yanit)
  } catch (err) {
    next(err)
  }
})
