import { supabase } from '../clients/supabase.js'
import { fetchAll } from './pg.js'
import { effectiveMastery } from './mastery.js'

/**
 * BİLİŞSEL RÖNTGEN — tek kaynak.
 *
 * Hem öğrencinin kendi Analiz ekranı (GET /mastery/rontgen) hem öğretmenin öğrenci
 * röntgeni (GET /teacher/ogrenci/:id/rontgen) BURADAN beslenir. İki ayrı uygulama
 * yazmak, çürüme sabitlerinin (7·(1+stability)) ayrışması demekti.
 *
 * ⚠️ TEK FARK `teshisGoster`:
 *   false (öğrenci) → yalnız `openMisconceptions` SAYISI. persona/ortak.ts TESHIS_DILI_YOK:
 *                     teşhis öğrenciye METİN olarak gösterilmez.
 *   true  (öğretmen) → `misconceptions[]` taksonomi/kanıt/remediation ile açılır. Öğretmen
 *                      kuralın muhatabı değil, o teşhisin gönderildiği KOÇTUR.
 *
 * Bayrağın varlığı yapısal bir güvencedir: öğrenci ucu bu alanı yanlışlıkla sızdıramaz,
 * çünkü onu üreten kod yolu ancak bayrak açıkken çalışır.
 */

type MisconceptionKaydi = {
  status?: string
  taxonomy?: string
  selected_option?: string
  evidence?: string
  confidence?: number
  prereq_hypothesis?: string
  remediation?: unknown
  opened_at?: string
}

type SatirNode = {
  id: number
  code: string | null
  title: string
  subject: string
  path: string
}

type Satir = {
  node_id: number
  mastery: number
  stability: number
  attempts: number
  correct: number
  avg_latency_ms: number | null
  updated_at: string
  misconceptions: MisconceptionKaydi[] | null
  // PostgREST gömme: FK (user_mastery.node_id → curriculum_nodes.id) tekil ilişki döndürür.
  curriculum_nodes: SatirNode | null
}

export type RontgenNode = {
  kazanimId: number
  code: string | null
  title: string
  subject: string
  path: string
  mastery: number
  attempts: number
  correct: number
  avgLatencyMs: number | null
  updatedAt: string
  openMisconceptions: number
}

export type YanilgiAyrinti = {
  kazanimId: number
  title: string
  subject: string
  taxonomy: string | null
  selectedOption: string | null
  evidence: string | null
  confidence: number | null
  prereqHypothesis: string | null
  remediation: unknown
  openedAt: string | null
}

export type RontgenGovdesi = {
  nodes: RontgenNode[]
  total: number
  curriculum: Array<{ subject: string; total: number }>
  trend: Array<{ date: string; solved: number; correct: number; xp: number }>
  zorluk: { kolay: number; orta: number; zor: number }
  traps: Array<{
    kazanimId: number
    title: string
    subject: string
    selectedOption: string
    missCount: number
  }>
  /** YALNIZ teshisGoster:true iken doldurulur. Öğrenci yanıtında bu alan HİÇ BULUNMAZ. */
  misconceptions?: YanilgiAyrinti[]
}

/** user_mastery + curriculum_nodes ham satırları. */
async function satirlariGetir(userId: string): Promise<Satir[]> {
  // fetchAll: PostgREST 1000 satırda SESSİZCE keser (lib/pg.ts). Bir öğrencinin
  // user_mastery satırı kazanım sayısıyla (~907) sınırlı olsa da tavana yaslanmayız.
  return fetchAll<Satir>(() =>
    supabase
      .from('user_mastery')
      .select(
        'node_id, mastery, stability, attempts, correct, avg_latency_ms, updated_at, misconceptions,' +
          ' curriculum_nodes!inner(id, code, title, subject, path)',
      )
      .eq('user_id', userId)
      // ltree path sırası → frontend'de ders/ünite gruplaması deterministik.
      .order('path', { referencedTable: 'curriculum_nodes', ascending: true })
      .returns<Satir[]>(),
  )
}

function haritala(satirlar: Satir[], simdi: Date): RontgenNode[] {
  return satirlar
    .filter((s) => s.curriculum_nodes) // !inner zaten garanti eder; tip daraltma için
    .map((s) => {
      const n = s.curriculum_nodes!
      return {
        kazanimId: s.node_id,
        code: n.code,
        title: n.title,
        subject: n.subject,
        path: n.path,
        // Çürüme UYGULANMIŞ etkin değer — ham mastery ASLA dışarı sızmaz.
        mastery: Number(effectiveMastery(s.mastery, s.stability, s.updated_at, simdi).toFixed(4)),
        attempts: s.attempts,
        correct: s.correct,
        // Hız analizi: "doğru ama yavaş" yarım-kredi kuralının (lib/mastery.ts) görünür yüzü.
        avgLatencyMs: s.avg_latency_ms,
        // Paslanma rozeti: son çalışmanın yaşı istemcide bundan türetilir.
        updatedAt: s.updated_at,
        // Yalnız SAYI. Teşhis metni/taksonomi burada verilmez — açık kayıtlar
        // yalnız teshisGoster:true iken `misconceptions[]` içinde döner.
        openMisconceptions: (s.misconceptions ?? []).filter((m) => m?.status === 'open').length,
      }
    })
}

