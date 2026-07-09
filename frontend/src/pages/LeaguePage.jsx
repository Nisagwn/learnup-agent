import React, { useEffect, useRef, useState } from 'react';
import { Trophy, Clock, ChevronUp, ChevronDown } from 'lucide-react';
import { supabase } from '../supabase';
import { useUserStats } from '../contexts/UserStatsContext';
import { getTierMeta, PROMOTE_COUNT, RELEGATE_COUNT } from '../utils/league';
import { rankMedal } from '../utils/rankStyle';
import { SkeletonCard } from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import ClassSwitcher from '../components/ClassSwitcher';

// Hafta bitişine (gelecek Pazartesi 00:00) kalan süre.
function weekEndCountdown() {
  const now = new Date();
  const day = now.getDay() || 7; // Pzt=1 … Paz=7
  const monday = new Date(now);
  monday.setDate(now.getDate() + (8 - day));
  monday.setHours(0, 0, 0, 0);
  const ms = monday - now;
  return { days: Math.floor(ms / 86400000), hours: Math.floor((ms % 86400000) / 3600000) };
}

export default function LeaguePage() {
  const { gamification, currentUser } = useUserStats();
  const league = gamification?.league;
  const [entries, setEntries] = useState(null); // null = yükleniyor
  const [error, setError] = useState(false);
  // Eski kayıtlarda role alanı eksik olabilir — users/{uid}'den rolü cache'ler
  const roleCacheRef = useRef(new Map());
  // Birden çok realtime yükleme yarışmasın diye istek-id'si
  const reqIdRef = useRef(0);

  useEffect(() => {
    if (!league?.weekId || !league?.tier) return undefined;

    const handleRows = async (rows) => {
      const myReq = ++reqIdRef.current;
      // Row'ları camelCase alias'larıyla normalize et (consumer weeklyXP okuyor)
      const raw = rows.map((r) => ({ ...r, weeklyXP: r.weekly_xp }));

      // Sadece öğrencileri tut — eski entry'lerde role yoksa profiles'tan oku
      const cache = roleCacheRef.current;
      const filtered = (await Promise.all(
        raw.map(async (e) => {
          if (e.role === 'student') return e;
          if (e.role && e.role !== 'student') return null;
          if (cache.has(e.uid)) return cache.get(e.uid) === 'student' ? e : null;
          try {
            const { data: u } = await supabase.from('profiles').select('role').eq('id', e.uid).single();
            const role = u ? (u.role || 'student') : 'student';
            cache.set(e.uid, role);
            return role === 'student' ? e : null;
          } catch {
            return e; // okunamadıysa elemiyoruz (güvenli taraf)
          }
        })
      )).filter(Boolean);

      // Eski snapshot süresi dolmuşsa yazma
      if (myReq !== reqIdRef.current) return;
      filtered.sort((a, b) => (b.weeklyXP || 0) - (a.weeklyXP || 0));
      setEntries(filtered);
      setError(false);
    };

    const load = async () => {
      const { data, error: err } = await supabase
        .from('league_entries')
        .select('*')
        .eq('week_id', league.weekId)
        .eq('tier', league.tier);
      if (err) { console.warn('Lig yüklenemedi:', err); setError(true); return; }
      handleRows(data || []);
    };

    load();
    const ch = supabase
      .channel(`league-${league.weekId}-${league.tier}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'league_entries', filter: `week_id=eq.${league.weekId}` },
        () => { load(); },
      )
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [league?.weekId, league?.tier]);

  const meta = getTierMeta(league?.tier);
  const countdown = weekEndCountdown();
  const uid = currentUser?.uid;

  return (
    <div className="dashboard student-dashboard animate-fade-in pb-8">
      <div className="dashboard-header mb-6 mt-4">
        <h1 className="page-title flex items-center gap-2"><Trophy size={26} aria-hidden="true" /> Haftalık Lig</h1>
        <p className="page-subtitle">
          Puan kazanarak yüksel — ilk {PROMOTE_COUNT} terfi eder, son {RELEGATE_COUNT} küme düşer.
        </p>
      </div>

      {/* Hangi sınıftasın + aktif sınıfı seç (çoklu sınıf) */}
      <ClassSwitcher />

      {!league ? (
        <div className="ds-card">
          <EmptyState
            icon={Trophy}
            title="Lig hazırlanıyor"
            description="Soru çözmeye başladığında ligine yerleştirileceksin."
          />
        </div>
      ) : (
        <>
          <div className="ds-card flex items-center gap-4 mb-4">
            <div
              className="flex items-center justify-center w-16 h-16 rounded-2xl text-4xl flex-shrink-0"
              style={{ background: `${meta.color}22`, border: `1px solid ${meta.color}55` }}
              aria-hidden="true"
            >
              {meta.emoji}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold text-white">{meta.label}</h2>
              <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                <Clock size={13} aria-hidden="true" /> Bitişe {countdown.days} gün {countdown.hours} saat
              </p>
            </div>
          </div>

          {error ? (
            <div className="ds-card">
              <EmptyState icon={Trophy} title="Sıralama yüklenemedi" description="Lütfen sayfayı yenileyin." />
            </div>
          ) : entries === null ? (
            <SkeletonCard lines={6} />
          ) : entries.length === 0 ? (
            <div className="ds-card">
              <EmptyState icon={Trophy} title="Henüz katılımcı yok" description="Bu hafta bu ligde ilk puanı sen kazan!" />
            </div>
          ) : (
            <div className="ds-card flex flex-col gap-1.5">
              {entries.map((e, i) => {
                const rank = i + 1;
                const isMe = e.uid === uid;
                const promo = rank <= PROMOTE_COUNT && league.tier !== 'diamond';
                const releg = rank > entries.length - RELEGATE_COUNT
                  && entries.length > PROMOTE_COUNT && league.tier !== 'bronze';
                return (
                  <div
                    key={e.uid}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg"
                    style={{
                      background: isMe
                        ? 'var(--accent-primary-soft)'
                        : promo ? 'rgba(87,160,58,0.10)'
                          : releg ? 'rgba(220,107,90,0.08)'
                            : 'rgba(28,25,23,0.03)',
                      border: `1px solid ${isMe ? 'var(--border-accent)' : 'var(--border-soft)'}`,
                    }}
                  >
                    <span
                      className="w-7 text-center font-bold text-sm"
                      style={{ color: promo ? '#4D7C0F' : releg ? '#DC6B5A' : 'var(--text-muted)' }}
                    >
                      {rankMedal(rank, rank)}
                    </span>
                    {promo && <ChevronUp size={14} style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />}
                    {releg && <ChevronDown size={14} style={{ color: '#DC6B5A' }} aria-hidden="true" />}
                    <span
                      className="flex-1 min-w-0 truncate text-sm font-semibold"
                      style={{ color: isMe ? 'var(--accent-primary-hover)' : 'var(--text-secondary)' }}
                    >
                      {e.name}{isMe && ' (Sen)'}
                    </span>
                    <span className="text-sm font-bold" style={{ color: 'var(--accent-honey)' }}>{e.weeklyXP || 0} Puan</span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
