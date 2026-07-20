/**
 * autoWrapLatex — veritabanındaki soruların LaTeX'i çeşitli biçimlerde geliyor:
 * çıplak (\frac..), \(...\), \[...\]. react-markdown + remark-math yalnız $...$ / $$...$$
 * tanır. Bu yardımcı hepsini $ biçimine sarar ki matematik doğru render edilsin.
 */
export function autoWrapLatex(input) {
  if (!input || typeof input !== 'string') return input ?? ''
  let s = input
  // Zaten $ ile sarılıysa dokunma (kabaca): $ içeren metni olduğu gibi bırak.
  s = s.replace(/\\\[([\s\S]+?)\\\]/g, (_m, body) => `$$${body}$$`)
  s = s.replace(/\\\(([\s\S]+?)\\\)/g, (_m, body) => `$${body}$`)
  return s
}
