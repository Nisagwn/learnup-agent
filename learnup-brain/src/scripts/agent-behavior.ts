/**
 * AJAN DAVRANIŞ TESTİ — mekanik değil, DAVRANIŞ.
 *
 * Geçici bir test öğrencisi kurar, HAVUZDAKİ GERÇEK sorulara cevap verdirir (uydurma soru YOK),
 * ve ajanların gerçekten tepki verip vermediğini izler:
 *
 *   ATLAS  → aynı kazanımda aynı çeldiriciye 2. kez düşünce 'diagnose' görevi doğmalı,
 *            yanılgı teşhis edilip user_mastery.misconceptions'a yazılmalı + brief.
 *   KÂTİP  → markActive ile aktif kullanıcı kümesine girmeli.
 *   PUSULA → 'plan' görevi gerçek bir plan brief'i üretmeli.
 *   MASA   → student_memory.briefs'te uzmanların notları BİRİKMELİ (birbirini silmemeli).
 *
 * ÖN KOŞUL: worker çalışıyor olmalı → bun src/workers/atolye.worker.ts
 * SONUNDA: --temizle ile tüm test verisi silinir.
 */
import { supabase } from '../clients/supabase.js'
import { processAnswer } from '../lib/answers.js'
import { enqueueTask } from '../agents/bus.js'

const TEMIZLE = process.argv.includes('--temizle')
const EPOSTA = 'test-ajan@learnup.local'

// ── Test öğrencisini bul/kur ──
const { data: liste } = await supabase.auth.admin.listUsers()
let uid = liste?.users.find((u) => u.email === EPOSTA)?.id ?? null

if (TEMIZLE) {
  if (!uid) { console.log('temizlenecek test öğrencisi yok'); process.exit(0) }
  for (const t of ['user_logs', 'user_mastery', 'srs_cards', 'student_memory', 'agent_tasks', 'user_answers', 'quiz_sessions', 'league_entries'] as const) {
    const kol = t === 'user_logs' ? 'student_id' : t === 'league_entries' ? 'uid' : 'user_id'
    await supabase.from(t).delete().eq(kol, uid)
  }
  await supabase.from('profiles').delete().eq('id', uid)
  await supabase.auth.admin.deleteUser(uid)
  console.log(`✓ test öğrencisi ve tüm verisi silindi (${uid})`)
  process.exit(0)
}

if (!uid) {
  const { data: yeni, error } = await supabase.auth.admin.createUser({
    email: EPOSTA, password: 'test-' + Math.random().toString(36).slice(2), email_confirm: true,
  })
  if (error || !yeni.user) { console.error('kullanıcı kurulamadı: ' + error?.message); process.exit(1) }
  uid = yeni.user.id
}
await supabase.from('profiles').upsert({ id: uid, email: EPOSTA, name: 'Test Öğrenci', role: 'student', grade: '12' })
console.log(`Test öğrencisi: ${uid}\n`)

// ── Havuzdan GERÇEK sorular (aynı kazanım) ──
const { data: sorular } = await supabase
  .from('yks_ai_questions') // AI havuzu ayrı tablo (0013)
  .select('id, kazanim_id, subject, correct_option, options, question_text')
  .eq('verified', true)
  .limit(20)
const grup = new Map<number, typeof sorular>()
for (const q of sorular ?? []) {
  if (!grup.has(q.kazanim_id)) grup.set(q.kazanim_id, [])
  grup.get(q.kazanim_id)!.push(q)
}
const [kazanimId, qs] = [...grup.entries()].find(([, v]) => (v?.length ?? 0) >= 3) ?? []
if (!kazanimId || !qs) { console.error('aynı kazanımda ≥3 havuz sorusu yok — önce üretim çalıştır'); process.exit(1) }
console.log(`Kazanım #${kazanimId} · ${qs.length} gerçek soru\n`)

// ── ATLAS tetiği: AYNI yanlış şıkkı İKİ KEZ seç ──
// (atlas.onAnswer: aynı (kazanım, şık) 2. yanlış isabette 'diagnose' kuyruğa girer)
const yanlisSik = (dogru: string): string => (['A', 'B', 'C', 'D', 'E'].find((L) => L !== dogru))!
console.log('=== CEVAPLAR (gerçek havuz soruları) ===')
for (const [i, q] of qs.slice(0, 3).entries()) {
  const sik = i < 2 ? yanlisSik(q.correct_option) : q.correct_option // ilk 2 YANLIŞ (aynı şık), 3. DOĞRU
  const r = await processAnswer(uid, {
    questionId: q.id, subject: q.subject, kazanimId,
    selectedOption: sik, isCorrect: true,   // ← İSTEMCİ "doğru" DİYOR; sunucu doğrulamalı
    attemptNumber: 1, durationSec: 30,
  })
  console.log(`  soru${i + 1}: seçilen=${sik} (gerçek doğru=${q.correct_option}) → sunucu: ${JSON.stringify(r).slice(0, 90)}`)
}

// ── PUSULA planı ──
console.log('\n=== PUSULA ===')
const t = await enqueueTask({ userId: uid, kind: 'plan', payload: {} })
for (let i = 0; i < 60; i++) {
  const { data } = await supabase.from('agent_tasks').select('status').eq('id', t.id).single()
  if (data?.status === 'COMPLETED' || data?.status === 'FAILED') { console.log(`  plan görevi: ${data.status}`); break }
  await new Promise((r) => setTimeout(r, 2000))
}

// ── SONUÇ ──
console.log('\n=== AJANLAR NE YAPTI? ===')
const { data: gorevler } = await supabase.from('agent_tasks').select('kind, status, result').eq('user_id', uid)
for (const g of (gorevler ?? []) as Array<{ kind: string; status: string; result: unknown }>) {
  console.log(`  görev ${g.kind.padEnd(14)} ${g.status}`)
}
const { data: mastery } = await supabase.from('user_mastery').select('node_id, mastery, attempts, correct, misconceptions').eq('user_id', uid)
for (const m of (mastery ?? []) as Array<Record<string, unknown>>) {
  console.log(`  mastery kazanım#${m.node_id}: ${Number(m.mastery).toFixed(2)} · ${m.correct}/${m.attempts} doğru · yanılgı: ${JSON.stringify(m.misconceptions)}`)
}
const { data: mem } = await supabase.from('student_memory').select('briefs').eq('user_id', uid).maybeSingle()
const briefs = (mem?.briefs ?? {}) as Record<string, string>
console.log(`  masa brief'leri: ${Object.keys(briefs).join(', ') || '(hiç)'}`)
for (const [a, b] of Object.entries(briefs)) console.log(`    [${a}] ${b.replace(/\s+/g, ' ').slice(0, 100)}`)

console.log('\nTemizlemek için: bun src/scripts/agent-behavior.ts --temizle')
process.exit(0)