/** Açık yanılgıları koç için düzleştirir. Yalnız öğretmen yolunda çağrılır. */
function teshisleriTopla(satirlar: Satir[]): YanilgiAyrinti[] {
  const out: YanilgiAyrinti[] = []
  for (const s of satirlar) {
    const n = s.curriculum_nodes
    if (!n) continue
    for (const m of s.misconceptions ?? []) {
      if (m?.status !== 'open') continue
      out.push({
        kazanimId: s.node_id,
        title: n.title,
        subject: n.subject,
        taxonomy: m.taxonomy ?? null,
        selectedOption: m.selected_option ?? null,
        evidence: m.evidence ?? null,
        confidence: typeof m.confidence === 'number' ? m.confidence : null,
        prereqHypothesis: m.prereq_hypothesis ?? null,
        remediation: m.remediation ?? null,
        openedAt: m.opened_at ?? null,
      })
    }
  }
  // Güveni yüksek olan üste: koçun sırayla bakacağı liste bu.
  return out.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
}

/** Yalnız düğüm listesi (GET /mastery). */
export async function masteryNodes(userId: string, simdi: Date): Promise<RontgenNode[]> {
  return haritala(await satirlariGetir(userId), simdi)
}

// Gün anahtarı Europe/Istanbul'a göre — öğrencinin "bugün"ü UTC gece yarısında bölünmesin.
const gunAnahtari = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' })

type LogSatiri = {
  created_at: string
  is_correct: boolean | null
  is_skipped: boolean | null
  xp: number | null
  difficulty: string | null
}

type TuzakSatiri = { kazanim_id: number; selected_option: string; miss_count: number }

/**
 * Analiz ekranının tam veri seti: nodes + müfredat kapsaması + 84 günlük trend +
 * zorluk kırılımı + tuzak analizi (+ isteğe bağlı teşhis dökümü).
 */
export async function rontgenGovdesi(
  userId: string,
  opts: { teshisGoster?: boolean } = {},
): Promise<RontgenGovdesi> {
  const simdi = new Date()
  const seksenDortGun = new Date(+simdi - 84 * 86_400_000).toISOString()
  const otuzGun = +simdi - 30 * 86_400_000

  const [satirlar, mufredat, loglar, tuzakSonuc] = await Promise.all([
    satirlariGetir(userId),
    // Kapsama paydası: müfredattaki TÜM kazanımlar (dokunulmamışlar dahil edilemezdi —
    // user_mastery yalnız dokunulanları bilir; payda buradan gelir).
    fetchAll<{ subject: string }>(() =>
      supabase
        .from('curriculum_nodes')
        .select('subject')
        .eq('node_type', 'kazanim')
        .returns<{ subject: string }[]>(),
    ),
    fetchAll<LogSatiri>(() =>
      supabase
        .from('user_logs')
        .select('created_at, is_correct, is_skipped, xp, difficulty')
        .eq('student_id', userId)
        .gte('created_at', seksenDortGun)
        .order('created_at', { ascending: true })
        .returns<LogSatiri[]>(),
    ),
    // Tuzak analizi — IDOR önlemli RPC (yalnız service_role; 0004). Hata izole:
    // tuzak paneli düşerse röntgenin kalanı yaşar.
    supabase.rpc('distractor_traps', { p_user_id: userId, p_limit: 6 }),
  ])

  const nodes = haritala(satirlar, simdi)

  // ── Müfredat kapsaması: ders → toplam kazanım ──
  const dersToplam = new Map<string, number>()
  for (const r of mufredat) dersToplam.set(r.subject, (dersToplam.get(r.subject) ?? 0) + 1)
  const curriculum = [...dersToplam.entries()]
    .map(([subject, total]) => ({ subject, total }))
    .sort((a, b) => b.total - a.total)

  // ── Trend: gün bazında çözülen/doğru/XP (84 gün) ──
  const gunler = new Map<string, { solved: number; correct: number; xp: number }>()
  const zorluk = { kolay: 0, orta: 0, zor: 0 }
  for (const log of loglar) {
    const anahtar = gunAnahtari(log.created_at)
    const g = gunler.get(anahtar) ?? { solved: 0, correct: 0, xp: 0 }
    if (!log.is_skipped && log.is_correct !== null) {
      g.solved += 1
      if (log.is_correct) g.correct += 1
    }
    g.xp += log.xp ?? 0
    gunler.set(anahtar, g)
    // Zorluk kırılımı — yalnız son 30 gün, bilinen etiketler
    if (+new Date(log.created_at) >= otuzGun && log.difficulty && log.difficulty in zorluk) {
      zorluk[log.difficulty as keyof typeof zorluk] += 1
    }
  }
  const trend = [...gunler.entries()]
    .map(([date, g]) => ({ date, ...g }))
    .sort((a, b) => (a.date < b.date ? -1 : 1))

  // ── Tuzaklar: kazanım başlıklarıyla zenginleştir ──
  const tuzakHam = (tuzakSonuc.data ?? []) as TuzakSatiri[]
  let traps: RontgenGovdesi['traps'] = []
  if (tuzakHam.length) {
    const { data: tnodes } = await supabase
      .from('curriculum_nodes')
      .select('id, title, subject')
      .in('id', tuzakHam.map((t) => t.kazanim_id))
    const nodeById = new Map((tnodes ?? []).map((n) => [n.id as number, n]))
    traps = tuzakHam
      .map((t) => {
        const n = nodeById.get(t.kazanim_id)
        return n
          ? {
              kazanimId: t.kazanim_id,
              title: n.title as string,
              subject: n.subject as string,
              selectedOption: t.selected_option,
              missCount: Number(t.miss_count),
            }
          : null
      })
      .filter((t): t is NonNullable<typeof t> => t !== null)
  }

  const govde: RontgenGovdesi = { nodes, total: nodes.length, curriculum, trend, zorluk, traps }
  // Alanı yalnız istendiğinde EKLE — öğrenci yanıtında anahtar hiç bulunmasın.
  if (opts.teshisGoster) govde.misconceptions = teshisleriTopla(satirlar)
  return govde
}
