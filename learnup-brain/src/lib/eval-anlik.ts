import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
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

/** En yeni anlık; hiç yoksa null. */
export function evalSonAnlik(): EvalAnlik | null {
  const son = dosyalar().at(-1)
  return son ? oku(son) : null
}

/** Eskiden yeniye, en fazla `limit` anlık. */
export function evalTrendi(limit = 30): EvalAnlik[] {
  return dosyalar()
    .slice(-limit)
    .map(oku)
    .filter((x): x is EvalAnlik => x !== null)
}

/** Toplam koşum sayısı (okunabilen dosya sayısı değil — dosya sayısı). */
export function evalKosumSayisi(): number {
  return dosyalar().length
}
