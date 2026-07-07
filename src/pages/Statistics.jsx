import React, { useState, useEffect, useMemo } from 'react';
import { Hexagon, Target, BarChart as BarChartIcon, PieChart as PieChartIcon, Trophy, Users, BookOpen, School } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, PieChart as RechartsPieChart, Pie, Cell, BarChart as RechartsBarChart, Bar, Legend } from 'recharts';
import { useUserStats } from '../contexts/UserStatsContext';
import { getStudentClasses, getTeacherInfo, computeClassRanking } from '../services/studentClassesApi';
import { getLevelInfo } from '../utils/levelSystem';
import { getRankStyle, rankMedal } from '../utils/rankStyle';
import useChartTheme, { tooltipStyle } from '../hooks/useChartTheme';
import { SkeletonCard } from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import Spinner from '../components/ui/Spinner';
import './Statistics.css';

export default function Statistics() {
  const { stats, masteryScores, weeklyData, monthlyData, currentUser, userProfile, loading } = useUserStats();
  const [viewMode, setViewMode] = useState('monthly');
  const [showAllRanking, setShowAllRanking] = useState(false);

  // ── Sınıf sıralaması (izole): seçilen sınıfı yerel hesapla, AKTİF sınıfı DEĞİŞTİRME ──
  const uid = currentUser?.uid;
  const activeTeacherId = userProfile?.teacherId || null;
  const joinedClasses = useMemo(() => getStudentClasses(userProfile || {}), [userProfile]);
  const [selectedTeacherId, setSelectedTeacherId] = useState(null);
  const selectedClassId = selectedTeacherId || activeTeacherId; // varsayılan = aktif sınıf
  const [teacherInfo, setTeacherInfo] = useState({}); // { teacherId: { name, branch } }
  const [ranking, setRanking] = useState({ rank: null, total: null, list: [], loading: true });

  // Sınıf etiketleri için öğretmen branş/ad bilgisi.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ids = joinedClasses.map((c) => c.teacherId).filter(Boolean);
      if (ids.length === 0) { if (!cancelled) setTeacherInfo({}); return; }
      const entries = await Promise.all(ids.map(async (tid) => [tid, await getTeacherInfo(tid)]));
      if (!cancelled) setTeacherInfo(Object.fromEntries(entries));
    })();
    return () => { cancelled = true; };
  }, [joinedClasses]);

  // Seçilen sınıfın sıralamasını yerel hesapla (aktif sınıfı değiştirmeden).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!uid || !selectedClassId) {
        if (!cancelled) setRanking({ rank: null, total: null, list: [], loading: false });
        return;
      }
      setRanking((p) => ({ ...p, loading: true }));
      const r = await computeClassRanking(uid, selectedClassId);
      if (!cancelled) setRanking({ ...r, loading: false });
    })();
    return () => { cancelled = true; };
  }, [uid, selectedClassId]);

  const classLabel = (c) => {
    const ti = teacherInfo[c.teacherId] || {};
    const base = ti.branch || ti.name || c.teacherName || 'Sınıf';
    return `${base} sınıfı`;
  };
  const selectedLabel = (() => {
    const c = joinedClasses.find((x) => x.teacherId === selectedClassId);
    return c ? classLabel(c) : null;
  })();
  const chart = useChartTheme();
  const COLORS = [chart.c3, chart.c4, chart.c5];

  const responseData = [
    { name: 'Doğru', value: stats.correctAnswers || 0 },
    { name: 'Yanlış', value: stats.wrongAnswers || 0 },
    { name: 'Boş',   value: stats.skippedAnswers || 0 },
  ];

  const subjectStats = Object.keys(masteryScores || {})
    .filter(subject => subject !== 'Diğer')
    .map(subject => ({
      name: subject,
      percent: masteryScores[subject]?.score || 0,
      solved: masteryScores[subject]?.solved_count || 0,
    }))
    .sort((a, b) => b.percent - a.percent);

  const { levelData, index, progress, toNext } = getLevelInfo(stats.correctAnswers);
  const currentLevel = index + 1;

  const rankList = ranking.list || [];
  const displayList = showAllRanking ? rankList : rankList.slice(0, 5);

  if (loading) {
    return (
      <div className="dashboard animate-fade-in pb-8" aria-busy="true">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-6">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} lines={2} />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2"><SkeletonCard lines={6} /></div>
          <SkeletonCard lines={5} />
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard animate-fade-in pb-8">

      <div className="dashboard-header flex justify-between items-center">
        <div>
          <h1 className="page-title">İstatistikler</h1>
          <p className="page-subtitle">Gerçek zamanlı başarı, ustalık ve aktivite verileri.</p>
        </div>
      </div>

      {/* Üst kartlar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-6">
        <div className="ds-card flex items-center gap-4 p-4">
          <div className="w-11 h-11 rounded-xl bg-[#4D7C0F]/10 flex items-center justify-center text-[#4D7C0F] border border-[#4D7C0F]/20">
            <Hexagon size={22} />
          </div>
          <div>
            <div className="text-2xl font-bold text-white">{stats.totalSolved}</div>
            <div className="text-[11px] text-slate-400 uppercase tracking-wider">Toplam Çözülen</div>
          </div>
        </div>

        <div className="ds-card flex items-center gap-4 p-4">
          <div className="w-11 h-11 rounded-xl bg-[#06b6d4]/10 flex items-center justify-center text-[#06b6d4] border border-[#06b6d4]/20">
            <Target size={22} />
          </div>
          <div>
            <div className="text-2xl font-bold text-white">{typeof stats.net === 'number' ? stats.net.toFixed(1) : '0.0'}</div>
            <div className="text-[11px] text-slate-400 uppercase tracking-wider">Net Sayısı</div>
          </div>
        </div>

        <div className="ds-card flex items-center gap-4 p-4">
          <div className="w-11 h-11 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 border border-emerald-500/20">
            <BarChartIcon size={22} />
          </div>
          <div>
            <div className="text-2xl font-bold text-white">%{stats.successRate}</div>
            <div className="text-[11px] text-slate-400 uppercase tracking-wider">Genel Başarı</div>
          </div>
        </div>

        <div className="ds-card flex items-center gap-4 p-4">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center text-xl border"
            style={{ background: `${levelData.color}18`, borderColor: `${levelData.color}40` }}>
            {levelData.emoji}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="text-2xl font-bold text-white">{currentLevel}</div>
            <div className="text-[11px] uppercase tracking-wider" style={{ color: levelData.barColor }}>
              {levelData.name}
            </div>
            <div className="w-full h-1 bg-slate-700 rounded-full overflow-hidden mt-1">
              <div className="h-full rounded-full" style={{ width: `${progress}%`, background: levelData.barColor }} />
            </div>
          </div>
        </div>
      </div>

      {/* Çalışma Serisi */}
      <div className="mb-6">
        <div className="ds-card p-4 flex items-center gap-4">
          <div>
            <div className="text-sm font-bold text-white">Çalışma Serisi</div>
            <div className="text-xs text-slate-400">{stats.streakDays} gün kesintisiz çalışma</div>
          </div>
          <div className="flex gap-2 ml-4" role="list" aria-label="Son 7 günlük çalışma serisi">
            {weeklyData.slice(-7).map((d, i) => {
              const active = ((d?.Doğru||0)+(d?.Yanlış||0)+(d?.Boş||0)) > 0;
              return (
                <div key={d.date || i} role="listitem"
                  title={`${d.name || ''}: ${active ? 'çalışıldı' : 'çalışılmadı'}`}
                  aria-label={`${d.name || ''}: ${active ? 'çalışıldı' : 'çalışılmadı'}`}
                  className={`w-10 h-10 rounded-lg flex items-center justify-center ${active ? 'bg-emerald-500 text-black font-bold' : 'bg-white/5 text-slate-300'}`}>
                  {active ? '✓' : d.name?.slice(0,1)}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Ana grid: grafik + pasta */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="ds-card p-5 h-[420px]">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <BarChartIcon size={18} className="text-[#4D7C0F]" />
                <h3 className="text-sm font-bold text-white">
                  {viewMode === 'monthly' ? 'Aylık Doğru Oranı Trendi' : 'Haftalık Çözüm Aktivitesi'}
                </h3>
              </div>
              <div className="flex gap-1 bg-slate-500/10 p-1 rounded-lg border border-white/5">
                <button type="button" onClick={() => setViewMode('weekly')}
                  className={`px-3 py-1 rounded text-[11px] font-bold transition-all ${viewMode==='weekly' ? 'bg-[#4D7C0F] text-white' : 'text-slate-400 hover:text-white'}`}>
                  Hafta
                </button>
                <button type="button" onClick={() => setViewMode('monthly')}
                  className={`px-3 py-1 rounded text-[11px] font-bold transition-all ${viewMode==='monthly' ? 'bg-[#4D7C0F] text-white' : 'text-slate-400 hover:text-white'}`}>
                  Ay
                </button>
              </div>
            </div>
            <div className="flex-1 mt-2 h-full">
              {(viewMode === 'monthly' ? monthlyData : weeklyData)?.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  {viewMode === 'monthly' ? (
                    <AreaChart data={monthlyData} margin={{ top:10, right:10, left:-10, bottom:0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
                      <XAxis dataKey="name" stroke={chart.axis} fontSize={11} />
                      <YAxis stroke={chart.axis} fontSize={11} />
                      <Tooltip contentStyle={tooltipStyle(chart)} />
                      <Area type="monotone" dataKey="value" stroke={chart.c1} fill="transparent" strokeWidth={2} />
                    </AreaChart>
                  ) : (
                    <RechartsBarChart data={weeklyData} margin={{ top:10, right:10, left:-30, bottom:0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
                      <XAxis dataKey="name" stroke={chart.axis} fontSize={11} />
                      <YAxis stroke={chart.axis} fontSize={11} />
                      <Tooltip contentStyle={tooltipStyle(chart)} />
                      <Legend verticalAlign="top" height={36} iconSize={10} wrapperStyle={{ fontSize:11, paddingBottom:15 }} />
                      <Bar dataKey="Doğru" fill={chart.c1} radius={[4,4,0,0]} maxBarSize={18} />
                      <Bar dataKey="Yanlış" fill={chart.c4} radius={[4,4,0,0]} maxBarSize={18} />
                      <Bar dataKey="Boş"    fill={chart.c5} radius={[4,4,0,0]} maxBarSize={18} />
                    </RechartsBarChart>
                  )}
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center">
                  <EmptyState
                    icon={BarChartIcon}
                    title="Aktivite verisi yok"
                    description="Soru çözmeye başladığında aktivite grafiğin burada görünecek."
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-1 flex flex-col gap-4">
          {/* Pasta grafik */}
          <div className="ds-card p-4">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-1.5">
              <PieChartIcon size={14} className="text-[#4D7C0F]" />
              Cevap Dağılımı
            </h3>
            <div className="grid grid-cols-2 items-center gap-2">
              <div style={{ width:'100%', height:160, display:'flex', justifyContent:'center', alignItems:'center' }}>
                <ResponsiveContainer width="100%" height={160}>
                  <RechartsPieChart>
                    <Pie data={responseData} dataKey="value" nameKey="name" innerRadius={38} outerRadius={58} paddingAngle={3} cx="50%" cy="50%">
                      {responseData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                  </RechartsPieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-col gap-2.5">
                {responseData.map((d, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div style={{ width:10, height:10, borderRadius:'50%', background:COLORS[i], flexShrink:0 }} />
                    <div className="text-xs text-slate-300">{d.name}</div>
                    <div className="ml-auto font-bold text-white text-xs">{d.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Seviye durumu */}
          <div className="ds-card p-4">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-3">Seviye Durumu</h3>
            <div className="flex items-center gap-3 mb-3">
              <span style={{ fontSize:28 }}>{levelData.emoji}</span>
              <div>
                <div className="text-sm font-bold text-white">Seviye {currentLevel} — {levelData.name}</div>
                <div className="text-xs text-slate-400 mt-0.5">
                  {toNext > 0 ? `${toNext} doğru daha → sonraki seviye` : 'Maksimum seviye!'}
                </div>
              </div>
            </div>
            <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700"
                style={{ width:`${progress}%`, background: levelData.barColor }} />
            </div>
          </div>
        </div>
      </div>

      {/* Alt grid: Ders istatistikleri + Sınıf Sıralaması */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">

        {/* Ders bazlı */}
        <div className="lg:col-span-2">
          <div className="ds-card p-6">
            <h4 className="text-sm font-bold text-white mb-3">Ders Bazlı İstatistik</h4>
            <div className="flex flex-col gap-3">
              {subjectStats.length === 0 ? (
                <EmptyState
                  icon={BookOpen}
                  title="Ders verisi yok"
                  description="Test çözdükçe ders bazlı ustalık verilerin burada birikecek."
                />
              ) : (
                subjectStats.map(s => (
                  <div key={s.name} className="flex flex-col gap-1">
                    <div className="flex justify-between text-[11px] font-semibold">
                      <span className="text-slate-400">{s.name}</span>
                      <span className="text-white">%{s.percent}</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-500/10 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-[#6366F1] to-[#8B5CF6]"
                        style={{ width:`${s.percent}%` }} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Sınıf Sıralaması */}
        <div className="lg:col-span-1">
          <div className="ds-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <Trophy size={16} className="text-amber-400" />
                Sınıf Sıralaması
              </h4>
              {ranking.total != null && (
                <span className="text-xs text-slate-500 flex items-center gap-1">
                  <Users size={12} /> {ranking.total} öğrenci
                </span>
              )}
            </div>

            {/* Sınıf seçici: çok sınıfta chip, tek sınıfta etiket (aktif sınıfı DEĞİŞTİRMEZ) */}
            {joinedClasses.length > 1 ? (
              <div className="flex flex-wrap gap-2 mb-4">
                {joinedClasses.map((c) => {
                  const isSel = c.teacherId === selectedClassId;
                  return (
                    <button
                      key={c.teacherId}
                      type="button"
                      onClick={() => setSelectedTeacherId(c.teacherId)}
                      className={`stat-class-chip${isSel ? ' is-active' : ''}`}
                      title={isSel ? 'Seçili sınıf' : 'Bu sınıfın sıralamasını gör'}
                    >
                      <School size={13} aria-hidden="true" />
                      <span className="stat-class-chip__text">{classLabel(c)}</span>
                    </button>
                  );
                })}
              </div>
            ) : selectedLabel ? (
              <div className="flex items-center gap-1.5 mb-4 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                <School size={13} aria-hidden="true" /> {selectedLabel}
              </div>
            ) : null}

            {/* Kendi sıran — öne çıkar */}
            {ranking.rank != null && (
              <div className="flex items-center gap-3 p-3 rounded-xl mb-4"
                style={{
                  background: 'var(--accent-primary-soft)',
                  border: '1px solid var(--border-accent)',
                }}>
                <div className="text-2xl font-extrabold" style={{ color: 'var(--accent-primary-hover)', minWidth: 32, textAlign: 'center' }}>
                  {ranking.rank}
                </div>
                <div>
                  <div className="text-xs font-bold text-white">Senin sıran</div>
                  <div className="text-xs text-slate-400">{ranking.total} öğrenci arasında</div>
                </div>
                <div className="ml-auto text-lg" aria-hidden="true">
                  {rankMedal(ranking.rank)}
                </div>
              </div>
            )}

            {/* Yükleniyor */}
            {ranking.loading && (
              <div className="flex items-center justify-center py-6">
                <Spinner size="sm" label="Sıralama hesaplanıyor" />
              </div>
            )}

            {/* Sınıf yoksa / boş */}
            {!ranking.loading && (ranking.total === null || ranking.total === 0) && (
              <div className="text-xs text-slate-500 text-center py-4">
                {joinedClasses.length === 0 ? 'Bir sınıfa bağlı değilsin.' : 'Bu sınıfta henüz sıralama yok.'}
              </div>
            )}

            {/* Liste */}
            {!ranking.loading && rankList.length > 0 && (
              <div className="flex flex-col gap-2">
                {displayList.map((student, i) => {
                  const rank = i + 1;
                  const isMe = student.uid === currentUser?.uid;
                  const style = getRankStyle(rank);
                  return (
                    <div key={student.uid}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg transition-all"
                      style={{
                        background: isMe ? 'var(--accent-primary-soft)' : style.bg,
                        border: `1px solid ${isMe ? 'var(--border-accent)' : style.border}`,
                      }}>
                      {/* Sıra numarası / madalya */}
                      <div className="text-sm font-bold" style={{ minWidth: 24, textAlign: 'center', color: style.color }}>
                        {style.icon ?? rank}
                      </div>
                      {/* İsim */}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold truncate" style={{ color: isMe ? 'var(--accent-primary-hover)' : 'var(--text-secondary)' }}>
                          {student.name}{isMe && ' (Sen)'}
                        </div>
                        <div className="text-[10px] text-slate-500">{student.total} soru · {student.correct} doğru</div>
                      </div>
                      {/* Net */}
                      <div className="text-xs font-bold" style={{ color: style.color }}>
                        {student.net > 0 ? '+' : ''}{student.net}
                      </div>
                    </div>
                  );
                })}

                {rankList.length > 5 && (
                  <button
                    type="button"
                    onClick={() => setShowAllRanking(v => !v)}
                    className="text-xs text-lime-600 hover:text-lime-700 text-center mt-1 transition-colors"
                  >
                    {showAllRanking ? 'Daha az göster ↑' : `+${rankList.length - 5} öğrenci daha göster ↓`}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
