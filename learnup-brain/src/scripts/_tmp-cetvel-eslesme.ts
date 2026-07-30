/**
 * _tmp-cetvel-eslesme.ts — ADAY ücretsiz model, ultra'nın CETVELİYLE aynı ölçüyor mu? ($0)
 *
 * Ultra'nın etiketlediği sorulardan katmanlı örneklem (kolay/orta/çifte-onaylı-zor), adaya
 * AYNI istemle etiketletilir; hakemZorluguTuret ile türetilen etiket ultra'nınkiyle kıyaslanır.
 * Geçer sayılma: kolay/orta uyumu yüksek VE zor'ların çoğunu zor görüyor (zor kör noktası =
 * flash sendromu = diskalifiye). Geçen model ETIKET_MODEL ile korpusa devam edebilir.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { supabase } from '../clients/supabase.js'
import { ZORLUK_MERDIVENI, MEKANIZMALAR } from '../persona/osym.charter.js'
import { hakemZorluguTuret, type Verdict } from '../lib/generation.js'
import { jsonCoz } from '../lib/model-router.js'

const KEY = process.env.OPENROUTER_API_KEY!
const ADAYLAR = ['google/gemma-4-26b-a4b-it:free', 'tencent/hy3:free']
const KATMAN = 8 // her etiketten 8 soru

type Satir = { id: string; tarama: 1 | 2; turet: string | null }
const DOSYA = fileURLToPath(new URL('../../data/etiketler-cikmis.jsonl', import.meta.url))
const t1 = new Map<string, Satir>()
const t2 = new Map<string, Satir>()
for (const ham of readFileSync(DOSYA, 'utf8').split('\n')) {
  if (!ham.trim()) continue
  try { const s = JSON.parse(ham) as Satir; (s.tarama === 1 ? t1 : t2).set(s.id, s) } catch { /* yarım satır */ }
}
// Nihai ultra etiketi: zor yalnız çifte onaylıysa; kolay/orta 1. taramadan
const nihai = new Map<string, string>()
for (const [id, r] of t1) {
  if (r.turet === 'zor') { if (t2.get(id)?.turet === 'zor') nihai.set(id, 'zor') }
  else if (r.turet) nihai.set(id, r.turet)
}
const sec = (etiket: string): string[] =>
  [...nihai.entries()].filter(([, e]) => e === etiket).map(([id]) => id)
    .sort((a, b) => a.localeCompare(b)).filter((_, i) => i % 7 === 0).slice(0, KATMAN)
const ornekIds = [...sec('kolay'), ...sec('orta'), ...sec('zor')]

const { data } = await supabase.from('yks_questions')
  .select('id, subject, question_text, options').in('id', ornekIds)
const sorular = data ?? []
console.log(`örneklem: ${sorular.length} soru (hedef ${KATMAN}×3 katman)\n`)

const istem = (q: { question_text: string; options: Record<string, string> | null }): string => {
  const siklar = Object.entries(q.options ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}) ${v}`).join('\n')
  return (
    `SORU (gerçek bir ÖSYM çıkmış sorusu — görevin ZORLUĞUNU ETİKETLEMEK):\n${q.question_text}\n${siklar}\n\n` +
    `MEKANİZMA TARAMASI: Şu beş yapıdan hangileri bu soruda GERÇEKTEN var?\n${MEKANIZMALAR.join(' | ')}\n` +
    `Her bulduğun için TEK CÜMLE SOMUT kanıt yaz. Kanıt gösteremediğin mekanizmayı LİSTELEME;\n` +
    `hiçbiri yoksa boş dizi döndür. Ad, listedeki yazımla BİREBİR aynı olsun.\n` +
    `Sonra sorunun YAPISINI ZORLUK MERDİVENİ'ne vur.\n` +
    `Şu şemada JSON döndür: {"mechanisms":[{"ad":"...","kanit":"..."}],"etiket":"kolay|orta|zor"}`
  )
}

for (const model of ADAYLAR) {
  let uyum = 0, zorGordu = 0, zorToplam = 0, olu = 0
  const karisiklik: Record<string, Record<string, number>> = {}
  for (const q of sorular) {
    const ultra = nihai.get(q.id as string)!
    let aday: string | null = null
    for (let d = 1; d <= 3 && !aday; d++) {
      try {
        const ctrl = new AbortController(); const z = setTimeout(() => ctrl.abort(), 120_000)
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST', signal: ctrl.signal,
          headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model, max_tokens: 4000, temperature: 0, response_format: { type: 'json_object' },
            messages: [{ role: 'system', content: ZORLUK_MERDIVENI }, { role: 'user', content: istem(q as never) }],
          }),
        })
        clearTimeout(z)
        const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
        const v = jsonCoz<{ mechanisms?: Array<{ ad: string; kanit: string }>; etiket?: string }>(j.choices?.[0]?.message?.content)
        if (v && ['kolay', 'orta', 'zor'].includes(String(v.etiket)))
          aday = hakemZorluguTuret({ mechanisms: v.mechanisms ?? [], actualDifficulty: v.etiket } as Verdict)
      } catch { /* tekrar */ }
      if (!aday && d < 3) await new Promise((r) => setTimeout(r, 4000))
    }
    if (!aday) { olu++; continue }
    karisiklik[ultra] = karisiklik[ultra] ?? {}
    karisiklik[ultra][aday] = (karisiklik[ultra][aday] ?? 0) + 1
    if (aday === ultra) uyum++
    if (ultra === 'zor') { zorToplam++; if (aday === 'zor') zorGordu++ }
  }
  const n = sorular.length - olu
  console.log(`── ${model}`)
  console.log(`   uyum: ${uyum}/${n} (%${n ? Math.round((100 * uyum) / n) : 0}) · ZOR görme: ${zorGordu}/${zorToplam} · ölü çağrı: ${olu}`)
  for (const [u, satir] of Object.entries(karisiklik))
    console.log(`   ultra=${u.padEnd(5)} → aday: ${Object.entries(satir).map(([k, c]) => `${k}=${c}`).join(' ')}`)
}
