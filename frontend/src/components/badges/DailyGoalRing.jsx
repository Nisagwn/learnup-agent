import React from 'react';
import { Pencil } from 'lucide-react';
import './badges.css';

// Saf SVG ilerleme halkası — bugün çözülen / günlük hedef.
export default function DailyGoalRing({ todaySolved = 0, goal = 20, onEdit, size = 132 }) {
  const stroke = 11;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = goal > 0 ? Math.min(1, todaySolved / goal) : 0;
  const reached = goal > 0 && todaySolved >= goal;

  return (
    <div className="daily-goal-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={reached ? '#10B981' : '#8B5CF6'}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <div className="daily-goal-ring__center">
        <strong>{todaySolved}<span>/{goal}</span></strong>
        <small>bugün</small>
      </div>
      {onEdit && (
        <button type="button" className="daily-goal-ring__edit" onClick={onEdit} aria-label="Günlük hedefi düzenle">
          <Pencil size={13} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
