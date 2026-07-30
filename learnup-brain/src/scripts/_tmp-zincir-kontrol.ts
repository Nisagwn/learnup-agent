/** Yazar ∩ Denetçi çakışma kontrolü — charter'ın "yazar ≠ denetçi" kuralının kod kanıtı. */
const src = await Bun.file('src/lib/model-router.ts').text()
const al = (ad: string): string[] => {
  const i = src.indexOf(`${ad}: chainFromEnv(`)
  if (i < 0) return []
  const s = src.slice(i, src.indexOf(']),', i))
  return [...s.matchAll(/^\s*'([^']+)',?/gm)].map((m) => m[1]).filter((x) => !x.startsWith('LLM_CHAIN'))
}
const gen = al('generate'), genF = al('generateFree'), rep = al('repair'), ver = al('verify')
console.log('generate    :', gen.join('  →  '))
console.log('generateFree:', genF.join('  →  '))
console.log('repair      :', rep.join('  →  '))
console.log('verify      :', ver.join('  →  '))
const yazar = new Set([...gen, ...genF])
const cakisma = ver.filter((v) => yazar.has(v))
console.log(`\nYAZAR ∩ DENETÇİ: ${cakisma.length ? '⚠️  ' + cakisma.join(', ') : 'ÇAKIŞMA YOK ✓'}`)
process.exit(0)
