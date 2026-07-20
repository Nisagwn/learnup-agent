import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, LabelList } from 'recharts'
import { useTheme } from '../lib/theme'

interface Satir { name: string; acc: number; solved: number }

/** gamification.subjects (GERÇEK solved/correct) → parlayan teal doğruluk barları. */
export function SubjectChart({ subjects }: { subjects: Record<string, { solved: number; correct: number }> }) {
  const { t } = useTheme()
  const data: Satir[] = Object.entries(subjects ?? {})
    .filter(([, s]) => (s?.solved ?? 0) > 0)
    .map(([ad, s]) => ({
      name: ad.charAt(0).toLocaleUpperCase('tr-TR') + ad.slice(1),
      acc: Math.round(((s.correct ?? 0) / s.solved) * 100),
      solved: s.solved,
    }))
    .sort((a, b) => b.solved - a.solved)
    .slice(0, 6)

  if (!data.length) return null

  return (
    <div style={{ height: data.length * 38 + 8 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 34, bottom: 0, left: 0 }} barSize={9}>
          <defs>
            <linearGradient id="accGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#0D9488" />
              <stop offset="100%" stopColor="#2DD4BF" />
            </linearGradient>
          </defs>
          <XAxis type="number" domain={[0, 100]} hide />
          <YAxis
            type="category" dataKey="name" axisLine={false} tickLine={false} width={72}
            tick={{ fill: t.inkSoft, fontSize: 11.5, fontFamily: 'Inter, sans-serif' }}
          />
          <Tooltip
            cursor={{ fill: 'rgba(20,184,166,0.06)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const p = payload[0].payload as Satir
              return (
                <div className="glass-solid rounded-lg px-3 py-2 text-xs shadow-card">
                  <div className="font-display font-semibold text-slate-700 dark:text-slate-200">{p.name}</div>
                  <div className="mt-0.5 text-teal-600 dark:text-teal-300">%{p.acc} doğruluk · {p.solved} soru</div>
                </div>
              )
            }}
          />
          <Bar
            dataKey="acc" fill="url(#accGrad)" radius={[5, 5, 5, 5]}
            background={{ fill: t.sunken, radius: 5 }}
            style={{ filter: 'drop-shadow(0 0 6px rgba(20,184,166,0.3))' }}
          >
            <LabelList
              dataKey="acc" position="right"
              formatter={(v: unknown) => `%${v}`}
              style={{ fill: t.action, fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
