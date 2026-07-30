/**
 * _tmp-gemini-mat.ts — Gemini'nin ZOR Matematik üretme yeteneğini DOĞRUDAN gösterir.
 * Bozuk exemplar retrieval'ı (gorselBagimli Matematik'i tümden eliyor) baypas eder:
 * charter'ın yazar system'i + ZOR sayısal tarifi + ELLE seçilmiş TEMİZ zor Matematik few-shot
 * → google:gemini-2.5-flash-lite doğrudan çağrı. Denetçi/parser YOK — ham çıktıyı gösterir.
 */
import OpenAI from 'openai'
import { supabase } from '../clients/supabase.js'
import { OSYM_YAZAR_SYSTEM, ZORLUK_TARIFI } from '../persona/osym.charter.js'
import { bozukGosterim } from '../utils/soru-saglik.js'

const key = process.env.GOOGLE_API_KEY
if (!key) { console.error('GOOGLE_API_KEY yok'); process.exit(1) }
const gemini = new OpenAI({ baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/', apiKey: key })

type Ex = { question_text: string; options: Record<string, string> | null; correct_option: string | null }
const { data } = await supabase
  .from('yks_exemplars')
  .select('question_text, options, correct_option, difficulty')
  .eq('subject', 'Matematik').eq('difficulty', 'zor').limit(400)

// TEMİZ zor örnek: kontrol karakteri yok, şekil/grafik kelimesi yok, 5 şıklı, makul uzunluk
const GORSEL = /şekil|grafi[kğ]|tablo|çizim|görsel|şema|aşağıda|yukarıda/i
const temiz = (data ?? []).filter((e: Ex) => {
  const q = e.question_text ?? ''
  const opt = e.options ?? {}
  return !bozukGosterim(q) && !GORSEL.test(q) && q.length > 120 && q.length < 700 &&
    Object.keys(opt).length === 5 && Object.values(opt).every((v) => v && !bozukGosterim(String(v)))
}) as Ex[]

const render = (e: Ex): string => {
  const o = e.options ?? {}
  const lines = [`[SORU] ${e.question_text}`]
  for (const L of ['A', 'B', 'C', 'D', 'E']) lines.push(`[${L}] ${o[L] ?? ''}`)
  lines.push(`[DOGRU] ${e.correct_option ?? 'A'}`)
  return lines.join('\n')
}
const fewshot = temiz.slice(0, 2).map(render).join('\n\n')
console.log(`temiz zor Matematik örnek: ${temiz.length} bulundu, 2'si few-shot'a kondu\n`)

const user =
  `${ZORLUK_TARIFI.sayisal.zor}\n\n` +
  `AŞAĞIDA gerçek ÖSYM'den, ZOR ve TEMİZ iki örnek var (üslup/zorluk ölçüsü; KOPYALAMA):\n\n${fewshot}\n\n` +
  `GÖREV: "MAT.9.2.3 — Doğrusal fonksiyonlarla ifade edilebilen denklem ve eşitsizlikler içeren ` +
  `problem çözebilme" kazanımına uygun, TÜRKÇE, 1 adet ZOR ÖSYM (AYT) Matematik sorusu üret. ` +
  `Girişi gizle, veriyi ört, çeldiricileri öğrencinin kendi eksik çözümünden türet. Çıktı sözleşmesine harfiyen uy.`

const t0 = performance.now()
const r = await gemini.chat.completions.create({
  model: 'gemini-2.5-flash',
  temperature: 0.6,
  max_tokens: 8000,
  messages: [{ role: 'system', content: OSYM_YAZAR_SYSTEM }, { role: 'user', content: user }],
})
const sn = ((performance.now() - t0) / 1000).toFixed(1)
console.log(`=== GEMINI HAM ÇIKTI (${sn} sn) ===\n`)
console.log(r.choices?.[0]?.message?.content ?? '(boş)')
process.exit(0)
