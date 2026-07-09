import React, { useEffect, useMemo, useState } from 'react';
import { School, Check, Loader2 } from 'lucide-react';
import { supabase } from '../supabase';
import { useUserStats } from '../contexts/UserStatsContext';
import { useToast } from './ToastProvider';
import { getStudentClasses, setActiveClass } from '../services/studentClassesApi';
import './ClassSwitcher.css';

// Kompakt sınıf seçici: öğrenci hangi sınıfta olduğunu görür ve aktif sınıfı değiştirir.
// Aktif sınıf = users.teacherId — pano/ödev/sıralama bağlamını belirler.
export default function ClassSwitcher() {
  const { userProfile } = useUserStats();
  const { success, error } = useToast();
  const active = userProfile?.teacherId || null;
  const classes = useMemo(() => getStudentClasses(userProfile || {}), [userProfile]);
  const [info, setInfo] = useState({}); // { teacherId: { name, branch } }
  const [busy, setBusy] = useState(null);

  // Öğretmen branşı + gerçek adı users/{teacherId}'den çek (etiket için).
  useEffect(() => {
    const ids = classes.map((c) => c.teacherId).filter(Boolean);
    if (ids.length === 0) { setInfo({}); return undefined; }
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(ids.map(async (tid) => {
        try {
          const { data: d } = await supabase.from('profiles').select('name, email, branch').eq('id', tid).single();
          const row = d || {};
          const name = row.name || row.fullName || row.email?.split('@')[0] || null;
          return [tid, { name, branch: String(row.branch || '').trim() }];
        } catch { return [tid, {}]; }
      }));
      if (!cancelled) setInfo(Object.fromEntries(entries));
    })();
    return () => { cancelled = true; };
  }, [classes]);

  if (classes.length === 0) return null;

  const labelFor = (c) => {
    const ti = info[c.teacherId] || {};
    const name = ti.name || c.teacherName;
    return ti.branch ? `${ti.branch} · ${name}` : name;
  };

  const switchTo = async (tid) => {
    if (busy || tid === active) return;
    setBusy(tid);
    try {
      await setActiveClass(tid);
      success('Aktif sınıf değişti', 'Pano, ödevler ve sıralama bu sınıfa göre güncellendi.');
    } catch (e) {
      error('Değiştirilemedi', e.message || 'İşlem başarısız.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="class-switcher">
      <div className="class-switcher__label"><School size={14} /> Sınıfın</div>
      <div className="class-switcher__chips">
        {classes.map((c) => {
          const isActive = c.teacherId === active;
          const busyThis = busy === c.teacherId;
          return (
            <button
              key={c.teacherId}
              type="button"
              className={`class-chip${isActive ? ' is-active' : ''}`}
              disabled={busyThis || isActive}
              onClick={() => switchTo(c.teacherId)}
              title={isActive ? 'Aktif sınıf' : 'Bu sınıfa geç'}
            >
              {busyThis ? <Loader2 size={13} className="animate-spin" /> : (isActive ? <Check size={13} /> : <School size={13} />)}
              <span className="class-chip__text">{labelFor(c)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
