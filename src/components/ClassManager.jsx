import React, { useMemo, useState, useEffect } from 'react';
import { School, Check, LogOut, Loader2 } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useUserStats } from '../contexts/UserStatsContext';
import { useToast } from './ToastProvider';
import { getStudentClasses, leaveClass, setActiveClass } from '../services/studentClassesApi';
import JoinClass from './JoinClass';
import './ClassManager.css';

// Öğrencinin sınıfları: listele · aktif sınıfı değiştir · ayrıl · yeni sınıfa katıl.
// Aktif sınıf = users.teacherId (= teacherIds[0]). Tüm pano/ödev/lig bunu kullanır.
export default function ClassManager() {
  const { userProfile } = useUserStats();
  const { success, error } = useToast();
  const [busy, setBusy] = useState(null);
  const active = userProfile?.teacherId || null;
  const classes = useMemo(() => getStudentClasses(userProfile || {}), [userProfile]);

  // Öğretmen branşı + gerçek adı users/{teacherId}'den canlı çek (cache'teki ad "Öğretmen" olabilir).
  const [info, setInfo] = useState({}); // { teacherId: { name, branch } }
  useEffect(() => {
    const ids = classes.map((c) => c.teacherId).filter(Boolean);
    if (ids.length === 0) { setInfo({}); return undefined; }
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(ids.map(async (tid) => {
        try {
          const s = await getDoc(doc(db, 'users', tid));
          const d = s.exists() ? s.data() : {};
          const name = d.name || d.fullName || d.email?.split('@')[0] || null;
          return [tid, { name, branch: String(d.branch || '').trim() }];
        } catch { return [tid, {}]; }
      }));
      if (!cancelled) setInfo(Object.fromEntries(entries));
    })();
    return () => { cancelled = true; };
  }, [classes]);

  const handleSwitch = async (tid) => {
    if (busy || tid === active) return;
    setBusy(tid);
    try {
      await setActiveClass(tid);
      success('Aktif sınıf değişti', 'Pano, ödevler ve lig bu sınıfa göre güncellendi.');
    } catch (e) {
      error('Değiştirilemedi', e.message || 'İşlem başarısız.');
    } finally { setBusy(null); }
  };

  const handleLeave = async (tid, name) => {
    if (!window.confirm(`"${name}" sınıfından ayrılmak istediğine emin misin?`)) return;
    setBusy(tid);
    try {
      await leaveClass(tid);
      success('Ayrıldın', `${name} sınıfından çıkıldı.`);
    } catch (e) {
      error('Ayrılınamadı', e.message || 'İşlem başarısız.');
    } finally { setBusy(null); }
  };

  return (
    <div className="classmgr">
      <h3 className="classmgr__title"><School size={18} /> Sınıflarım</h3>

      {classes.length === 0 ? (
        <p className="classmgr__empty">Henüz bir sınıfa katılmadın. Aşağıdan kodla katıl.</p>
      ) : (
        <ul className="classmgr__list">
          {classes.map((c) => {
            const isActive = c.teacherId === active;
            const busyThis = busy === c.teacherId;
            const ti = info[c.teacherId] || {};
            const teacherName = ti.name || c.teacherName;        // gerçek ad (yoksa cache)
            const branch = ti.branch;                            // ör. "Matematik"
            // Branş varsa "Matematik Sınıfı" başlık + öğretmen adı alt satır;
            // yoksa öğretmen adı başlık + aktif/sınıf etiketi.
            const title = branch ? `${branch} Sınıfı` : teacherName;
            const sub = branch ? teacherName : (isActive ? 'Aktif sınıf' : 'Sınıf');
            return (
              <li key={c.teacherId} className={`classmgr__item${isActive ? ' is-active' : ''}`}>
                <span className="classmgr__ico"><School size={17} /></span>
                <div className="classmgr__meta">
                  <div className="classmgr__name">{title}</div>
                  <div className="classmgr__code">{sub}</div>
                </div>
                {isActive ? (
                  <span className="classmgr__active-badge"><Check size={12} /> Aktif</span>
                ) : (
                  <button type="button" className="classmgr__switch" disabled={busyThis} onClick={() => handleSwitch(c.teacherId)}>
                    {busyThis ? <Loader2 size={13} className="animate-spin" /> : 'Aktif yap'}
                  </button>
                )}
                <button type="button" className="classmgr__leave" disabled={busyThis} onClick={() => handleLeave(c.teacherId, title)} aria-label={`${title} sınıfından ayrıl`}>
                  <LogOut size={15} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <JoinClass compact />
    </div>
  );
}
