import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { logger } from '../utils/logger.js'
import type { EvalAnlik } from '../types/panel.js'

/**
 * EVAL ANLIKLARI — `eval-sonuclari/<ISO>.json` dosyaları.
 *
 * ⚠️ Bu dosyalar HAVUZA GİRMİŞ soruları ölçer (yapısal-eval). Üretim hattının
 * HUNİSİNİ (kaç aday üretildi, hangi kapı kaçını eledi) GÖSTEREMEZ — elenen aday
 * hiçbir yere yazılmıyor. O ölçüm ayrı bir telemetri tablosu ister; burada
 * uydurulmaz.
 *
 * ⚠️ Eval hiç koşmadıysa `null` döner — SIFIR DEĞİL. "Ölçülmedi" ile "sorun yok"
 * karıştırılırsa panel, denetlenmemiş bir hattı temiz gösterir.
 */

const DIZIN = join(import.meta.dir, '..', '..', 'eval-sonuclari')

type HamAnlik = {
  tarih?: string
  ai?: Record<string, unknown>
  osym?: Record<string, unknown>
}

const say = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

function oku(dosya: string): EvalAnlik | null {
  try {
    const j = JSON.parse(readFileSync(join(DIZIN, dosya), 'utf8')) as HamAnlik
    if (!j?.tarih || !j.ai) return null
    return {
      tarih: j.tarih,
      ai: {
        n: say(j.ai.n) ?? 0,
        sizintiOrani: say(j.ai.sizintiOrani),
        kusatmaIhlalOrani: say(j.ai.kusatmaIhlalOrani),
        gorselGonderme: say(j.ai.gorselGonderme),
        nnKopya: say(j.ai.nnKopya),
        nnP90: say(j.ai.nnP90),
      },
      osym: { n: say(j.osym?.n) ?? 0 },
    }
  } catch {
    return null
  }
}

function dosyalar(): string[] {
  try {
    return readdirSync(DIZIN).filter((f) => f.endsWith('.json')).sort()
  } catch {
    return [] // dizin hiç yoksa: eval hiç koşmamış
  }
}

/* ── DOSYA KATMANI (eski) — yalnız yedek ─────────────────────────────────── */

/** En yeni DOSYA anlığı; hiç yoksa null. */
function dosyadanSon(): EvalAnlik | null {
  const son = dosyalar().at(-1)
  return son ? oku(son) : null
}

/** Eskiden yeniye, en fazla `limit` DOSYA anlığı. */
function dosyadanTrend(limit: number): EvalAnlik[] {
  return dosyalar()
    .slice(-limit)
    .map(oku)
    .filter((x): x is EvalAnlik => x !== null)
}

/* ── DB KATMANI (0025) — asıl kaynak ─────────────────────────────────────── */

/**
 * ⚠️ NEDEN DB ÖNCELİKLİ: yukarıdaki dosya dizini Docker'da VOLUME DEĞİL ve brain imajı
 * kaynağı COPY ediyor — her `up --build` ölçüm geçmişini siliyordu. 0025'ten sonra
 * ölçüm `eval_anliklari` tablosuna yazılır; dosyalar YALNIZ geçmiş anlıkların
 * kaybolmaması için yedek olarak okunur (imaja gömülü eski koşular).
 *
 * DB'ye ulaşılamazsa dosyaya düşülür ve bu SESSİZ DEĞİLDİR: `evalKosumSayisi` iki
 * kaynağın birleşimini sayar, panel "hiç koşmadı" ile "okuyamadım"ı karıştırmaz.
 */
type HamSatir = { tarih: string; ai: Record<string, unknown>; osym: Record<string, unknown> }

function satirdanAnlik(r: HamSatir): EvalAnlik {
  return {
    tarih: String(r.tarih),
    ai: {
      n: say(r.ai?.n) ?? 0,
      sizintiOrani: say(r.ai?.sizintiOrani),
      kusatmaIhlalOrani: say(r.ai?.kusatmaIhlalOrani),
      gorselGonderme: say(r.ai?.gorselGonderme),
      nnKopya: say(r.ai?.nnKopya),
      nnP90: say(r.ai?.nnP90),
    },
    osym: { n: say(r.osym?.n) ?? 0 },
  }
}

async function dbAnliklari(limit: number): Promise<EvalAnlik[] | null> {
  try {
    const { supabase } = await import('../clients/supabase.js')
    const { data, error } = await supabase
      .from('eval_anliklari')
      .select('tarih, ai, osym')
      .order('tarih', { ascending: false })
      .limit(limit)
    if (error) throw error
    // Eskiden yeniye çevir (trend grafiği bu sırayı bekler).
    return ((data ?? []) as HamSatir[]).map(satirdanAnlik).reverse()
  } catch (err) {
    logger.warn({ err }, 'eval anlıkları DB\'den okunamadı — dosya yedeğine düşülüyor')
    return null
  }
}

/** En yeni anlık (DB → dosya); hiç yoksa null. */
export async function evalSonAnlik(): Promise<EvalAnlik | null> {
  const db = await dbAnliklari(1)
  if (db?.length) return db[db.length - 1]
  return dosyadanSon()
}

/** Eskiden yeniye, en fazla `limit` anlık (DB → dosya). */
export async function evalTrendi(limit = 30): Promise<EvalAnlik[]> {
  const db = await dbAnliklari(limit)
  if (db?.length) return db
  return dosyadanTrend(limit)
}

/** Toplam koşum sayısı — DB satırları + imaja gömülü eski dosyalar. */
export async function evalKosumSayisi(): Promise<number> {
  const dosyaAdedi = dosyalar().length
  try {
    const { supabase } = await import('../clients/supabase.js')
    const { count, error } = await supabase
      .from('eval_anliklari')
      .select('tarih', { count: 'exact', head: true })
    if (error) throw error
    return (count ?? 0) + dosyaAdedi
  } catch {
    return dosyaAdedi
  }
}
