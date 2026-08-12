import { Router } from 'express'
// validateParams(IdParam): yol parametresi doğrudan `.eq('id', …)`'ye gidiyordu; `abc` gibi
// bir değer Postgres'te 22P02 (invalid input syntax for type uuid) üretiyor ve okuma
// noktalarında 500'e dönüşüyordu — oysa bu bir İSTEMCİ hatası, 400 olmalı.
import { validateParams, IdParam } from '../middleware/validate.js'
import { supabase } from '../clients/supabase.js'
import { fetchAll } from '../lib/pg.js'
import { denetimYaz } from '../lib/denetim.js'
import { enqueueTask } from '../agents/bus.js'
import { resolveKazanim } from '../lib/curriculum.js'
import { onbellegiDus } from '../lib/panel-onbellek.js'
import { celdiriciKusatmasi, sikUzunlukSizintisi, type SikliSoru } from '../utils/shufflers.js'
import { varOlmayanGorseleGonderme, gorselBagimli } from '../utils/soru-saglik.js'
import { kumeBenzerligi, ozgunlukEsigi, shingleKumesi } from '../utils/benzerlik.js'
import { esikleriTazele } from '../lib/ozgunluk-esik.js'
import { HttpHatasi, bulunamadi, gecersizIstek } from '../lib/hata.js'
import type {
  AdminSoruDetayi,
  AdminSoruSatiri,
  AdminSorularYaniti,
  DenetimSatiri,
  KapsamaDersi,
  KapsamaKonu,
  KapsamaYaniti,
  SoruMudahaleYanit,
  UretimTetikYanit,
} from '../types/panel.js'

/**
 * HAVUZ MODERASYONU — yöneticinin soruya doğrudan müdahalesi (0025).
 *
 * ⚠️ YALNIZ `yks_ai_questions`. Çıkmış ÖSYM soruları bu uçlardan da SERVİS EDİLMEZ
 * (2026-07-22 telif kararı; app.ts:93). Yönetici arayüzü de bir yayın yüzeyidir —
 * "iç araç" olması muafiyet vermez. ÖSYM tarafının sayıları yalnız toplu istatistik
 * olarak (admin.routes.ts /havuz) görünür, gövdeleri hiçbir yerde.
 *
 * ⚠️ METİN DÜZENLEME YOK. PATCH yalnız `difficulty` + `kazanim_id` yazar. Soru
 * gövdesini elle değiştirmek iki şeyi birden bozar: (1) `content_hash` dedup'u —
 * aynı soru yeniden üretilip ikinci kez havuza girer; (2) eval ölçümü — hattın
 * ürettiği metin ile ölçülen metin ayrışır ve kalite raporu yalan söylemeye başlar.
 * Bozuk soru DÜZELTİLMEZ, KARANTİNAYA ALINIR.
 *
 * ⚠️ HER YAZMA PANEL ÖNBELLEĞİNİ DÜŞÜRÜR. /havuz ve /ozgunluk özetleri 10 dakika
 * önbellekli; düşürülmezse yönetici sorusunu karantinaya alır ve panelde hiçbir
 * sayının değişmediğini görür — "çalışmadı" sanır.
 */
export const havuzRouter = Router()

const ZORLUKLAR = new Set(['kolay', 'orta', 'zor'])

/** Liste satırı için gövde kısaltma — tam metin detay ucunda. */
const onizle = (s: string): string => {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > 180 ? `${t.slice(0, 179)}…` : t
}

const SATIR_ALANLARI =
  'id, subject, kazanim_id, topic, question_text, difficulty, quality, verified, karantina, karantina_neden, created_at'

/** Ampirik alanlar ÇAĞIRAN tarafından eklenir (toplu sorgu) — burada N+1 doğardı. */
type SatirGovde = Omit<AdminSoruSatiri, 'cozulme' | 'dogruOrani' | 'risk'>

