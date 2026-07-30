/**
 * autoWrapLatex — veritabanındaki soruların LaTeX'i çeşitli biçimlerde geliyor:
 * çıplak (\frac..), \(...\), \[...\]. react-markdown + remark-math yalnız $...$ / $$...$$
 * tanır. Bu yardımcı hepsini $ biçimine sarar ki matematik doğru render edilsin.
 */
export function autoWrapLatex(input: string | null | undefined): string {
  if (!input || typeof input !== 'string') return input ?? ''
  let s = input
  s = s.replace(/\\\[([\s\S]+?)\\\]/g, (_m, body: string) => `$$${body}$$`)
  s = s.replace(/\\\(([\s\S]+?)\\\)/g, (_m, body: string) => `$${body}$`)
  return s
}
