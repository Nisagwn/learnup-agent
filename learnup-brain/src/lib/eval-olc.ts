import { supabase } from '../clients/supabase.js'
import { fetchAll } from './pg.js'
import { logger } from '../utils/logger.js'
import { celdiriciKusatmasi, sikUzunlukSizintisi, type SikliSoru } from '../utils/shufflers.js'
import { varOlmayanGorseleGonderme, gorselBagimli } from '../utils/soru-saglik.js'
import { shingleKumesi, kumeBenzerligi, ozgunlukEsigi } from '../utils/benzerlik.js'
import { esikleriTazele } from './ozgunluk-esik.js'
import type { EvalAnlik } from '../types/panel.js'

/**
 * EVAL ÖLÇÜM ÇEKİRDEĞİ — panelin okuduğu anlığı üretir (0025).
 *
 * ⚠️ BU, `scripts/eval.ts`İN YERİNE GEÇMEZ. O script tam teşhis raporudur (ders bazlı
 * tablolar, ön-kapı taban oranları, altın set, drift/baseline işaretleme, konsol çıktısı)
 * ve öyle kalır. Burada YALNIZ `EvalAnlik` sözleşmesinin alanları hesaplanır — panelin
 * çizdiği, trendini tuttuğu ve "bayat mı" diye sorduğu sayılar.
 *
 * ⚠️ AYNI KAPI FONKSİYONLARI KULLANILIR (shufflers.ts · soru-saglik.ts · benzerlik.ts).
 * İkinci bir ölçüm mantığı yazmak, script ile panelin zamanla ayrışması ve hangisinin
 * doğru olduğunun bilinememesi demekti. Ölçütler tek kaynaktan gelir → sayılar uyuşur.
 *
 * ⚠️ GÖRSEL ÖLÇÜSÜ TARAF BAŞINA FARKLI (eval.ts:273 ile aynı gerekçe): PDF kaynaklı
 * çıkmışlarda kayıp-şekil deseni (`gorselBagimli`), AI tarafında var-olmayan-görsele-
 * gönderme dar deseni (`varOlmayanGorseleGonderme`). Tek desen kullanmak AI'ın meşru
 * "grafiği x eksenini keser" cümlelerini bozukluk sayardı.
 */

type Satir = {
  question_text: string
  options: Record<string, string>
  correct_option: string
  subject: string
}

/** Aynı-ders en yakın komşu (NN) benzerlikleri — ders → [her sorunun NN skoru]. */
function nnHesapla(satirlar: Satir[]): Map<string, number[]> {
  const gruplar = new Map<string, Array<Set<string>>>()
  for (const r of satirlar) {
    const g = gruplar.get(r.subject) ?? []
    g.push(shingleKumesi(r.question_text ?? ''))
    gruplar.set(r.subject, g)
  }
  const nn = new Map<string, number[]>()
  for (const [ders, g] of gruplar) {
    const dizi: number[] = []
    for (let i = 0; i < g.length; i++) {
      let en = 0
      for (let j = 0; j < g.length; j++) {
        if (i === j) continue
        const s = kumeBenzerligi(g[i], g[j])
        if (s > en) en = s
      }
      dizi.push(en)
    }
    nn.set(ders, dizi)
  }
  return nn
}

const yuzdelik = (dizi: number[], p: number): number =>
  dizi.length ? [...dizi].sort((a, b) => a - b)[Math.min(dizi.length - 1, Math.floor((dizi.length - 1) * p))] : 0

/**
 * Ölçümü koşar ve anlığı döner. LLM ÇAĞIRMAZ — saf DB + deterministik kapılar.
 *
 * ⚠️ ORAN PAYDASI "ÖLÇÜLEBİLEN"DİR, "HEPSİ" DEĞİL. `sikUzunlukSizintisi` ve
 * `celdiriciKusatmasi` metinsel şıklarda `null` döner (kural uygulanmaz). Onları
 * paydaya katmak, ölçülmemiş soruları "temiz" sayarak oranı yapay olarak düşürürdü.
 */