function satiraCevir(r: Record<string, unknown>, kazanimAdi: Map<number, string>): SatirGovde {
  const kid = r.kazanim_id != null ? Number(r.kazanim_id) : null
  return {
    id: String(r.id),
    subject: String(r.subject),
    kazanimId: kid,
    kazanimBaslik: kid != null ? (kazanimAdi.get(kid) ?? null) : null,
    topic: (r.topic as string | null) ?? null,
    onizleme: onizle(String(r.question_text ?? '')),
    difficulty: (r.difficulty as string | null) ?? null,
    quality: (r.quality as number | null) ?? null,
    verified: r.verified === true,
    karantina: r.karantina === true,
    karantinaNeden: (r.karantina_neden as string | null) ?? null,
    createdAt: String(r.created_at),
  }
}

/**
 * AMPİRİK ZORLUK — sorunun gerçekte kaç kez çözüldüğü ve doğru oranı.
 *
 * ⚠️ NEDEN ŞART: yönetici "zorluk düzeltme" kararını bugün SEZGİYLE veriyor. Sezgiyle
 * verilen etiket, hattın eval ölçümünü kirletir (etiket dağılımı ile gerçek performans
 * ayrışır ve kalite raporu yalan söylemeye başlar). "Kolay etiketli ama %31 doğru" satırı
 * bir kanıttır; onsuz düzeltme ekranı sahte bir kontrol hissidir.
 *
 * ⚠️ AZ ÖRNEKLEM ORAN ÜRETMEZ. n < ESIK iken dogruOrani null döner — 1 kişi çözüp yanlış
 * yapmışsa "%0 doğru → bu soru çok zor" demek olurdu. null = "henüz bilmiyoruz".
 */
const AMPIRIK_ESIK = 5

async function ampirikIstatistik(ids: string[]): Promise<Map<string, { n: number; dogruOrani: number | null }>> {
  const harita = new Map<string, { n: number; dogruOrani: number | null }>()
  if (!ids.length) return harita
  // Atlanan sorular (skipped) oranı bozar: bilmediği için atlayan öğrenci "yanlış" sayılmaz.
  const satirlar = await fetchAll<{ question_id: string | null; is_correct: boolean | null }>(() =>
    supabase.from('user_answers').select('question_id, is_correct').in('question_id', ids).eq('skipped', false),
  )
  const sayac = new Map<string, { n: number; d: number }>()
  for (const r of satirlar) {
    if (!r.question_id) continue
    const c = sayac.get(r.question_id) ?? { n: 0, d: 0 }
    c.n += 1
    if (r.is_correct === true) c.d += 1
    sayac.set(r.question_id, c)
  }
  for (const [id, c] of sayac) {
    harita.set(id, { n: c.n, dogruOrani: c.n >= AMPIRIK_ESIK ? c.d / c.n : null })
  }
  return harita
}

/**
 * TRİYAJ RİSK SKORU — yönetici 236 soruyu gezerek değil, kuyruk eriterek çalışmalı.
 * Yüksek skor = önce bakılmalı. Sinyaller (toplanır):
 *   · doğrulanmamış           +3   (havuza girmemiş, kararı bekleyen)
 *   · kalite düşük (<4)       +2   (hattın kendi güvensizliği)
 *   · kalite hiç yok          +1   (ölçülmemiş)
 *   · etiket ↔ ampirik çelişki +3  (kolay etiketli ama <%40 doğru / zor etiketli ama >%85)
 * Özgünlük komşuluğu BURADA HESAPLANMAZ: O(n²) shingle karşılaştırması (detay ucunda
 * soru başına tüm dersi tarıyor) liste ucunda her istekte tekrarlanamaz.
 */
function riskSkoru(
  r: Record<string, unknown>,
  amp: { n: number; dogruOrani: number | null } | undefined,
): number {
  let s = 0
  if (r.verified !== true) s += 3
  const q = r.quality == null ? null : Number(r.quality)
  if (q == null) s += 1
  else if (q < 4) s += 2
  const zorluk = (r.difficulty as string | null) ?? null
  const oran = amp?.dogruOrani ?? null
  if (oran != null && zorluk) {
    if (zorluk === 'kolay' && oran < 0.4) s += 3
    if (zorluk === 'zor' && oran > 0.85) s += 3
  }
  return s
}

