import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts';
import { TrendingUp } from 'lucide-react';
import { useUserStats } from '../../contexts/UserStatsContext';
import useChartTheme, { tooltipStyle } from '../../hooks/useChartTheme';
import EmptyState from '../ui/EmptyState';

const readCount = (item, key, fallbackKey) => item?.[key] ?? item?.[fallbackKey] ?? 0;

export default function WeeklyMiniChart() {
  const { weeklyData } = useUserStats();
  const chart = useChartTheme();

  const data = useMemo(() => (weeklyData || []).map((d) => ({
    name: d.name,
    correct: readCount(d, 'Doğru', 'DoÄŸru'),
    wrong: readCount(d, 'Yanlış', 'YanlÄ±ÅŸ'),
  })), [weeklyData]);

  const total = data.reduce((acc, d) => acc + d.correct + d.wrong, 0);

  return (
    <section className="weekly-mini ds-card-light">
      <header className="weekly-mini__head">
        <div>
          <span className="weekly-mini__kicker">Bu Hafta</span>
          <h3 className="weekly-mini__title">
            <TrendingUp size={16} aria-hidden="true" />
            Günlük Aktivite
          </h3>
        </div>
        <span className="weekly-mini__total">
          <strong>{total}</strong> soru
        </span>
      </header>

      {total === 0 ? (
        <EmptyState
          icon={TrendingUp}
          title="Henüz veri yok"
          description="Bu hafta soru çözmeye başla."
        />
      ) : (
        <div className="weekly-mini__chart">
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={data} margin={{ top: 4, right: 4, left: -28, bottom: 0 }} barCategoryGap={6}>
              <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
              <XAxis dataKey="name" stroke={chart.axis} fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke={chart.axis} fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} width={28} />
              <Tooltip contentStyle={tooltipStyle(chart)} cursor={{ fill: 'rgba(99,102,241,0.06)' }} />
              <Bar dataKey="correct" stackId="a" fill={chart.c3} radius={[6, 6, 0, 0]} name="Doğru" />
              <Bar dataKey="wrong"   stackId="a" fill={chart.c4} radius={[6, 6, 0, 0]} name="Yanlış" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
