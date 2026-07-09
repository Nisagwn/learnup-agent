import React, { useEffect, useState } from 'react';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { currentUid } from '../../services/authApi';
import { fetchStudentsAtRisk } from '../../services/studentAnalyticsApi';

// "Dikkat Gereken Öğrenciler" — eşikli (minAnswered) ilk 3 riskli öğrenci.
export default function AtRiskCard({ students = [], openStudentDetail }) {
  const [rows, setRows] = useState(null); // null = yükleniyor

  useEffect(() => {
    const uid = currentUid();
    if (!uid) return;
    let cancelled = false;
    fetchStudentsAtRisk(uid, 3, 10)
      .then((r) => { if (!cancelled) setRows(r); })
      .catch(() => { if (!cancelled) setRows([]); });
    return () => { cancelled = true; };
  }, []);

  const open = (row) => {
    const full = students.find((s) => s.id === row.studentId) || { id: row.studentId, name: row.name, email: row.email };
    openStudentDetail?.(full);
  };

  return (
    <div className="ds-card mb-6">
      <h2 className="section-title flex items-center gap-2 mb-1">
        <AlertTriangle size={20} className="text-danger" /> Dikkat Gereken Öğrenciler
      </h2>
      <p className="text-xs text-slate-400 mb-4">Son 30 günde en az 10 soru çözmüş, başarı oranı en düşük öğrenciler.</p>

      {rows === null ? (
        <div className="text-sm text-slate-500">Hesaplanıyor…</div>
      ) : rows.length === 0 ? (
        <div className="text-center p-5 text-slate-500 border border-dashed border-white/10 rounded-xl text-sm">
          Yeterli veriyle risk altında öğrenci yok. 🎉
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((r) => (
            <button
              key={r.studentId}
              type="button"
              onClick={() => open(r)}
              className="flex items-center gap-3 p-3 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl text-left transition"
            >
              <div className="w-9 h-9 rounded-full bg-red-500/15 text-red-300 flex items-center justify-center font-bold flex-shrink-0">
                {(r.name || r.email || '?')[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-100 truncate">{r.name || r.email}</div>
                <div className="text-xs text-slate-400">{r.wrongCount} yanlış · {r.totalAnswered} cevap</div>
              </div>
              <span className={`text-lg font-extrabold ${r.successRate < 40 ? 'text-red-400' : r.successRate < 70 ? 'text-amber-400' : 'text-emerald-400'}`}>%{r.successRate}</span>
              <ChevronRight size={16} className="text-slate-500 flex-shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