/** Kazanım başlıklarını TEK sorguda çözer — N+1 yok. */
async function kazanimAdlari(idler: Array<number | null>): Promise<Map<number, string>> {
  const benzersiz = [...new Set(idler.filter((x): x is number => x != null))]
  const harita = new Map<number, string>()
  if (!benzersiz.length) return harita
  const { data } = await supabase.from('curriculum_nodes').select('id, title').in('id', benzersiz)
  for (const n of (data ?? []) as Array<{ id: number; title: string }>) harita.set(Number(n.id), n.title)
  return harita
}

async function soruOku(id: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from('yks_ai_questions')
    .select(`${SATIR_ALANLARI}, options, correct_option, solution, content_hash`)
    .eq('id', id)
    .maybeSingle()
  if (error) throw new HttpHatasi(500, 'soru_okunamadi', 'Soru okunamadı.')
  if (!data) throw bulunamadi('soru_bulunamadi', 'Soru bulunamadı.')
  return data as Record<string, unknown>
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /admin/havuz/sorular — filtreli, sayfalı soru listesi
//
// ÖNBELLEK YOK: moderasyon sonrası liste ANINDA doğru olmalı. 10 dakikalık bir
// önbellek, karantinaya aldığı soruyu listede görmeye devam eden bir yönetici üretir.
// ─────────────────────────────────────────────────────────────────────────────
havuzRouter.get('/sorular', async (req, res, next) => {
  try {
    const subject = req.query.subject ? String(req.query.subject) : null
    const difficulty = req.query.difficulty && ZORLUKLAR.has(String(req.query.difficulty))
      ? String(req.query.difficulty)
      : null
    const kazanimId = Number(req.query.kazanimId) || null
    const verified = req.query.verified
    const karantina = req.query.karantina
    const ara = req.query.q ? String(req.query.q).trim() : null
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25))
    const offset = Math.max(0, Number(req.query.offset) || 0)

    // ⚠️ HER ÇAĞRIDA YENİ BUILDER. PostgREST sorgu nesnesi TEK KULLANIMLIKTIR (lib/pg.ts):
    // fetchAll aynı nesneye ikinci kez .range() uygularsa sessizce bozulur. Bugün havuz
    // 241 satır olduğu için ilk sayfada bitiyor ve hata GÖRÜNMEZDİ — 1000'i geçtiği gün
    // patlardı. Filtreler bu yüzden fonksiyona sarılı.
    const kur = () => {
      let q = supabase.from('yks_ai_questions').select(SATIR_ALANLARI, { count: 'exact' })
      if (subject) q = q.eq('subject', subject)
      if (difficulty) q = q.eq('difficulty', difficulty)
      if (kazanimId) q = q.eq('kazanim_id', kazanimId)
      if (verified === 'true' || verified === 'false') q = q.eq('verified', verified === 'true')
      if (karantina === 'true' || karantina === 'false') q = q.eq('karantina', karantina === 'true')
      if (ara) q = q.ilike('question_text', `%${ara}%`)
      return q
    }

    // ── SIRALAMA ──
    // 'risk' (varsayılan): triyaj kuyruğu — en riskli önce. Risk skoru ampirik veriye
    // bağlı olduğu için SAYFALAMADAN ÖNCE hesaplanmalı; bu yüzden filtreye uyan TÜM
    // satırlar çekilip bellekte sıralanır. Havuz 241 satır (ölçüldü) — bu ölçekte
    // maliyeti yok. Havuz on binlere çıkarsa skorun materialized view'a taşınması gerekir.
    // 'yeni': eski davranış (created_at desc) — kronolojik gözden geçirme için korunur.
    const sirala = req.query.sirala === 'yeni' ? 'yeni' : 'risk'

    let satirlar: Array<Record<string, unknown>>
    let total: number
    let ampirik: Map<string, { n: number; dogruOrani: number | null }>

    const { count: karantinaToplam } = await supabase
      .from('yks_ai_questions')
      .select('id', { count: 'exact', head: true })
      .eq('karantina', true)

    if (sirala === 'risk') {
      const tumSatirlar = await fetchAll<Record<string, unknown>>(kur)
      ampirik = await ampirikIstatistik(tumSatirlar.map((r) => String(r.id)))
      const skorlu = tumSatirlar
        .map((r) => ({ r, skor: riskSkoru(r, ampirik.get(String(r.id))) }))
        // Eşit riskte yeni soru önce: aynı skorda kronoloji anlamlı ikincil ölçüt.
        .sort((a, b) => b.skor - a.skor || String(b.r.created_at).localeCompare(String(a.r.created_at)))
      total = skorlu.length
      satirlar = skorlu.slice(offset, offset + limit).map((x) => x.r)
    } else {
      // ⚠️ `count` AYNI YANITTAN alınır. Ayrı bir sayım sorgusu FİLTRELERİ kaybeder ve
      // sayfalama "1-25 / 241" derken listede 3 satır gösterirdi (filtreli toplam 3 iken).
      const { data, count, error } = await kur()
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)
      if (error) throw new HttpHatasi(500, 'sorular_okunamadi', 'Sorular okunamadı.')
      satirlar = (data ?? []) as Array<Record<string, unknown>>
      total = count ?? satirlar.length
      ampirik = await ampirikIstatistik(satirlar.map((r) => String(r.id)))
    }

    const adlar = await kazanimAdlari(satirlar.map((r) => (r.kazanim_id != null ? Number(r.kazanim_id) : null)))

    const yanit: AdminSorularYaniti = {
      sorular: satirlar.map((r) => {
        const a = ampirik.get(String(r.id))
        return {
          ...satiraCevir(r, adlar),
          cozulme: a?.n ?? 0,
          dogruOrani: a?.dogruOrani ?? null,
          risk: riskSkoru(r, a),
        }
      }),
      total,
      limit,
      offset,
      karantinaToplam: karantinaToplam ?? 0,
      sirala,
    }
    res.json(yanit)
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /admin/havuz/soru/:id — tam gövde + sağlık + özgünlük komşusu
//
// ⚠️ SAĞLIK ÖLÇÜMÜ ÜRETİM HATTININ AYNI FONKSİYONLARIYLA YAPILIR (shufflers.ts,
// soru-saglik.ts, benzerlik.ts). Panelde ikinci bir "kalite kanısı" hesaplamak,
// iki ölçünün zamanla ayrışması ve hangisinin doğru olduğunun bilinememesi demekti.
// ─────────────────────────────────────────────────────────────────────────────
havuzRouter.get('/soru/:id', validateParams(IdParam), async (req, res, next) => {
  try {
    const id = String(req.params.id)
    const s = await soruOku(id)
    const subject = String(s.subject)
    const metin = String(s.question_text ?? '')
    const siklar = (s.options ?? {}) as Record<string, string>

    const sikli: SikliSoru = {
      siklar: siklar as SikliSoru['siklar'],
      dogru: String(s.correct_option ?? ''),
      cozum: (s.solution as string | null) ?? undefined,
    }

    // ── Özgünlük: aynı dersteki en yakın komşu ──
    // Yalnız gövdeler çekilir (şık/çözüm değil): benzerlik ölçüsü kök metnindedir.
    const komsular = await fetchAll<{ id: string; question_text: string }>(() =>
      supabase
        .from('yks_ai_questions')
        .select('id, question_text')
        .eq('subject', subject)
        .neq('id', id),
    )
    const kendi = shingleKumesi(metin)
    let enYakin: number | null = null
    let enYakinId: string | null = null
    for (const k of komsular) {
      const skor = kumeBenzerligi(kendi, shingleKumesi(k.question_text ?? ''))
      if (enYakin === null || skor > enYakin) {
        enYakin = skor
        enYakinId = k.id
      }
    }
    // Eşik DB'den (0025) — 60sn önbellekli, panelden değişirse anında yansır.
    await esikleriTazele()
    const esik = ozgunlukEsigi(subject)

    const adlar = await kazanimAdlari([s.kazanim_id != null ? Number(s.kazanim_id) : null])
    // Zorluk düzeltme kararının KANITI — sezgiyle etiket değiştirmeyi bitiren sayı.
    const amp = (await ampirikIstatistik([id])).get(id)
    const { data: denetimHam } = await supabase
      .from('yonetim_denetim')
      .select('id, admin_id, eylem, hedef_id, hedef_tur, detay, created_at')
      .eq('hedef_id', id)
      .order('created_at', { ascending: false })
      .limit(20)

    const denetim: DenetimSatiri[] = []
    const idler = [...new Set(((denetimHam ?? []) as Array<{ admin_id: string }>).map((r) => r.admin_id))]
    const adminAdlari = new Map<string, string | null>()
    if (idler.length) {
      const { data } = await supabase.from('profiles').select('id, name').in('id', idler)
      for (const p of (data ?? []) as Array<{ id: string; name: string | null }>) adminAdlari.set(p.id, p.name)
    }
    for (const r of (denetimHam ?? []) as Array<Record<string, unknown>>) {
      denetim.push({
        id: Number(r.id),
        adminId: String(r.admin_id),
        adminAdi: adminAdlari.get(String(r.admin_id)) ?? null,
        eylem: r.eylem as DenetimSatiri['eylem'],
        hedefId: (r.hedef_id as string | null) ?? null,
        hedefTur: (r.hedef_tur as DenetimSatiri['hedefTur']) ?? null,
        hedefAdi: null,
        detay: (r.detay as Record<string, unknown>) ?? {},
        createdAt: String(r.created_at),
      })
    }

    const yanit: AdminSoruDetayi = {
      soru: {
        ...satiraCevir(s, adlar),
        cozulme: amp?.n ?? 0,
        dogruOrani: amp?.dogruOrani ?? null,
        risk: riskSkoru(s, amp),
        questionText: metin,
        options: siklar,
        correctOption: String(s.correct_option ?? ''),
        solution: (s.solution as string | null) ?? null,
        contentHash: (s.content_hash as string | null) ?? null,
      },
      saglik: {
        sikUzunluk: sikUzunlukSizintisi(sikli),
        celdirici: celdiriciKusatmasi(sikli),
        gorseleGonderme: varOlmayanGorseleGonderme(metin),
        gorselBagimli: gorselBagimli(metin),
      },
      ozgunluk: {
        esik,
        // Karşılaştırılacak soru yoksa null — 0 DEĞİL. "Hiç komşusu yok" ile
        // "hiç benzemiyor" aynı şey değil; 0 basmak ikincisini iddia ederdi.
        enYakin: enYakin === null ? null : Number(enYakin.toFixed(4)),
        enYakinId,
        esikAsildi: enYakin !== null && enYakin >= esik,
      },
      denetim,
    }
    res.json(yanit)
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /admin/havuz/kapsama — ders × konu × zorluk ÜRETİM AÇIĞI haritası (0026)
//
// ⚠️ ÜRETİM ÖNCELİĞİ BU EKRANDAN OKUNUR. Havuz seyrek (ölçüldü: 236 çözülebilir soru,
// 14 ders). Hangi konuya soru üretileceği "hissen" değil, boş konu sayısından belirlenir.
//
// ⚠️ `eslenmemisSoru` ETİKETLEME BORCUDUR. Kazanımı hiçbir konuya eşlenmemiş sorular
// öğrencinin konu listesinde HİÇ GÖRÜNMEZ (konu → kazanım → soru zinciri kopuk). Bu sayı
// sıfırlanmadan havuzun bir kısmı görünmez kalır; bu yüzden ayrı raporlanır, toplama
// karıştırılmaz.
// ─────────────────────────────────────────────────────────────────────────────
havuzRouter.get('/kapsama', async (_req, res, next) => {
  try {
    const [havuz, eslemeler, sorular, talepler] = await Promise.all([
      fetchAll<{
        konu_id: number; subject: string; ad: string; sinav: string; sira: number
        soru_sayisi: number; kolay: number; orta: number; zor: number
      }>(() => supabase.from('konu_havuz').select('konu_id, subject, ad, sinav, sira, soru_sayisi, kolay, orta, zor')),
      fetchAll<{ kazanim_id: number }>(() => supabase.from('kazanim_konu').select('kazanim_id')),
      fetchAll<{ kazanim_id: number | null }>(() =>
        supabase.from('yks_ai_questions').select('kazanim_id').eq('verified', true).eq('karantina', false),
      ),
      fetchAll<{ konu_id: number }>(() => supabase.from('konu_talep').select('konu_id')),
    ])

    // Talep = kaç FARKLI öğrenci o konuya girdi (0028'de PK zaten tekilleştiriyor).
    const talepSayaci = new Map<number, number>()
    for (const t of talepler) talepSayaci.set(Number(t.konu_id), (talepSayaci.get(Number(t.konu_id)) ?? 0) + 1)

    const esli = new Set(eslemeler.map((e) => Number(e.kazanim_id)))
    const eslenmemisSoru = sorular.filter((s) => s.kazanim_id == null || !esli.has(Number(s.kazanim_id))).length

    const byDers = new Map<string, KapsamaKonu[]>()
    for (const k of havuz) {
      const l = byDers.get(k.subject) ?? []
      l.push({
        konuId: Number(k.konu_id),
        ad: k.ad,
        sinav: k.sinav,
        toplam: Number(k.soru_sayisi),
        kolay: Number(k.kolay),
        orta: Number(k.orta),
        zor: Number(k.zor),
        talep: talepSayaci.get(Number(k.konu_id)) ?? 0,
      })
      byDers.set(k.subject, l)
    }

    const dersler: KapsamaDersi[] = [...byDers.entries()]
      .map(([subject, konular]) => ({
        subject,
        toplam: konular.reduce((s, k) => s + k.toplam, 0),
        konuSayisi: konular.length,
        bosKonu: konular.filter((k) => k.toplam === 0).length,
        // Bu liste bir İŞ KUYRUĞU, envanter dökümü değil: önce TALEBİ ÇOK ama sorusu AZ
        // olanlar. Yalnız boşluğa göre sıralamak, kimsenin girmediği bir konuyu 12 kişinin
        // beklediği konunun önüne koyardı.
        konular: konular.sort(
          (a, b) => b.talep - a.talep || a.toplam - b.toplam || a.ad.localeCompare(b.ad, 'tr'),
        ),
      }))
      // Açığı en büyük ders önce.
      .sort((a, b) => b.bosKonu - a.bosKonu || a.toplam - b.toplam)

    const yanit: KapsamaYaniti = {
      dersler,
      toplamSoru: dersler.reduce((s, d) => s + d.toplam, 0),
      toplamKonu: dersler.reduce((s, d) => s + d.konuSayisi, 0),
      bosKonu: dersler.reduce((s, d) => s + d.bosKonu, 0),
      eslenmemisSoru,
    }
    res.json(yanit)
  } catch (err) {
    next(err)
  }
})

/** Müdahale yanıtı — üç uç da aynı gövdeyi döner (istemci tek şekil bilir). */
function mudahaleYaniti(s: Record<string, unknown>, denetimYazildi: boolean): SoruMudahaleYanit {
  return {
    id: String(s.id),
    verified: s.verified === true,
    karantina: s.karantina === true,
    difficulty: (s.difficulty as string | null) ?? null,
    kazanimId: s.kazanim_id != null ? Number(s.kazanim_id) : null,
    denetimYazildi,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /admin/havuz/soru/:id/dogrulama — body: { verified: boolean, neden?: string }
//
// Doğrulamayı GERİ ALMAK, soruyu servis dışı bırakır (test-modes/odev-derle yalnız
// verified=true okur). Geri vermek de mümkün: hattın yanlış elediği bir soru elle
// havuza alınabilir.
// ─────────────────────────────────────────────────────────────────────────────
havuzRouter.post('/soru/:id/dogrulama', validateParams(IdParam), async (req, res, next) => {
  try {
    const adminId = req.userId!
    const id = String(req.params.id)
    const b = (req.body ?? {}) as { verified?: unknown; neden?: unknown }
    if (typeof b.verified !== 'boolean') {
      throw gecersizIstek('gecersiz_dogrulama', '`verified` alanı true/false olmalı.')
    }
    const neden = typeof b.neden === 'string' && b.neden.trim() ? b.neden.trim().slice(0, 500) : null

    const s = await soruOku(id)
    if ((s.verified === true) === b.verified) {
      throw gecersizIstek('degisiklik_yok', b.verified ? 'Soru zaten doğrulanmış.' : 'Soru zaten doğrulanmamış.')
    }

    const { error } = await supabase.from('yks_ai_questions').update({ verified: b.verified }).eq('id', id)
    if (error) throw new HttpHatasi(500, 'dogrulama_yazilamadi', 'Doğrulama durumu güncellenemedi.')
    await onbellegiDus()

    const denetimYazildi = await denetimYaz({
      adminId, eylem: 'soru_dogrulama', hedefId: id, hedefTur: 'soru',
      detay: { onceki: s.verified === true, yeni: b.verified, neden, subject: s.subject },
    })

    res.json(mudahaleYaniti({ ...s, verified: b.verified }, denetimYazildi))
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /admin/havuz/soru/:id/karantina — body: { karantina: boolean, neden?: string }
//
// ⚠️ `verified`DAN AYRI TUTULUR (0025). verified=false "doğrulama hattı eledi",
// karantina=true "insan düşürdü" demektir. Aynı kolona bindirmek, hattın kalite
// oranını insan müdahalesiyle kirletir ve "hattımız kötüleşti" gibi okunur.
// ─────────────────────────────────────────────────────────────────────────────
havuzRouter.post('/soru/:id/karantina', validateParams(IdParam), async (req, res, next) => {
  try {
    const adminId = req.userId!
    const id = String(req.params.id)
    const b = (req.body ?? {}) as { karantina?: unknown; neden?: unknown }
    if (typeof b.karantina !== 'boolean') {
      throw gecersizIstek('gecersiz_karantina', '`karantina` alanı true/false olmalı.')
    }
    const neden = typeof b.neden === 'string' && b.neden.trim() ? b.neden.trim().slice(0, 500) : null
    // Karantinaya alırken gerekçe ZORUNLU: "neden düştü" bilgisi, sorunun kendisi
    // kadar değerli bir sinyaldir (aynı hata deseni tekrar üretiliyorsa görülür).
    if (b.karantina && !neden) {
      throw gecersizIstek('neden_gerekli', 'Karantinaya alma gerekçesi yazılmalı.')
    }

    const s = await soruOku(id)
    if ((s.karantina === true) === b.karantina) {
      throw gecersizIstek('degisiklik_yok', b.karantina ? 'Soru zaten karantinada.' : 'Soru zaten karantinada değil.')
    }

    const { error } = await supabase
      .from('yks_ai_questions')
      .update({
        karantina: b.karantina,
        karantina_neden: b.karantina ? neden : null,
        karantina_at: b.karantina ? new Date().toISOString() : null,
      })
      .eq('id', id)
    if (error) throw new HttpHatasi(500, 'karantina_yazilamadi', 'Karantina durumu güncellenemedi.')
    await onbellegiDus()

    const denetimYazildi = await denetimYaz({
      adminId, eylem: 'soru_karantina', hedefId: id, hedefTur: 'soru',
      detay: { karantina: b.karantina, neden, subject: s.subject, kazanimId: s.kazanim_id ?? null },
    })

    res.json(mudahaleYaniti({ ...s, karantina: b.karantina }, denetimYazildi))
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /admin/havuz/soru/:id — YALNIZ etiket düzeltme (difficulty · kazanim_id)
//
// Yanlış etiketlenmiş soru havuzda ölü stoktur: kazanımı null olan soru hiçbir
// konu listesine giremez, zorluğu yanlış olan soru yanlış öğrenciye gider. İkisi de
// metne dokunmadan düzeltilebilir — bu yüzden burada, gövde düzenleme ise YOK.
// ─────────────────────────────────────────────────────────────────────────────
havuzRouter.patch('/soru/:id', validateParams(IdParam), async (req, res, next) => {
  try {
    const adminId = req.userId!
    const id = String(req.params.id)
    const b = (req.body ?? {}) as Record<string, unknown>
    const s = await soruOku(id)

    const yama: Record<string, unknown> = {}
    const degisenler: Record<string, { onceki: unknown; yeni: unknown }> = {}

    if ('difficulty' in b) {
      const yeni = b.difficulty === null ? null : String(b.difficulty)
      if (yeni !== null && !ZORLUKLAR.has(yeni)) {
        throw gecersizIstek('gecersiz_zorluk', 'Zorluk kolay, orta ya da zor olmalı.')
      }
      const onceki = (s.difficulty as string | null) ?? null
      if (onceki !== yeni) {
        yama.difficulty = yeni
        degisenler.difficulty = { onceki, yeni }
      }
    }

    if ('kazanimId' in b) {
      const yeni = b.kazanimId === null ? null : Number(b.kazanimId)
      if (yeni !== null && !Number.isInteger(yeni)) {
        throw gecersizIstek('gecersiz_kazanim', '`kazanimId` tam sayı ya da null olmalı.')
      }
      // Var olmayan kazanıma bağlamak, soruyu görünmez bir rafa koymaktır.
      if (yeni !== null && !(await resolveKazanim(yeni))) {
        throw bulunamadi('kazanim_bulunamadi', 'Kazanım bulunamadı.')
      }
      const onceki = s.kazanim_id != null ? Number(s.kazanim_id) : null
      if (onceki !== yeni) {
        yama.kazanim_id = yeni
        degisenler.kazanimId = { onceki, yeni }
      }
    }

    if (!Object.keys(yama).length) {
      throw gecersizIstek('degisiklik_yok', 'Düzeltilecek bir alan yok.')
    }

    const { error } = await supabase.from('yks_ai_questions').update(yama).eq('id', id)
    if (error) throw new HttpHatasi(500, 'etiket_yazilamadi', 'Etiket güncellenemedi.')
    await onbellegiDus()

    const denetimYazildi = await denetimYaz({
      adminId, eylem: 'soru_etiket', hedefId: id, hedefTur: 'soru',
      detay: { degisenler, subject: s.subject },
    })

    res.json(mudahaleYaniti({ ...s, ...yama }, denetimYazildi))
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /admin/uretim — body: { kazanimId, difficulty?, adet? }
//
// ⚠️ MEVCUT GÜVENLİ YOL KULLANILIR: `forge_topup` görevi (agents/ritim.ts). Orada
// istemci YALNIZ "hangi kazanım" der; ders/konu/başlık curriculum_nodes'tan türetilir
// ve tek görevde üretim tavanı 10'dur. Yeni bir üretim yolu açmak, ritim.ts:53'te
// uzun uzun anlatılan prompt-enjeksiyonu ve havuz-zehirlenmesi kapılarını yeniden
// yazmak olurdu.
//
// SENKRON ÜRETİM YOK: doğrulanmış set üretimi dakikalar sürer. Uç görevi kuyruğa
// atar, `taskId` döner; ilerleme Yönetim ekranındaki görev tablosundan izlenir.
// ─────────────────────────────────────────────────────────────────────────────
havuzRouter.post('/uretim', async (req, res, next) => {
  try {
    const adminId = req.userId!
    const b = (req.body ?? {}) as Record<string, unknown>
    const kazanimId = Number(b.kazanimId)
    if (!Number.isInteger(kazanimId)) {
      throw gecersizIstek('gecersiz_kazanim', '`kazanimId` tam sayı olmalı.')
    }
    const node = await resolveKazanim(kazanimId)
    if (!node) throw bulunamadi('kazanim_bulunamadi', 'Kazanım bulunamadı.')

    const difficulty = b.difficulty && ZORLUKLAR.has(String(b.difficulty)) ? String(b.difficulty) : null
    // Tavan ritim.ts'te de var (MAX_TOPUP); burada da sınırlamak, panelden gelen
    // kazara büyük siparişin faturaya dönüşmeden kesilmesini sağlar.
    const adet = Math.min(10, Math.max(1, Number(b.adet) || 5))

    const task = await enqueueTask({
      userId: adminId,
      kind: 'forge_topup',
      payload: { kazanimId, ...(difficulty ? { difficulty } : {}), count: adet },
    })

    const denetimYazildi = await denetimYaz({
      adminId, eylem: 'uretim_tetik', hedefId: null, hedefTur: 'sistem',
      detay: { taskId: task.id, kazanimId, kazanimBaslik: node.title, difficulty, adet },
    })

    const yanit: UretimTetikYanit = {
      taskId: task.id,
      kazanimId,
      kazanimBaslik: node.title,
      difficulty,
      adet,
      denetimYazildi,
    }
    res.status(202).json(yanit)
  } catch (err) {
    next(err)
  }
})