export async function evalOlc(): Promise<EvalAnlik> {
  // Eşikler DB'den: ölçüm yürürlükteki eşiği kullanmalı, koddaki tarihî değeri değil.
  await esikleriTazele(true)

  const [osym, ai] = await Promise.all([
    fetchAll<Satir>(() =>
      supabase
        .from('yks_questions')
        .select('question_text, options, correct_option, subject')
        .eq('source_type', 'osym_cikmis')
        .eq('verified', true),
    ),
    fetchAll<Satir>(() =>
      supabase
        .from('yks_ai_questions')
        .select('question_text, options, correct_option, subject')
        .eq('verified', true)
        // Karantinadaki soru havuzda DEĞİLDİR (0025); ölçüme katmak, düşürülmüş bir
        // soruyu hâlâ servis ediliyormuş gibi puanlamak olurdu.
        .eq('karantina', false),
    ),
  ])

  let sizinti = 0
  let sizintiOlculen = 0
  let kusatmaIhlal = 0
  let kusatmaOlculen = 0
  let gorsel = 0

  for (const r of ai) {
    const t = r.question_text ?? ''
    if (varOlmayanGorseleGonderme(t)) gorsel++
    const q: SikliSoru = { siklar: r.options as SikliSoru['siklar'], dogru: r.correct_option, cozum: '' }
    const siz = sikUzunlukSizintisi(q)
    if (siz !== null) {
      sizintiOlculen++
      if (siz === 'sizinti') sizinti++
    }
    const kus = celdiriciKusatmasi(q)
    if (kus !== null) {
      kusatmaOlculen++
      if (kus === 'tek-yanda') kusatmaIhlal++
    }
  }

  const nnA = nnHesapla(ai)
  let nnKopya = 0
  for (const [ders, skorlar] of nnA) {
    const esik = ozgunlukEsigi(ders)
    nnKopya += skorlar.filter((x) => x >= esik).length
  }
  const tumNN = [...nnA.values()].flat()

  return {
    tarih: new Date().toISOString(),
    ai: {
      n: ai.length,
      // n=0 iken oran YOK — 0 basmak "hiç sızıntı yok" diye okunurdu (ölçüm yapılmadı).
      sizintiOrani: sizintiOlculen ? Number((sizinti / sizintiOlculen).toFixed(4)) : null,
      kusatmaIhlalOrani: kusatmaOlculen ? Number((kusatmaIhlal / kusatmaOlculen).toFixed(4)) : null,
      gorselGonderme: ai.length ? gorsel : null,
      nnKopya: ai.length ? nnKopya : null,
      nnP90: tumNN.length ? Number(yuzdelik(tumNN, 0.9).toFixed(4)) : null,
    },
    osym: { n: osym.length },
  }
}

/**
 * Ölçümü koşar ve `eval_anliklari` tablosuna yazar (0025).
 *
 * ⚠️ NEDEN DB, DOSYA DEĞİL: eski anlıklar `eval-sonuclari/*.json` dosyalarındaydı ve o
 * dizin Docker volume DEĞİL — brain imajı kaynağı COPY ettiği için her `up --build`
 * ölçüm geçmişini siliyordu. Panelden tetiklenen bir ölçümün sonucu kalıcı olmak zorunda.
 */
export async function evalKosVeYaz(
  kaynak: 'panel' | 'cli',
  tetikleyen: string | null,
): Promise<EvalAnlik> {
  const anlik = await evalOlc()
  const { error } = await supabase.from('eval_anliklari').insert({
    tarih: anlik.tarih,
    ai: anlik.ai,
    osym: anlik.osym,
    kaynak,
    tetikleyen,
  })
  // Yazım başarısız olsa da ÖLÇÜM DEĞERLİDİR: çağıran sonucu görür, kayıt kaybı loglanır.
  if (error) logger.error({ err: error }, 'eval anlığı yazılamadı')
  return anlik
}
