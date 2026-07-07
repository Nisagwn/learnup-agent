import React, { useMemo } from 'react';
import { Calendar, Flame } from 'lucide-react';
import { useUserStats } from '../../contexts/UserStatsContext';

const MONTHS_TR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

function intensityLevel(count) {
  if (!count) return 0;
  if (count <= 3) return 1;
  if (count <= 7) return 2;
  if (count <= 14) return 3;
  return 4;
}

export default function StreakHeatmap() {
  const { dailyActivity = [] } = useUserStats();

  const grid = useMemo(() => {
    if (!dailyActivity.length) return { weeks: [], months: [], activeDays: 0, bestRun: 0, totalCount: 0 };

    const sorted = [...dailyActivity].sort((a, b) => a.date.localeCompare(b.date));
    const last = new Date(sorted[sorted.length - 1].date + 'T00:00:00');
    // İlk sütunun pazartesisini bul (haftayı Pzt başlat)
    const endDay = (last.getDay() + 6) % 7; // 0=Pzt, 6=Paz
    const endOfWeek = new Date(last);
    endOfWeek.setDate(last.getDate() + (6 - endDay));

    // 13 hafta = 91 gün geri sayalım
    const start = new Date(endOfWeek);
    start.setDate(endOfWeek.getDate() - (13 * 7 - 1));

    const map = new Map(sorted.map((d) => [d.date, d]));
    const weeks = [];
    let activeDays = 0;
    let totalCount = 0;
    let bestRun = 0;
    let currentRun = 0;

    for (let w = 0; w < 13; w++) {
      const days = [];
      for (let dow = 0; dow < 7; dow++) {
        const d = new Date(start);
        d.setDate(start.getDate() + w * 7 + dow);
        const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const item = map.get(iso) || { date: iso, count: 0, correct: 0 };
        days.push({ ...item, jsDate: d });
        if (item.count > 0) {
          activeDays++;
          totalCount += item.count;
          currentRun++;
          if (currentRun > bestRun) bestRun = currentRun;
        } else {
          currentRun = 0;
        }
      }
      weeks.push(days);
    }

    // Ay etiketleri — her haftanın ilk Pazartesi'sinin ayı
    const months = weeks.map((week, idx) => {
      const first = week[0].jsDate;
      if (idx === 0) return MONTHS_TR[first.getMonth()];
      const prev = weeks[idx - 1][0].jsDate;
      return first.getMonth() !== prev.getMonth() ? MONTHS_TR[first.getMonth()] : '';
    });

    return { weeks, months, activeDays, bestRun, totalCount };
  }, [dailyActivity]);

  return (
    <section className="streak-heatmap ds-card-light" aria-label="90 günlük aktivite ısı haritası">
      <header className="streak-heatmap__header">
        <div className="streak-heatmap__title">
          <Calendar size={18} aria-hidden="true" />
          <div>
            <h3>Son 90 Gün</h3>
            <span>Her kare bir gün — koyulaştıkça daha çok soru</span>
          </div>
        </div>
        <div className="streak-heatmap__summary">
          <div className="heatmap-pill heatmap-pill--active">
            <span>{grid.activeDays}</span> aktif gün
          </div>
          <div className="heatmap-pill heatmap-pill--best">
            <Flame size={14} aria-hidden="true" />
            <span>{grid.bestRun}</span> en uzun seri
          </div>
        </div>
      </header>

      <div className="streak-heatmap__chart">
        <div className="streak-heatmap__months" aria-hidden="true">
          <span className="heatmap-spacer" />
          {grid.months.map((label, i) => (
            <span key={i} className="heatmap-month-label">{label}</span>
          ))}
        </div>

        <div className="streak-heatmap__grid-wrap">
          <div className="streak-heatmap__dow" aria-hidden="true">
            <span>Pzt</span>
            <span />
            <span>Çar</span>
            <span />
            <span>Cum</span>
            <span />
            <span>Paz</span>
          </div>

          <div className="streak-heatmap__grid" role="img" aria-label={`Son 90 günde ${grid.activeDays} aktif gün, en uzun seri ${grid.bestRun} gün`}>
            {grid.weeks.map((week, wi) => (
              <div className="heatmap-col" key={wi}>
                {week.map((day, di) => {
                  const lvl = intensityLevel(day.count);
                  const acc = day.count > 0 ? Math.round((day.correct / day.count) * 100) : 0;
                  return (
                    <span
                      key={di}
                      className={`heatmap-cell heatmap-cell--lv${lvl}`}
                      title={`${day.date} · ${day.count} soru${day.count ? ` · %${acc} doğru` : ''}`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <div className="streak-heatmap__legend" aria-hidden="true">
          <span>Az</span>
          <span className="heatmap-cell heatmap-cell--lv0" />
          <span className="heatmap-cell heatmap-cell--lv1" />
          <span className="heatmap-cell heatmap-cell--lv2" />
          <span className="heatmap-cell heatmap-cell--lv3" />
          <span className="heatmap-cell heatmap-cell--lv4" />
          <span>Çok</span>
        </div>
      </div>
    </section>
  );
}
